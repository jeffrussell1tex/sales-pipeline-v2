// tests/pain-points.test.mjs
//
// State §0.227: Pain points library threw on its first render for any org on the app's default. The default
// (`DEFAULT_SETTINGS.painPoints`, which the settings GET answers to an org that has never saved the library, and which
// every settings save seeds under the row) is a flat list of names; the panel read `g.items.length` of each entry as a
// category, `{ cat, items }`, and a name has no `items` — the Settings tab was replaced by its error card. Now every
// reader of `settings.painPoints` takes it through one rule, src/utils/painPoints.js: the panel, the Settings card's
// count (which counted categories once a library was saved) and the deal window's picker (which judged the shape by
// its first entry alone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { painPointGroups, painPointCount, LOOSE_PAIN_POINTS } from '../src/utils/painPoints.js';
import { DEFAULT_SETTINGS } from '../src/utils/settingsDefaults.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const count = (s, t) => s.split(t).length - 1;
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

// What the panel computes on its first render, over the categories it holds.
const firstRender = (groups) => ({
    total: groups.reduce((a, g) => a + g.items.length, 0),
    shown: groups.map((g) => ({ ...g, items: g.items.filter((item) => item.toLowerCase().includes('')) })),
    keys: groups.map((g) => g.cat),
});

test('the regression: the default library — a flat list of names — reads as one category, and the panel draws it', () => {
    const seed = DEFAULT_SETTINGS.painPoints;
    assert.ok(seed.length > 0 && seed.every((s) => typeof s === 'string'), 'the fixture: the default is a flat list of names');
    // As the panel read it before §0.227: every name taken for a category.
    assert.throws(() => firstRender(seed), TypeError, 'the fixture: a name read as a category throws');
    const groups = painPointGroups(seed);
    assert.deepEqual(groups, [{ cat: LOOSE_PAIN_POINTS, items: seed }], 'REGRESSION: the default library is not one category of its names');
    assert.equal(firstRender(groups).total, seed.length);
    assert.equal(painPointCount(seed), seed.length);
});

test('a saved library — categories — reads as it was saved, in fresh copies', () => {
    const saved = [{ cat: 'Cost & ROI', items: ['High TCO', 'Hidden fees', 'Slow onboarding'] }, { cat: 'Efficiency', items: [] }];
    const groups = painPointGroups(saved);
    assert.deepEqual(groups, saved);
    groups[0].items.push('Edited');
    groups[1].cat = 'Renamed';
    assert.deepEqual(saved, [{ cat: 'Cost & ROI', items: ['High TCO', 'Hidden fees', 'Slow onboarding'] }, { cat: 'Efficiency', items: [] }], 'the caller edits a copy, never the stored list');
    assert.equal(painPointCount(saved), 3, 'the count is of pain points (3), never of categories (2)');
});

test('loose names beside categories join a category of their name, in any case — or one is made, last', () => {
    assert.deepEqual(
        painPointGroups([{ cat: 'Cost', items: ['A'] }, 'Loose one', { cat: 'pain points', items: ['B'] }, 'Loose two']),
        [{ cat: 'Cost', items: ['A'] }, { cat: 'pain points', items: ['B', 'Loose one', 'Loose two'] }]);
    assert.deepEqual(
        painPointGroups([{ cat: ' Pain Points ', items: ['B'] }, 'Loose']),
        [{ cat: ' Pain Points ', items: ['B', 'Loose'] }], 'a category of that name with spaces around it is the same category');
    assert.deepEqual(
        painPointGroups(['Loose', { cat: 'Cost', items: ['A'] }]),
        [{ cat: 'Cost', items: ['A'] }, { cat: LOOSE_PAIN_POINTS, items: ['Loose'] }]);
    assert.equal(painPointCount(['Loose', { cat: 'Cost', items: ['A', 'B'] }]), 3);
});

test('anything else is left out: not a list, a blank or non-text name, a category with no name gives up its names', () => {
    for (const v of [undefined, null, 'High Turnover', 7, {}, { cat: 'X', items: ['a'] }]) assert.deepEqual(painPointGroups(v), [], `not a list: ${JSON.stringify(v)}`);
    assert.equal(painPointCount(null), 0);
    assert.deepEqual(painPointGroups(['', '   ', null, 7, [], ['x'], 'Kept']), [{ cat: LOOSE_PAIN_POINTS, items: ['Kept'] }]);
    assert.deepEqual(
        painPointGroups([{ cat: 'Cost', items: ['A', 3, null, '', ' ', { x: 1 }, 'B'] }, { cat: 'Bare' }, { cat: 'Odd', items: 'nope' }]),
        [{ cat: 'Cost', items: ['A', 'B'] }, { cat: 'Bare', items: [] }, { cat: 'Odd', items: [] }]);
    assert.deepEqual(painPointGroups([{ cat: '  ', items: ['A'] }, { items: ['B'] }, { cat: 5, items: ['C'] }]), [{ cat: LOOSE_PAIN_POINTS, items: ['A', 'B', 'C'] }]);
    const drawn = firstRender(painPointGroups([{ cat: 'Cost', items: [1, 'A'] }, 'B', null]));
    assert.equal(drawn.total, 2, 'whatever is stored, the panel draws without throwing');
});

