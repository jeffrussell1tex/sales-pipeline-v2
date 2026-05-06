import { db }         from '../../db/index.js';
import { dsrQueue }   from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// GDPR SLA: 30 days from submission
const SLA_DAYS = 30;

const addDays = (date, n) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
};

// Only Admins may manage the DSR queue
const requireAdmin = (userRole) =>
    userRole !== 'Admin'
        ? { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Admin role required' }) }
        : null;

const sanitize = (d) => ({
    id:          d.id,
    subject:     d.subject  || null,
    type:        d.type     || 'access',
    status:      d.status   || 'in-progress',
    notes:       d.notes    || null,
    createdBy:   d.createdBy || null,
});

// Compute a human-readable SLA string from the deadline timestamp
const slaLabel = (deadline) => {
    if (!deadline) return '—';
    const now  = new Date();
    const d    = new Date(deadline);
    const days = Math.round((d - now) / 86400000);
    if (days < 0)  return 'Overdue';
    if (days === 0) return 'Due today';
    return `${days} day${days === 1 ? '' : 's'} remaining`;
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    try {
        // ── GET — list all DSR requests for this org ───────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db
                .select()
                .from(dsrQueue)
                .where(eq(dsrQueue.orgId, orgId))
                .orderBy(desc(dsrQueue.createdAt));

            // Annotate with SLA label for the UI
            const annotated = rows.map(r => ({
                ...r,
                slaLabel: slaLabel(r.slaDeadline),
            }));

            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ dsrQueue: annotated }) };
        }

        // All write methods are Admin-only
        const adminErr = requireAdmin(userRole);
        if (adminErr) return adminErr;

        // ── POST — create a new DSR request ───────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id)      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };
            if (!data.subject) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'subject is required' }) };
            if (!['access', 'erasure'].includes(data.type)) {
                return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'type must be access or erasure' }) };
            }

            const slaDeadline = addDays(new Date(), SLA_DAYS);

            const [inserted] = await db
                .insert(dsrQueue)
                .values({
                    ...sanitize(data),
                    orgId,
                    slaDeadline,
                    createdBy: userId,
                })
                .returning();

            return {
                statusCode: 201,
                headers: HEADERS,
                body: JSON.stringify({
                    dsr: { ...inserted, slaLabel: slaLabel(inserted.slaDeadline) },
                }),
            };
        }

        // ── PUT — update DSR status (e.g. mark completed) ─────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };

            const clean = sanitize(data);
            const { id, ...updateFields } = clean;

            // If marking completed, record the timestamp
            const completedAt = data.status === 'completed' ? new Date() : null;

            const [upserted] = await db
                .insert(dsrQueue)
                .values({ ...clean, orgId, slaDeadline: data.slaDeadline ? new Date(data.slaDeadline) : addDays(new Date(), SLA_DAYS) })
                .onConflictDoUpdate({
                    target: dsrQueue.id,
                    set: {
                        ...updateFields,
                        ...(completedAt ? { completedAt } : {}),
                        updatedAt: new Date(),
                    },
                })
                .returning();

            return {
                statusCode: 200,
                headers: HEADERS,
                body: JSON.stringify({
                    dsr: { ...upserted, slaLabel: slaLabel(upserted.slaDeadline) },
                }),
            };
        }

        // ── DELETE — remove a DSR record ──────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };

            await db
                .delete(dsrQueue)
                .where(and(eq(dsrQueue.id, id), eq(dsrQueue.orgId, orgId)));

            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('export-dsr error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
};
