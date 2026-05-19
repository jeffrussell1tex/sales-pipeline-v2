import { db } from '../../db/index.js';
import { dispatchVehicles } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

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

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(dispatchVehicles)
                .where(eq(dispatchVehicles.orgId, orgId));
            return { statusCode: 200, headers, body: JSON.stringify({ vehicles: rows.map(normalise) }) };
        }

        // ── POST ──────────────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)   return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name required' }) };

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

            await db.insert(dispatchVehicles).values(row)
                .onConflictDoUpdate({
                    target: dispatchVehicles.id,
                    set: { ...row, createdAt: undefined },
                });

            const [inserted] = await db.select().from(dispatchVehicles)
                .where(and(eq(dispatchVehicles.id, data.id), eq(dispatchVehicles.orgId, orgId)));

            return { statusCode: 201, headers, body: JSON.stringify({ vehicle: normalise(inserted) }) };
        }

        // ── PUT ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const params = event.queryStringParameters || {};
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            const data = JSON.parse(event.body || '{}');
            const updates = { updatedAt: new Date() };
            const fields = [
                'name','type','make','model','year','licensePlate','vin','color',
                'fuelType','status','assignedTechId','odometer','lastServiceDate',
                'nextServiceMiles','insuranceExpiry','registrationExpiry','gpsTrackerUrl','notes',
            ];
            fields.forEach(f => { if (f in data) updates[f] = data[f]; });

            await db.update(dispatchVehicles).set(updates)
                .where(and(eq(dispatchVehicles.id, id), eq(dispatchVehicles.orgId, orgId)));

            const [updated] = await db.select().from(dispatchVehicles)
                .where(and(eq(dispatchVehicles.id, id), eq(dispatchVehicles.orgId, orgId)));

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ vehicle: normalise(updated) }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = (event.queryStringParameters || {}).id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            await db.delete(dispatchVehicles)
                .where(and(eq(dispatchVehicles.id, id), eq(dispatchVehicles.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-vehicles error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
