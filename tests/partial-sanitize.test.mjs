// The bulk PUT branches fed a FULL-ROW sanitize() into bulkUpsert, which derives
// its SET clause from the keys supplied — so a CSV overwrite carrying fourteen
// columns wrote all forty, blanking stageHistory, comments and contactIds with
// the empty arrays sanitize had just invented.
//
// Confirmed on dev: a Team Note, a linked contact and the stage history were all
// erased by an overwrite whose CSV mentioned none of them. The previous fix was
// caller-side (buildOpp stopped SENDING those keys) and sanitize put them back,
// which is why 18b13 says the fix belongs in the endpoint.
//
// The stakes here are silent destruction of data no CSV can carry, so the
// regression test at the bottom is the real opportunities sanitize shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partialRows, partialRow } from '../netlify/functions/_sanitize.mjs';

// The real thing, trimmed to the columns that matter to this bug.
const sanitizeOpp = (d) => ({
    id:                 d.id,
    pipelineId:         d.pipelineId          || 'default',
    opportunityName:    d.opportunityName     || null,
    account:            d.account             || null,
    stage:              d.stage               || 'Discovery',
    arr:                d.arr                 ?? null,
    notes:              d.notes               || null,
    nextSteps:          d.nextSteps           || null,
    site:               d.site                || null,
    createdBy:          d.createdBy           || null,
    createdDate:        d.createdDate         || null,
    stageChangedDate:   d.stageChangedDate    || null,
    contactIds:         d.contactIds          || [],
    stageHistory:       d.stageHistory        || [],
    comments:           d.comments            || [],
});

// ── the core rule ────────────────────────────────────────────────────────────

test('a column absent from the payload is absent from the result', () => {
    const [row] = partialRows([{ id: 'o1', stage: 'Proposal' }], sanitizeOpp);
    assert.deepEqual(Object.keys(row).sort(), ['id', 'stage']);
    assert.equal('comments' in row, false);
    assert.equal('stageHistory' in row, false);
    assert.equal('contactIds' in row, false);
});

test('id is kept even when the payload is otherwise empty', () => {
    const [row] = partialRows([{ id: 'o1' }], sanitizeOpp);
    assert.deepEqual(Object.keys(row), ['id']);
});

test('the endpoint coercion still runs on the columns that are kept', () => {
    const [row] = partialRows([{ id: 'o1', stage: '', arr: 0 }], sanitizeOpp);
    assert.equal(row.stage, 'Discovery', 'the || default still applies');
    assert.equal(row.arr, 0, '?? must not turn a real zero into null');
});

test('a mapped-but-blank column IS written — blank is an assertion', () => {
    // The distinction the old code could not make: unmapped means "say nothing",
    // mapped-and-empty means "set it empty".
    const [row] = partialRows([{ id: 'o1', notes: '' }], sanitizeOpp);
    assert.ok('notes' in row);
    assert.equal(row.notes, null);
});

// ── the union, which is what keeps the INSERT shape uniform ──────────────────

test('the kept column set is the union across the batch, not per row', () => {
    const rows = partialRows([
        { id: 'o1', stage: 'Proposal', notes: 'has notes' },
        { id: 'o2', stage: 'Discovery', nextSteps: 'later row only' },
    ], sanitizeOpp);
    // Every row carries the same columns, so the multi-row INSERT has one shape.
    assert.deepEqual(Object.keys(rows[0]).sort(), Object.keys(rows[1]).sort());
    assert.ok('notes' in rows[1], 'a column the FIRST row supplies applies to all');
    assert.equal(rows[1].notes, null);
    // The direction that a first-row-only scan would miss entirely.
    assert.ok('nextSteps' in rows[0], 'a column a LATER row supplies applies to all');
    assert.equal(rows[0].nextSteps, null);
});

test('the union does not drag in columns no row supplied', () => {
    const rows = partialRows([
        { id: 'o1', stage: 'Proposal' },
        { id: 'o2', notes: 'x' },
    ], sanitizeOpp);
    for (const r of rows) {
        assert.equal('comments' in r, false);
        assert.equal('pipelineId' in r, false);
    }
});

// ── guards ───────────────────────────────────────────────────────────────────

