// buildOpp lived inside a callback prop inside ModalLayer.jsx and could not be
// reached by `node --test`. It carried a comment saying an overwrite "sends only
// the columns the CSV actually describes"; the code beneath built all thirteen
// unconditionally.
//
// Confirmed on dev twice. Next Steps was blanked by an import whose file has no
// Next Steps column, and it was the only one of four probes to fail — because
// Team Notes, contacts and stage history are not in the importer's field list at
// all, so nothing was there to re-materialise them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpportunityRow, coerceCsvColumns } from '../src/utils/importRows.js';

const opts = { currentUser: 'Jeff', pipelineId: 'pipe_enterprise', today: '2026-08-17', newId: () => 'new_1' };

// What mapCsvRows produces for ZZTest_opps_overwrite.csv — the mapped columns
// only. No salesRep, implementationCost, products, nextSteps, territory, vertical.
const csvRecord = {
    opportunityName: 'ZZTest Alpha Renewal',
    account: 'ZZTest Alpha Industries',
    stage: 'Proposal',
    arr: '44000',
    forecastedCloseDate: '2026-11-30',
    notes: 'OVERWRITTEN - stage and ARR changed',
    probability: '60',
};

// ── overwrite: only what the file described ──────────────────────────────────

test('an overwrite carries the id and strictly the file\'s columns', () => {
    const row = buildOpportunityRow(csvRecord, { ...opts, existingId: 'opp_1' });
    assert.deepEqual(Object.keys(row).sort(), [
        'account', 'arr', 'forecastedCloseDate', 'id', 'notes',
        'opportunityName', 'probability', 'stage',
    ]);
    assert.equal(row.id, 'opp_1');
});

test('REGRESSION: an overwrite does not blank the columns the file omits', () => {
    const row = buildOpportunityRow(csvRecord, { ...opts, existingId: 'opp_1' });
    for (const k of ['nextSteps', 'products', 'territory', 'vertical', 'implementationCost', 'salesRep']) {
        assert.equal(k in row, false, `${k} was not in the CSV and must not be written`);
    }
});

test('REGRESSION: an overwrite does not reassign the deal to whoever ran the import', () => {
    // `salesRep: o.salesRep || currentUser` silently took ownership of every
    // overwritten deal.
    const row = buildOpportunityRow(csvRecord, { ...opts, existingId: 'opp_1' });
    assert.equal('salesRep' in row, false);
});

test('REGRESSION: an overwrite does not zero the implementation cost', () => {
    // `parseFloat(undefined) || 0` is 0, written over a real figure.
    const row = buildOpportunityRow(csvRecord, { ...opts, existingId: 'opp_1' });
    assert.equal('implementationCost' in row, false);
});

test('an overwrite never rewrites createdDate, even if the file carries one', () => {
    const row = buildOpportunityRow({ ...csvRecord, createdDate: '2020-01-01' }, { ...opts, existingId: 'opp_1' });
    assert.equal('createdDate' in row, false, 'provenance is not content');
});

test('an overwrite never touches stage history, comments or contacts', () => {
    const row = buildOpportunityRow(csvRecord, { ...opts, existingId: 'opp_1' });
    for (const k of ['stageHistory', 'comments', 'contactIds', 'pipelineId', 'createdBy', 'stageChangedDate']) {
        assert.equal(k in row, false);
    }
});

test('a mapped-but-empty column IS written on an overwrite', () => {
    // The other half of the contract: the user mapped Next Steps and left the
    // cell blank, which asserts blank.
    const row = buildOpportunityRow({ ...csvRecord, nextSteps: '' }, { ...opts, existingId: 'opp_1' });
    assert.ok('nextSteps' in row);
    assert.equal(row.nextSteps, '');
});

// ── create: fill everything ──────────────────────────────────────────────────

test('a new deal gets every column, because the row does not exist yet', () => {
    const row = buildOpportunityRow(csvRecord, opts);
    for (const k of ['nextSteps', 'products', 'territory', 'vertical', 'implementationCost', 'salesRep', 'pipelineId', 'createdBy', 'stageChangedDate']) {
        assert.ok(k in row, `${k} must be present on a create`);
    }
    assert.deepEqual(row.stageHistory, []);
    assert.deepEqual(row.comments, []);
    assert.deepEqual(row.contactIds, []);
});

test('a new deal falls back sensibly when the file is thin', () => {
    const row = buildOpportunityRow({ account: 'Acme' }, opts);
    assert.equal(row.opportunityName, 'Acme', 'name falls back to the account');
    assert.equal(row.salesRep, 'Jeff');
    assert.equal(row.stage, 'Qualification');
    assert.equal(row.arr, 0);
    assert.equal(row.probability, null);
});

test('a new deal with no name and no account still gets one', () => {
    assert.equal(buildOpportunityRow({}, opts).opportunityName, 'Imported Deal');
});

test('stageChangedDate is set on create, so an imported deal can flag as stalled', () => {
    const row = buildOpportunityRow(csvRecord, opts);
    assert.equal(row.stageChangedDate, '2026-08-17');
    assert.equal(row.createdDate, '2026-08-17');
});

test('a file-supplied createdDate wins on create', () => {
    const row = buildOpportunityRow({ ...csvRecord, createdDate: '2025-03-04' }, opts);
    assert.equal(row.createdDate, '2025-03-04');
});

// ── coercion ─────────────────────────────────────────────────────────────────

test('numbers are coerced, and only for supplied keys', () => {
    const out = coerceCsvColumns({ arr: '44000', probability: '60' });
    assert.equal(out.arr, 44000);
    assert.equal(out.probability, 60);
    assert.deepEqual(Object.keys(out).sort(), ['arr', 'probability']);
});

test('an unparseable number does not become NaN', () => {
    const out = coerceCsvColumns({ arr: 'n/a', probability: 'high' });
    assert.equal(out.arr, 0);
    assert.equal(out.probability, null);
});

test('a key with an explicitly undefined value is still supplied', () => {
    // hasOwnProperty, not truthiness: `{ nextSteps: undefined }` means the column
    // was mapped, so it is an assertion of empty.
    const out = coerceCsvColumns({ nextSteps: undefined });
    assert.ok('nextSteps' in out);
    assert.equal(out.nextSteps, '');
});

test('an empty record produces an empty overwrite body beyond the id', () => {
    const row = buildOpportunityRow({}, { ...opts, existingId: 'opp_1' });
    assert.deepEqual(Object.keys(row), ['id']);
});
