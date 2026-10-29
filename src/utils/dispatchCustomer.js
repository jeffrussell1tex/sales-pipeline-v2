// src/utils/dispatchCustomer.js
//
// A pick is saved as the record picked — Dispatch's customer (state §0.214; batch 2 of OPEN_ITEMS §1 item 1;
// guide §18b91 rule 1, "One match saves, two refuse"). Dispatch found a customer by taking the FIRST of a name:
// a won deal's job placeholder found its account with `a.id === o.accountId || a.name === o.account` in one
// find, so a same-named account earlier in the list beat the deal's own id, and its customer the same way;
// quote -> job took the first customer of the deal's account name from an unordered read, even for a deal whose
// account id named another account; New Job saved a typed name as a NEW customer, though a customer of that
// name stood in the list. Every one of them now reads this one rule (Jeff, 28 Oct: "Refuse, name both",
// "Open, ask to pick", "Refuse it"):
//
//   1. A deal stands on its account: by its link (one merged away: the account it was merged into, where the list
//      holds it; an id the list does not hold — deleted since, or outside a rep's list — as the id itself), or, for
//      a deal with no account id, the ONE live account of its name (pickLink.js accountForDeal). The screen and the
//      server both work it out here, from the accounts they hold, so the placeholder and quote -> job reach one
//      answer — but for a rep's list, which may lack a twin of the name (OPEN_ITEMS §4.4).
//   2. Its customer is the one customer linked to that account by id. Two or more linked: none is chosen, and the
//      answer names them (`many`). None linked: the one customer of the deal's account name (searchKey: case,
//      spacing and punctuation ignored) linked to no account — one linked to another account is that account's
//      (UKG's twin "Shell - Port Allen", a unit and a site). Two or more: `many`. None: `none`, with the account
//      a made customer links to — quote -> job makes it.
//   3. A deal on no account (no id, and no live account or two of its name) reads its account name as a typed name
//      is read (rule 4).
//   4. A name typed in New Job: the one customer whose name reads as it — or that stands for the ONE live account
//      of the name, under its own name; else that account, when no customer stands for it yet; two or more of
//      either, or two live accounts of the name and no customer of it: refused. A name only an account merged
//      into another has: refused (state §0.209). No record of the name: a new customer, as before.
//
// Pure — no React, no DOM: netlify/functions/quote-to-job.mjs reads it on the server, DispatchTab.jsx on the
// screen. tests/dispatch-customer.test.mjs runs it on made-up twins.
import { searchKey } from './searchMatch.js';
import { resolveLink, unarchived, linkRefusal, accountForDeal, survivorOf } from './pickLink.js';

const idOf = (id) => (id == null ? '' : String(id));
const listOf = (rows) => (Array.isArray(rows) ? rows.filter(Boolean) : []);
// The customers a refusal names, in one order whatever order they were read in (quote -> job's read is unordered):
// by number, then name, then id.
const byNumber = (rows) => [...rows].sort((a, b) => String(a.customerNumber ?? '').localeCompare(String(b.customerNumber ?? ''))
    || String(a.name ?? '').localeCompare(String(b.name ?? '')) || idOf(a.id).localeCompare(idOf(b.id)));

// customerForDeal(customers, deal, accounts) — deal: a deal row ({ accountId, account }); accounts: the accounts
// the caller holds, merge-archived ones included. Returns { how: 'account' | 'name', customer, accountId },
// { how: 'none', accountId } — accountId the account the deal stands on ('' for none), which a customer made for
// it links to — or { refusal: 'many', by: 'account' | 'name', of, noAccount, text, matches } (of: 'account' when two
// live accounts of the deal's name, and no customer of it, are what it names; noAccount for a deal on no account), or
// resolveLink's { refusal: 'merged', … } for a deal on no account whose name only merged-away accounts have.
export function customerForDeal(customers, deal, accounts) {
    const list = listOf(customers);
    const text = String(deal?.account ?? '').trim();
    const account = accountForDeal(deal, accounts);
    const accountId = idOf(account?.id) || idOf(deal?.accountId);
    if (accountId) {
        const linked = list.filter((c) => idOf(c.accountId) === accountId);
        if (linked.length === 1) return { how: 'account', customer: linked[0], accountId };
        if (linked.length > 1) return { refusal: 'many', by: 'account', text, matches: byNumber(linked) };
        // None linked: a customer linked to no account stands for it by the deal's account name — for a deal on no id, the
        // name it holds or the account it resolves to (a merged-away name's survivor; the sixth review of the browser
        // check's fix: a second customer made beside the survivor's); for a deal on an id, the name it holds alone, so
        // the screen and quote -> job read the same where a rep's list lacks another rep's account (the eighth review).
        const keys = new Set([searchKey(text), idOf(deal?.accountId) ? '' : searchKey(account?.name || '')].filter(Boolean));
        const named = list.filter((c) => keys.has(searchKey(c.name || '')) && !idOf(c.accountId));
        if (named.length === 1) return { how: 'name', customer: named[0], accountId };
        // A deal on an account the caller does not hold (deleted since) is on no account: quote -> job's words say to link
        // the deal, never to link a customer to an account that is gone (the ninth review).
        if (named.length > 1) return { refusal: 'many', by: 'name', text, matches: byNumber(named), ...(account ? {} : { noAccount: true }) };
        return { how: 'none', accountId };
    }
    // On no account: its name read as a typed name is (rule 3).
    const t = customerForText(text, list, accounts);
    if (t.how === 'customer') return { how: 'name', customer: t.customer, accountId: '' };
    if (t.refusal === 'many') return { refusal: 'many', by: 'name', of: t.of, noAccount: true, text, matches: t.matches };
    // A name only accounts merged into others have — into more than one, or a chain that leads nowhere (one survivor
    // is the account branch): refused, as New Job's field refuses it (state §0.209) — never a customer of that name.
    if (t.refusal === 'merged') return t;
    return { how: 'none', accountId: '' };
}

