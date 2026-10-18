// mergeUndo.js — a merge's Undo, decided (state §0.207; guide §18b100). Pure — its one import, accountParent.js (the
// house parent rule), is pure too: merge.mjs reads it on the server; the merge hook and Past merges on the screen;
// tests/merge-undo.test.mjs runs it on made-up rows.
// Jeff, 16 Oct: "Undo as its own batch next"; 17 Oct: "Undo, cleanup, profile" — Past merges on each Find & merge
// page (Q1), no age limit (Q2), later edits kept (Q3), a merged-away record deleted since refused (Q4); 18 Oct: no deal
// ever put on a site ("Leave such deals and count them"), the done words ("New words"), the keep rules ("Yes, both")
// and the limits of merges logged before this batch ("Accept the limits").
import { restorePlace, rankOf } from './accountParent.js';

// A contact as merge.mjs names it in its log (mergeContacts' nameOf): first and last, else the email, else the id.
export const contactNameOf = (c) => [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || c?.email || c?.id || '';
const nameOf = (entityType, r) => (entityType === 'contact' ? contactNameOf(r) : (r?.name || r?.id || ''));

export const ALREADY_UNDONE = 'This merge has already been undone.';
// An Undo's batch stopped while nothing reads wrong when the records are read again — a stricter isolation level's
// conflict, or a deadlock with a write racing it: nothing was written, and it can be sent again.
export const UNDO_CHANGED = 'One of these records changed while the merge was being undone. Please try again.';

// Why this merge can no longer be undone — the server's words — or null when it can. log: its merge_log row;
// archived, survivor: the two records as they stand now in this org (undefined when gone); survivorInto: the
// record the survivor was merged into since, when it was. The reverse ran over each of these before (OPEN_ITEMS
// §4.7): it moved links back to a deleted record, or pulled a later merge's rows back from its survivor.
export function undoRefusal({ log, archived, survivor, survivorInto }) {
    if (log?.status === 'reversed') return ALREADY_UNDONE;
    const was = `“${log?.archivedName}”`, into = `“${log?.survivorName}”`;
    if (!archived) return `${was} was deleted after this merge, so the merge can no longer be undone.`;
    if (!survivor) return `${into} was deleted after this merge, so the merge can no longer be undone.`;
    if (survivor.mergeArchived === true) {
        return `${into} was merged into ${survivorInto ? `“${nameOf(log.entityType, survivorInto)}”` : 'another record'} after this merge — undo that merge first.`;
    }
    if (archived.mergeArchived !== true || archived.mergedIntoId !== log.survivorId) {
        return `${was} is no longer merged into ${into}, so this merge can no longer be undone.`;
    }
    return null;
}

// The account a merge into a site moved the merged-away account's deals up to (D22) — the account merge's own upId
// line (merge.mjs), from the log's two snapshots: the archived record's parent where the survivor stood under it, else
// the survivor's.
export function upIdOf(log) {
    const s = log?.survivorSnapshot || {}, a = log?.archivedSnapshot || {};
    return s.parentAccountId === log?.archivedId ? (a.parentAccountId || null) : (s.parentAccountId || null);
}

// A contact merge's survivor org chart: both records' managers (or direct reports), the archived record's id read
// as the survivor's, the survivor itself and repeats dropped. merge.mjs writes it; an Undo compares with it.
export function orgChartUnion(a, b, archivedId, survivorId) {
    const out = []; const seen = new Set();
    for (const item of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
        if (!item || !item.id) continue;
        const id = item.id === archivedId ? survivorId : item.id;
        if (id === survivorId) continue;   // survivor can't reference itself
        if (seen.has(id)) continue;
        seen.add(id); out.push(item);
    }
    return out;
}

// The same value as stored and as logged: null and undefined alike, a list or an object by its JSON, anything
// else by its text (a column stores what it was sent as text).
const same = (x, y) => {
    const v = (z) => (z == null ? null : typeof z === 'object' ? JSON.stringify(z) : String(z));
    return v(x) === v(y);
};
const LISTS = new Set(['managers', 'directReports']);

// What an Undo writes on the survivor (Jeff, 17 Oct: Q3 "Keep later edits"): each field the merge changed, back to
// its value before the merge — only where it still holds what the merge wrote. A field edited since is kept, and
// named. current: the survivor as it stands now. Answers { set, keptFields }.
export function survivorRestore(entityType, log, current) {
    const snap = log?.survivorSnapshot || {}, arch = log?.archivedSnapshot || {}, resolved = log?.resolvedFields || {};
    const wrote = {};   // each field the merge wrote, as it wrote it (merge.mjs's survSet, in each merge)
    if (entityType === 'contact') {
        for (const k of Object.keys(resolved)) wrote[k] = resolved[k];
        wrote.firstName = resolved.firstName != null ? resolved.firstName : snap.firstName;
        wrote.lastName = resolved.lastName != null ? resolved.lastName : snap.lastName;
        wrote.managers = orgChartUnion(snap.managers, arch.managers, log.archivedId, log.survivorId);
        wrote.directReports = orgChartUnion(snap.directReports, arch.directReports, log.archivedId, log.survivorId);
    } else {
        for (const k of Object.keys(resolved)) if (k !== 'parentAccountId') wrote[k] = resolved[k];
        wrote.name = log.survivorName;
        if (snap.parentAccountId === log.archivedId) {
            wrote.parentAccountId = arch.parentAccountId || null;
            if (!arch.parentAccountId) wrote.accountTier = 'account';
        }
    }
    const set = {}, keptFields = [];
    for (const [k, v] of Object.entries(wrote)) {
        // A list the snapshot holds as null — a contact saved before contacts.mjs wrote `|| []` — goes back as [], the
        // column's default: a normalisation (every reader takes either), not the value as it stood.
        const before = LISTS.has(k) ? (snap[k] ?? []) : (snap[k] ?? null);
        if (same(v, before)) continue;   // the merge left it as it was: nothing to put back
        if (same(current?.[k], v)) set[k] = before;
        else keptFields.push(k);
    }
    // The owner id went with the owner name (§0.193): back with it, kept with it.
    const ownerKey = entityType === 'contact' ? 'assignedRep' : 'accountOwner';
    if (ownerKey in set && 'ownerId' in snap) set.ownerId = snap.ownerId ?? null;
    return { set, keptFields };
}

// The parent rule on an account merge's Undo (state §0.207 — the review, 17 Oct; accountParent.js, D3: "No self, no
// loops, no sites"; D21: a sub-account ranks above its parent). What an Undo puts back under the record merged away —
// the survivor, where its restore puts back a parent and tier the merge's lift wrote (H6), and each sub-account the
// merge moved to the survivor that still stands there — goes back only where a delete's Undo would put it back
// (restorePlace), on the org's accounts as the Undo leaves them: the record merged away live, the rest of what goes
// back in place. Under a record merged away that stands at another tier than the merge found it at, only what ranks
// above it goes back; under one as found, a row at its own tier at the merge goes back as it stood, legacy shapes too,
// and a row whose tier changed since only where it ranks above it (the re-check, 17 Oct: a site moved to the top and
// back is a business unit, never put back under a business unit). What the rule refuses stays where it stands and is
// kept, counted in the answer — never a refusal of the whole Undo (Jeff, 17 Oct: Q3 "Keep later edits"; 18 Oct: "Yes,
// both" — what would break the parent rules is left where it is and counted; OPEN_ITEMS §4.7: "keep the survivor's
// current parent when the check fails"): a loop (the record merged away moved under the survivor since), a site (the
// record merged away made one since), an account under the survivor that would not rank below the tier it gets back
// (one added since), a row under the record merged away that would not rank above it (its tier changed since).
//
// And an Undo never puts a deal on a site (Jeff, 18 Oct: "Leave such deals and count them" — the account keeps its
// current level, the deal stays where it is, and it is counted, the same rule as "Keep later edits"). Where the
// survivor would go back a site — its lift reversed (H6), or a tier a merge was sent reversed — while a deal would still
// stand on it by id once the Undo is done (one linked to it since, or its own from before the merge), it keeps its
// place, parent and tier together, and each such deal is counted (held). The deals the deal id restore moves back to
// the record merged away (dealsByIdOf) leave it — but none while the record merged away is a site: merge.mjs moves no
// deal back to it then (notASite) — by its id, by its lift, or (a deal with no account id) by its name (the re-check,
// 18 Oct) — so those stay on the survivor too, each counted by its own restore. Where the parent rule keeps the
// survivor first, its deals are not the deal rule's: none is counted. The survivor's deals are read by id: one by name
// alone on the survivor does not keep it from going back a site (listed back).
//
// tree: the org's accounts (id, name, parentAccountId, accountTier, mergeArchived); restored: survivorRestore's answer;
// deals: the ids of the deals on the survivor by id, as read — not a list (not read), and the survivor never goes back
// a site. Answers its { set, keptFields } — the survivor's parent and tier back together, or kept together — with subs,
// the sub-accounts that go back, under: the record merged away's parent and tier as read, when anything goes back under
// it (merge.mjs asserts them), and held: the deals on the survivor that keep it at its level, counted kept (but those
// the deal id restore names, which it counts).
export function undoPlaces(log, tree, restored, deals) {
    const X = log?.archivedId, Y = log?.survivorId;
    const set = { ...restored.set }, keptFields = [...restored.keptFields];
    const keep = (...keys) => { for (const k of keys) if (k in set) { delete set[k]; keptFields.push(k); } };
    // The parent and tier a lift wrote go back together or stay together: one edited since keeps the other.
    if (keptFields.includes('parentAccountId') || keptFields.includes('accountTier')) keep('parentAccountId', 'accountTier');
    const rows = (Array.isArray(tree) ? tree : []).filter((a) => a && a.id).map((a) => (a.id === X ? { ...a, mergeArchived: false } : a));
    const x = rows.find((a) => a.id === X);
    const moved = new Set((log?.rewrites || []).filter((rw) => rw.table === 'accounts' && rw.column === 'parentAccountId').flatMap((rw) => rw.ids || []));
    let survivor = 'parentAccountId' in set || 'accountTier' in set;
    let subs = rows.filter((a) => a.id !== Y && moved.has(a.id) && a.parentAccountId === Y).map((a) => a.id);
    // A tier the rule does not know reads as an account, as accountParent.js reads one.
    const tierOf = (a) => (rankOf(a?.accountTier) === null ? 'account' : a.accountTier);
    const asFound = (x?.accountTier ?? null) === (log?.archivedSnapshot?.accountTier ?? null);
    // Each row's own tier at the merge: the survivor's from its snapshot, a sub-account's as the merge logged it (tiers —
    // a log written before this batch names none, so its sub-accounts must rank above the record merged away: Jeff,
    // 18 Oct, "Accept the limits" — an old sub-account of an unusual level stays under the survivor, counted kept).
    const tiers = Object.assign({}, ...(log?.rewrites || []).filter((rw) => rw.table === 'accounts' && rw.column === 'parentAccountId').map((rw) => rw.tiers || {}));
    const tierAtMerge = (row) => (row.id === Y ? log?.survivorSnapshot?.accountTier : tiers[row.id]);
    const asStored = (row) => tierAtMerge(row) !== undefined && (row.accountTier ?? null) === (tierAtMerge(row) ?? null);
    const fits = (after, row) => !!row && !restorePlace(after, { selfId: row.id, selfName: row.name, parentId: row.parentAccountId, tier: tierOf(row) }).error
        && (row.parentAccountId !== X || (asFound && asStored(row)) || rankOf(tierOf(row)) > rankOf(tierOf(x)));
    // The deals that would stand on the survivor once the Undo is done (Jeff, 18 Oct): those on it now, but the ones the
    // deal id restore moves back — none while the record merged away is a site. Not read: none known, so it never goes
    // back a site.
    const byId = new Set(dealsByIdOf(log));
    const xSite = tierOf(x) === 'site';
    const staying = Array.isArray(deals) ? deals.filter((id) => xSite || !byId.has(id)) : null;
    let held = [];
    // Each refusal can refuse another — a sub-account kept under the survivor keeps it from going back as a site — so
    // the rule runs again on what is left, until it refuses nothing more.
    for (;;) {
        const after = rows.map((a) => (a.id === Y && survivor
            ? { ...a, parentAccountId: 'parentAccountId' in set ? set.parentAccountId : a.parentAccountId, accountTier: 'accountTier' in set ? set.accountTier : a.accountTier }
            : subs.includes(a.id) ? { ...a, parentAccountId: X } : a));
        const at = (id) => after.find((a) => a.id === id);
        const survivorOut = survivor && !fits(after, at(Y));
        // The parent rule lets it go back, a site again, over a deal (or over deals it could not read): it keeps its place.
        const onSite = survivor && !survivorOut && set.accountTier === 'site' && !(staying && staying.length === 0);
        const out = subs.filter((id) => !fits(after, at(id)));
        if (!survivorOut && !onSite && !out.length) break;
        if (survivorOut || onSite) survivor = false;
        if (onSite) held = (staying || []).filter((id) => !byId.has(id));
        subs = subs.filter((id) => !out.includes(id));
    }
    if (!survivor) keep('parentAccountId', 'accountTier');
    const under = (survivor && set.parentAccountId === X) || subs.length ? { parentAccountId: x?.parentAccountId ?? null, accountTier: x?.accountTier ?? null } : null;
    return { set, keptFields, subs, under, held };
}

// The deals an account merge moved to the survivor by their id (D14) that the deal id restore moves back to the record
// merged away while each still stands on the survivor: the merge's id rewrite of deals, but those its lift moved up (D22
// — the lift overwrote their id move in the merge's own batch; only the lift puts them back, the re-check, 17 Oct).
// undoPlaces reads them as leaving the survivor; merge.mjs's name cascade never counts one put back, so one the deal id
// restore left on the survivor — the record merged away a site (notASite) — is counted kept (Jeff, 18 Oct).
export function dealsByIdOf(log) {
    const writes = (log?.rewrites || []).filter((rw) => rw.table === 'opportunities' && rw.column === 'accountId');
    const lifted = new Set(writes.filter((rw) => rw.kind === 'lift').flatMap((rw) => rw.ids || []));
    return [...new Set(writes.filter((rw) => rw.kind === 'id').flatMap((rw) => rw.ids || []))].filter((id) => !lifted.has(id));
}

// What an account merge left on the survivor by id, of the deals ('opportunities') or contacts its name rewrites renamed
// (the review and the re-check, 17 Oct) — { on, since }. on: the rows that stood on the survivor by id under the name
// the merge renamed — UKG's "Shell - Port Allen" twins, a deal moved before §0.198, a contact of the survivor's under the
// other's name — where their id puts them, never put back by name (Q3): merge.mjs reads them last, and one still on the
// survivor under its name is no change made since. since: the rows the merge named and never left on the survivor — a
// deal it moved up (D22), a row by name alone — so one on the survivor by id now was linked there since: kept, and
// counted, whatever the survivor's name cascade writes over it. The merge logs on each name rewrite which of its ids
// stood on the survivor by id (onSurvivor). A log written before this batch names none, and cannot tell a row by name
// alone from one on the survivor by id: on is every renamed row that neither the deal id rewrite nor the lift names,
// since only the deals moved up — a row by name alone linked to the survivor since is counted put back (Jeff, 18 Oct:
// "Accept the limits" — old merges undo safely, the kept count can be off, the data stays correct). Contacts follow the
// deals' rule (Jeff, 18 Oct: "Yes, both"): a contact on the survivor by id at the merge keeps the survivor's name.
export function survivorRowsOf(log, table) {
    const writes = (log?.rewrites || []).filter((rw) => rw.table === table);
    const names = writes.filter((rw) => rw.kind === 'name');
    const renamed = [...new Set(names.flatMap((rw) => rw.ids || []))];
    const lifted = writes.filter((rw) => rw.kind === 'lift').flatMap((rw) => rw.ids || []);
    const byId = new Set(writes.filter((rw) => rw.column === 'accountId').flatMap((rw) => rw.ids || []));
    if (!names.every((rw) => Array.isArray(rw.onSurvivor))) return { on: renamed.filter((id) => !byId.has(id)), since: [...new Set(lifted)] };
    const on = new Set(names.flatMap((rw) => rw.onSurvivor));
    return { on: [...on], since: [...new Set([...lifted, ...renamed.filter((id) => !on.has(id) && !byId.has(id))])] };
}

// How many records the link restores named that the Undo left as they are now — changed since the merge, kept by the
// parent rule, or a deal it never puts on a site. Counted once each, and not at all when any statement put it back: a
// deal moved up is put back by its lift, a survivor's deal or contact by the name its restore cascades — but never one
// the merge did not leave on the survivor (since: linked there after the merge, its name taken with its id; the
// re-check, 17 Oct), and never a held one (held: the survivor's deals that keep it at its level, left where they are
// whatever a later statement reads of them — Jeff, 18 Oct). restores: [{ table, ids, at, since, held }] — `at` its
// statement's place in the Undo's batch (-1: none); results: the batch's answers, each statement's RETURNING rows.
export function keptLinksOf(restores, results) {
    const named = new Set(), back = new Set(), held = new Set();
    for (const r of restores) {
        const since = new Set(r.since || []);
        for (const id of r.ids || []) { named.add(`${r.table}:${id}`); if (r.held) held.add(`${r.table}:${id}`); }
        for (const x of results[r.at] || []) if (!since.has(x.id)) back.add(`${r.table}:${x.id}`);
    }
    let kept = 0;
    for (const k of named) if (!back.has(k) || held.has(k)) kept += 1;
    return kept;
}

// What an Undo kept, from its batch's answers. built: merge.mjs undoOps's { restores, cascades, survivorAt, set,
// keptFields }. The survivor's restore landed when it wrote its row, or had nothing to write; when an edit landed
// while the Undo ran it wrote nothing — every field it meant to put back was kept, and its name cascade (the
// survivor's name as it stands) put nothing back.
export function undoKept(built, results) {
    const landed = built.survivorAt < 0 || (results[built.survivorAt] || []).length === 1;
    return {
        keptLinks: keptLinksOf(landed ? [...built.restores, ...built.cascades] : built.restores, results),
        keptFields: landed ? built.keptFields : [...built.keptFields, ...Object.keys(built.set)],
    };
}

// The audit row's detail for an Undo (guide §18b42 rule 4: what changed, in words), in the done words' sense (Jeff,
// 18 Oct: "New words"; the re-check, 18 Oct): the linked records it left as they are now and the survivor's fields it
// kept — changed since, or kept by the parent rule or the deal rule, which nobody changed.
export const undoDetail = (log, mergeLogId, keptLinks, keptFields) => `${log.archivedName} restored · undo of ${mergeLogId}`
    + (keptLinks ? ` · ${keptLinks} linked record${keptLinks === 1 ? ' was left as it is' : 's were left as they are'} now` : '')
    + (keptFields.length ? ` · kept: ${keptFields.join(', ')}` : '');

// ── The screen's words (Jeff, 17 Oct: Q8 "Approve as written") ──────────────
// A server error's own words from dbWrite (storage.js refusalOf), or none when it said only its status.
const serverSaid = (r) => (r.error && !/^The server returned \d+\.$/.test(r.error) ? ` — ${r.error}` : '');

// A merge's refusal, in its window. A refusal (4xx) is the server's own words: nothing was merged. A server
// error or no answer may have landed (guide §18b97 rule 6): the merge, if made, is under Past merges.
export function mergeWords(r) {
    if (r.status === 0) return 'No answer from the server — the merge may have been made. Close this window and look under Past merges on this page.';
    if (r.status >= 500) return `The server returned ${r.status}${serverSaid(r)}. The merge may have been made — close this window and look under Past merges on this page.`;
    return r.error || `The server returned ${r.status}.`;
}

// A merge that landed but whose answer named no log id (its body unread): no Undo to send from the toast — Past
// merges holds it.
export const mergedNoticeWords = (merged, into) => `Merged “${merged}” into “${into}” — its Undo is under Past merges on this page.`;

// An Undo's answer: done — the record back, and how many records it left as they are now (Jeff, 18 Oct: "New words",
// replacing "N changes made since the merge were kept", which also counted what the parent rule kept that nobody
// changed); refused (4xx) — the server's words, nothing undone; a server error or no answer — it may have landed:
// reload and see. name: the record merged away as the screen names it — said where a done Undo's answer could not be
// read (dbWrite's data null; the review, 17 Oct), never “undefined”.
export function undoWords(r, name) {
    if (r.ok) {
        const d = r.data || {};
        // Each linked record the Undo left, and the survivor once when any of its fields was kept — its owner with its id
        // (§0.193), its place, a phone and a website: one record (the re-check, 18 Oct: a field is no record). keptLinks
        // never names the survivor: merge.mjs's restores leave it out.
        const fields = Array.isArray(d.keptFields) ? d.keptFields : [];
        const kept = (d.keptLinks || 0) + (fields.length ? 1 : 0);
        const who = d.restoredName || name;
        return `Merge undone${who ? ` — “${who}” is its own record again.` : '.'}${kept ? ` ${kept} ${kept === 1 ? 'record was left as it is now.' : 'records were left as they are now.'}` : ''}`;
    }
    if (r.status === 0) return 'No answer from the server — reload the page to see whether the merge was undone.';
    if (r.status >= 500) return `The server returned ${r.status}${serverSaid(r)}. Reload the page to see whether the merge was undone.`;
    return `Merge not undone — ${r.error}`;
}

// Past merges' confirm, before an Undo, in Jeff's corrected text (18 Oct: "Use the corrected text"): the words
// approved under Q8 said all the merge moved goes back; the keep rules ("Yes, both") and the deal rule ("Leave such
// deals and count them") keep some of it where it stands, counted (undoPlaces; merge.mjs notASite).
export const undoConfirmWords = (m) => `Undo the merge of “${m.archivedName}” into “${m.survivorName}”? “${m.archivedName}” comes back as its own record, and what the merge moved to “${m.survivorName}” moves back, except what cannot go back where it was (it stays, and is counted). Anything changed since the merge stays as it is now.`;
