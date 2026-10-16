// tests/integration/sales-links.itest.mjs
//
// A sales record's links name records of this org (state §0.204 — batch 4b-2b, "the records"; Jeff, 15 Oct:
// "Any of this org's, refuse" — any record or entry of this org counts, an inactive, deactivated or invited one
// too; anything else is refused naming the field; a link a row holds is never asked again). Against the test
// database, with the REAL verifyAuth (only the Clerk SDK is a stand-in: verifyToken reads the claims a test
// token carries, so each caller's role is their row's in this org's roster) and the real handlers:
//   CLAIMS   a claim's deal is a deal of this org and its SPIFF an entry of this org's SPIFF list — another
//            org's, or one naming nothing, 404 naming the field; an inactive SPIFF and another rep's deal stand;
//            a value that is not an id, or a claim id that is not text, 400 — and no row; a claim's held SPIFF
//            (removed since) and deal (deleted since) re-sent, and an Approve that names only its status
//            (D2), stand; a rep's claim is filed in her roster name, whatever rep its body names; a SPIFF of
//            spaces, 0 or false is none (400); a save that turns a set SPIFF or rep blank — spaces, 0 and false
//            too — is 400 ("(1) and (2) now"); a claim id
//            this org does not hold is 404 on every save, B's untouched; a POST with B's claim id is 409; a
//            Manager deletes (audited), a rep cannot
//   EXPORT   a run stores no schedule, whatever the body names; a run with B's run id is 409, no file handed over
//   QUOTES   as the rep, on her own deal: a line's product is one of this org's — B's or none, 404 naming
//            lineItems, nothing written; an inactive one stands; a Draft re-sent with a line it holds (a product
//            that names nothing) stands; a status move asks nothing; a productId that is not text 400; a line
//            that is not an object, or lines that are not a list, 400 (D5) — the quote as stored; the rep's
//            refusal on another rep's quote or deal is the ownership one, before any product is asked; a POST
//            with B's quote id is 409; a quote number another save takes between the read and the write is
//            still retried and the quote created (the 409's arbiter is the id alone)
//   RULES    as an Admin: a create-task assignee is a member of this org — B's or none, 404 naming actions,
//            nothing written; a deactivated and an invited member stand; a held assignee (deleted since)
//            re-sent stands; the toggle stands; B's rule is not found and stays as seeded
//   ORG B    reads none of A's new records (claims, quotes, rules, runs), and every B row is as seeded at the end
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_slinks_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_slinks_*' — its two orgs, every row id it seeds or names ('itest_slinks_…';
// a member's 'usr_itest_slinks_…', an app id's shape), its members' Clerk ids and emails — and ONLY this file writes
// to it (guide §18b25). Ids the handlers mint (a rule's 'auto_…', an audit row's) are cleaned by org.
const A = 'itest_slinks_A', B = 'itest_slinks_B';
const ORGS = [A, B];
const ID = (s) => 'itest_slinks_' + s;

const clerkClient = {
    users: { getUser: async () => { const e = new Error('Not Found'); e.status = 404; throw e; }, getOrganizationMembershipList: async () => ({ data: [] }) },
    organizations: { getOrganizationMembershipList: async () => ({ data: [] }), getOrganizationInvitationList: async () => ({ data: [] }) },
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let serial = 0;
const tokenFor = (sub, orgId, rol = 'member') =>
    `${b64({ alg: 'none' })}.${b64({ sub, o: { id: orgId, rol }, sts: 'active', exp: Math.floor(Date.now() / 1000) + 3600, n: ++serial })}.sig`;
mock.module('@clerk/backend', {
    namedExports: {
        verifyToken: async (token) => JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')),
        createClerkClient: () => clerkClient,
    },
});
// No outbound email or text: an approval notice is the one sender these handlers reach.
const anyTemplate = new Proxy({}, { get: () => () => ({ subject: '', html: '', text: '' }) });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: anyTemplate },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: anyTemplate, normalizePhone: (p) => p },
});

