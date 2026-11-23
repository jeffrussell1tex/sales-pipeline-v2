import { db } from '../../db/index.js';
import { dispatchServicePlans, dispatchCustomers } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { dispatchGate } from './_dispatchGate.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';
import { techScopeOf } from './_techScope.mjs';
import { checkLinks } from './_links.mjs';
import { coveredJobTypesOf, coveredToStore } from '../../src/utils/planLinks.js';
// A plan's discount (state §0.242, guide §18b125 rule 3 — Jeff, 10 Nov: "Refuse it"): a percent a write names anew is
// none (null or blank — stored as none) or a number 0-100, else refused naming the field and nothing is written; the
// discount the plan already holds is never asked again.
import { percentRefused } from '../../src/utils/quoteTotals.js';
const DISCOUNT_REFUSED = 'discountPercent must be a number from 0 to 100, or blank for none';

// A plan's links (state §0.223 — batch 4b-3 of OPEN_ITEMS §1 item 1, step D; Q11): its visit template and covered job
// types name entries of THIS org's job templates and job types lists ("Any of this org's, refuse"), asked when a write
// names them anew — a value the plan holds is never asked again.
const PLAN_LINKS = [{ key: 'visitTemplateId', kind: 'jobTemplate' }, { key: 'coveredJobTypes', kind: 'jobType', shape: 'many' }];

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
        leadDays:        row.leadDays        ?? row.lead_days         ?? 14,
        // How early the agreement renewal surfaces (state §0.110); null reads as 60 in planVisits.js.
        renewalLeadDays: row.renewalLeadDays ?? row.renewal_lead_days ?? null,
        anchorMode:      row.anchorMode      ?? row.anchor_mode       ?? 'fixed',
        // Always its list (state §0.223): a plan stored before held it as JSON text, and the screen filters a list.
        coveredJobTypes: coveredJobTypesOf(row.coveredJobTypes ?? row.covered_job_types),
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

