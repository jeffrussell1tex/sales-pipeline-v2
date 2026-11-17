// tests/integration/deal-score.itest.mjs
// A deal's score, its chance of winning (AI scoring batch 2A; docs/design/deal-score — Jeff, 17 Nov: "All
// recommended") — against the real test database. Proves:
//   TRAIN      an Admin's Train now fits org A's model on A's 40 closed deals, writes it as A's dealModel alone with its
//              held-out accuracy, scores every open deal of A on it and clears none of B; one audit row; a rep is refused
//   SCORED     an open deal is kept with its score — the start blended with the model by its share; a closed deal none
//   LIVE       a deal's save hands back the deal scored again; a body naming dealScore writes nothing of it; an activity
//              logged on a deal scores that deal and the answer names it
//   ISOLATION  org B's model, deals and scores untouched by everything A does; A naming B's deal scores nothing;
//              B's own pass reads B alone
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; the mailers, webhooks and
// automations are stubbed (no outbound calls).
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST; db/apply-deal-score.mjs --test --apply first)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_itest_dsc';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_dsc_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async () => {},
        emailTemplates: new Proxy({}, { get: (_, k) => (args) => ({ subject: String(k), html: JSON.stringify(args) }) }),
    },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, { namedExports: { dispatchWebhook: async () => {} } });
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, { namedExports: { dispatchAutomations: async () => {} } });

const { handler: dealsFn } = await import('../../netlify/functions/opportunities.mjs');
const { handler: actsFn } = await import('../../netlify/functions/activities.mjs');
const { handler: trainFn } = await import('../../netlify/functions/train-deal-model.mjs');
const { rescoreDeals, scoreOrgDeals } = await import('../../netlify/functions/_dealScore.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, activities, auditLog, settings } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');
const { learnedShare, MIN_TEACHING } = await import('../../src/utils/dealScore.js');

// ORG NAMESPACE: this file owns 'itest_dsc_*', and only this file writes to it.
const A = 'itest_dsc_A', B = 'itest_dsc_B';
const KAREN = { id: 'usr_itest-dsc-karen', clerk: 'clerk_itest_dsc_karen', name: 'Itest DSC Karen' };
const BOB   = { id: 'usr_itest-dsc-bob',   clerk: 'clerk_itest_dsc_bob',   name: 'Itest DSC Bob' };
const GUS   = { id: 'usr_itest-dsc-gus',   clerk: 'clerk_itest_dsc_gus',   name: 'Itest DSC Gus' };   // org B
const OPEN_BUSY = 'opp_itest_dsc_open_busy', OPEN_QUIET = 'opp_itest_dsc_open_quiet';
const B_OPEN = 'opp_itest_dsc_b_open', B_CLOSED = 'opp_itest_dsc_b_closed';
const B_MODEL = Object.freeze({ n: 1, leftOut: 0, trained: false, usual: { stageDays: {}, revenue: null }, checkedAt: '2026-01-01T00:00:00.000Z', mark: 'org B' });
const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const ev = (org, who, method, body, role = 'Admin', query) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-user': who.clerk, 'x-test-role': role, 'content-type': 'application/json' },
    body: body === undefined ? '' : JSON.stringify(body),
    queryStringParameters: query || {},
});
const dealOf = async (id, org) => (await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, org))))[0];
const modelOf = async (org) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0]?.extra?.dealModel ?? null;

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(activities).where(eq(activities.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([
        { id: KAREN.id, clerkUserId: KAREN.clerk, orgId: A, name: KAREN.name, email: 'karen@dsc.itest', role: 'User' },
        { id: BOB.id,   clerkUserId: BOB.clerk,   orgId: A, name: BOB.name,   email: 'bob@dsc.itest',   role: 'Admin' },
        { id: GUS.id,   clerkUserId: GUS.clerk,   orgId: B, name: GUS.name,   email: 'gus@dsc.itest',   role: 'Admin' },
    ]);
    invalidateRoster();
    await db.insert(settings).values([
        { id: 'itest_dsc_settings_A', orgId: A, extra: { featureFlags: {} }, updatedAt: new Date() },
        { id: 'itest_dsc_settings_B', orgId: B, extra: { dealModel: B_MODEL }, updatedAt: new Date() },
    ]);
    const deal = (id, org, extra = {}) => ({ id, orgId: org, ownerId: org === A ? KAREN.id : GUS.id, salesRep: org === A ? KAREN.name : GUS.name, opportunityName: id, account: 'Itest DSC Co', pipelineId: 'default', stage: 'Proposal', arr: '10000.00', comments: [], stageHistory: [], ...extra });
    // 40 closed deals in A: the winners met often in the fortnight before their close, the losers went quiet.
    const closed = [], acts = [];
    for (let i = 0; i < 40; i++) {
        const win = i % 2 === 0, id = `opp_itest_dsc_c${i}`, stage = win ? 'Closed Won' : 'Closed Lost';
        closed.push(deal(id, A, { stage, stageHistory: [
            { stage: 'Discovery', date: '2026-06-01' }, { stage: 'Proposal', prevStage: 'Discovery', date: '2026-07-01' },
            { stage, prevStage: 'Proposal', date: '2026-08-01' },
        ] }));
        const dates = win ? ['2026-07-25', '2026-07-28', '2026-07-30'] : ['2026-06-05'];
        dates.forEach((d, j) => acts.push({ id: `act_itest_dsc_c${i}_${j}`, orgId: A, opportunityId: id, type: win ? 'Meeting' : 'Email', date: d, ownerId: KAREN.id, contactIds: [] }));
    }
    await db.insert(opportunities).values([
        ...closed,
        deal(OPEN_BUSY, A, { stageChangedDate: daysAgo(5), stageHistory: [{ stage: 'Proposal', prevStage: 'Discovery', date: daysAgo(5) }], forecastedCloseDate: daysAgo(-40) }),
        deal(OPEN_QUIET, A, { stageChangedDate: daysAgo(5), forecastedCloseDate: daysAgo(-40) }),
        deal(B_OPEN, B, { dealScore: null }),
        deal(B_CLOSED, B, { stage: 'Closed Won', stageHistory: [{ stage: 'Proposal', date: '2026-07-01' }, { stage: 'Closed Won', prevStage: 'Proposal', date: '2026-08-01' }] }),
    ]);
    acts.push({ id: 'act_itest_dsc_busy_1', orgId: A, opportunityId: OPEN_BUSY, type: 'Meeting', date: daysAgo(2), ownerId: KAREN.id, contactIds: [] });
    acts.push({ id: 'act_itest_dsc_b_1', orgId: B, opportunityId: B_CLOSED, type: 'Call', date: '2026-07-15', ownerId: GUS.id, contactIds: [] });
    await db.insert(activities).values(acts);
});
after(cleanup);

