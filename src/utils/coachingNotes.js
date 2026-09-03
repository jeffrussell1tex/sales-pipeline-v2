// Coaching notes — pure client helpers (state §0.82).
//
// Notes live in their own org-scoped table (netlify/functions/coaching-notes.mjs)
// and are addressed to people or a team; the server decides visibility. What is
// left for the client is display and the one-time import of the old
// settings.extra.coachingNotes blob, whose rows were { id, rep, text, date,
// author } with `rep` a free-text name parsed from "rep: text" (§0.79).
import { todayLocal } from './dateLocal.js';

/** "Karen Russell: great call" → { rep:'Karen Russell', text:'great call' }; no colon → rep ''. */
export function parseCoachingNote(input) {
    const s = String(input ?? '').trim();
    if (!s) return null;
    const i = s.indexOf(':');
    if (i <= 0) return { rep: '', text: s };
    const rep = s.slice(0, i).trim();
    const text = s.slice(i + 1).trim();
    if (!text) return { rep: '', text: rep };
    return { rep, text };
}

/** A fresh client-minted id. Injectable for tests. */
export const newNoteId = (uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()))) => 'cn_' + uuid();

/**
 * The POST payload for a new note. `date` is the author's LOCAL day (18b26).
 * Exactly one of recipientIds / teamId; the server refuses anything else.
 */
export function newNotePayload({ text, recipientIds = [], teamId = null, today = todayLocal(), id = newNoteId() }) {
    const t = String(text ?? '').trim();
    if (!t) return null;
    const ids = [...new Set(recipientIds.filter(Boolean))];
    if (teamId) return { id, text: t, date: today, teamId, recipientIds: [] };
    if (!ids.length) return null;
    return { id, text: t, date: today, recipientIds: ids, teamId: null };
}

/**
 * One legacy blob row → an import payload. The id is DERIVED from the old id,
 * so the import is idempotent (guide §18c). The rep NAME is resolved against
 * the roster; an unresolvable or ambiguous name yields no recipients, and the
 * server files such a note as author-only (visible to Admins).
 */
export function legacyNotePayload(old, roster = []) {
    if (!old || !String(old.text ?? '').trim()) return null;
    const name = String(old.rep ?? '').trim().toLowerCase();
    const matches = name ? roster.filter(u => u && u.id && String(u.name ?? '').trim().toLowerCase() === name) : [];
    const recipientIds = matches.length === 1 ? [matches[0].id] : [];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(old.date || '')) ? old.date : todayLocal();
    return {
        id: 'cn_legacy_' + String(old.id || `${old.date || ''}_${old.text}`).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120),
        text: String(old.text).trim(),
        date,
        recipientIds,
        teamId: null,
        legacy: true,
        authorName: String(old.author ?? '').trim(),
        unresolvedRep: matches.length === 1 ? null : (old.rep || null),
    };
}

/** Who a note is addressed to, for display: names from the roster, or the team's name. */
export function audienceLabel(note, roster = [], teams = []) {
    if (!note) return '';
    if (note.teamId) {
        const team = teams.find(t => t && t.id === note.teamId);
        return team ? `Team ${team.name}` : 'A team';
    }
    const ids = Array.isArray(note.recipientIds) ? note.recipientIds : [];
    const names = ids.map(id => roster.find(u => u && u.id === id)?.name).filter(Boolean);
    if (!names.length) return note.legacy ? 'Imported · no recipient' : 'No recipient';
    if (names.length <= 2) return names.join(' & ');
    return `${names[0]} & ${names.length - 1} others`;
}

/** Is the note addressed to this user — directly, or through their team? (Authors and Admins see more; this is the "for you" test.) */
export function isAddressedTo(note, userId, teamId = null) {
    if (!note || !userId) return false;
    const ids = Array.isArray(note.recipientIds) ? note.recipientIds : [];
    if (ids.includes(userId)) return true;
    return !!(note.teamId && teamId && note.teamId === teamId);
}

/** Has this user read it? */
export function isReadBy(note, userId) {
    return !!(userId && note?.readBy && typeof note.readBy === 'object' && note.readBy[userId]);
}

/** The notes addressed to `userId` that they have not read, newest first. */
export function unreadFor(notes, userId, teamId = null) {
    return (Array.isArray(notes) ? notes : [])
        .filter(n => isAddressedTo(n, userId, teamId) && !isReadBy(n, userId))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Newest first by day, then by creation instant. */
export function sortNotes(notes) {
    return [...(Array.isArray(notes) ? notes : [])].sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
