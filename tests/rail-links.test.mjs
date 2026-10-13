// tests/rail-links.test.mjs
//
// A pick is saved as the record picked — the contact rail's Company, Log Activity's Company
// and Opportunity (state §0.198; Jeff, 11 Oct: D1 "One match saves, two refuse", D7 "Save
// what the field shows", D9 "Account · stage", D10 "Yes, fill it in", D12 "Yes, hide them",
// D16 "Say so, allow removing", D19 "Yes, all the same").
//
// Before: each Save looked the field's TEXT up again: the first account (or deal) of that
// name in the list, any case, any tier. UKG has two "Shell - Port Allen" under Shell, a
// business unit and a site, and the accounts GET orders by name only: picking the site
// saved whichever twin came first, an edit of Notes alone could move an activity between
// them, a rep's edit erased a link she could not see, a cleared Company was filled again
// from the deal, a deal typed that matched no deal kept the old one without a word, and the
// contact's chip and its Email/Call prefill took the first account of the company's name.
//
// Here: src/utils/railLinks.js, run on the twins in both list orders — what each field
// opens with, holds and saves — and the screens that ask it, pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    NO_LINK, NO_SEED, outOfList, hiddenAside, contactSeed, contactCompany, linkedAccount, contactLogContext,
    dealCompany, activitySeed, companyAfterDealPick, activityLinks,
} from '../src/utils/railLinks.js';
import { HIDDEN_ACCOUNT, HIDDEN_DEAL, dealSubline } from '../src/utils/pickLink.js';

// What a Save links, without the flags that say which fields nobody touched — those are
// compared on their own (the pre-ship round's tests, below).
const linksOf = (r) => { if (!r || r.error) return r; const { untouched, ...links } = r; return links; };

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => {
    const a = src.indexOf(from);
    assert.ok(a >= 0, `missing: ${from}`);
    const b = src.indexOf(to, a + from.length);
    assert.ok(b > a, `missing after it: ${to}`);
    return src.slice(a, b);
};

