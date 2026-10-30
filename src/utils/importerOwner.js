// Who owns a row a bulk create sends with no owner name and an ownerId — the import's "importer, by id" rule (the deal
// import, state §0.216, Q11: "Importer, by id"; the contact import, state §0.217: "Imported contacts become the
// owners"). Pure: _lib.mjs importerOwners reads the members (rosterUserById, THIS org only) and hands them here, so a
// unit test runs every branch.

export const OWNER_NOT_MEMBER = 'That owner is not a member of your organization.';

// Each row's id to ask, or null: a row naming an owner is resolved by name (stampOwnerIds), never by its id.
export function importerAsks(rows, nameKey) {
    return rows.map((d) => (String(d?.[nameKey] ?? '').trim() === '' && d?.ownerId ? String(d.ownerId) : null));
}

// members: Map(id → the member of this org, or null). An id that is no member refuses the request whole, naming its
// rows; else `stamp` takes stampOwnerIds' rows, in the order sent, and puts each member's id and name on its row —
// never one without the other.
export function importerDecides(rows, sent, members, nameKey) {
    const strangers = rows.filter((d, i) => sent[i] && !members.get(sent[i])).map((d) => d.id);
    if (strangers.length) return { status: 400, error: OWNER_NOT_MEMBER, field: 'ownerId', ids: strangers };
    return { stamp: (owned) => owned.map((r, i) => { const m = sent[i] ? members.get(sent[i]) : null; return m ? { ...r, ownerId: m.id, [nameKey]: m.name || null } : r; }) };
}