const FN = {};
for (const name of ['spiff-claims', 'export-runs', 'quotes', 'automations']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const { settings, users, opportunities, products, quotes, spiffClaims, automations, exportRuns, exportSchedules, auditLog } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { NOT_AN_ID } = await import('../../src/utils/linkIds.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// The words, written out: a kind's noun is part of what the screen shows.
const NOT_IN_ORG = {
    deal: 'That deal is not in your organization — pick one from the list.',
    spiff: 'That SPIFF is not in your organization — pick one from the list.',
    product: 'That product is not in your organization — pick one from the list.',
    member: 'That member is not in your organization — pick one from the list.',
};
const NOT_LINES = 'Each quote line must be a product line, in a list.';

// Who signs in: a Clerk id, in an org — the role is the roster row's.
const WHO = {
    admin:  { clerk: 'clerk_itest_slinks_admin',   org: A },
    mgr:    { clerk: 'clerk_itest_slinks_mgr',     org: A },
    karen:  { clerk: 'clerk_itest_slinks_karen',   org: A },
    adminB: { clerk: 'clerk_itest_slinks_admin_b', org: B },
};
const USR = {
    admin: 'usr_itest_slinks_admin', mgr: 'usr_itest_slinks_mgr', karen: 'usr_itest_slinks_karen', ravi: 'usr_itest_slinks_ravi',
    deact: 'usr_itest_slinks_deact', invited: 'usr_itest_slinks_invited',
    adminB: 'usr_itest_slinks_admin_b', repB: 'usr_itest_slinks_rep_b',
    gone: 'usr_itest_slinks_gone',   // a member deleted since — no row anywhere
};

// Org A's SPIFF list: one active, one inactive; a claim holds one removed since. Org B's: one.
const SP_ON = ID('spiff_on'), SP_OFF = ID('spiff_off'), SP_REMOVED = ID('spiff_removed'), SP_B = ID('spiff_b');
// Deals: Karen's, Ravi's, B's; one deleted since (no row).
const DEAL_K = ID('deal_karen'), DEAL_R = ID('deal_ravi'), DEAL_B = ID('deal_b'), DEAL_GONE = ID('deal_gone');
// Products: A's active and inactive, B's; one that names nothing.
const PROD_ON = ID('prod_on'), PROD_OFF = ID('prod_off'), PROD_B = ID('prod_b'), PROD_GONE = ID('prod_gone');
// Claims: A's whose SPIFF was removed and deal deleted; Karen's pending; one to delete; B's.
const CLAIM_HELD = ID('claim_held'), CLAIM_K = ID('claim_karen'), CLAIM_DEL = ID('claim_del'), CLAIM_B = ID('claim_b');
// Quotes: Karen's Draft holding a stray line; Karen's Draft for the malformed saves; Ravi's; B's.
const Q_DRAFT = ID('q_draft'), Q_LINES = ID('q_lines'), Q_RAVI = ID('q_ravi'), Q_B = ID('q_b');
// Rules: A's whose assignee was deleted since; B's.
const RULE_HELD = ID('rule_held'), RULE_B = ID('rule_b');
// Export: B's schedule and B's run.
const XSCHED_B = ID('xsched_b'), XRUN_B = ID('xrun_b');

const line = (productId, extra = {}) => ({ productId, productName: `Itest ${productId}`, productType: 'one_time', unit: 'flat', listPrice: 100, quantity: 1, discountPct: 0, ...extra });
const DRAFT_LINES = [line(PROD_ON), line(PROD_GONE)];
const ct = (assignedToId) => ({ type: 'create_task', params: { title: 'Follow up', assignedToId } });
const HELD_ACTIONS = [{ type: 'send_email', params: { to: 'vp@itest-slinks.local' } }, ct(USR.gone)];

const call = async (fn, who, method, body, qs) => {
    const res = await FN[fn]({
        httpMethod: method,
        headers: { authorization: 'Bearer ' + tokenFor(who.clerk, who.org), 'content-type': 'application/json' },
        queryStringParameters: qs || {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const one = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];
const ids = (rows) => (rows || []).map((r) => r.id).sort();
const audits = async (org, action, entityId) => (await db.select().from(auditLog)
    .where(and(eq(auditLog.orgId, org), eq(auditLog.action, action), eq(auditLog.entityId, entityId)))).length;
const rulesOf = async (org) => (await db.select().from(automations).where(eq(automations.orgId, org))).length;

const TABLES = [settings, users, opportunities, products, quotes, spiffClaims, automations, exportRuns, exportSchedules, auditLog];
const cleanup = async () => {
    for (const t of TABLES) await db.delete(t).where(inArray(t.orgId, ORGS));
};

// Org B's rows, whole — taken once seeded, compared at the end.
const B_TABLES = { settings, users, opportunities, products, quotes, spiffClaims, automations, exportRuns, exportSchedules };
const bRows = async () => {
    const out = {};
    for (const [name, t] of Object.entries(B_TABLES)) {
        out[name] = (await db.select().from(t).where(eq(t.orgId, B))).sort((x, y) => x.id.localeCompare(y.id));
    }
    return out;
};
let bSeeded;

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const now = new Date();
    await db.insert(settings).values([
        { id: ID('settings_A'), orgId: A, extra: { spiffs: [
            { id: SP_ON, name: 'Q4 push', type: 'flat', amount: 500, active: true },
            { id: SP_OFF, name: 'Old push', type: 'flat', amount: 100, active: false },
        ] } },
        { id: ID('settings_B'), orgId: B, extra: { spiffs: [{ id: SP_B, name: 'B push', type: 'flat', amount: 50, active: true }] } },
    ]);
    const u = (id, org, clerkUserId, name, role, extra = {}) => ({ id, orgId: org, clerkUserId, name, email: `${id}@itest-slinks.local`, role, ...extra });
    await db.insert(users).values([
        u(USR.admin, A, WHO.admin.clerk, 'Ada Slinks', 'Admin'),
        u(USR.mgr, A, WHO.mgr.clerk, 'Max Slinks', 'Manager'),
        u(USR.karen, A, WHO.karen.clerk, 'Karen Slinks', 'User'),
        u(USR.ravi, A, 'clerk_itest_slinks_ravi', 'Ravi Slinks', 'User'),
        u(USR.deact, A, 'clerk_itest_slinks_deact', 'Dee Slinks', 'User', { active: false, profile: { status: 'Inactive' } }),
        u(USR.invited, A, null, 'Ivy Slinks', 'User', { profile: { status: 'Invited' } }),
        u(USR.adminB, B, WHO.adminB.clerk, 'Bea Slinks', 'Admin'),
        u(USR.repB, B, 'clerk_itest_slinks_rep_b', 'Bo Slinks', 'User'),
    ]);
    invalidateRoster();
    const deal = (id, org, owner, rep) => ({ id, orgId: org, pipelineId: 'default', stage: 'Proposal', opportunityName: id, account: 'Slinks Co', ownerId: owner, salesRep: rep, arr: '1000.00' });
    await db.insert(opportunities).values([
        deal(DEAL_K, A, USR.karen, 'Karen Slinks'), deal(DEAL_R, A, USR.ravi, 'Ravi Slinks'), deal(DEAL_B, B, USR.repB, 'Bo Slinks'),
    ]);
    await db.insert(products).values([
        { id: PROD_ON, orgId: A, name: 'Slinks Platform', listPrice: '100.00', active: true },
        { id: PROD_OFF, orgId: A, name: 'Slinks Legacy', listPrice: '100.00', active: false },
        { id: PROD_B, orgId: B, name: 'B Platform', listPrice: '100.00', active: true },
    ]);
    const claim = (id, org, spiffId, repName, opportunityId, extra = {}) => ({ id, orgId: org, spiffId, spiffName: 'Q4 push', repName, opportunityId,
        amount: '500', status: 'pending', claimedAt: now, ...extra });
    await db.insert(spiffClaims).values([
        claim(CLAIM_HELD, A, SP_REMOVED, 'Karen Slinks', DEAL_GONE, { spiffName: 'Removed push' }),
        claim(CLAIM_K, A, SP_ON, 'Karen Slinks', DEAL_K),
        claim(CLAIM_DEL, A, SP_ON, 'Ravi Slinks', DEAL_R),
        claim(CLAIM_B, B, SP_B, 'Bo Slinks', DEAL_B, { spiffName: 'B push', amount: '50' }),
    ]);
    const quote = (id, org, opportunityId, n, lineItems) => ({ id, orgId: org, opportunityId, quoteNumber: `ITEST-SLINKS-${n}`, version: 1, name: id,
        status: 'Draft', lineItems, createdBy: 'Karen Slinks' });
    await db.insert(quotes).values([
        quote(Q_DRAFT, A, DEAL_K, 1, DRAFT_LINES), quote(Q_LINES, A, DEAL_K, 2, [line(PROD_ON)]),
        quote(Q_RAVI, A, DEAL_R, 3, [line(PROD_ON)]), quote(Q_B, B, DEAL_B, 4, [line(PROD_B)]),
    ]);
    await db.insert(automations).values([
        { id: RULE_HELD, orgId: A, name: 'Won → a task for a member gone since', triggerEvent: 'deal.won', conditions: [], actions: HELD_ACTIONS },
        { id: RULE_B, orgId: B, name: 'B rule', triggerEvent: 'deal.won', conditions: [], actions: [ct(USR.repB)] },
    ]);
    await db.insert(exportSchedules).values({ id: XSCHED_B, orgId: B, name: 'B nightly', scope: 'accounts', cadence: 'daily' });
    await db.insert(exportRuns).values({ id: XRUN_B, orgId: B, scheduleId: XSCHED_B, name: 'B run', scope: 'accounts', triggeredBy: WHO.adminB.clerk });
    bSeeded = await bRows();
});

after(cleanup);

// ── 1. SPIFF claims ──────────────────────────────────────────────────────────

const newClaim = (id, extra = {}) => ({ id, spiffId: SP_ON, spiffName: 'Q4 push', repName: 'Karen Slinks', opportunityId: DEAL_K, amount: 500, ...extra });

test("a claim naming org B's deal is refused 404 naming opportunityId — and nothing is written", async () => {
    const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(ID('n_claim_bdeal'), { opportunityId: DEAL_B }));
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.deal, field: 'opportunityId' });
    assert.equal(await one(spiffClaims, ID('n_claim_bdeal')), undefined);
    assert.equal(await audits(A, 'spiff_claim.submitted', ID('n_claim_bdeal')), 0);
});

