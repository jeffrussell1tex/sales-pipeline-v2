// tests/integration/scheduled-job-orgs.itest.mjs
//
// State §0.159, guide §18b52 — the scheduled jobs against the REAL test database
// (DATABASE_URL_TEST), with every sender recording instead of sending. Two orgs
// share every display name — "Karen Russell", "Maya Manager", "Avery Admin" —
// and the team name "Enterprise"; org A has a SECOND "Karen Russell" too. Until
// §0.159 pipeline-alerts resolved a deal's rep with `userByName[name]` (the last
// row of ANY org won), took a manager from every org's managedReps and team
// names, and averaged every org's stage history; the Monday team digest listed
// every org's reps; task-reminders texted a member every task whose assignee
// carried their name, in any org. Proves, for each job, that every message goes
// to the record's OWNER (by app user id) and that org's manager, that nothing
// about one org reaches the other, and that one org's rows (its stage history,
// an activity naming the other org's deal) change nothing in the other's alerts.
//
// The jobs read every org's rows, so the suite runs them at its own instant — a
// Monday (the team digest's day), 14:00 UTC, never more than a day ahead of the
// clock — and its members are due at 14:00 UTC; every other suite's member
// defaults to 08:00, so no other org's row is acted on in these runs.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// The senders record instead of sending. A template hands back what it was
// given (`detail`) so a test reads which deal, which task, which average.
const mails = [], texts = [], posts = [], fired = [];
const tpl = (kind) => (detail) => ({ subject: kind, html: `<p>${kind}</p>`, detail: { kind, ...detail } });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (opts) => { mails.push(opts); return { success: true, id: 'itest' }; },
        emailTemplates: Object.fromEntries(['dealSilent', 'dealStuck', 'closeDateLapsed', 'dealMomentum', 'managerDealAlert', 'agreementRenewal', 'taskDigest', 'overdueTaskNudge']
            .map(k => [k, tpl(k)])),
    },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: {
        sendSms: async (opts) => { texts.push(opts); return { success: true, sid: 'SMitest' }; },
        smsTemplates: {
            dealSilent: (d) => `dealSilent ${d.dealName}`, dealStuck: (d) => `dealStuck ${d.dealName}`,
            closeDateLapsed: (d) => `closeDateLapsed ${d.dealName}`, managerDealAlert: (d) => `managerDealAlert ${d.dealName}`,
            digestSummary: (d) => `digestSummary ${d.repName}`, taskReminder: (d) => `TASK ${d.taskTitle}`,
        },
        normalizePhone: (p) => p || null,
    },
});
// Slack answers "not posted" — so the renewal pass, which reads every org's
// customers whatever the hour, writes no ledger row for any org.
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
const { runDigest } = await import('../../netlify/functions/digest.mjs');
const { runTaskReminders } = await import('../../netlify/functions/task-reminders.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, activities, tasks, automations, recommendationLog } = await import('../../db/schema.js');
const { inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_alerts_A', ORG_B = 'itest_alerts_B';
const ORGS = [ORG_A, ORG_B];

// The instant: the most recent Monday, 14:00 UTC.
const NOW = (() => { const d = new Date(); d.setUTCHours(14, 0, 0, 0); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1); return d; })();
const day = (n) => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);

