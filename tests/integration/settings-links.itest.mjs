// tests/integration/settings-links.itest.mjs
//
// The ids inside settings name this org's (state §0.221 — batch 4b-3 of OPEN_ITEMS §1 item 1, step A; Jeff, 1 Nov:
// "Build step A", every answer the Recommended — docs/design/links-batch-4b3/ANSWERS.md). Against the test database,
// with the REAL verifyAuth (only the Clerk SDK is a stand-in: verifyToken reads the claims a test token carries, so
// each caller's role is their row's in this org's roster) and the real settings, backup and coaching-notes handlers:
//   LINKS     a team's manager and reps and a territory's owner and reps are members of THIS org, a crew's members and
//             lead its technicians and its default vehicle its vehicle, a quote template's products its products:
//             org B's, or one naming nothing, is 404 naming the LIST, and nothing is written
//   ANY       any of this org's stands — a deactivated or invited member, an inactive technician, an inactive
//             product (Q2: "Any of this org's")
//   HELD      an id the stored list holds, in that field anywhere, is never asked again (Q1) — a stray stored before
//             this batch stands, and may move to another entry; a new one is refused
//   SHAPE     a list of entries, each with its own text id, no id twice; a value that names no record by its id
//             400 — what the stored list holds stands, by count
//   REQUESTS  a save's body never writes integrationRequests (Q15)
//   COACHING  a team note's team is the house link: org B's 404 naming teamId (Q10)
//   RESTORE   where the restore LANDS the org's settings row, what its lists name that is no row of this org is
//             cleared ('' for one id, dropped from a list) and counted; a row the org already had is left byte for
//             byte; a file with no settings row writes none
// Org B is read whole once seeded and compared at the end: nothing here reaches it.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_setlinks_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_setlinks_*' — its three orgs, every row id it seeds or names
// ('itest_setlinks_…'; a member's 'usr_itest_setlinks_…'), its members' Clerk ids ('clerk_itest_setlinks_…') and
// emails ('…@itest-setlinks.local') — and ONLY this file writes to it (guide §18b25). Ids the handlers mint (a
// snapshot's, an audit row's) are cleaned by org.
const A = 'itest_setlinks_A', B = 'itest_setlinks_B', C = 'itest_setlinks_C';
const ORGS = [A, B, C];
const ID = (s) => 'itest_setlinks_' + s;
const E = (s) => `${s}@itest-setlinks.local`;

const clerkClient = {
    users: { getUser: async () => { const e = new Error('Not Found'); e.status = 404; throw e; } },
    organizations: {
        getOrganizationMembershipList: async () => ({ data: [] }),
        getOrganizationInvitationList: async () => ({ data: [] }),
        createOrganizationInvitation: async () => ({ id: 'orginv_itest_setlinks' }),
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
const anyTemplate = new Proxy({}, { get: () => () => ({ subject: '', html: '', text: '' }) });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: anyTemplate },
});

