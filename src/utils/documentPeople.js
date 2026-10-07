// src/utils/documentPeople.js
//
// Whom a Specific document is shared with (state §0.183; Jeff: "for number 2 build a
// picker"). A Specific document read "Chosen people only" and no screen chose anyone, so
// it was its owner's alone (§0.182 found (b)). The picker offers this org's members from
// the roster (settings.users — a rep's is the directory: id, name, active) by their app
// id, the id the server checks each one against and a Specific document lists.
//
// Pure, so a test can run it.

// The people a document can be shared with: the org's active members, by name — without
// the one choosing when the document is theirs (its owner always sees it).
export function sharablePeople(roster, { selfId = null, selfIsOwner = false } = {}) {
    return (Array.isArray(roster) ? roster : [])
        .filter((u) => u && u.id && u.active !== false && !(selfIsOwner && u.id === selfId))
        .map((u) => ({ id: u.id, name: (u.name || '').trim() || 'Unnamed member' }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// The members a search finds, to add (Jeff: "A type ahead multi select instead of a
// prebuilt list" — the whole org as a list would not do for a large one): names holding
// what was typed, in any case, not chosen already — the first `limit`, and how many more.
export function peopleMatching(people, query, chosen = [], limit = 8) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { shown: [], more: 0 };
    const hits = (Array.isArray(people) ? people : []).filter((p) => !chosen.includes(p.id) && p.name.toLowerCase().includes(q));
    return { shown: hits.slice(0, limit), more: Math.max(0, hits.length - limit) };
}

// The names of the people a document is shared with, as the roster names them — one no
// longer on it reads "Former member".
export function sharedNames(ids, roster) {
    const byId = new Map((Array.isArray(roster) ? roster : []).filter((u) => u && u.id).map((u) => [u.id, (u.name || '').trim()]));
    return (Array.isArray(ids) ? ids : []).map((id) => byId.get(id) || 'Former member');
}

// One person in or out of a choice, as ticking their name does.
export const toggled = (chosen, id) => (chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
