// tests/opp-text.test.mjs
//
// Audit batch 2 (0.68 tier 1 items 13–14): the Opportunity History pane
// crashed on `products.map` for any deal with products (a text column), wrote
// the contacts text column as an array, rendered three toolbar buttons above
// its own null guard, and the Actions report stored a fetch Response as data.
// The two text-column directions are pure and pinned here; the rest is pinned
// as text against ReportsTab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productsListOf, contactNamesText } from '../src/utils/oppText.js';

test('REGRESSION: products stored as comma text become a list, not a crash', () => {
    assert.deepEqual(productsListOf('Shiftboard, AutoCall'), ['Shiftboard', 'AutoCall']);
    assert.deepEqual(productsListOf('Shiftboard'), ['Shiftboard']);
    assert.deepEqual(productsListOf(''), []);
    assert.deepEqual(productsListOf(null), []);
    assert.deepEqual(productsListOf(' , ,'), [], 'blanks are not products');
});

test('an array is tolerated too, including objects with a name', () => {
    assert.deepEqual(productsListOf(['A', ' B ', '']), ['A', 'B']);
    assert.deepEqual(productsListOf([{ name: 'Shiftboard' }, 'AutoCall']), ['Shiftboard', 'AutoCall']);
});

test('REGRESSION: contact names go back as ", " text — the form OpportunityModal writes and every reader splits', () => {
    assert.equal(contactNamesText(['Ada Lovelace', 'Grace Hopper']), 'Ada Lovelace, Grace Hopper');
    assert.equal(typeof contactNamesText(['Ada Lovelace']), 'string');
});

test('contact names are trimmed, deduped, and blanks dropped; nothing in → empty text', () => {
    assert.equal(contactNamesText([' Ada Lovelace ', 'Ada Lovelace', '', null, 'Grace Hopper']), 'Ada Lovelace, Grace Hopper');
    assert.equal(contactNamesText([]), '');
    assert.equal(contactNamesText(undefined), '');
});

test('round trip: what contactNamesText writes, a comma split reads back', () => {
    const names = ['Ada Lovelace', 'Grace Hopper'];
    assert.deepEqual(contactNamesText(names).split(', '), names);
    assert.deepEqual(contactNamesText(names).split(',').map(s => s.trim()), names);
});

// ── the wiring in ReportsTab ────────────────────────────────────────────────

test('the history pane reads products through productsListOf and writes contacts through contactNamesText', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.match(src, /from '\.\.\/utils\/oppText'/);
    assert.doesNotMatch(src, /selectedOpp\.products\.map\(/, 'the crash: .map on a text column');
    assert.doesNotMatch(src, /selectedOpp\.products\?\.length/, 'a string has a length too — that is how the crash was reached');
    assert.match(src, /productsListOf\(selectedOpp\.products\)/);
    assert.doesNotMatch(src, /contacts:\s+mergedNames[,\s}]/, 'an array written into the contacts text column');
    assert.equal((src.match(/contacts:\s+contactNamesText\(mergedNames\)/g) || []).length, 2, 'both the add and the remove path');
});

test('the history pane reads nextSteps (the column), not nextStep / nextStepDate (never written)', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /selectedOpp\.nextStep\b(?!s)/, 'nextStep is not a column');
    assert.doesNotMatch(src, /nextStepDate/, 'nextStepDate is not a column');
    assert.match(src, /selectedOpp\.nextSteps/);
});

test('the three toolbar buttons cannot fire without a selected opportunity', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.match(src, /onClick=\{\(\) => selectedOpp && handleSaveAsReport\(/);
    assert.match(src, /disabled=\{!selectedOpp \|\| saveReportState === 'saving'\}/);
    assert.match(src, /disabled=\{!selectedOpp\} onClick=\{\(\) => selectedOpp && handleOppExportPDF\(/);
    assert.match(src, /if \(!selectedOpp\) return;\s*\n\s*const owner = selectedOpp\.salesRep/);
});

test('the Actions report parses the recommendation-log Response and refuses a non-ok one', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    const i = src.indexOf('/.netlify/functions/recommendation-log?');
    assert.ok(i > 0);
    const after = src.slice(i, i + 400);
    assert.match(after, /if \(!res\.ok\) throw new Error/, 'a 4xx/5xx must not render as "no data"');
    assert.match(after, /setData\(await res\.json\(\)\)/, 'the body, not the Response');
    assert.doesNotMatch(src, /const json = await dbFetch\(`\/\.netlify\/functions\/recommendation-log/);
});
