// A Sales Rep's quota plan per fiscal year (state §0.203, guide §18b96). Jeff, 15 Oct 2026: "A rep has an annual
// quota that is broken down into 4 quarters ... It may ramp up into the year. the 4 quarters of quota do need to add
// up to their annual quota number", "some companies may do monthly quotas that add up to an annual number"; then
// "Per-year plans now" — each fiscal year its own plan, a quarter measured against its own year's — and "Quarters
// should follow whatever is set there for that company", "It should default to Jan 1 as fiscal year start".
//
// The rules run on made-up plans here; the endpoint runs against the test database in
// tests/integration/quota-plans.itest.mjs; the source pins and the two guards over the tree are where the mutation
// harness can reach them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Q from '../src/utils/quotaPlan.js';
import { fiscalStartOf, fiscalMonthOf } from '../src/utils/quarters.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const between = (s, from, to) => {
    const a = s.indexOf(from);
    assert.ok(a > -1, `missing: ${from}`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b > -1, `missing after it: ${to}`);
    return s.slice(a, b);
};
const order = (s, ...parts) => {
    let at = -1;
    for (const p of parts) {
        const i = s.indexOf(p, at + 1);
        assert.ok(i > at, `out of order or missing: ${p}`);
        at = i;
    }
};
const plan = (annual, quarters, months = null) => ({ annual, quarters, months });

// ── the rules ───────────────────────────────────────────────────────────────

