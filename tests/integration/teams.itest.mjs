// tests/integration/teams.itest.mjs
//
// A team is one record (state §0.222 — batch 4b-3 of OPEN_ITEMS §1 item 1, step C; Jeff, 2 Nov: "Start please", every
// answer the Recommended — docs/design/links-batch-4b3/STEP-C.md, ANSWERS.md). Against the test database, with the
// REAL verifyAuth (only the Clerk SDK is a stand-in: verifyToken reads the claims a test token carries, so each
// caller's role is their row's in this org's roster) and the real users, settings and users-sync handlers:
//   PAIR      a member's team is stored with the name the org's list gives its id — on the PUT (an Admin's, a
//             Manager's), the create and the invite; a name sent alone that differs unlinks the id and its join date;
//             a blank id keeps a name sent with it; a held id whose team was deleted keeps the name; a save naming no
//             team pairs nothing; org B's team 404, nothing written
//   RENAME    a teams save that renames a team renames, by its id, every holder in THIS org — an inactive and an
//             invited member too — never org B's holder of the same id string, never the holders of another team of
//             the same name, never their join date; a refused save renames no one; the audit says how many
//   DUPLICATE no new team of a name another has (by repeats, case and spaces aside): 400 naming teams; a stored pair
//             re-saved, a rename to a free name and a swap stand; a name longer than 255 refused
//   REMOVE    the member DELETE, an invitation's revoke and the Admin clear take the member's ids — app and Clerk —
//             off every team's and territory's manager, owner and reps, in the same request, answering the lists;
//             every refusal (a Manager's, one's own, an invitation's, Clerk's) leaves them byte for byte; another
//             org's id removes nothing; deactivation leaves them; a member no list names writes no list; an org with
//             no settings row is the removal alone; a save landing between the removal's read and write survives
//   SYNC      the Clerk sync writes no team (J2): a new row from Clerk, and a blank team, take none
// Org B is read whole once seeded and compared after every test: nothing here reaches it.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_teams_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it
import { test, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_teams_*' — its three orgs, every row id it seeds or names ('itest_teams_…';
// a member's 'usr_itest_teams_…'), its members' Clerk ids ('clerk_itest_teams_…') and emails ('…@itest-teams.local')
// — and ONLY this file writes to it (guide §18b25). Ids the handlers mint (a new member's, an audit row's) are cleaned
// by org.
const A = 'itest_teams_A', B = 'itest_teams_B', C = 'itest_teams_C';
const ORGS = [A, B, C];
const ID = (s) => 'itest_teams_' + s;
const E = (s) => `${s}@itest-teams.local`;

// ── The Clerk stand-in: members and invitations by org; a switch to refuse a revoke or the clear's list ────────────
const people = new Map();
const membersOf = new Map();
const invitations = [];
let failRevoke = false, failList = false, serialInv = 0;
const clerkClient = {
    users: {
        getUser: async (id) => {
            const u = people.get(id);
            if (!u) { const e = new Error('Not Found'); e.status = 404; throw e; }
            return u;
        },
    },
    organizations: {
        getOrganizationMembershipList: async ({ organizationId, offset = 0 }) => ({
            data: offset ? [] : (membersOf.get(organizationId) || []).map((uid) => ({ id: 'mem_' + uid, role: 'org:member', publicUserData: { userId: uid } })),
        }),
        getOrganizationInvitationList: async ({ organizationId, status }) => {
            if (failList) throw new Error('Clerk is unavailable');
            return { data: invitations.filter((i) => i.organizationId === organizationId && (!status || status.includes(i.status))) };
        },
        revokeOrganizationInvitation: async ({ organizationId, invitationId }) => {
            if (failRevoke) throw new Error('Clerk is unavailable');
            const inv = invitations.find((i) => i.id === invitationId && i.organizationId === organizationId);
            if (!inv) { const e = new Error('Not Found'); e.status = 404; throw e; }
            inv.status = 'revoked';
            return inv;
        },
        createOrganizationInvitation: async (args) => {
            serialInv += 1;
            const inv = { id: ID('orginv_' + serialInv), organizationId: args.organizationId, emailAddress: args.emailAddress, status: 'pending',
                createdAt: Date.now(), expiresAt: Date.now() + 7 * 86400000 };
            invitations.push(inv);
            return inv;
        },
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
const anyTemplate = new Proxy({}, { get: () => () => ({ subject: '', html: '', text: '' }) });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: anyTemplate },
});

