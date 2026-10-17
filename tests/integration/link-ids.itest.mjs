// tests/integration/link-ids.itest.mjs
//
// A link names a live row of this org (state §0.199 — batch 4 of OPEN_ITEMS §1 item 1; Jeff, 13 Oct: E1
// "Listed + CRM extras", E2 "Link the survivor", E3 "Org check only", E4 "Clear stray links"). Against the
// test database: every write that stores a link — a contact's account and org chart; an activity's account,
// deal, lead and contacts; a task's account, deal and contacts; a deal's contacts; a bulk account row's
// parent; a dispatch customer's account; a dispatch job's customer, location, account and deal — refuses one
// that org B holds, or that no row holds: a single write 404, naming the kind and the field; a bulk write
// 400, whole, naming the ids; nothing written. A link to a row merged away is stored as the row it was
// merged into (E2), a bulk row's parent excepted. A link the row already holds is never asked again, even
// one deleted since or one org B holds, stored before batch 4; a rep links any record of the org (E3). The
// five CRM creates answer 409 for an id org B holds, and B's row stands. An Admin's restore clears, on the
// rows it restored, every link that names no row of this org and says how many; a job's customer, required,
// is counted; rows it did not restore are untouched (E4). Org B's rows are as seeded at the end.
//
// The auth mock fakes the SIGN-IN only (in-org.itest.mjs's pattern); every handler, gate and query is the
// real one. A task's body carries a status, as the task rail sends one (tasks.status is NOT NULL).
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
            const userId = event.headers?.['x-test-user'] || `clerk_itest_links_${userRole}_${orgId}`;
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
for (const name of ['contacts', 'activities', 'tasks', 'opportunities', 'accounts', 'dispatch-customers', 'dispatch-jobs', 'backup']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const { settings, users, accounts, contacts, opportunities, leads, tasks, activities, dispatchCustomers, dispatchServiceLocations,
        dispatchJobs, dispatchJobStatusHistory, backups, auditLog, quotes } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { notInOrg, NOT_AN_ID } = await import('../../src/utils/linkIds.js');

// ORG NAMESPACE: this file owns 'itest_links_*' — its two orgs, every row id it writes (ids are global
// keys), its members' Clerk ids and 'usr_itest_links_*' member ids — and ONLY this file writes to it
// (guide §18b25).
const A = 'itest_links_A', B = 'itest_links_B';
const ORGS = [A, B];
const ID = (s) => 'itest_links_' + s;

// Members' ids are app ids (usr_…): an owner id of any other shape is refused as a Clerk id (mayMutate).
const USR_ADMIN = 'usr_itest_links_admin', USR_REP = 'usr_itest_links_rep';
const WHO = {
    admin: { user: 'clerk_itest_links_admin', role: 'Admin' },
    karen: { user: 'clerk_itest_links_rep', role: 'User' },
};

// Org A: an account, and one merged into it; two contacts, and one merged into the first; a deal; a lead;
// a dispatch customer and its site. Org B: one of each. GONE names no row anywhere.
const ACCT = ID('acct'), ACCT_OLD = ID('acct_old'), B_ACCT = ID('b_acct');
const C1 = ID('c1'), C2 = ID('c2'), C_OLD = ID('c_old'), C_B = ID('c_b');
const D1 = ID('d1'), D_B = ID('d_b'), L1 = ID('l1'), L_B = ID('l_b');
const ACT_B = ID('act_b'), TASK_B = ID('task_b');
const CU1 = ID('cu1'), CU_B = ID('cu_b'), LO1 = ID('lo1'), LO_B = ID('lo_b');
const GONE = ID('gone');
// Org A's rows stored before batch 4, each holding a stray link (E3: never asked again).
const T_HELD = ID('t_held'), ACT_HELD = ID('act_held'), CON_HELD = ID('con_held'), D_HELD = ID('d_held');
const CU_HELD = ID('cu_held'), J_HELD = ID('j_held');
// Another live account of org A; an account of A stored before batch 4 under a parent that names nothing.
const ACCT2 = ID('acct2'), A_HELD = ID('a_held');

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

const cleanup = async () => {
    for (const t of [dispatchJobStatusHistory, dispatchJobs, dispatchServiceLocations, dispatchCustomers, activities, tasks, contacts,
                     quotes, opportunities, leads, accounts, users, backups, auditLog, settings]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

// Org B's rows, whole — taken once seeded, compared at the end.
const B_TABLES = { accounts, contacts, opportunities, leads, activities, tasks, dispatchCustomers, dispatchServiceLocations, dispatchJobs };
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
        { id: USR_ADMIN, orgId: A, clerkUserId: WHO.admin.user, name: 'Ada Links', email: 'ada@itest-links.local', role: 'Admin' },
        { id: USR_REP, orgId: A, clerkUserId: WHO.karen.user, name: 'Karen Links', email: 'karen@itest-links.local', role: 'User' },
    ]);
    await db.insert(accounts).values([
        { id: ACCT, orgId: A, name: 'Links Co', accountTier: 'account', ownerId: USR_ADMIN, accountOwner: 'Ada Links' },
        { id: ACCT_OLD, orgId: A, name: 'Links Old Co', accountTier: 'account', mergeArchived: true, mergedIntoId: ACCT },
        { id: B_ACCT, orgId: B, name: 'B Links Co', accountTier: 'account' },
        { id: ACCT2, orgId: A, name: 'Links Two Co', accountTier: 'account' },
        { id: A_HELD, orgId: A, name: 'Held Account', accountTier: 'business_unit', parentAccountId: GONE },
    ]);
    await db.insert(contacts).values([
        { id: C1, orgId: A, firstName: 'Cy', lastName: 'One' },
        { id: C2, orgId: A, firstName: 'Cy', lastName: 'Two' },
        { id: C_OLD, orgId: A, firstName: 'Cy', lastName: 'Old', mergeArchived: true, mergedIntoId: C1 },
        { id: C_B, orgId: B, firstName: 'Bo', lastName: 'B', accountId: B_ACCT },
        { id: CON_HELD, orgId: A, firstName: 'Held', lastName: 'Contact', accountId: GONE, managers: [{ id: C_B, name: 'Bo B' }], directReports: [{ id: GONE, name: 'Gone' }] },
    ]);
    await db.insert(opportunities).values([
        { id: D1, orgId: A, opportunityName: 'Links deal', pipelineId: 'default', stage: 'Discovery', contactIds: [] },
        { id: D_HELD, orgId: A, opportunityName: 'Held deal', pipelineId: 'default', stage: 'Discovery', contactIds: [C_B, GONE] },
        { id: D_B, orgId: B, opportunityName: 'B deal', pipelineId: 'default', stage: 'Discovery', contactIds: [C_B] },
    ]);
    await db.insert(leads).values([
        { id: L1, orgId: A, firstName: 'Lee', lastName: 'Lead' },
        { id: L_B, orgId: B, firstName: 'Bee', lastName: 'Lead' },
    ]);
    await db.insert(activities).values([
        { id: ACT_HELD, orgId: A, type: 'Call', date: '2026-10-01', notes: 'held', contactIds: [C1, GONE], contactId: C1, leadId: L_B },
        { id: ACT_B, orgId: B, type: 'Call', date: '2026-10-01', notes: 'B call', contactIds: [C_B], contactId: C_B },
    ]);
    await db.insert(tasks).values([
        { id: T_HELD, orgId: A, title: 'Held task', accountId: B_ACCT, opportunityId: D_B, contactId: GONE, contacts: [{ id: GONE, name: 'Gone', primary: true }] },
        { id: TASK_B, orgId: B, title: 'B task', accountId: B_ACCT },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: CU1, orgId: A, name: 'Links Customer' },
        { id: CU_HELD, orgId: A, name: 'Held Customer', accountId: B_ACCT },
        { id: CU_B, orgId: B, name: 'B Customer', accountId: B_ACCT },
    ]);
    await db.insert(dispatchServiceLocations).values([
        { id: LO1, orgId: A, customerId: CU1, name: 'Links site', address: '1 Link St', city: 'Tulsa' },
        { id: LO_B, orgId: B, customerId: CU_B, name: 'B site', address: '2 B St', city: 'Tulsa' },
    ]);
    await db.insert(dispatchJobs).values({ id: J_HELD, orgId: A, customerId: CU1, locationId: LO_B, accountId: GONE, opportunityId: D_B, title: 'Held job' });
    bSeeded = await bRows();
});

