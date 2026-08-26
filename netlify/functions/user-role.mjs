import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireRole, isAppRole, APP_ROLES } from './auth.mjs';
import { isAppUserId } from './_ownership.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';

// Change an existing user's role.
//
// Clerk publicMetadata.role is the source of truth — auth.mjs derives userRole
// from it on every request, and the `users` table is only a mirror. Before this
// endpoint existed, nothing anywhere wrote a role change back to Clerk: editing
// a role in Settings updated the mirror alone, so server-side authorization was
// unchanged. The selector looked like it worked and did nothing that mattered.
//
// Roles are validated against auth.mjs's APP_ROLES -- the one list. This file
// used to carry its own copy, which is how a second list starts: two lists that
// agree today and are edited by different people on different days. auth.mjs no
// longer treats an unrecognised role as a rep either; requireWrite refuses it.
//
// TWO IDENTITY SPACES MEET IN THIS HANDLER, and mixing them is what broke it:
//
//   users.id       usr_<uuid>   ours, permanent  -- what the client holds
//   clerkUserId    user_...     Clerk's          -- what the Clerk API accepts
//
// `targetUserId` was used as BOTH: passed to three Clerk calls AND compared to
// users.id in the mirror update. After the Phase 1 identity split no single
// value could be correct for both, so with the app id (what the UI sends) every
// Clerk call 404'd, and with the Clerk id the mirror update matched zero rows
// silently. `targetUserId` is now the APP id, asserted, and the Clerk id is
// looked up from the roster row. Guide 18b22.

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
        if (!isAppRole(role)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: `role must be one of: ${APP_ROLES.join(', ')}` }) };
        }
        // Refuse the wrong identity space LOUDLY rather than querying with it and
        // reporting "user not found", which is what a Clerk id would produce here
        // and which reads exactly like a legitimate 404.
        if (!isAppUserId(targetUserId)) {
            console.warn('user-role: targetUserId is not an app user id:', JSON.stringify(targetUserId));
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'targetUserId must be the Accelerep user id (usr_...), not the Clerk id.' }) };
        }

        // The roster row is the bridge between the two spaces. Org-scoped, so an
        // Admin of one tenant cannot name a row in another.
        const [target] = await db
            .select({ id: users.id, clerkUserId: users.clerkUserId, role: users.role, name: users.name, profile: users.profile })
            .from(users)
            .where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)));

        if (!target) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found in this organization.' }) };
        }
        // An invited row has no Clerk identity until acceptance, and Clerk is where
        // the role has to land to mean anything. Writing the mirror alone here would
        // reproduce the exact bug this endpoint exists to fix.
        if (!target.clerkUserId) {
            return {
                statusCode: 409, headers,
                body: JSON.stringify({ error: `${target.name || 'That user'} has not accepted their invitation yet, so their role cannot be changed. Re-send the invitation with the role you want.` }),
            };
        }
        const targetClerkId = target.clerkUserId;

        // An admin removing their own admin rights can lock the org out of its
        // own settings, so it has to be deliberate — done from another account.
        // Compared in CLERK space: `userId` comes from the JWT.
        if (targetClerkId === userId && role !== 'Admin') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'You cannot change your own role. Ask another Admin.' }) };
        }

        const { createClerkClient } = await import('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

        // Confirm the target is a member of THIS org before touching them —
        // Clerk user ids are global, so without this an admin of one tenant
        // could rewrite the role of a user in another.
        let isMember = false;
        try {
            const memberships = await clerk.users.getOrganizationMembershipList({ userId: targetClerkId });
            isMember = (memberships?.data || memberships || [])
                .some(m => (m.organization?.id || m.organizationId) === orgId);
        } catch (e) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (!isMember) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'That user is not a member of this organization.' }) };
        }

        const clerkUser = await clerk.users.getUser(targetClerkId);
        const priorRole = clerkUser.publicMetadata?.role || 'User';

        // Merge rather than replace — publicMetadata carries other keys (name).
        await clerk.users.updateUser(targetClerkId, {
            publicMetadata: { ...(clerkUser.publicMetadata || {}), role },
        });

        // Keep the mirror in step. Best-effort: Clerk is authoritative, so a
        // failure here is a stale roster row, not a failed permission change.
        //
        // `profile.userType` is written alongside the column because the blob held
        // its own copy of the role, frozen at row creation and never updated by any
        // role change. flatten() no longer reads it, but leaving a second stale
        // answer in the row is how the first one got believed.
        //
        // A drizzle UPDATE that matches nothing does NOT throw, so the try/catch
        // alone proved nothing. Count the rows.
        try {
            const touched = await db.update(users)
                .set({ role, profile: { ...(target.profile || {}), userType: role }, updatedAt: new Date() })
                .where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)))
                .returning({ id: users.id });
            if (touched.length !== 1) {
                console.warn('user-role: mirror update touched', touched.length, 'rows for', targetUserId,
                    '-- expected exactly 1. Clerk was updated; the roster row was not.');
            }
        } catch (e) {
            console.warn('user-role: mirror update failed for', targetUserId, e?.message);
        }

        const name = ((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim()
            || clerkUser.emailAddresses?.[0]?.emailAddress || targetUserId;

        await writeAudit(orgId, {
            action: 'user.role.changed',
            entityType: 'user',
            entityId: targetUserId,   // the app id — the permanent one
            entityName: name,
            detail: `Role ${priorRole} \u2192 ${role}`,
            userId,
            userName: await getCallerName(userId, orgId),
        });

        return {
            statusCode: 200, headers,
            body: JSON.stringify({
                ok: true, userId: targetUserId, clerkUserId: targetClerkId, role, priorRole,
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
