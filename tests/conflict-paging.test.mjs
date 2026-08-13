// Conflict-step derivations, extracted so the 1,504-row re-import case is
// testable without mounting the modal. These mirror the expressions in
// CsvImportModal's conflicts step exactly; if one changes, change both.
import { test } from 'node:test';
import assert from 'node:assert';

const CONFLICTS_PER_PAGE = 100;
const page = (conflicts, p) => conflicts.slice(p * CONFLICTS_PER_PAGE, (p + 1) * CONFLICTS_PER_PAGE);
const pages = (conflicts) => Math.ceil(conflicts.length / CONFLICTS_PER_PAGE);
const bulkMode = (conflicts) =>
    conflicts.length === 0 ? 'skip'
    : conflicts.every(c => c.action === 'skip') ? 'skip'
    : conflicts.every(c => c.action === 'overwrite') ? 'overwrite'
    : 'mixed';

// The exact shape of Jeff's re-import: same file, every record already present.
const make = (n, action = 'skip') =>
    Array.from({ length: n }, (_, i) => ({ incomingIndex: i, action }));

test('1,504 conflicts render 100 at a time, not all of them', () => {
    const c = make(1504);
    assert.equal(page(c, 0).length, 100);
    assert.equal(pages(c), 16);
});

test('last page holds the remainder', () => {
    const c = make(1504);
    assert.equal(page(c, 15).length, 4);          // 1504 - 15*100
    assert.equal(page(c, 16).length, 0);          // past the end, no throw
});

test('row numbers are absolute, not per-page', () => {
    const c = make(1504);
    const rowNumber = (p, idx) => p * CONFLICTS_PER_PAGE + idx + 1;
    assert.equal(rowNumber(0, 0), 1);
    assert.equal(rowNumber(15, 3), 1504);
});

test('every conflict defaults to skip, so the toggle opens on Skip', () => {
    // This is why the old "Skip all" button looked dead: it set skip -> skip.
    assert.equal(bulkMode(make(1504)), 'skip');
});

test('Overwrite all flips the whole set regardless of page', () => {
    const c = make(1504).map(x => ({ ...x, action: 'overwrite' }));
    assert.equal(bulkMode(c), 'overwrite');
    assert.ok(page(c, 15).every(x => x.action === 'overwrite'), 'last page missed');
});

test('one row changed by hand reports mixed, not a false all-clear', () => {
    const c = make(1504);
    c[900].action = 'overwrite';                  // a row on page 9
    assert.equal(bulkMode(c), 'mixed');
});

test('no conflicts is not an error state', () => {
    assert.equal(bulkMode([]), 'skip');
    assert.equal(pages([]), 0);
    assert.deepEqual(page([], 0), []);
});

test('under one page shows no pager', () => {
    assert.equal(pages(make(42)), 1);
});

test('exactly one full page shows no pager', () => {
    assert.equal(pages(make(100)), 1);
    assert.equal(pages(make(101)), 2);
});

test('import count: all skipped imports nothing', () => {
    // previewData.length - skipped, the modal's own arithmetic
    const conflicts = make(1504);
    const previewLen = 1504;
    const willImport = previewLen - conflicts.filter(c => c.action === 'skip').length;
    assert.equal(willImport, 0);
});

test('import count: all overwritten imports everything', () => {
    const conflicts = make(1504, 'overwrite');
    const willImport = 1504 - conflicts.filter(c => c.action === 'skip').length;
    assert.equal(willImport, 1504);
});

test('bulk PUT chunking covers every row exactly once', () => {
    const BULK_CHUNK = 400;
    const items = make(1504);
    const seen = new Set();
    let requests = 0;
    for (let i = 0; i < items.length; i += BULK_CHUNK) {
        requests++;
        for (const it of items.slice(i, i + BULK_CHUNK)) {
            assert.ok(!seen.has(it.incomingIndex), 'row sent twice');
            seen.add(it.incomingIndex);
        }
    }
    assert.equal(seen.size, 1504, 'rows dropped');
    assert.equal(requests, 4);                     // was ~500 round-trips
});
