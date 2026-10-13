import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../AppContext';
import ActivityRowText from './ActivityRowText';
import AttachmentsStrip from '../documents/AttachmentsStrip';
import TimeDropdown from '../ui/TimeDropdown';
import { T } from '../../tokens.js';
import { matchSearch } from '../../utils/searchMatch.js';
import { canEditCrm } from '../../utils/roles.js';
import AccountPicker from './AccountPicker';
import HiddenLink from './HiddenLink';
import { dealText, dealSubline, isMergeArchived, HIDDEN_ACCOUNT, HIDDEN_DEAL } from '../../utils/pickLink.js';
import { outOfList } from '../../utils/railLinks.js';
import { NO_TASK_SEED, taskSeed, taskLinks, contactChip, chipLabel } from '../../utils/taskLinks.js';
import { leaveOut } from '../../utils/leaveOut.js';

// ── Design tokens ─────────────────────────────────────────────────────────────

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
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

function ReadRow({ label, value, wide }) {
    if (!value && value !== 0) return null;
    return (
        <div style={{ gridColumn: wide ? '1 / -1' : undefined, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.45 }}>{value}</div>
        </div>
    );
}

function TextInput({ value, onChange, placeholder, type = 'text', onFocus, onBlur, inputRef }) {
    return (
        <input
            ref={inputRef}
            type={type}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
        />
    );
}

