// tests/integration/dispatch-customer.itest.mjs
//
// A pick is saved as the record picked — Dispatch's customer (state §0.214; batch 2 of OPEN_ITEMS §1 item 1; Jeff,
// 28 Oct: "Refuse, name both", "Refuse it"). Against the test database, through the real handlers:
//   I1  quote -> job on a deal two customers stand for by its account (a merge's leftover): 409, both named by
//       number, nothing written — no job, no customer, no audit row.
//   I2  quote -> job on the unit's deal, where only the site (its twin, one name) has a customer: a customer is made
//       for the unit — the site's is never taken by its name.
//   I3  quote -> job on a deal with no account id, two customers of its name (punctuation aside): 409 by name.
//   I4  quote -> job on a deal whose account has no customer, beside one typed as "Acme Inc" for "Acme, Inc." and
//       linked to nothing: that customer — no second one made.
//   I5  the customer create: a second customer for an account another customer of this org stands for — 409 naming
//       it, nothing written; the same customer re-POSTed (an upsert holding the account) saves; org B's customer on
//       its own account of the same name is no bar.
//   I6  the customer edit: linking an account another customer stands for — 409, nothing written; a save of other
//       fields on a customer whose account another already shares (stored before §0.214) is never asked again.
//   I7  org B's rows are as seeded.
//   I8  quote -> job on a deal with no account id whose name is one live account's, that account's customer of
//       another name: that customer — as the placeholder finds it (the review: the server read no accounts and
//       made a second, unlinked customer).
//   I9  quote -> job on a deal with no account id whose one live account has no customer, beside a customer of the
//       deal's name linked to ANOTHER account: a customer made for the deal's own account, the job on it — never
//       on the other account.
//   I10 quote -> job on a deal still on a merged-away account by id: the customer of the account it was merged into.
//   I11 quote -> job on a deal with no account id whose name only accounts merged into two others have: 409, the
//       accounts named, nothing written — never a customer of the merged-away name.
//
// The auth mock fakes the SIGN-IN only (dispatch-links.itest.mjs's pattern); every handler, gate and query is the
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
            const userId = event.headers?.['x-test-user'] || `clerk_itest_dcust_${orgId}`;
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

const { handler: toJob } = await import('../../netlify/functions/quote-to-job.mjs');
const { handler: custFn } = await import('../../netlify/functions/dispatch-customers.mjs');
const { db } = await import('../../db/index.js');
const { settings, users, accounts, opportunities, quotes, dispatchCustomers, dispatchJobs, dispatchJobLineItems,
        dispatchJobStatusHistory, auditLog } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_dcust_*' — its two orgs, every row id it writes (ids are global keys) and its
// members' ids — and ONLY this file writes to it (guide §18b25).
const A = 'itest_dcust_A', B = 'itest_dcust_B';
const ORGS = [A, B];
const ID = (s) => 'itest_dcust_' + s;
const CLERK_A = 'clerk_itest_dcust_admin', CLERK_B = 'clerk_itest_dcust_b';

// Org A: Shell, its unit and its site (one name); Resinall, which a merge left with two customers; Acme, Inc., with a
// customer typed as "Acme Inc" and linked to nothing; Lone Star, no customer. Org B: its own Resinall and customer.
const SHELL = ID('acc_shell'), UNIT = ID('acc_unit'), SITE = ID('acc_site'), RESINALL = ID('acc_resinall'),
      ACME = ID('acc_acme'), LONE = ID('acc_lone'), B_ACCT = ID('acc_b'),
      FIELD = ID('acc_field'), NORTH = ID('acc_north'), NORTH_HOLD = ID('acc_north_hold'),
      SURV = ID('acc_surv'), OLD = ID('acc_old'), GHOST1 = ID('acc_ghost1'), GHOST2 = ID('acc_ghost2');
const C_SITE = ID('c_site'), C_RES = ID('c_res'), C_RES_INC = ID('c_res_inc'), C_ACME = ID('c_acme'),
      C_TWIN1 = ID('c_twin1'), C_TWIN2 = ID('c_twin2'), C_B = ID('c_b'), C_FIELD = ID('c_field'), C_NORTH_HOLD = ID('c_north_hold'), C_SURV = ID('c_surv');
