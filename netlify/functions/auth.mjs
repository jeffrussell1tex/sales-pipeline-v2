import { verifyToken, createClerkClient } from '@clerk/backend';

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

        const userRole    = meta.role || 'User';
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

export const isAdmin   = (role) => role === 'Admin';
export const isManager = (role) => role === 'Manager';
export const canSeeAll = (role) => role === 'Admin' || role === 'Manager';
export const isReadOnly = (role) => role === 'ReadOnly';

// Field technician. Has app access (mobile) but is NOT a general write role: the
// only thing a Technician may change is the progress of a job assigned to them,
// through the field whitelist in dispatch-jobs.mjs. Everything else — all CRM
// entities, customers, other technicians, scheduling, vehicles — is read-only.
export const isTechnician = (role) => role === 'Technician';

// Role gate for individual handler branches. Returns a ready-to-return 403
// response when the caller's role is not in allowedRoles, or null when allowed.
// Usage:
//   const forbidden = requireRole(auth, ['Admin'], headers);
//   if (forbidden) return forbidden;
// Note: verifyAuth caches role for up to 30s, so a role change (e.g. an admin
// being demoted) can take up to 30s to be enforced here.
// Write gate for mutating branches — the one check every mutating endpoint
// needs before any role-specific rule (Admin-only clears, ownership checks)
// applies. Non-mutating methods pass straight through, so it is safe to call
// once at the top of a handler rather than per branch.
//
// TWO roles have no general write capability: ReadOnly and Technician. Technician
// is denied BY DEFAULT here so that adding the role cannot silently grant write
// access to the ~28 endpoints that call this. Exactly one caller opts in
// (dispatch-jobs.mjs), and it then applies its own per-field whitelist and
// ownership check. Deny-by-default with a single explicit opt-in is the point:
// a new role must never inherit write access simply by not being ReadOnly.
//
// Usage:
//   const forbidden = requireWrite(auth, event, headers);
//   if (forbidden) return forbidden;
// Opt-in (dispatch-jobs only):
//   const forbidden = requireWrite(auth, event, headers, { allowTechnician: true });
const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
export function requireWrite(auth, event, headers, opts = {}) {
    if (!MUTATING_METHODS.includes(event?.httpMethod)) return null;

    if (isReadOnly(auth?.userRole)) {
        console.warn('requireWrite: read-only role blocked', event?.httpMethod, 'for user', auth?.userId);
        return {
            statusCode: 403, headers,
            body: JSON.stringify({ error: 'Forbidden: read-only role' }),
        };
    }

    if (isTechnician(auth?.userRole) && !opts.allowTechnician) {
        console.warn('requireWrite: technician role blocked', event?.httpMethod, 'for user', auth?.userId);
        return {
            statusCode: 403, headers,
            body: JSON.stringify({ error: 'Forbidden: technicians may only update their own assigned jobs' }),
        };
    }

    return null;
}

export function requireRole(auth, allowedRoles, headers) {
    if (allowedRoles.includes(auth?.userRole)) return null;
    console.warn('requireRole: forbidden role', auth?.userRole, 'for user', auth?.userId);
    return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden: insufficient role' }),
    };
}
