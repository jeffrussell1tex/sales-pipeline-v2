// tests/integration/member-identity.itest.mjs
// A member's save changes a member this org holds — and a Manager's only a
// Sales Rep's (state §0.202, guide §18b95) — against the real test database,
// with the REAL verifyAuth and users handler. Only the Clerk SDK is a stand-in:
// verifyToken reads the claims a test token carries.
//
// Proves: a save never takes the login link (clerkUserId) from the body — an
// Admin's or a Manager's PUT keeps the stored one, and a create stores none; a
// Manager's PUT of an Admin's row, or of a Manager's or Dispatcher's not yet
// joined, is refused before anything is written (it could unlink the Admin,
// move their email, or re-address a row and invite its role to anyone); no save
// links a row not yet joined or sets a status (a status sent as Invited switched
// a deactivated member on at first sign-in); a Manager's invitation to an
// address a member holds only resends a rep's open invitation; a PUT naming no
// member of this org — unknown, or another org's, whatever its role or name —
// answers 404 and creates nothing; the member's own save of a row removed since
// the caller cache read it answers 404 and creates nothing, and one naming an
// address another member holds the 409 (the Admin's save and the create too); a
// non-text id is a 400; a save keeps the stored access unless it is the
// Deactivate / Reactivate request (a whole row sent as loaded switched a member
// back on, or off); a create takes no status; a Manager's invitation of an
// address only another org holds is a new one here; an Admin still edits an
// Admin, a Manager still edits a rep; and the other org's rows are untouched
// throughout.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_mident_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_mident_*' (rows, Clerk ids, emails) — and
// only this file writes to it.
const ORG_A = 'itest_mident_A';
const ORG_B = 'itest_mident_B';
const ORGS = [ORG_A, ORG_B];

