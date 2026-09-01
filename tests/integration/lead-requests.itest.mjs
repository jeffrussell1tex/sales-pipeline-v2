// tests/integration/lead-requests.itest.mjs
// The §0.58 claim-request flow: reps request unassigned leads; Manager/Admin
// approve (assigning the lead to the requester) or deny. These prove the
// endpoint's identity rules against the real database: requester stamped from
// the caller, approve role-gated, siblings denied, org isolation throughout.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        // Same reimplemented-not-stubbed-open shape as leads.itest.mjs, plus
        // x-test-user: this suite needs TWO distinct rep callers in one org
        // (a requester and a bystander), which 'u_' + orgId alone cannot give.
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || 'u_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole)
                ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers, opts = {}) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (auth?.userRole === 'ReadOnly') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            }
            if (auth?.userRole === 'Technician' && !opts.allowTechnician) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: technicians may only update their own assigned jobs' }) };
            }
            return null;
        },
    },
});

const { handler } = await import('../../netlify/functions/lead-requests.mjs');
const { db } = await import('../../db/index.js');
const { leadClaimRequests, leads, users } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_lreq_*', and ONLY this file writes to
// it (§18b25 — suites that seed users take their own prefix).
const A = 'itest_lreq_A', B = 'itest_lreq_B';

const ADMIN_A = 'usr_itest-lreq-admin-01';   // resolvable approver ('u_' + A)
const REP_A   = 'usr_itest-lreq-rep-0001';   // the requester   (clerk 'u_rep')
const OTHER_A = 'usr_itest-lreq-other-02';   // a bystander rep (clerk 'u_other')

const ev = (org, method, body, qs, extra) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json', ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const asRep   = (e) => ({ ...e, headers: { ...e.headers, 'x-test-role': 'User', 'x-test-user': 'u_rep' } });
const asOther = (e) => ({ ...e, headers: { ...e.headers, 'x-test-role': 'User', 'x-test-user': 'u_other' } });

const requestRow = async (id) =>
    (await db.select().from(leadClaimRequests).where(eq(leadClaimRequests.id, id)))[0];
const leadRow = async (id) =>
    (await db.select().from(leads).where(eq(leads.id, id)))[0];

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(leadClaimRequests).where(eq(leadClaimRequests.orgId, o));
        await db.delete(leads).where(eq(leads.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: ADMIN_A, clerkUserId: 'u_' + A,  name: 'Itest Lreq Admin', email: 'lreq-admin@itest.local', role: 'Admin', orgId: A },
        { id: REP_A,   clerkUserId: 'u_rep',   name: 'Itest Lreq Rep',   email: 'lreq-rep@itest.local',   role: 'User',  orgId: A },
        { id: OTHER_A, clerkUserId: 'u_other', name: 'Itest Lreq Other', email: 'lreq-other@itest.local', role: 'User',  orgId: A },
    ]);
    await db.insert(leads).values([
        { id: 'lreq_lead_pool',  firstName: 'Pool',  status: 'New', ownerId: null,    orgId: A },
        { id: 'lreq_lead_pool2', firstName: 'Pool2', status: 'New', ownerId: null,    orgId: A },
        { id: 'lreq_lead_owned', firstName: 'Owned', status: 'New', ownerId: OTHER_A, assignedTo: 'Itest Lreq Other', orgId: A },
    ]);
    invalidateRoster();
});
after(cleanup);

test('a rep requests an unassigned lead — 201, requester stamped from the CALLER', async () => {
    // The payload smuggles a requesterId on purpose: it must be ignored.
    const res = await handler(asRep(ev(A, 'POST', { id: 'lreq_1', leadId: 'lreq_lead_pool', requesterId: OTHER_A, note: 'my territory' })));
    assert.equal(res.statusCode, 201);
    const row = await requestRow('lreq_1');
    assert.equal(row.requesterId, REP_A, 'requesterId must come from getCallerId, never the payload');
    assert.equal(row.status, 'pending');
    assert.equal(row.note, 'my territory');
});

test('requesting an already-assigned lead is refused', async () => {
    const res = await handler(asRep(ev(A, 'POST', { id: 'lreq_owned', leadId: 'lreq_lead_owned' })));
    assert.equal(res.statusCode, 409);
    assert.equal(await requestRow('lreq_owned'), undefined, 'no request row may be written');
});

test('a duplicate pending request by the same rep is refused; a second REP may still request', async () => {
    const dup = await handler(asRep(ev(A, 'POST', { id: 'lreq_dup', leadId: 'lreq_lead_pool' })));
    assert.equal(dup.statusCode, 409, 'same rep, same lead, still pending — refused');
    const second = await handler(asOther(ev(A, 'POST', { id: 'lreq_2', leadId: 'lreq_lead_pool' })));
    assert.equal(second.statusCode, 201, 'a different rep may compete for the same lead');
    assert.equal((await requestRow('lreq_2')).requesterId, OTHER_A);
});

