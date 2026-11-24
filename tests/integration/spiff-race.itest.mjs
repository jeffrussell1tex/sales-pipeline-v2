// tests/integration/spiff-race.itest.mjs
// §0.276 against the real test database (OPEN_ITEMS §4.8, §0.275's found (1); Jeff, 20 Nov: "Fix SPIFF claim race"): a
// rep's claim save was checked on a read (their own claim, still pending) and then wrote the whole row built over that
// read with only the id and the org in its filter — a Manager's approval, or a reassignment to another rep, landing
// between was written back to pending, or to the rep. And every save — a Manager's approval too — wrote every column
// of its read back, putting back what another save changed between. Staged where it happens: the real _lib.mjs with
// resolveCaller (the rep's check; getCallerName until §0.292) wrapped, and the real _links.mjs with checkLinks (between any save's read and write)
// wrapped, each to make the other session's move — once, when armed — the moment it returns.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers['x-test-user'], orgId, userRole: event.headers['x-test-role'] || 'User', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});

// The other session's move, staged: once, when armed, the moment the wrapped call returns.
let armedName = null, armedLinks = null;
const lib = await import('../../netlify/functions/_lib.mjs');
const links = await import('../../netlify/functions/_links.mjs');
mock.module(new URL('../../netlify/functions/_lib.mjs', import.meta.url).href, {
    namedExports: { ...lib, resolveCaller: async (...a) => { const r = await lib.resolveCaller(...a); const h = armedName; armedName = null; if (h) await h(); return r; } },
});
mock.module(new URL('../../netlify/functions/_links.mjs', import.meta.url).href, {
    namedExports: { ...links, checkLinks: async (...a) => { const r = await links.checkLinks(...a); const h = armedLinks; armedLinks = null; if (h) await h(); return r; } },
});

const { handler } = await import('../../netlify/functions/spiff-claims.mjs');
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { users, spiffClaims } = schema;
const { eq, and } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_spiff_race_*', and only this file writes to it.
const A = 'itest_spiff_race_A';
const CLERK = { rep: 'clerk_itest_spiff_race_rep', mgr: 'clerk_itest_spiff_race_mgr', admin: 'clerk_itest_spiff_race_admin' };
const REP = 'Itest Spiff Rep';

const ev = (role, user, body) => ({
    httpMethod: 'PUT',
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body), queryStringParameters: {},
});
const rowOf = async (id) => (await db.select().from(spiffClaims).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, A))))[0];
const seed = async (tag, extra = {}) => {
    const id = `itest_spiff_race_${tag}`;
    await db.delete(spiffClaims).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, A)));
    await db.insert(spiffClaims).values({ id, orgId: A, spiffId: 'spiff_itest', spiffName: 'Itest SPIFF', repName: REP, status: 'pending', amount: '100.00', note: 'as filed', ...extra });
    return id;
};
const move = (id, set) => async () => { await db.update(spiffClaims).set(set).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, A))); };
const said = (res) => JSON.parse(res.body).error;

const cleanup = async () => {
    await db.delete(spiffClaims).where(eq(spiffClaims.orgId, A));
    await db.delete(users).where(eq(users.orgId, A));
    await db.delete(schema.auditLog).where(eq(schema.auditLog.orgId, A));
};
before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: 'usr_itest-spiff-race-rep',   clerkUserId: CLERK.rep,   orgId: A, name: REP,                  email: 'spiff-race-rep@itest.local',   role: 'User' },
        { id: 'usr_itest-spiff-race-mgr',   clerkUserId: CLERK.mgr,   orgId: A, name: 'Itest Spiff Mgr',   email: 'spiff-race-mgr@itest.local',   role: 'Manager' },
        { id: 'usr_itest-spiff-race-admin', clerkUserId: CLERK.admin, orgId: A, name: 'Itest Spiff Admin', email: 'spiff-race-admin@itest.local', role: 'Admin' },
    ]);
    lib.invalidateRoster();
});
after(async () => { armedName = null; armedLinks = null; await cleanup(); });

test("§0.276 a rep's save of a claim a Manager approved after the rep's check passed writes nothing — 403 in the check's words, the approval standing", async () => {
    const id = await seed('approved');
    armedName = move(id, { status: 'approved', approvedBy: 'Itest Spiff Mgr', approvedAt: new Date() });
    const res = await handler(ev('User', CLERK.rep, { id, note: 'rep edit' }));
    assert.equal(armedName, null, 'the move ran');
    assert.equal(res.statusCode, 403, res.body);
    assert.equal(said(res), 'A claim can only be edited while it is pending.');
    const back = await rowOf(id);
    assert.equal(back.status, 'approved');
    assert.equal(back.approvedBy, 'Itest Spiff Mgr');
    assert.equal(back.note, 'as filed');
});