const DOMAIN_A = '@itest-alerts-a.local', DOMAIN_B = '@itest-alerts-b.local';
const PHONE_A = '+15550100001', PHONE_B = '+15550100002';
const due = { timezone: 'UTC', digestTime: '14:00' };
const dealDigest = { notificationPrefs: { stageChanged: { enabled: true, mode: 'digest' } } };
const member = (org, key, name, role, team, profile = {}) => ({
    id: `usr_itest_alerts_${org === ORG_A ? 'a' : 'b'}_${key}`, orgId: org, name, role, team,
    email: `${key}${org === ORG_A ? DOMAIN_A : DOMAIN_B}`, active: true, profile: { ...due, ...profile },
});
// Org A first, org B after: a lookup that lets the last row of any org win
// resolves org A's names to org B's people.
const A_KAREN  = member(ORG_A, 'karen',  'Karen Russell', 'User',    'Enterprise', { ...dealDigest, mobile: PHONE_A, smsNotifications: { enabled: true, taskReminders: true } });
const A_KAREN2 = member(ORG_A, 'karen2', 'Karen Russell', 'User',    'Midmarket',  { ...dealDigest });
const A_DANA   = member(ORG_A, 'dana',   'Dana Diaz',     'User',    'Enterprise');
const A_MAYA   = member(ORG_A, 'maya',   'Maya Manager',  'Manager', 'Enterprise', { managedReps: ['Karen Russell'] });
const A_AVERY  = member(ORG_A, 'avery',  'Avery Admin',   'Admin',   null);
const B_KAREN  = member(ORG_B, 'karen',  'Karen Russell', 'User',    'Enterprise', { ...dealDigest, mobile: PHONE_B, smsNotifications: { enabled: true, taskReminders: true } });
const B_BRAM   = member(ORG_B, 'bram',   'Bram Bravo',    'User',    'Enterprise');
const B_MAYA   = member(ORG_B, 'maya',   'Maya Manager',  'Manager', 'Enterprise', { managedReps: ['Karen Russell'] });
const B_AVERY  = member(ORG_B, 'avery',  'Avery Admin',   'Admin',   null);
const MEMBERS = [A_KAREN, A_KAREN2, A_DANA, A_MAYA, A_AVERY, B_KAREN, B_BRAM, B_MAYA, B_AVERY];

