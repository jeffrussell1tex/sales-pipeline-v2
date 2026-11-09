// restoreOwner.js — a delete's Undo keeps the owner the record was stored with (state §0.236; guide §18b119;
// docs/design/deal-data, Jeff's Q4 "Any role, by id").
//
// A contact's Undo re-POSTs it as the screen held it. Until §0.236 that POST stamped its owner as any create
// does: a rep's name looked up again by NAME (refused when two members share it), and no name meaning THE CALLER
// owns it — a rep who deleted and restored an unassigned contact took it from every other rep's list. Now the
// Undo marks its POST a restore (`restore: true`) and the server keeps the stored owner by id: the member with
// that app id in THIS org, else none — and an owner id it drops takes the owner's name with it, since an
// unassigned row shows no owner. Never the caller; no name lookup. As the account's Undo has since §0.198
// (accounts.mjs), whose mark only an Admin's write carries.
//
// Pure: contacts.mjs runs it with the roster row it read (rosterUserById), tests/deal-data.test.mjs without.

/**
 * @param {Object} row          the sanitized row to insert (without an owner id)
 * @param {*}      sentOwnerId  the owner id the restored record was stored with, as the body sent it
 * @param {Object|null} member  the roster row with that id in THIS org (rosterUserById), or null
 * @param {string} nameKey      the row's owner-name column (ownerNameKeyFor: a contact's `assignedRep`)
 */
export function restoredOwner(row, sentOwnerId, member, nameKey) {
    const ownerId = member?.id ?? null;
    return { ...row, ownerId, ...(sentOwnerId && !ownerId ? { [nameKey]: null } : {}) };
}
