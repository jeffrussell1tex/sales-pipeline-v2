import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireRole } from './auth.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';

// Change an existing user's role.
//
// Clerk publicMetadata.role is the source of truth — auth.mjs derives userRole
// from it on every request, and the `users` table is only a mirror. Before this
// endpoint existed, nothing anywhere wrote a role change back to Clerk: editing
// a role in Settings updated the mirror alone, so server-side authorization was
// unchanged. The selector looked like it worked and did nothing that mattered.
//
// Roles must match what auth.mjs checks. 'User' is the stored value for a sales
// rep ("Sales Rep" is only a display label); auth.mjs treats any unrecognised
// role as a rep, so a mismatch here fails open rather than loudly.
const VALID_ROLES = ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'];

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId } = auth;

    // Granting roles is a privilege-escalation vector by definition.
    const forbidden = requireRole(auth, ['Admin'], headers);
    if (forbidden) return forbidden;

    try {
        const { targetUserId, role } = JSON.parse(event.body || '{}');
        if (!targetUserId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'targetUserId required' }) };
        if (!VALID_ROLES.includes(role)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }) };
        }

        // An admin removing their own admin rights can lock the org out of its
        // own settings, so it has to be deliberate — done from another account.
        if (targetUserId === userId && role !== 'Admin') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'You cannot change your own role. Ask another Admin.' }) };
        }

        const { createClerkClient } = await import('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

        // Confirm the target is a member of THIS org before touching them —
        // Clerk user ids are global, so without this an admin of one tenant
        // could rewrite the role of a user in another.
        let isMember = false;
        try {
            const memberships = await clerk.users.getOrganizationMembershipList({ userId: targetUserId });
            isMember = (memberships?.data || memberships || [])
                .some(m => (m.organization?.id || m.organizationId) === orgId);
        } catch (e) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (!isMember) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'That user is not a member of this organization.' }) };
        }

        const clerkUser = await clerk.users.getUser(targetUserId);
        const priorRole = clerkUser.publicMetadata?.role || 'User';

        // Merge rather than replace — publicMetadata carries other keys (name).
        await clerk.users.updateUser(targetUserId, {
            publicMetadata: { ...(clerkUser.publicMetadata || {}), role },
        });

        // Keep the mirror in step. Best-effort: Clerk is authoritative, so a
        // failure here is a stale roster row, not a failed permission change.
        try {
            await db.update(users).set({ role, updatedAt: new Date() })
                .where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)));
        } catch (e) {
            console.warn('user-role: mirror update failed for', targetUserId, e?.message);
        }

        const name = ((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim()
            || clerkUser.emailAddresses?.[0]?.emailAddress || targetUserId;

        await writeAudit(orgId, {
            action: 'user.role.changed',
            entityType: 'user',
            entityId: targetUserId,
            entityName: name,
            detail: `Role ${priorRole} \u2192 ${role}`,
            userId,
            userName: await getCallerName(userId),
        });

        return {
            statusCode: 200, headers,
            body: JSON.stringify({
                ok: true, userId: targetUserId, role, priorRole,
                // verifyAuth caches the role briefly, so the change is not
                // instant on already-issued requests.
                note: 'Role changes take up to 30 seconds to take effect.',
            }),
        };

    } catch (err) {
        console.error('user-role error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'user-role') };
    }
};
