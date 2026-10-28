// tests/integration/member-profile.itest.mjs
//
// The member profile page sends only what changed (state §0.211 — Jeff, 15 Oct: "Send only what changed"; 16 Oct:
// "File it, own batch next"; 26 Oct: "Your change wins"). Against the test database, with the REAL verifyAuth (only
// the Clerk SDK is a stand-in: verifyToken reads the claims a test token carries, so each caller's role is their
// row's in this org's roster) and the real users handler.
//
// These are GUARDS, not regression proofs: the batch changes no function, so each passes on the server before it.
// Each states the contract the page now relies on, for the bodies src/utils/memberSave.js builds. I1's and I3's
// CONTROLs send today's body (faed240's UsersDetail.jsx :937-938) to the same server and assert today's harm; I2's
// sends a name alone — not today's body (faed240's page cleared First and Last in the form) but the body a
// difference-only save would send without the pair, which is why memberChanges carries it. The page's change itself
// is proved by tests/member-profile-save.test.mjs, whose runs of faed240's handleSave fail its rules.
//   I1  a phone save keeps what changed since the page opened — the member's own title, signature and preferences,
//       a Manager's forecast call — and everything else the row holds; one "user.updated" row, the Admin's.
//       CONTROL: today's body puts the page's copy of each back
//   I2  a rename over a First and Last set since: the page's body (the name with First and Last cleared) stores the
//       name typed. CONTROL: a name alone stores the First/Last one — why the pair rides
//   I3  a team by its id: the second of two teams of one name stored with its name, the joined date moved; a phone
//       save leaves a member of the second team, and a member whose team was renamed since, on their teams.
//       CONTROL: today's body moves the one onto the first team of the name and clears the other's valid team
//   I4  ISOLATION — A's body naming B's team is refused naming teamId; an A Admin's save of B's member is refused;
//       B's Admin reads none of A's members; every B row is as seeded at the end
//   I5a-I5g (step B, state §0.212 — REGRESSION PROOFS: step B changes users.mjs, linkIds.js and _links.mjs; run on
//       step A's server, each fails — I5a, I5b, I5d and I5g on their own rule, I5c, I5e and I5f because that server
//       stores no manager id at all) the manager by id: this org's member stored with their name; B's member and an id no
//       member holds 404, the member themselves 400, a value that is no id 400, each naming managerId, the row as it
//       was; an id the row holds, of a member removed since, never asked again; a create naming B's member 404, no
//       row, a body's own id never the new row's; the member's own save (?me) never sets it; a save changing the
//       name alone unlinks the id, the id alone drops the old name; an Admin's restore clears one naming no member
//       here or the member themselves, the name kept, and counts it; every B row as seeded
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_mprofile_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_mprofile_*' — its two orgs, every row id it seeds ('…itest_mprofile_…'; a
// member's 'usr_itest_mprofile_<org>_…', a team's 'team_itest_mprofile_<org>_…'), its members' Clerk ids
// ('clerk_itest_mprofile_<org>_…') and emails ('<org>_…@itest-mprofile.local') — each org's its own, and ONLY this
// file writes to it (guide §18b25). Audit rows the handler writes are cleaned by org.
const A = 'itest_mprofile_A', B = 'itest_mprofile_B';
const ORGS = [A, B];
const KEY = (org) => org.slice(-1);   // 'A' | 'B'
const U = (org, who) => `usr_itest_mprofile_${KEY(org)}_${who}`;
const CLERK = (org, who) => `clerk_itest_mprofile_${KEY(org)}_${who}`;
const E = (org, who) => `${KEY(org)}_${who}@itest-mprofile.local`;
const TEAM = (org, t) => `team_itest_mprofile_${KEY(org)}_${t}`;
const who = (org, w) => ({ clerk: CLERK(org, w), org });