const FN = {};
for (const name of ['users', 'settings', 'users-sync']) FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
const { db } = await import('../../db/index.js');
const { settings, users, auditLog } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { removeWithLists } = await import('../../netlify/functions/_links.mjs');
const { REMOVAL_LISTS_LEFT } = await import('../../src/utils/teamMembership.js');
const { eq, and, inArray, sql } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const WHO = {
    admin:  { clerk: 'clerk_itest_teams_admin',   org: A },
    mgr:    { clerk: 'clerk_itest_teams_mgr',     org: A },
    adminB: { clerk: 'clerk_itest_teams_admin_b', org: B },
    adminC: { clerk: 'clerk_itest_teams_admin_c', org: C },
};
const USR = {
    admin: 'usr_itest_teams_admin', mgr: 'usr_itest_teams_mgr',
    x: 'usr_itest_teams_x', y: 'usr_itest_teams_y', z: 'usr_itest_teams_z', inv: 'usr_itest_teams_inv',
    w: 'usr_itest_teams_w', n: 'usr_itest_teams_n', v: 'usr_itest_teams_v', g: 'usr_itest_teams_g',
    adminB: 'usr_itest_teams_admin_b', bx: 'usr_itest_teams_bx',
    adminC: 'usr_itest_teams_admin_c', cx: 'usr_itest_teams_cx',
};
const CLERK_X = 'clerk_itest_teams_x', CLERK_CX = 'clerk_itest_teams_cx';
const T_EAST = ID('team_east'), T_EAST2 = ID('team_east2'), T_WEST = ID('team_west'), T_B = ID('team_b'), T_GONE = ID('team_gone');
const STRAY = 'usr_itest_teams_stray';
const JOINED = new Date('2026-01-15T00:00:00.000Z');

// Org A: East lists X, Y, Z (deactivated), the invited member and a stray; a second team named East (stored before
// §0.222 — Accelerep QA's pair); West lists X by his CLERK id as its manager and a rep (UKG's shape). The territories
// name X as North's owner and rep, and by Clerk id on South.
const A_EXTRA = {
    teams: [
        { id: T_EAST, name: 'East', managerId: USR.mgr, repIds: [USR.x, USR.y, USR.z, USR.inv, STRAY], color: '#2a2622' },
        { id: T_EAST2, name: 'East', managerId: '', repIds: [USR.v] },
        { id: T_WEST, name: 'West', managerId: CLERK_X, repIds: [USR.w, CLERK_X] },
    ],
    territories: [
        { id: ID('terr_north'), name: 'North', ownerId: USR.x, owner: 'Xan Teams', ownerInit: 'XA', status: 'Active', repIds: [USR.x, USR.w], reps: 2 },
        { id: ID('terr_south'), name: 'South', ownerId: '', owner: 'Unassigned', status: 'Unassigned', repIds: [CLERK_X] },
    ],
};
// Org B holds A's team id string and A's member ids on its lists: nothing done in A may touch them.
const B_EXTRA = {
    teams: [{ id: T_EAST, name: 'East', managerId: USR.adminB, repIds: [USR.bx, USR.x] }, { id: T_B, name: 'B Team', managerId: '', repIds: [] }],
    territories: [{ id: ID('terr_b'), name: 'B North', ownerId: USR.x, repIds: [USR.x] }],
};
const C_EXTRA = {
    teams: [{ id: ID('team_c'), name: 'C Team', managerId: USR.adminC, repIds: [USR.cx, CLERK_CX, ID('c_stray')] }],
    territories: [{ id: ID('terr_c'), name: 'C North', ownerId: CLERK_CX, owner: 'Cal', ownerInit: 'CA', status: 'Active', repIds: [USR.cx] }],
};

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
const putUser = (body, who = WHO.admin) => call('users', who, 'PUT', body);
const putTeams = (teams, who = WHO.admin) => call('settings', who, 'PUT', { teams });
const extraText = async (org) => (await db.select({ t: sql`${settings.extra}::text` }).from(settings).where(eq(settings.orgId, org)))[0]?.t ?? null;
const extraOf = async (org) => (await db.select({ extra: settings.extra }).from(settings).where(eq(settings.orgId, org)))[0]?.extra ?? null;
const rowOf = async (id) => (await db.select().from(users).where(eq(users.id, id)))[0];
const teamOf = async (id) => { const r = await rowOf(id); return { team: r?.team ?? null, teamId: r?.profile?.teamId ?? null, joined: r?.teamJoinedAt ?? null }; };
const usersText = async (org) => (await db.select({ id: users.id, t: sql`row_to_json(${users})::text` }).from(users).where(eq(users.orgId, org))).sort((a, b) => a.id.localeCompare(b.id));

