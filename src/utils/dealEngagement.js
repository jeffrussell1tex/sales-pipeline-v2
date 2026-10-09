// src/utils/dealEngagement.js — a deal's people, and who on the deal was engaged, by
// contact id (OPEN_ITEMS §4.2; state §0.192). One rule for the deal window, Home and
// ai-score.mjs.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// Five places counted a deal's per-contact engagement from `activity.contactName`, a
// field no writer stores and the activities table does not have (db/schema.ts: it
// carries contact_ids, the source of truth, and contact_id, its first). The deal
// window's Contacts tab showed 0 / 0 / 0 and "—" for everyone; the rail's dots were all
// stale; the History tab's "Contacts engaged" counted the names LISTED (it seeded each
// with a zero row); Home's "Missing stakeholder" fired on every $20k deal with two
// names; ai-score told the model "Contacts engaged: none" — on dev, 9 Oct, Bluebird
// HVAC's Warehouse Scheduling scored "Priya Shah and Tom Becker unresponsive" though its
// one activity carries Priya's id. Jeff, 1 Oct: key both on contactIds.
//
// AN ACTIVITY names its people by id: contactIds, and contactId — the legacy single id,
// all a QuickLog row carries until a reload, and the one field a contact merge rewrites
// (merge.mjs leaves contactIds holding the archived duplicate). Both are read; a merged
// duplicate reads as the contact it was merged into (mergedIntoId).
//
// A DEAL names its people by contactIds, beside its contacts text ("First Last (Title)"
// from the deal window, "First Last" from Reports, names alone on a deal saved before
// ids). The ids are who is on the deal. The text names an id the caller's contacts do
// not hold (a rep's list holds their own and the unassigned) from the text's same place
// when the text lines up with the ids; a name no id accounts for is a row of its own,
// given the id of the one contact the caller holds by that whole name (contactDeals.js's
// rule: any case, never a prefix), else none. Each row says which ids and which places in
// the text it stands for, so the deal form's × removes the person it shows.
import { dealNamesContact } from './contactDeals.js';
import { dayOf } from './reportPeriod.js';

const fullName = (c) => `${c?.firstName || ''} ${c?.lastName || ''}`.trim();
const NO_TOUCH = Object.freeze({ count: 0, calls: 0, emails: 0, meetings: 0, lastTouch: null });

/** The contact ids an activity names — its contactIds and its contactId — once each. */
export function activityContactIds(a) {
    const ids = Array.isArray(a?.contactIds) ? a.contactIds : [];
    return [...new Set([...ids, a?.contactId].filter((id) => typeof id === 'string' && id))];
}

/**
 * The caller's contacts, indexed: `byId`, and `survivor(id)` — the id a merged
 * duplicate was merged into (mergedIntoId, followed at most five steps), else the id.
 */
export function contactIndex(contacts) {
    const list = (Array.isArray(contacts) ? contacts : []).filter((c) => typeof c?.id === 'string' && c.id);
    const byId = new Map(list.map((c) => [c.id, c]));
    const into = new Map(list.filter((c) => c.mergedIntoId && c.mergedIntoId !== c.id).map((c) => [c.id, c.mergedIntoId]));
    const survivor = (id) => { let x = id; for (let n = 0; n < 5 && into.has(x); n++) x = into.get(x); return x; };
    return { list, byId, survivor };
}

// A directory is the caller's contacts, or contactIndex() of them built once (Home: every deal).
const asIndex = (directory) => (directory?.byId instanceof Map ? directory : contactIndex(directory));

// A survivor the caller holds — or, holding only a duplicate merged into it, that duplicate.
const heldAs = (ix, id) => ix.byId.get(id) || ix.list.find((c) => c.id !== id && ix.survivor(c.id) === id) || null;
const nameFor = (ix, id) => fullName(heldAs(ix, id));

/**
 * A deal's contacts text as [{ raw, name, title }], split on the commas outside
 * parentheses — "Grace Kim (VP, Operations)" is one person — each "Name (Title)" or
 * "Name". An unclosed "(" falls back to the plain ", " split the deal window wrote.
 */
export function listedContacts(text) {
    if (typeof text !== 'string') return [];
    let parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of text) {
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    if (depth > 0) parts = text.split(', ');
    return parts.map((p) => p.trim()).filter(Boolean).map((raw) => {
        const at = raw.indexOf(' (');
        return at > 0 && raw.endsWith(')')
            ? { raw, name: raw.slice(0, at).trim(), title: raw.slice(at + 2, -1).trim() }
            : { raw, name: raw, title: '' };
    });
}

/** A person as the deal's text writes one: "First Last (Title)", or the name alone. */
export const personLabel = (p) => (p?.title ? `${p.name} (${p.title})` : (p?.name || ''));

/**
 * Per contact — as its survivor — the activities naming it: { count, calls, emails,
 * meetings, lastTouch }. Calls are Call and Follow-up, emails Email and Proposal Sent,
 * meetings the rest (the deal window's buckets); lastTouch the latest yyyy-mm-dd day.
 * One activity counts once for a person, though it names them twice.
 */
export function engagementByContact(activities, survivor = (id) => id) {
    const out = new Map();
    for (const a of Array.isArray(activities) ? activities : []) {
        const day = dayOf(a?.date || a?.createdAt);
        for (const id of new Set(activityContactIds(a).map(survivor))) {
            const e = out.get(id) || { ...NO_TOUCH };
            e.count++;
            if (a.type === 'Call' || a.type === 'Follow-up') e.calls++;
            else if (a.type === 'Email' || a.type === 'Proposal Sent') e.emails++;
            else e.meetings++;
            if (day && (!e.lastTouch || day > e.lastTouch)) e.lastTouch = day;
            out.set(id, e);
        }
    }
    return out;
}