const D_RES = ID('d_res'), D_UNIT = ID('d_unit'), D_NOID = ID('d_noid'), D_ACME = ID('d_acme'), D_B = ID('d_b'),
      D_FIELD = ID('d_field'), D_NORTH = ID('d_north'), D_OLD = ID('d_old'), D_GHOST = ID('d_ghost'), D_GONE = ID('d_gone');
const GONE = ID('acc_deleted');   // an account id no row of the org holds — deleted since
const Q = (d) => ID('q_' + d);

const call = async (fn, method, { body, qs, org = A, user = CLERK_A } = {}) => {
    const res = await fn({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': 'Admin', 'x-test-user': user, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: qs || {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const rowsOf = (table, org = A) => db.select().from(table).where(eq(table.orgId, org));
const one = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];

const TABLES = [dispatchJobStatusHistory, dispatchJobLineItems, dispatchJobs, dispatchCustomers, quotes, opportunities, accounts, users, auditLog, settings];
const cleanup = async () => {
    for (const t of TABLES) await db.delete(t).where(inArray(t.orgId, ORGS));
};

const B_TABLES = { accounts, opportunities, quotes, dispatchCustomers, dispatchJobs };
const bRows = async () => {
    const out = {};
    for (const [name, t] of Object.entries(B_TABLES)) out[name] = (await rowsOf(t, B)).sort((x, y) => x.id.localeCompare(y.id));
    return out;
};
let bSeeded;

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(settings).values([
        { id: 'settings_' + A, orgId: A, extra: { dispatchEnabled: true } },
        { id: 'settings_' + B, orgId: B, extra: { dispatchEnabled: true } },
    ]);
    await db.insert(users).values([
        { id: 'usr_itest_dcust_admin', orgId: A, clerkUserId: CLERK_A, name: 'Ada Dcust', email: 'ada@itest-dcust.local', role: 'Admin' },
        { id: 'usr_itest_dcust_b', orgId: B, clerkUserId: CLERK_B, name: 'Bea Dcust', email: 'bea@itest-dcust.local', role: 'Admin' },
    ]);
    invalidateRoster();
    await db.insert(accounts).values([
        { id: SHELL, orgId: A, name: 'Dcust Shell', accountTier: 'account' },
        { id: UNIT, orgId: A, name: 'Dcust Shell - Port Allen', accountTier: 'business_unit', parentAccountId: SHELL },
        { id: SITE, orgId: A, name: 'Dcust Shell - Port Allen', accountTier: 'site', parentAccountId: SHELL },
        { id: RESINALL, orgId: A, name: 'Dcust Resinall', accountTier: 'account' },
        { id: ACME, orgId: A, name: 'Dcust Acme, Inc.', accountTier: 'account' },
        { id: LONE, orgId: A, name: 'Dcust Lone Star', accountTier: 'account' },
        { id: FIELD, orgId: A, name: 'Dcust Fieldco', accountTier: 'account' },
        { id: NORTH, orgId: A, name: 'Dcust North', accountTier: 'account' },
        { id: NORTH_HOLD, orgId: A, name: 'Dcust North Holdings', accountTier: 'account' },
        { id: SURV, orgId: A, name: 'Dcust Survivor', accountTier: 'account' },
        { id: OLD, orgId: A, name: 'Dcust Survivor, Inc.', accountTier: 'account', mergeArchived: true, mergedIntoId: SURV },
        { id: GHOST1, orgId: A, name: 'Dcust Ghost', accountTier: 'account', mergeArchived: true, mergedIntoId: SURV },
        { id: GHOST2, orgId: A, name: 'Dcust Ghost', accountTier: 'account', mergeArchived: true, mergedIntoId: FIELD },
        { id: B_ACCT, orgId: B, name: 'Dcust Resinall', accountTier: 'account' },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: C_SITE, orgId: A, name: 'Dcust Shell - Port Allen', accountId: SITE, customerNumber: 'CUST-0001' },
        { id: C_RES, orgId: A, name: 'Dcust Resinall', accountId: RESINALL, customerNumber: 'CUST-0002' },
        { id: C_RES_INC, orgId: A, name: 'Dcust Resinall, Inc.', accountId: RESINALL, customerNumber: 'CUST-0003' },
        { id: C_ACME, orgId: A, name: 'Dcust Acme Inc', accountId: null, customerNumber: 'CUST-0004' },
        { id: C_TWIN1, orgId: A, name: 'Dcust Twin Co', accountId: null, customerNumber: 'CUST-0005' },
        { id: C_TWIN2, orgId: A, name: 'DCUST TWIN CO.', accountId: null, customerNumber: 'CUST-0006' },
        { id: C_FIELD, orgId: A, name: 'Dcust Fieldco Service Dept', accountId: FIELD, customerNumber: 'CUST-0007' },
        { id: C_NORTH_HOLD, orgId: A, name: 'Dcust North', accountId: NORTH_HOLD, customerNumber: 'CUST-0008' },
        { id: C_SURV, orgId: A, name: 'Dcust Survivor', accountId: SURV, customerNumber: 'CUST-0009' },
        { id: C_B, orgId: B, name: 'Dcust Resinall', accountId: B_ACCT, customerNumber: 'CUST-0001' },
    ]);
    const deal = (id, org, account, accountId) => ({ id, orgId: org, pipelineId: 'pipe_itest', stage: 'Closed Won', opportunityName: `Deal ${id}`, account, accountId });
    await db.insert(opportunities).values([
        deal(D_RES, A, 'Dcust Resinall', RESINALL),
        deal(D_UNIT, A, 'Dcust Shell - Port Allen', UNIT),
        deal(D_NOID, A, 'Dcust Twin Co', null),
        deal(D_ACME, A, 'Dcust Acme, Inc.', ACME),
        deal(D_FIELD, A, 'dcust fieldco', null),
        deal(D_NORTH, A, 'Dcust North', null),
        deal(D_OLD, A, 'Dcust Survivor, Inc.', OLD),
        deal(D_GHOST, A, 'Dcust Ghost', null),
        deal(D_GONE, A, 'Dcust Gone Co', GONE),
        deal(D_B, B, 'Dcust Resinall', B_ACCT),
    ]);
    const quote = (d, org, n) => ({ id: Q(d), orgId: org, opportunityId: d, quoteNumber: `Q-DC-${n}`, version: 1, name: `Quote ${n} v1`, status: 'Accepted', lineItems: [] });
    await db.insert(quotes).values([quote(D_RES, A, 1), quote(D_UNIT, A, 2), quote(D_NOID, A, 3), quote(D_ACME, A, 4), quote(D_B, B, 5),
        quote(D_FIELD, A, 6), quote(D_NORTH, A, 7), quote(D_OLD, A, 8), quote(D_GHOST, A, 9), quote(D_GONE, A, 10)]);
    bSeeded = await bRows();
});

