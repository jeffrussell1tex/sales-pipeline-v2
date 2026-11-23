import { db } from '../../db/index.js';
import { dispatchVehicles } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { dispatchGate } from './_dispatchGate.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';
import { techScopeOf } from './_techScope.mjs';
import { checkLinks } from './_links.mjs';

// A vehicle's technician: a live technician of this org when a write names one anew (state §0.201).
const VEHICLE_LINKS = [{ key: 'assignedTechId', kind: 'technician' }];

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function normalise(row) {
    return {
        id:                 row.id,
        orgId:              row.orgId               ?? row.org_id,
        name:               row.name                ?? '',
        type:               row.type                ?? 'van',
        make:               row.make                ?? null,
        model:              row.model               ?? null,
        year:               row.year                ?? null,
        licensePlate:       row.licensePlate        ?? row.license_plate        ?? null,
        vin:                row.vin                 ?? null,
        color:              row.color               ?? null,
        fuelType:           row.fuelType            ?? row.fuel_type            ?? 'gas',
        status:             row.status              ?? 'available',
        assignedTechId:     row.assignedTechId      ?? row.assigned_tech_id     ?? null,
        odometer:           row.odometer            ?? null,
        lastServiceDate:    row.lastServiceDate      ?? row.last_service_date    ?? null,
        nextServiceMiles:   row.nextServiceMiles     ?? row.next_service_miles   ?? null,
        insuranceExpiry:    row.insuranceExpiry      ?? row.insurance_expiry     ?? null,
        registrationExpiry: row.registrationExpiry   ?? row.registration_expiry  ?? null,
        gpsTrackerUrl:      row.gpsTrackerUrl        ?? row.gps_tracker_url      ?? null,
        notes:              row.notes               ?? null,
        createdAt:          row.createdAt           ?? row.created_at,
        updatedAt:          row.updatedAt           ?? row.updated_at,
    };
}

