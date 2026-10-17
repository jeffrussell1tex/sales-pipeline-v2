// tests/integration/member-links.itest.mjs
//
// A member's team and pinned reports name this org's, and the restore lands, counts and cleans what it brings
// (state §0.205 — batch 4b-2c, "the members and the restore"; Jeff, 15 Oct: "Any of this org's, refuse", "Send only
// what changed", "Fix both in 4b-2"; 16 Oct: "Fix both", "No, leave it", "Fix now"). Against the test database,
// with the REAL verifyAuth (only the Clerk SDK is a stand-in: verifyToken reads the claims a test token carries,
// so each caller's role is their row's in this org's roster) and the real users, backup and saved-reports handlers:
//   CREATE    a new member's team is an entry of this org's teams list — org B's, an old plain-text team or one
//             naming nothing is 404 naming teamId, a team that is no id 400, and no row; an Admin's and a
//             Manager's create naming this org's team stands (a Manager is held to the org check alone — no
//             403: "No, leave it"); the pins a create is sent are not stored — a member's pins are their own
//   INVITE    a new member's team is asked before Clerk is called: a refused row reaches no invitation and
//             leaves no row, the batch's other row lands with its team; a re-invitation stores no team (it
//             keeps the row's), so the team it names is not asked
//   PUT       an Admin's or a Manager's save naming a team anew — org B's, or one naming nothing — is 404, the
//             row as it was; the team a row holds (removed since) re-sent stands; the pins a save sends are
//             never written, and { id, active, pinnedReports } is no Deactivate
//   FORECAST  the server's answer to the body a Manager's forecast call now sends ({ id, forecastCalls }): the
//             member's team, its date, pins and name kept — a guard (the tab's body itself is pinned in the
//             unit suite, tests/member-links.test.mjs T6); an old tab's whole row naming a team removed since
//             is 404, its call not stored
//   SELF      a member's own Pin names saved reports of this org — a colleague's private one too; org B's is
//             404, pins that are no list or a pin that is no id 400; the pins held are never asked again; a
//             team in the body is dropped by the allowlist, never asked
//   RESTORE   every date column of a table it restores lands — a member's team date, a quote's approval, sent
//             and accepted dates, a merged account's and contact's archive date, a lead's score date; a job's
//             text invoice paid date stays text; '' is left to the column — the rows the database refuses for
//             their data (a SQLSTATE of class 22 or 23: a product with no price, 23502 — the real driver's own
//             error) are counted and said by their table, and the audit row names the table; "records restored"
//             counts only rows written, and the rows already here are said apart, never which org holds one; a quote
//             line's product, a member's team (with the date they joined it — the team's name kept) and pins
//             that name nothing here are cleared and counted, the quota plans kept — a profile the file gives
//             as JSON text, which the clean-up does not write, counts nothing; this function's own roster
//             cache is dropped after it; a restore that wrote nothing, found nothing already here and met an
//             error is a 500; a snapshot's id is the minute and a random suffix — two in one minute are two
//             ids. A row the database did not answer for, or did not take for a reason of its own (a
//             timeout, a connection), is not staged here — the test database answers every request, and in
//             time: tests/member-links.test.mjs T13 runs those on the driver's own errors; the answer counts them
//             (unreached — the re-check), here none: a row the database refused is never one
//   ORG B     reads none of A's members or reports, and every B row is as seeded at the end
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_mlinks_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_mlinks_*' — its two orgs, every row id it seeds or names ('itest_mlinks_…';
// a member's 'usr_itest_mlinks_…'), its members' Clerk ids ('clerk_itest_mlinks_…') and emails ('…@itest-mlinks.local')
// — and ONLY this file writes to it (guide §18b25). Ids the handlers mint (a created or invited member's 'usr_…',
// a snapshot's 'bk_snap_…', an audit row's) are cleaned by org.
const A = 'itest_mlinks_A', B = 'itest_mlinks_B';
const ORGS = [A, B];
const ID = (s) => 'itest_mlinks_' + s;
const E = (s) => `${s}@itest-mlinks.local`;

// The Clerk stand-in: no org has a pending invitation; each invitation sent is kept, so a refused row's "no
// invitation" is read, not assumed.
const sentInvitations = [];
const clerkClient = {
    users: { getUser: async () => { const e = new Error('Not Found'); e.status = 404; throw e; } },
    organizations: {
        getOrganizationMembershipList: async () => ({ data: [] }),
        getOrganizationInvitationList: async () => ({ data: [] }),
        createOrganizationInvitation: async (args) => { sentInvitations.push(args); return { id: 'orginv_itest_mlinks_' + sentInvitations.length }; },
        revokeOrganizationInvitation: async () => ({}),
    },
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
// No outbound email: a saved report's delivery is the one sender these handlers load.
const anyTemplate = new Proxy({}, { get: () => () => ({ subject: '', html: '', text: '' }) });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: anyTemplate },
});

