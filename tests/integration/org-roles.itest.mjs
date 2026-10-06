// tests/integration/org-roles.itest.mjs
// A role is PER ORG (state §0.163, guide §18b56) — the role on a person's row in
// that org's roster — against the real test database, with the REAL verifyAuth
// and the real users, user-role and users-sync handlers. Only the Clerk SDK is a
// stand-in: verifyToken reads the claims a test token carries, and the client
// answers the reads those handlers make and RECORDS any write, so the suite can
// say no role is written to Clerk at all.
//
// Proves: the same Clerk identity is an Admin in one org and a rep in another,
// whatever Clerk's user-level role says; a member with no row is a rep, and that
// answer is not cached past the link; the org role in the token is handed on;
// user-role changes one org's row and writes nothing to Clerk, invited rows
// included; the first-load link carries an invited row's role by EMAIL, never by
// name alone; a new org's first sign-in by its Clerk admin is its first Admin,
// once; a Manager cannot invite or create anyone above a rep; a create naming an
// existing row cannot change its role; and the sync neither reads nor writes a
// role.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_orgrole_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_orgrole_*' (rows, Clerk ids, emails) — and
// only this file writes to it. 'itest_roles_*' is roles-crm.itest.mjs's: sharing it,
// the two suites deleted each other's rows when the full run put them side by side.
const ORG_A = 'itest_orgrole_A';
const ORG_B = 'itest_orgrole_B';
const ORG_C = 'itest_orgrole_C';   // a fresh org: no rows at all
const ORG_D = 'itest_orgrole_D';   // a fresh org for a member whose Clerk user-level role is Admin
const ORGS = [ORG_A, ORG_B, ORG_C, ORG_D];

// ── The Clerk stand-in ──────────────────────────────────────────────────────
// people: clerk id → the user record getUser answers (publicMetadata.role is
// deliberately 'Admin' for the multi-org person, to prove nothing reads it).
const people = new Map();
const person = (id, email, first, last, meta = {}) => people.set(id, {
    id, firstName: first, lastName: last, emailAddresses: [{ emailAddress: email }], publicMetadata: meta,
});
// orgsOf: clerk id → the org ids they are a member of.
const orgsOf = new Map();
// membersOf: org id → the clerk ids the sync lists.
const membersOf = new Map();
const clerkWrites = [];   // every write call, by name
const invitations = [];   // every org invitation created

const clerkClient = {
    users: {
        getUser: async (id) => {
            const u = people.get(id);
            if (!u) { const e = new Error('Not Found'); e.status = 404; throw e; }
            return u;
        },
        getOrganizationMembershipList: async ({ userId }) => ({
            data: (orgsOf.get(userId) || []).map((orgId) => ({ organization: { id: orgId } })),
        }),
        updateUser: async (...a) => { clerkWrites.push(['users.updateUser', a]); return {}; },
        updateUserMetadata: async (...a) => { clerkWrites.push(['users.updateUserMetadata', a]); return {}; },
    },
    organizations: {
        getOrganizationMembershipList: async ({ organizationId, offset = 0 }) => ({
            data: offset ? [] : (membersOf.get(organizationId) || []).map((uid) => ({ id: 'mem_' + uid, role: 'org:member', publicUserData: { userId: uid } })),
        }),
        getOrganizationInvitationList: async () => ({ data: [] }),
        revokeOrganizationInvitation: async (...a) => { clerkWrites.push(['organizations.revokeOrganizationInvitation', a]); return {}; },
        createOrganizationInvitation: async (args) => { invitations.push(args); return { id: 'orginv_' + invitations.length }; },
        updateOrganizationMembership: async (...a) => { clerkWrites.push(['organizations.updateOrganizationMembership', a]); return {}; },
        updateOrganizationMembershipMetadata: async (...a) => { clerkWrites.push(['organizations.updateOrganizationMembershipMetadata', a]); return {}; },
    },
};

// A test token is JWT-shaped — header.payload.sig, base64url JSON — because
// verifyAuth's cache decodes the payload's exp before it trusts a cached answer.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let serial = 0;
const tokenFor = (sub, orgId, rol = 'member', extra = {}) =>
    `${b64({ alg: 'none' })}.${b64({ sub, o: { id: orgId, rol }, sts: 'active', exp: Math.floor(Date.now() / 1000) + 3600, n: ++serial, ...extra })}.sig`;
