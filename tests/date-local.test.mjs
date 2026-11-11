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
import { isoLocal, todayLocal, parseLocalDate, toLocalDay, calendarDays, daysSince } from '../src/utils/dateLocal.js';

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

test('REGRESSION: a cell with no year is refused, not filled in as 2001', () => {
    // The engine parser answers "Sept 15" with 2001-09-15 -- a real-looking day
    // that is wrong by a quarter century. Found while making the importer refuse
    // unreadable cells (0.64): these would have sailed past the refusal.
    for (const v of ['Sept 15', 'Sep 15', 'Oct 1', '9/15', 'September 15']) {
        assert.equal(toLocalDay(v), null, `${JSON.stringify(v)} carries no year`);
    }
});

test('a written-out date with a four-digit year still reads', () => {
    assert.equal(toLocalDay('Sept 15, 2026'), '2026-09-15');
    assert.equal(toLocalDay('15-Sep-2026'), '2026-09-15');
    assert.equal(toLocalDay('2026/09/15'), '2026-09-15');
});

test('a two-digit US year is this century, decoded by hand', () => {
    // Excel's default short date is m/d/yy. The engine read it as 2026 too, but
    // the engine is now behind a four-digit-year gate, so the shape is decoded
    // explicitly and pinned.
    assert.equal(toLocalDay('9/15/26'), '2026-09-15');
    assert.equal(toLocalDay('09/15/26 0:00'), '2026-09-15');
    assert.equal(toLocalDay('2/30/26'), null, 'impossible day is still impossible');
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
// The five export file names (Accounts, Contacts, Audit, Users, Pipelines) were named here as exceptions until
// state §0.242 (Q6 — Jeff, 10 Nov: "Your local day"): each is now named by the member's day (todayLocal), so no
// line is excepted. A new one is a wall-calendar day like any other.
const ALLOWED_LINES = [];
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

test('the five export file names are the member\'s day (state §0.242, Q6)', () => {
    const at = (file) => readFileSync(fileURLToPath(new URL('../' + file, import.meta.url)), 'utf8');
    assert.ok(at('src/Tabs/AccountsTab.jsx').includes('exportToCSV(`accounts-${todayLocal()}.csv`'));
    assert.ok(at('src/Tabs/ContactsTab.jsx').includes('exportToCSV(`contacts-${todayLocal()}.csv`'));
    assert.ok(at('src/Tabs/settings/audit/AuditDetail.jsx').includes('a.download = `accelerep-audit-${todayLocal()}.${ext}`;'));
    assert.ok(at('src/Tabs/settings/people/UsersDetail.jsx').includes('a.download = `accelerep-users-${todayLocal()}.${format.toLowerCase()}`;'));
    assert.ok(at('src/Tabs/settings/salesProcess/PipelinesDetail.jsx').includes('a.download = `accelerep-pipelines-${todayLocal()}.json`;'));
});

// ── A DAY SHOWN FOR AN INSTANT IS THE MEMBER'S DAY (§0.242) ──
// Guide §18b125 rule 4. Three shapes the UTC_DAY scan above cannot see, each of which
// printed a day one out west of Greenwich every evening (or all day):
//   INSTANT_SLICE -- the first ten (or the 5th-10th) characters of an instant's string,
//     `createdAt.slice(0,10)`, `(q.updatedAt || q.createdAt || '').slice(5, 10)`,
//     `String(d.at || '').slice(0, 10)`, `dateTime.split('T')[0]`: the UTC day. Read it
//     with dayOf (reportPeriod.js), which takes an instant on the local clock.
//   DAY_AS_UTC -- a stored day handed whole to `new Date(...)` and printed with toLocale*:
//     UTC midnight, the evening before west of Greenwich, so every row read the day
//     before. Read it with parseLocalDate (local noon).
//   UTC_ZONE -- `timeZone: 'UTC'` inside a toLocale* call: a member's clock is never UTC.
// Not scanned (fixed by hand, 0.242): a noon appended to a value that may be an instant
// (`x + 'T12:00:00'` where x is createdDate || createdAt) -- not reliably one shape.
// The chain before the slice may be `||` or `??` (the review: `(a.createdAt ?? '').slice(0, 10)` slipped past), and an
// instant spliced into a template string and sliced is the same thing (TEMPLATE_SLICE).
const INSTANT_SLICE = /\.(?:[A-Za-z_$][\w$]*At|at|timestamp|dateTime)\b(?:\s*(?:\|\||\?\?)\s*[^)|?]*?)*(\)?)\s*\??\.\s*(?:slice\(\s*[05]\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/g;
const TEMPLATE_SLICE = /`\$\{[^}`]*\.(?:[A-Za-z_$][\w$]*At|at|timestamp|dateTime)\b[^}`]*\}`\s*\??\.\s*(?:slice\(\s*[05]\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/;
// A word before a group that is no call: the group's own value is sliced (the review: `return (q.updatedAt || '')
// .slice(0, 10)` passed as though `return` were a function giving a day).
const NOT_A_CALL = new Set(['return', 'await', 'typeof', 'void', 'case', 'in', 'of', 'new', 'delete', 'throw', 'yield', 'else', 'do', 'instanceof']);
const DAY_AS_UTC = /new Date\(\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.(?:date|[a-z][\w$]*Date)\s*\)\s*\??\.\s*toLocale\w*\(/;
const UTC_ZONE = /toLocale\w*\([^)]*timeZone\s*:\s*['"]UTC['"]/;

// An instant sliced -- unless the slice reads a call's answer that is already a day
// (`dayOf(q.updatedAt || q.createdAt).slice(5, 10)`): a group closed before the slice counts
// when nothing opens it, or String(...) does (the instant as text still).
function isInstantSlice(line) {
    if (TEMPLATE_SLICE.test(line)) return true;
    for (const m of line.matchAll(INSTANT_SLICE)) {
        if (!m[1]) return true;
        let i = m.index + m[0].indexOf(')') - 1, depth = 0;
        for (; i >= 0; i--) {
            if (line[i] === ')') depth++;
            else if (line[i] === '(') { if (depth === 0) break; depth--; }
        }
        const opener = /([A-Za-z_$][\w$]*)\s*$/.exec(line.slice(0, Math.max(0, i)));
        if (!opener || opener[1] === 'String' || NOT_A_CALL.has(opener[1])) return true;
    }
    return false;
}
const isDayAsUtc = (line) => DAY_AS_UTC.test(line);
const isUtcZone = (line) => UTC_ZONE.test(line);

// The seven calendar sites read an Outlook or Google event's start the same way: `dateTime`
// as the provider sends it -- Graph's default is UTC with no Prefer header and no isAllDay
// read, so the day it names awaits a live check of an Outlook connection (the Outlook
// question, OPEN_ITEMS). Named, with their count, until that is answered.
const OUTLOOK = 'the Outlook question, OPEN_ITEMS';
const INSTANT_SLICE_EXCEPTIONS = [
    { file: /[\\/]App\.jsx$/, line: /const eventDate = ev\.start\?\.date \|\| \(ev\.start\?\.dateTime \? ev\.start\.dateTime\.split\('T'\)\[0\] : /, count: 1, why: OUTLOOK },
    { file: /[\\/]MeetingPrepPanel\.jsx$/, line: /const evDate = ev\.start\?\.date \|\| \(ev\.start\?\.dateTime \? ev\.start\.dateTime\.split\('T'\)\[0\] : ''\);/, count: 1, why: OUTLOOK },
    { file: /[\\/]HomeTab\.jsx$/, line: /^\s*const d = ev\.start\?\.date \|\| ev\.start\?\.dateTime\?\.split\('T'\)\[0\];$/, count: 3, why: OUTLOOK },
    { file: /[\\/]TasksTab\.jsx$/, line: /const d = ev\.start\?\.date \|\| ev\.start\?\.dateTime\?\.split\('T'\)\[0\]; return d === calDayStr;/, count: 1, why: OUTLOOK },
    { file: /[\\/]TasksTab\.jsx$/, line: /const evd = ev\.start\?\.date \|\| ev\.start\?\.dateTime\?\.split\('T'\)\[0\]; return evd === ds;/, count: 1, why: OUTLOOK },
];

test('a day shown for an instant in src/ is the member\'s day: the three scans, each exception named', () => {
    const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
    const offenders = [];
    const used = new Map();
    for (const file of walk(srcDir)) {
        readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
            if (line.trim().startsWith('//')) return;
            const where = `${file.slice(srcDir.length)}:${i + 1}`;
            if (isInstantSlice(line)) {
                const x = INSTANT_SLICE_EXCEPTIONS.find(x => x.file.test(file) && x.line.test(line));
                if (x) used.set(x, (used.get(x) || 0) + 1);
                else offenders.push(`${where} (an instant sliced to its UTC day -- dayOf)`);
            }
            if (isDayAsUtc(line)) offenders.push(`${where} (a stored day read as UTC midnight -- parseLocalDate)`);
            if (isUtcZone(line)) offenders.push(`${where} (timeZone 'UTC' on a member's screen)`);
        });
    }
    assert.deepEqual(offenders, [], 'a day shown for an instant, or a stored day read as UTC:\n  ' + offenders.join('\n  '));
    // Each exception names exactly the lines it was named for -- one gone is dropped, one more is a new site.
    for (const x of INSTANT_SLICE_EXCEPTIONS) assert.equal(used.get(x) || 0, x.count, `${x.file} ${x.line}: ${x.count} line(s), ${x.why}`);
});

test('the three scans still see the shapes they guard (a scan that matches nothing proves nothing)', () => {
    // Each label site the 0.242 batch replaced, as it stood.
    assert.ok(isInstantSlice("<div style={{ fontSize: 9.5 }}>{(q.updatedAt || q.createdAt || '').slice(5, 10)}</div>"), 'QuotesTab version timeline');
    assert.ok(isInstantSlice("{d.by || '—'} · {String(d.at || '').slice(0, 10) || '—'}</div>"), 'QuotesTab approvals');
    assert.ok(isInstantSlice("{selectedAccount.createdAt && <> &nbsp;·&nbsp; Customer since {selectedAccount.createdAt.slice(0,10)}</>}"), 'ReportsTab account');
    assert.ok(isInstantSlice("First touch {selectedContact.createdAt.slice(0,10)}</>}"), 'ReportsTab contact');
    assert.ok(isInstantSlice("const day = it.when.split('T')[0]; const at = row.timestamp.substring(0, 10);"), 'substring on a timestamp');
    assert.ok(isInstantSlice("const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];"), 'a calendar dateTime');
    // The review's misses (10 Nov): a keyword before the group, `??`, a template string.
    assert.ok(isInstantSlice("    return (q.updatedAt || q.createdAt || '').slice(0, 10);"), 'REGRESSION: a keyword read as a call');
    assert.ok(isInstantSlice("x = await (a.createdAt || '').slice(0,10)"), 'await is no call');
    assert.ok(isInstantSlice("{(a.createdAt ?? '').slice(0, 10)}"), 'REGRESSION: ?? let through');
    assert.ok(isInstantSlice("String(d.at ?? '').slice(0, 10)"), '?? inside String');
    assert.ok(isInstantSlice("{`${a.createdAt}`.slice(0, 10)}"), 'REGRESSION: a template string let through');
    assert.ok(isDayAsUtc("const date = e.date ? new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';"), 'ReportsTab history PDF');
    assert.ok(isDayAsUtc("{new Date(job.scheduledDate).toLocaleDateString('en-US', { month: 'short' })}"), 'a scheduled day');
    assert.ok(isUtcZone("return 'yesterday, ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'UTC' });"), 'BackupDetail');
    assert.ok(isUtcZone("x.toLocaleDateString('en-US', { timeZone: \"UTC\" })"));
    // What they must not take: a day read through dayOf or parseLocalDate, a stored day sliced, an
    // instant printed whole, a day read at noon, a zone other than UTC.
    assert.ok(!isInstantSlice("{dayOf(q.updatedAt || q.createdAt).slice(5, 10)}"), 'dayOf answers a day');
    assert.ok(!isInstantSlice("{dayOf(d.at) || '—'}"));
    assert.ok(!isInstantSlice("const close = (o.forecastedCloseDate || '').slice(0, 10);"), 'a stored day is not an instant');
    assert.ok(!isInstantSlice("createdAt: new Date().toISOString(),"));
    assert.ok(!isInstantSlice("const fmt = row.format.slice(0, 10);"), 'a word ending "at" is not the member');
    assert.ok(!isDayAsUtc("parseLocalDate(e.date)?.toLocaleDateString('en-US',{month:'short'}) || '—'"));
    assert.ok(!isDayAsUtc("new Date(t.dueDate + 'T12:00:00').toLocaleDateString()"), 'a day at noon');
    assert.ok(!isDayAsUtc("new Date(q.createdAt).toLocaleDateString()"), 'an instant printed on the local clock');
    assert.ok(!isDayAsUtc("new Date(a.date) > new Date(latest.date)"), 'two days compared alike is no label');
    assert.ok(!isUtcZone("d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })"));
    assert.ok(!isUtcZone("d.toLocaleString('en-US', { timeZone: tz })"));
});

test('the 0.242 label sites read the member\'s day, each keeping its look (Q5)', () => {
    const at = (file) => readFileSync(fileURLToPath(new URL('../' + file, import.meta.url)), 'utf8');
    const quotes = at('src/Tabs/QuotesTab.jsx');
    assert.ok(quotes.includes("import { dayOf } from '../utils/reportPeriod';"));
    assert.ok(quotes.includes("{dayOf(q.updatedAt || q.createdAt).slice(5, 10)}</div>"), 'the version timeline: mm-dd');
    assert.ok(quotes.includes("{d.by || '—'} · {dayOf(d.at) || '—'}</div>"), 'the approvals: yyyy-mm-dd');
    const reports = at('src/Tabs/ReportsTab.jsx');
    assert.ok(reports.includes('Customer since {dayOf(selectedAccount.createdAt)}</>'));
    assert.ok(reports.includes('First touch {dayOf(selectedContact.createdAt)}</>'));
    assert.ok(reports.includes("const date = parseLocalDate(e.date)?.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) || '—';"), 'the history PDF');
    // Unguarded by the scans (a noon appended to a createdAt instant read "Invalid Date"): pinned here.
    assert.ok(reports.includes("const openedLabel = parseLocalDate(openedRaw)?.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) || null;"), 'the deal\'s opened day');
    assert.ok(!reports.includes("new Date(openedRaw+'T12:00:00')"), 'REGRESSION: noon appended to an instant');
    assert.ok(!/\bbyRep3\b|\brepActRows3\b/.test(reports), 'the dead rep summary is gone');
    assert.ok(!/\bgroupByDay\b/.test(at('src/Tabs/TasksTab.jsx')), 'the dead groupByDay is gone');
    const dispatch = at('src/Tabs/DispatchTab.jsx');
    assert.ok(dispatch.includes('const d = fromYmd(j.scheduledDate);'), '"hours this week" reads the job\'s day at local midnight');
    assert.ok(!dispatch.includes('new Date(j.scheduledDate)'), 'REGRESSION: a scheduled day read as UTC midnight');
});

test('America/Chicago: dayOf reads an evening instant as that evening\'s day; the UTC slice read tomorrow', (t) => {
    const script = `
import { dayOf } from ${JSON.stringify(new URL('../src/utils/reportPeriod.js', import.meta.url).href)};
import { parseLocalDate } from ${JSON.stringify(MODULE_URL)};
const evening = '2026-11-11T02:30:00.000Z';            // 20:30 on 10 Nov in Chicago
console.log(JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, out: {
    day: dayOf(evening), slice: evening.slice(0, 10), md: dayOf(evening).slice(5, 10),
    stored: parseLocalDate('2026-11-10').getDate(), utcMidnight: new Date('2026-11-10').getDate(),
} }));`;
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/Chicago' }, encoding: 'utf8' }).trim().split('\n').pop());
    if (!r.tz.includes('Chicago')) { t.skip(`child did not adopt TZ (reported ${r.tz})`); return; }
    assert.equal(r.out.day, '2026-11-10', 'the member\'s day');
    assert.equal(r.out.slice, '2026-11-11', 'the old slice: tomorrow -- the contrast');
    assert.equal(r.out.md, '11-10');
    assert.equal(r.out.stored, 10, 'a stored day at local noon is that day');
    assert.equal(r.out.utcMidnight, 9, 'new Date(day) is the evening before -- the contrast');
});

// ── COUNTING DAYS (0.240) ────────────────────────────────────
// Every day count a member sees was `Math.floor((now - new Date(day + 'T12:00:00')) /
// 86400000)`: measured from the day's NOON, so before noon a deal moved today read -1
// ("-1d ago") and every count ran one low all morning. calendarDays/daysSince count
// wall-calendar days. The cases below run in a child process per zone (Node fixes its
// zone at startup), with the "now" built from the child's own local wall clock, so the
// morning case is the same morning in every zone.

function countsIn(tz, exprs) {
    const script = `
import { calendarDays, daysSince, parseLocalDate, timelineBucket } from ${JSON.stringify(MODULE_URL)};
const out = {};
${Object.entries(exprs).map(([k, e]) => `out[${JSON.stringify(k)}] = (${e});`).join('\n')}
console.log(JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, out }));`;
    const res = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
    });
    return JSON.parse(res.trim().split('\n').pop());
}

// The same morning and afternoon, on each child's own wall clock: 10 Nov 2026.
const AT_9 = 'new Date(2026, 10, 10, 9, 0)';
const AT_15 = 'new Date(2026, 10, 10, 15, 0)';
const OLD = (day, now) => `Math.floor((${now} - new Date('${day}' + 'T12:00:00')) / 86400000)`;

for (const [tz, marker] of [['America/Chicago', 'Chicago'], ['Asia/Tokyo', 'Tokyo'], ['UTC', 'UTC']]) {
    test(`${tz}: today is 0 and yesterday is 1, morning and afternoon`, (t) => {
        const r = countsIn(tz, {
            today9: `daysSince('2026-11-10', ${AT_9})`,
            today15: `daysSince('2026-11-10', ${AT_15})`,
            yest9: `daysSince('2026-11-09', ${AT_9})`,
            yest15: `daysSince('2026-11-09', ${AT_15})`,
            week9: `daysSince('2026-11-03', ${AT_9})`,
            oldToday9: OLD('2026-11-10', AT_9),
            oldYest9: OLD('2026-11-09', AT_9),
        });
        if (!r.tz.includes(marker)) {
            t.skip(`child did not adopt TZ (reported ${r.tz}) — cannot test other zones here`);
            return;
        }
        assert.equal(r.out.today9, 0, 'a day read at 09:00 on the day itself is today');
        assert.equal(r.out.today15, 0);
        assert.equal(r.out.yest9, 1, 'yesterday at 09:00 is one day, not zero');
        assert.equal(r.out.yest15, 1);
        assert.equal(r.out.week9, 7);
        // The old shape, kept as the contrast: -1 and 0 before noon.
        assert.equal(r.out.oldToday9, -1, 'the old count read -1 before noon');
        assert.equal(r.out.oldYest9, 0, 'the old count read yesterday as 0 before noon');
    });

    test(`${tz}: an instant counts as the LOCAL day it falls on`, (t) => {
        const r = countsIn(tz, {
            // 03:00 UTC on 10 Nov: 21:00 on the 9th in Chicago, noon on the 10th in Tokyo.
            utc3am: `daysSince('2026-11-10T03:00:00Z', ${AT_15})`,
            date: `daysSince(new Date(2026, 10, 9, 23, 59), ${AT_9})`,
            epoch: `daysSince(new Date(2026, 10, 8, 1, 0).getTime(), ${AT_9})`,
            nowSide: `calendarDays(${AT_9}, '2026-11-12')`,
        });
        if (!r.tz.includes(marker)) {
            t.skip(`child did not adopt TZ (reported ${r.tz}) — cannot test other zones here`);
            return;
        }
        assert.equal(r.out.utc3am, tz === 'America/Chicago' ? 1 : 0);
        assert.equal(r.out.date, 1, 'a Date is its local calendar day, however late in it');
        assert.equal(r.out.epoch, 2, 'an epoch number is an instant too');
        assert.equal(r.out.nowSide, 2, 'the countdown from an instant to a bare day');
    });
}

test('America/Chicago: a clock change never moves the count', (t) => {
    const r = countsIn('America/Chicago', {
        // 8 Mar 2026 is spring-forward in the US (a 23-hour day), 1 Nov 2026 fall-back.
        spring: `calendarDays('2026-03-07', '2026-03-09')`,
        fall: `calendarDays('2026-10-31', '2026-11-02')`,
        springInstants: `calendarDays(new Date(2026, 2, 8, 0, 30), new Date(2026, 2, 9, 0, 30))`,
        weekAcross: `calendarDays(parseLocalDate('2026-03-05'), parseLocalDate('2026-03-12'))`,
        oldWeekAcross: `Math.floor((parseLocalDate('2026-03-12') - parseLocalDate('2026-03-05')) / 86400000)`,
    });
    if (!r.tz.includes('Chicago')) {
        t.skip(`child did not adopt TZ (reported ${r.tz}) — cannot test other zones here`);
        return;
    }
    assert.equal(r.out.spring, 2);
    assert.equal(r.out.fall, 2);
    assert.equal(r.out.springInstants, 1, '23 hours apart, one calendar day');
    assert.equal(r.out.weekAcross, 7, 'a week across spring-forward is 7 days');
    assert.equal(r.out.oldWeekAcross, 6, 'the old floor read it 6 -- the contrast (ReportsTab stage average)');
});

test('calendarDays is signed; daysSince never reads below 0', () => {
    assert.equal(calendarDays('2026-11-10', '2026-11-11'), 1, 'tomorrow');
    assert.equal(calendarDays('2026-11-11', '2026-11-10'), -1, 'a day after "to" is negative');
    assert.equal(calendarDays('2026-11-10', '2026-11-10'), 0);
    assert.equal(daysSince('2026-11-11', '2026-11-10'), 0, 'a future day reads as today');
    assert.equal(daysSince('2026-11-01', '2026-11-10'), 9);
    assert.equal(calendarDays('2026-12-31', '2027-01-01'), 1, 'across a year');
    assert.equal(calendarDays('2028-02-28', '2028-03-01'), 2, 'across a leap day');
    assert.equal(calendarDays('2026-02-28', '2026-03-01'), 1);
});

test('daysSince counts to today by default', () => {
    assert.equal(daysSince(todayLocal()), 0);
    assert.equal(daysSince(new Date()), 0);
    const y = new Date(); y.setDate(y.getDate() - 1);
    assert.equal(daysSince(isoLocal(y)), 1);
});

test('an unreadable side is null, never NaN', () => {
    for (const v of [null, undefined, '', '   ', 'TBD', 'NaNyr', '2026-02-30', '2026-13-01', new Date('garbage'), NaN]) {
        assert.equal(calendarDays(v, '2026-11-10'), null, `${String(v)} as from`);
        assert.equal(calendarDays('2026-11-10', v), null, `${String(v)} as to`);
    }
    assert.equal(daysSince(null), null);
    assert.equal(daysSince('not a date'), null);
    assert.equal(daysSince('2026-11-09', 'garbage'), null);
});

// ── THE COUNT IS PINNED (0.240) ──────────────────────────────
// No line under src/ counts days by flooring (or ceiling) a span of 86400000 ms that
// reaches a day read at noon (`+ 'T12:00:00'`, parseLocalDate) or a value handed whole to
// `new Date(...)` on that line or the one before it -- the shapes that read -1 before noon, or a day out
// west of Greenwich. A day count a member sees goes through daysSince/calendarDays. An
// instant's age in 24-hour spans is a different thing and is named here with its reason.
const FLOORED = /Math\.(?:floor|ceil|trunc)\(/;
// Rounding a span from NOW to a day read at noon is the same shape a second way (the 0.240
// review's gap 2): right all day except within an hour of midnight after a clock change, and
// on a Kanban card it could disagree with the daysSince beside it. Rounding a span between two
// stored days is exact (historyFeed, reportQuery, planVisits ...) and is not the shape, so a
// rounded line counts only when it reads the clock: Date.now(), new Date(), now or today.
const ROUNDED = /Math\.round\(/;
const NOW_SIDE = /Date\.now\(\)|new Date\(\s*\)|\b(?:now|today)\b/;
const DAY_SPAN = /86400000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24/;
const DAY_READ = /T12:00:00|parseLocalDate\(|new Date\(\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\s*\)/;
const isCountShape = (prev, line) => DAY_SPAN.test(line) && DAY_READ.test(prev + '\n' + line)
    && (FLOORED.test(line) || (ROUNDED.test(line) && NOW_SIDE.test(line)));
const COUNT_EXCEPTIONS = [
    // A lead's updatedAt is an instant (the row's last write); "not updated in 7+ days" is 7 x 24 h.
    { file: /[\\/]ReportsTab\.jsx$/, line: /new Date\(l\.updatedAt\)/ },
    // A team note's timestamp is an instant; "Nd ago" follows "Nh ago" in the same ladder of 24-hour spans.
    { file: /[\\/]OpportunityModal\.jsx$/, line: /diffDays = Math\.floor\(diffMs \/ 86400000\)/ },
    // An API key's createdAt / lastUsedAt is an instant; "today" there is "within 24 hours". Outside
    // the 0.240 batch's sites (Settings -> API keys), named here so the round scan can stand.
    { file: /[\\/]ApiKeysDetail\.jsx$/, line: /diffD = Math\.round\(\(Date\.now\(\) - d\) \/ 86400000\)/ },
];

test('every floored day count in src/ is a calendar count or a named instant age', () => {
    const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
    const offenders = [];
    const used = new Set();
    for (const file of walk(srcDir)) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            if (line.trim().startsWith('//')) return;
            const prev = i > 0 && !lines[i - 1].trim().startsWith('//') ? lines[i - 1] : '';
            if (!isCountShape(prev, line)) return;
            const x = COUNT_EXCEPTIONS.find(x => x.file.test(file) && x.line.test(line));
            if (x) { used.add(x); return; }
            offenders.push(`${file.slice(srcDir.length)}:${i + 1}`);
        });
    }
    assert.deepEqual(offenders, [],
        'a day count measured from a day\'s noon (or UTC midnight) -- use daysSince/calendarDays (dateLocal.js):\n  ' + offenders.join('\n  '));
    // An exception that names nothing any more is dropped, not kept as a hole for the next one.
    assert.equal(used.size, COUNT_EXCEPTIONS.length, 'every named exception still names a line');
});

test('the count scan still sees the shapes it guards', () => {
    // Each shape the 0.240 batch replaced, as it stood.
    assert.ok(isCountShape('', "const days = Math.floor((Date.now() - new Date(d+'T12:00:00').getTime()) / 86400000);"));
    assert.ok(isCountShape('', "? Math.max(0, Math.floor((Date.now() - new Date(opp.stageChangedDate + 'T12:00:00').getTime()) / 86400000))"));
    assert.ok(isCountShape('', "const diff = Math.ceil((new Date(cd+'T12:00:00')-Date.now())/86400000);"));
    assert.ok(isCountShape(
        '            const stageDate = new Date(opportunity.stageChangedDate);',
        '            const daysInStage = Math.floor((now - stageDate) / (1000 * 60 * 60 * 24));'),
        'a day handed whole to new Date on the line before');
    assert.ok(isCountShape(
        "        const d = new Date(dateStr + 'T12:00:00');",
        '        const diffDays = Math.floor((now - d) / 86400000);'),
        'a noon read on the line before');
    assert.ok(isCountShape(
        '    const a = parseLocalDate(later), b = parseLocalDate(l.createdAt);',
        '    return (a && b) ? Math.max(0, Math.floor((a - b) / 86400000)) : null;'),
        'an instant to a day read at noon');
    // What it must not take: a week number from a quarter's start, an instant's minutes.
    assert.ok(!isCountShape("    const qStart = quarterStartDate(fy, q, fiscalStart);", '    const qWeek = Math.floor((today12 - qStart) / 86400000 / 7) + 1;'));
    assert.ok(!isCountShape('', "const m = Math.floor((Date.now() - new Date(h.scoredAt).getTime()) / 60000);"));
    assert.ok(!isCountShape('', 'const days = daysSince(opportunity.createdDate, today);'));
});

test('the count scan sees a day rounded against now (the 0.240 review, gap 2)', () => {
    // Each rounded shape the second sweep replaced, as it stood.
    assert.ok(isCountShape('', "    const diff = Math.round((new Date(dateStr + 'T12:00:00') - new Date()) / 86400000);"), 'a countdown from now');
    assert.ok(isCountShape('', "        ? Math.round((today - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000)"), 'an age against today');
    assert.ok(isCountShape('', "        return Math.round((Date.now() - new Date(o.stageChangedDate + 'T12:00:00').getTime()) / 86400000) <= 7;"), 'Date.now()');
    assert.ok(isCountShape('', "    const diff = Math.round((Date.now() - new Date(iso + (iso.includes('T') ? '' : 'T12:00:00')).getTime()) / 86400000);"), 'QuotesTab relDate');
    assert.ok(isCountShape('', "? Math.round((Date.now() - new Date(stageEnteredRaw+'T12:00:00'))/86400000)"), 'unspaced');
    assert.ok(isCountShape('        const d = new Date(iso);', '        const diffD = Math.round((Date.now() - d) / 86400000);'), 'a day handed whole to new Date the line before');
    // What it must not take: a rounded span between two stored days (exact), a rounded
    // instant's minutes, a rounded money figure.
    assert.ok(!isCountShape('', 'const daysBetween = (a, b) => { const x = parseLocalDate(a), y = parseLocalDate(b); return x && y ? Math.round((y - x) / 86400000) : null; };'), 'day to day is exact');
    assert.ok(!isCountShape('', "        const days = Math.round((parseLocalDate(to) - parseLocalDate(from)) / 86400000) + 1;"), 'a period length');
    assert.ok(!isCountShape("        const d   = new Date(isoString);", '        const diffMin = Math.round(diffMs / 60000);'), 'minutes');
    assert.ok(!isCountShape('', "    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';"), 'money');
});

// ── THE DEAL TIMELINE'S BUCKETS (0.240) ──────────────────────
// A Sunday event left "This week" every afternoon (the week began at the current time of
// day on Sunday) and "Yesterday" was now minus 24 hours -- the wrong day for an hour after
// a clock change. timelineBucket places each event by calendar day. Run in a Chicago child
// so the clock changes are real ones: spring-forward 8 Mar 2026, fall-back 1 Nov 2026.
test('America/Chicago: the timeline buckets by calendar day', (t) => {
    const B = (day, now) => `timelineBucket(${JSON.stringify(day)}, ${now})`;
    // Old placement, kept as the contrast, exactly as ReportsTab had it.
    const OLD_BUCKET = (day, now) => `(() => { const now = ${now};
        const today = now.toDateString(); const yest = new Date(now - 86400000).toDateString();
        const thisWeekStart = new Date(now - (now.getDay() * 86400000));
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
        const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const d = new Date(${JSON.stringify(day)}+'T12:00:00');
        if (d >= tomorrowStart) return 'Upcoming'; if (d.toDateString() === today) return 'Today';
        if (d.toDateString() === yest) return 'Yesterday'; if (d >= thisWeekStart) return 'This week';
        if (d >= lastMonthStart) return 'Last month'; return 'Earlier'; })()`;
    const TUE_15 = 'new Date(2026, 10, 10, 15, 0)';          // Tue 10 Nov 2026, 15:00
    const TUE_9 = 'new Date(2026, 10, 10, 9, 0)';
    const SPRING_0030 = 'new Date(2026, 2, 9, 0, 30)';       // Mon 9 Mar, the night after spring-forward
    const FALL_2330 = 'new Date(2026, 10, 1, 23, 30)';       // Sun 1 Nov, the night of fall-back
    const r = countsIn('America/Chicago', {
        sunAfternoon: B('2026-11-08', TUE_15),
        sunMorning: B('2026-11-08', TUE_9),
        oldSunAfternoon: OLD_BUCKET('2026-11-08', TUE_15),
        today: B('2026-11-10', TUE_15),
        yesterday: B('2026-11-09', TUE_15),
        tomorrow: B('2026-11-11', TUE_9),
        satBefore: B('2026-11-07', TUE_15),
        lastMonthFirst: B('2026-10-01', TUE_15),
        lastMonthEve: B('2026-09-30', TUE_15),
        springYest: B('2026-03-08', SPRING_0030),
        oldSpringYest: OLD_BUCKET('2026-03-08', SPRING_0030),
        fallToday: B('2026-11-01', FALL_2330),
        fallYest: B('2026-10-31', FALL_2330),
        janLastMonth: B('2025-12-01', 'new Date(2026, 0, 20, 10, 0)'),
        unreadable: B('TBD', TUE_15),
        empty: B('', TUE_15),
        sunOnSun: B('2026-11-08', 'new Date(2026, 10, 8, 18, 0)'),
        satOnMon: B('2026-11-07', 'new Date(2026, 10, 9, 18, 0)'),
    });
    if (!r.tz.includes('Chicago')) {
        t.skip(`child did not adopt TZ (reported ${r.tz}) — cannot test other zones here`);
        return;
    }
    assert.equal(r.out.sunAfternoon, 'This week', "Sunday's event seen Tuesday 15:00 is this week");
    assert.equal(r.out.sunMorning, 'This week');
    assert.equal(r.out.oldSunAfternoon, 'Last month', 'the old placement dropped it -- the contrast');
    assert.equal(r.out.today, 'Today');
    assert.equal(r.out.yesterday, 'Yesterday');
    assert.equal(r.out.tomorrow, 'Upcoming', 'a future day keeps the bucket it had');
    assert.equal(r.out.satBefore, 'Last month', 'the Saturday before this week is not this week');
    assert.equal(r.out.lastMonthFirst, 'Last month');
    assert.equal(r.out.lastMonthEve, 'Earlier');
    assert.equal(r.out.springYest, 'Yesterday', 'yesterday across spring-forward is Yesterday');
    assert.equal(r.out.oldSpringYest, 'This week', 'now minus 24 h landed on Saturday -- the contrast');
    assert.equal(r.out.fallToday, 'Today', 'the 25-hour day is one day');
    assert.equal(r.out.fallYest, 'Yesterday');
    assert.equal(r.out.janLastMonth, 'Last month', 'last month across a year');
    assert.equal(r.out.unreadable, 'Earlier');
    assert.equal(r.out.empty, 'Earlier');
    assert.equal(r.out.sunOnSun, 'Today');
    assert.equal(r.out.satOnMon, 'Last month', 'on Monday the week is Sunday alone, and Sunday is Yesterday');
});
