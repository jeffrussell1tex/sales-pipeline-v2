// tests/integration/member-names.itest.mjs
// One name per member of an org (state §0.196 — batch B of the PROD Closed Lost fix;
// Jeff, 9 Oct: "Number it", "Yes, Full name wins") — against the real test database,
// with the REAL verifyAuth and the real users, users-sync and backup handlers. Only the
// Clerk SDK is a stand-in (invitations.itest.mjs's shape), and it records every
// invitation it is asked to send. Proves:
//   EXEMPT    a pair made before the rule stays editable: a save that keeps its own row's
//             name is let through (and trimmed); a respace onto the other is refused; a
//             rename apart is saved
//   REFUSED   where a person types the name — the Admin's and the Manager's PUT, the
//             create, a member's own First/Last — a name another member holds (any case,
//             any spacing; an invited or a deactivated member's too) is a 409
//             { error, field: 'name', code: 'NAME_TAKEN' } that names no address, and
//             nothing is written
//   FULL NAME an edited Full name with First/Last cleared is stored (the screen's half of
//             "Full name wins"); a bare name over a stored First/Last is not (recorded)
//   INVITE    a given name taken is refused before Clerk is called; none given, the
//             address's front part, numbered "sam (2)"; two of one name in one batch;
//             a re-invite keeps its row
//   NUMBERED  where nobody can be asked: a first sign-in ("Ada Admin (2)"; no Clerk name
//             keeps the address), the sync (dry run and real, two of one name in one
//             run), the restore (said once the row has landed; First/Last that would
//             rebuild the taken name cleared, so the member's next save is not refused;
//             a row the insert skips for another org's id excuses no later row of its
//             address; a blank address is not restored, and is an error; a member with
//             no name in the file is named by their address, said on its own line)
//   ISOLATION every check is this org's: org B's members of the same names never block
//             org A, org A's never block B, and none of B's rows changes
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_names_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_names_*' (rows, Clerk ids, emails) — and only
// this file writes to it.
const ORG_A = 'itest_names_A';
const ORG_B = 'itest_names_B';
const ORGS = [ORG_A, ORG_B];

// ── The Clerk stand-in ──────────────────────────────────────────────────────
const people = new Map();
const person = (id, email, first, last) => people.set(id, {
    id, firstName: first, lastName: last, emailAddresses: [{ emailAddress: email }], publicMetadata: {},
});
const membersOf = new Map();     // org id → the clerk ids the sync lists
const invitations = [];          // every invitation Clerk was asked to send, each in ONE org
let serialInv = 0;

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
        getOrganizationInvitationList: async ({ organizationId, status }) => ({
            data: invitations.filter((i) => i.organizationId === organizationId && (!status || status.includes(i.status))),
        }),
        revokeOrganizationInvitation: async ({ organizationId, invitationId }) => {
            const inv = invitations.find((i) => i.id === invitationId && i.organizationId === organizationId);
            if (!inv) { const e = new Error('Not Found'); e.status = 404; throw e; }
            inv.status = 'revoked';
            return inv;
        },
        createOrganizationInvitation: async (args) => {
            serialInv += 1;
            const inv = { id: 'orginv_itest_names_' + serialInv, organizationId: args.organizationId, emailAddress: args.emailAddress, role: args.role, status: 'pending' };
            invitations.push(inv);
            return inv;
        },
    },
};

