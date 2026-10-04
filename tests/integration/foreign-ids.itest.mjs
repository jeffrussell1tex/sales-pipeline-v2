// tests/integration/foreign-ids.itest.mjs
// An id another org holds (state §0.166 — the cross-org audit's lower findings),
// against the real test database. Ids are global keys, so a write naming one
// that org B holds reaches an org-scoped upsert that writes nothing — and some
// endpoints went on: a document create wrote its version and link rows against
// B's document, a job create wrote a status-history row against B's job, and the
// rest crashed on the missing row (a 500 that told the caller the id was taken
// elsewhere). A member's id was the client's, so a create could adopt any id.
//
// Proves, as org A's Admin against org B's rows: a new member's id is the
// server's, never the one sent; a document create is refused for B's id and for
// A's own, writing no version or link, and takes only the key the server issues;
// a job create is refused for B's id before any status history; a line item and
// a location belong to one of A's jobs and customers; the other dispatch creates
// answer 409, not a crash; a PUT naming B's record answers 404 — and B's rows
// never change.
//
// The auth mock fakes the SIGN-IN only (dispatch-access.itest.mjs's pattern);
// every handler, gate and query is the real one.
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
            return { userId: `clerk_itest_fid_${userRole}_${orgId}`, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// The job endpoint pulls the senders in; nothing here is scheduled, so nothing sends.
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: {} },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const FN = {};
for (const name of ['users', 'documents', 'dispatch-jobs', 'dispatch-customers', 'dispatch-vehicles', 'contacts', 'tasks', 'spiff-claims', 'products']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { settings, users, documents, documentVersions, documentLinks, dispatchJobs, dispatchJobStatusHistory, dispatchJobLineItems,
        dispatchCustomers, dispatchServiceLocations, dispatchVehicles, contacts, tasks, spiffClaims, products, auditLog } = schema;
const { eq, and, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_fid_*' (rows, ids, emails).
const A = 'itest_fid_A';
const B = 'itest_fid_B';
const ORGS = [A, B];

const call = async (name, org, method, body, qs, role = 'Admin') => {
    const res = await FN[name]({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': role, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: qs || {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const one = async (table, id, org) => (await db.select().from(table).where(and(eq(table.id, id), eq(table.orgId, org))))[0];

const cleanup = async () => {
    for (const t of [documentLinks, documentVersions, documents, dispatchJobStatusHistory, dispatchJobLineItems, dispatchJobs,
                     dispatchServiceLocations, dispatchCustomers, dispatchVehicles, contacts, tasks, spiffClaims, products, users, auditLog, settings]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

before(async () => {
    await cleanup();
    const now = new Date();
    await db.insert(settings).values(ORGS.map((o) => ({ id: 'settings_' + o, orgId: o, extra: { dispatchEnabled: true } })));
    // Org B's rows — what A's writes must never reach.
    await db.insert(users).values([
        { id: 'usr_itest_fid_b', orgId: B, name: 'Bee Member', email: 'b@itest-fid.local', role: 'User' },
        // A's Admin as the mock signs them in — the name a document is owned by.
        { id: 'usr_itest_fid_a_admin', orgId: A, clerkUserId: `clerk_itest_fid_Admin_${A}`, name: 'Ada Fid', email: 'ada@itest-fid.local', role: 'Admin' },
    ]);
    await db.insert(documents).values({ id: 'doc_itest_fid_b', orgId: B, name: 'B doc', storageKey: `${B}/doc_itest_fid_b/v1/b.pdf`, uploadedAt: now, modifiedAt: now, createdAt: now, updatedAt: now });
    await db.insert(dispatchCustomers).values([
        { id: 'cust_itest_fid_b', orgId: B, name: 'B Customer' },
        { id: 'cust_itest_fid_a', orgId: A, name: 'A Customer' },
    ]);
    await db.insert(dispatchJobs).values([
        { id: 'job_itest_fid_b', orgId: B, customerId: 'cust_itest_fid_b', title: 'B job', jobNumber: 'JOB-ITEST-B', status: 'unscheduled' },
        { id: 'job_itest_fid_a', orgId: A, customerId: 'cust_itest_fid_a', title: 'A job', jobNumber: 'JOB-ITEST-A', status: 'unscheduled' },
    ]);
    await db.insert(dispatchJobLineItems).values({ id: 'li_itest_fid_b', orgId: B, jobId: 'job_itest_fid_b', description: 'B part', unitPrice: '1', totalPrice: '1' });
    await db.insert(dispatchVehicles).values({ id: 'veh_itest_fid_b', orgId: B, name: 'B van' });
    await db.insert(contacts).values({ id: 'con_itest_fid_b', orgId: B, firstName: 'Bea', lastName: 'Contact' });
    await db.insert(tasks).values({ id: 'tsk_itest_fid_b', orgId: B, title: 'B task' });
    await db.insert(spiffClaims).values({ id: 'spf_itest_fid_b', orgId: B, spiffId: 'spiff_itest_fid', repName: 'B Rep' });
    await db.insert(products).values({ id: 'prd_itest_fid_b', orgId: B, name: 'B product', listPrice: '10' });
});

after(cleanup);

test('a new member\'s id is the server\'s — one naming another org\'s member is not adopted, and that member is untouched', async () => {
    const r = await call('users', A, 'POST', { id: 'usr_itest_fid_b', name: 'Mallory', email: 'mallory@itest-fid.local', role: 'User' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.notEqual(r.body.user.id, 'usr_itest_fid_b', 'REGRESSION: a create adopts the id it is sent');
    assert.match(r.body.user.id, /^usr_[0-9a-f-]{36}$/, 'the server mints it');
    const b = await one(users, 'usr_itest_fid_b', B);
    assert.equal(b.name, 'Bee Member', 'org B\'s member is untouched');
    const plain = await call('users', A, 'POST', { name: 'No Id', email: 'noid@itest-fid.local', role: 'User' });
    assert.equal(plain.status, 201);
    assert.match(plain.body.user.id, /^usr_[0-9a-f-]{36}$/);
});

test('a document create never takes over an id — another org\'s or this org\'s — writes no version or link for it, and takes only the key the server issues', async () => {
    const link = [{ type: 'account', recordId: 'acc_itest_fid', name: 'Some account' }];
    const foreign = await call('documents', A, 'POST', { id: 'doc_itest_fid_b', name: 'Mallory doc', storageKey: `${A}/doc_itest_fid_b/v1/m.pdf`, links: link }, { action: 'create' });
    assert.equal(foreign.status, 409, JSON.stringify(foreign.body));
    const strayV = await db.select().from(documentVersions).where(eq(documentVersions.documentId, 'doc_itest_fid_b'));
    const strayL = await db.select().from(documentLinks).where(eq(documentLinks.documentId, 'doc_itest_fid_b'));
    assert.equal(strayV.length, 0, 'REGRESSION: a version row is written against another org\'s document');
    assert.equal(strayL.length, 0, 'REGRESSION: a link row is written against another org\'s document');
    assert.equal((await one(documents, 'doc_itest_fid_b', B)).name, 'B doc', 'org B\'s document is untouched');

    const mine = await call('documents', A, 'POST', { id: 'doc_itest_fid_a', name: 'A doc', storageKey: `${A}/doc_itest_fid_a/v1/a.pdf`, links: link }, { action: 'create' });
    assert.equal(mine.status, 201, JSON.stringify(mine.body));
    const again = await call('documents', A, 'POST', { id: 'doc_itest_fid_a', name: 'A doc again', storageKey: `${A}/doc_itest_fid_a/v1/a.pdf` }, { action: 'create' });
    assert.equal(again.status, 409, 'an id this org holds is refused too');
    const versions = await db.select().from(documentVersions).where(and(eq(documentVersions.orgId, A), eq(documentVersions.documentId, 'doc_itest_fid_a')));
    assert.equal(versions.length, 1, 'no second version 1');
    assert.equal((await one(documents, 'doc_itest_fid_a', A)).name, 'A doc', 'and no overwrite');
    // Owned by the caller's roster name — verifyAuth never carried one, so every
    // document and version read "Unknown" (found in the §0.166 pane check).
    assert.equal(mine.body.document.ownerName, 'Ada Fid', 'REGRESSION: a document is owned by "Unknown"');
    assert.equal(versions[0].byName, 'Ada Fid', 'and so is its first version');

    for (const key of [`${A}/doc_itest_fid_a2/v2/a.pdf`, `${A}/doc_itest_fid_a2/a.pdf`, `${A}/doc_itest_fid_a2/v1/x/a.pdf`, `${B}/doc_itest_fid_a2/v1/a.pdf`]) {
        const r = await call('documents', A, 'POST', { id: 'doc_itest_fid_a2', name: 'Odd key', storageKey: key }, { action: 'create' });
        assert.equal(r.status, 400, `REGRESSION: a key the server never issues is taken — ${key}`);
    }
});

test('a job create naming another org\'s job is refused before any status history — and a line item belongs to one of this org\'s jobs', async () => {
    const r = await call('dispatch-jobs', A, 'POST', { id: 'job_itest_fid_b', customerId: 'cust_itest_fid_a', title: 'Mallory job' });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    const stray = await db.select().from(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.jobId, 'job_itest_fid_b'));
    assert.equal(stray.length, 0, 'REGRESSION: a status-history row is written against another org\'s job');
    assert.equal((await one(dispatchJobs, 'job_itest_fid_b', B)).title, 'B job', 'org B\'s job is untouched');

    const forJobB = await call('dispatch-jobs', A, 'POST', { id: 'li_itest_fid_new', jobId: 'job_itest_fid_b', description: 'Mallory part' }, { resource: 'lineitems' });
    assert.equal(forJobB.status, 404, 'REGRESSION: a line item is filed against another org\'s job');
    assert.equal((await db.select().from(dispatchJobLineItems).where(eq(dispatchJobLineItems.id, 'li_itest_fid_new'))).length, 0);
    const takenId = await call('dispatch-jobs', A, 'POST', { id: 'li_itest_fid_b', jobId: 'job_itest_fid_a', description: 'Mallory part' }, { resource: 'lineitems' });
    assert.equal(takenId.status, 409, 'REGRESSION: a line item id another org holds crashes (a 500 that says it exists)');
    assert.equal((await one(dispatchJobLineItems, 'li_itest_fid_b', B)).description, 'B part');
});

test('the other dispatch creates answer 409 for another org\'s id, not a crash — and a location belongs to one of this org\'s customers', async () => {
    const veh = await call('dispatch-vehicles', A, 'POST', { id: 'veh_itest_fid_b', name: 'Mallory van' });
    assert.equal(veh.status, 409, 'REGRESSION: a create naming another org\'s id crashes — a 500 that says the id exists');
    assert.equal((await one(dispatchVehicles, 'veh_itest_fid_b', B)).name, 'B van');
    const cust = await call('dispatch-customers', A, 'POST', { id: 'cust_itest_fid_b', name: 'Mallory Customer' });
    assert.equal(cust.status, 409);
    assert.equal((await one(dispatchCustomers, 'cust_itest_fid_b', B)).name, 'B Customer');
    const loc = await call('dispatch-customers', A, 'POST', { id: 'loc_itest_fid_new', customerId: 'cust_itest_fid_b', name: 'Mallory site', address: '1 Main', city: 'Town' }, { resource: 'locations' });
    assert.equal(loc.status, 404, 'REGRESSION: a location is filed under another org\'s customer');
    assert.equal((await db.select().from(dispatchServiceLocations).where(eq(dispatchServiceLocations.id, 'loc_itest_fid_new'))).length, 0);
});

test('a PUT naming another org\'s record answers 404 and changes nothing', async () => {
    // Spiff claims and products upserted with no lookup first, then crashed on the
    // missing row — a 500 that said the record existed elsewhere (§0.166).
    const spf = await call('spiff-claims', A, 'PUT', { id: 'spf_itest_fid_b', spiffId: 'spiff_itest_fid', repName: 'Mallory', status: 'pending' });
    assert.equal(spf.status, 404, 'REGRESSION: a PUT for another org\'s claim crashes');
    assert.equal((await one(spiffClaims, 'spf_itest_fid_b', B)).repName, 'B Rep');
    const prd = await call('products', A, 'PUT', { id: 'prd_itest_fid_b', name: 'Mallory product', listPrice: 1 });
    assert.equal(prd.status, 404, 'REGRESSION: a PUT for another org\'s product crashes');
    assert.equal((await one(products, 'prd_itest_fid_b', B)).name, 'B product');
    // These were already strictly updates — the record looked up in the org first.
    const con = await call('contacts', A, 'PUT', { id: 'con_itest_fid_b', firstName: 'Mallory', lastName: 'Contact' });
    assert.equal(con.status, 404);
    assert.equal((await one(contacts, 'con_itest_fid_b', B)).firstName, 'Bea');
    const tsk = await call('tasks', A, 'PUT', { id: 'tsk_itest_fid_b', title: 'Mallory task' });
    assert.equal(tsk.status, 404);
    assert.equal((await one(tasks, 'tsk_itest_fid_b', B)).title, 'B task');
});
