import { db } from '../../db/index.js';
import {
    dispatchJobs,
    dispatchJobLineItems,
    dispatchJobStatusHistory,
} from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

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
        trade:            row.trade             ?? 'hvac',
        jobType:          row.jobType           ?? row.job_type           ?? 'repair',
        status:           row.status            ?? 'unscheduled',
        priority:         row.priority          ?? 'normal',
        scheduledDate:    row.scheduledDate     ?? row.scheduled_date     ?? null,
        scheduledStart:   row.scheduledStart    ?? row.scheduled_start    ?? null,
        scheduledEnd:     row.scheduledEnd      ?? row.scheduled_end      ?? null,
        timeSlot:         row.timeSlot          ?? row.time_slot          ?? 'anytime',
        actualStart:      row.actualStart       ?? row.actual_start       ?? null,
        actualEnd:        row.actualEnd         ?? row.actual_end         ?? null,
        durationMinutes:  row.durationMinutes   ?? row.duration_minutes   ?? null,
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

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId } = auth;

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
                    .onConflictDoUpdate({ target: dispatchJobLineItems.id, set: { ...row, createdAt: undefined } });
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
                return { statusCode: 200, headers, body: JSON.stringify({ job: normaliseJob(row) }) };
            }
            // List all jobs for org
            const rows = await db.select().from(dispatchJobs)
                .where(eq(dispatchJobs.orgId, orgId))
                .orderBy(desc(dispatchJobs.createdAt));
            return { statusCode: 200, headers, body: JSON.stringify({ jobs: rows.map(normaliseJob) }) };
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id || !data.customerId || !data.title) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, customerId, title required' }) };
            }

            const row = {
                id:               data.id,
                orgId,
                jobNumber:        data.jobNumber        ?? null,
                customerId:       data.customerId,
                locationId:       data.locationId       ?? null,
                accountId:        data.accountId        ?? null,
                opportunityId:    data.opportunityId    ?? null,
                title:            data.title,
                description:      data.description      ?? null,
                trade:            data.trade            ?? 'hvac',
                jobType:          data.jobType          ?? 'repair',
                status:           data.status           ?? 'unscheduled',
                priority:         data.priority         ?? 'normal',
                scheduledDate:    data.scheduledDate    ?? null,
                scheduledStart:   data.scheduledStart   ?? null,
                scheduledEnd:     data.scheduledEnd     ?? null,
                timeSlot:         data.timeSlot         ?? 'anytime',
                actualStart:      null,
                actualEnd:        null,
                durationMinutes:  data.durationMinutes  ?? null,
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
                .onConflictDoUpdate({ target: dispatchJobs.id, set: { ...row, createdAt: undefined } });

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

            const scalarFields = [
                'jobNumber','customerId','locationId','accountId','opportunityId',
                'title','description','trade','jobType','status','priority',
                'scheduledDate','scheduledStart','scheduledEnd','timeSlot',
                'durationMinutes','assignedTechId','assignedVehicleId',
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
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
