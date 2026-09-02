// pipelineReport.js — the Pipeline & Forecast tab's three headline computations.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// Three numbers on that tab were constants dressed as data (0.68, tier 1 items
// 3, 4 and 7): the quota behind the attainment ring was a literal $175,000
// (its two fallbacks read fields nothing writes); the "Forecast accuracy" chart
// drew forecast === actual with a literal `att: 1.0`, so every point read
// 100%; and the 7-day movement ribbon had "Lost" hardcoded to 0 while "Slipped"
// was every past-due deal ever and "Won" was all-time revenue. The Performance
// tab, separately, divided a full year's quota into one quarter's revenue.
// Pure so tests/pipeline-report.test.mjs can pin each one.

import { repsForSlice } from './reportScope.js';
import { quarterOf } from './quarters.js';
import { dayOf } from './reportPeriod.js';
import { isoLocal, parseLocalDate } from './dateLocal.js';

const CLOSED = ['Closed Won', 'Closed Lost'];
const arrOf = (o) => parseFloat(o?.arr) || 0;
const sum = (list) => list.reduce((s, o) => s + arrOf(o), 0);

// ── Quota ────────────────────────────────────────────────────────────────────

/**
 * One user's quota for the selected period. A quarterly plan has q1..q4Quota;
 * an annual plan has annualQuota. For 'Q1'..'Q4' that is the quarter's own
 * figure (or a quarter of the annual); for 'FY', 'all' or 'custom' the year.
 */
export function userQuotaFor(u, period) {
    if (!u) return 0;
    const type = u.quotaType || 'annual';
    const m = /^Q([1-4])$/.exec(String(period || ''));
    if (m) {
        return type === 'quarterly'
            ? (parseFloat(u[`q${m[1]}Quota`]) || 0)
            : (parseFloat(u.annualQuota) || 0) / 4;
    }
    return type === 'quarterly'
        ? [1, 2, 3, 4].reduce((s, q) => s + (parseFloat(u[`q${q}Quota`]) || 0), 0)
        : (parseFloat(u.annualQuota) || 0);
}

const REP_EXCLUDED = new Set(['Admin', 'Manager', 'ReadOnly']);

/** The quota of the reps in scope: named users who are not Admin / Manager / ReadOnly, narrowed by the slice. 0 when none is set. */
export function teamQuotaFor(users, period, slice) {
    const list = Array.isArray(users) ? users : [];
    const reps = repsForSlice(slice, list);
    return list
        .filter(u => u?.name && !REP_EXCLUDED.has(u.userType) && (!reps || reps.has(u.name)))
        .reduce((s, u) => s + userQuotaFor(u, period), 0);
}

// ── Pipeline movement, last N days ───────────────────────────────────────────

const shiftDays = (day, n) => { const d = parseLocalDate(day); if (!d) return ''; d.setDate(d.getDate() + n); return isoLocal(d); };

/** The day a closed deal closed: wonDate / lostDate first, else the stage-change day, else the forecast. */
export const closeDayOf = (o) => {
    if (!o) return '';
    const explicit = o.stage === 'Closed Won' ? o.wonDate : o.stage === 'Closed Lost' ? o.lostDate : '';
    return dayOf(explicit || o.stageChangedDate || o.forecastedCloseDate);
};

/**
 * What moved in the last `days` days, from the deals as they are now.
 *   added   — created in the window (any stage now)
 *   won     — Closed Won with a close day in the window
 *   lost    — Closed Lost with a close day in the window
 *   slipped — still open, forecast close date passed during the window
 *   carried — open now and created before the window
 *   start   — open at the start of the window = carried + won + lost (those created before it)
 * A deal with no created day is treated as created before the window.
 */
export function pipelineMovement(opps, { today = isoLocal(new Date()), days = 7 } = {}) {
    const list = Array.isArray(opps) ? opps : [];
    const cutoff = shiftDays(today, -days);
    const isOpen = (o) => !CLOSED.includes(o.stage);
    const createdInWindow = (o) => { const d = dayOf(o.createdDate); return !!d && d >= cutoff; };
    const closedInWindow = (o) => { const d = closeDayOf(o); return !!d && d >= cutoff && d <= today; };

    const openNow = list.filter(isOpen);
    const added   = list.filter(createdInWindow);
    const won     = list.filter(o => o.stage === 'Closed Won' && closedInWindow(o));
    const lost    = list.filter(o => o.stage === 'Closed Lost' && closedInWindow(o));
    const slipped = openNow.filter(o => { const d = dayOf(o.forecastedCloseDate); return !!d && d >= cutoff && d < today; });
    const carried = openNow.filter(o => !createdInWindow(o));
    const start   = [...carried, ...won.filter(o => !createdInWindow(o)), ...lost.filter(o => !createdInWindow(o))];

    const out = { cutoff, today, openNow, added, won, lost, slipped, carried, start };
    for (const k of ['openNow', 'added', 'won', 'lost', 'slipped', 'carried', 'start']) out[k + '$'] = sum(out[k]);
    out.net$ = out.openNow$ - out.start$;
    return out;
}

// ── Closed-won by completed fiscal quarter ──────────────────────────────────

const prevQuarter = ({ fiscalYear, q }) => (q === 1 ? { fiscalYear: fiscalYear - 1, q: 4 } : { fiscalYear, q: q - 1 });

/**
 * Won revenue in each of the last `count` COMPLETED fiscal quarters, oldest
 * first: [{ key, label, actual, count }]. A deal counts in the quarter of its
 * close day (closeDayOf), by the house fiscal convention (quarters.js).
 */
export function closedWonByQuarter(opps, fiscalStart, { today = new Date(), count = 6 } = {}) {
    const cur = quarterOf(isoLocal(today), fiscalStart);
    if (!cur) return [];
    const keys = [];
    let qk = prevQuarter(cur);
    for (let i = 0; i < count; i++) { keys.unshift(qk); qk = prevQuarter(qk); }
    const won = (Array.isArray(opps) ? opps : []).filter(o => o?.stage === 'Closed Won');
    return keys.map(({ fiscalYear, q }) => {
        const key = `${fiscalYear}-Q${q}`;
        const inQ = won.filter(o => quarterOf(closeDayOf(o), fiscalStart)?.key === key);
        return { key, label: `Q${q} FY${String(fiscalYear).slice(2)}`, actual: sum(inQ), count: inQ.length };
    });
}
