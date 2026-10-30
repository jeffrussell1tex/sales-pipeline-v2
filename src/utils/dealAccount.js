// src/utils/dealAccount.js
//
// The deal window's Account: what a Save links the deal to, and the Site Name list (state
// §0.198 — OPEN_ITEMS §1 item 1; Jeff, 11 Oct: D1 "One match saves, two refuse", D2 "Yes,
// same batch", D5 "Same as clicking the site", D11 "Refuse, name the reason", D12 "Yes, hide
// them", D15 "Only real sites", D16 "Say so, allow removing").
//
// The window's Save took the FIRST account whose name, in any case, was the field's text,
// and threw the row picked away: of UKG's two "Shell - Port Allen" under Shell — a business
// unit and a site, which the accounts GET orders by name only — a pick of either could save
// the other; a site's name typed in full saved the site as the deal's account; "Ineos -
// Acetyls", which the picker reads as INEOS Acetyls, was refused with a Create the field did
// not offer. The Contacts tab's Save checked nothing and saved an old pick under new text,
// and the Site Name list found the account by its name. Each Save now asks
// resolveDealAccount, which asks pickLink.js resolveLink with the deal window's rules:
//   - the field takes every account but a site (the picker's filterFn), and a site typed in
//     full counts as its account — its row picked: Account the site's parent, Site Name the
//     site (D5) — when the list holds that account (via);
//   - untouched: the deal's link exactly as stored — a site an older Save made the account,
//     a twin, an account outside a rep's list, one merged away, or no id at all (D1);
//   - two of the name: refused, a pick asked for (the rows name each one's parent); a site
//     whose account the list does not hold: refused, and said so (D11); a site whose account
//     is listed but no deal's (merged away, or a site itself): refused as a site; a name only
//     an account merged away has: refused, naming the account it was merged into; none:
//     refused;
//   - a name typed in full is its row picked: a site fills Site Name (D5). An account typed
//     leaves Site Name as the window has it: the window empties it the moment the Account
//     text stops reading as the account held (siteAsAccountTyped, in the field's onChange), as
//     a click on another row does — so a Site Name typed AFTER the account is saved — and puts
//     it back when the text reads as that same account again (a typo fixed, or the name typed
//     again after the field was emptied).
// Pure: OpportunityModal asks it; tests/deal-account.test.mjs runs it. The deals endpoint asks
// bulkAccountLinks (below).
import { searchKey, viaParent } from './searchMatch.js';
import { resolveLink, linkRefusal, unarchived, siteNotAccount, HIDDEN_ACCOUNT } from './pickLink.js';

// What the deal window lists as an account: every tier but a site (its picker's filterFn).
// A deal's account is never a site (D5).
export const dealKeeps = (a) => !!a && a.accountTier !== 'site';

// What the Account field opened with — taken ONCE, when the window opens, never worked out
// again from the live row: the deal's stored name and id. A new deal opens with nothing
// stored, and so does a lead's convert (a name, no deal): its name is typed, never kept
// untouched.
export function dealAccountSeed(opportunity) {
    return opportunity && opportunity.id
        ? { text: opportunity.account || '', id: opportunity.accountId || '' }
        : { text: '', id: '' };
}

// The account a Save links the deal to: { how, id, name } — and site, the Site Name a site's
// name typed in full fills (D5) — or { error }, and nothing is saved. text: the Account field
// as shown;
// heldId: the id the form holds (a row picked, else the deal's own); seed: dealAccountSeed,
// taken when the window opened; accounts: the caller's FULL list, merged-away rows included.
// name is the record's own spelling; untouched, the name the deal stores — never the linked
// account's own name, a merged-away one's after a merge (the pre-ship audit, 12 Oct) — and the
// window leaves Account (with an untouched Site Name) out of an edit's Save; a link the list
// does not hold (a rep's scope, or an account deleted) keeps the name the deal stores.
export function resolveDealAccount({ text = '', heldId = '', seed = null, accounts = [] } = {}) {
    const listed = unarchived(accounts);
    const byId = new Map(listed.map((a) => [a.id, a]));
    const r = resolveLink({
        text, heldId,
        storedId: seed ? seed.id : '', seededText: seed ? seed.text : '',
        records: accounts, eligible: dealKeeps, via: (a) => viaParent(a, byId, dealKeeps),
    });
    if (r.refusal) return { error: linkRefusal(r, { noun: 'account', field: 'Account', canCreate: true, why: (matches, typed) => siteNotAccount(typed) }) };
    if (r.how === 'empty') return { error: 'Account name is required' };
    const name = r.how === 'untouched' ? (seed ? seed.text : '') : r.record ? r.record.name : (seed ? seed.text : '');
    if (r.via) return { how: r.how, id: r.id, name, site: r.via.name };
    return { how: r.how, id: r.id, name };
}

