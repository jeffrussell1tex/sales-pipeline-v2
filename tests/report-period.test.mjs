// tests/report-period.test.mjs
//
// The Reports tab's period filter put every fiscal quarter a year back under
// the app's default January fiscal start — "FY 2026" showed 2025 — and its
// comparison baseline used the opposite year convention, so "vs previous
// quarter" compared mismatched years (0.68). Every case here runs under TWO
// fiscal starts (18b18): January, where fiscal year == calendar year, and
// October, where Oct 2025 – Sep 2026 is FY2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayOf, inRange, currentFiscalYear, fiscalRange, periodRange, priorRange } from '../src/utils/reportPeriod.js';

const TODAY = new Date(2026, 8, 2, 10, 30); // 2 Sep 2026, local
const JAN = 1, OCT = 10;

// ── the year convention ──────────────────────────────────────────────────────

test('currentFiscalYear: Sep 2026 is FY2026 under January and FY2026 under October (Oct 2025 – Sep 2026)', () => {
    assert.equal(currentFiscalYear(JAN, TODAY), 2026);
    assert.equal(currentFiscalYear(OCT, TODAY), 2026);
    assert.equal(currentFiscalYear(OCT, new Date(2026, 9, 1)), 2027, 'Oct 1 2026 opens FY2027');
});

test('REGRESSION: under a January start, FY and every quarter are THIS calendar year, not last', () => {
    assert.deepEqual(periodRange('FY', JAN, { today: TODAY }), { from: '2026-01-01', to: '2026-12-31' });
    assert.deepEqual(periodRange('Q1', JAN, { today: TODAY }), { from: '2026-01-01', to: '2026-03-31' });
    assert.deepEqual(periodRange('Q3', JAN, { today: TODAY }), { from: '2026-07-01', to: '2026-09-30' });
    assert.deepEqual(periodRange('Q4', JAN, { today: TODAY }), { from: '2026-10-01', to: '2026-12-31' });
});

test('under an October start, FY2026 runs Oct 2025 – Sep 2026 and Q1 is Oct–Dec 2025', () => {
    assert.deepEqual(periodRange('FY', OCT, { today: TODAY }), { from: '2025-10-01', to: '2026-09-30' });
    assert.deepEqual(periodRange('Q1', OCT, { today: TODAY }), { from: '2025-10-01', to: '2025-12-31' });
    assert.deepEqual(periodRange('Q2', OCT, { today: TODAY }), { from: '2026-01-01', to: '2026-03-31' });
    assert.deepEqual(periodRange('Q4', OCT, { today: TODAY }), { from: '2026-07-01', to: '2026-09-30' });
});

test('fiscalRange rejects a key it does not know', () => {
    assert.equal(fiscalRange(2026, 'Q5', JAN), null);
    assert.equal(fiscalRange(2026, 'month', JAN), null);
});

test("'all' is no filter; custom passes the user's bounds through, open ends allowed", () => {
    assert.equal(periodRange('all', JAN, { today: TODAY }), null);
    assert.equal(periodRange('', JAN, { today: TODAY }), null);
    assert.deepEqual(periodRange('custom', JAN, { from: '2026-02-01', to: '2026-02-28' }), { from: '2026-02-01', to: '2026-02-28' });
    assert.deepEqual(periodRange('custom', OCT, { from: '2026-02-01' }), { from: '2026-02-01', to: '' });
});

// ── the comparison window ────────────────────────────────────────────────────

test('REGRESSION: previous quarter is the quarter BEFORE the selected one, same year convention', () => {
    for (const fs of [JAN, OCT]) {
        assert.deepEqual(priorRange('Q3', 'previous_quarter', fs, { today: TODAY }), fiscalRange(2026, 'Q2', fs), `Q3 → Q2, start ${fs}`);
        assert.deepEqual(priorRange('Q1', 'previous_quarter', fs, { today: TODAY }), fiscalRange(2025, 'Q4', fs), `Q1 → Q4 of FY2025, start ${fs}`);
        assert.deepEqual(priorRange('FY', 'previous_quarter', fs, { today: TODAY }), fiscalRange(2025, 'FY', fs), `FY → FY2025, start ${fs}`);
    }
    // Concretely, under October: Q1 FY2026 (Oct–Dec 2025) → Q4 FY2025 (Jul–Sep 2025).
    assert.deepEqual(priorRange('Q1', 'previous_quarter', OCT, { today: TODAY }), { from: '2025-07-01', to: '2025-09-30' });
});