// Every org-A record is named "Alpha …", every org-B record "Bravo …": a message
// to one org that names the other's is the leak, whatever the people are called.
const deal = (id, org, owner, name, f) => ({
    id: `opp_itest_alerts_${id}`, orgId: org, pipelineId: 'itest_alerts_pipe', opportunityName: name,
    account: org === ORG_A ? 'Alpha Account' : 'Bravo Account', salesRep: owner.name, ownerId: owner.id, ...f,
});
const DEALS = [
    // Lapsed close date: the rep, and the manager always (by managedReps).
    deal('a_lapsed', ORG_A, A_KAREN, 'Alpha Lapsed Deal', { stage: 'Proposal', arr: '50000', forecastedCloseDate: day(-10), createdDate: day(-40), stageChangedDate: day(-5) }),
    // Stuck: 25 days in Qualification against org A's OWN average (5 days) — the
    // manager too, at three times it. Org B's 300-day history must not lift it.
    deal('a_stuck', ORG_A, A_KAREN, 'Alpha Stuck Deal', { stage: 'Qualification', arr: '40000', createdDate: day(-60), stageChangedDate: day(-25) }),
    // Silent 30 days in org A; org B logs an activity against this deal's id yesterday.
    deal('a_silent', ORG_A, A_KAREN, 'Alpha Silent Deal', { stage: 'Discovery', arr: '30000', createdDate: day(-60), stageChangedDate: day(-10) }),
    // A rep whose manager is found by TEAM ("Enterprise" — org B's Manager is on one too).
    deal('a_team', ORG_A, A_DANA, 'Alpha Team Deal', { stage: 'Proposal', arr: '20000', forecastedCloseDate: day(-7), createdDate: day(-40), stageChangedDate: day(-5) }),
    // The second Karen Russell's deal: no signal of its own.
    deal('a_karen2', ORG_A, A_KAREN2, 'Alpha Karen-two Deal', { stage: 'Proposal', arr: '10000', forecastedCloseDate: day(30), createdDate: day(-40), stageChangedDate: day(-5) }),
    // Org A's history: Qualification took 5 days. The histories are fixed dates:
    // the job's daysBetween reads LOCAL noon, so a span across one DST change is an
    // hour short off UTC — these spans cross none, or both (net zero).
    deal('a_won', ORG_A, A_KAREN, 'Alpha Won Deal', { stage: 'Closed Won', arr: '70000', createdDate: '2026-06-01', wonDate: '2026-06-20', stageHistory: [{ stage: 'Proposal', prevStage: 'Qualification', date: '2026-06-06' }] }),
    deal('b_lapsed', ORG_B, B_KAREN, 'Bravo Lapsed Deal', { stage: 'Proposal', arr: '55000', forecastedCloseDate: day(-10), createdDate: day(-40), stageChangedDate: day(-5) }),
    // 25 days in Qualification against org B's average (300 days): not stuck.
    deal('b_slow', ORG_B, B_KAREN, 'Bravo Slow Deal', { stage: 'Qualification', arr: '45000', createdDate: day(-60), stageChangedDate: day(-25) }),
    // Org B's history: Qualification took 300 days.
    deal('b_won', ORG_B, B_BRAM, 'Bravo Won Deal', { stage: 'Closed Won', arr: '99000', createdDate: '2025-02-01', wonDate: '2025-12-15', stageHistory: [{ stage: 'Proposal', prevStage: 'Qualification', date: '2025-11-28' }] }),
];
const dealId = (k) => `opp_itest_alerts_${k}`;
const act = (id, org, dealKey, date) => ({ id: `act_itest_alerts_${id}`, orgId: org, type: 'Call', date, subject: 'itest', opportunityId: dealId(dealKey) });
const ACTS = [
    ...['a_lapsed', 'a_stuck', 'a_team', 'a_karen2', 'b_lapsed', 'b_slow'].map(k => act(k, k.startsWith('a_') ? ORG_A : ORG_B, k, day(-2))),
    act('a_silent', ORG_A, 'a_silent', day(-30)),
    act('b_names_a_silent', ORG_B, 'a_silent', day(-1)),
];
const task = (id, org, owner, title, f) => ({
    id: `task_itest_alerts_${id}`, orgId: org, title, assignedTo: owner.name, ownerId: owner.id, status: 'Open', completed: false, ...f,
});
const TASKS = [
    task('a_overdue', ORG_A, A_KAREN,  'Alpha overdue call',   { dueDate: day(-3) }),
    task('a_today',   ORG_A, A_KAREN,  'Alpha due today',      { dueDate: day(0) }),
    task('a_2pm',     ORG_A, A_KAREN,  'Alpha 2pm call',       { dueDate: day(0), dueTime: '14:00' }),
    task('a_karen2',  ORG_A, A_KAREN2, 'Alpha Karen-two task', { dueDate: day(0) }),
    task('b_overdue', ORG_B, B_KAREN,  'Bravo overdue call',   { dueDate: day(-3) }),
    task('b_today',   ORG_B, B_KAREN,  'Bravo due today',      { dueDate: day(0) }),
    task('b_2pm',     ORG_B, B_KAREN,  'Bravo 2pm call',       { dueDate: day(0), dueTime: '14:00' }),
];
// Both orgs have a task.overdue rule, so the hourly scan reads both orgs' tasks.
const RULES = ORGS.map(org => ({ id: `auto_itest_alerts_${org}`, orgId: org, name: 'Overdue nudge', triggerEvent: 'task.overdue', active: true }));

const cleanup = async () => {
    for (const t of [recommendationLog, automations, tasks, activities, opportunities, users]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values(MEMBERS);
    await db.insert(opportunities).values(DEALS);
    await db.insert(activities).values(ACTS);
    await db.insert(tasks).values(TASKS);
    await db.insert(automations).values(RULES);
});

after(async () => { await cleanup(); });

