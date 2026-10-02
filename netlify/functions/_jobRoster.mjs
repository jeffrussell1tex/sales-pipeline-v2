// _jobRoster.mjs — how a scheduled job finds a person: inside the row's OWN org,
// by the app user id the row carries (state §0.159, guide §18b52).
//
// pipeline-alerts, digest and task-reminders each read every org's rows in one
// pass — a scheduled job is the one reader across tenants — and then found
// people across all of them by DISPLAY NAME: `userByName[u.name] = u` (the last
// row of ANY org won), a rep's manager by the rep's name or the team's name from
// every org, the Monday team digest's reps from every org, a task's assignee by
// name with no org at all. A display name is unique in no org (18b20), let alone
// across orgs, and the shared database holds the same names in several — on
// 2 Oct 2026 "Jeff Russell" in six orgs, "Karen Russell" and "Ryan Algie" in
// three. So a Manager in one org could be emailed another org's deal, every
// Admin's Monday digest listed every org's reps, a member could be texted
// another org's tasks, and the real rep's alerts were silently skipped.
//
// The rule, in four parts:
//   1. rows are grouped by org FIRST, and every lookup is built per org;
//   2. a record's person is its OWNER — `ownerId`, the app user id
//      (_ownership.mjs) — in the record's own org; never the display-name
//      column, and an unowned record (UNASSIGNED) belongs to no one;
//   3. a manager is an active Manager of THAT org;
//   4. anything computed over many rows (a stage's average) is computed per org.
//
// Pure — no db, no imports — so tests/job-roster.test.mjs imports and RUNS it.

/** Rows grouped by org. A row with no org belongs to none: dropped, never guessed. */
export function byOrg(rows) {
    const out = new Map();
    for (const r of rows || []) {
        if (!r?.orgId) continue;
        const list = out.get(r.orgId);
        if (list) list.push(r); else out.set(r.orgId, [r]);
    }
    return out;
}

/**
 * ONE org's people, the way a job looks them up. A row of another org handed in
 * is dropped, so a caller that forgets to group still cannot reach across.
 *   byId           app user id → member
 *   managerByRep   a rep's display name → the Manager whose profile.managedReps
 *                  names them
 *   managerByTeam  a team's name → a Manager on it
 * Only an ACTIVE Manager with an address is anyone's manager here — not a
 * deactivated one, not another role whose profile happens to carry managedReps.
 * Where two qualify, the later row wins (the old maps' rule).
 */
export function rosterOf(orgId, users) {
    const people = orgId ? (users || []).filter(u => u?.orgId === orgId) : [];
    const byId = new Map(people.map(u => [u.id, u]));
    const managerByRep = new Map();
    const managerByTeam = new Map();
    for (const u of people) {
        if (u.role !== 'Manager' || !u.active || !u.email) continue;
        if (u.team) managerByTeam.set(u.team, u);
        const reps = Array.isArray(u.profile?.managedReps) ? u.profile.managedReps : [];
        for (const rep of reps) managerByRep.set(rep, u);
    }
    return { orgId, people, byId, managerByRep, managerByTeam };
}

/** Every org's roster, by org id. */
export function rostersByOrg(users) {
    const out = new Map();
    for (const [org, people] of byOrg(users)) out.set(org, rosterOf(org, people));
    return out;
}

/**
 * The member a record belongs to: its owner, by app user id, on the roster of
 * the record's OWN org. Null when the record is unassigned (no ownerId), when the
 * roster is another org's, or when the id is no one on it. The display-name
 * column (salesRep, assignedTo, author) is never read.
 */
export function ownerOf(record, roster) {
    if (!record?.orgId || !roster || record.orgId !== roster.orgId) return null;
    const id = typeof record.ownerId === 'string' ? record.ownerId.trim() : '';
    return id ? roster.byId.get(id) || null : null;
}

/** A rep's manager, in the rep's own org: profile.managedReps first, then the rep's team. */
export function managerOf(rep, roster) {
    if (!rep?.orgId || !roster || rep.orgId !== roster.orgId) return null;
    return roster.managerByRep.get(rep.name) || (rep.team ? roster.managerByTeam.get(rep.team) : null) || null;
}

/** `fn` over each org's rows apart — an average, a count — never over two orgs at once. */
export function perOrg(rows, fn) {
    const out = new Map();
    for (const [org, list] of byOrg(rows)) out.set(org, fn(list));
    return out;
}

/** The key activitiesByDeal files a deal's activities under: its org AND its id. */
export const dealKey = (orgId, dealId) => `${orgId}\u0000${dealId}`;

/**
 * Each deal's activities, newest first, filed under dealKey(org, deal) — so an
 * activity in one org that names another org's deal id is never that deal's.
 */
export function activitiesByDeal(acts) {
    const out = new Map();
    for (const a of acts || []) {
        if (!a?.orgId || !a.opportunityId) continue;
        const k = dealKey(a.orgId, a.opportunityId);
        const list = out.get(k);
        if (list) list.push(a); else out.set(k, [a]);
    }
    for (const list of out.values()) list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return out;
}

/**
 * The reps a Monday team digest lists: role-User members of the manager's OWN
 * org — every one for an Admin, the manager's team for a Manager. TeamsDetail
 * writes `team` and profile.teamId together, so inside one org the team's name
 * is the match. Another org's reps never, whatever their team is called.
 */
export function teamRepsOf(mgr, users) {
    if (!mgr?.orgId) return [];
    const reps = (users || []).filter(u => u?.orgId === mgr.orgId && u.role === 'User');
    if (mgr.role === 'Admin') return reps;
    return mgr.team ? reps.filter(u => u.team === mgr.team) : [];
}

/** A member's own records: their app id as the owner, in their own org. */
export function ownedBy(user, rows) {
    if (!user?.id || !user.orgId) return [];
    return (rows || []).filter(r => r?.orgId === user.orgId && r.ownerId === user.id);
}