test('a claim naming a deal id that names nothing is refused 404', async () => {
    const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(ID('n_claim_nodeal'), { opportunityId: DEAL_GONE }));
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.deal, field: 'opportunityId' });
    assert.equal(await one(spiffClaims, ID('n_claim_nodeal')), undefined);
});

test("a claim naming org B's SPIFF is refused 404 naming spiffId — and nothing is written", async () => {
    const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(ID('n_claim_bspiff'), { spiffId: SP_B }));
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.spiff, field: 'spiffId' });
    assert.equal(await one(spiffClaims, ID('n_claim_bspiff')), undefined);
});

test("an inactive SPIFF of this org stands (\"Any of this org's\") — 201", async () => {
    const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(ID('n_claim_off'), { spiffId: SP_OFF, spiffName: 'Old push' }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(spiffClaims, ID('n_claim_off'))).spiffId, SP_OFF);
});

test("a rep's claim on another rep's deal of this org stands (E3: any deal of the org) — 201", async () => {
    const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(ID('n_claim_ravideal'), { opportunityId: DEAL_R }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = await one(spiffClaims, ID('n_claim_ravideal'));
    assert.equal(row.opportunityId, DEAL_R);
    assert.equal(row.repName, 'Karen Slinks', 'filed in her roster name');
});

test('a claim whose spiffId is not text is refused 400 — and nothing is written', async () => {
    const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(ID('n_claim_numspiff'), { spiffId: 5 }));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_AN_ID, field: 'spiffId' });
    assert.equal(await one(spiffClaims, ID('n_claim_numspiff')), undefined);
});

