// Shared Clerk JWT verification helper for all Netlify functions
// Usage: const { userId, userRole, managedReps, error } = await verifyAuth(event);

export async function verifyAuth(event) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return { error: 'Unauthorized: no token', status: 401 };
    }

    try {
        // Verify JWT using Clerk's JWKS endpoint
        const clerkSecretKey = process.env.CLERK_SECRET_KEY;
        if (!clerkSecretKey) {
            console.error('CLERK_SECRET_KEY not set');
            return { error: 'Server configuration error', status: 500 };
        }

        // Use Clerk's backend SDK verification via the verifyToken endpoint
        const verifyRes = await fetch('https://api.clerk.com/v1/tokens/verify', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${clerkSecretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
        });

        if (!verifyRes.ok) {
            return { error: 'Unauthorized: invalid token', status: 401 };
        }

        const payload = await verifyRes.json();

        const userId   = payload.sub || payload.user_id || '';
        const meta     = payload.public_metadata || payload.metadata?.public || payload.unsafe_metadata || {};
        const userRole = meta.role || 'User';
        const managedReps = meta.managedReps || [];

        return { userId, userRole, managedReps, error: null };

    } catch (err) {
        console.error('Auth verification error:', err.message);
        return { error: 'Auth error: ' + err.message, status: 500 };
    }
}

// Role helpers
export const isAdmin   = (role) => role === 'Admin';
export const isManager = (role) => role === 'Manager';
export const canSeeAll = (role) => role === 'Admin' || role === 'Manager';