// ── The Clerk stand-in ──────────────────────────────────────────────────────
const people = new Map();
const invitations = [];   // every org invitation created
const person = (id, email, first, last) => people.set(id, {
    id, firstName: first, lastName: last, emailAddresses: [{ emailAddress: email }], publicMetadata: {},
});
const clerkClient = {
    users: {
        getUser: async (id) => {
            const u = people.get(id);
            if (!u) { const e = new Error('Not Found'); e.status = 404; throw e; }
            return u;
        },
        getOrganizationMembershipList: async () => ({ data: [] }),
    },
    organizations: {
        getOrganizationMembershipList: async () => ({ data: [] }),
        getOrganizationInvitationList: async () => ({ data: [] }),
        revokeOrganizationInvitation: async () => ({}),
        createOrganizationInvitation: async (args) => { invitations.push(args); return { id: 'orginv_' + invitations.length }; },
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
const { db } = await import('../../db/index.js');
const { users, auditLog } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { eq, and, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ev = (token, method, body, query) => ({
    httpMethod: method,
    headers: { authorization: 'Bearer ' + token },
    queryStringParameters: query || {},
    body: body === undefined ? undefined : JSON.stringify(body),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const rowOf = async (id, org) => (await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, org))))[0];
const rowsWithId = async (id) => db.select().from(users).where(eq(users.id, id));
const orgRows = async (org) => (await db.select().from(users).where(eq(users.orgId, org)))
    .map(({ updatedAt: _u, ...r }) => r).sort((x, y) => x.id.localeCompare(y.id));

// The cast: in A an Admin, a second Admin, a Manager and a rep; in B an Admin
// and a rep. Every row is linked to its own Clerk identity.
const ADMIN_A = 'user_itest_mident_admin_a';
const ADMIN2_A = 'user_itest_mident_admin2_a';
const MANAGER_A = 'user_itest_mident_mgr_a';
const REP_A = 'user_itest_mident_rep_a';
const ADMIN_B = 'user_itest_mident_admin_b';
const REP_B = 'user_itest_mident_rep_b';
// A Clerk identity no row of either org holds: one row per login per org is a
// unique index (users_org_clerk_uq), so naming a member's own login was a 500 —
// naming this one handed the row over.
const STRANGER = 'user_itest_mident_stranger';

const cleanup = async () => {
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
};

let bBefore;
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    person(ADMIN_A, 'admin-a@itest-mident.local', 'Ada', 'Admin');
    person(MANAGER_A, 'mgr-a@itest-mident.local', 'Max', 'Manager');
    await db.insert(users).values([
        { id: 'usr_itest_mident_admin_a', orgId: ORG_A, clerkUserId: ADMIN_A, name: 'Ada Admin', email: 'admin-a@itest-mident.local', role: 'Admin', active: true,
          profile: { status: 'Active', userType: 'Admin', firstName: 'Ada', lastName: 'Admin', phone: '555-0100' } },
        { id: 'usr_itest_mident_admin2_a', orgId: ORG_A, clerkUserId: ADMIN2_A, name: 'Abe Admin', email: 'admin2-a@itest-mident.local', role: 'Admin', active: true,
          profile: { status: 'Active', userType: 'Admin', firstName: 'Abe', lastName: 'Admin' } },
        { id: 'usr_itest_mident_mgr_a', orgId: ORG_A, clerkUserId: MANAGER_A, name: 'Max Manager', email: 'mgr-a@itest-mident.local', role: 'Manager', active: true,
          profile: { status: 'Active', userType: 'Manager', firstName: 'Max', lastName: 'Manager' } },
        { id: 'usr_itest_mident_rep_a', orgId: ORG_A, clerkUserId: REP_A, name: 'Rae Rep', email: 'rep-a@itest-mident.local', role: 'User', active: true,
          profile: { status: 'Active', userType: 'User', firstName: 'Rae', lastName: 'Rep' } },
        { id: 'usr_itest_mident_admin_b', orgId: ORG_B, clerkUserId: ADMIN_B, name: 'Bea Admin', email: 'admin-b@itest-mident.local', role: 'Admin', active: true,
          profile: { status: 'Active', userType: 'Admin', firstName: 'Bea', lastName: 'Admin' } },
        { id: 'usr_itest_mident_rep_b', orgId: ORG_B, clerkUserId: REP_B, name: 'Bo Rep', email: 'rep-b@itest-mident.local', role: 'User', active: true,
          profile: { status: 'Active', userType: 'User', firstName: 'Bo', lastName: 'Rep' } },
        // Not yet joined (no login): a Manager's and a Dispatcher's invitations, a rep's, and two an Admin deactivated.
        { id: 'usr_itest_mident_inv_mgr', orgId: ORG_A, clerkUserId: null, name: 'Ivy Invited', email: 'inv-mgr@itest-mident.local', role: 'Manager', active: false,
          profile: { status: 'Invited', userType: 'Manager' } },
        { id: 'usr_itest_mident_inv_disp', orgId: ORG_A, clerkUserId: null, name: 'Dot Invited', email: 'inv-disp@itest-mident.local', role: 'Dispatcher', active: false,
          profile: { status: 'Invited', userType: 'Dispatcher' } },
        { id: 'usr_itest_mident_inv_rep', orgId: ORG_A, clerkUserId: null, name: 'Ira Invited', email: 'inv-rep@itest-mident.local', role: 'User', active: false,
          profile: { status: 'Invited', userType: 'User' } },
        { id: 'usr_itest_mident_deact_rep', orgId: ORG_A, clerkUserId: null, name: 'Dee Rep', email: 'deact-rep@itest-mident.local', role: 'User', active: false,
          profile: { status: 'Deactivated', userType: 'User' } },
        { id: 'usr_itest_mident_deact_admin', orgId: ORG_A, clerkUserId: null, name: 'Del Admin', email: 'deact-admin@itest-mident.local', role: 'Admin', active: false,
          profile: { status: 'Deactivated', userType: 'Admin' } },
    ]);
    invalidateRoster();
    bBefore = await orgRows(ORG_B);
});

after(async () => { await cleanup(); });

test('a Manager\'s save of an Admin\'s row is refused (403) and writes nothing — not the login link, not the email', async () => {
    const before = await rowOf('usr_itest_mident_admin_a', ORG_A);
    // The steps the map read in code (15 Oct): unlink the Admin, then move their email.
    for (const body of [
        { id: 'usr_itest_mident_admin_a', clerkUserId: STRANGER },
        { id: 'usr_itest_mident_admin_a', clerkUserId: null },
        { id: 'usr_itest_mident_admin_a', email: 'mgr-a-alt@itest-mident.local' },
        { id: 'usr_itest_mident_admin_a', phone: '555-0199' },
    ]) {
        const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', body)));
        assert.equal(r.status, 403, `REGRESSION: a Manager's save of an Admin's row went through (${JSON.stringify(body)})`);
        assert.equal(r.body.error, 'Only an Admin can change a member who is not a Sales Rep.');
    }
    const after = await rowOf('usr_itest_mident_admin_a', ORG_A);
    assert.equal(after.clerkUserId, ADMIN_A, 'the Admin keeps their login');
    assert.equal(after.email, 'admin-a@itest-mident.local', 'and their email');
    assert.equal(after.profile.phone, '555-0100', 'and everything else');
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), 'nothing was written');
});

