import { useState } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage';

export function useActivities(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel } = deps;

    const [activities, setActivities] = useState([]);
    const [activityModalError, setActivityModalError] = useState(null);
    const [activityModalSaving, setActivityModalSaving] = useState(false);

    const loadActivities = (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        dbFetch('/.netlify/functions/activities')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => { if (data && stillOrg(askedOrg)) setActivities(data.activities || []); })
            .catch(err => console.error('Failed to load activities:', err));
    };

    const handleDeleteActivity = (activityId) => {
        let activity;
        setActivities(prev => { activity = prev.find(a => a.id === activityId); return prev; });
        if (!activity) return;

        showConfirm('Are you sure you want to delete this activity?', () => {
            let snapshot;
            setActivities(prev => {
                snapshot = prev.slice();
                return prev.filter(a => a.id !== activityId);
            });

            dbFetch(`/.netlify/functions/activities?id=${activityId}`, { method: 'DELETE' })
                .then(res => {
                    if (!res.ok) {
                        console.error('Failed to delete activity on server, restoring. Status:', res.status);
                        setActivities(prev => {
                            if (prev.some(a => a.id === activityId)) return prev;
                            return snapshot;
                        });
                    }
                })
                .catch(err => {
                    console.error('Failed to delete activity (network error), restoring:', err);
                    setActivities(prev => {
                        if (prev.some(a => a.id === activityId)) return prev;
                        return snapshot;
                    });
                });

            softDelete(
                `Activity "${activity.type || 'Activity'}"`,
                () => {},
                () => {
                    setActivities(snapshot);
                    setUndoToast(null);
                    // Undo restores the row in the UI immediately, then re-POSTs it.
                    // This used .catch() alone, which never fires on a 403/500 — so a
                    // rejected restore left the activity visible but deleted in the
                    // database, and the divergence only surfaced on the next reload.
                    dbWrite('/.netlify/functions/activities', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(activity),
                    }).then(r => {
                        if (r.ok) return;
                        setActivities(prev => prev.filter(a.id !== activity.id));   // undo did not take
                        setUndoToast({ error: `Could not restore the activity — ${r.error}` });
                    });
                }
            );
        });
    };

    const fireActivityCalendarEvent = async (activity, opportunities) => {
        if (!activity.addToCalendar || !activity.date) return;
        try {
            const relatedOpp = activity.opportunityId
                ? (opportunities || []).find(o => o.id === activity.opportunityId)
                : null;
            const description = [
                activity.notes || '',
                relatedOpp ? 'Opportunity: ' + (relatedOpp.opportunityName || relatedOpp.account) : '',
                activity.companyName ? 'Company: ' + activity.companyName : '',
            ].filter(Boolean).join('\n');
            // dbFetch, for the sign-in token (state §0.169): verifyAuth reads only
            // the Authorization header, and a bare fetch sent none — every call was
            // refused, and no event was ever added. A refusal, and a 200 that says
            // { connected: false } (no Google calendar connected), add nothing:
            // both reach the warning below.
            const res = await dbFetch('/.netlify/functions/calendar-add-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: activity.type
                        + (activity.companyName ? ' — ' + activity.companyName : '')
                        + (relatedOpp ? ' — ' + (relatedOpp.opportunityName || relatedOpp.account) : ''),
                    date: activity.date,
                    description,
                }),
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok || result.connected === false) throw new Error(result.error || result.message || `the server returned ${res.status}`);
        } catch (err) {
            console.warn('Calendar event creation failed (non-blocking):', err);
        }
    };

    const handleSaveActivity = async (
        activityData,
        { editingActivity, currentUser, opportunities,
          setShowActivityModal, setFollowUpPrompt,
          setQuickLogOpen, setQuickLogForm, setQuickLogContactResults }
    ) => {
        setActivityModalError(null);
        setActivityModalSaving(true);

        if (editingActivity) {
            const payload = { ...activityData, id: editingActivity.id };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!res.ok) { setActivityModalError(data.error || 'Failed to save activity. Please try again.'); setActivityModalSaving(false); return; }
                setActivities(prev => prev.map(a => a.id === editingActivity.id ? (data.activity || payload) : a));
                fireActivityCalendarEvent(payload, opportunities);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                console.error('Failed to update activity:', err);
                setActivityModalError('Failed to save activity. Please check your connection and try again.');
            } finally { setActivityModalSaving(false); }
        } else {
            const newId = 'id_' + crypto.randomUUID();
            const newActivity = { ...activityData, id: newId, createdAt: new Date().toISOString(), author: currentUser || '' };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newActivity) });
                const data = await res.json();
                if (!res.ok) { setActivityModalError(data.error || 'Failed to save activity. Please try again.'); setActivityModalSaving(false); return; }
                setActivities(prev => [...prev, data.activity || newActivity]);
                fireActivityCalendarEvent(newActivity, opportunities);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                console.error('Failed to save activity:', err);
                setActivityModalError('Failed to save activity. Please check your connection and try again.');
            } finally { setActivityModalSaving(false); }
        }

        if (activityData.opportunityId) {
            const linkedOpp = (opportunities || []).find(o => o.id === activityData.opportunityId);
            setFollowUpPrompt({
                opportunityId: activityData.opportunityId,
                opportunityName: linkedOpp?.opportunityName || linkedOpp?.account || 'this deal'
            });
        }

        setQuickLogOpen(false);
        setQuickLogForm({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false });
        setQuickLogContactResults([]);
    };

    return {
        activities,
        setActivities,
        activityModalError,
        setActivityModalError,
        activityModalSaving,
        setActivityModalSaving,
        loadActivities,
        handleDeleteActivity,
        handleSaveActivity,
    };
}
