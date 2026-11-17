// tests/integration/win-alert.itest.mjs
// The score-drop alert on the win chance (AI scoring batch 2C; docs/design/deal-score/DESIGN-2C.md — Jeff, 17 Nov: Q1
// "A fall into Critical", Q3 "Add the switch"), the hourly pass against the REAL test database with every sender
// recording instead of sending. Proves:
//   FALL       a deal whose band fell from At Risk or Healthy to Critical within the day is alerted once — the rep's email
//              in the new words, the log row, the company's Slack post, the automation (`score_drop`, the win chance);
//              the manager copied below a quarter of the stage's usual, not above
//   LEVEL      a deal already Critical (no fall), or one that fell days ago, is not alerted
//   ONCE       a second pass at the same hour alerts nothing again (the week's dedupe)
//   SWITCH     a rep who turned the alert off gets no email; the log, Slack post and automation still go (the company's)
//   ISOLATION  org B's fall is its own rep's alone; nothing of org A reaches org B
//
// Its members are due at 15:00 UTC (scheduled-job-orgs.itest.mjs's at 14:00; every other suite's at 08:00), so no other
// suite's row is acted on in these runs, and the assertions read only this file's orgs.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST; db/apply-deal-score.mjs --test --apply first)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const mails = [], posts = [], fired = [];
const tpl = (kind) => (detail) => ({ subject: kind, html: `<p>${kind}</p>`, detail: { kind, ...detail } });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (opts) => { mails.push(opts); return { success: true, id: 'itest' }; },
        emailTemplates: Object.fromEntries(['dealSilent', 'dealStuck', 'closeDateLapsed', 'dealMomentum', 'managerDealAlert', 'agreementRenewal', 'taskDigest', 'overdueTaskNudge']
            .map(k => [k, tpl(k)])),
    },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: new Proxy({}, { get: () => () => '' }), normalizePhone: (p) => p || null },
});
mock.module(new URL('../../netlify/functions/send-slack.mjs', import.meta.url).href, {
    namedExports: {
        sendSlackToOrg: async (orgId, msg, type) => { posts.push({ orgId, msg, type }); return false; },
        slackTemplates: Object.fromEntries(['dealSilent', 'dealStuck', 'closeDateLapsed', 'dealMomentum', 'scoreDrop', 'agreementRenewal']
            .map(k => [k, (d) => ({ text: k, detail: d })])),
    },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async (orgId, trigger, data) => { fired.push({ orgId, trigger, data }); } },
});

const { runPipelineAlerts } = await import('../../netlify/functions/pipeline-alerts.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, recommendationLog } = await import('../../db/schema.js');
const { inArray, and, eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_winalert_*', and only this file writes to it.
const A = 'itest_winalert_A', B = 'itest_winalert_B';
const ORGS = [A, B];
// The instant: today's 15:00 UTC, or yesterday's when that is still ahead.
const NOW = (() => { const d = new Date(); d.setUTCHours(15, 0, 0, 0); if (d.getTime() > Date.now()) d.setUTCDate(d.getUTCDate() - 1); return d; })();
const ago = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
const day = (n) => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);
const due = { timezone: 'UTC', alertTime: '15:00' };

const member = (org, key, name, role, profile = {}) => ({
    id: `usr_itest_winalert_${org === A ? 'a' : 'b'}_${key}`, orgId: org, name, role, active: true,
    email: `${key}@itest-winalert-${org === A ? 'a' : 'b'}.local`, profile: { ...due, ...profile },
});
const RHEA = member(A, 'rhea', 'Rhea Winalert', 'User');
const OTTO = member(A, 'otto', 'Otto Winalert', 'User', { notificationPrefs: { scoreDropAlert: { enabled: false } } });
const MAX  = member(A, 'max',  'Max Winalert',  'Manager', { managedReps: ['Rhea Winalert', 'Otto Winalert'] });
const BO   = member(B, 'bo',   'Bo Winalert',   'User');

// A kept score as the server writes it (src/utils/dealScore.js), its band's last move noted.
const score = (s, weight, status, previousStatus, statusChangedAt) => ({
    score: s, status, weight, rules: s, learned: null, share: 0, scoredAt: ago(1), modelTrainedAt: null,
    factors: [{ text: 'No activity in over 30 days (34 days)', effect: -24 }],
    ...(previousStatus ? { previousStatus, statusChangedAt } : {}),
});
// Quiet otherwise: created and moved days ago, no close date — no stale, stuck or lapsed signal of their own.
const deal = (key, org, owner, name, dealScore) => ({
    id: `opp_itest_winalert_${key}`, orgId: org, pipelineId: 'itest_winalert_pipe', opportunityName: name, account: `${name} Co`,
    stage: 'Proposal', arr: '30000', salesRep: owner.name, ownerId: owner.id, createdDate: day(-5), stageChangedDate: day(-3), dealScore,
});
const DEALS = [
    deal('fall', A, RHEA, 'Alpha Fall', score(12, 60, 'Critical', 'At Risk', ago(2))),          // fell today; 12 < 15: the manager too
    deal('fall_mild', A, RHEA, 'Alpha Mild Fall', score(20, 60, 'Critical', 'Healthy', ago(5))), // fell today; 20 ≥ 15: the rep alone
    deal('level', A, RHEA, 'Alpha Level', score(10, 60, 'Critical')),                            // Critical with no fall
    deal('old', A, RHEA, 'Alpha Old Fall', score(10, 60, 'Critical', 'At Risk', ago(72))),       // fell three days ago
    deal('switch', A, OTTO, 'Alpha Switched Off', score(14, 60, 'Critical', 'At Risk', ago(3))), // its rep turned the alert off
    deal('bravo', B, BO, 'Bravo Fall', score(13, 60, 'Critical', 'At Risk', ago(2))),
];

const cleanup = async () => {
    for (const t of [recommendationLog, opportunities, users]) await db.delete(t).where(inArray(t.orgId, ORGS));
};
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([RHEA, OTTO, MAX, BO]);
    await db.insert(opportunities).values(DEALS);
});
after(cleanup);