test('a Manager still saves a rep\'s row and an Admin another Admin\'s — and neither save moves the login link', async () => {
    const rep = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', phone: '555-0111', clerkUserId: STRANGER })));
    assert.equal(rep.status, 200, JSON.stringify(rep.body));
    const repRow = await rowOf('usr_itest_mident_rep_a', ORG_A);
    assert.equal(repRow.profile.phone, '555-0111', 'the change the Manager made is stored');
    assert.equal(repRow.clerkUserId, REP_A, 'REGRESSION: a save handed the rep\'s row to the login the body named');
    assert.equal(rep.body.user.clerkUserId, REP_A, 'and the answer says so');

    const admin = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_admin2_a', phone: '555-0122', clerkUserId: null })));
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
    const adminRow = await rowOf('usr_itest_mident_admin2_a', ORG_A);
    assert.equal(adminRow.profile.phone, '555-0122');
    assert.equal(adminRow.clerkUserId, ADMIN2_A, 'REGRESSION: an Admin\'s save with clerkUserId null unlinked the member — who then reads as a rep');
    assert.equal(adminRow.role, 'Admin', 'the role is the row\'s');
});

test('a save naming no member of this org answers 404 and creates nothing — an unknown id, or another org\'s member', async () => {
    const unknown = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_gone', name: 'Gone Member', email: 'gone@itest-mident.local' })));
    assert.equal(unknown.status, 404, JSON.stringify(unknown.body));
    assert.equal(unknown.body.error, 'That member is not in your organization — they may have been removed. Reload and try again.');
    assert.deepEqual(await rowsWithId('usr_itest_mident_gone'), [], 'REGRESSION: a PUT of an unknown id inserted a member (\'Unnamed User\' before)');

    const bare = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_gone2' })));
    assert.equal(bare.status, 404, 'a Manager\'s too');
    assert.deepEqual(await rowsWithId('usr_itest_mident_gone2'), []);

    const otherOrg = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_b', name: 'Taken Over', clerkUserId: ADMIN_A })));
    assert.equal(otherOrg.status, 404, 'another org\'s member is no member of this org');
    const bRows = await rowsWithId('usr_itest_mident_rep_b');
    assert.equal(bRows.length, 1, 'no copy of it is made in org A');
    assert.equal(bRows[0].orgId, ORG_B);
    assert.equal(bRows[0].name, 'Bo Rep');
});

test('a create stores no login link, whatever the body names — a sign-in by its email links it', async () => {
    // Before: the row was linked to whatever login the body named — that person's
    // first sign-in to the org found it by that link, never by its invitation.
    const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'POST', { name: 'New Hire', email: 'new-hire@itest-mident.local', clerkUserId: STRANGER })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.user.clerkUserId, null);
    const made = await rowOf(r.body.user.id, ORG_A);
    assert.equal(made.clerkUserId, null, 'REGRESSION: a create stored the login link it was sent');
    // A member's own login: a second row for it was a 500 (the unique index); now the row is made, unlinked.
    const twin = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { name: 'Second Seat', email: 'second-seat@itest-mident.local', clerkUserId: ADMIN_A })));
    assert.equal(twin.status, 201, JSON.stringify(twin.body));
    assert.equal((await rowOf(twin.body.user.id, ORG_A)).clerkUserId, null);
    const adminRows = await db.select().from(users).where(and(eq(users.clerkUserId, ADMIN_A), eq(users.orgId, ORG_A)));
    assert.equal(adminRows.length, 1, 'the Admin\'s login names one row in this org — their own');
    assert.equal(adminRows[0].role, 'Admin');
});

