// src/utils/railLinks.js
//
// What the contact rail's Company, and Log Activity's Company and Opportunity, link and save
// (state §0.198 — OPEN_ITEMS §1 item 1; Jeff, 11 Oct: D1 "One match saves, two refuse", D7
// "Save what the field shows", D9 "Account · stage", D10 "Yes, fill it in", D12 "Yes, hide
// them", D16 "Say so, allow removing", D19 "Yes, all the same").
//
// Before: each Save looked the field's TEXT up again — the first account (or deal) of that
// name in the list, in any case and any tier — whatever row was picked and whatever the
// field was linked to when it opened. UKG has two "Shell - Port Allen" under Shell, a
// business unit and a site, and the accounts GET orders by name only: a pick of the site
// saved whichever twin came first, an edit of Phone alone could move a contact between
// them, a rep's edit of an activity erased a link she could not see, Log Activity put a
// deal's account back into a Company the user had cleared, and a deal typed that matched no
// deal kept the old one without a word. The contact's chip and its Email/Call prefill took
// the first account of the company's name too, not the contact's own link.
//
// Here each field holds the id it was picked, or opened, with, and its seed — the link it
// opened with — is taken once, when the rail opens. pickLink.js resolveLink decides what a
// Save links: the link as it opened when nobody touched the field — said, so an edit's Save
// leaves that field out and the row as stored stands (leaveOut.js); the record held while
// the text still reads as it; nothing when the field is empty; a name typed in full only
// when one record has it — two, or none, are refused. Pure: the rails ask it, and
// tests/rail-links.test.mjs runs it on UKG's twins.
import { resolveLink, linkRefusal, isMergeArchived, survivorOf, dealText } from './pickLink.js';

// A field's link: the text that names it, and the id ('' for none).
export const NO_LINK = Object.freeze({ text: '', id: '' });
// Log Activity's two links before it opens.
export const NO_SEED = Object.freeze({ company: NO_LINK, deal: NO_LINK });

// The Company takes an account of any tier; the Opportunity, any deal on the list.
const anyRecord = () => true;
// How a refusal reads: the Company field offers Create (its picker does); a deal field none.
const COMPANY = { noun: 'account', field: 'Company', canCreate: true };
const DEAL = { noun: 'deal' };

const find = (records, id) => (id && Array.isArray(records) ? records.find((r) => r && r.id === id) || null : null);

// A link to a record the caller's list does not hold — another rep's, or one since deleted
// (D16). The field cannot name it: the rail says so, and its × removes the link.
export function outOfList(id, records) {
    return !!id && !find(records, id);
}

// The words after such a record's own name: "(an account you can't open)".
export function hiddenAside(hidden) {
    const words = String(hidden || '');
    return words ? `(${words.charAt(0).toLowerCase()}${words.slice(1)})` : '';
}

// ── The contact rail's Company ──────────────────────────────────────────────

// What the Company field opens with: the contact's stored company and account. The rail
// takes it once, when it opens (a ref) — never again from the live row. A new contact: none.
export function contactSeed(contact) {
    return contact ? { text: contact.company || '', id: contact.accountId || '' } : NO_LINK;
}

// What a contact's Company saves: { company, accountId }, or { error } for the rail to show.
//   text      what the field shows
//   heldId    the id it holds: the row picked, else the stored one (formData.accountId)
//   seed      contactSeed, taken when the rail opened
//   accounts  the caller's FULL list, merge-archived rows included
// Untouched: exactly what it opened with, and `untouched` — never the linked account's own
// name, which after a merge is the merged-away account's (the pre-ship audit, 12 Oct), and on
// a list loaded before a rename the old one; the rail leaves both out of an edit's Save. A
// record picked or typed is saved under its own name; a field cleared saves no company; a name
// two accounts have, or none, is refused (no free-text companies: the field offers Create).
export function contactCompany({ text = '', heldId = '', seed = NO_LINK, accounts = [] } = {}) {
    const opened = seed || NO_LINK;
    const r = resolveLink({ text, heldId, storedId: opened.id, seededText: opened.text, records: accounts, eligible: anyRecord });
    if (r.refusal) return { error: linkRefusal(r, COMPANY) };
    if (r.how === 'untouched') return { company: opened.text, accountId: r.id, untouched: true };
    if (r.record) return { company: r.record.name || '', accountId: r.id };
    return { company: '', accountId: r.id };
}

// The account the contact's Company chip opens: the one its accountId names — one merged
// away, the account it was merged into when the list holds that live (D12, survivorOf; the
// chip showed the survivor's name and opened the merged-away account) — null when the
// caller's list does not hold it (the chip says so, D16); a contact with no link, the one
// account its company's name reads as (D1) — two of that name, or none, open nothing.
export function linkedAccount(row, accounts) {
    if (row?.accountId) {
        const acc = find(accounts, row.accountId);
        return acc && isMergeArchived(acc) ? survivorOf(acc, accounts) || acc : acc;
    }
    const r = resolveLink({ text: row?.company || '', records: accounts });
    return r.how === 'typed' ? r.record : null;
}

