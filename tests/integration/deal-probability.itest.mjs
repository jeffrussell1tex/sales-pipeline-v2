// tests/integration/deal-probability.itest.mjs
// §0.300 against the real test database (OPEN_ITEMS §4.2's Percents item): a deal's probability is a whole number from 0 to 100, or
// none. The server stored any whole number, and answered a fraction or text with a 500; a move on the board left it where it was.
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

const { handler: deals } = await import('../../netlify/functions/opportunities.mjs');
const { handler: settingsHandler } = await import('../../netlify/functions/settings.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, settings, auditLog } = await import('../../db/schema.js');
const { eq, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_deal_prob_*', and only this file writes to it.
const A = 'itest_deal_prob_A', B = 'itest_deal_prob_B';
const ORGS = [A, B];
const CLERK = 'clerk_itest_deal_prob_rep', ADMIN = 'clerk_itest_deal_prob_admin';
const REP = 'Itest Prob Rep';
const CLOSES = [{ name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 }];
const STAGES_A = [{ name: 'Lead in', weight: 10 }, { name: 'Site visit', weight: 40 }, { name: 'Bid sent', weight: 70 }, ...CLOSES];

const call = async (fn, method, body, { org = A, role = 'User', user = CLERK } = {}) => {
    const r = await fn({ httpMethod: method, headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : null, queryStringParameters: {} }, {}, () => {});
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
const ID = (x) => `itest_deal_prob_${x}`;
const deal = (x, more = {}) => ({ id: ID(x), opportunityName: `Deal ${x}`, salesRep: REP, arr: 10, ...more });
const stored = (x, stage, orgId) => ({ ...deal(x, { stage }), orgId, pipelineId: 'default' });   // a deal as a row of the table
const row = async (x) => (await db.select().from(opportunities).where(eq(opportunities.id, ID(x))))[0];
const stage = async (x) => (await row(x))?.stage;
const settingsRow = async (org) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0];
const stagesOf = async (org) => (await settingsRow(org))?.extra?.funnelStages;
const seedStages = async (org, funnelStages, column) => {
    await db.delete(settings).where(eq(settings.orgId, org));
    if (funnelStages !== 'no row') await db.insert(settings).values({ id: org, orgId: org, extra: funnelStages === undefined ? {} : { funnelStages }, ...(column ? { stages: column } : {}) });
};
const clear = async () => { await db.delete(opportunities).where(inArray(opportunities.orgId, ORGS)); await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS)); };
const reset = async () => { await clear(); await seedStages(A, STAGES_A); };

before(async () => {
    await clear();
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.insert(users).values([
        { id: 'usr_itest_deal_prob_rep', orgId: A, clerkUserId: CLERK, name: REP, email: 'itest-prob-rep@example.test', role: 'User', active: true },
        { id: 'usr_itest_deal_prob_adm', orgId: A, clerkUserId: ADMIN, name: 'Itest Prob Admin', email: 'itest-prob-admin@example.test', role: 'Admin', active: true },
    ]);
});
after(async () => {
    await clear();
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(settings).where(inArray(settings.orgId, ORGS));
});

const prob = async (x) => (await row(x))?.probability;
const WORDS = "A deal's probability is a whole number from 0 to 100, or none.";
const BAD = [150, -1, 50.5, '50.5', 'abc', '50%', true, [50], { n: 50 }, 99999999999, ' 1 2 '];

test('a create: a whole number from 0 to 100 (its digits too), or none; anything else refused in words, nothing written', async () => {
    await reset();
    let n = 0;
    for (const [sent, kept] of [[0, 0], [100, 100], [60, 60], ['40', 40], [' 7 ', 7], [null, null], ['', null], ['  ', null], [undefined, null]]) {
        const x = `c${n += 1}`;
        assert.deepEqual([(await call(deals, 'POST', deal(x, { stage: 'Lead in', probability: sent }))).status, await prob(x)], [201, kept], JSON.stringify(sent));
    }
    for (const bad of BAD) {
        const r = await call(deals, 'POST', deal('x', { stage: 'Lead in', probability: bad }));
        assert.deepEqual([r.status, r.body.field, r.body.error, await row('x')], [400, 'probability', WORDS, undefined], `REGRESSION: a 500, or stored — ${JSON.stringify(bad)}`);
    }
    const batch = await call(deals, 'POST', [deal('b1', { probability: 10 }), deal('b2', { probability: 150 }), deal('b3', { probability: 'abc' }), deal('b4', { probability: '30' })]);
    assert.deepEqual([batch.status, batch.body.field, batch.body.ids, await row('b1'), await row('b4')], [400, 'probability', [ID('b2'), ID('b3')], undefined, undefined]);
    const ok = await call(deals, 'POST', [deal('b1', { probability: 0 }), deal('b4', { probability: '30' }), deal('b5')]);
    assert.deepEqual([ok.status, await prob('b1'), await prob('b4'), await prob('b5')], [201, 0, 30, null]);
});

