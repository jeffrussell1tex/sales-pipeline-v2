// tests/integration/deal-pipeline.itest.mjs
// §0.297 against the real test database (OPEN_ITEMS §4.2, "Left by §0.296" (a), (b); Jeff, 1 Oct: "Leave the data; fix the
// product"): a deal's pipeline is one of its org's. The server took any pipelineId, stored the literal 'default' for none —
// a pipeline an org whose own ids differ does not have — and wrote 'default' over the stored one when a save named it
// blank; and Settings dropped a pipeline whose open deals still named it.
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

// ORG NAMESPACE: this file owns 'itest_deal_pipe_*', and only this file writes to it.
const A = 'itest_deal_pipe_A', B = 'itest_deal_pipe_B', C = 'itest_deal_pipe_C';
const ORGS = [A, B, C];
const CLERK = 'clerk_itest_deal_pipe_rep', ADMIN = 'clerk_itest_deal_pipe_admin';
const REP = 'Itest Pipe Rep';
const PIPES_A = [{ id: 'new-biz', name: 'New business' }, { id: 'renewal', name: 'Renewals', isDefault: true }, { id: 'exp', name: 'Expansion' }];
const PIPES_B = [{ id: 'b-only', name: 'B only' }];

const call = async (fn, method, body, { org = A, role = 'User', user = CLERK } = {}) => {
    const r = await fn({ httpMethod: method, headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : null, queryStringParameters: {} }, {}, () => {});
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
const ID = (x) => `itest_deal_pipe_${x}`;
const deal = (x, more = {}) => ({ id: ID(x), opportunityName: `Deal ${x}`, stage: 'Discovery', salesRep: REP, arr: 10, ...more });
const pipe = async (x) => (await db.select({ p: opportunities.pipelineId }).from(opportunities).where(eq(opportunities.id, ID(x))))[0]?.p;
const pipesOf = async (org) => (await db.select({ e: settings.extra }).from(settings).where(eq(settings.orgId, org)))[0]?.e?.pipelines;
const seedPipes = async (org, pipelines) => {
    await db.delete(settings).where(eq(settings.orgId, org));
    if (pipelines !== 'no row') await db.insert(settings).values({ id: org, orgId: org, extra: pipelines === undefined ? {} : { pipelines } });
};
const clear = async () => { await db.delete(opportunities).where(inArray(opportunities.orgId, ORGS)); await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS)); };
const clean = async () => { await clear(); await db.delete(settings).where(inArray(settings.orgId, ORGS)); await db.delete(users).where(inArray(users.orgId, ORGS)); };
const reset = async () => { await clear(); await seedPipes(A, PIPES_A); await seedPipes(B, PIPES_B); };
before(async () => {
    await clean();
    await db.insert(users).values([
        { id: 'usr_itest_deal_pipe_rep', orgId: A, clerkUserId: CLERK, name: REP, email: 'pipe-rep@itest.invalid', role: 'User', active: true },
        { id: 'usr_itest_deal_pipe_admin', orgId: A, clerkUserId: ADMIN, name: 'Itest Pipe Admin', email: 'pipe-admin@itest.invalid', role: 'Admin', active: true },
        { id: 'usr_itest_deal_pipe_c', orgId: C, clerkUserId: CLERK, name: REP, email: 'pipe-c@itest.invalid', role: 'User', active: true },
    ]);
});
after(clean);
const NOT_IN_ORG = 'That pipeline is not in your organization — pick one from the list.';

test('a new deal names a pipeline of its org, or takes the org\'s default — never another org\'s, never one nobody has', async () => {
    await reset();
    assert.deepEqual([(await call(deals, 'POST', deal('one', { pipelineId: 'exp' }))).status, await pipe('one')], [201, 'exp']);
    for (const blank of [{}, { pipelineId: '' }, { pipelineId: null }]) {
        await db.delete(opportunities).where(eq(opportunities.id, ID('blank')));
        assert.deepEqual([(await call(deals, 'POST', deal('blank', blank))).status, await pipe('blank')], [201, 'renewal'], `REGRESSION: ${JSON.stringify(blank)} — 'default', a pipeline this org does not have`);
    }
    for (const pipelineId of ['b-only', 'default', 'nobody']) {
        const r = await call(deals, 'POST', deal('bad', { pipelineId }));
        assert.deepEqual([r.status, r.body.error, r.body.field, await pipe('bad')], [404, NOT_IN_ORG, 'pipelineId', undefined], `REGRESSION: ${pipelineId} stored`);
    }
    for (const pipelineId of [7, { id: 'exp' }, ['exp']]) assert.deepEqual([(await call(deals, 'POST', deal('bad', { pipelineId }))).status, await pipe('bad')], [400, undefined]);
    // As it is answered: the stored pipeline, for the screens.
    assert.equal((await call(deals, 'POST', deal('said'))).body.opportunity.pipelineId, 'renewal');
});