after(async () => { await cleanup(); });

test('I1 — quote -> job on a deal two customers stand for by its account: 409, both named by number, nothing written', async () => {
    const custBefore = (await rowsOf(dispatchCustomers)).length;
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_RES) } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error, "More than one dispatch customer is linked to this deal's account — “Dcust Resinall” (CUST-0002), “Dcust Resinall, Inc.” (CUST-0003). Unlink the wrong one under Dispatch → Customers, then create the job again.");
    assert.deepEqual(r.body.customers.map((c) => c.id).sort(), [C_RES, C_RES_INC].sort());
    assert.equal(r.body.job, undefined, 'no job carried — the quote card shows the words');
    assert.equal((await rowsOf(dispatchJobs)).length, 0, 'no job');
    assert.equal((await rowsOf(dispatchCustomers)).length, custBefore, 'no customer');
    assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'dispatch_job.created_from_quote')))).length, 0);
});

test("I2 — quote -> job on the unit's deal: the site's customer (the twin's, one name) is never taken — the unit gets its own", async () => {
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_UNIT) } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.customerCreated, true, 'REGRESSION: the job put on the site\'s customer by its name');
    assert.notEqual(r.body.job.customerId, C_SITE);
    const made = await one(dispatchCustomers, r.body.job.customerId);
    assert.deepEqual([made.orgId, made.accountId, made.name], [A, UNIT, 'Dcust Shell - Port Allen']);
    assert.equal(r.body.job.accountId, UNIT);
});

