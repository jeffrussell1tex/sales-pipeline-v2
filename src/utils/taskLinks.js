// src/utils/taskLinks.js
//
// What New Task / Edit Task links and saves: its Account, its Opportunity and its contacts
// (state §0.198 — OPEN_ITEMS §1 item 1; Jeff, 11 Oct: D1 "One match saves, two refuse", D6
// "No Create on tasks", D9 "Account · stage", D10 "Yes, fill it in", D12 "Yes, hide them",
// D16 "Say so, allow removing").
//
// Before: the task rail held only the TEXT of Account and Opportunity, and its Save took the
// first account — or deal — of that exact text in the list, whatever row was picked and
// whatever the field was linked to when it opened. UKG has two "Shell - Port Allen" under
// Shell, a business unit and a site, and the accounts GET orders by name only: picking the
// site could save the unit, and a title-only edit moved a task off the later twin. A field
// emptied kept its old link (the Save fell back to the stored id), a name no record has was
// dropped without a word, and removing every contact kept the old contact, which came back
// as the Primary chip on the next open.
//
// Here each link field holds the id it was picked, or opened, with, and its seed — the link
// it opened with — is taken once, when the rail opens. pickLink.js resolveLink decides what
// a Save links: the link as it opened when nobody touched the field (even one the user can't
// open, or one merged away); the record held while the text still reads as it; nothing when
// the field is empty; a name typed in full only when one record has it — two, or none, are
// refused, and the task's Account offers no Create (D6). The contact follows the chips: the
// Primary one, else the first; none when every chip is removed. A name typed in the contact
// box and not picked is added when one contact has it, and refused when two or none do (D1,
// by analogy). Pure: the rail asks it, and tests/task-links.test.mjs runs it on UKG's twins.
import { resolveLink, linkRefusal, isMergeArchived, survivorOf, dealText } from './pickLink.js';

// A field's link: the text that names it, and the id ('' for none).
const NO_LINK = Object.freeze({ text: '', id: '' });
// The rail's link fields before it opens: no account, no deal, no contacts.
export const NO_TASK_SEED = Object.freeze({ account: NO_LINK, deal: NO_LINK, chips: Object.freeze([]) });

// A task links an account of any tier and any deal on the list, as the other rails do.
const anyRecord = () => true;
// How a refusal reads in each field. No field of the task offers Create (D6).
const ACCOUNT = { noun: 'account', field: 'Account' };
const DEAL = { noun: 'deal' };
const CONTACT = { noun: 'contact' };

const find = (records, id) => (id && Array.isArray(records) ? records.find((r) => r && r.id === id) || null : null);

// A contact as its row and its chip name it.
export function contactLabel(c) {
    return c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : '';
}

// What a chip reads: its name; one stored with none, the contact's email or "Unknown contact"
// when the caller's list holds it (the activity rail's words), and "Contact not in your
// list" only when it does not — a contact with no first or last name read as not listed.
export const UNLISTED_CONTACT = 'Contact not in your list';
export function chipLabel(chip, contacts) {
    if (chip?.name) return chip.name;
    const listed = find(contacts, chip?.id);
    return listed ? contactLabel(listed) || listed.email || 'Unknown contact' : UNLISTED_CONTACT;
}

// A contact as a chip — the shape task.contacts[] stores.
export function contactChip(c, primary) {
    return { id: c.id, name: contactLabel(c), title: c.title || '', primary: !!primary };
}

// The task's contactId: the Primary chip, else the first; '' when there is none.
export function primaryContactId(chips) {
    const list = Array.isArray(chips) ? chips.filter((c) => c && c.id) : [];
    return (list.find((c) => c.primary) || list[0] || { id: '' }).id;
}