const ours = (list) => list.filter((m) => /@itest-winalert-/.test(String(m.to)));
const subjects = (to) => ours(mails).filter((m) => m.to === to).map((m) => m.subject).sort();

test('FALL, LEVEL, SWITCH: a fall into Critical within the day is alerted — the rep in the new words, the manager below a quarter; a level or an old fall is not; a rep who switched it off gets no email', async () => {
    mails.length = 0; posts.length = 0; fired.length = 0;
    const r = await runPipelineAlerts({ now: NOW });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(subjects(RHEA.email), [
        "⚠️ Win chance fell to Critical: Alpha Fall — 12% (the stage's usual is 60%)",
        "⚠️ Win chance fell to Critical: Alpha Mild Fall — 20% (the stage's usual is 60%)",
    ], 'REGRESSION: a level, or a fall days ago, mailed — or a fall missed');
    const rheaFall = ours(mails).find((m) => m.to === RHEA.email && /Alpha Fall/.test(m.subject));
    assert.match(rheaFall.html, /fell to Critical — it was At Risk/);
    assert.match(rheaFall.html, /No activity in over 30 days \(34 days\)/, 'the factor costing the most said');
    assert.deepEqual(subjects(OTTO.email), [], 'REGRESSION: the rep\'s own switch ignored');
    const toMax = ours(mails).filter((m) => m.to === MAX.email);
    // Below a quarter of 60 (15): Alpha Fall's 12 and Alpha Switched Off's 14 — the rep's own switch never governs the
    // manager's copy; Alpha Mild Fall's 20 is above it.
    assert.deepEqual(toMax.map((m) => [m.detail.kind, m.detail.alertType, m.detail.dealName]).sort(), [
        ['managerDealAlert', 'score-critical', 'Alpha Fall'], ['managerDealAlert', 'score-critical', 'Alpha Switched Off'],
    ], 'the manager below a quarter of the stage\'s usual, not above');
    assert.match(toMax.find((m) => m.detail.dealName === 'Alpha Fall').detail.detail, /^Win chance 12% — Critical for Proposal \(the stage's usual is 60%\): No activity/);
    // The company's: the log, the Slack post and the automation, for every fall — the switched-off rep's too.
    const rows = await db.select().from(recommendationLog).where(and(inArray(recommendationLog.orgId, [A]), eq(recommendationLog.actionType, 'scoreDrop')));
    assert.deepEqual(rows.map((x) => [x.dealName, x.signal]).sort(), [
        ['Alpha Fall', 'Win chance 12% (Critical, was At Risk)'],
        ['Alpha Mild Fall', 'Win chance 20% (Critical, was Healthy)'],
        ['Alpha Switched Off', 'Win chance 14% (Critical, was At Risk)'],
    ]);
    const aPosts = posts.filter((p) => p.orgId === A && p.type === 'scoreDropAlert');
    assert.deepEqual(aPosts.map((p) => [p.msg.detail.dealName, p.msg.detail.score, p.msg.detail.verdict]).sort(), [
        ['Alpha Fall', 12, 'Critical for Proposal'], ['Alpha Mild Fall', 20, 'Critical for Proposal'], ['Alpha Switched Off', 14, 'Critical for Proposal'],
    ]);
    const aFired = fired.filter((f) => f.orgId === A && f.trigger === 'opportunity.score_drop');
    assert.equal(aFired.length, 3);
    assert.ok(aFired.every((f) => f.data.verdict === 'Critical'), 'the band');
    assert.deepEqual(aFired.map((f) => f.data.score).sort((x, y) => x - y), [12, 14, 20], 'the win chance, as score');
});

test('ISOLATION: org B\'s fall is its own rep\'s alone; nothing of org A reaches org B', () => {
    assert.deepEqual(subjects(BO.email), ["⚠️ Win chance fell to Critical: Bravo Fall — 13% (the stage's usual is 60%)"]);
    for (const m of ours(mails)) {
        const toB = /@itest-winalert-b\./.test(m.to);
        if (toB) assert.ok(!/Alpha/.test(m.subject + (m.html || '')), 'REGRESSION: org A\'s deal in org B\'s mail');
        else assert.ok(!/Bravo/.test(m.subject + (m.html || '') + JSON.stringify(m.detail || {})), 'REGRESSION: org B\'s deal in org A\'s mail');
    }
    assert.deepEqual(posts.filter((p) => p.orgId === B && p.type === 'scoreDropAlert').map((p) => p.msg.detail.dealName), ['Bravo Fall']);
});

test('ONCE: a second pass at the same hour alerts no fall again — the week\'s dedupe', async () => {
    mails.length = 0; posts.length = 0; fired.length = 0;
    const r = await runPipelineAlerts({ now: NOW });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(ours(mails).filter((m) => /Win chance/.test(m.subject) || m.detail?.alertType === 'score-critical'), [], 'REGRESSION: a fall mailed twice');
    assert.equal(fired.filter((f) => ORGS.includes(f.orgId) && f.trigger === 'opportunity.score_drop').length, 0);
});
