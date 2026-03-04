// Shared Clerk JWT verification helper for all Netlify functions
export async function verifyAuth(event) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return { error: 'Unauthorized: no token', status: 401 };
    }

    try {
        const clerkSecretKey = process.env.CLERK_SECRET_KEY;
        if (!clerkSecretKey) {
            console.error('CLERK_SECRET_KEY not set');
            return { error: 'Server configuration error', status: 500 };
        }

        const verifyRes = await fetch('https://api.clerk.com/v1/tokens/verify', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${clerkSecretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
        });

        if (!verifyRes.ok) {
            const errText = await verifyRes.text();
            console.error('Token verify failed:', verifyRes.status, errText);
            return { error: 'Unauthorized: invalid token', status: 401 };
        }

        const payload = await verifyRes.json();

        // Log full payload to diagnose metadata location
        console.log('JWT payload keys:', Object.keys(payload).join(', '));
        console.log('JWT payload.public_metadata:', JSON.stringify(payload.public_metadata));
        console.log('JWT payload.metadata:', JSON.stringify(payload.metadata));

        const userId   = payload.sub || payload.user_id || '';
        const meta     = payload.public_metadata || payload.metadata?.public || {};
        const userRole = meta.role || 'User';
        const managedReps = meta.managedReps || [];

        console.log('Resolved role:', userRole, 'userId:', userId);

        return { userId, userRole, managedReps, error: null };

    } catch (err) {
        console.error('Auth verification error:', err.message);
        return { error: 'Auth error: ' + err.message, status: 500 };
    }
}

export const isAdmin   = (role) => role === 'Admin';
export const isManager = (role) => role === 'Manager';
export const canSeeAll = (role) => role === 'Admin' || role === 'Manager';
