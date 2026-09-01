// tests/integration/tasks.itest.mjs
// The first integration coverage this endpoint has ever had. Centerpiece: the
// PUT merge (the sanitize-then-upsert audit's fourth face) — the raw
// sanitize() wiped absent columns AND un-completed the task, because
// `completed: d.completed ?? false` turned an omitted key into false and
// `completedDate || null` nulled the date. Plus the org-isolation basics.
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
// task.completed fires a webhook; stub it so the suite makes no outbound calls.
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});

const { handler } = await import('../../netlify/functions/tasks.mjs');
const { db } = await import('../../db/index.js');
const { tasks, users } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_tasks_*', and ONLY this file writes to
// it (guide §18b25). The rep-GET block at the bottom now seeds ONE user in
// org A (per-file namespace keeps §18b25 satisfied); the original suites
// below still run with no resolution under test — the caller resolves null
// for them only until that seed lands, and they never depended on it.
// Original note: no users were seeded — ownership resolution was not under
// test here, and an unseeded roster keeps every row unowned by construction.
const A = 'itest_tasks_A', B = 'itest_tasks_B';

const ev = (org, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const get = async (org) => JSON.parse((await handler(ev(org, 'GET'))).body).tasks || [];
const rowOf = async (id) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0];

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(tasks).where(eq(tasks.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(cleanup);
after(cleanup);

test('read isolation — A cannot see B tasks', async () => {
    await handler(ev(A, 'POST', { id: 'task_A1', title: 'A task', status: 'Open' }));
    await handler(ev(B, 'POST', { id: 'task_B1', title: 'B task', status: 'Open' }));
    const ids = (await get(A)).map(t => t.id);
    assert.ok(ids.includes('task_A1') && !ids.includes('task_B1'), 'A sees only its own tasks');
});

test('cross-tenant write — A cannot overwrite B\'s task via PUT with B\'s id', async () => {
    await handler(ev(A, 'PUT', { id: 'task_B1', title: 'HACKED' }));
    const row = await rowOf('task_B1');
    assert.equal(row.title, 'B task', 'B\'s task must be unchanged by A');
    assert.equal(row.orgId, B);
});

// ── The PUT merge (the audit's fourth face, closed) ──────────────────────────
// No current client sends a partial PUT (verified 1 Sep — every sender
// spreads the full row); these pin the endpoint so a future patch-style
// sender cannot arm the wipe, which is exactly how the leads bug detonated.

test('REGRESSION — a partial PUT does not un-complete the task or wipe its fields', async () => {
    await handler(ev(A, 'POST', {
        id: 'task_A_merge1', title: 'Precious Task', description: 'the details',
        type: 'Call', dueDate: '2026-09-05', assignedTo: 'Someone', priority: 'High',
        status: 'Open', opportunityId: 'opp_rel_1', relatedTo: 'Acme',
        contacts: [{ id: 'ct_1', name: 'Jane Contact' }],
    }));
    // Complete it the field-present way.
    const done = await handler(ev(A, 'PUT', {
        id: 'task_A_merge1', status: 'Completed', completed: true, completedDate: '2026-09-01',
    }));
    assert.equal(done.statusCode, 200);
    let row = await rowOf('task_A_merge1');
    assert.equal(row.completed, true, 'precondition: the task is completed');
    assert.equal(row.description, 'the details', 'the completion PUT was itself partial — fields must survive it');

    // The regression: a title-only PUT. The raw sanitize turned this into
    // completed:false + completedDate:null + every other column wiped.
    const res = await handler(ev(A, 'PUT', { id: 'task_A_merge1', title: 'Renamed Task' }));
    assert.equal(res.statusCode, 200);
    row = await rowOf('task_A_merge1');
    assert.equal(row.title,         'Renamed Task', 'the sent field must be applied');
    assert.equal(row.completed,     true,           'a partial PUT must NOT un-complete the task');
    assert.equal(row.completedDate, '2026-09-01',   'completedDate must survive a partial PUT');
    assert.equal(row.description,   'the details',  'an omitted field must survive a partial PUT');
    assert.equal(row.assignedTo,    'Someone',      'assignment must survive a title-only PUT');
    assert.equal(row.dueDate,       '2026-09-05',   'due date must survive a partial PUT');
    assert.equal(row.opportunityId, 'opp_rel_1',    'the opportunity link must survive a partial PUT');
    assert.equal(row.contacts.length, 1,            'linked contacts must survive a partial PUT');
});

test('an explicit completed:false still un-completes — field-present semantics', async () => {
    const res = await handler(ev(A, 'PUT', {
        id: 'task_A_merge1', completed: false, completedDate: null, status: 'Open',
    }));
    assert.equal(res.statusCode, 200);
    const row = await rowOf('task_A_merge1');
    assert.equal(row.completed, false,       'a key sent as false must be applied');
    assert.equal(row.completedDate, null,    'a key sent as null must clear the column');
    assert.equal(row.title, 'Renamed Task',  'other fields still survive');
    assert.equal(row.assignedTo, 'Someone',  'assignment untouched by the reopen');
});

test('a PUT for an unknown id is a 404, not an insert', async () => {
    const res = await handler(ev(A, 'PUT', { id: 'task_A_ghost', title: 'Ghost' }));
    assert.equal(res.statusCode, 404, 'PUT is strictly an update');
    assert.ok(!(await rowOf('task_A_ghost')), 'nothing may be created by a PUT');
});

// ── Rep-role GET scoping — the §0.48 read-side debt, closed (2 Sep) ──────────
// Permissive policy, ownerId-keyed (18b22): unassigned visible to everyone,
// owned rows only to their owner, a null caller fails closed to
// unassigned-only. This block is the suite's FIRST user seed — appended last
// so every earlier test still runs with the unresolvable caller it was
// written for; invalidateRoster() clears the 30s null-caller cache those
// tests will have filled.

const asRepRole = (e) => ({ ...e, headers: { ...e.headers, 'x-test-role': 'User' } });
const TASK_REP = 'usr_itest-tasks-rep-01';

test('rep GET — own + unassigned arrive; another rep\'s task never does', async () => {
    await db.insert(users).values({
        id: TASK_REP, clerkUserId: 'u_' + A, name: 'Itest Task Rep', email: 'task-rep@itest.local', role: 'User', orgId: A,
    });
    invalidateRoster();
    await db.insert(tasks).values([
        { id: 'task_repget_mine',  title: 'Repget Mine',  ownerId: TASK_REP,                  orgId: A },
        { id: 'task_repget_other', title: 'Repget Other', ownerId: 'usr_itest-tasks-other-1', orgId: A },
        { id: 'task_repget_none',  title: 'Repget None',  ownerId: null,                      orgId: A },
    ]);
    const ids = JSON.parse((await handler(asRepRole(ev(A, 'GET')))).body).tasks.map(t => t.id);
    assert.ok(ids.includes('task_repget_mine'),   'a rep must receive their own task');
    assert.ok(ids.includes('task_repget_none'),   'unassigned is visible to everyone');
    assert.ok(!ids.includes('task_repget_other'), 'another rep\'s task must never be sent to a rep');
});

test('Admin GET — all three scoping rows arrive (canSeeAll bypasses the filter)', async () => {
    const ids = (await get(A)).map(t => t.id);
    for (const id of ['task_repget_mine', 'task_repget_other', 'task_repget_none']) {
        assert.ok(ids.includes(id), `Admin must still receive ${id}`);
    }
});

test('unresolvable caller GET — only unassigned arrives (fail closed, 18b22 direction)', async () => {
    // Org B has no roster rows, so the stub caller resolves null there.
    await db.insert(tasks).values([
        { id: 'task_repget_b_none',  title: 'Repget B None',  ownerId: null,                      orgId: B },
        { id: 'task_repget_b_owned', title: 'Repget B Owned', ownerId: 'usr_itest-tasks-other-1', orgId: B },
    ]);
    const ids = JSON.parse((await handler(asRepRole(ev(B, 'GET')))).body).tasks.map(t => t.id);
    assert.ok(ids.includes('task_repget_b_none'),   'unassigned stays visible to a null caller under the permissive policy');
    assert.ok(!ids.includes('task_repget_b_owned'), 'an owned row must be refused to a null caller — null === null must not match');
});
