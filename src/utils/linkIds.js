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
//             teams list) and pinned reports (saved reports of the org); since §0.212 a member's manager (a member);
//             since §0.223 a service plan's visit template and covered job types (entries of the org's job
//             templates and job types lists)
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
    // A service plan's (state §0.223): its visit template and covered job types — entries of the org's job templates and
    // job types lists, not rows; neither ever merged away
    jobTemplate: 'job template', jobType: 'job type',
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

// ── The ids inside settings (state §0.221 — batch 4b-3 of OPEN_ITEMS §1 item 1, step A; Jeff, 1 Nov: "Take all
// Recommended") ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The lists the org's settings row keeps whose entries name rows by id: each list's fields, the kind each names and
// its shape (one id, or a list of them). A team's manager and reps and a territory's owner and reps are members of the
// org (users.id — never a Clerk id); a crew's members and lead are technicians and its default vehicle a vehicle; a
// quote template's products are products, an inactive one too. Any of the org's counts ("Any of this org's, refuse").
export const SETTINGS_LINKS = Object.freeze({
    teams:          Object.freeze([{ field: 'managerId', kind: 'member' }, { field: 'repIds', kind: 'member', shape: 'many' }]),
    territories:    Object.freeze([{ field: 'ownerId', kind: 'member' }, { field: 'repIds', kind: 'member', shape: 'many' }]),
    dispatchCrews:  Object.freeze([{ field: 'members', kind: 'technician', shape: 'many' }, { field: 'lead', kind: 'technician' }, { field: 'defaultVehicle', kind: 'vehicle' }]),
    quoteTemplates: Object.freeze([{ field: 'productIds', kind: 'product', shape: 'many' }]),
});
// The settings lists whose entries are records with their own id — those above, and those a row names by an entry's
// id (a claim's SPIFF, a member's team, a plan's visit template and covered job types): each a list of objects, each
// with its own text id, no id twice.
export const SETTINGS_LISTS = Object.freeze(['teams', 'territories', 'spiffs', 'dispatchCrews', 'quoteTemplates', 'dispatchJobTemplates', 'dispatchJobTypes']);
export const NOT_A_LIST = 'This setting must be a list.';
export const ENTRY_NEEDS_ID = 'Each entry of this list needs its own id.';

const isEntry = (e) => !!e && typeof e === 'object' && !Array.isArray(e);
const isEntryId = (id) => typeof id === 'string' && id !== '';
const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// How many times each value occurs (by its JSON).
const tally = (values) => {
    const n = new Map();
    for (const v of values) { const k = JSON.stringify(v ?? null); n.set(k, (n.get(k) || 0) + 1); }
    return n;
};
// More of any value than the stored list holds.
const moreThan = (sent, stored) => {
    const had = tally(stored);
    return [...tally(sent)].some(([k, c]) => c > (had.get(k) || 0));
};

// What a settings list a body sends is refused for, or null (state §0.221): a list must be null, empty or a list of
// entries, each an object with a text id of its own, no id twice. A value the stored list already holds is never
// refused for its shape (an id the row holds is never asked again): a value that is no list stands while it is the
// stored value; entries with no id of their own stand while the body sends no more of them than the stored list holds
// (by count — several screens rewrite every entry they save, so an old one never reads the same again); an id twice
// stands while the stored list holds it as often. { status: 400, error, field: key }.
export function listShapeRefused(key, sent, stored) {
    if (sent == null || sent === '' || sent === false) return null;
    if (!Array.isArray(sent)) return sameJson(sent, stored) ? null : { status: 400, error: NOT_A_LIST, field: key };
    const had = Array.isArray(stored) ? stored : [];
    const idless = (list) => list.filter((e) => !isEntry(e) || !isEntryId(e.id)).length;
    if (idless(sent) > idless(had)) return { status: 400, error: ENTRY_NEEDS_ID, field: key };
    const ids = (list) => list.filter((e) => isEntry(e) && isEntryId(e.id)).map((e) => e.id);
    const repeats = (list) => ids(list).filter((id, i, all) => all.indexOf(id) !== i);
    if (moreThan(repeats(sent), repeats(had))) return { status: 400, error: ENTRY_NEEDS_ID, field: key };
    return null;
}

// A list's ids in one field, across its entries — a view, as a quote's lines are (productIdsOf): { ids, bad } — the
// text ids it names, and every value that names no record by its id (a value that is no text, a list field that is no
// list, an entry of a list field that is no text). An empty value names none; an entry that is no object names none.
export function settingsLinkIds(list, field, shape = 'one') {
    const ids = [];
    const bad = [];
    for (const e of Array.isArray(list) ? list : []) {
        if (!isEntry(e)) continue;
        const v = e[field];
        if (v == null || v === '') continue;
        if (shape === 'one') { (isEntryId(v) ? ids : bad).push(v); continue; }
        if (!Array.isArray(v)) { bad.push(v); continue; }
        for (const x of v) {
            if (x == null || x === '') continue;
            (isEntryId(x) ? ids : bad).push(x);
        }
    }
    return { ids, bad };
}