const cleanup = async () => {
    for (const t of [settings, users, auditLog]) await db.delete(t).where(inArray(t.orgId, ORGS));
};
const bRows = async () => ({ extra: await extraText(B), users: await usersText(B) });
let bSeeded;

const u = (id, org, clerkUserId, local, name, role, extra = {}) => ({ id, orgId: org, clerkUserId, name, email: E(local), role, ...extra });
const seed = async () => {
    await cleanup();
    await db.insert(settings).values([
        { id: A, orgId: A, extra: A_EXTRA },
        { id: B, orgId: B, extra: B_EXTRA },
        { id: C, orgId: C, extra: C_EXTRA },
    ]);
    const on = (teamId, team) => ({ team, teamJoinedAt: JOINED, profile: { status: 'Active', teamId } });
    await db.insert(users).values([
        u(USR.admin, A, WHO.admin.clerk, 'admin', 'Ada Teams', 'Admin', { profile: { status: 'Active' } }),
        u(USR.mgr, A, WHO.mgr.clerk, 'mgr', 'Max Teams', 'Manager', on(T_EAST, 'East')),
        u(USR.x, A, CLERK_X, 'x', 'Xan Teams', 'User', on(T_EAST, 'East')),
        u(USR.y, A, 'clerk_itest_teams_y', 'y', 'Yas Teams', 'User', on(T_EAST, 'East')),
        u(USR.z, A, 'clerk_itest_teams_z', 'z', 'Zed Teams', 'User', { ...on(T_EAST, 'East'), active: false, profile: { status: 'Deactivated', teamId: T_EAST } }),
        u(USR.inv, A, null, 'inv', 'Ivy Teams', 'User', { team: 'East', active: false, profile: { status: 'Invited', teamId: T_EAST } }),
        u(USR.w, A, 'clerk_itest_teams_w', 'w', 'Wes Teams', 'User', on(T_WEST, 'West')),
        u(USR.n, A, 'clerk_itest_teams_n', 'n', 'Nia Teams', 'User', { profile: { status: 'Active' } }),
        u(USR.v, A, 'clerk_itest_teams_v', 'v', 'Vic Teams', 'User', on(T_EAST2, 'East')),
        u(USR.g, A, 'clerk_itest_teams_g', 'g', 'Gil Teams', 'User', on(T_GONE, 'Gone')),
        u(USR.adminB, B, WHO.adminB.clerk, 'admin_b', 'Bea Teams', 'Admin', { profile: { status: 'Active' } }),
        u(USR.bx, B, 'clerk_itest_teams_bx', 'bx', 'Bix Teams', 'User', on(T_EAST, 'East')),
        u(USR.adminC, C, WHO.adminC.clerk, 'admin_c', 'Cy Teams', 'Admin', { profile: { status: 'Active' } }),
        u(USR.cx, C, CLERK_CX, 'cx', 'Cal Teams', 'User', { profile: { status: 'Active' } }),
    ]);
    invalidateRoster();
    people.clear(); membersOf.clear(); invitations.length = 0; failRevoke = false; failList = false;
    bSeeded = await bRows();
};

beforeEach(async () => { await seed(); });
after(cleanup);
const bUntouched = async () => assert.deepEqual(await bRows(), bSeeded, 'org B as seeded');

let schemaChecked = false;
beforeEach(async () => { if (!schemaChecked) { await assertTestSchema(db); schemaChecked = true; } });

// ── PAIR ──────────────────────────────────────────────────────────────────────

