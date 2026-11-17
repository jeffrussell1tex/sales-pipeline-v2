// tests/deal-score.test.mjs — a deal's score, its chance of winning (AI scoring batch 2A; docs/design/deal-score —
// Jeff, 17 Nov: "All recommended"). The pure rule src/utils/dealScore.js and its learner src/utils/logistic.js: the
// start is the health rules on the stage's weight, a closed deal is measured as it was before its close, the outcome
// never reaches a feature, the model is fitted at 20 teaching deals and measured on deals held out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    learnedShare, stageWeightOf, healthRules, rulesScore, statusOf, lastOpenDay, dealAsOf, teaches, orgUsual,
    dealFeatures, trainDealModel, scoreDeal, FEATURES, MIN_TEACHING, DEFAULT_STAGE_WEIGHT, featureOn, dealScoreView, nextDay, sameDealScore,
} from '../src/utils/dealScore.js';
import { fitLogistic, predictLogistic, heldOutAccuracy, foldOf } from '../src/utils/logistic.js';

const FUNNEL = [
    { name: 'Qualification', weight: 10 }, { name: 'Discovery', weight: 20 }, { name: 'Proposal', weight: 60 },
    { name: 'Contracts', weight: 90 }, { name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 },
];
const TODAY = '2026-11-17';

test('the learned share follows the plan: none below 20, half at 50, three quarters at 110', () => {
    assert.equal(learnedShare(0), 0);
    assert.equal(learnedShare(19), 0);
    assert.equal(learnedShare(MIN_TEACHING), 0);
    assert.equal(learnedShare(50), 0.5);
    assert.equal(learnedShare(110), 0.75);
    assert.equal(learnedShare('junk'), 0);
});

test("a stage's weight is the funnel's, else 30 (getWinProbability's default)", () => {
    assert.equal(stageWeightOf('Proposal', FUNNEL), 60);
    assert.equal(stageWeightOf('Nowhere', FUNNEL), DEFAULT_STAGE_WEIGHT);
    assert.equal(stageWeightOf('Proposal', ['Proposal']), DEFAULT_STAGE_WEIGHT);
    assert.equal(stageWeightOf('Proposal', [{ name: 'Proposal', weight: 140 }]), 100);
    assert.equal(stageWeightOf('Proposal', undefined), DEFAULT_STAGE_WEIGHT);
});

test('the health rules are calculateDealHealth\'s, point for point', () => {
    const none = healthRules({ stageChangedDate: '2026-11-10', forecastedCloseDate: '2026-11-20' }, [], TODAY);
    assert.deepEqual(none.map((r) => r.penalty), [30, 0, 20]);
    assert.equal(none[0].reason, 'No activities logged for this opportunity');
    assert.equal(none[2].reason, 'Closing in 3 days with no activities');
    const stale = healthRules({ stageChangedDate: '2026-09-01', forecastedCloseDate: '2026-11-01' }, [{ date: '2026-10-01' }], TODAY);
    assert.deepEqual(stale.map((r) => [r.penalty, r.reason]), [
        [40, 'No activity in over 30 days (47 days)'],
        [30, 'Stuck in current stage for 77 days'],
        [35, 'Close date is 16 days overdue'],
    ]);
    const today = healthRules({ forecastedCloseDate: TODAY }, [{ date: TODAY }], TODAY);
    assert.deepEqual(today.map((r) => r.reason), ['Recent activity 0 days ago', 'Close date is today']);
});

test('an activity whose day does not read takes nothing; the last day logged is the one counted', () => {
    // App.jsx's rule, carried over (state §0.240): an unreadable day is no penalty and no reason — never "no activities".
    assert.deepEqual(healthRules({}, [{ date: 'not a day' }], TODAY), []);
    // Two activities: the newest counts, never the first logged.
    assert.deepEqual(healthRules({}, [{ date: '2026-08-01' }, { date: '2026-11-15' }], TODAY), [{ penalty: 0, reason: 'Recent activity 2 days ago' }]);
    assert.deepEqual(healthRules({}, [{ date: '2026-11-15' }, { date: '2026-08-01' }], TODAY), [{ penalty: 0, reason: 'Recent activity 2 days ago' }]);
});

