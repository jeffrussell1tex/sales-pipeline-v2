// tests/integration/dispatch-access.itest.mjs
// The one Dispatch gate (state §0.152) against the real test database, at RUN
// time on every endpoint behind it — the unit suite pins the wiring by scan and
// runs the decision; this proves each handler actually calls it. Proves, on
// the eight dispatch-* endpoints and invoices: a Dispatcher reads; a sales rep
// is refused by name while her org keeps reps out, and reads where the org opens
// Dispatch to reps; ReadOnly reads; an Admin is refused in a workspace with the
// module OFF (no settings row at all). And the writes: a Dispatcher creates, a
// rep, ReadOnly and a Technician are refused with the row never written. And
// the quote card's read: a rep's GET on quote-to-job answers even while
// Dispatch is closed to reps.
//
// The auth mock fakes the SIGN-IN only; the gate is the real one (it does not
// import auth.mjs), and requireWrite / requireRole are the real ones too.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Dispatcher';
            return { userId: 'clerk_itest_dacc_' + userRole, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// The job endpoint pulls the senders in; nothing here schedules, so nothing sends.
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async (o) => { mails.push(o); return { success: true }; }, emailTemplates: {} },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const ENDPOINTS = ['dispatch-customers', 'dispatch-equipment', 'dispatch-jobs', 'dispatch-plan-visits', 'dispatch-schedule-blocks',
                   'dispatch-service-plans', 'dispatch-technicians', 'dispatch-vehicles', 'invoices'];
const FN = {};
for (const name of [...ENDPOINTS, 'quote-to-job']) FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
const { db } = await import('../../db/index.js');
const { settings, dispatchEquipment } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_dacc_*'.
const ON = 'itest_dacc_on', REPS = 'itest_dacc_reps', OFF = 'itest_dacc_off';
const ev = (org, role, method = 'GET', body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const hit = async (name, org, role, method, body, qs) => {
    const res = await FN[name](ev(org, role, method, body, qs));
    return { status: res.statusCode, error: (() => { try { return JSON.parse(res.body || '{}').error; } catch { return undefined; } })() };
};

const cleanup = async () => {
    for (const o of [ON, REPS, OFF]) {
        await db.delete(dispatchEquipment).where(eq(dispatchEquipment.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
    }
};
before(async () => {
    await cleanup();
    await db.insert(settings).values([
        { id: 'settings_' + ON,   orgId: ON,   extra: { dispatchEnabled: true } },
        { id: 'settings_' + REPS, orgId: REPS, extra: { dispatchEnabled: true, repsCanUseDispatch: true } },
        // OFF has no settings row at all: never configured = the module off.
    ]);
});
after(cleanup);

test('every endpoint behind the gate: a Dispatcher reads; a rep is refused by name; ReadOnly reads', async () => {
    for (const name of ENDPOINTS) {
        assert.equal((await hit(name, ON, 'Dispatcher')).status, 200, `${name}: a Dispatcher`);
        const rep = await hit(name, ON, 'User');
        assert.equal(rep.status, 403, `${name}: a rep while the org keeps reps out`);
        assert.match(rep.error, /not open to sales reps/, name);
        assert.equal((await hit(name, ON, 'ReadOnly')).status, 200, `${name}: ReadOnly reads`);
    }
});

test('where the org opens Dispatch to reps, a rep reads every endpoint', async () => {
    for (const name of ENDPOINTS) assert.equal((await hit(name, REPS, 'User')).status, 200, name);
});

test('the module OFF refuses everyone — an Admin included — on every endpoint', async () => {
    for (const name of ENDPOINTS) {
        const r = await hit(name, OFF, 'Admin');
        assert.equal(r.status, 403, name);
        assert.match(r.error, /Dispatch is not enabled for this workspace/, name);
    }
});

test('writes: a Dispatcher creates; a rep, ReadOnly and a Technician are refused and nothing is written', async () => {
    const made = await hit('dispatch-equipment', ON, 'Dispatcher', 'POST', { id: 'eq_itest_dacc_disp', name: 'Itest Pump' });
    assert.equal(made.status, 201, made.error);
    for (const [role, pattern] of [['User', /not open to sales reps/], ['ReadOnly', /read-only/], ['Technician', /technicians may only update/]]) {
        const id = `eq_itest_dacc_${role.toLowerCase()}`;
        const r = await hit('dispatch-equipment', ON, role, 'POST', { id, name: 'Itest Refused' });
        assert.equal(r.status, 403, role);
        assert.match(r.error, pattern, role);
        assert.equal((await db.select().from(dispatchEquipment).where(eq(dispatchEquipment.id, id))).length, 0, `${role}: nothing written`);
    }
    const repsMade = await hit('dispatch-equipment', REPS, 'User', 'POST', { id: 'eq_itest_dacc_rep_open', name: 'Itest Rep Pump' });
    assert.equal(repsMade.status, 201, 'a rep writes where the org opens Dispatch to reps');
    assert.equal(mails.length, 0);
});

test('the quote card: a rep\'s GET on quote-to-job answers while Dispatch is closed to reps; her POST does not', async () => {
    const get = await FN['quote-to-job'](ev(ON, 'User', 'GET', undefined, { quoteId: 'q_itest_dacc_none' }));
    assert.equal(get.statusCode, 200);
    assert.deepEqual(JSON.parse(get.body), { job: null });
    const post = await hit('quote-to-job', ON, 'User', 'POST', { quoteId: 'q_itest_dacc_none' });
    assert.equal(post.status, 403);
    assert.match(post.error, /not open to sales reps/);
});
