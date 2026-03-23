import { verifyToken, createClerkClient } from '@clerk/backend';

// Short-lived in-memory cache keyed by token to avoid repeated Clerk API calls
// during bulk imports (97 records × 3 concurrent = ~97 getUser calls → rate limit)
const authCache = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function verifyAuth(event) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return { error: 'Unauthorized: no token', status: 401 };
    }

    // Return cached result if still fresh
    const cached = authCache.get(token);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.result;
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
