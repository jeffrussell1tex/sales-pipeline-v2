// src/utils/linkIds.js
//
// What a write's links ask, and what it stores (state §0.199 — batch 4 of OPEN_ITEMS §1 item 1; Jeff,
// 13 Oct: E1 "Listed + CRM extras", E2 "Link the survivor", E3 "Org check only"). Pure: the server's
// netlify/functions/_links.mjs reads which asked ids are live rows of the org and hands the answer back
// here; tests/link-ids.test.mjs runs it — the merge walk too (liveIds), its reader handed in.
//
// A spec names a write's link fields: [{ key, kind, shape = 'one', heldFrom = [key], follow = true, notSelf }]
//   kind      what the id names: account, contact, deal, lead, customer, location (NOUNS); and since
//             §0.201 Dispatch's technician, vehicle, equipment unit, service plan and job; since §0.204 a
//             quote line's product, a rule's assignee (a member) and a claim's SPIFF (an entry of the org's
//             list, not a row) — a link inside a list or an action checked through a view of the ids it
//             holds (productIdsOf, assigneesOf, below); since §0.205 a member's team (an entry of the org's
//             teams list) and pinned reports (saved reports of the org); since §0.212 a member's manager (a member)
//   shape     one (a scalar id), many (an array of ids), chips (an array of { id, … })
//   heldFrom  the stored fields whose ids count as held (an activity's contactIds and its contactId are
//             one link; a task's chips and its Primary contactId too)
//   follow    a row merged away links its survivor (E2); false — it is not live (an account's parent:
//             the single save's placeAccount refuses one, §0.198)
//   notSelf   the link may not name the row it is on (a job's follow-up or parent job — Jeff, 14 Oct:
//             "Org check, no self-link"; since §0.212 a member's manager): 400, asked only of an id named anew
// The rule: a link a write NAMES that the row does not already hold must be a live row of this org —
// a key the body does not name is not asked (the row keeps it); an id the row holds is never asked again
// (an untouched link stands, even one whose row was deleted since); one merged away is stored as the row it
// was merged into; any row of the org will do (E3).

export const NOUNS = Object.freeze({
    account: 'account', contact: 'contact', deal: 'deal', lead: 'lead', customer: 'customer', location: 'service location',
    // Dispatch's (§0.201): none of them is ever merged away
    technician: 'technician', vehicle: 'vehicle', equipment: 'equipment unit', plan: 'service plan', job: 'job',
    // A sales record's (state §0.204): a quote line's product, a rule's assignee, a claim's SPIFF — none ever merged away
    product: 'product', member: 'member', spiff: 'SPIFF',
    // A member's (state §0.205): their team — an entry of the org's teams list — and their pinned reports, saved reports
    // of the org; neither ever merged away
    team: 'team', report: 'saved report',
});
// The kinds a row of which can be merged away (mergeArchived, mergedIntoId).
export const MERGES = Object.freeze(['account', 'contact']);
// How far a merge is followed: a row merged into one merged since, and on. A loop, or a row merged into one
// that is gone, ends the walk: no live row.
export const MERGE_HOPS = 5;

export const notInOrg = (kind) => `That ${NOUNS[kind]} is not in your organization — pick one from the list.`;
export const NOT_AN_ID = 'A link must name a record by its id.';
export const namesItself = (kind) => `A ${NOUNS[kind]} cannot name itself.`;

// The ids a field holds, by its shape. Empty values hold none; a chip with no id holds none.
export function heldIds(shape, value) {
    if (shape === 'one') return value == null || value === '' ? [] : [value];
    if (!Array.isArray(value)) return [];
    return value
        .map((x) => (shape === 'chips' ? (x && typeof x === 'object' ? x.id : x) : x))
        .filter((x) => x != null && x !== '');
}

// A field's value with each id put through `to` — duplicates dropped, the first kept; a chip keeps its
// other fields.
export function rewritten(shape, value, to) {
    if (shape === 'one') return to(value);
    const seen = new Set();
    const out = [];
    for (const x of value) {
        const isChip = shape === 'chips' && x && typeof x === 'object';
        const id = isChip ? x.id : x;
        if (id == null || id === '') { out.push(x); continue; }
        const next = to(id);
        if (seen.has(next)) continue;
        seen.add(next);
        out.push(isChip ? (next === id ? x : { ...x, id: next }) : next);
    }
    return out;
}

// The live row each asked id names: Map(id → the id to store — itself, or for a row merged away the row it
// was merged into, walked up to MERGE_HOPS hops). An id missing from the map names no live row. read(ids)
// answers the org's rows of those ids, [{ id, mergeArchived, mergedIntoId }] — the server's read, in the org,
// so a row merged into another org's is no live row of it. merges: the kind's rows can be merged away
// (MERGES); follow: false — a row merged away is not live (an account's parent).
export async function liveIds(asked, read, { merges = false, follow = true } = {}) {
    const ids = [...new Set((Array.isArray(asked) ? asked : []).filter((x) => typeof x === 'string' && x !== ''))];
    const live = new Map();
    if (!ids.length) return live;
    const byId = new Map((await read(ids)).map((r) => [r.id, r]));
    for (const id of ids) {
        const row = byId.get(id);
        if (!row) continue;
        if (!merges || row.mergeArchived !== true) { live.set(id, row.id); continue; }
        if (!follow) continue;
        const seen = new Set([row.id]);
        let next = row.mergedIntoId;
        for (let hop = 0; next && hop < MERGE_HOPS && !seen.has(next); hop++) {
            seen.add(next);
            const [n] = await read([next]);
            if (!n) break;
            if (n.mergeArchived !== true) { live.set(id, n.id); break; }
            next = n.mergedIntoId;
        }
    }
    return live;
}

