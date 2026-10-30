// tests/integration/import-links.itest.mjs
//
// Batch 3a of OPEN_ITEMS §1 item 1 (state §0.215; guide §18b105; Jeff, 29 Oct, Q9: "Refuse it"). Against the test
// database: the accounts bulk create places each row by the single save's rule — a parent that is a site, the row
// itself, or two rows naming each other refuse the request whole, naming the rows, nothing written; a unit under
// an account, a site under a unit, the batch's own parent first; a top-level row an account whatever it asks — and
// the bulk overwrite moves and renames no account: a row naming a parent, or a name that is not its account's,
// refuses the request whole, nothing written; a name that reads as its account's is stored in the account's own
// spelling, and a tier sent is not stored. A rep's overwrite of an account she does not own is forbidden, its
// name and its deals' and contacts' as they were. Org B — the same names — is as seeded at the end, and A's
// write never names B's rows.
//
// The auth mock fakes the SIGN-IN only (link-ids.itest.mjs's pattern); every handler, gate and query is the real one.
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
            const userId = event.headers?.['x-test-user'] || `clerk_itest_imp3_${userRole}_${orgId}`;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});

const accountsFn = (await import('../../netlify/functions/accounts.mjs')).handler;
const { db } = await import('../../db/index.js');
const { settings, users, accounts, contacts, opportunities } = await import('../../db/schema.js');
const { eq, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_imp3_*' — its two orgs, every row id it writes, its members' Clerk ids and
// 'usr_itest_imp3_*' member ids — and ONLY this file writes to it (guide §18b25).
const A = 'itest_imp3_A', B = 'itest_imp3_B';
const ORGS = [A, B];
const ID = (s) => 'itest_imp3_' + s;

const USR_ADMIN = 'usr_itest_imp3_admin', USR_REP = 'usr_itest_imp3_rep', USR_REP2 = 'usr_itest_imp3_rep2';
const WHO = {
    admin: { user: 'clerk_itest_imp3_admin', role: 'Admin' },
    karen: { user: 'clerk_itest_imp3_rep', role: 'User' },
};

// Org A: Shell (an account), its unit "Shell - Port Allen", a site under the unit; Acme owned by another rep, a
// deal and a contact linked to it. Org B: an account and a site of the same names.
const SHELL = ID('shell'), PA_UNIT = ID('pa_unit'), PA_SITE = ID('pa_site'), ACME = ID('acme');
const B_SHELL = ID('b_shell'), B_SITE = ID('b_site');
const DEAL = ID('deal'), CON = ID('con');

const call = async (who, method, body, org = A) => {
    const res = await accountsFn({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': who.role, 'x-test-user': who.user, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const one = async (id) => (await db.select().from(accounts).where(eq(accounts.id, id)))[0];

const cleanup = async () => {
    for (const t of [contacts, opportunities, accounts, users, settings]) await db.delete(t).where(inArray(t.orgId, ORGS));
};
const bRows = async () => {
    const out = {};
    for (const [name, t] of Object.entries({ accounts, contacts, opportunities })) {
        out[name] = (await db.select().from(t).where(eq(t.orgId, B))).sort((x, y) => x.id.localeCompare(y.id));
    }
    return out;
};
let bSeeded;

before(async () => {
    await cleanup();
    await db.insert(settings).values([{ id: 'settings_' + A, orgId: A, extra: {} }, { id: 'settings_' + B, orgId: B, extra: {} }]);
    await db.insert(users).values([
        { id: USR_ADMIN, orgId: A, clerkUserId: WHO.admin.user, name: 'Ada Imp', email: 'ada@itest-imp3.local', role: 'Admin' },
        { id: USR_REP, orgId: A, clerkUserId: WHO.karen.user, name: 'Karen Imp', email: 'karen@itest-imp3.local', role: 'User' },
        { id: USR_REP2, orgId: A, clerkUserId: 'clerk_itest_imp3_rep2', name: 'Other Rep', email: 'other@itest-imp3.local', role: 'User' },
    ]);
    await db.insert(accounts).values([
        { id: SHELL, orgId: A, name: 'Shell', accountTier: 'account' },
        { id: PA_UNIT, orgId: A, name: 'Shell - Port Allen', parentAccountId: SHELL, accountTier: 'business_unit' },
        { id: PA_SITE, orgId: A, name: 'Shell - Port Allen', parentAccountId: PA_UNIT, accountTier: 'site' },
        { id: ACME, orgId: A, name: 'Acme, Inc.', accountTier: 'account', ownerId: USR_REP2, accountOwner: 'Other Rep' },
        { id: B_SHELL, orgId: B, name: 'Shell', accountTier: 'account' },
        { id: B_SITE, orgId: B, name: 'Shell - Port Allen', parentAccountId: B_SHELL, accountTier: 'site' },
    ]);
    await db.insert(opportunities).values([{ id: DEAL, orgId: A, opportunityName: 'Acme deal', pipelineId: 'default', account: 'Acme, Inc.', accountId: ACME, stage: 'Qualification', contactIds: [] }]);
    await db.insert(contacts).values([{ id: CON, orgId: A, firstName: 'Cy', lastName: 'Acme', company: 'Acme, Inc.', accountId: ACME }]);
    bSeeded = await bRows();
});

after(cleanup);

test('a bulk create under a site, under itself, or two rows naming each other is refused whole, naming the rows — nothing written (REGRESSION: stored as sent)', async () => {
    let r = await call(WHO.admin, 'POST', [{ id: ID('n_ok'), name: 'Fine' }, { id: ID('n_site'), name: 'Under site', parentAccountId: PA_SITE }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual([r.body.field, r.body.ids], ['parentAccountId', [ID('n_site')]]);
    assert.match(r.body.error, /is a site — a site can't have accounts under it/);
    assert.equal(await one(ID('n_ok')), undefined, 'refused whole');
    assert.equal(await one(ID('n_site')), undefined);

    r = await call(WHO.admin, 'POST', [{ id: ID('n_self'), name: 'Self', parentAccountId: ID('n_self') }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: "An account can't be its own parent.", field: 'parentAccountId', ids: [ID('n_self')] });

    r = await call(WHO.admin, 'POST', [{ id: ID('n_x'), name: 'X', parentAccountId: ID('n_y') }, { id: ID('n_y'), name: 'Y', parentAccountId: ID('n_x') }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual([...r.body.ids].sort(), [ID('n_x'), ID('n_y')].sort());
    assert.equal(await one(ID('n_x')), undefined);
    assert.equal(await one(ID('n_y')), undefined);

    r = await call(WHO.admin, 'POST', [{ id: ID('n_dup'), name: 'A' }, { id: ID('n_dup'), name: 'B', parentAccountId: PA_SITE }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'A row id is sent twice in one batch.', field: 'id', ids: [ID('n_dup')] }, 'an id twice (the review of 3a)');
    assert.equal(await one(ID('n_dup')), undefined);

    r = await call(WHO.admin, 'POST', [{ id: ID('n_b'), name: 'Under B', parentAccountId: B_SHELL }]);
    assert.equal(r.status, 400, JSON.stringify(r.body), "org B's account is no parent of A's");
    assert.equal(await one(ID('n_b')), undefined);
});

test("a bulk create's rows take the tier that fits — a unit under an account, a site under a unit, the batch's own parent first; a top-level row is an account whatever it asks (REGRESSION: every sub-account a business unit)", async () => {
    const r = await call(WHO.admin, 'POST', [
        { id: ID('t_site'), name: 'T Site', parentAccountId: ID('t_unit') },
        { id: ID('t_unit'), name: 'T Unit', parentAccountId: SHELL },
        { id: ID('t_under_unit'), name: 'T Under PA', parentAccountId: PA_UNIT },
        { id: ID('t_top'), name: 'T Top', accountTier: 'site' },
    ]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const tiers = Object.fromEntries(await Promise.all(['t_site', 't_unit', 't_under_unit', 't_top'].map(async (k) => [k, (await one(ID(k))).accountTier])));
    assert.deepEqual(tiers, { t_site: 'site', t_unit: 'business_unit', t_under_unit: 'site', t_top: 'account' });
    assert.equal((await one(ID('t_site'))).parentAccountId, ID('t_unit'));
});

test('a bulk overwrite naming a parent is refused whole, naming its rows, nothing written; one that names none keeps where the account stands (Q9)', async () => {
    let r = await call(WHO.admin, 'PUT', [{ id: ID('t_top'), notes: 'not this' }, { id: ID('t_unit'), parentAccountId: SHELL }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'An overwrite never moves an account — move each one on its own page.', field: 'parentAccountId', ids: [ID('t_unit')] });
    assert.equal((await one(ID('t_top'))).notes, null, 'refused whole');
    r = await call(WHO.admin, 'PUT', [{ id: ID('t_unit'), parentAccountId: null }]);
    assert.equal(r.status, 400, JSON.stringify(r.body), 'a cleared parent is a move too');
    assert.equal((await one(ID('t_unit'))).parentAccountId, SHELL);
    r = await call(WHO.admin, 'PUT', [{ id: ID('t_unit'), notes: 'kept', accountTier: 'account' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const u = await one(ID('t_unit'));
    assert.deepEqual([u.notes, u.parentAccountId, u.accountTier], ['kept', SHELL, 'business_unit'], 'a tier sent is not stored');
});

test("a bulk overwrite's name: one that reads as its account's is stored in the account's own spelling; another is refused whole, nothing written — never a rename the deals and contacts would not follow", async () => {
    let r = await call(WHO.admin, 'PUT', [{ id: ACME, name: 'ACME INC', phone: '555' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const a = await one(ACME);
    assert.deepEqual([a.name, a.phone], ['Acme, Inc.', '555'], "the account's own spelling");
    r = await call(WHO.admin, 'PUT', [{ id: SHELL, notes: 'not this' }, { id: ACME, name: 'Acme Holdings' }]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'An overwrite never renames an account — rename each one on its own page.', field: 'name', ids: [ACME] });
    assert.equal((await one(ACME)).name, 'Acme, Inc.');
    assert.equal((await one(SHELL)).notes, null, 'refused whole');
    const deal = (await db.select().from(opportunities).where(eq(opportunities.id, DEAL)))[0];
    const con = (await db.select().from(contacts).where(eq(contacts.id, CON)))[0];
    assert.deepEqual([deal.account, con.company], ['Acme, Inc.', 'Acme, Inc.'], "the deal's and the contact's names as they were");
    // A batch where one row sends a name and another does not: the other keeps its own (the review of 3a — the union
    // of the keys sent stored it 'Unnamed Account').
    r = await call(WHO.admin, 'PUT', [{ id: ACME, name: 'acme inc', phone: '555' }, { id: SHELL, phone: '777' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [acme, shell] = [await one(ACME), await one(SHELL)];
    assert.deepEqual([acme.name, shell.name, shell.phone], ['Acme, Inc.', 'Shell', '777']);
});

test("a rep's overwrite of an account she does not own is forbidden — whatever name it sends, so no refusal says the account's name; its name, phone and its deal's and contact's names as they were", async () => {
    let r = await call(WHO.karen, 'PUT', [{ id: ACME, name: 'Something Else Entirely' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body), 'not refused as a rename — answered forbidden, as for any name (the review of 3a)');
    assert.deepEqual([r.body.updated, r.body.forbidden], [0, [ACME]]);
    r = await call(WHO.karen, 'PUT', [{ id: ACME, name: 'acme inc', phone: '999' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.updated, r.body.forbidden], [0, [ACME]]);
    const a = await one(ACME);
    assert.deepEqual([a.name, a.phone], ['Acme, Inc.', '555']);
    const deal = (await db.select().from(opportunities).where(eq(opportunities.id, DEAL)))[0];
    assert.equal(deal.account, 'Acme, Inc.');
});

test("org A's overwrite naming org B's account is not found — never refused as a rename, which would say B's account exists and its name (the review of 3a)", async () => {
    const r = await call(WHO.admin, 'PUT', [{ id: B_SHELL, name: 'Not Shell' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.updated, r.body.notFound], [0, [B_SHELL]]);
});

test("org B's rows — the same names — are as seeded", async () => {
    assert.deepEqual(await bRows(), bSeeded);
});