test('a stored plan: a four-digit year, a yearly figure and four quarters; months only while they add up to their quarters', () => {
    assert.deepEqual(Q.cleanQuotaPlans({ '2026': plan(500000, [100000, 100000, 125000, 175000]) }), { '2026': plan(500000, [100000, 100000, 125000, 175000]) });
    assert.equal(Q.cleanQuotaPlans({ '26': plan(1, [1, 0, 0, 0]), 'FY2026': plan(1, [1, 0, 0, 0]) }), null, 'a year is four digits');
    assert.equal(Q.cleanQuotaPlans({ '2026': plan(1, [1, 0, 0]) }), null, 'four quarters');
    assert.equal(Q.cleanQuotaPlans({ '2026': plan(-1, [0, 0, 0, 0]) }), null, 'no negative figure');
    assert.equal(Q.cleanQuotaPlans([plan(1, [1, 0, 0, 0])]), null, 'an object of years, not a list');
    assert.equal(Q.cleanQuotaPlans(null), null);
    const fits = plan(120, [30, 30, 30, 30], [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    assert.deepEqual(Q.cleanQuotaPlan(fits).months, fits.months);
    assert.equal(Q.cleanQuotaPlan({ ...fits, months: fits.months.slice(0, 11) }).months, null, 'eleven months are no months');
    assert.equal(Q.cleanQuotaPlan({ ...fits, quarters: [40, 20, 30, 30] }).months, null, 'months that no longer add up to their quarter are dropped — the plan stays');
    assert.deepEqual(Q.cleanQuotaPlan(plan('500000', ['100000', '100000', '125000', '175000'])).quarters, [100000, 100000, 125000, 175000], 'a restore\'s text figures read as numbers');
});

test('a year\'s plan, and never another year\'s: no plan for the year is unset and zero', () => {
    const karen = { quotaPlans: { '2026': plan(500000, [100000, 100000, 125000, 175000]) } };
    const p = Q.quotaPlanOf(karen, 2026);
    assert.equal(p.set, true);
    assert.equal(p.annual, 500000);
    assert.equal(p.balanced, true);
    assert.equal(Q.quotaPlanOf(karen, 2027).set, false, 'REGRESSION: next year reads this year\'s ramp');
    assert.equal(Q.quotaPlanOf(karen, 2027).annual, 0);
    assert.equal(Q.quotaPlanOf(karen, '2026').set, false, 'a year is a number');
    assert.equal(Q.quotaPlanOf({ annualQuota: 400000, quotaType: 'annual' }, 2026).set, false, 'the old keys carry no year and are never read');
    assert.equal(Q.quotaPlanOf({ quotaPlans: { '2026': plan(500000, [100000, 100000, 100000, 100000]) } }, 2026).unallocated, 100000, 'a plan that does not add up says by how much');
});

test('the save rule: 4 quarters or 12 months, whole dollars from 0 to the cap, adding up to the year exactly', () => {
    assert.equal(Q.checkQuotaSave({ breakdown: 'quarters', annual: 500000, periods: [100000, 100000, 125000, 175000] }), null);
    assert.deepEqual(Q.checkQuotaSave({ breakdown: 'quarters', annual: 500000, periods: [100000, 100000, 125000, 155000] }), { kind: 'sum', annual: 500000, sum: 480000, gap: 20000 });
    assert.deepEqual(Q.checkQuotaSave({ breakdown: 'quarters', annual: 500000, periods: [100000, 100000, 125000, 195000] }), { kind: 'sum', annual: 500000, sum: 520000, gap: -20000 });
    assert.equal(Q.checkQuotaSave({ breakdown: 'quarters', annual: 500000, periods: [100000, 100000, 125000] }).kind, 'count');
    assert.equal(Q.checkQuotaSave({ breakdown: 'months', annual: 120, periods: [30, 30, 30, 30] }).kind, 'count', 'a months company sends 12');
    assert.equal(Q.checkQuotaSave({ breakdown: 'months', annual: 120, periods: Array(12).fill(10) }), null);
    for (const bad of [0.5, -5, '100', NaN, Q.QUOTA_MAX + 1]) {
        assert.equal(Q.checkQuotaSave({ breakdown: 'quarters', annual: 100, periods: [bad, 0, 0, 0] }).kind, 'figure', String(bad));
    }
    assert.equal(Q.checkQuotaSave({ breakdown: 'quarters', annual: Q.QUOTA_MAX + 1, periods: [Q.QUOTA_MAX + 1, 0, 0, 0] }).kind, 'figure', 'the cap holds for the year too');
    assert.equal(Q.checkQuotaSave({ breakdown: 'quarters', annual: Q.QUOTA_MAX, periods: [Q.QUOTA_MAX, 0, 0, 0] }), null, 'the cap itself is allowed');
    assert.equal(Q.checkQuotaSave({ breakdown: 'quarters', annual: 0, periods: [0, 0, 0, 0] }), null, 'all zero clears a plan');
});

test('the refusal names the member, the year and the gap', () => {
    const check = Q.checkQuotaSave({ breakdown: 'quarters', annual: 500000, periods: [100000, 100000, 125000, 155000] });
    assert.equal(Q.quotaRefusal('Karen Russell', 2026, check, 'quarters'), 'Karen Russell\'s FY2026 quarters add up to $480,000 — $20,000 short of the $500,000 yearly quota.');
    const over = Q.checkQuotaSave({ breakdown: 'months', annual: 100, periods: [20, ...Array(11).fill(10)] });
    assert.equal(Q.quotaRefusal('Sam', 2027, over, 'months'), 'Sam\'s FY2027 months add up to $130 — $30 over the $100 yearly quota.');
    assert.equal(Q.quotaRefusal('Sam', 2027, { kind: 'count', count: 12 }, 'months'), 'Sam: FY2027\'s quota needs 12 months.');
    assert.equal(Q.quotaRefusal('Sam', 2027, { kind: 'figure' }, 'quarters'), 'Sam: quotas are whole dollars, 0 or more.');
});

test('what a save stores: a months plan stores each quarter as its months\' sum; a quarters plan keeps the months only while they still fit', () => {
    const months = [30, 30, 40, 40, 40, 45, 45, 45, 50, 50, 50, 55].map((k) => k * 1000);
    assert.deepEqual(Q.planFromSave('months', 520000, months, null), { annual: 520000, quarters: [100000, 125000, 140000, 155000], months });
    const stored = Q.cleanQuotaPlan({ annual: 520000, quarters: [100000, 125000, 140000, 155000], months });
    assert.deepEqual(Q.planFromSave('quarters', 520000, [100000, 125000, 140000, 155000], stored).months, months, 'a switch back keeps months that still fit');
    assert.equal(Q.planFromSave('quarters', 520000, [110000, 115000, 140000, 155000], stored).months, null, 'months that no longer fit are dropped');
    assert.equal(Q.samePlan(stored, Q.planFromSave('quarters', 520000, [100000, 125000, 140000, 155000], stored)), true);
    assert.equal(Q.samePlan(stored, Q.planFromSave('quarters', 520000, [110000, 115000, 140000, 155000], stored)), false);
});

test('an even split is whole dollars, the remainder on the last period', () => {
    assert.deepEqual(Q.splitEvenly(1000000, 12), [...Array(11).fill(83333), 83337]);
    assert.deepEqual(Q.splitEvenly(400000, 4), [100000, 100000, 100000, 100000]);
    assert.deepEqual(Q.splitEvenly(10, 3), [3, 3, 4]);
    assert.deepEqual(Q.splitEvenly(NaN, 4), [0, 0, 0, 0]);
    assert.equal(Q.splitEvenly(1000003, 12).reduce((s, x) => s + x, 0), 1000003, 'it always adds up');
});

test('every quota key, as stored, is set — a key a row lacks can never come from a save\'s body', () => {
    assert.deepEqual(Q.storedQuota({ quotaPlans: { '2026': plan(1, [1, 0, 0, 0]) }, phone: 'x' }),
        { quotaPlans: { '2026': plan(1, [1, 0, 0, 0]) }, annualQuota: null, q1Quota: null, q2Quota: null, q3Quota: null, q4Quota: null, quotaType: null });
    assert.deepEqual(Object.keys(Q.storedQuota(null)), [...Q.QUOTA_KEYS]);
});

test('the board offers last year, this year and next; a save may name a year within two of this one', () => {
    assert.deepEqual(Q.quotaYearsOffered(2026), [2025, 2026, 2027]);
    for (const [fy, ok] of [[2024, true], [2028, true], [2023, false], [2029, false], [2026.5, false], ['2026', false]]) {
        assert.equal(Q.quotaYearAllowed(fy, 2026), ok, String(fy));
    }
});

test('the signed-in member\'s own plans fill only their own directory row — never a full row', () => {
    const me = { id: 'usr_k', quotaPlans: { '2026': plan(1, [1, 0, 0, 0]) } };
    const directory = [{ id: 'usr_k', name: 'Karen' }, { id: 'usr_s', name: 'Sam' }];
    const out = Q.withOwnPlans(directory, me);
    assert.deepEqual(out[0].quotaPlans, me.quotaPlans);
    assert.equal('quotaPlans' in out[1], false, 'another member is untouched');
    const full = [{ id: 'usr_k', name: 'Karen', quotaPlans: { '2027': plan(2, [2, 0, 0, 0]) } }];
    assert.deepEqual(Q.withOwnPlans(full, me)[0].quotaPlans, full[0].quotaPlans, 'a full row keeps its own');
    assert.deepEqual(Q.withOwnPlans(directory, null), directory);
});

test('the board\'s typing: the yearly figure splits evenly until a period is typed; a period leaves the rest; a draft back at the plan is none', () => {
    const fresh = {};
    let d = Q.editQuotaDraft(fresh, 2026, 'quarters', undefined, { annual: '400000' });
    assert.deepEqual(d.periods, ['100000', '100000', '100000', '100000'], 'no plan, nothing typed: an even split');
    d = Q.editQuotaDraft(fresh, 2026, 'quarters', d, { period: 3, text: '150000' });
    assert.equal(Q.quotaDraftRow(fresh, 2026, 'quarters', d).unallocated, -50000, 'over by $50,000');
    d = Q.editQuotaDraft(fresh, 2026, 'quarters', d, { annual: '450000' });
    assert.deepEqual(d.periods, ['100000', '100000', '100000', '150000'], 'a typed period stays when the year changes');
    assert.equal(Q.quotaDraftRow(fresh, 2026, 'quarters', d).unallocated, 0);
    d = Q.editQuotaDraft(fresh, 2026, 'quarters', d, { split: true });
    assert.deepEqual(d.periods, ['112500', '112500', '112500', '112500'], 'Split evenly re-spreads on demand');
    const karen = { quotaPlans: { '2026': plan(500000, [100000, 100000, 125000, 175000]) } };
    let k = Q.editQuotaDraft(karen, 2026, 'quarters', undefined, { annual: '600000' });
    assert.deepEqual(k.periods, ['100000', '100000', '125000', '175000'], 'a rep with a plan keeps their ramp');
    k = Q.editQuotaDraft(karen, 2026, 'quarters', undefined, { period: 0, text: '90000' });
    assert.equal(Q.editQuotaDraft(karen, 2026, 'quarters', k, { period: 0, text: '100000' }), null, 'back at the plan: no draft');
    assert.deepEqual(Q.quotaDraftRow(karen, 2026, 'months', null).periodTexts.slice(0, 3), ['33333', '33333', '33334'], 'a months company shows each quarter split three ways until months are saved');
    assert.equal(Q.quotaDraftRow(fresh, 2026, 'quarters', { annual: 'x', periods: ['1', '2', '3', '4'] }).unallocated, null, 'not a number: nothing to add up');
    assert.deepEqual(Q.quotaDraftRow(karen, 2027, 'quarters', null).periodTexts, ['', '', '', ''], 'next year starts empty');
});

test('a company\'s fiscal start: January when none is set; fiscal month k\'s calendar month', () => {
    for (const [v, m] of [['', 1], [null, 1], [undefined, 1], ['10', 10], [10, 10], ['13', 1], ['0', 1], ['abc', 1]]) assert.equal(fiscalStartOf(v), m, String(v));
    assert.equal(fiscalMonthOf(1, 10), 10);
    assert.equal(fiscalMonthOf(4, 10), 1);
    assert.equal(fiscalMonthOf(12, 1), 12);
    assert.equal(fiscalMonthOf(3, 11), 1);
});

// ── the guards over the tree ────────────────────────────────────────────────

const SRC = fileURLToPath(new URL('src/', ROOT));
const FUNCTIONS = fileURLToPath(new URL('netlify/functions/', ROOT));
const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(m?js|jsx)$/.test(name)) out.push(p);
    }
    return out;
};
// The arguments of each call of `name` in `src` — top level only; strings, template literals and comments skipped, a
// trailing comma no argument; a call through an object (`PR.userQuotaFor(`) or an optional one (`?.(`) is a call.
const callsOf = (src, name) => {
    const out = [];
    const re = new RegExp(`(?<![\\w$])${name}\\s*(?:\\?\\.\\s*)?\\(`, 'g');
    let m;
    while ((m = re.exec(src))) {
        if (/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index))) continue;   // its definition
        let i = m.index + m[0].length, depth = 0, args = 1, empty = true, trailing = false;
        for (; i < src.length; i++) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }   // a line comment
            if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }   // a block comment
            if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } empty = false; trailing = false; continue; }
            if (c === '`') {   // a template: skip it, its ${…} included
                i++; let t = 0;
                while (i < src.length && !(src[i] === '`' && t === 0)) { if (src[i] === '$' && src[i + 1] === '{') { t++; i++; } else if (src[i] === '}' && t > 0) t--; i++; }
                empty = false; trailing = false; continue;
            }
            if ('([{'.includes(c)) { depth++; empty = false; trailing = false; }
            else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
            else if (c === ',' && depth === 0) { args++; trailing = true; }
            else if (!/\s/.test(c)) { empty = false; trailing = false; }
        }
        out.push({ args: empty ? 0 : args - (trailing ? 1 : 0), at: src.slice(m.index, Math.min(i + 1, m.index + 120)) });
    }
    return out;
};

