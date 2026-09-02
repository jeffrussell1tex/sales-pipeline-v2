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
import { readFileSync } from 'node:fs';
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

test('an unmapped field is ABSENT, not empty', () => {
    // This test previously asserted the opposite, with a confident rationale
    // about undefined vs '' -- and it was wrong, which is how the bug shipped.
    // Downstream builders spread these straight into a request body, and to a PUT
    // that merges by supplied keys (18b13) a present '' means "set this empty".
    // A field the CSV never mapped must not say anything at all.
    const { records } = mapCsvRows([['Ada', 'Lovelace']], contactFields, { firstName: 0, lastName: 1 });
    assert.equal('email' in records[0], false);
    assert.equal('company' in records[0], false);
    assert.deepEqual(Object.keys(records[0]).sort(), ['firstName', 'lastName']);
});

test('a MAPPED field is present even when the cell is empty', () => {
    // The other half of the same contract: the user mapped this column and left
    // it blank, which is an assertion of blank, not silence.
    const { records } = mapCsvRows([['Ada', 'Lovelace', '']], contactFields,
        { firstName: 0, lastName: 1, email: 2 });
    assert.ok('email' in records[0]);
    assert.equal(records[0].email, '');
});

test("REGRESSION: an overwrite payload carries only the file's columns", () => {
    // Next Steps is in the opportunity field list but not in the CSV. It was
    // arriving as '' and being blanked on every overwrite -- confirmed on dev,
    // where Team Notes, contacts and stage history all survived and Next Steps
    // did not, because those three are not in the field list at all.
    const oppFields = [
        { key: 'opportunityName', label: 'Opportunity Name', required: true },
        { key: 'account', label: 'Account Name', required: true },
        { key: 'stage', label: 'Stage' },
        { key: 'nextSteps', label: 'Next Steps' },
        { key: 'territory', label: 'Territory' },
    ];
    const { records } = mapCsvRows(
        [['ZZTest Alpha Renewal', 'ZZTest Alpha Industries', 'Proposal']],
        oppFields,
        { opportunityName: 0, account: 1, stage: 2 },
    );
    assert.equal('nextSteps' in records[0], false, 'Next Steps must survive an overwrite');
    assert.equal('territory' in records[0], false);
    assert.deepEqual(Object.keys(records[0]).sort(), ['account', 'opportunityName', 'stage']);
});

test("the '— Skip this field —' option and a blank mapping both mean unmapped", () => {
    const { records } = mapCsvRows([['Ada', 'Lovelace', 'ada@x.com']], contactFields,
        { firstName: 0, lastName: 1, email: '', company: -1 });
    assert.equal('email' in records[0], false, "'' is the Skip option, not a column");
    assert.equal('company' in records[0], false, 'a negative index is not a column');
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

// ── unreadable dates are REFUSED at Preview ──────────────────────────────────
// The importer's open question from 0.60, closed 0.64 (Jeff: refuse). A day cell
// toLocalDay cannot read used to pass through as written and become an Invalid
// Date everywhere downstream. Now the row is refused before anything is sent,
// with the row, the field and the cell named on the banner.

const oppDayFields = [
    { key: 'opportunityName',     label: 'Opportunity Name', required: true },
    { key: 'account',             label: 'Account Name',     required: true },
    { key: 'forecastedCloseDate', label: 'Close Date',   type: 'day' },
    { key: 'createdDate',         label: 'Created Date', type: 'day' },
    { key: 'notes',               label: 'Notes' },
];
const oppDayMap = { opportunityName: 0, account: 1, forecastedCloseDate: 2, createdDate: 3, notes: 4 };

test('a day cell that cannot be read refuses the row, naming row, field and cell', () => {
    const { records, dropped } = mapCsvRows([['Deal', 'Acme', 'Sept 15', '', '']], oppDayFields, oppDayMap);
    assert.equal(records.length, 0);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].reason, 'date');
    assert.equal(dropped[0].field, 'Close Date');
    assert.equal(dropped[0].value, 'Sept 15', 'the cell, verbatim, so it can be found in the file');
    assert.equal(dropped[0].rowNumber, 2, 'numbered as Excel shows it');
});

test('every shape toLocalDay reads passes, and the cell is kept AS WRITTEN', () => {
    // Normalising is importRows.js\'s job (csvDay); mapping only decides whether
    // the row may proceed. The three shapes are the ones the ZZTest file carries.
    const rows = [
        ['US',    'Acme', '9/15/2026',           '8/15/2026', ''],
        ['ISO',   'Acme', '2026-10-01',          '',          ''],
        ['Excel', 'Acme', '2026-11-20 00:00:00', '',          ''],
    ];
    const { records, dropped } = mapCsvRows(rows, oppDayFields, oppDayMap);
    assert.equal(dropped.length, 0);
    assert.equal(records.length, 3);
    assert.equal(records[0].forecastedCloseDate, '9/15/2026');
});

test('a blank day cell is silence, not a bad date', () => {
    const { records, dropped } = mapCsvRows([['Deal', 'Acme', '', '   ', '']], oppDayFields, oppDayMap);
    assert.equal(records.length, 1);
    assert.equal(dropped.length, 0);
});

test('a field without type day is never date-checked', () => {
    // Notes says "Sept 15" and that is fine; only declared day fields are read.
    const { records, dropped } = mapCsvRows([['Deal', 'Acme', '', '', 'Sept 15']], oppDayFields, oppDayMap);
    assert.equal(records.length, 1);
    assert.equal(dropped.length, 0);
});

