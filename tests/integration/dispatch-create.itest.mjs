// tests/integration/dispatch-create.itest.mjs
// §0.290 against the real test database (OPEN_ITEMS §4.8, §0.289's found (1); Jeff, 23 Nov: "Fix New Job resend"): New Job
// sends up to three creates — a customer, its address, the job — and keeps each id after an answer that proved nothing, so a
// press again sends the same create (§0.263). Each was an upsert of the whole row: another member's change in between — a
// job scheduled and given a crew, a customer marked do-not-service, an address's gate code — was written over by the
// create's values, unchecked. Now each is a create: an id this org holds is 409 code 'idInUse' with the row as stored,
// nothing written, before any link is asked; another org's id the words alone.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.URL = 'https://itest-dispatch-create.example.com';
delete process.env.APP_URL;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers['x-test-user'] || 'clerk_itest_dispatch_create', orgId, userRole: event.headers['x-test-role'] || 'Dispatcher', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (o) => { mails.push(o); return { success: true, id: 'test' }; },
        emailTemplates: {
            customerAppointmentConfirmed: (d) => ({ subject: `CONFIRM ${d.jobTitle}`, html: '<p></p>' }),
            customerTechOnTheWay:         (d) => ({ subject: `ONTHEWAY ${d.jobTitle}`, html: '<p></p>' }),
        },
    },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']) delete process.env[k];

// The staged landing: once, when armed, the moment the press's first read of its own id answers (the look), before the handler
// goes on. The landing writes by execute(), never through the then it holds.
let armed = null;
const { QueryPromise } = await import('drizzle-orm');
const realThen = QueryPromise.prototype.then;
QueryPromise.prototype.then = function (ok, bad) {
    if (armed && typeof this.toSQL === 'function' && /^select /.test(this.toSQL().sql) && /from "dispatch_(jobs|customers|service_locations)"/.test(this.toSQL().sql)) {
        const h = armed; armed = null;
        return realThen.call(this, async (rows) => { await h(); return rows; }).then(ok, bad);
    }
    return realThen.call(this, ok, bad);
};
const { db } = await import('../../db/index.js');
const { handler: jobsFn } = await import('../../netlify/functions/dispatch-jobs.mjs');
const { handler: custFn } = await import('../../netlify/functions/dispatch-customers.mjs');
const { settings, dispatchJobs, dispatchJobStatusHistory, dispatchCustomers, dispatchServiceLocations, dispatchTechnicians, accounts, auditLog } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_dispatch_create_*', and only this file writes to it.
const A = 'itest_dispatch_create_A';
const B = 'itest_dispatch_create_B';
const ID = (t) => `itest_dispatch_create_${t}`;
const CUST = { [A]: ID('cust_a'), [B]: ID('cust_b') };
const ACCT = ID('acct'), TAKEN = ID('acct_taken');

const post = (fn, body, { org = A, qs = {}, role = 'Dispatcher', user = 'clerk_itest_dispatch_create_one' } = {}) => fn({
    httpMethod: 'POST', headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body), queryStringParameters: qs,
}).then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }));
const LOC = { qs: { resource: 'locations' } };
const rowOf = async (table, id, org = A) => (await db.select().from(table).where(and(eq(table.id, id), eq(table.orgId, org))))[0];
const historyOf = async (id) => (await db.select().from(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.jobId, id))).map((h) => [h.fromStatus, h.toStatus, h.note]);
const auditsOf = async (id) => (await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, id)))).map((a) => a.action).sort();

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.orgId, o));
        await db.delete(dispatchJobs).where(eq(dispatchJobs.orgId, o));
        await db.delete(dispatchServiceLocations).where(eq(dispatchServiceLocations.orgId, o));
        await db.delete(dispatchCustomers).where(eq(dispatchCustomers.orgId, o));
        await db.delete(dispatchTechnicians).where(eq(dispatchTechnicians.orgId, o));
        await db.delete(accounts).where(eq(accounts.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
    }
};
before(async () => {
    await cleanup();
    await db.insert(settings).values([A, B].map((o) => ({ id: 'settings_' + o, orgId: o, companyName: 'Itest Create ' + o, extra: { dispatchEnabled: true, customerNotifications: { enabled: true, statusLink: true } } })));
    await db.insert(dispatchCustomers).values([A, B].map((o) => ({ id: CUST[o], orgId: o, name: 'Itest Create Customer', customerNumber: 'CUST-0900', contactEmail: 'c@itest-dispatch-create.local', customerType: 'commercial' })));
    await db.insert(dispatchTechnicians).values({ id: ID('tech'), orgId: A, firstName: 'Itest', lastName: 'Tech' });
    await db.insert(accounts).values([{ id: ACCT, orgId: A, name: 'Itest Create Account' }, { id: TAKEN, orgId: A, name: 'Itest Create Taken' }]);
});
after(async () => { armed = null; QueryPromise.prototype.then = realThen; await cleanup(); });