// ── UKG's two "Shell - Port Allen" under Shell: a business unit and a site ──────────
const SPA = 'Shell - Port Allen';
const shell = { id: 'k', name: 'Shell', accountTier: 'account', parentAccountId: null };
const unit = { id: 'u', name: SPA, accountTier: 'business_unit', parentAccountId: 'k' };
const site = { id: 's', name: SPA, accountTier: 'site', parentAccountId: 'k' };
const acetyls = { id: 'i', name: 'INEOS Acetyls', accountTier: 'business_unit', parentAccountId: null };
const BOTH = [[shell, unit, site, acetyls], [shell, site, unit, acetyls]];   // the GET orders by name only: either twin first
const REP = [shell, unit, acetyls];                                         // a rep's list: the site is another rep's
// A merge's twin: the one merged away keeps its row (mergeArchived), the survivor is live.
const gone = { id: 'x', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e', mergeArchived: true, mergedIntoId: 'y' };
const live = { id: 'y', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e' };
const MERGED = [[gone, live], [live, gone]];
// Two deals of one name, one on each twin; one saved before deals kept an account id.
const onUnit = { id: 'd1', opportunityName: 'Port Allen renewal', account: SPA, accountId: 'u', stage: 'Proposal' };
const onSite = { id: 'd2', opportunityName: 'Port Allen renewal', account: SPA, accountId: 's', stage: 'Negotiation' };
const older = { id: 'd3', opportunityName: 'Turnaround 2027', account: SPA, stage: 'Discovery' };
const DEALS = [[onUnit, onSite, older], [onSite, onUnit, older]];

const MANY_ACCOUNTS = `More than one account is named “${SPA}”. Pick the one you mean from the list — each row names its parent.`;
const MANY_DEALS = 'More than one deal is named “Port Allen renewal”. Pick the one you mean from the list — each row names its account and stage.';
const noAccount = (x) => `“${x}” isn't a saved account. Pick one from the list, or use “Create” in the Company field.`;

// ── the contact rail's Company — run ────────────────────────────────────────

test("contact Company: the row picked is the one saved — the site, or the unit, whichever twin the list holds first", () => {
    for (const accounts of BOTH) {
        assert.deepEqual(contactCompany({ text: SPA, heldId: 's', seed: NO_LINK, accounts }), { company: SPA, accountId: 's' });
        assert.deepEqual(contactCompany({ text: SPA, heldId: 'u', seed: NO_LINK, accounts }), { company: SPA, accountId: 'u' });
        assert.deepEqual(contactCompany({ text: 'shell - port allen', heldId: 's', seed: NO_LINK, accounts }), { company: SPA, accountId: 's' },
            'retyped in another case, the pick holds — saved under its own spelling');
    }
});

test("contact Company: a field nobody touched keeps its stored link exactly — a twin's, one outside a rep's list, a legacy company's text", () => {
    for (const accounts of BOTH) {
        assert.deepEqual(contactCompany({ text: SPA, heldId: 's', seed: { text: SPA, id: 's' }, accounts }), { company: SPA, accountId: 's', untouched: true }, 'Phone edited: the site stays the site');
        assert.deepEqual(contactCompany({ text: SPA, heldId: 'u', seed: { text: SPA, id: 'u' }, accounts }), { company: SPA, accountId: 'u', untouched: true });
    }
    assert.deepEqual(contactCompany({ text: SPA, heldId: 's', seed: { text: SPA, id: 's' }, accounts: REP }), { company: SPA, accountId: 's', untouched: true },
        "a rep's list without the site: kept as stored, never moved to the unit she can see");
    assert.deepEqual(contactCompany({ text: 'Acme Old Co', heldId: null, seed: { text: 'Acme Old Co', id: '' }, accounts: BOTH[0] }), { company: 'Acme Old Co', accountId: '', untouched: true },
        'a legacy company no account has (accountId null from the server): kept as it is');
    assert.deepEqual(contactCompany({ text: 'Shell Port Allen (old)', heldId: 's', seed: { text: 'Shell Port Allen (old)', id: 's' }, accounts: BOTH[0] }), { company: 'Shell Port Allen (old)', accountId: 's', untouched: true },
        'a linked account renamed since: untouched, what it opened with — the rail leaves it out, and the row as stored stands (the rename wrote the new name there)');
    assert.deepEqual(contactCompany({ text: '', heldId: '', seed: NO_LINK, accounts: BOTH[0] }), { company: '', accountId: '', untouched: true }, 'a new contact with no company (a new contact leaves nothing out)');
});

test('contact Company: a name typed in full — one account saves under its own spelling; two refuse; none refuse', () => {
    for (const accounts of BOTH) {
        assert.deepEqual(contactCompany({ text: 'Ineos - Acetyls', heldId: '', seed: NO_LINK, accounts }), { company: 'INEOS Acetyls', accountId: 'i' });
        assert.deepEqual(contactCompany({ text: SPA, heldId: '', seed: NO_LINK, accounts }), { error: MANY_ACCOUNTS });
        assert.deepEqual(contactCompany({ text: '  Chevron ', heldId: '', seed: NO_LINK, accounts }), { error: noAccount('Chevron') });
    }
    assert.deepEqual(contactCompany({ text: SPA, heldId: '', seed: NO_LINK, accounts: REP }), { company: SPA, accountId: 'u' }, "a rep's list holds one of the name: that one");
    assert.deepEqual(contactCompany({ text: ' - ', heldId: '', seed: NO_LINK, accounts: BOTH[0] }), { error: "“-” isn't a saved account. Pick one from the list." },
        'only punctuation is typed, not empty — and the picker offers no Create for it');
});

test('contact Company: a pick typed over is not saved; a cleared field saves no company', () => {
    const accounts = BOTH[0];
    const stored = { text: 'Acme Old Co', id: '' };
    assert.deepEqual(contactCompany({ text: 'Acme Old Co', heldId: 'i', seed: stored, accounts }), { error: noAccount('Acme Old Co') },
        "INEOS picked, then the stored text typed back: asked again (it saved INEOS's id under the legacy text) — Discard restores it");
    assert.deepEqual(contactCompany({ text: 'Dow', heldId: 's', seed: { text: SPA, id: 's' }, accounts }), { error: noAccount('Dow') }, 'the site held, "Dow" typed over it');
    assert.deepEqual(contactCompany({ text: '', heldId: 's', seed: { text: SPA, id: 's' }, accounts }), { company: '', accountId: '' }, 'cleared: no account, whatever it held');
    assert.deepEqual(contactCompany({ text: '   ', heldId: 's', seed: { text: SPA, id: 's' }, accounts }), { company: '', accountId: '' }, 'spaces are empty');
});

test("contact Company, a link the user can't open (D16): untouched it is kept; the × removes it", () => {
    const seed = { text: SPA, id: 's' };
    assert.equal(outOfList('s', REP), true);
    assert.equal(outOfList('s', BOTH[0]), false, 'the list holds it: the field names it');
    assert.equal(outOfList('', REP), false, 'no link');
    assert.equal(outOfList(null, REP), false);
    assert.deepEqual(contactCompany({ text: SPA, heldId: 's', seed, accounts: REP }), { company: SPA, accountId: 's', untouched: true }, 'untouched: kept');
    assert.deepEqual(contactCompany({ text: '', heldId: '', seed, accounts: REP }), { company: '', accountId: '' }, 'the × clears the text and the id: no link');
    assert.deepEqual(contactCompany({ text: '', heldId: '', seed: { text: '', id: 's' }, accounts: REP }), { company: '', accountId: '' }, 'with no stored name too');
    assert.equal(hiddenAside(HIDDEN_ACCOUNT), "(an account you can't open)");
    assert.equal(hiddenAside(HIDDEN_DEAL), "(a deal you can't open)");
    assert.equal(hiddenAside(''), '');
});

test('contact Company: an account merged away is never matched by a typed name, and a contact linked to one keeps it (D12)', () => {
    for (const accounts of MERGED) {
        assert.deepEqual(contactCompany({ text: 'Evonik - Lafayette', heldId: '', seed: NO_LINK, accounts }), { company: 'Evonik - Lafayette', accountId: 'y' });
        assert.deepEqual(contactCompany({ text: 'Evonik - Lafayette', heldId: 'x', seed: { text: 'Evonik - Lafayette', id: 'x' }, accounts }), { company: 'Evonik - Lafayette', accountId: 'x', untouched: true }, 'untouched: kept');
        assert.deepEqual(contactCompany({ text: 'evonik - lafayette', heldId: 'x', seed: { text: 'Evonik - Lafayette', id: 'x' }, accounts }), { company: 'Evonik - Lafayette', accountId: 'x' },
            'retyped as itself: still the record held');
        assert.equal(linkedAccount({ company: 'Evonik - Lafayette', accountId: null }, accounts), live, 'a legacy chip: the live one');
    }
});

test("contact Company: the seed is the contact's stored company and account, or nothing for a new contact", () => {
    assert.deepEqual(contactSeed({ id: 'c1', company: SPA, accountId: 's' }), { text: SPA, id: 's' });
    assert.deepEqual(contactSeed({ id: 'c2', company: null, accountId: null }), { text: '', id: '' });
    assert.equal(contactSeed(null), NO_LINK);
});

test("the contact's Company chip opens the account it is linked to — never the first of two, never a namesake of a link outside the list", () => {
    for (const accounts of BOTH) {
        assert.equal(linkedAccount({ company: SPA, accountId: 's' }, accounts), site);
        assert.equal(linkedAccount({ company: SPA, accountId: 'u' }, accounts), unit);
        assert.equal(linkedAccount({ company: SPA, accountId: null }, accounts), null, 'a legacy row naming two opens neither');
    }
    assert.equal(linkedAccount({ company: SPA, accountId: 's' }, REP), null, "outside the rep's list: nothing opens (the unit is not it)");
    assert.equal(linkedAccount({ company: 'ineos - acetyls', accountId: '' }, BOTH[0]), acetyls, 'a legacy row: the one account of its name');
    assert.equal(linkedAccount({ company: 'Acme Old Co', accountId: '' }, BOTH[0]), null);
    assert.equal(linkedAccount({ company: '', accountId: '' }, BOTH[0]), null);
    assert.equal(linkedAccount(null, BOTH[0]), null);
});

test("every Log button on a contact's rail: the contact, its account by id, its company, and its open deal when it has exactly one (D19)", () => {
    const c = { id: 'c1', company: SPA, accountId: 's' };
    assert.deepEqual(contactLogContext(c, [onSite]), { contactId: 'c1', contactIds: ['c1'], company: SPA, accountId: 's', opportunityId: 'd2' });
    assert.equal(contactLogContext(c, [onSite, onUnit]).opportunityId, '', 'two open deals: none chosen');
    assert.equal(contactLogContext(c, []).opportunityId, '');
    assert.deepEqual(contactLogContext({ id: 'c2', company: 'Acme Old Co', accountId: null }, null),
        { contactId: 'c2', contactIds: ['c2'], company: 'Acme Old Co', accountId: '', opportunityId: '' }, 'a legacy contact: its company, no id');
    // What Log Activity then opens with: the site itself, in both orders — never its twin.
    for (const accounts of BOTH) {
        const o = activitySeed(contactLogContext(c, [onSite]), { accounts, opportunities: DEALS[0] });
        assert.deepEqual([o.company, o.deal], [{ text: SPA, id: 's' }, { text: 'Port Allen renewal', id: 'd2' }]);
        assert.deepEqual(linksOf(activityLinks({ company: o.company, deal: o.deal, seed: o.seed, accounts, opportunities: DEALS[0] })), { accountId: 's', company: SPA, opportunityId: 'd2' });
    }
    const hidden = activitySeed(contactLogContext(c, []), { accounts: REP, opportunities: [] });
    assert.deepEqual(hidden.company, { text: '', id: 's' }, "the contact's account outside the rep's list: held by id, the rail says so");
    assert.deepEqual(linksOf(activityLinks({ company: hidden.company, deal: hidden.deal, seed: hidden.seed, accounts: REP, opportunities: [] })), { accountId: 's', company: '', opportunityId: '' }, 'and saved');
});

test("F4: a contact still linked to an account merged into another — its Log buttons fill the account it was merged into, by id, never the merged-away name; with that one out of the list, the contact's own company as typed", () => {
    const shellOil = { id: 'so', name: 'Shell Oil Co', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'k' };
    const c = { id: 'c7', company: 'Shell', accountId: 'so' };   // merge.mjs renamed the company; the account id is batch 3's
    for (const accounts of BOTH) {
        const list = [...accounts, shellOil];
        const o = activitySeed(contactLogContext(c, []), { accounts: list, opportunities: [] });
        assert.deepEqual([o.seed.company, o.company], [{ text: 'Shell', id: 'k' }, { text: 'Shell', id: 'k' }], 'Shell, by id');
        assert.deepEqual(linksOf(activityLinks({ company: o.company, deal: o.deal, seed: o.seed, accounts: list, opportunities: [] })), { accountId: 'k', company: 'Shell', opportunityId: '' }, 'an untouched Save links Shell (it was refused, and offered Create)');
        const acc = activitySeed({ accountId: 'so' }, { accounts: list, opportunities: [] });
        assert.deepEqual(acc.company, { text: 'Shell', id: 'k' }, "the merged-away account's own rail (D10): the same");
    }
    const noShell = [unit, site, shellOil];
    const typed = activitySeed(contactLogContext(c, []), { accounts: noShell, opportunities: [] });
    assert.deepEqual([typed.seed.company, typed.company], [{ text: '', id: '' }, { text: 'Shell', id: '' }], "the one it was merged into outside the list: the contact's company, as typed");
    assert.deepEqual(activitySeed({ accountId: 'so' }, { accounts: noShell, opportunities: [] }).company, NO_LINK, 'nothing of its own to show: never "Shell Oil Co"');
    const twice = { id: 'so2', name: 'Shell Oil', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'so' };
    assert.deepEqual(activitySeed({ accountId: 'so2' }, { accounts: [...BOTH[0], shellOil, twice], opportunities: [] }).company, { text: 'Shell', id: 'k' }, 'merged into one merged since: followed');
    assert.deepEqual(activitySeed({ accountId: 'so' }, { editing: true, accounts: [...BOTH[0], shellOil], opportunities: [] }).company, { text: 'Shell Oil Co', id: 'so' }, 'an edit keeps its stored link (D12)');
});

// ── Log Activity — run ──────────────────────────────────────────────────────

test("Log Activity opens an edit with its stored links — named by their records; one the list does not hold, by nothing; no account, no Company (D1)", () => {
    for (const accounts of BOTH) for (const opportunities of DEALS) {
        const ctx = { accounts, opportunities };
        assert.deepEqual(activitySeed({ accountId: 's', opportunityId: 'd2', notes: 'x' }, { editing: true, ...ctx }), {
            seed: { company: { text: SPA, id: 's' }, deal: { text: 'Port Allen renewal', id: 'd2' } },
            company: { text: SPA, id: 's' }, deal: { text: 'Port Allen renewal', id: 'd2' },
        });
        const none = activitySeed({ accountId: '', opportunityId: 'd2' }, { editing: true, ...ctx });
        assert.deepEqual([none.seed.company, none.company], [{ text: '', id: '' }, { text: '', id: '' }], "an edit saved with no account: never filled from its deal");
    }
    assert.deepEqual(activitySeed({ accountId: 's', opportunityId: 'd9' }, { editing: true, accounts: REP, opportunities: [onUnit] }), {
        seed: { company: { text: '', id: 's' }, deal: { text: '', id: 'd9' } },
        company: { text: '', id: 's' }, deal: { text: '', id: 'd9' },
    }, "a rep's edit: the ids, with nothing to name them (D16)");
    assert.deepEqual(activitySeed({ accountId: 'x' }, { editing: true, accounts: MERGED[0], opportunities: [] }).company, { text: 'Evonik - Lafayette', id: 'x' },
        'an edit linked to an account merged away: kept (D12)');
});

test("Log Activity opens a NEW activity with its prefill — an account's own rail (D10), a deal (D7), a lead's company — and a merged-away account as the one it was merged into, by id (D12, F4)", () => {
    for (const accounts of BOTH) {
        const ctx = { accounts, opportunities: DEALS[0] };
        const fromAccount = activitySeed({ opportunityId: '', accountId: 'u' }, ctx);
        assert.deepEqual([fromAccount.seed.company, fromAccount.company, fromAccount.deal], [{ text: SPA, id: 'u' }, { text: SPA, id: 'u' }, { text: '', id: '' }], "the account rail's + Log Activity");
        const fromDeal = activitySeed({ opportunityId: 'd2', contactId: null }, ctx);
        assert.deepEqual([fromDeal.seed.company, fromDeal.company], [{ text: SPA, id: 's' }, { text: SPA, id: 's' }], "a deal's: its account, by id");
        const fromOld = activitySeed({ opportunityId: 'd3' }, ctx);
        assert.deepEqual([fromOld.seed.company, fromOld.company], [{ text: '', id: '' }, { text: SPA, id: '' }], 'a deal with a name only: the name, as typed');
        assert.deepEqual(linksOf(activityLinks({ company: fromOld.company, deal: fromOld.deal, seed: fromOld.seed, ...ctx })), { error: MANY_ACCOUNTS }, 'which Save resolves: the twins refuse');
    }
    const lead = activitySeed({ leadId: 'l1', type: 'Call', company: 'Ineos - Acetyls' }, { accounts: BOTH[0], opportunities: [] });
    assert.deepEqual([lead.seed.company, lead.company], [{ text: '', id: '' }, { text: 'Ineos - Acetyls', id: '' }], "a lead's company: as typed");
    assert.deepEqual(linksOf(activityLinks({ company: lead.company, deal: lead.deal, seed: lead.seed, accounts: BOTH[0], opportunities: [] })), { accountId: 'i', company: 'INEOS Acetyls', opportunityId: '' });
    for (const accounts of MERGED) {
        const merged = activitySeed({ accountId: 'x', company: 'Evonik - Lafayette' }, { accounts, opportunities: [] });
        assert.deepEqual([merged.seed.company, merged.company], [{ text: 'Evonik - Lafayette', id: 'y' }, { text: 'Evonik - Lafayette', id: 'y' }], 'a merged-away account: the one it was merged into, by id');
        assert.deepEqual(activityLinks({ company: merged.company, deal: merged.deal, seed: merged.seed, accounts, opportunities: [] }).accountId, 'y', 'saved as the live one');
    }
    const repDeal = activitySeed({ opportunityId: 'd2' }, { accounts: REP, opportunities: [onSite] });
    assert.deepEqual([repDeal.seed.company, repDeal.company], [{ text: '', id: 's' }, { text: '', id: 's' }], "a deal on an account the rep can't open: held by id, said so");
    assert.deepEqual(linksOf(activityLinks({ company: repDeal.company, deal: repDeal.deal, seed: repDeal.seed, accounts: REP, opportunities: [onSite] })), { accountId: 's', company: '', opportunityId: 'd2' });
    assert.deepEqual(activitySeed({ type: 'Note' }, { accounts: BOTH[0], opportunities: DEALS[0] }), { seed: NO_SEED, company: NO_LINK, deal: { text: '', id: '' } }, 'a type alone');
    assert.deepEqual(activitySeed(null).company, NO_LINK);
});

test('Log Activity saves what each field shows: an untouched edit moves nothing, the rows picked are saved, a rep keeps links she cannot see', () => {
    for (const accounts of BOTH) for (const opportunities of DEALS) {
        const o = activitySeed({ accountId: 's', opportunityId: 'd2' }, { editing: true, accounts, opportunities });
        assert.deepEqual(linksOf(activityLinks({ company: o.company, deal: o.deal, seed: o.seed, accounts, opportunities })), { accountId: 's', company: SPA, opportunityId: 'd2' },
            'Notes edited: the site and the second deal of one name stay');
        assert.deepEqual(linksOf(activityLinks({ company: { text: SPA, id: 'u' }, deal: { text: 'Port Allen renewal', id: 'd1' }, seed: NO_SEED, accounts, opportunities })), { accountId: 'u', company: SPA, opportunityId: 'd1' }, 'the rows picked');
        assert.deepEqual(linksOf(activityLinks({ company: { text: SPA, id: 's' }, deal: { text: 'Port Allen renewal', id: 'd2' }, seed: o.seed, accounts, opportunities })), { accountId: 's', company: SPA, opportunityId: 'd2' });
    }
    const rep = { accounts: REP, opportunities: [onUnit] };
    const o = activitySeed({ accountId: 's', opportunityId: 'd9' }, { editing: true, ...rep });
    assert.deepEqual(linksOf(activityLinks({ company: o.company, deal: o.deal, seed: o.seed, ...rep })), { accountId: 's', company: '', opportunityId: 'd9' }, "a rep's edit keeps both links (it erased them)");
    assert.deepEqual(linksOf(activityLinks({ company: { text: '', id: '' }, deal: { text: '', id: '' }, seed: o.seed, ...rep })), { accountId: '', company: '', opportunityId: '' }, 'the × on each: both removed (D16)');
});

test('Log Activity: a name typed in full — one saves, two refuse, none refuse — for the Company and the deal; a cleared Company is no account, whatever deal is named (D7)', () => {
    const accounts = BOTH[0];
    const opportunities = DEALS[0];
    const save = (company, deal, seed = NO_SEED) => linksOf(activityLinks({ company: { text: '', id: '', ...company }, deal: { text: '', id: '', ...deal }, seed, accounts, opportunities }));
    assert.deepEqual(save({ text: 'Ineos - Acetyls' }), { accountId: 'i', company: 'INEOS Acetyls', opportunityId: '' });
    assert.deepEqual(save({ text: SPA }), { error: MANY_ACCOUNTS });
    assert.deepEqual(save({}, { text: 'Port Allen renewal' }), { error: MANY_DEALS }, 'two deals of one name: refused, the rows name account and stage');
    assert.deepEqual(save({}, { text: 'turnaround 2027' }), { accountId: '', company: '', opportunityId: 'd3' });
    assert.deepEqual(save({}, { text: 'Nothing like it' }), { error: "“Nothing like it” isn't a saved deal. Pick one from the list." });
    const opened = { company: { text: SPA, id: 's' }, deal: { text: 'Turnaround 2027', id: 'd3' } };
    assert.deepEqual(save({ text: SPA, id: 's' }, { text: 'Turnaround 2028', id: 'd3' }, opened), { error: "“Turnaround 2028” isn't a saved deal. Pick one from the list." },
        'a deal typed over: refused (it kept d3 without a word)');
    assert.deepEqual(save({ text: '', id: 's' }, { text: 'Turnaround 2027', id: 'd3' }, opened), { accountId: '', company: '', opportunityId: 'd3' },
        "a cleared Company: no account — the deal's is not put back (D7)");
    const onDeal = { company: { text: SPA, id: 's' }, deal: { text: 'Port Allen renewal', id: 'd2' } };
    assert.deepEqual(save({ text: '', id: 's' }, { text: 'Port Allen renewal', id: 'd2' }, onDeal), { accountId: '', company: '', opportunityId: 'd2' },
        'cleared, on a deal linked to the site by id: still no account');
    assert.deepEqual(save({ text: 'Chevron' }, { text: 'Nothing like it' }), { error: noAccount('Chevron') }, 'the Company refuses first: it is drawn first');
});

test("picking a deal fills an EMPTY Company with the deal's account (D7) — by id where the list holds it live; a Company already shown stays", () => {
    for (const accounts of BOTH) {
        assert.deepEqual(companyAfterDealPick(onSite, { text: '', id: '' }, accounts), { text: SPA, id: 's' }, 'the site, never its twin');
        assert.deepEqual(companyAfterDealPick(onUnit, { text: '  ', id: '' }, accounts), { text: SPA, id: 'u' }, 'spaces are empty');
        assert.deepEqual(companyAfterDealPick(onSite, { text: '', id: 'u' }, accounts), { text: SPA, id: 's' }, 'cleared, the old pick still held: empty, filled');
    }
    const accounts = BOTH[0];
    assert.deepEqual(companyAfterDealPick(onSite, { text: 'INEOS Acetyls', id: 'i' }, accounts), { text: 'INEOS Acetyls', id: 'i' }, 'a Company already picked stays');
    assert.deepEqual(companyAfterDealPick(onSite, { text: 'Dow', id: '' }, accounts), { text: 'Dow', id: '' }, 'a Company typed and not yet picked stays too: it shows');
    assert.deepEqual(companyAfterDealPick(older, { text: '', id: '' }, accounts), { text: SPA, id: '' }, 'a deal with a name only: its name, as typed');
    const renamed = { id: 'd4', opportunityName: 'Expansion', account: 'Shell Port Allen (old)', accountId: 's', stage: 'Proposal' };
    assert.deepEqual(companyAfterDealPick(renamed, { text: '', id: '' }, accounts), { text: SPA, id: 's' }, "the account's own name, not the one the deal carries");
    assert.deepEqual(companyAfterDealPick(onSite, { text: '', id: '' }, REP), { text: '', id: '' }, "an account the rep can't open: a field cannot hold it — it stays empty");
    assert.deepEqual(companyAfterDealPick(onUnit, { text: '', id: 's' }, REP), { text: '', id: 's' }, "a link the user can't open is shown: it stays");
    for (const list of MERGED) {
        assert.deepEqual(companyAfterDealPick({ ...onSite, accountId: 'x' }, { text: '', id: '' }, list), { text: 'Evonik - Lafayette', id: 'y' }, 'merged away: the one it was merged into, by id — never the merged-away id (D12, F4)');
    }
    assert.deepEqual(companyAfterDealPick({ ...onSite, account: 'Evonik', accountId: 'x' }, { text: '', id: '' }, [gone]), { text: 'Evonik', id: '' }, "that one out of the list: the deal's own account name, as typed — never the merged-away name");
    assert.deepEqual(dealCompany(older, []), { text: SPA, id: '' });
    assert.deepEqual(dealCompany(onSite, REP), { text: '', id: 's' }, 'out of the list: the id, no name');
    assert.deepEqual(dealCompany(null, REP), { text: '', id: '' });
});

test('two deals of one name are told apart in the list: "<account> · <stage>" (D9)', () => {
    assert.equal(dealSubline(onSite), 'Shell - Port Allen · Negotiation');
    assert.notEqual(dealSubline(onUnit), dealSubline(onSite));
});

// ── the screens — pinned ────────────────────────────────────────────────────

test('Log Activity: the rail opens with activitySeed (taken once), holds each pick by id, and saves through activityLinks', () => {
    const a = read('src/components/rails/ActivityRail.jsx');
    assert.ok(a.includes("import { dealText, dealSubline, isMergeArchived, HIDDEN_ACCOUNT, HIDDEN_DEAL } from '../../utils/pickLink.js';"));
    assert.ok(a.includes("import { NO_SEED, activitySeed, activityLinks, companyAfterDealPick, outOfList } from '../../utils/railLinks.js';"));
    assert.ok(a.includes("import HiddenLink from './HiddenLink';"));
    assert.ok(a.includes('    const seedRef = useRef(NO_SEED);'), 'the seed is a ref');
    const open = between(a, 'const ctx = activityInitialContext || {};', '}, [showActivityModal, editingActivity, activityInitialContext]);');
    assert.ok(open.includes('const opened = activitySeed(src, { editing: !!editingActivity, accounts, opportunities });'));
    for (const s of ['seedRef.current = opened.seed;', 'setCompanySearch(opened.company.text);', 'setCompanyId(opened.company.id);', 'setOppSearch(opened.deal.text);', 'setOppId(opened.deal.id);'])
        assert.ok(open.includes(s), s);
    assert.ok(!open.includes('relOpp') && !open.includes('.find('), "the open looks nothing up of its own: an edit's Company is never filled from its deal");
    assert.equal(a.split('seedRef.current = ').length - 1, 1, 'the seed is set only when the rail opens');
    const save = between(a, 'const handleSave = async () => {', 'await handleSaveActivity(saveData, {');
    assert.ok(save.includes('const links = activityLinks({ company: { text: companySearch, id: companyId }, deal: { text: oppSearch, id: oppId }, seed: seedRef.current, accounts, opportunities });'));
    assert.ok(save.includes('if (links.error) { refuse(links.error); return; }'), 'a refusal is shown, and scrolled into view (F10)');
    assert.ok(save.includes("if (!formData.notes?.trim()) { refuse('Notes are required.'); return; }"));
    assert.ok(save.includes('            company:       links.company,\n            accountId:     links.accountId,\n            opportunityId: links.opportunityId,'));
    assert.ok(!save.includes('.find(') && !save.includes('toLowerCase'), 'no name looked up again at Save');
    assert.ok(a.includes('<AccountPicker value={companySearch} onChange={setCompanySearch} onSelectAccount={a => setCompanyId(a.id)} onError={setSaveError}'), 'a Company pick (or Create) is held by id');
    assert.ok(a.includes('{outOfList(companyId, accounts)\n                            ? <HiddenLink hidden={HIDDEN_ACCOUNT} title="Remove the account" onRemove={() => setCompanyId(\'\')} />'), "a Company the user can't open: said so, an × (D16)");
    assert.ok(a.includes('<Typeahead value={oppSearch} onChange={setOppSearch} suggestions={dealOptions} textOf={dealText} lineOf={dealSubline} onSelect={pickDeal}'), 'deal rows, the grey line (D9), the deal held by id');
    assert.ok(a.includes('{outOfList(oppId, opportunities)\n                            ? <HiddenLink hidden={HIDDEN_DEAL} title="Remove the deal" onRemove={() => setOppId(\'\')} />'), "a deal the user can't open: said so, an × (D16)");
    assert.ok(a.includes('const dealOptions = (opportunities || []).filter(o => !!dealText(o));'), 'the deals themselves, not their names');
    const pick = between(a, 'const pickDeal = (o) => {', '\n    };');
    for (const s of ['setOppSearch(dealText(o));', 'setOppId(o.id);', 'const next = companyAfterDealPick(o, { text: companySearch, id: companyId }, accounts);', 'setCompanySearch(next.text);', 'setCompanyId(next.id);'])
        assert.ok(pick.includes(s), s);
    const ta = between(a, 'function Typeahead(', '\n}\n');
    assert.ok(ta.includes('function Typeahead({ value, onChange, suggestions, onSelect, placeholder, dropUp, textOf = (s) => s, lineOf = null }) {'));
    assert.ok(ta.includes('<div key={s?.id || i} onMouseDown={e => e.preventDefault()} onClick={() => { onSelect(s); setOpen(false); }}'), 'the record picked is handed back whole');
    assert.ok(ta.includes('>{textOf(s)}{lineOf && lineOf(s) ? <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{lineOf(s)}</div> : null}</div>'));
    // F10: the deal list shuts when the field loses the focus, as the account picker's does; a
    // press on a row or on the count keeps the focus in the field, so the click still lands
    assert.ok(ta.includes('<TextInput value={value} onChange={v => { onChange(v); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 200)} placeholder={placeholder} />'));
    assert.ok(ta.includes("{more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky'"), 'the count holds the focus too');
    const ti = between(a, 'function TextInput(', '\n}\n');
    assert.ok(ti.includes("function TextInput({ value, onChange, placeholder, type = 'text', onBlur }) {") && ti.includes('onChange={e => onChange(e.target.value)} onBlur={onBlur} '), 'the field hands its blur on');
    // F10: a refused Save scrolls its banner into view — the same words twice too
    assert.ok(a.includes('    const errorRef = useRef(null);\n    const [refusals, setRefusals] = useState(0);\n    const refuse = (why) => { setSaveError(why); setRefusals(n => n + 1); };\n'));
    assert.ok(a.includes("    useEffect(() => {\n        if (refusals || activityModalError) errorRef.current?.scrollIntoView?.({ block: 'nearest' });\n    }, [refusals, activityModalError]);\n"), "each refusal, and the server's");
    assert.ok(a.indexOf('}, [refusals, activityModalError]);') < a.indexOf('if (!isOpen) return null;'), 'a hook, before the rail returns early');
    assert.ok(a.includes('{(activityModalError || saveError) && (\n                    <div ref={errorRef} style={{ background:'), 'the banner is what is scrolled to');
    assert.equal(a.split('setSaveError(links.error)').length - 1, 0, 'no refusal set without the scroll');
    assert.ok(between(a, 'function ContactMultiSelect(', '\n}\n').includes('.filter(c => !selected.includes(c.id) && !isMergeArchived(c))'), 'a contact merged away is not offered (D12)');
    assert.ok(between(a, 'function ContactMultiSelect(', '\n}\n').includes('const c = (contacts || []).find(x => x.id === id);'), 'a chip already on the activity names it from the full list');
});

test("the contact rail: Company saves through contactCompany against a seed taken at open; the chip opens the linked account; a hidden link says so", () => {
    const c = read('src/components/rails/ContactRail.jsx');
    assert.ok(c.includes("import { NO_LINK, contactSeed, contactCompany, linkedAccount, contactLogContext, outOfList } from '../../utils/railLinks.js';"));
    assert.ok(c.includes("import { HIDDEN_ACCOUNT } from '../../utils/pickLink.js';"));
    assert.ok(c.includes('    const companySeed = useRef(NO_LINK);'), 'the seed is a ref');
    const open = between(c, '// Seed form when rail opens or contact changes', '}, [contactRailId, contactRailMode]);');
    assert.ok(open.includes("            setCompanySearch(snap.companySearch || '');\n            companySeed.current = NO_LINK;"), 'a draft restored: a new contact, no link');
    assert.ok(open.includes("        setCompanySearch(src.company || '');\n        companySeed.current = contactSeed(contact);"), 'the stored link, taken when the rail opens');
    assert.equal(c.split('companySeed.current = ').length - 1, 2, 'set only when the rail opens');
    assert.ok(between(c, 'const handleSelectCompany = (acc) => {', 'setDirty(true);').includes('accountId: acc.id,'), 'a pick holds its row');
    const save = between(c, 'const handleSave = async () => {', 'const handleDiscard = () => {');
    assert.ok(save.includes('const link = contactCompany({ text: companySearch, heldId: formData.accountId, seed: companySeed.current, accounts });'));
    assert.ok(save.includes('if (link.error) { setSaveError(link.error); return; }'));
    assert.ok(save.includes('            company:   link.company,\n            accountId: link.accountId,'));
    assert.ok(!save.includes('.find(') && !save.includes('toLowerCase'), 'no name looked up again at Save');
    const chip = between(c, 'const handleOpenAccountRail = () => {', 'const handleBack = () => {');
    assert.ok(chip.includes('const acc = linkedAccount(formData, accounts);'));
    assert.ok(c.includes('    const chipAccount = linkedAccount(formData, accounts);'));
    assert.ok(c.includes('onClick={() => handleOpenAccountRail()}'));
    assert.ok(c.includes('{formData.company || chipAccount.name} →'));
    const edit = between(c, '<FieldGroup label="Company" wide>', '</FieldGroup>');
    assert.ok(edit.includes('{outOfList(formData.accountId, accounts) ? ('), "a link the user can't open: in place of the picker (D16)");
    assert.ok(edit.includes('<HiddenLink name={companySearch} hidden={HIDDEN_ACCOUNT} title="Remove the account"'));
    assert.ok(edit.includes("onRemove={() => { setCompanySearch(''); hc('company', ''); hc('accountId', ''); }} />"), 'the × removes the link');
    assert.ok(edit.includes('onSelectAccount={handleSelectCompany}'));
    const view = between(c, '{/* Company chip', '<ReadRow label="Department"');
    assert.ok(view.includes('{outOfList(formData.accountId, accounts) ? (\n                                            <HiddenLink name={formData.company} hidden={HIDDEN_ACCOUNT} />'), 'the view says so too, with no ×');
    assert.ok(view.includes(') : chipAccount ? ('), 'a chip only where there is an account to open');
});

test("the contact rail: every Log button opens Log Activity with the contact, its account by id and its one open deal; + Add Task fills the contact (D19)", () => {
    const c = read('src/components/rails/ContactRail.jsx');
    const comm = between(c, '    const openCommLog = (type, extra = {}) => {', 'setShowActivityModal(true);');
    assert.ok(comm.includes('setEditingActivity && setEditingActivity(null);'), 'a new activity');
    assert.ok(comm.includes('            ...contactLogContext(contact, openOpps),\n            ...(type ? { type } : {}),\n            ...extra,\n        });'));
    assert.ok(!comm.includes('.find('), 'no account looked up by name');
    assert.ok(between(c, 'export default function ContactRail', '} = useApp();').includes('setViewingActivity, setEditingActivity,'));
    assert.ok(!c.includes('handleAddActivity'), '✎ Log no longer opens with the contact alone');
    for (const [label, at] of [['✎ Log', '\n                        ✎ Log\n'], ['+ Log Activity', '\n                                + Log Activity\n']]) {
        assert.equal(c.split(at).length - 1, 1, `${label}: one button`);
        const before = c.slice(0, c.indexOf(at));
        assert.ok(before.slice(before.lastIndexOf('<button')).includes('onClick={() => openCommLog()}'), `${label}: the same prefill`);
    }
    assert.equal(c.split("openCommLog('Email')").length - 1, 2, '✉ Email (no templates) and a blank email');
    assert.ok(c.includes("onClick={() => openCommLog('Call')}"), '☎ Call');
    assert.ok(c.includes("onClick={() => { setEditingTask && setEditingTask({ contactId: contact?.id || '' }); setTaskRailId('new'); setTaskRailMode('new'); }}"), '+ Add Task: the contact filled');
    assert.ok(between(c, 'export default function ContactRail', '} = useApp();').includes('setTaskRailMode, setEditingTask,'));
});

test("an account's own rail opens Log Activity with that account picked, by id (D10)", () => {
    const r = read('src/components/rails/AccountRail.jsx');
    assert.ok(r.includes("setActivityInitialContext && setActivityInitialContext({ opportunityId: '', accountId: account?.id || '' }); setShowActivityModal(true); }}"));
});

test("HiddenLink: the record's own name then the muted words, or the words alone; an × only where a link can be removed", () => {
    const h = read('src/components/rails/HiddenLink.jsx');
    assert.ok(h.includes("export default function HiddenLink({ name = '', hidden, onRemove = null, title = 'Remove the link' }) {"), 'module scope, data as props');
    assert.ok(h.includes('{name ? <>{name} <span style={{ color: T.inkMuted }}>{hiddenAside(hidden)}</span></> : <span style={{ color: T.inkMuted }}>{hidden}</span>}'));
    assert.ok(h.includes('{onRemove && ('), 'a view draws no ×');
    assert.ok(h.includes('<button type="button" title={title} aria-label={title} onClick={onRemove}'));
});

test('railLinks.js is pure: it imports only pickLink.js', () => {
    const src = read('src/utils/railLinks.js');
    assert.deepEqual([...src.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['./pickLink.js']);
    assert.ok(!/\b(React|window|document|localStorage|fetch)\b/.test(src.replace(/\/\/.*$/gm, '')), 'no React, no DOM, no network');
});

// The pane check (12 Oct): each rail's banner draws the last save's server error ahead of its own
// refusal, and Save cleared only its own — so after one failed save every refusal this batch adds
// stayed hidden behind the old error, and Save looked like it did nothing.
test("a Save's refusal is never hidden behind the last save's server error: each rail clears both first", () => {
    for (const [file, setter, shown] of [
        ['AccountRail', 'setAccountModalError', 'accountModalError'],
        ['ActivityRail', 'setActivityModalError', 'activityModalError'],
        ['ContactRail', 'setContactModalError', 'contactModalError'],
        ['TaskRail', 'setTaskModalError', 'taskModalError'],
    ]) {
        const src = read(`src/components/rails/${file}.jsx`);
        assert.ok(src.includes(`{(${shown} || saveError) && (`), `${file}: the banner draws the server error first`);
        const head = between(src, 'const handleSave = async () => {', '\n    };').split('\n').slice(0, 3).join('\n');
        assert.ok(head.includes('setSaveError(null);'), `${file}: Save clears its own refusal first`);
        assert.ok(head.includes(`${setter}?.(null);`), `${file}: Save clears the last server error first`);
    }
});

test('the suites: this file is graded by the harness', () => {
    assert.ok(read('scripts/mutate-import.mjs').includes(' tests/rail-links.test.mjs'), 'SUITES runs this file');
});

// ── the pre-ship round (12 Oct): untouched is what it opened with, and said ──────────

test("REGRESSION (the pre-ship audit): a contact's untouched Company linked to an account merged away returns the text it opened with — never the merged-away name — and says untouched, so the rail leaves it out", () => {
    const shellOil = { id: 'so', name: 'Shell Oil Co', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'k' };
    for (const accounts of BOTH) {
        const list = [...accounts, shellOil];
        const c = { id: 'c7', company: 'Shell', accountId: 'so' };   // merge.mjs renamed the company to the survivor's; the id stayed
        const seed = contactSeed(c);
        assert.deepEqual(contactCompany({ text: 'Shell', heldId: 'so', seed, accounts: list }), { company: 'Shell', accountId: 'so', untouched: true }, 'it saved "Shell Oil Co"');
        assert.equal(linkedAccount(c, list), shell, 'its chip opens the account it was merged into (it opened the merged-away one under the survivor\'s name)');
        assert.equal(linkedAccount(c, [...accounts.filter((a) => a.id !== 'k'), shellOil]), shellOil, 'that one out of the list: the merged-away one, as before');
    }
    assert.equal(contactCompany({ text: SPA, heldId: 's', seed: NO_LINK, accounts: BOTH[0] }).untouched, undefined, 'a row picked is not untouched');
    assert.equal(contactCompany({ text: 'shell - port allen', heldId: 's', seed: { text: SPA, id: 's' }, accounts: BOTH[0] }).untouched, undefined, 'retyped, even as itself: touched — saved under its own name');
    assert.equal(contactCompany({ text: '', heldId: '', seed: { text: SPA, id: 's' }, accounts: BOTH[0] }).untouched, undefined, 'cleared: touched');
});

test('Log Activity says which fields nobody touched — the Company and the deal, each on its own — and an untouched Company saves the text it opened with', () => {
    const accounts = BOTH[0];
    const opportunities = DEALS[0];
    const o = activitySeed({ accountId: 's', opportunityId: 'd2' }, { editing: true, accounts, opportunities });
    assert.deepEqual(activityLinks({ company: o.company, deal: o.deal, seed: o.seed, accounts, opportunities }).untouched, { company: true, deal: true }, 'a Notes-only edit: both left out');
    assert.deepEqual(activityLinks({ company: { text: SPA, id: 'u' }, deal: o.deal, seed: o.seed, accounts, opportunities }).untouched, { company: false, deal: true }, 'the unit picked: the Company is sent');
    assert.deepEqual(activityLinks({ company: o.company, deal: { text: '', id: '' }, seed: o.seed, accounts, opportunities }).untouched, { company: true, deal: false }, 'the deal removed: it is sent, empty');
    const stale = { company: { text: 'Shell Port Allen (old)', id: 's' }, deal: { text: '', id: '' } };
    assert.equal(activityLinks({ ...stale, seed: stale, accounts, opportunities }).company, 'Shell Port Allen (old)', 'the text it opened with — never the record looked up again (an edit leaves it out; activities store no company)');
    assert.equal(activityLinks({ company: { text: 'Ineos - Acetyls', id: '' }, deal: o.deal, seed: o.seed, accounts, opportunities }).untouched.company, false, 'a Company typed');
    assert.equal(activityLinks({ company: o.company, deal: { text: 'turnaround 2027', id: '' }, seed: o.seed, accounts, opportunities }).untouched.deal, false, 'a deal typed');
    assert.equal(activityLinks({ company: o.company, deal: { text: 'Turnaround 2027', id: 'd3' }, seed: o.seed, accounts, opportunities }).untouched.deal, false, 'another deal picked');
    assert.equal(activityLinks({ company: { text: '', id: '' }, deal: o.deal, seed: o.seed, accounts, opportunities }).untouched.company, false, 'the Company emptied');
    assert.equal(activityLinks({ company: { text: SPA, id: 's' }, deal: o.deal, seed: NO_SEED, accounts, opportunities }).untouched.company, false, 'a prefill held is not the field as it opened with nothing');
});
