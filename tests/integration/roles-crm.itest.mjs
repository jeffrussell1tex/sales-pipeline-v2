// tests/integration/roles-crm.itest.mjs
// The Dispatcher role against the real test database (state §0.151). Proves, on
// all six CRM endpoints: a Dispatcher READS the whole org (every owner's row and
// the unassigned ones) and WRITES nothing — POST, PUT and DELETE refused by name,
// the row read back unchanged; a Technician reads NOTHING; a rep still reads her
// own rows plus unassigned ones and never another rep's; a Manager reads all;
// org B's rows never reach anyone in org A, and a Dispatcher in B reads only B.
// And the directory: a Dispatcher gets role, team and territory (the Reports
// rosters need them), a rep still gets names alone, neither gets an email.
//
// UNLIKE the older suites, this one does not hand-write the gate. The auth.mjs
// mock fakes the SIGN-IN only and re-exports the REAL requireWrite / requireRole
// (_roleGate.mjs, pure) and the real predicates (src/utils/roles.js) — the older
// suites' copies of requireWrite let any role they did not name write.
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
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_roles_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
// The write paths fire these; nothing here should reach them (every write is
// refused first), and if one did it must not leave the machine.
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async (o) => { mails.push(o); return { success: true }; }, emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});

const FN = {};
for (const f of ['accounts', 'contacts', 'tasks', 'activities', 'leads', 'opportunities', 'users']) {
    FN[f] = (await import(`../../netlify/functions/${f}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { users } = schema;
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_roles_*', and only this file writes to it.
const A = 'itest_roles_A', B = 'itest_roles_B';
const CLERK = { rep: 'clerk_itest_roles_rep', other: 'clerk_itest_roles_other', disp: 'clerk_itest_roles_disp', tech: 'clerk_itest_roles_tech', mgr: 'clerk_itest_roles_mgr' };
const USR   = { rep: 'usr_itest-roles-rep', other: 'usr_itest-roles-other', disp: 'usr_itest-roles-disp', tech: 'usr_itest-roles-tech', mgr: 'usr_itest-roles-mgr', dispB: 'usr_itest-roles-disp-b' };

// entity → [endpoint, the response key, the table, the minimal row]
const ENTITIES = {
    account:     ['accounts',      'accounts',      schema.accounts,      (id) => ({ name: 'Acct ' + id })],
    contact:     ['contacts',      'contacts',      schema.contacts,      (id) => ({ firstName: 'Con', lastName: id })],
    task:        ['tasks',         'tasks',         schema.tasks,         (id) => ({ title: 'Task ' + id })],
    activity:    ['activities',    'activities',    schema.activities,    (id) => ({ type: 'Call', notes: 'Act ' + id, date: '2026-09-30' })],
    lead:        ['leads',         'leads',         schema.leads,         (id) => ({ firstName: 'Lead', lastName: id })],
    opportunity: ['opportunities', 'opportunities', schema.opportunities, (id) => ({ opportunityName: 'Opp ' + id, account: 'Acct', pipelineId: 'default', stage: 'Qualification' })],
};
// Per entity, in A: the rep's row, another rep's row, an unassigned row; in B: one row.
const idsOf = (ent) => ({ mine: `itest_roles_${ent}_mine`, other: `itest_roles_${ent}_other`, none: `itest_roles_${ent}_none`, b: `itest_roles_${ent}_b` });

const ev = (org, role, user, method = 'GET', body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const read = async (ent, org, role, user) => {
    const [fn, key] = ENTITIES[ent];
    const res = await FN[fn](ev(org, role, user));
    assert.equal(res.statusCode, 200, `${ent} GET as ${role}: ${res.body}`);
    return (JSON.parse(res.body)[key] || []).map(r => r.id).filter(id => id.startsWith('itest_roles_'));
};

const cleanup = async () => {
    for (const o of [A, B]) {
        for (const [, , table] of Object.values(ENTITIES)) await db.delete(table).where(eq(table.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: USR.rep,   clerkUserId: CLERK.rep,   orgId: A, name: 'Itest Roles Rep',   email: 'roles-rep@itest.local',   role: 'User',       team: 'West',  territory: 'North' },
        { id: USR.other, clerkUserId: CLERK.other, orgId: A, name: 'Itest Roles Other', email: 'roles-other@itest.local', role: 'User',       team: 'East',  territory: 'South' },
        { id: USR.disp,  clerkUserId: CLERK.disp,  orgId: A, name: 'Itest Roles Disp',  email: 'roles-disp@itest.local',  role: 'Dispatcher', team: 'Field', territory: 'North' },
        { id: USR.tech,  clerkUserId: CLERK.tech,  orgId: A, name: 'Itest Roles Tech',  email: 'roles-tech@itest.local',  role: 'Technician', team: 'Field', territory: 'North' },
        { id: USR.mgr,   clerkUserId: CLERK.mgr,   orgId: A, name: 'Itest Roles Mgr',   email: 'roles-mgr@itest.local',   role: 'Manager' },
        { id: USR.dispB, clerkUserId: CLERK.disp,  orgId: B, name: 'Itest Roles Disp B', email: 'roles-disp-b@itest.local', role: 'Dispatcher' },
    ]);
    invalidateRoster();
    for (const [ent, [, , table, base]] of Object.entries(ENTITIES)) {
        const ids = idsOf(ent);
        await db.insert(table).values([
            { id: ids.mine,  orgId: A, ownerId: USR.rep,   ...base(ids.mine) },
            { id: ids.other, orgId: A, ownerId: USR.other, ...base(ids.other) },
            { id: ids.none,  orgId: A, ownerId: null,      ...base(ids.none) },
            { id: ids.b,     orgId: B, ownerId: null,      ...base(ids.b) },
        ]);
    }
});
after(cleanup);

// ── reads ────────────────────────────────────────────────────────────────────

test('a Dispatcher reads the WHOLE org on all six — every owner\'s row and the unassigned — and nothing of org B', async () => {
    for (const ent of Object.keys(ENTITIES)) {
        const ids = idsOf(ent);
        const got = await read(ent, A, 'Dispatcher', CLERK.disp);
        assert.deepEqual(got.sort(), [ids.mine, ids.none, ids.other].sort(), ent);
    }
});

test('a Technician reads NOTHING on all six (crmReadScope none) — not even the unassigned rows', async () => {
    for (const ent of Object.keys(ENTITIES)) {
        assert.deepEqual(await read(ent, A, 'Technician', CLERK.tech), [], ent);
    }
});

test('a rep reads her own rows and never another rep\'s; unassigned rows too — except deals, hidden by default', async () => {
    // Deals: settings.extra.unassignedDealsVisibleToReps is OFF when absent (§0.151,
    // Jeff: "Reps should only see their own deals"); this org has no settings row.
    // The other five keep the standing rule (leads through their own switch, ON when absent).
    for (const ent of Object.keys(ENTITIES)) {
        const ids = idsOf(ent);
        const got = await read(ent, A, 'User', CLERK.rep);
        const want = ent === 'opportunity' ? [ids.mine] : [ids.mine, ids.none];
        assert.deepEqual(got.sort(), want.sort(), ent);
    }
});

test('a Manager reads the whole org, as before', async () => {
    for (const ent of Object.keys(ENTITIES)) {
        const ids = idsOf(ent);
        assert.deepEqual((await read(ent, A, 'Manager', CLERK.mgr)).sort(), [ids.mine, ids.none, ids.other].sort(), ent);
    }
});

test('a Dispatcher in org B reads only B', async () => {
    for (const ent of Object.keys(ENTITIES)) {
        assert.deepEqual(await read(ent, B, 'Dispatcher', CLERK.disp), [idsOf(ent).b], ent);
    }
});

// ── writes ───────────────────────────────────────────────────────────────────

test('a Dispatcher WRITES nothing: POST, PUT and DELETE refused by name on all six, the rows unchanged', async () => {
    for (const [ent, [fn, , table, base]] of Object.entries(ENTITIES)) {
        const ids = idsOf(ent);
        const before = (await db.select().from(table).where(eq(table.id, ids.none)))[0];
        const attempts = [
            ['POST',   { id: `itest_roles_${ent}_new`, ...base('new') }, {}],
            ['PUT',    { id: ids.none, ...base('changed'), notes: 'changed by a dispatcher' }, { id: ids.none }],
            ['DELETE', undefined, { id: ids.none }],
        ];
        for (const [method, body, qs] of attempts) {
            const res = await FN[fn](ev(A, 'Dispatcher', CLERK.disp, method, body, qs));
            assert.equal(res.statusCode, 403, `${ent} ${method}: ${res.body}`);
            assert.match(JSON.parse(res.body).error, /Dispatcher can view CRM records but not change them/, `${ent} ${method}`);
        }
        const after = (await db.select().from(table).where(eq(table.id, ids.none)))[0];
        assert.deepEqual(after, before, `${ent}: the row is untouched`);
        const created = await db.select().from(table).where(eq(table.id, `itest_roles_${ent}_new`));
        assert.equal(created.length, 0, `${ent}: nothing was created`);
    }
    assert.equal(mails.length, 0, 'no refused write sent anything');
});

// ── the directory ────────────────────────────────────────────────────────────

test('the directory: a Dispatcher gets role, team and territory; a rep gets names alone; neither gets an email', async () => {
    const asDisp = JSON.parse((await FN.users(ev(A, 'Dispatcher', CLERK.disp))).body);
    assert.equal(asDisp.directory, true, 'still the directory, not the admin record');
    const disp = asDisp.users.find(u => u.id === USR.rep);
    assert.deepEqual(disp, { id: USR.rep, name: 'Itest Roles Rep', active: true, role: 'User', userType: 'User', team: 'West', territory: 'North' });
    assert.ok(asDisp.users.every(u => !('email' in u) && !('quota' in u)), 'no email or quota');
    assert.equal(asDisp.users.find(u => u.id === USR.tech)?.role, 'Technician', 'the rosters can tell a technician from a rep');

    const asRep = JSON.parse((await FN.users(ev(A, 'User', CLERK.rep))).body);
    assert.deepEqual(asRep.users.find(u => u.id === USR.other), { id: USR.other, name: 'Itest Roles Other', active: true }, 'a rep still gets names alone');
    assert.ok(asRep.users.every(u => Object.keys(u).sort().join() === 'active,id,name'), 'no role, team or territory for a rep');
});
