// tests/deal-account.test.mjs
//
// A deal is saved with the account picked (state §0.198 — OPEN_ITEMS §1 item 1; Jeff, 11
// Oct: D1 "One match saves, two refuse", D2 "Yes, same batch", D5 "Same as clicking the
// site", D11 "Refuse, name the reason", D12 "Yes, hide them", D13 "Check it now", D14 "Yes,
// in batch 1", D15 "Only real sites", D16 "Say so, allow removing").
//
// Before: the deal window's Save took the first account whose lower-cased name was the
// field's text. Of UKG's two "Shell - Port Allen" under Shell, a business unit and a site, a
// pick of either could save the other; a site typed in full became the deal's account;
// "Ineos - Acetyls" was refused with a Create the field did not offer; the Contacts tab's
// Save checked nothing and saved an old pick under new text; the Site Name list found the
// account by name and offered an empty business unit as a site. The endpoint dropped
// accountId: a deal was linked by name alone, and a deal moved to another account kept its
// old id. A merge renamed the deals but left their id on the account merged away. Then (area
// 9): a typed account emptied a Site Name typed after it, at Save; a screen loaded before a
// merge was refused when the walk led back to the account the deal held; a CSV overwrite
// renamed a deal's account and kept the old id; a merge into a site left the deals on it.
// Then (area 10): one stray keystroke in Account lost the deal's Site Name for good; a stale
// whole-row save (the Kanban's drag, Reports' contact edit) sent no account id and undid a
// D22 lift by name; a walk through a site the deal was lifted through was refused once the
// site had moved; a merge lifting its survivor to the top left it a site, its deals on it.
// Then (area 11): the Site Name was still lost when Account was backspaced to empty and typed
// again, and on a deal saved with no id by any edit but the exact text it opened with; a deal
// window opened from a list loaded before the deal was linked lost a Site Name typed in it;
// Reports' "Contacts on this deal" sent the whole row it loaded, re-linking a deal another
// session had moved.
//
// Here: utils/dealAccount.js and buyingCommittee.js, run on UKG's rows; the window, the
// endpoint, the Closed Lost save and the merge, pinned (node --test renders no JSX). The
// endpoint runs against the test database in tests/integration/deal-account.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    resolveDealAccount, dealAccountSeed, heldAccountId, siteAsAccountTyped, sitesOf, dealKeeps, isHiddenAccount, HIDDEN_ACCOUNT_WORDS, bulkAccountLinks,
} from '../src/utils/dealAccount.js';
import { siteOutOfReach, HIDDEN_ACCOUNT } from '../src/utils/pickLink.js';
import { contactsToAdd } from '../src/utils/buyingCommittee.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (src, s) => src.split(s).length - 1;
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };

// UKG's two "Shell - Port Allen" under Shell (read 9 Oct, SELECT only): a business unit and
// a site. The accounts GET orders by name only, so the list holds them in either order.
const SHELL = { id: 'k', name: 'Shell', accountTier: 'account', parentAccountId: null };
const UNIT = { id: 'u', name: 'Shell - Port Allen', accountTier: 'business_unit', parentAccountId: 'k' };
const SITE = { id: 's', name: 'Shell - Port Allen', accountTier: 'site', parentAccountId: 'k' };
const INEOS = { id: 'n', name: 'INEOS', accountTier: 'account', parentAccountId: null };
const ACETYLS = { id: 'i', name: 'INEOS Acetyls', accountTier: 'business_unit', parentAccountId: 'n' };
const TWINS = [[SHELL, UNIT, SITE, INEOS, ACETYLS], [SHELL, SITE, UNIT, INEOS, ACETYLS]];
const order = (list) => list.map((a) => a.id).join(' ');
const NEW = dealAccountSeed(null);                                       // a new deal: nothing stored
const deal = (account, accountId) => dealAccountSeed({ id: 'd1', account, accountId });
const ask = (accounts, text, heldId = '', seed = NEW) => resolveDealAccount({ text, heldId, seed, accounts });
const refused = (r) => typeof r.error === 'string' && r.error.length > 0 && !('id' in r);
const TWIN_MANY = 'More than one account is named “Shell - Port Allen”. Pick the one you mean from the list — each row names its parent.';

// ── what a Save links — run ─────────────────────────────────────────────────

test('a row picked is saved as that row — either twin, whichever the list holds first', () => {
    for (const list of TWINS) {
        assert.deepEqual(ask(list, 'Shell - Port Allen', 'u'), { how: 'held', id: 'u', name: 'Shell - Port Allen' }, `the unit (${order(list)})`);
        assert.deepEqual(ask(list, 'shell port allen', 'u'), { how: 'held', id: 'u', name: 'Shell - Port Allen' }, 'still reads as the pick: saved under its own spelling');
        assert.deepEqual(ask(list, 'Shell', 'k'), { how: 'held', id: 'k', name: 'Shell' }, "a site's row picked holds its parent (onSelectSite)");
    }
});

test('a name typed in full that two rows answer is refused, and says how to choose — never the first of the name (D1)', () => {
    for (const list of TWINS) {
        assert.deepEqual(ask(list, 'Shell - Port Allen'), { error: TWIN_MANY }, `a new deal (${order(list)}): the unit as an account and the site through Shell`);
        assert.ok(refused(ask(list, 'SHELL  port-allen', 'k', deal('Shell', 'k'))), 'an existing deal, the field typed over');
    }
});

test('a name typed in full that one account answers saves it, under its own spelling — "Ineos - Acetyls" is INEOS Acetyls — and leaves Site Name to the window, which emptied it when the text stopped reading as the account held', () => {
    assert.deepEqual(ask(TWINS[0], 'Ineos - Acetyls'), { how: 'typed', id: 'i', name: 'INEOS Acetyls' });
    assert.deepEqual(ask(TWINS[0], '  shell '), { how: 'typed', id: 'k', name: 'Shell' }, 'case and spaces');
    assert.deepEqual(ask(TWINS[0], 'INEOS Acetyls', 'u'), { how: 'typed', id: 'i', name: 'INEOS Acetyls' }, 'an old pick under new text is dropped — the text decides; no Site Name in the answer, so one typed after the account stands');
    assert.deepEqual(ask(TWINS[0], 'Ineos - Acetyls', 'i', deal('Shell', 'k')), { how: 'held', id: 'i', name: 'INEOS Acetyls' }, 'its row picked (onSelectAccount empties Site Name itself): held, Site Name left as the window has it');
    assert.deepEqual(ask(TWINS[0], 'ineos acetyls', 'i', deal('INEOS Acetyls', 'i')), { how: 'held', id: 'i', name: 'INEOS Acetyls' }, 'the account it holds, retyped: its Site Name stays');
});

// The deal window's Account and Site Name as OpportunityModal keeps them (pinned below): typing
// in Account asks siteAsAccountTyped over the form as the keystroke found it — the Site Name
// empties the moment the text stops reading as the account held, kept aside, and comes back when
// it reads as that account again; a row picked, or a Site Name typed, drops what was kept; Save
// sends what resolveDealAccount answers over the form, and a name typed in full fills the fields
// as its row would.
const dealWindow = (accounts, opened = null) => {
    const seed = dealAccountSeed(opened);
    let form = { account: opened?.account || '', accountId: opened?.accountId || '', site: opened?.site || '' };
    let accountSearch = form.account, siteSearch = form.site, kept = null;
    return {
        typeAccount(v) {
            const before = form;
            accountSearch = v;
            if (!v.trim()) form = { ...form, account: '', accountId: '' };
            const s = siteAsAccountTyped(v, before, siteSearch, kept, seed);
            if (s) { kept = s.kept; siteSearch = s.shown; form = { ...form, site: s.site }; }
        },
        pick(acc) { accountSearch = acc.name; form = { ...form, account: acc.name, accountId: acc.id, site: '' }; siteSearch = ''; kept = null; },
        typeSite(v) { siteSearch = v; form = { ...form, site: v }; kept = null; },
        get site() { return siteSearch; },
        save() {
            const r = resolveDealAccount({ text: accountSearch, heldId: form.accountId, seed, accounts });
            if (r.error) return r;
            if (r.how === 'typed') {
                accountSearch = r.name;
                if (r.site != null) siteSearch = r.site;
                form = { ...form, account: r.name, accountId: r.id, ...(r.site != null ? { site: r.site } : {}) };
            }
            return { ...form, account: r.name, accountId: r.id, ...(r.site != null ? { site: r.site } : {}) };
        },
    };
};

