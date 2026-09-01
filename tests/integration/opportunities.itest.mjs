// tests/integration/opportunities.itest.mjs
// The first integration coverage this endpoint has ever had. Centerpiece: the
// single-record PUT merge (the sanitize-then-upsert audit's third face) — a
// partial PUT must update its fields and PRESERVE the rest, including the
// three no-payload-can-carry fields (stageHistory, comments, pipelineId) that
// the raw sanitize() wiped. Plus the org-isolation basics every suite owes.
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
        // The stub must export EVERY name the endpoint imports (the leads
        // suite's lesson: a partial stub kills the whole file at import).
        // opportunities.mjs imports isManager on top of the usual five.
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'u_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isManager:    (role) => role === 'Manager',
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
// Stage changes and creates fire email/webhook/automation side effects; stub
// them so the suite makes no outbound calls. emailTemplates is indexed by
// alert type at the call site, so the stub answers every key.
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async () => {},
        emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }),
    },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const { handler } = await import('../../netlify/functions/opportunities.mjs');
const { db } = await import('../../db/index.js');
const { opportunities, users } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_opps_*', and ONLY this file writes to
// it (guide §18b25 — suites run concurrently against one shared test DB, and
// this suite seeds users, so a shared org id would collide on
// users_org_clerk_uq and poison the 30s caller cache for whichever suite
// loses the race).
const A = 'itest_opps_A', B = 'itest_opps_B';
const REP_A = 'usr_itest-opps-rep-01';

const ev = (org, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const get = async (org) => JSON.parse((await handler(ev(org, 'GET'))).body).opportunities || [];
const rowOf = async (id) => (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0];

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await cleanup();
    // One resolvable rep so salesRep-name stamping is deterministic. Both
    // users-table caches cleared together (the leads suite's lesson: a cached
    // MISS lasts 30s and fails every later resolution closed).
    await db.insert(users).values([
        { id: REP_A, clerkUserId: 'u_' + A, name: 'Itest Opp Rep', email: 'opp-rep@itest.local', role: 'User', orgId: A },
    ]);
    invalidateRoster();
});
after(cleanup);

test('read isolation — A cannot see B opportunities', async () => {
    await handler(ev(A, 'POST', { id: 'opp_A1', opportunityName: 'A Deal', account: 'Acme A', stage: 'Discovery' }));
    await handler(ev(B, 'POST', { id: 'opp_B1', opportunityName: 'B Deal', account: 'Acme B', stage: 'Discovery' }));
    const ids = (await get(A)).map(o => o.id);
    assert.ok(ids.includes('opp_A1') && !ids.includes('opp_B1'), 'A sees only its own opportunities');
});

test('cross-tenant write — A cannot overwrite B\'s opportunity via PUT with B\'s id', async () => {
    await handler(ev(A, 'PUT', { id: 'opp_B1', opportunityName: 'HACKED', stage: 'Proposal' }));
    const row = await rowOf('opp_B1');
    assert.equal(row.opportunityName, 'B Deal', 'B\'s opportunity must be unchanged by A');
    assert.equal(row.orgId, B);
});

// ── The single-record PUT merge (the audit's third face, closed) ─────────────
// The raw sanitize(data) nulled every absent column, emptied stageHistory and
// comments, and reset pipelineId to 'default'. No current client sends a
// partial PUT (verified 1 Sep — every sender spreads the full row); these pin
// the endpoint so a future patch-style sender cannot arm the wipe, which is
// exactly how the leads bug detonated.

test('REGRESSION — a partial PUT updates its fields and preserves the rest', async () => {
    await handler(ev(A, 'POST', {
        id: 'opp_A_merge1', opportunityName: 'Precious Deal', account: 'Keep Corp',
        site: 'HQ', salesRep: 'Itest Opp Rep', stage: 'Discovery', arr: 250000,
        notes: 'precious notes', nextSteps: 'call Tuesday', pipelineId: 'pipe_custom',
        stageHistory: [{ stage: 'Discovery', date: '2026-08-01', author: 'seed' }],
        comments: [{ id: 'c1', text: 'a Team Note', timestamp: '2026-08-02T00:00:00Z' }],
        contactIds: ['ct_1'],
    }));
    const res = await handler(ev(A, 'PUT', { id: 'opp_A_merge1', stage: 'Proposal' }));
    assert.equal(res.statusCode, 200);
    const row = await rowOf('opp_A_merge1');
    assert.equal(row.stage,           'Proposal',       'the sent field must be applied');
    assert.equal(row.opportunityName, 'Precious Deal',  'an omitted field must survive a partial PUT');
    assert.equal(row.account,         'Keep Corp',      'an omitted field must survive a partial PUT');
    assert.equal(row.salesRep,        'Itest Opp Rep',  'the rep must survive a stage-only PUT');
    assert.equal(Number(row.arr),     250000,           'ARR must survive a stage-only PUT');
    assert.equal(row.notes,           'precious notes', 'notes must survive a stage-only PUT');
    assert.equal(row.pipelineId,      'pipe_custom',    "pipelineId must not reset to 'default'");
    assert.equal(row.stageHistory.length, 1,            'stage history must survive (the field no payload carried)');
    assert.equal(row.comments.length, 1,                'Team Notes must survive a partial PUT');
    assert.deepEqual(row.contactIds,  ['ct_1'],         'linked contacts must survive a partial PUT');
    assert.equal(row.ownerId, REP_A,  'ownership must survive a PUT that never mentioned salesRep (18b13)');
});

