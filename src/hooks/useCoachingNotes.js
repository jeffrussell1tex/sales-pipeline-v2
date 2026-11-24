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
import { useState, useEffect, useCallback, useRef } from 'react';
import { dbFetch, requestOrg, stillOrg } from '../utils/storage.js';
import { readRefusal, failureWords, refusalWords, heardRefusal, landedBefore } from '../utils/refusalWords.js';

const URL = '/.netlify/functions/coaching-notes';

// One write's answer: the ok check first, then — for a write whose answer carries the note (`body`) — the body:
// { ok: true, data, status } or { ok: false, status, error } (no status when it never answered). Never throws. Each
// write sets its list only after its own org check, in its own function (tests/late-answers.test.mjs reads it there).
const answered = async (send, { body = true } = {}) => {
    try {
        const res = await send();
        // The status beside the words (§0.249, the review's fixes, last pass): a screen tells the server's own refusal (a
        // 4xx in its words — nothing written) from an answer that may have written it (Sales Manager's noteNotDeleted).
        // Since §0.261 (the unknown-save rule) whether the answer proves nothing — anything but the server's own 4xx — and
        // whether it says the note is already stored (an earlier press landed). A landed answer that cannot be read is landed.
        if (!res.ok) { const refused = await res.json().catch(() => null); return { ok: false, status: res.status, error: refusalWords(res, refused), unknown: !heardRefusal(res.status, refused), landed: landedBefore(res.status, refused) }; }
        return { ok: true, data: body ? await res.json().catch(() => null) : null, status: res.status };
    } catch (e) { return { ok: false, error: failureWords(e), unknown: true }; }
};

export function useCoachingNotes({ waitForToken, orgId = null, enabled = true } = {}) {
    const [coachingNotes, setCoachingNotes] = useState([]);
    const [coachingNotesLoaded, setCoachingNotesLoaded] = useState(false);
    const [coachingNotesError, setCoachingNotesError] = useState('');

    const loadGen = useRef(0);   // an answer, or a failure, a later read overtook is dropped (state §0.295): a first sign-in reads them twice
    const reload = useCallback(async () => {
        // This org's notes only (state §0.173): an answer for an org switched away
        // from is dropped — the effect's cancel flag guarded only the wait before it.
        // A refusal is thrown in the server's words (§0.246), said by the effect as the load's error.
        const askedOrg = requestOrg();
        const gen = ++loadGen.current;
        const current = () => stillOrg(askedOrg) && gen === loadGen.current;
        let data;
        try {
            const res = await dbFetch(URL);
            if (!current()) return false;
            if (!res.ok) throw new Error(await readRefusal(res));
            data = await res.json();
        } catch (err) {
            if (!current()) return false;   // a failure a later read overtook, or of another org's, is not said either
            throw err;
        }
        if (!stillOrg(askedOrg) || gen !== loadGen.current) return false;
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

    // …and read again (a first sign-in, state §0.295): a failure is said as the load's is, for the org that asked.
    const reloadSaid = useCallback(async () => {
        const askedOrg = requestOrg();
        try { await reload(); } catch (err) { if (stillOrg(askedOrg)) setCoachingNotesError(failureWords(err)); }
    }, [reload]);

    /** POST a payload from newNotePayload. Returns { ok, note?, error? }. */
    // After an org switch an answer changes nothing on screen (state §0.175); the
    // caller still gets its result.
    const addCoachingNote = useCallback(async (payload) => {
        const askedOrg = requestOrg();
        const r = await answered(() => dbFetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
        // Its id is the dialog's (Part 6): already stored, an earlier press landed — the list read again. One whose answer
        // proves nothing may have saved (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe): said so, the dialog kept for the same note.
        if (!r.ok && r.landed) { if (stillOrg(askedOrg)) reload().catch(() => {}); return { ok: true, note: null, created: false }; }
        if (!r.ok && r.unknown) return { ...r, error: `The note may have been saved — reload the page to see whether it was: ${r.error}` };
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
        // Gone already (state §0.271): an earlier press landed — done, the note taken off.
        if (!r.ok && !r.landed) return r;
        if (stillOrg(askedOrg)) setCoachingNotes(prev => prev.filter(n => n.id !== id));
        return { ok: true };
    }, []);

    return { coachingNotes, coachingNotesLoaded, coachingNotesError, reloadCoachingNotes: reloadSaid, addCoachingNote, markCoachingNoteRead, deleteCoachingNote };
}
