// tests/integration/lead-request-race.itest.mjs
// §0.279 against the real test database (OPEN_ITEMS §4.8, §0.275's found (5); Jeff, 20 Nov: "Next race finding"): a lead
// request's writes were decided on reads and run by the request's id alone. A rep's Cancel checked the request was
// pending, then deleted it — one a manager approved between went, its history with it, the lead left assigned; a Deny
// wrote "denied" over another manager's Approve; an Approve took a lead assigned to another rep since its read, or
// assigned one whose request was cancelled or whose requester left the roster since. Staged where it happens: the other
// session's move runs — once, when armed — after every check has passed, the moment the first write is sent (a single
// statement's then, or the approve's batch). The move sends its own statements by execute(), never through what it holds.
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

// The other session's move: once, when armed, before the first write — every check has read what it reads by then.
let armed = null;
let ran = false;
const fire = async () => { const h = armed; armed = null; if (h) { await h(); ran = true; } };
const { QueryPromise } = await import('drizzle-orm');
const realThen = QueryPromise.prototype.then;
QueryPromise.prototype.then = function (ok, bad) {
    const text = armed && typeof this.toSQL === 'function' ? this.toSQL().sql : '';
    if (/^(update|delete from) "lead_claim_requests"/.test(text)) return fire().then(() => realThen.call(this, ok, bad), bad);
    return realThen.call(this, ok, bad);
};
const { db } = await import('../../db/index.js');
const realBatch = db.batch.bind(db);
db.batch = async (qs) => { await fire(); return realBatch(qs); };

const { handler } = await import('../../netlify/functions/lead-requests.mjs');
const { leadClaimRequests, leads, users, auditLog } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_lreq_race_*', and only this file writes to it.
const A = 'itest_lreq_race_A';
const CLERK = { admin: 'clerk_itest_lreq_race_admin', rep: 'clerk_itest_lreq_race_rep' };
const USR = { admin: 'usr_itest-lreq-race-admin', rep: 'usr_itest-lreq-race-rep', other: 'usr_itest-lreq-race-other', gone: 'usr_itest-lreq-race-gone' };

const ev = (role, user, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, queryStringParameters: qs || {},
});
const asAdmin = (method, body, qs) => ev('Admin', CLERK.admin, method, body, qs);
const asRep = (method, body, qs) => ev('User', CLERK.rep, method, body, qs);
const requestOf = async (id) => (await db.select().from(leadClaimRequests).where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, A))))[0];
const leadOf = async (id) => (await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.orgId, A))))[0];
const said = (res) => JSON.parse(res.body);
// A lead in the pool and the requests on it: `mine` the rep's (or the gone member's), `sib` another rep's.
const seed = async (tag, { requester = USR.rep, sibling = false } = {}) => {
    const lead = `itest_lreq_race_lead_${tag}`, mine = `itest_lreq_race_${tag}`, sib = `itest_lreq_race_${tag}_sib`;
    await db.delete(leadClaimRequests).where(and(eq(leadClaimRequests.leadId, lead), eq(leadClaimRequests.orgId, A)));
    await db.delete(leads).where(and(eq(leads.id, lead), eq(leads.orgId, A)));
    await db.insert(leads).values({ id: lead, orgId: A, firstName: 'Lead ' + tag, status: 'New', ownerId: null });
    await db.insert(leadClaimRequests).values([
        { id: mine, orgId: A, leadId: lead, requesterId: requester, status: 'pending' },
        ...(sibling ? [{ id: sib, orgId: A, leadId: lead, requesterId: USR.other, status: 'pending' }] : []),
    ]);
    return { lead, mine, sib };
};
// The other session's statements, sent by execute() — never through the then the seam holds.
const setRequest = (id, set) => async () => { await db.update(leadClaimRequests).set({ ...set, updatedAt: new Date() }).where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, A))).execute(); };
const dropRequest = (id) => async () => { await db.delete(leadClaimRequests).where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, A))).execute(); };
const assignLead = (id, owner) => async () => { await db.update(leads).set({ ownerId: owner, assignedTo: 'Itest Lreq Other', updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.orgId, A))).execute(); };
const arm = (h) => { armed = h; ran = false; };

