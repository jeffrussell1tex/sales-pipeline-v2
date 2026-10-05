// src/utils/roleAccess.js — Settings → Roles & permissions, as rows (state §0.171).
//
// What each role can see and change, built from the functions the server runs
// (roles.js): crmReadScope decides what the six CRM reads return, canEditCrm and
// canSeeAll what the CRM writes allow, dispatchAccessOf what Dispatch lets a role
// do. The page renders these rows, so it cannot say one thing while the server
// does another — and a rule changed in roles.js changes the page with it.
//
// Until §0.171 the page was a mockup: a hand-typed list of five roles, two of
// them ("Customer Success", "Finance / CFO") no role the app has, with invented
// member counts, and a permission grid saved to a settings key nothing else read.
import { ROLE_OPTIONS, crmReadScope, canEditCrm, canSeeAll, dispatchAccessOf } from './roles.js';

// crmReadScope's three answers, in words. 'own' is the caller's records plus the
// unassigned ones — accounts, contacts, tasks and activities always; leads and
// deals as the org's Lead & deal visibility switches say.
export const RECORD_ACCESS = Object.freeze({
    all:  'Every record',
    own:  'Their own, and unassigned ones',
    none: 'None',
});

// dispatchAccessOf's four answers, in words.
export const DISPATCH_ACCESS = Object.freeze({
    full: 'Full',
    tech: 'Their own jobs',
    read: 'View only',
    none: 'None',
});

// One row per role, in the pickers' order. `settings` is the org's — Dispatch
// reads its two keys (the module switch, and whether reps may use it); with the
// module off, `dispatch` is null: the page says Dispatch is off, not "None" six times.
export function roleAccessRows(settings = {}) {
    const dispatchOn = !!settings?.dispatchEnabled;
    return ROLE_OPTIONS.map(({ value, label, desc }) => ({
        role:     value,
        label,
        desc,
        records:  RECORD_ACCESS[crmReadScope(value)],
        changes:  !canEditCrm(value) ? 'None' : canSeeAll(value) ? 'Any record' : 'Their own, and unassigned ones',
        dispatch: dispatchOn ? DISPATCH_ACCESS[dispatchAccessOf(value, settings)] : null,
    }));
}