test('previous year is the same key one fiscal year earlier', () => {
    for (const fs of [JAN, OCT]) {
        assert.deepEqual(priorRange('Q3', 'previous_year', fs, { today: TODAY }), fiscalRange(2025, 'Q3', fs));
        assert.deepEqual(priorRange('FY', 'previous_year', fs, { today: TODAY }), fiscalRange(2025, 'FY', fs));
    }
    assert.deepEqual(priorRange('Q3', 'previous_year', JAN, { today: TODAY }), { from: '2025-07-01', to: '2025-09-30' });
});

test("'All time' has no previous period — no more comparing everything against 90 days", () => {
    assert.equal(priorRange('all', 'previous_quarter', JAN, { today: TODAY }), null);
    assert.equal(priorRange('all', 'previous_year', OCT, { today: TODAY }), null);
});

test("'none' compares nothing", () => {
    assert.equal(priorRange('Q3', 'none', JAN, { today: TODAY }), null);
    assert.equal(priorRange('Q3', '', JAN, { today: TODAY }), null);
});

test('custom: previous quarter is the window of equal length ending the day before; previous year shifts a year', () => {
    const c = { from: '2026-02-10', to: '2026-02-19' }; // 10 days
    assert.deepEqual(priorRange('custom', 'previous_quarter', JAN, c), { from: '2026-01-31', to: '2026-02-09' });
    assert.deepEqual(priorRange('custom', 'previous_year', OCT, c), { from: '2025-02-10', to: '2025-02-19' });
    assert.equal(priorRange('custom', 'previous_quarter', JAN, { from: '2026-02-10' }), null, 'an open end has no length');
    assert.equal(priorRange('custom', 'previous_quarter', JAN, { from: '2026-02-19', to: '2026-02-10' }), null, 'a reversed range is not a range');
});

// ── days and instants ────────────────────────────────────────────────────────

test('dayOf keeps a day as written and reads an instant on the LOCAL clock', () => {
    assert.equal(dayOf('2026-09-02'), '2026-09-02');
    // 11pm local on 2 Sep as an instant: the UTC day may already be 3 Sep west
    // of Greenwich; the local day is what the user means.
    const late = new Date(2026, 8, 2, 23, 30);
    assert.equal(dayOf(late.toISOString()), '2026-09-02');
    assert.equal(dayOf(''), '');
    assert.equal(dayOf(null), '');
    assert.equal(dayOf('not a date'), '');
});

test('inRange: inclusive bounds, open ends, and an empty day is never inside', () => {
    const r = { from: '2026-07-01', to: '2026-09-30' };
    assert.equal(inRange('2026-07-01', r), true);
    assert.equal(inRange('2026-09-30', r), true);
    assert.equal(inRange('2026-10-01', r), false);
    assert.equal(inRange('2026-06-30', r), false);
    assert.equal(inRange('2026-08-15', { from: '', to: '2026-09-30' }), true);
    assert.equal(inRange('', r), false);
    assert.equal(inRange('', { from: '', to: '2026-09-30' }), false, 'an empty day is not inside an open-start range either — without the guard it would be');
    assert.equal(inRange('2026-08-15', null), false);
});

// ── the wiring ──────────────────────────────────────────────────────────────

test('ReportsTab uses the module for every period window and builds the baseline from the SLICED set', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.match(src, /from '\.\.\/utils\/reportPeriod'/);
    assert.doesNotMatch(src, /getFiscalQRanges|getFQR/, 'the hand-rolled quarter builders must be gone');
    assert.match(src, /const reportRange = periodRange\(reportTimePeriod, fiscalStart,/);
    assert.match(src, /const priorRangeR = priorRange\(reportTimePeriod, reportCompareTo, fiscalStart,/);
    assert.match(src, /const comparedOpps = priorRangeR \? reportsOpps\.filter\(/, 'the baseline must start from reportsOpps (sliced), not roleFilteredOpps');
    assert.doesNotMatch(src, /\(a\.date \|\| a\.createdAt \|\| ''\)\.slice\(0, 10\)/, 'no UTC-day slice of an instant in the period filters');
    assert.doesNotMatch(src, /\(l\.createdAt \|\| ''\)\.slice\(0, 10\)/);
});