test('PAIR (the PUT): a team id stores the list\'s name; a name alone unlinks the id and its join date; a blank id keeps a name sent with it; a save naming no team pairs nothing', async () => {
    let r = await putUser({ id: USR.n, teamId: T_WEST });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let t = await teamOf(USR.n);
    assert.deepEqual([t.team, t.teamId], ['West', T_WEST], 'REGRESSION: an id sent alone stores no name');
    assert.ok(t.joined, 'joined stamped');

    r = await putUser({ id: USR.y, teamId: T_WEST, team: 'East (old tab)' });
    assert.equal(r.status, 200);
    assert.deepEqual((await teamOf(USR.y)).team, 'West', 'the list\'s name, not the one sent');
    assert.equal(r.body.user.team, 'West', 'the answer is the row as stored');

    r = await putUser({ id: USR.x, team: 'Freeform' });
    assert.equal(r.status, 200);
    t = await teamOf(USR.x);
    assert.deepEqual([t.team, t.teamId, t.joined], ['Freeform', null, null], 'REGRESSION: a name alone leaves the old id and its join date — on two teams at once');

    r = await putUser({ id: USR.w, teamId: null, team: 'West' });
    assert.equal(r.status, 200);
    t = await teamOf(USR.w);
    assert.deepEqual([t.team, t.teamId], ['West', null], 'REGRESSION: a name sent with a blank id is dropped (N5)');

    r = await putUser({ id: USR.v, teamId: '', team: '' });
    assert.equal(r.status, 200);
    t = await teamOf(USR.v);
    assert.deepEqual([t.team, t.teamId, t.joined], [null, null, null], 'the Teams page\'s leave clears both');

    // A held id whose team was deleted since: never asked again; the name sent, else the one stored.
    r = await putUser({ id: USR.g, teamId: T_GONE });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await teamOf(USR.g)).team, 'Gone');
    r = await putUser({ id: USR.g, teamId: T_GONE, team: 'Gone, renamed' });
    assert.equal(r.status, 200);
    t = await teamOf(USR.g);
    assert.deepEqual([t.team, t.teamId], ['Gone, renamed', T_GONE]);

    // A save naming no team: nothing paired, nothing thrown (the lookup is never a bare Map method).
    const before = await teamOf(USR.mgr);
    r = await putUser({ id: USR.mgr, phone: '555-0100' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await teamOf(USR.mgr), before);

    // A Manager's save of a rep: the same pairing.
    r = await putUser({ id: USR.n, teamId: T_EAST, team: 'Wrong' }, WHO.mgr);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await teamOf(USR.n)).team, 'East');
    await bUntouched();
});

test('PAIR (the PUT): org B\'s team, or an id naming nothing, is 404 naming teamId — the row byte for byte', async () => {
    const before = (await usersText(A)).find((x) => x.id === USR.n).t;
    for (const teamId of [T_B, ID('team_nothing')]) {
        const r = await putUser({ id: USR.n, teamId, team: 'B Team' });
        assert.equal(r.status, 404, teamId);
        assert.deepEqual(r.body, { error: 'That team is not in your organization — pick one from the list.', field: 'teamId' });
    }
    assert.equal((await usersText(A)).find((x) => x.id === USR.n).t, before);
    await bUntouched();
});

