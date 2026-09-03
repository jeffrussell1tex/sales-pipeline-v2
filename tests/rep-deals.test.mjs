// tests/rep-deals.test.mjs
//
// Reports → Performance with the Rep slicer set showed one leaderboard row and
// no deals behind it. Jeff: the rep view "should have a section listing that
// rep's won and lost deals, with totals" (handoff item 20, state §0.85). The
// rows, their order and the totals are pure (repDeals.js); the scans pin that
// the Performance tab renders the section for ONE rep from the same
// period-filtered sets the leaderboard sums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repDeals, dealRowOf, dealRepOf } from '../src/utils/repDeals.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const WON = [
    { id: 'w1', opportunityName: 'Beacon Metals — CRM', account: 'Beacon Metals', salesRep: 'Karen Russell', stage: 'Closed Won', arr: '120000', implementationCost: 5000, wonDate: '2026-08-20', createdDate: '2026-06-01' },
    { id: 'w2', opportunityName: 'Acme rollout', account: 'Acme', assignedTo: 'Karen Russell', stage: 'Closed Won', arr: 40000, stageChangedDate: '2026-09-01' },
    { id: 'w3', opportunityName: 'Undated win', account: 'Nowhere', salesRep: 'Karen Russell', stage: 'Closed Won', arr: 1000 },
    { id: 'w4', opportunityName: 'Someone else', account: 'Other', salesRep: 'Savannah Miller', stage: 'Closed Won', arr: 999999, wonDate: '2026-08-25' },
    { id: 'w5', opportunityName: 'Filed wrong', account: 'X', salesRep: 'Karen Russell', stage: 'Closed Lost', arr: 77, lostDate: '2026-08-01' },
];
const LOST = [
    { id: 'l1', opportunityName: 'Dunder', account: 'Dunder', salesRep: 'Karen Russell', stage: 'Closed Lost', arr: 30000, lostDate: '2026-08-28', lostCategory: 'Timing', lostReason: 'went dark',
      stageHistory: [{ stage: 'Proposal' }, { stage: 'Closed Lost', prevStage: 'Proposal' }] },
    { id: 'l2', opportunityName: 'Initech', account: 'Initech', salesRep: 'Karen Russell', stage: 'Closed Lost', arr: 10000, stageChangedDate: '2026-07-02', lostReason: 'Chose competitor' },
];

// ── the regression ───────────────────────────────────────────────────────────

test('REGRESSION: the rep view lists only that rep\'s deals, newest close first, with totals', () => {
    const d = repDeals(WON, LOST, 'Karen Russell');
    assert.deepEqual(d.won.map(r => r.id), ['w2', 'w1', 'w3'], 'assignedTo counts; the undated deal sorts last; the other rep is absent');
    assert.deepEqual(d.lost.map(r => r.id), ['l1', 'l2']);
    assert.deepEqual(d.totals, { wonCount: 3, wonArr: 161000, wonImpl: 5000, lostCount: 2, lostArr: 40000, winRate: 3 / 5 });
});

test('a deal handed to the wrong list is dropped, not mis-filed', () => {
    const d = repDeals(WON, LOST, 'Karen Russell');
    assert.ok(!d.won.some(r => r.id === 'w5'), 'a Closed Lost deal in the won list');
    assert.ok(!d.lost.some(r => r.id === 'w5'));
});

test('no closed deals: empty lists, zero totals, win rate null — never 0% or NaN', () => {
    assert.deepEqual(repDeals([], [], 'Karen Russell').totals, { wonCount: 0, wonArr: 0, wonImpl: 0, lostCount: 0, lostArr: 0, winRate: null });
    assert.deepEqual(repDeals(null, undefined, 'x').won, []);
});

// ── the row ──────────────────────────────────────────────────────────────────

test('a row carries the close day, cycle, exit stage and the loss bucket the other reports read', () => {
    const won = dealRowOf(WON[0]);
    assert.equal(won.closeDay, '2026-08-20', 'wonDate first');
    assert.equal(won.cycleDays, 80, 'created 1 Jun → won 20 Aug');
    assert.equal(won.arr, 120000, 'a string ARR is read as a number');
    assert.equal(won.implementationCost, 5000);
    const lost = dealRowOf(LOST[0]);
    assert.equal(lost.closeDay, '2026-08-28', 'lostDate first');
    assert.equal(lost.exitStage, 'Proposal', 'the stage it left, from prevStage');
    assert.equal(lost.lossReason, 'Timing', 'the picked category beats the free text');
    assert.equal(dealRowOf(LOST[1]).lossReason, 'Chose competitor', 'free text when no category');
    assert.equal(dealRowOf(LOST[1]).closeDay, '2026-07-02', 'stage-change day when no lostDate');
    assert.equal(dealRowOf(WON[2]).closeDay, '', 'no readable day is empty, not "Invalid Date"');
    assert.equal(dealRowOf({ account: 'Only an account' }).name, 'Only an account');
    assert.equal(dealRowOf({}).name, '(unnamed deal)');
});

test('dealRepOf resolves the way the leaderboard does: salesRep, else assignedTo', () => {
    assert.equal(dealRepOf({ salesRep: 'A', assignedTo: 'B' }), 'A');
    assert.equal(dealRepOf({ assignedTo: 'B' }), 'B');
    assert.equal(dealRepOf({}), '');
    assert.equal(dealRepOf(null), '');
});

// ── the Performance tab renders it for ONE rep, from the leaderboard's sets ──

test('the Performance sub-tab lists the sliced rep\'s won and lost deals with totals, from the period-filtered sets', () => {
    const src = read('src/Tabs/ReportsTab.jsx');
    assert.ok(src.includes("import { repDeals } from '../utils/repDeals';"));
    assert.ok(src.includes('{reportsRep && (() => {'), 'rendered only when the Rep slicer names one rep');
    assert.ok(src.includes('const d = repDeals(wonOpps, lostOpps, reportsRep);'), 'the same sets the leaderboard sums — one number, not two');
    assert.ok(src.includes('Won deals — {reportsRep}'));
    assert.ok(src.includes('Lost deals — {reportsRep}'));
    assert.ok(src.includes('{d.totals.wonCount} won · {fmt2c(d.totals.wonArr)} ARR'), 'the won total');
    assert.ok(src.includes('{d.totals.lostCount} lost · {fmt2c(d.totals.lostArr)} ARR'), 'the lost total');
    assert.ok(src.includes("d.totals.wonImpl > 0 &&"), 'implementation cost named only when there is some');
    assert.ok(src.includes('{r.exitStage || '), 'the stage a lost deal left');
    assert.ok(src.includes("{r.lossReason || "), 'the loss reason');
    assert.ok(src.includes('{d.totals.winRate != null ? '), 'a win rate that is honest about no closed deals');
    // The section sits inside the Performance sub-tab, after the leaderboard.
    const perf = src.indexOf("{reportSubTab === 'performance' && (");
    const sect = src.indexOf('{reportsRep && (() => {');
    const next = src.indexOf("{reportSubTab === 'activity' && (");
    assert.ok(perf > 0 && perf < sect && sect < next, 'inside the Performance sub-tab');
    assert.ok(src.indexOf('Quota attainment — leaderboard') < sect, 'below the leaderboard');
});
