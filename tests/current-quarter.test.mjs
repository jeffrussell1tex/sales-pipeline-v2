// tests/current-quarter.test.mjs
//
// The Sales Manager tab's header built a CALENDAR quarter from now.getMonth()
// and never read the org's fiscal start, so with an October fiscal year it read
// "Q3 2026 · 4 weeks remaining" on the day Home read "Q4 · Week 10" and every
// report said Q4 FY26 (state §0.80). currentQuarter() in quarters.js is the one
// helper it reads now. Every case runs under TWO fiscal starts (18b18): January,
// where fiscal year == calendar year, and October, where Oct 2025 – Sep 2026 is
// FY2026 — UKG's year, which ends 30 Sep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { currentQuarter, quarterOf } from '../src/utils/quarters.js';
import { isoLocal } from '../src/utils/dateLocal.js';

const JAN = 1, OCT = 10, FEB = 2;
const at = (y, m, d, h = 10, mi = 30) => new Date(y, m - 1, d, h, mi); // local

// ── the regression ───────────────────────────────────────────────────────────

test('REGRESSION: 3 Sep 2026 is Q4 FY2026 under an October start — not the calendar Q3 the header showed', () => {
    const q = currentQuarter(OCT, at(2026, 9, 3));
    assert.equal(q.q, 4);
    assert.equal(q.fiscalYear, 2026);
    assert.equal(q.label, 'Q4 FY2026');
    assert.notEqual(q.q, Math.floor(8 / 3) + 1, 'the calendar arithmetic the tab used to run');
});

test('3 Sep 2026 under a January start is Q3 FY2026 — the two starts share the bounds here, not the name', () => {
    const jan = currentQuarter(JAN, at(2026, 9, 3));
    const oct = currentQuarter(OCT, at(2026, 9, 3));
    assert.equal(jan.label, 'Q3 FY2026');
    assert.deepEqual([jan.from, jan.to], ['2026-07-01', '2026-09-30']);
    assert.deepEqual([oct.from, oct.to], ['2026-07-01', '2026-09-30']);
    assert.equal(jan.weeksLeft, 4);
    assert.equal(oct.weeksLeft, 4);
});

test('15 Oct 2026 opens FY2027 under October and is Q4 FY2026 under January', () => {
    const jan = currentQuarter(JAN, at(2026, 10, 15));
    const oct = currentQuarter(OCT, at(2026, 10, 15));
    assert.equal(jan.label, 'Q4 FY2026');
    assert.equal(oct.label, 'Q1 FY2027');
    assert.deepEqual([jan.from, jan.to], ['2026-10-01', '2026-12-31']);
    assert.deepEqual([oct.from, oct.to], ['2026-10-01', '2026-12-31']);
});

test('a quarter that straddles the calendar year ends in the next one (February start, 15 Nov)', () => {
    const q = currentQuarter(FEB, at(2026, 11, 15));
    assert.equal(q.label, 'Q4 FY2027');
    assert.deepEqual([q.from, q.to], ['2026-11-01', '2027-01-31']);
    assert.equal(q.daysLeft, 78, '15 Nov through 31 Jan, today included');
    assert.equal(q.weeksLeft, 12);
});

test('the quarter agrees with quarterOf for the same day, under both starts', () => {
    for (const fs of [JAN, OCT]) {
        for (const d of [at(2026, 9, 3), at(2026, 10, 15), at(2026, 1, 2), at(2026, 12, 31)]) {
            const q = currentQuarter(fs, d);
            assert.equal(q.key, quarterOf(isoLocal(d), fs).key, `${fs}/${isoLocal(d)}`);
            assert.ok(q.from <= isoLocal(d) && isoLocal(d) <= q.to, `today lies inside its own quarter ${fs}/${isoLocal(d)}`);
        }
    }
});

// ── weeks remaining ──────────────────────────────────────────────────────────

test('weeks remaining count today and never reach 0 — the Gap-to-Quota tile divides by them', () => {
    for (const fs of [JAN, OCT]) {
        const last = currentQuarter(fs, at(2026, 9, 30));
        assert.equal(last.daysLeft, 1, `last day, start ${fs}`);
        assert.equal(last.weeksLeft, 1, `last day, start ${fs}`);
        assert.equal(currentQuarter(fs, at(2026, 9, 24)).weeksLeft, 1, '7 days incl. today is one week');
        assert.equal(currentQuarter(fs, at(2026, 9, 23)).weeksLeft, 2, '8 days incl. today is two');
    }
    assert.equal(currentQuarter(JAN, at(2026, 7, 1)).daysLeft, 92);
    assert.equal(currentQuarter(JAN, at(2026, 7, 1)).weeksLeft, 14);
});

test('the hour of the day does not move the count (18b18: clock)', () => {
    for (const fs of [JAN, OCT]) {
        const early = currentQuarter(fs, at(2026, 9, 30, 0, 1));
        const late  = currentQuarter(fs, at(2026, 9, 30, 23, 59));
        assert.equal(early.daysLeft, 1);
        assert.equal(late.daysLeft, 1, 'past midnight-of-the-end-date on the clock, still the last day on the calendar');
        assert.equal(currentQuarter(fs, at(2026, 9, 3, 0, 1)).weeksLeft, currentQuarter(fs, at(2026, 9, 3, 23, 59)).weeksLeft);
    }
});