test('a claim id that is not text is refused 400 — no row of its text afterwards (correctness F7: it was stored as its text)', async () => {
    const NUM = 2042041601;   // a number no other suite names
    assert.equal(await one(spiffClaims, String(NUM)), undefined, 'precondition: no such row');
    const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(NUM));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'id required' });
    assert.equal(await one(spiffClaims, String(NUM)), undefined, 'REGRESSION: a numeric claim id was stored as its text');
    const put = await call('spiff-claims', WHO.mgr, 'PUT', { id: NUM, note: 'x' });
    assert.equal(put.status, 400, JSON.stringify(put.body));
    assert.equal(await one(spiffClaims, String(NUM)), undefined, 'nor by a save');
});

test("a Manager's claim filed for a rep of spaces is refused 400 — no row (a name no rep's matches; critic F11)", async () => {
    const r = await call('spiff-claims', WHO.mgr, 'POST', newClaim(ID('n_claim_blankrep'), { repName: '   ' }));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'id, repName, spiffId required' });
    assert.equal(await one(spiffClaims, ID('n_claim_blankrep')), undefined);
});

test("a Manager's save re-sending a claim's HELD SPIFF (removed since) and deal (deleted since), and its rep, stands — 200 (critic F6)", async () => {
    const r = await call('spiff-claims', WHO.mgr, 'PUT', { id: CLAIM_HELD, spiffId: SP_REMOVED, opportunityId: DEAL_GONE, repName: 'Karen Slinks', note: 'held links re-sent' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(spiffClaims, CLAIM_HELD);
    assert.equal(row.note, 'held links re-sent');
    assert.deepEqual([row.spiffId, row.opportunityId, row.repName], [SP_REMOVED, DEAL_GONE, 'Karen Slinks'], 'the held links kept');
});

test("D2: an Approve that names only its status — { id, status, approvedAt, approvedBy } — of the removed-SPIFF claim stands, and keeps the rest", async () => {
    const approvedAt = new Date('2026-10-16T12:00:00Z').toISOString();
    const r = await call('spiff-claims', WHO.mgr, 'PUT', { id: CLAIM_HELD, status: 'approved', approvedAt, approvedBy: 'Max Slinks' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(spiffClaims, CLAIM_HELD);
    assert.equal(row.status, 'approved');
    assert.equal(row.approvedBy, 'Max Slinks');
    assert.ok(row.approvedAt);
    assert.deepEqual([row.spiffId, row.opportunityId, row.repName, row.note, Number(row.amount)], [SP_REMOVED, DEAL_GONE, 'Karen Slinks', 'held links re-sent', 500]);
    assert.equal(await audits(A, 'spiff_claim.approved', CLAIM_HELD), 1);
});

test("the same claim re-pointed to org B's SPIFF is refused 404 naming spiffId — the claim unchanged", async () => {
    const was = await one(spiffClaims, CLAIM_HELD);
    const r = await call('spiff-claims', WHO.mgr, 'PUT', { id: CLAIM_HELD, spiffId: SP_B });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.spiff, field: 'spiffId' });
    assert.deepEqual(await one(spiffClaims, CLAIM_HELD), was);
});

// Before the two refusals below: on the old code the Manager's '  ' was stored, and this one would read it.
test('a save that names neither the SPIFF nor the rep, on a stored claim, stands — 200, both as stored', async () => {
    const r = await call('spiff-claims', WHO.mgr, 'PUT', { id: CLAIM_K, note: 'names neither' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(spiffClaims, CLAIM_K);
    assert.equal(row.note, 'names neither');
    assert.deepEqual([row.spiffId, row.repName, row.status], [SP_ON, 'Karen Slinks', 'pending']);
});

test("(1): a rep's save that clears her claim's SPIFF is refused 400 naming spiffId — '' and null; the claim unchanged", async () => {
    const was = await one(spiffClaims, CLAIM_K);
    for (const spiffId of ['', null]) {
        const r = await call('spiff-claims', WHO.karen, 'PUT', { id: CLAIM_K, spiffId });
        assert.equal(r.status, 400, `${JSON.stringify(spiffId)}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: 'A claim names its SPIFF — it cannot be cleared.', field: 'spiffId' });
    }
    assert.deepEqual(await one(spiffClaims, CLAIM_K), was);
});

test("(1): a Manager's save that turns a set rep to spaces is refused 400 naming repName (critic F2) — the claim unchanged", async () => {
    const was = await one(spiffClaims, CLAIM_K);
    const r = await call('spiff-claims', WHO.mgr, 'PUT', { id: CLAIM_K, repName: '  ' });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'A claim names its rep — it cannot be cleared.', field: 'repName' });
    assert.deepEqual(await one(spiffClaims, CLAIM_K), was);
});

test("a Sales Rep's claim whose body names a rep of spaces, or none, is filed — 201, in her roster name: the rep is tested on the claim as written (review F1)", async () => {
    for (const [tag, extra] of [['spacesrep', { repName: '   ' }], ['norep', { repName: undefined }]]) {
        const r = await call('spiff-claims', WHO.karen, 'POST', newClaim(ID(`n_claim_${tag}`), extra));
        assert.equal(r.status, 201, `${tag}: ${JSON.stringify(r.body)}`);
        assert.equal((await one(spiffClaims, ID(`n_claim_${tag}`))).repName, 'Karen Slinks', `${tag}: filed in her roster name`);
    }
});

test("a new claim whose SPIFF is spaces, 0 or false is refused 400 — no row (a SPIFF of spaces is none, review F2; 0 and false were stored as none, the NOT NULL's 500 — re-check R1); an object SPIFF is no id, 400", async () => {
    for (const [who, tag, spiffId] of [[WHO.mgr, 'spspaces_m', '   '], [WHO.karen, 'spspaces_k', '   '], [WHO.mgr, 'spzero', 0], [WHO.karen, 'spfalse', false]]) {
        const r = await call('spiff-claims', who, 'POST', newClaim(ID(`n_claim_${tag}`), { spiffId }));
        assert.equal(r.status, 400, `${tag}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: 'id, repName, spiffId required' });
        assert.equal(await one(spiffClaims, ID(`n_claim_${tag}`)), undefined);
    }
    const r = await call('spiff-claims', WHO.mgr, 'POST', newClaim(ID('n_claim_spobj'), { spiffId: { toString: 1 } }));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_AN_ID, field: 'spiffId' });
    assert.equal(await one(spiffClaims, ID('n_claim_spobj')), undefined);
});

test("(1): a save turning a set SPIFF to spaces is refused 400 'cannot be cleared' — a Manager's and the rep's own, never the link's 404 (review F2) — and so is 0 or false for the SPIFF or the rep (re-check R1); an object SPIFF is no id, 400; the claim unchanged", async () => {
    const was = await one(spiffClaims, CLAIM_K);
    const WORDS = { spiffId: 'A claim names its SPIFF — it cannot be cleared.', repName: 'A claim names its rep — it cannot be cleared.' };
    for (const [who, change, field] of [[WHO.mgr, { spiffId: '   ' }, 'spiffId'], [WHO.karen, { spiffId: '   ' }, 'spiffId'],
        [WHO.mgr, { spiffId: 0 }, 'spiffId'], [WHO.karen, { spiffId: false }, 'spiffId'], [WHO.mgr, { repName: 0 }, 'repName'], [WHO.mgr, { repName: false }, 'repName']]) {
        const r = await call('spiff-claims', who, 'PUT', { id: CLAIM_K, ...change });
        assert.equal(r.status, 400, `${JSON.stringify(change)}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: WORDS[field], field });
    }
    for (const who of [WHO.mgr, WHO.karen]) {
        const r = await call('spiff-claims', who, 'PUT', { id: CLAIM_K, spiffId: { toString: 1 } });
        assert.equal(r.status, 400, JSON.stringify(r.body));
        assert.deepEqual(r.body, { error: NOT_AN_ID, field: 'spiffId' });
    }
    assert.deepEqual(await one(spiffClaims, CLAIM_K), was);
});

test("(2): an Admin's save of a claim id no org holds is 404 — it created the claim", async () => {
    const NOWHERE = ID('claim_nowhere');
    const r = await call('spiff-claims', WHO.admin, 'PUT', { id: NOWHERE, spiffId: SP_ON, repName: 'Karen Slinks', note: 'x' });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'Claim not found in your organization' });
    assert.equal(await one(spiffClaims, NOWHERE), undefined, 'REGRESSION: a save created a claim');
});

test("(2): an Admin's save of org B's claim id is 404 — B's row byte-identical", async () => {
    const was = await one(spiffClaims, CLAIM_B);
    const r = await call('spiff-claims', WHO.admin, 'PUT', { id: CLAIM_B, spiffId: SP_ON, repName: 'Karen Slinks', note: 'from org A' });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'Claim not found in your organization' });
    assert.deepEqual(await one(spiffClaims, CLAIM_B), was);
});

test("a claim POST with org B's claim id is 409 — it crashed, a 500 — and B's row is byte-identical", async () => {
    const was = await one(spiffClaims, CLAIM_B);
    const r = await call('spiff-claims', WHO.mgr, 'POST', newClaim(CLAIM_B, { repName: 'Ravi Slinks', amount: 50 }));
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'That claim id is already in use.' });
    assert.deepEqual(await one(spiffClaims, CLAIM_B), was);
    assert.equal(await audits(A, 'spiff_claim.submitted', CLAIM_B), 0, 'nothing recorded in org A');
});

test('a Manager deletes a claim — gone, audited spiff_claim.deleted; a rep cannot (403), the claim stays', async () => {
    const rep = await call('spiff-claims', WHO.karen, 'DELETE', undefined, { id: CLAIM_K });
    assert.equal(rep.status, 403, JSON.stringify(rep.body));
    assert.ok(await one(spiffClaims, CLAIM_K), 'the rep\'s DELETE removed nothing');
    const r = await call('spiff-claims', WHO.mgr, 'DELETE', undefined, { id: CLAIM_DEL });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await one(spiffClaims, CLAIM_DEL), undefined);
    assert.equal(await audits(A, 'spiff_claim.deleted', CLAIM_DEL), 1);
});

// ── 2. Export runs ───────────────────────────────────────────────────────────

test("an export run stores no schedule, whatever the body names — org B's schedule named, schedule_id null", async () => {
    const r = await call('export-runs', WHO.admin, 'POST', { id: ID('xrun_a'), scope: 'opportunities', scheduleId: XSCHED_B });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.run.scheduleId, null);
    const row = await one(exportRuns, ID('xrun_a'));
    assert.equal(row.orgId, A);
    assert.equal(row.scheduleId, null, 'REGRESSION: a run stored the schedule the body named');
});

test("an export run with org B's run id is 409 — it crashed, a 500 — no file handed over, B's row as seeded", async () => {
    const was = await one(exportRuns, XRUN_B);
    const r = await call('export-runs', WHO.admin, 'POST', { id: XRUN_B, scope: 'opportunities' });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'That export run id is already in use.' });
    assert.equal(r.body.download, undefined, 'no file');
    assert.deepEqual(await one(exportRuns, XRUN_B), was);
    assert.equal(await audits(A, 'export.run', XRUN_B), 0);
});

// ── 3. Quotes — as the rep, on her own deal (critic F8) ──────────────────────

const newQuote = (id, lineItems, extra = {}) => ({ id, opportunityId: DEAL_K, name: id, lineItems, ...extra });

test("a quote naming org B's product, or one that names nothing, is refused 404 naming lineItems — no quote", async () => {
    for (const [id, stray] of [[ID('n_q_bprod'), PROD_B], [ID('n_q_noprod'), PROD_GONE]]) {
        const r = await call('quotes', WHO.karen, 'POST', newQuote(id, [line(PROD_ON), line(stray)]));
        assert.equal(r.status, 404, `${stray}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_IN_ORG.product, field: 'lineItems' });
        assert.equal(await one(quotes, id), undefined);
    }
});

