// src/utils/pickLink.js
//
// A pick is saved as the record picked (state §0.198; Jeff, 11 Oct 2026: "One match saves,
// two refuse"). Every field that links a record through a list searched as it is typed —
// New Contact's and Log Activity's Company, the deal window's Account, New Task's Account
// and Opportunity, an account's Parent — saved the FIRST record of the name typed, not the
// row picked. UKG has two "Shell - Port Allen" under Shell, a business unit and a site, and
// the accounts GET orders by name only: picking the site could save the unit, and a field
// nobody touched moved its link on any Save. Each Save now asks resolveLink what to link,
// in this order:
//
//   1. untouched — the field shows exactly the text it opened with AND holds exactly the id
//      it opened with: the stored link, as stored. Even when another record has the name,
//      when the record is outside the user's list (a rep's scope), or when it was merged
//      away (D1: "A field nobody touched keeps its saved link exactly as stored"; D12).
//   2. held — the record the field holds (the row picked), while its name still reads as
//      the text and the field takes it. A pick typed over is not saved.
//   3. empty — nothing but spaces: no link (D7: "a cleared Company means no account"). Only
//      punctuation is not empty: it is typed, and no record's name reads as it.
//   4. typed — the records not merged away whose name reads as the text (searchKey: case,
//      spacing and punctuation ignored, "Ineos - Acetyls" is INEOS Acetyls). Exactly one the
//      field takes is saved, under its own spelling; in the deal window a site typed in full
//      counts as its account (D5: "Same as clicking the site"). Two or more: refused, and the
//      list names each one's parent (D1). Only a site whose account the list does not hold:
//      refused, and said so (D11). Only records the field does not take: refused, with the
//      host's reason. Only records merged into another: refused, naming the one each was
//      merged into. None: refused.
//
// A merge-archived record is never matched by a typed name and no picker lists one (D12:
// "Yes, hide them"); a link to one is kept (1), and a name only one merged away has names
// the record it was merged into (survivorOf), so the duplicate a merge removed is not made
// again. AccountPicker offers Create exactly when (4) finds no record of the name, merged
// away or not, so a refusal says "use Create" only where Create is offered.
// Pure — no React, no DOM: netlify/functions/accounts.mjs reaches it through
// accountParent.js. tests/pick-link.test.mjs runs it on UKG's rows.
import { searchKey } from './searchMatch.js';

// What every screen shows for a link to a record the user can't open (D16: "Say so, allow
// removing"); the field's × removes the link, and an untouched Save keeps it.
export const HIDDEN_ACCOUNT = "An account you can't open";
export const HIDDEN_DEAL = "A deal you can't open";

// A record a merge archived: merge.mjs marks the one merged away, an account or a contact.
export function isMergeArchived(record) {
    return record?.mergeArchived === true;
}

// What a picker lists, and what a typed name is matched against: every record but one
// merged away, and no empty row.
export function unarchived(list) {
    return (Array.isArray(list) ? list : []).filter((r) => !!r && !isMergeArchived(r));
}

const idOf = (id) => (id == null ? '' : String(id));

// How many merges are followed to a survivor: an account merged into one merged away since.
export const MERGE_HOPS = 5;

// The live record a merge-archived one stands for: the record it was merged into
// (mergedIntoId), followed through later merges — MERGE_HOPS at most — while `records` holds
// it; null when the chain leaves the list, loops or runs on. A record not merged away is
// itself (state §0.198, D12). The prefills (railLinks.js, taskLinks.js) and the 'merged'
// refusal name it.
export function survivorOf(record, records) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    const seen = new Set();
    let r = record || null;
    for (let hops = 0; r && isMergeArchived(r); hops++) {
        if (hops >= MERGE_HOPS || seen.has(idOf(r.id)) || !r.mergedIntoId) return null;
        seen.add(idOf(r.id));
        const next = idOf(r.mergedIntoId);
        r = list.find((x) => idOf(x.id) === next) || null;
    }
    return r;
}