const shapeOf = (spec, key) => (spec.find((s) => s.key === key) || {}).shape || 'one';
const heldBy = (spec, entry, stored) => new Set(stored
    ? (entry.heldFrom || [entry.key]).flatMap((k) => heldIds(k === entry.key ? entry.shape || 'one' : shapeOf(spec, k), stored[k]))
    : []);
// A field's value that is not a list where a list is asked, or an id that is not a string. An empty value —
// '' as much as null — is a cleared field, no link (E3).
const malformed = (shape, value) => (shape !== 'one' && value != null && value !== '' && !Array.isArray(value))
    || heldIds(shape, value).some((id) => typeof id !== 'string');

// What one write's links ask: { status: 400, error, field } — a value that names no record by its id, or
// a notSelf link naming the row it is on — or { asks: [{ key, kind, shape, follow, fresh }] }, fresh the
// ids it names anew (none: nothing to read). The row's own id: the stored row's, or a create's body's.
export function linksAsked(spec, data, stored) {
    const asks = [];
    const self = (stored && stored.id) || (data && typeof data === 'object' ? data.id : null) || null;
    for (const entry of spec) {
        const { key, kind, shape = 'one', follow = true } = entry;
        if (!data || typeof data !== 'object' || !(key in data)) continue;
        if (malformed(shape, data[key])) return { status: 400, error: NOT_AN_ID, field: key };
        const held = heldBy(spec, entry, stored);
        const fresh = [...new Set(heldIds(shape, data[key]).filter((id) => !held.has(id)))];
        if (entry.notSelf && self && fresh.includes(self)) return { status: 400, error: namesItself(kind), field: key };
        if (fresh.length) asks.push({ key, kind, shape, follow, fresh });
    }
    return { asks };
}

// What one write stores, once the live ids are read: { status: 404, error, field } — an id it names anew
// is no live row of this org — or { set }, the fields to store in place of those sent (a link to a row
// merged away, its survivor). liveOf(ask): Map(asked id → the id to store).
export function linksDecided(asks, data, liveOf) {
    const set = {};
    for (const ask of asks) {
        const live = liveOf(ask);
        if (ask.fresh.some((id) => !live.has(id))) return { status: 404, error: notInOrg(ask.kind), field: ask.key };
        if (ask.fresh.some((id) => live.get(id) !== id)) set[ask.key] = rewritten(ask.shape, data[ask.key], (id) => live.get(id) || id);
    }
    return { set };
}

// What a bulk write's links ask, for the whole batch: { status: 400, error, field, ids } — a row whose value
// names no record by its id — or { asks: [{ key, kind, shape, follow, fresh, freshOf }] }. held: Map(row id
// → the stored row) for an overwrite; also: { kind, ids } — a bulk create's own rows, live without a read
// where a link names their kind (one another's parent or org chart), never for a link of another kind. A row
// of the batch that does not land leaves no link to it: the endpoint clears one after its insert
// (clearStrayLinks).
export function bulkLinksAsked(spec, rows, { held = null, also = null } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const asks = [];
    for (const entry of spec) {
        const { key, kind, shape = 'one', follow = true } = entry;
        const named = list.filter((r) => r && typeof r === 'object' && key in r);
        const bad = named.find((r) => malformed(shape, r[key]));
        if (bad) return { status: 400, error: NOT_AN_ID, field: key, ids: [bad.id] };
        const own = also && also.kind === kind && also.ids ? also.ids : null;
        const freshOf = (r) => {
            if (!r || typeof r !== 'object' || !(key in r)) return [];
            const have = heldBy(spec, entry, held ? held.get(r.id) : null);
            return heldIds(shape, r[key]).filter((id) => !have.has(id) && !(own && own.has(id)));
        };
        const fresh = [...new Set(named.flatMap(freshOf))];
        if (fresh.length) asks.push({ key, kind, shape, follow, fresh, freshOf });
    }
    return { asks };
}

// What a bulk write stores: { status: 400, error, field, ids } — the batch is refused whole, naming the ids
// no live row of this org has — or { rows }, each link to a row merged away rewritten to its survivor.
export function bulkLinksDecided(asks, rows, liveOf) {
    let out = Array.isArray(rows) ? rows : [];
    for (const ask of asks) {
        const live = liveOf(ask);
        const strays = ask.fresh.filter((id) => !live.has(id));
        if (strays.length) return { status: 400, error: notInOrg(ask.kind), field: ask.key, ids: strays };
        if (ask.fresh.some((id) => live.get(id) !== id)) {
            out = out.map((r) => (r && typeof r === 'object' && ask.key in r && ask.freshOf(r).some((id) => live.get(id) !== id)
                ? { ...r, [ask.key]: rewritten(ask.shape, r[ask.key], (id) => live.get(id) || id) }
                : r));
        }
    }
    return { rows: out };
}