// The body New Job sends.
const JOB = (id, more = {}) => ({ id, customerId: CUST[A], locationId: null, accountId: null, title: 'Boiler', trade: null, jobType: null, priority: 'normal', status: 'unscheduled',
    durationMinutes: 120, crewSize: 1, minLicense: null, needSkills: [], scheduledDate: null, opportunityId: null, equipmentIds: [], requiredVehicleType: null, servicePlanId: null, planDueDate: null, ...more });

test("a job created, its answer lost, scheduled by another member, sent again: 409 'idInUse' with the job as stored — nothing written, no move, no audit, no notice", async () => {
    const id = ID('job');
    const first = await post(jobsFn, JOB(id));
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const moved = { status: 'scheduled', scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact', assignedTechId: ID('tech'), techNotes: 'Gate 4' };
    await db.update(dispatchJobs).set({ ...moved, updatedAt: new Date() }).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A)));
    const stands = await rowOf(dispatchJobs, id);
    mails.length = 0;
    const again = await post(jobsFn, JOB(id), { user: 'clerk_itest_dispatch_create_two' });
    assert.deepEqual(await rowOf(dispatchJobs, id), stands, 'REGRESSION: a New Job sent again wrote over another member\'s schedule');
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.deepEqual([again.body.code, again.body.error], ['idInUse', 'That job id is already in use.']);
    assert.deepEqual([again.body.job.id, again.body.job.status, again.body.job.scheduledStart, again.body.job.assignedTechId, again.body.job.coTechIds], [id, 'scheduled', '08:00', ID('tech'), []], 'the job as stored, read as a GET reads it');
    assert.deepEqual(await historyOf(id), [[null, 'unscheduled', 'Job created']]);
    assert.deepEqual(await auditsOf(id), ['dispatch_job.created']);
    assert.equal(mails.length, 0);
});

test('a customer and an address sent again over another member\'s edits: 409 idInUse with each as stored, nothing written', async () => {
    const cid = ID('cust_new'), lid = ID('loc_new');
    assert.equal((await post(custFn, { id: cid, name: 'New Co', accountId: null })).status, 201);
    await db.update(dispatchCustomers).set({ doNotService: true, doNotServiceReason: 'Unpaid', contactName: 'Ann', name: 'New Co Ltd' }).where(and(eq(dispatchCustomers.id, cid), eq(dispatchCustomers.orgId, A)));
    const cust = await rowOf(dispatchCustomers, cid);
    const c2 = await post(custFn, { id: cid, name: 'New Co', accountId: null });
    assert.deepEqual(await rowOf(dispatchCustomers, cid), cust, 'REGRESSION: a customer created again lost its do-not-service');
    assert.deepEqual([c2.status, c2.body.code, c2.body.error], [409, 'idInUse', 'That customer id is already in use.']);
    assert.deepEqual([c2.body.customer.id, c2.body.customer.name, c2.body.customer.doNotService, c2.body.customer.contactName], [cid, 'New Co Ltd', true, 'Ann']);
    assert.deepEqual(await auditsOf(cid), ['dispatch_customer.created']);

    const body = { id: lid, customerId: cid, name: '1 Elm', address: '1 Elm', city: 'Reno', state: null, zip: null, isDefault: true };
    assert.equal((await post(custFn, body, LOC)).status, 201);
    await db.update(dispatchServiceLocations).set({ gateCode: '4411', notes: 'Dog' }).where(and(eq(dispatchServiceLocations.id, lid), eq(dispatchServiceLocations.orgId, A)));
    const loc = await rowOf(dispatchServiceLocations, lid);
    const audits = await auditsOf(cid);
    const l2 = await post(custFn, { ...body, isDefault: false }, LOC);
    assert.deepEqual(await rowOf(dispatchServiceLocations, lid), loc, 'REGRESSION: an address created again lost its gate code');
    assert.deepEqual([l2.status, l2.body.code, l2.body.error, l2.body.location.id, l2.body.location.gateCode], [409, 'idInUse', 'That location id is already in use.', lid, '4411']);
    assert.deepEqual(await auditsOf(cid), audits);
});