test('an unmapped day field is not checked, whatever the column holds', () => {
    const { records, dropped } = mapCsvRows([['Deal', 'Acme', 'Sept 15']], oppDayFields, { opportunityName: 0, account: 1 });
    assert.equal(records.length, 1);
    assert.equal(dropped.length, 0);
});

test('an impossible date is refused, not rolled into the next month', () => {
    const { dropped } = mapCsvRows([['Deal', 'Acme', '2/30/2026', '', '']], oppDayFields, oppDayMap);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].value, '2/30/2026');
});

test('a row missing every required field is a required-field drop, even with a bad date', () => {
    // The required check runs first and its report is unchanged; the date
    // check only sees rows that could otherwise be saved.
    const { dropped } = mapCsvRows([['', '', 'Sept 15', '', '']], oppDayFields, oppDayMap);
    assert.equal(dropped.length, 1);
    assert.notEqual(dropped[0].reason, 'date');
});

test('a row with two bad dates is refused once, naming the first', () => {
    const { dropped } = mapCsvRows([['Deal', 'Acme', 'Sept 15', 'last week', '']], oppDayFields, oppDayMap);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].field, 'Close Date');
});

test('refused rows are numbered as the user sees them in Excel', () => {
    const rows = [
        ['A', 'Acme', '9/15/2026', '', ''],
        ['B', 'Acme', 'Sept 15',   '', ''],
        ['C', 'Acme', '',          '', ''],
        ['D', 'Acme', 'tomorrow',  '', ''],
    ];
    const { dropped } = mapCsvRows(rows, oppDayFields, oppDayMap);
    assert.deepEqual(dropped.map(d => d.rowNumber), [3, 5]);
});

test('the banner names each refused row with its cell and says what shape to use', () => {
    const rows = [['A', 'Acme', '9/15/2026', '', ''], ['B', 'Acme', 'Sept 15', '', '']];
    const msg = describeDropped(mapCsvRows(rows, oppDayFields, oppDayMap), 2);
    assert.match(msg, /1 of 2 rows will be refused/);
    assert.match(msg, /row 3: "Sept 15" in Close Date/);
    assert.match(msg, /m\/d\/yyyy or yyyy-mm-dd/);
    assert.doesNotMatch(msg, /required fields are empty/, 'no required-field sentence when nothing was dropped for that');
});

test('the banner switches to the whole-file message when every row is refused for a date', () => {
    const rows = [['A', 'Acme', 'Sept 15', '', ''], ['B', 'Acme', 'Oct 1', '', '']];
    const msg = describeDropped(mapCsvRows(rows, oppDayFields, oppDayMap), 2);
    assert.match(msg, /None of the 2 rows/);
    assert.match(msg, /every row has a date that cannot be read/);
    assert.match(msg, /row 2: "Sept 15" in Close Date; row 3: "Oct 1" in Close Date/);
});

test('the banner carries both sentences when both kinds of drop occur', () => {
    const rows = [['A', 'Acme', '9/15/2026', '', ''], ['', '', '', '', ''], ['C', 'Acme', 'Sept 15', '', '']];
    const msg = describeDropped(mapCsvRows(rows, oppDayFields, oppDayMap), 3);
    assert.match(msg, /1 of 3 rows will be skipped — required fields are empty \(rows 3\)/);
    assert.match(msg, /1 of 3 rows will be refused — a date cannot be read \(row 4: "Sept 15" in Close Date\)/);
    assert.doesNotMatch(msg, /None of the/);
});

test('the refusal list is capped at five rows, then a count', () => {
    const rows = [['A', 'Acme', '9/15/2026', '', ''], ...Array.from({ length: 20 }, (_, i) => [`B${i}`, 'Acme', 'Sept 15', '', ''])];
    const msg = describeDropped(mapCsvRows(rows, oppDayFields, oppDayMap), 21);
    assert.match(msg, /20 of 21 rows will be refused/);
    assert.match(msg, /\+15 more/);
});

test('the required-field wording is unchanged when no date was refused', () => {
    // The mixed banner must not have changed what a required-only file says.
    const rows = [['A', 'Acme', '9/15/2026', '', ''], ['', '', '', '', '']];
    const msg = describeDropped(mapCsvRows(rows, oppDayFields, oppDayMap), 2);
    assert.equal(msg, '1 of 2 rows will be skipped — required fields are empty (rows 3).');
});

test('REGRESSION: the ZZTest file plus one "Sept 15" row imports three and refuses one, by name', () => {
    const rows = [
        ['ZZTest Close US',    'ZZTest Import Co', '9/15/2026',           '8/15/2026', ''],
        ['ZZTest Close ISO',   'ZZTest Import Co', '2026-10-01',          '',          ''],
        ['ZZTest Close Excel', 'ZZTest Import Co', '2026-11-20 00:00:00', '',          ''],
        ['ZZTest Close Words', 'ZZTest Import Co', 'Sept 15',             '',          ''],
    ];
    const result = mapCsvRows(rows, oppDayFields, oppDayMap);
    assert.equal(result.records.length, 3);
    assert.equal(result.dropped.length, 1);
    assert.match(describeDropped(result, 4), /row 5: "Sept 15" in Close Date/);
});

test('the real opportunity field list declares Close Date and Created Date as day fields', () => {
    // mapCsvRows only checks fields declared type 'day'. The field list lives in
    // a React component the suites cannot import, so it is read as text.
    const src = readFileSync(new URL('../src/components/modals/CsvImportModal.jsx', import.meta.url), 'utf8');
    assert.match(src, /key: 'forecastedCloseDate', label: 'Close Date', type: 'day'/);
    assert.match(src, /key: 'createdDate',\s+label: 'Created Date', type: 'day'/);
});
