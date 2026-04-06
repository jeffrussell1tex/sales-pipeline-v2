import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const ADMIN_ROLES = ['Admin', 'Manager'];

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
            userType:      data.userType      || 'User',
            notificationPrefs: data.notificationPrefs || null,
            digestTime:    data.digestTime    || '08:00',
            smsNotifications: data.smsNotifications || null,
            timezone:         data.timezone         || null,
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
                // update the id to the real Clerk userId so future lookups hit path 1.
                if (row && row.id !== userId) {
                    try {
                        await db.update(users)
                            .set({ id: userId, updatedAt: new Date() })
                            .where(eq(users.id, row.id));
                        row = { ...row, id: userId };
                        console.log(`users.mjs: reconciled row → ${userId} for ${clerkEmail}`);
                    } catch (reconcileErr) {
                        console.warn('users.mjs: reconcile update failed:', reconcileErr.message);
                    }
                }
            }

            return { statusCode: 200, headers, body: JSON.stringify({ user: row ? flatten(row) : null }) };
        } catch (err) {
            console.error('Users /me GET error:', err.message);
            return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
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
            return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
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
                        target: users.id,
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
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            try {
                const result = await upsertUser(sanitize(data));
                if (!result) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Insert returned no row' }) };
                }
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
            // clear=true — delete all users for this org (used by Clear All Data)
            if (event.queryStringParameters?.clear === 'true') {
                await db.delete(users).where(eq(users.orgId, orgId));
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            await db.delete(users).where(and(eq(users.id, id), eq(users.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Users function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
