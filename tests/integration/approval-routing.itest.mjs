// tests/integration/approval-routing.itest.mjs
// Batch (E1) — who approves is the Admin's choice (state §0.157; Jeff, 2 Oct) —
// against the real test database. Proves, on settings.mjs and quotes.mjs:
//   SAVE     only an Admin saves the choice; a named person must be an ACTIVE Admin
//            or Manager of THIS org (another org's, a rep, a deactivated Manager is
//            refused); a mode is role or person; a refused save stores nothing
//   CLEAN    what is stored is cleaned for the mode — ascending bands, the last
//            open-ended, a backup equal to the approver dropped, the other mode's
//            names gone
//   PERSON   the tier's approver and backup decide; another Manager is refused and
//            told who decides; an Admin always may
//   ROLE     an Admin-only tier refuses a Manager; changing the mode drops the people
//   ORG B    another org's settings and quotes never move
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates.
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
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_route_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: settingsFn } = await import('../../netlify/functions/settings.mjs');
const { handler: quotesFn }   = await import('../../netlify/functions/quotes.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, quotes, auditLog, settings } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_route_*', and only this file writes to it.
const A = 'itest_route_A', B = 'itest_route_B';
const KEYS = ['admin', 'mgr1', 'mgr2', 'mgr3', 'rep', 'idle', 'mgrB'];
const CLERK = Object.fromEntries(KEYS.map(k => [k, `clerk_itest_route_${k}`]));
const USR = Object.fromEntries(KEYS.map(k => [k, `usr_itest-route-${k}`]));
const NAME = (k) => `Itest Route ${k}`;
const OPP = { mine: 'opp_itest_route_mine', b: 'opp_itest_route_b' };
const Q = {
    t2a: 'q_itest_route_t2a', t2b: 'q_itest_route_t2b', t2c: 'q_itest_route_t2c', t2d: 'q_itest_route_t2d',
    top: 'q_itest_route_top', b: 'q_itest_route_b',
};
const lines = (disc) => [{ productId: 'p_itest_route', productName: 'Itest Platform', productType: 'recurring', unit: 'month', listPrice: 100, quantity: 2, discountPct: disc }];

const ev = (org, role, user, method = 'GET', body) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const roleOf = { admin: 'Admin', mgr1: 'Manager', mgr2: 'Manager', mgr3: 'Manager', rep: 'User', idle: 'Manager', mgrB: 'Manager' };
const asSettings = (k, method, body, org = A) => settingsFn(ev(org, roleOf[k], CLERK[k], method, body)).then(parse);
const asQuotes   = (k, method, body, org = A) => quotesFn(ev(org, roleOf[k], CLERK[k], method, body)).then(parse);
const row = async (id) => (await db.select().from(quotes).where(eq(quotes.id, id)))[0];
const stored = async (org = A) => (await asSettings(org === A ? 'admin' : 'mgrB', 'GET', undefined, org)).body.settings;

const PERSON_TIERS = [
    { id: 'top', label: 'Top approval', maxDiscount: 1, approverUserId: USR.mgr2, backupUserId: USR.mgr2, approverRole: 'Admin' },
    { id: 'rep', label: 'Rep', maxDiscount: 0.1 },
    { id: 'mgr', label: 'Mgr approval', maxDiscount: 0.2, approverUserId: USR.mgr1, backupUserId: USR.mgr2, fallback: 'CEO' },
];

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(quotes).where(eq(quotes.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await cleanup();
    await db.insert(users).values(KEYS.map(k => ({
        id: USR[k], clerkUserId: CLERK[k], orgId: k === 'mgrB' ? B : A, name: NAME(k), email: `route-${k}@itest.local`,
        role: roleOf[k], active: k !== 'idle',
    })));
    invalidateRoster();
    const opp = (id, org) => ({ id, orgId: org, ownerId: org === A ? USR.rep : null, salesRep: org === A ? NAME('rep') : '', opportunityName: id, account: 'Itest Co', pipelineId: 'default', stage: 'Proposal', arr: '1000.00' });
    await db.insert(opportunities).values([opp(OPP.mine, A), opp(OPP.b, B)]);
    const q = (id, disc, org = A) => ({
        id, orgId: org, opportunityId: org === A ? OPP.mine : OPP.b, quoteNumber: 'Q-2026-7' + (10 + Object.values(Q).indexOf(id)),
        version: 1, name: id, status: 'Pending Approval', lineItems: lines(disc), createdBy: NAME('rep'),
    });
    await db.insert(quotes).values([q(Q.t2a, 15), q(Q.t2b, 15), q(Q.t2c, 15), q(Q.t2d, 15), q(Q.top, 25), q(Q.b, 15, B)]);
});
after(cleanup);

test('SAVE: only an Admin saves who approves; a named person must be an active Admin or Manager of THIS org; a mode is role or person — a refused save stores nothing', async () => {
    assert.equal((await asSettings('mgr1', 'PUT', { approvalRouting: 'person', approvalTiers: PERSON_TIERS })).status, 403, 'a Manager');
    for (const [who, why] of [['mgrB', 'another org\'s Manager'], ['rep', 'a rep'], ['idle', 'a deactivated Manager']]) {
        const tiers = [{ id: 'rep', maxDiscount: 0.1 }, { id: 'mgr', maxDiscount: 1, approverUserId: USR[who] }];
        const res = await asSettings('admin', 'PUT', { approvalRouting: 'person', approvalTiers: tiers });
        assert.equal(res.status, 400, why);
        assert.match(res.body.error, /active Admin or Manager in this workspace/, why);
    }
    const bad = await asSettings('admin', 'PUT', { approvalRouting: 'boss', approvalTiers: PERSON_TIERS });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /by role or by person/);
    const s = await stored();
    assert.equal(s?.approvalRouting ?? null, null, 'nothing stored');
    assert.equal(s?.approvalTiers ?? null, null);
});

