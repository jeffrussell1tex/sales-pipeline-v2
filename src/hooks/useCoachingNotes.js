// useCoachingNotes — the client side of netlify/functions/coaching-notes.mjs
// (state §0.82). The server decides what the caller may see; this hook loads
// that list once signed in with an active org (`orgId`), again for each org,
// and keeps it current after each write (§0.125: a mount-time load on the
// token wait alone went out unauthenticated after its 8-second give-up).
// Every write checks `res.ok` and adopts the server's row (guide 18b1 / the
// dbfetch rule): a rejected write never shows as saved.
//
// Since §0.246 (docs/design/refusal-sweep 7b; Jeff's Q1, Q17) no write rejects: each answers { ok: true, … } or
// { ok: false, error } in the house words — the server's with their ref, else "The server returned N." (readRefusal),
// a request that never left "The server could not be reached.", an answer that could not be read "Its answer could not
// be read." (failureWords). Offline the dialog stayed "Saving…" for good with Send and Cancel disabled, and Home's "Mark
// read" said nothing. A failed load is `coachingNotesError`, said by Sales Manager's "Recent coaching" and Home's "Notes
// from your manager" — it read as no notes.
import { useState, useEffect, useCallback } from 'react';
import { dbFetch, requestOrg, stillOrg } from '../utils/storage.js';
import { readRefusal, failureWords } from '../utils/refusalWords.js';

const URL = '/.netlify/functions/coaching-notes';

// One write's answer: the ok check first, then — for a write whose answer carries the note (`body`) — the body:
// { ok: true, data, status } or { ok: false, error }. Never throws. Each write sets its list only after its own org
// check, in its own function (tests/late-answers.test.mjs reads it there).
const answered = async (send, { body = true } = {}) => {
    try {
        const res = await send();
        if (!res.ok) return { ok: false, error: await readRefusal(res) };
        return { ok: true, data: body ? await res.json() : null, status: res.status };
    } catch (e) { return { ok: false, error: failureWords(e) }; }
};

export function useCoachingNotes({ waitForToken, orgId = null, enabled = true } = {}) {
    const [coachingNotes, setCoachingNotes] = useState([]);
    const [coachingNotesLoaded, setCoachingNotesLoaded] = useState(false);
    const [coachingNotesError, setCoachingNotesError] = useState('');

    const reload = useCallback(async () => {
        // This org's notes only (state §0.173): an answer for an org switched away
        // from is dropped — the effect's cancel flag guarded only the wait before it.
        // A refusal is thrown in the server's words (§0.246), said by the effect as the load's error.
        const askedOrg = requestOrg();
        const res = await dbFetch(URL);
        if (!stillOrg(askedOrg)) return false;
        if (!res.ok) throw new Error(await readRefusal(res));
        const data = await res.json();
        if (!stillOrg(askedOrg)) return false;
        setCoachingNotes(Array.isArray(data?.coachingNotes) ? data.coachingNotes : []);
        setCoachingNotesLoaded(true);
        setCoachingNotesError('');
        return true;
    }, []);

    useEffect(() => {
        // Nothing before an org is active, and never another org's notes after a
        // switch: the list resets, then loads for THIS org (state §0.125).
        setCoachingNotes(prev => (prev.length ? [] : prev));
        setCoachingNotesLoaded(false);
        setCoachingNotesError('');
        if (!enabled || !orgId) return;
        let cancelled = false;
        const askedOrg = requestOrg();
        (async () => {
            try {
                if (waitForToken) await waitForToken();
                if (cancelled) return;
                await reload();
            } catch (err) {
                // A failed load is said, never read as no notes (§0.246, Q17) — only for the org that asked.
                if (!cancelled && stillOrg(askedOrg)) setCoachingNotesError(failureWords(err));
            }
        })();
        return () => { cancelled = true; };
    }, [enabled, orgId, waitForToken, reload]);

    /** POST a payload from newNotePayload. Returns { ok, note?, error? }. */
    // After an org switch an answer changes nothing on screen (state §0.175); the
    // caller still gets its result.
    const addCoachingNote = useCallback(async (payload) => {
        const askedOrg = requestOrg();
        const r = await answered(() => dbFetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
        if (!r.ok) return r;
        const note = r.data?.coachingNote;
        if (note && stillOrg(askedOrg)) setCoachingNotes(prev => [note, ...prev.filter(n => n.id !== note.id)]);
        return { ok: true, note, created: r.status === 201 };
    }, []);

    const markCoachingNoteRead = useCallback(async (id) => {
        const askedOrg = requestOrg();
        const r = await answered(() => dbFetch(URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'read' }) }));
        if (!r.ok) return r;
        const note = r.data?.coachingNote;
        if (note && stillOrg(askedOrg)) setCoachingNotes(prev => prev.map(n => (n.id === note.id ? note : n)));
        return { ok: true, note };
    }, []);

    const deleteCoachingNote = useCallback(async (id) => {
        const askedOrg = requestOrg();
        const r = await answered(() => dbFetch(`${URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }), { body: false });
        if (!r.ok) return r;
        if (stillOrg(askedOrg)) setCoachingNotes(prev => prev.filter(n => n.id !== id));
        return { ok: true };
    }, []);

    return { coachingNotes, coachingNotesLoaded, coachingNotesError, reloadCoachingNotes: reload, addCoachingNote, markCoachingNoteRead, deleteCoachingNote };
}