test('the member\'s own save of a row removed since the caller cache read it answers 404 and creates nothing', async () => {
    const LEAVER = 'user_itest_mident_leaver';
    await db.insert(users).values({ id: 'usr_itest_mident_leaver', orgId: ORG_A, clerkUserId: LEAVER, name: 'Lee Leaver', email: 'leaver@itest-mident.local', role: 'User', active: true,
        profile: { status: 'Active', userType: 'User', firstName: 'Lee', lastName: 'Leaver' } });
    invalidateRoster(ORG_A);
    // A refused self-save reads the caller — its id is cached (30 s) — and writes nothing.
    const primed = parse(await usersHandler(ev(tokenFor(LEAVER, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', phone: '1' }, { me: 'true' })));
    assert.equal(primed.status, 403, 'not their row');
    // Removed where this instance's cache does not hear of it (another instance's delete).
    await db.delete(users).where(and(eq(users.id, 'usr_itest_mident_leaver'), eq(users.orgId, ORG_A)));
    const r = parse(await usersHandler(ev(tokenFor(LEAVER, ORG_A), 'PUT', { id: 'usr_itest_mident_leaver', digestTime: '09:00' }, { me: 'true' })));
    assert.equal(r.status, 404, JSON.stringify(r.body));
    assert.deepEqual(await rowsWithId('usr_itest_mident_leaver'), [], 'REGRESSION: the self-save inserted the removed member again — as a rep');

    // And a member's own save of their row still works, the link pinned to them.
    const own = parse(await usersHandler(ev(tokenFor(REP_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', digestTime: '07:30', clerkUserId: MANAGER_A }, { me: 'true' })));
    assert.equal(own.status, 200, JSON.stringify(own.body));
    const repRow = await rowOf('usr_itest_mident_rep_a', ORG_A);
    assert.equal(repRow.profile.digestTime, '07:30');
    assert.equal(repRow.clerkUserId, REP_A, 'the self-save pins the caller\'s own link');
});

test('a Manager reaches only a Sales Rep\'s row: a not-yet-joined Manager\'s or Dispatcher\'s is refused (403), its address unchanged', async () => {
    // Before: the address moved, then the Manager's invitation of it gave the row's role to whoever held it.
    for (const id of ['usr_itest_mident_inv_mgr', 'usr_itest_mident_inv_disp']) {
        const before = await rowOf(id, ORG_A);
        const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id, email: 'mgr-alt@itest-mident.local' })));
        assert.equal(r.status, 403, `REGRESSION: a Manager re-addressed a ${before.role}'s row not yet joined`);
        assert.equal(r.body.error, 'Only an Admin can change a member who is not a Sales Rep.');
        const after = await rowOf(id, ORG_A);
        assert.equal(after.email, before.email);
        assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), 'nothing was written');
    }
    const byAdmin = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_inv_mgr', title: 'Regional Manager' })));
    assert.equal(byAdmin.status, 200, 'an Admin may');
});

test('a save never links a row not yet joined: its login link stays empty, whoever saves', async () => {
    const byAdmin = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_inv_mgr', clerkUserId: STRANGER })));
    assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));
    assert.equal((await rowOf('usr_itest_mident_inv_mgr', ORG_A)).clerkUserId, null, 'REGRESSION: an Admin\'s save linked an invited row — and its role — to the login it named');
    const byMgr = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_inv_rep', clerkUserId: STRANGER })));
    assert.equal(byMgr.status, 200, JSON.stringify(byMgr.body));
    assert.equal((await rowOf('usr_itest_mident_inv_rep', ORG_A)).clerkUserId, null, 'REGRESSION: a Manager\'s save linked an invited rep to the login it named');
});