test('G1: a Site Name typed after a typed account is the one saved; an account typed over the one held empties its Site Name at once, as a click on another row does; a site typed in full still fills it (D5)', () => {
    const fresh = dealWindow(TWINS[0]);
    fresh.typeAccount('ineos acetyls');
    fresh.typeSite('Plant B');
    assert.deepEqual(fresh.save(), { account: 'INEOS Acetyls', accountId: 'i', site: 'Plant B' }, 'a new deal: the account typed, then its Site Name — saved as typed');
    const before = dealWindow(TWINS[0]);
    before.typeSite('Plant X');
    before.typeAccount('ineos acetyls');
    assert.equal(before.site, '', 'a Site Name typed before the account: emptied when the account is typed');
    const shellDeal = { id: 'd1', account: 'Shell', accountId: 'k', site: 'Plant A' };
    const retyped = dealWindow(TWINS[0], shellDeal);
    retyped.typeAccount('INEOS Acetyls');
    assert.equal(retyped.site, '', "the account held typed over: Shell's Site Name goes at once");
    retyped.typeSite('Plant B');
    assert.deepEqual(retyped.save(), { account: 'INEOS Acetyls', accountId: 'i', site: 'Plant B' });
    const same = dealWindow(TWINS[0], shellDeal);
    same.typeAccount('shell ');
    assert.equal(same.site, 'Plant A', 'still reads as the account held: its Site Name stays');
    assert.deepEqual(same.save(), { account: 'Shell', accountId: 'k', site: 'Plant A' });
    const terminal = { id: 'L', name: 'Texas City Terminal', accountTier: 'site', parentAccountId: 'k' };
    const d5 = dealWindow([SHELL, terminal]);
    d5.typeAccount('texas city terminal');
    assert.deepEqual(d5.save(), { account: 'Shell', accountId: 'k', site: 'Texas City Terminal' }, "a site typed in full: the site's account, Site Name the site (D5)");
});

test('H3: a stray keystroke in Account and its fix keep the Site Name — it empties while the text reads as another account and comes back when it reads as the account held again; a real change still empties it; a pick or a Site Name typed drops what was kept aside', () => {
    const shellDeal = { id: 'd1', account: 'Shell', accountId: 'k', site: 'Port Allen' };
    // the decisions critic's case (12 Oct): "Shellx", then back to "Shell", then Save
    const typo = dealWindow(TWINS[0], shellDeal);
    typo.typeAccount('Shellx');
    assert.equal(typo.site, '', 'the text no longer reads as Shell: Site Name empties at once');
    typo.typeAccount('Shell');
    assert.equal(typo.site, 'Port Allen', 'it reads as Shell again: its Site Name comes back');
    assert.deepEqual(typo.save(), { account: 'Shell', accountId: 'k', site: 'Port Allen' }, 'saved as before area 9 saved it (area 9: site "")');
    // many keystrokes away and back, to another spelling of the same account
    const far = dealWindow(TWINS[0], shellDeal);
    for (const v of ['Shel', 'She', 'Sh', 'S', 'Sh', 'She', 'Shel', 'SHELL ']) far.typeAccount(v);
    assert.equal(far.site, 'Port Allen', 'reads as Shell again by searchKey: the same account');
    // a real change: another account typed, and saved
    const real = dealWindow(TWINS[0], shellDeal);
    real.typeAccount('INEOS Acetyls');
    assert.deepEqual(real.save(), { account: 'INEOS Acetyls', accountId: 'i', site: '' }, "another account: Shell's Site Name never comes with it");
    // a pick drops what was kept: Shell's row clicked again empties Site Name, as a click does, and a typo fixed after it gives nothing back
    const picked = dealWindow(TWINS[0], shellDeal);
    picked.typeAccount('Shellx');
    picked.pick(SHELL);
    picked.typeAccount('Shellx');
    picked.typeAccount('Shell');
    assert.equal(picked.site, '', 'the row clicked emptied it; what the typo kept aside does not come back over the click');
    // a Site Name typed while the text read as another account stands
    const typed = dealWindow(TWINS[0], shellDeal);
    typed.typeAccount('Shellx');
    typed.typeSite('Gate 3');
    typed.typeAccount('Shell');
    assert.equal(typed.site, 'Gate 3', 'the Site Name typed is kept; the old one does not come back over it');
    // the account held changed by a Save that took a typed name: Shell's Site Name never comes back under INEOS Acetyls
    const moved = dealWindow(TWINS[0], shellDeal);
    moved.typeAccount('ineos acetyls');
    assert.equal(moved.save().accountId, 'i');
    moved.typeAccount('ineos acetylsx');
    moved.typeAccount('ineos acetyls');
    assert.equal(moved.site, '', "nothing of Shell's comes back under another account");
    // a deal saved with no account id: the field exactly as it opened is the account held (D1's untouched)
    const nameOnly = dealWindow(TWINS[0], { id: 'd2', account: 'Shell - Port Allen', accountId: null, site: 'Tank 4' });
    nameOnly.typeAccount('Shell - Port Allenx');
    assert.equal(nameOnly.site, '', 'a typo: empties');
    nameOnly.typeAccount('Shell - Port Allen');
    assert.equal(nameOnly.site, 'Tank 4', 'back as it opened: its Site Name back');
    assert.deepEqual(nameOnly.save(), { account: 'Shell - Port Allen', accountId: '', site: 'Tank 4' }, 'an untouched Save: the link as stored (no id), its Site Name with it');
    const nameRetyped = dealWindow(TWINS[0], { id: 'd2', account: 'Shell - Port Allen', accountId: null, site: 'Tank 4' });
    nameRetyped.typeAccount('shell - port allen');
    assert.equal(nameRetyped.site, 'Tank 4', 'another spelling of a name-only deal reads as it opened by searchKey, as a linked deal does (J2): kept');
    // the rule itself
    assert.equal(siteAsAccountTyped('Shell', { account: 'Shell', accountId: 'k', site: 'A' }, 'A', null), null, 'reads as the account held, nothing kept: no change');
    assert.equal(siteAsAccountTyped('x', { account: 'Shell', accountId: 'k', site: '' }, '', null), null, 'nothing to empty');
    assert.deepEqual(siteAsAccountTyped('x', { account: 'Shell', accountId: 'k', site: 'A' }, 'A', null), { site: '', shown: '', kept: { held: 'k', name: 'Shell', site: 'A', shown: 'A' } }, 'kept aside with the name of the account held (J2)');
    assert.deepEqual(siteAsAccountTyped('shell', { account: 'Shell', accountId: 'k', site: '' }, '', { held: 'k', name: 'Shell', site: 'A', shown: 'A' }), { site: 'A', shown: 'A', kept: null });
    assert.equal(siteAsAccountTyped('shell', { account: 'Shell', accountId: 'k', site: '' }, '', { held: 'n', name: 'INEOS', site: 'A', shown: 'A' }), null, "kept from another account: not this one's");
    assert.equal(siteAsAccountTyped('', { account: '', accountId: '', site: '' }, '', { held: '', name: '', site: 'A', shown: 'A' }, dealAccountSeed(null)), null, 'a new deal holds no account: nothing comes back');
});

