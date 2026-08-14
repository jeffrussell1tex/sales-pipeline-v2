// A deal with no close date used to vanish from the Pipeline list.
//
// groupByQuarter dropped it with a bare `if (!qk) continue`, so the header could
// read "3 open deals · $73K" directly above a table saying "No deals closing this
// quarter" — while the same three deals were visible in Funnel, Kanban and
// Forecast, which group by stage rather than by date. A rep who saved a deal
// without a close date would reasonably conclude it had not saved.
//
// The bucketing is fiscal-year aware, so the quarter cases are pinned too: an
// off-by-one there moves real deals into the wrong quarter, which is quieter than
// losing them and worse to discover late.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterOf, groupByQuarter, UNDATED_KEY } from '../src/utils/quarters.js';

const deal = (id, forecastedCloseDate, arr = 1000) => ({ id, forecastedCloseDate, arr });

// ── the regression ───────────────────────────────────────────────────────────

test('a deal with no close date is bucketed, not dropped', () => {
    const groups = groupByQuarter([deal('a', ''), deal('b', null), deal('c', undefined)], 1);
    const undated = groups.find(g => g.key === UNDATED_KEY);
    assert.ok(undated, 'undated deals were dropped');
    assert.equal(undated.opps.length, 3);
});

test('every deal in equals a deal out', () => {
    // The property that actually matters: nothing disappears, whatever the dates.
    const opps = [deal('a', '2026-02-10'), deal('b', ''), deal('c', '2026-05-01'), deal('d', null)];
    const total = groupByQuarter(opps, 1).reduce((n, g) => n + g.opps.length, 0);
    assert.equal(total, opps.length);
});

test('the undated bucket sorts last', () => {
    // It must never become the default selection while a real quarter has deals —
    // defaultKey falls back to groups[0].
    const groups = groupByQuarter([deal('a', ''), deal('b', '2026-02-10'), deal('c', '2029-11-01')], 1);
    assert.equal(groups.at(-1).key, UNDATED_KEY);
    assert.notEqual(groups[0].key, UNDATED_KEY);
});

test('the undated bucket carries no fiscal quarter to render', () => {
    // quarterRange() would invent a date range from the sort sentinel, so the rail
    // and stat strip branch on `undated` instead.
    const [g] = groupByQuarter([deal('a', '')], 1);
    assert.equal(g.undated, true);
    assert.equal(g.longLabel, 'No close date');
});

test('an unparseable date is undated, not a crash or a bogus quarter', () => {
    const groups = groupByQuarter([deal('a', 'not-a-date'), deal('b', '')], 1);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, UNDATED_KEY);
    assert.equal(groups[0].opps.length, 2);
});

test('no undated bucket appears when every deal has a date', () => {
    const groups = groupByQuarter([deal('a', '2026-02-10'), deal('b', '2026-03-01')], 1);
    assert.equal(groups.some(g => g.key === UNDATED_KEY), false);
});

// ── fiscal quarter bucketing ─────────────────────────────────────────────────

test('calendar fiscal year: months map to the obvious quarters', () => {
    assert.equal(quarterOf('2026-01-15', 1).key, '2026-Q1');
    assert.equal(quarterOf('2026-03-31', 1).key, '2026-Q1');
    assert.equal(quarterOf('2026-04-01', 1).key, '2026-Q2');
    assert.equal(quarterOf('2026-12-31', 1).key, '2026-Q4');
});

test('October fiscal start: the FY is named for the year it ENDS', () => {
    // Oct 2025 → FY2026, and January stays in the same FY rather than starting one.
    assert.equal(quarterOf('2025-10-01', 10).key, '2026-Q1');
    assert.equal(quarterOf('2026-01-15', 10).key, '2026-Q2');
    assert.equal(quarterOf('2026-09-30', 10).key, '2026-Q4');
    assert.equal(quarterOf('2026-10-01', 10).key, '2027-Q1');
});

test('a full ISO timestamp buckets the same as a date-only string', () => {
    // Records written by the server carry a time; CSV imports do not.
    assert.equal(quarterOf('2026-02-10T09:30:00.000Z', 1).key, quarterOf('2026-02-10', 1).key);
});

test('deals spanning a fiscal boundary land in different quarters', () => {
    const groups = groupByQuarter([deal('a', '2026-09-30'), deal('b', '2026-10-01')], 10);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map(g => g.key), ['2026-Q4', '2027-Q1']);
});