const v1TokenFor = (sub, orgId, orgRole) =>
    `${b64({ alg: 'none' })}.${b64({ sub, org_id: orgId, org_role: orgRole, exp: Math.floor(Date.now() / 1000) + 3600, n: ++serial })}.sig`;

mock.module('@clerk/backend', {
    namedExports: {
        verifyToken: async (token) => JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')),
        createClerkClient: () => clerkClient,
    },
});

const { verifyAuth } = await import('../../netlify/functions/auth.mjs');
const { handler: usersHandler } = await import('../../netlify/functions/users.mjs');
const { handler: roleHandler } = await import('../../netlify/functions/user-role.mjs');
const { handler: syncHandler } = await import('../../netlify/functions/users-sync.mjs');
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
const rowByClerk = async (clerk, org) => (await db.select().from(users).where(and(eq(users.clerkUserId, clerk), eq(users.orgId, org))))[0];

// The cast. P is in two orgs: Admin in A, a rep in B — and Clerk's user-level
// role says Admin, which must decide nothing.
const P = 'user_itest_orgrole_p';
const ADMIN_A = 'user_itest_orgrole_admin_a';
const ADMIN_B = 'user_itest_orgrole_admin_b';
const MANAGER_A = 'user_itest_orgrole_mgr_a';

const cleanup = async () => {
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    person(P, 'p@itest-orgrole.local', 'Pat', 'Multi', { role: 'Admin' });
    person(ADMIN_A, 'admin-a@itest-orgrole.local', 'Ada', 'Admin');
    person(ADMIN_B, 'admin-b@itest-orgrole.local', 'Bea', 'Admin');
    person(MANAGER_A, 'mgr-a@itest-orgrole.local', 'Max', 'Manager');
    orgsOf.set(P, [ORG_A, ORG_B]);
    orgsOf.set(ADMIN_A, [ORG_A]);
    orgsOf.set(ADMIN_B, [ORG_B]);
    orgsOf.set(MANAGER_A, [ORG_A]);
    await db.insert(users).values([
        { id: 'usr_itest_orgrole_p_a', orgId: ORG_A, clerkUserId: P, name: 'Pat Multi', email: 'p@itest-orgrole.local', role: 'Admin', active: true,
          profile: { status: 'Active', userType: 'Admin', managedReps: ['Rep One'] } },
        { id: 'usr_itest_orgrole_p_b', orgId: ORG_B, clerkUserId: P, name: 'Pat Multi', email: 'p@itest-orgrole.local', role: 'User', active: true,
          profile: { status: 'Active', userType: 'User' } },
        { id: 'usr_itest_orgrole_admin_a', orgId: ORG_A, clerkUserId: ADMIN_A, name: 'Ada Admin', email: 'admin-a@itest-orgrole.local', role: 'Admin', active: true, profile: {} },
        { id: 'usr_itest_orgrole_admin_b', orgId: ORG_B, clerkUserId: ADMIN_B, name: 'Bea Admin', email: 'admin-b@itest-orgrole.local', role: 'Admin', active: true, profile: {} },
        { id: 'usr_itest_orgrole_mgr_a', orgId: ORG_A, clerkUserId: MANAGER_A, name: 'Max Manager', email: 'mgr-a@itest-orgrole.local', role: 'Manager', active: true, profile: {} },
    ]);
    invalidateRoster();
});

after(async () => { await cleanup(); });

test('ROLE PER ORG: one Clerk identity is an Admin in A and a rep in B — Clerk\'s user-level Admin decides nothing', async () => {
    const a = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(P, ORG_A) } });
    assert.equal(a.error, null);
    assert.equal(a.userRole, 'Admin', 'A\'s row');
    assert.deepEqual(a.managedReps, ['Rep One'], 'a Manager\'s reps come from the row too — this org\'s list');
    const b = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(P, ORG_B) } });
    assert.equal(b.userRole, 'User', 'REGRESSION: B\'s row — the Admin of A is a rep in B');
    assert.deepEqual(b.managedReps, []);
    // The same answer at the gate: B's Admin-only endpoint refuses P.
    const sync = parse(await syncHandler(ev(tokenFor(P, ORG_B), 'POST', {}, { check: 'true' })));
    assert.equal(sync.status, 403, 'an Admin-only endpoint in B refuses the Admin of A');
});