// What every Log button on a contact's rail opens Log Activity with (D19, Jeff, 11 Oct:
// "Yes, all the same"): the contact; its account by id — Log Activity names it from the
// list, or says it is one the user can't open; its company, which Log Activity shows as
// typed for a contact with no account link; and its open deal when it has exactly one.
export function contactLogContext(contact, openDeals) {
    const deals = Array.isArray(openDeals) ? openDeals : [];
    const id = contact?.id || '';
    return {
        contactId: id,
        contactIds: id ? [id] : [],
        company: contact?.company || '',
        accountId: contact?.accountId || '',
        opportunityId: deals.length === 1 ? deals[0].id || '' : '',
    };
}

// ── Log Activity's Company and Opportunity ──────────────────────────────────

// The Company an empty field takes from a deal (D7: "Save what the field shows"): the deal's
// account by id, under the account's own name, when the caller's list holds it live; one
// merged away, the account it was merged into, by id, when the list holds that live (D12,
// survivorOf) — else the deal's own account name as typed, never the merged-away name; an
// account the list does not hold, its id with no name (D16 — a link the rail can open with,
// never one a field can hold); a deal saved with a name only, that name as typed (D1).
export function dealCompany(deal, accounts) {
    const id = deal?.accountId || '';
    const acc = find(accounts, id);
    if (acc && !isMergeArchived(acc)) return { text: acc.name || '', id: acc.id };
    if (acc) {
        const live = survivorOf(acc, accounts);
        return live ? { text: live.name || '', id: live.id } : { text: deal?.account || '', id: '' };
    }
    if (id) return { text: '', id };
    return { text: deal?.account || '', id: '' };
}

// What Log Activity opens with: { seed, company, deal }. seed — each field's link as it
// opened, what an untouched Save keeps; company and deal — what each field shows and holds.
//   src      the activity edited, or a new one's prefill: an account's own rail (its id,
//            D10), a contact's (D19: its account by id, its company, its one open deal), a
//            deal (App's handleAddActivity), a lead (its company), a type alone.
//   editing  an edit: its stored links, each named by its record, or by nothing when the
//            list does not hold it (D16: the rail says so); no account stored, no Company
//            (D1). A new activity: a prefilled account by id — one merged away, the account
//            it was merged into, by id, when the list holds that live (D12, survivorOf);
//            else a company the prefill named, as typed (a contact's company, which the
//            merge renamed — never the merged-away account's own name); else the prefilled
//            deal's account (D7, dealCompany). A name shown as typed is Save's to resolve.
export function activitySeed(src, { editing = false, accounts = [], opportunities = [] } = {}) {
    const s = src || {};
    const dealId = s.opportunityId || '';
    const dealRow = find(opportunities, dealId);
    const dealField = { text: dealRow ? dealText(dealRow) : '', id: dealId };
    const accountId = s.accountId || '';
    const acc = find(accounts, accountId);
    if (editing || (accountId && !isMergeArchived(acc))) {
        const opened = { text: acc ? acc.name || '' : '', id: accountId };
        return { seed: { company: opened, deal: dealField }, company: opened, deal: dealField };
    }
    const live = acc ? survivorOf(acc, accounts) : null;
    const fill = live ? { text: live.name || '', id: live.id }
        : s.company ? { text: s.company, id: '' }
        : dealRow ? dealCompany(dealRow, accounts) : NO_LINK;
    const opened = fill.id ? fill : NO_LINK;
    return { seed: { company: opened, deal: dealField }, company: fill, deal: dealField };
}

// The Company left after a deal is picked (D7): a Company that shows anything — text, or a
// link the user can't open — stays; an empty one takes the deal's account (dealCompany),
// unless that is one the list does not hold, which a field cannot hold: it stays empty.
export function companyAfterDealPick(deal, company, accounts) {
    const now = { text: company?.text || '', id: company?.id || '' };
    if (now.text.trim() || outOfList(now.id, accounts)) return now;
    const fill = dealCompany(deal, accounts);
    return outOfList(fill.id, accounts) ? now : fill;
}

// What Log Activity saves: { accountId, company, opportunityId, untouched }, or { error } —
// the Company's first, as it is drawn first. Each field saves what it shows: the link it
// opened with, untouched, exactly (even one the user can't open) — untouched.company and
// untouched.deal say which, and an edit's Save leaves them out; the record it holds while its
// text reads as it; nothing when it is empty — a cleared Company is no account, whatever
// deal is named (D7); a name typed in full only when one record has it (D1).
//   company, deal  { text, id }: what each field shows and holds
//   seed           activitySeed's seed, taken when the rail opened
export function activityLinks({ company = NO_LINK, deal: dealField = NO_LINK, seed = NO_SEED, accounts = [], opportunities = [] } = {}) {
    const opened = seed || NO_SEED;
    const acc = resolveLink({ text: company.text, heldId: company.id, storedId: opened.company.id, seededText: opened.company.text,
        records: accounts, eligible: anyRecord });
    if (acc.refusal) return { error: linkRefusal(acc, COMPANY) };
    const dealLink = resolveLink({ text: dealField.text, heldId: dealField.id, storedId: opened.deal.id, seededText: opened.deal.text,
        records: opportunities, eligible: anyRecord, labelOf: dealText });
    if (dealLink.refusal) return { error: linkRefusal(dealLink, DEAL) };
    const untouched = { company: acc.how === 'untouched', deal: dealLink.how === 'untouched' };
    const companyText = untouched.company ? opened.company.text : acc.record ? acc.record.name || '' : '';
    return { accountId: acc.id, company: companyText, opportunityId: dealLink.id, untouched };
}
