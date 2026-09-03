// Coaching notes (Sales Manager tab) — pure helpers.
//
// A note used to be taken through the browser's native prompt dialog and kept in
// React state only: the settings endpoint neither returned nor merged
// `coachingNotes`, so every note vanished on refresh (state §0.79). The note
// text keeps the "rep name: note" convention the panel renders (rep, then the
// quoted text); these helpers parse it and build the row.
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

/** The stored row. `id` and `today` are injectable for tests. */
export function newCoachingNote({ input, author, today = todayLocal(), id = 'cn_' + Date.now() }) {
    const parsed = parseCoachingNote(input);
    if (!parsed) return null;
    return { id, rep: parsed.rep, text: parsed.text, date: today, author: author || '' };
}

/** Append, never replace: the list is org-wide and other managers' notes are in it. */
export function withCoachingNote(list, note) {
    return [...(Array.isArray(list) ? list : []), note];
}
