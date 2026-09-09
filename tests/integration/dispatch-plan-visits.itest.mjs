// tests/integration/dispatch-plan-visits.itest.mjs
// The recorded exceptions to a service plan's grid (state §0.110) against the
// real test database. Proves: a skip is recorded with the caller's name; a
// second decision about the same occurrence REPLACES the first (one row per
// occurrence); a deferral needs a different valid date; an unknown action, a
// malformed date and a missing plan are refused; another org's customer is a
// 404 and writes nothing; org B lists nothing of org A; DELETE is org-scoped
// and idempotent; a Technician may read but not write.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST; db/apply-plan-visits.mjs --test first)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'User';
            const userId = event.headers?.['x-test-user'] || 'clerk_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        isAppRole:    (r) => ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'].includes(r),
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole) ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (['ReadOnly', 'Technician'].includes(auth?.userRole)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            return null;
        },
    },
});

const { handler } = await import('../../netlify/functions/dispatch-plan-visits.mjs');
const { db } = await import('../../db/index.js');
const { dispatchPlanVisits, dispatchCustomers, users } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_pv_A', ORG_B = 'itest_pv_B';
const CUST_A = 'cust_itest_pv_a', CUST_B = 'cust_itest_pv_b';
const PLAN = 'plan_itest_pv';
const DISPATCHER = 'clerk_itest_pv_dispatcher';