test("an inactive product of this org stands (\"Any of this org's\") — 201", async () => {
    const r = await call('quotes', WHO.karen, 'POST', newQuote(ID('n_q_off'), [line(PROD_OFF)]));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(quotes, ID('n_q_off'))).lineItems[0].productId, PROD_OFF);
});

test("a save adding org B's product to a Draft is refused 404 naming lineItems — the lines as stored", async () => {
    const r = await call('quotes', WHO.karen, 'PUT', { id: Q_DRAFT, lineItems: [...DRAFT_LINES, line(PROD_B)] });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.product, field: 'lineItems' });
    assert.deepEqual((await one(quotes, Q_DRAFT)).lineItems, DRAFT_LINES);
});

test('the Draft re-sent with the line it holds — a product that names nothing — stands: 200 (held, never asked again)', async () => {
    const r = await call('quotes', WHO.karen, 'PUT', { id: Q_DRAFT, lineItems: DRAFT_LINES, notes: 're-sent as stored' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(quotes, Q_DRAFT);
    assert.equal(row.notes, 're-sent as stored');
    assert.deepEqual(row.lineItems, DRAFT_LINES);
});

test('a status move sends no lines and asks nothing — 200, the held line kept', async () => {
    const r = await call('quotes', WHO.karen, 'PUT', { id: Q_DRAFT, status: 'Sent to Customer' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(quotes, Q_DRAFT);
    assert.equal(row.status, 'Sent to Customer');
    assert.deepEqual(row.lineItems, DRAFT_LINES);
});

test('a line whose productId is not text is refused 400 naming lineItems — no quote', async () => {
    const r = await call('quotes', WHO.karen, 'POST', newQuote(ID('n_q_numprod'), [line(7)]));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_AN_ID, field: 'lineItems' });
    assert.equal(await one(quotes, ID('n_q_numprod')), undefined);
});

test('D5: a new quote whose line is not an object, or whose lines are not a list, is refused 400 naming lineItems — no quote', async () => {
    for (const [id, lineItems] of [[ID('n_q_nullline'), [line(PROD_ON), null]], [ID('n_q_notlist'), { productId: PROD_ON }]]) {
        const r = await call('quotes', WHO.karen, 'POST', newQuote(id, lineItems));
        assert.equal(r.status, 400, `${id}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_LINES, field: 'lineItems' });
        assert.equal(await one(quotes, id), undefined);
    }
});

test('D5: a save whose line is not an object, or whose lines are not a list, is refused 400 naming lineItems — the lines and totals as stored', async () => {
    const was = await one(quotes, Q_LINES);
    for (const lineItems of [[line(PROD_ON), null], { productId: PROD_ON }, [[line(PROD_ON)]]]) {
        const r = await call('quotes', WHO.karen, 'PUT', { id: Q_LINES, lineItems });
        assert.equal(r.status, 400, `${JSON.stringify(lineItems)}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_LINES, field: 'lineItems' });
    }
    assert.deepEqual(await one(quotes, Q_LINES), was, 'REGRESSION: a malformed save wiped the lines or zeroed the totals');
});

test("a quote POST with org B's quote id is 409 — it was retried as a number collision, then a 500 — and B's row is byte-identical", async () => {
    const was = await one(quotes, Q_B);
    const r = await call('quotes', WHO.karen, 'POST', newQuote(Q_B, [line(PROD_ON)]));
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'That quote id is already in use.' });
    assert.deepEqual(await one(quotes, Q_B), was);
    assert.equal(await audits(A, 'quote.created', Q_B), 0);
});