const FN = {};
for (const name of ['users', 'backup', 'saved-reports']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const { settings, users, savedReports, opportunities, accounts, contacts, leads, quotes, products, dispatchCustomers, dispatchJobs, backups, auditLog } = await import('../../db/schema.js');
const { invalidateRoster, rosterUserById } = await import('../../netlify/functions/_lib.mjs');
const { NOT_AN_ID } = await import('../../src/utils/linkIds.js');
const { eq, and, inArray, sql } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// The words, written out: what the screen shows is part of the rule.
const NOT_IN_ORG = {
    team: 'That team is not in your organization — pick one from the list.',
    report: 'That saved report is not in your organization — pick one from the list.',
};
const REFUSED_PRODUCT = 'products: 1 record could not be restored — it has a value that cannot be stored, or lacks one that is required.';
const ALREADY_2 = '2 records in the file were already here — for each, a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and were left as they are.';
const ALREADY_13 = '13 records in the file were already here — for each, a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and were left as they are.';
const CLEARED_6 = '6 links that named no record of this organization were cleared.';

// Who signs in: a Clerk id, in an org — the role is the roster row's.
const WHO = {
    admin:  { clerk: 'clerk_itest_mlinks_admin',   org: A },
    mgr:    { clerk: 'clerk_itest_mlinks_mgr',     org: A },
    karen:  { clerk: 'clerk_itest_mlinks_karen',   org: A },
    adminB: { clerk: 'clerk_itest_mlinks_admin_b', org: B },
};
const USR = {
    admin: 'usr_itest_mlinks_admin', mgr: 'usr_itest_mlinks_mgr', karen: 'usr_itest_mlinks_karen', ravi: 'usr_itest_mlinks_ravi',
    ivy: 'usr_itest_mlinks_ivy', adminB: 'usr_itest_mlinks_admin_b',
};
// Teams: org A's list holds East and West (objects) and an old plain-text 'Legacy'; org B's holds one. A team
// removed since has no entry anywhere — Ravi still holds it.
const TEAM_EAST = ID('team_east'), TEAM_WEST = ID('team_west'), TEAM_B = ID('team_b'), TEAM_GONE = ID('team_gone');
// Saved reports: Karen's (private), Ravi's (private), the Admin's (shared); org B's; one deleted since (no row) —
// Karen still pins it.
const REP_KAREN = ID('report_karen'), REP_RAVI = ID('report_ravi'), REP_SHARED = ID('report_shared'), REP_B = ID('report_b'), REP_GONE = ID('report_gone');
// Org A's deal (the restored quote's); org B's product (a restored quote line names it).
const DEAL_A = ID('deal_a'), PROD_B = ID('prod_b');

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
const ME = { me: 'true' };
const one = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];
const byEmail = async (email) => db.select().from(users).where(eq(users.email, email));   // in every org
// A timestamp as Postgres prints it — read as text, never through a Date (they read +5h on Jeff's machine).
const textOf = async (table, col, id) => (await db.select({ t: sql`${col}::text` }).from(table).where(eq(table.id, id)))[0]?.t ?? null;
const logCount = async () => (await db.select({ n: sql`count(*)`.mapWith(Number) }).from(auditLog).where(eq(auditLog.orgId, A)))[0].n;
const ids = (rows) => (rows || []).map((r) => r.id).sort();

const TABLES = [settings, users, savedReports, opportunities, accounts, contacts, leads, quotes, products, dispatchJobs, dispatchCustomers, backups, auditLog];
const cleanup = async () => {
    for (const t of TABLES) await db.delete(t).where(inArray(t.orgId, ORGS));
};