// A create's id this org holds already (state §0.291): an earlier press of the same create landed (its form keeps the id after
// an answer that proved nothing, §0.263), or two pressed at once — 409 code 'idInUse' with the vehicle as stored, for the
// screen to take; nothing written. It was an upsert of the whole row: a technician, a status, a plate
// set in between by another member was written over. null when this org holds none — another org's id is the words alone.
// Its callers await it: a failed read is the handler's 500, never an answer with no row.
async function heldVehicle(orgId, id) {
    const [held] = await db.select().from(dispatchVehicles).where(and(eq(dispatchVehicles.id, id), eq(dispatchVehicles.orgId, orgId)));
    return held ? { statusCode: 409, headers, body: JSON.stringify({ error: 'That vehicle id is already in use.', code: 'idInUse', vehicle: normalise(held) }) } : null;
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

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            // A Technician reads their own vehicle and those on their jobs (state
            // §0.172) — they read the fleet.
            const tech = gate.access === 'tech' ? await techScopeOf(orgId, auth.userId) : null;
            if (gate.access === 'tech' && !tech) return { statusCode: 403, headers, body: JSON.stringify({ error: 'No technician record is linked to your account.' }) };
            const rows = await db.select().from(dispatchVehicles)
                .where(eq(dispatchVehicles.orgId, orgId));
            const visible = tech
                ? rows.filter((v) => v.assignedTechId === tech.techId || tech.vehicleIds.has(v.id))
                : rows;
            return { statusCode: 200, headers, body: JSON.stringify({ vehicles: visible.map(normalise) }) };
        }

        // ── POST ──────────────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)   return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };
            // A create only (state §0.291): an id this org holds is answered with its row before any link is asked.
            const landed = await heldVehicle(orgId, data.id);
            if (landed) return landed;
            const linked = await checkLinks(VEHICLE_LINKS, data, null, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };

            const row = {
                id:                 data.id,
                orgId,
                name:               data.name,
                type:               data.type               ?? 'van',
                make:               data.make               ?? null,
                model:              data.model              ?? null,
                year:               data.year               ?? null,
                licensePlate:       data.licensePlate       ?? null,
                vin:                data.vin                ?? null,
                color:              data.color              ?? null,
                fuelType:           data.fuelType           ?? 'gas',
                status:             data.status             ?? 'available',
                assignedTechId:     data.assignedTechId     ?? null,
                odometer:           data.odometer           ?? null,
                lastServiceDate:    data.lastServiceDate    ?? null,
                nextServiceMiles:   data.nextServiceMiles   ?? null,
                insuranceExpiry:    data.insuranceExpiry    ?? null,
                registrationExpiry: data.registrationExpiry ?? null,
                gpsTrackerUrl:      data.gpsTrackerUrl      ?? null,
                notes:              data.notes              ?? null,
                createdAt:          new Date(),
                updatedAt:          new Date(),
            };

            // Answered from its own write (state §0.268): a read after it could fail with the write landed, a 500 over a save that
            // took (census-D §2C).
            const [inserted] = await db.insert(dispatchVehicles).values(row).onConflictDoNothing({ target: dispatchVehicles.id }).returning();
            // Nothing written: the same create landed beside this one, or another org holds the id — the words alone (state §0.166).
            if (!inserted) {
                const beside = await heldVehicle(orgId, data.id);
                if (beside) return beside;
            }
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That vehicle id is already in use.' }) };

            await auditAs(orgId, auth.userId, { action: 'dispatch_vehicle.created', entityType: 'dispatch_vehicle', entityId: inserted.id, entityName: inserted.name, detail: [inserted.year, inserted.make, inserted.model].filter(Boolean).join(' ') || inserted.type || null });
            return { statusCode: 201, headers, body: JSON.stringify({ vehicle: normalise(inserted) }) };
        }

        // ── PUT ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const params = event.queryStringParameters || {};
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            const data = JSON.parse(event.body || '{}');
            // Its technician, named anew, is this org's; one it holds is held (state §0.201).
            if ('assignedTechId' in data) {
                const [held] = await db.select({ id: dispatchVehicles.id, assignedTechId: dispatchVehicles.assignedTechId })
                    .from(dispatchVehicles).where(and(eq(dispatchVehicles.id, id), eq(dispatchVehicles.orgId, orgId)));
                if (!held) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
                const linked = await checkLinks(VEHICLE_LINKS, data, held, orgId);
                if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            }
            const updates = { updatedAt: new Date() };
            const fields = [
                'name','type','make','model','year','licensePlate','vin','color',
                'fuelType','status','assignedTechId','odometer','lastServiceDate',
                'nextServiceMiles','insuranceExpiry','registrationExpiry','gpsTrackerUrl','notes',
            ];
            fields.forEach(f => { if (f in data) updates[f] = data[f]; });

            // Answered from its own write (state §0.268): a read after it could fail with the write landed, a 500 over a save that
            // took (census-D §2C).
            const [updated] = await db.update(dispatchVehicles).set(updates)
                .where(and(eq(dispatchVehicles.id, id), eq(dispatchVehicles.orgId, orgId))).returning();

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await auditAs(orgId, auth.userId, { action: 'dispatch_vehicle.updated', entityType: 'dispatch_vehicle', entityId: updated.id, entityName: updated.name, detail: `${updated.status || 'active'}${updated.assignedTechId ? ' · assigned' : ''}` });
            return { statusCode: 200, headers, body: JSON.stringify({ vehicle: normalise(updated) }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = (event.queryStringParameters || {}).id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            const [gone] = await db.delete(dispatchVehicles)
                .where(and(eq(dispatchVehicles.id, id), eq(dispatchVehicles.orgId, orgId)))
                .returning({ id: dispatchVehicles.id, name: dispatchVehicles.name });
            if (gone) await auditAs(orgId, auth.userId, { action: 'dispatch_vehicle.deleted', entityType: 'dispatch_vehicle', entityId: gone.id, entityName: gone.name, detail: null });
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-vehicles error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-vehicles') };
    }
};