const reset = () => { mails.length = 0; texts.length = 0; posts.length = 0; fired.length = 0; };
const isA = (to) => String(to).endsWith(DOMAIN_A) || to === PHONE_A;
const isB = (to) => String(to).endsWith(DOMAIN_B) || to === PHONE_B;
const ours = (list) => list.filter(m => isA(m.to) || isB(m.to));
// What each of our addresses received, as "kind: deal" lines, sorted.
const received = (list) => {
    const out = {};
    for (const m of ours(list)) (out[m.to] = out[m.to] || []).push(`${m.detail?.kind || m.subject}: ${m.detail?.dealName || ''}`);
    for (const k of Object.keys(out)) out[k].sort();
    return out;
};
// No message to one org names anything of the other's.
const assertNothingCrosses = (list) => {
    for (const m of ours(list)) {
        const text = JSON.stringify(m);
        if (isA(m.to)) assert.ok(!/Bravo/.test(text), `${m.to} (org A) received org B's data: ${text.slice(0, 300)}`);
        if (isB(m.to)) assert.ok(!/Alpha|Dana Diaz/.test(text), `${m.to} (org B) received org A's data: ${text.slice(0, 300)}`);
    }
};
const sorted = (a) => [...a].sort();

// ── pipeline-alerts ──────────────────────────────────────────────────────────

let alertMails = [], alertPosts = [], alertFired = [];

test('pipeline-alerts: each deal\'s alerts go to its OWNER and that org\'s manager — never to the other org\'s Karen Russell or Maya Manager', async () => {
    reset();
    const r = await runPipelineAlerts({ now: NOW });
    assert.equal(r.statusCode, 200, r.body);
    alertMails = [...mails]; alertPosts = [...posts]; alertFired = [...fired];
    assert.deepEqual(received(alertMails), {
        [A_KAREN.email]: ['closeDateLapsed: Alpha Lapsed Deal', 'dealSilent: Alpha Silent Deal', 'dealStuck: Alpha Stuck Deal'],
        [A_DANA.email]:  ['closeDateLapsed: Alpha Team Deal'],
        [A_MAYA.email]:  ['managerDealAlert: Alpha Lapsed Deal', 'managerDealAlert: Alpha Silent Deal', 'managerDealAlert: Alpha Stuck Deal', 'managerDealAlert: Alpha Team Deal'],
        [B_KAREN.email]: ['closeDateLapsed: Bravo Lapsed Deal'],
        [B_MAYA.email]:  ['managerDealAlert: Bravo Lapsed Deal'],
    }, 'REGRESSION (§0.159): by display name, one org\'s Karen Russell was skipped and a Manager could be sent the other org\'s deal');
    assertNothingCrosses(alertMails);
});

test('pipeline-alerts: a stage\'s average is the org\'s own — org B\'s 300-day history neither silences org A\'s stuck deal nor is lowered by org A\'s', () => {
    const stuck = ours(alertMails).filter(m => m.detail?.kind === 'dealStuck');
    assert.deepEqual(stuck.map(m => [m.to, m.detail.dealName, m.detail.avgDays]), [[A_KAREN.email, 'Alpha Stuck Deal', 5]],
        'org A\'s own average (5 days) — averaged with org B\'s it was 153, and the deal was never stuck; Bravo Slow Deal stays under org B\'s 300');
    const copy = ours(alertMails).find(m => m.detail?.kind === 'managerDealAlert' && m.detail.dealName === 'Alpha Stuck Deal');
    assert.equal(copy.detail.alertType, 'stuck');
    assert.match(copy.detail.detail, /\(avg 5d\)$/, 'the manager copy prints the org\'s own average');
});

test('pipeline-alerts: an activity org B logs against org A\'s deal id does not make the deal look worked', () => {
    const silent = ours(alertMails).find(m => m.detail?.kind === 'dealSilent');
    assert.ok(silent, 'REGRESSION (§0.159): with every org\'s activities matched by deal id alone, org B\'s call yesterday hid 30 silent days');
    assert.equal(silent.detail.dealName, 'Alpha Silent Deal');
    assert.ok(silent.detail.daysSilent >= 29, `silent since org A's own last activity (${silent.detail.daysSilent} days)`);
});