// ── TRAIN ────────────────────────────────────────────────────────────────────

test('TRAIN: a rep is refused Train now — nothing written', async () => {
    const r = await trainFn(ev(A, KAREN, 'POST', undefined, 'User'));
    assert.equal(r.statusCode, 403, r.body);
    assert.equal(await modelOf(A), null, 'no model written');
});

test('TRAIN: an Admin\'s Train now fits A\'s model on A\'s closed deals alone, measured on deals held out, and scores A\'s deals', async () => {
    const r = await trainFn(ev(A, BOB, 'POST'));
    assert.equal(r.statusCode, 200, r.body);
    const body = JSON.parse(r.body);
    assert.equal(body.ok, true);
    assert.equal(body.minTeaching, MIN_TEACHING);
    assert.equal(body.modelWritten, true);
    const m = await modelOf(A);
    assert.deepEqual(m, body.dealModel, 'the answer is the model as stored');
    assert.equal(m.trained, true);
    assert.equal(m.n, 40, 'A\'s 40 closed deals — never B\'s');
    assert.equal(m.accuracy.total, 40, 'every teaching deal measured once, held out');
    assert.ok(m.accuracy.correct >= 30, `held out: ${m.accuracy.correct}/40`);
    const [row] = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'deal_model.trained')));
    assert.ok(row, 'one audit row');
    assert.match(row.detail, /^trained on 40 closed deals · right on \d+ of 40 held out · \d+ deals re-scored$/);
});

// ── SCORED ───────────────────────────────────────────────────────────────────

test('SCORED: an open deal keeps its win chance, the start blended with the model by its share; a closed deal none', async () => {
    const busy = await dealOf(OPEN_BUSY, A);
    const s = busy.dealScore;
    assert.ok(s, 'scored');
    assert.equal(s.weight, 60, 'Proposal, the default funnel');
    assert.equal(s.share, Math.round(learnedShare(40) * 100) / 100);
    assert.ok(Number.isInteger(s.learned));
    assert.equal(s.score, Math.round((1 - learnedShare(40)) * s.rules + learnedShare(40) * s.learned));
    assert.ok(s.factors.some((f) => f.learned), 'the model\'s pulls among the factors');
    const quiet = await dealOf(OPEN_QUIET, A);
    assert.ok(quiet.dealScore.factors.some((f) => f.text === 'No activities logged for this opportunity'));
    assert.ok(quiet.dealScore.score < s.score, 'the quiet deal reads lower than the busy one');
    assert.equal((await dealOf('opp_itest_dsc_c0', A)).dealScore, null, 'a closed deal has no score');
    // A second pass over nothing changed writes nothing: a stored score is the same score in the database's key order
    // (found in §0.256's browser check — every pass rewrote every deal).
    const again = await scoreOrgDeals(A, { train: false });
    assert.equal(again.dealsUpdated, 0, 'REGRESSION: an unchanged score rewritten');
    assert.equal((await dealOf(OPEN_BUSY, A)).dealScore.scoredAt, s.scoredAt, 'the kept score untouched');
});