test('a save: the same; one left out keeps the stored one; what the deal holds is never asked again', async () => {
    await reset();
    await call(deals, 'POST', deal('p', { stage: 'Lead in', probability: 25 }));
    for (const bad of BAD) {
        const r = await call(deals, 'PUT', { id: ID('p'), probability: bad, notes: 'x' });
        assert.deepEqual([r.status, r.body.field, r.body.error, await prob('p'), (await row('p')).notes], [400, 'probability', WORDS, 25, null], JSON.stringify(bad));
    }
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p'), notes: 'y' })).status, await prob('p')], [200, 25]);
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p'), probability: 0 })).status, await prob('p')], [200, 0]);
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p'), probability: null })).status, await prob('p')], [200, null]);
    await db.update(opportunities).set({ probability: 150 }).where(eq(opportunities.id, ID('p')));
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p'), probability: 150, notes: 'held' })).status, await prob('p')], [200, 150], 'a stored one from before this rule');
    assert.equal((await call(deals, 'PUT', { id: ID('p'), probability: 151 })).status, 400);
    await db.update(opportunities).set({ probability: 0 }).where(eq(opportunities.id, ID('p')));
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p'), probability: '' })).status, await prob('p')], [200, null], 'a blank over a 0 is none');
});

test('a bulk save (an import\'s overwrite): the same, row by row; a refusal writes nothing; a row the caller may not save refuses nothing', async () => {
    await reset();
    await call(deals, 'POST', [deal('q1', { probability: 10 }), deal('q2', { probability: 20 }), deal('q3', { probability: 30 })]);
    await db.update(opportunities).set({ probability: 150 }).where(eq(opportunities.id, ID('q2')));
    const ok = await call(deals, 'PUT', [{ id: ID('q1'), probability: 0, notes: 'a' }, { id: ID('q2'), notes: 'b' }, { id: ID('q3'), probability: '35', notes: 'c' }]);
    assert.deepEqual([ok.status, await prob('q1'), await prob('q2'), await prob('q3')], [200, 0, 150, 35], 'a row that leaves it out keeps its own, whatever it is');
    const bad = await call(deals, 'PUT', [{ id: ID('q1'), probability: 50.5, notes: 'd' }, { id: ID('q3'), probability: 40, notes: 'd' }]);
    assert.deepEqual([bad.status, bad.body.field, bad.body.ids, await prob('q3'), (await row('q1')).notes], [400, 'probability', [ID('q1')], 35, 'a'], 'REGRESSION: the whole request a 500');
    await db.update(opportunities).set({ ownerId: 'usr_itest_deal_prob_adm', salesRep: 'Itest Prob Admin' }).where(eq(opportunities.id, ID('q3')));
    const mixed = await call(deals, 'PUT', [{ id: ID('q1'), probability: 5, notes: 'e' }, { id: ID('q3'), probability: 999, notes: 'e' }]);
    assert.deepEqual([mixed.status, mixed.body.updated, mixed.body.forbidden.length, await prob('q1'), await prob('q3')], [200, 1, 1, 5, 35]);
});

test('a stage move that names no probability (the board\'s) takes the new stage\'s default — where the deal stood on the old one\'s, or on none; a rep\'s own stands; a close is its own', async () => {
    await reset();
    const move = async (x, stage, more = {}) => { const r = await call(deals, 'PUT', { id: ID(x), stage, ...more }); assert.equal(r.status, 200, JSON.stringify(r.body)); return prob(x); };
    await call(deals, 'POST', [deal('m1', { stage: 'Lead in', probability: 10 }), deal('m2', { stage: 'Lead in' }), deal('m3', { stage: 'Lead in', probability: 55 })]);
    assert.equal(await move('m1', 'Site visit'), 40, "the stage's default followed");
    assert.equal(await move('m2', 'Bid sent'), 70, 'none: as the deal window has it');
    assert.equal(await move('m3', 'Bid sent'), 55, "a rep's own kept");
    assert.equal(await move('m1', 'Bid sent', { probability: 33 }), 33, 'one named is the one stored');
    assert.equal(await move('m1', 'Site visit', { probability: null }), null);
    assert.equal(await move('m3', 'Closed Won'), 100, 'REGRESSION: a won deal on the board read 10%');
    assert.equal(await move('m3', 'Bid sent'), 70, 'and back: the stage\'s');
    assert.equal(await move('m3', 'Closed Lost'), 0);
    assert.equal(await move('m2', 'bid SENT'), 70, 'no move');
    // The org's own weights, and one it has none for.
    await seedStages(A, [{ name: 'Lead in' }, { name: 'Bid sent', weight: 12.4 }, { name: 'Closed Won', weight: 95 }, { name: 'Closed Lost', weight: 5 }]);
    await db.update(opportunities).set({ stage: 'Lead in', probability: 44 }).where(eq(opportunities.id, ID('m1')));
    assert.equal(await move('m1', 'Bid sent'), 44);
    await db.update(opportunities).set({ stage: 'Lead in', probability: null }).where(eq(opportunities.id, ID('m1')));
    assert.equal(await move('m1', 'Bid sent'), 12, 'a whole number of it');
    assert.equal(await move('m1', 'Lead in'), 12, 'a stage with no default leaves it');
    assert.equal(await move('m1', 'Closed Won'), 95);
});