test('J2: the Site Name comes back when the Account text reads as the account held again after the field was emptied on the way, and a deal saved with no id is read by searchKey — the decisions critic\'s cases B, D and E, and a change of case or spacing alone', () => {
    const shellDeal = { id: 'd1', account: 'Shell', accountId: 'k', site: 'Port Allen' };
    const nameDeal = { id: 'd2', account: 'Shell', accountId: null, site: 'Port Allen' };
    const erase = (w, word) => { for (let i = word.length - 1; i >= 0; i--) w.typeAccount(word.slice(0, i)); };
    const type = (w, word) => { for (let i = 1; i <= word.length; i++) w.typeAccount(word.slice(0, i)); };
    // B: a linked deal, Account backspaced to empty — which clears the id the form held — and "Shell" typed again
    const b = dealWindow(TWINS[0], shellDeal);
    erase(b, 'Shell');
    assert.equal(b.site, '', 'emptied while the text reads as no account');
    type(b, 'Shell');
    assert.equal(b.site, 'Port Allen', 'it reads as Shell again: its Site Name back, though the emptied field cleared the id');
    assert.deepEqual(b.save(), { account: 'Shell', accountId: 'k', site: 'Port Allen' }, 'B saved as base saved it');
    // the same, select-all and the name typed over it in another case
    const all = dealWindow(TWINS[0], shellDeal);
    all.typeAccount('');
    type(all, 'SHELL');
    assert.deepEqual(all.save(), { account: 'Shell', accountId: 'k', site: 'Port Allen' });
    // D: a deal saved with no id, a trailing space typed
    const d = dealWindow(TWINS[0], nameDeal);
    d.typeAccount('Shell ');
    assert.equal(d.site, 'Port Allen', 'reads as it opened by searchKey: never emptied');
    assert.deepEqual(d.save(), { account: 'Shell', accountId: 'k', site: 'Port Allen' }, 'D: typed, so linked by D1 — its Site Name kept');
    // E: a deal saved with no id, a typo fixed in another case
    const e = dealWindow(TWINS[0], nameDeal);
    e.typeAccount('Shellx');
    assert.equal(e.site, '');
    e.typeAccount('shell');
    assert.equal(e.site, 'Port Allen');
    assert.deepEqual(e.save(), { account: 'Shell', accountId: 'k', site: 'Port Allen' }, 'E: its Site Name back');
    // a case or spacing edit alone, both kinds of deal
    for (const [label, opened] of [['linked', shellDeal], ['no id', nameDeal]]) {
        for (const v of ['shell', 'SHELL', ' Shell', 'Shell  ']) {
            const w = dealWindow(TWINS[0], opened);
            w.typeAccount(v);
            assert.equal(w.site, 'Port Allen', `${label}, "${v}": the same account — its Site Name stays`);
            assert.equal(w.save().site, 'Port Allen');
        }
    }
    // a deal saved with no id, emptied and typed again
    const g = dealWindow(TWINS[0], nameDeal);
    erase(g, 'Shell');
    type(g, 'shell');
    assert.equal(g.site, 'Port Allen');
    // still: an emptied field typed into as ANOTHER account brings nothing back, and nor does a pick between
    const other = dealWindow(TWINS[0], shellDeal);
    erase(other, 'Shell');
    type(other, 'INEOS Acetyls');
    assert.equal(other.site, '');
    assert.deepEqual(other.save(), { account: 'INEOS Acetyls', accountId: 'i', site: '' }, "Shell's Site Name never comes with another account");
    const picked = dealWindow(TWINS[0], shellDeal);
    erase(picked, 'Shell');
    picked.pick(SHELL);
    picked.typeAccount('Shellx');
    picked.typeAccount('Shell');
    assert.equal(picked.site, '', 'the row clicked dropped what the emptied field kept aside');
    // the rule: what was kept comes back under the account kept, while the form holds it or none — never another
    const kept = { held: 'k', name: 'Shell', site: 'A', shown: 'A' };
    assert.deepEqual(siteAsAccountTyped('Shell', { account: '', accountId: '', site: '' }, '', kept, deal('Shell', 'k')), { site: 'A', shown: 'A', kept: null }, 'the field emptied on the way: the id gone, the name kept');
    assert.equal(siteAsAccountTyped('Shell', { account: 'INEOS Acetyls', accountId: 'i', site: '' }, '', kept, deal('Shell', 'k')), null, 'the form holds another account now (picked, the text typed over it): nothing of the kept one comes back');
    assert.deepEqual(siteAsAccountTyped('', { account: 'Shell', accountId: 'k', site: 'A' }, 'A', null, deal('Shell', 'k')), { site: '', shown: '', kept }, 'emptied: kept aside with its name');
    assert.deepEqual(siteAsAccountTyped('Shellx', { account: '', accountId: '', site: 'A' }, 'A', null, dealAccountSeed(nameDeal)), { site: '', shown: '', kept: { held: '=Shell', name: 'Shell', site: 'A', shown: 'A' } }, 'a deal saved with no id: the field as it opened, by name');
});

test("a site typed in full is its row picked: the account is the site's parent, Site Name the site (D5)", () => {
    const terminal = { id: 'L', name: 'Texas City Terminal', accountTier: 'site', parentAccountId: 'k' };
    assert.deepEqual(ask([SHELL, terminal], 'texas city terminal'), { how: 'typed', id: 'k', name: 'Shell', site: 'Texas City Terminal' });
    const dock = { id: 'D', name: 'Port Allen Dock', accountTier: 'site', parentAccountId: 'u' };
    assert.deepEqual(ask([SHELL, UNIT, dock], 'Port Allen Dock'), { how: 'typed', id: 'u', name: 'Shell - Port Allen', site: 'Port Allen Dock' }, 'a site under a unit: the unit');
    assert.equal(dealKeeps(terminal), false, "a deal's account is never a site");
    assert.equal(dealKeeps(UNIT), true);
    assert.equal(dealKeeps(null), false);
});

test("D11: a site whose account is not in the caller's list is refused, and says why — nothing is saved", () => {
    const hidden = { id: 'h', name: 'Baton Rouge Dock', accountTier: 'site', parentAccountId: 'another_reps_account' };
    assert.deepEqual(ask([SHELL, hidden], ' Baton Rouge Dock'), { error: "“Baton Rouge Dock” is a site of an account you can't open — ask your manager to link it." });
    assert.equal(ask([SHELL, hidden], 'Baton Rouge Dock').error, siteOutOfReach('Baton Rouge Dock'), "one sentence: the picker's line and the Save's");
    const quay = { id: 'q', name: 'Quay 4', accountTier: 'site', parentAccountId: 's' };
    assert.deepEqual(ask([SHELL, SITE, quay], 'Quay 4'), { error: '“Quay 4” is a site — pick the account it belongs to.' }, 'a site under a site leads to no account the window lists: refused as a site, not as one the user cannot open (F7)');
});

test('a site whose account was merged away leads to no account — the merged-away one is never linked by name (D12), and the sentence is not D11\'s (F7)', () => {
    const oldEvonik = { id: 'oe', name: 'Old Evonik', accountTier: 'account', parentAccountId: null, mergeArchived: true };
    const dock = { id: 'od', name: 'Lafayette Dock', accountTier: 'site', parentAccountId: 'oe' };
    const r = ask([SHELL, oldEvonik, dock], 'Lafayette Dock');
    assert.deepEqual(r, { error: '“Lafayette Dock” is a site — pick the account it belongs to.' }, 'refused — not saved as Old Evonik, and an Admin is not told to ask a manager');
    assert.ok(!JSON.stringify(r).includes('"oe"'));
    assert.deepEqual(ask([SHELL, dock], 'Lafayette Dock'), { error: siteOutOfReach('Lafayette Dock') }, 'its account missing from the list: D11');
});

test('a name only an account merged away has is refused, naming the account it was merged into — never offered as a new account (F9)', () => {
    const oldCo = { id: 'z', name: 'Shell Oil', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'k' };
    assert.deepEqual(ask([...TWINS[0], oldCo], 'shell oil'), { error: '“shell oil” was merged into “Shell” — pick “Shell”.' });
    assert.deepEqual(ask([UNIT, oldCo], 'Shell Oil'), { error: '“Shell Oil” was merged into another account.' }, 'Shell outside the list');
});

