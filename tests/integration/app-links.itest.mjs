// tests/integration/app-links.itest.mjs
// A link in a message to a member opens what the message is about (state §0.237; guide §18b120;
// docs/design/email-links). The templates rendered and their links read back:
//   EMAIL  every deal email links its deal in its org; the task emails the Tasks tab; the weekly summary the Pipeline
//          tab; every footer the Notifications tab in its org — never ?deal=, ?tab= or /settings
//   TEXT   the deal texts link their deal, the task texts their task, the digest text the Tasks tab
//   SLACK  a deal post's button its deal; the bulk move's the Pipeline tab
//   QUOTE  the approval emails' link, the same shape, in the quote's org
// Each link is parsed and read by the app's own reader (readAppLink), as the browser would.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — the modules import the db client; nothing is written)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.APP_URL = 'https://app.itest.example';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { emailTemplates } = await import('../../netlify/functions/send-email.mjs');
const { smsTemplates }   = await import('../../netlify/functions/send-sms.mjs');
const { slackTemplates } = await import('../../netlify/functions/send-slack.mjs');
const { quoteLink }      = await import('../../src/utils/approvalNotices.js');
const { readAppLink }    = await import('../../src/utils/appLinks.js');

const ORG = 'org_itest_links_A', DEAL = 'opp_itest_links_1', TASK = 'task_itest_links_1';
const HAND = /[?&](deal|tab|quote)=|\/settings["'`\s]/;
// Every link into the app a text holds, read as the app reads it.
const linksIn = (text) => [...String(text).matchAll(/https:\/\/app\.itest\.example[^\s"'<>)]*/g)].map((m) => {
    const u = new URL(m[0].replace(/&amp;/g, '&'));
    return { href: m[0], read: readAppLink(u.search) };
});
const deal = { repName: 'Rep', managerName: 'Mgr', dealName: 'D', account: 'A', arr: 1, stage: 'Proposal', fromStage: 'Discovery', toStage: 'Proposal', changedBy: 'X', assignedBy: 'X', createdBy: 'X', updatedBy: 'X', closedBy: 'X', outcome: 'Won', comment: 'c', commentBy: 'X', activityType: 'Call', note: '', daysSilent: 9, daysInStage: 9, avgDays: 3, daysLapsed: 2, originalCloseDate: '2026-11-01', alertType: 'silent', detail: 'd', stageCount: 3, daysSinceCreated: 5, opportunityId: DEAL, orgId: ORG };

test('EMAIL: every deal email links its deal, in its org; its footer the Notifications tab, in its org', () => {
    for (const t of ['dealAssigned', 'stageChanged', 'opportunityCreated', 'opportunityUpdated', 'dealClosed', 'commentAdded', 'activityLogged', 'dealSilent', 'dealStuck', 'closeDateLapsed', 'managerDealAlert', 'dealMomentum']) {
        const { html } = emailTemplates[t](deal);
        assert.ok(!HAND.test(html), `REGRESSION (§0.237): ${t} links the app by hand`);
        const reads = linksIn(html).map((l) => l.read).filter(Boolean);
        assert.deepEqual(reads.find((r) => r.kind === 'deal'), { kind: 'deal', id: DEAL, org: ORG }, `REGRESSION (§0.237): ${t} — its button does not open the deal`);
        assert.deepEqual(reads.find((r) => r.kind === 'notifications'), { kind: 'notifications', id: null, org: ORG }, `${t}: the footer's preferences link`);
    }
});

test('EMAIL: the task emails open the Tasks tab, the weekly summary the Pipeline tab — in their org', () => {
    const tasks = [{ title: 'T', opportunityName: 'D', dueTime: '09:00', dueDate: '2026-11-01', daysOverdue: 2, priority: 'High' }];
    for (const t of ['taskDigest', 'overdueTaskNudge']) {
        const reads = linksIn(emailTemplates[t]({ repName: 'Rep', tasks, orgId: ORG }).html).map((l) => l.read);
        assert.ok(reads.some((r) => r?.kind === 'tasks' && r.org === ORG), `${t}: the Tasks tab`);
    }
    const s = emailTemplates.weeklyManagerSummary({ managerName: 'M', weekOf: 'Nov 9', totalArr: 1, dealsOpen: 1, dealsWonThisWeek: 0, dealsLostThisWeek: 0, arrWonThisWeek: 0, topMovers: [], orgId: ORG });
    assert.ok(linksIn(s.html).some((l) => l.read?.kind === 'pipeline' && l.read.org === ORG), 'REGRESSION (Q4): the weekly summary opens elsewhere');
    const r = emailTemplates.agreementRenewal({ recipientName: 'R', customerName: 'C', customerNumber: '1', planName: 'P', expiry: '2026-12-01', daysLeft: 20, expired: false, orgId: ORG });
    assert.ok(linksIn(r.html).some((l) => l.read?.kind === 'notifications' && l.read.org === ORG), 'the renewal email\'s footer');
});

test('TEXT: the deal texts link their deal, the task texts their task, the digest text the Tasks tab', () => {
    for (const t of ['dealAssigned', 'stageChanged', 'dealSilent', 'dealStuck', 'closeDateLapsed', 'commentAdded', 'managerDealAlert']) {
        const body = smsTemplates[t](deal);
        assert.ok(!HAND.test(body), `${t}: by hand`);
        assert.deepEqual(linksIn(body)[0]?.read, { kind: 'deal', id: DEAL, org: ORG }, `REGRESSION (§0.237): the ${t} text opens Home`);
    }
    for (const t of ['taskReminder', 'taskOverdue']) {
        assert.deepEqual(linksIn(smsTemplates[t]({ repName: 'R', taskTitle: 'T', dueDate: '2026-11-09', dueTime: '09:00', daysOverdue: 1, taskId: TASK, orgId: ORG }))[0]?.read, { kind: 'task', id: TASK, org: ORG }, `${t}: its task`);
    }
    assert.deepEqual(linksIn(smsTemplates.digestSummary({ repName: 'R', taskCount: 2, overdueCount: 1, orgId: ORG }))[0]?.read, { kind: 'tasks', id: null, org: ORG });
});

test('SLACK: a deal post\'s button opens its deal; the bulk move\'s the Pipeline tab', () => {
    for (const t of ['dealSilent', 'dealStuck', 'closeDateLapsed', 'scoreDrop', 'stageChanged', 'dealWon']) {
        const msg = slackTemplates[t]({ ...deal, mover: 'X', score: 20, verdict: 'Critical' });
        const urls = JSON.stringify(msg.blocks);
        assert.ok(linksIn(urls).some((l) => l.read?.kind === 'deal' && l.read.id === DEAL && l.read.org === ORG), `REGRESSION (§0.237): Slack ${t}'s button opens Home`);
    }
    const bulk = slackTemplates.bulkStageMoved({ mover: 'X', moved: 3, won: 1, total: 3, byStage: [{ stage: 'Proposal', n: 3 }], orgId: ORG });
    assert.ok(linksIn(JSON.stringify(bulk.blocks)).some((l) => l.read?.kind === 'pipeline' && l.read.org === ORG));
});

test('QUOTE: the approval emails\' link is a message link, in the quote\'s org — read as the app reads it', () => {
    const url = quoteLink('https://app.itest.example', 'qt_itest_9', ORG);
    assert.deepEqual(linksIn(url)[0].read, { kind: 'quote', id: 'qt_itest_9', org: ORG });
    const { html } = emailTemplates.quoteWaiting({ name: 'A', quoteNumber: 'Q-1', account: 'A', dealName: 'D', discountPct: 10, value: 100, tierLabel: 'Mgr', submittedBy: 'R', url, orgId: ORG });
    const reads = linksIn(html).map((l) => l.read);
    assert.ok(reads.some((r) => r?.kind === 'quote' && r.id === 'qt_itest_9'), 'the quote');
    assert.ok(reads.some((r) => r?.kind === 'notifications' && r.org === ORG), 'the footer, in the quote\'s org');
});
