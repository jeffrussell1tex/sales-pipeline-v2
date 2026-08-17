// mapCsvRows replaces getMappedData(), whose trailing .filter() dropped every row
// lacking a required field with nothing anywhere in the UI to say so. An accounts
// CSV run through the CONTACTS importer produced a green tick, "Import Complete!"
// and 0 imported — six rows in, zero out.
//
// Two things are pinned here. The drop RULE is preserved exactly (`.some`, not
// `.every`) because real files depend on it. The drop REPORT is new, and the
// regression test at the bottom is the six-rows-in-zero-out case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCsvRows, describeDropped } from '../src/utils/csvMapping.js';

const contactFields = [
    { key: 'firstName', label: 'First Name', required: true },
    { key: 'lastName',  label: 'Last Name',  required: true },
    { key: 'email',     label: 'Email' },
    { key: 'company',   label: 'Company' },
];

const accountFields = [
    { key: 'name',  label: 'Account Name', required: true },
    { key: 'phone', label: 'Phone' },
];

// ── mapping ──────────────────────────────────────────────────────────────────

test('columns land in the fields they are mapped to', () => {
    const rows = [['Ada', 'Lovelace', 'ada@x.com', 'Analytical']];
    const { records } = mapCsvRows(rows, contactFields, { firstName: 0, lastName: 1, email: 2, company: 3 });
    assert.deepEqual(records, [{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@x.com', company: 'Analytical' }]);
});

test('an unmapped field is present and empty, never undefined', () => {
    // Downstream builders spread these straight into a request body; undefined
    // and '' are not the same thing to a PUT that merges by supplied keys (18b13).
    const { records } = mapCsvRows([['Ada', 'Lovelace']], contactFields, { firstName: 0, lastName: 1 });
    assert.equal(records[0].email, '');
    assert.ok('company' in records[0]);
});

test("the '— Skip this field —' option and a blank mapping both mean unmapped", () => {
    const { records } = mapCsvRows([['Ada', 'Lovelace', 'ada@x.com']], contactFields,
        { firstName: 0, lastName: 1, email: '', company: -1 });
    assert.equal(records[0].email, '');
    assert.equal(records[0].company, '');
});

test('a column index past the end of a short row yields empty, not a crash', () => {
    const { records } = mapCsvRows([['Ada']], contactFields, { firstName: 0, lastName: 1 });
    assert.equal(records[0].lastName, '');
});

// ── the drop rule, preserved exactly ─────────────────────────────────────────

test('ANY required field is enough to keep a row — .some, not .every', () => {
    // Deliberate: mononyms and company-in-a-person-field are real, and tightening
    // this to .every would silently start rejecting files that import today.
    const { records, dropped } = mapCsvRows([['Prince', '']], contactFields, { firstName: 0, lastName: 1 });
    assert.equal(records.length, 1);
    assert.equal(dropped.length, 0);
});

test('a row with all required fields blank is dropped', () => {
    const { records, dropped } = mapCsvRows([['', '', 'x@y.com']], contactFields, { firstName: 0, lastName: 1, email: 2 });
    assert.equal(records.length, 0);
    assert.equal(dropped.length, 1);
});

test('whitespace is not a value', () => {
    const { records, dropped } = mapCsvRows([['   ', '  ']], contactFields, { firstName: 0, lastName: 1 });
    assert.equal(records.length, 0);
    assert.equal(dropped.length, 1);
});

test('a field list with no required fields keeps everything', () => {
    const { records } = mapCsvRows([[''], ['x']], [{ key: 'note', label: 'Note' }], { note: 0 });
    assert.equal(records.length, 2);
});

// ── the drop report, which is new ────────────────────────────────────────────

test('dropped rows are numbered as the user sees them in Excel', () => {
    // File row 1 is the header, so the first data row is row 2.
    const rows = [['Ada', 'Lovelace'], ['', ''], ['Grace', 'Hopper'], ['', '']];
    const { dropped } = mapCsvRows(rows, contactFields, { firstName: 0, lastName: 1 });
    assert.deepEqual(dropped.map(d => d.rowNumber), [3, 5]);
});

test('a dropped row carries a sample so it can be recognised', () => {
    const rows = [['', '', 'orphan@x.com', 'Acme Corp']];
    const { dropped } = mapCsvRows(rows, contactFields, { firstName: 0, lastName: 1, email: 2, company: 3 });
    assert.match(dropped[0].sample, /orphan@x\.com/);
});

test('unmappedRequired names the cause, not just the symptom', () => {
    const { unmappedRequired } = mapCsvRows([['a', 'b']], contactFields, { email: 0, company: 1 });
    assert.deepEqual(unmappedRequired, ['First Name', 'Last Name']);
});

test('a mapped required field is not reported as unmapped', () => {
    const { unmappedRequired } = mapCsvRows([['Ada', '']], contactFields, { firstName: 0, lastName: 1 });
    assert.deepEqual(unmappedRequired, []);
});

// ── the preview banner ───────────────────────────────────────────────────────

test('describeDropped is silent when nothing was dropped', () => {
    const result = mapCsvRows([['Ada', 'Lovelace']], contactFields, { firstName: 0, lastName: 1 });
    assert.equal(describeDropped(result, 1), null);
});

test('describeDropped names the rows when some were dropped', () => {
    const rows = [['Ada', 'Lovelace'], ['', ''], ['', '']];
    const result = mapCsvRows(rows, contactFields, { firstName: 0, lastName: 1 });
    const msg = describeDropped(result, 3);
    assert.match(msg, /2 of 3 rows will be skipped/);
    assert.match(msg, /rows 3, 4/);
});

test('describeDropped caps the row list rather than printing hundreds', () => {
    const rows = [['Ada', 'Lovelace'], ...Array.from({ length: 20 }, () => ['', ''])];
    const result = mapCsvRows(rows, contactFields, { firstName: 0, lastName: 1 });
    const msg = describeDropped(result, 21);
    assert.match(msg, /20 of 21 rows will be skipped/);
    assert.match(msg, /\+15 more/, 'five row numbers, then a count');
});

test('describeDropped switches to the whole-file message only when nothing survives', () => {
    // A file where every row drops is almost never 500 bad rows — it is a
    // mapping mistake, and it gets the diagnosis instead of a row list.
    const rows = Array.from({ length: 20 }, () => ['', '']);
    const result = mapCsvRows(rows, contactFields, { firstName: 0, lastName: 1 });
    const msg = describeDropped(result, 20);
    assert.match(msg, /None of the 20 rows/);
    assert.doesNotMatch(msg, /\+15 more/);
});

// ── REGRESSION ───────────────────────────────────────────────────────────────

test('REGRESSION: an accounts CSV in the contacts importer reports zero importable, with the reason', () => {
    // Six rows in, zero out, green tick, "Import Complete!". The mapping is what
    // an accounts file auto-maps to when the contacts field list is in force:
    // Account Name and Phone match nothing required.
    const accountsCsv = [
        ['Acme Corp', '555-0100'], ['Globex', '555-0101'], ['Initech', '555-0102'],
        ['Umbrella', '555-0103'], ['Soylent', '555-0104'], ['Hooli', '555-0105'],
    ];
    const result = mapCsvRows(accountsCsv, contactFields, { company: 0, phone: 1 });

    assert.equal(result.records.length, 0, 'nothing is importable');
    assert.equal(result.dropped.length, 6, 'and all six are accounted for');
    assert.deepEqual(result.unmappedRequired, ['First Name', 'Last Name']);

    const msg = describeDropped(result, 6);
    assert.match(msg, /None of the 6 rows/);
    assert.match(msg, /No column is mapped to First Name or Last Name/);
    assert.match(msg, /column mapping/, 'and it says what to do about it');
});

test('REGRESSION: the same file in the ACCOUNTS importer imports cleanly', () => {
    // The control. The file was never the problem — the importer was.
    const accountsCsv = [['Acme Corp', '555-0100'], ['Globex', '555-0101']];
    const result = mapCsvRows(accountsCsv, accountFields, { name: 0, phone: 1 });
    assert.equal(result.records.length, 2);
    assert.equal(result.dropped.length, 0);
    assert.equal(describeDropped(result, 2), null);
});
