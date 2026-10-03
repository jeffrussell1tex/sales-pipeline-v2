import { verifyToken } from '@clerk/backend';
import {
    APP_ROLES, isAppRole, isAdmin, isManager, canSeeAll, isReadOnly, isTechnician, isDispatcher,
} from '../../src/utils/roles.js';
import { requireWrite, requireRole } from './_roleGate.mjs';

// ── THE ROLE VOCABULARY ──────────────────────────────────────────────────────
//
// The roles this application understands live in ONE list, src/utils/roles.js
// (shared with the client screens and scripts/check-clerk-roles.mjs), and are
// re-exported here so every endpoint keeps importing them from auth.mjs. Clerk
// carries a SECOND vocabulary -- organization membership roles, `org:admin` /
// `org:member` -- which is a different thing entirely: it governs who may manage
// the Clerk organization, not what anyone may do in Accelerep. Those two were
// being mixed (users-sync fell back to the membership role when publicMetadata
// carried none), which is where the `member` and `admin` badges came from.
//
// The role is PER ORG (state §0.163, guide §18b56): the role on the caller's row
// in the active org's roster (_callerRole.mjs), never Clerk's user-level
// metadata. The paths that write it -- user-role (an Admin), users.mjs (an
// Admin's invite or create, the first-load link, a first sign-in's new row),
// users-sync (new rows only) -- validate against isAppRole(). (invite-user.mjs,
// which did not, is deleted.)
export {
    APP_ROLES, isAppRole, isAdmin, isManager, canSeeAll, isReadOnly, isTechnician, isDispatcher,
    requireWrite, requireRole,
};

// ── SESSION STATUS ───────────────────────────────────────────────────────────
//
// Clerk v2 session tokens carry `sts`. When the instance requires MFA (or an
// organization must be chosen), an un-enrolled sign-in gets a session with
// status "pending" and a task to finish; Clerk's own helpers treat that as
// signed OUT (treatPendingAsSignedOut). verifyToken() checks signature, expiry
// and authorized party and never reads `sts`, so a pending token verified here
// exactly like an active one and the API served a session Clerk had not
// admitted (0.65, observed: Require on, fresh sign-in, opportunities 200).
//
// The gate is "active or nothing" (18b20): an unrecognised status must not pass
// by being unrecognised. A token with NO `sts` claim is a v1 token, which has
// no pending state, and passes -- absence is not pending.
export const pendingSessionRefusal = (payload) =>
    payload?.sts !== undefined && payload.sts !== 'active'
        ? { error: 'Unauthorized: session pending — finish sign-in (multi-factor setup) first', status: 401 }
        : null;


// Short-lived in-memory cache keyed by token to avoid a role lookup per record
// during bulk imports (97 records × 3 concurrent — it was a Clerk getUser per
// call, and the rate limit, before the role moved to the roster, §0.163)
// TTL is kept short (30s) and we always validate the token's own exp claim so that
// org-switch scenarios can never serve a stale orgId beyond the token's lifetime.
const authCache = new Map();
const CACHE_TTL_MS = 30_000; // 30 seconds — short enough to limit org-switch bleed

export async function verifyAuth(event) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return { error: 'Unauthorized: no token', status: 401 };
    }

    // Return cached result only if still fresh AND the token itself hasn't expired.
    // Clerk JWTs encode exp as seconds-since-epoch in the payload.
    // We decode the payload without re-verifying (already verified on first cache fill)
    // just to check exp — this is safe because we only trust cached results we verified.
    const cached = authCache.get(token);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        // Double-check the token's own exp claim hasn't passed
        try {
            const payloadB64 = token.split('.')[1];
            const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
            if (payload.exp && Date.now() / 1000 < payload.exp) {
                return cached.result;
            }
            // Token expired — evict from cache and fall through to re-verify
            authCache.delete(token);
        } catch {
            // If we can't decode, evict and re-verify
            authCache.delete(token);
        }
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
        console.error('CLERK_SECRET_KEY not set');
        return { error: 'Server configuration error', status: 500 };
    }

    try {
        // Verify the JWT using the secret key
        const payload = await verifyToken(token, {
            secretKey: clerkSecretKey,
            authorizedParties: [
                'https://salespipelinetracker.com',
                'https://sales-pipeline-v2.netlify.app',
                'https://accelerep.netlify.app',
                'http://localhost:5173',
                'http://localhost:8888',
            ]
        });
        // Before the user lookup and before the cache: a refused token must never
        // become a cached result.
        const pending = pendingSessionRefusal(payload);
        if (pending) return pending;

        const userId = payload.sub || '';

        // Extract org_id from JWT (Clerk puts it in org_id or active_organization_id)
        // Clerk stores org in payload.o.id (compact JWT format)
        const orgId = payload.o?.id || payload.org_id || payload.active_organization_id || null;
        if (!orgId) {
            return { error: 'No organization membership found. Please contact your administrator.', status: 403 };
        }

        // The role is the caller's IN THIS ORG (state §0.163): the role on their
        // row in this org's roster — never Clerk's user-level publicMetadata, one
        // value for every org a person is in, which made an Admin anywhere an
        // Admin everywhere. The org role in the verified token (`o.rol` in a v2
        // token, `org_role` in v1) is Clerk's org:admin / org:member — who may
        // administer the Clerk organization, not what anyone may do here — and is
        // handed on for one thing: a new org's first Admin (_lib.mjs
        // ensureRosterRow).
        let row;
        try {
            const { rosterRoleOf } = await import('./_callerRole.mjs');
            row = await rosterRoleOf(userId, orgId);
        } catch (e) {
            // No role is assumed when the roster cannot be read — fail closed.
            console.error('verifyAuth: role lookup failed:', e.message);
            return { error: 'The service is unavailable — try again shortly.', status: 503 };
        }

        // Deactivated in this org (state §0.164 — Jeff: "Deactivated means no
        // access"): the row and its history are kept, and every request in this
        // org is refused until an Admin reactivates it. Not cached.
        if (row && row.active === false) {
            return { error: 'Your access to this organization has been turned off. Ask an Admin of the organization to restore it.', status: 403, code: 'deactivated' };
        }

        // No row is a rep — what a member without a role has always been. A row
        // holding a value that is not one of ours is refused by requireWrite;
        // warn here so the log names the string and the user.
        const rawRole     = row?.role;
        const userRole    = rawRole || 'User';
        if (rawRole && !isAppRole(rawRole)) {
            console.warn('verifyAuth: UNRECOGNISED role', JSON.stringify(rawRole), 'for user', userId, 'in org', orgId);
        }
        const managedReps = row?.managedReps || [];
        const orgRole     = payload.o?.rol ? 'org:' + payload.o.rol : (payload.org_role || null);

        const result = { userId, orgId, userRole, managedReps, orgRole, error: null };

        // Cached only when the row was found. "No row" is the moment before
        // users?me=true links an invited row or provisions one; caching it held
        // the caller at a rep for 30 s after the link.
        if (row) {
            authCache.set(token, { result, ts: Date.now() });
            if (authCache.size > 500) {
                const oldest = [...authCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
                authCache.delete(oldest);
            }
        }

        return result;

    } catch (err) {
        console.error('Auth verification error:', err.message);
        return { error: 'Auth error: ' + err.message, status: 401 };
    }
}

// isAdmin, isManager, canSeeAll, isReadOnly, isTechnician, isDispatcher: the
// predicates live in src/utils/roles.js; requireWrite and requireRole in
// _roleGate.mjs (pure, so a suite that mocks this file can run the real gate).
// All of them are re-exported at the top of this file.
