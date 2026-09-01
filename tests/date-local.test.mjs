// date-local.test.mjs — the local-calendar date contract.
//
// isoLocal is about to have roughly two dozen callers across tasks, pipeline,
// calendar and modals. It replaces `toISOString().split('T')[0]`, which converts
// to UTC before truncating and therefore returns a date the user is not looking
// at: tomorrow's all evening west of Greenwich, yesterday's all morning east of it.
//
// A NOTE ON WHAT A TEST HERE CAN ACTUALLY SEE
// -------------------------------------------
// At UTC, isoLocal and toISOString return identical strings -- they are the same
// function there. So a suite that only asserts on OUTPUT passes just as happily
// with the bug restored, on any UTC machine. Verified: reverting isoLocal to
// toISOString was caught in Chicago and Tokyo and SURVIVED at UTC.
//
// Two things close that hole. A source assertion that this module contains no
// toISOString at all, which holds in every zone. And `inTimezone` below, which
// spawns a child process with TZ set so the suite can exercise a zone other than
// the runner's. The child reports the zone it actually adopted; if the platform
// ignored TZ the test skips with a reason rather than passing vacuously.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isoLocal, todayLocal, parseLocalDate, toLocalDay } from '../src/utils/dateLocal.js';

const MODULE_URL = new URL('../src/utils/dateLocal.js', import.meta.url).href;

// Ask a CHILD process, in a chosen timezone, what isoLocal returns for a fixed
// local wall-clock time. Node fixes its zone at startup, so a child is the only
// way to exercise a zone other than the runner's -- and without it this suite runs
// green on a UTC machine while proving nothing, because at UTC isoLocal and
// toISOString are genuinely the same function.
function inTimezone(tz, localParts) {
    const [y, mo, d, h, mi, s] = localParts;
    const script = `
import { isoLocal } from ${JSON.stringify(MODULE_URL)};
const d = new Date(${y}, ${mo}, ${d}, ${h}, ${mi}, ${s});
console.log(JSON.stringify({
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isoLocal: isoLocal(d),
    toISOString: d.toISOString().split('T')[0],
}));`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
    });
    return JSON.parse(out.trim().split('\n').pop());
}

test('a date is formatted from its LOCAL fields', () => {
    const d = new Date(2026, 7, 18, 14, 30); // 18 Aug 2026, local
    assert.equal(isoLocal(d), '2026-08-18');
});

test('months and days are zero-padded, and the month is 1-based', () => {
    assert.equal(isoLocal(new Date(2026, 0, 5, 12)), '2026-01-05');   // Jan, not 00
    assert.equal(isoLocal(new Date(2026, 11, 31, 12)), '2026-12-31'); // Dec, not 13
    assert.equal(isoLocal(new Date(2026, 8, 9, 12)), '2026-09-09');
});

test('one second past local midnight is still that day', () => {
    // Catches the UTC conversion in every zone AHEAD of UTC: local 00:00 there is
    // the previous afternoon in UTC, so toISOString returns yesterday.
    const d = new Date(2026, 7, 18, 0, 0, 1);
    assert.equal(isoLocal(d), '2026-08-18');
});

test('one second before local midnight is still that day', () => {
    // Catches every zone BEHIND UTC: local 23:59 there is already tomorrow in UTC.
    // This is the case that made todayStr roll over at 7pm Central.
    const d = new Date(2026, 7, 18, 23, 59, 59);
    assert.equal(isoLocal(d), '2026-08-18');
});

test('REGRESSION: a range ending 1ms before local midnight does not spill into the next day', () => {
    // HomeTab built its previous-week window as `new Date(weekStart)` with
    // setMilliseconds(-1) — Saturday 23:59:59.999 local. Under toISOString that
    // landed on Sunday in EVERY zone tested, so "last week" ran
    // [lastSunday .. thisSunday] inclusive, counted today twice, and skewed the
    // week-over-week delta. The two strings must differ.
    const weekStart = new Date(2026, 7, 16, 0, 0, 0, 0); // Sunday, local midnight
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setMilliseconds(-1);

    assert.equal(isoLocal(weekStart), '2026-08-16');
    assert.equal(isoLocal(prevWeekEnd), '2026-08-15');
    assert.notEqual(
        isoLocal(prevWeekEnd),
        isoLocal(weekStart),
        'the previous-week window must not include the current week',
    );
});

