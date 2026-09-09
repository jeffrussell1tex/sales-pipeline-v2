import { db } from '../../db/index.js';
import { dispatchPlanVisits, dispatchCustomers } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, resolveCaller } from './_lib.mjs';
import { randomUUID } from 'crypto';
import { isYmd } from '../../src/utils/planVisits.js';

// What a dispatcher recorded about ONE service-plan occurrence (state §0.110):
//   skipped  — retired without a job (the customer declined, the unit was
//              replaced). It stops counting as due or missed.
//   deferred — keeps its place on the plan's grid but falls due on `deferredTo`.
// Visits themselves are computed (src/utils/planVisits.js); this table only
// holds the exceptions, one row per occurrence per customer per plan per org.
// A repeat POST for the same occurrence REPLACES the earlier record — deferring
// a skipped visit un-skips it, and vice versa — and DELETE undoes it entirely.
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const VISIT_ACTIONS = Object.freeze(['skipped', 'deferred']);

function normalise(row) {
    return {
        id:         row.id,
        orgId:      row.orgId      ?? row.org_id,
        customerId: row.customerId ?? row.customer_id,
        planId:     row.planId     ?? row.plan_id,
        dueDate:    row.dueDate    ?? row.due_date,
        action:     row.action,
        deferredTo: row.deferredTo ?? row.deferred_to ?? null,
        reason:     row.reason     ?? null,
        byUserId:   row.byUserId   ?? row.by_user_id  ?? null,
        byName:     row.byName     ?? row.by_name     ?? null,
        createdAt:  row.createdAt  ?? row.created_at,
    };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId } = auth;

    // Role gate: ReadOnly and Technician may not mutate. Any dispatcher may.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    const params = event.queryStringParameters || {};

    try {
        if (event.httpMethod === 'GET') {
            const clauses = [eq(dispatchPlanVisits.orgId, orgId)];
            if (params.customerId) clauses.push(eq(dispatchPlanVisits.customerId, params.customerId));
            const rows = await db.select().from(dispatchPlanVisits).where(and(...clauses));
            return { statusCode: 200, headers, body: JSON.stringify({ visits: rows.map(normalise) }) };
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.customerId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'customerId required' }) };
            if (!data.planId)     return { statusCode: 400, headers, body: JSON.stringify({ error: 'planId required' }) };
            if (!isYmd(data.dueDate)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'dueDate must be YYYY-MM-DD' }) };
            if (!VISIT_ACTIONS.includes(data.action)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: `action must be one of: ${VISIT_ACTIONS.join(', ')}` }) };
            }
            const deferredTo = data.action === 'deferred' ? data.deferredTo : null;
            if (data.action === 'deferred' && (!isYmd(deferredTo) || deferredTo === data.dueDate)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'deferredTo must be a YYYY-MM-DD date other than the due date' }) };
            }

            // The customer must be THIS org's. A customerId from another org is a
            // 404 here, never a row written under the caller's org against it.
            const [cust] = await db.select({ id: dispatchCustomers.id }).from(dispatchCustomers)
                .where(and(eq(dispatchCustomers.id, data.customerId), eq(dispatchCustomers.orgId, orgId)));
            if (!cust) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Customer not found' }) };

            const me = await resolveCaller(userId, orgId);
            const row = {
                id:         'pv_' + randomUUID(),
                orgId,
                customerId: data.customerId,
                planId:     data.planId,
                dueDate:    data.dueDate,
                action:     data.action,
                deferredTo,
                reason:     typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim().slice(0, 500) : null,
                byUserId:   me.id   || null,
                byName:     me.name || null,
                createdAt:  new Date(),
            };
            // One record per occurrence: a second decision about the same date
            // replaces the first (the id and created_at move with it).
            await db.insert(dispatchPlanVisits).values(row)
                .onConflictDoUpdate({
                    target: [dispatchPlanVisits.orgId, dispatchPlanVisits.customerId, dispatchPlanVisits.planId, dispatchPlanVisits.dueDate],
                    setWhere: eq(dispatchPlanVisits.orgId, orgId),   // the index carries org_id; the scanner's rule is stated anyway
                    set: { ...row },
                });
            const [saved] = await db.select().from(dispatchPlanVisits)
                .where(and(
                    eq(dispatchPlanVisits.orgId, orgId),
                    eq(dispatchPlanVisits.customerId, data.customerId),
                    eq(dispatchPlanVisits.planId, data.planId),
                    eq(dispatchPlanVisits.dueDate, data.dueDate),
                ));
            return { statusCode: 201, headers, body: JSON.stringify({ visit: normalise(saved) }) };
        }

        if (event.httpMethod === 'DELETE') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            const gone = await db.delete(dispatchPlanVisits)
                .where(and(eq(dispatchPlanVisits.id, id), eq(dispatchPlanVisits.orgId, orgId)))
                .returning({ id: dispatchPlanVisits.id });
            if (!gone.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('dispatch-plan-visits error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-plan-visits') };
    }
};