after(cleanup);

// ── 1. A single write ────────────────────────────────────────────────────────

test("a single create refuses a link to org B's row, or to none: 404 naming the kind and the field, and nothing written", async () => {
    const cases = [
        ['contacts', contacts, { id: ID('n_con1'), firstName: 'N', accountId: B_ACCT }, 'account', 'accountId'],
        ['contacts', contacts, { id: ID('n_con2'), firstName: 'N', managers: [{ id: C1, name: 'Cy One' }, { id: C_B, name: 'Bo B' }] }, 'contact', 'managers'],
        ['contacts', contacts, { id: ID('n_con3'), firstName: 'N', directReports: [{ id: GONE, name: 'Gone' }] }, 'contact', 'directReports'],
        ['activities', activities, { id: ID('n_act1'), type: 'Call', opportunityId: D_B }, 'deal', 'opportunityId'],
        ['activities', activities, { id: ID('n_act2'), type: 'Call', leadId: L_B }, 'lead', 'leadId'],
        ['activities', activities, { id: ID('n_act3'), type: 'Call', contactIds: [C1, C_B] }, 'contact', 'contactIds'],
        ['activities', activities, { id: ID('n_act4'), type: 'Call', accountId: GONE }, 'account', 'accountId'],
        ['activities', activities, { id: ID('n_act5'), type: 'Call', contactId: C_B }, 'contact', 'contactId'],
        ['tasks', tasks, { id: ID('n_task1'), title: 'N', status: 'Open', accountId: B_ACCT }, 'account', 'accountId'],
        ['tasks', tasks, { id: ID('n_task2'), title: 'N', status: 'Open', opportunityId: GONE }, 'deal', 'opportunityId'],
        ['tasks', tasks, { id: ID('n_task3'), title: 'N', status: 'Open', contacts: [{ id: C_B, name: 'Bo B', primary: true }] }, 'contact', 'contacts'],
        ['tasks', tasks, { id: ID('n_task4'), title: 'N', status: 'Open', contactId: C_B }, 'contact', 'contactId'],
        ['opportunities', opportunities, { id: ID('n_deal1'), opportunityName: 'N', contactIds: [C_B] }, 'contact', 'contactIds'],
    ];
    for (const [fn, table, body, kind, field] of cases) {
        const r = await call(fn, WHO.admin, 'POST', body);
        assert.equal(r.status, 404, `${fn} ${field}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: notInOrg(kind), field }, `${fn} ${field}`);
        assert.equal(await one(table, body.id), undefined, `${fn} ${field}: nothing written`);
    }
});

test('a value that names no record by its id is refused 400 — not a list where one is asked, an id that is not text', async () => {
    for (const [fn, table, body, field] of [
        ['contacts', contacts, { id: ID('m_con'), firstName: 'M', managers: C1 }, 'managers'],
        ['activities', activities, { id: ID('m_act'), type: 'Call', contactIds: [{ id: C1 }] }, 'contactIds'],
        ['tasks', tasks, { id: ID('m_task'), title: 'M', status: 'Open', accountId: 7 }, 'accountId'],
    ]) {
        const r = await call(fn, WHO.admin, 'POST', body);
        assert.equal(r.status, 400, `${fn}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_AN_ID, field });
        assert.equal(await one(table, body.id), undefined);
    }
});