// Org B's rows, whole — taken once seeded, compared at the end: A's restore, its snapshots and its products never
// land in B.
const B_TABLES = { settings, users, savedReports, products, backups };
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
    await db.insert(settings).values([
        { id: ID('settings_A'), orgId: A, extra: { teams: [{ id: TEAM_EAST, name: 'East', repIds: [USR.karen] }, 'Legacy', { id: TEAM_WEST, name: 'West' }] } },
        { id: ID('settings_B'), orgId: B, extra: { teams: [{ id: TEAM_B, name: 'B Team' }] } },
    ]);
    const u = (id, org, clerkUserId, local, name, role, extra = {}) => ({ id, orgId: org, clerkUserId, name, email: E(local), role, ...extra });
    await db.insert(users).values([
        u(USR.admin, A, WHO.admin.clerk, 'admin', 'Ada Mlinks', 'Admin', { profile: { status: 'Active' } }),
        u(USR.mgr, A, WHO.mgr.clerk, 'mgr', 'Max Mlinks', 'Manager', { profile: { status: 'Active' } }),
        u(USR.karen, A, WHO.karen.clerk, 'karen', 'Karen Mlinks', 'User', {
            team: 'East', teamJoinedAt: new Date('2026-09-01T00:00:00Z'),
            profile: { status: 'Active', teamId: TEAM_EAST, pinnedReports: [REP_KAREN, REP_GONE] },
        }),
        u(USR.ravi, A, 'clerk_itest_mlinks_ravi', 'ravi', 'Ravi Mlinks', 'User', { profile: { teamId: TEAM_GONE } }),
        u(USR.ivy, A, null, 'ivy', 'Ivy Mlinks', 'User', { active: false, profile: { status: 'Invited', teamId: TEAM_WEST } }),
        u(USR.adminB, B, WHO.adminB.clerk, 'admin_b', 'Bea Mlinks', 'Admin', { profile: { status: 'Active' } }),
    ]);
    invalidateRoster();
    await db.insert(savedReports).values([
        { id: REP_KAREN, orgId: A, ownerId: WHO.karen.clerk, ownerName: 'Karen Mlinks', name: "Karen's pipeline", isShared: false },
        { id: REP_RAVI, orgId: A, ownerId: 'clerk_itest_mlinks_ravi', ownerName: 'Ravi Mlinks', name: "Ravi's own", isShared: false },
        { id: REP_SHARED, orgId: A, ownerId: WHO.admin.clerk, ownerName: 'Ada Mlinks', name: 'Team board', isShared: true },
        { id: REP_B, orgId: B, ownerId: WHO.adminB.clerk, ownerName: 'Bea Mlinks', name: 'B board', isShared: true },
    ]);
    await db.insert(opportunities).values({ id: DEAL_A, orgId: A, pipelineId: 'default', stage: 'Discovery', opportunityName: 'Mlinks deal', ownerId: USR.karen, salesRep: 'Karen Mlinks' });
    await db.insert(products).values({ id: PROD_B, orgId: B, name: 'B product', listPrice: '10.00' });
    bSeeded = await bRows();
});

after(cleanup);

// ── 1-2. A new member: the create ────────────────────────────────────────────

