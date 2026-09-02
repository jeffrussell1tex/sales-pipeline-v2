// tests/stage-order.test.mjs
//
// Six hardcoded stage lists in ReportsTab named stages no deal can be in and
// omitted three real ones; in the conversion funnel a real stage ranked −1
// and was counted as "Prospecting" (0.68 item 5). The order now comes from
// the org's funnel settings, else the app defaults, and colours by position.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openStagesOf, stagePalette, commitFallbackStages, bestCaseFallbackStages, CLOSED_STAGES } from '../src/utils/stageOrder.js';
import { stages as defaultStages } from '../src/utils/constants.js';

const DEFAULT_OPEN = ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts'];

test('REGRESSION: with no funnel settings the order is the app\'s real stages — no Prospecting, no Closing', () => {
    assert.deepEqual(openStagesOf({}), DEFAULT_OPEN);
    assert.deepEqual(openStagesOf(null), DEFAULT_OPEN);
    assert.deepEqual(openStagesOf({ funnelStages: [] }), DEFAULT_OPEN);
    assert.deepEqual(defaultStages.filter(s => !CLOSED_STAGES.includes(s)), DEFAULT_OPEN, 'the constants have not drifted');
});

test('the org\'s funnel settings win, closes stripped, duplicates and blanks dropped', () => {
    const settings = { funnelStages: [{ name: 'Lead' }, { name: 'Demo' }, { name: 'Demo' }, { name: '' }, { name: 'Closed Won' }, { name: 'Closed Lost' }] };
    assert.deepEqual(openStagesOf(settings), ['Lead', 'Demo']);
    assert.deepEqual(openStagesOf({ funnelStages: ['A', 'B', 'Closed Won'] }), ['A', 'B'], 'plain strings tolerated');
});

test('every open stage gets a colour by position, and both closes are coloured', () => {
    const p = stagePalette(DEFAULT_OPEN);
    for (const s of DEFAULT_OPEN) assert.match(p[s], /^#[0-9a-f]{6}$/i, s);
    assert.ok(p['Closed Won'] && p['Closed Lost']);
    assert.notEqual(p['Closed Won'], p['Closed Lost']);
    const q = stagePalette(['Anything', 'Renamed']);
    assert.ok(q['Anything'] && q['Renamed'], 'a renamed stage is not invisible');
    assert.deepEqual(stagePalette([]), { 'Closed Won': p['Closed Won'], 'Closed Lost': p['Closed Lost'] });
});

test('commit and best-case fallbacks are the last stages of the order, whatever the org calls them', () => {
    assert.deepEqual(commitFallbackStages(DEFAULT_OPEN), ['Negotiation/Review', 'Contracts']);
    assert.deepEqual(bestCaseFallbackStages(DEFAULT_OPEN), ['Proposal']);
    assert.deepEqual(commitFallbackStages(['A', 'B']), ['A', 'B']);
    assert.deepEqual(bestCaseFallbackStages(['A', 'B']), []);
    assert.deepEqual(commitFallbackStages([]), []);
});

test('ReportsTab: no hardcoded stage list drives a live number; the funnels rank a lost deal by the stage it left', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.match(src, /from '\.\.\/utils\/stageOrder'/);
    assert.doesNotMatch(src, /\['Closing','Negotiation\/Review','Contracts'/, 'commit fallback lists');
    assert.doesNotMatch(src, /\['Proposal'\]\.includes\(o\.stage\)/, 'best-case fallback list');
    assert.doesNotMatch(src, /const stageOrder = \['Prospecting'/);
    assert.doesNotMatch(src, /: \['Prospecting','Qualification','Discovery','Proposal','Negotiation','Closing'\]/, 'the funnel deep-dive fallback');
    assert.doesNotMatch(src, /\{ name:'Prospecting' \}/, 'the history track fallback');
    assert.doesNotMatch(src, /const stageColorMap = \{ ?'Prospecting'/, 'hardcoded colour maps');
    assert.doesNotMatch(src, /const stageColors = \{ 'Prospecting':'#b0a088'/, 'the saved-reports colour map');
    assert.doesNotMatch(src, /advancedFinal = st === 'Closing'/);
    assert.match(src, /const openStageOrder = openStagesOf\(settings\);/);
    assert.match(src, /const stageOrder = \[\.\.\.openStageOrder, 'Closed Won'\];/);
    assert.match(src, /const stageSeq = openStagesOf\(settings\);/);
    assert.equal((src.match(/o\.stage === 'Closed Lost' \? stageRank(?:D)?\(exitStageOf\(o\)\)/g) || []).length, 2, 'both funnels rank a lost deal by exitStageOf');
    assert.match(src, /selectedOpp\.stage === 'Closed Won' \? funnelStages\.length/, 'a won deal has visited every stage');
});