test("a field nobody touched keeps the deal's link exactly as stored — a site, a twin, an account outside the list, one merged away, none (D1)", () => {
    const list = TWINS[0];
    const untouched = (account, accountId, accounts = list) => ask(accounts, account, accountId, deal(account, accountId));
    assert.deepEqual(untouched('Shell - Port Allen', 's'), { how: 'untouched', id: 's', name: 'Shell - Port Allen' }, 'a site an older Save made the account');
    assert.deepEqual(untouched('Shell - Port Allen', 'u'), { how: 'untouched', id: 'u', name: 'Shell - Port Allen' }, 'a twin');
    assert.deepEqual(untouched('Gulf Coast Holdings', 'g'), { how: 'untouched', id: 'g', name: 'Gulf Coast Holdings' }, "an account outside a rep's list: the name the deal stores");
    const merged = { id: 'x', name: 'Evonik - Lafayette', accountTier: 'account', parentAccountId: null, mergeArchived: true };
    assert.deepEqual(untouched('Evonik - Lafayette', 'x', [...list, merged]), { how: 'untouched', id: 'x', name: 'Evonik - Lafayette' }, 'merged away: the link is kept (D12)');
    assert.deepEqual(untouched('Shell - Port Allen', ''), { how: 'untouched', id: '', name: 'Shell - Port Allen' }, 'a deal linked by name only stays so');
    assert.deepEqual(ask(list, 'Shell', 'k', deal('Shell Oil Co', 'k')), { how: 'held', id: 'k', name: 'Shell' }, 'touched, still the account held: its own name');
    // touched — a space typed after the stored site: a site is never the account, so the
    // text decides, and two rows answer it
    assert.deepEqual(ask(list, 'Shell - Port Allen ', 's', deal('Shell - Port Allen', 's')), { error: TWIN_MANY });
    // a new deal is never untouched: a lead's convert seeds a name, no deal id
    assert.ok(refused(ask(list, 'Shell - Port Allen', '', dealAccountSeed({ account: 'Shell - Port Allen' }))));
});

test('the seed is what the field opened with, taken once: a saved deal its name and id, anything else nothing', () => {
    assert.deepEqual(dealAccountSeed({ id: 'd1', account: 'Shell', accountId: 'k' }), { text: 'Shell', id: 'k' });
    assert.deepEqual(dealAccountSeed({ id: 'd1', account: 'Shell', accountId: null }), { text: 'Shell', id: '' }, 'a deal saved with no id (28 of 85, SELECT 12 Oct): a name, no id');
    assert.deepEqual(dealAccountSeed({ account: 'Acme', accountId: 'a' }), { text: '', id: '' }, "a lead's convert: no deal yet");
    assert.deepEqual(dealAccountSeed(null), { text: '', id: '' });
    assert.deepEqual(dealAccountSeed(undefined), { text: '', id: '' });
});

test('nothing the list holds by that name, or no name at all: refused, nothing saved — "use Create" only where Create is offered', () => {
    assert.deepEqual(ask(TWINS[0], 'Chevron'), { error: '“Chevron” isn\'t a saved account. Pick one from the list, or use “Create” in the Account field.' });
    assert.ok(refused(ask(TWINS[0], 'Chevron', 'u')), 'an old pick is not saved under it');
    assert.deepEqual(ask(TWINS[0], ' - '), { error: '“-” isn\'t a saved account. Pick one from the list.' }, 'only punctuation: the picker offers no Create');
    assert.deepEqual(ask(TWINS[0], '   '), { error: 'Account name is required' });
    const oldCo = { id: 'z', name: 'Old Co', accountTier: 'account', parentAccountId: null, mergeArchived: true };
    assert.ok(refused(ask([SHELL, oldCo], 'Old Co')), 'an account merged away is never taken by name (D12)');
});

