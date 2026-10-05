// tests/integration/invitations.itest.mjs
// Invitations are real (state §0.165) — against the real test database, with the
// REAL verifyAuth and the real users and users-sync handlers. Only the Clerk SDK
// is a stand-in, and it keeps invitations PER ORG the way Clerk does: a list
// answers for one org, and a revoke finds an invitation only in the org it names.
//
// Proves: an Admin reads their own org's pending invitations and no other's (a
// Manager is refused); a revoke withdraws only the caller org's invitation for an
// address — the same address invited to another org keeps its invitation and its
// row — and removes the invitation's row; a Manager cannot revoke; a member who
// has joined is not revoked; a row with no live invitation is simply removed; a
// revoke Clerk refuses keeps the row (it fails closed); removing a member is an
// Admin's, never one's own, and an invitation not yet accepted is revoked, not
// deleted; an invitation's expiry is one of the screen's choices and reaches
// Clerk; a resend revokes the old invitation in the same org; and the sync does
// not report an invitation not yet accepted as drift.
//
// §0.167: an invitation's row takes the name it was sent (the team import sends
// each row's), and clearing an org's users revokes its pending invitations
// before any row goes — failing closed — and touches no other org's. The clear
// runs in an org of its own (ORG_C), so it deletes nothing another test reads.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_invite_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_invite_*' (rows, Clerk ids, emails) — and
// only this file writes to it.
const ORG_A = 'itest_invite_A';
const ORG_B = 'itest_invite_B';
const ORG_C = 'itest_invite_C';   // cleared by its own Admin (§0.167)
const ORGS = [ORG_A, ORG_B, ORG_C];

// ── The Clerk stand-in ──────────────────────────────────────────────────────
const people = new Map();
const person = (id, email, first, last) => people.set(id, {
    id, firstName: first, lastName: last, emailAddresses: [{ emailAddress: email }], publicMetadata: {},
});
const membersOf = new Map();     // org id → the clerk ids the sync lists
const invitations = [];          // Clerk's invitations, each in ONE org
const revokes = [];              // every revoke, with the org it named
let failRevoke = false;
let failList = false;   // §0.167: the clear's list, refused
let failOrg = false;    // §0.168: the membership limit's read, refused
const orgLimits = new Map();   // org id → maxAllowedMemberships (Clerk's default, 5, when unset)
let serialInv = 0;
const invite = (organizationId, emailAddress, extra = {}) => {
    serialInv += 1;
    const inv = {
        id: 'orginv_itest_invite_' + serialInv, organizationId, emailAddress, role: 'org:member', status: 'pending',
        createdAt: Date.now() - 60000 + serialInv, expiresAt: Date.now() + 7 * 86400000, ...extra,
    };
    invitations.push(inv);
    return inv;
};

