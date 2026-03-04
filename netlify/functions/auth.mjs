import { createClerkClient } from '@clerk/backend';

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

        const clerk = createClerkClient({ secretKey: clerkSecretKey });
        const payload = await clerk.verifyToken(token);

        console.log('JWT payload keys:', Object.keys(payload).join(', '));
        console.log('public_metadata:', JSON.stringify(payload.public_metadata));

        const userId      = payload.sub || '';
        const meta        = payload.public_metadata || {};
        const userRole    = meta.role || 'User';
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
