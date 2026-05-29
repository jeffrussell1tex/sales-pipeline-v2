import { useState } from 'react';
import { dbFetch } from '../utils/storage';

// Client side of the duplicate-merge feature. Talks to /duplicates (scan) and
// /merge (commit + reverse). Keeps the accounts list in sync after a merge.
//
// deps: { setAccounts, loadAccounts, addAudit, currentUser }
//   - setAccounts  : optimistic local update (drop archived, replace survivor)
//   - loadAccounts : full resync; called as loadAccounts(()=>{}) so the
//                    no-op setDbOffline never throws on a non-ok response
//   - addAudit     : audit trail
//   - currentUser  : display name recorded on the merge log
export function useMerge(deps) {
    const { setAccounts, loadAccounts, addAudit, currentUser } = deps || {};

    const [mergeSaving, setMergeSaving] = useState(false);
    const [mergeError, setMergeError] = useState(null);

    const refreshAccounts = () => {
        try { loadAccounts?.(() => {}); } catch (e) { console.error('Account refresh failed after merge:', e); }
    };

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
        setMergeError(null);
        setMergeSaving(true);
        try {
            const res = await dbFetch('/.netlify/functions/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entityType: 'account',
                    performedBy: currentUser?.name || currentUser?.fullName || null,
                    ...payload,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setMergeError(data.error || 'Merge failed. Please try again.');
                return null; // modal stays open so the user sees the error
            }

            // Optimistic local update — drop the archived row, swap in the updated
            // survivor — then a background resync to pick up re-linked records.
            setAccounts?.(prev => (prev || [])
                .filter(a => a.id !== payload.archivedId)
                .map(a => (data.account && a.id === data.account.id) ? data.account : a));
            refreshAccounts();

            addAudit?.(
                'merge', 'account', payload.survivorId,
                payload.survivorName || data.account?.name || payload.survivorId,
                `Merged "${payload.archivedName || payload.archivedId}" in`
            );

            return data; // { account, archivedId, mergeLogId, rewriteSummary }
        } catch (err) {
            console.error('Merge failed:', err);
            setMergeError('Merge failed. Please check your connection and try again.');
            return null;
        } finally {
            setMergeSaving(false);
        }
    };

    // Reverses a merge by its log id (the 30-day undo path).
    const reverseMerge = async (mergeLogId) => {
        try {
            const res = await dbFetch('/.netlify/functions/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reverse: true, mergeLogId }),
            });
            const data = await res.json();
            if (!res.ok) { console.error('Reverse merge failed:', data.error); return false; }
            refreshAccounts();
            return true;
        } catch (err) {
            console.error('Reverse merge failed:', err);
            return false;
        }
    };

    return { mergeSaving, mergeError, setMergeError, findDuplicates, handleMerge, reverseMerge };
}