test('the screens: the kept score as drawn, and the Deal scoring switch', () => {
    assert.equal(featureOn(undefined, 'deal-scoring'), true, 'on by default');
    assert.equal(featureOn({}, 'deal-scoring'), true);
    assert.equal(featureOn({ 'deal-scoring': true }, 'deal-scoring'), true);
    assert.equal(featureOn({ 'deal-scoring': false }, 'deal-scoring'), false, 'off only when turned off');
    assert.equal(dealScoreView({ stage: 'Proposal' }), null, 'not scored yet: nothing drawn');
    assert.equal(dealScoreView({ dealScore: { score: 'x' } }), null);
    const v = dealScoreView({ stage: 'Proposal', dealScore: { score: 42, status: 'At Risk', weight: 60, factors: [{ text: 'No activities logged for this opportunity', effect: -18 }, { text: '' }] } });
    assert.deepEqual({ ...v, factors: v.factors.length }, { score: 42, status: 'At Risk', tone: 'warn', percent: '42%', words: 'Win chance 42% — At Risk for Proposal', factors: 1, learned: false });
    assert.equal(dealScoreView({ stage: 'Proposal', dealScore: { score: 20, weight: 60 } }).status, 'Critical', 'a status it does not know is read from the weight');
    assert.equal(nextDay('2026-12-31'), '2027-01-01');
    assert.equal(nextDay('2028-02-28'), '2028-02-29');
    assert.equal(nextDay('junk'), 'junk');
});

test('the start: the stage weight, each rule\'s points off 100 that share off it', () => {
    const fine = rulesScore({ stage: 'Proposal', stageChangedDate: '2026-11-10' }, [{ date: '2026-11-16' }], FUNNEL, TODAY);
    assert.equal(fine.score, 60);
    assert.equal(statusOf(fine.score, fine.weight), 'Healthy');
    const quiet = rulesScore({ stage: 'Proposal', stageChangedDate: '2026-11-10' }, [], FUNNEL, TODAY);
    assert.equal(quiet.score, 42);
    assert.deepEqual(quiet.factors[0], { text: 'No activities logged for this opportunity', effect: -18 });
    // The bands read as the health score's: 75% and 50% of the weight.
    assert.equal(statusOf(45, 60), 'Healthy');
    assert.equal(statusOf(44, 60), 'At Risk');
    assert.equal(statusOf(29, 60), 'Critical');
    // Penalties past 100 floor at none.
    const worst = rulesScore({ stage: 'Contracts', stageChangedDate: '2026-01-01', forecastedCloseDate: '2026-01-02' }, [{ date: '2026-01-01' }], FUNNEL, TODAY);
    assert.equal(worst.score, 0);
});

test('a closed deal\'s last open day: its move into the close, else its won or lost date, else none', () => {
    assert.equal(lastOpenDay({ stage: 'Closed Won', stageHistory: [{ stage: 'Proposal', date: '2026-10-01' }, { stage: 'Closed Won', prevStage: 'Proposal', date: '2026-10-20' }], wonDate: '2026-10-25' }), '2026-10-20');
    assert.equal(lastOpenDay({ stage: 'Closed Lost', stageHistory: [], lostDate: '2026-09-09' }), '2026-09-09');
    assert.equal(lastOpenDay({ stage: 'Closed Won', stageHistory: [] }), null);
});

test('measured as it was: nothing dated on or after the day counts', () => {
    const deal = { stage: 'Closed Won', stageHistory: [
        { stage: 'Discovery', date: '2026-09-01' }, { stage: 'Proposal', prevStage: 'Discovery', date: '2026-10-01' },
        { stage: 'Closed Won', prevStage: 'Proposal', date: '2026-10-20' },
    ], closeDateHistory: [{ from: null, to: '2026-10-30', date: '2026-09-02' }, { from: '2026-10-30', to: '2026-10-20', date: '2026-10-20' }] };
    const acts = [{ date: '2026-10-05' }, { date: '2026-10-20' }, { date: '2026-10-28' }];
    const at = dealAsOf(deal, acts, '2026-10-20');
    assert.deepEqual(at.acts.map((a) => a.date), ['2026-10-05']);
    assert.equal(at.moves.length, 2);
    assert.equal(at.closeMoves.length, 1);
    assert.equal(at.stage, 'Proposal');
    assert.equal(at.stageSince, '2026-10-01');
});

