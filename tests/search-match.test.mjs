// tests/search-match.test.mjs
//
// A search list ranks what was typed and says what it holds back (state §0.194; Jeff,
// 9 Oct, on PROD: the New Contact rail's Company field did not offer "Ineos Acetyls -
// Texas City", nor the New Deal window's Account field; "Account search fix first").
//
// Before: AccountPicker drew the first eight accounts whose name held the text typed as
// one substring, in the order the GET sends (by name in the C collation: every "INEOS…"
// before any "Ineos…"), and said nothing of the rest. "Ineos - Acetyls" matched nothing
// and offered to create it. Fifteen more search lists under src cut the same way (and
// ContactModal's, which nothing draws), and the document share picker's count line took
// the focus from its field.
//
// Here: the matcher and the account picker's rows (pickerRows, the composition
// AccountPicker draws), run on the UKG org's 55 "ineos" accounts as stored (read 9 Oct,
// SELECT only) — in the rails, which list every account, and in the deal window, which
// lists every account but sites and offers a site whose own name matches after them
// (Jeff, 9 Oct: "List matching sites below"); the row cache, run; each site's call,
// pinned; and THE GUARDS, a parse of every file under src — G1: no list of typed-text
// matches is cut without its count; G2: every caller of the matcher draws "N more — keep
// typing" in the function that asked, and a press on it keeps the focus in the field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { SEARCH_LIMIT, searchKey, keptTexts, rankMatches, capMatches, matchSearch, viaParent, pickerRows } from '../src/utils/searchMatch.js';
import { peopleMatching } from '../src/utils/documentPeople.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const U = (hex) => String.fromCharCode(92) + 'u' + hex;   // a JSX escape as the file writes it: backslash, u, four hex digits

// ── the UKG org's "ineos" accounts, as stored (name, tier, parent) ──────────

