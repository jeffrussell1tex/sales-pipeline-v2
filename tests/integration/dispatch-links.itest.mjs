// tests/integration/dispatch-links.itest.mjs
//
// Dispatch's links name live rows of this org (state §0.201 — batch 4b-1 of OPEN_ITEMS §1 item 1; Jeff, 14 Oct:
// "Three batches, Dispatch first", "Any row of the org", "Fix it in 4b-1", "Org check, no self-link"). Against
// the test database: a job's crew, vehicle, reserved units, service plan, follow-up and parent job; a technician's
// vehicle and login; a vehicle's technician; an equipment unit's holder; a customer's plan and preferred
// technician; a plan visit's plan; a time-off block's technician — each write naming one that org B holds, or
// that no row holds, is refused 404 in the kind's words, naming the field, and nothing is written. A job never
// names itself (400). A link the row already holds is never asked again — another org's, stored before 4b-1 —
// and a job's lead and co-technicians are one crew. Any row of the org counts: an inactive plan too. A login
// is a member of THIS org, picked by their app id (the screen) and stored as their Clerk identity — that
// member's sign-in then finds the row; one not signed in yet, or one another technician holds, is refused. A
// time-off block stays with its technician on a re-POST. An Admin's restore clears Dispatch's strays on the rows
// it restored — a login no member of the org has too — returns a unit whose holder it cleared to the shelf,
// reads a list a file carries as a string, and counts a location's customer and a line item's and a history
// entry's job. Org B's rows are as seeded at the end.
//
// The auth mock fakes the SIGN-IN only (link-ids.itest.mjs's pattern); every handler, gate and query is the
// real one.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || `clerk_itest_dlinks_${userRole}_${orgId}`;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// No outbound email, text, webhook or automation.
const anyTemplate = new Proxy({}, { get: () => () => ({ subject: '', html: '', text: '' }) });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: anyTemplate },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: anyTemplate, normalizePhone: (p) => p },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const FN = {};
for (const name of ['dispatch-jobs', 'dispatch-technicians', 'dispatch-vehicles', 'dispatch-equipment', 'dispatch-customers',
                    'dispatch-plan-visits', 'dispatch-schedule-blocks', 'backup']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const { settings, users, dispatchTechnicians, dispatchVehicles, dispatchEquipment, dispatchServicePlans, dispatchCustomers,
        dispatchServiceLocations, dispatchJobs, dispatchJobLineItems, dispatchJobStatusHistory, dispatchPlanVisits,
        dispatchScheduleBlocks, backups, auditLog } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { notInOrg, namesItself } = await import('../../src/utils/linkIds.js');
const { LOGIN_NOT_IN_ORG, LOGIN_NOT_AN_ID } = await import('../../src/utils/techLogin.js');

// ORG NAMESPACE: this file owns 'itest_dlinks_*' — its two orgs, every row id it writes (ids are global
// keys), its members' Clerk ids and 'usr_itest_dlinks_*' member ids — and ONLY this file writes to it
// (guide §18b25).
const A = 'itest_dlinks_A', B = 'itest_dlinks_B';
const ORGS = [A, B];
const ID = (s) => 'itest_dlinks_' + s;

// Org A's members: the Admin who calls; Tess, free to link; Ivy, invited and not signed in yet; Hal, linked to
// T2. Org B's: Bea, linked to T_B. Members' ids are app ids (usr_…); their logins are Clerk ids.
const USR_ADMIN = 'usr_itest_dlinks_admin', USR_TESS = 'usr_itest_dlinks_tess', USR_IVY = 'usr_itest_dlinks_ivy', USR_HAL = 'usr_itest_dlinks_hal', USR_B = 'usr_itest_dlinks_b';
const CLERK_ADMIN = 'clerk_itest_dlinks_admin', CLERK_TESS = 'clerk_itest_dlinks_tess', CLERK_HAL = 'clerk_itest_dlinks_hal', CLERK_B = 'clerk_itest_dlinks_b';
const CLERK_GONE = 'clerk_itest_dlinks_gone';   // a login no member of either org has
const ADMIN = { user: CLERK_ADMIN, role: 'Admin' };

// Org A: three technicians, one holding Hal's login; two vehicles, two units, two plans (one inactive), a
// customer, two jobs, a time-off block. Org B: one of each. GONE names no row anywhere.
const T1 = ID('t1'), T2 = ID('t2'), T3 = ID('t3'), T_B = ID('t_b');
const V1 = ID('v1'), V_B = ID('v_b');
const E1 = ID('e1'), E2 = ID('e2'), E_B = ID('e_b');
const P1 = ID('p1'), P_OFF = ID('p_off'), P_B = ID('p_b');
const CU1 = ID('cu1'), CU_B = ID('cu_b');
const J1 = ID('j1'), J2 = ID('j2'), J_B = ID('j_b');
const BL1 = ID('bl1'), BL_B = ID('bl_b');
const GONE = ID('gone');
// Org A's rows stored before 4b-1, each holding stray links (never asked again).
const T_HELD = ID('t_held'), V_HELD = ID('v_held'), E_HELD = ID('e_held'), CU_HELD = ID('cu_held'), J_HELD = ID('j_held');

const call = async (name, who, method, body, qs, org = A) => {
    const res = await FN[name]({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': who.role, 'x-test-user': who.user, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: qs || {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const one = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];
const refused = (r, kind, field) => {
    assert.equal(r.status, 404, `${field}: ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body, { error: notInOrg(kind), field }, field);
};

const TABLES = [dispatchJobStatusHistory, dispatchJobLineItems, dispatchPlanVisits, dispatchScheduleBlocks, dispatchJobs,
                dispatchServiceLocations, dispatchCustomers, dispatchServicePlans, dispatchEquipment, dispatchVehicles,
                dispatchTechnicians, users, backups, auditLog, settings];
const cleanup = async () => {
    for (const t of TABLES) await db.delete(t).where(inArray(t.orgId, ORGS));
};

// Org B's rows, whole — taken once seeded, compared at the end.
const B_TABLES = { users, dispatchTechnicians, dispatchVehicles, dispatchEquipment, dispatchServicePlans, dispatchCustomers,
                   dispatchJobs, dispatchPlanVisits, dispatchScheduleBlocks };
const bRows = async () => {
    const out = {};
    for (const [name, t] of Object.entries(B_TABLES)) {
        out[name] = (await db.select().from(t).where(eq(t.orgId, B))).sort((x, y) => x.id.localeCompare(y.id));
    }
    return out;
};
let bSeeded;

before(async () => {
    await cleanup();
    await db.insert(settings).values([
        { id: 'settings_' + A, orgId: A, extra: { dispatchEnabled: true } },
        { id: 'settings_' + B, orgId: B, extra: { dispatchEnabled: true } },
    ]);
    await db.insert(users).values([
        { id: USR_ADMIN, orgId: A, clerkUserId: CLERK_ADMIN, name: 'Ada Dlinks', email: 'ada@itest-dlinks.local', role: 'Admin' },
        { id: USR_TESS, orgId: A, clerkUserId: CLERK_TESS, name: 'Tess Dlinks', email: 'tess@itest-dlinks.local', role: 'Technician' },
        { id: USR_IVY, orgId: A, clerkUserId: null, name: 'Ivy Dlinks', email: 'ivy@itest-dlinks.local', role: 'Technician' },
        { id: USR_HAL, orgId: A, clerkUserId: CLERK_HAL, name: 'Hal Dlinks', email: 'hal@itest-dlinks.local', role: 'Technician' },
        { id: USR_B, orgId: B, clerkUserId: CLERK_B, name: 'Bea Dlinks', email: 'bea@itest-dlinks.local', role: 'Technician' },
    ]);
    await db.insert(dispatchTechnicians).values([
        { id: T1, orgId: A, firstName: 'Tom', lastName: 'One' },
        { id: T2, orgId: A, firstName: 'Second', lastName: 'Tech', userId: CLERK_HAL },
        { id: T3, orgId: A, firstName: 'Tia', lastName: 'Three' },
        { id: T_HELD, orgId: A, firstName: 'Held', lastName: 'Tech', assignedVehicleId: V_B, userId: CLERK_GONE },
        { id: T_B, orgId: B, firstName: 'Bo', lastName: 'B', userId: CLERK_B },
    ]);
    await db.insert(dispatchVehicles).values([
        { id: V1, orgId: A, name: 'Van one' },
        { id: V_HELD, orgId: A, name: 'Held van', assignedTechId: T_B },
        { id: V_B, orgId: B, name: 'B van', assignedTechId: T_B },
    ]);
    await db.insert(dispatchEquipment).values([
        { id: E1, orgId: A, name: 'Gauge' },
        { id: E2, orgId: A, name: 'Lift' },
        { id: E_HELD, orgId: A, name: 'Held meter', status: 'checked_out', checkedOutToId: T_B, checkedOutJobId: J_B },
        { id: E_B, orgId: B, name: 'B meter' },
    ]);
    await db.insert(dispatchServicePlans).values([
        { id: P1, orgId: A, name: 'Gold' },
        { id: P_OFF, orgId: A, name: 'Retired plan', active: false },
        { id: P_B, orgId: B, name: 'B plan' },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: CU1, orgId: A, name: 'Links Customer' },
        { id: CU_HELD, orgId: A, name: 'Held Customer', servicePlanId: P_B, preferredTechId: T_B },
        { id: CU_B, orgId: B, name: 'B Customer', servicePlanId: P_B, preferredTechId: T_B },
    ]);
    // A crew list as the app stores it — a jsonb string (guide §18b62.4) — which the server reads as a list.
    await db.insert(dispatchJobs).values([
        { id: J1, orgId: A, customerId: CU1, title: 'Job one' },
        { id: J2, orgId: A, customerId: CU1, title: 'Job two' },
        { id: J_HELD, orgId: A, customerId: CU1, title: 'Held job', assignedTechId: T_B, coTechIds: JSON.stringify([T1]), assignedVehicleId: V_B,
          assignedEquipmentIds: JSON.stringify([E_B]), servicePlanId: P_B, followUpJobId: J_B, parentJobId: GONE },
        { id: J_B, orgId: B, customerId: CU_B, title: 'B job', assignedTechId: T_B },
    ]);
    await db.insert(dispatchScheduleBlocks).values([
        { id: BL1, orgId: A, techId: T1, startDate: '2026-11-02', endDate: '2026-11-02', title: 'Dentist', createdBy: 'Seeded Author' },
        { id: BL_B, orgId: B, techId: T_B, startDate: '2026-11-02', endDate: '2026-11-02', title: 'B leave' },
    ]);
    invalidateRoster();
    bSeeded = await bRows();
});

after(cleanup);

// ── 1. A job ─────────────────────────────────────────────────────────────────

test("a job's crew, vehicle, units, plan and linked jobs: a create naming org B's, or none, is refused 404 in the kind's words, naming the field — nothing written", async () => {
    const cases = [
        [{ assignedTechId: T_B }, 'technician', 'assignedTechId'],
        [{ coTechIds: [T1, T_B] }, 'technician', 'coTechIds'],
        [{ assignedVehicleId: GONE }, 'vehicle', 'assignedVehicleId'],
        [{ assignedEquipmentIds: [E1, E_B] }, 'equipment', 'assignedEquipmentIds'],
        [{ servicePlanId: P_B }, 'plan', 'servicePlanId'],
        [{ followUpJobId: J_B }, 'job', 'followUpJobId'],
        [{ parentJobId: GONE }, 'job', 'parentJobId'],
    ];
    for (const [i, [extra, kind, field]] of cases.entries()) {
        const id = ID('jn' + i);
        refused(await call('dispatch-jobs', ADMIN, 'POST', { id, customerId: CU1, title: 'Refused', ...extra }), kind, field);
        assert.equal(await one(dispatchJobs, id), undefined, `${field}: nothing written`);
    }
});

test('a job never names itself — a create its own id, an update its own row: 400, nothing written; any row of the org counts, an inactive plan too', async () => {
    let r = await call('dispatch-jobs', ADMIN, 'POST', { id: ID('j_self'), customerId: CU1, title: 'Self', parentJobId: ID('j_self') });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: namesItself('job'), field: 'parentJobId' });
    assert.equal(await one(dispatchJobs, ID('j_self')), undefined, 'nothing written');
    r = await call('dispatch-jobs', ADMIN, 'PUT', { followUpJobId: J1 }, { id: J1 });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: namesItself('job'), field: 'followUpJobId' });
    assert.equal((await one(dispatchJobs, J1)).followUpJobId, null, 'unchanged');

    r = await call('dispatch-jobs', ADMIN, 'POST', { id: ID('j_ok'), customerId: CU1, title: 'OK', assignedTechId: T1, coTechIds: [T2], assignedVehicleId: V1,
        assignedEquipmentIds: [E1], servicePlanId: P_OFF, followUpJobId: J2, parentJobId: J1 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = await one(dispatchJobs, ID('j_ok'));
    assert.deepEqual([row.assignedTechId, row.coTechIds, row.assignedVehicleId, row.assignedEquipmentIds, row.servicePlanId, row.followUpJobId, row.parentJobId],
        [T1, [T2], V1, [E1], P_OFF, J2, J1], "each this org's; a plan no longer active is still the org's (E3: \"Any row of the org\")");
});

test("a job's lead and co-technicians are one crew: a swap within the crew it holds is not asked — another org's technician stored before 4b-1 included — and a technician named anew is", async () => {
    let r = await call('dispatch-jobs', ADMIN, 'PUT', { assignedTechId: T1, coTechIds: [T_B] }, { id: J_HELD });
    assert.equal(r.status, 200, `the lead and a co-tech swapped: ${JSON.stringify(r.body)}`);
    let row = await one(dispatchJobs, J_HELD);
    assert.deepEqual([row.assignedTechId, row.coTechIds], [T1, [T_B]]);
    r = await call('dispatch-jobs', ADMIN, 'PUT', { assignedTechId: T_B, coTechIds: [T1] }, { id: J_HELD });
    assert.equal(r.status, 200, `swapped back — the stray co-tech made lead again, held through the crew (the review): ${JSON.stringify(r.body)}`);
    row = await one(dispatchJobs, J_HELD);
    assert.deepEqual([row.assignedTechId, row.coTechIds], [T_B, [T1]]);

    r = await call('dispatch-jobs', ADMIN, 'PUT', { coTechIds: [T_B, T3] }, { id: J_HELD });
    assert.equal(r.status, 200, `one added, of this org: ${JSON.stringify(r.body)}`);
    assert.deepEqual((await one(dispatchJobs, J_HELD)).coTechIds, [T_B, T3]);
    refused(await call('dispatch-jobs', ADMIN, 'PUT', { coTechIds: [T_B, T3, GONE] }, { id: J_HELD }), 'technician', 'coTechIds');
    assert.deepEqual((await one(dispatchJobs, J_HELD)).coTechIds, [T_B, T3], 'unchanged');

    r = await call('dispatch-jobs', ADMIN, 'PUT', { title: 'Held job, edited', assignedVehicleId: V_B, assignedEquipmentIds: [E_B], servicePlanId: P_B, followUpJobId: J_B, parentJobId: GONE }, { id: J_HELD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(dispatchJobs, J_HELD);
    assert.deepEqual([row.title, row.assignedVehicleId, row.assignedEquipmentIds, row.servicePlanId, row.followUpJobId, row.parentJobId],
        ['Held job, edited', V_B, [E_B], P_B, J_B, GONE], 'held: kept');

    r = await call('dispatch-jobs', ADMIN, 'PUT', { assignedVehicleId: V1 }, { id: J_HELD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    refused(await call('dispatch-jobs', ADMIN, 'PUT', { assignedVehicleId: V_B }, { id: J_HELD }), 'vehicle', 'assignedVehicleId');
    assert.equal((await one(dispatchJobs, J_HELD)).assignedVehicleId, V1, 'a link let go is not held any more');
});

// ── 2. A technician ──────────────────────────────────────────────────────────

test("a technician's vehicle is this org's — a create and an update; one held is kept; org B's technician is not found", async () => {
    refused(await call('dispatch-technicians', ADMIN, 'POST', { id: ID('t_new'), firstName: 'New', lastName: 'Tech', assignedVehicleId: V_B }), 'vehicle', 'assignedVehicleId');
    assert.equal(await one(dispatchTechnicians, ID('t_new')), undefined, 'nothing written');
    refused(await call('dispatch-technicians', ADMIN, 'PUT', { assignedVehicleId: GONE }, { id: T1 }), 'vehicle', 'assignedVehicleId');
    assert.equal((await one(dispatchTechnicians, T1)).assignedVehicleId, null, 'unchanged');
    let r = await call('dispatch-technicians', ADMIN, 'PUT', { assignedVehicleId: V1 }, { id: T1 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(dispatchTechnicians, T1)).assignedVehicleId, V1);

    r = await call('dispatch-technicians', ADMIN, 'PUT', { notes: 'held, edited', assignedVehicleId: V_B, userId: CLERK_GONE }, { id: T_HELD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(dispatchTechnicians, T_HELD);
    assert.deepEqual([row.notes, row.assignedVehicleId, row.userId], ['held, edited', V_B, CLERK_GONE], "held: kept — a login no member has too");
    assert.equal(r.body.technician.memberId, null, 'a login no member of the org has names no member');

    r = await call('dispatch-technicians', ADMIN, 'PUT', { notes: 'from A' }, { id: T_B });
    assert.equal(r.status, 404, "org B's technician: not found in A");
});

test("a technician's login: the screen's pick — a member's app id — is stored as their Clerk identity, the answer and the list name the member, and their sign-in finds the row", async () => {
    const r = await call('dispatch-technicians', ADMIN, 'POST', { id: ID('t_tess'), firstName: 'Tess', lastName: 'Field', userId: USR_TESS });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(dispatchTechnicians, ID('t_tess'))).userId, CLERK_TESS, 'the Clerk identity a sign-in is matched against — never the app id');
    assert.deepEqual([r.body.technician.userId, r.body.technician.memberId], [CLERK_TESS, USR_TESS], "the answer names the member: the screen's picker shows them");

    const list = await call('dispatch-technicians', ADMIN, 'GET');
    assert.equal(list.status, 200);
    const memberOf = Object.fromEntries(list.body.technicians.map((t) => [t.id, t.memberId]));
    assert.deepEqual([memberOf[ID('t_tess')], memberOf[T2], memberOf[T_HELD], memberOf[T1]], [USR_TESS, USR_HAL, null, null]);

    const own = await call('dispatch-technicians', { user: CLERK_TESS, role: 'Technician' }, 'GET');
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.deepEqual(own.body.technicians.map((t) => t.id), [ID('t_tess')], "Tess's sign-in finds her row — linked on the screen, she was refused on every Dispatch screen");
});

test('a login is refused: a member of another org — by app id or Clerk identity — one not signed in yet, one another technician holds, a value that is not text; nothing written', async () => {
    const tx = ID('t_x');
    const post = (userId) => call('dispatch-technicians', ADMIN, 'POST', { id: tx, firstName: 'X', lastName: 'Tech', userId });
    for (const [userId, status, error] of [
        [USR_B, 404, LOGIN_NOT_IN_ORG],
        [CLERK_B, 404, LOGIN_NOT_IN_ORG],
        ['usr_itest_dlinks_nobody', 404, LOGIN_NOT_IN_ORG],
        [USR_IVY, 409, 'Ivy Dlinks has not signed in yet — link them once they have accepted their invitation.'],
        [USR_HAL, 409, 'Hal Dlinks is already linked to Second Tech — unlink them there first.'],
        [CLERK_HAL, 409, 'Hal Dlinks is already linked to Second Tech — unlink them there first.'],
        [7, 400, LOGIN_NOT_AN_ID],
    ]) {
        const r = await post(userId);
        assert.equal(r.status, status, `${userId}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error, field: 'userId' }, String(userId));
        assert.equal(await one(dispatchTechnicians, tx), undefined, `${userId}: nothing written`);
    }
    const r = await call('dispatch-technicians', ADMIN, 'PUT', { userId: USR_TESS }, { id: T3 });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'Tess Dlinks is already linked to Tess Field — unlink them there first.', field: 'userId' });
    assert.equal((await one(dispatchTechnicians, T3)).userId, null, 'unchanged');
});