// A site whose parent the list does not hold — a rep's scope (D11). A site under a listed
// account the field cannot take (merged away, or itself a site) is not this: it is a site
// that leads to no account.
const parentOutOfList = (r, list) => !!r?.parentAccountId && !list.some((x) => idOf(x.id) === idOf(r.parentAccountId));

// resolveLink({ text, heldId, storedId, seededText, records, eligible, labelOf, via })
//   text        what the field shows now.
//   heldId      the id the field holds: the row picked, else the stored id ('' for none).
//   storedId    the link the record has saved ('' for none). A new record opened with a
//               link filled in (an account's own rail's "+ Add task") has that id here.
//   seededText  what the field showed when it opened — captured once, when the rail or
//               window opened, never worked out again from the live row.
//   records     the host's FULL list, merge-archived records included.
//   eligible    (record) => whether the field takes it (the deal window: not a site; a
//               Parent: accountParent.js parentChoices). None: every record.
//   labelOf     (record) => its name as the field shows it (an account's name; a deal's
//               dealText).
//   via         (record) => the record a left-out one leads to, or null — the deal window
//               only: a site's account (searchMatch.js viaParent over the listed accounts).
// Returns { how, id, record } — the link to save, id '' for none; record null when the
// stored link is not in `records` — and, for a site typed in full, `via` (Site Name). Or
// { refusal, text, matches }, nothing to save: 'none' (no record of the name), 'many' (two
// or more), 'ineligible' (only records the field does not take — a site whose account is
// listed but taken by no field, merged away or a site itself, among them), 'unreachable'
// (only a site whose account the list does not hold, D11), 'merged' (only records merged
// into another; `into` names the live record they were merged into, '' when the list holds
// none, or more than one). linkRefusal words it.
export function resolveLink({ text = '', heldId = '', storedId = '', seededText = '', records = [], eligible = null, labelOf = (r) => r.name, via = null } = {}) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    const shown = String(text ?? '');
    const typed = shown.trim();
    const key = searchKey(typed);
    const stored = idOf(storedId);
    const held = idOf(heldId);
    const find = (id) => (id ? list.find((r) => idOf(r.id) === id) || null : null);
    const reads = (r) => key !== '' && searchKey(labelOf(r)) === key;
    const takes = (r) => !eligible || !!eligible(r);
    // 1. untouched: the stored link, as stored.
    if (shown === String(seededText ?? '') && held === stored) return { how: 'untouched', id: stored, record: find(stored) };
    // 2. held: the record the field holds, while its name reads as the text and the field takes it.
    const holding = find(held);
    if (holding && reads(holding) && takes(holding)) return { how: 'held', id: idOf(holding.id), record: holding };
    // 3. empty: no link.
    if (typed === '') return { how: 'empty', id: '', record: null };
    // 4. typed: the one record of the name the field takes (or, with via, leads to), or refused.
    const named = unarchived(list).filter(reads);
    const choices = [];
    const outOfReach = [];
    for (const r of named) {
        if (takes(r)) choices.push({ record: r, via: null });
        else if (via) {
            const to = via(r);
            if (to) choices.push({ record: to, via: r });
            else if (parentOutOfList(r, list)) outOfReach.push(r);
        }
    }
    if (choices.length === 1) {
        const [{ record, via: site }] = choices;
        return site ? { how: 'typed', id: idOf(record.id), record, via: site } : { how: 'typed', id: idOf(record.id), record };
    }
    if (choices.length > 1) return { refusal: 'many', text: typed, matches: choices.map((c) => c.via || c.record) };
    if (outOfReach.length) return { refusal: 'unreachable', text: typed, matches: outOfReach };
    if (named.length) return { refusal: 'ineligible', text: typed, matches: named };
    // 5. merged: only records merged into another have the name — the one they were merged into
    // is named, never offered to be made again.
    const gone = list.filter((r) => isMergeArchived(r) && reads(r));
    if (gone.length) {
        const into = new Map(gone.map((r) => survivorOf(r, list)).filter(Boolean).map((r) => [idOf(r.id), r]));
        return { refusal: 'merged', text: typed, matches: gone, into: into.size === 1 ? String(labelOf([...into.values()][0]) ?? '') : '' };
    }
    return { refusal: 'none', text: typed, matches: [] };
}

