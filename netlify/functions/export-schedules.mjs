import { db }              from '../../db/index.js';
import { exportSchedules } from '../../db/schema.js';
import { eq, and, desc }   from 'drizzle-orm';
import { verifyAuth }      from './auth.mjs';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Only Admin users may manage export schedules.
const requireAdmin = (userRole) =>
    userRole !== 'Admin'
        ? { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Admin role required' }) }
        : null;

const sanitize = (d) => ({
    id:          d.id,
    name:        d.name        || null,
    scope:       d.scope       || null,
    cadence:     d.cadence     || null,
    destination: d.destination || 'download',
    format:      d.format      || 'CSV',
    enabled:     d.enabled     ?? true,
    status:      d.status      || 'ok',
    lastError:   d.lastError   || null,
    createdBy:   d.createdBy   || null,
});

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    try {
        // ── GET — list all schedules for this org ──────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db
                .select()
                .from(exportSchedules)
                .where(eq(exportSchedules.orgId, orgId))
                .orderBy(desc(exportSchedules.createdAt));
            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ schedules: rows }) };
        }

        // All write methods are Admin-only
        const adminErr = requireAdmin(userRole);
        if (adminErr) return adminErr;

        // ── POST — create a new schedule ───────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id)   return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };
            if (!data.name) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'name is required' }) };
            if (!data.scope) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'scope is required' }) };

            const [inserted] = await db
                .insert(exportSchedules)
                .values({ ...sanitize(data), orgId, createdBy: userId })
                .returning();
            return { statusCode: 201, headers: HEADERS, body: JSON.stringify({ schedule: inserted }) };
        }

        // ── PUT — update / toggle schedule ────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };

            const clean = sanitize(data);
            const { id, ...updateFields } = clean;

            const [upserted] = await db
                .insert(exportSchedules)
                .values({ ...clean, orgId })
                .onConflictDoUpdate({
                    target: exportSchedules.id,
                    set: { ...updateFields, updatedAt: new Date() },
                })
                .returning();
            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ schedule: upserted }) };
        }

        // ── DELETE — remove a schedule ────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };

            await db
                .delete(exportSchedules)
                .where(and(eq(exportSchedules.id, id), eq(exportSchedules.orgId, orgId)));
            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('export-schedules error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
};