test("§0.276 a rep's save of a claim moved to another rep after the check passed writes nothing — 403, the claim the other rep's", async () => {
    const id = await seed('moved');
    armedName = move(id, { repName: 'Itest Other Rep' });
    const res = await handler(ev('User', CLERK.rep, { id, note: 'rep edit' }));
    assert.equal(res.statusCode, 403, res.body);
    assert.equal(said(res), 'You can only edit your own claims.');
    const back = await rowOf(id);
    assert.equal(back.repName, 'Itest Other Rep');
    assert.equal(back.note, 'as filed');
});

test("§0.276 a rep's save of a claim deleted after the check passed is 404 — never written again", async () => {
    const id = await seed('gone');
    armedName = async () => { await db.delete(spiffClaims).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, A))); };
    const res = await handler(ev('User', CLERK.rep, { id, note: 'rep edit' }));
    assert.equal(res.statusCode, 404, res.body);
    assert.equal(await rowOf(id), undefined);
});

test("§0.276 a Manager's approval writes what it names — an amount changed between its read and its write stands", async () => {
    const id = await seed('mgr');
    armedLinks = move(id, { amount: '999.00', note: 'changed meanwhile' });
    const approvedAt = new Date().toISOString();
    const res = await handler(ev('Manager', CLERK.mgr, { id, status: 'approved', approvedAt, approvedBy: 'Itest Spiff Mgr' }));
    assert.equal(armedLinks, null, 'the move ran');
    assert.equal(res.statusCode, 200, res.body);
    const back = await rowOf(id);
    assert.equal(back.status, 'approved');
    assert.equal(back.approvedBy, 'Itest Spiff Mgr');
    assert.equal(back.amount, '999.00', 'the amount the other save wrote — not the read put back');
    assert.equal(back.note, 'changed meanwhile');
});

test("§0.276 the review: a Manager's Reject of a claim another Manager approved since the list loaded — the status the list showed (fromStatus) held in the write: 409 in words saying what it is, the approval standing", async () => {
    const id = await seed('stale');
    armedLinks = move(id, { status: 'approved', approvedBy: 'Another Mgr', approvedAt: new Date() });
    const res = await handler(ev('Manager', CLERK.mgr, { id, status: 'rejected', approvedAt: new Date().toISOString(), approvedBy: 'Itest Spiff Mgr', fromStatus: 'pending' }));
    assert.equal(armedLinks, null, 'the move ran');
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(said(res), 'This claim is approved now — it changed since it was loaded. Nothing was saved; reload to see it.');
    const back = await rowOf(id);
    assert.equal(back.status, 'approved');
    assert.equal(back.approvedBy, 'Another Mgr');
});

test('§0.276 the review: a second press after the first landed — Approve, then Reject from the same list — is refused, the first standing', async () => {
    const id = await seed('twice');
    const first = await handler(ev('Manager', CLERK.mgr, { id, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: 'Itest Spiff Mgr', fromStatus: 'pending' }));
    assert.equal(first.statusCode, 200, first.body);
    const second = await handler(ev('Manager', CLERK.mgr, { id, status: 'rejected', approvedAt: new Date().toISOString(), approvedBy: 'Itest Spiff Mgr', fromStatus: 'pending' }));
    assert.equal(second.statusCode, 409, second.body);
    assert.equal((await rowOf(id)).status, 'approved');
    const bad = await handler(ev('Manager', CLERK.mgr, { id, status: 'paid', fromStatus: 7 }));
    assert.equal(bad.statusCode, 400, bad.body);
    assert.equal((await rowOf(id)).status, 'approved', 'a fromStatus that is no text writes nothing');
});

test("§0.276 a rep's save, with no move, lands on their own pending claim — the name in any case and with spaces, as sameName reads it — and writes only what it names", async () => {
    for (const [tag, name] of [['own', REP], ['spaced', `  ${REP.toUpperCase()} `]]) {
        const id = await seed(tag, { repName: name });
        armedLinks = move(id, { amount: '555.00' });
        const res = await handler(ev('User', CLERK.rep, { id, note: 'rep edit', status: 'approved', repName: 'Someone Else' }));
        assert.equal(res.statusCode, 403, `${tag}: a rep naming a status is refused before anything (${res.body})`);
        armedLinks = move(id, { amount: '555.00' });
        const ok = await handler(ev('User', CLERK.rep, { id, note: 'rep edit', repName: 'Someone Else' }));
        assert.equal(ok.statusCode, 200, `${tag}: ${ok.body}`);
        const back = await rowOf(id);
        assert.equal(back.note, 'rep edit', tag);
        assert.equal(back.repName, name, `${tag}: the rep is not a rep's to change`);
        assert.equal(back.status, 'pending', tag);
        assert.equal(back.amount, '555.00', `${tag}: a column the save does not name is not written back`);
    }
});

test('§0.276 an Admin is not held to the pending rule or the rep — their save lands on an approved claim', async () => {
    const id = await seed('admin', { status: 'approved', approvedBy: 'Itest Spiff Mgr' });
    const res = await handler(ev('Admin', CLERK.admin, { id, note: 'admin edit' }));
    assert.equal(res.statusCode, 200, res.body);
    const back = await rowOf(id);
    assert.equal(back.note, 'admin edit');
    assert.equal(back.status, 'approved');
});
