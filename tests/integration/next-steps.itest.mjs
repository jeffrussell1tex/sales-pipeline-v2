// tests/integration/next-steps.itest.mjs
// The recommendation log's outcomes (AI scoring batch 3; docs/design/deal-score/DESIGN-3.md — Jeff, 17 Nov: Q2 "What
// happens on the deal", Q5 "Nightly, alerts + next steps") — recommendation-log.mjs judgePending against the real test
// database. Proves:
//   NEXT STEP  acted on when an activity is logged on the deal, or its stage moves, within 14 days — resolved, its days
//              counted; still pending inside the window with neither; ignored once the window has passed; an activity
//              after the window does not count
//   ALERTS     a score drop is resolved once the deal is out of Critical, ignored while it stays; an alert younger than 3
//              days waits; the renewal ledger's rows and rows past 30 days are left as they are
//   ISOLATION  judging org A changes nothing of org B's; org B's own pass judges its rows
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_itest_nxs';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// The endpoint file is imported for its pass; the sign-in is never asked here.
const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');
mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async () => ({ error: 'not used', status: 401 }),
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});

const { judgePending } = await import('../../netlify/functions/recommendation-log.mjs');
const { db } = await import('../../db/index.js');
const { opportunities, activities, recommendationLog } = await import('../../db/schema.js');
const { inArray, eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_nxs_*', and only this file writes to it.
const A = 'itest_nxs_A', B = 'itest_nxs_B';
const NOW = new Date();
const ago = (days) => new Date(NOW.getTime() - days * 86400000);
const D = (n) => `opp_itest_nxs_${n}`;
const R = (n) => `rec_itest_nxs_${n}`;
const todayUtc = NOW.toISOString().slice(0, 10);

const deal = (n, org, extra = {}) => ({ id: D(n), orgId: org, pipelineId: 'itest_nxs_pipe', opportunityName: `Deal ${n}`, stage: 'Proposal', stageChangedDate: '2026-01-01', ...extra });
const row = (n, org, actionType, dealN, days) => ({ id: R(n), orgId: org, repName: 'Rhea Nxs', actionType, opportunityId: dealN ? D(dealN) : null, dealName: dealN ? `Deal ${dealN}` : null, stage: 'Proposal', signal: 'x', outcome: 'pending', dismissedAt: ago(days) });

const cleanup = async () => {
    for (const t of [recommendationLog, activities, opportunities]) await db.delete(t).where(inArray(t.orgId, [A, B]));
};
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(opportunities).values([
        deal('acted', A), deal('waiting', A), deal('lapsed', A), deal('late', A),
        deal('moved', A, { stageChangedDate: todayUtc }),
        deal('out', A, { dealScore: { score: 30, status: 'At Risk', weight: 60 } }),
        deal('in', A, { dealScore: { score: 10, status: 'Critical', weight: 60 } }),
        deal('bravo', B),
    ]);
    await db.insert(activities).values([
        { id: 'act_itest_nxs_acted', orgId: A, opportunityId: D('acted'), type: 'Call', date: todayUtc, createdAt: ago(1) },
        { id: 'act_itest_nxs_late', orgId: A, opportunityId: D('late'), type: 'Call', date: todayUtc, createdAt: ago(5) },   // 20 days after its next step
    ]);
    await db.insert(recommendationLog).values([
        row('acted', A, 'next_step', 'acted', 2),
        row('waiting', A, 'next_step', 'waiting', 5),
        row('lapsed', A, 'next_step', 'lapsed', 15),
        row('late', A, 'next_step', 'late', 25),
        row('moved', A, 'next_step', 'moved', 3),
        row('out', A, 'scoreDrop', 'out', 4),
        row('in', A, 'scoreDrop', 'in', 4),
        row('young', A, 'stale', 'waiting', 1),
        row('renewal', A, 'renewal_due', null, 10),
        row('old', A, 'next_step', 'lapsed', 40),
        row('bravo', B, 'next_step', 'bravo', 15),
    ]);
});
after(cleanup);

const outcomes = async (org) => Object.fromEntries((await db.select().from(recommendationLog).where(eq(recommendationLog.orgId, org)))
    .map((r) => [r.id.replace('rec_itest_nxs_', ''), [r.outcome, r.daysToResolve]]));

test('NEXT STEP and ALERTS: each row judged by its own rule — org B\'s untouched', async () => {
    const judged = await judgePending(A, null, NOW);
    assert.deepEqual(judged.map((j) => j.id.replace('rec_itest_nxs_', '')).sort(), ['acted', 'in', 'lapsed', 'late', 'moved', 'out'].sort());
    const got = await outcomes(A);
    assert.deepEqual(Object.fromEntries(Object.entries(got).map(([k, [o]]) => [k, o])), {
        acted:   'resolved',   // an activity inside its 14 days
        waiting: 'pending',    // inside the window, nothing yet
        lapsed:  'ignored',    // 15 days, nothing
        late:    'ignored',    // its activity came 20 days after — outside the window
        moved:   'resolved',   // its stage moved inside the window
        out:     'resolved',   // the deal is out of Critical
        in:      'ignored',    // still Critical
        young:   'pending',    // an alert waits 3 days
        renewal: 'pending',    // the renewal ledger is left as it is
        old:     'pending',    // past 30 days, left as it is
    });
    // The days counted: a \`timestamp without time zone\` reads back in the machine's zone (UTC on Netlify, exact; hours
    // off on a developer's machine — the memory note "timestamps read locally"), so a count may read one day short here.
    for (const [k, days] of [['acted', 2], ['moved', 3], ['out', 4]]) assert.ok([days - 1, days].includes(got[k][1]), `${k}: ${got[k][1]} days`);
    for (const k of ['lapsed', 'late', 'in']) assert.equal(got[k][1], null, `${k}: no days for an ignored row`);
    assert.deepEqual(await outcomes(B), { bravo: ['pending', null] }, 'REGRESSION: org A\'s pass judged org B\'s row');
});

test('ISOLATION: org B\'s own pass judges its rows', async () => {
    await judgePending(B, null, NOW);
    assert.deepEqual(await outcomes(B), { bravo: ['ignored', null] });
});

test('a second pass changes nothing it judged', async () => {
    const before = await outcomes(A);
    assert.deepEqual(await judgePending(A, null, NOW), []);
    assert.deepEqual(await outcomes(A), before);
});
