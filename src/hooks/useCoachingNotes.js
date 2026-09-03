// useCoachingNotes — the client side of netlify/functions/coaching-notes.mjs
// (state §0.82). The server decides what the caller may see; this hook loads
// that list once the Clerk token is ready and keeps it current after each
// write. Every write checks `res.ok` and adopts the server's row (guide 18b1 /
// the dbfetch rule): a rejected write never shows as saved.
import { useState, useEffect, useCallback } from 'react';
import { dbFetch } from '../utils/storage';

const URL = '/.netlify/functions/coaching-notes';

const errorOf = async (res, fallback) => {
    try { const b = await res.json(); return b?.error || fallback; } catch { return fallback; }
};

export function useCoachingNotes({ waitForToken, enabled = true } = {}) {
    const [coachingNotes, setCoachingNotes] = useState([]);
    const [coachingNotesLoaded, setCoachingNotesLoaded] = useState(false);

    const reload = useCallback(async () => {
        const res = await dbFetch(URL);
        if (!res.ok) return false;
        const data = await res.json();
        setCoachingNotes(Array.isArray(data?.coachingNotes) ? data.coachingNotes : []);
        setCoachingNotesLoaded(true);
        return true;
    }, []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        (async () => {
            try {
                if (waitForToken) await waitForToken();
                if (cancelled) return;
                await reload();
            } catch (err) { console.warn('coaching-notes load error:', err.message); }
        })();
        return () => { cancelled = true; };
    }, [enabled, waitForToken, reload]);

    /** POST a payload from newNotePayload / legacyNotePayload. Returns { ok, note?, error? }. */
    const addCoachingNote = useCallback(async (payload) => {
        const res = await dbFetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) return { ok: false, error: await errorOf(res, `The server returned ${res.status}.`) };
        const data = await res.json();
        const note = data?.coachingNote;
        if (note) setCoachingNotes(prev => [note, ...prev.filter(n => n.id !== note.id)]);
        return { ok: true, note, created: res.status === 201 };
    }, []);

    const markCoachingNoteRead = useCallback(async (id) => {
        const res = await dbFetch(URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'read' }) });
        if (!res.ok) return { ok: false, error: await errorOf(res, `The server returned ${res.status}.`) };
        const data = await res.json();
        const note = data?.coachingNote;
        if (note) setCoachingNotes(prev => prev.map(n => (n.id === note.id ? note : n)));
        return { ok: true, note };
    }, []);

    const deleteCoachingNote = useCallback(async (id) => {
        const res = await dbFetch(`${URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) return { ok: false, error: await errorOf(res, `The server returned ${res.status}.`) };
        setCoachingNotes(prev => prev.filter(n => n.id !== id));
        return { ok: true };
    }, []);

    return { coachingNotes, coachingNotesLoaded, reloadCoachingNotes: reload, addCoachingNote, markCoachingNoteRead, deleteCoachingNote };
}
