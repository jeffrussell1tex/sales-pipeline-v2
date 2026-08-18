// stage-batch.test.mjs — the batch-uniformity contract in applyStageChanges.
//
// WHY THIS FILE EXISTS
// --------------------
// resolveStageChange was correct per row and the suite proved it. The defect was
// in composition: applyStageChanges derives stageChangedDate and stageHistory PER
// ROW, then partialRows keeps the UNION of keys across the batch. One deal moving
// stage put both keys into the union for every row, and sanitize() supplied its
// full-row defaults (null and []) for the rows that had no patch. bulkUpsert wrote
// them.
//
// Observed on dev before the fix: an overwrite of two deals, one moved and one
// not, left the unmoved deal with stageChangedDate null and its stage history
// erased — a deal losing real data because a DIFFERENT deal in the same file moved
// stage.
//
// Every case here is therefore MULTI-ROW. A single-row fixture cannot express the
// bug: it passed throughout.

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStageChanges, resolveStageChange } from '../netlify/functions/_stage.mjs';

const IMPORT_DATE = '2026-08-18';

const priorsOf = (...rows) => new Map(rows.map(r => [r.id, r]));

// A deal that has moved before: real clock, real history. This is the row the bug
// destroyed, so it is the shape most fixtures need.
const settled = (id, stage = 'Proposal') => ({
    id,
    stage,
    stageChangedDate: '2026-08-06',
    stageHistory: [{ prevStage: 'Qualification', stage, date: '2026-08-06', source: 'import' }],
});

test('a row that does not move keeps its stored clock when another row in the batch does', () => {
    const priors = priorsOf(settled('a'), settled('b'));
    const { rows } = applyStageChanges(
        [
            { id: 'a', stage: 'Proposal' },        // unchanged
            { id: 'b', stage: 'Negotiation' },     // moved
        ],
        priors,
        IMPORT_DATE,
    );

    const [a, b] = rows;
    assert.equal(a.stageChangedDate, '2026-08-06', 'untouched row must keep its stored date, not null');
    assert.deepEqual(a.stageHistory, priors.get('a').stageHistory, 'untouched row must keep its stored history, not []');
    assert.equal(b.stageChangedDate, IMPORT_DATE);
    assert.equal(b.stageHistory.length, 2);
});

test('the batch shape stays uniform — bulkUpsert sends one chunk as one INSERT', () => {
    const { rows } = applyStageChanges(
        [{ id: 'a', stage: 'Proposal' }, { id: 'b', stage: 'Negotiation' }],
        priorsOf(settled('a'), settled('b')),
        IMPORT_DATE,
    );
    const shapes = rows.map(r => Object.keys(r).sort().join(','));
    assert.equal(new Set(shapes).size, 1, 'rows in one batch must carry the same key set');
});

test('a batch where NOTHING moves adds neither derived key — the untouched case', () => {
    const { rows, changedCount } = applyStageChanges(
        [{ id: 'a', stage: 'Proposal' }, { id: 'b', stage: 'Proposal' }],
        priorsOf(settled('a'), settled('b')),
        IMPORT_DATE,
    );
    assert.equal(changedCount, 0);
    for (const row of rows) {
        assert.ok(!('stageChangedDate' in row), 'no row asserted a clock: the key must stay absent');
        assert.ok(!('stageHistory' in row), 'no row moved: the key must stay absent');
    }
});

test('a mapped daysInStage on one row does not stamp the others', () => {
    const { rows } = applyStageChanges(
        [
            { id: 'a', stage: 'Proposal', daysInStage: '12' },   // asserts
            { id: 'b', stage: 'Proposal' },                       // asserts nothing
        ],
        priorsOf(settled('a'), settled('b')),
        IMPORT_DATE,
    );
    assert.equal(rows[0].stageChangedDate, '2026-08-06'); // 18th minus 12
    assert.equal(rows[1].stageChangedDate, '2026-08-06', 'stored value, not null');
    // NEITHER row moved stage, so stageHistory enters no patch and must stay
    // absent on both — backfill is per KEY, not per row. An earlier version of
    // this test asserted b should carry its stored history here; that was the
    // wrong rule, and only running it said so. Backfilling a key nothing in the
    // batch touched would write history on every import.
    for (const row of rows) {
        assert.ok(!('stageHistory' in row), 'no row moved: the key must not be backfilled');
    }
});

test('backfill uses the stored value even when it is genuinely null', () => {
    const fresh = { id: 'a', stage: 'Qualification', stageChangedDate: null, stageHistory: [] };
    const { rows } = applyStageChanges(
        [{ id: 'a', stage: 'Qualification' }, { id: 'b', stage: 'Negotiation' }],
        priorsOf(fresh, settled('b')),
        IMPORT_DATE,
    );
    assert.equal(rows[0].stageChangedDate, null, 'a null stored value stays null — a no-op write, not an erasure');
    assert.deepEqual(rows[0].stageHistory, []);
});

test('daysInStage is stripped from every row — transport field, not a column', () => {
    const { rows } = applyStageChanges(
        [{ id: 'a', stage: 'Proposal', daysInStage: '12' }, { id: 'b', stage: 'Negotiation' }],
        priorsOf(settled('a'), settled('b')),
        IMPORT_DATE,
    );
    for (const row of rows) assert.ok(!('daysInStage' in row));
});

test('a row with no prior still shares the batch shape', () => {
    // bulkUpsert filters ids against rows that exist in this org, so such a row is
    // dropped before any write. The assertion is about shape, not about the value.
    const { rows } = applyStageChanges(
        [{ id: 'ghost', stage: 'Proposal' }, { id: 'b', stage: 'Negotiation' }],
        priorsOf(settled('b')),
        IMPORT_DATE,
    );
    assert.ok('stageChangedDate' in rows[0]);
    assert.ok('stageHistory' in rows[0]);
    assert.deepEqual(rows[0].stageHistory, []);
});

test('resolveStageChange still returns an EMPTY patch for the untouched case', () => {
    // The per-row rule is unchanged by the batch fix. If this ever starts
    // returning keys, the backfill above is masking a different bug.
    const { changed, patch } = resolveStageChange(
        { id: 'a', stage: 'Proposal' },
        settled('a'),
        IMPORT_DATE,
    );
    assert.equal(changed, false);
    assert.deepEqual(patch, {});
});