const INEOS = [
    ['INEOS', 'account', null],
    ['INEOS - Aromatics', 'business_unit', 'INEOS'], ['INEOS - Calabrian', 'business_unit', 'INEOS'],
    ['INEOS - Hygienics', 'business_unit', 'INEOS'], ['INEOS - Inovyn', 'business_unit', 'INEOS'],
    ['INEOS - KOH', 'business_unit', 'INEOS'], ['INEOS - NItriles', 'business_unit', 'INEOS'],
    ['INEOS - Olefins & Polymers', 'business_unit', 'INEOS'], ['INEOS - Oligomers', 'business_unit', 'INEOS'],
    ['INEOS - Oxide', 'business_unit', 'INEOS'], ['INEOS - Phenol', 'business_unit', 'INEOS'],
    ['INEOS - Styrolution', 'business_unit', 'INEOS'], ['INEOS - WL Plastics', 'business_unit', 'INEOS'],
    ['INEOS Acetyls', 'business_unit', 'INEOS'], ['INEOS Pigments', 'business_unit', 'INEOS'],
    ['INEOS Aromatics - Cooper River Chemicals', 'site', 'INEOS - Aromatics'], ['INEOS Aromatics - Texas City', 'site', 'INEOS - Aromatics'],
    ['INEOS Calabrian - Port Neches', 'site', 'INEOS - Calabrian'], ['INEOS Calabrian - Timmins', 'site', 'INEOS - Calabrian'],
    ['INEOS Hygienics - Jacksonville', 'site', 'INEOS - Hygienics'], ['INEOS Hygienics - Neville Island', 'site', 'INEOS - Hygienics'],
    ['INEOS Inovyn - Texas City', 'site', 'INEOS - Inovyn'], ['INEOS Inovyn - Warrenville', 'site', 'INEOS - Inovyn'],
    ['INEOS Nitriles - Aurora', 'site', 'INEOS - NItriles'], ['INEOS Nitriles - Green Lake', 'site', 'INEOS - NItriles'],
    ['INEOS Nitriles - Lima', 'site', 'INEOS - NItriles'],
    ['INEOS Olefins & Polymers - Battleground', 'site', 'INEOS - Olefins & Polymers'], ['INEOS Olefins & Polymers - Carson', 'site', 'INEOS - Olefins & Polymers'],
    ['INEOS Olefins & Polymers - Chocolate Bayou', 'site', 'INEOS - Olefins & Polymers'], ['INEOS Olefins & Polymers - Hobbs', 'site', 'INEOS - Olefins & Polymers'],
    ['INEOS Olefins & Polymers - Marina View', 'site', 'INEOS - Olefins & Polymers'], ['INEOS Olefins & Polymers - Stratton Ridge', 'site', 'INEOS - Olefins & Polymers'],
    ['INEOS Oligomers - Chocolate Bayou', 'site', 'INEOS - Oligomers'], ['INEOS Oligomers - Joffre', 'site', 'INEOS - Oligomers'],
    ['INEOS Oxide - Bayport', 'site', 'INEOS - Oxide'], ['INEOS Oxide - Plaquemine', 'site', 'INEOS - Oxide'],
    ['INEOS Phenol - Mobile', 'site', 'INEOS - Phenol'], ['INEOS Phenol - Pasadena', 'site', 'INEOS - Phenol'],
    ['INEOS Pigments - Ashtabula Plant 1', 'site', 'INEOS Pigments'], ['INEOS Pigments - Ashtabula Plant 2', 'site', 'INEOS Pigments'],
    ['INEOS Styrolution - Bayport', 'site', 'INEOS - Styrolution'], ['INEOS Styrolution - Channahon', 'site', 'INEOS - Styrolution'],
    ['INEOS Styrolution - Decatur', 'site', 'INEOS - Styrolution'], ['INEOS Styrolution - Naperville', 'site', 'INEOS - Styrolution'],
    ['INEOS Styrolution - Texas City', 'site', 'INEOS - Styrolution'],
    ['INEOS WL Plastics - Bowie', 'site', 'INEOS Pigments'], ['INEOS WL Plastics - Cedar City', 'site', 'INEOS - WL Plastics'],
    ['INEOS WL Plastics - Elizabethtown', 'site', 'INEOS - WL Plastics'], ['INEOS WL Plastics - Lubbock', 'site', 'INEOS - WL Plastics'],
    ['INEOS WL Plastics - Mills (Casper)', 'site', 'INEOS - WL Plastics'], ['INEOS WL Plastics - Rapid City', 'site', 'INEOS - WL Plastics'],
    ['INEOS WL Plastics - Snyder', 'site', 'INEOS - WL Plastics'], ['INEOS WL Plastics - Statesboro', 'site', 'INEOS - WL Plastics'],
    ['INEOS WL Plastics - Titusville', 'site', 'INEOS - WL Plastics'],
    ['Ineos Acetyls - Texas City', 'site', 'INEOS Acetyls'],
];
// The org's other Texas City sites and their accounts, so "texas city" is the org's answer.
const OTHERS = [['Ashland Global', 'account', null], ['Ashland - Texas City', 'site', 'Ashland Global'], ['Dow', 'account', null], ['Dow - Texas City', 'site', 'Dow']];
// In the GET's order: by name, code unit by code unit, as the C collation sorts.
const ACCOUNTS = [...INEOS, ...OTHERS].map(([name, accountTier, parent], i) => ({ id: `acc_${i}`, name, accountTier, parent }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const byName = { text: (a) => a.name };
const names = (xs) => xs.map((a) => a.name);
// The same rows linked as the database links them (parentAccountId), as the picker reads them.
const LINKED = (() => {
    const id = new Map(ACCOUNTS.map((a) => [a.name, a.id]));
    return ACCOUNTS.map((a) => ({ ...a, parentAccountId: a.parent ? id.get(a.parent) : null }));
})();
const notSite = (a) => a.accountTier !== 'site';   // the deal window's filterFn
const RAILS = {};                                   // the New Contact and Log Activity rails: every account
const DEAL = { keep: notSite };                     // the deal window: every account but sites, a site by its own name below
// A row as the picker draws it: the name, its parent's label, and ⇒ where picking it picks the parent.
const TIER = { site: 'site of', business_unit: 'unit of' };
const row = (r) => r.account.name + (r.parent ? ` · ${TIER[r.account.accountTier] || 'in'} ${r.parent.name}` : '') + (r.via ? ` ⇒ ${r.via.name}` : '');
const rowsOf = (q, mode, opts = {}) => pickerRows(LINKED, q, { ...mode, ...opts });
// A key worked out each time, as searchMatch.js works it out on its long road.
const ref = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ── the matcher — run ───────────────────────────────────────────────────────

test('a search reads a text without its case, accents, apostrophes or punctuation', () => {
    assert.equal(searchKey('Ineos - Acetyls'), 'ineos acetyls');
    assert.equal(searchKey('INEOS Acetyls'), 'ineos acetyls');
    assert.equal(searchKey('INEOS WL Plastics - Mills (Casper)'), 'ineos wl plastics mills casper');
    assert.equal(searchKey("O'Brien  Supply"), 'obrien supply');
    assert.equal(searchKey('O’Brien'), 'obrien');
    assert.equal(searchKey('Crème Brûlée, Inc.'), 'creme brulee inc');
    assert.equal(searchKey('ÉVONIK - Lafayette'), 'evonik lafayette');
    assert.equal(searchKey(' - '), '');
    assert.equal(searchKey(null), '');
    assert.equal(searchKey(undefined), '');
    assert.equal(searchKey(42), '42');
});

test('a key is the same by either road: a printable-ASCII name takes the short one, any other the long one', () => {
    const corpus = [...ACCOUNTS.map((a) => a.name), "O'Brien  Supply", 'O’Brien', 'Crème Brûlée, Inc.', 'ÉVONIK', ' - ', '', 'İstanbul Depot', 'Straße 5', 'ǅemal',
        'Ελληνικά Μάρμαρα', '½ off', 'a_b-c.d/e', '~tilde~', 'TAB' + String.fromCharCode(9) + 'BED', 'new' + String.fromCharCode(10) + 'line', String.fromCharCode(127) + 'del',
        'cafe' + String.fromCharCode(0x301), '42', null, undefined, 7];
    for (const t of corpus) assert.equal(searchKey(t), ref(t), JSON.stringify(t));
});

test("each row's keys are kept with the row: the cache never changes an answer, follows a rename, keeps eight texts a row, and nothing for a text", () => {
    const people = [{ id: 1, name: 'Ann Smith', company: 'Acme' }, { id: 2, name: 'Bob Jones', company: 'Évonik' }, { id: 3, name: "Cara O'Brien", company: 'Dow' }];
    const ask = (rows, q) => rankMatches(rows, q, (p) => p.name, (p) => [p.company]).map((p) => p.id);
    const fresh = () => people.map((p) => ({ ...p }));   // new rows: nothing kept for them
    for (const q of ['a', 'smith', 'evonik', 'obrien', 'dow cara', 'zz']) {
        assert.deepEqual(ask(people, q), ask(fresh(), q), `cold: ${q}`);
        assert.deepEqual(ask(people, q), ask(fresh(), q), `warm: ${q}`);
    }
    people[0].name = 'Zed Quill';   // a row renamed in place is read by its new name
    assert.deepEqual(ask(people, 'smith'), []);
    assert.deepEqual(ask(people, 'quill'), [1]);
    const busy = { id: 9 };
    for (let i = 0; i < 20; i++) assert.deepEqual(rankMatches([busy], `word${i}`, () => `Word${i} Co`), [busy], `text ${i}`);
    assert.ok(keptTexts(busy) <= 8, `a row read by many texts keeps eight at most (${keptTexts(busy)})`);
    assert.ok(keptTexts(busy) >= 1, 'and keeps the text it was read by');
    assert.equal(keptTexts('Ann Smith'), 0, 'a text has no row to keep a key with');
    // what searchMatch.js keeps at the top of the module: one WeakMap and no list of its own
    const top = parse(read('src/utils/searchMatch.js'), { sourceType: 'module' }).program.body
        .flatMap((s) => (s.type === 'VariableDeclaration' ? s.declarations.map((d) => [s.kind, d]) : s.type === 'ExportNamedDeclaration' && s.declaration?.type === 'VariableDeclaration' ? s.declaration.declarations.map((d) => [s.declaration.kind, d]) : []));
    assert.deepEqual(top.filter(([kind]) => kind !== 'const').map(([, d]) => d.id.name), [], 'no module variable that can be reassigned');
    const made = top.filter(([, d]) => d.init?.type === 'NewExpression').map(([, d]) => `${d.id.name} = new ${d.init.callee.name}`);
    assert.deepEqual(made, ['ROW_KEYS = new WeakMap'], "the one store: a WeakMap, whose keys go with their rows (an org switch's included)");
    assert.ok(!top.some(([, d]) => d.init?.type === 'ArrayExpression' || d.init?.type === 'ObjectExpression'), 'no list or table of texts');
});

test('the PROD case: "ineos" offers Ineos Acetyls - Texas City third, fifty drawn, and says five more', () => {
    assert.equal(ACCOUNTS.length, 59);
    assert.equal(ACCOUNTS.filter((a) => a.name.toLowerCase().includes('ineos')).length, 55);
    // as it was: one substring, the GET's order, the first eight — the site never drawn
    const was = ACCOUNTS.filter((a) => (a.name || '').toLowerCase().includes('ineos')).slice(0, 8);
    assert.deepEqual(names(was), ['INEOS', 'INEOS - Aromatics', 'INEOS - Calabrian', 'INEOS - Hygienics', 'INEOS - Inovyn', 'INEOS - KOH', 'INEOS - NItriles', 'INEOS - Olefins & Polymers']);
    const r = matchSearch(ACCOUNTS, 'ineos', byName);
    assert.equal(SEARCH_LIMIT, 50);
    assert.equal(r.shown.length, 50);
    assert.equal(r.more, 5, 'and how many more — keep typing');
    assert.deepEqual(names(r.shown.slice(0, 6)), ['INEOS', 'INEOS Acetyls', 'Ineos Acetyls - Texas City', 'INEOS - Aromatics', 'INEOS Aromatics - Cooper River Chemicals', 'INEOS Aromatics - Texas City'],
        'the whole name first, then A–Z read without case or punctuation: a unit beside its sites');
    assert.deepEqual(names(rankMatches(ACCOUNTS, 'ineos', byName.text).slice(50)),
        ['INEOS WL Plastics - Mills (Casper)', 'INEOS WL Plastics - Rapid City', 'INEOS WL Plastics - Snyder', 'INEOS WL Plastics - Statesboro', 'INEOS WL Plastics - Titusville']);
    const eight = matchSearch(ACCOUNTS, 'ineos', { ...byName, limit: 8 });
    assert.ok(names(eight.shown).includes('Ineos Acetyls - Texas City'), 'even at eight');
    assert.equal(eight.more, 47);
});

test('"Ineos - Acetyls", "acetyl", "texas city": every word, wherever it is, punctuation ignored', () => {
    assert.equal(ACCOUNTS.filter((a) => a.name.toLowerCase().includes('ineos - acetyls')).length, 0, 'as it was: one substring finds nothing');
    assert.deepEqual(names(matchSearch(ACCOUNTS, 'Ineos - Acetyls', byName).shown), ['INEOS Acetyls', 'Ineos Acetyls - Texas City']);
    assert.deepEqual(names(matchSearch(ACCOUNTS, 'acetyl', byName).shown), ['INEOS Acetyls', 'Ineos Acetyls - Texas City']);
    assert.deepEqual(names(matchSearch(ACCOUNTS, 'texas city', byName).shown),
        ['Ashland - Texas City', 'Dow - Texas City', 'Ineos Acetyls - Texas City', 'INEOS Aromatics - Texas City', 'INEOS Inovyn - Texas City', 'INEOS Styrolution - Texas City']);
    assert.deepEqual(names(matchSearch(ACCOUNTS, 'ineos texas', byName).shown),
        ['Ineos Acetyls - Texas City', 'INEOS Aromatics - Texas City', 'INEOS Inovyn - Texas City', 'INEOS Styrolution - Texas City'], 'every word, not any');
    assert.deepEqual(names(matchSearch(ACCOUNTS, 'mills casper', byName).shown), ['INEOS WL Plastics - Mills (Casper)']);
    // a text beside the name is searched with it, every word still
    assert.deepEqual(names(matchSearch(ACCOUNTS, 'aromatics plastics', { ...byName, also: (a) => [a.parent] }).shown), [], 'every word still');
    assert.deepEqual(names(matchSearch(ACCOUNTS, 'bowie pigments', { ...byName, also: (a) => [a.parent] }).shown), ['INEOS WL Plastics - Bowie'], 'found by its parent (as stored: under INEOS Pigments)');
});

test('the order: starts with what was typed, then every word starts a word, then anywhere, then beside the name; A–Z within, then the list\'s own', () => {
    const t = (xs, q, opts) => matchSearch(xs, q, opts).shown;
    assert.deepEqual(t(['Big Dow Supply', 'Dow - Texas City'], 'dow'), ['Dow - Texas City', 'Big Dow Supply']);
    assert.deepEqual(t(['Contexa Labs', 'Ineos Acetyls - Texas City'], 'tex'), ['Ineos Acetyls - Texas City', 'Contexa Labs']);
    const people = [{ name: 'Bob Jones', company: 'Acme', email: 'bob@jones.com' }, { name: 'Zach Macmeer', company: 'Zed', email: 'z@zed.com' }];
    const person = { text: (p) => p.name, also: (p) => [p.company] };
    assert.deepEqual(t(people, 'acme', person).map((p) => p.name), ['Zach Macmeer', 'Bob Jones'], 'the name before the company');
    assert.deepEqual(t(people, 'bob acme', person).map((p) => p.name), ['Bob Jones'], 'a word in the name and one beside it');
    assert.deepEqual(t(people, 'acme jones', { text: (p) => p.name.split(' ')[0], also: (p) => [p.company, p.email] }).map((p) => p.name), ['Bob Jones'], 'a word in each text beside it');
    assert.deepEqual(t(people, 'acme', { text: (p) => p.name }).map((p) => p.name), ['Zach Macmeer'], 'nothing beside, nothing searched beside');
    const twins = [{ id: 'a', name: 'Evonik - Lafayette' }, { id: 'b', name: 'Evonik - Lafayette' }];
    assert.deepEqual(t(twins, 'evonik', byName).map((x) => x.id), ['a', 'b'], 'two of one name keep the list\'s order');
    assert.deepEqual(t([...twins].reverse(), 'evonik', byName).map((x) => x.id), ['b', 'a']);
});

// ── the account picker's rows (pickerRows: what AccountPicker draws) — run ──

test('the picker, "ineos": in the rails fifty of 55 with each parent named; in the deal window the fifteen accounts first, then the sites', () => {
    const rails = rowsOf('ineos', RAILS);
    assert.equal(rails.shown.length, 50);
    assert.equal(rails.more, 5);
    assert.deepEqual(rails.shown.slice(0, 4).map(row), ['INEOS', 'INEOS Acetyls · unit of INEOS', 'Ineos Acetyls - Texas City · site of INEOS Acetyls', 'INEOS - Aromatics · unit of INEOS']);
    assert.ok(rails.shown.every((r) => !r.via), 'in the rails a site is picked as itself');
    assert.equal(rails.exact?.name, 'INEOS', 'the name typed is an account: no Create');
    assert.equal(rails.unlisted, null);
    const deal = rowsOf('ineos', DEAL);
    assert.deepEqual(names(deal.shown.slice(0, 15).map((r) => r.account)), ['INEOS', 'INEOS Acetyls', 'INEOS - Aromatics', 'INEOS - Calabrian', 'INEOS - Hygienics', 'INEOS - Inovyn', 'INEOS - KOH',
        'INEOS - NItriles', 'INEOS - Olefins & Polymers', 'INEOS - Oligomers', 'INEOS - Oxide', 'INEOS - Phenol', 'INEOS Pigments', 'INEOS - Styrolution', 'INEOS - WL Plastics'],
        'every account the deal window keeps comes before any site');
    assert.ok(deal.shown.slice(0, 15).every((r) => !r.via && r.account.accountTier !== 'site'));
    assert.deepEqual(deal.shown.slice(15, 17).map(row), ['Ineos Acetyls - Texas City · site of INEOS Acetyls ⇒ INEOS Acetyls', 'INEOS Aromatics - Cooper River Chemicals · site of INEOS - Aromatics ⇒ INEOS - Aromatics']);
    assert.ok(deal.shown.slice(15).every((r) => r.account.accountTier === 'site' && r.via === r.parent), 'below them, each site leads to its parent');
    assert.equal(deal.shown.length, 50);
    assert.equal(deal.more, 5, '15 accounts and 40 sites: fifty drawn, five more');
    assert.deepEqual(names(pickerRows(LINKED, 'ineos', { ...DEAL, limit: 100 }).shown.slice(50).map((r) => r.account)),
        ['INEOS WL Plastics - Mills (Casper)', 'INEOS WL Plastics - Rapid City', 'INEOS WL Plastics - Snyder', 'INEOS WL Plastics - Statesboro', 'INEOS WL Plastics - Titusville']);
});

test('the picker, "Ineos - Acetyls" and "acetyl": the unit, then its site — in both; the unit is the name typed, so no Create', () => {
    for (const [mode, via] of [[RAILS, ''], [DEAL, ' ⇒ INEOS Acetyls']]) {
        const r = rowsOf('Ineos - Acetyls', mode);
        assert.deepEqual(r.shown.map(row), ['INEOS Acetyls · unit of INEOS', `Ineos Acetyls - Texas City · site of INEOS Acetyls${via}`]);
        assert.equal(r.more, 0);
        assert.equal(r.exact?.name, 'INEOS Acetyls', '"Ineos - Acetyls" is INEOS Acetyls: picked, not made again');
        assert.equal(r.unlisted, null);
        const a = rowsOf('acetyl', mode);
        assert.deepEqual(a.shown.map(row), r.shown.map(row));
        assert.equal(a.exact, null, 'no account is named "acetyl": Create is offered, under the matches');
    }
});

test('the picker, "texas city": the six sites — in the deal window each leads to its parent, where it found none before', () => {
    const six = ['Ashland - Texas City · site of Ashland Global', 'Dow - Texas City · site of Dow', 'Ineos Acetyls - Texas City · site of INEOS Acetyls',
        'INEOS Aromatics - Texas City · site of INEOS - Aromatics', 'INEOS Inovyn - Texas City · site of INEOS - Inovyn', 'INEOS Styrolution - Texas City · site of INEOS - Styrolution'];
    assert.deepEqual(rowsOf('texas city', RAILS).shown.map(row), six);
    const deal = rowsOf('texas city', DEAL);
    assert.deepEqual(deal.shown.map((r) => row({ ...r, via: null })), six);
    assert.deepEqual(deal.shown.map((r) => r.via?.name), ['Ashland Global', 'Dow', 'INEOS Acetyls', 'INEOS - Aromatics', 'INEOS - Inovyn', 'INEOS - Styrolution']);
    assert.equal(matchSearch(LINKED.filter(notSite), 'texas city', byName).shown.length, 0, 'as it was: the deal window found none of the six');
    assert.equal(deal.exact, null);
});

test('the picker, "Ineos Acetyls - Texas City" (as Jeff named it): the site\'s own row, and no Create — in the deal window, a way to INEOS Acetyls', () => {
    const typed = 'Ineos Acetyls - Texas City';
    const rails = rowsOf(typed, RAILS);
    assert.deepEqual(rails.shown.map(row), ['Ineos Acetyls - Texas City · site of INEOS Acetyls']);
    assert.equal(rails.exact?.name, typed);
    const deal = rowsOf(typed, DEAL);
    assert.deepEqual(deal.shown.map(row), ['Ineos Acetyls - Texas City · site of INEOS Acetyls ⇒ INEOS Acetyls'],
        'picking it fills Account with INEOS Acetyls and Site Name with the site (AccountPicker → onSelectSite)');
    assert.equal(deal.exact?.name, typed, 'the exact runs over every account, any tier: the site\'s name offers no Create');
    assert.equal(deal.unlisted, null, 'its row offers it');
    assert.equal(LINKED.filter(notSite).filter((a) => searchKey(a.name) === searchKey(typed)).length, 0,
        'as it was: over the rows the deal window kept it found none, and offered to create the site as an account');
});

test('the picker, "ashland global" (Jeff, 9 Oct: a sub-account is also found by its parent\'s name, "listed below own-name matches"): in the rails the site below the account; in the deal window the account alone', () => {
    assert.deepEqual(rowsOf('ashland global', RAILS).shown.map(row), ['Ashland Global', 'Ashland - Texas City · site of Ashland Global']);
    assert.deepEqual(rowsOf('ashland global', DEAL).shown.map(row), ['Ashland Global'], 'a site in the deal window only by its own name');
    assert.equal(rowsOf('ashland global', DEAL).exact?.name, 'Ashland Global');
});

test('the picker: a kept row is found by its parent\'s name, below every row its own name answers; a site in the deal window only by its own', () => {
    const PLANTS = [
        { id: 'd', name: 'Dow', accountTier: 'account', parentAccountId: null },
        { id: 'f', name: 'Dow - Freeport', accountTier: 'business_unit', parentAccountId: 'd' },
        { id: 'g', name: 'Gulf Coast Unit', accountTier: 'business_unit', parentAccountId: 'd' },
        { id: 't', name: 'Texas City Terminal', accountTier: 'site', parentAccountId: 'd' },
    ];
    const t = (q, mode) => pickerRows(PLANTS, q, mode).shown.map(row);
    assert.deepEqual(t('dow', RAILS), ['Dow', 'Dow - Freeport · unit of Dow', 'Gulf Coast Unit · unit of Dow', 'Texas City Terminal · site of Dow']);
    assert.deepEqual(t('dow', DEAL), ['Dow', 'Dow - Freeport · unit of Dow', 'Gulf Coast Unit · unit of Dow'], 'not the site: its own name lacks "dow"');
    assert.deepEqual(t('dow texas', RAILS), ['Texas City Terminal · site of Dow']);
    assert.deepEqual(t('dow texas', DEAL), []);
    assert.deepEqual(t('terminal', DEAL), ['Texas City Terminal · site of Dow ⇒ Dow']);
});

test('the picker: no site row without viaParents or a query, nor for a parent outside the list; a null row, a map from the host', () => {
    assert.deepEqual(rowsOf('texas city', DEAL, { viaParents: false }).shown, [], 'a host with no onSelectSite');
    const blank = rowsOf('', DEAL);
    assert.deepEqual(names(blank.shown.map((r) => r.account)), names(LINKED.filter(notSite)), 'nothing typed: the kept accounts as they came');
    assert.equal(blank.exact, null);
    assert.equal(blank.unlisted, null);
    const site = { id: 's', name: 'Acme West - Plant 1', accountTier: 'site', parentAccountId: 'u' };
    assert.deepEqual(pickerRows([site], 'plant', DEAL).shown, [], "a parent outside the list (a rep's scope) leads nowhere");
    assert.deepEqual(pickerRows([site], 'plant', RAILS).shown.map(row), ['Acme West - Plant 1'], 'in the rails it is listed, with no parent to name');
    assert.deepEqual(pickerRows([null, site], 'plant', RAILS).shown.length, 1);
    assert.deepEqual(pickerRows(null, 'plant', RAILS), { shown: [], more: 0, exact: null, unlisted: null });
    const byId = new Map(LINKED.map((a) => [a.id, a]));
    assert.deepEqual(rowsOf('ineos', DEAL, { byId }), rowsOf('ineos', DEAL), "the host's map gives the same rows");
});

test('the name typed in full is listed first, before the cut, in both modes: in the deal window a site typed in full is not pushed past fifty kept rows', () => {
    const holdings = { id: 'h', name: 'Houston Holdings', accountTier: 'account', parentAccountId: null };
    const sixty = Array.from({ length: 60 }, (_, i) => ({ id: `k${i}`, name: `Houston ${String(i).padStart(2, '0')}`, accountTier: 'account', parentAccountId: null }));
    const site = { id: 's', name: 'Houston', accountTier: 'site', parentAccountId: 'h' };
    const list = [site, ...sixty, holdings];   // the GET's order
    const deal = pickerRows(list, 'houston', DEAL);
    assert.deepEqual([deal.shown.length, deal.more], [50, 12], '61 accounts and the site: fifty drawn, twelve more');
    assert.equal(row(deal.shown[0]), 'Houston · site of Houston Holdings ⇒ Houston Holdings', 'the site typed in full first, picking its parent');
    assert.deepEqual(deal.shown.slice(1, 3).map(row), ['Houston 00', 'Houston 01'], 'then the accounts, as ranked');
    assert.equal(deal.exact, site);
    assert.equal(deal.unlisted, null, 'drawn, so no line');
    const rails = pickerRows(list, 'houston', RAILS);
    assert.equal(row(rails.shown[0]), 'Houston · site of Houston Holdings');
    assert.deepEqual([rails.shown.length, rails.more, rails.exact], [50, 12, site]);
    assert.equal(row(pickerRows(list, 'houston', { ...DEAL, limit: 1 }).shown[0]), 'Houston · site of Houston Holdings ⇒ Houston Holdings', 'even in a list of one');
    assert.deepEqual(pickerRows(list, 'houston 0', DEAL).shown.slice(0, 2).map(row), ['Houston 00', 'Houston 01'], 'no name typed in full: the order as ranked');
});

// The account picker's gate, read from the file: the list opens when it has rows, offers
// Create, or names what it cannot offer.
const PICKER = 'src/components/rails/AccountPicker.jsx';
const gateOf = (src) => {
    const m = /\n\s*\{(open && .*) && \(\n/.exec(src);
    assert.ok(m, "the picker's gate");
    return new Function('open', 'typedKey', 'shown', 'exact', 'unlisted', 'value', `return !!(${m[1]});`);
};

test("the deal window, a site's exact name whose account is not in the list (a rep's scope): the list opens to say it is a site — no Create, never nothing; a twin of the name drawn as a row says nothing of the kind", () => {
    const gate = gateOf(read(PICKER));
    const open = (accounts, q, mode) => { const r = pickerRows(accounts, q, mode); return { r, drawn: gate(true, searchKey(q), r.shown, r.exact, r.unlisted, q) }; };
    const shell = { id: 'k', name: 'Shell', accountTier: 'account', parentAccountId: null };
    const site = { id: 's', name: 'Shell - Port Allen', accountTier: 'site', parentAccountId: 'another_reps_unit' };
    const lone = open([shell, site], 'Shell - Port Allen', DEAL);
    assert.deepEqual(lone.r.shown, [], 'no row can offer it');
    assert.equal(lone.r.exact, site, 'its name is taken: no Create');
    assert.equal(lone.r.unlisted, site, 'so the picker names it');
    assert.equal(lone.drawn, true, 'the list opens, to say so (it drew nothing at all before)');
    const linked = { ...site, parentAccountId: 'k' };
    assert.equal(open([shell, linked], 'Shell - Port Allen', DEAL).r.unlisted, null, 'its account in the list: its row leads there');
    assert.equal(open([shell, site], 'Shell - Port Allen', RAILS).r.unlisted, null, 'in the rails it is its own row');
    assert.equal(open([shell, site], 'shell', DEAL).r.unlisted, null, 'Shell is listed');
    // two accounts of one name, in either order (the GET orders by name only) — UKG's two
    // "Shell - Port Allen" under Shell, a business unit and a site: the unit's row is drawn and
    // is the name typed, and no line calls the name a site
    const unit = { id: 'u', name: 'Shell - Port Allen', accountTier: 'business_unit', parentAccountId: 'k' };
    for (const twins of [[shell, site, unit], [shell, unit, site]]) {
        const order = twins.map((a) => a.id).join(' ');
        const deal = open(twins, 'Shell - Port Allen', DEAL);
        assert.deepEqual(deal.r.shown.map(row), ['Shell - Port Allen · unit of Shell'], `the deal window, ${order}`);
        assert.equal(deal.r.exact, unit, `the account a drawn row offers is the name typed (${order})`);
        assert.equal(deal.r.unlisted, null, `a row offers the name: no "is a site" line (${order})`);
        assert.equal(deal.drawn, true);
        const rails = open(twins, 'Shell - Port Allen', RAILS);
        assert.deepEqual(rails.r.shown.map((r) => r.account.id), twins.slice(1).map((a) => a.id), `the rails: both rows, in the list's order (${order})`);
        assert.equal(rails.r.exact, rails.r.shown[0].account);
        assert.equal(rails.r.unlisted, null);
    }
    const none = open([shell], 'Chevron', DEAL);
    assert.equal(none.drawn, true, 'no match at all: the list opens to offer Create');
    assert.equal(open([shell], ' - ', DEAL).drawn, false, 'only punctuation typed: nothing');
    assert.equal(open([shell], 'shell', DEAL).drawn, true);
    assert.ok(read(PICKER).includes(`{unlisted && <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{\`${U('201c')}\${unlisted.name}${U('201d')} is a site ${U('2014')} pick the account it belongs to\`}</div>}`),
        'the line it draws');
});

test('viaParent: a record the picker keeps, a parent outside the list, a parent left out too — none leads anywhere', () => {
    const acct = { id: 'a', name: 'Acme', accountTier: 'account', parentAccountId: null };
    const unit = { id: 'u', name: 'Acme West', accountTier: 'business_unit', parentAccountId: 'a' };
    const site = { id: 's', name: 'Acme West - Plant 1', accountTier: 'site', parentAccountId: 'u' };
    const dock = { id: 'd', name: 'Plant 1 - Dock', accountTier: 'site', parentAccountId: 's' };
    const byId = new Map([acct, unit, site, dock].map((r) => [r.id, r]));
    assert.equal(viaParent(site, byId, notSite), unit);
    assert.equal(viaParent(unit, byId, notSite), null, 'a record the picker keeps is picked as itself');
    assert.equal(viaParent(dock, byId, notSite), null, 'a parent the picker leaves out too');
    assert.equal(viaParent(site, new Map([[site.id, site]]), notSite), null, "a parent outside the list (a rep's scope)");
    assert.equal(viaParent(site, byId, null), null, 'a picker that keeps everything');
    assert.equal(viaParent(null, byId, notSite), null);
});

test('an apostrophe and an accent are not what a search reads', () => {
    const t = (xs, q) => matchSearch(xs, q).shown;
    assert.deepEqual(t(["O'Brien Supply", 'Obi Co'], 'obrien'), ["O'Brien Supply"]);
    assert.deepEqual(t(['O’Brien Supply', 'Obi Co'], "o'brien"), ['O’Brien Supply']);
    assert.deepEqual(t(['Crème Brûlée, Inc.', 'Cream Co'], 'creme brulee'), ['Crème Brûlée, Inc.']);
    assert.deepEqual(t(['ÉVONIK Lafayette', 'Evolve Co'], 'evonik'), ['ÉVONIK Lafayette']);
});

test('nothing typed: the list as it came, in its own order, cut and counted — a field that lists on focus still does', () => {
    const list = ['Zed', 'Alpha', 'Mid'];
    assert.deepEqual(matchSearch(list, ''), { shown: ['Zed', 'Alpha', 'Mid'], more: 0 });
    assert.deepEqual(matchSearch(list, '  - '), { shown: ['Zed', 'Alpha', 'Mid'], more: 0 });
    assert.deepEqual(matchSearch(list, undefined, { limit: 2 }), { shown: ['Zed', 'Alpha'], more: 1 });
    assert.notEqual(rankMatches(list, ''), list, 'a copy, never the caller\'s array');
});

test('the cut is counted; what is not a list is empty; a nameless row matches nothing typed', () => {
    assert.deepEqual(capMatches(['a', 'b', 'c'], 2), { shown: ['a', 'b'], more: 1 });
    assert.deepEqual(capMatches(['a'], 2), { shown: ['a'], more: 0 });
    assert.deepEqual(capMatches(null), { shown: [], more: 0 });
    assert.deepEqual(matchSearch(undefined, 'x'), { shown: [], more: 0 });
    const many = Array.from({ length: 60 }, (_, i) => `Sam ${String(i).padStart(2, '0')}`);
    assert.equal(matchSearch(many, 'sam').more, 10);
    assert.deepEqual(matchSearch([{ name: null }, { name: 'Nina' }], 'n', byName).shown.map((x) => x.name), ['Nina']);
    assert.deepEqual(matchSearch(['Ann', 'Bo'], 'zz'), { shown: [], more: 0 });
});

// ── the sites — pinned ─────────────────────────────────────────────────────

const HOLD = 'onMouseDown={e => e.preventDefault()}';
const MORE = (n, pad = '6px 10px') => `{${n} > 0 && <div ${HOLD} style={{ padding: '${pad}', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{${n}} more — keep typing</div>}`;
const STICK = (n, bg = "'inherit'", pad = '6px 10px') => `{${n} > 0 && <div ${HOLD} style={{ position: 'sticky', bottom: 0, background: ${bg}, padding: '${pad}', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{${n}} more — keep typing</div>}`;

test("the account picker draws pickerRows: the deal window's filter and its site rows, each row's parent, the count, a name it cannot offer and Create in view, a site row picking its parent", () => {
    const p = read(PICKER);
    assert.ok(p.includes("import { pickerRows, searchKey } from '../../utils/searchMatch.js';"));
    assert.ok(p.includes('export default function AccountPicker({ value, onChange, onSelectAccount, onSelectSite, onError, placeholder, filterFn }) {'));
    assert.ok(p.includes('    const typedKey = searchKey(value);'));
    assert.ok(p.includes('const byId = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);'), 'one map per accounts change');
    assert.ok(p.includes('    const { shown, more, exact, unlisted } = open && typedKey\n'
        + '        ? pickerRows(accounts, value, { keep: filterFn, viaParents: !!onSelectSite, byId })\n'
        + '        : { shown: [], more: 0, exact: null, unlisted: null };'), "the host's filter is applied, and a site row offered only to a host that takes one");
    assert.ok(p.includes('    const pick = (acc, via = null) => {\n        onChange(via ? via.name : acc.name);\n        if (via) onSelectSite(acc, via);\n        else if (onSelectAccount) onSelectAccount(acc);\n        setOpen(false);\n    };'),
        'a site row picks its parent, and names itself the site');
    assert.ok(p.includes('{open && !!typedKey && (shown.length > 0 || !exact || !!unlisted) && ('), 'only punctuation typed offers nothing, Create included');
    assert.ok(p.includes('{shown.map(({ account: a, parent, via }) => (\n                        <div key={a.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(a, via)}'));
    assert.ok(p.includes("{parent && <span style={{ color: T.inkMuted }}>{` · ${a.accountTier === 'site' ? 'site of' : a.accountTier === 'business_unit' ? 'unit of' : 'in'} ${parent.name}`}</span>}"));
    assert.ok(p.includes(`<div ${HOLD} style={{ position: 'sticky', bottom: 0, background: 'inherit' }}>\n                        ${MORE('more')}\n                        {unlisted && <div`),
        'the count and what follows stay in view at the foot of fifty rows, and a press on them keeps the focus in the field');
    assert.ok(p.includes("</div>}\n                        {!exact && (\n"), 'Create follows, in the same foot');
    assert.ok(p.includes(`\`${U('2795')} \${shown.length ? 'None of these ${U('2014')} create' : 'Create'} ${U('201c')}\${(value || '').trim()}${U('201d')} as a new account\``), 'Create comes after the matches, and says so');
    assert.ok(!p.includes('filtered') && !/\.slice\(/.test(code(p)), 'one list, cut once, by pickerRows');
    // what older harness entries anchor on is where it was
    assert.ok(p.includes("import { T } from '../../tokens.js';"));
    assert.ok(p.includes("            if (!stillOrg(askedOrg)) return;\n            if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));"));
});

test('the deal window: a site row fills Account with its parent and Site Name with itself; a site is still never the account', () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    assert.ok(m.includes("onSelectSite={(site, parent) => { setAccountSearch(parent.name); setFormData(prev => ({ ...prev, account: parent.name, accountId: parent.id, site: site.name })); setSiteSearch(site.name); setShowSiteSuggestions(false); setValidationErrors(prev => { const n = { ...prev }; delete n.account; return n; }); }}"));
    assert.ok(m.includes("filterFn={(a) => a.accountTier !== 'site'}"), 'the deal window leaves out sites');
});

test('a list that scrolls keeps its count in view: the line sticks to its foot, and a press on it keeps the focus', () => {
    const count = (src, s) => src.split(s).length - 1;
    for (const [f, n] of [['ActivityRail', 2], ['TaskRail', 2], ['AccountRail', 1], ['ContactRail', 1]]) {
        const src = read(`src/components/rails/${f}.jsx`);
        assert.ok(between(src, 'function Typeahead(', '\n}\n').includes(STICK('more')), `${f}: the type-ahead's count`);
        assert.equal(count(src, STICK('more')), n, `${f}: every list it draws`);
    }
    assert.ok(between(read('src/components/rails/ActivityRail.jsx'), 'function ContactMultiSelect(', '\n}\n').includes(STICK('more')), "the activity rail's contacts");
    assert.equal(count(read('src/Tabs/TasksTab.jsx'), STICK('more', 'T.surface', '6px 12px')), 1, "the Tasks tab's contact picker");
    assert.equal(count(read('src/Tabs/ReportsTab.jsx'), STICK('oppsMore', 'T.surface', '6px 12px')), 1, "Reports' deal picker");
    assert.ok(between(read('src/components/documents/atoms.jsx'), 'export function PeopleChooser(', '\n}\n').includes(STICK('more', 'T.surface')), 'the document share picker');
});

test("the rails' four type-aheads and two contact lists ask the matcher, while their list is open", () => {
    const act = read('src/components/rails/ActivityRail.jsx');
    const task = read('src/components/rails/TaskRail.jsx');
    const NONE = '{ shown: [], more: 0 }';
    for (const [file, src, line] of [
        ['ActivityRail', act, `const { shown, more } = open && (searchKey(value) || !(value || '').trim()) ? matchSearch(suggestions, value) : ${NONE};`],
        ['TaskRail', task, `const { shown, more } = open ? matchSearch(suggestions, value) : ${NONE};`],
        ['AccountRail', read('src/components/rails/AccountRail.jsx'), `const { shown, more } = open ? matchSearch(suggestions, safeVal) : ${NONE};`],
        ['ContactRail', read('src/components/rails/ContactRail.jsx'), `const { shown, more } = open ? matchSearch(suggestions, safeVal) : ${NONE};`]]) {
        const ta = between(src, 'function Typeahead(', '\n}\n');
        assert.ok(ta.includes(line), `${file}: the matcher, while open`);
        assert.ok(ta.includes('{shown.map((s, i) => ('), `${file}: what it shows`);
        assert.equal(src.split('function Typeahead(').length - 1, 1, `${file}: one type-ahead`);
    }
    assert.ok(act.includes(`import { matchSearch, searchKey } from '../../utils/searchMatch.js';`));
    assert.ok(act.includes(`const { shown: suggestions, more } = open ? matchSearch((contacts || []).filter(c => !selected.includes(c.id)), query, { text: nameOf, also: c => [c.company] }) : ${NONE};`));
    assert.ok(task.includes("const { shown: matched, more } = matchSearch((contacts || []).filter(c => !alreadyIds.has(c.id)), contactSearch, { text: c => `${c.firstName || ''} ${c.lastName || ''}`, also: c => [c.company] });"));
});

test("a field that waits for typing waits for a word: the header's search and the quick log read only punctuation as nothing typed", () => {
    const h = read('src/components/layout/AppHeader.jsx');
    assert.ok(h.includes("import { matchSearch, searchKey } from '../../utils/searchMatch.js';"));
    assert.ok(h.includes('                        {!searchKey(globalSearch) ? (\n'), '"-" shows "Start typing…", not five of each');
    assert.ok(!h.includes('globalSearch.length === 0'));
    const ql = read('src/components/layout/QuickLogFab.jsx');
    assert.ok(ql.includes("import { rankMatches, capMatches, searchKey } from '../../utils/searchMatch.js';"));
    assert.ok(ql.includes('if (!searchKey(q)) { setQuickLogContactResults([]); return; }'), '"-" lists no contact');
});

test("the header's search, the quick log, the deal window's mentions, Reports, Tasks and Dispatch ask the matcher — the grouped boxes at the sizes Jeff kept", () => {
    const h = read('src/components/layout/AppHeader.jsx');
    assert.ok(h.includes("const { shown: mA, more: moreA } = matchSearch(accounts, globalSearch, { text: a => a.name, also: a => [a.accountOwner], limit: 5 });"),
        'five a group (Jeff, 9 Oct, told the box scrolls: "Keep 5 per group")');
    assert.ok(h.includes("const { shown: mC, more: moreC } = matchSearch(contacts, globalSearch, { text: c => (c.firstName||'')+' '+(c.lastName||''), also: c => [c.company, c.email], limit: 5 });"));
    assert.ok(h.includes('const { shown: mO, more: moreO } = matchSearch(opportunities, globalSearch, { text: o => o.opportunityName || o.account, also: o => [o.account], limit: 5 });'));
    const ql = read('src/components/layout/QuickLogFab.jsx');
    assert.ok(ql.includes("setQuickLogContactResults(rankMatches(contacts || [], q, (c) => (c.firstName || '') + ' ' + (c.lastName || ''), (c) => [c.company, c.email]));"), 'every match kept, best first');
    assert.ok(ql.includes('const { shown: quickLogShown, more: quickLogMore } = capMatches(quickLogContactResults, 6);'), 'six drawn: its box does not scroll');
    assert.ok(ql.includes('{quickLogShown.map((c, idx) => {'));
    const m = read('src/components/modals/OpportunityModal.jsx');
    assert.ok(m.includes('const { shown: filteredMentions, more: moreMentions } = capMatches(mentionQuery !== null ? teamMembers.filter(m => m.toLowerCase().startsWith(mentionQuery.toLowerCase())) : [], 6);'),
        'a mention keeps its prefix match and its six until Jeff decides (OPEN_ITEMS §4.8)');
    assert.ok(!m.includes('allAccountOptions'), 'the account list nothing read is gone');
    const r = read('src/Tabs/ReportsTab.jsx');
    assert.ok(r.includes("const { shown: shownOpps, more: oppsMore } = matchSearch(visibleOpps, oppSearch, { text: o => `${o.account || ''} ${o.opportunityName || o.name || ''}` });"));
    assert.ok(!between(r, 'const visibleOpps = (opportunities || []).filter(o => {', '});').includes('oppSearch'), 'the rep\'s deals, not the search: the chosen deal stays while another is sought');
    assert.ok(r.includes('{shownOpps.map(o => ('));
    assert.ok(read('src/Tabs/TasksTab.jsx').includes("const { shown: filtered, more } = matchSearch(contacts.filter(c => !existingIds.has(c.id)), query, { text: c => `${c.firstName || ''} ${c.lastName || ''}`, also: c => [c.company] });"));
    const d = read('src/Tabs/DispatchTab.jsx');
    assert.ok(d.includes('    const byName = { text: x => x.name, limit: 6 };'), 'six a group (Jeff, 9 Oct: "Keep 6 per group")');
    assert.ok(d.includes('const { shown: custMatches, more: custMore } = matchSearch(customers, query, byName);'));
    assert.ok(d.includes('const { shown: acctMatches, more: acctMore } = matchSearch((accounts || [])'));
    // Its field lists on focus (it never waited for typing), so only punctuation typed reads as
    // nothing typed: the first six of each group and their counts, as the empty field lists them
    // (the old filter listed only names holding "-"). Its exact check and its Create are as they were.
    const field = between(d, 'const CustomerTypeahead = (', '// ── Score badge');
    assert.ok(field.includes('onFocus={() => setOpen(true)}'), 'it lists on focus');
    assert.ok(field.includes('const exact = [...(customers || []), ...(accounts || [])]'), 'its exact check is as it was');
    assert.ok(field.includes(".some(x => (x.name || '').trim().toLowerCase() === q);"), 'raw lower case, as it was');
    assert.ok(field.includes('const showCreate = q.length > 0 && !exact;'), 'and its Create');
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `d${i}`, name: i % 3 ? `Acme ${i}` : `Acme - West ${i}` }));
    const six = { text: (x) => x.name, limit: 6 };
    assert.deepEqual(matchSearch(nine, '-', six), matchSearch(nine, '', six), '"-" lists as the empty field does');
    assert.equal(matchSearch(nine, '-', six).more, 3);
});

test("the document share picker is the class's: the matcher, fifty, a word to open on, and its count held at the list's foot", () => {
    const people = [{ id: 'a', name: 'Abe Brook' }, { id: 'b', name: 'Bob Zed' }, { id: 'c', name: 'Cara Diaz' }];
    assert.deepEqual(peopleMatching(people, 'b', []).shown.map((p) => p.id), ['b', 'a'], 'best first: a name that starts with it, then one with a word that does');
    assert.deepEqual(peopleMatching(people, 'diaz cara', []).shown.map((p) => p.id), ['c'], 'every word, in any order');
    assert.deepEqual(peopleMatching(people, 'b', ['b']).shown.map((p) => p.id), ['a'], 'one chosen already is not offered');
    assert.deepEqual(peopleMatching(people, ' - ', []), { shown: [], more: 0 }, 'only punctuation typed offers no one');
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `usr_${i}`, name: `Sam ${String(i).padStart(2, '0')}` }));
    assert.deepEqual([peopleMatching(many, 'sam', []).shown.length, peopleMatching(many, 'sam', []).more], [SEARCH_LIMIT, 10], 'fifty: its list scrolls');
    const atoms = read('src/components/documents/atoms.jsx');
    const chooser = between(atoms, 'export function PeopleChooser(', '\n}\n');
    assert.ok(atoms.includes("import { searchKey } from '../../utils/searchMatch.js';"));
    assert.ok(chooser.includes('onChange={(e) => { setQuery(e.target.value); setOpen(!!searchKey(e.target.value)); }}'), 'it opens for a word, not for punctuation alone');
    assert.ok(chooser.includes('onFocus={() => setOpen(!!searchKey(query))}'));
    assert.ok(chooser.includes(STICK('more', 'T.surface')), 'a press on the count keeps the focus, so the list stays open');
    assert.ok(read('src/utils/documentPeople.js').includes('    return matchSearch(offered, query, { text: (p) => p.name, limit });'));
});