// What each row says beside a name, so two records of one name can be told apart: the
// account picker names a unit's and a site's parent; the deal rows, account and stage
// (dealSubline); the contact rows, title and company (the task rail's "<title> · <company>").
const ROW_NAMES = { account: 'parent', deal: 'account and stage', contact: 'title and company' };

// One wording for a refused link, wherever it is refused (X: the text as typed, trimmed).
//   noun       what the field links: 'account', 'deal', 'contact'.
//   field      the field's label, where its Create is ('Company', 'Account').
//   canCreate  the field offers Create (New Contact, Log Activity, the deal window). Text
//              that is only punctuation is never offered Create, so it is never named.
//   why        (matches, text) => the sentence for records the field does not take (a
//              Parent: itself, one under it, a site; the deal window: a site).
// 'merged' names the record they were merged into ("“Shell Oil” was merged into “Shell” —
// pick “Shell”."), where Create would make the merged-away record again.
export function linkRefusal(result, { noun = 'account', field = '', canCreate = false, why = null } = {}) {
    if (!result || !result.refusal) return '';
    const text = String(result.text ?? '').trim();
    const quoted = `“${text}”`;
    if (result.refusal === 'many') {
        const names = ROW_NAMES[noun];
        return `More than one ${noun} is named ${quoted}. Pick the one you mean from the list${names ? ` — each row names its ${names}` : ''}.`;
    }
    if (result.refusal === 'ineligible') return why ? why(result.matches || [], text) : `${quoted} can't be used here. Pick one from the list.`;
    if (result.refusal === 'unreachable') return siteOutOfReach(text);
    if (result.refusal === 'merged') {
        const into = String(result.into ?? '').trim();
        return into ? `${quoted} was merged into “${into}” — pick “${into}”.` : `${quoted} was merged into another ${noun}.`;
    }
    const create = canCreate && searchKey(text) !== '';
    return `${quoted} isn't a saved ${noun}. Pick one from the list${create ? `, or use “Create”${field ? ` in the ${field} field` : ''}` : ''}.`;
}

// A site typed in full whose account the user can't open (a rep's scope): the deal window
// refuses it at Save and its list says the same (Jeff, 11 Oct: "Refuse, name the reason").
export function siteOutOfReach(name) {
    return `“${name}” is a site of an account you can't open — ask your manager to link it.`;
}

// A site typed in full whose account the deal window cannot take either — one merged away, or
// a site itself (legacy rows): no account to lead to, and nothing the user can't open.
export function siteNotAccount(name) {
    return `“${name}” is a site — pick the account it belongs to.`;
}

// The deal window's line for a site it cannot offer, by why: its account is outside the list
// (D11), or the list holds it and it is no account for a deal.
export function siteLine(site, records) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    const name = site?.name ?? '';
    return parentOutOfList(site, list) ? siteOutOfReach(name) : siteNotAccount(name);
}

// What a unit's or a site's row says of its parent: "unit of Shell", "site of Shell"; an
// account under a parent whose tier never followed it, "in Shell"; '' with no parent.
export function parentLabel(account, parent) {
    if (!account || !parent) return '';
    const how = account.accountTier === 'site' ? 'site of' : account.accountTier === 'business_unit' ? 'unit of' : 'in';
    return `${how} ${parent.name}`;
}

// A deal as the rails' Opportunity fields name it, and as a typed name is matched: its
// name, or its account's when it has none.
export function dealText(o) {
    return o?.opportunityName || o?.account || '';
}

// The grey line under a deal's row, so two deals of one name can be told apart (D9, Jeff,
// 11 Oct: "Account · stage"): "Shell - Port Allen · Proposal".
export function dealSubline(o) {
    return [o?.account, o?.stage].filter(Boolean).join(' · ');
}

// ── The cleanup batch's screens (state §0.209; guide §18b101) ──────────────────────────────
// A merged-away record leaves every list a screen draws; what still names it is shown on the
// record it was merged into. Nothing here writes: an Undo un-archives the record, and each
// answer below is worked out again from the lists it reloads.

