// dealNotes.js — a deal's team notes, one operation at a time (state §0.236; guide §18b119;
// docs/design/deal-data, Jeff's Q1 "Server applies each", Q2 "Server, author only").
//
// Until §0.236 every writer sent the deal's whole notes list, built from the browser's copy — the deal list as
// loaded when the page opened. A tab left open wrote its old list back on any save of the deal (the deal
// window, the Closed Lost dialog) and erased every note a colleague had posted since; two posts at once kept
// the later list. The browser named the author and the time, and the server let anyone who could save the deal
// rewrite any note on it.
//
// Now a post, an edit and a delete are each ONE operation — { op: 'add', text } | { op: 'edit', id, text } |
// { op: 'delete', id } — that the server applies to the list as stored (opportunities.mjs, a compare-and-set),
// stamping the author (the caller's member name and id), the time and the note's id itself. Only a note's author
// may edit or delete it: by `authorId`, or — for a note written before §0.236, which holds only a name — by
// `author` matching the caller's member name, as the screen matched before.
//
// Pure: the server, the deal window and tests/deal-data.test.mjs run the same rules.

export const NOTE_OPS = Object.freeze(['add', 'edit', 'delete']);
export const NOTE_TEXT_MAX = 10000;

// The words each refusal says (the screen shows them as sent).
export const NOTE_WORDS = Object.freeze({
    shape:      'A note change must say what it does: add, edit or delete.',
    empty:      'A note needs some text.',
    tooLong:    `A note can be at most ${NOTE_TEXT_MAX.toLocaleString('en-US')} characters.`,
    noMember:   'Only a member of this organization can post a note.',
    gone:       'That note was deleted since this deal was opened.',
    notAuthor:  'Only the note\'s author can change it.',
    alone:      'A note is saved on its own.',
    wholeList:  'A deal\'s notes are saved one at a time.',
    busy:       'The notes changed while saving. Try again.',
});

// The members a note mentions: each "@" read against the team's names, the longest that starts it — as the deal
// window has read them since its first mention (OpportunityModal's extractMentions, moved here).
export function mentionsIn(text, names) {
    if (!text) return [];
    const sorted = [...new Set((names || []).filter(Boolean))].sort((a, b) => b.length - a.length);
    const found = [];
    const parts = String(text).split('@');
    for (let i = 1; i < parts.length; i++) {
        for (const name of sorted) {
            if (parts[i].startsWith(name)) { found.push(name); break; }
        }
    }
    return [...new Set(found)];
}

// Whether `me` ({ id, name } — the member's app id and name) may edit or delete this note: its author, by id;
// a note with no author id (written before §0.236), by its author name. No member, no change.
export function mayChangeNote(note, me) {
    if (!note || !me) return false;
    if (note.authorId) return !!me.id && note.authorId === me.id;
    return !!me.name && note.author === me.name;
}

// The operation a request body names, checked for its shape — or { error }.
export function noteOpOf(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !NOTE_OPS.includes(raw.op)) return { error: NOTE_WORDS.shape };
    const op = raw.op;
    if (op !== 'add' && (typeof raw.id !== 'string' || !raw.id.trim())) return { error: NOTE_WORDS.shape };
    if (op === 'delete') return { op, id: raw.id };
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text) return { error: NOTE_WORDS.empty };
    if (text.length > NOTE_TEXT_MAX) return { error: NOTE_WORDS.tooLong };
    return op === 'add' ? { op, text } : { op, id: raw.id, text };
}

// The stored list, as a list.
export const notesOf = (stored) => (Array.isArray(stored) ? stored : []);

/**
 * Apply one checked operation (noteOpOf) to the notes as stored.
 * @param {Array}  stored  the deal's notes as stored
 * @param {Object} op      { op, id?, text? }
 * @param {Object} ctx     { me: { id, name }, now: ISO string, newId: string, names: string[] }
 * @returns {{ list: Array, note: Object|null } | { error: string, status: number }}
 */
export function applyNoteOp(stored, op, { me, now, newId, names } = {}) {
    const list = notesOf(stored);
    if (op.op === 'add') {
        if (!me?.id) return { error: NOTE_WORDS.noMember, status: 403 };
        const note = { id: newId, text: op.text, author: me.name || '', authorId: me.id, timestamp: now, mentions: mentionsIn(op.text, names) };
        return { list: [...list, note], note };
    }
    const at = list.findIndex((n) => n && n.id === op.id);
    if (at < 0) return { error: NOTE_WORDS.gone, status: 409 };
    if (!mayChangeNote(list[at], me)) return { error: NOTE_WORDS.notAuthor, status: 403 };
    if (op.op === 'delete') return { list: list.filter((_, i) => i !== at), note: null };
    const note = { ...list[at], text: op.text, mentions: mentionsIn(op.text, names), edited: true, editedAt: now };
    return { list: list.map((n, i) => (i === at ? note : n)), note };
}

// What a deal's save sends: never its notes or its stage history — the server keeps the one and writes the
// other (state §0.236). Every deal PUT a screen sends goes through this (THE GUARD, tests/deal-data.test.mjs).
export function dealBody(row) {
    if (!row || typeof row !== 'object') return row;
    const { comments: _notes, stageHistory: _history, ...rest } = row;
    return rest;
}