test('an org that stored no list, an empty one, null, or none with an id, has the one pipeline every screen draws', async () => {
    for (const list of ['no row', undefined, null, [], 'junk', [{ name: 'No id' }], [null]]) {
        await clear(); await seedPipes(C, list);
        assert.deepEqual([(await call(deals, 'POST', deal('c1'), { org: C })).status, await pipe('c1')], [201, 'default'], `REGRESSION: ${JSON.stringify(list)} — a workspace that could make no deal`);
        assert.equal((await call(deals, 'POST', deal('c2', { pipelineId: 'default' }), { org: C })).status, 201, JSON.stringify(list));
        assert.equal((await call(deals, 'POST', deal('c3', { pipelineId: 'new-biz' }), { org: C })).status, 404, JSON.stringify(list));
    }
    await clear(); await db.delete(settings).where(eq(settings.orgId, C));
});

test('an import: each row its org\'s pipeline, the default for none; one the org does not have refuses the batch, naming it, nothing written', async () => {
    await reset();
    const ok = await call(deals, 'POST', [deal('b1', { pipelineId: 'exp' }), deal('b2'), deal('b3', { pipelineId: '' })]);
    assert.deepEqual([ok.status, await pipe('b1'), await pipe('b2'), await pipe('b3')], [201, 'exp', 'renewal', 'renewal']);
    const bad = await call(deals, 'POST', [deal('b4'), deal('b5', { pipelineId: 'b-only' })]);
    assert.deepEqual([bad.status, bad.body.field, bad.body.ids, await pipe('b4'), await pipe('b5')], [400, 'pipelineId', ['b-only'], undefined, undefined]);
});

test('a save: moved only to a pipeline of the org; the one held is never asked again; one named blank, or not named, is kept', async () => {
    await reset();
    await db.insert(opportunities).values([{ ...deal('p1'), orgId: A, pipelineId: 'gone', ownerId: 'usr_itest_deal_pipe_rep' }, { ...deal('p2'), orgId: A, pipelineId: 'exp', ownerId: 'usr_itest_deal_pipe_rep' }]);
    // Held, on a pipeline the org dropped: saved whole, and kept.
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p1'), notes: 'n', pipelineId: 'gone' })).status, await pipe('p1')], [200, 'gone']);
    for (const blank of [{}, { pipelineId: '' }, { pipelineId: null }]) assert.deepEqual([(await call(deals, 'PUT', { id: ID('p2'), notes: 'n', ...blank })).status, await pipe('p2')], [200, 'exp'], `REGRESSION: ${JSON.stringify(blank)} wrote 'default' over the stored pipeline`);
    for (const pipelineId of ['b-only', 'gone', 'default']) assert.deepEqual([(await call(deals, 'PUT', { id: ID('p2'), notes: 'lost', pipelineId })).status, await pipe('p2')], [404, 'exp']);
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p1'), pipelineId: 'renewal' })).status, await pipe('p1')], [200, 'renewal']);
    // In bulk (an import's overwrite, or any other caller).
    await db.update(opportunities).set({ pipelineId: 'gone' }).where(eq(opportunities.id, ID('p1')));
    const bulk = await call(deals, 'PUT', [{ id: ID('p1'), notes: 'x', pipelineId: 'gone' }, { id: ID('p2'), notes: 'x', pipelineId: '' }]);
    assert.deepEqual([bulk.status, await pipe('p1'), await pipe('p2')], [200, 'gone', 'exp'], 'REGRESSION: a blank in a batch wrote \'default\'');
    const refused = await call(deals, 'PUT', [{ id: ID('p1'), notes: 'y', pipelineId: 'exp' }, { id: ID('p2'), notes: 'y', pipelineId: 'b-only' }]);
    assert.deepEqual([refused.status, refused.body.ids, await pipe('p1'), await pipe('p2')], [400, ['b-only'], 'gone', 'exp']);
    assert.deepEqual([(await call(deals, 'PUT', [{ id: ID('p2'), pipelineId: 'new-biz' }])).status, await pipe('p2')], [200, 'new-biz']);
});