test('an empty batch produces an empty batch', () => {
    assert.deepEqual(partialRows([], sanitizeOpp), []);
    assert.deepEqual(partialRows(null, sanitizeOpp), []);
});

test('a missing sanitize function fails loudly rather than passing raw rows through', () => {
    // Passing the payload through unsanitized would be worse than the bug.
    assert.throws(() => partialRows([{ id: 'o1' }], undefined), TypeError);
});

test('partialRow handles the single-record PUT form', () => {
    const row = partialRow({ id: 'o1', stage: 'Proposal' }, sanitizeOpp);
    assert.deepEqual(Object.keys(row).sort(), ['id', 'stage']);
});

// ── REGRESSION ───────────────────────────────────────────────────────────────

test('REGRESSION: a CSV overwrite does not touch stage history, Team Notes or contacts', () => {
    // Exactly what buildOpp sends for an overwrite: the CSV columns and nothing
    // else. Confirmed on dev to have erased all three of the fields asserted
    // absent below.
    const csvOverwrite = {
        id: 'opp_existing',
        opportunityName: 'ZZTest Alpha Renewal',
        account: 'ZZTest Alpha Industries',
        stage: 'Proposal',
        arr: 44000,
        notes: 'OVERWRITTEN - stage and ARR changed',
        nextSteps: '',
    };
    const [row] = partialRows([csvOverwrite], sanitizeOpp);

    // The three fields no CSV can carry, and that an import must never write.
    assert.equal('stageHistory' in row, false, 'stage history must survive an overwrite');
    assert.equal('comments'     in row, false, 'Team Notes must survive an overwrite');
    assert.equal('contactIds'   in row, false, 'linked contacts must survive an overwrite');

    // And the provenance columns the same expansion was quietly nulling.
    assert.equal('createdBy'        in row, false);
    assert.equal('createdDate'      in row, false);
    assert.equal('stageChangedDate' in row, false);
    assert.equal('pipelineId'       in row, false, "pipelineId must not be reset to 'default'");

    // What the CSV did describe still gets written.
    assert.equal(row.stage, 'Proposal');
    assert.equal(row.arr, 44000);
    assert.match(row.notes, /OVERWRITTEN/);
});

test('REGRESSION: the unfixed shape writes all fifteen columns', () => {
    // The control. This is what shipped: sanitize() alone, fed straight to
    // bulkUpsert, whose SET clause is derived from the keys supplied.
    const csvOverwrite = { id: 'opp_existing', stage: 'Proposal', arr: 44000 };
    const unfixed = sanitizeOpp(csvOverwrite);

    assert.ok('comments' in unfixed);
    assert.deepEqual(unfixed.comments, [], 'an empty array, about to be written over real data');
    assert.deepEqual(unfixed.stageHistory, []);
    assert.deepEqual(unfixed.contactIds, []);
    assert.equal(unfixed.pipelineId, 'default');
    assert.ok(Object.keys(unfixed).length > Object.keys(partialRows([csvOverwrite], sanitizeOpp)[0]).length);
});

// ── the leads PUT must MERGE, not replace (source assertion) ─────────────────
// leads.mjs PUT has the same full-row sanitize as the opportunities bulk path
// above, and its client (saveLead) has always sent { id, ...patch } — two keys
// for a status change — so a partial PUT REPLACED the row, nulling every
// absent column. The behavioural catcher is the integration test
// (tests/integration/leads.itest.mjs, 'a partial PUT updates its fields and
// preserves the rest'), but the mutation harness runs UNIT suites only, so
// the rule is pinned here as a source assertion: the PUT sanitizes the
// payload OVERLAID ON THE STORED ROW, and the bare full-row call is gone.
// If this fails, either the merge was reverted or leads.mjs was refactored —
// in the second case move the merge AND this guard together.

test('leads.mjs PUT merges the stored row before sanitize — the overwrite path stays closed', () => {
    const src = readFileSync(new URL('../netlify/functions/leads.mjs', import.meta.url), 'utf8');
    const merged = src.split('sanitize({ ...existing, ...data })').length - 1;
    assert.equal(merged, 1, 'the PUT must sanitize the payload overlaid on the stored row, exactly once');
    assert.equal(src.includes('const clean = sanitize(data);'), false,
        'the bare full-row sanitize call must not return — it nulls every column a partial PUT omits');
});
