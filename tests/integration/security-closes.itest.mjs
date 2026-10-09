// tests/integration/security-closes.itest.mjs
// The small security closes (state §0.191) against the real test database.
// Proves, on audit-log.mjs and recommendation-log.mjs:
//   AUDIT   a member's invented entry ("user.role", "settings.updated") is refused
//           and not written; the app's own CRM entry posts for a CRM writer and
//           is refused to a ReadOnly user and a Dispatcher; the app's own Dispatch
//           entry posts for a Dispatcher where Dispatch is on, and is refused
//           where it is off and to a rep whose org keeps reps out of Dispatch
//   RECLOG  a rep reads only their own log whatever `?rep=` names, writes only in
//           their own name, and sweeps only their own pending rows; a Manager
//           reads any rep's, or the org's; a caller with no roster row reads,
//           writes and sweeps nothing; org B's row of the same rep name is never
//           seen
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and
// predicates; the Dispatch gate reads the seeded settings.
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
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_secc_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});

const { handler: auditFn } = await import('../../netlify/functions/audit-log.mjs');
const { handler: recFn }   = await import('../../netlify/functions/recommendation-log.mjs');
const { db } = await import('../../db/index.js');
const { users, auditLog, settings, recommendationLog } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_secc_*', and only this file writes to it.
// A: Dispatch on. B: another org. C: Dispatch off.
const A = 'itest_secc_A', B = 'itest_secc_B', C = 'itest_secc_C';
const CLERK = {
    rep: 'clerk_itest_secc_rep', other: 'clerk_itest_secc_other', mgr: 'clerk_itest_secc_mgr',
    ro: 'clerk_itest_secc_ro', disp: 'clerk_itest_secc_disp', dispC: 'clerk_itest_secc_disp_c',
    repB: 'clerk_itest_secc_rep_b', ghost: 'clerk_itest_secc_ghost',
};
const NAME = { rep: 'Itest Secc rep', other: 'Itest Secc other' };
const DAY = 86400000;