test('the org role in the token is handed on (v2 o.rol, v1 org_role); it grants nothing by itself', async () => {
    const v2 = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(ADMIN_B, ORG_B, 'admin') } });
    assert.equal(v2.orgRole, 'org:admin');
    assert.equal(v2.userRole, 'Admin', 'from the row');
    const v1 = await verifyAuth({ headers: { authorization: 'Bearer ' + v1TokenFor(P, ORG_B, 'org:admin') } });
    assert.equal(v1.orgId, ORG_B);
    assert.equal(v1.orgRole, 'org:admin');
    assert.equal(v1.userRole, 'User', 'a Clerk org admin whose row is a rep is a rep — the org role is not an app role');
});

test('NO ROW: a member with no row is a rep, and that answer is not cached past the link', async () => {
    const NEWBIE = 'user_itest_orgrole_new';
    const token = tokenFor(NEWBIE, ORG_A);
    const first = await verifyAuth({ headers: { authorization: 'Bearer ' + token } });
    assert.equal(first.error, null);
    assert.equal(first.userRole, 'User');
    await db.insert(users).values({ id: 'usr_itest_orgrole_new', orgId: ORG_A, clerkUserId: NEWBIE, name: 'New Person', email: 'new@itest-orgrole.local', role: 'Manager', active: true, profile: {} });
    const again = await verifyAuth({ headers: { authorization: 'Bearer ' + token } });
    assert.equal(again.userRole, 'Manager', 'REGRESSION: the same token reads the row once it exists — "no row" was not cached for 30 s');
});

test('user-role changes ONE org\'s row and writes nothing to Clerk; an invited row may be set; a Manager may not', async () => {
    const writesBefore = clerkWrites.length;
    const r = parse(await roleHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { targetUserId: 'usr_itest_orgrole_p_a', role: 'Manager' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.priorRole, 'Admin', 'the prior role is the row\'s');
    assert.equal((await rowOf('usr_itest_orgrole_p_a', ORG_A)).role, 'Manager');
    assert.equal((await rowOf('usr_itest_orgrole_p_a', ORG_A)).profile.userType, 'Manager', 'the blob copy follows');
    assert.equal((await rowOf('usr_itest_orgrole_p_b', ORG_B)).role, 'User', 'REGRESSION: P\'s row in B is untouched');
    assert.equal(clerkWrites.length, writesBefore, 'REGRESSION: nothing is written to Clerk');
    const fresh = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(P, ORG_A) } });
    assert.equal(fresh.userRole, 'Manager', 'a new token reads the new role');

    await db.insert(users).values({ id: 'usr_itest_orgrole_inv_set', orgId: ORG_A, clerkUserId: null, name: 'Not Yet', email: 'notyet@itest-orgrole.local', role: 'User', active: false, profile: { status: 'Invited' } });
    const inv = parse(await roleHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { targetUserId: 'usr_itest_orgrole_inv_set', role: 'Dispatcher' })));
    assert.equal(inv.status, 200, 'an invited row\'s role is the one they will hold — it may be set before they accept');
    assert.equal((await rowOf('usr_itest_orgrole_inv_set', ORG_A)).role, 'Dispatcher');

    const mgr = parse(await roleHandler(ev(tokenFor(MANAGER_A, ORG_A), 'PUT', { targetUserId: 'usr_itest_orgrole_inv_set', role: 'Admin' })));
    assert.equal(mgr.status, 403, 'only an Admin grants a role');
    const self = parse(await roleHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { targetUserId: 'usr_itest_orgrole_admin_a', role: 'User' })));
    assert.equal(self.status, 400, 'an Admin cannot demote themselves');
});

