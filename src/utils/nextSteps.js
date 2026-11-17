// src/utils/nextSteps.js — the recommendation log's timing rules (AI scoring batch 3; docs/design/deal-score/DESIGN-3.md —
// Jeff, 17 Nov, Q2: a next step is acted on when an activity is logged on the deal, or its stage moves, within 14 days).
// Pure, so recommendation-log.mjs and the suite read one rule.

// How long a next step has to be acted on.
export const NEXT_STEP_DAYS = 14;
// An alert waits this long before it is judged, as it always has.
export const ALERT_WAIT_DAYS = 3;

// An instant's day as the server reads it — the UTC day, from its parts (the server's day counts are UTC's; OPEN_ITEMS §4.2).
const serverDayOf = (t) => {
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// Whether a deal's stage day falls within a window — a stored day (yyyy-mm-dd) against two instants, by the day.
export function stageMovedWithin(stageDay, since, until) {
    if (typeof stageDay !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(stageDay)) return false;
    const day = stageDay.slice(0, 10);
    return day >= serverDayOf(since) && day <= serverDayOf(until);
}
