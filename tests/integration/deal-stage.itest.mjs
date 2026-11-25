// tests/integration/deal-stage.itest.mjs
// §0.299 against the real test database (OPEN_ITEMS §4.2, §4.3): a deal is in a stage of its org's. The server stored any stage at
// all, made a deal that named none in "Discovery" whatever the org's list, and wrote it over the stored one when a save named it
// blank; and Settings dropped a stage its deals were in.
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

// ORG NAMESPACE: this file owns 'itest_deal_stage_*', and only this file writes to it.
const A = 'itest_deal_stage_A', B = 'itest_deal_stage_B', C = 'itest_deal_stage_C';
const ORGS = [A, B, C];
const CLERK = 'clerk_itest_deal_stage_rep', ADMIN = 'clerk_itest_deal_stage_admin';
const REP = 'Itest Stage Rep';
const CLOSES = [{ name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 }];
const STAGES_A = [{ name: 'Lead in', weight: 10 }, { name: 'Site visit', weight: 40 }, { name: 'Bid sent', weight: 70 }, ...CLOSES];
const STAGES_B = [{ name: 'B only', weight: 20 }, ...CLOSES];

const call = async (fn, method, body, { org = A, role = 'User', user = CLERK } = {}) => {
    const r = await fn({ httpMethod: method, headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : null, queryStringParameters: {} }, {}, () => {});
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
const ID = (x) => `itest_deal_stage_${x}`;
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
const reset = async () => { await clear(); await seedStages(A, STAGES_A); await seedStages(B, STAGES_B); };

before(async () => {
    await clear();
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.insert(users).values([
        { id: 'usr_itest_deal_stage_rep', orgId: A, clerkUserId: CLERK, name: REP, email: 'itest-stage-rep@example.test', role: 'User', active: true },
        { id: 'usr_itest_deal_stage_adm', orgId: A, clerkUserId: ADMIN, name: 'Itest Stage Admin', email: 'itest-stage-admin@example.test', role: 'Admin', active: true },
    ]);
});
after(async () => {
    await clear();
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(settings).where(inArray(settings.orgId, ORGS));
});

const NOT_ONE = (n) => `"${n}" is not one of your organization's stages — pick one from the list.`;

test('a deal is made in a stage of its org\'s: the one named, in the org\'s spelling; the first when none is named; any other refused, nothing written', async () => {
    await reset();
    assert.deepEqual([(await call(deals, 'POST', deal('c1', { stage: 'Bid sent' }))).status, await stage('c1')], [201, 'Bid sent']);
    assert.deepEqual([(await call(deals, 'POST', deal('c2', { stage: '  bid SENT ' }))).status, await stage('c2')], [201, 'Bid sent'], 'another case or spacing is the same stage');
    for (const [x, none] of [['c3', {}], ['c4', { stage: '' }], ['c5', { stage: '  ' }], ['c6', { stage: null }]]) {
        assert.deepEqual([(await call(deals, 'POST', deal(x, none))).status, await stage(x)], [201, 'Lead in'], `REGRESSION: made in Discovery — ${x}`);
    }
    assert.equal((await call(deals, 'POST', deal('c7', { stage: 'Closed Won' }))).status, 201, 'a close is always one');
    for (const bad of ['Proposal', 'B only', 'Won', 7, ['Bid sent'], { name: 'Bid sent' }]) {
        const r = await call(deals, 'POST', deal('x', { stage: bad }));
        assert.deepEqual([r.status, r.body.field, await row('x')], [400, 'stage', undefined], JSON.stringify(bad));
    }
    assert.equal((await call(deals, 'POST', deal('x', { stage: 'Proposal' }))).body.error, NOT_ONE('Proposal'));
    // Another org's own.
    assert.equal((await call(deals, 'POST', deal('b1', { stage: 'B only' }), { org: B })).status, 201);
    assert.equal((await call(deals, 'POST', deal('b2', { stage: 'Bid sent' }), { org: B })).status, 400);
});

test('an org that saved no list has the app\'s; one that saved the old column has that', async () => {
    await clear(); await seedStages(C, 'no row');
    assert.deepEqual([(await call(deals, 'POST', deal('d1', { stage: 'Proposal' }), { org: C })).status, (await call(deals, 'POST', deal('d2', { stage: 'Bid sent' }), { org: C })).status], [201, 400]);
    assert.deepEqual([(await call(deals, 'POST', deal('d3'), { org: C })).status, await stage('d3')], [201, 'Qualification']);
    for (const held of [undefined, [], null]) {
        await seedStages(C, held);
        assert.equal((await call(deals, 'POST', deal(`e${JSON.stringify(held) ?? 'u'}`, { stage: 'Contracts' }), { org: C })).status, 201, JSON.stringify(held));
    }
    await seedStages(C, undefined, [{ name: 'Old one', weight: 5 }]);
    assert.deepEqual([(await call(deals, 'POST', deal('f1'), { org: C })).status, await stage('f1')], [201, 'Old one']);
    assert.equal((await call(deals, 'POST', deal('f2', { stage: 'Proposal' }), { org: C })).status, 400);
    await clear(); await db.delete(settings).where(eq(settings.orgId, C));
});

test('a batch of new deals: each row\'s stage by the same rule; one that is not the org\'s refuses the batch whole, naming its rows', async () => {
    await reset();
    const ok = await call(deals, 'POST', [deal('g1', { stage: 'site visit' }), deal('g2'), deal('g3', { stage: 'Closed Lost' })]);
    assert.deepEqual([ok.status, await stage('g1'), await stage('g2'), await stage('g3')], [201, 'Site visit', 'Lead in', 'Closed Lost']);
    const bad = await call(deals, 'POST', [deal('h1', { stage: 'Bid sent' }), deal('h2', { stage: 'Proposal' }), deal('h3', { stage: 'B only' })]);
    assert.deepEqual([bad.status, bad.body.field, bad.body.ids, bad.body.error], [400, 'stage', [ID('h2'), ID('h3')], NOT_ONE('Proposal')]);
    assert.deepEqual([await row('h1'), await row('h2'), await row('h3')], [undefined, undefined, undefined], 'nothing written');
});

test('a save: the stage named anew is the org\'s; the one the deal has is never asked; a blank one is not named', async () => {
    await reset();
    await call(deals, 'POST', deal('p1', { stage: 'Lead in' }));
    const r = await call(deals, 'PUT', { id: ID('p1'), stage: 'Proposal', notes: 'x' });
    assert.deepEqual([r.status, r.body.field, r.body.error], [400, 'stage', NOT_ONE('Proposal')]);
    let p = await row('p1');
    assert.deepEqual([p.stage, p.notes, p.stageHistory.length], ['Lead in', null, 0], 'nothing written');
    // A move, in another spelling: the org's own, and one history entry of it.
    assert.equal((await call(deals, 'PUT', { id: ID('p1'), stage: 'BID sent' })).status, 200);
    p = await row('p1');
    assert.deepEqual([p.stage, p.stageHistory.map((h) => [h.prevStage, h.stage])], ['Bid sent', [['Lead in', 'Bid sent']]]);
    // The stage it has, in another spelling: no move.
    assert.equal((await call(deals, 'PUT', { id: ID('p1'), stage: ' bid  sent', notes: 'y' })).status, 200);
    p = await row('p1');
    assert.deepEqual([p.stage, p.notes, p.stageHistory.length], ['Bid sent', 'y', 1], 'REGRESSION: a case-only difference was a move');
    for (const none of ['', '   ', null]) {
        assert.equal((await call(deals, 'PUT', { id: ID('p1'), stage: none, notes: 'z' })).status, 200);
        assert.deepEqual([await stage('p1'), (await row('p1')).stageHistory.length], ['Bid sent', 1], `REGRESSION: a blank wrote Discovery over it — ${JSON.stringify(none)}`);
    }
    // A stage the org has no more: kept by a save that sends it, as stored; moved off it, never back onto it.
    await db.update(opportunities).set({ stage: 'Long gone' }).where(eq(opportunities.id, ID('p1')));
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p1'), stage: 'Long gone', notes: 'held' })).status, await stage('p1')], [200, 'Long gone']);
    assert.equal((await call(deals, 'PUT', { id: ID('p1'), stage: 'Site visit' })).status, 200);
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p1'), stage: 'Long gone' })).status, await stage('p1')], [400, 'Site visit']);
    // A deal stored in another spelling of a stage (any was, until §0.299) is moved onto the org's own by its exact name.
    await db.update(opportunities).set({ stage: 'closed won' }).where(eq(opportunities.id, ID('p1')));
    assert.equal((await call(deals, 'PUT', { id: ID('p1'), stage: 'Closed Won' })).status, 200);
    p = await row('p1');
    assert.deepEqual([p.stage, p.stageHistory.at(-1).stage, !!p.wonDate], ['Closed Won', 'Closed Won', true], 'REGRESSION: the move answered 200 and dropped');
    // An empty stage a restore stored is kept by a save that names none.
    await db.update(opportunities).set({ stage: '' }).where(eq(opportunities.id, ID('p1')));
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('p1'), notes: 'empty' })).status, await stage('p1')], [200, '']);
});

