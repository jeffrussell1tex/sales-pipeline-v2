// forecastCall.js — a rep's forecast call (Commit, Best case) for ONE fiscal quarter.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// The Forecast ledger's Commit cell wrote `rep.commit` through updateRepField →
// users PUT, and users.mjs sanitize() carried neither `commit` nor `bestCase` in
// a column or in the profile blob, so a typed commit was 0 again on refresh
// (state §0.80, handoff item 18). One number per rep was the wrong shape anyway:
// a commit is a quarter's call, so a figure typed in Q4 FY2026 must not still
// read as the commit in Q1 FY2027 — it is keyed by quarter here and never resets
// by accident, only by the calendar.
//
// Storage: users.profile.forecastCalls = { '2026-Q4': { commit: 120000, bestCase: 180000 }, … }
// keyed by quarters.js's quarter key (`${fiscalYear}-Q${q}`). Pure and
// dependency-free: users.mjs validates an incoming blob with cleanForecastCalls
// and the tab reads and writes through the same helpers, so one function decides
// the shape on both sides (the _stage.mjs / stageClock.js arrangement).

export const QUARTER_KEY_RE = /^\d{4}-Q[1-4]$/;

// A money figure or null. Blank means "no call"; a negative or unreadable value
// is refused rather than stored as 0, so a bad payload cannot look like a call.
const money = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Validate a stored or incoming forecastCalls blob. Malformed quarter keys, and
 * negative or non-numeric figures, are dropped; a quarter left with no figure is
 * dropped; an empty result is null (the column's "never called" value).
 */
export function cleanForecastCalls(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const out = {};
    for (const [key, call] of Object.entries(input)) {
        if (!QUARTER_KEY_RE.test(key) || !call || typeof call !== 'object' || Array.isArray(call)) continue;
        const commit = money(call.commit), bestCase = money(call.bestCase);
        if (commit === null && bestCase === null) continue;
        out[key] = {};
        if (commit !== null) out[key].commit = commit;
        if (bestCase !== null) out[key].bestCase = bestCase;
    }
    return Object.keys(out).length ? out : null;
}

/** The call for one quarter: { commit, bestCase }, each a number, or null when never set. */
export function forecastCallOf(rep, quarterKey) {
    const calls = cleanForecastCalls(rep?.forecastCalls);
    const c = calls?.[quarterKey] || {};
    return { commit: c.commit ?? null, bestCase: c.bestCase ?? null };
}

/**
 * A new forecastCalls blob with `patch` ({ commit?, bestCase? }) applied to ONE
 * quarter; every other quarter is carried through untouched. A blank figure in
 * the patch clears that figure; a quarter left empty is removed; an empty blob
 * is null. Throws on a malformed key — a caller that has no quarter has no
 * business writing a call.
 */
export function withForecastCall(rep, quarterKey, patch) {
    if (!QUARTER_KEY_RE.test(String(quarterKey || ''))) throw new Error(`forecastCall: bad quarter key ${quarterKey}`);
    const calls = cleanForecastCalls(rep?.forecastCalls) || {};
    const next = { ...(calls[quarterKey] || {}) };
    for (const k of ['commit', 'bestCase']) {
        if (!patch || !(k in patch)) continue;
        const v = money(patch[k]);
        if (v === null) delete next[k]; else next[k] = v;
    }
    const out = { ...calls };
    if (Object.keys(next).length) out[quarterKey] = next; else delete out[quarterKey];
    return Object.keys(out).length ? out : null;
}

/**
 * Best case for the quarter: the rep's own figure when they have set one, else
 * the ledger's long-standing estimate of 60% of open pipeline — flagged, so the
 * cell and the export can say which it is. A typed 0 is a call, not an estimate.
 */
export function bestCaseOf(rep, quarterKey, pipelineArr) {
    const { bestCase } = forecastCallOf(rep, quarterKey);
    if (bestCase !== null) return { value: bestCase, estimated: false };
    return { value: (parseFloat(pipelineArr) || 0) * 0.6, estimated: true };
}