const call = (method, org, { body, params, role, user } = {}) => handler({
    httpMethod: method,
    queryStringParameters: params || {},
    headers: { 'x-test-org': org, 'x-test-user': user || DISPATCHER, ...(role ? { 'x-test-role': role } : {}) },
    body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const rowsOf = (org) => db.select().from(dispatchPlanVisits).where(eq(dispatchPlanVisits.orgId, org));

const cleanup = async () => {
    for (const o of [ORG_A, ORG_B]) {
        await db.delete(dispatchPlanVisits).where(eq(dispatchPlanVisits.orgId, o));
        await db.delete(dispatchCustomers).where(eq(dispatchCustomers.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(dispatchCustomers).values([
        { id: CUST_A, orgId: ORG_A, name: 'Itest Plant A', customerType: 'commercial', servicePlanId: PLAN, planStartDate: '2026-01-01' },
        { id: CUST_B, orgId: ORG_B, name: 'Itest Plant B', customerType: 'commercial', servicePlanId: PLAN, planStartDate: '2026-01-01' },
    ]);
    await db.insert(users).values([
        { id: 'usr_itest_pv_dispatcher', orgId: ORG_A, clerkUserId: DISPATCHER, name: 'Itest Dispatcher', email: 'dispatcher@itest-pv.local', role: 'User' },
    ]);
    invalidateRoster();
});

after(async () => { await cleanup(); });

test('a skip is recorded for the occurrence with the caller\'s name', async () => {
    const r = parse(await call('POST', ORG_A, { body: { customerId: CUST_A, planId: PLAN, dueDate: '2026-04-02', action: 'skipped', reason: 'Customer declined' } }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.visit.action, 'skipped');
    assert.equal(r.body.visit.dueDate, '2026-04-02');
    assert.equal(r.body.visit.deferredTo, null);
    assert.equal(r.body.visit.reason, 'Customer declined');
    assert.equal(r.body.visit.byName, 'Itest Dispatcher');
    assert.equal(r.body.visit.byUserId, 'usr_itest_pv_dispatcher');
    assert.ok(r.body.visit.id.startsWith('pv_'));
    const list = parse(await call('GET', ORG_A));
    assert.equal(list.status, 200);
    assert.equal(list.body.visits.length, 1);
});

test('a second decision about the same occurrence replaces the first — one row per occurrence', async () => {
    const r = parse(await call('POST', ORG_A, { body: { customerId: CUST_A, planId: PLAN, dueDate: '2026-04-02', action: 'deferred', deferredTo: '2026-05-15' } }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.visit.action, 'deferred');
    assert.equal(r.body.visit.deferredTo, '2026-05-15');
    assert.equal(r.body.visit.reason, null, 'the earlier reason does not carry over');
    const rows = await rowsOf(ORG_A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'deferred');
    // A different occurrence is a second row.
    const r2 = parse(await call('POST', ORG_A, { body: { customerId: CUST_A, planId: PLAN, dueDate: '2026-07-02', action: 'skipped' } }));
    assert.equal(r2.status, 201);
    assert.equal((await rowsOf(ORG_A)).length, 2);
    const mine = parse(await call('GET', ORG_A, { params: { customerId: CUST_A } }));
    assert.equal(mine.body.visits.length, 2);
});

test('refusals: unknown action, malformed dates, a deferral to its own date, a missing plan', async () => {
    const bad = async (body) => parse(await call('POST', ORG_A, { body })).status;
    assert.equal(await bad({ customerId: CUST_A, planId: PLAN, dueDate: '2026-04-02', action: 'postponed' }), 400);
    assert.equal(await bad({ customerId: CUST_A, planId: PLAN, dueDate: '2026-4-2', action: 'skipped' }), 400);
    assert.equal(await bad({ customerId: CUST_A, planId: PLAN, dueDate: '2026-04-02', action: 'deferred' }), 400, 'deferred needs deferredTo');
    assert.equal(await bad({ customerId: CUST_A, planId: PLAN, dueDate: '2026-04-02', action: 'deferred', deferredTo: '2026-02-30' }), 400, 'a date that does not exist');
    assert.equal(await bad({ customerId: CUST_A, planId: PLAN, dueDate: '2026-04-02', action: 'deferred', deferredTo: '2026-04-02' }), 400, 'deferring to the same day changes nothing');
    assert.equal(await bad({ customerId: CUST_A, dueDate: '2026-04-02', action: 'skipped' }), 400, 'planId required');
    assert.equal((await rowsOf(ORG_A)).length, 2, 'nothing was written');
});

test('another org\'s customer is a 404 and writes nothing; org B lists nothing of org A', async () => {
    const r = parse(await call('POST', ORG_A, { body: { customerId: CUST_B, planId: PLAN, dueDate: '2026-04-02', action: 'skipped' } }));
    assert.equal(r.status, 404);
    assert.equal((await rowsOf(ORG_A)).length, 2);
    assert.equal((await rowsOf(ORG_B)).length, 0);
    const listB = parse(await call('GET', ORG_B));
    assert.equal(listB.status, 200);
    assert.deepEqual(listB.body.visits, []);
});

test('a Technician may read the exceptions but not record one', async () => {
    assert.equal(parse(await call('GET', ORG_A, { role: 'Technician' })).status, 200);
    const r = parse(await call('POST', ORG_A, { role: 'Technician', body: { customerId: CUST_A, planId: PLAN, dueDate: '2026-10-01', action: 'skipped' } }));
    assert.equal(r.status, 403);
    assert.equal((await rowsOf(ORG_A)).length, 2);
});

test('DELETE undoes one record, is org-scoped, and a second delete is a 404', async () => {
    const [target] = (await rowsOf(ORG_A)).filter(v => v.dueDate === '2026-07-02');
    assert.equal(parse(await call('DELETE', ORG_B, { params: { id: target.id } })).status, 404, 'org B cannot delete org A\'s record');
    assert.equal((await rowsOf(ORG_A)).length, 2);
    assert.equal(parse(await call('DELETE', ORG_A, { params: { id: target.id } })).status, 200);
    assert.equal((await rowsOf(ORG_A)).length, 1);
    assert.equal(parse(await call('DELETE', ORG_A, { params: { id: target.id } })).status, 404);
    assert.equal(parse(await call('DELETE', ORG_A, { role: 'Technician', params: { id: 'pv_any' } })).status, 403);
});
