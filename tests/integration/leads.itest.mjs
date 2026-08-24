// tests/integration/leads.itest.mjs
// Org-isolation for leads — including the regression guard for the clear-delete
// bug we fixed: org A clearing its leads must NOT wipe org B's leads.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: 'u_' + orgId, orgId, userRole: 'Admin', managedReps: [], error: null };
        },
        canSeeAll: () => true,
    },
});
// Webhooks / automations fire on lead create; stub them so the test makes no
// outbound calls and stays focused on org isolation.
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const { handler } = await import('../../netlify/functions/leads.mjs');
const { db } = await import('../../db/index.js');
const { leads } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

const A = 'itest_org_A', B = 'itest_org_B';
const ev = (org, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const get = async (org) => JSON.parse((await handler(ev(org, 'GET'))).body).leads || [];
const cleanup = async () => { for (const o of [A, B]) await db.delete(leads).where(eq(leads.orgId, o)); };

before(cleanup);
after(cleanup);

test('read isolation — A cannot see B leads', async () => {
    await handler(ev(A, 'POST', { id: 'lead_A1', firstName: 'A', source: 'Referral', status: 'New' }));
    await handler(ev(B, 'POST', { id: 'lead_B1', firstName: 'B', source: 'Referral', status: 'New' }));
    const ids = (await get(A)).map(l => l.id);
    assert.ok(ids.includes('lead_A1') && !ids.includes('lead_B1'), 'A sees only its own leads');
});

test('REGRESSION — A clearing its leads must NOT delete B\'s leads', async () => {
    await handler(ev(A, 'POST', { id: 'lead_A2', firstName: 'A2', status: 'New' }));
    await handler(ev(B, 'POST', { id: 'lead_B2', firstName: 'B2', status: 'New' }));
    await handler(ev(A, 'DELETE', null, { clear: 'true' }));   // the previously-unscoped path
    const bLeads = await get(B);
    assert.ok(bLeads.some(l => l.id === 'lead_B2'), 'org B\'s leads MUST survive org A\'s clear');
});

test('cross-tenant write — A cannot overwrite B\'s lead via upsert with B\'s id', async () => {
    await handler(ev(B, 'POST', { id: 'lead_B3', firstName: 'B Original', status: 'New' }));
    await handler(ev(A, 'PUT', { id: 'lead_B3', firstName: 'HACKED', status: 'Working' }));
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_B3'));
    assert.equal(row.firstName, 'B Original', 'B\'s lead must be unchanged by A');
    assert.equal(row.orgId, B);
});

// ── Bulk insert (the CSV importer's path) ────────────────────────────────────
// These cover 0.23. The importer has always POSTed an ARRAY, and this endpoint
// had no Array.isArray branch, so every leads CSV import returned
// 400 'id is required' before touching the database. Nothing caught it: the
// unit suites each import a single module, and this file only ever POSTed one
// lead at a time. Both halves were internally coherent; the contract between
// them was not tested.

test('REGRESSION — an ARRAY body inserts every row instead of returning 400', async () => {
    const batch = [
        { id: 'lead_A_bulk1', firstName: 'Bulk', lastName: 'One',   status: 'New',       source: 'Referral', assignedTo: 'Rep One' },
        { id: 'lead_A_bulk2', firstName: 'Bulk', lastName: 'Two',   status: 'Contacted', source: 'Web Form', assignedTo: 'Rep One' },
        { id: 'lead_A_bulk3', firstName: 'Bulk', lastName: 'Three', status: 'New',       source: 'Referral', assignedTo: '' },
    ];
    const res = await handler(ev(A, 'POST', batch));
    assert.equal(res.statusCode, 201, 'an array body must be accepted, not rejected as a single row');

    const body = JSON.parse(res.body);
    assert.equal(body.inserted, 3, 'every row in the batch should land');

    // bulkClient.postNew partitions landed-vs-failed by insertedIds. Without it
    // the client falls back to a count and reports rows as saved by position,
    // so this key is part of the contract, not an implementation detail.
    assert.ok(Array.isArray(body.insertedIds), 'the response must carry insertedIds');
    assert.deepEqual([...body.insertedIds].sort(), batch.map(b => b.id).sort());

    const ids = (await get(A)).map(l => l.id);
    for (const b of batch) assert.ok(ids.includes(b.id), b.id + ' should be readable after import');
});

test('REGRESSION — a blank assignedTo stays unassigned, never filled with the importer', async () => {
    // The opportunities importer does `salesRep || currentUser`, which makes an
    // unassigned deal impossible to create from a CSV. Leads must not acquire
    // the same behaviour: rep scoping treats null assignedTo as visible-to-all,
    // and the delete-gate fixture depends on genuinely unowned rows existing.
    await handler(ev(A, 'POST', [{ id: 'lead_A_bulk4', firstName: 'Unowned', status: 'New', assignedTo: '' }]));
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_A_bulk4'));
    assert.ok(!row.assignedTo, 'a blank Assigned To must remain blank, not become the caller');
});

test('a bulk row without an id is refused for the whole batch, not silently dropped', async () => {
    const res = await handler(ev(A, 'POST', [
        { id: 'lead_A_bulk5', firstName: 'Has Id', status: 'New' },
        { firstName: 'No Id', status: 'New' },
    ]));
    assert.equal(res.statusCode, 400, 'a batch containing an id-less row must be refused');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_A_bulk5'));
    assert.ok(!row, 'nothing from a refused batch may be written');
});

test('an empty array is a no-op, not an error', async () => {
    const res = await handler(ev(A, 'POST', []));
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).inserted, 0);
});

test('bulk insert is org-scoped — B cannot see rows A imported', async () => {
    await handler(ev(A, 'POST', [{ id: 'lead_A_bulk6', firstName: 'Scoped', status: 'New' }]));
    const ids = (await get(B)).map(l => l.id);
    assert.ok(!ids.includes('lead_A_bulk6'), 'a bulk-imported row must not leak across orgs');
});