const ev = (org, role, user, method = 'GET', body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const audit = (org, role, user, body) => auditFn(ev(org, role, user, 'POST', body)).then(parse);
const rec   = (org, role, user, method, body, qs) => recFn(ev(org, role, user, method, body, qs)).then(parse);
const auditRow = async (id) => (await db.select().from(auditLog).where(eq(auditLog.id, id)))[0];
const recRow   = async (id) => (await db.select().from(recommendationLog).where(eq(recommendationLog.id, id)))[0];

const cleanup = async () => {
    for (const o of [A, B, C]) {
        await db.delete(recommendationLog).where(eq(recommendationLog.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await cleanup();
    const u = (key, role, org = A, name = `Itest Secc ${key}`) => ({ id: `usr_itest-secc-${key}`, clerkUserId: CLERK[key], orgId: org, name, email: `secc-${key}@itest.local`, role });
    await db.insert(users).values([
        u('rep', 'User'), u('other', 'User'), u('mgr', 'Manager'), u('ro', 'ReadOnly'), u('disp', 'Dispatcher'),
        u('dispC', 'Dispatcher', C), u('repB', 'User', B, NAME.rep),   // org B: a rep of the same name
    ]);
    invalidateRoster();
    await db.insert(settings).values([
        { id: 'settings_' + A, orgId: A, extra: { dispatchEnabled: true } },
        { id: 'settings_' + B, orgId: B, extra: { dispatchEnabled: true } },
        { id: 'settings_' + C, orgId: C, extra: { dispatchEnabled: false } },
    ]);
    const r = (id, org, repName, daysAgo) => ({ id, orgId: org, repName, actionType: 'stale', opportunityId: null, dealName: id, outcome: 'pending', dismissedAt: new Date(Date.now() - daysAgo * DAY) });
    await db.insert(recommendationLog).values([
        r('rec_itest_secc_rep1', A, NAME.rep, 1), r('rec_itest_secc_rep2', A, NAME.rep, 2),
        r('rec_itest_secc_other_old', A, NAME.other, 5),   // pending, old enough to sweep
        r('rec_itest_secc_b', B, NAME.rep, 1),
    ]);
});
after(cleanup);

test('AUDIT: an invented entry is refused and not written — for a rep and a Manager alike', async () => {
    const forged = [
        ['audit_itest_secc_f1', 'User', CLERK.rep, { action: 'user.role', entityType: 'user', entityId: 'usr_x' }],
        ['audit_itest_secc_f2', 'User', CLERK.rep, { action: 'settings.updated', entityType: 'settings', entityId: A }],
        ['audit_itest_secc_f3', 'User', CLERK.rep, { action: 'delete', entityType: 'opportunity', entityId: 'opp_x' }],
        ['audit_itest_secc_f4', 'Manager', CLERK.mgr, { action: 'update', entityType: 'user', entityId: 'usr_x' }],
    ];
    for (const [id, role, user, body] of forged) {
        const res = await audit(A, role, user, { id, ...body });
        assert.equal(res.status, 403, `${id}: ${JSON.stringify(res.body)}`);
        assert.equal(await auditRow(id), undefined, `${id} not written`);
    }
});

test('AUDIT: the app\'s CRM entry posts for a CRM writer, as that caller; a ReadOnly user and a Dispatcher are refused', async () => {
    const ok = await audit(A, 'User', CLERK.rep, { id: 'audit_itest_secc_crm', action: 'update', entityType: 'account', entityId: 'acct_x', userId: 'someone else' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const row = await auditRow('audit_itest_secc_crm');
    assert.equal(row.orgId, A);
    assert.equal(row.userId, CLERK.rep, 'the actor is the caller, never the body');
    assert.equal(row.userName, NAME.rep);
    for (const [id, role, user] of [['audit_itest_secc_crm_ro', 'ReadOnly', CLERK.ro], ['audit_itest_secc_crm_disp', 'Dispatcher', CLERK.disp]]) {
        const res = await audit(A, role, user, { id, action: 'create', entityType: 'opportunity', entityId: 'opp_x' });
        assert.equal(res.status, 403, `${role}: ${JSON.stringify(res.body)}`);
        assert.equal(await auditRow(id), undefined);
    }
});

test('AUDIT: the app\'s Dispatch entry posts for a Dispatcher where Dispatch is on; refused where it is off, and to a rep kept out', async () => {
    const ok = await audit(A, 'Dispatcher', CLERK.disp, { id: 'audit_itest_secc_disp', action: 'dispatch.crew.hold', entityType: 'dispatch_job', entityId: 'job_x' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await auditRow('audit_itest_secc_disp')).userId, CLERK.disp);
    const off = await audit(C, 'Dispatcher', CLERK.dispC, { id: 'audit_itest_secc_disp_off', action: 'dispatch.crew.hold', entityType: 'dispatch_job', entityId: 'job_x' });
    assert.equal(off.status, 403, JSON.stringify(off.body));
    assert.equal(await auditRow('audit_itest_secc_disp_off'), undefined);
    const rep = await audit(A, 'User', CLERK.rep, { id: 'audit_itest_secc_disp_rep', action: 'dispatch.schedule', entityType: 'dispatch_job', entityId: 'job_x' });
    assert.equal(rep.status, 403, 'the org keeps reps out of Dispatch (repsCanUseDispatch absent)');
    assert.equal(await auditRow('audit_itest_secc_disp_rep'), undefined);
});

test('RECLOG: a rep reads only their own log, whatever ?rep= names; never org B\'s row of the same name', async () => {
    for (const qs of [{}, { rep: NAME.other }, { rep: '' }]) {
        const res = await rec(A, 'User', CLERK.rep, 'GET', undefined, qs);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.deepEqual(res.body.logs.map(l => l.id).sort(), ['rec_itest_secc_rep1', 'rec_itest_secc_rep2'], JSON.stringify(qs));
        assert.equal(res.body.summary.total, 2);
    }
});

test('RECLOG: a Manager reads any rep\'s log, or the org\'s — this org\'s only', async () => {
    const one = await rec(A, 'Manager', CLERK.mgr, 'GET', undefined, { rep: NAME.other });
    assert.deepEqual(one.body.logs.map(l => l.id), ['rec_itest_secc_other_old']);
    const all = await rec(A, 'Manager', CLERK.mgr, 'GET');
    assert.deepEqual(all.body.logs.map(l => l.id).sort(), ['rec_itest_secc_other_old', 'rec_itest_secc_rep1', 'rec_itest_secc_rep2']);
});

test('RECLOG: a caller with no roster row reads nothing, writes nothing and sweeps nothing', async () => {
    const get = await rec(A, 'User', CLERK.ghost, 'GET', undefined, { rep: NAME.rep });
    assert.equal(get.status, 200);
    assert.deepEqual(get.body.logs, []);
    const post = await rec(A, 'User', CLERK.ghost, 'POST', { id: 'rec_itest_secc_ghost', repName: NAME.rep, actionType: 'stale' });
    assert.equal(post.status, 403, JSON.stringify(post.body));
    assert.equal(await recRow('rec_itest_secc_ghost'), undefined);
    const put = await rec(A, 'User', CLERK.ghost, 'PUT');
    assert.deepEqual(put.body.evaluated, []);
    assert.equal((await recRow('rec_itest_secc_other_old')).outcome, 'pending');
});

test('RECLOG: a rep writes only in their own name; a ReadOnly user writes nothing', async () => {
    const res = await rec(A, 'User', CLERK.rep, 'POST', { id: 'rec_itest_secc_post', repName: NAME.other, actionType: 'stale', dealName: 'x' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((await recRow('rec_itest_secc_post')).repName, NAME.rep, 'not the teammate named in the body');
    const ro = await rec(A, 'ReadOnly', CLERK.ro, 'POST', { id: 'rec_itest_secc_ro', repName: NAME.rep, actionType: 'stale' });
    assert.equal(ro.status, 403);
    assert.equal(await recRow('rec_itest_secc_ro'), undefined);
    await db.delete(recommendationLog).where(and(eq(recommendationLog.orgId, A), eq(recommendationLog.id, 'rec_itest_secc_post')));
});

test('RECLOG: a rep\'s sweep leaves a teammate\'s pending row alone; a Manager\'s sweeps it', async () => {
    const rep = await rec(A, 'User', CLERK.rep, 'PUT', undefined, { rep: NAME.other });
    assert.equal(rep.status, 200);
    assert.deepEqual(rep.body.evaluated, [], 'the rep\'s own rows are too new to sweep');
    assert.equal((await recRow('rec_itest_secc_other_old')).outcome, 'pending');
    const mgr = await rec(A, 'Manager', CLERK.mgr, 'PUT', undefined, { rep: NAME.other });
    assert.deepEqual(mgr.body.evaluated, [{ id: 'rec_itest_secc_other_old', outcome: 'ignored' }]);
    assert.equal((await recRow('rec_itest_secc_b')).outcome, 'pending', 'org B untouched');
});
