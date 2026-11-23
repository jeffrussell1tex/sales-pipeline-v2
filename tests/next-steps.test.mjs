// tests/next-steps.test.mjs — AI scoring batch 3's first part (docs/design/deal-score/DESIGN-3.md — Jeff, 17 Nov: Q1-Q5
// the Recommended): each next action Claude gives is logged; the recommendation log's outcomes — never judged before —
// are judged each night, a next step by what happens on the deal within 14 days; meeting prep shows it; Settings counts
// won deals with a history toward the comparisons; Home's Velocity win says only what is true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stageMovedWithin, NEXT_STEP_DAYS } from '../src/utils/nextSteps.js';
import { trainDealModel, comparisonWords, COMPARE_WINS } from '../src/utils/dealScore.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

test('a next step\'s window: 14 days; a stage day inside it counts, by the day', () => {
    assert.equal(NEXT_STEP_DAYS, 14);
    const since = new Date('2026-11-01T15:00:00.000Z'), until = new Date('2026-11-15T15:00:00.000Z');
    assert.equal(stageMovedWithin('2026-11-01', since, until), true, 'the day it was given');
    assert.equal(stageMovedWithin('2026-11-15', since, until), true, 'the last day');
    assert.equal(stageMovedWithin('2026-10-31', since, until), false, 'before it');
    assert.equal(stageMovedWithin('2026-11-16', since, until), false, 'after the window');
    assert.equal(stageMovedWithin(null, since, until), false);
    assert.equal(stageMovedWithin('junk', since, until), false);
});

test('the outcome pass: exported, run each night after the scores, org by org — the renewal ledger left as it is', () => {
    const r = code(read('netlify/functions/recommendation-log.mjs'));
    assert.ok(r.includes('export async function judgePending(orgId, repName = null, now = new Date()) {'));
    assert.ok(r.includes("        notLike(recommendationLog.actionType, 'renewal%'),\n        gte(recommendationLog.dismissedAt, new Date(now.getTime() - 30 * 86400000)),"), 'renewal rows and rows past 30 days left alone');
    assert.ok(r.includes('            const evaluated = await judgePending(orgId, repName);'), 'the PUT runs the same pass, for its caller\'s scope');
    const b = code(read('netlify/functions/score-deals-batch.mjs'));
    const scoreAt = b.indexOf('const r = await scoreOrgDeals(orgId, { train: true });'), judgeAt = b.indexOf('try { judged += (await judgePending(orgId)).length; }');
    assert.ok(scoreAt > -1 && judgeAt > scoreAt, 'judged after the scores, so a score drop reads the band as it now stands');
    // A next step: resolved the moment the deal moves; ignored only when its window has passed. An alert: judged at 3 days.
    assert.ok(r.includes("        if (await checkResolved(log, orgId)) return 'resolved';\n        return ageDays >= NEXT_STEP_DAYS ? 'ignored' : null;"));
    assert.ok(r.includes('    if (ageDays < ALERT_WAIT_DAYS) return null;'));
    // The rules the integration suite runs, held here too (the harness runs these suites, not the database's).
    assert.ok(r.includes('gte(activities.createdAt, since), lte(activities.createdAt, until)'), 'an activity after the window never counts');
    assert.ok(r.includes("return ['Closed Won', 'Closed Lost'].includes(opp.stage) || (!!opp.win?.status && opp.win.status !== 'Critical');"), 'a score drop resolved once out of Critical or closed');
});

test('each next action Claude gives is logged once — a fresh explanation with one, never a cached answer or a blank', () => {
    const s = code(read('netlify/functions/ai-score.mjs'));
    const logAt = s.indexOf("repName: opp.salesRep || 'Unassigned', actionType: 'next_step', opportunityId, dealName: entityName,");
    assert.ok(logAt > -1);
    assert.ok(s.includes('        if (kept.outcome.ok && scoreData.recommendation) {'), 'never a blank next action');
    assert.ok(s.includes('const stored = withHistory(cached, scoreData);') && logAt > s.indexOf('const stored = withHistory(cached, scoreData);'), 'after a fresh explanation — the cached answer returns before it');
    assert.ok(s.includes('signal: `${scoreData.recommendation} (win chance ${scoreData.explains.score}%)`,'), 'its words and the win chance then');
});

test('Settings counts won deals with a history toward the comparisons (Q1)', () => {
    const deal = (id, stage, history) => ({ id, stage, stageHistory: history ? [{ stage: 'Proposal', date: '2026-07-01' }, { stage, date: '2026-08-01' }] : [], wonDate: '2026-08-01', lostDate: '2026-08-01' });
    const deals = [deal('w1', 'Closed Won', true), deal('w2', 'Closed Won', true), deal('w3', 'Closed Won', false), deal('l1', 'Closed Lost', true)];
    const m = trainDealModel(deals, {}, [], new Date('2026-11-17T06:00:00Z'));
    assert.equal(m.wonTeaching, 2, 'won, with something known before the close');
    assert.equal(COMPARE_WINS, 10);
    assert.equal(comparisonWords(m), "2 of 10 won deals with a history so far — once there are 10, Claude's next steps compare a deal with this workspace's wins.");
    assert.match(comparisonWords({ wonTeaching: 12 }), /^12 won deals with a history — enough/);
    assert.match(comparisonWords({ wonTeaching: 10 }), /^10 won deals with a history — enough/, 'ten is enough');
    assert.match(comparisonWords({ wonTeaching: 9 }), /^9 of 10 won deals/);
    assert.equal(comparisonWords(null), null);
    assert.equal(comparisonWords({ n: 3 }), null, 'a model counted before batch 3 says nothing');
    assert.ok(read('src/Tabs/settings/salesProcess/DealScoringDetail.jsx').includes('{comparisonWords(model) && <div style={{ marginTop: 6 }}>{comparisonWords(model)}</div>}'));
});

test('meeting prep shows the next step (Q3); Reports names the row; Home\'s Velocity win claims no average (Q4)', () => {
    const p = read('src/components/layout/MeetingPrepPanel.jsx');
    assert.ok(p.includes('{isExplanation(matchedOpp?.aiScore) && matchedOpp.aiScore.recommendation && ('));
    assert.ok(read('src/Tabs/ReportsTab.jsx').includes("        next_step:        'Claude next step',"));
    const h = read('src/Tabs/HomeTab.jsx');
    assert.ok(!h.includes('Faster than your avg (14d)'), 'REGRESSION: an average never measured');
    assert.ok(h.includes("body: `${stageCount} stage moves in its first ${createdDays} ${createdDays === 1 ? 'day' : 'days'}. Keep the pace.`,"));
});