test('the suites: this file is graded by the harness', () => {
    assert.ok(read('scripts/mutate-import.mjs').includes(' tests/search-match.test.mjs'));
});

// ── THE GUARDS ──────────────────────────────────────────────────────────────

const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const kids = (n) => Object.entries(n).filter(([k]) => !SKIP.has(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v])).filter((v) => v && typeof v.type === 'string');
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'Program']);
// Every node, with the functions around it (the file first) and its ancestors.
const visit = (n, f, fns = [], anc = []) => { const here = FN.has(n.type) ? [...fns, n] : fns; f(n, here, anc); for (const c of kids(n)) visit(c, f, here, [...anc, n]); };
const TREES = new Map();   // a file is parsed once, whichever guard reads it first (the harness runs this file for every mutant)
const tree = (src) => { if (!TREES.has(src)) TREES.set(src, parse(src, { sourceType: 'module', plugins: ['jsx'] }).program); return TREES.get(src); };
const isMethod = (n, name) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === name;
const isCallOf = (n, names) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && names.has(n.callee.name);
const MATCHER = new Set(['matchSearch', 'capMatches', 'rankMatches', 'pickerRows']);
const COUNTED = new Set(['matchSearch', 'capMatches', 'pickerRows']);   // the calls that answer { shown, more }
// A filter on typed text: a substring test (includes, startsWith, indexOf) on a case-folded text.
const FOLD = new Set(['toLowerCase', 'toLocaleLowerCase', 'searchKey']);
const folds = (n) => { let hit = false; visit(n, (m) => { if (m.type === 'CallExpression' && ((m.callee.type === 'MemberExpression' && !m.callee.computed && FOLD.has(m.callee.property.name)) || (m.callee.type === 'Identifier' && FOLD.has(m.callee.name)))) hit = true; }); return hit; };
const TEXT_TEST = new Set(['includes', 'startsWith', 'indexOf']);
const testsTyped = (fn) => { let hit = false; visit(fn, (n) => { if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && TEXT_TEST.has(n.callee.property.name) && folds(n.callee.object)) hit = true; }); return hit; };

