// repDeals.js — one rep's won and lost deals for a report period, with totals.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// Reports → Performance with the Rep slicer set is the single-rep view: the
// leaderboard shrinks to one row and the Rep metrics table hides itself below
// two reps, so a manager looking at one rep saw an attainment bar and a number
// and no deals behind either. Jeff (3 Sep, while eyeballing the Forecast tab):
// the rep view "should have a section listing that rep's won and lost deals,
// with totals" (handoff item 20, state §0.85). Pure so the row shape, the
// order and the totals can be pinned by node --test; ReportsTab imports React
// and cannot be loaded there.
//
// Inputs are the report's ALREADY-PERIOD-FILTERED won and lost sets (the same
// `wonOpps` / `lostOpps` the leaderboard sums), so the list's total is the
// leaderboard's number, not a second opinion on the window. Close day, cycle,
// exit stage and loss bucket come from the helpers every other report reads.
import { closeDayOf, cycleDaysOf } from './pipelineReport.js';
import { lossBucketOf, exitStageOf } from './lossAnalysis.js';

const num = (v) => parseFloat(v) || 0;

/** The rep a deal belongs to — the same resolution the leaderboard uses. */
export const dealRepOf = (o) => o?.salesRep || o?.assignedTo || '';

/** One list row. `closeDay` is '' when the deal has no readable close day. */
export function dealRowOf(o) {
    return {
        id:                 o?.id ?? null,
        name:               o?.opportunityName || o?.account || '(unnamed deal)',
        account:            o?.account || '',
        stage:              o?.stage || '',
        closeDay:           closeDayOf(o) || '',
        arr:                num(o?.arr),
        implementationCost: num(o?.implementationCost),
        cycleDays:          cycleDaysOf(o),
        exitStage:          exitStageOf(o),
        lossReason:         lossBucketOf(o, ''),
    };
}

// Newest close first; a row with no close day sorts last; ties by name so the
// order is stable between renders.
const byCloseDesc = (a, b) => {
    if (!a.closeDay && !b.closeDay) return a.name.localeCompare(b.name);
    if (!a.closeDay) return 1;
    if (!b.closeDay) return -1;
    return b.closeDay.localeCompare(a.closeDay) || a.name.localeCompare(b.name);
};

/**
 * { won: rows, lost: rows, totals } for `rep`. A deal whose stage does not
 * match the list it was handed in is dropped rather than mis-filed — the
 * lists are trusted for the period, not for the stage.
 */
export function repDeals(wonOpps, lostOpps, rep) {
    const mine = (list, stage) => (Array.isArray(list) ? list : [])
        .filter(o => o && o.stage === stage && dealRepOf(o) === rep);
    const won  = mine(wonOpps, 'Closed Won').map(dealRowOf).sort(byCloseDesc);
    const lost = mine(lostOpps, 'Closed Lost').map(dealRowOf).sort(byCloseDesc);
    const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
    const closed = won.length + lost.length;
    return {
        won,
        lost,
        totals: {
            wonCount:  won.length,
            wonArr:    sum(won, 'arr'),
            wonImpl:   sum(won, 'implementationCost'),
            lostCount: lost.length,
            lostArr:   sum(lost, 'arr'),
            winRate:   closed > 0 ? won.length / closed : null,
        },
    };
}