test('GET as a rep returns ONLY their own requests; Admin sees the org\'s; org B sees nothing', async () => {
    const mine = JSON.parse((await handler(asRep(ev(A, 'GET')))).body).leadRequests;
    assert.deepEqual(mine.map(r => r.id), ['lreq_1'], 'a rep must not see a colleague\'s requests');
    const all = JSON.parse((await handler(ev(A, 'GET'))).body).leadRequests;
    assert.equal(all.length, 2, 'Admin sees every request in the org');
    const b = JSON.parse((await handler(ev(B, 'GET'))).body).leadRequests;
    assert.equal(b.length, 0, 'org B must see none of org A\'s requests');
});

test('a rep cannot approve — the resolve path is role-gated', async () => {
    const res = await handler(asRep(ev(A, 'PUT', { id: 'lreq_1', action: 'approve' })));
    assert.equal(res.statusCode, 403);
    assert.equal((await requestRow('lreq_1')).status, 'pending', 'the request must be untouched');
    assert.equal((await leadRow('lreq_lead_pool')).ownerId, null, 'the lead must remain unassigned');
});

test('cross-tenant — B cannot resolve A\'s request', async () => {
    const res = await handler(ev(B, 'PUT', { id: 'lreq_1', action: 'approve' }));
    assert.equal(res.statusCode, 404, 'another org\'s request id must read as not-found');
    assert.equal((await requestRow('lreq_1')).status, 'pending');
});

test('approve assigns the lead to the requester and denies the sibling request', async () => {
    const res = await handler(ev(A, 'PUT', { id: 'lreq_1', action: 'approve' }));
    assert.equal(res.statusCode, 200);
    const lead = await leadRow('lreq_lead_pool');
    assert.equal(lead.ownerId, REP_A,             'the lead must be assigned to the REQUESTER');
    assert.equal(lead.assignedTo, 'Itest Lreq Rep', 'the display name follows the owner id');
    const approvedReq = await requestRow('lreq_1');
    assert.equal(approvedReq.status, 'approved');
    assert.equal(approvedReq.resolvedBy, ADMIN_A, 'the approver is recorded');
    assert.ok(approvedReq.resolvedAt, 'resolution is timestamped');
    const sibling = await requestRow('lreq_2');
    assert.equal(sibling.status, 'denied', 'a sibling pending request for the same lead is denied in the same stroke');
});

test('approve on a lead now owned by someone ELSE is refused', async () => {
    await handler(asRep(ev(A, 'POST', { id: 'lreq_3', leadId: 'lreq_lead_pool2' })));
    await db.update(leads).set({ ownerId: OTHER_A }).where(eq(leads.id, 'lreq_lead_pool2'));
    const res = await handler(ev(A, 'PUT', { id: 'lreq_3', action: 'approve' }));
    assert.equal(res.statusCode, 409, 'a lead assigned elsewhere cannot be granted');
    assert.equal((await requestRow('lreq_3')).status, 'pending', 'the manager denies by hand — nothing auto-resolves');
});

test('approve is idempotent across its own partial failure — owned by the REQUESTER proceeds', async () => {
    // The window: assign-lead succeeded, resolve-request died. A retry finds
    // the lead already owned by the requester and must finish, not 409.
    await db.update(leads).set({ ownerId: REP_A, assignedTo: 'Itest Lreq Rep' }).where(eq(leads.id, 'lreq_lead_pool2'));
    const res = await handler(ev(A, 'PUT', { id: 'lreq_3', action: 'approve' }));
    assert.equal(res.statusCode, 200, 'a retry must complete the interrupted approve');
    assert.equal((await requestRow('lreq_3')).status, 'approved');
});

test('deny resolves the request and leaves the lead untouched', async () => {
    await db.insert(leads).values({ id: 'lreq_lead_pool3', firstName: 'Pool3', status: 'New', ownerId: null, orgId: A });
    await handler(asRep(ev(A, 'POST', { id: 'lreq_4', leadId: 'lreq_lead_pool3' })));
    const res = await handler(ev(A, 'PUT', { id: 'lreq_4', action: 'deny' }));
    assert.equal(res.statusCode, 200);
    assert.equal((await requestRow('lreq_4')).status, 'denied');
    assert.equal((await leadRow('lreq_lead_pool3')).ownerId, null, 'deny must not touch the lead');
});

test('a resolved request cannot be re-resolved', async () => {
    const res = await handler(ev(A, 'PUT', { id: 'lreq_4', action: 'approve' }));
    assert.equal(res.statusCode, 409, 'denied is final unless the rep files a new request');
});

test('a rep cancels their OWN pending request; a colleague\'s and a resolved one are refused', async () => {
    await handler(asRep(ev(A, 'POST', { id: 'lreq_5', leadId: 'lreq_lead_pool3' })));
    const foreign = await handler(asOther(ev(A, 'DELETE', null, { id: 'lreq_5' })));
    assert.equal(foreign.statusCode, 403, 'only the requester (or a manager) cancels a request');
    const resolved = await handler(asRep(ev(A, 'DELETE', null, { id: 'lreq_4' })));
    assert.equal(resolved.statusCode, 409, 'resolved requests are history, not deletable by reps');
    const own = await handler(asRep(ev(A, 'DELETE', null, { id: 'lreq_5' })));
    assert.equal(own.statusCode, 200);
    assert.equal(await requestRow('lreq_5'), undefined, 'a cancelled pending request is gone');
});