test('PAIR (the create and the invite): a team id stores the list\'s name; a name with no id is kept as sent', async () => {
    let r = await call('users', WHO.admin, 'POST', { firstName: 'Cora', lastName: 'Teams', email: E('cora'), userType: 'User', teamId: T_WEST, team: 'Stale' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    let t = await teamOf(r.body.user.id);
    assert.deepEqual([t.team, t.teamId], ['West', T_WEST], 'REGRESSION: a create stores the name sent with an id');
    r = await call('users', WHO.admin, 'POST', { firstName: 'Lou', lastName: 'Teams', email: E('lou'), userType: 'User', teamId: '', team: 'Loose' });
    assert.equal(r.status, 201);
    t = await teamOf(r.body.user.id);
    assert.deepEqual([t.team, t.teamId], ['Loose', null], 'a name with no id kept (N5)');

    r = await call('users', WHO.admin, 'POST', { action: 'invite', invites: [
        { email: E('ida'), role: 'User', team: 'Stale', teamId: T_WEST },
        { email: E('ole'), role: 'User', team: 'Loose', teamId: null },
    ] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const ida = (await db.select().from(users).where(and(eq(users.orgId, A), eq(users.email, E('ida')))))[0];
    const ole = (await db.select().from(users).where(and(eq(users.orgId, A), eq(users.email, E('ole')))))[0];
    assert.deepEqual([ida.team, ida.profile.teamId], ['West', T_WEST], 'an invitation\'s team by the list\'s name');
    assert.deepEqual([ole.team, ole.profile.teamId], ['Loose', null]);
    await bUntouched();
});

// ── RENAME ────────────────────────────────────────────────────────────────────

test('RENAME: every holder of the renamed team in this org — an inactive and an invited member too — never org B\'s holder of the same id, never the other East, never a join date; the audit counts them', async () => {
    // The join dates as Postgres prints them (a timestamp without time zone reads back in the machine's zone).
    const joinedText = async () => (await db.select({ id: users.id, t: sql`${users.teamJoinedAt}::text` }).from(users).where(eq(users.orgId, A))).sort((a, b) => a.id.localeCompare(b.id));
    const joinedBefore = await joinedText();
    // Y already carries the new name (drift stored before): not renamed again, not counted, its row untouched.
    await db.update(users).set({ team: 'Atlantic' }).where(eq(users.id, USR.y));
    const yBefore = (await usersText(A)).find((x) => x.id === USR.y).t;
    const renamed = A_EXTRA.teams.map((t) => (t.id === T_EAST ? { ...t, name: 'Atlantic' } : t));
    const r = await putTeams(renamed);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    for (const id of [USR.mgr, USR.x, USR.y, USR.z, USR.inv]) {
        const t = await teamOf(id);
        assert.equal(t.team, 'Atlantic', `REGRESSION: ${id} keeps the old name`);
        assert.equal(t.teamId, T_EAST);
    }
    assert.deepEqual(await joinedText(), joinedBefore, 'REGRESSION: a rename moves its holders\' join dates');
    assert.equal((await teamOf(USR.v)).team, 'East', 'REGRESSION: the holders of another team of the same name are renamed');
    assert.equal((await teamOf(USR.w)).team, 'West');
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'settings.updated')));
    assert.ok(audit.some((a) => String(a.detail || '').includes('; 4 member(s) renamed with their team')), JSON.stringify(audit.map((a) => a.detail)));
    assert.equal((await usersText(A)).find((x) => x.id === USR.y).t, yBefore, 'REGRESSION: a member already so named is written and counted');
    await bUntouched();
});

test('RENAME: a save refused — a taken name, a member of org B — renames no one and writes nothing', async () => {
    const before = await usersText(A), extra = await extraText(A);
    let r = await putTeams(A_EXTRA.teams.map((t) => (t.id === T_EAST ? { ...t, name: 'west' } : t)));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    r = await putTeams(A_EXTRA.teams.map((t) => (t.id === T_EAST ? { ...t, name: 'Atlantic', repIds: [...t.repIds, USR.bx] } : t)));
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(await usersText(A), before, 'no one renamed');
    assert.equal(await extraText(A), extra);
    await bUntouched();
});

// ── DUPLICATE ─────────────────────────────────────────────────────────────────

test('DUPLICATE: a third East is 400 naming teams in the words; the stored pair, a rename to a free name and a swap stand; a name over 255 refused', async () => {
    const extra = await extraText(A);
    let r = await putTeams([...A_EXTRA.teams, { id: ID('team_east3'), name: '  EAST ', managerId: '', repIds: [] }]);
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'A team named "East" already exists — choose a different name.', field: 'teams' }, 'REGRESSION: a third East is made');
    r = await putTeams([...A_EXTRA.teams, { id: ID('team_long'), name: 'L'.repeat(256), managerId: '', repIds: [] }]);
    assert.deepEqual(r.body, { error: 'A team name can be at most 255 characters.', field: 'teams' });
    assert.equal(await extraText(A), extra, 'nothing written');
    r = await putTeams(A_EXTRA.teams);
    assert.equal(r.status, 200, 'the pair stored before this rule stands');
    r = await putTeams(A_EXTRA.teams.map((t) => (t.id === T_EAST2 ? { ...t, name: 'East Two' } : t)));
    assert.equal(r.status, 200, 'renamed apart');
    r = await putTeams((await extraOf(A)).teams.map((t) => (t.id === T_WEST ? { ...t, name: 'East Two' } : t.id === T_EAST2 ? { ...t, name: 'West' } : t)));
    assert.equal(r.status, 200, 'a swap');
    assert.equal((await teamOf(USR.v)).team, 'West', 'and its holders follow the name');
    await bUntouched();
});

