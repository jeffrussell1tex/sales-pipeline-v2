// _techScope.mjs — a Technician's place in the org, read from the database
// (state §0.169). The rules are _techJobs.mjs's (pure); this resolves the
// caller's technician row and their jobs.
import { db } from '../../db/index.js';
import { dispatchTechnicians, dispatchJobs } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { techJobRefs } from './_techJobs.mjs';

// Jobs FK the TECHNICIAN ROW (dispatch_jobs.assignedTechId ->
// dispatch_technicians.id), not the user, so the caller's Clerk id resolves to
// their technician row before anything is scoped. A user with the Technician
// role and no linked row owns nothing — callers deny them (fails closed).
export async function resolveTechnicianId(orgId, userId) {
    if (!orgId || !userId) return null;
    const [row] = await db.select({ id: dispatchTechnicians.id })
        .from(dispatchTechnicians)
        .where(and(eq(dispatchTechnicians.orgId, orgId), eq(dispatchTechnicians.userId, userId)));
    return row?.id || null;
}

// The caller's technician id and what their jobs reach — null when no
// technician row is linked to them.
export async function techScopeOf(orgId, userId) {
    const techId = await resolveTechnicianId(orgId, userId);
    if (!techId) return null;
    const jobs = await db.select({
        id:             dispatchJobs.id,
        customerId:     dispatchJobs.customerId,
        locationId:     dispatchJobs.locationId,
        assignedTechId: dispatchJobs.assignedTechId,
        coTechIds:      dispatchJobs.coTechIds,
        assignedVehicleId:    dispatchJobs.assignedVehicleId,
        assignedEquipmentIds: dispatchJobs.assignedEquipmentIds,
        servicePlanId:        dispatchJobs.servicePlanId,
    }).from(dispatchJobs).where(eq(dispatchJobs.orgId, orgId));
    return { techId, ...techJobRefs(jobs, techId) };
}