test('CLEAN: what is stored is cleaned for its mode — ascending, open-ended, a backup equal to the approver dropped, the other mode\'s names gone', async () => {
    const res = await asSettings('admin', 'PUT', { approvalRouting: 'person', approvalTiers: PERSON_TIERS });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const s = await stored();
    assert.equal(s.approvalRouting, 'person');
    assert.deepEqual(s.approvalTiers.map(t => [t.id, t.maxDiscount, t.approverUserId, t.backupUserId, t.approverRole]), [
        ['rep', 0.1, null, null, null],
        ['mgr', 0.2, USR.mgr1, USR.mgr2, null],
        ['top', 1, USR.mgr2, null, null],
    ]);
    assert.ok(s.approvalTiers.every(t => !('fallback' in t)), 'nothing the page no longer offers');
    assert.equal((await stored(B))?.approvalRouting ?? null, null, 'org B untouched');
});

test('PERSON: the tier\'s approver and backup decide; another Manager is refused and told who decides; an Admin always may', async () => {
    const refused = await asQuotes('mgr3', 'PUT', { id: Q.t2a, status: 'Approved' });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, `Forbidden: Mgr approval is decided by ${NAME('mgr1')} (backup: ${NAME('mgr2')}), or an Admin.`);
    assert.equal((await asQuotes('mgr3', 'PUT', { id: Q.t2a, status: 'Draft', sendBack: true, sendBackNote: 'not mine to say' })).status, 403, 'nor send it back');
    assert.equal((await row(Q.t2a)).status, 'Pending Approval', 'unchanged');
    assert.equal((await asQuotes('mgr1', 'PUT', { id: Q.t2a, status: 'Approved' })).status, 200, 'the approver');
    assert.equal((await asQuotes('mgr2', 'PUT', { id: Q.t2b, status: 'Approved' })).status, 200, 'the backup, at any time');
    assert.equal((await asQuotes('admin', 'PUT', { id: Q.t2c, status: 'Approved' })).status, 200, 'an Admin, always');
    const top = await asQuotes('mgr1', 'PUT', { id: Q.top, status: 'Approved' });
    assert.equal(top.status, 403, 'the top tier is mgr2\'s');
    assert.equal(top.body.error, `Forbidden: Top approval is decided by ${NAME('mgr2')}, or an Admin.`);
    assert.equal((await row(Q.t2a)).approvedBy, NAME('mgr1'));
});

test('ROLE: an Admin-only tier refuses a Manager; changing the mode drops the people named; org B never moves', async () => {
    const res = await asSettings('admin', 'PUT', { approvalRouting: 'role', approvalTiers: [
        { id: 'rep', label: 'Rep', maxDiscount: 0.1 },
        { id: 'mgr', label: 'Mgr approval', maxDiscount: 0.2, approverRole: 'Admin', approverUserId: USR.mgr1 },
        { id: 'top', label: 'Top approval', maxDiscount: 1, approverRole: 'Manager', backupRole: 'Admin' },
    ] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const s = await stored();
    assert.equal(s.approvalRouting, 'role');
    assert.ok(s.approvalTiers.every(t => t.approverUserId === null && t.backupUserId === null), 'the people named by person are gone');
    const refused = await asQuotes('mgr1', 'PUT', { id: Q.t2d, status: 'Approved' });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, 'Forbidden: Mgr approval is decided by an Admin.');
    assert.equal((await asQuotes('admin', 'PUT', { id: Q.t2d, status: 'Approved' })).status, 200);
    assert.equal((await asQuotes('mgr1', 'PUT', { id: Q.top, status: 'Approved' })).status, 200, 'the Manager tier');
    assert.equal((await row(Q.b)).status, 'Pending Approval', 'org B\'s quote');
    assert.equal((await stored(B))?.approvalRouting ?? null, null, 'org B\'s settings');
});
