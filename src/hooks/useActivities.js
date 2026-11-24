import { useState, useRef } from 'react';
import { readList } from '../utils/listLoads.js';
import { dbFetch, dbWrite, requestOrg, stillOrg, stopped } from '../utils/storage';
import { sentBody, shownRow } from '../utils/leaveOut.js';
import { refusalWords, failureWords, heardRefusal, landedBefore, maybeSaid } from '../utils/refusalWords.js';
import { isRestoring, undoWhileOut, stillRestoringWords } from '../utils/restoring.js';

// A quiet save's Activity rail setters (state §0.199's fifth re-check): the task rail's completion notes leave the
// Activity rail's banner and wait alone — they are that rail's own save's, and a notes save that ended first let go
// of its Save while its POST was still out: a second press logged the activity twice.
const QUIET_RAIL = { setActivityModalError: () => {}, setActivityModalSaving: () => {} };

export function useActivities(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast } = deps;
    // A write's answer names the deal scores it moved (AI scoring batch 2A): the deals on screen take them.
    const adoptScores = (data) => { if (data?.dealScores && typeof deps.adoptDealScores === 'function') deps.adoptDealScores(data.dealScores); };

    const [activities, setActivities] = useState([]);
    const [activityModalError, setActivityModalError] = useState(null);
    const [activityModalSaving, setActivityModalSaving] = useState(false);

    // The latest load of the activities: an answer a later load overtook is dropped (state §0.207) — a merge's
    // reload landing after its Undo's put the merge back on screen, and the next whole-row save sent it.
    const loadGen = useRef(0);
    const loadActivities = () => readList('activities', {
        read: () => dbFetch('/.netlify/functions/activities'),
        take: setActivities, gen: loadGen, report: deps.reportLoad,   // whether it was read (state §0.294)
    });

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
            // Its own Undo still re-POSTing it: not deleted under it (state §0.273) — said, and nothing sent.
            if (isRestoring('activity', activityId)) { setUndoToast({ error: stillRestoringWords([activity.type || 'Activity']) }); return; }
            const askedOrg = requestOrg();   // after an org switch its answers change nothing (state §0.175)
            setActivities(prev => prev.filter(a => a.id !== activityId));
            const r = await dbWrite(`/.netlify/functions/activities?id=${encodeURIComponent(activityId)}`, { method: 'DELETE' });
            if (!stillOrg(askedOrg)) return;
            // One whose answer proves nothing may be gone (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe): kept off, said as maybe — no Undo offered.
            if (!r.ok && r.unknown) { setUndoToast({ error: maybeSaid('The activity', 'deleted', r.error) }); return; }
            // Gone already in this org (404 'gone' — another tab's or member's delete came first, state §0.273): done, nothing said,
            // no Undo — it wrote nothing, and a re-POST would bring back what someone else deleted.
            if (!r.ok && r.landed) return;
            if (!r.ok) {
                setActivities(prev => (prev.some(a => a.id === activityId) ? prev : [...prev, activity]));
                setUndoToast({ error: `Activity not deleted — ${r.error}` });
                return;
            }
            adoptScores(r.data);
            softDelete(
                `Activity "${activity.type || 'Activity'}"`,
                () => {},
                undoWhileOut('activity', [activityId], async () => {   // marked out until it ends (§0.273)
                    setUndoToast(null);
                    setActivities(prev => (prev.some(a => a.id === activityId) ? prev : [...prev, activity]));
                    // Undo puts the row back on screen and re-POSTs it; a refused restore
                    // takes it off again and says so.
                    const rr = await dbWrite('/.netlify/functions/activities', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(activity),
                    });
                    if (rr.ok && stillOrg(askedOrg)) adoptScores(rr.data);
                    // Already stored (a 409 'idInUse': the delete never took, or a press before landed) is back (§0.261).
                    if (rr.ok || rr.landed || !stillOrg(askedOrg)) return;
                    if (rr.unknown) { setUndoToast({ error: maybeSaid('The activity', 'restored', rr.error) }); return; }   // kept (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe)
                    setActivities(prev => prev.filter(a => a.id !== activity.id));   // undo did not take
                    setUndoToast({ error: `Could not restore the activity — ${rr.error}` });
                })
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
        // Its id is the form's (Part 6): a second press after an answer that proved nothing is the same activity — answered
        // already stored, it landed with the first: the list read again. One that proves nothing may have saved (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe).
        if (!r.ok && r.landed) { loadActivities(); return { ok: true }; }
        if (!r.ok) return { ok: false, error: r.unknown ? maybeSaid('The activity', 'saved', r.error) : r.error, unknown: r.unknown };
        setActivities(prev => [...prev, activity]);
        adoptScores(r.data);
        return { ok: true };
    };

    // No calendar event at a save (state §0.246, docs/design/refusal-sweep 7c; Jeff's Q16): fireActivityCalendarEvent
    // added one only for an `addToCalendar` no screen sent (Quick Log's box never sent it, and logs by its own write),
    // and a failure went to the console alone. It is gone with the box; a real calendar event is §3.6's meetings.

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
                // The ok check first, the house words (state §0.248, docs/design/refusal-sweep Part 10; Jeff's Q3); the
                // refusal's body read once, for its words and the field a link refused names (saveDroppingRefused).
                // Only a 4xx in the server's words wrote nothing; any other refused answer may have saved (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe).
                if (!res.ok) { const body = await res.json().catch(() => null); if (!stillOrg(askedOrg)) return; const heard = heardRefusal(res.status, body); const error = heard ? refusalWords(res, body) : maybeSaid('The activity', 'saved', refusalWords(res, body)); setActivityModalError(error); setActivityModalSaving(false); return { ok: false, status: res.status, error, field: body?.field, unknown: !heard }; }
                const data = await res.json().catch(() => ({}));   // a landed answer that cannot be read: saved, the copy sent shown
                if (!stillOrg(askedOrg)) return;
                setActivities(prev => prev.map(a => a.id === editingActivity.id ? (data.activity || shownRow(payload)) : a));
                adoptScores(data);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to update activity:', err);
                const error = maybeSaid('The activity', 'saved', failureWords(err));   // a throw proves nothing (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe)
                setActivityModalError(error);
                return { ok: false, error, unknown: true };   // not known: no follow-up, and QuickLog keeps its draft (state §0.176)
            } finally { setActivityModalSaving(false); }
        } else {
            // The id its form gave it (state §0.261, Part 6): a second press after an answer that proved nothing is the same
            // activity, answered already stored if the first landed. A caller that gives none gets one per press.
            const newId = activityData.id || ('id_' + crypto.randomUUID());
            const newActivity = { ...activityData, id: newId, createdAt: new Date().toISOString(), author: currentUser || '' };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newActivity) });
                // As the edit's (§0.248, §0.261); a second press answered already stored landed with the first: the list read again.
                let data;
                if (!res.ok) {
                    const body = await res.json().catch(() => null); if (!stillOrg(askedOrg)) return;
                    if (landedBefore(res.status, body)) { loadActivities(); data = null; }
                    else { const heard = heardRefusal(res.status, body); const error = heard ? refusalWords(res, body) : maybeSaid('The activity', 'saved', refusalWords(res, body)); setActivityModalError(error); setActivityModalSaving(false); return { ok: false, status: res.status, error, field: body?.field, unknown: !heard }; }
                } else data = await res.json().catch(() => ({}));
                if (!stillOrg(askedOrg)) return;
                if (data) setActivities(prev => [...prev, data.activity || newActivity]);
                adoptScores(data);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to save activity:', err);
                const error = maybeSaid('The activity', 'saved', failureWords(err));   // a throw proves nothing (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe)
                setActivityModalError(error);
                return { ok: false, error, unknown: true };   // not known: no follow-up, and QuickLog keeps its draft (state §0.176)
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
        setQuickLogForm({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '' });
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
