import { useState } from 'react';
import { dbFetch, dbWrite } from '../utils/storage';

// Fire-and-forget SMS for task assignments.
async function fireMentionSms(payload) {
    try {
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
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel } = deps;

    const [tasks, setTasks] = useState([]);
    const [taskModalError, setTaskModalError] = useState(null);
    const [taskModalSaving, setTaskModalSaving] = useState(false);
    const [calendarAddingTaskId, setCalendarAddingTaskId] = useState(null);
    const [calendarAddFeedback, setCalendarAddFeedback] = useState({});

    const loadTasks = (setDbOffline) => {
        dbFetch('/.netlify/functions/tasks')
            .then(r => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r.json(); })
            .then(data => setTasks(data.tasks || []))
            .catch(err => console.error('Failed to load tasks:', err));
    };

    const handleDeleteTask = (taskId) => {
        let task;
        setTasks(prev => { task = prev.find(t => t.id === taskId); return prev; });
        if (!task) return;

        showConfirm('Are you sure you want to delete this task?', () => {
            let snapshot;
            setTasks(prev => {
                snapshot = prev.slice();
                return prev.filter(t => t.id !== taskId);
            });

            dbFetch(`/.netlify/functions/tasks?id=${taskId}`, { method: 'DELETE' })
                .then(res => {
                    if (!res.ok) {
                        console.error('Failed to delete task on server, restoring. Status:', res.status);
                        setTasks(prev => {
                            if (prev.some(t => t.id === taskId)) return prev;
                            return snapshot;
                        });
                    }
                })
                .catch(err => {
                    console.error('Failed to delete task (network error), restoring:', err);
                    setTasks(prev => {
                        if (prev.some(t => t.id === taskId)) return prev;
                        return snapshot;
                    });
                });

            addAudit('delete', 'task', taskId, task.title || task.subject || taskId, '');
            softDelete(
                `Task "${task.title || task.subject || 'Untitled'}"`,
                () => {},
                () => {
                    setTasks(snapshot);
                    setUndoToast(null);
                    // Re-insert the deleted task back to the DB
                    // Undo restores the row in the UI immediately, then re-POSTs it.
                    // This used .catch() alone, which never fires on a 403/500 — so a
                    // rejected restore left the task visible but deleted in the
                    // database, and the divergence only surfaced on the next reload.
                    dbWrite('/.netlify/functions/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(task),
                    }).then(r => {
                        if (r.ok) return;
                        setTasks(prev => prev.filter(t.id !== task.id));   // undo did not take
                        setUndoToast({ error: `Could not restore the task — ${r.error}` });
                    });
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
            await fetch('/.netlify/functions/calendar-add-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: task.title, date: task.dueDate, description }),
            });
        } catch (err) {
            console.warn('Calendar event creation failed (non-blocking):', err);
        }
    };

    const handleSaveTask = async (taskData, ctx) => {
        const { editingTask, setShowTaskModal, opportunities } = ctx;
        setTaskModalError(null);
        setTaskModalSaving(true);
        if (editingTask) {
            const payload = { ...taskData, id: editingTask.id };
            try {
                const res = await dbFetch('/.netlify/functions/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!res.ok) { setTaskModalError(data.error || 'Failed to save task. Please try again.'); setTaskModalSaving(false); return; }
                setTasks(prev => prev.map(t => t.id === editingTask.id ? (data.task || payload) : t));
                addAudit('update', 'task', editingTask.id, taskData.title || editingTask.id, taskData.type || '');
                // SMS: task reassigned to a different person
                if (taskData.assignedTo && editingTask.assignedTo !== taskData.assignedTo) {
                    fireMentionSms({ type: 'taskAssigned', assigneeName: taskData.assignedTo, assignedBy: taskData.createdBy || '', taskTitle: taskData.title });
                }
                fireCalendarEvent(payload, opportunities);
                setShowTaskModal(false); setTaskModalError(null);
            } catch (err) {
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
                if (!res.ok) { setTaskModalError(data.error || 'Failed to save task. Please try again.'); setTaskModalSaving(false); return; }
                setTasks(prev => [...prev, data.task || newTask]);
                addAudit('create', 'task', newId, taskData.title || newId, taskData.type || '');
                // SMS: task assigned to someone on creation
                if (taskData.assignedTo) {
                    fireMentionSms({ type: 'taskAssigned', assigneeName: taskData.assignedTo, assignedBy: taskData.createdBy || '', taskTitle: taskData.title });
                }
                fireCalendarEvent(newTask, opportunities);
                setShowTaskModal(false); setTaskModalError(null);
            } catch (err) {
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
            if (!res.ok) throw new Error(data.error || 'Failed to save task');
            setTasks(prev => prev.map(t => t.id === taskId ? (data.task || next) : t));
            addAudit('update', 'task', taskId, next.title || taskId, next.status === 'Completed' ? 'Completed' : 'Reopened');
        } catch (err) {
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
            const res = await fetch('/.netlify/functions/calendar-add-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: task.title, date: task.dueDate, description }),
            });
            if (!res.ok) throw new Error('Failed');
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