test('a merge-archived site is no second match: the live one of the name is its row picked (D12)', () => {
    const evonik = { id: 'e', name: 'Evonik', accountTier: 'account', parentAccountId: null };
    const gone = { id: 'x', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e', mergeArchived: true };
    const live = { id: 'y', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e' };
    for (const list of [[evonik, gone, live], [evonik, live, gone]]) {
        assert.deepEqual(ask(list, 'Evonik - Lafayette'), { how: 'typed', id: 'e', name: 'Evonik', site: 'Evonik - Lafayette' }, order(list));
    }
});

test("the Site Name list: by the account's id, never its name — the chosen twin's own sites, only real sites (D15), nothing merged away", () => {
    const dock = { id: 'D', name: 'Port Allen Dock', accountTier: 'site', parentAccountId: 'u' };
    const annex = { id: 'A', name: 'Port Allen Annex', accountTier: 'business_unit', parentAccountId: 'u' };
    const empty = { id: 'E', name: 'Shell - Norco', accountTier: 'business_unit', parentAccountId: 'k' };
    const gate = { id: 'o', name: 'Port Allen Old Gate', accountTier: 'site', parentAccountId: 'k', mergeArchived: true };
    for (const list of [[SHELL, UNIT, SITE, dock, annex, empty, gate], [SHELL, SITE, UNIT, empty, gate, annex, dock]]) {
        assert.deepEqual(sitesOf(list, 'u').map((a) => a.id), ['D'], `the unit's own sites, not the unit under it (${order(list)})`);
        assert.deepEqual(sitesOf(list, 's'), [], 'the site twin has none');
        assert.deepEqual(sitesOf(list, 'k').map((a) => a.id), ['s', 'D'], "Shell's own site, then its unit's — never an empty unit, never the merged-away gate");
    }
    assert.deepEqual(sitesOf([SHELL, UNIT], ''), []);
    assert.deepEqual(sitesOf([SHELL, UNIT], 'nope'), []);
    assert.deepEqual(sitesOf(undefined, 'k'), []);
    const goneUnit = { ...UNIT, mergeArchived: true };
    assert.deepEqual(sitesOf([SHELL, goneUnit, dock], 'u'), [], 'an account merged away offers no sites');
});

test('the Site Name list follows the account held only while the field reads as it', () => {
    const held = { account: 'Shell - Port Allen', accountId: 'u' };
    assert.equal(heldAccountId('shell port allen', held), 'u', 'the field still reads as the pick');
    assert.equal(heldAccountId('Shell - Port', held), '', 'typed over: not that account');
    assert.equal(heldAccountId('', held), '');
    assert.equal(heldAccountId('Shell - Port Allen', { account: 'Shell - Port Allen', accountId: '' }), '', 'a name-only deal holds no account');
    assert.equal(heldAccountId('Shell'), '');
});

test("D16: a link to an account the caller's list does not hold is said so — the name the deal stores, the words, an ×; untouched, a Save keeps it", () => {
    assert.equal(HIDDEN_ACCOUNT_WORDS, "(an account you can't open)");
    assert.equal(HIDDEN_ACCOUNT, "An account you can't open", 'the words every screen shows (pickLink.js)');
    const list = TWINS[0];
    assert.equal(isHiddenAccount('g', list), true, "another rep's account, or one deleted");
    assert.equal(isHiddenAccount('k', list), false);
    assert.equal(isHiddenAccount('', list), false, 'no link: nothing to say');
    assert.equal(isHiddenAccount('x', [...list, { id: 'x', name: 'Gone', mergeArchived: true }]), false, 'merged away is still in the list: its name shows, no words');
    assert.equal(isHiddenAccount('k', undefined), true, 'no list yet');
    assert.deepEqual(ask(list, 'Gulf Coast Holdings', 'g', deal('Gulf Coast Holdings', 'g')), { how: 'untouched', id: 'g', name: 'Gulf Coast Holdings' }, 'untouched: kept');
    assert.deepEqual(ask(list, '', '', deal('Gulf Coast Holdings', 'g')), { error: 'Account name is required' }, 'the ×: the link is gone, and a deal needs an account');
});

test("the deal's Contacts tab never offers a contact merged into another (D12) — buyingCommittee.js, run", () => {
    const C = [
        { id: 'c1', firstName: 'Dana', lastName: 'Whitaker', company: 'Shell' },
        { id: 'c2', firstName: 'Dana', lastName: 'Whitaker', company: 'Shell', mergeArchived: true },
        { id: 'c3', firstName: 'Luis', lastName: 'Ortega', company: 'Shell' },
    ];
    assert.deepEqual(contactsToAdd(C, 'dana', []).map((c) => c.id), ['c1']);
    assert.deepEqual(contactsToAdd(C, 'shell', []).map((c) => c.id), ['c1', 'c3']);
});

// ── the window, the endpoint, the Closed Lost save, the merge — pinned ───────

test("THE WINDOW: every Save asks dealAccount.js — the Contacts tab's too (D2); the seed is taken once; the Site Name list follows the account held, by id", () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    assert.ok(m.includes("import { resolveDealAccount, dealAccountSeed, heldAccountId, siteAsAccountTyped, sitesOf, isHiddenAccount, HIDDEN_ACCOUNT_WORDS } from '../../utils/dealAccount.js';"));
    assert.ok(m.includes("import { unarchived, HIDDEN_ACCOUNT } from '../../utils/pickLink.js';"));
    assert.ok(m.includes('    const accountSeed = useRef(dealAccountSeed(opportunity)).current;'), 'taken once, when the window opens');
    assert.equal(count(m, 'dealAccountSeed('), 1, 'never worked out again from the live row');
    const save = between(m, 'const saveDeal = () => {', 'const handleSubmit = ');
    assert.ok(save.includes('? resolveDealAccount({ text: accountSearch, heldId: formData.accountId, seed: accountSeed, accounts })'), 'the field, the id held, the field as it opened, the full list');
    assert.ok(save.includes('else if (resolvedAccount.error) errors.account = resolvedAccount.error;'), 'a refusal shows under the field, and nothing is sent');
    const typed = save.indexOf("else if (resolvedAccount.how === 'typed') {");
    assert.ok(typed > 0, 'a name typed in full fills the fields as its row would (D5)');
    assert.ok(save.includes('setFormData(prev => ({ ...prev, account: resolvedAccount.name, accountId: resolvedAccount.id, ...(resolvedAccount.site != null ? { site: resolvedAccount.site } : {}) }));'));
    assert.ok(save.includes('if (resolvedAccount.site != null) setSiteSearch(resolvedAccount.site);'));
    assert.ok(save.includes('onSave(leaveOut({ ...formData, account: resolvedAccount.name, accountId: resolvedAccount.id, ...(resolvedAccount.site != null ? { site: resolvedAccount.site } : {}), arr:'), 'what is sent is what was resolved, Site Name with it — an untouched Account left out of an edit (tests/leave-out.test.mjs)');
    const picker = between(m, '<AccountPicker\n', 'onSelectAccount=');
    assert.ok(picker.includes("onChange={(v) => { setAccountSearch(v); if (validationErrors.account) setValidationErrors(prev => { const n = { ...prev }; delete n.account; return n; }); if (!v.trim()) setFormData(prev => ({ ...prev, account: '', accountId: '' })); const s = siteAsAccountTyped(v, formData, siteSearch, keptSiteRef.current, accountSeed); if (s) { keptSiteRef.current = s.kept; setSiteSearch(s.shown); setFormData(prev => ({ ...prev, site: s.site })); } }}"), "G1 and H3: Site Name empties the moment the Account text stops reading as the account held — never at Save — and comes back when it reads as it again");
    assert.ok(m.includes('    const keptSiteRef = useRef(null);'), 'what the field put aside: a ref, not state (no draw of its own)');
    const at = (s) => m.indexOf(s);
    assert.ok(at("onSelectAccount={(acc) => { setAccountSearch(acc.name); setFormData(prev => ({ ...prev, account: acc.name, accountId: acc.id, site: '' })); setSiteSearch(''); keptSiteRef.current = null;") > 0, 'H3: a row picked drops what was kept');
    assert.ok(at('onSelectSite={(site, parent) => { setAccountSearch(parent.name); setFormData(prev => ({ ...prev, account: parent.name, accountId: parent.id, site: site.name })); setSiteSearch(site.name); keptSiteRef.current = null;') > 0, 'a site row too');
    assert.ok(at("onChange={e => { setSiteSearch(e.target.value); handleChange('site', e.target.value); setShowSiteSuggestions(true); keptSiteRef.current = null; }}") > 0, 'a Site Name typed');
    assert.ok(at("onClick={() => { setSiteSearch(s.name); handleChange('site', s.name); setShowSiteSuggestions(false); keptSiteRef.current = null; }}") > 0, 'a Site Name picked');
    assert.equal(count(m, 'keptSiteRef.current = null;'), 4);
    assert.equal(count(m, '.toLowerCase() === typedAccount.toLowerCase()'), 0, 'REGRESSION: the first account of the name');
    assert.equal(count(m, "(a.name||'').toLowerCase()===t.toLowerCase()"), 0, "REGRESSION: the Contacts tab's own lookup");
    const tab = between(m, "{detailTab === 'contacts' && (", "{detailTab === 'ai-score' && (");
    assert.ok(tab.includes('handleChange={handleChange}\n                                    onUpdate={saveDeal}/>'), "the Contacts tab's Save is the deal's Save");
    assert.ok(!tab.includes('onSave('), 'and sends nothing of its own');
    assert.ok(m.includes('    const getSitesForAccount = (accountId) => sitesOf(accounts, accountId);'));
    assert.ok(m.includes('const sites = getSitesForAccount(acc.id);'), 'a pick lists its own sites');
    assert.ok(m.includes('const available = getSitesForAccount(heldAccountId(accountSearch, formData));'), 'the list follows the account held while the field reads as it');
    assert.equal(count(m, 'getSitesForAccount(acc.name)') + count(m, 'getSitesForAccount(formData.account)'), 0, 'REGRESSION: the sites of the first account of the name');
});

test('THE WINDOW, D16 and D12: a hidden link shows its name, the words and an ×; the form offers no contact merged away', () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    const field = between(m, '<label style={fieldLabelStyle}>Account *</label>', '{validationErrors.account && (');
    const chip = field.indexOf('{isHiddenAccount(formData.accountId, accounts) ? (');
    assert.ok(chip > 0 && chip < field.indexOf('<AccountPicker'), 'in place of the picker while the link is one the user cannot open');
    assert.ok(field.includes('{accountSearch ? <>{accountSearch} <span style={{ color: T.inkMuted }}>{HIDDEN_ACCOUNT_WORDS}</span></> : <span style={{ color: T.inkMuted }}>{HIDDEN_ACCOUNT}</span>}'), 'the name the deal stores, then the words');
    assert.ok(field.includes("onClick={() => { setAccountSearch(''); setFormData(prev => ({ ...prev, account: '', accountId: '' })); }}"), 'the × removes the link; the field then asks for an account');
    assert.equal(count(m, '<AccountPicker'), 1);
    assert.ok(m.includes('{unarchived(contacts).filter(c => {'), "the form's contact list: none merged away");
    assert.equal(count(m, '{(contacts || []).filter(c => {'), 0);
    const bc = read('src/utils/buyingCommittee.js');
    assert.ok(bc.includes("import { isMergeArchived } from './pickLink.js';") && bc.includes('if (isMergeArchived(c)) return false;'), "and the Contacts tab's (contactsToAdd)");
});

