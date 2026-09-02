// tests/pipeline-report.test.mjs
//
// The Pipeline & Forecast tab's quota was a literal $175,000, its "Forecast
// accuracy" chart was forecast === actual with att: 1.0 (always 100%), and its
// 7-day ribbon had Lost hardcoded to 0 (0.68 tier 1 items 3, 4, 7); the
// Performance tab divided a year's quota into a quarter's revenue (item 8).
// Each replacement is pure and pinned here, the fiscal cases under two starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { userQuotaFor, teamQuotaFor, pipelineMovement, closedWonByQuarter, closeDayOf } from '../src/utils/pipelineReport.js';

// ── quotas ──────────────────────────────────────────────────────────────────

const ANNUAL    = { name: 'Karen Russell',   userType: 'User', quotaType: 'annual',    annualQuota: 400000 };
const QUARTERLY = { name: 'Savannah Miller', userType: 'User', quotaType: 'quarterly', q1Quota: 100000, q2Quota: 100000, q3Quota: 300000, q4Quota: 500000 };
const ADMIN     = { name: 'Jeff Russell',    userType: 'Admin', quotaType: 'annual', annualQuota: 999999 };
const USERS = [ANNUAL, QUARTERLY, ADMIN, { name: 'Ryan Algie', userType: 'Technician' }];

test('REGRESSION: a quarter gets a quarter of an annual plan, and the quarter\'s own figure on a quarterly plan', () => {
    assert.equal(userQuotaFor(ANNUAL, 'Q3'), 100000);
    assert.equal(userQuotaFor(QUARTERLY, 'Q3'), 300000, 'not the average of the four');
    assert.equal(userQuotaFor(QUARTERLY, 'Q4'), 500000);
});

test('the year is the annual figure, or the four quarters summed', () => {
    for (const p of ['FY', 'all', 'custom', '']) {
        assert.equal(userQuotaFor(ANNUAL, p), 400000, p);
        assert.equal(userQuotaFor(QUARTERLY, p), 1000000, p);
    }
});

test('no plan, no user: 0 — never a made-up number', () => {
    assert.equal(userQuotaFor({ name: 'x' }, 'Q1'), 0);
    assert.equal(userQuotaFor(null, 'FY'), 0);
    assert.equal(teamQuotaFor([], 'FY', {}), 0);
});

test('REGRESSION: the team quota is the reps\' configured quotas, not $175,000', () => {
    assert.equal(teamQuotaFor(USERS, 'FY', {}), 1400000, 'Admin excluded; the technician has none');
    assert.equal(teamQuotaFor(USERS, 'Q3', {}), 400000);
});

test('the team quota follows the slice', () => {
    assert.equal(teamQuotaFor(USERS, 'FY', { rep: 'Karen Russell' }), 400000);
    assert.equal(teamQuotaFor([...USERS.map(u => ({ ...u, team: u.name === 'Savannah Miller' ? 'West' : 'East' }))], 'Q4', { team: 'West' }), 500000);
});

// ── movement ────────────────────────────────────────────────────────────────

const TODAY = '2026-09-02';
const deal = (id, over) => ({ id, arr: 1000, stage: 'Proposal', createdDate: '2026-01-15', ...over });
const DEALS = [
    deal('old-open'),                                                                    // carried
    deal('new-open',  { createdDate: '2026-08-30' }),                                    // added, still open
    deal('won-this-week', { stage: 'Closed Won', wonDate: '2026-08-29', arr: 5000 }),    // won, created before
    deal('lost-this-week', { stage: 'Closed Lost', lostDate: '2026-09-01', arr: 3000 }), // lost, created before
    deal('lost-last-month', { stage: 'Closed Lost', lostDate: '2026-07-01' }),           // outside the window
    deal('won-no-date', { stage: 'Closed Won', stageChangedDate: '2026-08-31', arr: 700 }), // wonDate unset: stage-change day
    deal('slipped', { forecastedCloseDate: '2026-08-31' }),                              // open, date passed this week
    deal('slipped-long-ago', { forecastedCloseDate: '2025-01-01' }),                     // open, passed long ago: NOT this week
    deal('created-and-won', { createdDate: '2026-08-28', stage: 'Closed Won', wonDate: '2026-09-01', arr: 200 }),
];

test('REGRESSION: Lost is the deals lost this week, not the literal 0', () => {
    const mv = pipelineMovement(DEALS, { today: TODAY });
    assert.deepEqual(mv.lost.map(o => o.id), ['lost-this-week']);
    assert.equal(mv.lost$, 3000);
});

test('won this week reads wonDate, or the stage-change day when wonDate was never written', () => {
    const mv = pipelineMovement(DEALS, { today: TODAY });
    assert.deepEqual(mv.won.map(o => o.id).sort(), ['created-and-won', 'won-no-date', 'won-this-week']);
    assert.equal(mv.won$, 5900);
});

