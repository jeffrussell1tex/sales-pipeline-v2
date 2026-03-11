import { createClerkClient } from '@clerk/backend';

export async function verifyAuth(event) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return { error: 'Unauthorized: no token', status: 401 };
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
        console.error('CLERK_SECRET_KEY not set');
        return { error: 'Server configuration error', status: 500 };
    }

    try {
        const clerk = createClerkClient({ secretKey: clerkSecretKey });

        // Use authenticateRequest which handles all token verification correctly
        const requestState = await clerk.authenticateRequest(
            new Request('https://salespipelinetracker.com/', {
                headers: { Authorization: 'Bearer ' + token }
            }),
            { secretKey: clerkSecretKey }
        );

        if (!requestState.isSignedIn) {
            console.error('Clerk auth failed:', requestState.reason);
            return { error: 'Unauthorized', status: 401 };
        }

        const userId = requestState.toAuth().userId;

        // Fetch user metadata
        const user = await clerk.users.getUser(userId);
        const meta = user.publicMetadata || {};

        const userRole    = meta.role || 'User';
        const managedReps = meta.managedReps || [];

        console.log('userId:', userId, 'role:', userRole);

        return { userId, userRole, managedReps, error: null };

    } catch (err) {
        console.error('Auth verification error:', err.message);
        return { error: 'Auth error: ' + err.message, status: 500 };
    }
}

export const isAdmin   = (role) => role === 'Admin';
export const isManager = (role) => role === 'Manager';
export const canSeeAll = (role) => role === 'Admin' || role === 'Manager';
