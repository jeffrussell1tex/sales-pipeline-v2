// _roleGate.mjs — the role gates, pure (no Clerk, no db).
//
// Moved out of auth.mjs (30 Sep, state §0.151) so an integration suite can run
// the REAL gate. Seventeen suites mock auth.mjs to fake the sign-in, and each
// carried its own hand-written requireWrite — so they proved the endpoints
// against a copy that did not know every role (a Dispatcher sailed through the
// copies). A suite now mocks verifyAuth alone and re-exports these.
//
// auth.mjs re-exports both functions, so every endpoint's import is unchanged.
import { APP_ROLES, CRM_WRITE_ROLES, isReadOnly, isTechnician, isDispatcher } from '../../src/utils/roles.js';

// Write gate for mutating branches — the one check every mutating endpoint
// needs before any role-specific rule (Admin-only clears, ownership checks)
// applies. Non-mutating methods pass straight through, so it is safe to call
// once at the top of a handler rather than per branch.
//
// THIS IS AN ALLOWLIST, and it did not used to be. It denied exactly two strings
// -- 'ReadOnly' and 'Technician' -- and permitted everything else, so ANY value
// that was not spelled precisely that way carried full write access to ~28
// endpoints. 'readonly', 'Read Only', 'technician', a typo, or a role invented by
// a future Clerk config all passed. That is guide 18b20.2 in a role string:
// absence of a known role was being read as a permission.
//
// Three roles may write: Admin, Manager, User (CRM_WRITE_ROLES). Technician may
// write ONLY through the one caller that opts in (dispatch-jobs.mjs), which then
// applies its own per-field whitelist and ownership check. A Dispatcher writes
// NO CRM record: they read the whole CRM (crmReadScope) and run Dispatch, whose
// endpoints gate on their own. Everything else is refused LOUDLY -- a quiet
// refusal here is indistinguishable from the gate working and gets debugged at
// the wrong layer (18b22). Each refusal says which rule refused: the body is the
// only way to tell them apart.
//
// DEPLOY NOTE: this can lock out a user whose ROLE holds a non-canonical string —
// since §0.163 the role on their row in the org's roster (it was Clerk's
// publicMetadata.role). Run `node --env-file=.env scripts/check-mirror-roles.mjs`
// (read-only) BEFORE deploying and fix anyone it names.
//
// Usage:
//   const forbidden = requireWrite(auth, event, headers);
//   if (forbidden) return forbidden;
// Opt-in (dispatch-jobs only):
//   const forbidden = requireWrite(auth, event, headers, { allowTechnician: true });
const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
export function requireWrite(auth, event, headers, opts = {}) {
    if (!MUTATING_METHODS.includes(event?.httpMethod)) return null;

    if (CRM_WRITE_ROLES.includes(auth?.userRole)) return null;
    if (isTechnician(auth?.userRole) && opts.allowTechnician) return null;

    if (isReadOnly(auth?.userRole)) {
        console.warn('requireWrite: read-only role blocked', event?.httpMethod, 'for user', auth?.userId);
        return {
            statusCode: 403, headers,
            body: JSON.stringify({ error: 'Forbidden: read-only role' }),
        };
    }

    if (isTechnician(auth?.userRole)) {
        console.warn('requireWrite: technician role blocked', event?.httpMethod, 'for user', auth?.userId);
        return {
            statusCode: 403, headers,
            body: JSON.stringify({ error: 'Forbidden: technicians may only update their own assigned jobs' }),
        };
    }

    if (isDispatcher(auth?.userRole)) {
        console.warn('requireWrite: dispatcher role blocked', event?.httpMethod, 'for user', auth?.userId);
        return {
            statusCode: 403, headers,
            body: JSON.stringify({ error: 'Forbidden: a Dispatcher can view CRM records but not change them' }),
        };
    }

    // Not a role any branch above knows: a value no gate in this application
    // recognises. Name it in the log -- this is the only place the string
    // becomes visible, and it is what tells you a role was written to Clerk by a
    // path that did not validate.
    console.warn('requireWrite: UNRECOGNISED role', JSON.stringify(auth?.userRole),
        'blocked', event?.httpMethod, 'for user', auth?.userId,
        '-- expected one of', APP_ROLES.join(' | '));
    return {
        statusCode: 403, headers,
        body: JSON.stringify({ error: 'Forbidden: unrecognised role. Ask an administrator to reset your role.' }),
    };
}

// Role gate for individual handler branches. Returns a ready-to-return 403
// response when the caller's role is not in allowedRoles, or null when allowed.
// Usage:
//   const forbidden = requireRole(auth, ['Admin'], headers);
//   if (forbidden) return forbidden;
// Note: verifyAuth caches role for up to 30s, so a role change (e.g. an admin
// being demoted) can take up to 30s to be enforced here.
export function requireRole(auth, allowedRoles, headers) {
    if (allowedRoles.includes(auth?.userRole)) return null;
    console.warn('requireRole: forbidden role', auth?.userRole, 'for user', auth?.userId);
    return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden: insufficient role' }),
    };
}