test('a closed deal teaches only when something before its close is known', () => {
    const imported = { id: 'a', stage: 'Closed Won', stageHistory: [], wonDate: '2026-05-01' };
    assert.equal(teaches(imported, []), false);
    assert.equal(teaches(imported, [{ date: '2026-05-01' }]), false, 'an activity on the close day is the close');
    assert.equal(teaches(imported, [{ date: '2026-04-20' }]), true);
    assert.equal(teaches({ id: 'b', stage: 'Proposal' }, [{ date: '2026-04-20' }]), false, 'an open deal does not teach');
    assert.equal(teaches({ id: 'c', stage: 'Closed Lost', stageHistory: [] }, [{ date: '2026-04-20' }]), false, 'no last open day');
});

// THE GUARD: the outcome never reaches a feature. One deal, closed won and closed lost, with every outcome field
// changed, measures the same.
test('THE GUARD: a closed deal\'s features are the same whichever way it closed', () => {
    const history = [{ stage: 'Discovery', date: '2026-08-01' }, { stage: 'Proposal', prevStage: 'Discovery', date: '2026-09-01' }];
    const won = { id: 'w', stage: 'Closed Won', arr: '50000', wonDate: '2026-10-01', stageHistory: [...history, { stage: 'Closed Won', prevStage: 'Proposal', date: '2026-10-01' }] };
    const lost = { ...won, stage: 'Closed Lost', wonDate: null, lostDate: '2026-10-01', lostReason: 'Price', lostCategory: 'Budget', probability: 0, forecastCategory: 'Omitted', stageHistory: [...history, { stage: 'Closed Lost', prevStage: 'Proposal', date: '2026-10-01' }] };
    const acts = [{ date: '2026-09-20', type: 'Meeting', contactIds: ['c1'] }, { date: '2026-10-01', type: 'Call' }];
    const usual = orgUsual([won]);
    assert.deepEqual(dealFeatures(won, acts, lastOpenDay(won), usual, FUNNEL), dealFeatures(lost, acts, lastOpenDay(lost), usual, FUNNEL));
    assert.equal(dealFeatures(won, acts, '2026-10-01', usual, FUNNEL).length, FEATURES.length);
});

// n teaching deals in one org: winners met often and recently, losers went quiet.
function org(n) {
    const deals = [], acts = {};
    for (let i = 0; i < n; i++) {
        const win = i % 2 === 0;
        const id = `d${i}`;
        deals.push({ id, stage: win ? 'Closed Won' : 'Closed Lost', arr: String(10000 + i), stageHistory: [
            { stage: 'Discovery', date: '2026-06-01' }, { stage: 'Proposal', prevStage: 'Discovery', date: '2026-07-01' },
            { stage: win ? 'Closed Won' : 'Closed Lost', prevStage: 'Proposal', date: '2026-08-01' },
        ] });
        acts[id] = win
            ? [{ date: '2026-07-25', type: 'Meeting' }, { date: '2026-07-28', type: 'Call' }, { date: '2026-07-30', type: 'Meeting' }]
            : [{ date: '2026-06-05', type: 'Email' }];
    }
    return { deals, acts };
}

test('no model below 20 teaching deals: the standing says how many, and why the rest do not teach', () => {
    const { deals, acts } = org(19);
    deals.push({ id: 'imported', stage: 'Closed Won', stageHistory: [], wonDate: '2026-01-01' });
    const m = trainDealModel(deals, acts, FUNNEL, new Date('2026-11-17T06:00:00Z'));
    assert.equal(m.trained, false);
    assert.equal(m.n, 19);
    assert.equal(m.leftOut, 1);
    assert.equal(m.fit, undefined);
});

test('at 20 or more the model is fitted and measured on deals held out of training', () => {
    const { deals, acts } = org(40);
    const m = trainDealModel(deals, acts, FUNNEL, new Date('2026-11-17T06:00:00Z'));
    assert.equal(m.trained, true);
    assert.equal(m.n, 40);
    assert.equal(m.accuracy.total, 40);
    assert.ok(m.accuracy.correct >= 36, `held-out ${m.accuracy.correct}/40`);
    assert.deepEqual(m.featureKeys, FEATURES.map((f) => f.key));
    assert.equal(m.trainedAt, '2026-11-17T06:00:00.000Z');
});