test('an id held answers before any link is asked: an account, a customer or a customer\'s account gone or taken since is no refusal of a create that landed', async () => {
    const id = ID('job_links'), cid = ID('cust_links'), gone = ID('cust_gone'), lid = ID('loc_links');
    assert.equal((await post(jobsFn, JOB(id, { accountId: ACCT }))).status, 201);
    assert.equal((await post(custFn, { id: cid, name: 'Linked', accountId: ACCT })).status, 201);
    assert.equal((await post(custFn, { id: gone, name: 'Gone' })).status, 201);
    assert.equal((await post(custFn, { id: lid, customerId: gone, name: 'x', address: 'x', city: 'y' }, LOC)).status, 201);
    await db.update(dispatchJobs).set({ accountId: null }).where(eq(dispatchJobs.id, id));
    await db.update(dispatchCustomers).set({ accountId: null }).where(eq(dispatchCustomers.id, cid));
    await db.delete(accounts).where(and(eq(accounts.id, ACCT), eq(accounts.orgId, A)));
    await db.delete(dispatchCustomers).where(and(eq(dispatchCustomers.id, gone), eq(dispatchCustomers.orgId, A)));
    assert.ok(await rowOf(dispatchServiceLocations, lid), 'the location stands without its customer (no foreign key)');
    // A customer whose account another customer stands for since: it was made first, and is answered as made.
    const tid = ID('cust_taken');
    assert.equal((await post(custFn, { id: tid, name: 'Taken', accountId: TAKEN })).status, 201);
    await db.update(dispatchCustomers).set({ accountId: null }).where(eq(dispatchCustomers.id, tid));
    assert.equal((await post(custFn, { id: ID('cust_taker'), name: 'Taker', accountId: TAKEN })).status, 201);
    for (const [fn, body, opts] of [[jobsFn, JOB(id, { accountId: ACCT }), {}], [custFn, { id: cid, name: 'Linked', accountId: ACCT }, {}],
        [custFn, { id: lid, customerId: gone, name: 'x', address: 'x', city: 'y' }, LOC], [custFn, { id: tid, name: 'Taken', accountId: TAKEN }, {}]]) {
        const r = await post(fn, body, opts);
        assert.deepEqual([r.status, r.body.code], [409, 'idInUse'], JSON.stringify(r.body));
    }
    // Not held, a link named that is not this org's is still the 404, and an account taken the 409 naming who holds it.
    const taken = await post(custFn, { id: ID('cust_taken_new'), name: 'Taken', accountId: TAKEN });
    assert.deepEqual([taken.status, taken.body.field, taken.body.code], [409, 'accountId', undefined]);
    const r = await post(jobsFn, JOB(ID('job_links_new'), { accountId: ACCT }));
    assert.deepEqual([r.status, r.body.field], [404, 'accountId']);
});

test('two of one create at once, a few times over: one lands, the other is idInUse with it — one row, one number, one "Job created", one audit', async () => {
    for (let k = 0; k < 4; k++) {
        const id = ID('job_pair' + k), cid = ID('cust_pair' + k), lid = ID('loc_pair' + k);
        for (const [fn, body, opts, key, table] of [[jobsFn, JOB(id), {}, 'job', dispatchJobs], [custFn, { id: cid, name: 'Pair ' + k }, {}, 'customer', dispatchCustomers],
            [custFn, { id: lid, customerId: CUST[A], name: 'x', address: 'x', city: 'y' }, LOC, 'location', dispatchServiceLocations]]) {
            const two = await Promise.all([post(fn, body, opts), post(fn, body, opts)]);
            assert.deepEqual(two.map((r) => r.status).sort(), [201, 409], JSON.stringify(two.map((r) => r.body)));
            const locAudits = (await auditsOf(CUST[A])).filter((a) => a === 'dispatch_location.created').length;
            if (key === 'location') assert.equal(locAudits, k + 1, 'one audit a location');
            const won = two.find((r) => r.status === 201).body[key], lost = two.find((r) => r.status === 409).body;
            assert.equal(lost.code, 'idInUse');
            assert.equal(lost[key].id, won.id);
            const stored = await rowOf(table, body.id);
            for (const n of ['jobNumber', 'customerNumber']) if (n in won) assert.deepEqual([won[n], lost[key][n]], [stored[n], stored[n]], 'REGRESSION: the second press\'s number over the first\'s');
        }
        assert.deepEqual(await historyOf(id), [[null, 'unscheduled', 'Job created']]);
        assert.deepEqual(await auditsOf(id), ['dispatch_job.created']);
        assert.deepEqual(await auditsOf(cid), ['dispatch_customer.created']);
    }
});