test('a member\'s status is the server\'s: a status sent as Invited never switches a deactivated member back on', async () => {
    const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_deact_rep', status: 'Invited', phone: '555-0133' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let row = await rowOf('usr_itest_mident_deact_rep', ORG_A);
    assert.equal(row.profile.phone, '555-0133', 'the change the Manager made is stored');
    assert.equal(row.profile.status, 'Deactivated', 'REGRESSION: a save set the status — the first sign-in would switch the member back on');
    assert.equal(row.active, false);
    const byAdmin = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_deact_rep', status: 'Active' })));
    assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));
    row = await rowOf('usr_itest_mident_deact_rep', ORG_A);
    assert.equal(row.profile.status, 'Deactivated', 'an Admin\'s save neither — Reactivate is the way');
    assert.equal(row.active, false);
    // And their first sign-in still finds them off.
    const LATE = 'user_itest_mident_deact_rep';
    person(LATE, 'deact-rep@itest-mident.local', 'Dee', 'Rep');
    const me = parse(await usersHandler(ev(tokenFor(LATE, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(me.status, 403, JSON.stringify(me.body));
    assert.equal(me.body.code, 'deactivated');
});

test('a Manager\'s invitation to an address a member holds only resends a Sales Rep\'s open invitation — anything else is refused before Clerk is called', async () => {
    const invite = (token, email) => usersHandler(ev(token, 'POST', { action: 'invite', invites: [{ email, role: 'User' }] }));
    const sentBefore = invitations.length;
    for (const [email, who] of [
        ['deact-admin@itest-mident.local', 'an Admin deactivated before joining'],
        ['inv-mgr@itest-mident.local', 'a Manager not yet joined'],
        ['rep-a@itest-mident.local', 'a rep who has joined'],
    ]) {
        const r = parse(await invite(tokenFor(MANAGER_A, ORG_A), email));
        assert.equal(r.status, 400, `REGRESSION: a Manager re-invited ${who}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.errors[0].error, 'Only an Admin can invite an address a member of this organization already holds. A Manager can only resend a Sales Rep\'s open invitation.');
    }
    assert.equal(invitations.length, sentBefore, 'Clerk was never asked');
    const deact = await rowOf('usr_itest_mident_deact_admin', ORG_A);
    assert.equal(deact.profile.status, 'Deactivated', 'REGRESSION: the re-invitation marked the deactivated Admin Invited — their first sign-in would switch them on, as an Admin');
    assert.equal(deact.active, false);

    const resend = parse(await invite(tokenFor(MANAGER_A, ORG_A), 'inv-rep@itest-mident.local'));
    assert.equal(resend.status, 201, 'a Sales Rep\'s open invitation is resent: ' + JSON.stringify(resend.body));
    assert.equal(invitations.length, sentBefore + 1);
    assert.equal(invitations.at(-1).emailAddress, 'inv-rep@itest-mident.local');
    const byAdmin = parse(await invite(tokenFor(ADMIN_A, ORG_A), 'deact-admin@itest-mident.local'));
    assert.equal(byAdmin.status, 201, 'an Admin re-invites as before — reactivating is an Admin\'s: ' + JSON.stringify(byAdmin.body));
});

test('another org\'s member is no member of this org, whatever its role or name: 404 — never a 403 or a 409 that says what it is there', async () => {
    const admin = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_admin_b', phone: '1' })));
    assert.equal(admin.status, 404, 'REGRESSION: a Manager naming another org\'s Admin was told it is an Admin there: ' + JSON.stringify(admin.body));
    const named = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_b', name: 'Rae Rep' })));
    assert.equal(named.status, 404, 'REGRESSION: another org\'s id with a name this org holds answered NAME_TAKEN: ' + JSON.stringify(named.body));
});

test('a member\'s own save with an address another member holds is the 409 every save gives, not a 500', async () => {
    const r = parse(await usersHandler(ev(tokenFor(REP_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', email: 'mgr-a@itest-mident.local' }, { me: 'true' })));
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.field, 'email');
    assert.equal((await rowOf('usr_itest_mident_rep_a', ORG_A)).email, 'rep-a@itest-mident.local');
});

test('a PUT naming an id that is not text is refused (400) and writes nothing', async () => {
    for (const id of [['usr_itest_mident_rep_a'], { id: 'usr_itest_mident_rep_a' }, 42]) {
        const r = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id, phone: '000' })));
        assert.equal(r.status, 400, JSON.stringify(r.body));
    }
    assert.notEqual((await rowOf('usr_itest_mident_rep_a', ORG_A)).profile.phone, '000');
});

test('a Manager never changes access: a Sales Rep\'s Deactivate from a Manager is refused by the access branch (403), the row unchanged', async () => {
    const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', active: false })));
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.error, 'Only an Admin can deactivate or reactivate a member.');
    assert.equal((await rowOf('usr_itest_mident_rep_a', ORG_A)).active, true);
});

test('access is true or false: a value Postgres reads as false never slips past the access branch — not a Manager\'s, not an Admin\'s own (400)', async () => {
    for (const active of ['false', 0, 'off']) {
        const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', active })));
        assert.equal(r.status, 400, `REGRESSION: a Manager's active ${JSON.stringify(active)}: ${JSON.stringify(r.body)}`);
    }
    assert.equal((await rowOf('usr_itest_mident_rep_a', ORG_A)).active, true, 'REGRESSION: a Manager switched a rep off');
    const self = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_admin_a', active: 0 })));
    assert.equal(self.status, 400, JSON.stringify(self.body));
    assert.equal((await rowOf('usr_itest_mident_admin_a', ORG_A)).active, true, 'REGRESSION: an Admin locked themselves out');
});

test('a save keeps the stored access unless it is the Deactivate / Reactivate request: a whole row sent with active as loaded changes nothing', async () => {
    // A member deactivated since the screen loaded, saved with active: true as loaded — by an Admin (it switched them
    // back on) and by a Manager (it was a 403 "only an Admin can deactivate or reactivate", the quota lost).
    const byAdmin = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_deact_rep', active: true, quota: 5000, phone: '555-0144' })));
    assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.body));
    let row = await rowOf('usr_itest_mident_deact_rep', ORG_A);
    assert.equal(Number(row.quota), 5000, 'the change the Admin made is stored');
    assert.equal(row.active, false, 'REGRESSION: an Admin\'s save with active as loaded switched a deactivated member back on');
    assert.equal(row.profile.status, 'Deactivated');
    const byMgr = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { id: 'usr_itest_mident_deact_rep', active: true, quota: 6000 })));
    assert.equal(byMgr.status, 200, 'REGRESSION: a Manager\'s quota save was refused as an access change: ' + JSON.stringify(byMgr.body));
    row = await rowOf('usr_itest_mident_deact_rep', ORG_A);
    assert.equal(Number(row.quota), 6000);
    assert.equal(row.active, false);
    // A member who joined since, saved with active: false as loaded.
    const joined = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', active: false, title: 'Senior Rep' })));
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    row = await rowOf('usr_itest_mident_rep_a', ORG_A);
    assert.equal(row.profile.title, 'Senior Rep');
    assert.equal(row.active, true, 'REGRESSION: an Admin\'s save with active as loaded deactivated a member who had joined since');
    assert.notEqual(row.profile.status, 'Deactivated');
});

