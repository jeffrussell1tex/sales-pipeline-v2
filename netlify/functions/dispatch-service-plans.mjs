import { db } from '../../db/index.js';
import { dispatchServicePlans, dispatchCustomers } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Named cadences derive intervalDays on write so recurrence scheduling reads one
// field instead of branching on cadence everywhere. 'custom' keeps whatever the
// caller supplied.
const CADENCE_DAYS = {
    monthly:    30,
    quarterly:  91,
    semiannual: 182,
    annual:     365,
};

const CADENCE_VISITS = {
    monthly:    12,
    quarterly:  4,
    semiannual: 2,
    annual:     1,
};

// intervalDays and visitsPerYear must never contradict each other: recurrence
// scheduling reads the interval, while people read the visit count, and a plan
// saying "quarterly, 6 visits a year" would schedule 4 and promise 6.
//
// So exactly ONE field is authoritative and the other is computed from it:
//   named cadence -> interval from the table, visits from the table
//   'custom'      -> interval is the input, visits = round(365 / interval)
// A supplied visitsPerYear is therefore ignored, not merged.
const deriveInterval = (cadence, suppliedInterval) => {
    if (cadence === 'custom') {
        const n = parseInt(suppliedInterval, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    return CADENCE_DAYS[cadence] ?? null;
};

const deriveVisits = (cadence, intervalDays) => {
    if (cadence === 'custom') {
        const n = parseInt(intervalDays, 10);
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.max(1, Math.round(365 / n));
    }
    return CADENCE_VISITS[cadence] ?? null;
};

function normalise(row) {
    return {
        id:              row.id,
        orgId:           row.orgId           ?? row.org_id,
        name:            row.name            ?? '',
        description:     row.description     ?? null,
        cadence:         row.cadence         ?? 'annual',
        intervalDays:    row.intervalDays    ?? row.interval_days     ?? null,
        visitsPerYear:   row.visitsPerYear   ?? row.visits_per_year   ?? null,
        visitTemplateId: row.visitTemplateId ?? row.visit_template_id ?? null,
        coveredJobTypes: row.coveredJobTypes ?? row.covered_job_types ?? [],
        includedHours:   row.includedHours   ?? row.included_hours    ?? null,
        responseHours:   row.responseHours   ?? row.response_hours    ?? null,
        discountPercent: row.discountPercent ?? row.discount_percent  ?? null,
        price:           row.price           ?? null,
        billingPeriod:   row.billingPeriod   ?? row.billing_period    ?? 'annual',
        active:          row.active ?? true,
        notes:           row.notes           ?? null,
        createdAt:       row.createdAt       ?? row.created_at,
        updatedAt:       row.updatedAt       ?? row.updated_at,
    };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    const params = event.queryStringParameters || {};

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(dispatchServicePlans)
                .where(eq(dispatchServicePlans.orgId, orgId));
            return { statusCode: 200, headers, body: JSON.stringify({ plans: rows.map(normalise) }) };
        }

        // ── POST: create (upsert on id, so a seeded import is idempotent) ─────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)   return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };

            const cadence = data.cadence ?? 'annual';
            const row = {
                id:              data.id,
                orgId,
                name:            data.name,
                description:     data.description     ?? null,
                cadence,
                intervalDays:    deriveInterval(cadence, data.intervalDays),
                visitsPerYear:   deriveVisits(cadence, deriveInterval(cadence, data.intervalDays)),
                visitTemplateId: data.visitTemplateId ?? null,
                coveredJobTypes: JSON.stringify(data.coveredJobTypes ?? []),
                includedHours:   data.includedHours   ?? null,
                responseHours:   data.responseHours   ?? null,
                discountPercent: data.discountPercent ?? null,
                price:           data.price           ?? null,
                billingPeriod:   data.billingPeriod   ?? 'annual',
                active:          data.active !== false,
                notes:           data.notes           ?? null,
                createdAt:       new Date(),
                updatedAt:       new Date(),
            };

            await db.insert(dispatchServicePlans).values(row)
                .onConflictDoUpdate({
                    target: dispatchServicePlans.id, setWhere: eq(dispatchServicePlans.orgId, orgId),
                    set: { ...row, createdAt: undefined },
                });

            const [inserted] = await db.select().from(dispatchServicePlans)
                .where(and(eq(dispatchServicePlans.id, data.id), eq(dispatchServicePlans.orgId, orgId)));

            return { statusCode: 201, headers, body: JSON.stringify({ plan: normalise(inserted) }) };
        }

        // ── PUT: update ───────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            const data    = JSON.parse(event.body || '{}');
            const updates = { updatedAt: new Date() };

            [
                'name', 'description', 'cadence', 'visitTemplateId', 'includedHours',
                'responseHours', 'discountPercent', 'price', 'billingPeriod', 'active', 'notes',
            ].forEach(f => { if (f in data) updates[f] = data[f]; });

            if ('coveredJobTypes' in data) updates.coveredJobTypes = JSON.stringify(data.coveredJobTypes);

            // intervalDays and visitsPerYear are derived, so a cadence change has to
            // recompute them — otherwise a plan switched from annual to monthly keeps
            // a 365-day interval and recurrence silently schedules one visit a year.
            if ('cadence' in data || 'intervalDays' in data) {
                const [current] = await db.select().from(dispatchServicePlans)
                    .where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId)));
                if (!current) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
                const cadence  = data.cadence ?? current.cadence ?? 'annual';
                const interval = deriveInterval(cadence, data.intervalDays ?? current.intervalDays);
                updates.cadence       = cadence;
                updates.intervalDays  = interval;
                updates.visitsPerYear = deriveVisits(cadence, interval);
            }

            await db.update(dispatchServicePlans).set(updates)
                .where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId)));

            const [updated] = await db.select().from(dispatchServicePlans)
                .where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId)));

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ plan: normalise(updated) }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        // dispatch_customers.service_plan_id has no cascade, so deleting a plan in
        // use would orphan every customer on it. Refuse and say how many, in line
        // with the retire-don't-delete rule; `active: false` is the retire path.
        if (event.httpMethod === 'DELETE') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            const holders = await db.select({ id: dispatchCustomers.id }).from(dispatchCustomers)
                .where(and(eq(dispatchCustomers.servicePlanId, id), eq(dispatchCustomers.orgId, orgId)));

            if (holders.length) {
                return {
                    statusCode: 409, headers,
                    body: JSON.stringify({
                        error: `${holders.length} customer${holders.length === 1 ? ' is' : 's are'} on this plan. ` +
                               'Move them to another plan first, or mark this plan inactive instead of deleting it.',
                        inUse: holders.length,
                    }),
                };
            }

            await db.delete(dispatchServicePlans)
                .where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('dispatch-service-plans error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-service-plans') };
    }
};