test('one outcome only: nothing to fit', () => {
    const { deals, acts } = org(40);
    for (const d of deals) { d.stage = 'Closed Lost'; d.stageHistory[2].stage = 'Closed Lost'; }
    assert.equal(trainDealModel(deals, acts, FUNNEL).trained, false);
});

test('a closed deal has no score; below 20 the score is the start', () => {
    assert.equal(scoreDeal({ stage: 'Closed Won' }, [], { funnelStages: FUNNEL, today: TODAY }), null);
    const s = scoreDeal({ stage: 'Proposal', stageChangedDate: '2026-11-10' }, [], { funnelStages: FUNNEL, model: { n: 12, trained: false }, today: TODAY, now: new Date('2026-11-17T12:00:00Z') });
    assert.equal(s.score, 42);
    assert.equal(s.rules, 42);
    assert.equal(s.learned, null);
    assert.equal(s.share, 0);
    assert.equal(s.status, 'At Risk');
    assert.equal(s.modelTrainedAt, null);
    assert.equal(s.scoredAt, '2026-11-17T12:00:00.000Z');
});

test('with a model, the score blends the start and the learned chance by the share', () => {
    const { deals, acts } = org(50);
    const model = trainDealModel(deals, acts, FUNNEL, new Date('2026-11-17T06:00:00Z'));
    const busy = { id: 'o1', stage: 'Proposal', stageChangedDate: '2026-11-01', stageHistory: [{ stage: 'Proposal', date: '2026-11-01' }] };
    const s = scoreDeal(busy, [{ date: '2026-11-15', type: 'Meeting' }, { date: '2026-11-16', type: 'Meeting' }, { date: '2026-11-17', type: 'Call' }], { funnelStages: FUNNEL, model, today: TODAY });
    assert.equal(s.share, 0.5);
    assert.ok(Number.isInteger(s.learned));
    assert.equal(s.score, Math.round(0.5 * s.rules + 0.5 * s.learned));
    assert.ok(s.factors.some((f) => f.learned), 'the model\'s pulls are among the factors');
    assert.equal(s.modelTrainedAt, '2026-11-17T06:00:00.000Z');
    // A model of another shape (a feature list this code does not know) is not used.
    const old = scoreDeal(busy, [], { funnelStages: FUNNEL, model: { ...model, featureKeys: ['x'] }, today: TODAY });
    assert.equal(old.learned, null);
});

test('a kept score is the same score in any key order, its time aside — the database reorders a jsonb object\'s keys', () => {
    const built = { score: 10, status: 'Healthy', weight: 10, rules: 10, learned: null, share: 0, factors: [{ text: 'Recent activity 0 days ago', effect: 0 }], scoredAt: '2026-11-17T17:39:59.201Z', modelTrainedAt: null };
    // As Postgres hands it back: keys by length, then name — and a later time.
    const stored = { rules: 10, score: 10, share: 0, status: 'Healthy', weight: 10, factors: [{ text: 'Recent activity 0 days ago', effect: 0 }], learned: null, scoredAt: '2026-11-17T17:44:51.033Z', modelTrainedAt: null };
    assert.equal(sameDealScore(stored, built), true, 'REGRESSION: every stored score read as changed — every pass rewrote every deal');
    assert.equal(sameDealScore(stored, { ...built, score: 11 }), false);
    assert.equal(sameDealScore(stored, { ...built, factors: [{ effect: 0, text: 'Recent activity 1 day ago' }] }), false);
    assert.equal(sameDealScore(null, null), true);
    assert.equal(sameDealScore(stored, null), false);
});

test('the learner: a fold that cannot be fitted counts its rows as wrong, never skipped', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, features: [i], label: i < 1 ? 1 : 0 }));
    const { correct, total } = heldOutAccuracy(rows, { folds: 5 });
    assert.equal(total, 10);
    assert.ok(correct <= 9);
    assert.equal(fitLogistic([{ features: [1], label: 1 }, { features: [2], label: 1 }]), null);
    assert.equal(predictLogistic(null, [1]), null);
    assert.equal(foldOf('same', 5), foldOf('same', 5));
});
