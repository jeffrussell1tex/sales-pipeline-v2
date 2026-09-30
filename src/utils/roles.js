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

// Not sales reps: the report rosters that count reps (per-rep averages, the
// activity rhythm grid, the team quota, the Rep slicer) leave these out. A
// value that is not here — 'User', an absent role, a legacy string — counts,
// as it did before this list existed.
export const NON_REP_ROLES = Object.freeze(['Admin', 'Manager', 'ReadOnly', 'Technician', 'Dispatcher']);
