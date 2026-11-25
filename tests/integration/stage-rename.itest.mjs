// tests/integration/stage-rename.itest.mjs
// §0.302 against the real test database (OPEN_ITEMS §4.2, left by §0.299 (a); Jeff, 25 Nov: "yes"): a stage renamed on Settings →
// Funnel stages carries what names it — the deals in it, every deal's stage history, the automations' conditions, the saved
// reports' stage filters and the deal model's usual days — in the save's own transaction, in that org alone; and a save that
// moves no stage writes none.
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

// A rename landing between a deal save's read and its write.
const seam = { beforeWrite: null };
const lib = await import('../../netlify/functions/_lib.mjs');
mock.module(new URL('../../netlify/functions/_lib.mjs', import.meta.url).href, { namedExports: { ...lib, ownerWriteFilter: async (a) => { if (seam.beforeWrite) await seam.beforeWrite(); return lib.ownerWriteFilter(a); } } });

const { handler: deals } = await import('../../netlify/functions/opportunities.mjs');
const settingsModule = await import('../../netlify/functions/settings.mjs');
const { handler: settingsHandler, putSeam } = settingsModule;
const { db } = await import('../../db/index.js');
const { users, opportunities, settings, auditLog, automations, automationRuns, savedReports } = await import('../../db/schema.js');
const { eq, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_stage_rename_*', and only this file writes to it.
const A = 'itest_stage_rename_A', B = 'itest_stage_rename_B';
const ORGS = [A, B];
const REP = 'Itest Rename Rep', CLERK = 'clerk_itest_stage_rename_rep', ADMIN = 'clerk_itest_stage_rename_admin';
const CLOSES = [{ name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 }];
const LIST = [{ name: 'Lead in', weight: 10 }, { name: 'Site visit', weight: 40 }, { name: 'Bid sent', weight: 70 }, ...CLOSES];

const call = async (fn, method, body, { org = A, role = 'User', user = CLERK } = {}) => {
    const r = await fn({ httpMethod: method, headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : null, queryStringParameters: {} }, {}, () => {});
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
const admin = (body) => call(settingsHandler, 'PUT', body, { role: 'Admin', user: ADMIN });
const renaming = (names, list = LIST) => ({ funnelStages: list.map((s) => (names[s.name] ? { ...s, name: names[s.name], was: s.name } : s)) });
const ID = (x) => `itest_stage_rename_${x}`;
const h = (stage, prevStage, more = {}) => ({ stage, prevStage, date: '2026-01-02', author: 'X', ...more });
const row = async (x) => (await db.select().from(opportunities).where(eq(opportunities.id, ID(x))))[0];
const moves = async (x) => (await row(x)).stageHistory.map((e) => (e && typeof e === 'object' ? [e.prevStage, e.stage] : e));
const extra = async (org = A) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0]?.extra;
const conditions = async (x) => (await db.select().from(automations).where(eq(automations.id, ID(x))))[0].conditions;
const filters = async (x) => (await db.select().from(savedReports).where(eq(savedReports.id, ID(x))))[0].filters;

const clear = async () => {
    for (const t of [opportunities, auditLog, automationRuns, automations, savedReports, settings]) await db.delete(t).where(inArray(t.orgId, ORGS));
};
const DEALS = [
    ['in', 'Bid sent', [h('Bid sent', 'Site visit', { timestamp: 't1', daysInStage: 4 }), h('Site visit', 'Lead in')]],
    ['past', 'Closed Won', [h('Closed Won', 'Bid sent')]],
    ['other', 'Lead in', [h('Lead in', 'Site visit')]],
    ['odd', 'bid sent', [null, 'text', 7, { stage: 5, prevStage: null }, h('Bid sent ', 'bid sent')]],
    ['none', 'Bid sent', null],
    ['object', 'Bid sent', { stage: 'Bid sent' }],
];
const seed = async () => {
    await clear();
    for (const org of ORGS) {
        const at = (x) => (org === A ? ID(x) : ID('B_' + x));
        await db.insert(settings).values({ id: org, orgId: org, stages: LIST, extra: { funnelStages: LIST, dealModel: { trained: false, usual: { stageDays: { 'Bid sent': 9, 'Site visit': 3 }, revenue: 5 } } } });
        await db.insert(opportunities).values(DEALS.map(([x, stage, stageHistory]) => ({ id: at(x), opportunityName: x, salesRep: REP, arr: '10', stage, stageHistory, orgId: org, pipelineId: 'default', probability: 33, stageChangedDate: '2026-01-02' })));
        await db.insert(automations).values([
            { id: at('rule'), orgId: org, name: 'r', triggerEvent: 'opportunity.stage_changed', active: true, conditions: [
                { field: 'to_stage', operator: 'eq', value: 'bid SENT' }, { field: 'from_stage', operator: 'neq', value: 'Bid sent' }, { field: 'stage', operator: 'contains', value: 'Bid sent' },
                { field: 'stage', operator: 'contains', value: 'Bid' }, { field: 'account', operator: 'eq', value: 'Bid sent' }, { field: 'stage', operator: 'exists' }, { field: 'stage', operator: 'gte', value: 'Bid sent' }, { field: 'stage', operator: 'eq', value: 5 }, 'x', { operator: 'eq', value: 'Bid sent' }, { field: 'stage', value: 'Bid sent' }],
                actions: [{ type: 'create_task', params: { title: 'Call — Bid sent' } }] },
            { id: at('rule2'), orgId: org, name: 'r2', triggerEvent: 'opportunity.created', active: false, conditions: [{ field: 'arr', operator: 'gt', value: 5 }], actions: [] },
        ]);
        await db.insert(savedReports).values([
            { id: at('report'), orgId: org, ownerId: CLERK, name: 'Report', source: 'Opportunities', filters: { period: 'all', where: [{ id: 'stage', op: 'eq', value: ' BID sent' }, { id: 'stage', op: 'in', value: ['Bid sent', 'Lead in', 4] }, { id: 'stage', op: 'ne', value: 'Proposal' }, { id: 'owner', op: 'eq', value: 'Bid sent' }, { id: 'stage', op: 'in', value: [] }, 'x', { op: 'eq', value: 'Bid sent' }, { op: 'eq', value: 'other' }, { id: 'stage', op: 'eq' }] } },
            { id: at('plain'), orgId: org, ownerId: CLERK, name: 'Plain', filters: { period: 'all' } },
            { id: at('nofilters'), orgId: org, ownerId: CLERK, name: 'None' },
        ]);
    }
};

before(async () => {
    await clear();
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.insert(users).values([
        { id: 'usr_itest_stage_rename_rep', orgId: A, clerkUserId: CLERK, name: REP, email: 'itest-rename-rep@example.test', role: 'User', active: true },
        { id: 'usr_itest_stage_rename_adm', orgId: A, clerkUserId: ADMIN, name: 'Itest Rename Admin', email: 'itest-rename-admin@example.test', role: 'Admin', active: true },
    ]);
});
after(async () => { await clear(); await db.delete(users).where(inArray(users.orgId, ORGS)); });

test("a rename carries the deals in it, every deal's history, the automations, the saved reports and the deal model — this org's alone, one audit row, no event", async () => {
    await seed();
    const r = await admin(renaming({ 'Bid sent': 'Proposal out' }));
    assert.deepEqual([r.status, r.body.renamed], [200, { deals: 3, histories: 2, automations: 1, reports: 1 }], JSON.stringify(r.body));
    assert.deepEqual((await extra()).funnelStages.map((s) => [s.name, s.weight, 'was' in s]), [['Lead in', 10, false], ['Site visit', 40, false], ['Proposal out', 70, false], ['Closed Won', 100, false], ['Closed Lost', 0, false]], 'the list as sent, what the page alone reads left out');
    assert.deepEqual([(await row('in')).stage, (await row('none')).stage, (await row('object')).stage, (await row('past')).stage, (await row('other')).stage], ['Proposal out', 'Proposal out', 'Proposal out', 'Closed Won', 'Lead in']);
    assert.deepEqual(await moves('in'), [['Site visit', 'Proposal out'], ['Lead in', 'Site visit']]);
    assert.deepEqual((await row('in')).stageHistory[0], h('Proposal out', 'Site visit', { timestamp: 't1', daysInStage: 4 }), 'the rest of an entry stands');
    assert.deepEqual([await moves('past'), await moves('other')], [[['Proposal out', 'Closed Won']], [['Site visit', 'Lead in']]]);
    assert.deepEqual((await row('odd')).stageHistory, [null, 'text', 7, { stage: 5, prevStage: null }, h('Bid sent ', 'bid sent')], 'a name in another spelling is another name, as on the boards');
    assert.deepEqual([(await row('none')).stageHistory, (await row('object')).stageHistory], [null, { stage: 'Bid sent' }]);
    const p = await row('in');
    assert.deepEqual([p.probability, p.stageChangedDate, (await row('odd')).stage], [33, '2026-01-02', 'bid sent'], 'no move: its probability and its clock stand');
    assert.deepEqual((await conditions('rule')).map((c) => (typeof c === 'string' ? c : c.value)), ['Proposal out', 'Proposal out', 'Proposal out', 'Bid', 'Bid sent', undefined, 'Bid sent', 5, 'x', 'Bid sent', 'Bid sent']);
    assert.deepEqual(await conditions('rule2'), [{ field: 'arr', operator: 'gt', value: 5 }]);
    assert.deepEqual((await filters('report')).where, [{ id: 'stage', op: 'eq', value: 'Proposal out' }, { id: 'stage', op: 'in', value: ['Proposal out', 'Lead in', 4] }, { id: 'stage', op: 'ne', value: 'Proposal' }, { id: 'owner', op: 'eq', value: 'Bid sent' }, { id: 'stage', op: 'in', value: [] }, 'x', { op: 'eq', value: 'Bid sent' }, { op: 'eq', value: 'other' }, { id: 'stage', op: 'eq' }], 'what names no stage stands as it is');
    assert.equal((await filters('report')).period, 'all');
    assert.deepEqual([await filters('plain'), await filters('nofilters')], [{ period: 'all' }, null]);
    assert.deepEqual((await extra()).dealModel, { trained: false, usual: { stageDays: { 'Proposal out': 9, 'Site visit': 3 }, revenue: 5 } });
    // Org B, of the same names, is as it was.
    assert.deepEqual([(await row('B_in')).stage, (await moves('B_in'))[0], (await conditions('B_rule'))[0].value, (await filters('B_report')).where[0].value, (await extra(B)).dealModel.usual.stageDays['Bid sent'], (await extra(B)).funnelStages[2].name], ['Bid sent', ['Site visit', 'Bid sent'], 'bid SENT', ' BID sent', 9, 'Bid sent']);
    const audits = await db.select().from(auditLog).where(eq(auditLog.orgId, A));
    assert.equal(audits.length, 1);
    assert.match(audits[0].detail, /renamed "Bid sent" to "Proposal out" \(3 deals, 1 automation, 1 saved report\)/);
    assert.equal((await db.select().from(automationRuns).where(eq(automationRuns.orgId, A))).length, 0, 'no stage_changed event: nothing moved');
    // The server takes the new name, and no longer the old.
    assert.deepEqual([(await call(deals, 'PUT', { id: ID('other'), stage: 'Proposal out' })).status, (await call(deals, 'PUT', { id: ID('past'), stage: 'Bid sent' })).status], [200, 400]);
});

test("a 'contains' condition is left where a stage that stays has the old name in it; the model's days of a name taken are the renamed stage's", async () => {
    await seed();
    const list = [...LIST.slice(0, 3), { name: 'Bid sent again', weight: 80 }, ...CLOSES];
    await db.update(settings).set({ extra: { funnelStages: list, dealModel: { usual: { stageDays: { 'Bid sent': 9, Quoted: 40, Old: 1 } } } } }).where(eq(settings.orgId, A));
    assert.equal((await admin(renaming({ 'Bid sent': 'Quoted' }, list))).status, 200);
    assert.deepEqual((await conditions('rule')).slice(0, 3).map((c) => c.value), ['Quoted', 'Quoted', 'Bid sent']);
    assert.deepEqual((await extra()).dealModel.usual.stageDays, { Quoted: 9, Old: 1 });
    // One the same save drops is in nothing's way.
    await seed();
    await db.update(settings).set({ extra: { funnelStages: list } }).where(eq(settings.orgId, A));
    assert.equal((await admin({ funnelStages: renaming({ 'Bid sent': 'Quoted' }, list).funnelStages.filter((s) => s.name !== 'Bid sent again') })).status, 200);
    assert.equal((await conditions('rule'))[2].value, 'Quoted');
});

test('two stages exchange names at once, and a chain of names moves whole: each deal keeps its own stage', async () => {
    await seed();
    const r = await admin(renaming({ 'Bid sent': 'Site visit', 'Site visit': 'Bid sent', 'Lead in': 'New' }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([(await row('in')).stage, await moves('in'), (await row('other')).stage, await moves('other')], ['Site visit', [['Bid sent', 'Site visit'], ['New', 'Bid sent']], 'New', [['Bid sent', 'New']]]);
    assert.deepEqual((await extra()).dealModel.usual.stageDays, { 'Site visit': 9, 'Bid sent': 3 });
    await seed();
    assert.equal((await admin(renaming({ 'Bid sent': 'Last', 'Site visit': 'Bid sent', 'Lead in': 'Site visit' }))).status, 200);
    assert.deepEqual([(await row('in')).stage, await moves('in'), (await row('other')).stage], ['Last', [['Bid sent', 'Last'], ['Site visit', 'Bid sent']], 'Site visit']);
});

test('a rename of another case or spacing of its own name is one too; a name sent with the stage it was is kept as it is', async () => {
    await seed();
    const r = await admin({ funnelStages: LIST.map((s) => (s.name === 'Bid sent' ? { ...s, name: '  Bid Sent ', was: 'Bid sent' } : { ...s, was: s.name })) });
    assert.deepEqual([r.status, r.body.renamed, (await row('in')).stage, (await row('odd')).stage], [200, { deals: 3, histories: 2, automations: 1, reports: 1 }, 'Bid Sent', 'bid sent']);
    assert.deepEqual([(await conditions('rule'))[0].value, (await filters('report')).where[0].value], ['Bid Sent', 'Bid Sent'], 'a condition in another case goes with it');
    await seed();
    const twins = [...LIST.slice(0, 3), { name: 'bid sent', weight: 5 }, ...CLOSES];
    await db.update(settings).set({ extra: { funnelStages: twins } }).where(eq(settings.orgId, A));
    assert.equal((await admin(renaming({ 'Bid sent': 'Quoted' }, twins))).status, 200);
    assert.deepEqual([(await conditions('rule')).slice(0, 2).map((c) => c.value), (await filters('report')).where[0].value], [['bid SENT', 'Quoted'], ' BID sent'], 'one that names a stage that stays is left; the exact name goes');
    assert.ok((await extra()).funnelStages.every((s) => !('was' in s)));
    await seed();
    const same = await admin({ funnelStages: LIST.map((s) => ({ ...s, was: s.name })) });
    assert.deepEqual([same.status, 'renamed' in same.body, (await extra()).funnelStages.every((s) => !('was' in s))], [200, false, true]);
});

test('what is no rename is refused, nothing written: a close, onto a close, a stage not saved, one stage twice, onto a name kept, onto one whose deals are in the way, or past the old column\'s', async () => {
    await seed();
    const untouched = async (why) => assert.deepEqual([(await extra()).funnelStages, (await row('in')).stage, (await conditions('rule'))[0].value], [LIST, 'Bid sent', 'bid SENT'], why);
    const entry = (name, more) => LIST.map((s) => (s.name === name ? { ...s, ...more } : s));
    for (const [why, funnelStages, status] of [
        ['a close', entry('Closed Won', { name: 'Won it', was: 'Closed Won' }), 400],
        ['onto a close', [...LIST.filter((s) => !['Bid sent', 'Closed Won'].includes(s.name)), { name: 'Closed Won', was: 'Bid sent', weight: 100 }], 400],
        ['a close named as another', entry('Bid sent', { name: 'Proposal out', was: 'Closed Won' }), 400],
        ['a stage not saved', entry('Bid sent', { name: 'Proposal out', was: 'Nope' }), 400],
        ['one stage twice', [...entry('Bid sent', { name: 'One', was: 'Bid sent' }), { name: 'Two', was: 'Bid sent', weight: 5 }], 400],
        ['onto a name kept', entry('Bid sent', { name: 'site VISIT', was: 'Bid sent' }), 400],
        ['onto a name whose own stage is dropped with a deal in it', entry('Bid sent', { name: 'Lead in', was: 'Bid sent' }).filter((s) => s.was || s.name !== 'Lead in'), 409],
        ['dropped, no rename', entry('Bid sent', { name: 'Proposal out' }), 409],
        ['too long', entry('Bid sent', { name: 'x'.repeat(101), was: 'Bid sent' }), 400],
        ['reads as closed', entry('Bid sent', { name: 'Closed - pending', was: 'Bid sent' }), 400],
    ]) {
        const r = await admin({ funnelStages });
        assert.deepEqual([r.status, r.body.field], [status, 'funnelStages'], `${why}: ${JSON.stringify(r.body)}`);
        await untouched(why);
    }
    for (const was of [7, {}, '', null, '  ']) assert.equal((await admin({ funnelStages: entry('Bid sent', { was }) })).status, 200, `was ${JSON.stringify(was)} with the same name names nothing`);
    const role = await call(settingsHandler, 'PUT', renaming({ 'Bid sent': 'X' }), { role: 'Manager' });
    assert.equal(role.status, 403);
    await untouched('a Manager');
    // A name freed by the same save is a stage's of its own.
    const freed = await admin({ funnelStages: [...entry('Bid sent', { name: 'Proposal out', was: 'Bid sent' }), { name: 'Bid sent', weight: 5 }] });
    assert.deepEqual([freed.status, (await row('in')).stage], [200, 'Proposal out']);
});

test('a save refused as stale, or one that loses its race, renames nothing', async () => {
    await seed();
    const first = await admin({ funnelStages: LIST, ifRevs: { funnelStages: null } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const stale = await admin({ ...renaming({ 'Bid sent': 'X' }), ifRevs: { funnelStages: null } });
    assert.deepEqual([stale.status, stale.body.code, (await row('in')).stage], [409, 'stale', 'Bid sent']);
    // Another save of the list lands between this one's read and its write.
    putSeam.beforeWrite = async () => { putSeam.beforeWrite = null; assert.equal((await admin({ funnelStages: LIST })).status, 200); };
    const lost = await admin({ ...renaming({ 'Bid sent': 'X' }), ifRevs: { funnelStages: first.body.revs.funnelStages } });
    putSeam.beforeWrite = null;
    assert.deepEqual([lost.status, lost.body.code, (await row('in')).stage, (await conditions('rule'))[0].value, (await filters('report')).where[0].value, (await extra()).dealModel.usual.stageDays['Bid sent']], [409, 'stale', 'Bid sent', 'bid SENT', ' BID sent', 9]);
    assert.equal((await db.select().from(auditLog).where(eq(auditLog.orgId, A))).filter((a) => /renamed/.test(a.detail || '')).length, 0);
});

test("an org whose stages are the old column's, or the app's own, renames them as well", async () => {
    await seed();
    await db.update(settings).set({ extra: {}, stages: LIST }).where(eq(settings.orgId, A));
    assert.equal((await admin(renaming({ 'Bid sent': 'Quoted' }))).status, 200);
    assert.deepEqual([(await row('in')).stage, (await extra()).funnelStages[2].name], ['Quoted', 'Quoted']);
    await seed();
    await db.update(settings).set({ extra: {}, stages: [] }).where(eq(settings.orgId, A));
    await db.update(opportunities).set({ stage: 'Proposal' }).where(eq(opportunities.id, ID('in')));
    await db.update(opportunities).set({ stage: 'Discovery' }).where(inArray(opportunities.id, ['none', 'object', 'other', 'odd'].map(ID)));
    const { DEFAULT_SETTINGS } = await import('../../src/utils/settingsDefaults.js');
    assert.equal((await admin(renaming({ Proposal: 'Offer' }, DEFAULT_SETTINGS.funnelStages))).status, 200);
    assert.equal((await row('in')).stage, 'Offer');
});

test('a save that moves no stage writes none: one that read the deal before a rename and writes it after leaves the new name', async () => {
    await seed();
    seam.beforeWrite = async () => { seam.beforeWrite = null; assert.equal((await admin(renaming({ 'Bid sent': 'Quoted' }))).status, 200); };
    const r = await call(deals, 'PUT', { id: ID('in'), notes: 'x', stage: 'Bid sent' });
    seam.beforeWrite = null;
    assert.deepEqual([r.status, (await row('in')).stage, (await row('in')).notes, (await moves('in'))[0]], [200, 'Quoted', 'x', ['Site visit', 'Quoted']]);
    assert.equal((await db.select().from(automationRuns).where(eq(automationRuns.orgId, A))).length, 0, 'REGRESSION: the rename was said as a move');
    // A move landing in the same window stands whole: its stage, its won date, its clock and its probability.
    await seed();
    seam.beforeWrite = async () => { seam.beforeWrite = null; assert.equal((await call(deals, 'PUT', { id: ID('in'), stage: 'Closed Won' })).status, 200); };
    assert.equal((await call(deals, 'PUT', { id: ID('in'), notes: 'y' })).status, 200);
    seam.beforeWrite = null;
    const won = await row('in');
    assert.deepEqual([won.stage, won.notes, won.probability, !!won.wonDate, won.stageChangedDate === '2026-01-02', won.stageHistory.length], ['Closed Won', 'y', 100, true, false, 3], 'REGRESSION: a won deal with no won date');
    // What a save names of them, it writes.
    assert.equal((await call(deals, 'PUT', { id: ID('past'), wonDate: '2026-03-03', probability: 90 })).status, 200);
    assert.deepEqual([(await row('past')).wonDate, (await row('past')).probability], ['2026-03-03', 90]);
});