const clerkClient = {
    users: { getUser: async () => { const e = new Error('Not Found'); e.status = 404; throw e; } },
    organizations: {
        getOrganizationMembershipList: async () => ({ data: [] }),
        getOrganizationInvitationList: async () => ({ data: [] }),
        createOrganizationInvitation: async () => { throw new Error('this suite sends no invitation'); },
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

const { handler: usersHandler } = await import('../../netlify/functions/users.mjs');
const { handler: backupHandler } = await import('../../netlify/functions/backup.mjs');
const { db } = await import('../../db/index.js');
const { settings, users, auditLog, backups } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { memberChanges } = await import('../../src/utils/memberSave.js');
const { teamIdNamed } = await import('../../src/utils/teamMembership.js');
const { eq, and, inArray, sql } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// The words, written out: what the screen shows is part of the rule.
const NOT_IN_ORG_TEAM = 'That team is not in your organization — pick one from the list.';
const NOT_A_MEMBER = 'That member is not in your organization — they may have been removed. Reload and try again.';
const NOT_IN_ORG_MEMBER = 'That member is not in your organization — pick one from the list.';
const NAMES_ITSELF = 'A member cannot name itself.';
const NOT_AN_ID = 'A link must name a record by its id.';

const call = async (w, method, body, qs, handler = usersHandler) => {
    const res = await handler({
        httpMethod: method,
        headers: { authorization: 'Bearer ' + tokenFor(w.clerk, w.org), 'content-type': 'application/json' },
        queryStringParameters: qs || {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const ME = { me: 'true' };
const one = async (id) => (await db.select().from(users).where(eq(users.id, id)))[0];
// A timestamp as Postgres prints it — read as text, never through a Date (they read +5h on Jeff's machine).
const joinedOf = async (id) => (await db.select({ t: sql`${users.teamJoinedAt}::text` }).from(users).where(eq(users.id, id)))[0]?.t ?? null;
const updates = async (org, actor) => (await db.select({ n: sql`count(*)`.mapWith(Number) }).from(auditLog)
    .where(and(eq(auditLog.orgId, org), eq(auditLog.action, 'user.updated'), ...(actor ? [eq(auditLog.userId, actor)] : []))))[0].n;
// The page's first copy of a member: the Admin's roster read, as the Users list holds it at sign-in.
const firstCopy = async (org, w) => {
    const r = await call(who(org, 'admin'), 'GET');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = r.body.users.find((u) => u.id === U(org, w));
    assert.ok(row, `${w} is on ${org}'s roster`);
    return row;
};
// faed240's UsersDetail.jsx :937-938, verbatim: the body today's page sends.
const OLD_BODY = (form, settings) => {
    const { active: _active, status: _status, clerkUserId: _login, pinnedReports: _pins, ...edited } = form;
    const toSave = { ...edited, teamId: teamIdNamed(settings.teams, form.team) };
    return toSave;
};

// Each org's teams: East, a second East and West — the same names in both, each org's own ids.
const teamsOf = (org) => ({ teams: [
    { id: TEAM(org, 'east'), name: 'East', managerId: U(org, 'bob'), repIds: [U(org, 'tess'), U(org, 'lou'), U(org, 'tara')] },
    { id: TEAM(org, 'east2'), name: 'East', repIds: [U(org, 'eve')] },
    { id: TEAM(org, 'west'), name: 'West', repIds: [U(org, 'wes'), U(org, 'rena')] },
] });
const JOINED = new Date('2026-09-01T00:00:00Z');
const JOINED_TEXT = '2026-09-01 00:00:00';
const seedOrg = (org) => {
    const m = (w, name, role, extra = {}) => ({ id: U(org, w), orgId: org, clerkUserId: CLERK(org, w), name, email: E(org, w), role, ...extra,
        profile: { status: 'Active', ...(extra.profile || {}) } });
    const busy = (w, name) => m(w, name, 'User', {
        team: 'East', territory: 'South', quota: '100', teamJoinedAt: JOINED,
        profile: { title: 'Rep', phone: '1', emailSignature: 'sig', notificationPrefs: { digest: true }, forecastCalls: { '2026-Q4': { commit: 10 } },
            manager: 'Bob Mprofile', teamId: TEAM(org, 'east'), pinnedReports: [`report_itest_mprofile_${KEY(org)}_x`] },
    });
    return [
        m('admin', 'Ada Mprofile', 'Admin'),
        m('bob', 'Bob Mprofile', 'Manager'),
        busy('tess', 'Tess Mprofile'),
        busy('lou', 'Lou Mprofile'),
        m('rena', 'Rena Mprofile', 'User', { team: 'West', teamJoinedAt: JOINED, profile: { teamId: TEAM(org, 'west') } }),   // no First/Last
        m('tara', 'Tara Mprofile', 'User', { team: 'East', teamJoinedAt: JOINED, profile: { phone: '1', teamId: TEAM(org, 'east') } }),
        m('eve', 'Eve Mprofile', 'User', { team: 'East', teamJoinedAt: JOINED, profile: { phone: '1', teamId: TEAM(org, 'east2') } }),
        // A team renamed since — West to "Westside" — whose cascade missed this member (P28): the id is still West's.
        m('wes', 'Wes Mprofile', 'User', { team: 'Westside', teamJoinedAt: JOINED, profile: { phone: '1', teamId: TEAM(org, 'west') } }),
    ];
};

const cleanup = async () => {
    // backups: I5's restore leaves its "_import" snapshot row (backup.mjs).
    for (const t of [settings, users, auditLog, backups]) await db.delete(t).where(inArray(t.orgId, ORGS));
};
// Org B's rows, whole — taken once seeded, compared at the end.
const bRows = async () => {
    const out = {};
    for (const [name, t] of Object.entries({ settings, users, auditLog })) {
        out[name] = (await db.select().from(t).where(eq(t.orgId, B))).sort((x, y) => x.id.localeCompare(y.id));
    }
    return out;
};
let bSeeded;

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(settings).values([
        { id: 'settings_itest_mprofile_A', orgId: A, extra: teamsOf(A) },
        { id: 'settings_itest_mprofile_B', orgId: B, extra: teamsOf(B) },
    ]);
    await db.insert(users).values([...seedOrg(A), ...seedOrg(B)]);
    invalidateRoster();
    bSeeded = await bRows();
});

after(cleanup);

test("I1 (P1) the page's body — the changed fields alone — keeps what changed since the page opened: the member's own title, signature and preferences and a Manager's forecast call stand, and every other key the row holds; one \"user.updated\" row, the Admin's (a guard). CONTROL: today's body puts the page's copy of each back", async () => {
    const first = await firstCopy(A, 'tess');
    const was = await one(U(A, 'tess'));
    assert.equal(await joinedOf(U(A, 'tess')), JOINED_TEXT);
    // Since the page opened: Tess's own panel, then a Manager's forecast call (Jeff, 26 Oct: "Your change wins").
    const own = await call(who(A, 'tess'), 'PUT', { id: U(A, 'tess'), title: 'Rep (newer)', emailSignature: 'sig (newer)', notificationPrefs: { digest: false } }, ME);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    const fc = await call(who(A, 'bob'), 'PUT', { id: U(A, 'tess'), forecastCalls: { '2026-Q4': { commit: 99 } } });
    assert.equal(fc.status, 200, JSON.stringify(fc.body));

    const body = { id: U(A, 'tess'), ...memberChanges(first, { ...first, phone: '2' }) };
    assert.deepEqual(body, { id: U(A, 'tess'), phone: '2' }, "the page's body");
    const all = await updates(A), byAdmin = await updates(A, CLERK(A, 'admin'));
    const r = await call(who(A, 'admin'), 'PUT', body);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const now = await one(U(A, 'tess'));
    assert.equal(now.profile.phone, '2');
    assert.deepEqual([now.profile.title, now.profile.emailSignature, now.profile.notificationPrefs, now.profile.forecastCalls],
        ['Rep (newer)', 'sig (newer)', { digest: false }, { '2026-Q4': { commit: 99 } }], 'what changed since the page opened stands');
    for (const k of ['name', 'email', 'team', 'territory', 'quota', 'role', 'active', 'clerkUserId']) assert.deepEqual(now[k], was[k], k);
    for (const k of ['teamId', 'manager', 'pinnedReports', 'status']) assert.deepEqual(now.profile[k], was.profile[k], `profile.${k}`);
    assert.equal(await joinedOf(U(A, 'tess')), JOINED_TEXT, 'the date they joined their team, as it was');
    assert.equal(await updates(A) - all, 1, 'one user.updated row for the save');
    assert.equal(await updates(A, CLERK(A, 'admin')) - byAdmin, 1, "and it is the Admin's");
    assert.deepEqual([r.body.user.title, r.body.user.phone, r.body.user.name], ['Rep (newer)', '2', 'Tess Mprofile'], 'the answer is the row as stored — what the page now holds');

    // CONTROL — the same story on Lou, with today's body: the page's copy of each put back.
    const firstLou = await firstCopy(A, 'lou');
    assert.equal((await call(who(A, 'lou'), 'PUT', { id: U(A, 'lou'), title: 'Rep (newer)', emailSignature: 'sig (newer)', notificationPrefs: { digest: false } }, ME)).status, 200);
    assert.equal((await call(who(A, 'bob'), 'PUT', { id: U(A, 'lou'), forecastCalls: { '2026-Q4': { commit: 99 } } })).status, 200);
    const old = await call(who(A, 'admin'), 'PUT', OLD_BODY({ ...firstLou, phone: '2' }, teamsOf(A)));
    assert.equal(old.status, 200, JSON.stringify(old.body));
    const lou = await one(U(A, 'lou'));
    assert.deepEqual([lou.profile.title, lou.profile.emailSignature, lou.profile.notificationPrefs, lou.profile.forecastCalls],
        ['Rep', 'sig', { digest: true }, { '2026-Q4': { commit: 10 } }], "CONTROL: today's body puts back the member's own changes and the Manager's call");
});

test('I2 (P2) a rename over a First and Last set since the page opened: the body with First and Last cleared stores the name typed (a guard). CONTROL: a name alone stores the First/Last one, with a 200 — why the pair rides', async () => {
    const first = await firstCopy(A, 'rena');
    assert.ok(!first.firstName && !first.lastName, 'the first copy holds no First/Last');
    const own = await call(who(A, 'rena'), 'PUT', { id: U(A, 'rena'), firstName: 'Rena', lastName: 'Before' }, ME);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal((await one(U(A, 'rena'))).name, 'Rena Before');
    const bare = await call(who(A, 'admin'), 'PUT', { id: U(A, 'rena'), name: 'Rena Renamed' });
    assert.equal(bare.status, 200, JSON.stringify(bare.body));
    assert.equal((await one(U(A, 'rena'))).name, 'Rena Before', 'CONTROL: First and Last set since rebuild the old name');
    const body = { id: U(A, 'rena'), ...memberChanges(first, { ...first, name: 'Rena Renamed' }) };
    assert.deepEqual(body, { id: U(A, 'rena'), name: 'Rena Renamed', firstName: null, lastName: null });
    const r = await call(who(A, 'admin'), 'PUT', body);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const now = await one(U(A, 'rena'));
    assert.equal(now.name, 'Rena Renamed');
    assert.deepEqual([now.profile.firstName, now.profile.lastName], [null, null]);
    assert.equal(r.body.user.name, 'Rena Renamed');
});

test("I3 (P3) a team by its id: the second East stored with its name, the joined date moved; a phone save leaves a member of the second East and a member whose team was renamed since on their teams, dates as they were (a guard). CONTROL: today's body moves the one onto the first East and clears the other's valid team", async () => {
    const firstTara = await firstCopy(A, 'tara');
    const r = await call(who(A, 'admin'), 'PUT', { id: U(A, 'tara'), ...memberChanges(firstTara, { ...firstTara, team: 'East', teamId: TEAM(A, 'east2') }) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const tara = await one(U(A, 'tara'));
    assert.deepEqual([tara.team, tara.profile.teamId], ['East', TEAM(A, 'east2')]);
    const taraJoined = await joinedOf(U(A, 'tara'));
    assert.ok(taraJoined && taraJoined !== JOINED_TEXT, `the date they joined moves with the team — a new date, not cleared: ${taraJoined}`);

    for (const w of ['eve', 'wes']) {
        const first = await firstCopy(A, w);
        const was = await one(U(A, w));
        const body = { id: U(A, w), ...memberChanges(first, { ...first, phone: '2' }) };
        assert.deepEqual(body, { id: U(A, w), phone: '2' }, `${w}: a phone save sends no team`);
        const s = await call(who(A, 'admin'), 'PUT', body);
        assert.equal(s.status, 200, JSON.stringify(s.body));
        const now = await one(U(A, w));
        assert.deepEqual([now.team, now.profile.teamId], [was.team, was.profile.teamId], `${w}: on their team`);
        assert.equal(await joinedOf(U(A, w)), JOINED_TEXT, `${w}: the date as it was`);
    }

    // CONTROL — today's body, a phone save each.
    const eve = await firstCopy(A, 'eve');
    assert.equal((await call(who(A, 'admin'), 'PUT', OLD_BODY({ ...eve, phone: '3' }, teamsOf(A)))).status, 200);
    const eveNow = await one(U(A, 'eve'));
    assert.equal(eveNow.profile.teamId, TEAM(A, 'east'), 'CONTROL: a member of the second East moved onto the first by a phone save');
    const eveJoined = await joinedOf(U(A, 'eve'));
    assert.ok(eveJoined && eveJoined !== JOINED_TEXT, `CONTROL: and their joined date re-stamped — a new date, not cleared: ${eveJoined}`);
    const wes = await firstCopy(A, 'wes');
    assert.equal((await call(who(A, 'admin'), 'PUT', OLD_BODY({ ...wes, phone: '3' }, teamsOf(A)))).status, 200);
    const wesNow = await one(U(A, 'wes'));
    assert.equal(wesNow.profile.teamId ?? null, null, 'CONTROL: no team is called "Westside" — a valid team id cleared');
    assert.equal(await joinedOf(U(A, 'wes')), null, 'CONTROL: and the date with it');
});

test("I4 (ISOLATION) A's body naming B's team is 404 naming teamId, A's row as it was; an A Admin's save of B's member is 404, B's row as it was; B's Admin reads none of A's members; every B row is as seeded", async () => {
    const was = await one(U(A, 'tess'));
    const r = await call(who(A, 'admin'), 'PUT', { id: U(A, 'tess'), ...memberChanges(was, { ...was, team: 'East', teamId: TEAM(B, 'east2') }) });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG_TEAM, field: 'teamId' });
    assert.deepEqual(await one(U(A, 'tess')), was, "A's row as it was");
    const x = await call(who(A, 'admin'), 'PUT', { id: U(B, 'tess'), phone: 'x' });
    assert.equal(x.status, 404, JSON.stringify(x.body));
    assert.deepEqual(x.body, { error: NOT_A_MEMBER });
    const list = await call(who(B, 'admin'), 'GET');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.deepEqual(list.body.users.map((u) => u.id).sort(), seedOrg(B).map((m) => m.id).sort(), "B's roster is B's members alone");
    assert.ok(!list.body.users.some((u) => u.id.includes('_mprofile_A_')), "none of A's members");
    const bTess = list.body.users.find((u) => u.id === U(B, 'tess'));
    assert.deepEqual([bTess.phone, bTess.title, bTess.teamId], ['1', 'Rep', TEAM(B, 'east')], "B's Tess as seeded");
    assert.deepEqual(await bRows(), bSeeded, 'every B row as seeded');
});

// I5 (P14, state §0.212) the manager by id — one test per rule, run in this order; each, run on step A's server
// (users.mjs, linkIds.js and _links.mjs as at bc39110), fails (state §0.212 names how).
const admin = who(A, 'admin');
const tara = U(A, 'tara');

test("I5a (P14) this org's member, by id, is stored with their name — and the answer carries it", async () => {
    const set = await call(admin, 'PUT', { id: tara, manager: 'Bob Mprofile', managerId: U(A, 'bob') });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    const row = await one(tara);
    assert.deepEqual([row.profile.manager, row.profile.managerId], ['Bob Mprofile', U(A, 'bob')], 'REGRESSION: sanitize drops the manager id');
    assert.equal(set.body.user.managerId, U(A, 'bob'), 'what the page now holds');
});

test("I5b (P14) B's member and an id no member holds 404, the member themselves 400, a value that is no id 400 — each naming managerId, the row as it was", async () => {
    const row = await one(tara);
    for (const [body, status, answer, why] of [
        [{ id: tara, manager: 'Bob Mprofile', managerId: U(B, 'bob') }, 404, { error: NOT_IN_ORG_MEMBER, field: 'managerId' }, 'REGRESSION: a manager of another org is stored'],
        [{ id: tara, managerId: U(A, 'nobody') }, 404, { error: NOT_IN_ORG_MEMBER, field: 'managerId' }, 'an id no member holds'],
        [{ id: tara, manager: 'Tara Mprofile', managerId: tara }, 400, { error: NAMES_ITSELF, field: 'managerId' }, 'REGRESSION: a member named their own manager'],
        [{ id: tara, managerId: 5 }, 400, { error: NOT_AN_ID, field: 'managerId' }, 'a value that is no id'],
    ]) {
        const r = await call(admin, 'PUT', body);
        assert.equal(r.status, status, `${why}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, answer, why);
        assert.deepEqual(await one(tara), row, `${why}: the row as it was`);
    }
});

test('I5c (P14) an id the row holds is never asked again — a member removed since too', async () => {
    const gone = U(A, 'gone');
    await db.insert(users).values({ id: gone, orgId: A, clerkUserId: CLERK(A, 'gone'), name: 'Gus Mprofile', email: E(A, 'gone'), role: 'Manager', profile: { status: 'Active' } });
    invalidateRoster();
    assert.equal((await call(admin, 'PUT', { id: tara, manager: 'Gus Mprofile', managerId: gone })).status, 200);
    await db.delete(users).where(and(eq(users.orgId, A), eq(users.id, gone)));
    invalidateRoster();
    const held = await call(admin, 'PUT', { id: tara, title: 'Lead', manager: 'Gus Mprofile', managerId: gone });
    assert.equal(held.status, 200, `the held id is not asked again: ${JSON.stringify(held.body)}`);
    const row = await one(tara);
    assert.deepEqual([row.profile.title, row.profile.managerId], ['Lead', gone]);
});

test("I5d (P14) a create naming B's member is 404 naming managerId, and no row is made; one naming this org's is stored", async () => {
    const rowsBefore = (await db.select({ id: users.id }).from(users).where(eq(users.orgId, A))).length;
    const refused = await call(admin, 'POST', { firstName: 'Nell', lastName: 'Mprofile', email: E(A, 'nell'), role: 'User', managerId: U(B, 'bob') });
    assert.equal(refused.status, 404, `REGRESSION: a create stores a manager of another org: ${JSON.stringify(refused.body)}`);
    assert.deepEqual(refused.body, { error: NOT_IN_ORG_MEMBER, field: 'managerId' });
    assert.equal((await db.select({ id: users.id }).from(users).where(eq(users.orgId, A))).length, rowsBefore, 'no row');
    // A body's id is never the new row's (the server mints it): one naming itself as the manager is an id no member holds.
    const selfish = await call(admin, 'POST', { id: U(A, 'zed'), firstName: 'Zed', lastName: 'Mprofile', email: E(A, 'zed'), role: 'User', managerId: U(A, 'zed') });
    assert.equal(selfish.status, 404, `REGRESSION: a create's body id read as the new row's: ${JSON.stringify(selfish.body)}`);
    assert.deepEqual(selfish.body, { error: NOT_IN_ORG_MEMBER, field: 'managerId' });
    const made = await call(admin, 'POST', { firstName: 'Nell', lastName: 'Mprofile', email: E(A, 'nell'), role: 'User', manager: 'Bob Mprofile', managerId: U(A, 'bob') });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal((await one(made.body.user.id)).profile.managerId, U(A, 'bob'));
});

test("I5e (P14) the member's own save (?me) never sets their manager — the one an Admin set stands", async () => {
    const tess = U(A, 'tess');
    assert.equal((await call(admin, 'PUT', { id: tess, manager: 'Bob Mprofile', managerId: U(A, 'bob') })).status, 200);
    const own = await call(who(A, 'tess'), 'PUT', { id: tess, title: 'Rep (own)', manager: 'Ada Mprofile', managerId: U(A, 'admin') }, ME);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    const now = await one(tess);
    assert.deepEqual([now.profile.title, now.profile.manager, now.profile.managerId], ['Rep (own)', 'Bob Mprofile', U(A, 'bob')],
        'REGRESSION: a member sets their own manager — or their own save (a timezone, a pin) wipes the one an Admin set');
});

test('I5f (P14) one manager, their name and their id: a save that changes the name alone (a page loaded before §0.212) unlinks the id; one that changes the id alone drops the old name; the name sent as it stands unlinks nothing', async () => {
    const rena = U(A, 'rena');
    assert.equal((await call(admin, 'PUT', { id: rena, manager: 'Bob Mprofile', managerId: U(A, 'bob') })).status, 200);
    assert.equal((await call(admin, 'PUT', { id: rena, manager: 'Bob Mprofile' })).status, 200);
    assert.deepEqual([(await one(rena)).profile.manager, (await one(rena)).profile.managerId], ['Bob Mprofile', U(A, 'bob')], 'the name as it stands: still linked');
    assert.equal((await call(admin, 'PUT', { id: rena, manager: 'Ada Mprofile' })).status, 200);
    let p = (await one(rena)).profile;
    assert.deepEqual([p.manager, p.managerId], ['Ada Mprofile', null], "REGRESSION: a name changed alone keeps the old id — every reader names the old manager");
    assert.equal((await call(admin, 'PUT', { id: rena, managerId: U(A, 'bob') })).status, 200);
    p = (await one(rena)).profile;
    assert.deepEqual([p.manager, p.managerId], [null, U(A, 'bob')], 'REGRESSION: an id changed alone keeps the old name');
});

test("I5g (P14) an Admin's restore clears a manager naming no member here, or the member themselves — the name kept — keeps this org's, and counts it; B's Admin reads none of A's members, and every B row is as seeded", async () => {
    const R = (w) => U(A, `rst_${w}`);
    const restore = await call(admin, 'PATCH', { entities: { users: [
        { id: R('b'), email: E(A, 'rst_b'), name: 'Rob Restored', role: 'User', profile: { manager: 'Bob Elsewhere', managerId: U(B, 'bob') } },
        { id: R('self'), email: E(A, 'rst_self'), name: 'Sal Restored', role: 'User', profile: { manager: 'Sal Restored', managerId: R('self') } },
        { id: R('ok'), email: E(A, 'rst_ok'), name: 'Oki Restored', role: 'User', profile: { manager: 'Bob Mprofile', managerId: U(A, 'bob') } },
    ] } }, undefined, backupHandler);
    assert.equal(restore.status, 200, JSON.stringify(restore.body));
    assert.deepEqual([restore.body.imported, restore.body.errors], [3, []]);
    assert.ok(restore.body.notes.includes('2 links that named no record of this organization were cleared.'),
        `REGRESSION: a restored member's unknown manager is kept: ${JSON.stringify(restore.body.notes)}`);
    const rb = await one(R('b'));
    assert.deepEqual([rb.profile.managerId, rb.profile.manager], [null, 'Bob Elsewhere'], "another org's member cleared, the name kept");
    assert.equal((await one(R('self'))).profile.managerId, null, 'the member themselves cleared');
    assert.equal((await one(R('ok'))).profile.managerId, U(A, 'bob'), "this org's kept");
    const list = await call(who(B, 'admin'), 'GET');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(!list.body.users.some((u) => u.id.includes('_mprofile_A_') || String(u.managerId || '').includes('_mprofile_A_')), "none of A's members or managers");
    assert.deepEqual(await bRows(), bSeeded, 'every B row as seeded');
});
