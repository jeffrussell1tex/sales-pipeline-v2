// tests/integration/owner-kept.itest.mjs
// A save that reassigns nothing keeps its owner (state §0.193) — against the real test
// database, the real role gate, the real deal and task endpoints.
//
// Prod, 9 Oct: two members of Jeff's org read "Jeff Russell" ('Jeff Russell' and
// 'Jeff Russell   '). Every update resolved the rep name it was sent, changed or not,
// so every save of a deal naming Jeff Russell answered 409 — the Closed Lost dialog
// stuck. And after a member's rename, the next save of their record resolved the OLD
// name, now someone else's, and moved the record. Proves:
//   KEPT     a deal and a task whose rep is unchanged save 200 and keep their owner,
//            though two members share that name (any case, end spaces)
//   RENAME   a renamed member's record, saved with its old name, stays theirs — not
//            moved to the member who now holds the old name
//   LEGACY   a row with no owner id still resolves its name (it keeps healing)
//   REASSIGN a new name resolves; a shared name answers 409 in words that say what to
//            do and carry no member's email, candidates by id only, and nothing changes
//   ISOLATION org B's member of the same name is never counted in org A
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
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_ownkept_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => {}, emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }) },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const { handler: opps }  = await import('../../netlify/functions/opportunities.mjs');
const { handler: tasksFn } = await import('../../netlify/functions/tasks.mjs');
const { handler: mergeFn } = await import('../../netlify/functions/merge.mjs');
const { db } = await import('../../db/index.js');
const { opportunities, tasks, users, auditLog, settings, accounts, mergeLog } = await import('../../db/schema.js');
const { eq, inArray } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_ownkept_*', and only this file writes to it.
const A = 'itest_ownkept_A', B = 'itest_ownkept_B';
const ORGS = [A, B];
const U = {
    twin:   'usr_itest-ownkept-twin',     // 'Twin Name' — the Admin who saves
    twin2:  'usr_itest-ownkept-twin2',    // 'twin name   ' — the same name to the resolver
    solo:   'usr_itest-ownkept-solo',     // 'Solo Rep'
    renNew: 'usr_itest-ownkept-ren-new',  // renamed from 'Ren Old' to 'Ren New'
    renOld: 'usr_itest-ownkept-ren-old',  // now holds 'Ren Old'
    twinB:  'usr_itest-ownkept-twin-b',   // org B's 'Twin Name'
};
const ADMIN = { org: A, role: 'Admin', user: 'clerk_itest_ownkept_twin' };
const D = {
    twin: 'opp_itest_ownkept_twin', ren: 'opp_itest_ownkept_ren', legacy: 'opp_itest_ownkept_legacy', move: 'opp_itest_ownkept_move',
    b1: 'opp_itest_ownkept_bulk_1', b2: 'opp_itest_ownkept_bulk_2', b3: 'opp_itest_ownkept_bulk_3', b4: 'opp_itest_ownkept_bulk_4',
    b5: 'opp_itest_ownkept_bulk_5',
};
const ACCT = { surv: 'acct_itest_ownkept_surv', arch: 'acct_itest_ownkept_arch' };
const TASK = 'task_itest_ownkept_twin';

