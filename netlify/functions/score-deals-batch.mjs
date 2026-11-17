// netlify/functions/score-deals-batch.mjs
// Nightly batch (toml schedule "0 6 * * *"; AI scoring batch 2A — docs/design/deal-score): org by org, the org's deal
// model trained on its own closed deals, then every deal scored again. It must run even when nothing changed: a deal's
// days in stage and days since its last activity grow every day, and the funnel's weights may have been edited.
// A save of a deal, or of an activity on it, keeps that deal's score live meanwhile (opportunities.mjs,
// activities.mjs). Behind the heartbeat: only the site whose JOBS_ENABLED is "true" runs it (dev and prod share one
// database).
//
// Each org alone (scoreOrgDeals, _dealScore.mjs): its model from its deals, its deals from its model — never pooled
// across tenants. One org's failure is logged and the run goes on to the next.
import { db } from '../../db/index.js';
import { opportunities } from '../../db/schema.js';
import { withHeartbeat } from './_heartbeat.mjs';
import { scoreOrgDeals } from './_dealScore.mjs';

// The run itself; `handler` (at the bottom) is this wrapped in a heartbeat stamp (state §0.98).
const run = async () => {
    const started = Date.now();
    let orgsProcessed = 0, dealsUpdated = 0, modelsTrained = 0, orgsFailed = 0;
    try {
        const orgRows = await db.selectDistinct({ orgId: opportunities.orgId }).from(opportunities);
        for (const { orgId } of orgRows) {
            try {
                const r = await scoreOrgDeals(orgId, { train: true });
                orgsProcessed++;
                dealsUpdated += r.dealsUpdated;
                if (r.model?.trained && r.modelWritten) modelsTrained++;
            } catch (e) {
                orgsFailed++;
                console.error('score-deals-batch: org', orgId, 'failed —', e.message);
            }
        }
        console.log(`score-deals-batch: ${orgsProcessed} orgs, ${dealsUpdated} deals, ${modelsTrained} models trained, ${orgsFailed} failed in ${Date.now() - started}ms`);
        return { statusCode: orgsFailed ? 500 : 200, body: JSON.stringify({ ok: !orgsFailed, orgsProcessed, dealsUpdated, modelsTrained, orgsFailed }) };
    } catch (err) {
        console.error('score-deals-batch error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'batch failed' }) };
    }
};

export const handler = withHeartbeat('score-deals-batch', run);