const clerkClient = {
    users: {
        getUser: async (id) => {
            const u = people.get(id);
            if (!u) { const e = new Error('Not Found'); e.status = 404; throw e; }
            return u;
        },
    },
    organizations: {
        getOrganization: async ({ organizationId, includeMembersCount }) => {
            if (failOrg) throw new Error('Clerk is unavailable');
            return {
                id: organizationId,
                maxAllowedMemberships: orgLimits.has(organizationId) ? orgLimits.get(organizationId) : 5,
                ...(includeMembersCount ? { membersCount: (membersOf.get(organizationId) || []).length } : {}),
            };
        },
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
            if (!inv) { const e = new Error('Not Found'); e.status = 404; throw e; }   // Clerk scopes a revoke by org
            inv.status = 'revoked';
            revokes.push({ organizationId, invitationId });
            return inv;
        },
        createOrganizationInvitation: async (args) => invite(args.organizationId, args.emailAddress, { role: args.role, expiresInDays: args.expiresInDays }),
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
const { db } = await import('../../db/index.js');
const { users, auditLog } = await import('../../db/schema.js');
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
const revokeAs = (clerkId, org, email) => usersHandler(ev(tokenFor(clerkId, org), 'POST', { action: 'revoke-invite', email }));

// The cast.
const ADMIN_A = 'user_itest_invite_admin_a';
const MANAGER_A = 'user_itest_invite_mgr_a';
const MEMBER_A = 'user_itest_invite_member_a';
const ADMIN_B = 'user_itest_invite_admin_b';
const ADMIN_C = 'user_itest_invite_admin_c';
const MEMBER_C = 'user_itest_invite_member_c';
const GONE = 'user_itest_invite_gone';   // has a row in A, but is no longer a member in Clerk
const E = (local) => `${local}@itest-invite.local`;
const invitedRow = (id, org, email, extra = {}) => ({
    id, orgId: org, clerkUserId: null, name: email.split('@')[0], email, role: 'User', active: false, profile: { status: 'Invited' }, ...extra,
});
let invDupA, invDupB, invKeepA, invJoinedA, invC;
const rowsOf = async (org) => db.select().from(users).where(eq(users.orgId, org));
const clearAs = (clerkId, org) => usersHandler(ev(tokenFor(clerkId, org), 'DELETE', undefined, { clear: 'true' }));

const cleanup = async () => {
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    person(ADMIN_A, E('admin-a'), 'Ada', 'Admin');
    person(MANAGER_A, E('mgr-a'), 'Max', 'Manager');
    person(MEMBER_A, E('joined'), 'Jo', 'Ined');
    person(ADMIN_B, E('admin-b'), 'Bea', 'Admin');
    person(ADMIN_C, E('admin-c'), 'Cy', 'Admin');
    person(MEMBER_C, E('member-c'), 'Cam', 'Member');
    membersOf.set(ORG_A, [ADMIN_A, MANAGER_A, MEMBER_A]);
    membersOf.set(ORG_B, [ADMIN_B]);
    membersOf.set(ORG_C, [ADMIN_C, MEMBER_C]);
    await db.insert(users).values([
        { id: 'usr_itest_invite_admin_a', orgId: ORG_A, clerkUserId: ADMIN_A, name: 'Ada Admin', email: E('admin-a'), role: 'Admin', active: true, profile: { status: 'Active' } },
        { id: 'usr_itest_invite_mgr_a', orgId: ORG_A, clerkUserId: MANAGER_A, name: 'Max Manager', email: E('mgr-a'), role: 'Manager', active: true, profile: { status: 'Active' } },
        { id: 'usr_itest_invite_joined_a', orgId: ORG_A, clerkUserId: MEMBER_A, name: 'Jo Ined', email: E('joined'), role: 'User', active: true, profile: { status: 'Active' } },
        { id: 'usr_itest_invite_gone_a', orgId: ORG_A, clerkUserId: GONE, name: 'Gone Member', email: E('gone'), role: 'User', active: true, profile: { status: 'Active' } },
        { id: 'usr_itest_invite_member_x', orgId: ORG_A, clerkUserId: 'user_itest_invite_x', name: 'Ex Member', email: E('ex'), role: 'User', active: true, profile: { status: 'Active' } },
        { id: 'usr_itest_invite_admin_b', orgId: ORG_B, clerkUserId: ADMIN_B, name: 'Bea Admin', email: E('admin-b'), role: 'Admin', active: true, profile: { status: 'Active' } },
        // The same address invited to BOTH orgs.
        invitedRow('usr_itest_invite_dup_a', ORG_A, E('dup')),
        invitedRow('usr_itest_invite_dup_b', ORG_B, E('dup')),
        invitedRow('usr_itest_invite_keep_a', ORG_A, E('keep')),
        invitedRow('usr_itest_invite_nolink_a', ORG_A, E('nolink')),   // its Clerk invitation is gone (expired)
        // ORG_C — cleared by its Admin at the end of the file.
        { id: 'usr_itest_invite_admin_c', orgId: ORG_C, clerkUserId: ADMIN_C, name: 'Cy Admin', email: E('admin-c'), role: 'Admin', active: true, profile: { status: 'Active' } },
        { id: 'usr_itest_invite_member_c', orgId: ORG_C, clerkUserId: MEMBER_C, name: 'Cam Member', email: E('member-c'), role: 'User', active: true, profile: { status: 'Active' } },
        invitedRow('usr_itest_invite_invited_c', ORG_C, E('invited-c')),
    ]);
    invDupA = invite(ORG_A, E('dup'));
    invDupB = invite(ORG_B, E('dup'));
    invKeepA = invite(ORG_A, E('keep'));
    invJoinedA = invite(ORG_A, E('joined'));   // a stray invitation for someone who has joined
    invC = invite(ORG_C, E('invited-c'));
});

after(cleanup);