// G1: every `.slice(0, n)` of typed-text matches — a filter as above, or the matcher's own
// answer — followed through the names it was built under, in scope. It reads declarations
// (a name, or an object pattern), so a list held in React state (an array pattern from
// useState) is out of its sight: G1_BLIND names what that hides.
function silentCuts(src) {
    const program = tree(src);
    const decls = new Map();   // a function (or the file) → name → [{ init, fns }]
    const add = (owner, name, init, fns) => {
        if (!decls.has(owner)) decls.set(owner, new Map());
        const m = decls.get(owner);
        if (!m.has(name)) m.set(name, []);
        m.get(name).push({ init, fns });
    };
    visit(program, (n, fns) => {
        const owner = fns[fns.length - 1];
        if (n.type === 'VariableDeclarator' && n.init) {
            if (n.id.type === 'Identifier') add(owner, n.id.name, n.init, fns);
            if (n.id.type === 'ObjectPattern') for (const p of n.id.properties) if (p.type === 'ObjectProperty' && p.value.type === 'Identifier') add(owner, p.value.name, n.init, fns);
        }
        if (n.type === 'FunctionDeclaration' && n.id) add(fns[fns.length - 2], n.id.name, n.body, fns);
    });
    const resolve = (name, fns) => {
        for (let i = fns.length - 1; i >= 0; i--) { const m = decls.get(fns[i]); if (m && m.has(name)) return m.get(name); }
        return [];
    };
    const typedList = (expr, fns) => {
        const seen = new Set();
        let hit = false;
        const returns = (body, chain) => visit(body, (r, inner) => { if (r.type === 'ReturnStatement' && r.argument) go(r.argument, [...chain, ...inner]); });
        const go = (n, chain) => {
            if (hit || !n) return;
            if (isCallOf(n, MATCHER) || (isMethod(n, 'filter') && n.arguments[0] && testsTyped(n.arguments[0]))) { hit = true; return; }
            if (n.type === 'Identifier') {
                for (const d of resolve(n.name, chain)) if (!seen.has(d.init)) { seen.add(d.init); go(d.init, d.fns); }
                return;
            }
            if (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') {   // a function is the list it returns
                if (n.body.type === 'BlockStatement') returns(n.body, [...chain, n]); else go(n.body, [...chain, n]);
                return;
            }
            if (n.type === 'BlockStatement') { returns(n, chain); return; }
            for (const c of kids(n)) go(c, chain);
        };
        go(expr, fns);
        return hit;
    };
    const out = [];
    visit(program, (n, fns) => {
        if (isMethod(n, 'slice') && n.arguments.length === 2 && n.arguments[0].type === 'NumericLiteral' && n.arguments[0].value === 0
            && typedList(n.callee.object, fns)) out.push({ line: n.loc.start.line, text: src.slice(n.start, n.end).replace(/\s+/g, ' ') });
    });
    return out;
}