test('a create takes no status or access: a Manager cannot add someone already off — their first sign-in finds them on', async () => {
    const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'POST', { name: 'Pre Off', email: 'pre-off@itest-mident.local', status: 'Deactivated' })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await rowOf(r.body.user.id, ORG_A)).profile.status, null, 'REGRESSION: a create stored the status it was sent');
    // Off by `active`: an Admin's Clerk sync links by email and leaves it, so the member was kept out.
    const off = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'POST', { name: 'Also Off', email: 'also-off@itest-mident.local', active: false })));
    assert.equal(off.status, 201, JSON.stringify(off.body));
    assert.equal((await rowOf(off.body.user.id, ORG_A)).active, true, 'REGRESSION: a create stored the access it was sent');
    const PRE = 'user_itest_mident_preoff';
    person(PRE, 'pre-off@itest-mident.local', 'Pre', 'Off');
    const me = parse(await usersHandler(ev(tokenFor(PRE, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(me.status, 200, 'REGRESSION: the first sign-in found the member deactivated by a Manager\'s create: ' + JSON.stringify(me.body));
    assert.equal(me.body.user.id, r.body.user.id);
});

test('a Manager\'s invitation of an address only another org holds is a new invitation here — the other org\'s member is never named', async () => {
    const sentBefore = invitations.length;
    const r = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'POST', { action: 'invite', invites: [{ email: 'rep-b@itest-mident.local', role: 'User' }] })));
    assert.equal(r.status, 201, 'REGRESSION: refused for a member of another org: ' + JSON.stringify(r.body));
    assert.equal(invitations.length, sentBefore + 1);
    const here = await db.select().from(users).where(and(eq(users.email, 'rep-b@itest-mident.local'), eq(users.orgId, ORG_A)));
    assert.equal(here.length, 1, 'a row of this org, its own');
    assert.equal(here[0].role, 'User');
});

test('an address another member holds is the 409, field email, from the Admin\'s save and the create — read off the real driver\'s error', async () => {
    const put = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { id: 'usr_itest_mident_rep_a', email: 'mgr-a@itest-mident.local' })));
    assert.equal(put.status, 409, JSON.stringify(put.body));
    assert.equal(put.body.field, 'email');
    assert.equal((await rowOf('usr_itest_mident_rep_a', ORG_A)).email, 'rep-a@itest-mident.local');
    const create = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { name: 'Dup Email', email: 'mgr-a@itest-mident.local' })));
    assert.equal(create.status, 409, JSON.stringify(create.body));
    assert.equal(create.body.field, 'email');
});

test('org B is untouched: every row as it was seeded', async () => {
    assert.deepEqual(await orgRows(ORG_B), bBefore, 'REGRESSION: a save in org A changed a row of org B');
});