test('an explicit null still clears — field-present semantics, not field-protection', async () => {
    const res = await handler(ev(A, 'PUT', { id: 'opp_A_merge1', notes: null }));
    assert.equal(res.statusCode, 200);
    const row = await rowOf('opp_A_merge1');
    assert.equal(row.notes, null,                      'a key sent as null must clear the column');
    assert.equal(row.opportunityName, 'Precious Deal', 'other fields still survive');
    assert.equal(row.pipelineId, 'pipe_custom',        'pipelineId untouched by an unrelated clear');
    assert.equal(row.comments.length, 1,               'Team Notes untouched by an unrelated clear');
});

test('a PUT for an unknown id is a 404, not an insert', async () => {
    const res = await handler(ev(A, 'PUT', { id: 'opp_A_ghost', stage: 'Proposal' }));
    assert.equal(res.statusCode, 404, 'PUT is strictly an update');
    assert.ok(!(await rowOf('opp_A_ghost')), 'nothing may be created by a PUT');
});

// ── Rep-role GET scoping — the §0.48 read-side debt, closed (2 Sep) ──────────
// Permissive policy, ownerId-keyed (18b22): unassigned visible to everyone,
// owned rows only to their owner, a null caller fails closed to
// unassigned-only. The Manager managedReps branch is name-based by documented
// intent and NOT covered here — it is a visibility filter tracked for the
// Phase-2 id migration, and these tests run as User/Admin only. Rows seeded
// with db.insert (pipelineId and stage are NOT NULL) so ownership is the
// test's input.

const asRepRole = (e) => ({ ...e, headers: { ...e.headers, 'x-test-role': 'User' } });

test('rep GET — own + unassigned arrive; another rep\'s deal never does', async () => {
    await db.insert(opportunities).values([
        { id: 'opp_repget_mine',  opportunityName: 'Repget Mine',  pipelineId: 'default', stage: 'Discovery', ownerId: REP_A,                    orgId: A },
        { id: 'opp_repget_other', opportunityName: 'Repget Other', pipelineId: 'default', stage: 'Discovery', ownerId: 'usr_itest-opps-other-1', orgId: A },
        { id: 'opp_repget_none',  opportunityName: 'Repget None',  pipelineId: 'default', stage: 'Discovery', ownerId: null,                     orgId: A },
    ]);
    const ids = JSON.parse((await handler(asRepRole(ev(A, 'GET')))).body).opportunities.map(o => o.id);
    assert.ok(ids.includes('opp_repget_mine'),   'a rep must receive their own deal');
    assert.ok(ids.includes('opp_repget_none'),   'unassigned is visible to everyone');
    assert.ok(!ids.includes('opp_repget_other'), 'another rep\'s deal must never be sent to a rep');
});

test('Admin GET — all three scoping rows arrive (canSeeAll bypasses the filter)', async () => {
    const ids = (await get(A)).map(o => o.id);
    for (const id of ['opp_repget_mine', 'opp_repget_other', 'opp_repget_none']) {
        assert.ok(ids.includes(id), `Admin must still receive ${id}`);
    }
});

test('unresolvable caller GET — only unassigned arrives (fail closed, 18b22 direction)', async () => {
    // Org B has no roster rows, so the stub caller resolves null.
    await db.insert(opportunities).values([
        { id: 'opp_repget_b_none',  opportunityName: 'Repget B None',  pipelineId: 'default', stage: 'Discovery', ownerId: null,                     orgId: B },
        { id: 'opp_repget_b_owned', opportunityName: 'Repget B Owned', pipelineId: 'default', stage: 'Discovery', ownerId: 'usr_itest-opps-other-1', orgId: B },
    ]);
    const ids = JSON.parse((await handler(asRepRole(ev(B, 'GET')))).body).opportunities.map(o => o.id);
    assert.ok(ids.includes('opp_repget_b_none'),   'unassigned stays visible to a null caller under the permissive policy');
    assert.ok(!ids.includes('opp_repget_b_owned'), 'an owned row must be refused to a null caller — null === null must not match');
});