// ── REMOVE ────────────────────────────────────────────────────────────────────

test('REMOVE (the DELETE): the member\'s app and Clerk ids off every team and territory, the stray kept, the territory unassigned; answered; org B\'s lists naming him untouched', async () => {
    const r = await call('users', WHO.admin, 'DELETE', undefined, { id: USR.x });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await rowOf(USR.x), undefined, 'removed');
    const extra = await extraOf(A);
    assert.deepEqual(extra.teams.map((t) => [t.id, t.managerId, t.repIds]), [
        [T_EAST, USR.mgr, [USR.y, USR.z, USR.inv, STRAY]],
        [T_EAST2, '', [USR.v]],
        [T_WEST, '', [USR.w]],
    ], 'REGRESSION: a removed member stays on a team — by app id or by the Clerk id a list held');
    assert.deepEqual(extra.territories, [
        { id: ID('terr_north'), name: 'North', ownerId: '', owner: 'Unassigned', ownerInit: null, status: 'Unassigned', repIds: [USR.w], reps: 2 },
        { id: ID('terr_south'), name: 'South', ownerId: '', owner: 'Unassigned', status: 'Unassigned', repIds: [] },
    ]);
    assert.deepEqual(r.body, { success: true, lists: { teams: extra.teams, territories: extra.territories }, listsLeft: false }, 'the lists as written');
    await bUntouched();
});

test('REMOVE (the DELETE): a Manager\'s, one\'s own, an invitation\'s and another org\'s — the lists byte for byte; a member no list names writes no list', async () => {
    const extra = await extraText(A);
    assert.equal((await call('users', WHO.mgr, 'DELETE', undefined, { id: USR.y })).status, 403);
    assert.equal((await call('users', WHO.admin, 'DELETE', undefined, { id: USR.admin })).status, 400);
    assert.equal((await call('users', WHO.admin, 'DELETE', undefined, { id: USR.inv })).status, 409);
    let r = await call('users', WHO.admin, 'DELETE', undefined, { id: USR.bx });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.lists, {}, 'another org\'s id removes no one and writes no list');
    assert.ok(await rowOf(USR.bx), 'org B\'s member stands');
    assert.equal(await extraText(A), extra);
    r = await call('users', WHO.admin, 'DELETE', undefined, { id: USR.n });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, lists: {}, listsLeft: false });
    assert.equal(await extraText(A), extra, 'a member no list names: the lists as they were');
    await bUntouched();
});