const FN = {};
for (const name of ['settings', 'backup', 'coaching-notes']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const { settings, users, products, dispatchTechnicians, dispatchVehicles, coachingNotes, backups, auditLog } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { NOT_AN_ID, NOT_A_LIST, ENTRY_NEEDS_ID } = await import('../../src/utils/linkIds.js');
const { eq, inArray, sql } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// The words, written out: what the screen shows is part of the rule.
const NOT_IN_ORG = {
    member: 'That member is not in your organization — pick one from the list.',
    technician: 'That technician is not in your organization — pick one from the list.',
    vehicle: 'That vehicle is not in your organization — pick one from the list.',
    product: 'That product is not in your organization — pick one from the list.',
    team: 'That team is not in your organization — pick one from the list.',
};
const cleared = (n) => `${n} link${n === 1 ? '' : 's'} that named no record of this organization ${n === 1 ? 'was' : 'were'} cleared.`;

const WHO = {
    admin:  { clerk: 'clerk_itest_setlinks_admin',   org: A },
    adminB: { clerk: 'clerk_itest_setlinks_admin_b', org: B },
    adminC: { clerk: 'clerk_itest_setlinks_admin_c', org: C },
};
const USR = {
    admin: 'usr_itest_setlinks_admin', mgr: 'usr_itest_setlinks_mgr', karen: 'usr_itest_setlinks_karen',
    dee: 'usr_itest_setlinks_dee', ivy: 'usr_itest_setlinks_ivy',
    adminB: 'usr_itest_setlinks_admin_b', repB: 'usr_itest_setlinks_rep_b',
    adminC: 'usr_itest_setlinks_admin_c',
};
const TECH_A = ID('tech_a'), TECH_A_OFF = ID('tech_a_off'), TECH_B = ID('tech_b'), TECH_C = ID('tech_c');
const VEH_A = ID('veh_a'), VEH_B = ID('veh_b');
const PROD_A = ID('prod_a'), PROD_A_OFF = ID('prod_a_off'), PROD_B = ID('prod_b'), PROD_C = ID('prod_c');
const T_EAST = ID('team_east'), T_WEST = ID('team_west'), T_B = ID('team_b');
const NOTHING = 'usr_itest_setlinks_nobody';
const CLERKISH = 'user_itest_setlinks_clerkish';

// Org A's settings as stored before this batch: a team holding org B's rep (a stray the list held already), a
// territory holding a Clerk-shaped id (UKG's case, the census), a job template with no id of its own (an old entry).
const A_EXTRA = {
    teams: [
        { id: T_EAST, name: 'East', managerId: USR.mgr, repIds: [USR.karen, USR.repB], color: '#2a2622' },
        { id: T_WEST, name: 'West', managerId: '', repIds: [] },
    ],
    territories: [{ id: ID('terr_north'), name: 'North', ownerId: '', repIds: [CLERKISH] }],
    dispatchCrews: [{ id: ID('crew_1'), name: 'Crew 1', members: [TECH_A], lead: TECH_A, defaultVehicle: VEH_A }],
    quoteTemplates: [{ id: ID('qt_1'), name: 'Starter', productIds: [PROD_A] }],
    spiffs: [{ id: ID('spiff_1'), name: 'Q4 push' }],
    dispatchJobTemplates: [{ name: 'Old template, no id' }],
    integrationRequests: { hubspot: { requestedAt: '2026-10-01T00:00:00.000Z', byName: 'Ada Setlinks' } },
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
const put = (body) => call('settings', WHO.admin, 'PUT', body);
// A row's extra as Postgres prints it: "nothing written" is the stored text, byte for byte.
const extraText = async (org) => (await db.select({ t: sql`${settings.extra}::text` }).from(settings).where(eq(settings.orgId, org)))[0]?.t ?? null;
const extraOf = async (org) => (await db.select({ extra: settings.extra }).from(settings).where(eq(settings.orgId, org)))[0]?.extra ?? null;
const withEntry = (list, i, patch) => list.map((e, j) => (j === i ? { ...e, ...patch } : e));

const TABLES = [settings, users, products, dispatchTechnicians, dispatchVehicles, coachingNotes, backups, auditLog];
const cleanup = async () => {
    for (const t of TABLES) await db.delete(t).where(inArray(t.orgId, ORGS));
};
const B_TABLES = { settings, users, products, dispatchTechnicians, dispatchVehicles, coachingNotes };
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
        { id: A, orgId: A, extra: A_EXTRA },
        { id: B, orgId: B, extra: { teams: [{ id: T_B, name: 'B Team', managerId: USR.adminB, repIds: [USR.repB] }] } },
    ]);
    const u = (id, org, clerkUserId, local, name, role, extra = {}) => ({ id, orgId: org, clerkUserId, name, email: E(local), role, ...extra });
    await db.insert(users).values([
        u(USR.admin, A, WHO.admin.clerk, 'admin', 'Ada Setlinks', 'Admin', { profile: { status: 'Active' } }),
        u(USR.mgr, A, 'clerk_itest_setlinks_mgr', 'mgr', 'Max Setlinks', 'Manager', { profile: { status: 'Active' } }),
        u(USR.karen, A, 'clerk_itest_setlinks_karen', 'karen', 'Karen Setlinks', 'User', { team: 'East', profile: { status: 'Active', teamId: T_EAST } }),
        u(USR.dee, A, 'clerk_itest_setlinks_dee', 'dee', 'Dee Setlinks', 'Manager', { active: false, profile: { status: 'Deactivated' } }),
        u(USR.ivy, A, null, 'ivy', 'Ivy Setlinks', 'User', { active: false, profile: { status: 'Invited' } }),
        u(USR.adminB, B, WHO.adminB.clerk, 'admin_b', 'Bea Setlinks', 'Admin', { profile: { status: 'Active' } }),
        u(USR.repB, B, 'clerk_itest_setlinks_rep_b', 'rep_b', 'Rob Setlinks', 'User', { profile: { status: 'Active' } }),
        u(USR.adminC, C, WHO.adminC.clerk, 'admin_c', 'Cy Setlinks', 'Admin', { profile: { status: 'Active' } }),
    ]);
    invalidateRoster();
    await db.insert(dispatchTechnicians).values([
        { id: TECH_A, orgId: A, firstName: 'Tara', lastName: 'Setlinks' },
        { id: TECH_A_OFF, orgId: A, firstName: 'Otto', lastName: 'Setlinks', status: 'inactive' },
        { id: TECH_B, orgId: B, firstName: 'Ben', lastName: 'Setlinks' },
        { id: TECH_C, orgId: C, firstName: 'Cal', lastName: 'Setlinks' },
    ]);
    await db.insert(dispatchVehicles).values([
        { id: VEH_A, orgId: A, name: 'Van A' },
        { id: VEH_B, orgId: B, name: 'Van B' },
    ]);
    await db.insert(products).values([
        { id: PROD_A, orgId: A, name: 'A product', listPrice: '10.00' },
        { id: PROD_A_OFF, orgId: A, name: 'A product, off', listPrice: '10.00', active: false },
        { id: PROD_B, orgId: B, name: 'B product', listPrice: '10.00' },
        { id: PROD_C, orgId: C, name: 'C product', listPrice: '10.00' },
    ]);
    bSeeded = await bRows();
});