// customerForText(text, customers, accounts) — rule 4, New Job's Customer field and its Save. Returns
// { how: 'customer', customer }, { how: 'account', account }, { how: 'create' }, { how: 'empty' }, or a refusal:
// { refusal: 'many', of: 'customer' | 'account', text, matches }, or resolveLink's { refusal: 'merged', … }.
export function customerForText(text, customers, accounts) {
    const typed = String(text ?? '').trim();
    if (typed === '') return { how: 'empty' };
    const key = searchKey(typed);
    // Only punctuation: no record's name reads as it — a new customer, as the field has always offered.
    if (key === '') return { how: 'create' };
    const list = listOf(customers);
    const live = unarchived(accounts);
    const reads = (r) => searchKey(r?.name || '') === key;
    // The customers of the name, and the customer that stands for the ONE live account of the name — each once.
    // With two live accounts of the name (twins), a customer of another name linked to one of them stands for that
    // twin alone, never for the name.
    const namedLive = live.filter(reads);
    const standsFor = (c) => namedLive.length === 1 && idOf(c.accountId) !== '' && idOf(c.accountId) === idOf(namedLive[0].id);
    const found = list.filter((c) => reads(c) || standsFor(c));
    if (found.length === 1) return { how: 'customer', customer: found[0] };
    if (found.length > 1) return { refusal: 'many', of: 'customer', text: typed, matches: byNumber(found) };
    // No customer of the name: two live accounts of it refuse; the one, when no customer stands for it yet.
    if (namedLive.length > 1) return { refusal: 'many', of: 'account', text: typed, matches: namedLive };
    const linked = new Set(list.map((c) => idOf(c.accountId)).filter(Boolean));
    if (namedLive.length === 1 && !linked.has(idOf(namedLive[0].id))) return { how: 'account', account: namedLive[0] };
    // A name only an account merged into another has makes no customer (state §0.209): the account picker's words.
    const r = resolveLink({ text: typed, records: listOf(accounts) });
    if (r.refusal === 'merged') return r;
    return { how: 'create' };
}

// A customer as a refusal names it: “Acme” (CUST-0003).
export function customerLabel(c) {
    const name = `“${String(c?.name ?? '').trim()}”`;
    return c?.customerNumber ? `${name} (${c.customerNumber})` : name;
}

const MAX_NAMED = 5;
const named = (matches) => {
    const list = listOf(matches);
    const shown = list.slice(0, MAX_NAMED).map(customerLabel).join(', ');
    return list.length > MAX_NAMED ? `${shown} and ${list.length - MAX_NAMED} more` : shown;
};

// The names a refusal by name says its customers have: each name of theirs once (searchKey), the deal's own spelling
// where it is one of them — rule 2 reads the deal's text and its account's own name, so they can be named after either
// (the seventh review: "named “Acme”" for two customers named "Acme Holdings").
const namesOf = (result) => {
    const typedKey = searchKey(result.text);
    const byKey = new Map();
    for (const c of listOf(result.matches)) {
        const k = searchKey(c.name || '');
        if (!byKey.has(k)) byKey.set(k, k === typedKey ? String(result.text ?? '').trim() : String(c.name ?? '').trim());
    }
    return byKey.size ? [...byKey.values()] : [String(result.text ?? '').trim()];
};