test('pipeline-alerts: the company\'s Slack post, the rules engine and the ledger each carry a deal in its own org', async () => {
    const mine = alertPosts.filter(p => ORGS.includes(p.orgId));
    assert.deepEqual(sorted(mine.map(p => `${p.orgId} ${p.type}: ${p.msg.detail.dealName}`)), sorted([
        `${ORG_A} closeLapsed: Alpha Lapsed Deal`, `${ORG_A} dealStuck: Alpha Stuck Deal`, `${ORG_A} dealSilent: Alpha Silent Deal`,
        `${ORG_A} closeLapsed: Alpha Team Deal`, `${ORG_B} closeLapsed: Bravo Lapsed Deal`,
    ]));
    const ids = { [ORG_A]: new Set([...DEALS, ...TASKS].filter(r => r.orgId === ORG_A).map(r => r.id)), [ORG_B]: new Set([...DEALS, ...TASKS].filter(r => r.orgId === ORG_B).map(r => r.id)) };
    const rules = alertFired.filter(f => ORGS.includes(f.orgId));
    for (const f of rules) assert.ok(ids[f.orgId].has(f.data.id), `${f.trigger} fired in ${f.orgId} for ${f.data.id}, a record of another org`);
    assert.deepEqual(sorted(rules.map(f => `${f.orgId} ${f.trigger} ${f.data.id}`)), sorted([
        `${ORG_A} opportunity.close_lapsed ${dealId('a_lapsed')}`, `${ORG_A} opportunity.stuck ${dealId('a_stuck')}`,
        `${ORG_A} opportunity.silent ${dealId('a_silent')}`, `${ORG_A} opportunity.close_lapsed ${dealId('a_team')}`,
        `${ORG_B} opportunity.close_lapsed ${dealId('b_lapsed')}`,
        `${ORG_A} task.overdue task_itest_alerts_a_overdue`, `${ORG_B} task.overdue task_itest_alerts_b_overdue`,
    ]));
    const ledger = await db.select().from(recommendationLog).where(inArray(recommendationLog.orgId, ORGS));
    for (const row of ledger) assert.ok(ids[row.orgId].has(row.opportunityId), `ledger row in ${row.orgId} names ${row.opportunityId}`);
    assert.equal(ledger.length, 7, 'four deal signals and one overdue task in org A; one deal signal and one overdue task in org B');
});

test('pipeline-alerts: an overdue task fires its OWN org\'s rule for its owner — both orgs\', though both assignees are called Karen Russell', () => {
    const overdue = alertFired.filter(f => ORGS.includes(f.orgId) && f.trigger === 'task.overdue');
    assert.deepEqual(sorted(overdue.map(f => `${f.orgId} ${f.data.title} ${f.data.owner_id}`)), sorted([
        `${ORG_A} Alpha overdue call ${A_KAREN.id}`, `${ORG_B} Bravo overdue call ${B_KAREN.id}`,
    ]), 'REGRESSION (§0.159): userByName["Karen Russell"] belonged to one org, and the other org\'s overdue task was skipped');
});

// ── digest ───────────────────────────────────────────────────────────────────

let digestMails = [];
const titles = (to, kind) => sorted((digestMails.find(m => m.to === to && m.detail?.kind === kind)?.detail.tasks || []).map(t => t.title));
const dealDigestOf = (to) => digestMails.find(m => m.to === to && m.subject.startsWith('Your daily pipeline digest'));
const teamDigestOf = (to) => digestMails.filter(m => m.to === to && m.subject.startsWith('Weekly team health'));
const repsTracked = (html) => Number((html.match(/<div class="stat-val">(\d+)<\/div><div class="stat-lbl">Reps tracked/) || [])[1]);

