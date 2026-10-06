// contactDeals.js — a contact's deals: the open deals that name the contact
// (state §0.176). One definition for every place that counts or lists them — the
// Contacts tab's badge, the contact rail, the delete check.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// Each place had its own rule. The badge counted closed deals too and the rail
// listed open ones only, so a contact with one open deal and one Closed Lost
// showed "2 opps" and listed one (Jeff, 6 Oct: "All I want showing are active
// deals - not closed"). By name the badge matched "First Last (role)" in any
// case, the rail only an exact "First Last", and the delete check any name
// that began with the contact's — a deal naming "Grace Kimball" blocked
// deleting "Grace Kim".
//
// A deal names a contact by its id (contactIds) or — saved before ids — by its
// legacy contacts text: comma-separated names, each "First Last" or
// "First Last (role)", in any case.

// The closed set the contact rail, the account rail and both delete checks
// used: any case, and bare 'won' / 'lost' as well. The server stores a deal's
// stage as sent, so the set is kept as it was, not narrowed.
const CLOSED = new Set(['closed won', 'closed lost', 'won', 'lost']);

/** A deal is open unless its stage is in the closed set. */
export const isOpenDeal = (o) => !CLOSED.has(String(o?.stage || '').trim().toLowerCase());

const fullName = (c) => `${c?.firstName || ''} ${c?.lastName || ''}`.trim().toLowerCase();

/** Whether a deal names the contact — by id, or by name in its legacy text. Never by a prefix. */
export const dealNamesContact = (o, contact) => {
    if (!o || !contact) return false;
    if (contact.id && Array.isArray(o.contactIds) && o.contactIds.includes(contact.id)) return true;
    const name = fullName(contact);
    if (!name || typeof o.contacts !== 'string') return false;
    return o.contacts.split(',').map((s) => s.trim().toLowerCase())
        .some((n) => n === name || n.startsWith(name + ' ('));
};

/** The contact's open deals, each once. */
export const activeDealsOf = (contact, opportunities) =>
    contact ? (opportunities || []).filter((o) => isOpenDeal(o) && dealNamesContact(o, contact)) : [];