test('the first-load link: an invited row is claimed by EMAIL with its role; a row matched by NAME alone is not taken — the twin gets their own', async () => {
    await db.insert(users).values([
        { id: 'usr_itest_orgrole_inv', orgId: ORG_A, clerkUserId: null, name: 'Invited Person', email: 'invited@itest-orgrole.local', role: 'Manager', active: false, profile: { status: 'Invited' } },
        { id: 'usr_itest_orgrole_twin', orgId: ORG_A, clerkUserId: null, name: 'Name Twin', email: 'twin-original@itest-orgrole.local', role: 'Admin', active: false, profile: { status: 'Invited' } },
    ]);
    const INVITEE = 'user_itest_orgrole_invitee';
    person(INVITEE, 'Invited@itest-orgrole.local', 'Some', 'Body');
    const me = parse(await usersHandler(ev(tokenFor(INVITEE, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.user.id, 'usr_itest_orgrole_inv', 'the invited row is claimed, not duplicated');
    assert.equal(me.body.user.role, 'Manager', 'the invitation\'s role — the row\'s');
    assert.equal((await rowOf('usr_itest_orgrole_inv', ORG_A)).clerkUserId, INVITEE);
    const enforced = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(INVITEE, ORG_A) } });
    assert.equal(enforced.userRole, 'Manager', 'and it is the role the server enforces from the next request');

    const TWIN = 'user_itest_orgrole_twin';
    person(TWIN, 'someone-else@itest-orgrole.local', 'Name', 'Twin');
    const twin = parse(await usersHandler(ev(tokenFor(TWIN, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(twin.status, 200);
    // A display name is whatever a person types (state §0.172): matching on it
    // handed an unlinked row — and every record it owns — to its namesake.
    assert.notEqual(twin.body.user.id, 'usr_itest_orgrole_twin', 'REGRESSION: a row matched by display name alone is taken over');
    assert.equal(twin.body.user.role, 'User', 'the namesake gets a row of their own, as a rep');
    const untouched = await rowOf('usr_itest_orgrole_twin', ORG_A);
    assert.equal(untouched.clerkUserId, null, 'the unlinked row stays unlinked');
    assert.equal(untouched.role, 'Admin', 'and keeps its role');

    // A stored role that is not one of ours — 'Sales Rep' is the label, never a
    // stored role — authorizes nothing: the link writes a rep (state §0.163).
    await db.insert(users).values({ id: 'usr_itest_orgrole_oddrole', orgId: ORG_A, clerkUserId: null, name: 'Odd Role', email: 'oddrole@itest-orgrole.local', role: 'Sales Rep', active: false, profile: { status: 'Invited' } });
    const ODD = 'user_itest_orgrole_oddrole';
    person(ODD, 'oddrole@itest-orgrole.local', 'Odd', 'Role');
    const odd = parse(await usersHandler(ev(tokenFor(ODD, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(odd.body.user.id, 'usr_itest_orgrole_oddrole', 'claimed by its email');
    assert.equal(odd.body.user.role, 'User', 'REGRESSION: a stored role that is not one of ours is carried over');
    assert.equal((await rowOf('usr_itest_orgrole_oddrole', ORG_A)).role, 'User', 'and the row says so');
});

test('the first-load link: an address now held by ANOTHER Clerk user never hands over the member it names (§0.173)', async () => {
    // FIRST's row is linked to FIRST; the address moved to NEW (a shared mailbox
    // handed on), who signs in to the same org.
    const FIRST = 'user_itest_orgrole_firstholder', NEW = 'user_itest_orgrole_newholder';
    await db.insert(users).values({ id: 'usr_itest_orgrole_moved', orgId: ORG_A, clerkUserId: FIRST, name: 'First Holder', email: 'moved@itest-orgrole.local', role: 'Manager', active: true, profile: { status: 'Active', mobile: '+15550009999' } });
    person(NEW, 'moved@itest-orgrole.local', 'New', 'Holder');
    const me = parse(await usersHandler(ev(tokenFor(NEW, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.user, null, 'REGRESSION: another member\'s row is answered as the caller\'s own profile');
    const moved = await rowOf('usr_itest_orgrole_moved', ORG_A);
    assert.equal(moved.clerkUserId, FIRST, 'still the first holder\'s');
    assert.equal(moved.role, 'Manager');
    assert.equal(await rowByClerk(NEW, ORG_A), undefined, 'no row is made for the new holder — the address is the first holder\'s in this org');
    const enforced = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(NEW, ORG_A) } });
    assert.equal(enforced.userRole, 'User', 'the server enforces a rep with no row — nothing of the Manager\'s');
});

test('FIRST ADMIN: a fresh org\'s Clerk admin is its first Admin, once; Clerk\'s user-level Admin is not', async () => {
    const OWNER = 'user_itest_orgrole_owner';
    const CO = 'user_itest_orgrole_coadmin';
    person(OWNER, 'owner@itest-orgrole.local', 'Olive', 'Owner');
    person(CO, 'co@itest-orgrole.local', 'Cole', 'Co');
    const first = parse(await usersHandler(ev(tokenFor(OWNER, ORG_C, 'admin'), 'GET', undefined, { me: 'true' })));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.user.role, 'Admin', 'an org with no Admin: its Clerk org admin becomes the first');
    assert.equal((await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(OWNER, ORG_C, 'admin') } })).userRole, 'Admin');
    const second = parse(await usersHandler(ev(tokenFor(CO, ORG_C, 'admin'), 'GET', undefined, { me: 'true' })));
    assert.equal(second.body.user.role, 'User', 'REGRESSION: once — an org that has an Admin grants nothing to the next Clerk org admin');

    const GLOBAL = 'user_itest_orgrole_global';
    person(GLOBAL, 'global@itest-orgrole.local', 'Gil', 'Global', { role: 'Admin' });
    const g = parse(await usersHandler(ev(tokenFor(GLOBAL, ORG_D, 'member'), 'GET', undefined, { me: 'true' })));
    assert.equal(g.body.user.role, 'User', 'REGRESSION: an Admin elsewhere (Clerk\'s user-level role) joins a fresh org as a rep');
});

test('a Manager cannot invite or create anyone above a rep; an invitation carries no role to Clerk; a create naming an existing row is refused (409) and the row keeps its role and its Clerk link', async () => {
    const invite = (token, role, email) => usersHandler(ev(token, 'POST', { action: 'invite', invites: [{ email, role }] }));
    const up = parse(await invite(tokenFor(MANAGER_A, ORG_A), 'Admin', 'mgr-invites-admin@itest-orgrole.local'));
    assert.equal(up.status, 403, 'REGRESSION: a Manager inviting an Admin — the row\'s role is now the role');
    const rep = parse(await invite(tokenFor(MANAGER_A, ORG_A), 'User', 'mgr-invites-rep@itest-orgrole.local'));
    assert.equal(rep.status, 201, JSON.stringify(rep.body));
    const adminInv = parse(await invite(tokenFor(ADMIN_A, ORG_A), 'Manager', 'admin-invites-mgr@itest-orgrole.local'));
    assert.equal(adminInv.status, 201);
    const invited = (await db.select().from(users).where(and(eq(users.email, 'admin-invites-mgr@itest-orgrole.local'), eq(users.orgId, ORG_A))))[0];
    assert.equal(invited.role, 'Manager', 'an Admin\'s invitation sets the role on the row');
    assert.ok(invitations.length >= 2);
    for (const i of invitations) assert.equal(i.publicMetadata?.role, undefined, 'the Clerk invitation carries no role — the row is the one place it lives');

    const create = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'POST', { name: 'Made By Manager', email: 'made@itest-orgrole.local', userType: 'Admin' })));
    assert.equal(create.status, 403, 'a Manager cannot create an Admin either');
    const overwrite = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { id: 'usr_itest_orgrole_mgr_a', name: 'Max Manager', email: 'mgr-a@itest-orgrole.local', userType: 'Admin' })));
    assert.equal(overwrite.status, 409, 'a create never overwrites a row (§0.164) — editing is PUT, which merges first');
    const kept = await rowOf('usr_itest_orgrole_mgr_a', ORG_A);
    assert.equal(kept.role, 'Manager', 'REGRESSION: a create naming an existing row keeps its role — user-role is the one path that changes it');
    assert.equal(kept.clerkUserId, MANAGER_A, 'REGRESSION (§0.164): the create wiped the row\'s Clerk link — an unlinked row is no role at all to the server');
});