test('slipped is a deal whose forecast date passed DURING the window, still open', () => {
    const mv = pipelineMovement(DEALS, { today: TODAY });
    assert.deepEqual(mv.slipped.map(o => o.id), ['slipped']);
});

test('start of week = carried + what closed this week (created before it); net = open now − start', () => {
    const mv = pipelineMovement(DEALS, { today: TODAY });
    assert.deepEqual(mv.carried.map(o => o.id).sort(), ['old-open', 'slipped', 'slipped-long-ago']);
    assert.deepEqual(mv.added.map(o => o.id).sort(), ['created-and-won', 'new-open']);
    // start: carried (3 × 1000) + won-this-week 5000 + won-no-date 700 + lost-this-week 3000; created-and-won was not open at the start
    assert.equal(mv.start$, 3000 + 5000 + 700 + 3000);
    assert.equal(mv.openNow$, 4000);
    assert.equal(mv.net$, 4000 - 11700);
    assert.equal(mv.cutoff, '2026-08-26');
});

test('closeDayOf prefers the explicit close day and falls back honestly', () => {
    assert.equal(closeDayOf({ stage: 'Closed Lost', lostDate: '2026-09-01', stageChangedDate: '2026-08-01' }), '2026-09-01');
    assert.equal(closeDayOf({ stage: 'Closed Won', stageChangedDate: '2026-08-01', forecastedCloseDate: '2026-12-31' }), '2026-08-01');
    assert.equal(closeDayOf({ stage: 'Closed Won', forecastedCloseDate: '2026-12-31' }), '2026-12-31');
    assert.equal(closeDayOf({ stage: 'Closed Won' }), '');
});

// ── closed-won by quarter ───────────────────────────────────────────────────

const AT = new Date(2026, 8, 2); // 2 Sep 2026
const WON = [
    { stage: 'Closed Won', arr: 100, wonDate: '2026-06-30' },   // last day of Q2 (Jan start) / Q3 (Oct start)
    { stage: 'Closed Won', arr: 10,  wonDate: '2026-04-01' },
    { stage: 'Closed Won', arr: 1,   wonDate: '2025-02-10' },
    { stage: 'Closed Won', arr: 5000, wonDate: '2026-08-15' },  // the CURRENT quarter under a January start: not completed, excluded
    { stage: 'Closed Lost', arr: 999, lostDate: '2026-06-30' },
];

test('REGRESSION: it is closed-won by quarter, oldest first, six completed quarters — no forecast, no 100%', () => {
    const rows = closedWonByQuarter(WON, 1, { today: AT });
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map(r => r.key), ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2']);
    assert.deepEqual(rows.map(r => r.label), ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25', 'Q1 FY26', 'Q2 FY26']);
    assert.equal(rows.at(-1).actual, 110, 'Q2 FY26: the last-day close AND the first-day close');
    assert.equal(rows.at(-1).count, 2);
    assert.equal(rows[0].actual, 1);
    for (const r of rows) assert.ok(!('fc' in r) && !('att' in r));
});

test('under an October start the same deals land in FY quarters by the house convention', () => {
    const rows = closedWonByQuarter(WON, 10, { today: AT }); // current: Q4 FY2026 (Jul–Sep 2026)
    assert.deepEqual(rows.map(r => r.key), ['2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3']);
    assert.equal(rows.at(-1).actual, 110, 'Apr–Jun 2026 is Q3 FY2026');
});

test('a quarter with nothing closed is a zero row, not a missing one', () => {
    const rows = closedWonByQuarter([], 1, { today: AT });
    assert.equal(rows.length, 6);
    assert.ok(rows.every(r => r.actual === 0 && r.count === 0));
});

// ── the wiring ──────────────────────────────────────────────────────────────

test('ReportsTab: no $175,000, no att: 1.0, no Lost: 0; the helpers are what render', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    assert.match(src, /from '\.\.\/utils\/pipelineReport'/);
    assert.doesNotMatch(src, /175000/);
    assert.doesNotMatch(src, /att: 1\.0/);
    assert.doesNotMatch(src, /fcPath/, 'no forecast line drawn from the actual');
    assert.doesNotMatch(src, /key:'lost',\s+label:'Lost',\s+value:0/);
    assert.match(src, /const quota = teamQuotaFor\(settings\.users, reportTimePeriod,/);
    assert.match(src, /const mv = pipelineMovement\(reportsOpps,/);
    assert.match(src, /const fxHistory = closedWonByQuarter\(reportsOpps, fiscalStart,/);
    assert.match(src, /const getUserQuota = \(u\) => userQuotaFor\(u, reportTimePeriod\);/, 'the Performance leaderboard divides period revenue by period quota');
    assert.doesNotMatch(src, /settings\.quotaData\?\.quarterlyQuota/, 'a field nothing writes');
});
