// src/utils/leaveOut.js
//
// An edit's Save leaves out each link field nobody touched (state §0.198, the pre-ship round;
// Jeff, 12 Oct: "One rule for every link"). Whatever such a field sent could overwrite what is
// stored: the linked account's own name brought a merged-away name back over a contact's
// Company; a task opened on a contact the list does not hold stored a chip with no name; a
// screen loaded before a merge, a rename or another session's pick sent its old copy of the
// link back. Every endpoint lays a PUT over the stored row (§0.169), so a key left out keeps
// what is stored, and answers the row as stored, which the list then shows.
//
// A rail names the keys it leaves out on the data it saves (leaveOut) — the link fields its
// user did not touch, and only on an edit: a new record's prefill is what it saves. The hook
// sends the data without them (sentBody) and keeps the whole of it for its own use — the audit
// line, the calendar event, the follow-up prompt — and for the list until the server answers
// (shownRow). The names ride on the data, so a save the Closed Lost dialog finishes later
// leaves out the same keys. tests/leave-out.test.mjs runs it.

// The key the names ride under — never a column of any table.
export const LEFT_OUT = '__leftOut';

// The data, naming the keys its PUT leaves out; the data as it is when there are none.
export function leaveOut(data, keys) {
    const list = (Array.isArray(keys) ? keys : []).filter((k) => typeof k === 'string' && k !== '' && k !== LEFT_OUT);
    return list.length ? { ...data, [LEFT_OUT]: [...new Set(list)] } : data;
}

// The body a PUT sends: the data without the keys it leaves out, and without their names.
export function sentBody(data) {
    if (!data || typeof data !== 'object') return data;
    const { [LEFT_OUT]: out, ...rest } = data;
    for (const k of Array.isArray(out) ? out : []) delete rest[k];
    return rest;
}

// The data as a list shows it before the server answers: all of it, without the names.
export function shownRow(data) {
    if (!data || typeof data !== 'object') return data;
    const { [LEFT_OUT]: out, ...rest } = data;
    return rest;
}

// Whether two lists hold the same values in the same order — a field's ids as it opened and
// as it is saved.
export function sameList(a, b) {
    const x = Array.isArray(a) ? a : [];
    const y = Array.isArray(b) ? b : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
}