const READERS = [['userQuotaFor', 3], ['teamQuotaFor', 4], ['quotaPlanOf', 2]];
test('THE GUARD: every quota reader names its fiscal year — userQuotaFor takes 3 arguments, teamQuotaFor 4 and quotaPlanOf 2, everywhere in src and the functions, under its own name', () => {
    let seen = 0;
    for (const f of [...walk(SRC), ...walk(FUNCTIONS)]) {
        const src = code(readFileSync(f, 'utf8'));
        for (const [name, want] of READERS) {
            assert.ok(!new RegExp(`\\b${name}\\s+as\\s`).test(src), `${f}: ${name} imported under another name — the guard reads calls by their name`);
            for (const c of callsOf(src, name)) {
                seen++;
                assert.equal(c.args, want, `${f}: ${c.at} — a quota with no year reads 0 (state §0.203); name the year`);
            }
        }
    }
    assert.ok(seen >= 14, `the guard saw ${seen} calls`);
    // the guard's own reader, on fixtures
    const n = (s) => callsOf(s, 'userQuotaFor').map((c) => c.args);
    assert.deepEqual(n("x(userQuotaFor(u, `Q${q.q}`, q.fiscalYear)); userQuotaFor(u, 'FY')"), [3, 2]);
    assert.deepEqual(n("userQuotaFor(\n    rep,\n    `Q${q}`,\n)"), [2], 'a trailing comma is no argument');
    assert.deepEqual(n("userQuotaFor(u, 'Q1' /* , fy */)"), [2], 'a comma in a block comment');
    assert.deepEqual(n("userQuotaFor(u, 'Q1', // the year\n)"), [2], 'a comma before a line comment');
    assert.deepEqual(n("PR.userQuotaFor(u, 'Q1'); userQuotaFor?.(u, 'Q1')"), [2, 2], 'through an object, and optional');
    assert.deepEqual(n("userQuotaFor(u, `Q${q}`, fy, )"), [3]);
    assert.deepEqual(callsOf('export function userQuotaFor(u, period, fiscalYear) {}', 'userQuotaFor'), [], 'its definition is no call');
});