test("THE ENDPOINT: a deal keeps the account id; a new one must be this org's account, never a site, and names the deal; an id it holds is kept as sent (D13)", () => {
    const raw = read('netlify/functions/opportunities.mjs');
    const s = code(raw);
    assert.ok(s.includes("import { opportunities, users, accounts } from '../../db/schema.js';"));
    assert.ok(s.includes('    accountId:          data.accountId           || null,'), 'sanitize keeps it: a create, a PUT merged over the stored row, a bulk write');
    assert.ok(s.includes("const ACCOUNT_NOT_IN_ORG = 'That account is not in your organization — pick one from the list.';"));
    const link = between(s, 'async function accountLink(data, storedId, orgId, storedSite = null, storedName = null) {', '\n}\n');
    assert.ok(link.includes("if (!data || !('accountId' in data)) return {};"), 'a payload naming no id leaves the link alone');
    assert.ok(link.includes("    if (!id && storedId) return { keep: true, lifted: 'account' in data && (data.account || null) !== (storedName || null) };\n    if (!id || id === (storedId || null)) return {};"), 'H4 and J5: no id sent while the deal holds one never unlinks — the id and name kept; its Site Name kept only where the Account text sent is not the stored one (a row from before a D22 lift by name), else saved as sent (a stale window\'s Site Name edit)');
    assert.ok(link.includes('if (!id || id === (storedId || null)) return {};'), 'an id the deal holds is not looked up again');
    assert.ok(link.includes('}).from(accounts).where(and(eq(accounts.id, next), eq(accounts.orgId, orgId)));'), 'REGRESSION: read in this org only, the merge followed in it too');
    assert.ok(link.includes('mergeArchived: accounts.mergeArchived, mergedIntoId: accounts.mergedIntoId,'));
    assert.ok(link.includes('id: accounts.id, name: accounts.name, accountTier: accounts.accountTier, parentAccountId: accounts.parentAccountId,'));
    assert.ok(link.includes('for (let next = id; next && !seen.has(next) && seen.size <= MERGE_HOPS;) {'), 'at most MERGE_HOPS merges on; a loop ends');
    const hop = link.indexOf('        if (storedId && next === storedId) return { keep: true };\n        seen.add(next);\n');
    assert.ok(hop > link.indexOf('for (let next = id;') && hop < link.indexOf('await db.select({'), 'G2: a walk that reaches the id the deal holds is untouched — asked before the row is read, so a survivor deleted since is kept too (D13)');
    const lifted = link.indexOf("if (acct.accountTier === 'site' && storedId && acct.parentAccountId === storedId) return { keep: true, lifted: true };");
    assert.ok(lifted > 0 && lifted < link.indexOf("if (acct.accountTier === 'site') return { status: 400, error: ACCOUNT_IS_SITE };"), 'a site whose account the deal holds (where D22 moved it): untouched, before the site refusal');
    const through = link.indexOf("if (acct.accountTier === 'site' && storedId && storedSite && storedSite === acct.name && !(await heldSite(storedId, orgId))) return { keep: true, lifted: true };");
    assert.ok(through > lifted && through < link.indexOf("if (acct.accountTier === 'site') return { status: 400, error: ACCOUNT_IS_SITE };"), 'H5: a site the deal was lifted through — its Site Name, and the account it holds no site — untouched wherever that site stands now');
    const held = between(s, 'async function heldSite(storedId, orgId) {', '\n}\n');
    assert.ok(held.includes('.where(and(eq(accounts.id, storedId), eq(accounts.orgId, orgId)));'), 'read in this org');
    assert.ok(held.includes("return held?.accountTier === 'site';"));
    assert.ok(link.includes('next = acct && acct.mergeArchived === true ? acct.mergedIntoId : null;'), 'merged away: the account it was merged into (F2)');
    assert.ok(link.includes('if (!acct || acct.mergeArchived === true) return { status: 404, error: ACCOUNT_NOT_IN_ORG };'), "another org's, none, or merged into none live here: refused (§0.166)");
    assert.ok(link.includes("if (acct.accountTier === 'site') return { status: 400, error: ACCOUNT_IS_SITE };"), "a site is never a deal's account (D5)");
    assert.ok(link.includes('return { id: acct.id, name: acct.name };'), 'the account linked, and its own name');
    assert.ok(s.includes('const MERGE_HOPS = 5;'));
    const post = between(raw, '            // Single insert', '            const [inserted] = await db.insert(opportunities)');
    assert.ok(post.includes('const link = await accountLink(data, null, orgId);'));
    assert.ok(post.includes('if (link.error) return { statusCode: link.status, headers, body: JSON.stringify({ error: link.error }) };'));
    assert.ok(post.includes("stampOwnerId(sanitize(link.id ? { ...named, account: link.name, accountId: link.id } : named), 'opportunity',"), 'a new deal is linked to the account found, and named after it — its contacts checked too (§0.199)');
    const put = between(raw, '            if (forbiddenPut) return forbiddenPut;', '            const { id, ...updateData } = clean;');
    const at = put.indexOf('const link = await accountLink(data, existing.accountId, orgId, existing.site, existing.account);');
    assert.ok(at > 0 && at < put.indexOf('const clean = sanitize({ ...existing, ...data });'), 'after the ownership check, before the write');
    assert.ok(put.includes('if (link.error) return { statusCode: link.status, headers, body: JSON.stringify({ error: link.error }) };'));
    assert.ok(put.includes('if (link.id) { clean.accountId = link.id; clean.account = link.name; }'), "a new id brings its account — one merged away, the account it was merged into — and its name");
    assert.ok(put.includes('            else if (link.keep) { clean.accountId = existing.accountId; clean.account = existing.account; if (link.lifted) clean.site = existing.site; }\n'), 'G2: the link as stored — never the stale id sent; moved up from a site, its Site Name too');
    assert.ok(put.includes("else if ('account' in data && !('accountId' in data) && searchKey(clean.account || '') !== searchKey(existing.account || '')) clean.accountId = null;"), 'a name sent without an id unlinks — one that reads as another name, not another case or spacing (the pre-ship round)');
    assert.ok(s.includes("import { searchKey } from '../../src/utils/searchMatch.js';"));
    assert.ok(put.includes("            else if ('account' in data && !('accountId' in data) && existing.accountId) clean.account = existing.account;"), 'the same name in another case or spacing keeps the stored spelling — on a linked deal (the fix review, the re-check)');
    const ids = between(s, 'async function accountIdsNotInOrg(rows, orgId, held = null) {', '\n}\n');
    assert.ok(ids.includes('.where(and(eq(accounts.orgId, orgId), inArray(accounts.id, asked)))'), 'this org only');
    assert.ok(ids.includes('r.accountId !== (held?.get(r.id)?.accountId ?? null)'), 'an id a deal already holds is not asked again (D13)');
    const bulkPost = between(s, 'if (Array.isArray(data)) {', 'const owned = await stampOwnerIds(');
    assert.ok(bulkPost.includes('const strays = await accountIdsNotInOrg(data, orgId);'), 'a bulk create naming another org\'s account is refused whole');
    const bulkPut = between(s, 'const priors = new Map(priorRows.map(r => [r.id, r]));', 'const staged = applyStageChanges(bulkAccountLinks(data, priors), priors, importDate);');
    assert.ok(bulkPut.includes('const strays = await accountIdsNotInOrg(data, orgId, priors);'), 'a bulk overwrite too, against the ids the deals hold');
    assert.ok(between(s, 'const priorRows = await db', '.from(opportunities)').includes('accountId:        opportunities.accountId,'));
    assert.ok(between(s, 'const priorRows = await db', '.from(opportunities)').includes('account:          opportunities.account,'), 'G6: the stored name, to tell a renamed account');
    assert.ok(s.includes("import { bulkAccountLinks } from '../../src/utils/dealAccount.js';"), "G6: a CSV overwrite's renamed account unlinks, as a single save does");
    assert.equal(count(s, 'if (strays.length) return { statusCode: 400, headers, body: JSON.stringify({ error: ACCOUNT_NOT_IN_ORG, accountIds: strays }) };'), 2);
});

test('THE CLOSED LOST SAVE: the list takes the deal as stored, not the copy sent; dbWrite hands back what the write answered', () => {
    const h = read('src/hooks/useOpportunities.js');
    const fn = between(h, 'const completeLostSave = async (', '\n    };\n');
    const edit = 'if (r.data && r.data.opportunity) setOpportunities(prev => prev.map(o => (o.id === editingOppRef.id ? r.data.opportunity : o)));';
    const made = 'if (r.data && r.data.opportunity) setOpportunities(prev => prev.map(o => (o.id === newId ? r.data.opportunity : o)));';
    assert.ok(fn.includes(edit), 'an edit');
    assert.ok(fn.indexOf(edit) > fn.indexOf('if (!r.ok) {') && fn.indexOf(edit) < fn.indexOf("addAudit('update', 'opportunity', editingOppRef.id"), 'once stored, before the audit');
    const post = fn.slice(fn.indexOf("const newId = formData.id || ('id_' + crypto.randomUUID());"));
    assert.ok(post.includes(made) && post.indexOf(made) > post.indexOf('if (!r.ok) {'), 'a new deal, once stored');
    const st = read('src/utils/storage.js');
    assert.ok(st.includes('const bodyOf = async (res) => { try { return await res.json(); } catch { return null; } };'));
    assert.ok(st.includes('if (res.ok) return { ok: true, status: res.status, error: null, data: await bodyOf(res) };'));
});