test("the rep's refusal on another rep's quote or deal is the ownership one — before any product is asked (critic F8)", async () => {
    const was = await one(quotes, Q_RAVI);
    const put = await call('quotes', WHO.karen, 'PUT', { id: Q_RAVI, lineItems: [line(PROD_B)] });
    assert.equal(put.status, 404, JSON.stringify(put.body));
    assert.deepEqual(put.body, { error: 'Quote not found' }, 'not the product\'s refusal: no field');
    assert.deepEqual(await one(quotes, Q_RAVI), was);
    const post = await call('quotes', WHO.karen, 'POST', { id: ID('n_q_ravideal'), opportunityId: DEAL_R, lineItems: [line(PROD_B)] });
    assert.equal(post.status, 404, JSON.stringify(post.body));
    assert.deepEqual(post.body, { error: 'Deal not found' });
    assert.equal(await one(quotes, ID('n_q_ravideal')), undefined);
});

test("a Manager, who may change Ravi's quote, meets the product's refusal on it — 404 naming lineItems, the quote unchanged", async () => {
    const was = await one(quotes, Q_RAVI);
    const r = await call('quotes', WHO.mgr, 'PUT', { id: Q_RAVI, lineItems: [line(PROD_ON), line(PROD_B)] });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.product, field: 'lineItems' });
    assert.deepEqual(await one(quotes, Q_RAVI), was);
});