// A save that copies links from another stored record — a task's onto its completion activity, a dispatch
// customer's CRM account onto its job — leaves off one the server refuses as naming no live row (its record
// deleted since: a create asks every link it names) and saves again without it. send(body) answers
// { ok, status, field, … }; only the keys `droppable` names are dropped, each once. Answers { answer, sent }:
// the last answer, and the body it was sent.
export async function saveDroppingRefused(send, body, droppable) {
    const left = new Set(Array.isArray(droppable) ? droppable : []);
    let sent = body;
    let answer = await send(sent);
    while (answer && !answer.ok && answer.status === 404 && left.has(answer.field) && sent && sent[answer.field]) {
        left.delete(answer.field);
        sent = { ...sent, [answer.field]: null };
        answer = await send(sent);
    }
    return { answer, sent };
}

// The ids of a list's entries that are records (state §0.204): what _links.mjs reads of a list the org's settings
// row keeps (its SPIFFs; since §0.205 its teams) — an entry that is an object whose id is text, not empty. A
// plain-text entry (an old team, teamMembership.js) or one with no id names nothing; an id twice is one. Anything
// but a list: none.
export function listEntryIds(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && e.id !== '').map((e) => e.id))];
}

// A quote's lines as the flat list their products are checked through (state §0.204) — a view: the lines are
// stored as sent, never rewritten (no product is merged away), and a screen never lists them for
// saveDroppingRefused (its null would wipe every line). Each line's productId; a line that is no object names
// none (undefined, which heldIds passes over). Anything but a list is handed back as given, so the check refuses
// a non-empty one as no list (NOT_AN_ID) rather than read it as no lines.
export function productIdsOf(lineItems) {
    if (!Array.isArray(lineItems)) return lineItems;
    return lineItems.map((l) => (l && typeof l === 'object' ? l.productId : undefined));
}

// A rule's actions as the flat list their assignees are checked through (state §0.204 — a view, as above): the
// member id (params.assignedToId) of each create-task action, the one action that names a member by id
// (dispatch-automations.mjs); a name-only pick stores '' and names none. An action that is no object, or whose
// params are none, names none. Anything but a list names none — the engine runs only a list.
export function assigneesOf(actions) {
    if (!Array.isArray(actions)) return [];
    return actions.filter((a) => a && typeof a === 'object' && a.type === 'create_task' && a.params && typeof a.params === 'object')
        .map((a) => a.params.assignedToId);
}

// A restored quote's lines with each product that names no product of this org cleared (state §0.205 — Jeff, 15 Oct:
// "Fix both in 4b-2": a quote line's unknown product, the line kept): { lines, cleared } — the lines in their order, a
// cleared one with every other key as filed; a line that names no product, or is no object, as it was. live: the
// product ids of this org among those named (liveIdsInOrg's Map). Lines that are no list are left as they are.
export function lineProductsCleared(lineItems, live) {
    if (!Array.isArray(lineItems)) return { lines: lineItems, cleared: 0 };
    let cleared = 0;
    const lines = lineItems.map((l) => {
        if (!l || typeof l !== 'object' || l.productId == null || l.productId === '' || live.has(l.productId)) return l;
        cleared++;
        return { ...l, productId: null };
    });
    return { lines, cleared };
}

// A restored member's team and pins with what names nothing of this org cleared (state §0.205 — Jeff, 15 Oct: "a
// member's unknown team (with its joined date) and unknown pins"): { patch, cleared } — patch the profile keys to write,
// {} for none. A team that names no team of this org, or is no text, is cleared (the caller clears the date they joined
// it; the team's name is a column, kept); a pin that names no saved report of this org, or is no text, is dropped, the
// rest kept in their order. An empty team or pin names nothing and is kept; pins that are no list are left as they are
// (every reader reads them as none); a profile that is no object, as it is. teams, reports: liveIdsInOrg's Maps.
// Since §0.212 their manager too: one that names no member of this org (members: liveIdsInOrg's Map), or is no text, or
// names the member themselves (selfId), is cleared — the name stored with it kept, as a team's is. With no members
// read, no manager is looked at.
export function memberLinksCleared(profile, teams, reports, members, selfId) {
    const patch = {};
    let cleared = 0;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { patch, cleared };
    if (profile.teamId != null && profile.teamId !== '' && !teams.has(profile.teamId)) { patch.teamId = null; cleared++; }
    if (members && profile.managerId != null && profile.managerId !== '' && (!members.has(profile.managerId) || profile.managerId === selfId)) { patch.managerId = null; cleared++; }
    if (Array.isArray(profile.pinnedReports)) {
        const kept = profile.pinnedReports.filter((id) => id == null || id === '' || reports.has(id));
        if (kept.length < profile.pinnedReports.length) { patch.pinnedReports = kept; cleared += profile.pinnedReports.length - kept.length; }
    }
    return { patch, cleared };
}
