import { db }         from '../../db/index.js';
import { dsrQueue }   from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';

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

    // The GDPR request queue is an Admin's, its read too (state §0.169): every
    // role could list each request — whose data, access or erasure, its notes.
    // It sits on the Export page, in Settings, the Admin's.
    const adminErr = requireAdmin(userRole);
    if (adminErr) return adminErr;

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
            await auditAs(orgId, userId, { action: 'dsr.created', entityType: 'dsr', entityId: inserted.id, entityName: inserted.subject, detail: `${inserted.type} · due ${slaLabel(inserted.slaDeadline)}` });

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

            // The request as stored, in this org (state §0.242, guide §18b125 rule 1): a save names what it changes, and
            // a field it leaves out keeps its value — merged over the stored row, written as an update. It was an upsert
            // of the body alone: a status change ({ id, status }) wrote the subject as none (a NOT NULL 500) and the
            // notes and author as none; an id this org does not hold made a request, its SLA counted from that save.
            // Now that is a 404, nothing written. Who made it is the stored one (rule 2); the SLA deadline is the one
            // the create set, never counted again.
            const [existing] = await db.select().from(dsrQueue)
                .where(and(eq(dsrQueue.id, String(data.id)), eq(dsrQueue.orgId, orgId))).limit(1);
            if (!existing) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Request not found' }) };
            const { id: _id, ...updateFields } = sanitize({ ...existing, ...data, createdBy: existing.createdBy });

            // When it was completed: stamped as the request moves into 'completed', cleared as it moves out of it, and
            // otherwise the stored one.
            const wasDone = existing.status === 'completed';
            const isDone = updateFields.status === 'completed';
            const completed = isDone && !wasDone ? { completedAt: new Date() } : wasDone && !isDone ? { completedAt: null } : {};

            const [updated] = await db.update(dsrQueue)
                .set({ ...updateFields, ...completed, updatedAt: new Date() })
                .where(and(eq(dsrQueue.id, existing.id), eq(dsrQueue.orgId, orgId)))
                .returning();
            if (!updated) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Request not found' }) };
            await auditAs(orgId, userId, { action: 'dsr.updated', entityType: 'dsr', entityId: updated.id, entityName: updated.subject, detail: `${updated.type} · ${updated.status || 'open'}` });

            return {
                statusCode: 200,
                headers: HEADERS,
                body: JSON.stringify({
                    dsr: { ...updated, slaLabel: slaLabel(updated.slaDeadline) },
                }),
            };
        }

        // ── DELETE — remove a DSR record ──────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };

            const [gone] = await db
                .delete(dsrQueue)
                .where(and(eq(dsrQueue.id, id), eq(dsrQueue.orgId, orgId)))
                .returning({ id: dsrQueue.id, subject: dsrQueue.subject, type: dsrQueue.type });
            if (gone) await auditAs(orgId, userId, { action: 'dsr.deleted', entityType: 'dsr', entityId: gone.id, entityName: gone.subject, detail: gone.type });

            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('export-dsr error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: serverErrorBody(err, 'export-dsr') };
    }
};
