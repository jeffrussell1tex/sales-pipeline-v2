import { db } from '../../db/index.js';
import { dispatchTechnicians, users } from '../../db/schema.js';
import { eq, and, ne, inArray } from 'drizzle-orm';
import { verifyAuth, isTechnician } from './auth.mjs';
import { dispatchGate } from './_dispatchGate.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';
import { checkLinks } from './_links.mjs';
import { loginAsked, loginDecided } from '../../src/utils/techLogin.js';

const techName = (t) => [t?.firstName, t?.lastName].filter(Boolean).join(' ') || t?.email || 'Technician';
import { defaultWorkWeek } from '../../src/utils/workWeek.js';

// A technician's vehicle: a live vehicle of this org when a write names it anew (state §0.201).
const TECH_LINKS = [{ key: 'assignedVehicleId', kind: 'vehicle' }];

// The login a write names (state §0.201): { keep } — the row keeps the one it holds — { userId } to store, or
// a refusal. A member of THIS org, by their app id (the screen's pick) or their Clerk identity; stored as the
// Clerk identity a Technician's sign-in is matched against; never one another technician of the org holds.
async function loginOf(orgId, techId, data, stored) {
    const asked = loginAsked(data, stored);
    if (asked.status || asked.keep) return asked;
    if (asked.clear) return { userId: null };
    const by = asked.member.by === 'id' ? users.id : users.clerkUserId;
    const [member] = await db.select({ id: users.id, name: users.name, clerkUserId: users.clerkUserId }).from(users)
        .where(and(eq(users.orgId, orgId), eq(by, asked.member.value)));
    const [taken] = member && member.clerkUserId
        ? await db.select({ firstName: dispatchTechnicians.firstName, lastName: dispatchTechnicians.lastName, email: dispatchTechnicians.email })
            .from(dispatchTechnicians)
            .where(and(eq(dispatchTechnicians.orgId, orgId), eq(dispatchTechnicians.userId, member.clerkUserId), ne(dispatchTechnicians.id, techId)))
        : [];
    return loginDecided(member || null, taken ? techName(taken) : null);
}