// The ids a record stands for (state §0.209): its own, and every record of `records` merged
// into it — directly or through later merges (survivorOf, MERGE_HOPS) — so a screen that finds
// what names a record also finds what still names one merged into it (a merge moves no
// activity's contactIds, task's chips, document's link or contact's accountId — OPEN_ITEMS
// §4.7). A record merged away stands for itself alone (survivorOf answers only a live record,
// so no row names one merged away). An Undo un-archives the record merged away: it stands for
// itself again, not the survivor. A Set of ids; empty for no record.
export function standsFor(record, records) {
    if (!record) return new Set();
    const own = idOf(record.id);
    const out = new Set([own]);
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    for (const r of list) {
        if (isMergeArchived(r) && idOf(survivorOf(r, list)?.id) === own) out.add(idOf(r.id));
    }
    return out;
}

// A name typed in full that only records merged into another have (resolveLink's 'merged',
// over the whole list), for a box that lists the live ones (state §0.209): { text, name, into }
// — `text` as typed (trimmed); `name` the merged-away record's own name when one has it, else
// the text; `into` the one live record of `records` they were merged into, null when the list
// holds none (a rep's scope) or more than one. null when a live record has the name, or none.
export function mergedInto(text, records, labelOf = (r) => r.name) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    const r = resolveLink({ text, records: list, labelOf });
    if (r.refusal !== 'merged') return null;
    const survivors = new Map(r.matches.map((m) => survivorOf(m, list)).filter(Boolean).map((s) => [idOf(s.id), s]));
    return {
        text: r.text,
        name: r.matches.length === 1 ? String(labelOf(r.matches[0]) ?? '') : r.text,
        into: survivors.size === 1 ? [...survivors.values()][0] : null,
    };
}

// The words of the header search's merged line (state §0.209): with `into`, "“<name>” was
// merged into this <noun>"; without, linkRefusal's "“<name>” was merged into another <noun>."
export function mergedSearchWords(line, noun = 'account') {
    if (!line) return '';
    const name = String(line.name ?? '').trim();
    return line.into ? `“${name}” was merged into this ${noun}` : linkRefusal({ refusal: 'merged', text: name, into: '' }, { noun });
}

// The account a deal stands on, for a screen that shows it (state §0.209): its accountId's —
// one merged into another, the account it was merged into when the list holds it live
// (survivorOf), else none — and, for a deal with no account id, the LATER live account of its
// name (lower case, as Reports reads names; the tie the report engine and the industry chart
// use). An id the list does not hold: none.
export function accountOfDeal(deal, accounts) {
    if (!deal) return null;
    const list = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const id = idOf(deal.accountId);
    if (id) {
        const held = list.find((a) => idOf(a.id) === id) || null;
        return held && isMergeArchived(held) ? survivorOf(held, list) : held;
    }
    const name = String(deal.account ?? '').toLowerCase();
    const named = unarchived(list).filter((a) => String(a.name ?? '').toLowerCase() === name);
    return named.length ? named[named.length - 1] : null;
}

// What an account <select> or chip shows for the link it holds when the options (the live
// accounts) leave it out — itself, disabled (guide §16, §18b24.3): { label, note }. One merged
// away: "<name> (merged into <survivor>)" and the note naming what to pick; one the list does
// not hold (out of a rep's scope, or deleted): HIDDEN_ACCOUNT, no note. null when the options
// hold it, or for no link.
export function heldAccountOption(id, accounts) {
    const key = idOf(id);
    if (!key) return null;
    const list = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const held = list.find((a) => idOf(a.id) === key);
    if (!held) return { label: HIDDEN_ACCOUNT, note: '' };
    if (!isMergeArchived(held)) return null;
    const name = String(held.name ?? '');
    const into = survivorOf(held, list);
    return into
        ? { label: `${name} (merged into ${into.name})`, note: `“${name}” was merged into “${into.name}” — pick “${into.name}”, or “— Not linked —”, and save.` }
        : { label: `${name} (merged into another account)`, note: `“${name}” was merged into another account — pick another, or “— Not linked —”, and save.` };
}
