// netlify/functions/score-leads-batch.mjs
// Nightly batch (toml schedule "0 6 * * *"): recompute every lead's score per org.
// Two reasons this must run even when nothing changed:
//   1. engagement recency decays over time (a lead drifts colder with no activity)
//   2. picks up any scoring-rule edits an admin made that day
// Write-triggered scoring (leads.mjs) keeps individual edits live; this keeps the
// rest fresh. Paged per org; per-row update keeps it simple — chunk if a tenant
// grows very large.
import { db } from '../../db/index.js';
import { leads, settings as settingsTable } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { scoreLead, DEFAULT_LEAD_SCORING } from './score-lead.mjs';

export const handler = async () => {
    const started = Date.now();
    let orgsProcessed = 0, leadsUpdated = 0;
    try {
        const orgRows = await db.selectDistinct({ orgId: leads.orgId }).from(leads);
        for (const { orgId } of orgRows) {
            let cfg = DEFAULT_LEAD_SCORING;
            try {
                const [srow] = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
                cfg = srow?.extra?.leadScoring || DEFAULT_LEAD_SCORING;
            } catch (e) { /* fall back to defaults */ }
            if (cfg.enabled === false) continue;
            orgsProcessed++;

            const rows = await db.select().from(leads).where(eq(leads.orgId, orgId));
            const now = Date.now();
            for (const lead of rows) {
                const sc = scoreLead(lead, cfg, now);
                if (!sc) continue;
                // skip the write if nothing actually changed (avoids churn)
                if (lead.leadScoreFit === sc.leadScoreFit &&
                    lead.leadScoreEngagement === sc.leadScoreEngagement &&
                    lead.leadScoreBucket === sc.leadScoreBucket) continue;
                await db.update(leads).set({
                    leadScoreFit:        sc.leadScoreFit,
                    leadScoreEngagement: sc.leadScoreEngagement,
                    leadScoreBucket:     sc.leadScoreBucket,
                    scoreBreakdown:      sc.scoreBreakdown,
                    score:               sc.score,
                    scoreUpdatedAt:      new Date(),
                }).where(eq(leads.id, lead.id));
                leadsUpdated++;
            }
        }
        console.log(`score-leads-batch: ${orgsProcessed} orgs, ${leadsUpdated} leads updated in ${Date.now() - started}ms`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, orgsProcessed, leadsUpdated }) };
    } catch (err) {
        console.error('score-leads-batch error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'batch failed' }) };
    }
};
