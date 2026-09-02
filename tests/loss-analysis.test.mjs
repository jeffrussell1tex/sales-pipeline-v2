// tests/loss-analysis.test.mjs
//
// The Win / loss report showed "Other · 5 · 100%" over five deals that every
// one carried a lost category, and "No stage history data on lost deals" over
// deals whose history ended in a Closed Lost entry. Both reads were wrong by
// one field: the notes instead of the category, and the entry's own stage
// instead of the stage it came from. The five shapes below are the real rows
// from the Accelerep Test org on 2 Sep 2026 (0.66).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lossBucketOf, exitStageOf, previousStageOf, lostByStageRowsOf, CLOSED_STAGES } from '../src/utils/lossAnalysis.js';

const lost = (name, lostCategory, stageHistory, extra = {}) =>
    ({ opportunityName: name, stage: 'Closed Lost', lostCategory, lostReason: null, stageHistory, ...extra });

// The org's five closed-lost deals, as stored.
const FIVE = [
    lost('Test Deal 4', 'Competitor', [{ date: '2026-08-13', stage: 'Closed Lost', prevStage: 'Qualification' }]),
    lost('ZZTest Alpha', 'Timing', [
        { date: '2026-08-18', stage: 'Evaluation (Demo)', prevStage: 'Proposal' },
        { date: '2026-08-18', stage: 'Qualification', prevStage: 'Evaluation (Demo)' },
        { date: '2026-09-02', stage: 'Closed Lost', prevStage: 'Qualification' },
    ]),
    lost('ZZTest Bravo', 'Timing', [{ date: '2026-09-02', stage: 'Closed Lost', prevStage: 'Qualification' }]),
    lost('ZZTest Charlie', 'Timing', [
        { date: '2026-08-18', stage: 'Proposal', source: 'import', prevStage: 'Qualification' },
        { date: '2026-08-18', stage: 'Qualification', source: 'import', prevStage: 'Proposal' },
        { date: '2026-08-19', stage: 'Proposal', source: 'import', prevStage: 'Qualification' },
        { date: '2026-09-02', stage: 'Closed Lost', prevStage: 'Proposal' },
    ]),
    lost('ZZTest Delta', 'Timing', [{ date: '2026-09-02', stage: 'Closed Lost', prevStage: 'Qualification' }]),
];

// ── the bucket ──────────────────────────────────────────────────────────────

test('the category is the bucket; the notes are not consulted when a category exists', () => {
    assert.equal(lossBucketOf({ lostCategory: 'Timing', lostReason: 'they went dark' }), 'Timing');
});

test('with no category, the free-text reason is the bucket', () => {
    assert.equal(lossBucketOf({ lostCategory: null, lostReason: 'Lost to Acme' }), 'Lost to Acme');
});

test('with neither, the caller\'s fallback — and the fallback is the caller\'s word', () => {
    assert.equal(lossBucketOf({ stage: 'Closed Lost' }), 'Other');
    assert.equal(lossBucketOf({ stage: 'Closed Lost' }, 'Unknown'), 'Unknown');
});

test('whitespace is not a category', () => {
    assert.equal(lossBucketOf({ lostCategory: '   ', lostReason: '  ' }), 'Other');
});

test('REGRESSION: the five real deals bucket as Timing x4, Competitor x1 — not Other x5', () => {
    const map = {};
    for (const o of FIVE) { const b = lossBucketOf(o); map[b] = (map[b] || 0) + 1; }
    assert.deepEqual(map, { Timing: 4, Competitor: 1 });
});

// ── the exit stage ──────────────────────────────────────────────────────────

test('the stage a lost deal LEFT is the last entry\'s prevStage, not its stage', () => {
    assert.equal(exitStageOf(FIVE[1]), 'Qualification', 'Alpha: Qualification → Closed Lost');
    assert.equal(exitStageOf(FIVE[3]), 'Proposal', 'Charlie: Proposal → Closed Lost');
});

test('a last entry that is not a close is itself the stage', () => {
    assert.equal(exitStageOf({ stage: 'Proposal', stageHistory: [{ stage: 'Proposal', prevStage: 'Discovery' }] }), 'Proposal');
});

test('no history: the current stage, unless the current stage is a close', () => {
    assert.equal(exitStageOf({ stage: 'Discovery', stageHistory: [] }), 'Discovery');
    assert.equal(exitStageOf({ stage: 'Closed Lost' }), null, 'a close with no history has no exit stage to report');
    assert.equal(exitStageOf({ stage: 'Closed Won', stageHistory: null }), null);
});

test('CLOSED_STAGES is the two closes and is frozen', () => {
    assert.deepEqual([...CLOSED_STAGES], ['Closed Won', 'Closed Lost']);
    assert.ok(Object.isFrozen(CLOSED_STAGES));
});

test('previousStageOf is the stage before the latest move — never the move\'s own stage', () => {
    assert.equal(previousStageOf(FIVE[1]), 'Qualification');
    assert.equal(previousStageOf({ stage: 'Proposal', stageHistory: [{ stage: 'Proposal', prevStage: 'Discovery' }] }), 'Discovery');
    assert.equal(previousStageOf({ stage: 'Proposal', stageHistory: [] }), null);
});

// ── the rows ────────────────────────────────────────────────────────────────

test('REGRESSION: the five real deals make two exit-stage rows, not "No stage history data"', () => {
    const rows = lostByStageRowsOf(FIVE, ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal']);
    assert.deepEqual(rows, [{ stage: 'Qualification', count: 4 }, { stage: 'Proposal', count: 1 }]);
});

test('rows follow the funnel order given', () => {
    const rows = lostByStageRowsOf(FIVE, ['Proposal', 'Qualification']);
    assert.deepEqual(rows.map(r => r.stage), ['Proposal', 'Qualification']);
});

test('a stage missing from the order is still a row, after the ordered ones', () => {
    // The old hardcoded list had no "Evaluation (Demo)"; a demo-stage loss vanished.
    const demoLoss = lost('Demo loss', 'Product Fit', [{ stage: 'Closed Lost', prevStage: 'Evaluation (Demo)' }]);
    const rows = lostByStageRowsOf([...FIVE, demoLoss], ['Qualification', 'Proposal']);
    assert.deepEqual(rows.map(r => r.stage), ['Qualification', 'Proposal', 'Evaluation (Demo)']);
});

test('a close with no exit stage is not a row', () => {
    assert.deepEqual(lostByStageRowsOf([{ stage: 'Closed Lost' }], ['Qualification']), []);
});

// ── every reader in ReportsTab goes through the module ─────────────────────

test('ReportsTab has no bare read of lostReason / closedLostReason left, and uses the helpers', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /closedLostReason/, 'a field nothing ever wrote');
    assert.doesNotMatch(src, /o\.lostReason\s*\|\|/, 'the notes-first read is the bug');
    assert.doesNotMatch(src, /\{o\.lostReason\}/, 'a display of the notes alone hides a categorised loss');
    assert.doesNotMatch(src, /history\[history\.length\s*-\s*1\]\?\.stage/, 'the entry\'s own stage is the move INTO it');
    for (const fn of ['lossBucketOf(', 'exitStageOf(', 'previousStageOf(', 'lostByStageRowsOf(']) {
        assert.ok(src.includes(fn), `${fn} must be used by the reports`);
    }
    assert.match(src, /from '\.\.\/utils\/lossAnalysis'/);
});