test('a bulk save (an import\'s overwrite): the same rule, row by row; a refusal writes nothing', async () => {
    await reset();
    await call(deals, 'POST', [deal('q1', { stage: 'Lead in' }), deal('q2', { stage: 'Lead in' }), deal('q3', { stage: 'Lead in' })]);
    await db.update(opportunities).set({ stage: 'Long gone' }).where(eq(opportunities.id, ID('q3')));
    const ok = await call(deals, 'PUT', [{ id: ID('q1'), stage: 'bid sent', notes: 'a' }, { id: ID('q2'), stage: '', notes: 'b' }, { id: ID('q3'), stage: 'long GONE', notes: 'c' }]);
    assert.deepEqual([ok.status, ok.body.stageChanged, await stage('q1'), await stage('q2'), await stage('q3')], [200, 1, 'Bid sent', 'Lead in', 'Long gone'], 'REGRESSION: a blank row wrote Discovery');
    const bad = await call(deals, 'PUT', [{ id: ID('q1'), stage: 'Site visit', notes: 'd' }, { id: ID('q2'), stage: 'Proposal', notes: 'd' }]);
    assert.deepEqual([bad.status, bad.body.field, bad.body.ids, await stage('q1'), (await row('q2')).notes], [400, 'stage', [ID('q2')], 'Bid sent', 'b']);
    // A row of another rep's, or of no deal here, refuses nothing: it is answered forbidden or not found, and the rest land.
    await db.update(opportunities).set({ ownerId: 'usr_itest_deal_stage_adm', salesRep: 'Itest Stage Admin' }).where(eq(opportunities.id, ID('q3')));
    const mixed = await call(deals, 'PUT', [{ id: ID('q1'), stage: 'Site visit', notes: 'e' }, { id: ID('q3'), stage: 'Nowhere', notes: 'e' }, { id: ID('none'), stage: 'Nowhere', notes: 'e' }]);
    assert.deepEqual([mixed.status, mixed.body.updated, mixed.body.forbidden.length, mixed.body.notFound.length, await stage('q1'), await stage('q3')], [200, 1, 1, 1, 'Site visit', 'Long gone']);
});