test("CREATE (Admin): a new member's team that is org B's, an old plain-text team or one naming nothing is 404 naming teamId; a team that is no id is 400 — and no row, nothing in the log", async () => {
    const log = await logCount();
    for (const [local, teamId] of [['c_b', TEAM_B], ['c_legacy', 'Legacy'], ['c_gone', TEAM_GONE]]) {
        const r = await call('users', WHO.admin, 'POST', { name: 'Cora Refused', email: E(local), role: 'User', team: 'Any', teamId });
        assert.equal(r.status, 404, `${local}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_IN_ORG.team, field: 'teamId' });
        assert.deepEqual(await byEmail(E(local)), [], `${local}: no row`);
    }
    const n = await call('users', WHO.admin, 'POST', { name: 'Cora Refused', email: E('c_num'), role: 'User', teamId: 7 });
    assert.equal(n.status, 400, JSON.stringify(n.body));
    assert.deepEqual(n.body, { error: NOT_AN_ID, field: 'teamId' });
    assert.deepEqual(await byEmail(E('c_num')), []);
    assert.equal(await logCount(), log, 'nothing in the log');
});

test("CREATE (Admin): a team of this org's list stands — 201 — and the pins the body sends are not stored: a member's pins are their own", async () => {
    const r = await call('users', WHO.admin, 'POST', { name: 'Cora Created', email: E('c_ok'), role: 'User', team: 'West', teamId: TEAM_WEST, pinnedReports: [REP_KAREN] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const [row] = await byEmail(E('c_ok'));
    assert.deepEqual([row.orgId, row.team, row.profile.teamId], [A, 'West', TEAM_WEST]);
    assert.equal(row.profile.pinnedReports ?? null, null, 'REGRESSION: a create stores the pins it is sent');
});

test("CREATE (Manager): org B's team is the same 404 — the org check binds a Manager — and no row", async () => {
    const r = await call('users', WHO.mgr, 'POST', { name: 'Mia Refused', email: E('c_mgr_b'), role: 'User', teamId: TEAM_B });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.team, field: 'teamId' });
    assert.deepEqual(await byEmail(E('c_mgr_b')), []);
});

test("CREATE (Manager): any team of this org's list stands — 201, no 403 (Jeff, 16 Oct: \"No, leave it\") — a guard: it passes before and after", async () => {
    const r = await call('users', WHO.mgr, 'POST', { name: 'Mia Managed', email: E('c_mgr_ok'), role: 'User', team: 'West', teamId: TEAM_WEST });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const [row] = await byEmail(E('c_mgr_ok'));
    assert.deepEqual([row.orgId, row.profile.teamId], [A, TEAM_WEST]);
});

// ── 3-4. A new member: the invitation ────────────────────────────────────────

test("INVITE (Admin): a new member's team is asked before Clerk is called — org B's refused naming teamId, one that is no id with the words for it; neither reaches Clerk or leaves a row, and the batch's other row lands with its team", async () => {
    const sent = sentInvitations.length;
    const r = await call('users', WHO.admin, 'POST', { action: 'invite', invites: [
        { email: E('inv_b'), role: 'User', team: 'B Team', teamId: TEAM_B },
        { email: E('inv_num'), role: 'User', teamId: 7 },
        { email: E('inv_ok'), role: 'User', team: 'East', teamId: TEAM_EAST },
    ] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.errors, [
        { email: E('inv_b'), error: NOT_IN_ORG.team, field: 'teamId' },
        { email: E('inv_num'), error: NOT_AN_ID, field: 'teamId' },
    ]);
    assert.deepEqual(sentInvitations.slice(sent).map((i) => i.emailAddress), [E('inv_ok')], 'REGRESSION: a refused row reached Clerk — its person can join');
    assert.deepEqual(await byEmail(E('inv_b')), []);
    assert.deepEqual(await byEmail(E('inv_num')), []);
    const [ok] = await byEmail(E('inv_ok'));
    assert.deepEqual([ok.orgId, ok.profile.teamId, ok.profile.status], [A, TEAM_EAST, 'Invited']);
});

test("RE-INVITE (Admin): a re-invitation stores no team — it keeps the row's — so the team it names is not asked: 201, Clerk called, the row's team as it was", async () => {
    const sent = sentInvitations.length;
    const r = await call('users', WHO.admin, 'POST', { action: 'invite', invites: [{ email: E('ivy'), role: 'User', teamId: TEAM_B }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.errors, []);
    assert.deepEqual(sentInvitations.slice(sent).map((i) => i.emailAddress), [E('ivy')]);
    const ivy = await one(users, USR.ivy);
    assert.deepEqual([ivy.profile.teamId, ivy.profile.status], [TEAM_WEST, 'Invited']);
});

// ── 5-6. A member's save ─────────────────────────────────────────────────────

test("PUT (Admin): a save naming a team anew — org B's, or one naming nothing — is 404 naming teamId; the member's row as it was, the date they joined their team too", async () => {
    const was = await one(users, USR.karen);
    const joined = await textOf(users, users.teamJoinedAt, USR.karen);
    assert.equal(joined, '2026-09-01 00:00:00');
    const log = await logCount();
    for (const teamId of [TEAM_B, ID('team_nothing')]) {
        const r = await call('users', WHO.admin, 'PUT', { id: USR.karen, team: 'Elsewhere', teamId });
        assert.equal(r.status, 404, `${teamId}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_IN_ORG.team, field: 'teamId' });
    }
    assert.deepEqual(await one(users, USR.karen), was, 'nothing written');
    assert.equal(await textOf(users, users.teamJoinedAt, USR.karen), joined);
    assert.equal(await logCount(), log);
});

test('PUT (Admin): the team a row holds — removed since — re-sent with another change stands: 200, never asked again — a guard: it passes before and after', async () => {
    const r = await call('users', WHO.admin, 'PUT', { id: USR.ravi, teamId: TEAM_GONE, title: 'AE' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ravi = await one(users, USR.ravi);
    assert.deepEqual([ravi.profile.teamId, ravi.profile.title], [TEAM_GONE, 'AE']);
});

test("PUT (Admin): the pins a save sends are never written — the member's own stay — and { id, active, pinnedReports } is no Deactivate", async () => {
    const r = await call('users', WHO.admin, 'PUT', { id: USR.karen, pinnedReports: [REP_SHARED] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(users, USR.karen)).profile.pinnedReports, [REP_KAREN, REP_GONE], 'REGRESSION: an Admin\'s save wrote the member\'s pins');
    const off = await call('users', WHO.admin, 'PUT', { id: USR.karen, active: false, pinnedReports: [] });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const karen = await one(users, USR.karen);
    assert.deepEqual([karen.active, karen.profile.status], [true, 'Active'], 'not the Deactivate request: access as stored');
    assert.deepEqual(karen.profile.pinnedReports, [REP_KAREN, REP_GONE], 'REGRESSION: an Admin\'s save cleared the member\'s pins');
});

test("PUT (Manager): a rep's team of this org stands — 200, no 403 (\"No, leave it\") — a guard: it passes before and after", async () => {
    const r = await call('users', WHO.mgr, 'PUT', { id: USR.ravi, team: 'West', teamId: TEAM_WEST });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await one(users, USR.ravi)).profile.teamId, TEAM_WEST);
});

test("PUT (Manager): org B's team is 404 naming teamId — the org check binds a Manager — and the row as it was", async () => {
    const was = await one(users, USR.ravi);
    const r = await call('users', WHO.mgr, 'PUT', { id: USR.ravi, team: 'B Team', teamId: TEAM_B });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.team, field: 'teamId' });
    assert.deepEqual(await one(users, USR.ravi), was);
});