// ── THE GUARD: every read of the org's library goes through the one rule ──────

const SRC = new URL('src/', ROOT);
const walk = (dir, rel = 'src') => readdirSync(dir).flatMap((n) => {
    const p = new URL(n, dir), r = `${rel}/${n}`;
    if (statSync(p).isDirectory()) return walk(new URL(n + '/', dir), r);
    return /\.(jsx?|mjs)$/.test(n) ? [r] : [];
});
const READS = /settings\s*\??\.\s*painPoints\b/g;
const THROUGH = /\b(painPointGroups|painPointCount)\(\s*settings\s*\??\.\s*painPoints\s*\)/g;
// Reads the dotted pattern cannot see: the key taken by name in brackets, or destructured out of the settings.
const OTHER_READS = [/\[\s*['"`]painPoints['"`]\s*\]/g, /\{[^{}]*\bpainPoints\b[^{}]*\}\s*=\s*[^;\n]*\bsettings\b/g];
// A source's reads of `settings.painPoints` that do not go through the one rule.
const unguarded = (src) => (code(src).match(READS) || []).length - (code(src).match(THROUGH) || []).length
    + OTHER_READS.reduce((n, re) => n + (code(src).match(re) || []).length, 0);

test('THE GUARD: no screen reads settings.painPoints but through painPointGroups or painPointCount', () => {
    const readers = {};
    for (const f of walk(SRC)) {
        const s = read(f);
        const n = (code(s).match(READS) || []).length + OTHER_READS.reduce((k, re) => k + (code(s).match(re) || []).length, 0);
        if (!n) continue;
        readers[f] = n;
        assert.equal(unguarded(s), 0, `REGRESSION: ${f} reads settings.painPoints around the one rule (src/utils/painPoints.js) — a flat list of names breaks a reader that takes categories, and a category list one that takes names`);
    }
    assert.deepEqual(Object.keys(readers).sort(), [
        'src/Tabs/settings/salesProcess/PainPointsDetail.jsx',
        'src/components/modals/OpportunityModal.jsx',
        'src/utils/settingsCards.js',
    ], 'the readers this guard was written for — a new reader goes through the rule and joins this list');
});

test('THE GUARD sees what it is for, on made-up sources', () => {
    assert.equal(unguarded('const saved = settings?.painPoints?.length ? settings.painPoints : D;'), 2);
    assert.equal(unguarded('const g = painPointGroups(settings?.painPoints);'), 0);
    assert.equal(unguarded('const n = painPointCount( settings.painPoints );'), 0);
    assert.equal(unguarded('const raw = settings?.painPoints; const g = painPointGroups(raw);'), 1);
    assert.equal(unguarded('// settings.painPoints is grouped\nconst g = painPointGroups(settings?.painPoints);'), 0, 'a comment is not a read');
    assert.equal(unguarded('setSettings(prev => ({ ...prev, painPoints: groups }));'), 0, 'a write is not a read');
    assert.equal(unguarded("const list = settings?.['painPoints'];"), 1, 'by name in brackets');
    assert.equal(unguarded('const { painPoints } = settings;'), 1, 'destructured');
    assert.equal(unguarded('const { painPoints: pp, competitors } = settings || {};'), 1, 'destructured, renamed');
    assert.equal(unguarded("const { painPoints } = formData; const x = deal['stage'];"), 0, "a deal's own field is not the library");
});

test('the readers, each as it reads: the panel falls back to its own categories only when the library holds none', () => {
    const panel = code(read('src/Tabs/settings/salesProcess/PainPointsDetail.jsx'));
    assert.equal(count(panel, 'const stored   = painPointGroups(settings?.painPoints);'), 1);
    assert.equal(count(panel, 'const saved    = stored.length ? stored : DEFAULT_PAIN_POINTS;'), 1, 'REGRESSION: the panel reads around what the library holds');
    const cards = code(read('src/utils/settingsCards.js'));
    assert.equal(count(cards, "statusDetail = countOrNull(painPointCount(settings?.painPoints), 'pain point');"), 1, 'REGRESSION: the card counts categories, not pain points');
    const modal = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.equal(count(modal, 'const configured = painPointGroups(settings?.painPoints);'), 1);
    const I = ' '.repeat(44);
    assert.equal(count(modal, [
        'const groups = configured.length',
        I + '    ? configured',
        I + "    : [{ cat: 'Pain Points', items: ['High Turnover', 'Scheduling Complexity', 'Compliance Issues', 'Manual Processes', 'Poor Visibility'] }];",
    ].join('\n')), 1, 'REGRESSION: the deal window offers its own list though the library holds names, or offers none');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/pain-points.test.mjs'), 'SUITES runs this file');
});
