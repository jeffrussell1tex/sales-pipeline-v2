import { db } from '../../db/index.js';
import {
    dispatchJobs,
    dispatchJobLineItems,
    dispatchJobStatusHistory,
    dispatchTechnicians,
} from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth, requireWrite, isTechnician } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function normaliseJob(row) {
    return {
        id:               row.id,
        orgId:            row.orgId             ?? row.org_id,
        jobNumber:        row.jobNumber         ?? row.job_number         ?? null,
        customerId:       row.customerId        ?? row.customer_id,
        locationId:       row.locationId        ?? row.location_id        ?? null,
        accountId:        row.accountId         ?? row.account_id         ?? null,
        opportunityId:    row.opportunityId     ?? row.opportunity_id     ?? null,
        title:            row.title             ?? '',
        description:      row.description       ?? null,
        trade:            row.trade             ?? '',
        jobType:          row.jobType           ?? row.job_type           ?? '',
        status:           row.status            ?? 'unscheduled',
        priority:         row.priority          ?? 'normal',
        scheduledDate:    row.scheduledDate     ?? row.scheduled_date     ?? null,
        scheduledStart:   row.scheduledStart    ?? row.scheduled_start    ?? null,
        scheduledEnd:     row.scheduledEnd      ?? row.scheduled_end      ?? null,
        timeSlot:         row.timeSlot          ?? row.time_slot          ?? 'anytime',
        actualStart:      row.actualStart       ?? row.actual_start       ?? null,
        actualEnd:        row.actualEnd         ?? row.actual_end         ?? null,
        durationMinutes:  row.durationMinutes   ?? row.duration_minutes   ?? null,
        crewSize:         row.crewSize          ?? row.crew_size          ?? null,
        minLicense:       row.minLicense        ?? row.min_license        ?? null,
        requiredVehicleType: row.requiredVehicleType ?? row.required_vehicle_type ?? null,
        needSkills:       row.needSkills        ?? row.need_skills        ?? [],
        assignedTechId:   row.assignedTechId    ?? row.assigned_tech_id   ?? null,
        assignedVehicleId:row.assignedVehicleId ?? row.assigned_vehicle_id ?? null,
        coTechIds:        row.coTechIds         ?? row.co_tech_ids        ?? [],
        equipmentIds:     row.equipmentIds      ?? row.equipment_ids      ?? [],
        laborHours:       row.laborHours        ?? row.labor_hours        ?? null,
        laborCost:        row.laborCost         ?? row.labor_cost         ?? null,
        materialCost:     row.materialCost      ?? row.material_cost      ?? null,
        totalCost:        row.totalCost         ?? row.total_cost         ?? null,
        invoiceAmount:    row.invoiceAmount      ?? row.invoice_amount     ?? null,
        invoiceStatus:    row.invoiceStatus      ?? row.invoice_status     ?? 'none',
        invoicePaidAt:    row.invoicePaidAt      ?? row.invoice_paid_at    ?? null,
        customerPoNumber: row.customerPoNumber   ?? row.customer_po_number ?? null,
        techNotes:        row.techNotes          ?? row.tech_notes         ?? null,
        completionNotes:  row.completionNotes    ?? row.completion_notes   ?? null,
        customerSignature:row.customerSignature  ?? row.customer_signature ?? false,
        photosCount:      row.photosCount        ?? row.photos_count       ?? 0,
        requiresFollowUp: row.requiresFollowUp   ?? row.requires_follow_up ?? false,
        followUpJobId:    row.followUpJobId      ?? row.follow_up_job_id   ?? null,
        parentJobId:      row.parentJobId        ?? row.parent_job_id      ?? null,
        tags:             row.tags               ?? [],
        customFields:     row.customFields       ?? row.custom_fields      ?? {},
        createdBy:        row.createdBy          ?? row.created_by         ?? null,
        dispatchedBy:     row.dispatchedBy       ?? row.dispatched_by      ?? null,
        createdAt:        row.createdAt          ?? row.created_at,
        updatedAt:        row.updatedAt          ?? row.updated_at,
    };
}