after(cleanup);

// ── LINKS ─────────────────────────────────────────────────────────────────────

test("LINKS: org B's member, technician, vehicle or product — or an id naming nothing — in a team, a territory, a crew or a quote template is 404 naming the list, in the house words, and nothing is written", async () => {
    const before = await extraText(A);
    const cases = [
        ['teams', withEntry(A_EXTRA.teams, 1, { repIds: [USR.adminB] }), 'member', 'a rep of org B'],
        ['teams', withEntry(A_EXTRA.teams, 1, { managerId: USR.adminB }), 'member', "a manager of org B"],
        ['teams', withEntry(A_EXTRA.teams, 1, { repIds: [NOTHING] }), 'member', 'a rep naming nothing'],
        ['teams', withEntry(A_EXTRA.teams, 1, { managerId: WHO.admin.clerk }), 'member', "this org's Admin by their CLERK id — never a member's id"],
        ['territories', withEntry(A_EXTRA.territories, 0, { ownerId: NOTHING }), 'member', 'an owner naming nothing'],
        ['territories', withEntry(A_EXTRA.territories, 0, { repIds: [CLERKISH, USR.repB] }), 'member', 'a rep of org B'],
        ['dispatchCrews', withEntry(A_EXTRA.dispatchCrews, 0, { members: [TECH_A, TECH_B] }), 'technician', 'a member of org B'],
        ['dispatchCrews', withEntry(A_EXTRA.dispatchCrews, 0, { lead: TECH_B }), 'technician', 'a lead of org B'],
        ['dispatchCrews', withEntry(A_EXTRA.dispatchCrews, 0, { defaultVehicle: VEH_B }), 'vehicle', 'a vehicle of org B'],
        ['quoteTemplates', withEntry(A_EXTRA.quoteTemplates, 0, { productIds: [PROD_A, PROD_B] }), 'product', 'a product of org B'],
    ];
    for (const [key, list, kind, what] of cases) {
        const r = await put({ [key]: list });
        assert.equal(r.status, 404, `${key}, ${what}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_IN_ORG[kind], field: key }, `${key}, ${what}`);
    }
    assert.equal(await extraText(A), before, 'nothing written, byte for byte');
});

test('LINKS: a new crew whose member names nothing is refused with the rest of the body — no other key of the save lands', async () => {
    const before = await extraText(A);
    const r = await put({ competitors: ['Not saved'], dispatchCrews: [...A_EXTRA.dispatchCrews, { id: ID('crew_2'), name: 'New', members: [NOTHING], lead: null, defaultVehicle: '' }] });
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(r.body, { error: NOT_IN_ORG.technician, field: 'dispatchCrews' });
    assert.equal(await extraText(A), before);
});

// ── SHAPE ─────────────────────────────────────────────────────────────────────

test('SHAPE: a list that is no list, an entry with no id of its own, an id twice, a rep list that is no list or an id that is no text is 400 naming the list — nothing written', async () => {
    const before = await extraText(A);
    const cases = [
        [{ spiffs: 'Q4 push' }, NOT_A_LIST, 'spiffs'],
        [{ territories: { north: true } }, NOT_A_LIST, 'territories'],
        [{ teams: [...A_EXTRA.teams, { name: 'No id' }] }, ENTRY_NEEDS_ID, 'teams'],
        [{ teams: [...A_EXTRA.teams, 'Legacy text team'] }, ENTRY_NEEDS_ID, 'teams'],
        [{ spiffs: [{ id: ID('spiff_1'), name: 'a' }, { id: ID('spiff_1'), name: 'b' }] }, ENTRY_NEEDS_ID, 'spiffs'],
        [{ dispatchJobTypes: [{ id: 7, name: 'Numbered' }] }, ENTRY_NEEDS_ID, 'dispatchJobTypes'],
        [{ teams: withEntry(A_EXTRA.teams, 1, { repIds: USR.karen }) }, NOT_AN_ID, 'teams'],
        [{ dispatchCrews: withEntry(A_EXTRA.dispatchCrews, 0, { lead: 42 }) }, NOT_AN_ID, 'dispatchCrews'],
    ];
    for (const [body, error, field] of cases) {
        const r = await put(body);
        assert.equal(r.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error, field }, JSON.stringify(body));
    }
    assert.equal(await extraText(A), before, 'nothing written, byte for byte');
});

test("SHAPE (held): the stored job template with no id of its own stands — rewritten as a screen rewrites it — while a second one is refused", async () => {
    const r = await put({ dispatchJobTemplates: [{ name: 'Old template, no id', crew: 2, hrs: 1.5 }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await extraOf(A)).dispatchJobTemplates, [{ name: 'Old template, no id', crew: 2, hrs: 1.5 }]);
    const two = await put({ dispatchJobTemplates: [{ name: 'Old template, no id' }, { name: 'Another' }] });
    assert.equal(two.status, 400, JSON.stringify(two.body));
    assert.deepEqual(two.body, { error: ENTRY_NEEDS_ID, field: 'dispatchJobTemplates' });
});

// ── HELD and ANY ──────────────────────────────────────────────────────────────

test("HELD: a stray the stored list holds — org B's rep on East, a Clerk-shaped id on North — stands on a save that changes something else, and may move to another entry (Q1: held anywhere in the list)", async () => {
    const teams = withEntry(withEntry(A_EXTRA.teams, 0, { color: '#4d6b3d' }), 1, { repIds: [USR.repB] });
    const r = await put({ teams, territories: withEntry(A_EXTRA.territories, 0, { name: 'North (renamed)' }) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const x = await extraOf(A);
    assert.deepEqual(x.teams, teams, 'stored as sent');
    assert.deepEqual(x.territories[0].repIds, [CLERKISH]);
});

test("ANY: any of this org's stands — a deactivated member as a team's manager, an invited one among its reps, an inactive technician as a crew's member and lead, this org's vehicle, an inactive product — 200, stored as sent", async () => {
    const teams = withEntry(A_EXTRA.teams, 1, { managerId: USR.dee, repIds: [USR.ivy] });
    const crews = [{ id: ID('crew_1'), name: 'Crew 1', members: [TECH_A, TECH_A_OFF], lead: TECH_A_OFF, defaultVehicle: VEH_A }];
    const templates = [{ id: ID('qt_1'), name: 'Starter', productIds: [PROD_A, PROD_A_OFF] }];
    const territories = withEntry(A_EXTRA.territories, 0, { ownerId: USR.mgr });
    const r = await put({ teams, dispatchCrews: crews, quoteTemplates: templates, territories });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const x = await extraOf(A);
    assert.deepEqual([x.teams, x.dispatchCrews, x.quoteTemplates, x.territories], [teams, crews, templates, territories]);
});

test('ANY: a list emptied, or sent as null, names nothing and stands', async () => {
    const r = await put({ quoteTemplates: [], spiffs: null });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const x = await extraOf(A);
    assert.deepEqual([x.quoteTemplates, x.spiffs], [[], []], 'an empty list stored empty; a null SPIFF list as the PUT stores it, []');
});

// ── REQUESTS ──────────────────────────────────────────────────────────────────

test("REQUESTS: a save's integrationRequests is never written — the stored requests stand, whatever the body says (Q15)", async () => {
    const r = await put({ integrationRequests: { zoom: { requestedAt: '2026-11-01T00:00:00.000Z' } }, competitors: ['Saved'] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const x = await extraOf(A);
    assert.deepEqual(x.integrationRequests, A_EXTRA.integrationRequests, 'REGRESSION: a body presets a request');
    assert.deepEqual(x.competitors, ['Saved'], 'the rest of the save lands');
});

// ── COACHING ──────────────────────────────────────────────────────────────────

test("COACHING: a team note naming org B's team, or a team naming nothing, is 404 naming teamId in the house words, and no note; this org's team stands", async () => {
    for (const teamId of [T_B, ID('team_gone')]) {
        const r = await call('coaching-notes', WHO.admin, 'POST', { id: ID('note_' + teamId), text: 'x', date: '2026-11-01', teamId });
        assert.equal(r.status, 404, `${teamId}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(r.body, { error: NOT_IN_ORG.team, field: 'teamId' });
    }
    assert.deepEqual(await db.select().from(coachingNotes).where(eq(coachingNotes.orgId, A)), [], 'no note');
    const ok = await call('coaching-notes', WHO.admin, 'POST', { id: ID('note_east'), text: 'Team East: well done', date: '2026-11-01', teamId: T_EAST });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.coachingNote.teamId, T_EAST);
});