const ev = (who, method, body) => ({
    httpMethod: method,
    headers: { 'x-test-org': who.org, 'x-test-role': who.role, 'x-test-user': who.user, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    queryStringParameters: {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const deal = async (id) => (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0];
const task = async (id) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0];
// The deal window's save: the whole stored row back, one field changed.
const resave = async (id, change) => {
    const { createdAt: _c, updatedAt: _u, orgId: _o, ...row } = await deal(id);
    return parse(await opps(ev(ADMIN, 'PUT', { ...row, ...change })));
};

const cleanup = async () => {
    for (const t of [opportunities, tasks, accounts, mergeLog, auditLog, settings, users]) await db.delete(t).where(inArray(t.orgId, ORGS));
};

before(async () => {
    await cleanup();
    const u = (id, org, name, role, clerk = null) => ({ id, orgId: org, name, email: `${id}@itest-ownkept.local`, role, clerkUserId: clerk });
    await db.insert(users).values([
        u(U.twin, A, 'Twin Name', 'Admin', ADMIN.user), u(U.twin2, A, 'twin name   ', 'User'),
        u(U.solo, A, 'Solo Rep', 'User'), u(U.renNew, A, 'Ren New', 'User'), u(U.renOld, A, 'Ren Old', 'User'),
        u(U.twinB, B, 'Twin Name', 'User'),
    ]);
    invalidateRoster(A); invalidateRoster(B);
    const o = (id, ownerId, salesRep) => ({ id, orgId: A, pipelineId: 'default', stage: 'Proposal', opportunityName: id, account: 'Ownkept Co', arr: '1000.00', ownerId, salesRep });
    await db.insert(opportunities).values([
        o(D.twin, U.twin, 'Twin Name'),
        o(D.ren, U.renNew, 'Ren Old'),          // saved before its owner was renamed
        o(D.legacy, null, 'Solo Rep'),          // saved before ids
        o(D.move, U.twin, 'Twin Name'),
        o(D.b1, U.solo, 'Solo Rep'), o(D.b2, U.twin, 'Twin Name'), o(D.b3, U.twin, 'Twin Name'), o(D.b4, U.solo, 'Solo Rep'),
        o(D.b5, U.solo, 'Solo Rep'),
    ]);
    await db.insert(accounts).values([
        { id: ACCT.surv, orgId: A, name: 'Ownkept Survivor Co', accountOwner: 'Solo Rep', ownerId: U.solo },
        { id: ACCT.arch, orgId: A, name: 'Ownkept Archived Co', accountOwner: 'Ren New', ownerId: U.renNew },
    ]);
    await db.insert(tasks).values({ id: TASK, orgId: A, title: 'Ownkept task', assignedTo: 'TWIN NAME ', ownerId: U.twin, status: 'Open' });
});
after(cleanup);

test('KEPT: a deal whose rep is unchanged saves and keeps its owner, though two members share the name (prod, 9 Oct: Closed Lost)', async () => {
    const r = await resave(D.twin, { stage: 'Closed Lost', lostCategory: 'Pricing / Budget', lostDate: '2026-10-09' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await deal(D.twin);
    assert.equal(row.stage, 'Closed Lost');
    assert.equal(row.ownerId, U.twin, 'its owner kept, never resolved again');
    // Another spelling is a pick, not the stored text: it reaches the resolver, which
    // cannot tell the two apart — refused, in words that say what to do, never kept.
    const spaced = await resave(D.twin, { salesRep: '  twin NAME ', nextSteps: 'x' });
    assert.equal(spaced.status, 409, JSON.stringify(spaced.body));
    assert.equal((await deal(D.twin)).ownerId, U.twin);
});

test('KEPT: a task whose assignee is unchanged saves and keeps its owner', async () => {
    const { createdAt: _c, updatedAt: _u, orgId: _o, ...row } = await task(TASK);
    const r = parse(await tasksFn(ev(ADMIN, 'PUT', { ...row, title: 'Ownkept task, edited' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const t = await task(TASK);
    assert.equal(t.title, 'Ownkept task, edited');
    assert.equal(t.ownerId, U.twin);
});

test('RENAME: a renamed member\'s deal, saved with its old name, stays theirs — not moved to who now holds the old name', async () => {
    const r = await resave(D.ren, { nextSteps: 'Call Thursday' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await deal(D.ren)).ownerId, U.renNew, 'not U.renOld');
});

test('LEGACY: a deal saved before ids still resolves its rep\'s name on save', async () => {
    const r = await resave(D.legacy, { nextSteps: 'Send the deck' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await deal(D.legacy)).ownerId, U.solo);
});

test('REASSIGN: a new name resolves; a shared name answers 409 in words that say what to do, no email, and changes nothing', async () => {
    const moved = await resave(D.move, { salesRep: 'Solo Rep' });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal((await deal(D.move)).ownerId, U.solo);
    const shared = await resave(D.move, { salesRep: 'Twin Name' });
    assert.equal(shared.status, 409, JSON.stringify(shared.body));
    assert.equal(shared.body.ambiguous, true);
    assert.match(shared.body.error, /^2 members of this organization are named "Twin Name", so the app cannot tell which one is meant\. An Admin can rename one of them in Settings → Users/);
    assert.ok(!shared.body.error.includes('@'), 'no member\'s email in the words');
    assert.deepEqual(shared.body.candidates.map((c) => Object.keys(c)), [['id'], ['id']], 'candidates by id only');
    assert.deepEqual(shared.body.candidates.map((c) => c.id).sort(), [U.twin, U.twin2].sort(), 'this org\'s two — never org B\'s');
    const row = await deal(D.move);
    assert.equal(row.ownerId, U.solo);
    assert.equal(row.salesRep, 'Solo Rep', 'nothing written');
});

test('BULK: a CSV overwrite moves the owner id with the rep name — kept where unchanged, an ambiguous name keeps and reports, an unknown name unassigns and reports', async () => {
    const r = parse(await opps(ev(ADMIN, 'PUT', [
        { id: D.b1, salesRep: 'Ren New' },        // changed: resolves
        { id: D.b2, salesRep: 'Twin Name' },      // the stored text: kept, though two members share it
        { id: D.b3, salesRep: 'twin name' },      // another spelling of the shared name: ambiguous
        { id: D.b4, salesRep: 'Nobody Here' },    // no member holds it
        { id: D.b5, salesRep: 'Twin Name' },      // moving Solo's deal to the shared name: ambiguous
    ])));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.updated, 5);
    assert.deepEqual(r.body.ambiguousOwners, ['twin name', 'Twin Name']);
    // The review (§0.193): an ambiguous row keeps its stored NAME with its stored id — it
    // wrote the new name beside the old id, and an unchanged name then kept that pair.
    const b5 = await deal(D.b5);
    assert.equal(b5.salesRep, 'Solo Rep');
    assert.equal(b5.ownerId, U.solo);
    assert.deepEqual(r.body.unmatchedOwners, ['Nobody Here']);
    assert.equal((await deal(D.b1)).ownerId, U.renNew, 'the id moved with the name');
    assert.equal((await deal(D.b2)).ownerId, U.twin);
    assert.equal((await deal(D.b3)).ownerId, U.twin, 'an ambiguous name keeps the stored owner');
    assert.equal((await deal(D.b4)).ownerId, null);
    // ...and the next whole-row save of the moved deal keeps its NEW owner.
    const again = await resave(D.b1, { nextSteps: 'after the import' });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal((await deal(D.b1)).ownerId, U.renNew);
});

test('MERGE: keeping the archived account\'s owner keeps its owner id; undo puts the survivor\'s back', async () => {
    const [s] = await db.select().from(accounts).where(eq(accounts.id, ACCT.surv));
    const [a] = await db.select().from(accounts).where(eq(accounts.id, ACCT.arch));
    // An owner name that is neither record's is refused, and nothing is written.
    const neither = parse(await mergeFn(ev(ADMIN, 'POST', {
        entityType: 'account', survivorId: ACCT.surv, archivedId: ACCT.arch,
        resolvedFields: { accountOwner: 'Twin Name' }, survivorUpdatedAt: s.updatedAt, archivedUpdatedAt: a.updatedAt,
    })));
    assert.equal(neither.status, 400, JSON.stringify(neither.body));
    assert.equal((await db.select().from(accounts).where(eq(accounts.id, ACCT.arch)))[0].mergeArchived, false, 'not merged');
    const m = parse(await mergeFn(ev(ADMIN, 'POST', {
        entityType: 'account', survivorId: ACCT.surv, archivedId: ACCT.arch,
        resolvedFields: { accountOwner: 'Ren New' },
        survivorUpdatedAt: s.updatedAt, archivedUpdatedAt: a.updatedAt,
    })));
    assert.equal(m.status, 200, JSON.stringify(m.body));
    const [merged] = await db.select().from(accounts).where(eq(accounts.id, ACCT.surv));
    assert.equal(merged.accountOwner, 'Ren New');
    assert.equal(merged.ownerId, U.renNew, 'the id with the name');
    const u = parse(await mergeFn(ev(ADMIN, 'POST', { reverse: true, mergeLogId: m.body.mergeLogId })));
    assert.equal(u.status, 200, JSON.stringify(u.body));
    const [undone] = await db.select().from(accounts).where(eq(accounts.id, ACCT.surv));
    assert.equal(undone.accountOwner, 'Solo Rep');
    assert.equal(undone.ownerId, U.solo, 'undo restores the id with the name');
});