test('E2: a create naming a row merged away stores the row it was merged into — the duplicate it makes dropped, a chip keeping its other fields', async () => {
    let r = await call('contacts', WHO.admin, 'POST', {
        id: ID('e2_con'), firstName: 'E', accountId: ACCT_OLD,
        managers: [{ id: C_OLD, name: 'Cy Old' }, { id: C1, name: 'Cy One' }], directReports: [{ id: C2, name: 'Cy Two' }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    let row = await one(contacts, ID('e2_con'));
    assert.equal(row.accountId, ACCT);
    assert.deepEqual(row.managers, [{ id: C1, name: 'Cy Old' }], 'the merged-away manager and its survivor are one contact');
    assert.deepEqual(row.directReports, [{ id: C2, name: 'Cy Two' }]);
    assert.equal(r.body.contact.accountId, ACCT, 'the answer is the row as stored');

    r = await call('activities', WHO.admin, 'POST', { id: ID('e2_act'), type: 'Call', contactIds: [C_OLD, C2], accountId: ACCT_OLD, leadId: L1, opportunityId: D1 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    row = await one(activities, ID('e2_act'));
    assert.deepEqual([row.contactIds, row.contactId, row.accountId, row.leadId, row.opportunityId], [[C1, C2], C1, ACCT, L1, D1], 'contactId follows its list');

    r = await call('tasks', WHO.admin, 'POST', { id: ID('e2_task'), title: 'E2', status: 'Open', contacts: [{ id: C_OLD, name: 'Cy Old', title: 'CFO', primary: true }], contactId: C_OLD, accountId: ACCT_OLD });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    row = await one(tasks, ID('e2_task'));
    assert.deepEqual([row.contacts, row.contactId, row.accountId], [[{ id: C1, name: 'Cy Old', title: 'CFO', primary: true }], C1, ACCT]);

    r = await call('opportunities', WHO.admin, 'POST', { id: ID('e2_deal'), opportunityName: 'E2', contactIds: [C_OLD, C1] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual((await one(opportunities, ID('e2_deal'))).contactIds, [C1]);
});

test('E2 on an update: a link changed to a row merged away is stored as its survivor', async () => {
    let r = await call('contacts', WHO.admin, 'PUT', { id: C2, accountId: ACCT_OLD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(contacts, C2)).accountId, ACCT);

    r = await call('activities', WHO.admin, 'PUT', { id: ID('e2_act'), contactIds: [C2, C_OLD] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let row = await one(activities, ID('e2_act'));
    assert.deepEqual([row.contactIds, row.contactId, row.accountId], [[C2, C1], C2, ACCT], 'the list rewritten, contactId its first, the rest kept');
    r = await call('activities', WHO.admin, 'PUT', { id: ID('e2_act'), contactId: C_OLD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(activities, ID('e2_act'));
    assert.deepEqual([row.contactIds, row.contactId], [[C1], C1], 'a legacy contactId alone: that contact — its survivor');

    r = await call('tasks', WHO.admin, 'PUT', { id: ID('e2_task'), contacts: [{ id: C2, name: 'Cy Two', primary: true }, { id: C_OLD, name: 'Cy Old' }], contactId: C2 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(tasks, ID('e2_task'));
    assert.deepEqual([row.contacts, row.contactId], [[{ id: C2, name: 'Cy Two', primary: true }, { id: C1, name: 'Cy Old' }], C2]);

    r = await call('opportunities', WHO.admin, 'PUT', { id: D1, contactIds: [C_OLD, C2] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(opportunities, D1)).contactIds, [C1, C2]);
});

test('an update naming a link anew to org B\'s row, or to none, is refused 404 — the row unchanged', async () => {
    for (const [fn, table, body, kind, field, keyOf] of [
        ['contacts', contacts, { id: C2, accountId: B_ACCT }, 'account', 'accountId', (r) => r.accountId],
        ['contacts', contacts, { id: C2, managers: [{ id: C_B, name: 'Bo B' }] }, 'contact', 'managers', (r) => r.managers],
        ['activities', activities, { id: ID('e2_act'), contactIds: [C1, GONE] }, 'contact', 'contactIds', (r) => r.contactIds],
        ['activities', activities, { id: ID('e2_act'), leadId: L_B }, 'lead', 'leadId', (r) => r.leadId],
        ['tasks', tasks, { id: ID('e2_task'), opportunityId: D_B }, 'deal', 'opportunityId', (r) => r.opportunityId],
        ['tasks', tasks, { id: ID('e2_task'), contactId: C_B }, 'contact', 'contactId', (r) => r.contactId],
        ['opportunities', opportunities, { id: D1, contactIds: [C1, C_B] }, 'contact', 'contactIds', (r) => r.contactIds],
    ]) {
        const was = keyOf(await one(table, body.id));
        const r = await call(fn, WHO.admin, 'PUT', body);
        assert.equal(r.status, 404, `${fn} ${field}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: notInOrg(kind), field });
        assert.deepEqual(keyOf(await one(table, body.id)), was, `${fn} ${field}: unchanged`);
    }
});

test('E3: a link the row already holds is never asked again — another org\'s or a deleted one, stored before batch 4 — and the rest of the save stands', async () => {
    let r = await call('tasks', WHO.admin, 'PUT', { id: T_HELD, title: 'Held task, edited', accountId: B_ACCT, opportunityId: D_B, contactId: GONE, contacts: [{ id: GONE, name: 'Gone', primary: true }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let row = await one(tasks, T_HELD);
    assert.deepEqual([row.title, row.accountId, row.opportunityId, row.contactId], ['Held task, edited', B_ACCT, D_B, GONE]);

    r = await call('activities', WHO.admin, 'PUT', { id: ACT_HELD, notes: 'held, edited', contactIds: [C1, GONE], contactId: C1, leadId: L_B });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(activities, ACT_HELD);
    assert.deepEqual([row.notes, row.contactIds, row.leadId], ['held, edited', [C1, GONE], L_B]);
    // one held contact and one new one: only the new one is asked
    r = await call('activities', WHO.admin, 'PUT', { id: ACT_HELD, contactIds: [C1, GONE, C2] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(activities, ACT_HELD)).contactIds, [C1, GONE, C2]);

    r = await call('contacts', WHO.admin, 'PUT', { id: CON_HELD, title: 'VP', accountId: GONE, managers: [{ id: C_B, name: 'Bo B' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(contacts, CON_HELD);
    assert.deepEqual([row.title, row.accountId, row.managers], ['VP', GONE, [{ id: C_B, name: 'Bo B' }]]);

    r = await call('opportunities', WHO.admin, 'PUT', { id: D_HELD, stage: 'Proposal', contactIds: [C_B, GONE] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(opportunities, D_HELD);
    assert.deepEqual([row.stage, row.contactIds], ['Proposal', [C_B, GONE]]);
});

test('E3: a rep links any record of the org — an account another member owns — and only the org is asked', async () => {
    const r = await call('tasks', WHO.karen, 'POST', { id: ID('karen_task'), title: 'Karen', status: 'Open', accountId: ACCT, contacts: [{ id: C2, name: 'Cy Two', primary: true }], contactId: C2 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = await one(tasks, ID('karen_task'));
    assert.deepEqual([row.accountId, row.contactId, row.ownerId], [ACCT, C2, USR_REP]);
    const out = await call('tasks', WHO.karen, 'PUT', { id: ID('karen_task'), accountId: B_ACCT });
    assert.equal(out.status, 404, `org B's is still not hers to link: ${JSON.stringify(out.body)}`);
});

// ── 2. A bulk write ──────────────────────────────────────────────────────────

test("a bulk create naming org B's row, or none, is refused whole — 400 naming the ids — and nothing is written", async () => {
    let r = await call('contacts', WHO.admin, 'POST', [{ id: ID('bulk_c1'), firstName: 'B1', accountId: ACCT }, { id: ID('bulk_c2'), firstName: 'B2', accountId: B_ACCT }, { id: ID('bulk_c3'), firstName: 'B3', accountId: GONE }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('account'), field: 'accountId', ids: [B_ACCT, GONE] });
    for (const id of ['bulk_c1', 'bulk_c2', 'bulk_c3']) assert.equal(await one(contacts, ID(id)), undefined, `${id}: nothing imported`);

    r = await call('opportunities', WHO.admin, 'POST', [{ id: ID('bulk_d1'), opportunityName: 'BD1', contactIds: [C1, C_B] }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('contact'), field: 'contactIds', ids: [C_B] });
    assert.equal(await one(opportunities, ID('bulk_d1')), undefined);

    r = await call('accounts', WHO.admin, 'POST', [{ id: ID('bulk_a1'), name: 'Bulk A1', parentAccountId: B_ACCT }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('account'), field: 'parentAccountId', ids: [B_ACCT] });
    assert.equal(await one(accounts, ID('bulk_a1')), undefined);
});

test("a bulk create: the batch's own rows count — one another's org chart, a parent among them; a contact merged away links its survivor, a parent merged away is refused", async () => {
    let r = await call('contacts', WHO.admin, 'POST', [
        { id: ID('bulk_m1'), firstName: 'M1', managers: [{ id: ID('bulk_m2'), name: 'M2' }] },
        { id: ID('bulk_m2'), firstName: 'M2', directReports: [{ id: ID('bulk_m1'), name: 'M1' }], accountId: ACCT_OLD },
    ]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual((await one(contacts, ID('bulk_m1'))).managers, [{ id: ID('bulk_m2'), name: 'M2' }]);
    assert.equal((await one(contacts, ID('bulk_m2'))).accountId, ACCT, 'E2, row by row');

    r = await call('opportunities', WHO.admin, 'POST', [{ id: ID('bulk_d2'), opportunityName: 'BD2', contactIds: [C_OLD] }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual((await one(opportunities, ID('bulk_d2'))).contactIds, [C1]);

    r = await call('accounts', WHO.admin, 'POST', [{ id: ID('bulk_p'), name: 'Bulk Parent' }, { id: ID('bulk_k'), name: 'Bulk Kid', parentAccountId: ID('bulk_p') }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(accounts, ID('bulk_k'))).parentAccountId, ID('bulk_p'));
    r = await call('accounts', WHO.admin, 'POST', [{ id: ID('bulk_x'), name: 'Bulk X', parentAccountId: ACCT_OLD }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('account'), field: 'parentAccountId', ids: [ACCT_OLD] }, 'a parent merged away is not live (the single save refuses one too)');
    assert.equal(await one(accounts, ID('bulk_x')), undefined);
});

test('a bulk overwrite asks only what each row names anew — a held link kept, a new stray refusing the batch, a merged-away contact its survivor', async () => {
    let r = await call('contacts', WHO.admin, 'PUT', [{ id: C1, accountId: B_ACCT }, { id: C2, notes: 'would be kept' }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('account'), field: 'accountId', ids: [B_ACCT] });
    assert.equal((await one(contacts, C1)).accountId, null, 'unchanged');
    assert.equal((await one(contacts, C2)).notes, null, 'the batch is refused whole');

    r = await call('contacts', WHO.admin, 'PUT', [{ id: CON_HELD, accountId: GONE, managers: [{ id: C_B, name: 'Bo B' }], notes: 'bulk held' }, { id: C1, accountId: ACCT_OLD }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const held = await one(contacts, CON_HELD);
    assert.deepEqual([held.notes, held.accountId, held.managers], ['bulk held', GONE, [{ id: C_B, name: 'Bo B' }]]);
    assert.equal((await one(contacts, C1)).accountId, ACCT, 'E2 in an overwrite');

    r = await call('opportunities', WHO.admin, 'PUT', [{ id: D1, contactIds: [C_B] }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual((await one(opportunities, D1)).contactIds, [C1, C2], 'unchanged');
    r = await call('opportunities', WHO.admin, 'PUT', [{ id: D_HELD, contactIds: [C_B, GONE, C_OLD], notes: 'bulk held' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(opportunities, D_HELD)).contactIds, [C_B, GONE, C1], 'the held two kept, the new one its survivor');

    r = await call('accounts', WHO.admin, 'PUT', [{ id: ID('bulk_k'), parentAccountId: B_ACCT }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal((await one(accounts, ID('bulk_k'))).parentAccountId, ID('bulk_p'), 'unchanged');
    r = await call('accounts', WHO.admin, 'PUT', [{ id: ID('bulk_k'), parentAccountId: ID('bulk_p'), notes: 'kept' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(accounts, ID('bulk_k'))).notes, 'kept');
});

test('a bulk overwrite keeps the parent and the org chart a row already holds — stray ones, stored before batch 4 (the review, tests S4)', async () => {
    let r = await call('accounts', WHO.admin, 'PUT', [{ id: A_HELD, parentAccountId: GONE, notes: 'held parent kept' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let row = await one(accounts, A_HELD);
    assert.deepEqual([row.notes, row.parentAccountId], ['held parent kept', GONE], 'held: not asked again');
    r = await call('contacts', WHO.admin, 'PUT', [{ id: CON_HELD, directReports: [{ id: GONE, name: 'Gone' }], notes: 'held reports kept' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(contacts, CON_HELD);
    assert.deepEqual([row.notes, row.directReports], ['held reports kept', [{ id: GONE, name: 'Gone' }]]);
});

test("a bulk create's own rows are live for the links of their kind only, and a row of the batch that does not land leaves no link to it (the review, server S1 and S2)", async () => {
    // a contact row whose id is org B's account id, naming that account: another kind's link is asked
    let r = await call('contacts', WHO.admin, 'POST', [{ id: B_ACCT, firstName: 'Decoy', accountId: B_ACCT }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('account'), field: 'accountId', ids: [B_ACCT] });
    assert.equal(await one(contacts, B_ACCT), undefined, 'nothing written');
    // a row whose id org B holds does not land; the org-chart entry naming it is cleared
    r = await call('contacts', WHO.admin, 'POST', [{ id: C_B, firstName: 'Taken' }, { id: ID('bulk_n2'), firstName: 'N2', managers: [{ id: C_B, name: 'Bo B' }, { id: C1, name: 'Cy One' }] }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual([r.body.failed.map((x) => x.id), r.body.insertedIds, r.body.linksCleared], [[C_B], [ID('bulk_n2')], 1]);
    assert.deepEqual((await one(contacts, ID('bulk_n2'))).managers, [{ id: C1, name: 'Cy One' }], "org B's contact is no manager of A's");
    r = await call('accounts', WHO.admin, 'POST', [{ id: B_ACCT, name: 'Taken' }, { id: ID('bulk_k5'), name: 'K5', parentAccountId: B_ACCT }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual([r.body.failed.map((x) => x.id), r.body.linksCleared], [[B_ACCT], 1]);
    assert.equal((await one(accounts, ID('bulk_k5'))).parentAccountId, null, "org B's account is no parent of A's");
    assert.equal((await one(accounts, ID('bulk_k5'))).accountTier, 'account', 'its parent cleared, it stands at the top: an account (the fix review, server F5)');
    assert.equal((await one(accounts, B_ACCT)).orgId, B, "and org B's rows stand");
    assert.equal((await one(contacts, C_B)).firstName, 'Bo');
});

test('the bulk account paths read no legacy `parentId`: a parent sent so is never stored (the review, server S3)', async () => {
    let r = await call('accounts', WHO.admin, 'POST', [{ id: ID('bulk_k6'), name: 'K6', parentId: B_ACCT }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(accounts, ID('bulk_k6'))).parentAccountId, null);
    r = await call('accounts', WHO.admin, 'PUT', [{ id: ID('bulk_k6'), parentAccountId: '', parentId: B_ACCT }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(accounts, ID('bulk_k6'))).parentAccountId, null);
});

test("'' on a contact's org chart clears it, not refused (the review, decisions S6; the fix review, tests F3)", async () => {
    let r = await call('contacts', WHO.admin, 'PUT', { id: C2, managers: [{ id: C1, name: 'Cy One' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(contacts, C2)).managers, [{ id: C1, name: 'Cy One' }], 'a manager first');
    r = await call('contacts', WHO.admin, 'PUT', { id: C2, managers: '' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(contacts, C2)).managers, [], "'' names no link — the contacts sanitize stores an empty list");
});

test("a batch id this org already holds is no new row: a link to it is asked as any link is — a merged-away contact followed, a merged-away parent refused (the fix review, server F2)", async () => {
    let r = await call('contacts', WHO.admin, 'POST', [{ id: C_OLD, firstName: 'Again' }, { id: ID('bulk_n3'), firstName: 'N3', managers: [{ id: C_OLD, name: 'Cy Old' }] }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual([r.body.failed.map((x) => x.id), r.body.insertedIds], [[C_OLD], [ID('bulk_n3')]]);
    assert.deepEqual((await one(contacts, ID('bulk_n3'))).managers, [{ id: C1, name: 'Cy Old' }], 'E2: the contact it was merged into');
    assert.equal((await one(contacts, C_OLD)).firstName, 'Cy', 'the row this org holds stands');
    r = await call('accounts', WHO.admin, 'POST', [{ id: ACCT_OLD, name: 'Again' }, { id: ID('bulk_k7'), name: 'K7', parentAccountId: ACCT_OLD }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('account'), field: 'parentAccountId', ids: [ACCT_OLD] }, 'a parent merged away is not live');
    assert.equal(await one(accounts, ID('bulk_k7')), undefined, 'nothing written');
});

// ── 3. The five CRM creates and an id org B holds ────────────────────────────

test('each CRM create answers 409 for an id org B holds — it crashed, a 500 — and B\'s row stands', async () => {
    for (const [fn, table, noun, body] of [
        ['contacts', contacts, 'contact', { id: C_B, firstName: 'Taken' }],
        ['activities', activities, 'activity', { id: ACT_B, type: 'Note', notes: 'taken' }],
        ['tasks', tasks, 'task', { id: TASK_B, title: 'Taken', status: 'Open' }],
        ['opportunities', opportunities, 'deal', { id: D_B, opportunityName: 'Taken' }],
        ['accounts', accounts, 'account', { id: B_ACCT, name: 'Taken' }],
    ]) {
        const was = await one(table, body.id);
        const r = await call(fn, WHO.admin, 'POST', body);
        assert.equal(r.status, 409, `${fn}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: `That ${noun} id is already in use.` });
        assert.deepEqual(await one(table, body.id), was, `${fn}: org B's row unchanged`);
    }
});

// ── 4. Dispatch ──────────────────────────────────────────────────────────────

test("dispatch: a customer's account is this org's — a create and an update; one held is kept; a customer of org B's is not found", async () => {
    let r = await call('dispatch-customers', WHO.admin, 'POST', { id: ID('cu_bad'), name: 'Bad', accountId: B_ACCT });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: notInOrg('account'), field: 'accountId' });
    assert.equal(await one(dispatchCustomers, ID('cu_bad')), undefined);

    r = await call('dispatch-customers', WHO.admin, 'POST', { id: ID('cu_ok'), name: 'OK', accountId: ACCT_OLD });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(dispatchCustomers, ID('cu_ok'))).accountId, ACCT, 'E2');

    r = await call('dispatch-customers', WHO.admin, 'PUT', { accountId: B_ACCT }, { id: ID('cu_ok') });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.equal((await one(dispatchCustomers, ID('cu_ok'))).accountId, ACCT, 'unchanged');
    r = await call('dispatch-customers', WHO.admin, 'PUT', { accountId: ACCT2 }, { id: ID('cu_ok') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await call('dispatch-customers', WHO.admin, 'PUT', { accountId: ACCT_OLD }, { id: ID('cu_ok') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(dispatchCustomers, ID('cu_ok'))).accountId, ACCT, 'E2 on an update: the account it was merged into');

    r = await call('dispatch-customers', WHO.admin, 'PUT', { name: 'Held, edited', accountId: B_ACCT }, { id: CU_HELD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let row = await one(dispatchCustomers, CU_HELD);
    assert.deepEqual([row.name, row.accountId], ['Held, edited', B_ACCT], 'held: kept');
    r = await call('dispatch-customers', WHO.admin, 'POST', { id: CU_HELD, name: 'Held, upserted', accountId: B_ACCT });
    assert.equal(r.status, 201, `the create is an upsert: what it holds is not asked — ${JSON.stringify(r.body)}`);
    row = await one(dispatchCustomers, CU_HELD);
    assert.deepEqual([row.name, row.accountId], ['Held, upserted', B_ACCT]);

    r = await call('dispatch-customers', WHO.admin, 'PUT', { accountId: ACCT }, { id: CU_B });
    assert.equal(r.status, 404, "org B's customer: not found in A");
});

test("dispatch: a job's customer, location, account and deal are this org's — a create and an update; held links kept", async () => {
    for (const [body, kind, field] of [
        [{ id: ID('j_bad1'), customerId: CU_B, title: 'X' }, 'customer', 'customerId'],
        [{ id: ID('j_bad2'), customerId: CU1, locationId: LO_B, title: 'X' }, 'location', 'locationId'],
        [{ id: ID('j_bad3'), customerId: CU1, accountId: B_ACCT, title: 'X' }, 'account', 'accountId'],
        [{ id: ID('j_bad4'), customerId: CU1, opportunityId: GONE, title: 'X' }, 'deal', 'opportunityId'],
    ]) {
        const r = await call('dispatch-jobs', WHO.admin, 'POST', body);
        assert.equal(r.status, 404, `${field}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: notInOrg(kind), field });
        assert.equal(await one(dispatchJobs, body.id), undefined, `${field}: nothing written`);
    }
    assert.equal(notInOrg('location'), 'That service location is not in your organization — pick one from the list.');

    let r = await call('dispatch-jobs', WHO.admin, 'POST', { id: ID('j_ok'), customerId: CU1, locationId: LO1, accountId: ACCT_OLD, opportunityId: D1, title: 'OK' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    let row = await one(dispatchJobs, ID('j_ok'));
    assert.deepEqual([row.customerId, row.locationId, row.accountId, row.opportunityId], [CU1, LO1, ACCT, D1], 'E2: the account it was merged into');

    r = await call('dispatch-jobs', WHO.admin, 'PUT', { locationId: LO_B }, { id: ID('j_ok') });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.equal((await one(dispatchJobs, ID('j_ok'))).locationId, LO1, 'unchanged');
    r = await call('dispatch-jobs', WHO.admin, 'PUT', { accountId: ACCT2 }, { id: ID('j_ok') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await call('dispatch-jobs', WHO.admin, 'PUT', { accountId: ACCT_OLD }, { id: ID('j_ok') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(dispatchJobs, ID('j_ok'))).accountId, ACCT, 'E2 on an update: the account it was merged into — stored before the update is built (the review, tests S7)');

    r = await call('dispatch-jobs', WHO.admin, 'PUT', { title: 'Held job, edited', locationId: LO_B, accountId: GONE, opportunityId: D_B }, { id: J_HELD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(dispatchJobs, J_HELD);
    assert.deepEqual([row.title, row.locationId, row.accountId, row.opportunityId], ['Held job, edited', LO_B, GONE, D_B], 'held: kept');
});

// ── 5. A backup restore (E4) ─────────────────────────────────────────────────

test("a restore clears, on the rows it restored, every link that names no row of this org, and says how many — in the answer and the log; a job's customer and a quote's deal counted; rows it did not restore untouched", async () => {
    const R = (s) => ID('r_' + s);
    const r = await call('backup', WHO.admin, 'PATCH', { entities: {
        contacts: [
            { id: R('c1'), firstName: 'Rae', accountId: B_ACCT, managers: [{ id: C_B, name: 'Bo B' }, { id: C1, name: 'Cy One' }, { name: 'No id' }], directReports: [GONE, C2] },
            { id: C_B, firstName: 'Taken by B', accountId: GONE },          // org B holds the id: skipped — never swept
        ],
        activities: [
            { id: R('a1'), type: 'Call', contactIds: [C1, GONE, C_B], contactId: C1, leadId: L_B, accountId: ACCT, opportunityId: D_B },
            { id: R('a2'), type: 'Call', contactIds: [C_B], contactId: C_B },   // the app's shape: the mirror and its list, one link
        ],
        tasks: [
            { id: R('t1'), title: 'Restored task', contacts: [{ id: C_B, name: 'Bo B' }, { id: C2, name: 'Cy Two', primary: true }], contactId: GONE, accountId: B_ACCT },
            { id: R('t2'), title: 'Restored primary', contacts: [{ id: C_B, name: 'Bo B', primary: true }], contactId: C_B },   // the Primary chip and its mirror: one link
            { id: T_HELD, title: 'Already here', accountId: GONE },           // org A holds it: skipped — its stored links untouched
        ],
        opportunities: [{ id: R('d1'), opportunityName: 'Restored deal', pipelineId: 'default', stage: 'Discovery', accountId: B_ACCT, contactIds: [C_B, C1] }],
        quotes: [{ id: R('q1'), opportunityId: D_B, quoteNumber: 'Q-ITEST-LINKS-1' }],   // its deal required: counted, not cleared
        accounts: [
            { id: R('ac1'), name: 'Restored parent', accountTier: 'business_unit', parentAccountId: B_ACCT },
            { id: R('ac2'), name: 'Restored child', accountTier: 'business_unit', parentAccountId: R('ac1') },   // the file's own: kept
        ],
        dispatch: {
            customers: [{ id: R('cu1'), name: 'Restored customer', accountId: B_ACCT }],
            jobs: [{ id: R('j1'), customerId: CU_B, locationId: LO_B, accountId: B_ACCT, opportunityId: D_B, title: 'Restored job' }],
        },
    } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.errors, []);
    // contact 3 (its account, a manager, a bare direct report) + activity 4 (two contacts, its lead, its deal)
    // + the second activity 1 (its contact — the mirror its list holds is not counted again) + task 3 (a chip,
    // its contactId, its account) + the second task 1 (its Primary chip, the mirror not again) + deal 2 (its
    // account, a contact) + account 1 + customer 1 + job 3 (location, account, deal) = 19; the job's customer
    // and the quote's deal are counted apart. The file's two rows already here — C_B (org B holds the id) and
    // T_HELD (this org's) — are said first, as a count that never names the org holding one (state §0.205 — Jeff,
    // 16 Oct: "Fix both").
    assert.deepEqual(r.body.notes, [
        '2 records in the file were already here — for each, a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and were left as they are.',
        '19 links that named no record of this organization were cleared.',
        "1 job names a customer that is not in this organization — a job's customer can't be cleared, so it was left as restored.",
        "1 quote names a deal that is not in this organization — a quote's deal can't be cleared, so it was left as restored.",
    ]);
    const logged = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'backup.restored')));
    assert.ok(logged.some((l) => String(l.detail).includes(' · 19 links cleared · 1 job with a customer not in this org · 1 quote with a deal not in this org')),
        `the log carries the counts (the review, restore S5): ${JSON.stringify(logged.map((l) => l.detail))}`);

    const c = await one(contacts, R('c1'));
    assert.deepEqual([c.accountId, c.managers, c.directReports], [null, [{ id: C1, name: 'Cy One' }, { name: 'No id' }], [C2]], 'the strays dropped, the rest in order — a chip with no id kept');
    const a = await one(activities, R('a1'));
    assert.deepEqual([a.contactIds, a.contactId, a.leadId, a.accountId, a.opportunityId], [[C1], C1, null, ACCT, null]);
    const t = await one(tasks, R('t1'));
    assert.deepEqual([t.contacts, t.contactId, t.accountId], [[{ id: C2, name: 'Cy Two', primary: true }], null, null]);
    const a2 = await one(activities, R('a2'));
    assert.deepEqual([a2.contactIds, a2.contactId], [[], null]);
    const t2 = await one(tasks, R('t2'));
    assert.deepEqual([t2.contacts, t2.contactId], [[], null]);
    const d = await one(opportunities, R('d1'));
    assert.deepEqual([d.accountId, d.contactIds], [null, [C1]], "a deal's account is cleared too (the review, decisions S4)");
    assert.equal((await one(quotes, R('q1'))).opportunityId, D_B, "a quote's deal is required: left, and counted");
    const ac1 = await one(accounts, R('ac1'));
    assert.deepEqual([ac1.parentAccountId, ac1.accountTier], [null, 'account'], 'its parent cleared: an account (the fix review, server F5)');
    assert.equal((await one(accounts, R('ac2'))).parentAccountId, R('ac1'), "a parent the file restored is this org's");
    assert.equal((await one(dispatchCustomers, R('cu1'))).accountId, null);
    const j = await one(dispatchJobs, R('j1'));
    assert.deepEqual([j.customerId, j.locationId, j.accountId, j.opportunityId], [CU_B, null, null, null], 'the customer is required: left, and counted');

    const held = await one(tasks, T_HELD);
    assert.deepEqual([held.title, held.accountId, held.opportunityId], ['Held task, edited', B_ACCT, D_B], 'a row the restore did not insert: untouched');
    assert.equal((await one(contacts, C_B)).orgId, B, "the file's row whose id org B holds: never written");
});

test("a restore with no dispatch section is cleaned too — the app's own backup file has none (the review, tests S5)", async () => {
    const r = await call('backup', WHO.admin, 'PATCH', { entities: { contacts: [{ id: ID('r_crm'), firstName: 'Crm', accountId: B_ACCT }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.errors, r.body.notes], [[], ['1 link that named no record of this organization was cleared.']]);
    assert.equal((await one(contacts, ID('r_crm'))).accountId, null);
});

test('a restore with no stray link says nothing of links', async () => {
    const r = await call('backup', WHO.admin, 'PATCH', { entities: { contacts: [{ id: ID('r_clean'), firstName: 'Clean', accountId: ACCT, managers: [{ id: C1, name: 'Cy One' }] }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.errors, r.body.notes], [[], []]);
    const row = await one(contacts, ID('r_clean'));
    assert.deepEqual([row.accountId, row.managers], [ACCT, [{ id: C1, name: 'Cy One' }]]);
});

// ── 6. Org B ─────────────────────────────────────────────────────────────────

test("org B's rows are as seeded — every refusal, follow, overwrite, 409 and restore in org A left them alone", async () => {
    assert.deepEqual(await bRows(), bSeeded);
});
