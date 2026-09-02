// lossAnalysis.js — how a closed-lost deal is READ by the reports.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// The Closed Lost save writes two fields: `lostCategory` (the picker — Timing,
// Competitor, Pricing / Budget …) and `lostReason` (free-text notes, usually
// empty). Three report surfaces read `o.lostReason || o.closedLostReason ||
// 'Other'`: the notes, then a field nothing has ever written, then a default.
// So every categorised loss rendered as "Other" — Jeff's Win / loss analysis
// showed "Other · 5 · 100%" over five deals that all carried a category (0.66:
// "why we lost is important as it is supposed to be feeding this report").
//
// The exit stage had the same shape of bug. A stageHistory entry records the
// move INTO a stage (`stage`) and the stage it came from (`prevStage`); the
// last entry on a lost deal is therefore always {stage:'Closed Lost',
// prevStage:<the stage it left>}. Two surfaces read `.stage` of that entry and
// then excluded 'Closed Lost', so "Losses by stage exited" said "No stage
// history data on lost deals" for every org that had any, and "Stage changes
// this week" drew "Closed Lost → Closed Lost".
//
// Pure and dependency-free so tests/loss-analysis.test.mjs and the mutation
// harness can reach it; ReportsTab.jsx imports React and cannot be loaded by
// `node --test`. Every reader in ReportsTab goes through these four functions,
// and a source scan in the test pins that no bare read is left (18b26: grep
// the FILE for every other reader before calling it fixed).

export const CLOSED_STAGES = Object.freeze(['Closed Won', 'Closed Lost']);

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * The bucket a lost deal is counted under: the picked category first, the
 * free-text reason only when no category was picked, else `fallback`.
 */
export function lossBucketOf(o, fallback = 'Other') {
    return clean(o?.lostCategory) || clean(o?.lostReason) || fallback;
}

/**
 * The stage the deal LEFT when it closed. From the last history entry: if
 * that entry is the move into a closed stage, its prevStage; otherwise its
 * stage. With no history, the current stage unless it is itself closed.
 */
export function exitStageOf(o) {
    const history = Array.isArray(o?.stageHistory) ? o.stageHistory : [];
    const last = history.length ? history[history.length - 1] : null;
    if (last) {
        if (CLOSED_STAGES.includes(last.stage)) return clean(last.prevStage) || null;
        return clean(last.stage) || null;
    }
    const cur = clean(o?.stage);
    return cur && !CLOSED_STAGES.includes(cur) ? cur : null;
}

/**
 * The stage a deal was in BEFORE its most recent move — for "Stage changes
 * this week". The entry's own `.stage` is the stage it moved to, which is the
 * deal's current stage; reading that drew "X → X".
 */
export function previousStageOf(o) {
    const history = Array.isArray(o?.stageHistory) ? o.stageHistory : [];
    const last = history.length ? history[history.length - 1] : null;
    return last ? (clean(last.prevStage) || null) : null;
}

/**
 * Exit-stage rows for a set of lost deals, ordered by `stageOrder` (the org's
 * funnel). A stage that is not in the order still appears — after the ordered
 * ones — rather than vanishing: the old hardcoded list omitted
 * "Evaluation (Demo)", so a deal lost from the demo stage was not a row.
 */
export function lostByStageRowsOf(lostOpps, stageOrder = []) {
    const counts = {};
    for (const o of lostOpps || []) {
        const s = exitStageOf(o);
        if (s) counts[s] = (counts[s] || 0) + 1;
    }
    const rank = (s) => { const i = stageOrder.indexOf(s); return i < 0 ? stageOrder.length : i; };
    return Object.entries(counts)
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => rank(a.stage) - rank(b.stage) || b.count - a.count || a.stage.localeCompare(b.stage));
}