// Node fixes its zone at startup, so a child is the only way to run in another
// zone (the date-local suite's pattern). The child reports the zone it adopted;
// if the platform ignored TZ the test skips rather than passing vacuously.
const MODULE_URL = new URL('../src/utils/quarters.js', import.meta.url).href;
function inTimezone(tz, fiscalStart, [y, mo, d, h, mi]) {
    const script = `
import { currentQuarter } from ${JSON.stringify(MODULE_URL)};
const q = currentQuarter(${fiscalStart}, new Date(${y}, ${mo - 1}, ${d}, ${h}, ${mi}));
console.log(JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, label: q.label, to: q.to, daysLeft: q.daysLeft, weeksLeft: q.weeksLeft }));`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    return JSON.parse(out.trim().split('\n').pop());
}

for (const [tz, marker] of [['America/Chicago', 'Chicago'], ['Asia/Tokyo', 'Tokyo']]) {
    test(`the last evening of the quarter is still the last day in ${tz} (18b18: timezone)`, (t) => {
        const r = inTimezone(tz, OCT, [2026, 9, 30, 23, 59]);
        if (!r.tz.includes(marker)) { t.skip(`child did not adopt TZ (reported ${r.tz})`); return; }
        assert.equal(r.label, 'Q4 FY2026');
        assert.equal(r.to, '2026-09-30');
        assert.equal(r.daysLeft, 1);
        assert.equal(r.weeksLeft, 1);
    });
}

// ── the tab reads the helper ─────────────────────────────────────────────────

const smt = readFileSync(new URL('../src/Tabs/SalesManagerTab.jsx', import.meta.url), 'utf8');

test('SalesManagerTab takes its quarter from quarters.js with the org fiscal start, not the calendar', () => {
    assert.match(smt, /import \{ currentQuarter \} from '\.\.\/utils\/quarters';/);
    assert.match(smt, /const fiscalStart = parseInt\(settings\?\.fiscalYearStart\) \|\| 10;/, 'the App.jsx / HomeTab / ReportsTab default');
    assert.match(smt, /const curQ\s+= currentQuarter\(fiscalStart\);/);
    assert.match(smt, /const weeksLeft = curQ\.weeksLeft;/);
    assert.match(smt, /const qLabel\s+= curQ\.label;/);
    assert.match(smt, /Team forecast · \{qLabel\} · \{weeksLeft\} weeks remaining/);
    assert.doesNotMatch(smt, /getMonth\(\)\s*\/\s*3/, 'calendar-quarter arithmetic');
    assert.doesNotMatch(smt, /qNum\s*\*\s*3/, 'a calendar quarter end');
});

// ── the totals are on the same quarter as the header (Jeff, 3 Sep) ──────────

test('Closed and Quota are quarter-to-date: won by close day inside the quarter, against that quarter\'s figure', () => {
    assert.match(smt, /import \{ userQuotaFor, closeDayInRange \} from '\.\.\/utils\/pipelineReport';/);
    assert.match(smt, /function buildRepStats\(rep, opportunities, activities, tasks, period\)/, 'the stats take the quarter');
    assert.match(smt, /const wonInQ\s+= wonOpps\.filter\(o => closeDayInRange\(o, period\.from, period\.to\)\);/);
    assert.match(smt, /const closedArr\s+= wonInQ\.reduce/, 'closed sums the in-quarter wins, not every win ever');
    assert.match(smt, /const quota\s+= userQuotaFor\(rep, `Q\$\{period\.q\}`\);/, "this quarter's quota, not the annual figure");
    assert.doesNotMatch(smt, /rep\.annualQuota \|\| 0/, 'the old annual-or-summed-quarterlies block');
    assert.match(smt, /buildRepStats\(rep, opportunities, activities, tasks, curQ\)/, 'the memo hands the current quarter in');
    assert.match(smt, /\[visibleReps, opportunities, activities, tasks, curQ\.key\]/, 'and re-runs when the quarter turns');
    // The quarter is computed before the memo that consumes it (a TDZ otherwise).
    assert.ok(smt.indexOf('const curQ      = currentQuarter(fiscalStart);') < smt.indexOf('const repStats = useMemo('), 'curQ is declared above repStats');
});

test('the Administration board keeps the annual quota and measures fiscal-year-to-date against it', () => {
    assert.match(smt, /import \{ fiscalRange \} from '\.\.\/utils\/reportPeriod';/);
    assert.match(smt, /const fyRange\s+= fiscalRange\(curQ\.fiscalYear, 'FY', fiscalStart\);/);
    assert.match(smt, /fyRange=\{fyRange\}/, 'passed to AdminTab');
    const bars = smt.match(/closeDayInRange\(o, fyRange\.from, fyRange\.to\)/g) || [];
    assert.equal(bars.length, 2, 'both the territory rows and the unassigned rows');
    assert.match(smt, /<div>FY attainment<\/div>/, 'the column says which year it measures');
    assert.doesNotMatch(smt, /o\.stage==='Closed Won'&&\(o\.salesRep===u\.name\|\|o\.assignedTo===u\.name\)\)\.reduce/, 'an all-time won sum on the board');
});

test('the header\'s three inert buttons are gone and no other control took their place', () => {
    assert.doesNotMatch(smt, />This quarter</);
    assert.doesNotMatch(smt, />All reps</);
    assert.doesNotMatch(smt, />Export</);
    assert.match(smt, /weeks remaining<\/div>\s*<\/div>\s*<\/div>\s*<SubTabs \/>/, 'the header closes straight after the subtitle');
});
