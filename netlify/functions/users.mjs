import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, requireRole } from './auth.mjs';
import { auditLog } from '../../db/schema.js';
import { serverErrorBody } from './_lib.mjs';

const ADMIN_ROLES = ['Admin', 'Manager'];

const writeAudit = async (orgId, action, entityId, entityName, actorId, actorName) => {
    try {
        await db.insert(auditLog).values({
            id:         'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            orgId,
            action,
            entityType: 'user',
            entityId:   String(entityId || ''),
            entityName: entityName || null,
            userId:     actorId    || null,
            userName:   actorName  || null,
            timestamp:  new Date(),
        });
    } catch (e) { console.warn('writeAudit error:', e.message); }
};


export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }

    const { userId, orgId, userRole } = auth;

    // ── Helpers (hoisted above all early-exit handlers so they're available everywhere) ──

    const sanitize = (data) => ({
        id:           data.id,
        name:         ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || data.name || 'Unnamed User',
        // email is notNull + unique in schema — use a unique placeholder if not provided
        email:        (data.email && data.email.trim()) ? data.email.trim() : `${data.id}@placeholder.local`,
        role:         data.userType || data.role || 'User',
        team:         data.team     || null,
        territory:    data.territory || null,
        quota:        (data.quota !== null && data.quota !== undefined && data.quota !== '') ? parseFloat(data.quota) : null,
        active:       data.active   ?? true,
        // Store the full profile as jsonb for fields not in dedicated columns
        profile: {
            prefix:        data.prefix        || null,
            firstName:     data.firstName     || null,
            middleName:    data.middleName     || null,
            lastName:      data.lastName      || null,
            suffix:        data.suffix        || null,
            nickName:      data.nickName      || null,
            title:         data.title         || null,
            company:       data.company       || null,
            department:    data.department    || null,
            workLocation:  data.workLocation  || null,
            personalEmail: data.personalEmail || null,
            phone:         data.phone         || null,
            mobile:        data.mobile        || null,
            address:       data.address       || null,
            city:          data.city          || null,
            state:         data.state         || null,
            zip:           data.zip           || null,
            country:       data.country       || null,
            notes:         data.notes         || null,
            vertical:      data.vertical      || null,
            teamId:        data.teamId        || null,
            manager:       data.manager       || null,
            userType:      data.userType      || 'User',
            notificationPrefs: data.notificationPrefs || null,
            digestTime:    data.digestTime    || '08:00',
            smsNotifications: data.smsNotifications || null,
            timezone:         data.timezone         || null,
            status:           data.status            || null,
            // Quota fields — stored in profile jsonb so they survive DB round-trips
            annualQuota:   data.annualQuota   ?? null,
            q1Quota:       data.q1Quota       ?? null,
            q2Quota:       data.q2Quota       ?? null,
            q3Quota:       data.q3Quota       ?? null,
            q4Quota:       data.q4Quota       ?? null,
            quotaType:     data.quotaType     || null,
        },
    });

    // Flatten a DB row back into the shape the frontend expects
    const flatten = (row) => ({
        id:            row.id,
        name:          row.name,
        // Don't expose placeholder emails to the frontend
        email:         (row.email && row.email.endsWith('@placeholder.local')) ? '' : (row.email || ''),
        userType:      row.role,
        role:          row.role,
        team:          row.team,
        territory:     row.territory,
        quota:         row.quota,
        active:        row.active,
        ...(row.profile || {}),
    });

    // ── GET ?me=true — any authenticated user can fetch their own record ──────
    // Lookup order:
    //   1. Direct id match (id col = real Clerk userId)
    //   2. Email match (covers invite flow where DB row has pending_ id)
    //   3. Display name match (legacy fallback for manually created rows)
    // When a match is found via email or name and the id differs (pending_ row),
    // the row's id is updated to the real Clerk userId so future lookups are direct.
    if (event.httpMethod === 'GET' && event.queryStringParameters?.me === 'true') {
        try {
            // 1. Direct id lookup
            let [row] = await db.select().from(users).where(eq(users.id, userId));

            if (!row) {
                const { createClerkClient } = await import('@clerk/backend');
                const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
                const clerkUser = await clerk.users.getUser(userId);
                const clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress?.toLowerCase() || '';
                const displayName = ((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim();

                // 2. Email match — catches invited users whose DB row has a pending_ id
                if (clerkEmail) {
                    [row] = await db.select().from(users).where(
                        and(eq(users.email, clerkEmail), eq(users.orgId, orgId))
                    );
                }

                // 3. Display name fallback
                if (!row && displayName) {
                    [row] = await db.select().from(users).where(
                        and(eq(users.name, displayName), eq(users.orgId, orgId))
                    );
                }

                // If we found a row via email/name but id doesn't match (pending_ or old placeholder),
                // update id AND pull real name/role/active from Clerk so the row is fully promoted.
                if (row && row.id !== userId) {
                    const realName = displayName || row.name;
                    const realRole = clerkUser.publicMetadata?.role || row.role || 'User';
                    try {
                        await db.update(users)
                            .set({
                                id:        userId,
                                name:      realName,
                                role:      realRole,
                                active:    true,
                                profile:   { ...(row.profile || {}), status: 'Active', userType: realRole },
                                updatedAt: new Date(),
                            })
                            .where(and(eq(users.id, row.id), eq(users.orgId, orgId)));
                        row = { ...row, id: userId, name: realName, role: realRole, active: true };
                        console.log(`users.mjs: reconciled pending_ → ${userId} (${realName}) for ${clerkEmail}`);
                    } catch (reconcileErr) {
                        console.warn('users.mjs: reconcile update failed:', reconcileErr.message);
                    }
                }
            }

            return { statusCode: 200, headers, body: JSON.stringify({ user: row ? flatten(row) : null }) };
        } catch (err) {
            console.error('Users /me GET error:', err.message);
            return { statusCode: 500, headers, body: serverErrorBody(err, 'users') };
        }
    }

    // ── PUT ?me=true — any authenticated user can update their own profile/prefs ──
    if (event.httpMethod === 'PUT' && event.queryStringParameters?.me === 'true') {
        try {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            // Security: only allow a user to update their own row
            if (data.id !== userId) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: cannot update another user\'s profile' }) };
            }
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            let upsertResult;
            try {
                // Include orgId so the row is properly scoped to this tenant
                const [ins] = await db.insert(users).values({ ...clean, orgId }).returning();
                upsertResult = ins;
            } catch {
                const [upd] = await db
                    .update(users)
                    .set({ ...updateData, updatedAt: new Date() })
                    .where(and(eq(users.id, data.id), eq(users.orgId, orgId)))
                    .returning();
                upsertResult = upd;
            }
            return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(upsertResult) }) };
        } catch (err) {
            console.error('Users /me PUT error:', err.message);
            return { statusCode: 500, headers, body: serverErrorBody(err, 'users') };
        }
    }

    // Only Admins and Managers can access the full user list
    if (!ADMIN_ROLES.includes(userRole)) {
        console.warn('users.mjs: forbidden role', userRole);
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) };
    }

    console.log('users.mjs: userRole =', userRole, '| method =', event.httpMethod);

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(users).where(eq(users.orgId, orgId)).orderBy(asc(users.name));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ users: rows.map(flatten) }),
            };
        }

        // ── Upsert helper — returns the saved row, throws on email conflict ────
        const upsertUser = async (clean) => {
            const { id, ...updateData } = clean;
            try {
                const [row] = await db
                    .insert(users)
                    .values({ ...clean, orgId })
                    .onConflictDoUpdate({
                        target: users.id, setWhere: eq(users.orgId, orgId),
                        set: { ...updateData, updatedAt: new Date() },
                    })
                    .returning();
                return row;
            } catch (err) {
                // Postgres unique_violation = code 23505
                // The Neon serverless driver may surface the constraint info in
                // err.message, err.detail, err.constraint, or err.cause — check all.
                const errStr = [err.message, err.detail, err.constraint, err.cause?.message]
                    .filter(Boolean).join(' ').toLowerCase();
                const isUniqueViolation = err.code === '23505' || errStr.includes('unique');
                const isEmailField = errStr.includes('email');
                if (isUniqueViolation && isEmailField) {
                    const dupErr = new Error('A user with that email address already exists. Please use a different email.');
                    dupErr.code = 'EMAIL_DUPLICATE';
                    throw dupErr;
                }
                throw err;
            }
        };

        // ── POST (create) ─────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');

            // ── Invite flow ───────────────────────────────────────────────────
            if (data.action === 'invite') {
                const invites = Array.isArray(data.invites) ? data.invites : [];
                if (invites.length === 0) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No invites provided' }) };
                }

                // Initialise Clerk backend client once for this batch
                const { createClerkClient } = await import('@clerk/backend');
                const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

                // Redirect URL — where Clerk sends the invitee after they accept.
                // Netlify sets URL to the site's primary domain in production.
                const appUrl = process.env.URL || process.env.DEPLOY_URL || 'https://salespipelinetracker.com';

                // Fetch this ORG's pending invitations once for the batch. Clerk rejects
                // a duplicate invitation outright, so a RE-invite must revoke the old one
                // first — that is what makes “Resend” actually send a fresh email.
                // NOTE: these are ORGANIZATION invitations (membership in this org on
                // acceptance), not application invitations — app-level invites create an
                // account with NO org, which strands invitees on Clerk's
                // “Setup your organization” screen.
                let pendingInvitations = [];
                try {
                    const list = await clerk.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'], limit: 500 });
                    pendingInvitations = list?.data || (Array.isArray(list) ? list : []);
                } catch (e) {
                    console.warn('users.mjs: could not list pending org invitations:', e.message);
                }

                const results = [];
                const errors  = [];

                for (const invite of invites) {
                    const email = (invite.email || '').trim().toLowerCase();
                    if (!email) { errors.push({ email: '', error: 'Email required' }); continue; }

                    try {
                        // 1. Revoke any existing pending invitation for this email so the
                        //    re-create below succeeds and sends a brand-new magic link.
                        const existingInv = pendingInvitations.find(
                            (inv) => (inv.emailAddress || inv.email_address || '').toLowerCase() === email
                        );
                        if (existingInv) {
                            try { await clerk.organizations.revokeOrganizationInvitation({ organizationId: orgId, invitationId: existingInv.id, requestingUserId: userId }); }
                            catch (revErr) { console.warn(`users.mjs: revoke failed for ${email}:`, revErr.message); }
                        }

                        // 2. Create an ORGANIZATION invitation — Clerk emails a magic link,
                        //    and acceptance adds the user to THIS org (existing accounts
                        //    included), so they land in UKG instead of being asked to
                        //    create their own organization. App-specific role/team live in
                        //    the users table; the Clerk org role only needs membership
                        //    (admins get org:admin so they can manage members).
                        await clerk.organizations.createOrganizationInvitation({
                            organizationId: orgId,
                            inviterUserId:  userId,
                            emailAddress:   email,
                            role:           (invite.role === 'Admin') ? 'org:admin' : 'org:member',
                            redirectUrl:    appUrl,
                            publicMetadata: {
                                role:      invite.role      || 'User',
                                team:      invite.team      || null,
                                territory: invite.territory || null,
                            },
                        });

                        // 3. DB row. If this email already has a row (a migrated user or a
                        //    prior pending_ invite), KEEP it — merge status into the existing
                        //    profile rather than inserting a duplicate (which would violate
                        //    the unique-email constraint and clobber quotas/profile data).
                        const [existingRow] = await db
                            .select()
                            .from(users)
                            .where(and(eq(users.email, email), eq(users.orgId, orgId)));

                        if (existingRow) {
                            const mergedProfile = { ...(existingRow.profile || {}), status: 'Invited' };
                            const [row] = await db
                                .update(users)
                                .set({ profile: mergedProfile, updatedAt: new Date() })
                                .where(and(eq(users.id, existingRow.id), eq(users.orgId, orgId)))
                                .returning();
                            results.push(flatten(row || existingRow));
                        } else {
                            const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            const row = await upsertUser(sanitize({
                                id:        pendingId,
                                email,
                                name:      email.split('@')[0],
                                userType:  invite.role      || 'User',
                                team:      invite.team      || null,
                                territory: invite.territory || null,
                                active:    false,
                                status:    'Invited',
                            }));
                            results.push(flatten(row));
                        }

                    } catch (err) {
                        // Clerk throws if the email already belongs to a signed-up member
                        // (no invitation needed) — surface that message per-email.
                        const clerkMsg = err?.errors?.[0]?.message || err.message || 'Invite failed';
                        errors.push({ email, error: clerkMsg });
                    }
                }

                return {
                    statusCode: errors.length === invites.length ? 400 : 201,
                    headers,
                    body: JSON.stringify({ invited: results, errors }),
                };
            }
            // ── Single user create ────────────────────────────────────────────
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            try {
                const result = await upsertUser(sanitize(data));
                if (!result) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Insert returned no row' }) };
                }
                await writeAudit(orgId, 'user.created', result.id, result.name, userId, result.name);
                return { statusCode: 201, headers, body: JSON.stringify({ user: flatten(result) }) };
            } catch (err) {
                if (err.code === 'EMAIL_DUPLICATE') {
                    return { statusCode: 409, headers, body: JSON.stringify({ error: err.message, field: 'email' }) };
                }
                throw err;
            }
        }

        // ── PUT (update) ──────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            try {
                const result = await upsertUser(sanitize(data));
                if (!result) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update returned no row' }) };
                }
                await writeAudit(orgId, 'user.updated', result.id, result.name, userId, result.name);
                return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(result) }) };
            } catch (err) {
                if (err.code === 'EMAIL_DUPLICATE') {
                    return { statusCode: 409, headers, body: JSON.stringify({ error: err.message, field: 'email' }) };
                }
                throw err;
            }
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            // clear=true — delete all users for this org (used by Clear All Data).
            // Admin only: the method-level ADMIN_ROLES gate above also admits
            // Managers, but wiping every user is destructive enough to require
            // full Admin. Writes an audit row + returns the deleted count.
            if (event.queryStringParameters?.clear === 'true') {
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                const deleted = await db.delete(users).where(eq(users.orgId, orgId)).returning({ id: users.id });
                await writeAudit(orgId, 'user.cleared', 'ALL', `All users (${deleted.length})`, userId, null);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [deletedRow] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
            await db.delete(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
            await writeAudit(orgId, 'user.deleted', id, deletedRow?.name || id, userId, deletedRow?.name || id);
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Users function error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'users') };
    }
};
