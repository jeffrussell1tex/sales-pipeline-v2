import { verifyToken, createClerkClient } from '@clerk/backend';
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
// The paths that write a role -- admin create and invite (users.mjs),
// user-role, users-sync -- validate against isAppRole() before the value reaches
// Clerk or the mirror. (invite-user.mjs does NOT, and nothing in the app calls
// it — state §9, flagged for deletion.)
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


// Short-lived in-memory cache keyed by token to avoid repeated Clerk API calls
// during bulk imports (97 records × 3 concurrent = ~97 getUser calls → rate limit)
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

        // Fetch user metadata (cached to avoid rate limits on bulk operations)
        const clerk = createClerkClient({ secretKey: clerkSecretKey });
        const user = await clerk.users.getUser(userId);
        const meta = user.publicMetadata || {};

        // An ABSENT role is a rep -- that is deliberate and safe. A role that is
        // PRESENT but not one of ours is neither: it means something wrote a value
        // into Clerk that no gate in this app recognises. requireWrite refuses it
        // below; warn here so the log names the string and the user.
        const rawRole     = meta.role;
        const userRole    = rawRole || 'User';
        if (rawRole && !isAppRole(rawRole)) {
            console.warn('verifyAuth: UNRECOGNISED role', JSON.stringify(rawRole), 'for user', userId, 'in org', orgId);
        }
        const managedReps = meta.managedReps || [];

        const result = { userId, orgId, userRole, managedReps, error: null };

        // Cache result, evicting stale entries to prevent unbounded growth
        authCache.set(token, { result, ts: Date.now() });
        if (authCache.size > 500) {
            const oldest = [...authCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
            authCache.delete(oldest);
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
