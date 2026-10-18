import { useState, useRef } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg, stopped } from '../utils/storage';
import { sentBody, shownRow } from '../utils/leaveOut.js';

// A quiet save's Activity rail setters (state §0.199's fifth re-check): the task rail's completion notes leave the
// Activity rail's banner and wait alone — they are that rail's own save's, and a notes save that ended first let go
// of its Save while its POST was still out: a second press logged the activity twice.
const QUIET_RAIL = { setActivityModalError: () => {}, setActivityModalSaving: () => {} };

export function useActivities(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast } = deps;

    const [activities, setActivities] = useState([]);
    const [activityModalError, setActivityModalError] = useState(null);
    const [activityModalSaving, setActivityModalSaving] = useState(false);

    // The latest load of the activities: an answer a later load overtook is dropped (state §0.207) — a merge's
    // reload landing after its Undo's put the merge back on screen, and the next whole-row save sent it.
    const loadGen = useRef(0);
    const loadActivities = (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        const gen = ++loadGen.current;
        dbFetch('/.netlify/functions/activities')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => (gen === loadGen.current ? data : null))   // a later load overtook it
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

    // Answers { ok: true } once saved, or the server's refusal — { ok: false, status, error, field } — for a
    // caller that acts on it (the task rail's completion notes, state §0.199); nothing when it left early (the
    // connection failed — the error is shown — or the org changed).
    // `quiet` (the task rail's completion notes) keeps the save off the Activity rail's banner and wait.
    const handleSaveActivity = async (activityData, ctx) => saveActivity(activityData, ctx,
        ctx?.quiet ? QUIET_RAIL : { setActivityModalError, setActivityModalSaving });
    const saveActivity = async (
        activityData,
        { editingActivity, currentUser, opportunities,
          setShowActivityModal, setFollowUpPrompt,
          setQuickLogOpen, setQuickLogForm, setQuickLogContactResults },
        { setActivityModalError, setActivityModalSaving },
    ) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setActivityModalError(null);
        setActivityModalSaving(true);

        if (editingActivity) {
            const payload = { ...activityData, id: editingActivity.id };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sentBody(payload)) });   // the links nobody touched left out (§0.198)
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) { const error = data.error || 'Failed to save activity. Please try again.'; setActivityModalError(error); setActivityModalSaving(false); return { ok: false, status: res.status, error, field: data.field }; }
                setActivities(prev => prev.map(a => a.id === editingActivity.id ? (data.activity || shownRow(payload)) : a));
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
                if (!res.ok) { const error = data.error || 'Failed to save activity. Please try again.'; setActivityModalError(error); setActivityModalSaving(false); return { ok: false, status: res.status, error, field: data.field }; }
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
        return { ok: true };
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