// What New Job says, and what quote -> job answers, for a deal two or more customers stand for (rule 1 or 2):
// each customer named by its number. `where`: 'screen' (New Job — pick from the list) or 'server' (quote -> job —
// what to change before converting again).
export function dealCustomerRefusal(result, where = 'screen') {
    if (result?.refusal === 'merged') {
        const why = linkRefusal(result);
        return where === 'server' ? `${why} Link the deal to its account, then create the job again.` : why;
    }
    if (!result || result.refusal !== 'many') return '';
    const head = result.by === 'account'
        ? `More than one dispatch customer is linked to this deal's account — ${named(result.matches)}.`
        : `More than one dispatch customer is named ${namesOf(result).map((t) => `“${t}”`).join(' or ')} — ${named(result.matches)}.`;
    if (result.of === 'account') {
        const twins = `More than one CRM account is named “${result.text}”, and the deal is linked to none of them.`;
        return where === 'server'
            ? `${twins} Link the deal to its account, then create the job again.`
            : `${twins} Pick the customer from the list.`;
    }
    if (where === 'server' && result.noAccount) {
        return `${head} The deal is linked to no account: link it to its account, or rename one of these customers under Dispatch → Customers, then create the job again.`;
    }
    if (where === 'server') {
        return result.by === 'account'
            ? `${head} Unlink the wrong one under Dispatch → Customers, then create the job again.`
            : `${head} Link the right one to the deal's account under Dispatch → Customers, then create the job again.`;
    }
    return `${head} Pick the one you mean from the list.`;
}

// What New Job's Customer field says under it, and its Save refuses with, for a typed name rule 4 refuses. Two
// customers are named by their numbers, and said to be named so only when each one is: a customer that stands for
// the account of the name, under a name of its own, is linked to it (the browser check, 28 Oct — "TEST Undo North"
// and "TEST Undo South" under "TEST Undo, Inc." read as named “TEST Undo, Inc.”).
export function typedCustomerRefusal(result) {
    if (!result || !result.refusal) return '';
    if (result.refusal === 'many' && result.of === 'customer') {
        const key = searchKey(result.text);
        const head = listOf(result.matches).every((c) => searchKey(c.name || '') === key)
            ? `More than one dispatch customer is named “${result.text}”`
            : `More than one dispatch customer is named “${result.text}” or linked to the CRM account of that name`;
        return `${head} — ${named(result.matches)}. Pick the one you mean from the list — each row names its number and account.`;
    }
    if (result.refusal === 'many') {
        return `More than one CRM account is named “${result.text}”. Pick the one you mean from the list — each row names its parent.`;
    }
    return linkRefusal(result);
}

// refusalLeads(result, customers, accounts) — what New Job's list leads with under a refusal, so every record its
// words name is a row (the browser check, 28 Oct, and the five reviews of its fix): { customerIds, accountIds } —
// - two customers (a typed name's, or a deal's by its account or its name): those customers;
// - two twin accounts of the name (no customer of it): the twins, and the customers linked to them — a twin a
//   customer of another name holds is out of "not yet in Dispatch", and found only by that customer;
// - a name only accounts merged into another have: the account it was merged into, and its customers ("pick X");
// - anything else: none.
// The ids of records the lists hold, the matches' order kept, each once.
export function refusalLeads(result, customers, accounts) {
    const none = { customerIds: [], accountIds: [] };
    if (!result || !result.refusal) return none;
    const list = listOf(customers);
    // The customers that stand for those accounts, as New Job's list counts an account in Dispatch: linked to one by
    // id, or linked to no account and of one's name (searchKey — rule 2). By id alone, a survivor in Dispatch through
    // an unlinked customer of its name was in neither group, and the list never opened (the sixth review).
    const standFor = (accts) => {
        const ids = new Set(accts.map((a) => idOf(a.id)));
        const keys = new Set(accts.map((a) => searchKey(a.name || '')).filter(Boolean));
        return list.filter((c) => ids.has(idOf(c.accountId)) || (!idOf(c.accountId) && keys.has(searchKey(c.name || '')))).map((c) => idOf(c.id));
    };
    const leadOf = (accts) => ({ customerIds: standFor(accts), accountIds: [...new Set(accts.map((a) => idOf(a.id)))] });
    if (result.refusal === 'many' && result.of !== 'account') return { customerIds: [...new Set(listOf(result.matches).map((c) => idOf(c.id)))], accountIds: [] };
    if (result.refusal === 'many') return leadOf(listOf(result.matches));
    if (result.refusal === 'merged') return leadOf(listOf(result.matches).map((r) => survivorOf(r, listOf(accounts))).filter(Boolean));
    return none;
}

// What New Job says, and its Save refuses with, once a keystroke has cleared a won deal's refusal of two customers:
// the deal still makes no new customer — one is picked, any existing one (Jeff, 29 Oct: "No new customer"; quote ->
// job refuses the same deal with a 409).
export const DEAL_NEEDS_PICK = 'More than one dispatch customer stands for this won deal, so no new customer is made for it. Pick one from the list.';

// The server's refusal of a second customer for one CRM account (Jeff, 28 Oct: "Refuse it"): a business with
// several sites under one account keeps one customer and a service location for each.
export function accountInDispatch(c) {
    return `That CRM account is already in Dispatch as ${customerLabel(c)} — add this site to it as a service location instead.`;
}
