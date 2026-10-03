import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireRole, isAppRole, APP_ROLES } from './auth.mjs';
import { isAppUserId } from './_ownership.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';

// Change a user's role IN THIS ORG.
//
// The role is the one on the person's row in this org's roster: auth.mjs reads
// it on every request (state §0.163, guide §18b56). It used to be Clerk's
// USER-level publicMetadata.role — one value for every org a person belongs to
// — and this endpoint wrote it there, so an Admin of one org changed a person's
// role in every org they were in: Ryan's mistaken Read only, set in QA, reached
// Accelerep Test and Accelerep (§0.153). Clerk is no longer written. The row is
// the role, and this is the one path that changes an existing row's role.
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

        // The roster row IS the role. Org-scoped, so an Admin of one tenant
        // cannot name a row in another.
        const [target] = await db
            .select({ id: users.id, clerkUserId: users.clerkUserId, role: users.role, name: users.name, profile: users.profile })
            .from(users)
            .where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)));

        if (!target) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found in this organization.' }) };
        }

        // An admin removing their own admin rights can lock the org out of its
        // own settings, so it has to be deliberate — done from another account.
        // Compared in CLERK space: `userId` comes from the JWT. An invited row
        // (no Clerk identity yet) is never the caller.
        if (target.clerkUserId && target.clerkUserId === userId && role !== 'Admin') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'You cannot change your own role. Ask another Admin.' }) };
        }

        // A linked row: confirm its person is still a member of THIS org before
        // changing what they may do in it. An invited row has no Clerk identity
        // yet — its role is the one they will hold when they accept, linked by
        // the invited email (users.mjs ?me=true), so it may be set now.
        if (target.clerkUserId) {
            const { createClerkClient } = await import('@clerk/backend');
            const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
            let isMember = false;
            try {
                const memberships = await clerk.users.getOrganizationMembershipList({ userId: target.clerkUserId });
                isMember = (memberships?.data || memberships || [])
                    .some(m => (m.organization?.id || m.organizationId) === orgId);
            } catch (e) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found.' }) };
            }
            if (!isMember) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'That user is not a member of this organization.' }) };
            }
        }

        const priorRole = target.role || 'User';

        // `profile.userType` is written alongside the column because the blob held
        // its own copy of the role, frozen at row creation and never updated by any
        // role change. flatten() no longer reads it, but leaving a second stale
        // answer in the row is how the first one got believed.
        //
        // A drizzle UPDATE that matches nothing does NOT throw, so count the rows:
        // this write is the role change itself, not a mirror of one.
        const touched = await db.update(users)
            .set({ role, profile: { ...(target.profile || {}), userType: role }, updatedAt: new Date() })
            .where(and(eq(users.id, targetUserId), eq(users.orgId, orgId)))
            .returning({ id: users.id });
        if (touched.length !== 1) {
            console.warn('user-role: the update touched', touched.length, 'rows for', targetUserId, '-- expected exactly 1');
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'The role was not saved. Try again.' }) };
        }

        const name = target.name || targetUserId;

        await writeAudit(orgId, {
            action: 'user.role.changed',
            entityType: 'user',
            entityId: targetUserId,   // the app id — the permanent one
            entityName: name,
            detail: `Role ${priorRole} → ${role}`,
            userId,
            userName: await getCallerName(userId, orgId),
        });

        return {
            statusCode: 200, headers,
            body: JSON.stringify({
                ok: true, userId: targetUserId, clerkUserId: target.clerkUserId, role, priorRole,
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