// The lines that hold the fiscal start without reading a month from it: the columns selected, the report job handing
// the stored value on, the Fiscal year page's own "never saved" test and its save, the Settings card's detail (the
// stored month, and nothing when none). settings.mjs stores it and settingsDefaults.js names the default.
const NOT_READS = [
    ['netlify/functions/report-deliveries.mjs', "settings: { ...(srow?.extra || {}), fiscalYearStart: srow?.fiscalYearStart || '' },"],
    ['netlify/functions/report-prompt.mjs', 'const [row] = await db.select({ extra: settingsTable.extra, fiscalYearStart: settingsTable.fiscalYearStart, stages: settingsTable.stages })'],
    ['netlify/functions/users.mjs', 'const [quotaSettings] = await db.select({ extra: settingsTable.extra, fiscalYearStart: settingsTable.fiscalYearStart })'],
    ['src/Tabs/settings/company/FiscalYearDetail.jsx', 'const startNeverSet = fiscalYearDetail(settings?.fiscalYearStart) === null;'],
    ['src/Tabs/settings/company/FiscalYearDetail.jsx', 'if (startChanged) payload.fiscalYearStart = startMonth + 1;'],
    ['src/utils/settingsCards.js', 'export function fiscalYearDetail(fiscalYearStart) {'],
    ['src/utils/settingsCards.js', 'const m = parseInt(fiscalYearStart, 10);'],
    ['src/utils/settingsCards.js', "if (item.id === 'fiscal-year') statusDetail = fiscalYearDetail(settings?.fiscalYearStart);"],
];
const STORE = ['netlify/functions/settings.mjs', 'src/utils/settingsDefaults.js'];
// Quarter arithmetic on the start: quarters.js and reportPeriod.js own it; the Fiscal year page's ribbon draws the
// months, and its save turns the 0-based pick into the stored month.
const ARITH = /(?:\bfiscalStart\w*|\bstartMonth)\s*[-+%<>*]|[-+<>*%]=?\s*(?:fiscalStart\w*|startMonth)\b/;
const OWN_ARITH = [
    ['src/Tabs/settings/company/FiscalYearDetail.jsx', 'const start = (startMonth + q * 3) % 12;'],
    ['src/Tabs/settings/company/FiscalYearDetail.jsx', 'if (startChanged) payload.fiscalYearStart = startMonth + 1;'],
    ['src/Tabs/settings/company/FiscalYearDetail.jsx', 'const savedQ = currentQuarter(savedStart + 1);'],
];
const THROUGH = /fiscalStartOf\(\s*[\w$?.]*fiscalYearStart\s*\)/g;
const readsItself = (line) => (line.match(/fiscalYearStart|fiscal_year_start/g) || []).length > (line.match(THROUGH) || []).length;
// A private default on a start held under any fiscalStart name (`Number(opts.fiscalStart) || 10`).
const OWN_DEFAULT = /\bfiscalStart\w*\)?\s*(?:\|\||\?\?)\s*['"]?\d/;
// The names a file holds a start under (`const fs = fiscalStartOf(…)`, `…, fs = fiscalStartOf(…)`), and arithmetic on one.
const startNamesOf = (src) => [...src.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*fiscalStartOf\(/g)].map((m) => m[1]);
const arithOn = (name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*[-+%<>*]|[-+<>*%]=?\\s*(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`);
// An allowlisted line is the line exactly, its trailing comment aside — a second read appended to it is not allowed.
const bare = (line) => line.replace(/\s+\/\/.*$/, '').trim();

test('THE GUARD: one reader of a company\'s fiscal start — every read of fiscalYearStart is fiscalStartOf\'s, and no screen or job does quarter arithmetic on the start', () => {
    const files = [...walk(SRC), ...walk(FUNCTIONS)].map((f) => [f, f.replace(/\\/g, '/')])
        .filter(([, p]) => !p.endsWith('src/utils/quarters.js') && !p.endsWith('src/utils/reportPeriod.js') && !STORE.some((s) => p.endsWith(s)));
    let reads = 0;
    for (const [f, p] of files) {
        const text = readFileSync(f, 'utf8');
        const held = startNamesOf(code(text)).map(arithOn);
        text.split(/\r?\n/).forEach((line, n) => {
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('*')) return;
            const allowed = (list) => list.some(([file, exact]) => p.endsWith(file) && bare(line) === exact);
            reads += (line.match(THROUGH) || []).length;
            if (readsItself(line)) assert.ok(allowed(NOT_READS), `${p}:${n + 1} reads the fiscal start itself — use fiscalStartOf (state §0.203): ${t}`);
            assert.ok(!OWN_DEFAULT.test(line), `${p}:${n + 1} defaults a fiscal start itself — fiscalStartOf is the one default: ${t}`);
            if (ARITH.test(line) || held.some((re) => re.test(line))) assert.ok(allowed(OWN_ARITH), `${p}:${n + 1} does its own quarter arithmetic on the start — use quarterOf / fiscalRange: ${t}`);
        });
    }
    assert.ok(reads >= 18, `the guard saw ${reads} reads`);
    // its patterns, on fixtures
    for (const bad of ['const fs = Number(settings.fiscalYearStart) || 10;', 'const fs = settings?.fiscalYearStart ?? 10;',
        "const fs = parseInt(String(settings.fiscalYearStart)) || '10';", 'const { fiscalYearStart: fs } = settings;', 'const fs = parseInt(settings?.fiscalYearStart) || 10;'])
        assert.ok(readsItself(bad), bad);
    assert.ok(!readsItself('const fs = fiscalStartOf(settings?.fiscalYearStart);'));
    for (const bad of ['else if (month >= fiscalStart) { fiscalYear = year + 1;', 'const q = Math.floor(((month - fiscalStart + 12) % 12) / 3) + 1;', 'const fy = m >= startMonth ? y + 1 : y;'])
        assert.ok(ARITH.test(bad), bad);
    assert.ok(!ARITH.test('const qk = quarterOf(dateString, fiscalStartOf(settings.fiscalYearStart));'));
    const mutant = 'const d = new Date(s); const m = d.getMonth() + 1, fs = fiscalStartOf(settings?.fiscalYearStart);\nreturn `FY${m >= fs ? d.getFullYear() + 1 : d.getFullYear()} Q${Math.floor(((m - fs + 12) % 12) / 3) + 1}`;';
    assert.deepEqual(startNamesOf(mutant), ['fs']);
    assert.ok(mutant.split('\n').some((l) => arithOn('fs').test(l)), 'arithmetic on a start held under another name');
    assert.ok(!arithOn('fs').test('const qk = quarterOf(d, fs);') && !arithOn('fs').test('x.fs - 1') && !arithOn('fs').test('const fsx = a - b;'));
    for (const bad of ['const fs = Number(opts.fiscalStart) || 10;', 'const fs = opts.fiscalStart ?? 10;', "const fs = fiscalStart || '10';"]) assert.ok(OWN_DEFAULT.test(bad), bad);
    assert.ok(!OWN_DEFAULT.test('const fiscalStart = fiscalStartOf(opts.fiscalStart);'));
    assert.ok(readsItself('select fiscal_year_start from settings'), 'the raw column');
    const okLine = '    const startNeverSet = fiscalYearDetail(settings?.fiscalYearStart) === null;   // a note';
    assert.equal(bare(okLine), NOT_READS[3][1]);
    assert.notEqual(bare(NOT_READS[3][1] + ' const fs = parseInt(settings.fiscalYearStart) || 10;'), NOT_READS[3][1], 'a second read on an allowlisted line');
    // the reader's users, as written (a site that drops the call)
    const uses = [['src/App.jsx', 2], ['src/components/ListView.jsx', 1], ['src/components/modals/OpportunityModal.jsx', 1], ['src/Tabs/HomeTab.jsx', 2],
        ['src/Tabs/ReportsTab.jsx', 7], ['src/Tabs/SalesManagerTab.jsx', 1], ['src/Tabs/settings/company/FiscalYearDetail.jsx', 1],
        ['src/utils/reportQuery.js', 1], ['src/utils/reportPrompt.js', 1], ['netlify/functions/report-deliveries.mjs', 1], ['netlify/functions/report-prompt.mjs', 1], ['netlify/functions/users.mjs', 1]];
    for (const [f, n] of uses) assert.equal((code(read(f)).match(/fiscalStartOf\(/g) || []).length, n, f);
});

test('the quarter of a day is quarters.js\'s wherever it is stamped: App\'s two copies (the Pipeline\'s "This quarter") and the deal window\'s close quarter (saved with the deal)', () => {
    const app = code(read('src/App.jsx'));
    for (const [from, ret] of [['    const getQuarter = (dateString) => {', "        return qk ? `Q${qk.q}` : '';"],
        ['    const getQuarterLabel = (quarter, dateString) => {', "        return qk ? `FY${qk.fiscalYear} ${quarter}` : '';"]]) {
        const body = between(app, from, '\n    };');
        order(body, '        const qk = quarterOf(dateString, fiscalStartOf(settings.fiscalYearStart));', ret);
        assert.ok(!/getMonth|getFullYear|%\s*12/.test(body), `${from.trim()} keeps no arithmetic of its own`);
    }
    const cq = between(code(read('src/components/modals/OpportunityModal.jsx')), '    const calculateCloseQuarter = (dateString) => {', '\n    };');
    order(cq, '        const qk = quarterOf(dateString, fiscalStartOf(settings?.fiscalYearStart));', "        return qk ? `FY${qk.fiscalYear} Q${qk.q}` : '';");
    assert.ok(!/getMonth|getFullYear|%\s*12/.test(cq), 'the close quarter keeps no arithmetic of its own — it named a January company\'s year one ahead');
});

// Each members write in `src`: an update of users and its set, an insert of users and its conflict's set —
// { kind: 'body', text } for an object written out, { kind: 'var', text } for a set passed as a variable.
const objectAt = (s, i) => { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
const profileWritesOf = (s) => {
    const out = [];
    for (const m of s.matchAll(/\.update\(\s*users\s*\)|\.insert\(\s*users\s*\)/g)) {
        const end = s.indexOf(';', m.index), stmt = s.slice(m.index, end < 0 ? s.length : end);
        const at = m[0].startsWith('.update') ? stmt.search(/\.set\(/) : stmt.search(/onConflictDoUpdate\(/);
        if (at < 0) continue;
        const from = m[0].startsWith('.update') ? at + stmt.slice(at).indexOf('(') + 1 : at + stmt.slice(at).search(/\bset:\s*/);
        if (!m[0].startsWith('.update') && from < at) continue;
        const rest = stmt.slice(m[0].startsWith('.update') ? from : from + stmt.slice(from).match(/^set:\s*/)[0].length).trimStart();
        if (rest.startsWith('{')) out.push({ kind: 'body', text: objectAt(rest, 0) });
        else out.push({ kind: 'var', text: (rest.match(/^[\w$.]+/) || [''])[0] });
    }
    return out;
};
const keepsPlans = (body) => !/\bprofile\b|\.\.\./.test(body) || /keepQuotaPlans\(|profile: sql`coalesce\(\$\{users\.profile\}/.test(body);

// ── the server ──────────────────────────────────────────────────────────────

test('users.mjs: sanitize carries the plans; the merge keeps every quota key as stored; a create stores none', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes('            quotaPlans:    cleanQuotaPlans(data.quotaPlans),'), 'sanitize lists every profile key — the plans a save writes are keepQuotaPlans\'s');
    const merge = between(u, '    const mergeForUpdate = async (data) => {', '\n    };');
    order(merge,
        '            active:      isAccessChange(data) ? data.active : existing.active,',
        '            ...storedQuota(existing.profile),');
    order(between(u, "            const createRole = data.userType || data.role || 'User';", "        if (event.httpMethod === 'PUT'"),
        '                for (const k of QUOTA_KEYS) delete data[k];',
        '                const clean = withRole(sanitize({ ...data, status: null, active: true, id: newUserId(), clerkUserId: null }), createRole);');
});

test('users.mjs: PUT ?quotas=true — above the generic PUT, its checks in order before any write, one year merged, every change audited in one insert before any is streamed', () => {
    const u = code(read('netlify/functions/users.mjs'));
    const branch = between(u, "        if (event.httpMethod === 'PUT' && event.queryStringParameters?.quotas === 'true') {", "        if (event.httpMethod === 'PUT') {");
    order(branch,
        '            if (!members || !members.length || members.length > 500',
        "                || memberIds.some((mid) => typeof mid !== 'string' || !mid) || new Set(memberIds).size !== memberIds.length) {",
        "                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Send each member\\'s id and quota, once.' }) };",
        '            if (!Number.isInteger(fy)) {',
        '            if (!QUOTA_PERIODS.includes(body.breakdown)) {',
        '                .from(settingsTable).where(eq(settingsTable.orgId, orgId)).limit(1);',
        '            const breakdown = cleanQuotaPeriods(quotaSettings?.extra?.quotaPeriods);',
        '            if (body.breakdown !== breakdown) {',
        '            const thisYear = currentFiscalYear(fiscalStartOf(quotaSettings?.fiscalYearStart));',
        '            if (!quotaYearAllowed(fy, thisYear)) {',
        '            const quotaRows = await db.select().from(users).where(and(eq(users.orgId, orgId), inArray(users.id, memberIds)));',
        '            if (notHere) {',
        "                if (r.role !== 'User') {",
        "                if (r.profile != null && (typeof r.profile !== 'object' || Array.isArray(r.profile))) {",
        '                if (check) return { statusCode: 400, headers, body: JSON.stringify({ error: quotaRefusal(r.name, fy, check, breakdown) }) };',
        '                if (!stored || !samePlan(stored, plan)) changes.push({ r, plan });',
        '            const written = changes.length ? (await db.batch(',
        "jsonb_build_object('quotaPlans', (case when jsonb_typeof(${users.profile}->'quotaPlans') = 'object' then ${users.profile}->'quotaPlans' else '{}'::jsonb end) || jsonb_build_object(${year}::text, ${JSON.stringify(plan)}::jsonb))",
        ".where(and(eq(users.id, r.id), eq(users.orgId, orgId), sql`jsonb_typeof(coalesce(${users.profile}, '{}'::jsonb)) = 'object'`))",
        '            invalidateRoster(orgId);',
        '                const audited = changes.filter(({ r }) => writtenById.has(r.id));',
        '                    const auditRows = await db.insert(auditLog).values(audited.map(({ r, plan }, i) => ({',
        "                        action:     'user.quota_set',",
        '                        entityId:   String(r.id),',
        "                        entityName: `${r.name} — FY${fy} $${plan.annual.toLocaleString('en-US')}`,",
        '                    for (const row of auditRows) await streamAudit(orgId, row);   // state §0.87',
        '            return { statusCode: 200, headers, body: JSON.stringify({ users: answer, removed }) };');
    assert.equal((u.match(/'user\.quota_set'/g) || []).length, 1);
    assert.ok(u.indexOf("event.queryStringParameters?.quotas === 'true'") < u.indexOf("        if (event.httpMethod === 'PUT') {"), 'above the generic PUT — a server without it answers that PUT\'s 400 and writes nothing');
});

test('settings.mjs: the company\'s quota periods in both halves, quarters when absent, and anything else refused', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes('                quotaPeriods:         cleanQuotaPeriods(row.extra?.quotaPeriods),'), 'GET');
    assert.ok(s.includes("                quotaPeriods:         'quotaPeriods'         in data ? data.quotaPeriods                    : cleanQuotaPeriods(existingExtra.quotaPeriods),"), 'PUT: read-then-merge');
    order(s,
        "            if ('quotaPeriods' in data && !QUOTA_PERIODS.includes(data.quotaPeriods)) {",
        "                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Quota periods are quarters or months.' }) };",
        "                quotaPeriods:         'quotaPeriods'         in data");
});