// The account the Site Name list follows: the one the form holds — picked, or the deal's
// own — while the Account field still reads as it. A name typed over a pick is not that
// account, and its sites are not offered.
export function heldAccountId(text, { account, accountId } = {}) {
    const key = searchKey(text);
    return key && accountId && key === searchKey(account) ? accountId : '';
}

// The deal window's Site Name as the Account field's text changes (state §0.198 — G1; the
// decisions critic, 12 Oct: one stray keystroke lost a deal's stored Site Name for good). The
// Site Name belongs to the account held: the moment the text stops reading as it, the Site Name
// empties — as a click on another row empties it — and is kept aside; when the text reads as
// that same account again (a typo fixed), it comes back. The account held: the one the form
// holds by id while the text reads as it (heldAccountId); for a deal saved with no id, the field
// as it opened (D1's untouched; seed: dealAccountSeed), read by searchKey as a linked deal's is;
// and the account kept aside, by its name, while the form holds it or none — an Account field
// emptied on the way clears the id the form held (the decisions critic, 12 Oct: backspacing the
// whole name and typing it again lost the Site Name, and so did a case or space edit of a deal
// saved with no id). A row picked, or a Site Name typed or picked, drops what was kept aside (the
// window clears it). text: the field's new text; form: { account, accountId, site }; shown: the
// Site Name box's text; kept: what an earlier keystroke put aside ({ held, name, site, shown }),
// or null. null — leave the Site Name as it is — or { site, shown, kept }: the Site Name the
// form holds now, the box's text, and what is kept aside now.
export function siteAsAccountTyped(text, form = {}, shown = '', kept = null, seed = null) {
    const opened = !form.accountId && seed && !seed.id && seed.text ? `=${seed.text}` : '';
    const key = searchKey(text);
    const reads = (name) => !!key && key === searchKey(name);
    const held = heldAccountId(text, form) || (opened && reads(seed.text) ? opened : '')
        || (kept && reads(kept.name) && (!form.accountId || form.accountId === kept.held) ? kept.held : '');
    if (!held && (shown || form.site)) return { site: '', shown: '', kept: { held: form.accountId || opened, name: form.accountId ? form.account || '' : (opened ? seed.text : ''), site: form.site || '', shown: shown || '' } };
    if (held && kept && kept.held === held) return { site: kept.site, shown: kept.shown, kept: null };
    return null;
}

// The Site Name list for an account found by its id — never by its name, which UKG's twins
// share (the window took the first account of the name, and could list the other twin's
// sites). Only accounts whose tier is 'site', never a business unit (D15, Jeff, 11 Oct:
// "Only real sites"): under an account with a parent, its own sites; under a top-level
// account, its own sites, then the sites of each account under it. Nothing merged away (D12).
export function sitesOf(accounts, accountId) {
    const listed = unarchived(accounts);
    const account = accountId ? listed.find((a) => a.id === accountId) : null;
    if (!account) return [];
    const isSite = (a) => a.accountTier === 'site';
    const under = (p) => listed.filter((a) => a.parentAccountId === p.id);
    const children = under(account);
    if (account.parentAccountId) return children.filter(isSite);
    return [...children.filter(isSite), ...children.filter((a) => !isSite(a)).flatMap(under).filter(isSite)];
}

// A link to an account the caller's list does not hold — a rep's scope, or one deleted (D16,
// Jeff, 11 Oct: "Say so, allow removing"). The window shows the name the deal stores, then
// these words, and an × that removes the link; untouched, a Save keeps it.
export const HIDDEN_ACCOUNT_WORDS = `(${HIDDEN_ACCOUNT.charAt(0).toLowerCase()}${HIDDEN_ACCOUNT.slice(1)})`;

export function isHiddenAccount(accountId, accounts) {
    return !!accountId && !(Array.isArray(accounts) ? accounts : []).some((a) => a && a.id === accountId);
}

