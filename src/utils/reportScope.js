// reportScope.js — the Rep / Team / Territory slice, applied to ACTIVITIES.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// ReportsTab applies the slice selectors to opportunities (`reportsOpps`) and
// never to activities: the Activity tab's set was built from the role-gated
// list alone, so "Total activities 23" stayed 23 as a manager stepped through
// every rep (0.67, Jeff: "it should not stay the same as the manager walks
// through the reps"). The Performance tab's activity mix had the same gap.
//
// An activity carries its rep as a display name in one of four fields; the
// team and territory slices resolve to a set of names through the org's users
// (the same resolution the Performance leaderboard already does for its rows).
// Pure so tests/report-scope.test.mjs and the mutation harness can reach it.

/** The rep an activity belongs to, by the field chain the reports already use. */
export const activityRepOf = (a) => a?.rep || a?.salesRep || a?.assignedTo || a?.author || '';

/**
 * The set of rep names a slice selects, or null when no slice is active.
 * @param {{rep?:string|null, team?:string|null, territory?:string|null}} slice
 * @param {{name?:string, team?:string, territory?:string}[]} users  settings.users
 */
export function repsForSlice(slice, users) {
    const { rep, team, territory } = slice || {};
    const list = Array.isArray(users) ? users : [];
    if (rep)       return new Set([rep]);
    if (team)      return new Set(list.filter(u => u.name && u.team === team).map(u => u.name));
    if (territory) return new Set(list.filter(u => u.name && u.territory === territory).map(u => u.name));
    return null;
}

/**
 * Activities narrowed to the slice. No slice → the input, untouched. Under a
 * slice, an activity with no rep on it belongs to nobody selected and is out.
 */
export function sliceActivities(activities, slice, users) {
    const reps = repsForSlice(slice, users);
    const acts = Array.isArray(activities) ? activities : [];
    if (!reps) return acts;
    return acts.filter(a => { const r = activityRepOf(a); return r && reps.has(r); });
}
