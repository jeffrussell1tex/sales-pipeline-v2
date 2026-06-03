// netlify/functions/score-leads-batch.mjs
// Nightly batch (toml schedule "0 6 * * *"): recompute every lead's score per org.
// Two reasons this must run even when nothing changed:
//   1. engagement recency decays over time (a lead drifts colder with no activity)
//   2. picks up any scoring-rule edits an admin made that day
// Write-triggered scoring (leads.mjs) keeps individual edits live; this keeps the
// rest fresh. Paged per org; per-row update keeps it simple — chunk if a tenant
// grows very large.
import { db } from '../../db/index.js';
import { leads, settings as settingsTable, activities as activitiesTable } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { scoreLead, DEFAULT_LEAD_SCORING, leadFeatures, computeSourceWinRate, trainLeadModel } from './score-lead.mjs';

export const handler = async () => {
    const started = Date.now();
    let orgsProcessed = 0, leadsUpdated = 0, modelsTrained = 0;
    try {
        const orgRows = await db.selectDistinct({ orgId: leads.orgId }).from(leads);
        for (const { orgId } of orgRows) {
            let cfg = DEFAULT_LEAD_SCORING, srow = null;
            try {
                const r = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
                srow = r[0];
                cfg = srow?.extra?.leadScoring || DEFAULT_LEAD_SCORING;
            } catch (e) { /* fall back to defaults */ }
            if (cfg.enabled === false) continue;
            orgsProcessed++;

            const rows = await db.select().from(leads).where(eq(leads.orgId, orgId));
            const acts = await db.select().from(activitiesTable).where(eq(activitiesTable.orgId, orgId));
            const eventsByLead = {};
            for (const a of acts) { if (!a.leadId) continue; (eventsByLead[a.leadId] = eventsByLead[a.leadId] || []).push({ type: a.type, at: a.date || a.createdAt }); }
            const now = Date.now();

            // Phase 2: train per-org predictive model on decided leads (Converted/Dead)
            const decided = rows.filter(l => l.status === 'Converted' || l.status === 'Dead')
                .map(l => ({ lead: l, label: l.status === 'Converted' ? 1 : 0, source: l.source }));
            const predCfg = cfg.predictive;
            if (predCfg && predCfg.enabled && decided.length >= (predCfg.minClosedRecords || 150)) {
                try {
                    const swr = computeSourceWinRate(decided.map(d => ({ source: d.source, label: d.label })));
                    const trainRows = decided.map(d => ({ features: leadFeatures(d.lead, eventsByLead[d.lead.id] || [], swr, now), label: d.label }));
                    const model = trainLeadModel(trainRows);
                    if (model) {
                        model.sourceWinRate = swr;
                        cfg = { ...cfg, predictive: { ...predCfg, model } };
                        const extra = { ...(srow?.extra || {}), leadScoring: cfg };
                        await db.update(settingsTable).set({ extra, updatedAt: new Date() }).where(eq(settingsTable.orgId, orgId));
                        modelsTrained++;
                    }
                } catch (e) { console.warn('lead model training failed for org', orgId, e.message); }
            }
            for (const lead of rows) {
                const sc = scoreLead(lead, cfg, now, eventsByLead[lead.id] || []);
                if (!sc) continue;
                // skip the write if nothing actually changed (avoids churn)
                const oldProb = lead.scoreBreakdown && lead.scoreBreakdown.probability;
                const newProb = sc.scoreBreakdown && sc.scoreBreakdown.probability;
                if (lead.leadScoreFit === sc.leadScoreFit &&
                    lead.leadScoreEngagement === sc.leadScoreEngagement &&
                    lead.leadScoreBucket === sc.leadScoreBucket && oldProb === newProb) continue;
                await db.update(leads).set({
                    leadScoreFit:        sc.leadScoreFit,
                    leadScoreEngagement: sc.leadScoreEngagement,
                    leadScoreBucket:     sc.leadScoreBucket,
                    scoreBreakdown:      sc.scoreBreakdown,
                    score:               sc.score,
                    scoreUpdatedAt:      new Date(),
                }).where(and(eq(leads.id, lead.id), eq(leads.orgId, orgId)));
                leadsUpdated++;
            }
        }
        console.log(`score-leads-batch: ${orgsProcessed} orgs, ${leadsUpdated} leads, ${modelsTrained} models trained in ${Date.now() - started}ms`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, orgsProcessed, leadsUpdated, modelsTrained }) };
    } catch (err) {
        console.error('score-leads-batch error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'batch failed' }) };
    }
};
