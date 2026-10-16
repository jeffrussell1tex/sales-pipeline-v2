// tests/pick-link.test.mjs
//
// A pick is saved as the record picked (state §0.198; Jeff, 11 Oct 2026: "One match saves,
// two refuse").
//
// Before: every field that links a record through a list searched as it is typed saved the
// FIRST record of the name typed, not the row picked. ContactRail and ActivityRail took the
// first account of the name in lower case, in any tier; the deal window the same, a site
// included; TaskRail the first of the exact name, a cleared field keeping its old link;
// AccountRail's Parent the first of the name at the pick, the account itself included. UKG
// has two "Shell - Port Allen" under Shell, a business unit and a site, and the accounts GET
// orders by name only: picking the site could save the unit, and a field nobody touched
// moved its link on any Save.
//
// Here: the one rule every Save asks (src/utils/pickLink.js resolveLink), RUN on UKG's rows
// with the twins in both orders — untouched, held, empty, typed; the deal window's site
// typed in full (D5), out of reach (D11), or under an account no deal takes; merge-archived
// records (D12), and a name only they have, which names the record they were merged into;
// the refusals' one wording, "use Create" said exactly where the picker offers Create; the
// link a user can't open (D16); the deal rows' grey line (D9); and the account picker's part,
// pinned: the accounts it lists, Create only where the host allows it and never for a name
// merged away, why a name is left out, the list closed when the field loses the focus, and
// its hosts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    resolveLink, linkRefusal, siteOutOfReach, siteNotAccount, siteLine, survivorOf, MERGE_HOPS, isMergeArchived, unarchived, parentLabel, dealText, dealSubline,
    HIDDEN_ACCOUNT, HIDDEN_DEAL,
} from '../src/utils/pickLink.js';
import { pickerRows, viaParent } from '../src/utils/searchMatch.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');