test('I3 — quote -> job on a deal with no account id, two customers of its name (case and punctuation aside): 409 by name, nothing written', async () => {
    const jobsBefore = (await rowsOf(dispatchJobs)).length;
    const custBefore = (await rowsOf(dispatchCustomers)).length;
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_NOID) } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error, "More than one dispatch customer is named “Dcust Twin Co” — “Dcust Twin Co” (CUST-0005), “DCUST TWIN CO.” (CUST-0006). The deal is linked to no account: link it to its account, or rename one of these customers under Dispatch → Customers, then create the job again.");
    assert.equal((await rowsOf(dispatchJobs)).length, jobsBefore);
    assert.equal((await rowsOf(dispatchCustomers)).length, custBefore);
});

test('I4 — quote -> job on a deal whose account has no customer: the one customer of its name linked to nothing ("Acme Inc" for "Acme, Inc.") — no second made', async () => {
    const custBefore = (await rowsOf(dispatchCustomers)).length;
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_ACME) } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.customerCreated, false, 'REGRESSION: a second "Acme" customer made — the old compare read punctuation');
    assert.equal(r.body.job.customerId, C_ACME);
    assert.equal(r.body.job.accountId, ACME, "the job carries the deal's account");
    assert.equal((await rowsOf(dispatchCustomers)).length, custBefore);
});

test('I5 — the create: a second customer for an account another customer stands for is refused, naming it; the same customer re-POSTed saves; org B is no bar', async () => {
    const before = (await rowsOf(dispatchCustomers)).length;
    const second = await call(custFn, 'POST', { body: { id: ID('c_site2'), name: 'Dcust Port Allen annex', accountId: SITE } });
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.deepEqual(second.body, { error: 'That CRM account is already in Dispatch as “Dcust Shell - Port Allen” (CUST-0001) — add this site to it as a service location instead.', field: 'accountId' });
    assert.equal(await one(dispatchCustomers, ID('c_site2')), undefined, 'nothing written');
    assert.equal((await rowsOf(dispatchCustomers)).length, before);
    // The site's own customer re-POSTed (the create is an upsert): the account it holds is not asked again.
    const again = await call(custFn, 'POST', { body: { id: C_SITE, name: 'Dcust Shell - Port Allen', accountId: SITE, notes: 'kept' } });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal((await one(dispatchCustomers, C_SITE)).notes, 'kept');
    // Lone Star has no customer: one is made.
    const lone = await call(custFn, 'POST', { body: { id: ID('c_lone'), name: 'Dcust Lone Star', accountId: LONE } });
    assert.equal(lone.status, 201, JSON.stringify(lone.body));
    // Org B's customer on its own account, of the same name as A's Resinall: a customer in B for B's account is
    // refused by B's own customer only.
    const b2 = await call(custFn, 'POST', { org: B, user: CLERK_B, body: { id: ID('c_b2'), name: 'Dcust Resinall annex', accountId: B_ACCT } });
    assert.equal(b2.status, 409, 'B refuses by its own customer');
    assert.match(b2.body.error, /“Dcust Resinall” \(CUST-0001\)/);
    assert.equal(await one(dispatchCustomers, ID('c_b2')), undefined);
});