const save = (pipelines, org = A) => call(settingsHandler, 'PUT', { pipelines }, { org, role: 'Admin', user: ADMIN });
const without = (id) => PIPES_A.filter((p) => p.id !== id);

test('Settings drops no pipeline an open deal of the org names — a closed one, or another org\'s, holds nothing; nothing is written when refused', async () => {
    await reset();
    await db.insert(opportunities).values([
        { ...deal('s1'), orgId: A, pipelineId: 'exp' }, { ...deal('s2'), orgId: A, pipelineId: 'exp', stage: 'Proposal' }, { ...deal('s3'), orgId: A, pipelineId: 'renewal' },
        { ...deal('s4'), orgId: A, pipelineId: 'new-biz', stage: 'Closed Won' }, { ...deal('s5'), orgId: B, pipelineId: 'new-biz' }, { ...deal('s6'), orgId: A, pipelineId: 'gone' },
    ]);
    const r = await save(without('exp'));
    assert.deepEqual([r.status, r.body.error, r.body.code, r.body.field], [409, '"Expansion" still has 2 open deals. Move them to another pipeline, or close them, first.', 'inUse', 'pipelines']);
    assert.deepEqual(await pipesOf(A), PIPES_A, 'nothing written');
    assert.equal((await save([PIPES_A[0]])).body.error, '"Renewals" still has 1 open deal; "Expansion" still has 2 open deals. Move them to another pipeline, or close them, first.');
    // Closed deals, another org's, and a deal already on no pipeline of the org stand in nobody's way.
    assert.equal((await save(without('new-biz'))).status, 200);
    assert.deepEqual((await pipesOf(A)).map((p) => p.id), ['renewal', 'exp']);
    // The last one is never dropped, whatever it holds; a save of nothing is not a save of none.
    await clear();
    for (const none of [[], null, '', 'junk']) { const x = await save(none); assert.deepEqual([x.status, x.body.field], [400, 'pipelines'], JSON.stringify(none)); }
    assert.deepEqual((await pipesOf(A)).map((p) => p.id), ['renewal', 'exp']);
});

test('an org on the one pipeline it never saved: its deals on it stand in the way of a list without it', async () => {
    await clear(); await seedPipes(C, undefined);
    await db.insert(opportunities).values([{ ...deal('c1'), orgId: C, pipelineId: 'default' }]);
    const put = (pipelines) => call(settingsHandler, 'PUT', { pipelines }, { org: C, role: 'Admin', user: ADMIN });
    assert.deepEqual([(await put([{ id: 'new-biz', name: 'New business' }])).status, await pipesOf(C)], [409, undefined], 'REGRESSION: every deal of the org hidden by one save');
    assert.equal((await put([{ id: 'default', name: 'New Business' }, { id: 'pl_2', name: 'Renewals' }])).status, 200);
    // A list stored empty (one org holds it) is the same one pipeline.
    await seedPipes(C, []);
    assert.equal((await put([{ id: 'new-biz', name: 'New business' }])).status, 409);
    await clear(); await db.delete(settings).where(eq(settings.orgId, C));
});

test('each pipeline its own id and a name of its own; what the org holds already is never asked', async () => {
    await reset();
    const bad = async (list, words) => { const r = await save(list); assert.deepEqual([r.status, r.body.error, r.body.field], [400, words, 'pipelines']); };
    await bad([...PIPES_A, { id: 'exp', name: 'Twice' }], 'Each entry of this list needs its own id.');
    await bad([...PIPES_A, { name: 'No id' }], 'Each entry of this list needs its own id.');
    await bad([...PIPES_A, { id: 'x', name: '  ' }], 'Give each pipeline a name.');
    await bad([...PIPES_A, { id: 'x', name: 'renewals ' }], 'Another pipeline is named "renewals".');
    assert.deepEqual(await pipesOf(A), PIPES_A);
    const held = [{ id: 'p1' }, { id: 'p2', name: 'Same' }, { id: 'p3', name: 'same' }];
    await seedPipes(A, held);
    assert.equal((await save([...held, { id: 'p4', name: 'New' }])).status, 200, 'a stored list as it was');
    await bad([...held, { id: 'p5', name: 'SAME' }], 'Another pipeline is named "SAME".');
});
