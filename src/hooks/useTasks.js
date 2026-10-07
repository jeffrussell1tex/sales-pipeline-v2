import { useState } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage';

// Fire-and-forget SMS for task assignments. The task's id only: mention-sms.mjs
// texts its owner and words the text from the saved task (state §0.172).
async function fireMentionSms(payload) {
    try {
        // dbfetch-ignore: an SMS notification must never block or fail the save
        // it accompanies. Deliberate fire-and-forget.
        await dbFetch('/.netlify/functions/mention-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.warn('mention-sms (non-blocking):', err.message);
    }
}

export function useTasks(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast } = deps;

    const [tasks, setTasks] = useState([]);
    const [taskModalError, setTaskModalError] = useState(null);
    const [taskModalSaving, setTaskModalSaving] = useState(false);
    const [calendarAddingTaskId, setCalendarAddingTaskId] = useState(null);
    const [calendarAddFeedback, setCalendarAddFeedback] = useState({});

    const loadTasks = (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        dbFetch('/.netlify/functions/tasks')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => { if (data && stillOrg(askedOrg)) setTasks(data.tasks || []); })
            .catch(err => console.error('Failed to load tasks:', err));
    };

    // Deleting a task (state §0.178; Jeff: "add the delete to thee task rail") — the task
    // rail's Delete calls it. A confirm, then the DELETE, then Undo once the DELETE has
    // landed: a task's create fires nothing (tasks.mjs), so the Undo re-POSTs it. It had
    // no caller — no screen deleted a task — and it read the task through a state updater
    // and offered Undo while its DELETE was still out. opts.onConfirm runs when the user
    // confirms. No audit line here: tasks.mjs writes task.deleted, with the row, once the
    // row is gone — the line this had ran before the answer, so a refused delete was
    // logged as one and a deleted one was logged twice.
    const handleDeleteTask = (taskId, opts = {}) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        const title = task.title || task.subject || 'Untitled';
        showConfirm(`Delete the task "${title}"? You'll have a few seconds to undo.`, async () => {
            opts.onConfirm?.();
            const askedOrg = requestOrg();   // after an org switch its answers change nothing (state §0.175)
            setTasks(prev => prev.filter(t => t.id !== taskId));
            const r = await dbWrite(`/.netlify/functions/tasks?id=${taskId}`, { method: 'DELETE' });
            if (!stillOrg(askedOrg)) return;
            if (!r.ok) {
                setTasks(prev => (prev.some(t => t.id === taskId) ? prev : [...prev, task]));
                setUndoToast({ error: `Task not deleted — ${r.error}` });
                return;
            }
            softDelete(
                `Task "${title}"`,
                () => {},
                async () => {
                    setUndoToast(null);
                    setTasks(prev => (prev.some(t => t.id === taskId) ? prev : [...prev, task]));
                    // Undo puts the row back on screen and re-POSTs it; a refused restore
                    // takes it off again and says so.
                    const rr = await dbWrite('/.netlify/functions/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(task),
                    });
                    if (rr.ok || !stillOrg(askedOrg)) return;
                    setTasks(prev => prev.filter(t => t.id !== task.id));   // undo did not take
                    setUndoToast({ error: `Could not restore the task — ${rr.error}` });
                }
            );
        });
    };

    const fireCalendarEvent = async (task, opportunities) => {
        if (!task.addToCalendar || !task.dueDate) return;
        try {
            const relatedOpp = task.opportunityId
                ? (opportunities || []).find(o => o.id === task.opportunityId)
                : null;
            const description = [
                task.description || task.notes || '',
                relatedOpp ? 'Opportunity: ' + (relatedOpp.opportunityName || relatedOpp.account) : '',
                task.type ? 'Type: ' + task.type : '',
            ].filter(Boolean).join('\n');
            // dbFetch, for the sign-in token (state §0.169): verifyAuth reads only
            // the Authorization header, and a bare fetch sent none — every call was
            // refused, and no event was ever added. A refusal, and a 200 that says
            // { connected: false } (no Google calendar connected), add nothing:
            // both reach the warning below.
            const res = await dbFetch('/.netlify/functions/calendar-add-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: task.title, date: task.dueDate, description }),
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok || result.connected === false) throw new Error(result.error || result.message || `the server returned ${res.status}`);
        } catch (err) {
            console.warn('Calendar event creation failed (non-blocking):', err);
        }
    };

    const handleSaveTask = async (taskData, ctx) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        const { editingTask, setShowTaskModal, opportunities } = ctx;
        setTaskModalError(null);
        setTaskModalSaving(true);
        if (editingTask) {
            const payload = { ...taskData, id: editingTask.id };
            try {
                const res = await dbFetch('/.netlify/functions/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) { setTaskModalError(data.error || 'Failed to save task. Please try again.'); setTaskModalSaving(false); return; }
                setTasks(prev => prev.map(t => t.id === editingTask.id ? (data.task || payload) : t));
                addAudit('update', 'task', editingTask.id, taskData.title || editingTask.id, taskData.type || '');
                // SMS: task reassigned to a different person
                if (taskData.assignedTo && editingTask.assignedTo !== taskData.assignedTo) {
                    fireMentionSms({ type: 'taskAssigned', recordId: editingTask.id });
                }
                fireCalendarEvent(payload, opportunities);
                setShowTaskModal(false); setTaskModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to update task:', err);
                setTaskModalError('Failed to save task. Please check your connection and try again.');
            } finally { setTaskModalSaving(false); }
        } else {
            // Honor a client-provided id (TaskRail pre-generates one so documents can be
            // attached to a brand-new task before it is saved). Falls back to a fresh id.
            const newId = taskData.id || ('id_' + crypto.randomUUID());
            const newTask = { ...taskData, id: newId };
            try {
                const res = await dbFetch('/.netlify/functions/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTask) });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) { setTaskModalError(data.error || 'Failed to save task. Please try again.'); setTaskModalSaving(false); return; }
                setTasks(prev => [...prev, data.task || newTask]);
                addAudit('create', 'task', newId, taskData.title || newId, taskData.type || '');
                // SMS: task assigned to someone on creation
                if (taskData.assignedTo) {
                    fireMentionSms({ type: 'taskAssigned', recordId: newId });
                }
                fireCalendarEvent(newTask, opportunities);
                setShowTaskModal(false); setTaskModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to save task:', err);
                setTaskModalError('Failed to save task. Please check your connection and try again.');
            } finally { setTaskModalSaving(false); }
        }
    };

    const handleCompleteTask = async (taskId, newStatus) => {
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        // Compute the next task shape from the current row (needed for both the
        // optimistic update and the DB payload).
        const current = tasks.find(t => t.id === taskId);
        if (!current) return;
        let next;
        if (newStatus !== undefined) {
            next = { ...current, status: newStatus, completed: newStatus === 'Completed', completedDate: newStatus === 'Completed' ? today : current.completedDate };
        } else {
            const wasCompleted = current.completed || current.status === 'Completed';
            next = { ...current, completed: !wasCompleted, status: wasCompleted ? 'Open' : 'Completed', completedDate: wasCompleted ? current.completedDate : today };
        }

        // Optimistic local update for instant UI feedback.
        setTasks(prev => prev.map(t => t.id === taskId ? next : t));
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)

        // Persist immediately — without this the completion is local-only and
        // reverts on refresh (violates the no-local-only-state rule). On failure,
        // roll the row back so local state cannot drift from the DB.
        try {
            const res = await dbFetch('/.netlify/functions/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
            });
            const data = await res.json();
            if (!stillOrg(askedOrg)) return;
            if (!res.ok) throw new Error(data.error || 'Failed to save task');
            setTasks(prev => prev.map(t => t.id === taskId ? (data.task || next) : t));
            addAudit('update', 'task', taskId, next.title || taskId, next.status === 'Completed' ? 'Completed' : 'Reopened');
        } catch (err) {
            if (!stillOrg(askedOrg)) return;
            console.error('Failed to persist task completion:', err);
            setTasks(prev => prev.map(t => t.id === taskId ? current : t));
        }
    };

    const handleAddTaskToCalendar = async (e, task, opportunities) => {
        e.stopPropagation();
        if (!task.dueDate) return;
        setCalendarAddingTaskId(task.id);
        try {
            const relatedOpp = task.opportunityId
                ? (opportunities || []).find(o => o.id === task.opportunityId)
                : null;
            const description = [
                task.notes || '',
                relatedOpp ? 'Opportunity: ' + (relatedOpp.opportunityName || relatedOpp.account) : '',
                task.type ? 'Type: ' + task.type : '',
            ].filter(Boolean).join('\n');
            // dbFetch, for the sign-in token (state §0.169), as above. A 200 that
            // says { connected: false } added nothing — no Google calendar is
            // connected — so it is not a success.
            const res = await dbFetch('/.netlify/functions/calendar-add-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: task.title, date: task.dueDate, description }),
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok || result.connected === false) throw new Error('Failed');
            setCalendarAddFeedback(prev => ({ ...prev, [task.id]: 'success' }));
        } catch {
            setCalendarAddFeedback(prev => ({ ...prev, [task.id]: 'error' }));
        } finally {
            setCalendarAddingTaskId(null);
            setTimeout(() => setCalendarAddFeedback(prev => {
                const n = { ...prev }; delete n[task.id]; return n;
            }), 3000);
        }
    };

    return {
        tasks,
        setTasks,
        taskModalError,
        setTaskModalError,
        taskModalSaving,
        setTaskModalSaving,
        calendarAddingTaskId,
        calendarAddFeedback,
        loadTasks,
        handleDeleteTask,
        handleSaveTask,
        handleCompleteTask,
        handleAddTaskToCalendar,
    };
}