// The deals endpoint's bulk link (state §0.216 — batch 3b; guide §18b106): a row's account id, decided by the single
// save's rule (opportunities.mjs accountLink) over accounts read for the whole batch — the bulk paths asked only that
// an id was one of the org's, so an id merged away was stored as sent and a site taken, the name kept as the row sent
// it (docs/design/links-batch-3, I5). The same branches, in the same order, as accountLink:
//   - no accountId key: {} (the row as sent); an empty id while the deal holds one: { keep } — the link as stored,
//     `lifted` (its Site Name kept too) when the Account text sent is not the stored one;
//   - no id, or the id the deal holds: {};
//   - an id that is no text: { refused: 'notInOrg' };
//   - the walk, MERGE_HOPS merges on: a step that reaches the id the deal holds is { keep }; none live at the end,
//     { refused: 'notInOrg' };
//   - a site whose account the deal holds, or whose name its Site Name holds while the account it holds is no site
//     (D22's lift), { keep, lifted }; any other site, { refused: 'site' };
//   - else { id, name }: the account linked and its own name.
// data: the row as sent; stored: the deal's stored row (accountId, account, site) or null for a new deal; byId: the
// accounts read for the batch — every id a row names and every step of its walk, and the account each deal holds —
// in the caller's org only (a row of another org is never in it, so it reads as none).
export const DEAL_LINK_HOPS = 5;
export function dealLinkDecided(data, stored, byId) {
    if (!data || !('accountId' in data)) return {};
    const storedId = stored?.accountId || null;
    const id = data.accountId || null;
    if (!id && storedId) return { keep: true, lifted: 'account' in data && (data.account || null) !== (stored.account || null) };
    if (!id || id === storedId) return {};
    if (typeof id !== 'string') return { refused: 'notInOrg' };
    const read = (k) => (byId && typeof byId.get === 'function' ? byId.get(k) : null) || null;
    let acct = null;
    const seen = new Set();
    for (let next = id; next && !seen.has(next) && seen.size <= DEAL_LINK_HOPS;) {
        if (storedId && next === storedId) return { keep: true };
        seen.add(next);
        acct = read(next);
        next = acct && acct.mergeArchived === true ? acct.mergedIntoId : null;
    }
    if (!acct || acct.mergeArchived === true) return { refused: 'notInOrg' };
    if (acct.accountTier === 'site' && storedId && acct.parentAccountId === storedId) return { keep: true, lifted: true };
    if (acct.accountTier === 'site' && storedId && stored.site && stored.site === acct.name && read(storedId)?.accountTier !== 'site') return { keep: true, lifted: true };
    if (acct.accountTier === 'site') return { refused: 'site' };
    return { id: acct.id, name: acct.name };
}

// The ids the batched reads must hold for dealLinkDecided: the ids each row names anew and the one its deal holds.
export function dealLinkAsks(rows, priors) {
    const out = new Set();
    for (const r of Array.isArray(rows) ? rows : []) {
        if (!r || !('accountId' in r) || typeof r.accountId !== 'string' || !r.accountId) continue;
        const held = priors && typeof priors.get === 'function' ? priors.get(r.id)?.accountId || null : null;
        if (r.accountId === held) continue;
        out.add(r.accountId);
        if (held) out.add(held);
    }
    return [...out];
}

// The deals endpoint's bulk overwrite, for a row that sends an Account name and no id (an API
// caller's; the CSV import sends its account by id since state §0.216 — bulkDealLinks): a row that sends an account NAME and no id unlinks its
// deal when the name is not the one stored, as a single save does (opportunities.mjs) — the
// deal named after one account and linked by id to another drifted, and the next rename of
// the old account named it back. Once any row of the batch unlinks, every other row that
// sends no id carries the id its deal holds: bulkUpsert sets the union of the keys a batch
// sends (partialRows), so a row naming none would be unlinked too. A name is read as the
// picker reads it (searchKey): a CSV whose duplicate rule matched "SHELL" to "Shell" names
// the same account, and never unlinks it (the pre-ship audit, 12 Oct) — the row keeps the stored
// spelling of a linked deal, the account's own, so a merge's rename still reaches it (the fix
// review); an unlinked deal takes the spelling sent (the re-check).
// rows: the batch as sent;
// priors: Map(id → the stored { account, accountId }). The rows as they are when none unlinks.
export function bulkAccountLinks(rows, priors) {
    const list = Array.isArray(rows) ? rows : [];
    const stored = (r) => (priors && typeof priors.get === 'function' ? priors.get(r.id) : null) || null;
    const renamed = (r) => !!r && 'account' in r && !('accountId' in r) && searchKey(r.account || '') !== searchKey(stored(r)?.account ?? '');
    const respelled = (r) => !!r && 'account' in r && !('accountId' in r) && !renamed(r) && !!stored(r) && !!stored(r).accountId && (r.account || null) !== (stored(r).account ?? null);
    const anyRenamed = list.some(renamed);
    if (!anyRenamed && !list.some(respelled)) return list;
    const spelt = list.map((r) => (respelled(r) ? { ...r, account: stored(r).account } : r));
    if (!anyRenamed) return spelt;
    return spelt.map((r) => (!r || 'accountId' in r ? r : { ...r, accountId: renamed(r) ? null : (stored(r)?.accountId ?? null) }));
}