test('REMOVE (deactivation): {id, active:false} is no removal — the lists byte for byte (N6)', async () => {
    const extra = await extraText(A);
    const r = await putUser({ id: USR.y, active: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await extraText(A), extra);
    await bUntouched();
});

test('REMOVE (the revoke): the invitation\'s row and its id off the lists, answered; Clerk refusing leaves the row and the lists', async () => {
    invitations.push({ id: ID('orginv_ivy'), organizationId: A, emailAddress: E('inv'), status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
    const extra = await extraText(A);
    failRevoke = true;
    let r = await call('users', WHO.admin, 'POST', { action: 'revoke-invite', email: E('inv') });
    assert.equal(r.status, 502);
    assert.ok(await rowOf(USR.inv));
    assert.equal(await extraText(A), extra, 'a refused revoke writes no list');
    failRevoke = false;
    r = await call('users', WHO.admin, 'POST', { action: 'revoke-invite', email: E('inv') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.removedRowId, USR.inv);
    assert.equal(await rowOf(USR.inv), undefined);
    const east = (await extraOf(A)).teams.find((t) => t.id === T_EAST);
    assert.deepEqual(east.repIds, [USR.x, USR.y, USR.z, STRAY]);
    assert.deepEqual(r.body.lists.teams, (await extraOf(A)).teams, 'answered as written');
    await bUntouched();
});

test('REMOVE (the clear, org C): every member\'s ids off its lists, the stray kept; Clerk refusing the list leaves them; orgs A and B untouched', async () => {
    const a = await extraText(A), aUsers = await usersText(A), c = await extraText(C);
    failList = true;
    let r = await call('users', WHO.adminC, 'DELETE', undefined, { clear: 'true' });
    assert.equal(r.status, 502);
    assert.equal(await extraText(C), c);
    failList = false;
    r = await call('users', WHO.adminC, 'DELETE', undefined, { clear: 'true' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.count, 2, 'the delete\'s own count');
    const extra = await extraOf(C);
    assert.deepEqual(extra.teams[0].managerId, '');
    assert.deepEqual(extra.teams[0].repIds, [ID('c_stray')], 'both id shapes off, the stray kept (N7)');
    assert.deepEqual([extra.territories[0].ownerId, extra.territories[0].status, extra.territories[0].repIds], ['', 'Unassigned', []]);
    assert.equal(await extraText(A), a);
    assert.deepEqual(await usersText(A), aUsers);
    await bUntouched();
});

test('REMOVE: an org with no settings row — the removal alone', async () => {
    await db.delete(settings).where(eq(settings.orgId, C));
    const r = await call('users', WHO.adminC, 'DELETE', undefined, { id: USR.cx });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { success: true, lists: {}, listsLeft: false });
    assert.equal(await rowOf(USR.cx), undefined);
    assert.equal(await extraText(C), null, 'no row made');
    await bUntouched();
});

test('REMOVE (the seam): a teams save landing between the removal\'s read and write survives, and the write lands on a fresh read; one that lands every time leaves the lists, said', async () => {
    const landNorth = async () => {
        const now = await extraOf(A);
        await db.update(settings).set({ extra: { ...now, teams: [...now.teams, { id: ID('team_north_' + Math.random().toString(36).slice(2, 6)), name: 'North ' + now.teams.length, managerId: '', repIds: [USR.y] }] } })
            .where(eq(settings.orgId, A));
    };
    let calls = 0;
    const done = await removeWithLists(A, [USR.x, CLERK_X], db.delete(users).where(and(eq(users.id, USR.x), eq(users.orgId, A))).returning({ id: users.id }),
        { beforeWrite: async (tries) => { calls++; if (tries === 0) await landNorth(); } });
    assert.equal(calls, 2, 'one more read and try');
    assert.deepEqual(done.removed, [{ id: USR.x }]);
    const extra = await extraOf(A);
    assert.equal(extra.teams.length, 4, 'REGRESSION: the save that landed between is put back');
    assert.ok(!JSON.stringify(extra.teams).includes(USR.x) && !JSON.stringify(extra.teams).includes(CLERK_X), 'and X is off every list');
    assert.equal(await rowOf(USR.x), undefined);

    const left = await removeWithLists(A, [USR.y], db.delete(users).where(and(eq(users.id, USR.y), eq(users.orgId, A))),
        { beforeWrite: landNorth });
    assert.equal(left.lists, null);
    assert.equal(left.listsLeft, true);
    assert.equal(await rowOf(USR.y), undefined, 'the member is removed even so');
    assert.ok(JSON.stringify((await extraOf(A)).teams).includes(USR.y), 'and the lists still name them — the screen says so');
    assert.match(REMOVAL_LISTS_LEFT, /Reload/);
    await bUntouched();
});

// ── SYNC ──────────────────────────────────────────────────────────────────────

test('SYNC: the Clerk sync writes no team (J2) — a new row from Clerk takes none, a blank team is not filled', async () => {
    people.set('clerk_itest_teams_new', { id: 'clerk_itest_teams_new', firstName: 'Nova', lastName: 'Teams', emailAddresses: [{ emailAddress: E('nova') }], publicMetadata: { team: 'From Clerk', territory: 'T1' } });
    people.set('clerk_itest_teams_n', { id: 'clerk_itest_teams_n', firstName: 'Nia', lastName: 'Teams', emailAddresses: [{ emailAddress: E('n') }], publicMetadata: { team: 'From Clerk' } });
    membersOf.set(A, ['clerk_itest_teams_new', 'clerk_itest_teams_n']);
    const r = await call('users-sync', WHO.admin, 'POST', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const nova = (await db.select().from(users).where(and(eq(users.orgId, A), eq(users.email, E('nova')))))[0];
    assert.ok(nova, 'created');
    assert.equal(nova.team, null, 'REGRESSION: a new row takes a team from Clerk — one value for every org, with no id');
    assert.equal(nova.territory, 'T1', 'the territory still (filed)');
    assert.equal((await rowOf(USR.n)).team, null, 'REGRESSION: a blank team is filled from Clerk');
    await bUntouched();
});
