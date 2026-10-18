import { useState } from 'react';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage.js';
import { mergeWords, undoWords, mergedNoticeWords } from '../utils/mergeUndo.js';

// Client side of the duplicate merge. Talks to /duplicates (the scans) and /merge (a merge, its Undo, and the
// org's past merges — state §0.207). Keeps the app's lists in step. storage.js is named with its extension: the
// unit suite imports this file under node (tests/merge-undo.test.mjs), whose resolver needs it.
//
// deps — this render's own: App hands a fresh object each render, after offerUndo is declared.
//   - setAccounts / setContacts : a merge's optimistic update (drop the archived row, swap in the survivor)
//   - loadAccounts / loadContacts / loadOpportunities / loadTasks / loadActivities : the lists read again after a
//                    merge and its Undo; called as loadX(()=>{}) so the no-op setDbOffline never throws
//   - offerUndo / setUndoToast : App's Undo toast — a merge's shape, its notice and its error
//   - currentUser  : display name sent with the merge (merge_log.performed_by; Past merges names the
//                    member by the server's own id first)
// No audit row of its own: merge.mjs writes account.merged / contact.merged, with the Undo's id (Jeff, 17 Oct:
// Q6 "Drop the screen's row" — guide §18b42 rule 5, one send, one row).
export function useMerge(deps) {
    const { setAccounts, setContacts, loadAccounts, loadContacts, loadOpportunities, loadTasks, loadActivities, offerUndo, setUndoToast, currentUser } = deps || {};

    // Shared across account + contact merges — only one merge modal is open at a time.
    const [mergeSaving, setMergeSaving] = useState(false);
    const [mergeError, setMergeError] = useState(null);

    const refreshAccounts = () => {
        try { loadAccounts?.(() => {}); } catch (e) { console.error('Account refresh failed after merge:', e); }
    };
    const refreshContacts = () => {
        try { loadContacts?.(() => {}); } catch (e) { console.error('Contact refresh failed after merge:', e); }
    };
    // An account merge moves the merged-away account's deals to the survivor, by id and by
    // name, and its undo moves them back (state §0.198, D14): the deals are read again after
    // each, or a deal saved from the old list would link the merged-away account again.
    const refreshOpportunities = () => {
        try { loadOpportunities?.(() => {}); } catch (e) { console.error('Deal refresh failed after merge:', e); }
    };
    const refreshTasks = () => {
        try { loadTasks?.(() => {}); } catch (e) { console.error('Task refresh failed after merge:', e); }
    };
    const refreshActivities = () => {
        try { loadActivities?.(() => {}); } catch (e) { console.error('Activity refresh failed after merge:', e); }
    };
    // Every list a merge or its Undo moves is read again after each (state §0.207; OPEN_ITEMS §4.2): an account
    // merge moves tasks', activities' and deals' account, sub-accounts' parent and contacts' company; a contact
    // merge moves tasks', activities' and deals' contact and other contacts' org charts (merge.mjs). A list kept
    // from before sends the old link back with its next whole-row save — and each load drops an answer a later
    // load overtook, so a merge's reload landing after its Undo's never puts the merge back on screen. SPIFF
    // claims (read once per org) and Dispatch's own lists are not read again here (OPEN_ITEMS §4.7).
    const refreshAfter = (entityType) => {
        if (entityType === 'account') refreshAccounts();
        refreshContacts();
        refreshOpportunities();
        refreshTasks();
        refreshActivities();
    };

    const performedBy = () => currentUser?.name || currentUser?.fullName || null;

    // A merge's Undo by its log id (state §0.207): sends { reverse: true, mergeLogId } alone — the server reads the
    // rest from its log, in this org — then reads every list it may have moved again. Answers { ok, words }: the
    // screen's words for what happened (mergeUndo.js undoWords); after an org switch, no words, and nothing read.
    // name: the record merged away as the screen names it — said where a done Undo's answer could not be read (C4).
    const undoMerge = async (mergeLogId, entityType, name) => {
        const askedOrg = requestOrg();   // its answer acts only in the org that asked (state §0.175)
        const r = await dbWrite('/.netlify/functions/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reverse: true, mergeLogId }),
        });
        if (!stillOrg(askedOrg)) return { ok: false, words: null };
        // A refusal moved nothing; a server error or no answer may have landed (guide §18b97 rule 6).
        if (r.ok || r.status === 0 || r.status >= 500) refreshAfter(entityType);
        return { ok: r.ok, words: undoWords(r, name) };
    };

    // The toast after a merge (state §0.207 — Jeff, 17 Oct: Q1, Q5): "Merged X into Y · Undo", offered once the
    // merge has landed in the org that merged — App's offerUndo: five seconds, then Past merges keeps the Undo. One
    // press: the toast goes before the request, or a second press would answer 409. A merge whose answer named no
    // log id has no Undo to send from here: the toast says where it is.
    const offerMergeUndo = (entityType, mergeLogId, merged, into, askedOrg) => {
        if (!mergeLogId) { offerUndo?.({ notice: mergedNoticeWords(merged, into) }); return; }
        offerUndo?.({
            merged, into,
            restore: async () => {
                setUndoToast?.(null);
                const r = await undoMerge(mergeLogId, entityType, merged);
                if (!stillOrg(askedOrg) || !r.words) return;
                if (r.ok) offerUndo?.({ notice: r.words });
                else setUndoToast?.({ error: r.words });
            },
        });
    };

    // ── Accounts ────────────────────────────────────────────────────────────

    // Org-wide scan. tier: 'duplicate' (default) | 'related'
    const findDuplicates = async (tier = 'duplicate') => {
        const res = await dbFetch('/.netlify/functions/duplicates?tier=' + encodeURIComponent(tier));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to scan for duplicates.');
        return data; // { tier, pairs, counts, scanned, truncated }
    };

    // payload: { survivorId, archivedId, survivorName, archivedName, resolvedFields,
    //            survivorUpdatedAt, archivedUpdatedAt }
    const handleMerge = async (payload) => {
        const askedOrg = requestOrg();   // its answer acts only in the org that merged (state §0.175, §0.207)
        setMergeError(null);
        setMergeSaving(true);
        try {
            const r = await dbWrite('/.netlify/functions/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entityType: 'account', performedBy: performedBy(), ...payload }),
            });
            if (!stillOrg(askedOrg)) return null;   // the org changed: nothing set, no Undo offered
            if (!r.ok) {
                setMergeError(mergeWords(r));
                // A server error or no answer may have landed (guide §18b97 rule 6): the lists read again show it
                // merged away — and Past merges, where the words send the user, reads its list again with them.
                if (r.status === 0 || r.status >= 500) refreshAfter('account');
                return null; // modal stays open so the user sees the error
            }
            const data = r.data || {};

            // Optimistic local update — drop the archived row, swap in the updated
            // survivor — then a background resync to pick up re-linked records.
            setAccounts?.(prev => (prev || [])
                .filter(a => a.id !== payload.archivedId)
                .map(a => (data.account && a.id === data.account.id) ? data.account : a));
            refreshAfter('account');
            offerMergeUndo('account', data.mergeLogId, payload.archivedName || payload.archivedId,
                payload.survivorName || data.account?.name || payload.survivorId, askedOrg);

            return data; // { account, archivedId, mergeLogId, rewriteSummary }
        } finally {
            setMergeSaving(false);
        }
    };

    // ── Contacts ──────────────────────────────────────────────────────────────

    const findContactDuplicates = async (tier = 'duplicate') => {
        const res = await dbFetch('/.netlify/functions/duplicates?entityType=contact&tier=' + encodeURIComponent(tier));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to scan for duplicate contacts.');
        return data; // { tier, pairs, counts, scanned, truncated }
    };

    const handleContactMerge = async (payload) => {
        const askedOrg = requestOrg();   // its answer acts only in the org that merged (state §0.175, §0.207)
        setMergeError(null);
        setMergeSaving(true);
        try {
            const r = await dbWrite('/.netlify/functions/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entityType: 'contact', performedBy: performedBy(), ...payload }),
            });
            if (!stillOrg(askedOrg)) return null;   // the org changed: nothing set, no Undo offered
            if (!r.ok) {
                setMergeError(mergeWords(r));
                // A server error or no answer may have landed: the lists, and Past merges with them, read again.
                if (r.status === 0 || r.status >= 500) refreshAfter('contact');
                return null;
            }
            const data = r.data || {};

            setContacts?.(prev => (prev || [])
                .filter(c => c.id !== payload.archivedId)
                .map(c => (data.contact && c.id === data.contact.id) ? data.contact : c));
            refreshAfter('contact');
            offerMergeUndo('contact', data.mergeLogId, payload.archivedName || payload.archivedId,
                payload.survivorName || payload.survivorId, askedOrg);

            return data; // { contact, archivedId, mergeLogId, rewriteSummary }
        } finally {
            setMergeSaving(false);
        }
    };

    // ── Past merges (state §0.207) ─────────────────────────────────────────────
    // This org's merges of one kind, newest first (GET /merge — Admins and Managers). Throws on a refusal, as the
    // scans do, with the server's words; Past merges catches it and says it.
    const findMerges = async (entityType) => {
        const res = await dbFetch('/.netlify/functions/merge?entityType=' + encodeURIComponent(entityType)).catch(() => null);
        if (!res) throw new Error('No answer from the server.');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ? `${data.error}${data.requestId ? ` (ref ${data.requestId})` : ''}` : `The server returned ${res.status}.`);
        // An answer whose list could not be read is no list (the review, 17 Oct): never "No merges yet." over a list
        // Past merges never read.
        if (!Array.isArray(data.merges)) throw new Error('No answer from the server.');
        return data; // { merges, more }
    };

    return {
        mergeSaving, mergeError, setMergeError,
        findDuplicates, handleMerge,
        findContactDuplicates, handleContactMerge,
        findMerges, undoMerge,
    };
}