// ── UKG's rows, as the pickers and the Saves read them ───────────────────────
const SHELL    = { id: 'k',  name: 'Shell', accountTier: 'account', parentAccountId: null };
const UNIT     = { id: 'u',  name: 'Shell - Port Allen', accountTier: 'business_unit', parentAccountId: 'k' };   // the stray copy: no deals, no contacts
const SITE     = { id: 's',  name: 'Shell - Port Allen', accountTier: 'site', parentAccountId: 'k' };            // the one with the two contacts
const INEOS    = { id: 'i',  name: 'INEOS', accountTier: 'account', parentAccountId: null };
const ACETYLS  = { id: 'ia', name: 'INEOS Acetyls', accountTier: 'business_unit', parentAccountId: 'i' };
const TEXAS    = { id: 'it', name: 'Ineos Acetyls - Texas City', accountTier: 'site', parentAccountId: 'ia' };
const EVONIK   = { id: 'e',  name: 'Evonik', accountTier: 'account', parentAccountId: null };
const LAF      = { id: 'el', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e' };
const LAF_GONE = { id: 'ea', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e', mergeArchived: true };   // merged away, and still in the GET
const NAMELESS = { id: 'n',  name: '', accountTier: 'account', parentAccountId: null };
// Only the twins' order matters (the GET orders by name, with no tiebreak): both are run.
const ORDERS = [[UNIT, SITE], [SITE, UNIT]].map((twins) => [EVONIK, LAF, LAF_GONE, INEOS, ACETYLS, TEXAS, NAMELESS, SHELL, ...twins]);
const ROWS = ORDERS[0];
const TWIN = 'Shell - Port Allen';
const notSite = (a) => a.accountTier !== 'site';   // the deal window's filterFn
// A Save's question: what the field shows and holds, what the record has stored, what the
// field opened with, over every row the host holds.
const ask = (records, over = {}) => resolveLink({ records, text: '', heldId: '', storedId: '', seededText: '', ...over });
// The deal window's: no site is the account, and a site typed in full leads to its account
// when the list holds it (searchMatch.js viaParent, over the accounts the picker lists).
const askDeal = (records, over = {}) => {
    const byId = new Map(unarchived(records).map((a) => [a.id, a]));
    return ask(records, { eligible: notSite, via: (a) => viaParent(a, byId, notSite), ...over });
};
const ids = (list) => list.map((a) => a.id).sort();

// ── the rule — run ───────────────────────────────────────────────────────────

test("untouched — the text it opened with AND the id it opened with: the stored link as stored (either twin, one outside a rep's list, one merged away, a legacy name, a link filled in on open)", () => {
    for (const rows of ORDERS) {
        for (const twin of [UNIT, SITE]) {
            assert.deepEqual(ask(rows, { text: TWIN, seededText: TWIN, storedId: twin.id, heldId: twin.id }), { how: 'untouched', id: twin.id, record: twin }, `the ${twin.accountTier}, never the first of its name`);
        }
    }
    const repsList = ROWS.filter((a) => a !== SITE);   // the site is another rep's: her list holds only the unit of that name
    assert.deepEqual(ask(repsList, { text: TWIN, seededText: TWIN, storedId: 's', heldId: 's' }), { how: 'untouched', id: 's', record: null }, 'outside her list, a same-named account in it: kept, not moved to the unit');
    assert.deepEqual(ask(repsList, { text: '', seededText: '', storedId: 's', heldId: 's' }), { how: 'untouched', id: 's', record: null }, `D16: the field seeded empty under "${HIDDEN_ACCOUNT}", untouched: kept`);
    assert.deepEqual(ask(ROWS, { text: 'Evonik - Lafayette', seededText: 'Evonik - Lafayette', storedId: 'ea', heldId: 'ea' }), { how: 'untouched', id: 'ea', record: LAF_GONE }, 'merged away since (D12): kept');
    assert.deepEqual(ask(ROWS, { text: 'Acme Old Co', seededText: 'Acme Old Co' }), { how: 'untouched', id: '', record: null }, 'a legacy name linked to nothing: still nothing, not refused');
    assert.deepEqual(ask(ROWS, { text: 'Shell', seededText: 'Shell', storedId: 'k', heldId: 'k' }), { how: 'untouched', id: 'k', record: SHELL }, "a new task opened from Shell's rail, Shell filled in by id (D10)");
    assert.deepEqual(ask(ROWS), { how: 'untouched', id: '', record: null }, 'a new record, nothing typed');
});

test("rule 1 is strict: the × on a link the user can't open removes it (D16); a field picked over is asked again, even typed back to the text it opened with", () => {
    const repsList = ROWS.filter((a) => a !== SITE);
    assert.deepEqual(ask(repsList, { text: '', seededText: '', storedId: 's', heldId: '' }), { how: 'empty', id: '', record: null }, 'the × lets go of the held id: no link');
    for (const rows of ORDERS) {
        const back = ask(rows, { text: TWIN, seededText: TWIN, storedId: 's', heldId: 'k' });
        assert.equal(back.refusal, 'many', 'Shell picked, then the name it opened with typed back: the twins refuse, never the first');
        assert.deepEqual(ids(back.matches), ['s', 'u']);
    }
    assert.deepEqual(ask(ROWS, { text: 'Acme Old Co', seededText: 'Acme Old Co', heldId: 'k' }), { refusal: 'none', text: 'Acme Old Co', matches: [] }, 'a legacy name picked over and typed back: what the field shows is no saved account');
});

test('held: a pick is saved as the row picked — the unit or the site of "Shell - Port Allen", in either order, on a new record and on an edit that picks the other twin', () => {
    for (const rows of ORDERS) {
        for (const [twin, other] of [[UNIT, SITE], [SITE, UNIT]]) {
            assert.deepEqual(ask(rows, { text: TWIN, heldId: twin.id }), { how: 'held', id: twin.id, record: twin }, `new: the ${twin.accountTier}`);
            assert.deepEqual(ask(rows, { text: TWIN, seededText: TWIN, storedId: other.id, heldId: twin.id }), { how: 'held', id: twin.id, record: twin }, `edit: the ${other.accountTier} it had, the ${twin.accountTier} picked`);
        }
    }
});

test('a pick typed over is not saved: the text is asked as typed', () => {
    assert.deepEqual(ask(ROWS, { text: 'Shell', seededText: TWIN, storedId: 's', heldId: 'u' }), { how: 'typed', id: 'k', record: SHELL }, 'the unit picked, then "Shell" typed: Shell');
    assert.deepEqual(ask(ROWS, { text: 'Shell - Port', seededText: TWIN, storedId: 's', heldId: 's' }), { refusal: 'none', text: 'Shell - Port', matches: [] }, 'the stored name edited into one no account has');
});

test('a pick still reads as the field when only case, spacing or punctuation differ, and a typed name is read the same way, saved under its own spelling', () => {
    for (const text of ['INEOS Acetyls', 'ineos  acetyls', 'Ineos - Acetyls']) {
        assert.deepEqual(ask(ROWS, { text, heldId: 'ia' }), { how: 'held', id: 'ia', record: ACETYLS }, `held: ${text}`);
        assert.deepEqual(ask(ROWS, { text }), { how: 'typed', id: 'ia', record: ACETYLS }, `typed: ${text}`);
    }
    assert.equal(ask(ROWS, { text: 'Ineos - Acetyls' }).record.name, 'INEOS Acetyls', 'the name a host saves is the record\'s');
});

test('empty: a cleared field links nothing, whatever was stored or picked (D7: "Save saves exactly what the field shows")', () => {
    assert.deepEqual(ask(ROWS, { text: '', seededText: TWIN, storedId: 's', heldId: 's' }), { how: 'empty', id: '', record: null });
    assert.deepEqual(ask(ROWS, { text: '   ', seededText: 'Shell', storedId: 'k', heldId: 'k' }), { how: 'empty', id: '', record: null }, 'spaces are nothing');
});

test('typed, not picked (D1): two accounts of the name are refused in either order, never the first; one is it', () => {
    for (const rows of ORDERS) {
        const r = ask(rows, { text: ' shell - port allen ' });
        assert.equal(r.refusal, 'many');
        assert.equal(r.text, 'shell - port allen', 'the text as typed, trimmed');
        assert.deepEqual(ids(r.matches), ['s', 'u']);
        assert.ok(!('id' in r), 'nothing to save');
        assert.equal(linkRefusal(r, { field: 'Company', canCreate: true }), 'More than one account is named “shell - port allen”. Pick the one you mean from the list — each row names its parent.');
    }
    assert.deepEqual(ask(ROWS, { text: 'shell' }), { how: 'typed', id: 'k', record: SHELL }, 'one account of the name: it');
});

test('typed, not picked: a name no account has is refused; only punctuation is typed text that matches nothing, a nameless account included', () => {
    assert.deepEqual(ask(ROWS, { text: 'Chevron' }), { refusal: 'none', text: 'Chevron', matches: [] });
    assert.deepEqual(ask(ROWS, { text: ' - ' }), { refusal: 'none', text: '-', matches: [] }, 'not empty, and never the account with no name');
    assert.deepEqual(ask(ROWS, { text: '-', seededText: 'Shell', storedId: 'k', heldId: 'k' }), { refusal: 'none', text: '-', matches: [] }, 'a link typed over with a dash is not cleared');
    assert.deepEqual(ask(ROWS, { text: 'acetyl' }), { refusal: 'none', text: 'acetyl', matches: [] }, 'part of a name is not the name');
});

test('merged away (D12: "Yes, hide them"): never matched by a typed name; a link to one, held, is kept; accounts and contacts alike', () => {
    assert.deepEqual(ask(ROWS, { text: 'Evonik - Lafayette' }), { how: 'typed', id: 'el', record: LAF }, 'the archived twin is no second match');
    assert.deepEqual(ask(ROWS.filter((a) => a !== LAF), { text: 'evonik lafayette' }), { refusal: 'merged', text: 'evonik lafayette', matches: [LAF_GONE], into: '' }, 'the archived one alone is no match — and no "none" either: it was merged away');
    assert.deepEqual(ask(ROWS, { text: 'evonik - lafayette', seededText: 'Evonik - Lafayette', storedId: 'ea', heldId: 'ea' }), { how: 'held', id: 'ea', record: LAF_GONE }, 'its link, re-cased: still held, still kept');
    assert.equal(isMergeArchived(LAF_GONE), true);
    assert.equal(isMergeArchived(LAF), false);
    assert.equal(isMergeArchived({ mergeArchived: false }), false);
    assert.equal(isMergeArchived(null), false);
    assert.equal(isMergeArchived(undefined), false);
    const people = [{ id: 'c1', firstName: 'Ann', mergeArchived: true }, null, { id: 'c2', firstName: 'Bo', mergeArchived: false }, { id: 'c3', firstName: 'Cy' }];
    assert.deepEqual(unarchived(people).map((c) => c.id), ['c2', 'c3']);
    assert.deepEqual(unarchived(ROWS).map((a) => a.id), ROWS.filter((a) => a !== LAF_GONE).map((a) => a.id), 'the list as it came, less the one merged away');
    assert.deepEqual(unarchived(undefined), []);
});

test("the deal window: a site is never the account; a site typed in full is its account, as if its row were clicked (D5); twins typed refuse (D1); a site of an account the rep can't open is refused, and said so (D11)", () => {
    for (const rows of ORDERS) {
        const twins = askDeal(rows, { text: TWIN });
        assert.equal(twins.refusal, 'many', 'the unit as an account AND the site through Shell: two rows the list draws, so two');
        assert.deepEqual(ids(twins.matches), ['s', 'u']);
        assert.deepEqual(askDeal(rows, { text: 'ineos acetyls texas city' }), { how: 'typed', id: 'ia', record: ACETYLS, via: TEXAS }, 'Account INEOS Acetyls, Site Name the site');
        assert.deepEqual(askDeal(rows, { text: 'Evonik - Lafayette' }), { how: 'typed', id: 'e', record: EVONIK, via: LAF }, 'the site merged away is no second match');
        assert.equal(askDeal(rows, { text: TWIN, heldId: 's' }).refusal, 'many', 'a site held (a stale id) is never the account');
        assert.deepEqual(askDeal(rows, { text: 'Shell', heldId: 'k' }), { how: 'held', id: 'k', record: SHELL });
        assert.deepEqual(askDeal(rows, { text: 'INEOS Acetyls', seededText: 'INEOS Acetyls', storedId: 'ia', heldId: 'ia' }), { how: 'untouched', id: 'ia', record: ACETYLS });
    }
    const repsList = ROWS.filter((a) => a !== ACETYLS && a !== INEOS);   // the site is listed, its account is another rep's
    const out = askDeal(repsList, { text: 'ineos acetyls - texas city ' });
    assert.deepEqual(out, { refusal: 'unreachable', text: 'ineos acetyls - texas city', matches: [TEXAS] }, 'nothing saved');
    assert.equal(linkRefusal(out, { field: 'Account', canCreate: true }), "“ineos acetyls - texas city” is a site of an account you can't open — ask your manager to link it.");
    assert.deepEqual(ask(repsList, { text: 'Ineos Acetyls - Texas City', eligible: notSite }), { refusal: 'ineligible', text: 'Ineos Acetyls - Texas City', matches: [TEXAS] }, 'with no via, a record the field does not take is ineligible');
});

test("the deal window (F7): 'unreachable' — D11's sentence — only for a site whose account the list does not hold; a site whose account is listed but no deal's (merged away, or a site itself) is a site to refuse, in its own words", () => {
    const ACETYLS_GONE = { ...ACETYLS, mergeArchived: true, mergedIntoId: 'i' };
    const underGone = ROWS.map((a) => (a === ACETYLS ? ACETYLS_GONE : a));
    for (const rows of [underGone, [...underGone].reverse()]) {
        const r = askDeal(rows, { text: 'Ineos Acetyls - Texas City' });
        assert.deepEqual(r, { refusal: 'ineligible', text: 'Ineos Acetyls - Texas City', matches: [TEXAS] }, 'its account is in the list, merged away: no D11 — even an Admin sees it');
        assert.equal(linkRefusal(r, { why: (m, t) => siteNotAccount(t) }), '“Ineos Acetyls - Texas City” is a site — pick the account it belongs to.');
    }
    const QUAY = { id: 'q4', name: 'Quay 4', accountTier: 'site', parentAccountId: 's' };   // a site under UKG's site twin (legacy)
    assert.equal(askDeal([...ROWS, QUAY], { text: 'quay 4' }).refusal, 'ineligible', 'a site under a site: its account is a site');
    const ORPHAN = { id: 'o1', name: 'Lone Site', accountTier: 'site', parentAccountId: null };
    assert.equal(askDeal([...ROWS, ORPHAN], { text: 'Lone Site' }).refusal, 'ineligible', 'a site with no account at all: nothing the user cannot open');
    assert.equal(askDeal(ROWS.filter((a) => a !== ACETYLS && a !== INEOS), { text: 'Ineos Acetyls - Texas City' }).refusal, 'unreachable', 'its account outside the list: D11');
    // the picker's line says the same, by the same test (siteLine)
    assert.equal(siteLine(TEXAS, underGone), siteNotAccount('Ineos Acetyls - Texas City'));
    assert.equal(siteLine(QUAY, ROWS), siteNotAccount('Quay 4'));
    assert.equal(siteLine(ORPHAN, ROWS), siteNotAccount('Lone Site'));
    assert.equal(siteLine(TEXAS, ROWS.filter((a) => a !== ACETYLS)), siteOutOfReach('Ineos Acetyls - Texas City'), 'D11');
    assert.equal(siteNotAccount('Quay 4'), '“Quay 4” is a site — pick the account it belongs to.');
});

test("merged (F9): a name only records merged into another have is not 'none' — it names the live record they were merged into, followed through later merges while the list holds it", () => {
    const OIL = { id: 'so', name: 'Shell Oil', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'k' };
    const OIL_CO = { id: 'soc', name: 'Shell Oil Co', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'so' };
    const rows = [...ROWS, OIL, OIL_CO];
    for (const list of [rows, [...rows].reverse()]) {
        assert.deepEqual(ask(list, { text: 'shell oil' }), { refusal: 'merged', text: 'shell oil', matches: [OIL], into: 'Shell' });
        assert.equal(ask(list, { text: 'Shell Oil Co' }).into, 'Shell', 'merged into one merged since: followed to the live one');
    }
    assert.equal(linkRefusal(ask(rows, { text: ' shell oil ' }), { field: 'Company', canCreate: true }), '“shell oil” was merged into “Shell” — pick “Shell”.', 'no Create offered: it would make the merged-away record again');
    assert.equal(linkRefusal(ask(rows.filter((a) => a !== SHELL), { text: 'Shell Oil' })), '“Shell Oil” was merged into another account.', "the one it was merged into is outside the list (a rep's scope)");
    assert.equal(linkRefusal({ refusal: 'merged', text: 'Bo Lane', matches: [], into: '' }, { noun: 'contact' }), '“Bo Lane” was merged into another contact.');
    const TWIN_OIL = { id: 'so2', name: 'Shell Oil', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'i' };
    assert.equal(ask([...rows, TWIN_OIL], { text: 'Shell Oil' }).into, '', 'two merged away into two different records: neither is named');
    assert.equal(ask([...rows, { ...OIL, id: 'so3' }], { text: 'Shell Oil' }).into, 'Shell', 'two merged away into one record: it is named');
    assert.equal(ask(rows, { text: 'shell oil', heldId: 'so', storedId: 'so', seededText: 'shell oil' }).how, 'untouched', 'a link to one, untouched, is kept (D12)');
    assert.equal(ask([...ROWS, { ...OIL, name: 'Shell' }], { text: 'Shell' }).how, 'typed', 'a live record of the name: it, never the merged-away one');
    // the survivor walk
    assert.equal(survivorOf(OIL_CO, rows), SHELL);
    assert.equal(survivorOf(SHELL, rows), SHELL, 'a live record is itself');
    assert.equal(survivorOf(OIL, rows.filter((a) => a !== SHELL)), null, 'the survivor outside the list');
    assert.equal(survivorOf({ ...OIL, mergedIntoId: null }, rows), null, 'merged into nothing on record');
    const loopA = { id: 'la', name: 'A', mergeArchived: true, mergedIntoId: 'lb' };
    const loopB = { id: 'lb', name: 'B', mergeArchived: true, mergedIntoId: 'la' };
    assert.equal(survivorOf(loopA, [loopA, loopB]), null, 'a loop ends');
    const chain = Array.from({ length: MERGE_HOPS + 2 }, (_, i) => ({ id: `h${i}`, name: `H${i}`, mergeArchived: i < MERGE_HOPS + 1, mergedIntoId: `h${i + 1}` }));
    assert.equal(MERGE_HOPS, 5);
    assert.equal(survivorOf(chain[1], chain), chain[MERGE_HOPS + 1], 'MERGE_HOPS merges on: found');
    assert.equal(survivorOf(chain[0], chain), null, 'one more: not followed');
    assert.equal(survivorOf(null, rows), null);
    assert.equal(survivorOf(OIL, undefined), null);
});

test('"use Create" is said exactly where the picker offers Create: a name is refused as no account\'s exactly when no listed account has it', () => {
    for (const rows of ORDERS) {
        const listed = unarchived(rows);
        const byId = new Map(listed.map((a) => [a.id, a]));
        for (const q of [TWIN, 'shell', 'Ineos - Acetyls', 'acetyl', 'Evonik - Lafayette', 'Chevron', 'Shell - Port', 'ineos acetyls texas city', 'INEOS']) {
            assert.equal(ask(rows, { text: q }).refusal === 'none', pickerRows(listed, q, {}).exact === null, `New Contact, Log Activity: ${q}`);
            assert.equal(askDeal(rows, { text: q }).refusal === 'none', pickerRows(listed, q, { keep: notSite, byId }).exact === null, `the deal window: ${q}`);
        }
    }
    assert.equal(linkRefusal(ask(ROWS, { text: ' - ' }), { field: 'Company', canCreate: true }), "“-” isn't a saved account. Pick one from the list.", 'only punctuation: the picker offers no Create, so none is named');
    // and none where a name only one merged away has: the picker asks resolveLink, as its Save does (F9)
    const createOffered = (records, q) => pickerRows(unarchived(records), q, {}).exact === null && resolveLink({ text: q, records }).refusal !== 'merged';
    const noLaf = ROWS.filter((a) => a !== LAF);
    for (const q of ['Evonik - Lafayette', 'Chevron', 'evonik', 'acetyl']) {
        assert.equal(ask(noLaf, { text: q }).refusal === 'none', createOffered(noLaf, q), `with the live site gone: ${q}`);
    }
    assert.equal(createOffered(noLaf, 'Evonik - Lafayette'), false, 'a name only one merged away has: no Create');
});

// ── the refusals' wording, the words a link the user can't open shows ────────

test('the refusals, one wording: none with and without a Create to point at, many by what each row names, ineligible by the host\'s reason, unreachable as D11; no refusal, no words', () => {
    const none = { refusal: 'none', text: '  Chevron ', matches: [] };
    assert.equal(linkRefusal(none, { field: 'Company', canCreate: true }), "“Chevron” isn't a saved account. Pick one from the list, or use “Create” in the Company field.");
    assert.equal(linkRefusal(none, { field: 'Account' }), "“Chevron” isn't a saved account. Pick one from the list.", 'New Task (D6): no Create to point at');
    assert.equal(linkRefusal(none), "“Chevron” isn't a saved account. Pick one from the list.", 'what a picker with no Create draws at its foot');
    assert.equal(linkRefusal({ refusal: 'none', text: 'Renewal' }, { noun: 'deal' }), "“Renewal” isn't a saved deal. Pick one from the list.");
    assert.equal(linkRefusal({ refusal: 'many', text: 'Renewal 2027', matches: [] }, { noun: 'deal' }), 'More than one deal is named “Renewal 2027”. Pick the one you mean from the list — each row names its account and stage.');
    assert.equal(linkRefusal({ refusal: 'many', text: 'Dana Reyes', matches: [] }, { noun: 'contact' }), 'More than one contact is named “Dana Reyes”. Pick the one you mean from the list — each row names its title and company.', 'what the contact rows draw: "<title> · <company>" (F6)');
    assert.equal(linkRefusal({ refusal: 'ineligible', text: 'X', matches: [SHELL] }), "“X” can't be used here. Pick one from the list.");
    assert.equal(linkRefusal({ refusal: 'ineligible', text: ' Shell ', matches: [SHELL] }, { why: (m, t) => `${m[0].id}:${t}` }), 'k:Shell', "the host's reason, handed the records and the text");
    assert.equal(linkRefusal({ refusal: 'unreachable', text: TWIN, matches: [SITE] }), siteOutOfReach(TWIN));
    assert.equal(linkRefusal({ refusal: 'merged', text: ' Shell Oil ', matches: [], into: 'Shell' }, { field: 'Company', canCreate: true }), '“Shell Oil” was merged into “Shell” — pick “Shell”.');
    assert.equal(linkRefusal({ refusal: 'merged', text: 'Shell Oil', matches: [] }), '“Shell Oil” was merged into another account.');
    assert.equal(linkRefusal({ how: 'typed', id: 'k', record: SHELL }), '', 'a link is no refusal');
    assert.equal(linkRefusal(null), '');
});

test("D11's and D16's words, as Jeff chose them", () => {
    assert.equal(siteOutOfReach(TWIN), "“Shell - Port Allen” is a site of an account you can't open — ask your manager to link it.");
    assert.equal(HIDDEN_ACCOUNT, "An account you can't open");
    assert.equal(HIDDEN_DEAL, "A deal you can't open");
});

test("a row's parent label: unit of, site of, in", () => {
    assert.equal(parentLabel(UNIT, SHELL), 'unit of Shell');
    assert.equal(parentLabel(SITE, SHELL), 'site of Shell');
    assert.equal(parentLabel({ ...SHELL, parentAccountId: 'i' }, INEOS), 'in INEOS', 'an account moved under a parent before its tier was recomputed');
    assert.equal(parentLabel(SHELL, null), '');
    assert.equal(parentLabel(null, SHELL), '');
});

// ── the deal rows (D9), the contacts ─────────────────────────────────────────

test('deal rows (D9): the grey line under each reads "<account> · <stage>"; two deals of one name are picked by id, kept untouched, or refused typed', () => {
    const R1 = { id: 'o1', opportunityName: 'Renewal 2027', account: 'Shell - Port Allen', stage: 'Proposal' };
    const R2 = { id: 'o2', opportunityName: 'Renewal 2027', account: 'INEOS Acetyls', stage: 'Discovery' };
    const BARE = { id: 'o3', opportunityName: '', account: 'Dow', stage: 'Closed Won' };
    assert.equal(dealText(R1), 'Renewal 2027');
    assert.equal(dealText(BARE), 'Dow', 'no name: its account, as the rails show it');
    assert.equal(dealText(null), '');
    assert.equal(dealSubline(R1), 'Shell - Port Allen · Proposal');
    assert.equal(dealSubline(R2), 'INEOS Acetyls · Discovery');
    assert.equal(dealSubline({ account: 'Dow' }), 'Dow');
    assert.equal(dealSubline({ stage: 'Proposal' }), 'Proposal');
    assert.equal(dealSubline(null), '');
    const DEALS = [R1, R2, BARE];
    const pickDeal = (over) => ask(DEALS, { labelOf: dealText, ...over });
    assert.deepEqual(pickDeal({ text: 'Renewal 2027', heldId: 'o2' }), { how: 'held', id: 'o2', record: R2 }, 'the second of two, picked');
    assert.deepEqual(pickDeal({ text: 'Renewal 2027', seededText: 'Renewal 2027', storedId: 'o2', heldId: 'o2' }), { how: 'untouched', id: 'o2', record: R2 }, 'an activity on the second, saved untouched');
    assert.equal(linkRefusal(pickDeal({ text: 'renewal 2027' }), { noun: 'deal' }), 'More than one deal is named “renewal 2027”. Pick the one you mean from the list — each row names its account and stage.');
    assert.deepEqual(pickDeal({ text: 'dow' }), { how: 'typed', id: 'o3', record: BARE }, "a deal with no name, by its account's");
});

test('contacts (D12): a typed name is matched by the full name; one merged away is no match, and named alone it names the contact it was merged into; two of one name refuse by title and company', () => {
    const fullName = (c) => `${c.firstName || ''} ${c.lastName || ''}`;
    const PEOPLE = [
        { id: 'c1', firstName: 'Dana', lastName: 'Reyes', company: 'Shell' },
        { id: 'c2', firstName: 'Dana', lastName: 'Reyes', company: 'INEOS' },
        { id: 'c3', firstName: 'Bo', lastName: 'Lane', company: 'Dow', mergeArchived: true },
        { id: 'c4', firstName: 'Bo', lastName: 'Lane', company: 'Dow' },
    ];
    const askPerson = (over) => ask(PEOPLE, { labelOf: fullName, ...over });
    assert.deepEqual(askPerson({ text: 'bo lane' }), { how: 'typed', id: 'c4', record: PEOPLE[3] });
    assert.equal(linkRefusal(askPerson({ text: 'Dana Reyes' }), { noun: 'contact' }), 'More than one contact is named “Dana Reyes”. Pick the one you mean from the list — each row names its title and company.');
    assert.deepEqual(askPerson({ text: 'Dana Reyes', heldId: 'c2' }), { how: 'held', id: 'c2', record: PEOPLE[1] });
    const gone = { id: 'c6', firstName: 'Old', lastName: 'Reyes', mergeArchived: true, mergedIntoId: 'c1' };
    assert.equal(linkRefusal(ask([...PEOPLE, gone], { labelOf: fullName, text: 'old reyes' }), { noun: 'contact' }), '“old reyes” was merged into “Dana Reyes” — pick “Dana Reyes”.', 'named by its label: the full name');
});

// ── the account picker — pinned ──────────────────────────────────────────────

const PICKER = 'src/components/rails/AccountPicker.jsx';

test('the account picker: merge-archived accounts not listed, each parent named through parentLabel, Create only where the host allows it, why a name it cannot offer is left out, and the list shut when the field loses the focus', () => {
    const p = read(PICKER);
    assert.ok(p.includes("import { unarchived, parentLabel, siteLine, linkRefusal, resolveLink } from '../../utils/pickLink.js';"));
    assert.ok(p.includes('export default function AccountPicker({ value, onChange, onSelectAccount, onSelectSite, onError, placeholder, filterFn, allowCreate = true, leftOut = null, dropUp = false }) {'),
        "Create, the reason for a name left out and the way the list opens are the host's; the defaults are what the first three hosts had");
    assert.ok(p.includes('    const listed = useMemo(() => unarchived(accounts), [accounts]);'), 'D12: an account merged away is not listed');
    assert.ok(p.includes('    const byId = useMemo(() => new Map(listed.map(a => [a.id, a])), [listed]);'));
    assert.ok(p.includes('        ? pickerRows(listed, value, { keep: filterFn, viaParents: !!onSelectSite, byId })\n'), 'the rows, Create and the name typed are worked out over the accounts listed');
    assert.ok(!/pickerRows\(accounts\b/.test(p), 'never over every account');
    assert.ok(p.includes("{parent && <span style={{ color: T.inkMuted }}>{` · ${parentLabel(a, parent)}`}</span>}"));
    assert.ok(p.includes("{unlisted && <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{leftOut ? leftOut(unlisted) : siteLine(unlisted, accounts)}</div>}"),
        "the line for a name it cannot offer: the host's reason, else the deal window's (D11, or a site no deal takes — F7), over every account it holds");
    assert.ok(p.includes("    const lookup = open && typedKey && !exact ? resolveLink({ text: value, records: accounts }) : null;\n    const merged = lookup && lookup.refusal === 'merged' ? lookup : null;\n"),
        'a name no listed account has is asked of every account, those merged away included (F9)');
    assert.ok(p.includes("                        {!exact && (\n                            merged ? (\n                                <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{linkRefusal(merged)}</div>\n                            ) : allowCreate ? (\n                                <div onMouseDown={e => e.preventDefault()} onClick={createAccount}\n"),
        'a name only one merged away has: no Create, the account it was merged into named; else Create only where the host allows it');
    assert.ok(p.includes("                            ) : (\n                                <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{linkRefusal({ refusal: 'none', text: value || '' })}</div>\n                            )\n                        )}"),
        "where it offers none, the 'none' wording without Create");
    assert.ok(p.includes("position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', ") && p.includes('marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0, '), "New Task's Account can open upward, as its old field did");
    assert.ok(p.includes('                onFocus={() => setOpen(true)}\n                onBlur={() => setTimeout(() => setOpen(false), 200)}\n'),
        'the list shuts when the field loses the focus, as New Task\'s Account and the Parent field did before they moved onto the picker');
    // A press on a row, on the list's foot (the count, the line for a name left out, the
    // 'none' line) or on Create keeps the focus in the field, so the blur never shuts the list under a click.
    assert.ok(p.includes('<div key={a.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(a, via)}'));
    assert.ok(p.includes("<div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: 'inherit' }}>"));
    assert.ok(!p.includes('The host resolves the selected name to an accountId on save'), 'the comment that stated the bug as the contract is gone');
});

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

// Each host of the picker, and whether it offers Create (true) — New Task's Account (D6) and
// an account's Parent (D3) offer none: each links only an account that exists.
const HOSTS = {
    'src/components/modals/OpportunityModal.jsx': true,
    'src/components/rails/AccountRail.jsx': false,
    'src/components/rails/ActivityRail.jsx': true,
    'src/components/rails/ContactRail.jsx': true,
    'src/components/rails/TaskRail.jsx': false,
};

test("every host of the account picker, once each, and which of them offer Create", () => {
    assert.deepEqual(SRC.filter((f) => read(f).includes('<AccountPicker')).sort(), Object.keys(HOSTS).sort());
    for (const [f, creates] of Object.entries(HOSTS)) {
        const src = read(f);
        assert.equal(src.split('<AccountPicker').length - 1, 1, `${f}: one picker`);
        assert.equal(src.includes('allowCreate={false}'), !creates, `${f}: ${creates ? 'Create kept' : 'no Create'}`);
    }
});

test('pickLink.js is pure: it imports only the matcher (netlify/functions reach it through accountParent.js)', () => {
    const src = read('src/utils/pickLink.js');
    assert.deepEqual([...src.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['./searchMatch.js']);
    assert.ok(!/\b(React|window|document|localStorage|fetch)\b/.test(src.replace(/\/\/.*$/gm, '')), 'no React, no DOM, no network');
});

test('the suites: this file is graded by the harness', () => {
    // The SUITES value itself, never the whole harness: a comment there naming this file met the old pin (§0.204 review P1).
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/pick-link.test.mjs'), 'SUITES runs this file');
});