test('a quote number another save takes between the read and the write is still retried, and the quote created (the 409 answers a taken id only)', async () => {
    const NEW = ID('n_q_race'), RACER = ID('q_racer');
    assert.equal(Object.hasOwn(db, 'insert'), false, 'precondition: db.insert is the prototype\'s');
    const state = { attempts: 0, taken: null };
    const realInsert = db.insert;
    // The race, staged: the first time this quote is written, another quote of the org takes the same number
    // and version a moment before the write lands — what a second rep's save does between the read of the
    // highest number and the insert.
    db.insert = function (table) {
        const builder = realInsert.call(db, table);
        if (table !== quotes) return builder;
        const values = builder.values.bind(builder);
        builder.values = (v) => {
            const q = values(v);
            if (!v || Array.isArray(v) || v.id !== NEW) return q;
            state.attempts += 1;
            if (state.taken) return q;
            state.taken = { quoteNumber: v.quoteNumber, version: v.version };
            const execute = q.execute;
            q.execute = async (...a) => {
                await realInsert.call(db, quotes).values({ id: RACER, orgId: A, opportunityId: DEAL_K, quoteNumber: v.quoteNumber, version: v.version,
                    name: 'the racer', status: 'Draft', lineItems: [], createdBy: 'Ravi Slinks' });
                return execute(...a);
            };
            return q;
        };
        return builder;
    };
    let r;
    try {
        r = await call('quotes', WHO.karen, 'POST', newQuote(NEW, [line(PROD_ON)]));
    } finally {
        delete db.insert;
    }
    assert.equal(r.status, 201, `REGRESSION: a number collision was answered as a taken id, or not retried: ${JSON.stringify(r.body)}`);
    assert.ok(state.taken, 'the race was staged');
    assert.equal(state.attempts, 2, 'written twice: the collision, then the retry');
    const racer = await one(quotes, RACER);
    assert.equal(racer.quoteNumber, state.taken.quoteNumber);
    const made = await one(quotes, NEW);
    assert.equal(made.orgId, A);
    assert.equal(made.version, racer.version);
    assert.notEqual(made.quoteNumber, racer.quoteNumber, 'the retry took the next number');
    assert.equal(r.body.quote.quoteNumber, made.quoteNumber);
});