/**
 * Everyone the activities name, once each as their survivor, latest touch first:
 * [{ id, name, engagement }] — name '' for a contact the caller does not hold.
 */
export function engagedContacts(activities, directory) {
    const ix = asIndex(directory);
    return [...engagementByContact(activities, ix.survivor)]
        .map(([id, engagement]) => ({ id, name: nameFor(ix, id), engagement }))
        .sort((a, b) => String(b.engagement.lastTouch || '').localeCompare(String(a.engagement.lastTouch || '')));
}

/**
 * An engaged person as the AI score's prompt names them: "Priya Shah (last touch
 * 2026-09-30, 1 activity)" — the dates the model needs before it calls anyone
 * unresponsive (Jeff, 9 Oct: "Add last touch + count").
 */
export function engagedLabel(p) {
    const e = p?.engagement || NO_TOUCH;
    const n = `${e.count} ${e.count === 1 ? 'activity' : 'activities'}`;
    return `${p?.name || ''} (${e.lastTouch ? `last touch ${e.lastTouch}, ` : ''}${n})`;
}

/**
 * The deal's people, one row each: [{ key, id, rawIds, slots, name, title, engagement }].
 * Its contactIds first — as survivors, once each (rawIds: the deal's ids the row stands
 * for) — named by the caller's contacts or, for an id they do not hold, by the deal's
 * text at the same place when the text lines up with the ids; then each name in the text
 * no id accounts for. slots: the places in the text the row stands for. engagement: the
 * row's touches among `activities` (the deal's own); a row with no id has none.
 */
export function dealCommittee(deal, directory, activities) {
    const ix = asIndex(directory);
    const touches = engagementByContact(activities, ix.survivor);
    const listed = listedContacts(deal?.contacts);
    const names = (t, c) => !!c && dealNamesContact({ contacts: t.raw }, c);
    const rows = [];
    for (const raw of Array.isArray(deal?.contactIds) ? deal.contactIds : []) {
        if (typeof raw !== 'string' || !raw) continue;
        const id = ix.survivor(raw);
        const seen = rows.find((r) => r.id === id);
        if (seen) seen.rawIds.push(raw);
        else rows.push({ id, rawIds: [raw], contact: heldAs(ix, id) || ix.byId.get(raw) || null });
    }
    // In line: one name per id; a contact the caller holds is named at its own place, or
    // nowhere (renamed) — and then its place names no OTHER contact the caller holds (an
    // old × by index could leave a kept name at a removed person's id).
    const aligned = listed.length === rows.length && rows.every((r, i) => !r.contact
        || names(listed[i], r.contact)
        || (!listed.some((t) => names(t, r.contact))
            && !ix.list.some((c) => ix.survivor(c.id) !== r.id && names(listed[i], c))));
    const used = new Set();
    const slotOf = (r, i) => {
        if (aligned) return i;
        if (!r.contact) return -1;
        return listed.findIndex((t, j) => !used.has(j) && names(t, r.contact));
    };
    const person = (key, id, rawIds, contact, slot) => {
        if (slot >= 0) used.add(slot);
        return {
            key,
            id,
            rawIds,
            slots: slot >= 0 ? [slot] : [],
            name: fullName(contact) || listed[slot]?.name || '',
            title: contact ? contact.title || '' : listed[slot]?.title || '',
            engagement: (id && touches.get(id)) || NO_TOUCH,
        };
    };
    const people = rows.map((r, i) => person(r.id, r.id, r.rawIds, r.contact, slotOf(r, i)));
    // A name no id accounts for — a deal saved before ids, or a name typed beside them.
    listed.forEach((t, j) => {
        if (used.has(j)) return;
        const hits = [...new Set(ix.list.filter((c) => names(t, c)).map((c) => ix.survivor(c.id)))];
        const id = hits.length === 1 ? hits[0] : null;
        const same = people.find((p) => (id ? p.id === id : !p.id && p.name.toLowerCase() === t.name.toLowerCase()));
        if (same) { same.slots.push(j); used.add(j); return; }
        people.push(person(id || `listed-${j}`, id, [], id ? ix.byId.get(id) || null : null, j));
    });
    return people;
}

/**
 * Whether a contact is already one of the deal's people (dealCommittee's rows) — by its
 * id, a merged duplicate by the id it was merged into. The pickers offered a contact
 * already on the deal by id when its name had changed, and linking it again stored the
 * id twice; the form's picker hid "Dana Whit" once "Dana Whitaker" was linked.
 */
export function onDealOf(people, directory) {
    const ix = asIndex(directory);
    const ids = new Set((Array.isArray(people) ? people : []).flatMap((p) => [p?.id, ...(p?.rawIds || [])]).filter(Boolean));
    return (c) => !!c?.id && (ids.has(c.id) || ids.has(ix.survivor(c.id)));
}

/**
 * The deal form's two lists without one of dealCommittee's people — every id and every
 * place in the text it stands for. The form removed the name and the id at one index,
 * and its lists can be out of step (a deal saved before ids, a Reports edit, a title with
 * a comma).
 */
export function withoutPerson(texts, contactIds, p) {
    const slots = Array.isArray(p?.slots) ? p.slots : [];
    const rawIds = Array.isArray(p?.rawIds) ? p.rawIds : [];
    const kept = listedContacts((Array.isArray(texts) ? texts : []).join(', ')).filter((_, j) => !slots.includes(j)).map((t) => t.raw);
    return { contacts: kept, contactIds: (Array.isArray(contactIds) ? contactIds : []).filter((id) => !rawIds.includes(id)) };
}