test('G6: a CSV overwrite that names a deal\'s account with no id unlinks it when the name is not the one stored — and the batch\'s other rows keep their ids (bulkAccountLinks, run)', () => {
    const priors = new Map([
        ['d1', { id: 'd1', account: 'INEOS Acetyls', accountId: 'i' }],
        ['d2', { id: 'd2', account: 'Shell - Port Allen', accountId: 'u' }],
        ['d3', { id: 'd3', account: 'Shell', accountId: 'k' }],
    ]);
    const rows = [{ id: 'd1', account: 'Shell', notes: 'x' }, { id: 'd2', stage: 'Proposal' }, { id: 'd3', account: 'Shell' }];
    assert.deepEqual(bulkAccountLinks(rows, priors), [
        { id: 'd1', account: 'Shell', notes: 'x', accountId: null },
        { id: 'd2', stage: 'Proposal', accountId: 'u' },
        { id: 'd3', account: 'Shell', accountId: 'k' },
    ], 'renamed: unlinked (the name no longer the linked account\'s); the others carry the ids they hold — bulkUpsert sets the union of the keys');
    const kept = [{ id: 'd1', account: 'INEOS Acetyls', stage: 'Won' }, { id: 'd2', notes: 'y' }];
    assert.equal(bulkAccountLinks(kept, priors), kept, 'nothing renamed: the batch as sent, no id added');
    const sent = [{ id: 'd1', account: 'Shell', accountId: 'k' }, { id: 'd2', account: 'Elsewhere' }];
    assert.deepEqual(bulkAccountLinks(sent, priors), [{ id: 'd1', account: 'Shell', accountId: 'k' }, { id: 'd2', account: 'Elsewhere', accountId: null }], 'a row that names its id keeps what it sends (accountIdsNotInOrg checked it)');
    assert.deepEqual(bulkAccountLinks([{ id: 'gone', account: 'X' }], priors), [{ id: 'gone', account: 'X', accountId: null }], 'a deal not stored: bulkUpsert reports it not found');
    assert.equal(bulkAccountLinks([{ id: 'd3', account: '' }], new Map([['d3', { account: null, accountId: 'k' }]])).length, 1);
    assert.deepEqual(bulkAccountLinks([{ id: 'd3', account: '' }], new Map([['d3', { account: null, accountId: 'k' }]])), [{ id: 'd3', account: '' }], 'an empty name is the stored none: no change');
    assert.deepEqual(bulkAccountLinks(undefined, priors), []);
});

test("THE MERGE: a merged-away account's deals follow it to the survivor by id, as its tasks and activities do, and only they (and deals with no id) take its name; the undo puts them back; the screen reads the deals again (D14, F3)", () => {
    const g = read('netlify/functions/merge.mjs');
    assert.ok(g.includes("{ name: 'opportunities', table: opportunities, column: 'accountId', col: opportunities.accountId },"), 'snapshotted for the undo');
    assert.ok(g.includes('ops.push(db.update(opportunities).set({ accountId: survivorId, updatedAt: now }).where(and(eq(opportunities.accountId, archivedId), eq(opportunities.orgId, orgId))));'));
    // F3: the deals' NAME rewrite (and its snapshot) only touches the deals of the two accounts merged, or of none
    assert.ok(g.includes("import { eq, and, or, isNull, inArray } from 'drizzle-orm';"));
    assert.ok(g.includes('const dealsOfMerge = () => or(isNull(opportunities.accountId), inArray(opportunities.accountId, [archivedId, survivorId]));'), "a twin's deals are not the merge's: their id names the twin");
    assert.ok(g.includes("{ name: 'opportunities', table: opportunities, column: 'account', col: opportunities.account, scope: dealsOfMerge },"));
    assert.ok(g.includes('const ids = await snapIds(t.table, and(eq(t.col, oldVal), eq(t.table.orgId, orgId), ...(t.scope ? [t.scope()] : [])));'), 'the snapshot, the same deals: the undo puts back exactly what was renamed');
    assert.ok(g.includes('ops.push(db.update(opportunities).set({ account: survName, updatedAt: now }).where(and(inArray(opportunities.account, nameOldValues), eq(opportunities.orgId, orgId), dealsOfMerge())));'));
    assert.ok(g.indexOf('ops.push(db.update(opportunities).set({ accountId: survivorId') < g.indexOf('ops.push(db.update(opportunities).set({ account: survName'), "the ids move first in the batch, so the archived account's deals are the survivor's when renamed");
    assert.ok(g.includes('ops.push(db.update(contacts).set({ company: survName, updatedAt: now }).where(and(inArray(contacts.company, nameOldValues), eq(contacts.orgId, orgId))));'), "contacts still by name: their account id stays for batch 3");
    assert.ok(g.includes('const table = TABLE_BY_NAME[rw.table];') && between(g, 'const TABLE_BY_NAME = {', '};').includes('opportunities'), 'the undo reverses every snapshotted rewrite, this one too');
    // D22: a merge into a site moves the merged-away account's deals up to the account above it, in the batch; the undo puts each back
    assert.ok(g.includes("const survTier = 'accountTier' in resolved ? resolved.accountTier : surv.accountTier;"), "the survivor's tier once merged");
    assert.ok(g.includes('const upId = surv.parentAccountId === archivedId ? (arch.parentAccountId || null) : (surv.parentAccountId || null);'), 'the account it stands under once merged');
    assert.ok(g.includes("? await db.select({ id: accounts.id, name: accounts.name, mergeArchived: accounts.mergeArchived }).from(accounts).where(and(eq(accounts.id, upId), eq(accounts.orgId, orgId)))"), 'read in this org');
    assert.ok(g.includes('if (up && up.mergeArchived !== true) {'), 'a live account to move them up to');
    assert.ok(g.includes('const named = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.name, archName), eq(accounts.orgId, orgId)));'));
    assert.ok(g.includes('const byName = named.every((a) => a.id === archivedId || a.id === survivorId);'), "by name only where no other account has the merged-away one's name");
    assert.ok(g.includes('                .where(and(eq(opportunities.orgId, orgId), byName\n'), "this org's deals only");
    assert.ok(g.includes('? or(eq(opportunities.accountId, archivedId), and(isNull(opportunities.accountId), eq(opportunities.account, archName)))'));
    assert.ok(g.includes("if (lifted.length) rewrites.push({ table: 'opportunities', column: 'accountId', kind: 'lift', ids: lifted.map((d) => d.id), rows: lifted.map((d) => ({ id: d.id, old: { accountId: d.accountId ?? null, account: d.account ?? null, site: d.site ?? null } })) });"), 'logged as they were, after every other rewrite');
    const liftOp = g.indexOf('if (lifted.length) ops.push(db.update(opportunities).set({ accountId: up.id, account: up.name, site: survName, updatedAt: now }).where(and(inArray(opportunities.id, lifted.map((d) => d.id)), eq(opportunities.orgId, orgId))));');
    assert.ok(liftOp > g.indexOf('ops.push(db.update(opportunities).set({ account: survName') && liftOp < g.indexOf('await db.batch(ops);'), 'after the id and name rewrites, in the same batch');
    const undoLift = between(g, 'async function reverseAccountMerge(', '// Un-archive the loser.');
    assert.ok(undoLift.includes("if (rw.kind === 'lift') {\n            for (const row of (rw.rows || [])) ops.push(db.update(table).set({ accountId: row.old?.accountId ?? null, account: row.old?.account ?? null, site: row.old?.site ?? null }).where(and(eq(table.id, row.id), eq(table.orgId, orgId))));\n            continue;\n        }"), 'the undo: each deal back to its own account, id and Site Name, in this org');
    // H6: a survivor lifted to the top level is an account; the undo puts its stored tier back
    const top = g.indexOf("        if (surv.parentAccountId === archivedId && !arch.parentAccountId) survSet.accountTier = 'account';\n");
    assert.ok(top > g.indexOf('if (surv.parentAccountId === archivedId) survSet.parentAccountId = arch.parentAccountId || null;') && top < g.indexOf('ops.push(db.update(accounts).set(survSet)'), "H6: lifted to the top level, the survivor is an account — the deals it takes are not left on a site");
    const back = g.indexOf("    if (snapS.parentAccountId === log.archivedId && !(log.archivedSnapshot || {}).parentAccountId && 'accountTier' in snapS) restore.accountTier = snapS.accountTier ?? null;\n");
    assert.ok(back > g.indexOf('const restore = { updatedAt: now, name: snapS.name, parentAccountId: snapS.parentAccountId ?? null };') && back < g.indexOf('ops.push(db.update(accounts).set(restore)'), 'and its undo puts the stored tier back');
    const u = read('src/hooks/useMerge.js');
    assert.ok(u.includes('const { setAccounts, loadAccounts, setContacts, loadContacts, loadOpportunities, addAudit, currentUser } = deps || {};'));
    assert.ok(u.includes("try { loadOpportunities?.(() => {}); } catch (e) { console.error('Deal refresh failed after merge:', e); }"));
    const merge = between(u, 'const handleMerge = async (payload) => {', 'const reverseMerge = async');
    assert.ok(merge.includes('refreshAccounts();\n            refreshOpportunities();'), 'after a merge');
    const undo = between(u, 'const reverseMerge = async (mergeLogId) => {', 'const findContactDuplicates');
    assert.ok(undo.includes('refreshAccounts();\n            refreshOpportunities();'), 'after its undo');
    assert.ok(read('src/App.jsx').includes('useMerge({ setAccounts, loadAccounts, setContacts, loadContacts, loadOpportunities, addAudit, currentUser: { name: currentUser } });'));
});