const cleanup = async () => {
    await db.delete(leadClaimRequests).where(eq(leadClaimRequests.orgId, A));
    await db.delete(leads).where(eq(leads.orgId, A));
    await db.delete(users).where(eq(users.orgId, A));
    await db.delete(auditLog).where(eq(auditLog.orgId, A));
};
before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: USR.admin, clerkUserId: CLERK.admin, orgId: A, name: 'Itest Lreq Admin', email: 'lreq-race-admin@itest.local', role: 'Admin' },
        { id: USR.rep,   clerkUserId: CLERK.rep,   orgId: A, name: 'Itest Lreq Rep',   email: 'lreq-race-rep@itest.local',   role: 'User' },
        { id: USR.other, clerkUserId: 'clerk_itest_lreq_race_other', orgId: A, name: 'Itest Lreq Other', email: 'lreq-race-other@itest.local', role: 'User' },
        { id: USR.gone,  clerkUserId: 'clerk_itest_lreq_race_gone',  orgId: A, name: 'Itest Lreq Gone',  email: 'lreq-race-gone@itest.local',  role: 'User' },
    ]);
    invalidateRoster();
});
after(async () => { armed = null; QueryPromise.prototype.then = realThen; db.batch = realBatch; await cleanup(); });

test("§0.279 a rep's Cancel of a request a manager approved after the check passed deletes nothing — 409 in words; the request stays approved, its history kept", async () => {
    const { mine } = await seed('cancel');
    arm(setRequest(mine, { status: 'approved', resolvedBy: USR.admin, resolvedAt: new Date() }));
    const res = await handler(asRep('DELETE', null, { id: mine }));
    assert.equal(ran, true, 'the move ran');
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(said(res).error, 'This request was approved since — resolved requests are history. Nothing was cancelled.');
    assert.equal(said(res).leadRequest?.status, 'approved', 'the request as stored, for the screen (the review)');
    assert.equal((await requestOf(mine))?.status, 'approved', 'the approved request is history, not deleted');
});

test('§0.279 an Approve of a lead deleted after the check passed assigns nothing — 409 in the checks\' words (the review: never a 500); the request still pending', async () => {
    const { lead, mine } = await seed('deleted');
    arm(async () => { await db.delete(leads).where(and(eq(leads.id, lead), eq(leads.orgId, A))).execute(); });
    const res = await handler(asAdmin('PUT', { id: mine, action: 'approve' }));
    assert.equal(ran, true);
    assert.deepEqual([res.statusCode, said(res).error], [409, 'The requested lead no longer exists — deny the request instead.']);
    assert.equal((await requestOf(mine)).status, 'pending');
});