// A create's id this org holds already (state §0.291): an earlier press of the same create landed (its form keeps the id after
// an answer that proved nothing, §0.263), or two pressed at once — 409 code 'idInUse' with the plan as stored, for the
// screen to take; nothing written. It was an upsert of the whole row: a price, a discount, a retirement
// set in between by another member was written over. null when this org holds none — another org's id is the words alone.
// Its callers await it: a failed read is the handler's 500, never an answer with no row.
async function heldPlan(orgId, id) {
    const [held] = await db.select().from(dispatchServicePlans).where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId)));
    return held ? { statusCode: 409, headers, body: JSON.stringify({ error: 'That plan id is already in use.', code: 'idInUse', plan: normalise(held) }) } : null;
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    // The one Dispatch gate (§0.152, guide §18b46): the module switch, then the
    // role — a sales rep only where the org lets reps use Dispatch; ReadOnly and a
    // Technician read. It replaces the write-only role gate (which let any rep write).
    const gate = await dispatchGate(auth, event, headers);
    if (gate.response) return gate.response;

    const params = event.queryStringParameters || {};

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            // A Technician reads the plans their jobs belong to (state §0.172) —
            // they read the org's catalogue, prices and discounts included.
            const tech = gate.access === 'tech' ? await techScopeOf(orgId, auth.userId) : null;
            if (gate.access === 'tech' && !tech) return { statusCode: 403, headers, body: JSON.stringify({ error: 'No technician record is linked to your account.' }) };
            const rows = await db.select().from(dispatchServicePlans)
                .where(eq(dispatchServicePlans.orgId, orgId));
            const visible = tech ? rows.filter((p) => tech.servicePlanIds.has(p.id)) : rows;
            return { statusCode: 200, headers, body: JSON.stringify({ plans: visible.map(normalise) }) };
        }

        // ── POST: create — an id the org holds writes nothing (state §0.291) ──
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)   return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };
            // A create only (state §0.291): an id this org holds is answered with its row before any link is asked.
            const landed = await heldPlan(orgId, data.id);
            if (landed) return landed;
            // Its links (state §0.223): every one it names is asked.
            const linked = await checkLinks(PLAN_LINKS, data, null, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            if (percentRefused(data.discountPercent, null)) return { statusCode: 400, headers, body: JSON.stringify({ error: DISCOUNT_REFUSED, field: 'discountPercent' }) };

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
                leadDays:        Number.isFinite(parseInt(data.leadDays, 10)) ? parseInt(data.leadDays, 10) : 14,
                renewalLeadDays: Number.isFinite(parseInt(data.renewalLeadDays, 10)) ? Math.max(0, parseInt(data.renewalLeadDays, 10)) : null,
                anchorMode:      data.anchorMode === 'rolling' ? 'rolling' : 'fixed',
                coveredJobTypes: coveredToStore(data.coveredJobTypes),
                includedHours:   data.includedHours   ?? null,
                responseHours:   data.responseHours   ?? null,
                discountPercent: data.discountPercent === '' ? null : data.discountPercent ?? null,
                price:           data.price           ?? null,
                billingPeriod:   data.billingPeriod   ?? 'annual',
                active:          data.active !== false,
                notes:           data.notes           ?? null,
                createdAt:       new Date(),
                updatedAt:       new Date(),
            };

            // Answered from its own write (state §0.268): a read after it could fail with the write landed, a 500 over a save that
            // took (census-D §2C).
            const [inserted] = await db.insert(dispatchServicePlans).values(row).onConflictDoNothing({ target: dispatchServicePlans.id }).returning();
            // Nothing written: the same create landed beside this one, or another org holds the id — the words alone (state §0.166).
            if (!inserted) {
                const beside = await heldPlan(orgId, data.id);
                if (beside) return beside;
            }
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That plan id is already in use.' }) };

            await auditAs(orgId, auth.userId, { action: 'dispatch_plan.created', entityType: 'dispatch_plan', entityId: inserted.id, entityName: inserted.name, detail: `${inserted.cadence || 'custom'}${inserted.price != null ? ` · $${Number(inserted.price).toLocaleString()}` : ''}` });
            return { statusCode: 201, headers, body: JSON.stringify({ plan: normalise(inserted) }) };
        }

        // ── PUT: update ───────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            const data    = JSON.parse(event.body || '{}');
            // The plan as stored, read before anything is asked or written (state §0.223): an id naming no plan of this
            // org is 404 before its links are asked; the links it holds are never asked again.
            const [current] = await db.select().from(dispatchServicePlans)
                .where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId)));
            if (!current) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            const linked = await checkLinks(PLAN_LINKS, data, current, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            if ('discountPercent' in data && percentRefused(data.discountPercent, current.discountPercent)) return { statusCode: 400, headers, body: JSON.stringify({ error: DISCOUNT_REFUSED, field: 'discountPercent' }) };
            const updates = { updatedAt: new Date() };

            [
                'name', 'description', 'cadence', 'visitTemplateId', 'includedHours',
                'responseHours', 'discountPercent', 'price', 'billingPeriod', 'active', 'notes',
                'leadDays', 'anchorMode',
            ].forEach(f => { if (f in data) updates[f] = data[f]; });
            if (updates.discountPercent === '') updates.discountPercent = null;
            if ('renewalLeadDays' in data) {
                const n = parseInt(data.renewalLeadDays, 10);
                updates.renewalLeadDays = Number.isFinite(n) ? Math.max(0, n) : null;
            }

            if ('coveredJobTypes' in data) updates.coveredJobTypes = coveredToStore(data.coveredJobTypes);

            // intervalDays and visitsPerYear are derived, so a cadence change has to
            // recompute them — otherwise a plan switched from annual to monthly keeps
            // a 365-day interval and recurrence silently schedules one visit a year.
            if ('cadence' in data || 'intervalDays' in data) {
                const cadence  = data.cadence ?? current.cadence ?? 'annual';
                const interval = deriveInterval(cadence, data.intervalDays ?? current.intervalDays);
                updates.cadence       = cadence;
                updates.intervalDays  = interval;
                updates.visitsPerYear = deriveVisits(cadence, interval);
            }

            // Answered from its own write (state §0.268): a read after it could fail with the write landed, a 500 over a save that
            // took (census-D §2C).
            const [updated] = await db.update(dispatchServicePlans).set(updates)
                .where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId))).returning();

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await auditAs(orgId, auth.userId, { action: 'dispatch_plan.updated', entityType: 'dispatch_plan', entityId: updated.id, entityName: updated.name, detail: `${updated.cadence || 'custom'} · ${updated.active === false ? 'inactive' : 'active'}` });
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

            const [gone] = await db.delete(dispatchServicePlans)
                .where(and(eq(dispatchServicePlans.id, id), eq(dispatchServicePlans.orgId, orgId)))
                .returning({ id: dispatchServicePlans.id, name: dispatchServicePlans.name });
            if (gone) await auditAs(orgId, auth.userId, { action: 'dispatch_plan.deleted', entityType: 'dispatch_plan', entityId: gone.id, entityName: gone.name, detail: null });
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('dispatch-service-plans error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-service-plans') };
    }
};