// ── 7. The Sales Manager tab's forecast call ─────────────────────────────────

test("FORECAST (Manager): the body the tab now sends — { id, forecastCalls } — 200: the call stored, the member's team, its date, pins and name as they were — a guard: it passes before and after (the tab's body itself is pinned in tests/member-links.test.mjs T6)", async () => {
    const was = await one(users, USR.karen);
    const joined = await textOf(users, users.teamJoinedAt, USR.karen);
    const r = await call('users', WHO.mgr, 'PUT', { id: USR.karen, forecastCalls: { '2026-Q4': { commit: 5000, bestCase: 7000 } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const now = await one(users, USR.karen);
    assert.deepEqual(now.profile.forecastCalls, { '2026-Q4': { commit: 5000, bestCase: 7000 } });
    assert.deepEqual([now.name, now.team, now.profile.teamId, now.profile.pinnedReports], [was.name, was.team, was.profile.teamId, was.profile.pinnedReports]);
    assert.equal(await textOf(users, users.teamJoinedAt, USR.karen), joined);
});

test("FORECAST (Manager): an old tab's whole row — the member as it loaded, naming a team removed since — is 404 naming teamId, and its call is not stored (reload the tab)", async () => {
    const g = await call('users', WHO.mgr, 'GET');
    assert.equal(g.status, 200, JSON.stringify(g.body));
    const loaded = g.body.users.find((m) => m.id === USR.karen);
    const was = await one(users, USR.karen);
    const r = await call('users', WHO.mgr, 'PUT', { ...loaded, teamId: ID('team_removed'), forecastCalls: { '2026-Q4': { commit: 9000, bestCase: 9500 } } });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.team, field: 'teamId' });
    assert.deepEqual(await one(users, USR.karen), was, 'the call not stored, the team as it was');
});

// ── 8. The member's own save — the Pin ───────────────────────────────────────

test("SELF (Karen): a Pin naming org B's saved report is 404 naming pinnedReports — the pins she holds unasked — and her pins as they were", async () => {
    const was = await one(users, USR.karen);
    const r = await call('users', WHO.karen, 'PUT', { id: USR.karen, pinnedReports: [REP_KAREN, REP_GONE, REP_B] }, ME);
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.report, field: 'pinnedReports' });
    assert.deepEqual(await one(users, USR.karen), was);
});

test("SELF (Karen): a Pin naming a colleague's private report stands — any saved report of the org; the one she holds, deleted since, never asked again — 200, stored — a guard: it passes before and after", async () => {
    const r = await call('users', WHO.karen, 'PUT', { id: USR.karen, pinnedReports: [REP_KAREN, REP_GONE, REP_RAVI] }, ME);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(users, USR.karen)).profile.pinnedReports, [REP_KAREN, REP_GONE, REP_RAVI]);
});