// ── the screens ─────────────────────────────────────────────────────────────

test('the board: a year this year until picked, pinned by the first draft, back on an org switch; locked while drafts are open', () => {
    const m = code(read('src/Tabs/SalesManagerTab.jsx'));
    order(m,
        '    const [quotaYear, setQuotaYear] = useState(null);',
        '    const planYear  = quotaYear ?? curQ.fiscalYear;',
        "    const fyRange   = fiscalRange(planYear, 'FY', fiscalStart);",
        '    const quotaBreakdown = cleanQuotaPeriods(settings.quotaPeriods);');
    assert.ok(m.includes('    useEffect(() => { setQuotaYear(null); }, [activeOrgId]);'), 'an org switch goes back to this year');
    order(between(m, '    const onQuotaChange = (userId, change) => {', '\n    };'),
        '        setQuotaYear(y => y ?? planYear);',
        '            const draft = editQuotaDraft(rep, planYear, quotaBreakdown, prev[userId], change);');
    assert.ok(m.includes('    const yearLocked = hasQuotaDrafts || busy || !settingsLoaded;'), 'no year change under open drafts, a save or unloaded settings');
    assert.ok(m.includes('<select aria-label="Quota fiscal year" value={planYear} disabled={yearLocked}'));
    assert.ok(m.includes('            {!settingsLoaded ? ('), 'no rows until this org\'s settings are in — a months company would get quarter inputs');
    assert.ok(m.includes('                {filteredReps.filter(u=>!u.territory?.trim()).map(u => ('), 'reps with no territory show for a Manager too');
    assert.ok(!m.includes('{isAdmin && filteredReps.filter(u=>!u.territory?.trim())'), 'REGRESSION: a Manager\'s reps with no territory were hidden');
});