// What a settings save's lists ask (state §0.221): { status: 400, error: NOT_AN_ID, field } — a value that names no
// record by its id, more of it than the stored list holds (by count: one stored stands, as an id held stands) — or
// { asks } for linksDecided, one per list field: its key the LIST (a refusal names the list, 'teams'), fresh the ids
// the body names that the stored list does not hold in that field anywhere (Q1: a rep moved between teams, or an id
// the list held when it was stored, is never asked again). A list the body does not send is not asked; a value that
// is no list asks nothing (listShapeRefused judges it). stored: the org's settings extra as stored.
export function settingsLinksAsked(data, stored) {
    const asks = [];
    if (!data || typeof data !== 'object') return { asks };
    for (const [key, fields] of Object.entries(SETTINGS_LINKS)) {
        if (!(key in data) || !Array.isArray(data[key])) continue;
        const had = stored && typeof stored === 'object' ? stored[key] : null;
        for (const { field, kind, shape = 'one' } of fields) {
            const sent = settingsLinkIds(data[key], field, shape);
            const held = settingsLinkIds(had, field, shape);
            if (moreThan(sent.bad, held.bad)) return { status: 400, error: NOT_AN_ID, field: key };
            const holds = new Set(held.ids);
            const fresh = [...new Set(sent.ids.filter((id) => !holds.has(id)))];
            if (fresh.length) asks.push({ key, kind, shape: 'many', follow: false, fresh });
        }
    }
    return { asks };
}

// A restored settings row's lists with what names nothing of this org cleared (state §0.221 — the restore clears what
// it lands): { patch, cleared } — patch the lists to write, {} for none. In each entry, a one-id field that names no
// row of this org, or is no text, becomes '' (never null — a team with no manager reads '', and null === null would
// match a viewer whose profile has not loaded); a list field's entries that name none are dropped, the rest kept in
// their order; a list field that is no list is left as it is. Every other key of an entry, and an entry that is no
// object, as it was. liveOf(kind): the ids of this org among those named (a Set or liveIdsInOrg's Map).
export function settingsLinksCleared(extra, liveOf) {
    const patch = {};
    let cleared = 0;
    if (!extra || typeof extra !== 'object') return { patch, cleared };
    for (const [key, fields] of Object.entries(SETTINGS_LINKS)) {
        if (!Array.isArray(extra[key])) continue;
        let changed = false;
        const next = extra[key].map((e) => {
            if (!isEntry(e)) return e;
            let out = e;
            for (const { field, kind, shape = 'one' } of fields) {
                const v = e[field];
                if (v == null || v === '') continue;
                const live = liveOf(kind);
                if (shape === 'one') {
                    if (isEntryId(v) && live.has(v)) continue;
                    out = { ...out, [field]: '' };
                    cleared++;
                    continue;
                }
                if (!Array.isArray(v)) continue;
                const kept = v.filter((x) => x == null || x === '' || (isEntryId(x) && live.has(x)));
                if (kept.length === v.length) continue;
                cleared += v.length - kept.length;
                out = { ...out, [field]: kept };
            }
            if (out !== e) changed = true;
            return out;
        });
        if (changed) patch[key] = next;
    }
    return { patch, cleared };
}

// The ids a settings row's lists name, by kind (state §0.221): what the restore's clean-up reads of the org.
export function settingsLinkIdsByKind(extra) {
    const out = new Map();
    if (!extra || typeof extra !== 'object') return out;
    for (const [key, fields] of Object.entries(SETTINGS_LINKS)) {
        for (const { field, kind, shape = 'one' } of fields) {
            const ids = out.get(kind) || [];
            ids.push(...settingsLinkIds(extra[key], field, shape).ids);
            out.set(kind, ids);
        }
    }
    return out;
}

// A removed member off the org's team and territory lists (state §0.222 — batch 4b-3, step C; Q9 and (a), Jeff, 2 Nov:
// "Take all Recommended"): { patch, removed } — patch the lists it changed, {} for none. ids: the member's app id and,
// when they have one, their Clerk id — a member who rejoins is given a new row with the same Clerk id, which a list
// holding it would draw back on (teamMembership.js holdsMember). In each team's managerId and repIds and each
// territory's ownerId and repIds, a one-id field naming them becomes '' (never null, as the restore clears), and a
// territory whose owner goes reads unassigned, as its screen writes one with no owner (owner, ownerInit, status); a
// list loses its entries naming them, the rest kept in their order. Every other entry and key — a stray naming no one
// included (Q3) — as it was.
export function membersOffLists(extra, ids) {
    const gone = new Set((Array.isArray(ids) ? ids : []).filter(isEntryId));
    const patch = {};
    let removed = 0;
    if (!gone.size || !extra || typeof extra !== 'object') return { patch, removed };
    for (const [key, fields] of Object.entries(SETTINGS_LINKS)) {
        if (!Array.isArray(extra[key])) continue;
        let touched = false;
        const next = extra[key].map((e) => {
            if (!isEntry(e)) return e;
            let entry = e;
            for (const { field, kind, shape = 'one' } of fields) {
                if (kind !== 'member') continue;
                const v = e[field];
                if (shape === 'one') {
                    if (!gone.has(v)) continue;
                    entry = { ...entry, [field]: '', ...(key === 'territories' ? { owner: 'Unassigned', ownerInit: null, status: 'Unassigned' } : {}) };
                    removed += 1;
                    continue;
                }
                if (!Array.isArray(v) || !v.some((x) => gone.has(x))) continue;
                const left = v.filter((x) => !gone.has(x));
                removed += v.length - left.length;
                entry = { ...entry, [field]: left };
            }
            if (entry !== e) touched = true;
            return entry;
        });
        if (touched) patch[key] = next;
    }
    return { patch, removed };
}
