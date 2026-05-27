import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../AppContext';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
    sans:    '"Plus Jakarta Sans", system-ui, sans-serif',
    surface: '#fbf8f3',
    surface2:'#f5efe3',
    surface3:'#f0ece4',
    border:  '#e6ddd0',
    ink:     '#2a2622',
    ink2:    '#5a544c',
    ink3:    '#8a8378',
    gold:    '#c8b99a',
    danger:  '#9c3a2e',
    warn:    '#b87333',
    ok:      '#4d6b3d',
    r:       3,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeading({ label }) {
    return (
        <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, marginTop: 6, borderBottom: `1px solid ${T.border}`, paddingBottom: 5 }}>
            {label}
        </div>
    );
}

function FieldGroup({ label, wide, children }) {
    return (
        <div style={{ gridColumn: wide ? '1 / -1' : undefined, marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

function ReadRow({ label, value, wide }) {
    if (!value && value !== 0) return null;
    return (
        <div style={{ gridColumn: wide ? '1 / -1' : undefined, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.45 }}>{value}</div>
        </div>
    );
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
    return (
        <input
            type={type}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
        />
    );
}

function Typeahead({ value, onChange, suggestions, onSelect, placeholder, dropUp }) {
    const [open, setOpen] = useState(false);
    const filtered = (suggestions || []).filter(s => (s || '').toLowerCase().includes((value || '').toLowerCase()));
    return (
        <div style={{ position: 'relative' }}>
            <TextInput value={value} onChange={v => { onChange(v); setOpen(true); }} placeholder={placeholder} />
            {open && filtered.length > 0 && (
                <div style={{
                    position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', left: 0, right: 0,
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r,
                    marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0,
                    maxHeight: 180, overflowY: 'auto', zIndex: 300,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                    {filtered.slice(0, 8).map((s, i) => (
                        <div key={i}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { onSelect(s); setOpen(false); }}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}` }}
                            onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >{s}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

const STATUS_COLORS = {
    'Open':       { bg: 'rgba(58,90,122,0.1)',  color: '#2a2622' },
    'In-Process': { bg: 'rgba(184,115,51,0.1)', color: '#6b4820' },
    'Completed':  { bg: 'rgba(77,107,61,0.1)',  color: '#2e4a24' },
};

const PRIORITY_COLORS = {
    'High':   { color: T.danger, icon: '🔴' },
    'Medium': { color: T.warn,   icon: '🟡' },
    'Low':    { color: T.ok,     icon: '🟢' },
};

const EMPTY_TASK = {
    title: '', description: '', type: '',
    dueDate: '', dueTime: '',
    priority: 'Medium', status: 'Open',
    assignedTo: '', opportunityId: '', contactId: '', accountId: '',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskRail() {
    const {
        tasks, opportunities, accounts, contacts, activities, settings, currentUser,
        taskRailId, setTaskRailId,
        taskRailMode, setTaskRailMode,
        railStack, setRailStack,
        contactRailId, setContactRailId, contactRailMode, setContactRailMode,
        accountRailId, setAccountRailId, accountRailMode, setAccountRailMode,
        editingTask, setEditingTask,
        handleSaveTask,
        handleDeleteTask,
        handleCompleteTask,
        handleSaveActivity,
        setShowActivityModal, setEditingActivity, setActivityInitialContext,
        setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults,
        taskModalError, setTaskModalError,
        taskModalSaving,
    } = useApp();

    const isNew     = taskRailId === 'new';
    const task      = isNew ? (editingTask || null) : (tasks || []).find(t => t.id === taskRailId) || null;
    const isOpen    = !!taskRailId;
    const isEditing = taskRailMode === 'edit' || taskRailMode === 'new';

    // ── Form state ────────────────────────────────────────────────────────────
    const [formData,     setFormData]     = useState(EMPTY_TASK);
    const [oppSearch,    setOppSearch]    = useState('');
    const [contactSearch,setContactSearch]= useState('');
    const [accountSearch,setAccountSearch]= useState('');
    const [assignSearch, setAssignSearch] = useState('');
    const [dirty,        setDirty]        = useState(false);
    const [saveError,    setSaveError]    = useState(null);
    const [completionPrompt, setCompletionPrompt] = useState(false); // show notes prompt on complete
    const [completionNotes,  setCompletionNotes]  = useState('');
    const [completionType,   setCompletionType]   = useState('');

    // Seed form when rail opens
    useEffect(() => {
        if (!isOpen) return;
        const src = isNew ? { ...EMPTY_TASK, ...(editingTask || {}) } : { ...EMPTY_TASK, ...(task || {}) };
        setFormData(src);
        // Seed typeahead search fields from IDs
        const relOpp     = src.opportunityId ? (opportunities || []).find(o => o.id === src.opportunityId) : null;
        const relContact = src.contactId     ? (contacts || []).find(c => c.id === src.contactId)         : null;
        const relAccount = src.accountId     ? (accounts || []).find(a => a.id === src.accountId)         : null;
        setOppSearch(relOpp     ? (relOpp.opportunityName || relOpp.account) : '');
        setContactSearch(relContact ? ((relContact.firstName || '') + ' ' + (relContact.lastName || '')).trim() : '');
        setAccountSearch(relAccount ? relAccount.name : '');
        setAssignSearch(src.assignedTo || '');
        setDirty(false);
        setSaveError(null);
        setTaskModalError?.(null);
    }, [taskRailId, taskRailMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived lists ─────────────────────────────────────────────────────────
    const taskTypes  = settings?.taskTypes || ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up'];
    const allRepNames = [...new Set((settings?.users || []).filter(u => u.name).map(u => u.name))].sort();
    const oppNames   = (opportunities || []).map(o => o.opportunityName || o.account).filter(Boolean);
    const contactNames = (contacts || []).map(c => ((c.firstName || '') + ' ' + (c.lastName || '')).trim()).filter(Boolean);
    const accountNames = (accounts || []).map(a => a.name).filter(Boolean);

    // Activities related to this task
    const taskActivities = (activities || []).filter(a => {
        if (!task) return false;
        if (a.opportunityId && task.opportunityId && a.opportunityId === task.opportunityId) return true;
        if (a.contactId     && task.contactId     && a.contactId     === task.contactId)     return true;
        return false;
    }).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));

    // Related records
    const relOpp     = task?.opportunityId ? (opportunities || []).find(o => o.id === task.opportunityId) : null;
    const relContact = task?.contactId     ? (contacts || []).find(c => c.id === task.contactId)         : null;
    const relAccount = task?.accountId     ? (accounts || []).find(a => a.id === task.accountId)         : null;

    // ── Handlers ──────────────────────────────────────────────────────────────
    const hc = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    }, []);

    const handleSave = async () => {
        setSaveError(null);
        if (!formData.title?.trim()) { setSaveError('Task title is required.'); return; }

        // Resolve IDs from typeahead search values
        const selOpp     = (opportunities || []).find(o => (o.opportunityName || o.account) === oppSearch);
        const selContact = (contacts     || []).find(c => ((c.firstName || '') + ' ' + (c.lastName || '')).trim() === contactSearch);
        const selAccount = (accounts     || []).find(a => a.name === accountSearch);

        const saveData = {
            ...formData,
            assignedTo:    assignSearch,
            opportunityId: selOpp     ? selOpp.id     : (formData.opportunityId || ''),
            contactId:     selContact ? selContact.id : (formData.contactId     || ''),
            accountId:     selAccount ? selAccount.id : (formData.accountId     || ''),
        };

        const editingTaskForSave = isNew ? (editingTask || null) : task;

        await handleSaveTask(saveData, {
            editingTask: editingTaskForSave,
            setShowTaskModal: (open) => {
                if (!open) {
                    if (isNew) {
                        setTaskRailId(null);
                        setTaskRailMode('view');
                        setEditingTask(null);
                    } else {
                        setTaskRailMode('view');
                        setDirty(false);
                    }
                }
            },
            opportunities,
        });
    };

    const handleDiscard = () => {
        if (isNew) {
            closeRail();
        } else {
            const src = { ...EMPTY_TASK, ...(task || {}) };
            setFormData(src);
            setTaskRailMode('view');
            setDirty(false);
            setSaveError(null);
        }
    };

    const closeRail = () => {
        setTaskRailId(null);
        setTaskRailMode('view');
        setEditingTask(null);
        // If we were stacked, pop back
        if (railStack.length > 0) {
            const prev = railStack[railStack.length - 1];
            setRailStack(s => s.slice(0, -1));
            if (prev.type === 'contact') { setContactRailId(prev.id); setContactRailMode(prev.mode); }
            if (prev.type === 'account') { setAccountRailId(prev.id); setAccountRailMode(prev.mode); }
        }
    };

    const handleComplete = () => {
        if (!task) return;
        // Show inline notes prompt — notes optional
        setCompletionType(task.type || (settings?.taskTypes?.[0]) || 'Call');
        setCompletionNotes('');
        setCompletionPrompt(true);
    };

    const handleConfirmComplete = async () => {
        if (!task) return;
        // 1. Mark task complete
        handleCompleteTask && handleCompleteTask(task.id);
        // 2. Auto-create activity record if notes provided
        if (completionNotes.trim()) {
            const today = new Date();
            const dateStr = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-');
            const activityData = {
                type:          completionType || task.type || 'Call',
                date:          dateStr,
                notes:         completionNotes.trim(),
                opportunityId: task.opportunityId || '',
                contactId:     task.contactId     || '',
                company:       task.accountId ? (accounts||[]).find(a => a.id === task.accountId)?.name || '' : '',
                addToCalendar: false,
            };
            handleSaveActivity && await handleSaveActivity(activityData, {
                editingActivity: null,
                currentUser,
                opportunities,
                setShowActivityModal: () => {},
                setFollowUpPrompt,
                setQuickLogOpen,
                setQuickLogForm,
                setQuickLogContactResults,
            });
        }
        setCompletionPrompt(false);
        setCompletionNotes('');
        closeRail();
    };

    // ESC to close
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape' && !isEditing) closeRail(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const status   = task?.status || (task?.completed ? 'Completed' : 'Open') || 'Open';
    const sc       = STATUS_COLORS[status] || STATUS_COLORS['Open'];
    const priority = task?.priority || 'Medium';
    const pc       = PRIORITY_COLORS[priority] || PRIORITY_COLORS['Medium'];

    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' };

    // ── RENDER ────────────────────────────────────────────────────────────────
    return (
        <>
        {/* Click-catcher — slightly offset right so stacked rails are visible */}
        <div
            onClick={!isEditing ? closeRail : undefined}
            style={{ position: 'fixed', inset: 0, zIndex: 11002, background: 'rgba(42,38,34,0.2)' }}
        />

        {/* Task rail — offset left of contact/account rail so both are visible */}
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
            background: T.surface, borderLeft: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column',
            zIndex: 11003, boxShadow: '-8px 0 32px rgba(42,38,34,0.14)',
            fontFamily: T.sans,
        }}>

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div style={{ background: T.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isNew ? 'New Task' : (task?.title || '—')}
                    </div>
                    {!isNew && !isEditing && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <span style={{ ...sc, padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{status}</span>
                            {task?.type && <span style={{ background: 'rgba(58,90,122,0.2)', color: '#c8d8e8', padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{task.type}</span>}
                        </div>
                    )}
                </div>

                {isEditing && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.gold, background: 'rgba(200,185,154,0.15)', border: `1px solid rgba(200,185,154,0.3)`, borderRadius: 3, padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                        {isNew ? 'New' : 'Editing'}
                    </span>
                )}

                <button onClick={closeRail} style={{ background: 'none', border: 'none', color: 'rgba(245,241,235,0.5)', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* ── Quick-action bar (view mode) ──────────────────────────────── */}
            {!isEditing && task && !task.completed && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: T.surface2, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                    <button onClick={handleComplete}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 6px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, color: T.ok, cursor: 'pointer', fontFamily: T.sans }}>
                        ✓ Complete
                    </button>
                    <button onClick={() => setTaskRailMode('edit')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 6px', background: T.ink, border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 600, color: '#f5f1eb', cursor: 'pointer', fontFamily: T.sans }}>
                        Edit
                    </button>
                </div>
            )}

            {/* ── Completion notes prompt (inline overlay) ─────────────────── */}
            {completionPrompt && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(42,38,34,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ background: T.surface, borderRadius: T.r + 2, padding: 20, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Complete task</div>
                        <div style={{ fontSize: 12, color: T.ink3, marginBottom: 14 }}>Add completion notes? (optional)</div>

                        <div style={{ marginBottom: 10 }}>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Activity Type</label>
                            <select value={completionType} onChange={e => setCompletionType(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                                {(settings?.taskTypes || ['Call','Meeting','Email','Demo','Follow-up']).map(tt => <option key={tt} value={tt}>{tt}</option>)}
                            </select>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notes <span style={{ fontWeight: 400, textTransform: 'none', color: T.ink3 }}>(optional)</span></label>
                            <textarea value={completionNotes} onChange={e => setCompletionNotes(e.target.value)}
                                rows={4} placeholder="What was discussed? Any next steps?"
                                autoFocus
                                style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setCompletionPrompt(false); setCompletionNotes(''); }}
                                style={{ padding: '8px 14px', background: T.surface2, color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                Cancel
                            </button>
                            <button onClick={handleConfirmComplete}
                                style={{ flex: 1, padding: '8px 14px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans }}>
                                ✓ Mark Complete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Scrollable body ────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 18px' }}>

                {/* Error */}
                {(taskModalError || saveError) && (
                    <div style={{ background: '#fef2f2', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{taskModalError || saveError}</span>
                        <button onClick={() => { setTaskModalError?.(null); setSaveError(null); }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                    </div>
                )}

                {isEditing ? (
                    // ── EDIT / NEW mode ───────────────────────────────────────
                    <div>
                        <SectionHeading label="Task Details" />
                        <div style={grid2}>
                            <FieldGroup label="Title *" wide>
                                <TextInput value={formData.title} onChange={v => hc('title', v)} placeholder="e.g. Follow up with client" />
                            </FieldGroup>
                            <FieldGroup label="Type">
                                <select value={formData.type || ''} onChange={e => hc('type', e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: formData.type ? T.ink : T.ink3, fontFamily: T.sans }}>
                                    <option value="">— Select type —</option>
                                    {taskTypes.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                                </select>
                            </FieldGroup>
                            <FieldGroup label="Status">
                                <select value={formData.status || 'Open'} onChange={e => hc('status', e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                                    {['Open','In-Process','Completed'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </FieldGroup>
                            <FieldGroup label="Priority">
                                <select value={formData.priority || 'Medium'} onChange={e => hc('priority', e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                                    {['High','Medium','Low'].map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </FieldGroup>
                            <FieldGroup label="Due Date">
                                <input type="date" value={formData.dueDate || ''} onChange={e => hc('dueDate', e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box' }} />
                            </FieldGroup>
                            <FieldGroup label="Due Time">
                                <input type="time" value={formData.dueTime || ''} onChange={e => hc('dueTime', e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box' }} />
                            </FieldGroup>
                            <FieldGroup label="Assigned To" wide>
                                <Typeahead value={assignSearch} onChange={setAssignSearch} suggestions={allRepNames} onSelect={setAssignSearch} placeholder="Select or type name…" dropUp />
                            </FieldGroup>
                            <FieldGroup label="Description" wide>
                                <textarea value={formData.description || ''} onChange={e => hc('description', e.target.value)} rows={3}
                                    placeholder="Optional notes or context…"
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical' }} />
                            </FieldGroup>
                        </div>

                        <SectionHeading label="Related To" />
                        <div style={grid2}>
                            <FieldGroup label="Opportunity" wide>
                                <Typeahead value={oppSearch} onChange={setOppSearch} suggestions={oppNames} onSelect={setOppSearch} placeholder="Search opportunities…" />
                            </FieldGroup>
                            <FieldGroup label="Contact">
                                <Typeahead value={contactSearch} onChange={setContactSearch} suggestions={contactNames} onSelect={setContactSearch} placeholder="Search contacts…" dropUp />
                            </FieldGroup>
                            <FieldGroup label="Account">
                                <Typeahead value={accountSearch} onChange={setAccountSearch} suggestions={accountNames} onSelect={setAccountSearch} placeholder="Search accounts…" dropUp />
                            </FieldGroup>
                        </div>
                    </div>
                ) : (
                    // ── VIEW mode ─────────────────────────────────────────────
                    <div>
                        <SectionHeading label="Task Details" />
                        <div style={grid2}>
                            {task?.description && (
                                <div style={{ gridColumn: '1 / -1', marginBottom: 10, padding: '8px 10px', background: T.surface2, borderRadius: T.r, fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
                                    {task.description}
                                </div>
                            )}
                            {task?.dueDate && (
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Due</div>
                                    <div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>
                                        {new Date(task.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                        {task.dueTime ? ` · ${task.dueTime}` : ''}
                                    </div>
                                </div>
                            )}
                            <ReadRow label="Priority" value={task?.priority ? `${pc.icon} ${task.priority}` : undefined} />
                            <ReadRow label="Assigned To" value={task?.assignedTo} />
                        </div>

                        {(relOpp || relContact || relAccount) && (
                            <>
                                <SectionHeading label="Related To" />
                                <div style={grid2}>
                                    {relOpp && <ReadRow label="Opportunity" value={relOpp.opportunityName || relOpp.account} wide />}
                                    {relContact && <ReadRow label="Contact" value={`${relContact.firstName || ''} ${relContact.lastName || ''}`.trim()} />}
                                    {relAccount && <ReadRow label="Account" value={relAccount.name} />}
                                </div>
                            </>
                        )}

                        {taskActivities.length > 0 && (
                            <>
                                <SectionHeading label={`Activity History (${taskActivities.length})`} />
                                <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                    {taskActivities.map((a, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderBottom: idx < taskActivities.length - 1 ? `1px solid ${T.border}` : 'none', background: idx % 2 === 0 ? '#fff' : T.surface }}>
                                            <span style={{ fontSize: 11, color: T.ink3, flexShrink: 0, width: 52, paddingTop: 1 }}>
                                                {a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                            </span>
                                            <span style={{ background: 'rgba(58,90,122,0.1)', color: T.ink, padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{a.type || 'Note'}</span>
                                            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: T.ink2 }}>{a.notes || a.subject || 'No details'}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {task?.completed && (
                            <div style={{ marginTop: 14, padding: '8px 12px', background: 'rgba(77,107,61,0.08)', border: `1px solid rgba(77,107,61,0.2)`, borderRadius: T.r, fontSize: 12, color: T.ok, fontWeight: 600 }}>
                                ✓ Completed{task.completedDate ? ` on ${new Date(task.completedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Footer: Save/Discard (edit mode) ─────────────────────────── */}
            {isEditing && (
                <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '12px 16px', background: T.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {dirty && <span style={{ fontSize: 11, color: T.ink3, flex: 1 }}>Unsaved changes</span>}
                    <button onClick={handleDiscard}
                        style={{ padding: '8px 16px', background: T.surface2, color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, marginLeft: 'auto' }}>
                        Discard
                    </button>
                    <button onClick={handleSave} disabled={taskModalSaving}
                        style={{ padding: '8px 20px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 700, cursor: taskModalSaving ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: taskModalSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {taskModalSaving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                        {taskModalSaving ? 'Saving…' : isNew ? 'Create Task' : 'Save Changes'}
                    </button>
                </div>
            )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
