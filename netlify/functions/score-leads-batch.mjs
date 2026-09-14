// netlify/functions/score-leads-batch.mjs
// Nightly batch (toml schedule "0 6 * * *"): recompute every lead's score per org.
// Two reasons this must run even when nothing changed:
//   1. engagement recency decays over time (a lead drifts colder with no activity)
//   2. picks up any scoring-rule edits an admin made that day
// Write-triggered scoring (leads.mjs) keeps individual edits live; this keeps the
// rest fresh. Paged per org; per-row update keeps it simple — chunk if a tenant
// grows very large.
//
// The per-org work is `scoreOrg` (exported, state §0.132) so an Admin's
// "Train now" (train-lead-model.mjs) runs exactly the nightly pass for ONE org,
// with the org's threshold set aside (`force`) — the engine's own floor of 20
// decided leads still applies, and the result says which gate stopped it.
import { db } from '../../db/index.js';
import { leads, settings as settingsTable, activities as activitiesTable } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { scoreLead, DEFAULT_LEAD_SCORING, leadFeatures, computeSourceWinRate, trainLeadModel } from './score-lead.mjs';
import { isDecidedLead } from '../../src/utils/leadScoringDefaults.js';
import { withHeartbeat } from './_heartbeat.mjs';

/** The engine refuses to train on fewer rows than this (trainLeadModel returns null). */
export const MODEL_MIN_ROWS = 20;

/**
 * Score every lead of ONE org and, when the predictive gate allows, train its
 * model. Returns what happened — never throws for a scoring problem (the
 * nightly run must reach every org); a database failure propagates.
 *
 *   force: train even below the org's minClosedRecords (an Admin's Train now).
 *          Never below MODEL_MIN_ROWS — the engine cannot.
 *
 * → { skipped: 'disabled' } when scoring is off for the org, else
 *   { leadsUpdated, decided, modelTrained, reason, leadScoring }
 *   reason: null when a model was trained; otherwise why not —
 *     'predictive-off' | 'below-threshold' | 'below-engine-floor' | 'training-failed'
 */
export async function scoreOrg(orgId, { force = false } = {}) {
    let cfg = DEFAULT_LEAD_SCORING, srow = null;
    try {
        const r = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        srow = r[0];
        cfg = srow?.extra?.leadScoring || DEFAULT_LEAD_SCORING;
    } catch (e) { /* fall back to defaults */ }
    if (cfg.enabled === false) return { skipped: 'disabled' };

    const rows = await db.select().from(leads).where(eq(leads.orgId, orgId));
    const acts = await db.select().from(activitiesTable).where(eq(activitiesTable.orgId, orgId));
    const eventsByLead = {};
    for (const a of acts) { if (!a.leadId) continue; (eventsByLead[a.leadId] = eventsByLead[a.leadId] || []).push({ type: a.type, at: a.date || a.createdAt }); }
    const now = Date.now();

    // Phase 2: train the per-org predictive model on decided leads (Converted/Dead)
    const decided = rows.filter(isDecidedLead)
        .map(l => ({ lead: l, label: l.status === 'Converted' ? 1 : 0, source: l.source }));
    const predCfg = cfg.predictive;
    const threshold = predCfg?.minClosedRecords || 150;
    let modelTrained = false;
    let reason = null;
    if (!predCfg || !predCfg.enabled)                       reason = 'predictive-off';
    else if (decided.length < MODEL_MIN_ROWS)                reason = 'below-engine-floor';
    else if (!force && decided.length < threshold)           reason = 'below-threshold';
    else {
        try {
            const swr = computeSourceWinRate(decided.map(d => ({ source: d.source, label: d.label })));
            const trainRows = decided.map(d => ({ features: leadFeatures(d.lead, eventsByLead[d.lead.id] || [], swr, now), label: d.label }));
            const model = trainLeadModel(trainRows);
            if (model) {
                model.sourceWinRate = swr;
                cfg = { ...cfg, predictive: { ...predCfg, model } };
                const extra = { ...(srow?.extra || {}), leadScoring: cfg };
                await db.update(settingsTable).set({ extra, updatedAt: new Date() }).where(eq(settingsTable.orgId, orgId));
                modelTrained = true;
            } else reason = 'below-engine-floor';
        } catch (e) { console.warn('lead model training failed for org', orgId, e.message); reason = 'training-failed'; }
    }

    let leadsUpdated = 0;
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
    return { leadsUpdated, decided: decided.length, threshold, modelTrained, reason, leadScoring: cfg };
}

// The run itself; `handler` (at the bottom) is this wrapped in a heartbeat stamp (state §0.98).
const run = async () => {
    const started = Date.now();
    let orgsProcessed = 0, leadsUpdated = 0, modelsTrained = 0;
    try {
        const orgRows = await db.selectDistinct({ orgId: leads.orgId }).from(leads);
        for (const { orgId } of orgRows) {
            const r = await scoreOrg(orgId);
            if (r.skipped) continue;
            orgsProcessed++;
            leadsUpdated += r.leadsUpdated;
            if (r.modelTrained) modelsTrained++;
        }
        console.log(`score-leads-batch: ${orgsProcessed} orgs, ${leadsUpdated} leads, ${modelsTrained} models trained in ${Date.now() - started}ms`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, orgsProcessed, leadsUpdated, modelsTrained }) };
    } catch (err) {
        console.error('score-leads-batch error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'batch failed' }) };
    }
};

export const handler = withHeartbeat('score-leads-batch', run);
