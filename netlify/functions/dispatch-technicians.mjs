import { db } from '../../db/index.js';
import { dispatchTechnicians } from '../../db/schema.js';
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
        id:               row.id,
        orgId:            row.orgId            ?? row.org_id,
        userId:           row.userId           ?? row.user_id           ?? null,
        firstName:        row.firstName        ?? row.first_name        ?? '',
        lastName:         row.lastName         ?? row.last_name         ?? '',
        email:            row.email            ?? null,
        phone:            row.phone            ?? null,
        employmentType:   row.employmentType   ?? row.employment_type   ?? 'employee',
        status:           row.status           ?? 'active',
        homeZip:          row.homeZip          ?? row.home_zip          ?? null,
        serviceZones:     row.serviceZones     ?? row.service_zones     ?? [],
        skills:           row.skills           ?? [],
        certifications:   row.certifications   ?? [],
        workingHours:     row.workingHours     ?? row.working_hours     ?? {},
        laborRate:        row.laborRate        ?? row.labor_rate        ?? null,
        overtimeRate:     row.overtimeRate     ?? row.overtime_rate     ?? null,
        assignedVehicleId: row.assignedVehicleId ?? row.assigned_vehicle_id ?? null,
        notes:            row.notes            ?? null,
        avatarInitials:   row.avatarInitials   ?? row.avatar_initials   ?? null,
        createdAt:        row.createdAt        ?? row.created_at,
        updatedAt:        row.updatedAt        ?? row.updated_at,
    };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    try {
        // ── GET: list all technicians for org ─────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(dispatchTechnicians)
                .where(eq(dispatchTechnicians.orgId, orgId));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ technicians: rows.map(normalise) }),
            };
        }

        // ── POST: create technician ───────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.firstName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'firstName required' }) };
            if (!data.lastName)  return { statusCode: 400, headers, body: JSON.stringify({ error: 'lastName required' }) };

            const row = {
                id:               data.id,
                orgId,
                userId:           data.userId           ?? null,
                firstName:        data.firstName,
                lastName:         data.lastName,
                email:            data.email            ?? null,
                phone:            data.phone            ?? null,
                employmentType:   data.employmentType   ?? 'employee',
                status:           data.status           ?? 'active',
                homeZip:          data.homeZip          ?? null,
                serviceZones:     JSON.stringify(data.serviceZones     ?? []),
                skills:           JSON.stringify(data.skills           ?? []),
                certifications:   JSON.stringify(data.certifications   ?? []),
                workingHours:     JSON.stringify(data.workingHours     ?? {}),
                laborRate:        data.laborRate        ?? null,
                overtimeRate:     data.overtimeRate     ?? null,
                assignedVehicleId: data.assignedVehicleId ?? null,
                notes:            data.notes            ?? null,
                avatarInitials:   data.avatarInitials   ?? null,
                createdAt:        new Date(),
                updatedAt:        new Date(),
            };

            await db.insert(dispatchTechnicians).values(row)
                .onConflictDoUpdate({
                    target: dispatchTechnicians.id,
                    set: { ...row, createdAt: undefined },
                });

            const [inserted] = await db.select().from(dispatchTechnicians)
                .where(and(eq(dispatchTechnicians.id, data.id), eq(dispatchTechnicians.orgId, orgId)));

            return { statusCode: 201, headers, body: JSON.stringify({ technician: normalise(inserted) }) };
        }

        // ── PUT: update technician ────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const params = event.queryStringParameters || {};
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param required' }) };

            const data = JSON.parse(event.body || '{}');
            const updates = { updatedAt: new Date() };

            const fields = [
                'userId','firstName','lastName','email','phone','employmentType',
                'status','homeZip','laborRate','overtimeRate','assignedVehicleId',
                'notes','avatarInitials',
            ];
            fields.forEach(f => { if (f in data) updates[f] = data[f]; });

            const jsonFields = ['serviceZones','skills','certifications','workingHours'];
            jsonFields.forEach(f => { if (f in data) updates[f] = JSON.stringify(data[f]); });

            await db.update(dispatchTechnicians)
                .set(updates)
                .where(and(eq(dispatchTechnicians.id, id), eq(dispatchTechnicians.orgId, orgId)));

            const [updated] = await db.select().from(dispatchTechnicians)
                .where(and(eq(dispatchTechnicians.id, id), eq(dispatchTechnicians.orgId, orgId)));

            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ technician: normalise(updated) }) };
        }

        // ── DELETE: remove technician ─────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const params = event.queryStringParameters || {};
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param required' }) };

            await db.delete(dispatchTechnicians)
                .where(and(eq(dispatchTechnicians.id, id), eq(dispatchTechnicians.orgId, orgId)));

            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-technicians error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