// A test token is JWT-shaped — header.payload.sig, base64url JSON — because
// verifyAuth's cache decodes the payload's exp before it trusts a cached answer.
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
const { handler: syncHandler } = await import('../../netlify/functions/users-sync.mjs');
const { handler: backupHandler } = await import('../../netlify/functions/backup.mjs');
const { invalidateRoster, ensureRosterRow } = await import('../../netlify/functions/_lib.mjs');
const { db } = await import('../../db/index.js');
const { users, auditLog, backups } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ev = (token, method, body, query) => ({
    httpMethod: method,
    headers: { authorization: 'Bearer ' + token },
    queryStringParameters: query || {},
    body: body === undefined ? undefined : JSON.stringify(body),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const E = (local) => `${local}@itest-names.local`;
const rowOf = async (id, org) => (await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, org))))[0];
const byEmail = async (email, org = ORG_A) => (await db.select().from(users).where(and(eq(users.email, email), eq(users.orgId, org))))[0];
const byClerk = async (clerkUserId, org = ORG_A) => (await db.select().from(users).where(and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, org))))[0];
const rowsOf = async (org) => db.select().from(users).where(eq(users.orgId, org));

// The cast.
const ADMIN_A = 'user_itest_names_admin_a';
const MANAGER_A = 'user_itest_names_mgr_a';
const REP_A = 'user_itest_names_rep_a';
const ADMIN_B = 'user_itest_names_admin_b';
const ID = (k) => `usr_itest_names_${k}`;
const as = (clerk, org = ORG_A) => tokenFor(clerk, org);
const put = (clerk, body, org = ORG_A) => usersHandler(ev(as(clerk, org), 'PUT', body));
const putMe = (clerk, body, org = ORG_A) => usersHandler(ev(as(clerk, org), 'PUT', body, { me: 'true' }));
const create = (clerk, body, org = ORG_A) => usersHandler(ev(as(clerk, org), 'POST', body));
const refused = (r, what) => {
    assert.equal(r.status, 409, `${what}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.code, 'NAME_TAKEN', what);
    assert.equal(r.body.field, 'name', what);
    assert.match(r.body.error, /already named/, what);
    assert.ok(!r.body.error.includes('@'), `${what}: the words carry no address — a rep reads them`);
};

const member = (key, org, name, extra = {}) => ({
    id: ID(key), orgId: org, clerkUserId: null, name, email: E(key), role: 'User', active: true, profile: { status: 'Active' }, ...extra,
});
// Org B holds, once each, the names org A takes below: none of them may block A.
const B_NAMES = ['Brand New', 'Lee Ann', 'Fresh Face', 'Sync New', 'Rest Ored', 'Rae Renamed', 'Ivo Isolated'];

const cleanup = async () => {
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
    await db.delete(backups).where(inArray(backups.orgId, ORGS));
};

let bBefore;
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    person(ADMIN_A, E('admin-a'), 'Ada', 'Admin');
    person(MANAGER_A, E('mgr-a'), 'Max', 'Manager');
    person(REP_A, E('rep-a'), 'Rae', 'Rep');
    person(ADMIN_B, E('admin-b'), 'Bea', 'Admin');
    await db.insert(users).values([
        member('admin_a', ORG_A, 'Ada Admin', { clerkUserId: ADMIN_A, email: E('admin-a'), role: 'Admin' }),
        member('mgr_a', ORG_A, 'Max Manager', { clerkUserId: MANAGER_A, email: E('mgr-a'), role: 'Manager' }),
        member('rep_a', ORG_A, 'Rae Rep', { clerkUserId: REP_A, email: E('rep-a'), profile: { status: 'Active', firstName: 'Rae', lastName: 'Rep' } }),
        // A pair made before the rule — the prod shape (§0.193): the same name to the resolver.
        member('twin1', ORG_A, 'Twin Name'),
        member('twin2', ORG_A, 'Twin Name   '),
        // The same name to the rule, two names to the resolver.
        member('pat1', ORG_A, 'Pat Smith'),
        member('pat2', ORG_A, 'Pat  Smith'),
        member('dee', ORG_A, 'Dee First', { profile: { status: 'Active', firstName: 'Dee', lastName: 'First' } }),
        member('eve', ORG_A, 'Eve Last', { profile: { status: 'Active', firstName: 'Eve', lastName: 'Last' } }),
        member('sam', ORG_A, 'Sam', { email: 'sam@elsewhere-names.local' }),
        // Every row of the org counts: an invitation not yet accepted, a deactivated member.
        member('ivy', ORG_A, 'Ivy Invited', { active: false, profile: { status: 'Invited' } }),
        member('dan', ORG_A, 'Dan Gone', { active: false, profile: { status: 'Deactivated' } }),
        member('admin_b', ORG_B, 'Bea Admin', { clerkUserId: ADMIN_B, email: E('admin-b'), role: 'Admin' }),
        ...B_NAMES.map((n, i) => member(`b_${i}`, ORG_B, n)),
    ]);
    invalidateRoster();
    bBefore = (await rowsOf(ORG_B)).map((r) => [r.id, r.name, r.email]).sort();
});

after(cleanup);

test('EXEMPT: a pair made before the rule stays editable — a save that keeps its own name is let through and trimmed; a respace onto the other is refused; a rename apart is saved', async () => {
    const keep = parse(await put(ADMIN_A, { id: ID('twin2'), quota: 5 }));
    assert.equal(keep.status, 200, JSON.stringify(keep.body));
    assert.equal((await rowOf(ID('twin2'), ORG_A)).name, 'Twin Name', 'its own name, kept — and trimmed on write');
    assert.equal(Number((await rowOf(ID('twin2'), ORG_A)).quota), 5);
    const other = parse(await put(ADMIN_A, { id: ID('twin1'), title: 'AE' }));
    assert.equal(other.status, 200, 'and the other of the pair too');

    refused(parse(await put(ADMIN_A, { id: ID('twin2'), name: 'Twin  Name' })), 'a respaced name is another name to the resolver');
    assert.equal((await rowOf(ID('twin2'), ORG_A)).name, 'Twin Name', 'unchanged');
    refused(parse(await put(ADMIN_A, { id: ID('pat2'), name: 'pat smith' })), "q may not take p's name by respacing its own");
    assert.equal((await rowOf(ID('pat2'), ORG_A)).name, 'Pat  Smith', 'unchanged');

    const apart = parse(await put(ADMIN_A, { id: ID('twin2'), name: 'Twin Two' }));
    assert.equal(apart.status, 200, JSON.stringify(apart.body));
    assert.equal((await rowOf(ID('twin2'), ORG_A)).name, 'Twin Two', 'renamed apart');
});

test('REFUSED: the Admin\'s and the Manager\'s PUT and the create — a name another member holds, in any case or spacing, an invited or deactivated member\'s too — nothing written', async () => {
    for (const who of [ADMIN_A, MANAGER_A]) {
        refused(parse(await put(who, { id: ID('pat1'), name: ' ada  ADMIN ' })), `PUT as ${who}`);
        assert.equal((await rowOf(ID('pat1'), ORG_A)).name, 'Pat Smith', 'nothing written');
    }
    refused(parse(await create(ADMIN_A, { firstName: 'Max', lastName: 'MANAGER', email: E('max2'), userType: 'User' })), 'a create spelled from First/Last');
    assert.equal(await byEmail(E('max2')), undefined, 'no row');
    refused(parse(await create(ADMIN_A, { name: 'ivy invited', email: E('ivy2'), userType: 'User' })), 'an invitation not yet accepted holds its name');
    refused(parse(await create(MANAGER_A, { name: 'DAN GONE', email: E('dan2'), userType: 'User' })), 'a deactivated member holds theirs');
    assert.equal(await byEmail(E('ivy2')), undefined);
    assert.equal(await byEmail(E('dan2')), undefined);

    const made = parse(await create(ADMIN_A, { name: '  Brand New  ', email: E('brand'), userType: 'User' }));
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.user.name, 'Brand New', 'trimmed on write — and org B\'s "Brand New" does not block it');
    refused(parse(await create(ADMIN_A, { name: 'brand  new', email: E('brand2'), userType: 'User' })), 'the row just made counts at once — read fresh, never through the roster cache');
});

test('FULL NAME: an edited Full name with First/Last cleared is stored; a bare name over a stored First/Last is not (the screen clears them)', async () => {
    const named = parse(await put(ADMIN_A, { id: ID('dee'), name: 'Dee Named', firstName: null, lastName: null }));
    assert.equal(named.status, 200, JSON.stringify(named.body));
    const dee = await rowOf(ID('dee'), ORG_A);
    assert.equal(dee.name, 'Dee Named');
    assert.deepEqual([dee.profile.firstName ?? null, dee.profile.lastName ?? null], [null, null]);
    refused(parse(await put(ADMIN_A, { id: ID('dee'), name: 'Max Manager', firstName: null, lastName: null })), 'an edited Full name is checked like any other');

    const bare = parse(await put(ADMIN_A, { id: ID('eve'), name: 'Eve Other' }));
    assert.equal(bare.status, 200);
    assert.equal((await rowOf(ID('eve'), ORG_A)).name, 'Eve Last', 'the server builds the name from First/Last first — "Full name wins" is the screen\'s (recorded)');
});

test('SELF: a member\'s own First/Last that spell another member\'s name are refused; a name only another org has is saved; a save that keeps the name is let through', async () => {
    refused(parse(await putMe(REP_A, { id: ID('rep_a'), firstName: 'Max ', lastName: ' MANAGER' })), 'the profile panel\'s Save Profile');
    const kept = await rowOf(ID('rep_a'), ORG_A);
    assert.equal(kept.name, 'Rae Rep', 'nothing written');
    assert.equal(kept.profile.firstName, 'Rae');

    const renamed = parse(await putMe(REP_A, { id: ID('rep_a'), firstName: 'Rae', lastName: 'Renamed' }));
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.user.name, 'Rae Renamed', 'org B\'s "Rae Renamed" does not block it — and the answer carries the stored row the panel adopts');
    const toggle = parse(await putMe(REP_A, { id: ID('rep_a'), timezone: 'America/Chicago' }));
    assert.equal(toggle.status, 200, 'a preference toggle keeps the name');
    assert.equal((await rowOf(ID('rep_a'), ORG_A)).name, 'Rae Renamed');
});

test('INVITE: a given name taken is refused before Clerk is called; none given, the address\'s front part, numbered; two of one name in one batch; a re-invite keeps its row', async () => {
    const r = parse(await create(ADMIN_A, { action: 'invite', invites: [
        { email: E('pat3'), name: 'PAT  SMITH', role: 'User' },
        { email: E('lee1'), name: 'Lee Ann', role: 'User' },
        { email: E('lee2'), name: 'lee  ann', role: 'User' },
        { email: E('sam'), role: 'User' },
    ] }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.errors.map((e) => e.email).sort(), [E('lee2'), E('pat3')]);
    for (const e of r.body.errors) assert.match(e.error, /already named/);
    assert.ok(!invitations.some((i) => i.emailAddress === E('pat3') || i.emailAddress === E('lee2')), 'REGRESSION: a refused row reached Clerk — an invitation was sent for it');
    assert.equal(await byEmail(E('pat3')), undefined);
    assert.equal(await byEmail(E('lee2')), undefined);
    assert.equal((await byEmail(E('lee1'))).name, 'Lee Ann', 'org B\'s "Lee Ann" does not block it');
    assert.equal((await byEmail(E('sam'))).name, 'sam (2)', 'none given: the front part, numbered — nobody can be asked');

    const again = parse(await create(ADMIN_A, { action: 'invite', invites: [{ email: E('lee1'), name: 'Lee Ann', role: 'User' }] }));
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.deepEqual(again.body.errors, [], 'a re-invite keeps its row: its own name is not refused');
    assert.equal((await byEmail(E('lee1'))).name, 'Lee Ann');
});

test('FIRST SIGN-IN: a member whose Clerk name a member here has gets it numbered; a name only another org has is kept; no Clerk name keeps the address', async () => {
    const ADA2 = 'user_itest_names_ada2';
    person(ADA2, E('ada-two'), 'Ada', 'Admin');
    const me = parse(await usersHandler(ev(as(ADA2), 'GET', undefined, { me: 'true' })));
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.user.name, 'Ada Admin (2)', 'REGRESSION: two members of one name — every assignment by it a 409');
    assert.equal((await rowOf(ID('admin_a'), ORG_A)).name, 'Ada Admin', 'the member who had it keeps it');

    const FRESH = 'user_itest_names_fresh';
    person(FRESH, E('fresh'), 'Fresh', 'Face');
    const fresh = parse(await usersHandler(ev(as(FRESH), 'GET', undefined, { me: 'true' })));
    assert.equal(fresh.body.user.name, 'Fresh Face', 'org B\'s "Fresh Face" does not count here');

    const plain = await ensureRosterRow({ clerkUserId: 'user_itest_names_plain', orgId: ORG_A, clerkUser: { emailAddresses: [{ emailAddress: E('plain') }] } });
    assert.equal(plain.name, E('plain'), 'no name in Clerk: the address is the name (OPEN_ITEMS: its front part is its own item)');
});

test('SYNC: a new member whose name a member here has is numbered, in the dry run and the real one — two of one name in one run each get their own', async () => {
    const SYNC1 = 'user_itest_names_sync1', SYNC2 = 'user_itest_names_sync2', SYNC3 = 'user_itest_names_sync3';
    person(SYNC1, E('sync1'), 'Pat', 'Smith');
    person(SYNC2, E('sync2'), 'Pat', 'Smith');
    person(SYNC3, E('sync3'), 'Sync', 'New');
    membersOf.set(ORG_A, [ADMIN_A, MANAGER_A, REP_A, SYNC1, SYNC2, SYNC3]);
    const dry = parse(await syncHandler(ev(as(ADMIN_A), 'POST', {}, { check: 'true' })));
    assert.equal(dry.status, 200, JSON.stringify(dry.body));
    assert.deepEqual(dry.body.created.map((c) => c.name), ['Pat Smith (2)', 'Pat Smith (3)', 'Sync New'], 'the dry run says the names the sync would write');
    assert.equal(await byClerk(SYNC1), undefined, 'a dry run writes nothing');

    const real = parse(await syncHandler(ev(as(ADMIN_A), 'POST', {})));
    assert.equal(real.status, 200, JSON.stringify(real.body));
    assert.equal((await byClerk(SYNC1)).name, 'Pat Smith (2)');
    assert.equal((await byClerk(SYNC2)).name, 'Pat Smith (3)', 'REGRESSION: two new members of one name in one run both kept it');
    assert.equal((await byClerk(SYNC3)).name, 'Sync New', 'org B\'s "Sync New" does not count here');
    assert.equal((await rowOf(ID('pat1'), ORG_A)).name, 'Pat Smith', 'an existing row is never renamed by the sync');
});

test('RESTORE: a member the file brings under a taken name is restored numbered, said once its row has landed; a row whose id another org holds is kept out — counted only among the records already here (§0.205) — and excuses no later row of its address; a blank address is not restored and is an error; a member with no name is said on its own line; the member\'s next save is not refused', async () => {
    const r = parse(await backupHandler(ev(as(ADMIN_A), 'PATCH', { entities: { users: [
        { id: ID('restored'), email: E('restored'), name: 'Max Manager', role: 'User', active: true, profile: { status: 'Active', firstName: 'Max', lastName: 'Manager', title: 'AE' } },
        { id: ID('admin_b'), email: E('elsewhere'), name: 'Max Manager', role: 'User', active: true, profile: { status: 'Active' } },
        { id: ID('after_phantom'), email: E('elsewhere'), name: 'Max Manager', role: 'User', active: true, profile: { status: 'Active' } },
        { id: ID('blankmail'), email: '', name: 'Max Manager', role: 'User', active: true, profile: { status: 'Active' } },
        { id: ID('noname'), email: E('noname'), name: '', role: 'User', active: true, profile: { status: 'Active' } },
        { id: ID('rest'), email: E('rest'), name: 'Rest Ored', role: 'User', active: true, profile: { status: 'Active' } },
    ] } })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.errors, ['users: 1 member row was not restored — the file gives no usable id or email address: "Max Manager"'],
        'a rename is not an error; a row kept out is');
    const restored = await rowOf(ID('restored'), ORG_A);
    assert.equal(restored.name, 'Max Manager (2)');
    assert.deepEqual([restored.profile.firstName ?? null, restored.profile.lastName ?? null, restored.profile.title], [null, null, 'AE'],
        'REGRESSION: First/Last that rebuild the taken name are kept — the member\'s next save is refused for good');
    assert.equal(await rowOf(ID('blankmail'), ORG_A), undefined, 'REGRESSION: an empty address inserts — under a name a member here has');
    assert.equal(await byEmail(''), undefined);
    assert.equal((await byEmail(E('elsewhere'))).id, ID('after_phantom'));
    assert.equal((await byEmail(E('elsewhere'))).name, 'Max Manager (4)',
        'REGRESSION: the row whose id org B holds excused a later row of its address — which landed as "Max Manager", a pair');
    assert.equal((await rowOf(ID('noname'), ORG_A)).name, E('noname'), 'no name in the file: the address');
    // The row whose id org B holds is said as already here — last, after the renamed members, as a count that never
    // names the org holding it (state §0.205 — Jeff, 16 Oct: "Fix both").
    assert.deepEqual(r.body.notes, [
        '2 members were restored under another name — a member of this workspace already has theirs: "Max Manager" as "Max Manager (2)", "Max Manager" as "Max Manager (4)".',
        `1 member was restored with no name in the file — named by their address: "${E('noname')}".`,
        '1 record in the file was already here — a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and was left as it is.',
    ]);
    assert.ok(!r.body.notes[0].includes('(3)'), 'the row whose id org B holds never landed — its only mention the "already here" count');
    assert.equal((await rowOf(ID('rest'), ORG_A)).name, 'Rest Ored', 'org B\'s "Rest Ored" does not count here');
    const bRow = await rowOf(ID('admin_b'), ORG_B);
    assert.deepEqual([bRow.name, bRow.email], ['Bea Admin', E('admin-b')], 'org B\'s row is untouched');
    assert.equal(await rowOf(ID('admin_b'), ORG_A), undefined, 'and was never written here');
    const keyOf = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().toLowerCase();   // memberName.js nameKey
    const inA = await rowsOf(ORG_A);
    for (const id of [ID('restored'), ID('after_phantom'), ID('noname'), ID('rest')]) {
        const mine = keyOf(inA.find((u) => u.id === id).name);
        assert.equal(inA.filter((u) => keyOf(u.name) === mine).length, 1, `${id}: no other member of the org has its name`);
    }
    const next = parse(await put(ADMIN_A, { id: ID('restored'), quota: 10 }));
    assert.equal(next.status, 200, JSON.stringify(next.body));
});

test('ISOLATION: org A\'s names never block org B, org B\'s never block A, and none of B\'s rows changed', async () => {
    const a = parse(await put(ADMIN_A, { id: ID('pat2'), name: 'Ivo Isolated' }));
    assert.equal(a.status, 200, 'B\'s "Ivo Isolated" does not block A');
    const b = parse(await put(ADMIN_B, { id: ID('admin_b'), name: 'Ada Admin' }, ORG_B));
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal((await rowOf(ID('admin_b'), ORG_B)).name, 'Ada Admin', 'A\'s "Ada Admin" does not block B');
    const bNow = (await rowsOf(ORG_B)).map((r) => [r.id, r.name, r.email]).sort();
    assert.deepEqual(bNow, bBefore.map(([id, name, email]) => [id, id === ID('admin_b') ? 'Ada Admin' : name, email]),
        'every other row of B as seeded: no write in A touched one');
});