// What the task rail opens with: { seed, account, deal, chips }. seed — each link field as it
// opened, what an untouched Save keeps; account and deal — what each field shows and holds;
// chips — the contacts.
//   src      the task edited, or a new task's prefill: an account's own rail (its id, D10), a
//            contact's (its id, D19), a deal (Prep, the follow-up prompt), or nothing.
//   editing  an edit: each stored link named by its record, or by nothing when the caller's
//            list does not hold it — the rail says so, and its × removes it (D16). A new task
//            the same, but an account merged away is prefilled as the account it was merged
//            into, by id, when the list holds that live (D12, survivorOf); else nothing — a
//            task holds no account name of its own, and the merged-away name is never shown.
// The contacts: the chips stored — one stored with no name named from the caller's list when
// it holds that contact; a task from before chips, its one contactId as the Primary chip —
// with no name when the list does not hold it (chipLabel) — and the chips as they opened in
// the seed: an edit's Save with them untouched leaves the contacts out, so the stored ones
// stand (a chip with no name was stored, the pre-ship audit, 12 Oct); its × removes it.
export function taskSeed(src, { editing = false, accounts = [], opportunities = [], contacts = [] } = {}) {
    const s = src || {};
    const dealId = s.opportunityId || '';
    const dealRow = find(opportunities, dealId);
    const dealField = { text: dealRow ? dealText(dealRow) : '', id: dealId };
    const accountId = s.accountId || '';
    const acc = find(accounts, accountId);
    const merged = !editing && isMergeArchived(acc);
    const live = merged ? survivorOf(acc, accounts) : null;
    const account = merged ? (live ? { text: live.name || '', id: live.id } : NO_LINK)
        : { text: acc ? acc.name || '' : '', id: accountId };
    const legacy = s.contactId ? find(contacts, s.contactId) : null;
    const named = (c) => {
        const listed = c && !c.name ? find(contacts, c.id) : null;
        return listed ? { ...c, name: contactLabel(listed) } : c;
    };
    const chips = Array.isArray(s.contacts) && s.contacts.length > 0 ? s.contacts.map(named)
        : s.contactId ? [legacy ? contactChip(legacy, true) : { id: s.contactId, name: '', title: '', primary: true }]
        : [];
    return { seed: { account: account.id ? account : NO_LINK, deal: dealField, chips }, account, deal: dealField, chips };
}

// What a task's Save links: { accountId, opportunityId, contacts, contactId, untouched }, or
// { error } — the first refusal, in the order the fields are drawn: Opportunity, the contact
// box, Account. Each link field saves what it shows: the link it opened with, untouched,
// exactly (even one the user can't open) — untouched.account, .deal and .contacts (the chips
// as they opened, in order, each Primary as it was, nothing typed) say which, and an edit's
// Save leaves them out; the record it holds while its text reads as it; nothing
// when it is empty; a name typed in full only when one record has it (D1).
//   account, deal  { text, id }: what each field shows and holds
//   seed           taskSeed's seed, taken when the rail opened
//   contactText    what is typed in the contact box and not picked
//   chips          the contacts chosen
// The lists are the caller's own, merge-archived records included.
export function taskLinks({ account = NO_LINK, deal: dealField = NO_LINK, seed = NO_TASK_SEED, contactText = '', chips = [], accounts = [], opportunities = [], contacts = [] } = {}) {
    const opened = seed || NO_TASK_SEED;
    const dealLink = resolveLink({ text: dealField.text, heldId: dealField.id, storedId: opened.deal.id, seededText: opened.deal.text,
        records: opportunities, eligible: anyRecord, labelOf: dealText });
    if (dealLink.refusal) return { error: linkRefusal(dealLink, DEAL) };
    const typed = resolveLink({ text: contactText, records: contacts, eligible: anyRecord, labelOf: contactLabel });
    if (typed.refusal) return { error: linkRefusal(typed, CONTACT) };
    const acc = resolveLink({ text: account.text, heldId: account.id, storedId: opened.account.id, seededText: opened.account.text,
        records: accounts, eligible: anyRecord });
    if (acc.refusal) return { error: linkRefusal(acc, ACCOUNT) };
    let chosen = (Array.isArray(chips) ? chips : []).filter((c) => c && c.id);
    const before = chosen.length;
    if (typed.record && !chosen.some((c) => c.id === typed.id)) chosen = [...chosen, contactChip(typed.record, chosen.length === 0)];
    const added = chosen.length !== before;
    // The chips as shown against the chips as they opened — every one, one with no id too: its ×
    // is a change, and leaving the contacts out would keep it (the fix review).
    const shownChips = Array.isArray(chips) ? chips : [];
    const asOpened = Array.isArray(opened.chips) ? opened.chips : [];
    const sameChip = (a, b) => a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' && a.id === b.id && !!a.primary === !!b.primary);
    const untouched = {
        account: acc.how === 'untouched',
        deal: dealLink.how === 'untouched',
        contacts: !added && shownChips.length === asOpened.length && shownChips.every((c, i) => sameChip(c, asOpened[i])),
    };
    return { accountId: acc.id, opportunityId: dealLink.id, contacts: chosen, contactId: primaryContactId(chosen), untouched };
}