// ── RESTORE ───────────────────────────────────────────────────────────────────

test('RESTORE: a file with no settings row writes none — org C still has no settings row', async () => {
    const r = await call('backup', WHO.adminC, 'PATCH', { entities: { users: [{ id: ID('c_m0'), email: E('c_m0'), name: 'Nia Restored', role: 'User' }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await extraText(C), null, 'no settings row');
});

test("RESTORE: where the restore lands the org's settings row, what its lists name that is no row of this org is cleared — '' for one id, dropped from a list, the rest in order — and counted; what names this org's stands", async () => {
    const M1 = ID('c_m1');
    const FILE = { entities: {
        settings: [{ id: 'any', orgId: B, extra: {
            teams: [{ id: ID('c_team'), name: 'C Team', managerId: USR.adminB, repIds: [M1, NOTHING, CLERKISH], color: '#3a5a7a' }, { id: ID('c_west'), name: 'C West', managerId: '', repIds: [] }],
            territories: [{ id: ID('c_terr'), name: 'C North', ownerId: M1, repIds: [USR.repB] }],
            dispatchCrews: [{ id: ID('c_crew'), name: 'C Crew', members: [TECH_B, TECH_C], lead: TECH_B, defaultVehicle: VEH_B }],
            quoteTemplates: [{ id: ID('c_qt'), name: 'C Starter', productIds: [PROD_B, PROD_C] }],
            competitors: ['Kept as filed'],
        } }],
        users: [{ id: M1, email: E('c_m1'), name: 'Mona Restored', role: 'User' }],
    } };
    const r = await call('backup', WHO.adminC, 'PATCH', FILE);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // B's manager, the id naming nothing, the Clerk-shaped id; B's rep; B's technician twice and B's vehicle; B's product
    assert.ok(r.body.notes.includes(cleared(8)), JSON.stringify(r.body.notes));
    const x = await extraOf(C);
    assert.deepEqual(x.teams, [{ id: ID('c_team'), name: 'C Team', managerId: '', repIds: [M1], color: '#3a5a7a' }, { id: ID('c_west'), name: 'C West', managerId: '', repIds: [] }],
        "the restored member stands; the manager cleared to '' — never null (null === null); a team with no manager as filed, not counted");
    assert.deepEqual(x.territories, [{ id: ID('c_terr'), name: 'C North', ownerId: M1, repIds: [] }]);
    assert.deepEqual(x.dispatchCrews, [{ id: ID('c_crew'), name: 'C Crew', members: [TECH_C], lead: '', defaultVehicle: '' }]);
    assert.deepEqual(x.quoteTemplates, [{ id: ID('c_qt'), name: 'C Starter', productIds: [PROD_C] }]);
    assert.deepEqual(x.competitors, ['Kept as filed'], 'every other key as filed');
});

test("RESTORE: a settings row the org already had is left byte for byte — its held strays too — and nothing of it is counted", async () => {
    const before = await extraText(A);
    const r = await call('backup', WHO.admin, 'PATCH', { entities: { settings: [{ id: 'any', orgId: A, extra: {
        teams: [{ id: ID('x'), name: 'X', managerId: USR.adminB, repIds: [NOTHING] }],
    } }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(!r.body.notes.some((n) => /links? that named no record/.test(n)), JSON.stringify(r.body.notes));
    assert.equal(await extraText(A), before, "A's row byte for byte — org B's rep on East still held");
});

// ── Org B ─────────────────────────────────────────────────────────────────────

test("ISOLATION: org B's settings, members, technicians, vehicles, products and notes are as seeded", async () => {
    assert.deepEqual(await bRows(), bSeeded);
});