// A type-ahead over names (Assigned To) or over records (Opportunity's deals): textOf(row) is
// what a row is called and what the search reads, lineOf(row) its grey line, and a pick hands
// back the row itself, so the record picked is the record saved (state §0.198, D9).
function Typeahead({ value, onChange, suggestions, onSelect, placeholder, dropUp, textOf = (s) => s, lineOf = null }) {
    const [open, setOpen] = useState(false);
    const { shown, more } = open ? matchSearch(suggestions, value, { text: textOf }) : { shown: [], more: 0 };   // ranked while the list is open, the cut announced (state §0.194)
    return (
        <div style={{ position: 'relative' }}>
            <TextInput
                value={value}
                onChange={v => { onChange(v); setOpen(true); }}
                placeholder={placeholder}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
            />
            {open && shown.length > 0 && (
                <div style={{
                    position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', left: 0, right: 0,
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r,
                    marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0,
                    maxHeight: 180, overflowY: 'auto', zIndex: 300,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                    {shown.map((s, i) => (
                        <div key={s?.id || i}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { onSelect(s); setOpen(false); }}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}` }}
                            onMouseEnter={e => e.currentTarget.style.background = T.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >{textOf(s)}{lineOf && lineOf(s) ? <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{lineOf(s)}</div> : null}</div>
                    ))}
                    {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: 'inherit', padding: '6px 10px', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{more} more — keep typing</div>}
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
        setShowActivityModal, setEditingActivity, setActivityInitialContext, setViewingActivity,
        setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults,
        taskModalError, setTaskModalError,
        taskModalSaving,
        userRole,
        escapeBlocked,
    } = useApp();

    const isNew     = taskRailId === 'new';
    const task      = isNew ? (editingTask || null) : (tasks || []).find(t => t.id === taskRailId) || null;
    const isOpen    = !!taskRailId;
    const isEditing = taskRailMode === 'edit' || taskRailMode === 'new';

    // ── Form state ────────────────────────────────────────────────────────────
    const [formData,      setFormData]      = useState(EMPTY_TASK);
    const [oppSearch,     setOppSearch]     = useState('');
    const [contactSearch, setContactSearch] = useState('');
    const [showContactSugg, setShowContactSugg] = useState(false);
    const [selectedContacts, setSelectedContacts] = useState([]);
    const contactInputRef = useRef(null);
    const [accountSearch, setAccountSearch] = useState('');
    // The id each link field holds — the row picked, or the link it opened with — and the
    // links it opened with, taken once when the rail opens (state §0.198).
    const [accountHeldId, setAccountHeldId] = useState('');
    const [oppHeldId,     setOppHeldId]     = useState('');
    const seedRef = useRef(NO_TASK_SEED);
    const [assignSearch,  setAssignSearch]  = useState('');
    const [dirty,         setDirty]         = useState(false);
    const [saveError,     setSaveError]     = useState(null);
    // A refused Save says why in the banner at the top of the body, out of sight once the rail
    // is scrolled down to Account, the last field: each refusal, and the server's, scrolls it
    // into view — the same words twice too (refusals counts them; state §0.198).
    const errorRef = useRef(null);
    const [refusals, setRefusals] = useState(0);
    const refuse = (why) => { setSaveError(why); setRefusals(n => n + 1); };
    const [newTaskId,     setNewTaskId]     = useState(null);
    const [completionPrompt, setCompletionPrompt] = useState(false); // show notes prompt on complete
    const [completionNotes,  setCompletionNotes]  = useState('');
    const [completionType,   setCompletionType]   = useState('');

    // Seed form when rail opens
    useEffect(() => {
        if (!isOpen) return;
        const src = isNew ? { ...EMPTY_TASK, ...(editingTask || {}) } : { ...EMPTY_TASK, ...(task || {}) };
        setFormData(src);
        // The links the rail opens with, taken once (state §0.198): a saved task's stored ids,
        // or a new task's prefilled ones — an account's own rail (D10), a contact's (D19), a
        // deal. A field left as it opened keeps its link exactly, even one the user can't open
        // (D16: the field says so). The contacts: task.contacts[], else a task's one legacy
        // contactId as its Primary chip. utils/taskLinks.js taskSeed.
        const opened = taskSeed(src, { editing: !isNew, accounts, opportunities, contacts });
        seedRef.current = opened.seed;
        setOppSearch(opened.deal.text);
        setOppHeldId(opened.deal.id);
        setContactSearch('');
        setShowContactSugg(false);
        setSelectedContacts(opened.chips);
        setAccountSearch(opened.account.text);
        setAccountHeldId(opened.account.id);
        setAssignSearch(src.assignedTo || '');
        setDirty(false);
        setSaveError(null);
        setTaskModalError?.(null);
        // Pre-generate the id for a brand-new task so documents can be linked to it in
        // the create form before save (handleSaveTask honors this id). Regenerated per open.
        setNewTaskId(isNew ? ('id_' + crypto.randomUUID()) : null);
    }, [taskRailId, taskRailMode]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (refusals || taskModalError) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
    }, [refusals, taskModalError]);

    // ── Derived lists ─────────────────────────────────────────────────────────
    const taskTypes  = settings?.taskTypes || ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up'];
    const allRepNames = [...new Set((settings?.users || []).filter(u => u.name).map(u => u.name))].sort();
    const dealOptions = (opportunities || []).filter(o => !!dealText(o));   // each deal its own row, told apart by "<account> · <stage>" (D9)

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
    // A link the caller's list does not hold — another rep's record, or one since deleted: the
    // view says so (state §0.198, D16: "Say so, allow removing"); Edit offers its ×.
    const dealHidden    = outOfList(task?.opportunityId, opportunities);
    const accountHidden = outOfList(task?.accountId, accounts);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const hc = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    }, []);

    const handleSave = async () => {
        setSaveError(null);
        setTaskModalError?.(null); // the last save's server error never hides this Save's own refusal (§0.198)
        if (!formData.title?.trim()) { refuse('Task title is required.'); return; }

        // A pick is saved as the record picked (state §0.198). Each link field saves what it
        // shows: the link it opened with when nobody touched it — exactly, even one the user
        // can't open; the record it holds while its text still reads as it; nothing when it is
        // empty; a name typed in full only when one record has it — two refuse, none refuse
        // (the Account offers no Create, D6). The contact follows the chips: every one removed
        // is no contact. utils/taskLinks.js taskLinks, over resolveLink. An edit's Save leaves out
        // each link nobody touched — Account, Opportunity, the chips — so the task's links stand as
        // stored: a chip with no name was stored for a contact the list does not hold, and a
        // merge's moved links went back (the pre-ship round; utils/leaveOut.js).
        const links = taskLinks({
            account: { text: accountSearch, id: accountHeldId },
            deal:    { text: oppSearch,     id: oppHeldId },
            seed: seedRef.current, contactText: contactSearch, chips: selectedContacts,
            accounts, opportunities, contacts,
        });
        if (links.error) { refuse(links.error); return; }

        const saveData = leaveOut({
            ...formData,
            id:            isNew ? newTaskId : formData.id,
            assignedTo:    assignSearch,
            opportunityId: links.opportunityId,
            contacts:      links.contacts,
            contactId:     links.contactId,
            accountId:     links.accountId,
        }, isNew ? [] : [
            ...(links.untouched.account ? ['accountId'] : []),
            ...(links.untouched.deal ? ['opportunityId'] : []),
            ...(links.untouched.contacts ? ['contacts', 'contactId'] : []),
        ]);

        const editingTaskForSave = isNew ? null : task;

        await handleSaveTask(saveData, {
            editingTask: editingTaskForSave,
            setShowTaskModal: (open) => {
                if (!open) {
                    if (isNew) {
                        // Land on the just-created task (view mode) so its documents and
                        // record stay available right after creating it.
                        setTaskRailId(newTaskId);
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
        // 1. Mark task complete — MUST await: this persists to the DB, and
        // closeRail() below unmounts the rail and triggers a task reload. Not
        // awaiting races the PUT against the reload, so the completion is lost.
        if (handleCompleteTask) await handleCompleteTask(task.id);
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
                accountId:     task.accountId     || '',   // by id: activities keep no company name (activities.mjs sanitize), so the name sent here was dropped and the activity logged no account
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

    // ESC to close — the rail's Escape while no layer above it is open (state §0.189): the
    // one order (escapeBlocked), not a list of its own — the activity viewer and the app's
    // confirm and prompt were on it (§0.93, §0.178; the task's Delete asks over this rail),
    // the coaching note was not. It marks the Escape it takes, so nothing under the rail acts
    // on it too. Editing, the rail keeps its draft, as its backdrop does — App's own list
    // named this rail too, and once its handler had re-bound with the rail open (another of
    // App's layers opened or closed), its Escape closed the rail editing or not: a task being
    // written was lost (seen in §0.189's pane check).
    // An Escape a layer above took — marked, as a document's is (§0.180) — is left alone.
    const escapeHeld = escapeBlocked('taskRail');
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented || escapeHeld) return;
            e.preventDefault();
            if (!isEditing) closeRail();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, isEditing, escapeHeld]); // eslint-disable-line react-hooks/exhaustive-deps

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
                        <div style={{ fontSize: 12, color: T.inkMuted, marginBottom: 14 }}>Add completion notes? (optional)</div>

                        <div style={{ marginBottom: 10 }}>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Activity Type</label>
                            <select value={completionType} onChange={e => setCompletionType(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                                {(settings?.taskTypes || ['Call','Meeting','Email','Demo','Follow-up']).map(tt => <option key={tt} value={tt}>{tt}</option>)}
                            </select>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Notes <span style={{ fontWeight: 400, textTransform: 'none', color: T.inkMuted }}>(optional)</span></label>
                            <textarea value={completionNotes} onChange={e => setCompletionNotes(e.target.value)}
                                rows={4} placeholder="What was discussed? Any next steps?"
                                autoFocus
                                style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setCompletionPrompt(false); setCompletionNotes(''); }}
                                style={{ padding: '8px 14px', background: T.surface2, color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
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
                    <div ref={errorRef} style={{ background: `${T.danger}14`, border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: formData.type ? T.ink : T.inkMuted, fontFamily: T.sans }}>
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
                                <TimeDropdown value={formData.dueTime || ''} onChange={v => hc('dueTime', v)} ariaLabel="Due time"/>
                            </FieldGroup>
                            <FieldGroup label="Assigned To" wide>
                                {/* Committed chip — shown when a valid user is selected */}
                                {assignSearch && allRepNames.includes(assignSearch) ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: T.ink, width: 'fit-content', fontFamily: T.sans }}>
                                        <span>{assignSearch}</span>
                                        <button type="button" onClick={() => setAssignSearch('')}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 14, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
                                    </div>
                                ) : (
                                    <Typeahead value={assignSearch} onChange={setAssignSearch} suggestions={allRepNames} onSelect={v => { setAssignSearch(v); setDirty(true); }} placeholder="Search users…" dropUp />
                                )}
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
                                {/* A link the user can't open: said so, and an × removes it; untouched, a Save keeps
                                    it (state §0.198, D16). A deal picked is held by its id; each row names its
                                    account and stage, so two deals of one name are told apart (D9). */}
                                {outOfList(oppHeldId, opportunities)
                                    ? <HiddenLink hidden={HIDDEN_DEAL} title="Remove the deal" onRemove={() => { setOppHeldId(''); setDirty(true); }} />
                                    : <Typeahead value={oppSearch} onChange={v => { setOppSearch(v); setDirty(true); }} suggestions={dealOptions} textOf={dealText} lineOf={dealSubline} onSelect={o => { setOppSearch(dealText(o)); setOppHeldId(o.id); setDirty(true); }} placeholder="Search opportunities…" />}
                            </FieldGroup>
                            {/* Contact — multi-select with chips */}
                            <FieldGroup label="Contact" wide>
                                {/* Selected chips */}
                                {selectedContacts.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                                        {selectedContacts.map((c, i) => (
                                            <div key={c.id || i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 7px 3px 9px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: T.ink, fontFamily: T.sans }}>
                                                {c.primary && (
                                                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.warn, background: 'rgba(184,115,51,0.12)', padding: '1px 4px', borderRadius: 2, flexShrink: 0 }}>Primary</span>
                                                )}
                                                <span>{chipLabel(c, contacts)}</span>
                                                <button type="button"
                                                    onClick={() => {
                                                        const next = selectedContacts.filter((_, j) => j !== i);
                                                        const hasPrimary = next.some(x => x.primary);
                                                        setSelectedContacts(!hasPrimary && next.length > 0 ? next.map((x, j) => j === 0 ? { ...x, primary: true } : x) : next);
                                                        setDirty(true);
                                                    }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 14, lineHeight: 1, padding: '0 0 0 2px', flexShrink: 0 }}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* Search input */}
                                <div style={{ position: 'relative' }}>
                                    <input
                                        ref={contactInputRef}
                                        type="text"
                                        value={contactSearch}
                                        onChange={e => { setContactSearch(e.target.value); setShowContactSugg(true); setDirty(true); }}
                                        onFocus={() => setShowContactSugg(true)}
                                        onBlur={() => setTimeout(() => setShowContactSugg(false), 200)}
                                        placeholder={selectedContacts.length > 0 ? 'Add another contact…' : 'Search contacts…'}
                                        autoComplete="off"
                                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
                                    />
                                    {showContactSugg && (() => {
                                        // A contact merged into another is not offered (state §0.198, D12: "Yes, hide
                                        // them"); a chip already on the task still names it.
                                        const alreadyIds = new Set(selectedContacts.map(c => c.id));
                                        const { shown: matched, more } = matchSearch((contacts || []).filter(c => !alreadyIds.has(c.id) && !isMergeArchived(c)), contactSearch, { text: c => `${c.firstName || ''} ${c.lastName || ''}`, also: c => [c.company] });
                                        return (
                                            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: 2, maxHeight: 200, overflowY: 'auto', zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                                {matched.map(c => (
                                                    <div key={c.id}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => {
                                                            const newEntry = contactChip(c, selectedContacts.length === 0);
                                                            setSelectedContacts(prev => [...prev, newEntry]);
                                                            setContactSearch('');
                                                            setDirty(true);
                                                            setTimeout(() => contactInputRef.current?.focus(), 0);
                                                        }}
                                                        style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}` }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.bg}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <div style={{ fontWeight: 600, color: T.ink }}>{c.firstName} {c.lastName}</div>
                                                        {(c.title || c.company) && <div style={{ fontSize: 11, color: T.inkMuted }}>{[c.title, c.company].filter(Boolean).join(' · ')}</div>}
                                                    </div>
                                                ))}
                                                {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: 'inherit', padding: '6px 10px', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{more} more — keep typing</div>}
                                                {matched.length === 0 && (
                                                    <div style={{ padding: '10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>
                                                        {contactSearch ? 'No matches found' : 'No contacts available'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </FieldGroup>
                            <FieldGroup label="Account" wide>
                                {/* The shared account picker (D6: "No Create on tasks"): a unit's and a site's row
                                    names its parent, and a parent's name finds them; a name no account has is
                                    refused at Save. A row picked is held by its id. A link the user can't open: said
                                    so, and an × removes it (D16). */}
                                {outOfList(accountHeldId, accounts)
                                    ? <HiddenLink hidden={HIDDEN_ACCOUNT} title="Remove the account" onRemove={() => { setAccountHeldId(''); setDirty(true); }} />
                                    : <AccountPicker value={accountSearch} onChange={v => { setAccountSearch(v); setDirty(true); }} onSelectAccount={a => setAccountHeldId(a.id)} allowCreate={false} dropUp placeholder="Search accounts…" />}
                            </FieldGroup>
                        </div>
                    </div>
                ) : (
                    // ── VIEW mode ─────────────────────────────────────────────
                    <div>
                        <SectionHeading label="Task Details" />
                        <div style={grid2}>
                            {task?.description && (
                                <div style={{ gridColumn: '1 / -1', marginBottom: 10, padding: '8px 10px', background: T.surface2, borderRadius: T.r, fontSize: 13, color: T.inkMid, lineHeight: 1.5 }}>
                                    {task.description}
                                </div>
                            )}
                            {task?.dueDate && (
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Due</div>
                                    <div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>
                                        {new Date(task.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                        {task.dueTime ? ` · ${task.dueTime}` : ''}
                                    </div>
                                </div>
                            )}
                            <ReadRow label="Priority" value={task?.priority ? `${pc.icon} ${task.priority}` : undefined} />
                            <ReadRow label="Assigned To" value={task?.assignedTo} />
                        </div>

                        {(relOpp || relContact || relAccount || dealHidden || accountHidden) && (
                            <>
                                <SectionHeading label="Related To" />
                                <div style={grid2}>
                                    {relOpp && <ReadRow label="Opportunity" value={relOpp.opportunityName || relOpp.account} wide />}
                                    {dealHidden && <ReadRow label="Opportunity" value={<span style={{ color: T.inkMuted }}>{HIDDEN_DEAL}</span>} wide />}
                                    {relContact && <ReadRow label="Contact" value={`${relContact.firstName || ''} ${relContact.lastName || ''}`.trim()} />}
                                    {relAccount && <ReadRow label="Account" value={relAccount.name} />}
                                    {accountHidden && <ReadRow label="Account" value={<span style={{ color: T.inkMuted }}>{HIDDEN_ACCOUNT}</span>} />}
                                </div>
                            </>
                        )}

                        {taskActivities.length > 0 && (
                            <>
                                <SectionHeading label={`Activity History (${taskActivities.length})`} />
                                <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                    {taskActivities.map((a, idx) => (
                                        <div key={idx} onClick={() => setViewingActivity(a)} title="Open" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', cursor: 'pointer', borderBottom: idx < taskActivities.length - 1 ? `1px solid ${T.border}` : 'none', background: idx % 2 === 0 ? '#fff' : T.surface }}>
                                            <span style={{ fontSize: 11, color: T.inkMuted, flexShrink: 0, width: 52, paddingTop: 1 }}>
                                                {a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                            </span>
                                            <span style={{ background: 'rgba(58,90,122,0.1)', color: T.ink, padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{a.type || 'Note'}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}><ActivityRowText activity={a} /></div>
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

                {/* Documents — attach files related to this task. An existing task links
                    immediately; a brand-new task has no id yet, so it can attach once saved. */}
                <div style={{ marginTop: 14 }}>
                    <SectionHeading label="Documents" />
                    {!isNew && task ? (
                        <AttachmentsStrip recordType="task" recordId={task.id} recordName={task.title} recordSub={task.dueDate ? `Due ${task.dueDate}` : ''} />
                    ) : isNew && newTaskId ? (
                        <AttachmentsStrip recordType="task" recordId={newTaskId} recordName={formData.title || 'New task'} recordSub={formData.dueDate ? `Due ${formData.dueDate}` : ''} />
                    ) : (
                        <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', padding: '2px 0 4px' }}>
                            You can attach related documents once the task is created.
                        </div>
                    )}
                </div>
            </div>

            {/* ── Footer: Delete (view mode) — the task's one delete path (state §0.178) ──
                A writer's: tasks.mjs lets a rep delete their own or an unassigned task and
                refuses the rest, which the hook puts back and says why. */}
            {!isEditing && !isNew && task && canEditCrm(userRole) && (
                <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '10px 16px', background: T.surface, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleDeleteTask(task.id, { onConfirm: closeRail })}
                        style={{ padding: '6px 12px', background: 'none', color: T.danger, border: `1px solid ${T.danger}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        Delete task
                    </button>
                </div>
            )}

            {/* ── Footer: Save/Discard (edit mode) ─────────────────────────── */}
            {isEditing && (
                <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '12px 16px', background: T.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {dirty && <span style={{ fontSize: 11, color: T.inkMuted, flex: 1 }}>Unsaved changes</span>}
                    <button onClick={handleDiscard}
                        style={{ padding: '8px 16px', background: T.surface2, color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, marginLeft: 'auto' }}>
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