function normaliseLineItem(row) {
    return {
        id:          row.id,
        orgId:       row.orgId      ?? row.org_id,
        jobId:       row.jobId      ?? row.job_id,
        itemType:    row.itemType   ?? row.item_type   ?? 'part',
        description: row.description ?? '',
        partNumber:  row.partNumber  ?? row.part_number ?? null,
        quantity:    row.quantity    ?? '1',
        unitPrice:   row.unitPrice   ?? row.unit_price  ?? '0',
        totalPrice:  row.totalPrice  ?? row.total_price ?? '0',
        taxable:     row.taxable     ?? true,
        sortOrder:   row.sortOrder   ?? row.sort_order  ?? 0,
        createdAt:   row.createdAt   ?? row.created_at,
        updatedAt:   row.updatedAt   ?? row.updated_at,
    };
}

// Write a status history record when a job status changes
async function recordStatusChange(orgId, jobId, fromStatus, toStatus, changedBy, note) {
    await db.insert(dispatchJobStatusHistory).values({
        id:         `sh_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        orgId,
        jobId,
        fromStatus: fromStatus ?? null,
        toStatus,
        changedBy:  changedBy ?? null,
        note:       note ?? null,
        createdAt:  new Date(),
    }).catch(() => {}); // non-fatal
}

// Human-readable job number, JOB-2026-0042. Same rules as customerNumber:
// assigned SERVER-SIDE only (two dispatchers creating jobs at once would collide
// client-side), immutable once set, and sequential per org per year.
async function nextJobNumber(orgId) {
    const year = new Date().getFullYear();
    const rows = await db.select({ n: dispatchJobs.jobNumber })
        .from(dispatchJobs).where(eq(dispatchJobs.orgId, orgId));
    const prefix = `JOB-${year}-`;
    let max = 0;
    for (const r of rows) {
        const v = String(r.n || '');
        if (!v.startsWith(prefix)) continue;
        const num = parseInt(v.slice(prefix.length), 10);
        if (Number.isFinite(num) && num > max) max = num;
    }
    return prefix + String(max + 1).padStart(4, '0');
}

// ── Technician scoping ────────────────────────────────────────────────────────
// A Technician is a mobile/field user. Jobs FK the TECHNICIAN ROW
// (dispatch_jobs.assignedTechId -> dispatch_technicians.id), not the user, so the
// caller's Clerk id must be resolved to their technician row before anything can
// be scoped. A user with the Technician role but no linked technician row owns
// nothing and is denied — this fails closed by design.
async function resolveTechnicianId(orgId, userId) {
    if (!userId) return null;
    const [row] = await db.select({ id: dispatchTechnicians.id })
        .from(dispatchTechnicians)
        .where(and(eq(dispatchTechnicians.orgId, orgId), eq(dispatchTechnicians.userId, userId)));
    return row?.id || null;
}

// A technician is on a job if they are the lead or a co-tech.
const techOnJob = (job, techId) =>
    !!techId && (job.assignedTechId === techId ||
        (Array.isArray(job.coTechIds) ? job.coTechIds : []).includes(techId));

// The ONLY fields a technician may write, on a job assigned to them. Everything
// else — reassignment, scheduling, customer, pricing — stays with dispatch.
const TECH_WRITABLE = ['status', 'techNotes', 'completionNotes', 'photosCount', 'customerSignature'];

// Progress transitions a technician may perform. They may move a job forward
// through their own day and pause it; they may not cancel it or return it to
// unscheduled, both of which are dispatch decisions.
const TECH_STATUS_ALLOWED = ['en_route', 'on_site', 'paused', 'completed'];

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId } = auth;

    // Technicians are the one role allowed past requireWrite here, and only so
    // that the narrow per-field path below can run. Every other endpoint denies
    // them by default.
    const tech = isTechnician(auth.userRole);
    const forbidden = requireWrite(auth, event, headers, { allowTechnician: true });
    if (forbidden) return forbidden;

    const myTechId = tech ? await resolveTechnicianId(orgId, userId) : null;
    if (tech && !myTechId) {
        // Role granted but no technician record linked to this user — they own
        // nothing, so there is nothing legitimate to read or write.
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'No technician record is linked to your account.' }) };
    }
    if (tech && (event.httpMethod === 'POST' || event.httpMethod === 'DELETE')) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Technicians cannot create or delete jobs.' }) };
    }

    const params   = event.queryStringParameters || {};
    const resource = params.resource; // 'lineitems' | 'history' | undefined

    try {
        // ════════════════════════════════════════════════════
        // LINE ITEMS sub-resource  ?resource=lineitems&jobId=xxx
        // ════════════════════════════════════════════════════
        if (resource === 'lineitems') {
            if (event.httpMethod === 'GET') {
                if (!params.jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId required' }) };
                const rows = await db.select().from(dispatchJobLineItems)
                    .where(and(eq(dispatchJobLineItems.orgId, orgId), eq(dispatchJobLineItems.jobId, params.jobId)));
                return { statusCode: 200, headers, body: JSON.stringify({ lineItems: rows.map(normaliseLineItem) }) };
            }

            if (event.httpMethod === 'POST') {
                const data = JSON.parse(event.body || '{}');
                if (!data.id || !data.jobId || !data.description) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, jobId, description required' }) };
                }
                const row = {
                    id:          data.id,
                    orgId,
                    jobId:       data.jobId,
                    itemType:    data.itemType    ?? 'part',
                    description: data.description,
                    partNumber:  data.partNumber  ?? null,
                    quantity:    data.quantity    ?? '1',
                    unitPrice:   data.unitPrice   ?? '0',
                    totalPrice:  data.totalPrice  ?? '0',
                    taxable:     data.taxable     ?? true,
                    sortOrder:   data.sortOrder   ?? 0,
                    createdAt:   new Date(),
                    updatedAt:   new Date(),
                };
                await db.insert(dispatchJobLineItems).values(row)
                    .onConflictDoUpdate({ target: dispatchJobLineItems.id, setWhere: eq(dispatchJobLineItems.orgId, orgId), set: { ...row, createdAt: undefined } });
                const [inserted] = await db.select().from(dispatchJobLineItems)
                    .where(and(eq(dispatchJobLineItems.id, data.id), eq(dispatchJobLineItems.orgId, orgId)));
                return { statusCode: 201, headers, body: JSON.stringify({ lineItem: normaliseLineItem(inserted) }) };
            }

            if (event.httpMethod === 'DELETE') {
                const id = params.id;
                if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
                await db.delete(dispatchJobLineItems)
                    .where(and(eq(dispatchJobLineItems.id, id), eq(dispatchJobLineItems.orgId, orgId)));
                return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
            }
        }

        // ════════════════════════════════════════════════════
        // STATUS HISTORY sub-resource  ?resource=history&jobId=xxx
        // ════════════════════════════════════════════════════
        if (resource === 'history') {
            if (!params.jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId required' }) };
            const rows = await db.select().from(dispatchJobStatusHistory)
                .where(and(eq(dispatchJobStatusHistory.orgId, orgId), eq(dispatchJobStatusHistory.jobId, params.jobId)))
                .orderBy(desc(dispatchJobStatusHistory.createdAt));
            return { statusCode: 200, headers, body: JSON.stringify({ history: rows }) };
        }

        // ════════════════════════════════════════════════════
        // JOBS resource (default)
        // ════════════════════════════════════════════════════
        if (event.httpMethod === 'GET') {
            // ?id=xxx  →  single job
            if (params.id) {
                const [row] = await db.select().from(dispatchJobs)
                    .where(and(eq(dispatchJobs.id, params.id), eq(dispatchJobs.orgId, orgId)));
                if (!row) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
                const one = normaliseJob(row);
                // 404 rather than 403: a technician should not be able to probe
                // which job ids exist in the org.
                if (tech && !techOnJob(one, myTechId)) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
                }
                return { statusCode: 200, headers, body: JSON.stringify({ job: one }) };
            }
            // List. Technicians see only their own assignments.
            const rows = await db.select().from(dispatchJobs)
                .where(eq(dispatchJobs.orgId, orgId))
                .orderBy(desc(dispatchJobs.createdAt));
            const all = rows.map(normaliseJob);
            const visible = tech ? all.filter(j => techOnJob(j, myTechId)) : all;
            return { statusCode: 200, headers, body: JSON.stringify({ jobs: visible }) };
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id || !data.customerId || !data.title) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, customerId, title required' }) };
            }

            // POST is an upsert, so reuse any number already issued for this id
            // rather than reissuing one — job numbers are immutable.
            const [priorJob] = await db.select({ jobNumber: dispatchJobs.jobNumber })
                .from(dispatchJobs)
                .where(and(eq(dispatchJobs.id, data.id), eq(dispatchJobs.orgId, orgId)));

            const row = {
                id:               data.id,
                orgId,
                jobNumber:        priorJob?.jobNumber || await nextJobNumber(orgId),
                customerId:       data.customerId,
                locationId:       data.locationId       ?? null,
                accountId:        data.accountId        ?? null,
                opportunityId:    data.opportunityId    ?? null,
                title:            data.title,
                description:      data.description      ?? null,
                trade:            data.trade            ?? '',
                jobType:          data.jobType          ?? '',
                status:           data.status           ?? 'unscheduled',
                priority:         data.priority         ?? 'normal',
                scheduledDate:    data.scheduledDate    ?? null,
                scheduledStart:   data.scheduledStart   ?? null,
                scheduledEnd:     data.scheduledEnd     ?? null,
                timeSlot:         data.timeSlot         ?? 'anytime',
                actualStart:      null,
                actualEnd:        null,
                durationMinutes:  data.durationMinutes  ?? null,
                crewSize:         data.crewSize         ?? null,
                minLicense:       data.minLicense       ?? null,
                requiredVehicleType: data.requiredVehicleType ?? null,
                needSkills:       JSON.stringify(data.needSkills   ?? []),
                assignedTechId:   data.assignedTechId   ?? null,
                assignedVehicleId:data.assignedVehicleId ?? null,
                coTechIds:        JSON.stringify(data.coTechIds     ?? []),
                equipmentIds:     JSON.stringify(data.equipmentIds  ?? []),
                laborHours:       data.laborHours        ?? null,
                laborCost:        data.laborCost         ?? null,
                materialCost:     data.materialCost      ?? null,
                totalCost:        data.totalCost         ?? null,
                invoiceAmount:    data.invoiceAmount     ?? null,
                invoiceStatus:    data.invoiceStatus     ?? 'none',
                invoicePaidAt:    data.invoicePaidAt     ?? null,
                customerPoNumber: data.customerPoNumber  ?? null,
                techNotes:        data.techNotes         ?? null,
                completionNotes:  data.completionNotes   ?? null,
                customerSignature:data.customerSignature ?? false,
                photosCount:      data.photosCount       ?? 0,
                requiresFollowUp: data.requiresFollowUp  ?? false,
                followUpJobId:    data.followUpJobId     ?? null,
                parentJobId:      data.parentJobId       ?? null,
                tags:             JSON.stringify(data.tags         ?? []),
                customFields:     JSON.stringify(data.customFields ?? {}),
                createdBy:        data.createdBy         ?? userId ?? null,
                dispatchedBy:     data.dispatchedBy      ?? null,
                createdAt:        new Date(),
                updatedAt:        new Date(),
            };

            await db.insert(dispatchJobs).values(row)
                .onConflictDoUpdate({ target: dispatchJobs.id, setWhere: eq(dispatchJobs.orgId, orgId), set: { ...row, createdAt: undefined } });

            await recordStatusChange(orgId, data.id, null, row.status, userId, 'Job created');

            const [inserted] = await db.select().from(dispatchJobs)
                .where(and(eq(dispatchJobs.id, data.id), eq(dispatchJobs.orgId, orgId)));

            return { statusCode: 201, headers, body: JSON.stringify({ job: normaliseJob(inserted) }) };
        }

        if (event.httpMethod === 'PUT') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            // Fetch current status before update (for history)
            const [current] = await db.select().from(dispatchJobs)
                .where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));
            if (!current) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

            const data    = JSON.parse(event.body || '{}');
            const updates = { updatedAt: new Date() };

            // Technician path: own job only, whitelisted fields only, and only
            // forward-progress status transitions. Anything else is rejected
            // outright rather than silently dropped, so a mis-scoped mobile
            // client fails loudly instead of appearing to succeed.
            if (tech) {
                const currentJob = normaliseJob(current);
                if (!techOnJob(currentJob, myTechId)) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
                }
                const attempted = Object.keys(data).filter(k => k !== 'id');
                const illegal = attempted.filter(k => !TECH_WRITABLE.includes(k));
                if (illegal.length) {
                    return { statusCode: 403, headers, body: JSON.stringify({
                        error: `Technicians may only update: ${TECH_WRITABLE.join(', ')}. Rejected: ${illegal.join(', ')}`,
                    }) };
                }
                if ('status' in data && !TECH_STATUS_ALLOWED.includes(data.status)) {
                    return { statusCode: 403, headers, body: JSON.stringify({
                        error: `Technicians may set status to: ${TECH_STATUS_ALLOWED.join(', ')}`,
                    }) };
                }
                TECH_WRITABLE.forEach(f => { if (f in data) updates[f] = data[f]; });

                await db.update(dispatchJobs).set(updates)
                    .where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));

                const [updatedRow] = await db.select().from(dispatchJobs)
                    .where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));

                if ('status' in data && data.status !== current.status) {
                    await recordStatusChange(orgId, id, current.status, data.status, userId, 'Updated in the field');
                }

                return { statusCode: 200, headers, body: JSON.stringify({ job: normaliseJob(updatedRow) }) };
            }

            const scalarFields = [
                // jobNumber deliberately omitted: server-assigned and immutable.
                'customerId','locationId','accountId','opportunityId',
                'title','description','trade','jobType','status','priority',
                'scheduledDate','scheduledStart','scheduledEnd','timeSlot',
                'durationMinutes','crewSize','minLicense','requiredVehicleType','assignedTechId','assignedVehicleId',
                'laborHours','laborCost','materialCost','totalCost',
                'invoiceAmount','invoiceStatus','invoicePaidAt','customerPoNumber',
                'techNotes','completionNotes','customerSignature','photosCount',
                'requiresFollowUp','followUpJobId','parentJobId','createdBy','dispatchedBy',
            ];
            scalarFields.forEach(f => { if (f in data) updates[f] = data[f]; });

            // Handle timestamp fields
            if ('actualStart' in data) updates.actualStart = data.actualStart ? new Date(data.actualStart) : null;
            if ('actualEnd'   in data) updates.actualEnd   = data.actualEnd   ? new Date(data.actualEnd)   : null;

            // JSON fields
            if ('coTechIds'    in data) updates.coTechIds    = JSON.stringify(data.coTechIds);
            if ('needSkills'   in data) updates.needSkills   = JSON.stringify(data.needSkills);
            if ('equipmentIds' in data) updates.equipmentIds = JSON.stringify(data.equipmentIds);
            if ('tags'         in data) updates.tags         = JSON.stringify(data.tags);
            if ('customFields' in data) updates.customFields = JSON.stringify(data.customFields);

            await db.update(dispatchJobs).set(updates)
                .where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));

            // Write status history if status changed
            const fromStatus = current.status ?? current.status;
            const toStatus   = data.status;
            if (toStatus && toStatus !== fromStatus) {
                await recordStatusChange(orgId, id, fromStatus, toStatus, userId, data.statusNote ?? null);
            }

            const [updated] = await db.select().from(dispatchJobs)
                .where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));

            return { statusCode: 200, headers, body: JSON.stringify({ job: normaliseJob(updated) }) };
        }

        if (event.httpMethod === 'DELETE') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            // Cascade delete line items and history
            await db.delete(dispatchJobLineItems)
                .where(and(eq(dispatchJobLineItems.jobId, id), eq(dispatchJobLineItems.orgId, orgId)));
            await db.delete(dispatchJobStatusHistory)
                .where(and(eq(dispatchJobStatusHistory.jobId, id), eq(dispatchJobStatusHistory.orgId, orgId)));
            await db.delete(dispatchJobs)
                .where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-jobs error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-jobs') };
    }
};