test('§0.279 two Approves of sibling requests on one lead at once: one lands, the other is refused in words — never a 500 (the review: the lead is claimed first; the deadlock window itself cannot be staged from outside one HTTP transaction, so the lock order is THE GUARD\'s pin)', async () => {
    const { lead, mine, sib } = await seed('both', { sibling: true });
    const [r1, r2] = await Promise.all([handler(asAdmin('PUT', { id: mine, action: 'approve' })), handler(asAdmin('PUT', { id: sib, action: 'approve' }))]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    assert.deepEqual(codes, [200, 409], `${r1.body} | ${r2.body}`);
    const won = r1.statusCode === 200 ? mine : sib;
    const lost = won === mine ? sib : mine;
    assert.deepEqual([(await requestOf(won)).status, (await requestOf(lost)).status], ['approved', 'denied']);
    assert.equal((await leadOf(lead)).ownerId, won === mine ? USR.rep : USR.other);
});

test("§0.279 a Cancel of a request another press deleted after the check passed is done — 404 code 'gone' (an earlier press landed)", async () => {
    const { mine } = await seed('cancel2');
    arm(dropRequest(mine));
    const res = await handler(asRep('DELETE', null, { id: mine }));
    assert.equal(ran, true);
    assert.deepEqual([res.statusCode, said(res).code], [404, 'gone']);
});

test("§0.279 a Deny over an Approve another manager landed after the check passed writes nothing — 409 naming it approved, never 'already'; still approved", async () => {
    const { mine } = await seed('deny');
    arm(setRequest(mine, { status: 'approved', resolvedBy: USR.admin, resolvedAt: new Date() }));
    const res = await handler(asAdmin('PUT', { id: mine, action: 'deny' }));
    assert.equal(ran, true);
    assert.equal(res.statusCode, 409, res.body);
    assert.deepEqual([said(res).error, said(res).code], ['This request was already approved.', undefined]);
    assert.equal((await requestOf(mine)).status, 'approved');
});

test("§0.279 a Deny beaten by another Deny is done — 409 code 'already'", async () => {
    const { mine } = await seed('deny2');
    arm(setRequest(mine, { status: 'denied', resolvedBy: USR.admin, resolvedAt: new Date() }));
    const res = await handler(asAdmin('PUT', { id: mine, action: 'deny' }));
    assert.deepEqual([res.statusCode, said(res).code], [409, 'already']);
});

test("§0.279 an Approve of a lead another rep was given after the check passed writes nothing — 409 'deny instead'; the lead stays theirs, the requests pending", async () => {
    const { lead, mine, sib } = await seed('taken', { sibling: true });
    arm(assignLead(lead, USR.other));
    const res = await handler(asAdmin('PUT', { id: mine, action: 'approve' }));
    assert.equal(ran, true);
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(said(res).error, 'This lead was already assigned to someone else — deny the request instead.');
    assert.equal((await leadOf(lead)).ownerId, USR.other, "the other rep's lead untouched");
    assert.deepEqual([(await requestOf(mine)).status, (await requestOf(sib)).status], ['pending', 'pending'], 'nothing of the batch landed');
});

test('§0.279 an Approve of a request cancelled after the check passed assigns nothing — 404; the lead stays in the pool', async () => {
    const { lead, mine } = await seed('cancelled');
    arm(dropRequest(mine));
    const res = await handler(asAdmin('PUT', { id: mine, action: 'approve' }));
    assert.equal(ran, true);
    assert.deepEqual([res.statusCode, said(res).error], [404, 'Request not found']);
    assert.equal((await leadOf(lead)).ownerId, null, 'never assigned to a rep whose request is gone');
});

test('§0.279 an Approve whose requester left the roster after the check passed assigns nothing — 409 in the roster words; the lead stays in the pool', async () => {
    const { lead, mine } = await seed('left', { requester: USR.gone });
    arm(async () => { await db.delete(users).where(and(eq(users.id, USR.gone), eq(users.orgId, A))).execute(); });
    const res = await handler(asAdmin('PUT', { id: mine, action: 'approve' }));
    assert.equal(ran, true);
    assert.deepEqual([res.statusCode, said(res).error], [409, 'The requester is no longer in the roster — deny the request instead.']);
    assert.equal((await leadOf(lead)).ownerId, null);
    assert.equal((await requestOf(mine)).status, 'pending');
});

test("§0.279 an Approve beaten by the same Approve is done — 409 code 'already'; a Deny after an Approve says approved", async () => {
    const { mine } = await seed('twice');
    arm(setRequest(mine, { status: 'approved', resolvedBy: USR.admin, resolvedAt: new Date() }));
    const res = await handler(asAdmin('PUT', { id: mine, action: 'approve' }));
    assert.deepEqual([res.statusCode, said(res).code, said(res).error], [409, 'already', 'This request was already approved.']);
});

test('§0.279 with nothing moved: an Approve assigns the lead, approves the request and denies its pending siblings in one batch; a rep cancels their own pending request; a Deny lands', async () => {
    const { lead, mine, sib } = await seed('lands', { sibling: true });
    // A request on the lead resolved before: history, never rewritten by the siblings' denial (only pending ones are).
    const earlier = 'itest_lreq_race_lands_earlier';
    await db.insert(leadClaimRequests).values({ id: earlier, orgId: A, leadId: lead, requesterId: USR.other, status: 'denied', note: 'earlier', resolvedBy: USR.admin, resolvedAt: new Date('2026-11-01T10:00:00Z') });
    const res = await handler(asAdmin('PUT', { id: mine, action: 'approve' }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(said(res).leadRequest.status, 'approved');
    const l = await leadOf(lead);
    assert.deepEqual([l.ownerId, l.assignedTo], [USR.rep, 'Itest Lreq Rep']);
    const s = await requestOf(sib);
    assert.deepEqual([s.status, s.note], ['denied', 'Lead was assigned to another rep']);
    const e = await requestOf(earlier);
    assert.deepEqual([e.status, e.note], ['denied', 'earlier'], "REGRESSION: the siblings' denial rewrote a request resolved before");
    const c = await seed('cancel-lands');
    assert.equal((await handler(asRep('DELETE', null, { id: c.mine }))).statusCode, 200);
    assert.equal(await requestOf(c.mine), undefined);
    const d = await seed('deny-lands');
    const dr = await handler(asAdmin('PUT', { id: d.mine, action: 'deny' }));
    assert.deepEqual([dr.statusCode, (await requestOf(d.mine)).status], [200, 'denied']);
});

test("§0.279 an Approve over a lead the requester already holds (a retry after an assign) still lands — the lead's owner as read is the claim, not 'nobody'", async () => {
    const { lead, mine } = await seed('retry');
    await db.update(leads).set({ ownerId: USR.rep }).where(and(eq(leads.id, lead), eq(leads.orgId, A)));
    const res = await handler(asAdmin('PUT', { id: mine, action: 'approve' }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await requestOf(mine)).status, 'approved');
});
