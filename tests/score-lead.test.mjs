// tests/score-lead.test.mjs
// Layer-1 unit tests for the pure lead-scoring engine (no DB, no network).
// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeFit, computeEngagement, bucketOf, scoreLead, DEFAULT_LEAD_SCORING,
    PREDICTIVE_FEATURES, leadFeatures, computeSourceWinRate, trainLeadModel, predictLead,
} from '../netlify/functions/score-lead.mjs';

const NOW = Date.parse('2026-06-03T00:00:00.000Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

// ── evalRule (exercised via computeFit) ─────────────────────────────────────
test('fit ops: each operator matches the right lead', () => {
    const cfg = (op, value, points = 10) => ({ max: 10, rules: [{ id: 'r', field: 'f', op, value, points, label: 'r' }] });
    const hit = (lead, op, value) => computeFit({ ...lead }, cfg(op, value)).matched.length === 1;

    assert.ok(hit({ f: 'x' }, 'equals', 'x'));
    assert.ok(!hit({ f: 'y' }, 'equals', 'x'));
    assert.ok(hit({ f: 'y' }, 'notEquals', 'x'));
    assert.ok(hit({ f: 'b' }, 'in', ['a', 'b']));
    assert.ok(!hit({ f: 'c' }, 'in', ['a', 'b']));
    assert.ok(hit({ f: 100 }, 'gte', 50));
    assert.ok(!hit({ f: 10 }, 'gte', 50));
    assert.ok(hit({ f: 10 }, 'lte', 50));
    assert.ok(hit({ f: 'hello world' }, 'contains', 'world'));
    assert.ok(hit({ f: 'VP of Sales' }, 'matchesAny', ['vp', 'director']));
    assert.ok(!hit({ f: 'Analyst' }, 'matchesAny', ['vp', 'director']));
    assert.ok(hit({ f: 'anything' }, 'exists'));
    assert.ok(!hit({ f: '' }, 'exists'));
});

test('gte with missing/empty value does not match', () => {
    const cfg = { max: 10, rules: [{ id: 'r', field: 'arr', op: 'gte', value: 1000, points: 10 }] };
    assert.equal(computeFit({}, cfg).matched.length, 0);
    assert.equal(computeFit({ arr: '' }, cfg).matched.length, 0);
});

// ── computeFit ──────────────────────────────────────────────────────────────
test('computeFit sums matched rule points and normalizes to 0..100', () => {
    const lead = { title: 'VP Sales', estimatedARR: 120000, source: 'Referral', status: 'Working' };
    const { score, matched } = computeFit(lead, DEFAULT_LEAD_SCORING.fit);
    // VP(22) + $100k(20) + $50k(10) + Referral(18) = 70 ; max 100 -> 70
    assert.equal(score, 70);
    assert.equal(matched.length, 4);
    assert.ok(matched.every(m => typeof m.points === 'number'));
});

test('computeFit caps at 100 and floors at 0', () => {
    const big = { max: 50, rules: [{ id: 'a', field: 'x', op: 'exists', points: 90, label: 'a' }] };
    assert.equal(computeFit({ x: 1 }, big).score, 100); // 90/50 -> capped
    assert.equal(computeFit({}, big).score, 0);
});

// ── computeEngagement (status + recency + events) ───────────────────────────
test('engagement: status contributes and recency decays', () => {
    const fresh = computeEngagement({ status: 'Qualified', firstTouchDate: daysAgo(0) }, DEFAULT_LEAD_SCORING.engagement, NOW);
    const stale = computeEngagement({ status: 'Qualified', firstTouchDate: daysAgo(120) }, DEFAULT_LEAD_SCORING.engagement, NOW);
    assert.ok(fresh.score > stale.score, 'recent lead should out-score a stale one');
    assert.ok(fresh.score >= 80); // Qualified(45) + near-full recency(40)
});

test('engagement: behavioral events add points and decay with age', () => {
    const base = { status: 'Contacted', firstTouchDate: daysAgo(10) };
    const none = computeEngagement(base, DEFAULT_LEAD_SCORING.engagement, NOW, []);
    const recentDemo = computeEngagement(base, DEFAULT_LEAD_SCORING.engagement, NOW, [{ type: 'Demo', at: daysAgo(1) }]);
    const oldDemo = computeEngagement(base, DEFAULT_LEAD_SCORING.engagement, NOW, [{ type: 'Demo', at: daysAgo(90) }]);
    assert.ok(recentDemo.score > none.score, 'a logged Demo should raise engagement');
    assert.ok(recentDemo.score > oldDemo.score, 'a recent Demo should beat an old one (decay)');
});

test('engagement: unknown event type is ignored', () => {
    const base = { status: 'New', firstTouchDate: daysAgo(5) };
    const a = computeEngagement(base, DEFAULT_LEAD_SCORING.engagement, NOW, []);
    const b = computeEngagement(base, DEFAULT_LEAD_SCORING.engagement, NOW, [{ type: 'Nonsense', at: daysAgo(1) }]);
    assert.equal(a.score, b.score);
});

// ── bucketOf ────────────────────────────────────────────────────────────────
test('bucketOf uses the higher axis against thresholds', () => {
    const b = DEFAULT_LEAD_SCORING.buckets;
    assert.equal(bucketOf(80, 10, b), 'hot');
    assert.equal(bucketOf(10, 75, b), 'hot');   // engagement drives it
    assert.equal(bucketOf(55, 20, b), 'warm');
    assert.equal(bucketOf(20, 10, b), 'cold');
});

// ── scoreLead ───────────────────────────────────────────────────────────────
test('scoreLead returns axes, bucket, breakdown and headline score', () => {
    const lead = { title: 'VP Sales', estimatedARR: 180000, source: 'Referral', status: 'Qualified', firstTouchDate: daysAgo(3) };
    const sc = scoreLead(lead, DEFAULT_LEAD_SCORING, NOW, []);
    assert.equal(typeof sc.leadScoreFit, 'number');
    assert.equal(typeof sc.leadScoreEngagement, 'number');
    assert.ok(['cold', 'warm', 'hot'].includes(sc.leadScoreBucket));
    assert.equal(sc.score, Math.max(sc.leadScoreFit, sc.leadScoreEngagement));
    assert.ok(Array.isArray(sc.scoreBreakdown.fit));
    assert.ok(Array.isArray(sc.scoreBreakdown.engagement));
});

test('scoreLead returns null when scoring disabled', () => {
    assert.equal(scoreLead({ title: 'x' }, { ...DEFAULT_LEAD_SCORING, enabled: false }, NOW, []), null);
});

test('scoreLead adds no probability without a predictive model', () => {
    const sc = scoreLead({ title: 'VP', status: 'New', firstTouchDate: daysAgo(1) }, DEFAULT_LEAD_SCORING, NOW, []);
    assert.equal(sc.scoreBreakdown.probability, undefined);
});

// ── Phase 2: features, source win-rate, training, prediction ────────────────
test('leadFeatures returns the expected 5-length vector and EXCLUDES status (no leakage)', () => {
    const conv = leadFeatures({ title: 'VP', estimatedARR: 100000, source: 'Referral', status: 'Converted', firstTouchDate: daysAgo(5) }, [], null, NOW);
    const dead = leadFeatures({ title: 'VP', estimatedARR: 100000, source: 'Referral', status: 'Dead', firstTouchDate: daysAgo(5) }, [], null, NOW);
    assert.equal(conv.length, PREDICTIVE_FEATURES.length);
    assert.equal(PREDICTIVE_FEATURES.length, 5);
    // Identical leads differing only by status (the label) must yield identical features
    assert.deepEqual(conv, dead);
});

test('leadFeatures: seniority and deal size behave sensibly', () => {
    const vp = leadFeatures({ title: 'VP Sales', estimatedARR: 300000 }, [], null, NOW);
    const ic = leadFeatures({ title: 'Coordinator', estimatedARR: 5000 }, [], null, NOW);
    assert.ok(vp[0] > ic[0], 'VP seniority > IC');
    assert.ok(vp[1] >= ic[1], 'bigger deal >= smaller');
    assert.ok(vp[1] <= 1, 'deal size capped at 1');
});

test('computeSourceWinRate: per-source rates, small-source shrink, and _avg', () => {
    const decided = [
        ...Array(10).fill({ source: 'Referral', label: 1 }),
        ...Array(10).fill({ source: 'Referral', label: 0 }),
        ...Array(2).fill({ source: 'Tiny', label: 1 }), // < 3 -> shrinks to avg
    ];
    const swr = computeSourceWinRate(decided);
    assert.ok(Math.abs(swr.Referral - 0.5) < 1e-9);
    assert.ok(Math.abs(swr.Tiny - swr._avg) < 1e-9, 'low-volume source shrinks to org average');
    assert.ok(swr._avg > 0 && swr._avg < 1);
});

test('trainLeadModel: returns null on too little data, learns a separable signal otherwise', () => {
    assert.equal(trainLeadModel(Array(5).fill({ features: [1, 1, 1, 1, 1], label: 1 })), null);

    // Separable: feature[0] high -> converts
    const rows = [];
    for (let i = 0; i < 200; i++) {
        const positive = i % 2 === 0;
        rows.push({ features: [positive ? 0.9 : 0.1, 0.5, 0.5, 0.2, positive ? 0.7 : 0.2], label: positive ? 1 : 0 });
    }
    const model = trainLeadModel(rows);
    assert.equal(model.coefficients.length, 5);
    assert.equal(model.n, 200);
    assert.ok(model.accuracy >= 90, `expected high training accuracy on separable data, got ${model.accuracy}`);
    assert.equal(model.featureNames.length, 5);
});

test('predictLead: null without a model; strong lead out-scores weak lead', () => {
    assert.equal(predictLead({ title: 'VP' }, [], null, NOW), null);

    // build a model where Referral + senior + big deal convert
    const swr = { _avg: 0.4, Referral: 0.7, Cold: 0.15 };
    const rows = [];
    for (let i = 0; i < 200; i++) {
        const strong = i % 2 === 0;
        const lead = {
            title: strong ? 'VP' : 'Rep',
            estimatedARR: strong ? 200000 : 20000,
            source: strong ? 'Referral' : 'Cold',
            firstTouchDate: daysAgo(15),
        };
        rows.push({ features: leadFeatures(lead, [], swr, NOW), label: strong ? 1 : 0 });
    }
    const model = trainLeadModel(rows);
    model.sourceWinRate = swr;

    const strong = predictLead({ title: 'VP Sales', estimatedARR: 220000, source: 'Referral', firstTouchDate: daysAgo(3) }, [{ type: 'Meeting', at: daysAgo(1) }], model, NOW);
    const weak = predictLead({ title: 'Coordinator', estimatedARR: 8000, source: 'Cold', firstTouchDate: daysAgo(2) }, [], model, NOW);
    assert.ok(strong > weak, `strong (${strong}) should beat weak (${weak})`);
    assert.ok(strong >= 0 && strong <= 100 && weak >= 0 && weak <= 100);
});

test('scoreLead surfaces a 0..100 probability when predictive is enabled with a model', () => {
    const swr = { _avg: 0.4, Referral: 0.7 };
    const rows = [];
    for (let i = 0; i < 200; i++) {
        const strong = i % 2 === 0;
        rows.push({ features: leadFeatures({ title: strong ? 'VP' : 'Rep', estimatedARR: strong ? 200000 : 20000, source: 'Referral', firstTouchDate: daysAgo(15) }, [], swr, NOW), label: strong ? 1 : 0 });
    }
    const model = trainLeadModel(rows); model.sourceWinRate = swr;

    const cfg = { ...DEFAULT_LEAD_SCORING, predictive: { enabled: true, minClosedRecords: 150, model } };
    const lead = { title: 'VP Sales', estimatedARR: 180000, source: 'Referral', status: 'Working', firstTouchDate: daysAgo(4) };
    const on = scoreLead(lead, cfg, NOW, []);
    assert.equal(typeof on.scoreBreakdown.probability, 'number');
    assert.ok(on.scoreBreakdown.probability >= 0 && on.scoreBreakdown.probability <= 100);

    // disabled -> no probability even with a model present
    const off = scoreLead(lead, { ...cfg, predictive: { ...cfg.predictive, enabled: false } }, NOW, []);
    assert.equal(off.scoreBreakdown.probability, undefined);
});

test('REGRESSION: title keyword matching is whole-word (\'Coordinator\' is not C-level via \'coo\')', () => {
    const exec = DEFAULT_LEAD_SCORING.fit.rules.find(r => r.id === 'f_title_exec');
    const fitOf = (title) => computeFit({ title, estimatedARR: 0, source: '' }, { max: 100, rules: [exec] }).matched.length;
    assert.equal(fitOf('Coordinator'), 0, "'Coordinator' must NOT match the C-level rule");
    assert.equal(fitOf('Marketing Lead'), 0, "non-exec must not match exec rule");
    assert.equal(fitOf('COO'), 1, "'COO' must match");
    assert.equal(fitOf('Chief Revenue Officer'), 1, "'Chief ...' must match");
    // seniority feature: Coordinator (low) < VP
    const lead = (title) => leadFeatures({ title, estimatedARR: 100000 }, [], null, NOW)[0];
    assert.ok(lead('Coordinator') < lead('VP Sales'));
});