// The member a login names, by their app id, read in this org — what the screen's picker holds; a create's
// and an update's answer carry it as the list does (state §0.201).
async function memberIdOf(orgId, login) {
    if (!login) return null;
    const [member] = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), eq(users.clerkUserId, login)));
    return member ? member.id : null;
}

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
        // The member the login names, by their app id — what the screen's picker holds (state §0.201).
        memberId:         row.memberId         ?? null,
        firstName:        row.firstName        ?? row.first_name        ?? '',
        lastName:         row.lastName         ?? row.last_name         ?? '',
        email:            row.email            ?? null,
        phone:            row.phone            ?? null,
        employmentType:   row.employmentType   ?? row.employment_type   ?? 'employee',
        status:           row.status           ?? 'active',
        homeZip:          row.homeZip          ?? row.home_zip          ?? null,
        licenseLevel:     row.licenseLevel     ?? row.license_level     ?? null,
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
    const { orgId, userId } = auth;

    // The one Dispatch gate (§0.152, guide §18b46): the module switch, then the
    // role — a sales rep only where the org lets reps use Dispatch; ReadOnly and a
    // Technician read. It replaces the write-only role gate (which let any rep write).
    const gate = await dispatchGate(auth, event, headers);
    if (gate.response) return gate.response;

    try {
        // ── GET: list all technicians for org ─────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(dispatchTechnicians)
                .where(isTechnician(auth.userRole)
                    // A technician sees only their own record — the roster carries
                    // colleagues' phone numbers, pay rates and home locations.
                    ? and(eq(dispatchTechnicians.orgId, orgId), eq(dispatchTechnicians.userId, userId))
                    : eq(dispatchTechnicians.orgId, orgId));
            // Each login's member, by their app id, read in this org (state §0.201).
            const logins = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
            const members = logins.length
                ? await db.select({ id: users.id, clerkUserId: users.clerkUserId }).from(users)
                    .where(and(eq(users.orgId, orgId), inArray(users.clerkUserId, logins)))
                : [];
            const memberOf = new Map(members.map((m) => [m.clerkUserId, m.id]));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ technicians: rows.map((r) => normalise({ ...r, memberId: memberOf.get(r.userId) || null })) }),
            };
        }

        // ── POST: create technician ───────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id)        return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            if (!data.firstName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'firstName required' }) };
            if (!data.lastName)  return { statusCode: 400, headers, body: JSON.stringify({ error: 'lastName required' }) };

            // The create is an upsert: what the row already holds is held (state §0.201).
            const [prior] = await db.select({ id: dispatchTechnicians.id, userId: dispatchTechnicians.userId, assignedVehicleId: dispatchTechnicians.assignedVehicleId })
                .from(dispatchTechnicians).where(and(eq(dispatchTechnicians.id, data.id), eq(dispatchTechnicians.orgId, orgId)));
            const linked = await checkLinks(TECH_LINKS, data, prior || null, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            const login = await loginOf(orgId, data.id, data, prior || null);
            if (login.status) return { statusCode: login.status, headers, body: JSON.stringify({ error: login.error, field: login.field }) };

            const row = {
                id:               data.id,
                orgId,
                userId:           login.keep ? (prior ? prior.userId : null) : login.userId,
                firstName:        data.firstName,
                lastName:         data.lastName,
                email:            data.email            ?? null,
                phone:            data.phone            ?? null,
                employmentType:   data.employmentType   ?? 'employee',
                status:           data.status           ?? 'active',
                homeZip:          data.homeZip          ?? null,
                licenseLevel:     data.licenseLevel     ?? null,
                serviceZones:     JSON.stringify(data.serviceZones     ?? []),
                skills:           JSON.stringify(data.skills           ?? []),
                certifications:   JSON.stringify(data.certifications   ?? []),
                // A new technician starts rostered Mon–Fri 08:00–17:00 unless the
                // create carries a pattern; an explicit {} is "no working days" (§0.113).
                workingHours:     JSON.stringify(data.workingHours     ?? defaultWorkWeek()),
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
                    target: dispatchTechnicians.id, setWhere: eq(dispatchTechnicians.orgId, orgId),
                    set: { ...row, createdAt: undefined },
                });

            const [inserted] = await db.select().from(dispatchTechnicians)
                .where(and(eq(dispatchTechnicians.id, data.id), eq(dispatchTechnicians.orgId, orgId)));
            // An id another org holds: the upsert wrote nothing, and this crashed — a 500
            // that said the id was taken elsewhere (state §0.166).
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That technician id is already in use.' }) };

            await auditAs(orgId, userId, { action: 'dispatch_technician.created', entityType: 'dispatch_technician', entityId: inserted.id, entityName: techName(inserted), detail: `${inserted.employmentType || 'employee'} · ${inserted.status || 'active'}` });
            return { statusCode: 201, headers, body: JSON.stringify({ technician: normalise({ ...inserted, memberId: await memberIdOf(orgId, inserted.userId) }) }) };
        }

        // ── PUT: update technician ────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const params = event.queryStringParameters || {};
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param required' }) };

            const data = JSON.parse(event.body || '{}');
            const updates = { updatedAt: new Date() };

            // Its vehicle and its login, named anew, are this org's; what it holds is held (state §0.201).
            const [current] = await db.select({ id: dispatchTechnicians.id, userId: dispatchTechnicians.userId, assignedVehicleId: dispatchTechnicians.assignedVehicleId })
                .from(dispatchTechnicians).where(and(eq(dispatchTechnicians.id, id), eq(dispatchTechnicians.orgId, orgId)));
            if (!current) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            const linked = await checkLinks(TECH_LINKS, data, current, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            const login = await loginOf(orgId, id, data, current);
            if (login.status) return { statusCode: login.status, headers, body: JSON.stringify({ error: login.error, field: login.field }) };
            if (!login.keep) updates.userId = login.userId;

            const fields = [
                'firstName','lastName','email','phone','employmentType',
                'status','homeZip','licenseLevel','laborRate','overtimeRate','assignedVehicleId',
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
            await auditAs(orgId, userId, { action: 'dispatch_technician.updated', entityType: 'dispatch_technician', entityId: updated.id, entityName: techName(updated), detail: `${updated.employmentType || 'employee'} · ${updated.status || 'active'}` });
            return { statusCode: 200, headers, body: JSON.stringify({ technician: normalise({ ...updated, memberId: await memberIdOf(orgId, updated.userId) }) }) };
        }

        // ── DELETE: remove technician ─────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const params = event.queryStringParameters || {};
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param required' }) };

            const [gone] = await db.delete(dispatchTechnicians)
                .where(and(eq(dispatchTechnicians.id, id), eq(dispatchTechnicians.orgId, orgId)))
                .returning({ id: dispatchTechnicians.id, firstName: dispatchTechnicians.firstName, lastName: dispatchTechnicians.lastName, email: dispatchTechnicians.email });
            if (gone) await auditAs(orgId, userId, { action: 'dispatch_technician.deleted', entityType: 'dispatch_technician', entityId: gone.id, entityName: techName(gone), detail: null });

            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('dispatch-technicians error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'dispatch-technicians') };
    }
};
