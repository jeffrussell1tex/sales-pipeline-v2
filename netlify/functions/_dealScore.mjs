// netlify/functions/_dealScore.mjs — a deal's score kept on the deal, and the org's model (AI scoring batch 2A;
// docs/design/deal-score — Jeff, 17 Nov, Q4: "on the server, kept on the deal"). The rule is src/utils/dealScore.js;
// this file reads what it needs IN ONE ORG and writes `opportunities.deal_score` and `settings.extra.dealModel`.
//
//   rescoreDeals(orgId, dealIds)   after a deal's save, or a save of an activity on it: those deals, scored again
//   scoreOrgDeals(orgId, { train }) the nightly pass and Train now: every deal of the org, the model trained first
//
// Every read and write names the org; nothing here reaches another org's rows (the isolation rule). A deal's score is
// the server's alone: no body names `dealScore` (opportunities.mjs sanitize leaves it out) and no body names
// `dealModel` (settings.mjs keeps the stored one, as it keeps integrationRequests).
import { db } from '../../db/index.js';
import { opportunities, activities, settings as settingsTable } from '../../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { scoreDeal, trainDealModel, sameDealScore, withBandChange } from '../../src/utils/dealScore.js';
import { DEFAULT_SETTINGS } from '../../src/utils/settingsDefaults.js';
import { extraPatched } from './_settingsRevs.mjs';

// The org's funnel as the settings GET reads it (settings.mjs — `funnelStages:` in the GET's answer): a saved list
// (else the row's old column), else the old column, else the seeded default; an empty one reads as the app's default
// list, as the screens read it (src/utils/settingsDefaults.js mergeSettings).
export function funnelStagesOf(row) {
    const saved = !!row?.extra && typeof row.extra === 'object' && 'funnelStages' in row.extra;
    const list = saved ? (row.extra.funnelStages || row.stages || []) : (row?.stages?.length ? row.stages : null);
    return Array.isArray(list) && list.length ? list : DEFAULT_SETTINGS.funnelStages;
}

// Today as the server reads it: the UTC day (OPEN_ITEMS §4.2 — the server's day counts are UTC's, filed).
export const serverToday = (now = new Date()) => now.toISOString().slice(0, 10);

async function settingsOf(orgId) {
    const [row] = await db.select({ id: settingsTable.id, extra: settingsTable.extra, stages: settingsTable.stages, asRead: sql`${settingsTable.extra}::text` })
        .from(settingsTable).where(eq(settingsTable.orgId, orgId));
    return row || null;
}

const byDeal = (acts) => {
    const out = {};
    for (const a of acts) if (a.opportunityId) (out[a.opportunityId] = out[a.opportunityId] || []).push(a);
    return out;
};

// Two scores that differ only in when they were made are the same score — in any key order (src/utils/dealScore.js).
const sameScore = sameDealScore;

// Deals written per statement: an import's hundreds of deals are a few statements, not one each.
export const SCORE_CHUNK = 100;

// Score `deals` (rows of this org) and keep each score that changed — one statement per chunk, each deal's own score
// by its id, in the org. → { [id]: score | null } for every deal given.
async function keepScores(orgId, deals, actsByDeal, { funnelStages, model, now }) {
    const today = serverToday(now);
    const out = {};
    const changed = [];
    for (const d of deals) {
        // The band's last move noted (2C): the score-drop alert fires on a fall into Critical, not on a level.
        const next = withBandChange(d.dealScore, scoreDeal(d, actsByDeal[d.id] || [], { funnelStages, model, today, now }), now);
        if (sameScore(d.dealScore, next)) { out[d.id] = d.dealScore ?? null; continue; }
        out[d.id] = next;
        changed.push([d.id, next]);
    }
    for (let i = 0; i < changed.length; i += SCORE_CHUNK) {
        const chunk = changed.slice(i, i + SCORE_CHUNK);
        const cases = sql.join(chunk.map(([id, s]) => sql`when ${id} then ${s === null ? null : JSON.stringify(s)}::jsonb`), sql` `);
        await db.update(opportunities).set({ dealScore: sql`(case ${opportunities.id} ${cases} end)` })
            .where(and(eq(opportunities.orgId, orgId), inArray(opportunities.id, chunk.map(([id]) => id))));
    }
    return out;
}

// A deal row as an answer hands it back: its kept score as this request left it.
export const withDealScore = (row, scores) => (row && scores && row.id in scores ? { ...row, dealScore: scores[row.id] } : row);

/**
 * Score these deals of the org again — after a save of the deal, or of an activity on it. Ids the org does not hold
 * are skipped. Never throws for a scoring problem: the save it follows has landed, and the nightly pass catches up —
 * `orThrow` (ai-score.mjs, which decides on the score and follows no save): a failure throws (state §0.292).
 * → { [id]: score | null }
 */
export async function rescoreDeals(orgId, dealIds, { now = new Date(), orThrow = false } = {}) {
    const ids = [...new Set((dealIds || []).filter((id) => typeof id === 'string' && id))];
    if (!orgId || !ids.length) return {};
    try {
        const srow = await settingsOf(orgId);
        const deals = await db.select().from(opportunities).where(and(eq(opportunities.orgId, orgId), inArray(opportunities.id, ids)));
        if (!deals.length) return {};
        const acts = await db.select().from(activities).where(and(eq(activities.orgId, orgId), inArray(activities.opportunityId, deals.map((d) => d.id))));
        return await keepScores(orgId, deals, byDeal(acts), { funnelStages: funnelStagesOf(srow), model: srow?.extra?.dealModel || null, now });
    } catch (e) {
        console.warn('deal score not kept for org', orgId, '—', e.message);
        if (orThrow) throw e;
        return {};
    }
}

/**
 * Every deal of one org: the model trained on its closed deals first (when `train`), then each open deal scored and
 * each closed one cleared. The model is written as `dealModel` alone, and only as this run read it — a model another
 * run wrote meanwhile is never put back (the §0.224 shape; score-leads-batch.mjs). A database failure propagates.
 * → { dealsUpdated, model, modelWritten }
 */
export async function scoreOrgDeals(orgId, { train = true, now = new Date() } = {}) {
    const srow = await settingsOf(orgId);
    const deals = await db.select().from(opportunities).where(eq(opportunities.orgId, orgId));
    const acts = await db.select().from(activities).where(eq(activities.orgId, orgId));
    const actsByDeal = byDeal(acts);
    const funnelStages = funnelStagesOf(srow);
    let model = srow?.extra?.dealModel || null;
    let modelWritten = false;
    if (train && srow) {
        const trained = trainDealModel(deals, actsByDeal, funnelStages, now);
        const landed = await db.update(settingsTable).set({ extra: extraPatched({ dealModel: trained }, {}), updatedAt: new Date() })
            .where(and(eq(settingsTable.orgId, orgId), sql`jsonb_typeof(${settingsTable.extra}) = 'object'`,
                sql`(${settingsTable.extra}->'dealModel') is not distinct from ((${srow.asRead}::jsonb)->'dealModel')`))
            .returning({ id: settingsTable.id });
        if (landed.length) { model = trained; modelWritten = true; }
        else {
            const [fresh] = await db.select({ extra: settingsTable.extra }).from(settingsTable).where(eq(settingsTable.orgId, orgId));
            model = fresh?.extra?.dealModel || null;
        }
    }
    const kept = await keepScores(orgId, deals, actsByDeal, { funnelStages, model, now });
    const dealsUpdated = deals.filter((d) => kept[d.id] !== (d.dealScore ?? null)).length;
    return { dealsUpdated, model, modelWritten };
}
