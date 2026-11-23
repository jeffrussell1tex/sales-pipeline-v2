import { db } from '../../db/index.js';
import { dispatchScheduleBlocks } from '../../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { dispatchGate } from './_dispatchGate.mjs';
import { serverErrorBody, getCallerName, auditAs } from './_lib.mjs';
import { resolveTechnicianId } from './_techScope.mjs';
import { checkLinks } from './_links.mjs';

// A block's technician: a live technician of this org when a write names one anew (state §0.201).
const BLOCK_LINKS = [{ key: 'techId', kind: 'technician' }];

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

// A create's id this org holds already (state §0.291): an earlier press of the same create landed (its form keeps the id after
// an answer that proved nothing, §0.263), or two pressed at once — 409 code 'idInUse' with the block as stored, for the
// screen to take; nothing written. It was an upsert of the whole row: a shorter absence, its type, its notes
// set in between by another member was written over. null when this org holds none — another org's id is the words alone.
// Its callers await it: a failed read is the handler's 500, never an answer with no row.
async function heldBlock(orgId, id) {
    const [held] = await db.select().from(dispatchScheduleBlocks).where(and(eq(dispatchScheduleBlocks.id, id), eq(dispatchScheduleBlocks.orgId, orgId)));
    return held ? { statusCode: 409, headers, body: JSON.stringify({ error: 'That block id is already in use.', code: 'idInUse', block: normalise(held) }) } : null;
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId } = auth;

    // The one Dispatch gate (§0.152, guide §18b46): the module switch, then the
    // role — a sales rep only where the org lets reps use Dispatch; ReadOnly and a
    // Technician read. It replaces the write-only role gate (which let any rep write).
    const gate = await dispatchGate(auth, event, headers);
    if (gate.response) return gate.response;

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        // Optional ?techId= and ?from=/?to= (inclusive, 'YYYY-MM-DD'). Overlap is
        // computed as start <= to AND end >= from so a block spanning the window
        // is returned even when neither endpoint falls inside it.
        if (event.httpMethod === 'GET') {
            const params = event.queryStringParameters || {};
            const clauses = [eq(dispatchScheduleBlocks.orgId, orgId)];
            // A Technician reads their own time off and no one else's (state §0.169)
            // — every technician's blocks, reasons included, were theirs to read.
            // With no technician row linked to them there is nothing of theirs.
            if (gate.access === 'tech') {
                const myTechId = await resolveTechnicianId(orgId, userId);
                if (!myTechId) return { statusCode: 403, headers, body: JSON.stringify({ error: 'No technician record is linked to your account.' }) };
                clauses.push(eq(dispatchScheduleBlocks.techId, myTechId));
            }
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
            // A create only (state §0.291): an id this org holds is answered with its row before any link is asked.
            const landed = await heldBlock(orgId, data.id);
            if (landed) return landed;
            const linked = await checkLinks(BLOCK_LINKS, data, null, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };

            // A partial-day block needs both ends; otherwise it is all day — the dialog keeps times typed before "All day" was
            // ticked again, and such a block was stored partial with no hours: it blocked nothing (§0.291's review).
            const partial = data.allDay === false && !!(data.startTime && data.endTime);
            const row = {
                id:        data.id,
                orgId,
                techId:    data.techId,
                blockType: data.blockType ?? 'pto',
                title:     data.title     ?? null,
                startDate: data.startDate,
                endDate,
                allDay:    !partial,
                startTime: partial ? data.startTime : null,
                endTime:   partial ? data.endTime : null,
                notes:     data.notes     ?? null,
                createdBy: await getCallerName(userId, orgId),
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Answered from its own write (state §0.268): a read after it could fail with the write landed, a 500 over a save that
            // took (census-D §2C).
            const [inserted] = await db.insert(dispatchScheduleBlocks).values(row).onConflictDoNothing({ target: dispatchScheduleBlocks.id }).returning();
            // Nothing written: the same create landed beside this one, or another org holds the id — the words alone (state §0.166).
            if (!inserted) {
                const beside = await heldBlock(orgId, data.id);
                if (beside) return beside;
            }
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That block id is already in use.' }) };

            await auditAs(orgId, userId, { action: 'dispatch_block.created', entityType: 'dispatch_block', entityId: inserted.id, entityName: inserted.title || inserted.blockType, detail: `${inserted.blockType} · ${inserted.startDate}${inserted.endDate && inserted.endDate !== inserted.startDate ? ' → ' + inserted.endDate : ''}${inserted.allDay ? ' · all day' : ''}` });
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

            // Answered from its own write (state §0.268): a read after it could fail with the write landed, a 500 over a save that
            // took (census-D §2C).
            const [updated] = await db.update(dispatchScheduleBlocks).set(updates)
                .where(and(eq(dispatchScheduleBlocks.id, id), eq(dispatchScheduleBlocks.orgId, orgId))).returning();

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await auditAs(orgId, userId, { action: 'dispatch_block.updated', entityType: 'dispatch_block', entityId: updated.id, entityName: updated.title || updated.blockType, detail: `${updated.blockType} · ${updated.startDate}${updated.endDate && updated.endDate !== updated.startDate ? ' → ' + updated.endDate : ''}` });
            return { statusCode: 200, headers, body: JSON.stringify({ block: normalise(updated) }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        // Safe to hard-delete: nothing holds an FK to a schedule block.
        if (event.httpMethod === 'DELETE') {
            const id = (event.queryStringParameters || {}).id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            const [gone] = await db.delete(dispatchScheduleBlocks)
                .where(and(eq(dispatchScheduleBlocks.id, id), eq(dispatchScheduleBlocks.orgId, orgId)))
                .returning({ id: dispatchScheduleBlocks.id, title: dispatchScheduleBlocks.title, blockType: dispatchScheduleBlocks.blockType, startDate: dispatchScheduleBlocks.startDate });
            if (gone) await auditAs(orgId, userId, { action: 'dispatch_block.deleted', entityType: 'dispatch_block', entityId: gone.id, entityName: gone.title || gone.blockType, detail: `${gone.blockType} · ${gone.startDate}` });
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-schedule-blocks error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-schedule-blocks') };
    }
};