const save = (funnelStages, org = A) => call(settingsHandler, 'PUT', { funnelStages }, { org, role: 'Admin', user: ADMIN });

test('Settings drops no stage a deal of the org is in, nor takes a changed name that does not say which stage it was — an open or a closed one; another org\'s deals hold nothing; nothing written when refused', async () => {
    await reset();
    await db.insert(opportunities).values([
        stored('s1', 'Site visit', A), stored('s2', 'Site visit', A), stored('s3', 'Bid sent', A),
        stored('s4', 'Lead in', B), stored('s5', 'Closed Won', A), stored('s6', 'Nowhere', A),
    ]);
    const without = (n) => STAGES_A.filter((s) => s.name !== n);
    const r = await save(without('Site visit'));
    assert.deepEqual([r.status, r.body.error, r.body.code, r.body.field], [409, '"Site visit" still has 2 deals. Move them to another stage first.', 'inUse', 'funnelStages']);
    assert.deepEqual([await stagesOf(A), (await settingsRow(A)).stages], [STAGES_A, []], 'nothing written, in the key or its old column');
    assert.equal((await save([STAGES_A[0], ...CLOSES])).body.error, '"Site visit" still has 2 deals; "Bid sent" still has 1 deal. Move them to another stage first.');
    assert.equal((await save(STAGES_A.map((s) => (s.name === 'Bid sent' ? { ...s, name: 'Bid out' } : s)))).status, 409, 'a changed name that does not say which stage it was drops the one its deals hold');
    assert.equal((await save(STAGES_A.map((s) => (s.name === 'Bid sent' ? { ...s, name: 'bid sent' } : s)))).status, 409, 'so does another case of it');
    // One nothing of this org is in: dropped, renamed, another added, the order changed, the weights too.
    const next = [{ name: 'Bid sent', weight: 65 }, { name: ' Called ', weight: 5 }, { name: 'Site visit', weight: 40 }, ...CLOSES];
    assert.equal((await save(next)).status, 200);
    assert.deepEqual((await stagesOf(A)).map((s) => [s.name, s.weight]), [['Bid sent', 65], ['Called', 5], ['Site visit', 40], ['Closed Won', 100], ['Closed Lost', 0]], 'each name with no space round it');
    assert.deepEqual((await settingsRow(A)).stages, await stagesOf(A), 'the old column with it');
    assert.equal((await call(deals, 'POST', deal('s7', { stage: 'Lead in' }))).status, 400, 'and the deals endpoint reads it');
});