test("I6 — the edit: linking an account another customer stands for is refused, nothing written; a customer whose account another shares (stored before §0.214) saves its other fields", async () => {
    const r = await call(custFn, 'PUT', { qs: { id: C_TWIN1 }, body: { accountId: SITE, name: 'Dcust Twin Co' } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.field, 'accountId');
    const twin = await one(dispatchCustomers, C_TWIN1);
    assert.deepEqual([twin.accountId, twin.name], [null, 'Dcust Twin Co'], 'nothing written — the name with it');
    // Resinall's two customers, stored before: each saves its other fields with the account it holds, sent whole as the
    // form sends it.
    const keep = await call(custFn, 'PUT', { qs: { id: C_RES_INC }, body: { accountId: RESINALL, notes: 'still here' } });
    assert.equal(keep.status, 200, JSON.stringify(keep.body));
    assert.equal((await one(dispatchCustomers, C_RES_INC)).notes, 'still here');
    // And linking to an account no customer holds saves.
    const free = await call(custFn, 'PUT', { qs: { id: C_TWIN2 }, body: { accountId: SHELL } });
    assert.equal(free.status, 200, JSON.stringify(free.body));
    assert.equal((await one(dispatchCustomers, C_TWIN2)).accountId, SHELL);
});

test("I8 — quote -> job on a deal with no account id: its name's one live account, that account's customer of another name — taken, none made", async () => {
    const custBefore = (await rowsOf(dispatchCustomers)).length;
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_FIELD) } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.customerCreated, false, 'REGRESSION: a second, unlinked customer made — the server read no accounts');
    assert.equal(r.body.job.customerId, C_FIELD);
    assert.equal(r.body.job.accountId, FIELD, "the account the deal stands on");
    assert.equal((await rowsOf(dispatchCustomers)).length, custBefore);
});

test("I9 — quote -> job on a deal with no account id: a customer of its name linked to ANOTHER account is never taken — one is made for the deal's own account", async () => {
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_NORTH) } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.customerCreated, true, "REGRESSION: the job put on North Holdings' customer");
    assert.notEqual(r.body.job.customerId, C_NORTH_HOLD);
    const made = await one(dispatchCustomers, r.body.job.customerId);
    assert.deepEqual([made.orgId, made.accountId, made.name], [A, NORTH, 'Dcust North']);
    assert.equal(r.body.job.accountId, NORTH, 'REGRESSION: the job on the other account');
});

test('I10 — quote -> job on a deal still on a merged-away account by id: the customer of the account it was merged into', async () => {
    const custBefore = (await rowsOf(dispatchCustomers)).length;
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_OLD) } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.customerCreated, false, 'REGRESSION: a customer made for the merged-away account');
    assert.equal(r.body.job.customerId, C_SURV);
    assert.equal(r.body.job.accountId, SURV, 'the job on the survivor');
    assert.equal((await rowsOf(dispatchCustomers)).length, custBefore);
});

test('I11 — quote -> job on a deal with no account id whose name only accounts merged into two others have: 409, the accounts named, nothing written', async () => {
    const jobsBefore = (await rowsOf(dispatchJobs)).length;
    const custBefore = (await rowsOf(dispatchCustomers)).length;
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_GHOST) } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error, '“Dcust Ghost” was merged into another account. Link the deal to its account, then create the job again.');
    assert.deepEqual(r.body.accounts.map((a) => a.id).sort(), [GHOST1, GHOST2].sort());
    assert.equal(r.body.customers, undefined);
    assert.equal((await rowsOf(dispatchJobs)).length, jobsBefore);
    assert.equal((await rowsOf(dispatchCustomers)).length, custBefore, 'REGRESSION: a customer of the merged-away name');
});

test('I12 — quote -> job on a deal whose account was deleted since: the customer and the job are made on no account — never the dead id (the eighth review)', async () => {
    const r = await call(toJob, 'POST', { body: { quoteId: Q(D_GONE) } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.customerCreated, true);
    const [made] = (await rowsOf(dispatchCustomers)).filter((c) => c.id === r.body.job.customerId);
    assert.equal(made.accountId, null, 'REGRESSION: the made customer linked to a deleted account');
    assert.equal(r.body.job.accountId, null, 'REGRESSION: the job linked to a deleted account');
});

test("I7 — org B's rows are as seeded", async () => {
    assert.deepEqual(await bRows(), bSeeded);
});