test('an Admin reads their own org\'s pending invitations — Clerk\'s dates, no other org\'s — and a Manager is refused', async () => {
    const r = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'GET', undefined, { invitations: 'pending' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ids = r.body.invitations.map((i) => i.id).sort();
    assert.deepEqual(ids, [invDupA.id, invKeepA.id, invJoinedA.id].sort());
    assert.ok(!ids.includes(invDupB.id), 'REGRESSION: another org\'s invitation is listed');
    const dup = r.body.invitations.find((i) => i.id === invDupA.id);
    assert.equal(dup.email, E('dup'));
    assert.equal(dup.expiresAt, invDupA.expiresAt, 'the expiry is Clerk\'s');
    assert.equal(dup.createdAt, invDupA.createdAt, 'and so is the sent date');
    const m = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'GET', undefined, { invitations: 'pending' })));
    assert.equal(m.status, 403, 'an Admin\'s, like everything else about access');
});

test('a revoke withdraws only THIS org\'s invitation and removes its row — the same address in another org keeps both', async () => {
    const r = parse(await revokeAs(ADMIN_A, ORG_A, 'DUP@itest-invite.local'));   // the address in another case
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.revoked, 1);
    assert.equal(r.body.removedRowId, 'usr_itest_invite_dup_a');
    assert.equal(invDupA.status, 'revoked', 'REGRESSION: the invitation is still live — the person can still join');
    assert.equal(invDupB.status, 'pending', 'REGRESSION: org B\'s invitation for the same address was revoked');
    assert.ok(revokes.every((x) => x.organizationId === ORG_A), 'every revoke named the caller\'s org');
    assert.equal(await rowOf('usr_itest_invite_dup_a', ORG_A), undefined, 'the invitation\'s row is removed');
    assert.ok(await rowOf('usr_itest_invite_dup_b', ORG_B), 'REGRESSION: org B\'s row for the same address was removed');
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, ORG_A), eq(auditLog.action, 'user.invite_revoked')));
    assert.equal(audit.length, 1, 'the revoke is audited');
});

test('a Manager cannot revoke; a member who has joined is not revoked; nothing to revoke is a 404', async () => {
    const m = parse(await revokeAs(MANAGER_A, ORG_A, E('keep')));
    assert.equal(m.status, 403);
    assert.equal(invKeepA.status, 'pending');
    assert.ok(await rowOf('usr_itest_invite_keep_a', ORG_A));
    const j = parse(await revokeAs(ADMIN_A, ORG_A, E('joined')));
    assert.equal(j.status, 409, 'a member who has joined is deactivated, not revoked');
    assert.equal(invJoinedA.status, 'pending', 'nothing was revoked');
    assert.ok(await rowOf('usr_itest_invite_joined_a', ORG_A));
    const n = parse(await revokeAs(ADMIN_A, ORG_A, E('nobody')));
    assert.equal(n.status, 404);
});

test('a row with no live invitation is simply removed — there is nothing for Clerk to withdraw', async () => {
    const r = parse(await revokeAs(ADMIN_A, ORG_A, E('nolink')));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.revoked, 0);
    assert.equal(r.body.removedRowId, 'usr_itest_invite_nolink_a');
    assert.equal(await rowOf('usr_itest_invite_nolink_a', ORG_A), undefined);
});

test('a revoke Clerk refuses keeps the row — the invitation may still be live, so it fails closed', async () => {
    failRevoke = true;
    try {
        const r = parse(await revokeAs(ADMIN_A, ORG_A, E('keep')));
        assert.equal(r.status, 502, JSON.stringify(r.body));
    } finally {
        failRevoke = false;
    }
    assert.ok(await rowOf('usr_itest_invite_keep_a', ORG_A), 'REGRESSION: the row went while its invitation may still be live');
    assert.equal(invKeepA.status, 'pending');
});

test('removing a member is an Admin\'s and never one\'s own — and an invitation not yet accepted is revoked, not deleted', async () => {
    const byMgr = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'DELETE', undefined, { id: 'usr_itest_invite_member_x' })));
    assert.equal(byMgr.status, 403, 'REGRESSION: a Manager removes a member — an Admin\'s row included');
    assert.ok(await rowOf('usr_itest_invite_member_x', ORG_A));
    const self = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'DELETE', undefined, { id: 'usr_itest_invite_admin_a' })));
    assert.equal(self.status, 400, 'an Admin cannot remove themselves');
    assert.ok(await rowOf('usr_itest_invite_admin_a', ORG_A));
    const inv = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'DELETE', undefined, { id: 'usr_itest_invite_keep_a' })));
    assert.equal(inv.status, 409, 'REGRESSION: deleting an invitation\'s row leaves its invitation live');
    assert.equal(inv.body.code, 'invitation');
    assert.ok(await rowOf('usr_itest_invite_keep_a', ORG_A));
    assert.equal(invKeepA.status, 'pending');
    const ok = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'DELETE', undefined, { id: 'usr_itest_invite_member_x' })));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(await rowOf('usr_itest_invite_member_x', ORG_A), undefined);
});