test('the board saves once: the rows checked first, then one PUT ?quotas=true naming the year, and the rows the answer gives back; a second save while one is out shares its outcome; no answer is never "not stored"', () => {
    const m = code(read('src/Tabs/SalesManagerTab.jsx'));
    const save = between(m, '    const sendQuotas = async () => {', '\n    };');
    order(save,
        "        if (!settingsLoaded) throw refuse(",
        '            if (!rep) { gone.push(userId); continue; }',
        '            const row = quotaDraftRow(rep, planYear, quotaBreakdown, draft);',
        '            const check = checkQuotaSave({ breakdown: quotaBreakdown, annual: row.annual, periods: row.periods });',
        '            if (check) throw refuse(quotaRefusal(rep.name, planYear, check, quotaBreakdown));',
        "            res = await dbFetch('/.netlify/functions/users?quotas=true', {",
        '                body: JSON.stringify({ fiscalYear: planYear, breakdown: quotaBreakdown, members }),',
        '        if (!stillOrg(askedOrg)) return;',
        "        if (!res) throw unsure('No answer from the server — reload the page to see whether the quotas were saved.');",
        '        if (!res.ok) throw res.status < 500 && answer.error ? refuse(answer.error) : unsure(',
        '        const rows = new Map((answer.users || []).map(u => [u.id, u]));',
        '        setSettings(prev => ({ ...prev, users: (prev.users || []).filter(u => !removed.has(u.id)).map(u => rows.get(u.id) || u) }));',
        '        setQuotaDrafts({});');
    assert.equal((save.match(/dbFetch\(/g) || []).length, 1, 'one request');
    assert.ok(!/for \(const user of changes\)|saveUser\(/.test(save), 'no save per member');
    assert.ok(!save.includes('quotaSaving'), 'the request sets no flag of its own');
    order(m,
        '    const quotaSaving = React.useRef(null);',
        '    const sendQuotas = async () => {',
        '    const saveQuotas = () => {',
        '        if (!quotaSaving.current) {',
        '            setQuotaSending(true);',
        '            quotaSaving.current = sendQuotas().finally(() => { quotaSaving.current = null; setQuotaSending(false); });',
        '        return quotaSaving.current;');
    assert.ok(m.includes("    const busy = saveState.status === 'saving' || quotaSending;"), 'locked while a quota save is out, whatever another save does to the banner');
    assert.ok(m.includes("    const unsure = (msg) => { setSaveState({ status: 'error', msg }); return new Error(msg); };"), 'said as it is, never "Not saved"');
});

test('Home and Reports read the member\'s own plan for the year they show', () => {
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes('        myProfileHere: roleKnown ? myProfile : null,'), 'this org\'s own row only — never the last org\'s mid-switch');
    const home = code(read('src/Tabs/HomeTab.jsx'));
    order(home,
        '    const myUserObj      = myProfileHere;',
        '    const quarterlyQuota = userQuotaFor(myUserObj, `Q${quarter}`, todayQk?.fiscalYear);',
        '    const quotaReady     = !!myProfileHere && !!activeOrgId && settingsOrgId === activeOrgId;',
        '                            ready={quotaReady}');
    assert.ok(home.includes("{!ready ? '…' : quota > 0 ? `of ${fmtArr(quota)}` : 'No quota set'}"), 'no quota is said — never "of $0"');
    const rep = code(read('src/Tabs/ReportsTab.jsx'));
    assert.ok(rep.includes('    const quotaUsers = withOwnPlans(settings.users, myProfileHere);'));
    assert.ok(rep.includes('    const quotaUsersS = withOwnPlans(settings?.users, myProfileHere);'));
    assert.ok(rep.includes('            const forecast = repsD.reduce((s,u)=>s+userQuotaFor(u, `Q${qt.q}`, qt.fiscalYear),0);'), 'a past quarter reads its own year');
    assert.ok(rep.includes('            const qQuota = userQuotaFor(repUserSC, `Q${qt.q}`, qt.fiscalYear);'));
    for (const line of [
        '                            const visibleUsers2 = quotaUsers.filter(u=>{',
        '                              const rUser = quotaUsers.find(u=>u.name===rep);',
        "    const totalQ  = quotaUsersS.reduce((s,u)=>s+userQuotaFor(u,'FY',paceFY), 0);",
        "        const repsD = quotaUsersS.filter(u=>u.name&&u.userType!=='Admin'&&u.userType!=='Manager');",
        '        const repUserSC = quotaUsersS.find(u=>u.name===repNameSC);',
    ]) assert.ok(rep.includes(line), `a rep reads their own plan here, not the member list's $0: ${line.trim()}`);
    assert.ok(rep.includes('                const forecast = userQuotaFor(u, `Q${qt.q}`, qt.fiscalYear);'), 'the per-rep accuracy cell: a past quarter reads its own year');
    assert.ok(rep.indexOf('        const fiscalStartSC = fiscalStartOf(settings.fiscalYearStart);') < rep.indexOf('        const repQuota = userQuotaFor(repUserSC, \'FY\', fyNowSC);'), 'the start is declared before the ring reads it (a TDZ otherwise)');
    assert.ok(rep.includes('        const attainPct = repQuota>0 ? repClosedFY/repQuota : 0;'), 'this year\'s wins against this year\'s plan');
    assert.ok(rep.includes("    const closedWonRev = allWon.filter(o=>closeDayInRange(o, paceRange.from, paceRange.to)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0);"), 'quota pacing counts this fiscal year\'s wins');
    assert.ok(!rep.includes('getOppFiscalQtr'), 'the dead quarter copy is gone');
    assert.ok(!/u\.quotaType\|\|'annual'|quotaType\|\|'annual'/.test(rep), 'no per-member mode is read');
});

test('the Fiscal year page: only what changed is saved; the quota periods; no made-up card; the current period from quarters.js', () => {
    const p = code(read('src/Tabs/settings/company/FiscalYearDetail.jsx'));
    order(between(p, '    const handleSave = async () => {', '\n    };'),
        '        if (startChanged) payload.fiscalYearStart = startMonth + 1;',
        '        if (periodsChanged) payload.quotaPeriods = periods;',
        '        if (!Object.keys(payload).length) return;',
        '            await putSettings(payload);',
        '            setSettings(prev => ({ ...prev, ...payload }));');
    assert.ok(p.includes('    const dirty = startChanged || periodsChanged;'), 'unsaved is what differs from the saved settings');
    order(p,
        '    const startNeverSet = fiscalYearDetail(settings?.fiscalYearStart) === null;',
        '    const savedPick = startNeverSet ? null : savedStart;',
        '    const [picked, setPicked] = useState(undefined);',
        '    const [pickedPeriods, setPickedPeriods] = useState(undefined);',
        '    const startMonth = picked ?? savedPick;',
        '    const shownStart = startMonth ?? savedStart;',
        '    const periods = pickedPeriods ?? savedPeriods;',
        '    const startChanged = picked !== undefined && picked !== savedPick;',
        '    const periodsChanged = pickedPeriods !== undefined && pickedPeriods !== savedPeriods;',
        '    const handleCancel = () => { setPicked(undefined); setPickedPeriods(undefined); };',
        '            setSettings(prev => ({ ...prev, ...payload }));',
        '            setPicked(undefined); setPickedPeriods(undefined);',
        '    const fiscalStart = shownStart + 1;',
        '    const nextQStart = new Date(day(cq.to).getFullYear(), day(cq.to).getMonth(), day(cq.to).getDate() + 1, 12);',
        "<CSelect value={startMonth === null ? '' : String(startMonth)} onChange={v => setPicked(v === '' ? undefined : parseInt(v, 10))}",
        "options={[...(startNeverSet ? [{ value:'', label:'Not set — January' }] : []), ...MONTHS_FULL.map((m, i) => ({ value:String(i), label:m }))]}/>",
        '<FiscalRibbon startMonth={shownStart}/>');
    assert.ok(p.includes("<CSelect value={periods} onChange={v => setPickedPeriods(cleanQuotaPeriods(v))}"));
    assert.ok(!p.includes('Reporting adjustments') && !p.includes('3-4-4'), 'the made-up card is gone (Jeff: "Remove it")');
    assert.ok(p.includes('    const cq = currentQuarter(fiscalStart);') && p.includes("    const fy = fiscalRange(cq.fiscalYear, 'FY', fiscalStart);"), 'quarters.js, not its own arithmetic');
    assert.ok(!/fyStartYear|fyEndYear|currentQ = Math\.floor/.test(p), 'the old arithmetic is gone');
});

test('no quota is said, never "0%" or "of $0": Reports Performance and the scorecard ring, the Forecast tab, Team cards, Home\'s legend', () => {
    const rep = code(read('src/Tabs/ReportsTab.jsx'));
    assert.ok(rep.includes("label:'Team attainment', value:totalQuota2>0 ? attainPct2.toFixed(0)+'%' : '—',"), 'All time and custom dates have no quota');
    assert.ok(rep.includes("{r.quota>0 ? Math.round(r.attain*100)+'%' : '—'}") && rep.includes("{r.quota>0 ? fmt2(r.quota) : '—'}"), 'the leaderboard');
    assert.ok(rep.includes("{repQuota>0 ? Math.round(attainPct*100)+'%' : '—'}") && rep.includes("{repQuota>0 ? 'Quota' : 'No quota'}"), 'the scorecard ring');
    const m = code(read('src/Tabs/SalesManagerTab.jsx'));
    assert.ok(m.includes('{teamQuota > 0 ? `of ${fmtV(teamQuota)}` : `no quota set for ${period.label}`}'), 'the Forecast tab');
    assert.ok(m.includes("{rs.quota > 0 ? fmtV(rs.quota) : '—'}") && m.includes("{ v:rs.quota > 0 ? fmtV(rs.quota) : '—', l:'quota'  },"), 'the ledger and the Team cards');
    assert.ok(m.includes('color:rs.attainPct === null ? T.inkMuted :'), 'a dash is never red');
    assert.ok(m.includes("{teamQuota > 0 && <div style={{ position:'absolute', left:quotaW+'%'"), 'no quota marker at the far left');
    assert.ok(m.includes("{teamQuota > 0 ? fmtV(teamQuota) : '—'}"), "the ledger's Team Total");
    assert.equal((m.match(/color:rs\.attainPct !== null \? rs\.healthColor : T\.inkMuted/g) || []).length, 2, 'a dash is never health-coloured (the Team card, the Today row)');
    assert.ok(rep.includes("color:r.quota>0?attainColor:T.inkMuted") && rep.includes("color:repQuota>0?attainColor:T.inkMuted"), 'a dash is never red or amber');
    assert.ok(rep.includes("sub:totalQuota2>0 ? `${fmt2(closedWonValue2)} of ${fmt2(totalQuota2)}` : `${fmt2(closedWonValue2)} won · ${reportTimePeriod==='all'||reportTimePeriod==='custom' ? 'these dates have no quota' : 'no quota set'}`,"), 'the KPI never reads "of $0"');
    assert.ok(rep.includes("{currentQ.forecast>0 ? fmtShort(currentQ.forecast) : '—'}") && rep.includes("{currentQ.forecast>0 ? fmtShort(Math.max(0,currentQ.forecast-currentQ.actual)) : '—'}"), 'Forecast vs actual');
    const home = code(read('src/Tabs/HomeTab.jsx'));
    order(between(home, 'function QuotaBar(', '\n}'),
        '    const has = ready && quota > 0;',
        '    const closedPct = has ? Math.min(100, (closedArr / quota) * 100) : 0;',
        '    const commitPct = has ? Math.min(100 - closedPct, (commitArr / quota) * 100) : 0;',
        "                    Closed {has ? Math.round(closedPct) + '%' : '—'}",
        "                    + Commit {has ? Math.round(closedPct + commitPct) + '%' : '—'}");
});

test('every whole-profile write of a member keeps the quota plans the row holds when it lands — the PUT, the create\'s conflict, the member\'s own save, the first sign-in\'s link, a re-invitation, a role change', () => {
    const keep = between(code(read('netlify/functions/_lib.mjs')), 'export function keepQuotaPlans(profile) {', '\n}');
    order(keep,
        "    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return profile;",
        "    return sql`(case when ${users.profile} -> 'quotaPlans' is not null",
        "        then jsonb_set(${sent}::jsonb, '{quotaPlans}', ${users.profile} -> 'quotaPlans')",
        "        else ${sent}::jsonb - 'quotaPlans' end)`;");
    const u = code(read('netlify/functions/users.mjs'));
    for (const line of [
        "profile:     keepQuotaPlans({ ...(row.profile || {}), status: stillOff ? 'Deactivated' : 'Active', userType: linkRole }),",
        '.set({ ...updateData, profile: keepQuotaPlans(updateData.profile), clerkUserId: userId, updatedAt: new Date() })',
        '? await db.update(users).set({ ...updateData, profile: keepQuotaPlans(updateData.profile), updatedAt: new Date() })',
        'set: { ...updateData, profile: keepQuotaPlans(updateData.profile), updatedAt: new Date() },',
        '.set({ profile: keepQuotaPlans(mergedProfile), updatedAt: new Date() })',
    ]) assert.ok(u.includes(line), line);
    assert.ok(code(read('netlify/functions/user-role.mjs')).includes('.set({ role, profile: keepQuotaPlans({ ...(target.profile || {}), userType: role }), updatedAt: new Date() })'));
    order(between(u, '                        const [linked] = await db.update(users)', 'invalidateRoster(orgId);'),
        '                            .returning();',
        '                        row = linked || { ...row, clerkUserId: userId, role: linkRole, active: !stillOff };');
    // the class, over every function file: each update of users, and each insert that updates on a conflict, that
    // writes a profile or a whole row through a spread keeps the plans (the quota writer is their one writer); a set
    // passed as a variable is users-sync's patch alone, which never carries a profile
    let seen = 0;
    for (const f of walk(FUNCTIONS)) {
        const p = f.replace(/\\/g, '/');
        for (const w of profileWritesOf(code(readFileSync(f, 'utf8')))) {
            seen++;
            if (w.kind === 'var') assert.ok(p.endsWith('netlify/functions/users-sync.mjs') && w.text === 'patch', `${p}: a members write whose set is a variable — ${w.text}; write its keys where the class check can read them`);
            else assert.ok(keepsPlans(w.text), `${p}: a whole-profile write puts back plans saved since its read — keepQuotaPlans: ${w.text.slice(0, 120)}`);
        }
    }
    assert.ok(seen >= 7, `the check saw ${seen} members writes`);
    const sync = code(read('netlify/functions/users-sync.mjs'));
    assert.ok(sync.includes('            const patch = {};') && !/\bpatch\s*(?:\.\s*profile\b|\[\s*['"]profile['"]\s*\])/.test(sync), "users-sync's patch never carries a profile");
    // the check's own reader, on fixtures
    const kinds = (s) => profileWritesOf(s).map((w) => (w.kind === 'var' ? 'var' : keepsPlans(w.text) ? 'ok' : 'BAD'));
    assert.deepEqual(kinds('await db.update(users).set({ role, updatedAt: new Date() }).where(x);'), ['ok']);
    assert.deepEqual(kinds('await db.update(users).set({ ...clean, updatedAt: new Date() }).where(x);'), ['BAD'], 'a whole row through any spread');
    assert.deepEqual(kinds('await db\n    .update( users )\n    .set({ profile: { ...row.profile, status } }).where(x);'), ['BAD']);
    assert.deepEqual(kinds('await db.update(users).set(patch).where(x);'), ['var']);
    assert.deepEqual(kinds('await db.insert(users).values({ ...clean }).onConflictDoUpdate({ target: users.id, set: { ...updateData } }).returning();'), ['BAD']);
    assert.deepEqual(kinds('await db.insert(users).values({ id, profile }).onConflictDoNothing();'), [], 'an insert that updates nothing');
});