// G2: every matchSearch / capMatches / pickerRows keeps its count and draws it — in the
// function that asked — on a line a press on which keeps the focus in the field. A named
// function that hands the answer back as it is (`return matchSearch(…)`) passes its count
// on: its callers are held instead (documentPeople.js's peopleMatching → PeopleChooser).
const MORE_LINE = (name) => new RegExp(`\\{${name} > 0 && <div onMouseDown=\\{e => e\\.preventDefault\\(\\)\\} style=\\{\\{[^}]*\\}\\}>\\{${name}\\} more — keep typing</div>\\}`);
function g2(src, counted = COUNTED) {
    const out = [];
    const relays = [];
    visit(tree(src), (n, fns, anc) => {
        if (!isCallOf(n, counted)) return;
        let i = anc.length - 1;
        let child = n;
        while (i >= 0 && (anc[i].type === 'ConditionalExpression' || anc[i].type === 'LogicalExpression')) { child = anc[i]; i--; }
        const up = anc[i];
        const fn = fns[fns.length - 1];
        if (up && (up.type === 'ReturnStatement' || (up.type === 'ArrowFunctionExpression' && up.body === child))) {
            const owner = anc[anc.indexOf(fn) - 1];
            const name = fn.type === 'FunctionDeclaration' ? fn.id?.name : owner?.type === 'VariableDeclarator' && owner.id.type === 'Identifier' ? owner.id.name : null;
            if (name) relays.push(name); else out.push(`${n.loc.start.line}: the count is handed back by a function with no name`);
            return;
        }
        const prop = up && up.type === 'VariableDeclarator' && up.id.type === 'ObjectPattern'
            && up.id.properties.find((p) => p.type === 'ObjectProperty' && !p.computed && p.key.name === 'more' && p.value.type === 'Identifier');
        if (!prop) { out.push(`${n.loc.start.line}: the count is not kept`); return; }
        if (!MORE_LINE(prop.value.name).test(code(src.slice(fn.start, fn.end)))) out.push(`${n.loc.start.line}: ${prop.value.name} is not drawn`);
    });
    return { out, relays };
}
const unannounced = (src, counted) => g2(src, counted).out;
const callsAny = (src, names) => new RegExp(`\\b(${[...names].join('|')})\\(`).test(code(src));