test('an invitation lasts one of the screen\'s choices, and Clerk is told — the default is the screen\'s 7, not Clerk\'s 30', async () => {
    const r = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { action: 'invite', invites: [
        { email: E('three'), role: 'User', expiresInDays: 3 },
        { email: E('default'), role: 'User' },
        { email: E('five'), role: 'User', expiresInDays: 5 },
    ] })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const made = (email) => invitations.find((i) => i.emailAddress === email && i.organizationId === ORG_A && i.status === 'pending');
    assert.equal(made(E('three')).expiresInDays, 3, 'REGRESSION: the chosen expiry is not sent');
    assert.equal(made(E('default')).expiresInDays, 7);
    assert.equal(made(E('five')), undefined, 'REGRESSION: an expiry the screen does not offer reached Clerk');
    assert.ok(r.body.errors.some((e) => e.email === E('five')), 'and the refusal is reported for that address');
    // Who invited whom, as what — the log never recorded an invitation.
    const logged = (await db.select().from(auditLog).where(and(eq(auditLog.orgId, ORG_A), eq(auditLog.action, 'user.invited')))).map((a) => a.entityName);
    assert.ok(logged.includes(`${E('three')} as User, 3 days`), 'REGRESSION: an invitation is not audited');
    assert.ok(logged.includes(`${E('default')} as User, 7 days`));
    assert.ok(!logged.some((n) => n.startsWith(E('five'))), 'a refused address is not logged as invited');
});

test('a resend revokes the old invitation in the same org and sends a fresh one', async () => {
    const old = invitations.find((i) => i.emailAddress === E('three') && i.status === 'pending');
    const r = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { action: 'invite', invites: [{ email: E('three'), role: 'User' }] })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(old.status, 'revoked');
    assert.ok(revokes.some((x) => x.invitationId === old.id && x.organizationId === ORG_A));
    assert.equal(invitations.filter((i) => i.emailAddress === E('three') && i.status === 'pending').length, 1, 'one live invitation');
});

test('the sync does not report an invitation not yet accepted as drift — a member gone from Clerk still is', async () => {
    const r = parse(await syncHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', {}, { check: 'true' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const drift = (r.body.dbOnly || []).map((x) => x.email);
    assert.ok(!drift.includes(E('keep')), 'REGRESSION: a pending invitation is reported as "in Accelerep, not in Clerk"');
    assert.ok(drift.includes(E('gone')), 'a member no longer in Clerk is still reported');
});

test('an invitation\'s row takes the name it was sent — trimmed, cut to the column — and none is the address before the @ (§0.167)', async () => {
    const r = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { action: 'invite', invites: [
        { email: E('named'), name: '  Nia Named  ', role: 'User' },
        { email: E('long'), name: 'L'.repeat(300), role: 'User' },
        { email: E('blank'), name: '   ', role: 'User' },
    ] })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.errors, []);
    const stored = async (email) => (await db.select().from(users).where(and(eq(users.orgId, ORG_A), eq(users.email, email))))[0]?.name;
    assert.equal(await stored(E('named')), 'Nia Named', 'REGRESSION: the import\'s Name column is dropped — and the first sign-in never renames a row');
    assert.equal(await stored(E('long')), 'L'.repeat(255), 'cut to the column — the row is written after Clerk has sent the invitation, so a longer name must never reach the insert');
    assert.equal(await stored(E('blank')), 'blank');
    assert.equal(r.body.invited.find((u) => u.email === E('named'))?.name, 'Nia Named', 'and the answer carries it, for the roster on screen');
});

