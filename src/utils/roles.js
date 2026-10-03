// src/utils/roles.js — the ONE role vocabulary, and the rules that read a role.
//
// Pure: no React, no Clerk, no db. The server takes the vocabulary and the
// predicates from here through auth.mjs (and the six CRM endpoints take
// crmReadScope directly, so a suite that mocks auth.mjs still runs the real
// read rule); the Settings screens, the User modal, field-level security and
// scripts/check-clerk-roles.mjs import the same list. Five copies of the list
// drifted before this module existed (state §9, 30 Sep): a role added to one
// was missing from the next, and a <select> whose value matches no option
// shows the FIRST option, so a Technician once displayed as "Admin".
//
// Two different questions are asked of a role, and they have separate answers
// on purpose (guide §18b45):
//   canSeeAll(role)     WRITE authority over other people's records — the
//                       ownership bypass in mayMutate(). Admin and Manager.
//   crmReadScope(role)  what the six CRM GETs return — 'all', 'own' or 'none'.
// A Dispatcher reads the whole CRM and writes none of it. Widening canSeeAll to
// hand a Dispatcher the reads would also have handed them every write.

// The stored values. 'User' is a sales rep: the STORED value is 'User' and
// "Sales Rep" is only its label — storing the label was a recurring bug.
export const APP_ROLES = Object.freeze(['Admin', 'Manager', 'User', 'ReadOnly', 'Technician', 'Dispatcher']);
export const isAppRole = (role) => APP_ROLES.includes(role);

// Display order and words for every role picker. `value` is what is stored.
export const ROLE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'Admin',      label: 'Admin',      desc: 'Full access, manage settings & users' }),
    Object.freeze({ value: 'Manager',    label: 'Manager',    desc: 'View all data, edit & delete' }),
    Object.freeze({ value: 'User',       label: 'Sales Rep',  desc: 'Own data only, create & edit' }),
    Object.freeze({ value: 'Dispatcher', label: 'Dispatcher', desc: 'Runs Dispatch; views the CRM, changes none of it' }),
    Object.freeze({ value: 'Technician', label: 'Technician', desc: 'Field jobs assigned to them only' }),
    Object.freeze({ value: 'ReadOnly',   label: 'Read only',  desc: 'View only, no changes' }),
]);

export const isAdmin      = (role) => role === 'Admin';
export const isManager    = (role) => role === 'Manager';
export const isReadOnly   = (role) => role === 'ReadOnly';
export const isTechnician = (role) => role === 'Technician';
export const isDispatcher = (role) => role === 'Dispatcher';

// WRITE authority over records other people own. Unchanged by the Dispatcher.
export const canSeeAll = (role) => role === 'Admin' || role === 'Manager';

// The roles that may create and change CRM records at all (leads, accounts,
// contacts, deals, tasks, activities, quotes). requireWrite enforces it on the
// server; the CRM tabs' canEdit reads the same list, so a button is not shown
// to someone the server will refuse.
export const CRM_WRITE_ROLES = Object.freeze(['Admin', 'Manager', 'User']);
export const canEditCrm = (role) => CRM_WRITE_ROLES.includes(role);

// What the six CRM GETs return to a role:
//   'all'   every row in the org — Admin, Manager, and a Dispatcher (read-only)
//   'none'  nothing — a Technician, a field user whose tabs are My Jobs alone
//   'own'   the caller's own rows plus unassigned ones — a rep, ReadOnly, and
//           any value that is not a role (it writes nothing either: requireWrite)
export function crmReadScope(role) {
    if (role === 'Admin' || role === 'Manager' || role === 'Dispatcher') return 'all';
    if (role === 'Technician') return 'none';
    return 'own';
}

// Whether a DEAL reaches a caller — the deals list's rule (opportunities.mjs GET),
// and everything that belongs to a deal follows it: its quotes, a quote's email,
// the job a quote became (§0.155, guide §18b48). One rule, so a quote can never be
// visible where its deal is not. `ctx` (netlify/functions/_dealAccess.mjs builds it):
//   role               the caller's
//   callerId           their users.id (usr_…), or null when they have no roster row
//   unassignedVisible  the org's switch (settings.extra.unassignedDealsVisibleToReps)
//   managedReps        a Manager's reps, as DISPLAY NAMES, from their row in this
//                      org's roster (profile.managedReps — §0.163; it was Clerk's
//                      user-level metadata, one list for every org)
// 'own' keys on the OWNER ID — a display name is not an identity (a renamed rep
// vanished from her own pipeline; two reps sharing a name saw each other's). An
// unassigned deal is the switch's call, decided BEFORE the owner comparison: a
// caller who cannot be resolved (null) must not meet an unassigned deal (null) in
// `null === null` (18b22). A Manager whose reps are named on their row is narrowed to
// their deals and the unassigned ones — still by NAME, until managedReps holds ids.
export function dealVisibleTo(deal, ctx = {}) {
    if (!deal) return false;
    const scope = crmReadScope(ctx.role);
    if (scope === 'none') return false;
    if (scope === 'own') {
        if (!deal.ownerId) return ctx.unassignedVisible === true;
        return !!ctx.callerId && deal.ownerId === ctx.callerId;
    }
    const reps = Array.isArray(ctx.managedReps) ? ctx.managedReps : [];
    if (ctx.role === 'Manager' && reps.length > 0) return !deal.salesRep || reps.includes(deal.salesRep);
    return true;
}

// What a role may do in Dispatch (§0.152 — Jeff: sales reps "should not have
// dispatch power"). ONE rule for the server gate (_dispatchGate.mjs, every
// dispatch-* endpoint, invoices, quote → job) and the client (the tab, the nav,
// the redirect, the quote card's Create button). `extra` is the org's settings
// (the server's settings.extra, the client's settings — the same two keys):
//   'none'  the Dispatch module is off, or a sales rep in an org whose reps do
//           not use Dispatch (repsCanUseDispatch, OFF when absent), or a value
//           that is not a role
//   'full'  Admin, Manager, Dispatcher — and a rep where the org switch is on
//   'tech'  a Technician: reads, and writes only through the one opt-in
//           (dispatch-jobs, their own jobs' progress)
//   'read'  ReadOnly: reads, writes nothing
export function dispatchAccessOf(role, extra) {
    if (!extra?.dispatchEnabled) return 'none';
    if (role === 'Admin' || role === 'Manager' || role === 'Dispatcher') return 'full';
    if (role === 'Technician') return 'tech';
    if (role === 'ReadOnly') return 'read';
    if (role === 'User') return extra?.repsCanUseDispatch === true ? 'full' : 'none';
    return 'none';
}
export const canUseDispatch = (role, extra) => dispatchAccessOf(role, extra) !== 'none';

// Not sales reps: the report rosters that count reps (per-rep averages, the
// activity rhythm grid, the team quota, the Rep slicer) leave these out. A
// value that is not here — 'User', an absent role, a legacy string — counts,
// as it did before this list existed.
export const NON_REP_ROLES = Object.freeze(['Admin', 'Manager', 'ReadOnly', 'Technician', 'Dispatcher']);