test('year boundaries do not roll the year', () => {
    assert.equal(isoLocal(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31');
    assert.equal(isoLocal(new Date(2027, 0, 1, 0, 0, 1)), '2027-01-01');
});

test('a leap day is a real date', () => {
    assert.equal(isoLocal(new Date(2028, 1, 29, 12)), '2028-02-29');
});

test('todayLocal agrees with isoLocal on the current date', () => {
    // Compared against a fresh Date rather than a frozen one: if the two ever
    // disagree, todayLocal has stopped going through isoLocal.
    assert.equal(todayLocal(), isoLocal(new Date()));
    assert.match(todayLocal(), /^\d{4}-\d{2}-\d{2}$/);
});

test('the module contains no toISOString — that is the call it exists to replace', () => {
    // Deterministic in every timezone, unlike the behavioural cases below: at UTC
    // isoLocal and toISOString return identical strings, so no assertion on OUTPUT
    // can tell them apart there. This one reads the source instead, which is why
    // reverting either function to toISOString fails on any machine rather than
    // only on machines that happen to sit off the meridian.
    const src = readFileSync(new URL('../src/utils/dateLocal.js', import.meta.url), 'utf8');
    const code = src
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n');
    assert.ok(
        !code.includes('toISOString'),
        'dateLocal.js must build date strings from local fields, never via UTC',
    );
});

test('a zone BEHIND UTC does not roll into tomorrow late at night', (t) => {
    // Chicago is UTC-5: local 23:59 is already 04:59 the next day in UTC, which is
    // what made todayStr flip to tomorrow every evening.
    const r = inTimezone('America/Chicago', [2026, 7, 18, 23, 59, 59]);
    if (!r.tz.includes('Chicago')) {
        t.skip(`child did not adopt TZ (reported ${r.tz}) — cannot test other zones here`);
        return;
    }
    assert.equal(r.isoLocal, '2026-08-18');
    assert.equal(r.toISOString, '2026-08-19', 'the old behaviour, kept here as the contrast');
});

test('a zone AHEAD of UTC does not fall back to yesterday in the morning', (t) => {
    // Tokyo is UTC+9: local 00:00 is 15:00 the PREVIOUS day in UTC.
    const r = inTimezone('Asia/Tokyo', [2026, 7, 18, 0, 0, 1]);
    if (!r.tz.includes('Tokyo')) {
        t.skip(`child did not adopt TZ (reported ${r.tz}) — cannot test other zones here`);
        return;
    }
    assert.equal(r.isoLocal, '2026-08-18');
    assert.equal(r.toISOString, '2026-08-17', 'the old behaviour, kept here as the contrast');
});

test('the output is always exactly ten characters, so string comparison is safe', () => {
    // Callers compare these with >= and <= against stored date strings. A
    // single-digit month would sort wrongly and the failure would be silent.
    for (const d of [
        new Date(2026, 0, 1, 12),
        new Date(2026, 8, 9, 12),
        new Date(2026, 11, 31, 12),
    ]) {
        assert.equal(isoLocal(d).length, 10);
    }
});

// ── THE READ SIDE (0.60) ─────────────────────────────────────

test('a bare day is read at LOCAL noon, never UTC midnight', () => {
    const d = parseLocalDate('2026-09-01');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 8);
    assert.equal(d.getDate(), 1);
    assert.equal(d.getHours(), 12, 'UTC midnight reads as the previous evening west of Greenwich');
});

test('REGRESSION: a full timestamp is read as-is, not noon-appended into NaN', () => {
    // createdAt arrives as an ISO instant. `+ "T12:00:00"` on it built an Invalid
    // Date and every age rendered "NaNyr" (0.59). The audit counted the shape at
    // ~140 sites; this is the one function that must never repeat it.
    const d = parseLocalDate('2026-08-18T14:30:00.000Z');
    assert.ok(d instanceof Date);
    assert.equal(d.getTime(), Date.UTC(2026, 7, 18, 14, 30));
});

test('parseLocalDate returns null, never an Invalid Date', () => {
    for (const v of [null, undefined, '', '   ', 'not a date', 'NaNyr']) {
        assert.equal(parseLocalDate(v), null, `${JSON.stringify(v)} must be null`);
    }
    assert.equal(parseLocalDate(new Date('garbage')), null);
});

test('a valid Date instance passes through unchanged', () => {
    const d = new Date(2026, 7, 18, 9, 0);
    assert.equal(parseLocalDate(d), d);
});

test('toLocalDay keeps an ISO day and strips a date-time suffix on the FILE\'s day', () => {
    assert.equal(toLocalDay('2026-09-15'), '2026-09-15');
    assert.equal(toLocalDay('2026-9-5'), '2026-09-05');
    assert.equal(toLocalDay('2026-09-15 00:00:00'), '2026-09-15', 'Excel datetime export');
    // Decoded by hand, so the day is the one written, whatever zone the runner is in.
    assert.equal(toLocalDay('2026-09-15T23:30:00Z'), '2026-09-15');
});

test('toLocalDay reads a US numeric date', () => {
    assert.equal(toLocalDay('9/15/2026'), '2026-09-15');
    assert.equal(toLocalDay('09/15/2026'), '2026-09-15');
    assert.equal(toLocalDay('9-15-2026'), '2026-09-15');
    assert.equal(toLocalDay('9/15/2026 0:00'), '2026-09-15', 'Excel m/d/yyyy h:mm');
});

test('REGRESSION: an impossible date is refused, not rolled into the next month', () => {
    // `new Date('2/30/2026')` is March 2nd. A CSV typo must not become a real day.
    assert.equal(toLocalDay('2/30/2026'), null);
    assert.equal(toLocalDay('2026-02-30'), null);
    assert.equal(toLocalDay('13/01/2026'), null, 'd/m/yyyy is not a US date; refused rather than guessed');
});

test('toLocalDay falls back to the engine parser for written-out dates', () => {
    assert.equal(toLocalDay('September 15, 2026'), '2026-09-15');
    assert.equal(toLocalDay('15 Sep 2026'), '2026-09-15');
});

test('toLocalDay refuses what is not a date', () => {
    for (const v of [null, undefined, '', '   ', 'TBD', 'Q3', '46000']) {
        assert.equal(toLocalDay(v), null, `${JSON.stringify(v)} must be null`);
    }
});

// ── THE SWEEP IS PINNED (0.60) ───────────────────────────────
// The isoLocal batch fixed 4 of 29 sites and listed the other 24 in a handoff
// that was later overwritten; the list was lost and the two sites it named as
// worst stayed live for weeks. This scan is the list that cannot be lost: every
// remaining `toISOString().split('T')[0]` / `.slice(0,10)` under src/ must be
// one of the named exceptions -- an instant, not a wall-calendar day.
const UTC_DAY = /toISOString\(\)\s*\.\s*(?:split\('T'\)\[0\]|slice\(0,\s*10\))/;
const ALLOWED_FILES = [
    /[\\/]stageClock\.js$/,   // backdate(): a deliberate UTC round trip on a UTC-parsed day
    /[\\/]dateLocal\.js$/,    // the header quotes the shape it replaces
];
const ALLOWED_LINES = [
    /a\.download\s*=/,                // an export filename: the instant of export is fine
    /exportToCSV\(`[a-z]+-\$\{/,     // same
];
const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
    }
    return out;
};

test('every remaining UTC-truncated day in src/ is a named exception', () => {
    const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
    const offenders = [];
    for (const file of walk(srcDir)) {
        if (ALLOWED_FILES.some(re => re.test(file))) continue;
        readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
            if (UTC_DAY.test(line) && !ALLOWED_LINES.some(re => re.test(line))) {
                offenders.push(`${file.slice(srcDir.length)}:${i + 1}`);
            }
        });
    }
    assert.deepEqual(offenders, [],
        'a wall-calendar day built via UTC -- use isoLocal/todayLocal (dateLocal.js):\n  ' + offenders.join('\n  '));
});

test('the scan still sees the shape it guards (a scan that matches nothing proves nothing)', () => {
    assert.ok(UTC_DAY.test("const today = new Date().toISOString().split('T')[0];"));
    assert.ok(UTC_DAY.test("priorFrom = prior.toISOString().slice(0,10);"));
    assert.ok(UTC_DAY.test("d.toISOString().slice(0, 10)"));
    assert.ok(!UTC_DAY.test("createdAt: new Date().toISOString()"), 'an instant is not the shape');
});
