import { db } from '../../db/index.js';
import { dispatchScheduleBlocks } from '../../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, getCallerName } from './_lib.mjs';

// Technician availability exceptions — PTO, sick, training, jury duty and so on.
// The dispatch_schedule_blocks table was declared in schema.ts but had no
// endpoint at all, so it was unreachable. Recurring weekly availability lives
// separately on dispatch_technicians.workingHours; this table is only for dated
// exceptions to that pattern.
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function normalise(row) {
    return {
        id:        row.id,
        orgId:     row.orgId     ?? row.org_id,
        techId:    row.techId    ?? row.tech_id,
        blockType: row.blockType ?? row.block_type ?? 'pto',
        title:     row.title     ?? null,
        startDate: row.startDate ?? row.start_date,
        endDate:   row.endDate   ?? row.end_date,
        startTime: row.startTime ?? row.start_time ?? null,
        endTime:   row.endTime   ?? row.end_time   ?? null,
        allDay:    row.allDay    ?? row.all_day    ?? true,
        notes:     row.notes     ?? null,
        createdBy: row.createdBy ?? row.created_by ?? null,
        createdAt: row.createdAt ?? row.created_at,
        updatedAt: row.updatedAt ?? row.updated_at,
    };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId } = auth;

    // Role gate: ReadOnly may not mutate. Any other role may manage availability.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        // Optional ?techId= and ?from=/?to= (inclusive, 'YYYY-MM-DD'). Overlap is
        // computed as start <= to AND end >= from so a block spanning the window
        // is returned even when neither endpoint falls inside it.
        if (event.httpMethod === 'GET') {
            const params = event.queryStringParameters || {};
            const clauses = [eq(dispatchScheduleBlocks.orgId, orgId)];
            if (params.techId) clauses.push(eq(dispatchScheduleBlocks.techId, params.techId));
            if (params.to)     clauses.push(lte(dispatchScheduleBlocks.startDate, params.to));
            if (params.from)   clauses.push(gte(dispatchScheduleBlocks.endDate, params.from));

            const rows = await db.select().from(dispatchScheduleBlocks).where(and(...clauses));
            return { statusCode: 200, headers, body: JSON.stringify({ blocks: rows.map(normalise) }) };
        }

        // ── POST ──────────────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.techId)    return { statusCode: 400, headers, body: JSON.stringify({ error: 'techId required' }) };
            if (!data.startDate) return { statusCode: 400, headers, body: JSON.stringify({ error: 'startDate required' }) };

            const endDate = data.endDate || data.startDate;
            if (endDate < data.startDate) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'endDate cannot be before startDate' }) };
            }

            const row = {
                id:        data.id,
                orgId,
                techId:    data.techId,
                blockType: data.blockType ?? 'pto',
                title:     data.title     ?? null,
                startDate: data.startDate,
                endDate,
                // A partial-day block needs both ends; otherwise treat it as all-day.
                allDay:    data.allDay !== false && !(data.startTime && data.endTime),
                startTime: data.allDay === false ? (data.startTime ?? null) : null,
                endTime:   data.allDay === false ? (data.endTime   ?? null) : null,
                notes:     data.notes     ?? null,
                createdBy: await getCallerName(userId, orgId),
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await db.insert(dispatchScheduleBlocks).values(row)
                .onConflictDoUpdate({
                    target: dispatchScheduleBlocks.id,
                    setWhere: eq(dispatchScheduleBlocks.orgId, orgId),
                    set: { ...row, createdAt: undefined },
                });

            const [inserted] = await db.select().from(dispatchScheduleBlocks)
                .where(and(eq(dispatchScheduleBlocks.id, data.id), eq(dispatchScheduleBlocks.orgId, orgId)));

            return { statusCode: 201, headers, body: JSON.stringify({ block: normalise(inserted) }) };
        }

        // ── PUT ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const id = (event.queryStringParameters || {}).id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            const data = JSON.parse(event.body || '{}');
            const updates = { updatedAt: new Date() };
            // techId and createdBy are deliberately omitted — a block belongs to
            // the technician it was created for, and its author does not change.
            ['blockType', 'title', 'startDate', 'endDate', 'startTime', 'endTime', 'allDay', 'notes']
                .forEach(f => { if (f in data) updates[f] = data[f]; });

            if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'endDate cannot be before startDate' }) };
            }

            await db.update(dispatchScheduleBlocks).set(updates)
                .where(and(eq(dispatchScheduleBlocks.id, id), eq(dispatchScheduleBlocks.orgId, orgId)));

            const [updated] = await db.select().from(dispatchScheduleBlocks)
                .where(and(eq(dispatchScheduleBlocks.id, id), eq(dispatchScheduleBlocks.orgId, orgId)));

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ block: normalise(updated) }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        // Safe to hard-delete: nothing holds an FK to a schedule block.
        if (event.httpMethod === 'DELETE') {
            const id = (event.queryStringParameters || {}).id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            await db.delete(dispatchScheduleBlocks)
                .where(and(eq(dispatchScheduleBlocks.id, id), eq(dispatchScheduleBlocks.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-schedule-blocks error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-schedule-blocks') };
    }
};
