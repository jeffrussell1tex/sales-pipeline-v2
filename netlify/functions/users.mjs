import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
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

    const { userId, userRole } = auth;

    // GET ?me=true — any authenticated user can fetch their own record
    if (event.httpMethod === 'GET' && event.queryStringParameters?.me === 'true') {
        try {
            const { createClerkClient } = await import('@clerk/backend');
            const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
            const clerkUser = await clerk.users.getUser(userId);
            const displayName = ((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim()
                || clerkUser.emailAddresses?.[0]?.emailAddress || '';
            const [row] = await db.select().from(users).where(eq(users.name, displayName));
            if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(row) }) };
        } catch (err) {
            console.error('Users /me error:', err.message);
            return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
        }
    }

    // PUT ?me=true — any authenticated user can update their own profile/prefs
    if (event.httpMethod === 'PUT' && event.queryStringParameters?.me === 'true') {
        try {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [updated] = await db
                .insert(users).values(clean)
                .onConflictDoUpdate({ target: users.id, set: { ...updateData, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ user: flatten(updated) }) };
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

    const sanitize = (data) => ({
        id:           data.id,
        name:         ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || data.name || '',
        email:        data.email || '',
        role:         data.userType || data.role || 'User',
        team:         data.team     || null,
        territory:    data.territory || null,
        quota:        data.quota    ?? null,
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
        },
    });

    // Flatten a DB row back into the shape the frontend expects
    const flatten = (row) => ({
        id:            row.id,
        name:          row.name,
        email:         row.email,
        userType:      row.role,
        role:          row.role,
        team:          row.team,
        territory:     row.territory,
        quota:         row.quota,
        active:        row.active,
        ...(row.profile || {}),
    });

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(users).orderBy(asc(users.name));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ users: rows.map(flatten) }),
            };
        }

        // ── POST (create) ─────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            if (!data.email) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'email is required' }) };
            }
            const clean = sanitize(data);
            const [inserted] = await db.insert(users).values(clean).returning();
            return {
                statusCode: 201,
                headers,
                body: JSON.stringify({ user: flatten(inserted) }),
            };
        }

        // ── PUT (update) ──────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [updated] = await db
                .insert(users)
                .values(clean)
                .onConflictDoUpdate({
                    target: users.id,
                    set: { ...updateData, updatedAt: new Date() },
                })
                .returning();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ user: flatten(updated) }),
            };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            await db.delete(users).where(eq(users.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Users function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
