// quarters.js — fiscal-quarter bucketing for the Pipeline list.
//
// Pure and dependency-free, for the same reason csvAutoMap.js is: ListView imports
// React and useApp, so nothing left inside it can be reached by `node --test` and
// none of this logic could be covered by the gates. The undated bucket below
// exists because a silent `continue` hid real deals; a rule that fixes a silent
// drop should not itself be untestable.
//
// ── Quarter helpers (fiscal-year-aware) ──────────────────────
// All functions accept fiscalStart (1–12). fiscalStart=1 = January = calendar year.
// fiscalStart=10 = October: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep.
// "Fiscal year" is named by the calendar year in which the FY ENDS.
// e.g. Oct 2025 → FY2026, Jan 2026 → FY2026.

export function quarterOf(isoDate, fiscalStart) {
    if (!isoDate) return null;
    const d = new Date(isoDate.slice(0, 10) + 'T12:00:00'); // normalize to date-only before appending time
    if (isNaN(d)) return null;
    const month = d.getMonth() + 1; // 1-12
    const calYear = d.getFullYear();
    const monthsIn = (month - fiscalStart + 12) % 12;
    const q = Math.floor(monthsIn / 3) + 1; // 1-4
    let fiscalYear;
    if (fiscalStart === 1) {
        fiscalYear = calYear;
    } else if (month >= fiscalStart) {
        fiscalYear = calYear + 1; // e.g. Oct 2025 → FY2026
    } else {
        fiscalYear = calYear;     // e.g. Jan 2026 → FY2026
    }
    const key = `${fiscalYear}-Q${q}`;
    const longLabel = `Q${q} ${fiscalYear}`;
    return { key, longLabel, fiscalYear, q, calYear, month };
}

// The first calendar day of a fiscal quarter, as a local Date.
//
// Split out of quarterRange, which needed the same date but only ever returned it
// formatted. HomeTab needs the Date itself to count weeks into the quarter, and a
// second copy of this arithmetic is exactly how the greeting drifted from the
// Pipeline list in the first place — there are already seven implementations of
// fiscal quarters in this codebase and this module is meant to be the last one.
export function quarterStartDate(fiscalYear, q, fiscalStart) {
    const startMonth = ((fiscalStart - 1 + (q - 1) * 3) % 12) + 1;
    let startYear;
    if (fiscalStart === 1) {
        startYear = fiscalYear;
    } else if (startMonth >= fiscalStart) {
        startYear = fiscalYear - 1; // Q starts before FY end cal year
    } else {
        startYear = fiscalYear;
    }
    return new Date(startYear, startMonth - 1, 1);
}

// The last calendar day of a fiscal quarter. Day 0 of the month three after the
// start is the last day of the third month.
export function quarterEndDate(fiscalYear, q, fiscalStart) {
    const start = quarterStartDate(fiscalYear, q, fiscalStart);
    return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

export function quarterRange(fiscalYear, q, fiscalStart) {
    const start = quarterStartDate(fiscalYear, q, fiscalStart);
    const end   = quarterEndDate(fiscalYear, q, fiscalStart);
    const fmt   = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
}

// A deal with no close date belongs to no quarter. `if (!qk) continue` DROPPED it
// silently, so the header could read "3 open deals · $73K" directly above a table
// saying "No deals closing this quarter" — the same deals being visible in Funnel,
// Kanban and Forecast, which group by stage. A rep who saved a deal without a
// close date would reasonably conclude it had not saved.
//
// Undated deals now get their own bucket, sorted last. Nothing is hidden; the
// missing date is stated as the reason.
export const UNDATED_KEY = 'undated';

export function groupByQuarter(opps, fiscalStart) {
    const map = new Map();
    for (const o of opps) {
        const qk = quarterOf(o.forecastedCloseDate, fiscalStart);
        const key = qk ? qk.key : UNDATED_KEY;
        if (!map.has(key)) {
            map.set(key, qk
                ? { ...qk, opps: [] }
                // fiscalYear 9999 sorts it last without the NaN an Infinity
                // subtraction would produce if two such groups ever met.
                : { key: UNDATED_KEY, longLabel: 'No close date', fiscalYear: 9999, q: 0, undated: true, opps: [] });
        }
        map.get(key).opps.push(o);
    }
    return [...map.values()].sort((a, b) => a.fiscalYear - b.fiscalYear || a.q - b.q);
}