test('the sync neither reads nor writes a role: an existing row keeps its own, a new member is a rep', async () => {
    const FRESH = 'user_itest_orgrole_fresh';
    person(FRESH, 'fresh@itest-orgrole.local', 'Fay', 'Fresh', { role: 'Admin' });
    membersOf.set(ORG_B, [P, ADMIN_B, FRESH]);
    const r = parse(await syncHandler(ev(tokenFor(ADMIN_B, ORG_B), 'POST', {})));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.roleDrift, undefined, 'no role report: there is no Clerk role to report on');
    assert.equal((await rowOf('usr_itest_orgrole_p_b', ORG_B)).role, 'User', 'REGRESSION: Clerk\'s user-level Admin is not mirrored onto B\'s row');
    const made = await rowByClerk(FRESH, ORG_B);
    assert.ok(made, 'the new member has a row');
    assert.equal(made.role, 'User', 'a new row is a rep — Clerk\'s Admin is not copied');
    assert.equal((await rowOf('usr_itest_orgrole_admin_b', ORG_B)).role, 'Admin', 'the Admin running it is unchanged');
});

// ── §0.164 — deactivated means no access (Jeff, 3 Oct: "Deactivated means no access") ──

test('DEACTIVATED: an Admin takes access away (a Manager cannot, nobody their own); refused in that org with a code the app reads, untouched in the next; reactivated, it is back', async () => {
    const D = 'user_itest_orgrole_deact';
    person(D, 'deact@itest-orgrole.local', 'Dee', 'Act');
    orgsOf.set(D, [ORG_A, ORG_B]);
    await db.insert(users).values([
        { id: 'usr_itest_orgrole_deact_a', orgId: ORG_A, clerkUserId: D, name: 'Dee Act', email: 'deact@itest-orgrole.local', role: 'Manager', active: true, profile: { status: 'Active' } },
        { id: 'usr_itest_orgrole_deact_b', orgId: ORG_B, clerkUserId: D, name: 'Dee Act', email: 'deact@itest-orgrole.local', role: 'User', active: true, profile: { status: 'Active' } },
    ]);
    const put = (token, body) => usersHandler(ev(token, 'PUT', body));

    const byMgr = parse(await put(tokenFor(MANAGER_A, ORG_A), { id: 'usr_itest_orgrole_deact_a', active: false }));
    assert.equal(byMgr.status, 403, 'REGRESSION: a Manager takes away an Admin\'s — or anyone\'s — access');
    const self = parse(await put(tokenFor(ADMIN_A, ORG_A), { id: 'usr_itest_orgrole_admin_a', active: false }));
    assert.equal(self.status, 400, 'an Admin cannot deactivate themselves — a lockout');
    assert.equal((await rowOf('usr_itest_orgrole_admin_a', ORG_A)).active, true);

    const off = parse(await put(tokenFor(ADMIN_A, ORG_A), { id: 'usr_itest_orgrole_deact_a', active: false }));
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const row = await rowOf('usr_itest_orgrole_deact_a', ORG_A);
    assert.equal(row.active, false);
    assert.equal(row.profile.status, 'Deactivated', 'the status says why the row is off');
    assert.equal(row.role, 'Manager', 'the role is kept for a reactivation');

    const a = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(D, ORG_A) } });
    assert.equal(a.status, 403, 'REGRESSION: a deactivated member is still let in');
    assert.equal(a.code, 'deactivated');
    const me = parse(await usersHandler(ev(tokenFor(D, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(me.status, 403);
    assert.equal(me.body.code, 'deactivated', 'the code reaches the app, which shows its no-access page');
    const b = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(D, ORG_B) } });
    assert.equal(b.error, null, 'the same person keeps full access in B');
    assert.equal(b.userRole, 'User');

    const on = parse(await put(tokenFor(ADMIN_A, ORG_A), { id: 'usr_itest_orgrole_deact_a', active: true }));
    assert.equal(on.status, 200, JSON.stringify(on.body));
    assert.equal((await rowOf('usr_itest_orgrole_deact_a', ORG_A)).profile.status, 'Active');
    const back = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(D, ORG_A) } });
    assert.equal(back.error, null);
    assert.equal(back.userRole, 'Manager', 'reactivated, with the role it had');
});

test('DEACTIVATED before the invitation was accepted: the first-load link does not switch the row back on', async () => {
    await db.insert(users).values({ id: 'usr_itest_orgrole_deact_inv', orgId: ORG_A, clerkUserId: null, name: 'Late Joiner', email: 'late@itest-orgrole.local', role: 'User', active: false, profile: { status: 'Deactivated' } });
    const LATE = 'user_itest_orgrole_late';
    person(LATE, 'late@itest-orgrole.local', 'Late', 'Joiner');
    const me = parse(await usersHandler(ev(tokenFor(LATE, ORG_A), 'GET', undefined, { me: 'true' })));
    assert.equal(me.status, 403, JSON.stringify(me.body));
    assert.equal(me.body.code, 'deactivated');
    const row = await rowOf('usr_itest_orgrole_deact_inv', ORG_A);
    assert.equal(row.clerkUserId, LATE, 'linked to the person it was addressed to');
    assert.equal(row.active, false, 'REGRESSION: and still off — linking switched a deactivated row back on');
    const next = await verifyAuth({ headers: { authorization: 'Bearer ' + tokenFor(LATE, ORG_A) } });
    assert.equal(next.code, 'deactivated', 'and refused from the next request on');
});