test('an org on the list it never saved, or on the old column: its deals stand in the way of a list without their stage', async () => {
    await clear(); await seedStages(C, undefined);
    await db.insert(opportunities).values([stored('t1', 'Proposal', C)]);
    assert.deepEqual([(await save(STAGES_A, C)).status, await stagesOf(C)], [409, undefined]);
    await seedStages(C, undefined, [{ name: 'Proposal', weight: 5 }, ...CLOSES]);
    assert.deepEqual([(await save(STAGES_A, C)).status, await stagesOf(C)], [409, undefined]);
    await seedStages(C, undefined, [{ name: 'Old one', weight: 5 }, ...CLOSES]);
    assert.equal((await save(STAGES_A, C)).status, 200, 'a stage it does not list holds nothing');
    await clear(); await db.delete(settings).where(eq(settings.orgId, C));
});

test('a stages list: names, each its own; the two closes; an open one; weights of 0 to 100 — else refused, nothing written', async () => {
    await reset();
    const bad = async (list, words) => { const r = await save(list); assert.deepEqual([r.status, r.body.error, r.body.field], [400, words, 'funnelStages'], JSON.stringify(list)); };
    for (const none of [null, '', 'junk', 7, {}]) await bad(none, 'Send the stages as a list.');
    await bad([], 'Closed Won and Closed Lost keep their names — every deal won or lost is told by them.');
    await bad(CLOSES, 'Keep at least one open stage.');
    for (const n of ['', '  ', undefined, 7]) await bad([{ name: n, weight: 5 }, ...CLOSES], 'Give each stage a name.');
    await bad([null, ...CLOSES], 'Give each stage a name.');
    await bad([{ name: 'x'.repeat(101), weight: 5 }, ...CLOSES], 'A stage\'s name is 100 characters at most.');
    await bad([...STAGES_A, { name: 'bid  SENT', weight: 5 }], 'Another stage is named "bid  SENT".');
    await bad(STAGES_A.filter((s) => s.name !== 'Closed Lost'), 'Closed Won and Closed Lost keep their names — every deal won or lost is told by them.');
    await bad(STAGES_A.map((s) => (s.name === 'Closed Won' ? { ...s, name: 'closed won' } : s)), 'Closed Won and Closed Lost keep their names — every deal won or lost is told by them.');
    await bad([...STAGES_A, { name: 'Closed - no bid', weight: 5 }], '"Closed - no bid" would read as a closed deal — name an open stage something else.');
    await bad([...STAGES_A, { name: 'Won', weight: 5 }], '"Won" would read as a closed deal — name an open stage something else.');
    for (const w of [101, -1, 12.5, '50', null, undefined]) await bad([...STAGES_A, { name: 'New', weight: w }], 'Give each stage a default probability from 0 to 100.');
    assert.deepEqual(await stagesOf(A), STAGES_A);
    // What the stored list holds is never asked again, and is kept as its deals hold it.
    const odd = [{ name: 'Bid ', weight: 1 }, { name: 'Won', weight: 2 }, { name: 'Same', weight: 3 }, { name: 'same', weight: 4 }, ...CLOSES];
    await seedStages(A, odd);
    await db.insert(opportunities).values(odd.slice(0, 4).map((s, i) => stored(`o${i}`, s.name, A)));
    assert.equal((await save(odd.map((s) => ({ ...s, weight: 9 })))).status, 200, 'REGRESSION: one such name refused every save of the page');
    assert.deepEqual((await stagesOf(A)).map((s) => s.name), odd.map((s) => s.name));
    await clear(); await seedStages(A, STAGES_A);
    // Not named: not asked.
    assert.equal((await call(settingsHandler, 'PUT', { companyName: 'Stage Co' }, { role: 'Admin', user: ADMIN })).status, 200);
    assert.deepEqual(await stagesOf(A), STAGES_A);
});