test('digest: a member\'s daily digest lists the tasks and deals they OWN — not those of another member with the same name, in either org', async () => {
    reset();
    const r = await runDigest({ now: NOW });
    assert.equal(r.statusCode, 200, r.body);
    digestMails = [...mails];
    assert.deepEqual(titles(A_KAREN.email, 'taskDigest'), ['Alpha 2pm call', 'Alpha due today'], 'REGRESSION (§0.159): by name, the other Karen Russell\'s task was in this digest too');
    assert.deepEqual(titles(A_KAREN2.email, 'taskDigest'), ['Alpha Karen-two task']);
    assert.deepEqual(titles(B_KAREN.email, 'taskDigest'), ['Bravo 2pm call', 'Bravo due today']);
    assert.deepEqual(titles(A_KAREN.email, 'overdueTaskNudge'), ['Alpha overdue call']);
    assert.deepEqual(titles(B_KAREN.email, 'overdueTaskNudge'), ['Bravo overdue call']);
    assert.deepEqual(titles(A_KAREN2.email, 'overdueTaskNudge'), [], 'nothing overdue is theirs');
    const a = dealDigestOf(A_KAREN.email), a2 = dealDigestOf(A_KAREN2.email), b = dealDigestOf(B_KAREN.email);
    assert.ok(a && a2 && b, 'each Karen Russell gets a deal digest of their own');
    assert.match(a.subject, /— 4 deals updated$/);
    for (const n of ['Alpha Lapsed Deal', 'Alpha Stuck Deal', 'Alpha Silent Deal', 'Alpha Won Deal']) assert.ok(a.html.includes(n), n);
    assert.ok(!a.html.includes('Alpha Karen-two Deal'), 'REGRESSION (§0.159): the other Karen Russell\'s deal was in this digest');
    assert.match(a2.subject, /— 1 deal updated$/);
    assert.ok(a2.html.includes('Alpha Karen-two Deal'));
    assert.match(b.subject, /— 2 deals updated$/);
    assertNothingCrosses(digestMails);
});

test('digest: the Monday team digest lists the manager\'s OWN org\'s reps — every one for an Admin, the team\'s for a Manager — and totals their own deals', () => {
    const [avA] = teamDigestOf(A_AVERY.email), [mmA] = teamDigestOf(A_MAYA.email), [avB] = teamDigestOf(B_AVERY.email), [mmB] = teamDigestOf(B_MAYA.email);
    assert.ok(avA && mmA && avB && mmB, 'each Admin and Manager receives one');
    assert.equal(repsTracked(avA.html), 3, 'REGRESSION (§0.159): an Admin\'s digest listed EVERY org\'s reps');
    assert.ok(avA.html.includes('Dana Diaz') && !avA.html.includes('Bram Bravo'));
    assert.match(avA.subject, /\$150K pipeline$/, 'org A\'s open deals, each counted once under its owner — by name the two Karens\' deals counted twice');
    assert.equal(repsTracked(mmA.html), 2, 'the Enterprise team of org A: Karen Russell and Dana Diaz');
    assert.match(mmA.subject, /\$140K pipeline$/);
    assert.equal(repsTracked(avB.html), 2);
    assert.ok(avB.html.includes('Bram Bravo') && !avB.html.includes('Dana Diaz'));
    assert.match(avB.subject, /\$100K pipeline$/);
    assert.equal(repsTracked(mmB.html), 2, 'REGRESSION (§0.159): a Manager\'s team was matched by its NAME across orgs');
    assert.match(mmB.subject, /\$100K pipeline$/);
});

// ── task-reminders ───────────────────────────────────────────────────────────

test('task-reminders: each Karen Russell is texted their OWN task at its minute — never the other org\'s', async () => {
    reset();
    const r = await runTaskReminders({ now: NOW });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(sorted(ours(texts).map(t => `${t.to} ${t.body}`)), sorted([`${PHONE_A} TASK Alpha 2pm call`, `${PHONE_B} TASK Bravo 2pm call`]),
        'REGRESSION (§0.159): matched by name across orgs, one phone was sent both tasks and the other none');
    const ledger = await db.select().from(recommendationLog).where(inArray(recommendationLog.orgId, ORGS));
    const sent = ledger.filter(l => l.actionType === 'taskReminder').map(l => `${l.orgId} ${l.opportunityId}`);
    assert.deepEqual(sorted(sent), sorted([`${ORG_A} task_itest_alerts_a_2pm`, `${ORG_B} task_itest_alerts_b_2pm`]), 'each reminder on its own org\'s ledger');
});