test('SELF (Karen): pins that are no list, or a pin that is no id, are 400 naming pinnedReports — not read as no pins — and her pins as they were', async () => {
    const was = await one(users, USR.karen);
    for (const pinnedReports of ['x', [7]]) {
        const r = await call('users', WHO.karen, 'PUT', { id: USR.karen, pinnedReports }, ME);
        assert.equal(r.status, 400, `${JSON.stringify(pinnedReports)}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_AN_ID, field: 'pinnedReports' });
    }
    assert.deepEqual(await one(users, USR.karen), was, 'REGRESSION: pins that are no list cleared every pin');
});

test('SELF (Karen): no pins at all — every pin unpinned — asks nothing: 200, [] stored — a guard: it passes before and after', async () => {
    const r = await call('users', WHO.karen, 'PUT', { id: USR.karen, pinnedReports: [] }, ME);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await one(users, USR.karen)).profile.pinnedReports, []);
});

test("SELF (Karen): a team in her own save is dropped by the allowlist, never asked — 200, her team as it was — a guard: it passes before and after", async () => {
    const was = await one(users, USR.karen);
    const r = await call('users', WHO.karen, 'PUT', { id: USR.karen, team: 'B Team', teamId: TEAM_B }, ME);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const karen = await one(users, USR.karen);
    assert.deepEqual([karen.team, karen.profile.teamId], [was.team, was.profile.teamId]);
    assert.notEqual(karen.profile.teamId, TEAM_B);
});

// ── 9. The backup restore ────────────────────────────────────────────────────

const R = (s) => ID('r_' + s);
const line = (productId, extra = {}) => ({ productId, productName: `Itest ${productId}`, productType: 'one_time', unit: 'flat', listPrice: 100, quantity: 1, discountPct: 0, ...extra });
const CUSTOM_LINE = { description: 'Custom line', unitPrice: 5, quantity: 1 };
const PLANS = { 2026: { annual: 1200, quarters: [300, 300, 300, 300], months: null } };
// A file as an Admin might restore it: its members, quote, products, a merged-away account and contact, a scored
// lead, and Dispatch's customer and job; org B's settings row and a row whose id org B holds — already here.
const FILE = { entities: {
    settings: [{ id: 'any', orgId: B, extra: { teams: [{ id: TEAM_B, name: 'B Team' }] } }],   // A has its row: already here
    users: [
        // B's team and pins, one of A's (Ravi's private report), one naming nothing, an empty one; a quota plan
        { id: R('m1'), email: E('m1'), name: 'Mona Restored', role: 'User', team: 'B Team', teamJoinedAt: '2026-09-01T00:00:00.000Z',
            profile: { teamId: TEAM_B, pinnedReports: [REP_RAVI, REP_B, REP_GONE, ''], quotaPlans: PLANS } },
        // A's team: nothing to clear — the date lands (the old name list dropped the row)
        { id: R('m2'), email: E('m2'), name: 'Milo Restored', role: 'User', team: 'East', teamJoinedAt: '2026-08-15T00:00:00.000Z', profile: { teamId: TEAM_EAST } },
        // A's team with a stray pin: the pins written, the date they joined kept (critique F2)
        { id: R('m3'), email: E('m3'), name: 'Rhea Restored', role: 'User', team: 'East', teamJoinedAt: '2026-07-01T00:00:00.000Z',
            profile: { teamId: TEAM_EAST, pinnedReports: [REP_B, REP_SHARED] } },
        // '' in a nullable date and in a NOT NULL one with a default: left to the column (review L1)
        { id: R('m4'), email: E('m4'), name: 'Nell Restored', role: 'User', teamJoinedAt: '', createdAt: '' },
        { id: USR.adminB, email: E('elsewhere'), name: 'Some Body', role: 'User' },   // org B holds the id: already here
    ],
    quotes: [{ id: R('q1'), opportunityId: DEAL_A, quoteNumber: 'Q-ITEST-MLINKS-1', status: 'Accepted',
        approvedAt: '2026-09-02T10:00:00.000Z', sentAt: '2026-09-03T10:00:00.000Z', acceptedAt: '2026-09-04T10:00:00.000Z',
        subtotal: '130.00', totalValue: '130.00', lineItems: [line(R('p_ok')), line(PROD_B), line(R('p_bad')), CUSTOM_LINE] }],
    products: [{ id: R('p_ok'), name: 'Restored product', listPrice: '10.00' }, { id: R('p_bad'), name: 'No price' }],   // list_price NOT NULL — 23502, class 23: refused
    accounts: [{ id: R('ac1'), name: 'Merged away', archivedAt: '2026-09-05T00:00:00.000Z' }],
    contacts: [{ id: R('c1'), firstName: 'Archived', archivedAt: '2026-09-06T00:00:00.000Z' }],
    leads: [{ id: R('l1'), firstName: 'Scored', score: 70, scoreUpdatedAt: '2026-09-07T00:00:00.000Z' }],
    dispatch: {
        customers: [{ id: R('cu1'), name: 'Restored customer' }],
        jobs: [{ id: R('j1'), customerId: R('cu1'), title: 'Paid job', invoicePaidAt: '2026-10-01' }],   // a text column holding a date
    },
} };
const SNAP = /^bk_snap_\d{4}_\d{2}_\d{2}_\d{4}_[0-9a-f]{12}$/;
const IMPORT_SNAP = /^bk_snap_\d{4}_\d{2}_\d{2}_\d{4}_[0-9a-f]{12}_import$/;
const snapOf = async (id) => (await db.select().from(backups).where(eq(backups.id, id))).map((s) => [s.orgId, s.type, s.status, s.recordCount]);
const restoreLog = async (snapId) => (await db.select().from(auditLog)
    .where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'backup.restored'), eq(auditLog.entityId, snapId)))).map((l) => l.detail);
let firstSnap;

test("RESTORE (Admin): every date column lands, a row the database refuses is said — and its table named in the audit row — the rows already here are said apart, and a quote line's product, a member's team and pins that name nothing here are cleared and counted; this function's own roster cache is dropped after it", async () => {
    assert.equal(await rosterUserById(R('m2'), A), null, "A's roster read, and cached, before the restore");
    const r = await call('backup', WHO.admin, 'PATCH', FILE);
    firstSnap = r.body.snapId;
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // members 4 (m1-m4), the quote, a product, the account, the contact, the lead, the customer and the job: only
    // the rows written
    assert.equal(r.body.imported, 11, JSON.stringify(r.body));
    assert.equal(r.body.unreached, 0, 'the answer counts the rows not reached: none — the refused product is refused, never not reached');
    assert.deepEqual(r.body.errors, [REFUSED_PRODUCT], 'the product with no price, said by its table — REGRESSION if not: a not-null refusal (23502, class 23) said as not reached, "restore the file again", for good');
    // already here: the settings row (A has one) and the row whose id org B holds; cleared: m1's team and two pins,
    // m3's pin, q1's org-B product and its refused product's
    assert.deepEqual(r.body.notes, [ALREADY_2, CLEARED_6]);
    assert.match(r.body.snapId, IMPORT_SNAP);
    assert.deepEqual(await snapOf(r.body.snapId), [[A, 'import', 'partial', 11]], 'the snapshot row, written and counted as the rows written');
    assert.deepEqual(await restoreLog(r.body.snapId), ['11 records imported · 6 links cleared · 2 already here · 1 error · refused: products 1']);

    const m1 = await one(users, R('m1'));
    assert.deepEqual([m1.orgId, m1.team, m1.profile.teamId, m1.profile.pinnedReports], [A, 'B Team', null, [REP_RAVI, '']],
        "B's team cleared — its name kept (B17) — and the pins naming nothing here dropped, the rest in order");
    assert.deepEqual(m1.profile.quotaPlans, PLANS, 'the quota plans as filed: the clean-up merges, never replaces');
    assert.equal(await textOf(users, users.teamJoinedAt, R('m1')), null, 'a team cleared clears the date they joined it');
    const m2 = await one(users, R('m2'));
    assert.equal(m2.profile.teamId, TEAM_EAST);
    assert.equal(await textOf(users, users.teamJoinedAt, R('m2')), '2026-08-15 00:00:00', 'the date lands');
    const m3 = await one(users, R('m3'));
    assert.deepEqual([m3.team, m3.profile.teamId, m3.profile.pinnedReports], ['East', TEAM_EAST, [REP_SHARED]]);
    assert.equal(await textOf(users, users.teamJoinedAt, R('m3')), '2026-07-01 00:00:00', 'a team that stands keeps the date they joined it');
    assert.ok(await one(users, R('m4')), "'' in a date column is left to the column: the row lands");
    assert.equal(await textOf(users, users.teamJoinedAt, R('m4')), null, "'' in a nullable date: none");
    assert.notEqual(await textOf(users, users.createdAt, R('m4')), null, "'' in a NOT NULL date with a default: the default");

    const q1 = await one(quotes, R('q1'));
    assert.deepEqual(q1.lineItems, [line(R('p_ok')), { ...line(PROD_B), productId: null }, { ...line(R('p_bad')), productId: null }, CUSTOM_LINE],
        "a line whose product names nothing here keeps its line, its product cleared; the file's own product stands");
    assert.deepEqual([q1.status, q1.subtotal, q1.totalValue], ['Accepted', '130.00', '130.00'], 'the totals as filed');
    for (const [col, at] of [[quotes.approvedAt, '2026-09-02 10:00:00'], [quotes.sentAt, '2026-09-03 10:00:00'], [quotes.acceptedAt, '2026-09-04 10:00:00']]) {
        assert.equal(await textOf(quotes, col, R('q1')), at);
    }
    assert.equal(await textOf(accounts, accounts.archivedAt, R('ac1')), '2026-09-05 00:00:00');
    assert.equal(await textOf(contacts, contacts.archivedAt, R('c1')), '2026-09-06 00:00:00');
    assert.equal(await textOf(leads, leads.scoreUpdatedAt, R('l1')), '2026-09-07 00:00:00');
    assert.equal((await one(dispatchJobs, R('j1'))).invoicePaidAt, '2026-10-01', 'a text column holding a date stays text');
    assert.equal(await one(products, R('p_bad')), undefined);
    const b = await bRows();
    assert.deepEqual([b.settings, b.users], [bSeeded.settings, bSeeded.users], "org B's settings and its member whose id the file names: untouched");

    // Last: this function's own roster cache — read, and cached, before the restore — is dropped once its members land
    // (state §0.205 — _lib.mjs: after any write of users in a request). Another warm function's 30-second roster —
    // another endpoint resolving an owner by name — still misses them until it expires, as after every write of users.
    assert.deepEqual(await rosterUserById(R('m2'), A), { id: R('m2'), name: 'Milo Restored', email: E('m2') },
        "REGRESSION: the restore leaves this function's own roster cache stale after members land — the roster read before it misses them for 30 seconds");
});

test('RESTORE again — the same file: 200, not 500 — every row already here: "0 records restored", the refused row said again, 13 already here, nothing cleared; a snapshot of its own', async () => {
    const r = await call('backup', WHO.admin, 'PATCH', FILE);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.imported, 0, 'REGRESSION: the rows sent counted as restored');
    assert.deepEqual(r.body.errors, [REFUSED_PRODUCT]);
    // settings 1, members 5 (m1-m4 and the row whose id org B holds), the quote, p_ok, the account, the contact, the
    // lead, the customer and the job; no rename note — a member's own row passes as it is
    assert.deepEqual(r.body.notes, [ALREADY_13]);
    assert.match(r.body.snapId, IMPORT_SNAP);
    assert.notEqual(r.body.snapId, firstSnap, 'two imports, two snapshot ids — in the same minute too');
    assert.deepEqual(await snapOf(r.body.snapId), [[A, 'import', 'partial', 0]]);
    assert.deepEqual(await restoreLog(r.body.snapId), ['0 records imported · 13 already here · 1 error · refused: products 1']);
});

test('RESTORE — a file whose only row is refused: 500, its error said, nothing written; its snapshot partial, 0 records; the audit row names the table', async () => {
    const r = await call('backup', WHO.admin, 'PATCH', { entities: { products: [{ id: R('p_bad2'), name: 'No price either' }] } });
    assert.equal(r.status, 500, JSON.stringify(r.body));
    assert.deepEqual([r.body.ok, r.body.imported, r.body.unreached, r.body.errors, r.body.notes], [false, 0, 0, [REFUSED_PRODUCT], []],
        'refused, never not reached: the answer counts no row not reached — the window does not take it as one that may have written records');
    assert.equal(await one(products, R('p_bad2')), undefined);
    assert.match(r.body.snapId, IMPORT_SNAP);
    assert.deepEqual(await snapOf(r.body.snapId), [[A, 'import', 'partial', 0]]);
    assert.deepEqual(await restoreLog(r.body.snapId), ['0 records imported · 1 error · refused: products 1'], "the window's answer is never stored: the audit row names the table and its count");
});

test("RESTORE — a member whose profile the file gives as JSON text: stored as a jsonb string, which the clean-up does not write — so nothing is counted cleared (the review: it said \"2 links … were cleared\", and nothing was); the row lands, its team and pin as the file had them", async () => {
    const r = await call('backup', WHO.admin, 'PATCH', { entities: { users: [
        { id: R('m_text'), email: E('m_text'), name: 'Tex Restored', role: 'User', profile: JSON.stringify({ teamId: TEAM_B, pinnedReports: [REP_B] }) },
    ] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.imported, r.body.errors, r.body.notes], [1, [], []], 'REGRESSION: links counted as cleared that the write never reached');
    const [stored] = await db.select({ kind: sql`jsonb_typeof(${users.profile})` }).from(users).where(eq(users.id, R('m_text')));
    assert.equal(stored?.kind, 'string', 'stored as the file gave it: a jsonb string');
    assert.deepEqual((await one(users, R('m_text'))).profile, { teamId: TEAM_B, pinnedReports: [REP_B] },
        "read back parsed — an object naming org B's team and report, left as the file had them (a text profile is never cleaned: filed)");
    assert.deepEqual(await snapOf(r.body.snapId), [[A, 'import', 'ready', 1]]);
    assert.deepEqual(await restoreLog(r.body.snapId), ['1 records imported']);
});

test("BACKUP (Admin) twice, back to back: two snapshots, two ids — the minute and a random suffix, never the minute alone, a key every org shares (Jeff, 16 Oct: \"Fix now\")", async () => {
    const s1 = await call('backup', WHO.admin, 'POST', {});
    const s2 = await call('backup', WHO.admin, 'POST', {});
    assert.equal(s1.status, 200, JSON.stringify(s1.body));
    assert.equal(s2.status, 200, JSON.stringify(s2.body));
    assert.match(s1.body.id, SNAP);
    assert.match(s2.body.id, SNAP);
    assert.notEqual(s1.body.id, s2.body.id);
    assert.deepEqual([...await snapOf(s1.body.id), ...await snapOf(s2.body.id)], [[A, 'manual', 'ready', s1.body.recordCount], [A, 'manual', 'ready', s2.body.recordCount]]);
});

// ── 10. Org B ────────────────────────────────────────────────────────────────

test("org B's Admin reads none of org A's members — seeded, created, invited or restored — nor any of A's saved reports", async () => {
    const aMembers = ids(await db.select({ id: users.id }).from(users).where(eq(users.orgId, A)));
    const created = (await byEmail(E('c_ok')))[0];
    assert.ok(aMembers.includes(USR.karen) && created?.orgId === A && aMembers.includes(created.id), 'A holds its members, one it created among them');
    const u = await call('users', WHO.adminB, 'GET');
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.deepEqual(ids(u.body.users), [USR.adminB], "B's own, and only B's");
    const s = await call('saved-reports', WHO.adminB, 'GET');
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.deepEqual(ids(s.body.reports), [REP_B], "B's own, and only B's");
});

test("org B's rows are as seeded — every refusal, save, restore and backup in org A left them alone; nothing in B's log", async () => {
    assert.deepEqual(await bRows(), bSeeded);
    assert.equal((await db.select().from(auditLog).where(eq(auditLog.orgId, B))).length, 0);
});