test('an invitation\'s row carries the team id it was sent — none sent is none (§0.168)', async () => {
    const r = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { action: 'invite', invites: [
        { email: E('teamed'), role: 'User', team: 'East', teamId: 'team_itest_east' },
        { email: E('teamless'), role: 'User' },
    ] })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const profileOf = async (email) => (await db.select().from(users).where(and(eq(users.orgId, ORG_A), eq(users.email, email))))[0]?.profile || {};
    assert.equal((await profileOf(E('teamed'))).teamId, 'team_itest_east', 'REGRESSION: the invite stores the team\'s name alone — coaching notes and the digest read teamId');
    assert.equal((await profileOf(E('teamless'))).teamId ?? null, null);
    assert.equal(r.body.invited.find((u) => u.email === E('teamed'))?.teamId, 'team_itest_east', 'and the answer carries it, for the team list the screen saves');
});

test('seats: an Admin reads THIS org\'s membership limit, Clerk\'s count and the invitations pending; a Manager is refused; a read Clerk refuses is a 502 (§0.168)', async () => {
    orgLimits.set(ORG_A, 20);
    orgLimits.set(ORG_B, 0);
    const pendingIn = (org) => invitations.filter((i) => i.organizationId === org && i.status === 'pending').length;
    const a = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'GET', undefined, { seats: 'true' })));
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.deepEqual(a.body, { limit: 20, members: 3, pendingInvitations: pendingIn(ORG_A) }, 'REGRESSION: the seat numbers are not Clerk\'s for the caller\'s org');
    const b = parse(await usersHandler(ev(tokenFor(ADMIN_B, ORG_B), 'GET', undefined, { seats: 'true' })));
    assert.deepEqual(b.body, { limit: 0, members: 1, pendingInvitations: pendingIn(ORG_B) }, 'org B reads its own — 0 is no limit');
    const m = parse(await usersHandler(ev(tokenFor(MANAGER_A, ORG_A), 'GET', undefined, { seats: 'true' })));
    assert.equal(m.status, 403, 'an Admin\'s, like the invitations');
    failOrg = true;
    try {
        const f = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'GET', undefined, { seats: 'true' })));
        assert.equal(f.status, 502, 'a read Clerk refuses is said, never guessed');
    } finally {
        failOrg = false;
    }
});

test('a Manager cannot clear an org\'s users — and nothing is revoked on the way to the refusal (§0.167)', async () => {
    const before = revokes.length;
    const r = parse(await clearAs(MANAGER_A, ORG_A));
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(revokes.length, before, 'REGRESSION: a refused clear revoked invitations');
    assert.equal(invKeepA.status, 'pending');
});

test('a clear whose invitations Clerk cannot list removes no member — it fails closed (§0.167)', async () => {
    failList = true;
    try {
        const r = parse(await clearAs(ADMIN_C, ORG_C));
        assert.equal(r.status, 502, JSON.stringify(r.body));
    } finally {
        failList = false;
    }
    assert.equal((await rowsOf(ORG_C)).length, 3, 'REGRESSION: the rows went with the invitations unread — any of them may be live');
    assert.equal(invC.status, 'pending');
});

test('a clear Clerk refuses to revoke for removes no member — it fails closed (§0.167)', async () => {
    failRevoke = true;
    try {
        const r = parse(await clearAs(ADMIN_C, ORG_C));
        assert.equal(r.status, 502, JSON.stringify(r.body));
    } finally {
        failRevoke = false;
    }
    assert.equal((await rowsOf(ORG_C)).length, 3, 'REGRESSION: the rows went while an invitation may still be live');
    assert.equal(invC.status, 'pending');
});

test('clearing an org\'s users revokes ITS pending invitations, then removes its rows — no other org\'s of either (§0.167)', async () => {
    const aRows = (await rowsOf(ORG_A)).length, bRows = (await rowsOf(ORG_B)).length;
    const r = parse(await clearAs(ADMIN_C, ORG_C));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.count, 3);
    assert.equal(r.body.revoked, 1);
    assert.equal(invC.status, 'revoked', 'REGRESSION: the emptied org\'s invitation is live — its person can still join it, as a rep');
    assert.ok(revokes.some((x) => x.invitationId === invC.id && x.organizationId === ORG_C));
    assert.deepEqual(await rowsOf(ORG_C), []);
    assert.equal(invKeepA.status, 'pending', 'REGRESSION: another org\'s invitation was revoked');
    assert.equal(invDupB.status, 'pending');
    assert.equal((await rowsOf(ORG_A)).length, aRows, 'no other org\'s row');
    assert.equal((await rowsOf(ORG_B)).length, bRows);
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, ORG_C), eq(auditLog.action, 'user.cleared')));
    assert.equal(audit.length, 1);
    assert.equal(audit[0].entityName, 'All users (3); 1 pending invitation(s) revoked');
});