test("another org's id is refused in the words alone — no code, no row, nothing written in either org", async () => {
    const id = ID('job_b'), cid = ID('cust_b2'), lid = ID('loc_b');
    assert.equal((await post(jobsFn, JOB(id, { customerId: CUST[B], title: "B's" }), { org: B })).status, 201);
    assert.equal((await post(custFn, { id: cid, name: "B's" }, { org: B })).status, 201);
    assert.equal((await post(custFn, { id: lid, customerId: CUST[B], name: "B's", address: 'x', city: 'y' }, { org: B, qs: LOC.qs })).status, 201);
    const bs = [await rowOf(dispatchJobs, id, B), await rowOf(dispatchCustomers, cid, B), await rowOf(dispatchServiceLocations, lid, B)];
    for (const [fn, body, opts, words] of [[jobsFn, JOB(id), {}, 'That job id is already in use.'], [custFn, { id: cid, name: "A's" }, {}, 'That customer id is already in use.'],
        [custFn, { id: lid, customerId: CUST[A], name: "A's", address: 'x', city: 'y' }, LOC, 'That location id is already in use.']]) {
        const r = await post(fn, body, opts);
        assert.deepEqual([r.status, r.body], [409, { error: words }]);
    }
    assert.deepEqual([await rowOf(dispatchJobs, id, B), await rowOf(dispatchCustomers, cid, B), await rowOf(dispatchServiceLocations, lid, B)], bs);
    for (const [t, i] of [[dispatchJobs, id], [dispatchCustomers, cid], [dispatchServiceLocations, lid]]) assert.equal(await rowOf(t, i, A), undefined);
    assert.deepEqual([await historyOf(id), await auditsOf(id), await auditsOf(cid)], [[[null, 'unscheduled', 'Job created']], [], []]);
});

test('creates of different ids at once all land, each its own number — a number taken meanwhile is tried again, never a create that wrote nothing', async () => {
    const jobs = await Promise.all([0, 1, 2, 3].map((k) => post(jobsFn, JOB(ID('job_many' + k)))));
    assert.deepEqual(jobs.map((r) => r.status), [201, 201, 201, 201], JSON.stringify(jobs.map((r) => r.body)));
    assert.equal(new Set(jobs.map((r) => r.body.job.jobNumber)).size, 4);
    const custs = await Promise.all([0, 1, 2, 3].map((k) => post(custFn, { id: ID('cust_many' + k), name: 'Many ' + k })));
    assert.deepEqual(custs.map((r) => r.status), [201, 201, 201, 201], JSON.stringify(custs.map((r) => r.body)));
    assert.equal(new Set(custs.map((r) => r.body.customer.customerNumber)).size, 4);
});

test('a job created already scheduled confirms its appointment once — not again when the create is sent again, nor by the other of two at once', async () => {
    const at = { status: 'scheduled', scheduledDate: '2026-11-27', scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', assignedTechId: ID('tech') };
    mails.length = 0;
    const id = ID('job_told');
    assert.equal((await post(jobsFn, JOB(id, at))).status, 201);
    assert.equal(mails.length, 1, 'told once');
    const { publicToken } = await rowOf(dispatchJobs, id);
    assert.ok(publicToken);
    assert.equal((await post(jobsFn, JOB(id, at))).status, 409);
    const pair = ID('job_told_pair');
    const two = await Promise.all([post(jobsFn, JOB(pair, at)), post(jobsFn, JOB(pair, at))]);
    assert.deepEqual(two.map((r) => r.status).sort(), [201, 409]);
    assert.equal(mails.length, 2, 'REGRESSION: a create sent again told the customer again');
    assert.equal((await rowOf(dispatchJobs, id)).publicToken, publicToken);
});

// The other of two at once, staged: the winner's row lands after the press's own look for it — at its link check — so the
// insert finds the id taken and the answer is the second look's.
test('a create that lands between the press\'s look and its insert: idInUse with it, read after the insert wrote nothing', async () => {
    for (const [fn, body, opts, key, table, row] of [
        [jobsFn, JOB(ID('job_between')), {}, 'job', dispatchJobs, { id: ID('job_between'), orgId: A, jobNumber: 'JOB-BETWEEN-1', customerId: CUST[A], title: 'Theirs', status: 'unscheduled' }],
        [custFn, { id: ID('cust_between'), name: 'Mine' }, {}, 'customer', dispatchCustomers, { id: ID('cust_between'), orgId: A, customerNumber: 'CUST-BETWEEN-1', name: 'Theirs', customerType: 'commercial' }],
        [custFn, { id: ID('loc_between'), customerId: CUST[A], name: 'Mine', address: 'x', city: 'y' }, LOC, 'location', dispatchServiceLocations, { id: ID('loc_between'), orgId: A, customerId: CUST[A], name: 'Theirs', address: '9', city: 'z' }]]) {
        let landed = false;
        armed = async () => { await db.insert(table).values(row).execute(); landed = true; };
        const r = await post(fn, body, opts);
        assert.equal(landed, true, key + ': it landed after the look');
        assert.deepEqual([r.status, r.body.code, r.body[key]?.id], [409, 'idInUse', body.id], JSON.stringify(r.body));
        assert.equal((await rowOf(table, body.id))[key === 'job' ? 'title' : 'name'], 'Theirs', 'nothing written over it');
    }
});