test("H4: the Kanban's stage drag sends the stage, its date and its history — never the whole row its list holds, which wrote a list loaded before another session's save back (a D22 lift undone)", () => {
    const k = read('src/components/KanbanView.jsx');
    const drop = between(k, 'const handleKanbanDrop = (toStage) => {', '\n    };\n');
    assert.ok(drop.includes('body: JSON.stringify({ id: newOpp.id, stage: newOpp.stage, stageChangedDate: newOpp.stageChangedDate, stageHistory: newOpp.stageHistory }),'), 'the stage alone, merged over the stored row');
    assert.ok(!drop.includes('body: JSON.stringify(newOpp)'), 'REGRESSION: the whole row');
    const changed = between(drop, 'const newOpp = {\n            ...updatedOpp,\n', '        };');
    assert.deepEqual([...changed.matchAll(/^            (\w+):/gm)].map((x) => x[1]), ['stage', 'stageChangedDate', 'stageHistory'], 'what the drag changes is what it sends');
});

test("J4: Reports' add and remove on \"Contacts on this deal\" send the deal's id and its contacts alone — never the whole row the report loaded, which re-linked a deal another session had moved and reset its Site Name", () => {
    const r = read('src/Tabs/ReportsTab.jsx');
    const add = between(r, 'onSave={async (newIds) => {', 'if (res.ok) {');
    assert.ok(add.includes('                                                            body: JSON.stringify({\n                                                                id:         selectedOpp.id,\n                                                                contactIds: mergedIds,\n                                                                contacts:   contactNamesText(mergedNames),\n                                                            }),\n'), 'the add: the id, the ids it merged, their names');
    const remove = between(r, 'const handleRemove = async (contact) => {', 'if (res.ok) setLocalContactIds(merged);');
    assert.ok(remove.includes('body: JSON.stringify({ id: selectedOpp.id, contactIds: merged, contacts: contactNamesText(mergedNames) }),'), 'the remove: the same three');
    assert.equal(count(r, 'JSON.stringify({ ...selectedOpp'), 0, 'REGRESSION: the whole stale row');
    assert.equal(count(r, "method: 'PUT',\n                                                            body: JSON.stringify({\n                                                                ...selectedOpp"), 0);
    assert.equal(count(r, '/.netlify/functions/opportunities?id=${selectedOpp.id}'), 2, 'the two deal PUTs of the Reports tab, both here');
});

test('dealAccount.js is pure: it imports only the matcher and pickLink.js', () => {
    const src = read('src/utils/dealAccount.js');
    assert.deepEqual([...src.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['./searchMatch.js', './pickLink.js']);
    assert.ok(!/\b(React|window|document|localStorage|fetch)\b/.test(code(src)), 'no React, no DOM, no network');
});

test('the suites: this file is graded by the harness', () => {
    assert.ok(read('scripts/mutate-import.mjs').includes(' tests/deal-account.test.mjs'), 'SUITES runs this file');
});

// ── the pre-ship round (12 Oct) ─────────────────────────────────────────────

test('REGRESSION (the pre-ship audit): an untouched Account linked to an account merged away returns the name the deal stores — never the merged-away name — as untouched', () => {
    const shell = { id: 'k', name: 'Shell', accountTier: 'account', parentAccountId: null };
    const shellOil = { id: 'so', name: 'Shell Oil Co', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'k' };
    for (const accounts of [[shell, shellOil], [shellOil, shell]]) {
        const seed = dealAccountSeed({ id: 'd9', account: 'Shell', accountId: 'so' });
        assert.deepEqual(resolveDealAccount({ text: 'Shell', heldId: 'so', seed, accounts }), { how: 'untouched', id: 'so', name: 'Shell' }, 'it sent "Shell Oil Co", and the endpoint kept it: the id was unchanged');
        assert.deepEqual(resolveDealAccount({ text: 'Shell', heldId: 'k', seed, accounts }), { how: 'held', id: 'k', name: 'Shell' }, 'the live one picked: its own name');
    }
});

test('a CSV overwrite reads an account name as the picker does: a case or spacing difference names the same account and never unlinks it; another name still does (bulkAccountLinks)', () => {
    const priors = new Map([['d1', { id: 'd1', account: 'Shell', accountId: 'k' }], ['d2', { id: 'd2', account: 'Shell - Port Allen', accountId: 's' }]]);
    const cased = [{ id: 'd1', account: 'SHELL', notes: 'x' }, { id: 'd2', account: '  shell  - port allen ' }];
    assert.deepEqual(bulkAccountLinks(cased, priors), [{ id: 'd1', account: 'Shell', notes: 'x' }, { id: 'd2', account: 'Shell - Port Allen' }],
        "the duplicate rule matched them by name, any case: nothing unlinked, and the stored spelling kept — the account's own (the fix review)");
    assert.deepEqual(bulkAccountLinks([{ id: 'd1', account: 'shell' }, { id: 'd2', account: 'Chevron' }], priors), [{ id: 'd1', account: 'Shell', accountId: 'k' }, { id: 'd2', account: 'Chevron', accountId: null }], 'beside a rename: respelled and keeping its id');
    assert.deepEqual(bulkAccountLinks([{ id: 'd1', account: 'Chevron' }], priors), [{ id: 'd1', account: 'Chevron', accountId: null }], 'another name: unlinked, as before');
    const loose = new Map([['d3', { id: 'd3', account: 'Acme Old Co', accountId: null }]]);
    const lower = [{ id: 'd3', account: 'ACME old co' }];
    assert.equal(bulkAccountLinks(lower, loose), lower, 'an unlinked deal takes the spelling sent — there is no account whose own it is (the re-check)');
    assert.deepEqual(bulkAccountLinks([{ id: 'gone', account: '' }], priors), [{ id: 'gone', account: '' }], 'a deal the priors do not hold, with no name: as sent, never a throw');
});