// ── 4. Automation rules — as an Admin ────────────────────────────────────────

const rule = (name, actions) => ({ name, triggerEvent: 'deal.won', conditions: [], actions });

test("a rule assigning a task to org B's member, or to a member id that names nothing, is refused 404 naming actions — no rule", async () => {
    const before = await rulesOf(A);
    for (const who of [USR.repB, USR.gone]) {
        const r = await call('automations', WHO.admin, 'POST', rule(`assigns ${who}`, [ct(USR.karen), ct(who)]));
        assert.equal(r.status, 404, `${who}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_IN_ORG.member, field: 'actions' });
    }
    assert.equal(await rulesOf(A), before, 'nothing written');
});

test("a rule assigning tasks to this org's deactivated and invited members stands (\"Any of this org's\") — 201; a name-only pick asks nothing", async () => {
    const r = await call('automations', WHO.admin, 'POST', rule('deactivated and invited', [ct(USR.deact), ct(USR.invited), ct('')]));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = await one(automations, r.body.automation.id);
    assert.equal(row.orgId, A);
    assert.deepEqual(row.actions.map((a) => a.params.assignedToId), [USR.deact, USR.invited, '']);
});

test("an edit naming org B's member is refused 404 naming actions — the rule unchanged", async () => {
    const was = await one(automations, RULE_HELD);
    const r = await call('automations', WHO.admin, 'PUT', { id: RULE_HELD, actions: [...HELD_ACTIONS, ct(USR.repB)] });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.member, field: 'actions' });
    assert.deepEqual(await one(automations, RULE_HELD), was);
});

test('an edit re-sending the assignee the rule holds — a member deleted since — stands: 200 (held, never asked again)', async () => {
    const r = await call('automations', WHO.admin, 'PUT', { id: RULE_HELD, name: 'renamed, assignee held', actions: HELD_ACTIONS });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(automations, RULE_HELD);
    assert.equal(row.name, 'renamed, assignee held');
    assert.deepEqual(row.actions, HELD_ACTIONS);
});

test('the toggle — { id, active } — names no actions and stands: 200', async () => {
    const r = await call('automations', WHO.admin, 'PUT', { id: RULE_HELD, active: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(automations, RULE_HELD);
    assert.equal(row.active, false);
    assert.deepEqual(row.actions, HELD_ACTIONS);
});

test("an edit with actions on org B's rule id is not found — 404, B's rule unchanged", async () => {
    const was = await one(automations, RULE_B);
    const r = await call('automations', WHO.admin, 'PUT', { id: RULE_B, name: 'from org A', actions: [ct(USR.karen)] });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: 'Not found' });
    assert.deepEqual(await one(automations, RULE_B), was);
});

// ── 5. Org B ─────────────────────────────────────────────────────────────────

test("org B's Admin reads none of org A's new records — the claims, quotes, rules and export runs A just made (critic F7)", async () => {
    const aMade = {
        claims: ids(await db.select().from(spiffClaims).where(eq(spiffClaims.orgId, A))),
        quotes: ids(await db.select().from(quotes).where(eq(quotes.orgId, A))),
        rules: ids(await db.select().from(automations).where(eq(automations.orgId, A))),
        runs: ids(await db.select().from(exportRuns).where(eq(exportRuns.orgId, A))),
    };
    for (const id of [ID('n_claim_off'), ID('n_claim_ravideal')]) assert.ok(aMade.claims.includes(id), `A made ${id}`);
    for (const id of [ID('n_q_off'), ID('n_q_race')]) assert.ok(aMade.quotes.includes(id), `A made ${id}`);
    assert.ok(aMade.rules.length >= 2, 'A made a rule');
    assert.ok(aMade.runs.includes(ID('xrun_a')), 'A made a run');
    const reads = [
        ['spiff-claims', 'spiffClaims', aMade.claims, [CLAIM_B]],
        ['quotes', 'quotes', aMade.quotes, [Q_B]],
        ['automations', 'automations', aMade.rules, [RULE_B]],
        ['export-runs', 'runs', aMade.runs, [XRUN_B]],
    ];
    for (const [fn, key, mine, theirs] of reads) {
        const r = await call(fn, WHO.adminB, 'GET');
        assert.equal(r.status, 200, `${fn}: ${JSON.stringify(r.body)}`);
        const got = ids(r.body[key]);
        assert.deepEqual(got, theirs, `${fn}: B's own, and only B's`);
        assert.ok(!got.some((id) => mine.includes(id)), `${fn}: none of A's`);
    }
});

test("org B's rows are as seeded — every refusal, 409 and save in org A left them alone; nothing recorded in B's log", async () => {
    assert.deepEqual(await bRows(), bSeeded);
    assert.equal((await db.select().from(auditLog).where(eq(auditLog.orgId, B))).length, 0);
});
