// src/utils/buyingCommittee.js — who the deal's Contacts tab offers to add.
//
// "Add to buying committee" (OpportunityModal's ContactEngagementTab) is a
// SEARCH: nothing is offered until the rep types. Jeff, 1 Oct 2026: the tab
// "should only show the contacts associated with the opportunity that the rep
// has associated and it should have the search for adding more. It should not
// show a list of all contacts". Its filter read `!search || …`, so an empty box
// matched every contact and the tab opened on the whole list above the deal's
// own. The edit form's picker in the same file already waited for a keystroke;
// this is that rule, in one place a test can run (state §0.154).
//
// Offered: a contact whose name or company contains the search (any case) and
// who is not already on the deal. The deal stores its contacts as NAMES
// ("First Last (Title)" from the modal, "First Last" from Reports), so "already
// on the deal" compares whole names — the old prefix test hid "Dana Whit" once
// "Dana Whitaker" was linked.
export function contactsToAdd(contacts, search, linked) {
    const q = String(search ?? '').trim().toLowerCase();
    if (!q) return [];
    const taken = (Array.isArray(linked) ? linked : []).map(s => String(s).split(' (')[0].trim().toLowerCase());
    return (Array.isArray(contacts) ? contacts : []).filter(c => {
        const name = `${c?.firstName || ''} ${c?.lastName || ''}`.trim();
        if (!name) return false;
        const hit = name.toLowerCase().includes(q) || String(c?.company || '').toLowerCase().includes(q);
        return hit && !taken.includes(name.toLowerCase());
    });
}
