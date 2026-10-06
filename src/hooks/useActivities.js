import { useState } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg, stopped } from '../utils/storage';

export function useActivities(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast } = deps;

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

    // Deleting an activity (state §0.177) — a deal's History tab is the screen that
    // calls it. A confirm, then the DELETE, then Undo once the DELETE has landed:
    // the Undo was offered while the DELETE was still out, so one pressed inside that
    // round trip could POST before the DELETE landed; the activity was read through
    // a state updater React may run after the line that tested it; and App handed
    // this hook only showConfirm, so softDelete and setUndoToast were undefined here —
    // the first call would have thrown. Nothing called it: the History tab's delete
    // took the row off the screen and sent nothing, and it was back on reload.
    const handleDeleteActivity = (activityId) => {
        const activity = activities.find(a => a.id === activityId);
        if (!activity) return;
        showConfirm('Delete this activity? You\'ll have a few seconds to undo.', async () => {
            const askedOrg = requestOrg();   // after an org switch its answers change nothing (state §0.175)
            setActivities(prev => prev.filter(a => a.id !== activityId));
            const r = await dbWrite(`/.netlify/functions/activities?id=${activityId}`, { method: 'DELETE' });
            if (!stillOrg(askedOrg)) return;
            if (!r.ok) {
                setActivities(prev => (prev.some(a => a.id === activityId) ? prev : [...prev, activity]));
                setUndoToast({ error: `Activity not deleted — ${r.error}` });
                return;
            }
            softDelete(
                `Activity "${activity.type || 'Activity'}"`,
                () => {},
                async () => {
                    setUndoToast(null);
                    setActivities(prev => (prev.some(a => a.id === activityId) ? prev : [...prev, activity]));
                    // Undo puts the row back on screen and re-POSTs it; a refused restore
                    // takes it off again and says so.
                    const rr = await dbWrite('/.netlify/functions/activities', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(activity),
                    });
                    if (rr.ok || !stillOrg(askedOrg)) return;
                    setActivities(prev => prev.filter(a => a.id !== activity.id));   // undo did not take
                    setUndoToast({ error: `Could not restore the activity — ${rr.error}` });
                }
            );
        });
    };

    // A deal's History tab logs an activity here (state §0.177). It set the list on
    // screen and sent nothing: the activity was gone on reload. The answer is the
    // caller's to show — a failed save keeps its form.
    const handleLogActivity = async (activity) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        const r = await dbWrite('/.netlify/functions/activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(activity),
        });
        if (!stillOrg(askedOrg)) return stopped();   // the deal modal was remounted by the switch
        if (!r.ok) return { ok: false, error: r.error };
        setActivities(prev => [...prev, activity]);
        return { ok: true };
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
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setActivityModalError(null);
        setActivityModalSaving(true);

        if (editingActivity) {
            const payload = { ...activityData, id: editingActivity.id };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) { setActivityModalError(data.error || 'Failed to save activity. Please try again.'); setActivityModalSaving(false); return; }
                setActivities(prev => prev.map(a => a.id === editingActivity.id ? (data.activity || payload) : a));
                fireActivityCalendarEvent(payload, opportunities);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to update activity:', err);
                setActivityModalError('Failed to save activity. Please check your connection and try again.');
                return;   // not saved: no follow-up, and QuickLog keeps its draft (state §0.176)
            } finally { setActivityModalSaving(false); }
        } else {
            const newId = 'id_' + crypto.randomUUID();
            const newActivity = { ...activityData, id: newId, createdAt: new Date().toISOString(), author: currentUser || '' };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newActivity) });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) { setActivityModalError(data.error || 'Failed to save activity. Please try again.'); setActivityModalSaving(false); return; }
                setActivities(prev => [...prev, data.activity || newActivity]);
                fireActivityCalendarEvent(newActivity, opportunities);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to save activity:', err);
                setActivityModalError('Failed to save activity. Please check your connection and try again.');
                return;   // not saved: no follow-up, and QuickLog keeps its draft (state §0.176)
            } finally { setActivityModalSaving(false); }
        }
        if (!stillOrg(askedOrg)) return;

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
        handleLogActivity,
        handleSaveActivity,
    };
}