test('a login held is never asked again — re-sent by either id, or left out of a re-POST — and an unlink frees it for another technician', async () => {
    let r = await call('dispatch-technicians', ADMIN, 'PUT', { notes: 'kept', userId: CLERK_HAL }, { id: T2 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await call('dispatch-technicians', ADMIN, 'PUT', { userId: USR_HAL }, { id: T2 });
    assert.equal(r.status, 200, `its own member, by app id — the technician holding it is itself: ${JSON.stringify(r.body)}`);
    assert.equal((await one(dispatchTechnicians, T2)).userId, CLERK_HAL);
    r = await call('dispatch-technicians', ADMIN, 'POST', { id: T2, firstName: 'Second', lastName: 'Tech' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(dispatchTechnicians, T2)).userId, CLERK_HAL, 'the create is an upsert: a login left out is kept');

    r = await call('dispatch-technicians', ADMIN, 'PUT', { userId: null }, { id: ID('t_tess') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([(await one(dispatchTechnicians, ID('t_tess'))).userId, r.body.technician.memberId], [null, null], 'unlinked');
    r = await call('dispatch-technicians', ADMIN, 'PUT', { userId: USR_TESS }, { id: T3 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([(await one(dispatchTechnicians, T3)).userId, r.body.technician.memberId], [CLERK_TESS, USR_TESS]);
});

// ── 3. A vehicle, a unit, a customer ─────────────────────────────────────────

test("a vehicle's technician is this org's — a create and an update; one held is kept, a re-POST too; org B's vehicle is not found", async () => {
    refused(await call('dispatch-vehicles', ADMIN, 'POST', { id: ID('v_new'), name: 'New van', assignedTechId: T_B }), 'technician', 'assignedTechId');
    assert.equal(await one(dispatchVehicles, ID('v_new')), undefined, 'nothing written');
    let r = await call('dispatch-vehicles', ADMIN, 'POST', { id: ID('v_ok'), name: 'OK van', assignedTechId: T1 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    refused(await call('dispatch-vehicles', ADMIN, 'PUT', { assignedTechId: GONE }, { id: ID('v_ok') }), 'technician', 'assignedTechId');
    assert.equal((await one(dispatchVehicles, ID('v_ok'))).assignedTechId, T1, 'unchanged');

    r = await call('dispatch-vehicles', ADMIN, 'PUT', { name: 'Held van, edited', assignedTechId: T_B }, { id: V_HELD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([(await one(dispatchVehicles, V_HELD)).name, (await one(dispatchVehicles, V_HELD)).assignedTechId], ['Held van, edited', T_B], 'held: kept');
    r = await call('dispatch-vehicles', ADMIN, 'POST', { id: V_HELD, name: 'Held van', assignedTechId: T_B });
    assert.equal(r.status, 201, `the create is an upsert: what it holds is not asked — ${JSON.stringify(r.body)}`);

    r = await call('dispatch-vehicles', ADMIN, 'PUT', { assignedTechId: T1 }, { id: V_B });
    assert.equal(r.status, 404, "org B's vehicle: not found in A");
});

test("an equipment unit's holder is this org's — a create, a check-out naming both, an edit; one held is kept; a check-in asks nothing", async () => {
    refused(await call('dispatch-equipment', ADMIN, 'POST', { id: ID('e_new'), name: 'Meter', checkedOutToId: T_B }), 'technician', 'checkedOutToId');
    assert.equal(await one(dispatchEquipment, ID('e_new')), undefined, 'nothing written');
    refused(await call('dispatch-equipment', ADMIN, 'PUT', { checkedOutToId: T1, checkedOutJobId: J_B }, { id: E1, action: 'checkout' }), 'job', 'checkedOutJobId');
    let row = await one(dispatchEquipment, E1);
    assert.deepEqual([row.status, row.checkedOutToId, row.checkedOutJobId], ['available', null, null], 'unchanged');

    let r = await call('dispatch-equipment', ADMIN, 'PUT', { checkedOutToId: T1 }, { id: E1, action: 'checkout' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(dispatchEquipment, E1);
    assert.deepEqual([row.status, row.checkedOutToId, row.checkedOutJobId], ['checked_out', T1, null]);
    r = await call('dispatch-equipment', ADMIN, 'PUT', { checkedOutToId: GONE }, { id: E1, action: 'checkin' });
    assert.equal(r.status, 200, `a check-in names no holder, whatever its body carries (the review): ${JSON.stringify(r.body)}`);
    row = await one(dispatchEquipment, E1);
    assert.deepEqual([row.status, row.checkedOutToId, row.checkedOutJobId], ['available', null, null]);

    r = await call('dispatch-equipment', ADMIN, 'PUT', { checkedOutToId: T_B, checkedOutJobId: J_B }, { id: E_HELD, action: 'checkout' });
    assert.equal(r.status, 200, `both held: ${JSON.stringify(r.body)}`);
    refused(await call('dispatch-equipment', ADMIN, 'PUT', { checkedOutToId: GONE }, { id: E_HELD }), 'technician', 'checkedOutToId');
    assert.equal((await one(dispatchEquipment, E_HELD)).checkedOutToId, T_B, 'unchanged');
    r = await call('dispatch-equipment', ADMIN, 'PUT', { checkedOutJobId: J1, notes: 'on job one' }, { id: E2 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(dispatchEquipment, E2)).checkedOutJobId, J1);
});

test("a customer's service plan and preferred technician are this org's — a create and an update; held ones kept; an inactive plan is the org's", async () => {
    refused(await call('dispatch-customers', ADMIN, 'POST', { id: ID('cu_new'), name: 'New', servicePlanId: P_B }), 'plan', 'servicePlanId');
    refused(await call('dispatch-customers', ADMIN, 'POST', { id: ID('cu_new'), name: 'New', preferredTechId: T_B }), 'technician', 'preferredTechId');
    assert.equal(await one(dispatchCustomers, ID('cu_new')), undefined, 'nothing written');
    let r = await call('dispatch-customers', ADMIN, 'POST', { id: ID('cu_new'), name: 'New', servicePlanId: P_OFF, preferredTechId: T1 });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    refused(await call('dispatch-customers', ADMIN, 'PUT', { preferredTechId: GONE }, { id: CU1 }), 'technician', 'preferredTechId');
    assert.equal((await one(dispatchCustomers, CU1)).preferredTechId, null, 'unchanged');
    r = await call('dispatch-customers', ADMIN, 'PUT', { servicePlanId: P1, preferredTechId: T2 }, { id: CU1 });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    r = await call('dispatch-customers', ADMIN, 'PUT', { name: 'Held Customer, edited', servicePlanId: P_B, preferredTechId: T_B }, { id: CU_HELD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(dispatchCustomers, CU_HELD);
    assert.deepEqual([row.name, row.servicePlanId, row.preferredTechId], ['Held Customer, edited', P_B, T_B], 'held: kept');
});

// ── 4. A plan visit, a time-off block ────────────────────────────────────────

test("a plan visit's plan and customer are this org's — every visit names both anew; an inactive plan is the org's", async () => {
    const visit = (customerId, planId) => call('dispatch-plan-visits', ADMIN, 'POST', { customerId, planId, dueDate: '2026-11-01', action: 'skipped' });
    refused(await visit(CU1, P_B), 'plan', 'planId');
    refused(await visit(CU1, GONE), 'plan', 'planId');
    refused(await visit(CU_B, P1), 'customer', 'customerId');
    assert.equal((await db.select().from(dispatchPlanVisits).where(eq(dispatchPlanVisits.orgId, A))).length, 0, 'nothing written');
    const r = await visit(CU1, P_OFF);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.visit.planId, P_OFF);
});

test('a time-off block names a technician of this org, and stays with it: a re-POST naming another is refused 409, never re-pointed; its author stays the first create\'s', async () => {
    refused(await call('dispatch-schedule-blocks', ADMIN, 'POST', { id: ID('bl_new'), techId: T_B, startDate: '2026-11-03' }), 'technician', 'techId');
    assert.equal(await one(dispatchScheduleBlocks, ID('bl_new')), undefined, 'nothing written');

    let r = await call('dispatch-schedule-blocks', ADMIN, 'POST', { id: BL1, techId: T2, startDate: '2026-11-02', title: 'Moved' });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'A block stays with its technician — add a new one for another.', field: 'techId' });
    let row = await one(dispatchScheduleBlocks, BL1);
    assert.deepEqual([row.techId, row.title], [T1, 'Dentist'], 'unchanged');

    r = await call('dispatch-schedule-blocks', ADMIN, 'POST', { id: BL1, techId: T1, startDate: '2026-11-02', title: 'Dentist, again' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    row = await one(dispatchScheduleBlocks, BL1);
    assert.deepEqual([row.techId, row.title, row.createdBy], [T1, 'Dentist, again', 'Seeded Author'], "its author is the first create's");

    r = await call('dispatch-schedule-blocks', ADMIN, 'POST', { id: BL_B, techId: T1, startDate: '2026-11-04' });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'That block id is already in use.' }, "an id org B holds: B's block stands");
});

// ── 5. A backup restore (E4) ─────────────────────────────────────────────────

test("a restore clears Dispatch's strays on the rows it restored — a login no member of the org has too — returns a unit it unheld to the shelf, reads a list a file carries as a string, and counts a location's customer and a line item's and a history entry's job", async () => {
    const R = (s) => ID('r_' + s);
    const at = '2026-10-01T10:00:00.000Z';
    const r = await call('backup', ADMIN, 'PATCH', { entities: { dispatch: {
        technicians: [
            { id: R('t1'), firstName: 'Rae', lastName: 'One', assignedVehicleId: V_B, userId: CLERK_B },           // both cleared
            { id: R('t2'), firstName: 'Rae', lastName: 'Two', assignedVehicleId: R('v2'), userId: CLERK_ADMIN },   // the file's vehicle, a member's login: kept
        ],
        vehicles: [
            { id: R('v1'), name: 'Restored van', assignedTechId: T_B },                                            // cleared
            { id: R('v2'), name: 'Restored truck', assignedTechId: R('t1') },                                     // the file's own: kept
        ],
        equipment: [
            { id: R('e1'), name: 'Restored meter', status: 'checked_out', checkedOutToId: T_B, checkedOutJobId: J_B, checkedOutAt: at },   // both cleared: back on the shelf
            { id: R('e2'), name: 'Restored lift', status: 'checked_out', checkedOutToId: GONE, checkedOutJobId: J1, checkedOutAt: at },    // its job stands: still out
            { id: R('e3'), name: 'Restored gauge', status: 'checked_out', checkedOutToId: T1, checkedOutAt: at },                            // nothing to clear
        ],
        customers: [
            { id: R('cu1'), name: 'Restored customer', servicePlanId: P_B, preferredTechId: T_B },                // both cleared
            { id: R('cu2'), name: 'Restored customer two', servicePlanId: P_OFF, preferredTechId: T1 },           // kept
        ],
        serviceLocations: [{ id: R('lo1'), customerId: CU_B, name: 'Restored site', address: '1 Link St', city: 'Tulsa' }],   // required: counted
        jobs: [
            { id: R('j1'), customerId: CU1, title: 'Restored job', assignedTechId: T_B, coTechIds: [T1, T_B, GONE], assignedVehicleId: V_B,
              assignedEquipmentIds: JSON.stringify([E1, E_B]), servicePlanId: P_B, followUpJobId: J_B, parentJobId: R('j2'), quoteId: GONE },
            { id: R('j2'), customerId: CU1, title: 'Restored callback', assignedTechId: R('t1'), coTechIds: JSON.stringify([T1, T_B]) },   // a list carried as a string, a stray in it
        ],
        jobLineItems: [{ id: R('li1'), jobId: J_B, description: 'Restored part', unitPrice: '1.00', totalPrice: '1.00' }],   // required: counted
        jobStatusHistory: [{ id: R('h1'), jobId: GONE, toStatus: 'scheduled' }],                                     // required: counted
    } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.errors, []);
    // technician 2 (vehicle, login) + vehicle 1 + units 3 (the meter's two holders, the lift's technician) +
    // customer 2 (plan, technician) + job 8 (lead, two co-techs, vehicle, a unit, plan, follow-up, quote) + the
    // callback 1 (a co-tech in a list the file carried as a string — read back to its list, so the clean-up reads it) = 17
    assert.deepEqual(r.body.notes, [
        '17 links that named no record of this organization were cleared.',
        "1 service location names a customer that is not in this organization — a location's customer can't be cleared, so it was left as restored.",
        "1 job line item names a job that is not in this organization — a line item's job can't be cleared, so it was left as restored.",
        "1 status-history entry names a job that is not in this organization — an entry's job can't be cleared, so it was left as restored.",
    ]);
    const logged = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'backup.restored')));
    assert.ok(logged.some((l) => String(l.detail).includes(' · 17 links cleared · 1 location with a customer not in this org · 1 line item with a job not in this org · 1 history entry with a job not in this org')),
        `the log carries the counts: ${JSON.stringify(logged.map((l) => l.detail))}`);

    const t1 = await one(dispatchTechnicians, R('t1')), t2 = await one(dispatchTechnicians, R('t2'));
    assert.deepEqual([t1.assignedVehicleId, t1.userId, t2.assignedVehicleId, t2.userId], [null, null, R('v2'), CLERK_ADMIN], "org B's member's login is no login here");
    assert.deepEqual([(await one(dispatchVehicles, R('v1'))).assignedTechId, (await one(dispatchVehicles, R('v2'))).assignedTechId], [null, R('t1')]);
    const [e1, e2, e3] = [await one(dispatchEquipment, R('e1')), await one(dispatchEquipment, R('e2')), await one(dispatchEquipment, R('e3'))];
    assert.deepEqual([e1.status, e1.checkedOutToId, e1.checkedOutJobId, e1.checkedOutAt], ['available', null, null, null], 'held by no one: on the shelf');
    assert.deepEqual([e2.status, e2.checkedOutToId, e2.checkedOutJobId], ['checked_out', null, J1], 'its job stands: still out');
    assert.equal(e3.status, 'checked_out', 'nothing cleared: as restored');
    const [c1, c2] = [await one(dispatchCustomers, R('cu1')), await one(dispatchCustomers, R('cu2'))];
    assert.deepEqual([c1.servicePlanId, c1.preferredTechId, c2.servicePlanId, c2.preferredTechId], [null, null, P_OFF, T1]);
    assert.equal((await one(dispatchServiceLocations, R('lo1'))).customerId, CU_B, "a location's customer is required: left, and counted");
    const j1 = await one(dispatchJobs, R('j1'));
    assert.deepEqual([j1.assignedTechId, j1.coTechIds, j1.assignedVehicleId, j1.assignedEquipmentIds, j1.servicePlanId, j1.followUpJobId, j1.parentJobId, j1.quoteId],
        [null, [T1], null, [E1], null, null, R('j2'), null], "the strays dropped, the rest in order; a parent the file restored is this org's; a list the file carried as a string read as its list");
    const j2 = await one(dispatchJobs, R('j2'));
    assert.deepEqual([j2.assignedTechId, j2.coTechIds], [R('t1'), [T1]], "the file's own technician kept; a list carried as a string read back to its list — its stray dropped (a jsonb string the clean-up cannot read: it stood)");
    assert.equal((await one(dispatchJobLineItems, R('li1'))).jobId, J_B, "a line item's job is required: left, and counted");
    assert.equal((await one(dispatchJobStatusHistory, R('h1'))).jobId, GONE, "a history entry's job is required: left, and counted");

    const held = await one(dispatchTechnicians, T_HELD);
    assert.deepEqual([held.assignedVehicleId, held.userId], [V_B, CLERK_GONE], 'a row the restore did not insert: untouched');
});

// ── 6. Org B ─────────────────────────────────────────────────────────────────

test("org B's rows are as seeded — every refusal, held link, 409 and restore in org A left them alone", async () => {
    assert.deepEqual(await bRows(), bSeeded);
});
