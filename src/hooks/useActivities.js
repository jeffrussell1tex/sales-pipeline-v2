import { useState } from 'react';
import { dbFetch } from '../utils/storage';

export function useActivities(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel } = deps;

    const [activities, setActivities] = useState([]);
    const [activityModalError, setActivityModalError] = useState(null);
    const [activityModalSaving,
        setActivityModalSaving] = useState(false);

    const loadActivities = (setDbOffline) => {
        dbFetch('/.netlify/functions/activities')
            .then(r => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r.json(); })
            .then(data => setActivities(data.activities || []))
            .catch(err => console.error('Failed to load activities:', err));
    };

    const handleDeleteActivity = (activityId) => {
        showConfirm('Are you sure you want to delete this activity?', () => {
            setActivities(activities.filter(a => a.id !== activityId));
            dbFetch(`/.netlify/functions/activities?id=${activityId}`, { method: 'DELETE' })
                .catch(err => console.error('Failed to delete activity:', err));
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
            await fetch('/.netlify/functions/calendar-add-event', {
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
        console.log('[useActivities] saving activityData.date:', activityData.date);

        if (editingActivity) {
            const payload = { ...activityData, id: editingActivity.id };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!res.ok) { setActivityModalError(data.error || 'Failed to save activity. Please try again.'); setActivityModalSaving(false); return; }
                setActivities(activities.map(a => a.id === editingActivity.id ? (data.activity || payload) : a));
                fireActivityCalendarEvent(payload, opportunities);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                console.error('Failed to update activity:', err);
                setActivityModalError('Failed to save activity. Please check your connection and try again.');
            } finally { setActivityModalSaving(false); }
        } else {
            const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            const newActivity = { ...activityData, id: newId, createdAt: new Date().toISOString(), author: currentUser || '' };
            try {
                const res = await dbFetch('/.netlify/functions/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newActivity) });
                const data = await res.json();
                if (!res.ok) { setActivityModalError(data.error || 'Failed to save activity. Please try again.'); setActivityModalSaving(false); return; }
                setActivities([...activities, data.activity || newActivity]);
                fireActivityCalendarEvent(newActivity, opportunities);
                setShowActivityModal(false); setActivityModalError(null);
            } catch (err) {
                console.error('Failed to save activity:', err);
                setActivityModalError('Failed to save activity. Please check your connection and try again.');
            } finally { setActivityModalSaving(false); }
        }

        // Show follow-up task prompt if linked to an opportunity
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