const SRC = (() => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            if (e.isDirectory()) walk(`${dir}${e.name}/`);
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(`${dir}${e.name}`);
        }
    };
    walk('src/');
    return out;
})();

// What G1 finds and is right, each with its reason. A key is the file and the cut.
const G1_ALLOWED = [
    ['src/components/modals/ContactModal.jsx', 'filtered.slice(0, 8)', 'never rendered: ContactRail replaced it (ModalLayer.jsx); App.jsx imports it and draws nothing (OPEN_ITEMS §4.1)'],
];
// What G1 cannot see (a list held in React state), named so its sight is not overstated:
// the duplicate warnings cut a typed name's near matches at three, unranked and silent —
// recorded in OPEN_ITEMS §4.8, not held by this file.
const G1_BLIND = [
    ['src/components/rails/AccountRail.jsx', 'dupWarning.slice(0, 3)'],
    ['src/components/rails/ContactRail.jsx', 'dupWarning.slice(0, 3)'],
];

test('G1: no list of typed-text matches under src is cut without its count — but what is named here, with its reason', () => {
    assert.ok(SRC.length > 150, `the walk reached the tree (${SRC.length})`);
    // only a file that cuts a list is parsed (the harness runs this file for every mutant)
    const hits = SRC.filter((f) => /\.slice\(\s*0\s*,/.test(read(f))).flatMap((f) => silentCuts(read(f)).map((h) => ({ ...h, file: f })));
    const unexplained = hits.filter((h) => !G1_ALLOWED.some(([file, text]) => h.file === file && h.text === text));
    assert.deepEqual(unexplained.map((h) => `${h.file}:${h.line} ${h.text}`), [], 'draw the matcher\'s { shown, more } and its "N more — keep typing" line');
    for (const [file, text] of G1_ALLOWED) assert.ok(hits.some((h) => h.file === file && h.text === text), `stale allowance: ${file} ${text}`);
});

test('G1 cannot follow a list held in state: the duplicate warnings are there, unseen, and recorded', () => {
    for (const [file, text] of G1_BLIND) {
        const src = read(file);
        assert.ok(src.includes(text), `${file}: ${text} is gone — drop it here and from OPEN_ITEMS §4.8`);
        assert.ok(!silentCuts(src).some((h) => h.text === text), `${file}: G1 sees ${text} now — fix it, or name it in G1_ALLOWED`);
    }
});

test('G1 finds the cuts as they were (HEAD before §0.194), and leaves a cut of anything else alone', () => {
    const n = (src) => silentCuts(src).length;
    // AccountPicker: through the name it was built under
    assert.equal(n(`export default function AccountPicker({ value }) {
        const { accounts } = useApp();
        const q = (value || '').trim().toLowerCase();
        const list = (accounts || []).filter(a => true);
        const filtered = q ? list.filter(a => (a.name || '').toLowerCase().includes(q)) : list;
        return <div>{filtered.slice(0, 8).map((a) => <div key={a.id}>{a.name}</div>)}</div>;
    }`), 1);
    // a rail's type-ahead, and the activity rail's contact chain
    assert.equal(n(`function Typeahead({ value, suggestions }) {
        const filtered = (suggestions || []).filter(s => (s || '').toLowerCase().includes((value || '').toLowerCase()));
        return <div>{filtered.slice(0, 8).map((s, i) => <div key={i}>{s}</div>)}</div>;
    }`), 1);
    assert.equal(n(`function C({ contacts, q, selected }) { const s = (contacts || []).filter(c => !selected.includes(c.id))
        .filter(c => !q || nameOf(c).toLowerCase().includes(q)).slice(0, 8); return s; }`), 1);
    // the task rail's list inside a render function
    assert.equal(n('const X = () => <div>{show && (() => { const q = s.toLowerCase(); const matched = (contacts || []).filter(c => !ids.has(c.id) && (q === \'\' || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))).slice(0, 8); return <i/>; })()}</div>;'), 1);
    // Reports: a block-bodied filter, cut where it is drawn
    assert.equal(n(`function R() { const visibleOpps = (opportunities || []).filter(o => { if (!oppSearch) return true; const s = oppSearch.toLowerCase(); return (o.account||'').toLowerCase().includes(s); });
        return <div>{visibleOpps.slice(0,12).map(o => <i key={o.id}/>)}</div>; }`), 1);
    // the deal window's mentions (startsWith); Dispatch's helper function; the share picker's helper
    assert.equal(n('function M() { const filteredMentions = mentionQuery !== null ? teamMembers.filter(m => m.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6) : []; return filteredMentions; }'), 1);
    assert.equal(n(`const CustomerTypeahead = ({ customers, query }) => { const q = (query || '').trim().toLowerCase();
        const byName = (list) => (q ? list.filter(x => (x.name || '').toLowerCase().includes(q)) : list);
        const custMatches = byName(customers || []).slice(0, 6); return custMatches; };`), 1);
    assert.equal(n(`function peopleMatching(people, query, chosen = [], limit = 8) { const q = String(query || '').trim().toLowerCase();
        const hits = people.filter((p) => !chosen.includes(p.id) && p.name.toLowerCase().includes(q)); return { shown: hits.slice(0, limit), more: 0 }; }`), 1);
    // and the matcher's own answer, cut again
    assert.equal(n('function A({ list, q }) { const { shown } = matchSearch(list, q); return shown.slice(0, 8); }'), 1);
    assert.equal(n('function A({ list, q }) { return rankMatches(list, q).slice(0, 8); }'), 1);
    assert.equal(n('function A({ list, q }) { const { shown } = open ? pickerRows(list, q) : {}; return shown.slice(0, 8); }'), 1);
    // a cut of anything else
    assert.equal(n('function A({ selected, x }) { return selected.filter(id => id !== x).slice(0, 3); }'), 0, 'not typed text');
    assert.equal(n('function A({ contacts, o }) { return (contacts || []).filter(c => c.company?.toLowerCase() === (o.account || \'\').toLowerCase()).slice(0, 5); }'), 0, 'an equal company, not a search');
    assert.equal(n('function A({ a, b }) { return [...a.slice(0, 4), ...b.slice(0, 4)]; }'), 0);
    assert.equal(n('function A({ q }) { const list = rows.filter(r => r.name.toLowerCase().includes(q)); return list; } function B() { const list = []; return list.slice(0, 3); }'), 0, 'a name in another function is another list');
});

test('G2: every caller of the matcher — and of a function that hands its answer on — keeps the count and draws "N more — keep typing" where it asked', () => {
    const files = SRC.filter((f) => f !== 'src/utils/searchMatch.js').map((f) => [f, read(f)]);
    // the functions that hand the matcher's answer back as it is, to a fixed point
    const counted = new Set(COUNTED);
    for (let grew = true; grew;) {
        grew = false;
        for (const [, src] of files) if (callsAny(src, counted)) for (const name of g2(src, counted).relays) if (!counted.has(name)) { counted.add(name); grew = true; }
    }
    assert.deepEqual([...counted].filter((x) => !COUNTED.has(x)), ['peopleMatching'], 'the one function that hands the count on');
    const callers = files.filter(([, src]) => callsAny(src, counted));
    assert.deepEqual(callers.flatMap(([f, src]) => unannounced(src, counted).map((x) => `${f}:${x}`)), []);
    const direct = callers.filter(([, src]) => callsAny(src, COUNTED)).map(([f]) => f);
    assert.ok(direct.length >= 12, `the guard read the twelve files that ask the matcher (${direct.length})`);
    assert.ok(callers.some(([f]) => f === 'src/components/documents/atoms.jsx'), 'and the share picker, through peopleMatching');
});

test('G2 finds a count dropped, not kept, drawn elsewhere, handed back by a nameless function, or a line that takes the focus', () => {
    const LINE = `{more > 0 && <div ${HOLD} style={{ padding: '6px 10px' }}>{more} more — keep typing</div>}`;
    const at = (src, counted) => unannounced(src, counted);
    assert.deepEqual(at(`function A({ q, list }) { const { shown, more } = matchSearch(list, q); return <div>{shown.map(x => x)}${LINE}</div>; }`), []);
    assert.deepEqual(at(`function A({ q, list, open }) { const { shown, more } = open && q ? matchSearch(list, q) : { shown: [], more: 0 }; return <div>{shown}${LINE}</div>; }`), []);
    assert.deepEqual(at(`function A({ q, list, open }) { const { shown, more, exact } = open ? pickerRows(list, q) : { shown: [], more: 0, exact: null }; return <div>{shown}${LINE}</div>; }`), []);
    assert.equal(at('function A({ q, list }) { const { shown } = matchSearch(list, q); return <div>{shown.map(x => x)}</div>; }').length, 1, 'no count');
    assert.equal(at('function A({ q, list }) { const r = matchSearch(list, q); return r.shown; }').length, 1, 'not kept');
    assert.equal(at('function A({ q, list }) { return matchSearch(list, q).shown; }').length, 1, 'cut from the answer as it is returned');
    assert.equal(at('function A({ q, list }) { const { shown, more } = matchSearch(list, q); return <div>{shown.map(x => x)}</div>; }').length, 1, 'kept, not drawn');
    assert.equal(at(`function B({ more }) { return <div>${LINE}</div>; } function A({ q, list }) { const { shown, more } = capMatches(list, 6); return shown; }`).length, 1, 'drawn in another function');
    assert.equal(at('function A({ q, list }) { const { shown, more } = matchSearch(list, q); return <div>{/* {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ padding: 1 }}>{more} more — keep typing</div>} */}</div>; }').length, 1, 'a comment is not a line');
    assert.equal(at("function A({ q, list }) { const { shown, more } = pickerRows(list, q); return <div>{more > 0 && <div style={{ padding: 1 }}>{more} more — keep typing</div>}</div>; }").length, 1, 'a press on the line would take the focus from the field');
    // a function that hands the answer on passes the count to its callers
    assert.deepEqual(g2('export function f(list, q) { if (!q) return { shown: [], more: 0 }; return matchSearch(list, q); }'), { out: [], relays: ['f'] });
    assert.deepEqual(g2('const f = (list, q) => matchSearch(list, q);'), { out: [], relays: ['f'] });
    assert.equal(g2('export default function (list, q) { return matchSearch(list, q); }').out.length, 1, 'a nameless one cannot be followed');
    const withF = new Set([...COUNTED, 'f']);
    assert.deepEqual(at(`function A({ q, list }) { const { shown, more } = f(list, q); return <div>{shown}${LINE}</div>; }`, withF), []);
    assert.equal(at('function A({ q, list }) { const { shown, more } = f(list, q); return <div>{shown}</div>; }', withF).length, 1, "its caller still draws the count");
});