// ── LIVE ─────────────────────────────────────────────────────────────────────

test('LIVE: a deal\'s save hands back the deal scored again; a body naming dealScore writes nothing of it', async () => {
    const r = await dealsFn(ev(A, KAREN, 'PUT', { id: OPEN_QUIET, stage: 'Contracts', dealScore: { score: 99, status: 'Healthy' } }, 'User'));
    assert.equal(r.statusCode, 200, r.body);
    const answered = JSON.parse(r.body).opportunity.dealScore;
    const stored = (await dealOf(OPEN_QUIET, A)).dealScore;
    assert.equal(stored.weight, 90, 'scored on its new stage');
    assert.notEqual(stored.score, 99, 'REGRESSION: a body wrote the deal\'s score');
    assert.deepEqual(answered, stored, 'the answer is the score as kept');
    const created = await dealsFn(ev(A, KAREN, 'POST', { id: 'opp_itest_dsc_new', opportunityName: 'New', account: 'Itest DSC Co', pipelineId: 'default', stage: 'Discovery', dealScore: { score: 99 } }, 'User'));
    assert.equal(created.statusCode, 201, created.body);
    const made = await dealOf('opp_itest_dsc_new', A);
    assert.equal(made.dealScore.weight, 20, 'a new deal scored on its stage');
    assert.notEqual(made.dealScore.score, 99);
    assert.deepEqual(JSON.parse(created.body).opportunity.dealScore, made.dealScore);
});

test('LIVE: an activity logged on a deal scores that deal, and the answer names it; its delete too', async () => {
    const before = (await dealOf('opp_itest_dsc_new', A)).dealScore;
    const r = await actsFn(ev(A, KAREN, 'POST', { id: 'act_itest_dsc_new_1', opportunityId: 'opp_itest_dsc_new', type: 'Call', date: TODAY }, 'User'));
    assert.equal(r.statusCode, 201, r.body);
    const { dealScores } = JSON.parse(r.body);
    const after = (await dealOf('opp_itest_dsc_new', A)).dealScore;
    assert.deepEqual(dealScores, { 'opp_itest_dsc_new': after }, 'the answer names the deal and its score as kept');
    assert.ok(before.factors.some((f) => f.text === 'No activities logged for this opportunity'));
    assert.ok(!after.factors.some((f) => f.text === 'No activities logged for this opportunity'), 'the activity counted');
    const del = await actsFn(ev(A, KAREN, 'DELETE', undefined, 'User', { id: 'act_itest_dsc_new_1' }));
    assert.equal(del.statusCode, 200, del.body);
    const gone = (await dealOf('opp_itest_dsc_new', A)).dealScore;
    assert.deepEqual(JSON.parse(del.body).dealScores, { 'opp_itest_dsc_new': gone });
    assert.ok(gone.factors.some((f) => f.text === 'No activities logged for this opportunity'), 'scored again without it');
});

// ── ISOLATION ────────────────────────────────────────────────────────────────

test('ISOLATION: everything A did left B\'s model, deals and scores as they were; A naming B\'s deal scores nothing', async () => {
    assert.deepEqual(await modelOf(B), B_MODEL, 'B\'s model untouched');
    assert.equal((await dealOf(B_OPEN, B)).dealScore, null, 'B\'s deal unscored by A\'s passes');
    assert.deepEqual(await rescoreDeals(A, [B_OPEN]), {}, 'A asking for B\'s deal finds none');
    assert.equal((await dealOf(B_OPEN, B)).dealScore, null);
    // B's own pass reads B alone: one closed deal (B's), no model, B's deal scored on the start.
    const r = await scoreOrgDeals(B, { train: true });
    assert.equal(r.model.n, 1, 'B\'s one closed deal — never A\'s forty');
    assert.equal(r.model.trained, false);
    assert.equal((await dealOf(B_OPEN, B)).dealScore.learned, null, 'B\'s deal on the rules');
    assert.equal((await modelOf(A)).n, 40, 'A\'s model untouched by B\'s pass');
});
