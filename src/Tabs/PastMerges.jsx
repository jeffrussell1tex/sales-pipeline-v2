import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../AppContext';
import { T } from '../tokens.js';
import { undoConfirmWords } from '../utils/mergeUndo.js';

// Past merges (state §0.207 — Jeff, 17 Oct: Q1 "Past merges on each page"). This org's merges of one kind, newest
// first, each with its Undo while the server would take it — the toast after a merge goes in five seconds; this keeps
// the Undo the merge screens promise, with no age limit (Q2). Below each Find & merge page: an Admin's (Settings is
// theirs; the server answers Admins and Managers). Each Undo is confirmed (the app's confirm, never red), sent once —
// every Undo waits while one is out — and its answer is said on its row; the list, the scan and the app's lists are
// read again after it.
export default function PastMerges({ entityType, version }) {
    const { findMerges, undoMerge, showConfirm } = useApp();
    const [data, setData] = useState(null);       // { merges, more }
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);   // the merge whose Undo is out
    const [said, setSaid] = useState({});         // { [merge id]: what its Undo answered }

    // findMerges is recreated each App render; held in a ref so the load stays stable (the scan views' way).
    const fmRef = useRef(findMerges);
    useEffect(() => { fmRef.current = findMerges; });

    // An answer a later load overtook is dropped (the review, 17 Oct — as the five list loads drop theirs): a merge's
    // reload landing after its Undo's would list the merge as standing, its Undo offered.
    const loadGen = useRef(0);
    const load = useCallback(async () => {
        const gen = ++loadGen.current;
        setError(null);
        try { const d = await fmRef.current(entityType); if (gen === loadGen.current) setData(d); }
        catch (e) { if (gen === loadGen.current) setError(`Past merges did not load — ${e?.message || 'No answer from the server.'}`); }
    }, [entityType]);

    // On open, and again after each merge and each Undo: the scan's key moves with both.
    useEffect(() => { load(); }, [load, version]);

    // Busy while its request is out, released after; its answer said on its row; the list read again. The record is
    // named for the words when the answer could not be read (undoWords).
    const onUndo = (m) => showConfirm(undoConfirmWords(m), async () => {
        setBusyId(m.id);
        const r = await undoMerge(m.id, entityType, m.archivedName);
        setBusyId(null);
        if (r?.words) setSaid((s) => ({ ...s, [m.id]: r.words }));
        load();
    }, false);

    const merges = data?.merges || [];
    return (
        <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8, fontFamily: T.sans }}>Past merges</div>
            {error && (
                <div style={{ background: 'rgba(156,58,46,0.08)', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '10px 14px', color: T.danger, fontSize: 13, fontFamily: T.sans, marginBottom: 10 }}>{error}</div>
            )}
            {data && merges.length === 0 && (
                <div style={{ fontSize: 13, color: T.inkMid, fontFamily: T.sans }}>No merges yet.</div>
            )}
            {merges.map((m) => (
                <PastMergeRow key={m.id} m={m} busy={busyId === m.id} anyBusy={!!busyId} said={said[m.id]} onUndo={onUndo} />
            ))}
            {data?.more && (
                <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>Showing the latest {merges.length} merges.</div>
            )}
        </div>
    );
}

// One merge: what it did, who and when; its Undo, or why it has none.
function PastMergeRow({ m, busy, anyBusy, said, onUndo }) {
    const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');
    const canUndo = m.status === 'merged' && !m.refusal;
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '12px 16px', marginBottom: 8, fontFamily: T.sans }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, wordBreak: 'break-word' }}>“{m.archivedName}” merged into “{m.survivorName}”</div>
                    <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2 }}>{m.by ? `${m.by} · ` : ''}{when(m.createdAt)}</div>
                </div>
                {canUndo && (
                    <button onClick={() => onUndo(m)} disabled={anyBusy}
                        style={{ padding: '6px 14px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: anyBusy ? 'default' : 'pointer', opacity: anyBusy ? 0.6 : 1, fontFamily: T.sans }}>
                        {busy ? 'Undoing…' : 'Undo'}
                    </button>
                )}
                {m.status === 'reversed' && <span style={{ fontSize: 12, color: T.inkMid }}>Undone {when(m.reversedAt)}</span>}
            </div>
            {m.status === 'merged' && m.refusal && <div style={{ fontSize: 12, color: T.inkMid, marginTop: 6 }}>{m.refusal}</div>}
            {said && <div style={{ fontSize: 12, color: T.inkMid, marginTop: 6 }}>{said}</div>}
        </div>
    );
}
