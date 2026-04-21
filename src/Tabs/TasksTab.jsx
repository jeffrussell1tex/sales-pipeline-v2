import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';

// ── Design tokens ─────────────────────────────────────────────
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    info:         '#3a5a7a',
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    serif:        'Georgia, serif',
    r:            3,
};

const fmtArr = v => { const n = parseFloat(v)||0; return n >= 1e6 ? '$'+(n/1e6).toFixed(1)+'M' : n >= 1e3 ? '$'+Math.round(n/1e3)+'K' : '$'+n.toLocaleString(); };

// ── Type icon + colour map ────────────────────────────────────
// colour is used both for the icon and for the badge background tint
const TYPE_META = {
    'Call':      { color: '#3a5a7a', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.65A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.94 6.94l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> },
    'Email':     { color: '#7a5a3c', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg> },
    'Meeting':   { color: '#4d6b3d', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
    'Follow-up': { color: '#b87333', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> },
    'Demo':      { color: '#6b5a7a', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
    'default':   { color: '#8a8378', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 9h6M9 13h4"/></svg> },
};
const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.default;

// ── Snooze picker popup ───────────────────────────────────────
function SnoozePicker({ task, onSnooze, onClose }) {
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const today = new Date(); today.setHours(0,0,0,0);
    const addDays = (n) => {
        const d = new Date(today);
        d.setDate(d.getDate() + n);
        return d.toISOString().split('T')[0];
    };

    const options = [
        { label: 'Tomorrow',     sublabel: new Date(addDays(1)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 1 },
        { label: 'In 3 days',    sublabel: new Date(addDays(3)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 3 },
        { label: 'Next week',    sublabel: new Date(addDays(7)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 7 },
        { label: 'In 2 weeks',   sublabel: new Date(addDays(14)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 14 },
    ];

    return (
        <div ref={ref} style={{
            position: 'absolute', right: 0, top: '110%', zIndex: 50,
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: T.r+1, boxShadow: '0 8px 24px rgba(42,38,34,0.15)',
            width: 200, overflow: 'hidden', fontFamily: T.sans,
        }}>
            <div style={{ padding: '8px 12px 6px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>Snooze until</div>
            </div>
            {options.map(({ label, sublabel, days }) => (
                <div key={days}
                    onClick={() => onSnooze(addDays(days))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', transition: 'background 80ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: T.ink }}>{label}</span>
                    <span style={{ fontSize: 11, color: T.inkMuted }}>{sublabel}</span>
                </div>
            ))}
        </div>
    );
}

// ── Task row ──────────────────────────────────────────────────
function TaskRow({ task, isOverdue, opportunities, contacts, getStageColor, canEdit, handleCompleteTask, handleSaveTask, setViewingTask, setEditingTask, setShowTaskModal }) {
    const [hov,          setHov]          = useState(false);
    const [snoozeOpen,   setSnoozeOpen]   = useState(false);
    const [completing,   setCompleting]   = useState(false);

    const opp     = task.opportunityId ? opportunities.find(o => o.id === task.opportunityId) : null;
    const contact = task.contactId     ? contacts.find(c => c.id === task.contactId)         : null;
    const account = opp?.account || task.account || '';
    const sc      = opp ? getStageColor(opp.stage) : null;
    const meta    = getTypeMeta(task.type);
    const priority = task.priority || 'NORMAL';
    const isHigh   = priority === 'HIGH' || priority === 'high';
    const timeLabel = task.dueTime || '';

    const handleComplete = async (e) => {
        e.stopPropagation();
        if (!canEdit || completing) return;
        setCompleting(true);
        try { await handleCompleteTask(task.id, 'Completed'); } finally { setCompleting(false); }
    };

    const handleSnooze = async (newDate) => {
        setSnoozeOpen(false);
        if (!canEdit) return;
        await handleSaveTask({ ...task, dueDate: newDate, status: 'Open', completed: false });
    };

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => { setHov(false); }}
            onClick={() => setViewingTask(task)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px',
                borderBottom: `1px solid ${T.border}`,
                // Priority left rail: high = warn colour, overdue = danger, else transparent
                borderLeft: `3px solid ${isOverdue ? T.danger : isHigh ? T.warn : 'transparent'}`,
                background: hov ? T.surface2 : isOverdue ? 'rgba(156,58,46,0.025)' : 'transparent',
                cursor: 'pointer', fontFamily: T.sans, transition: 'background 80ms',
                position: 'relative',
            }}>

            {/* Circle checkbox — shows checkmark preview on hover */}
            <div
                onClick={handleComplete}
                title="Mark complete"
                style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    border: `1.5px solid ${completing ? T.ok : isOverdue ? T.danger : T.borderStrong}`,
                    background: completing ? T.ok : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: canEdit ? 'pointer' : 'default', transition: 'all 120ms',
                }}>
                {(hov || completing) && !completing && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                )}
                {completing && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                )}
            </div>

            {/* Type icon badge — coloured square */}
            <div style={{
                width: 28, height: 28, borderRadius: T.r, flexShrink: 0,
                background: meta.color + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: meta.color,
            }}>
                {meta.icon}
            </div>

            {/* Title + context pills */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                    {task.autoGenerated && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: T.goldInk, background: 'rgba(200,185,154,0.2)', padding: '1px 5px', borderRadius: 2, border: `1px solid ${T.gold}`, letterSpacing: 0.5 }}>AUTO</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                    {account && <span style={{ fontSize: 10, color: T.info, fontWeight: 600 }}>{account}</span>}
                    {account && (contact || opp) && <span style={{ fontSize: 10, color: T.border }}>·</span>}
                    {contact && <span style={{ fontSize: 10, color: T.inkMid }}>{contact.firstName} {contact.lastName}</span>}
                    {opp && (
                        <>
                            {(account || contact) && <span style={{ fontSize: 10, color: T.border }}>·</span>}
                            <span style={{ fontSize: 10, background: (sc?.text||T.inkMuted)+'22', color: sc?.text||T.inkMuted, padding: '0 5px', borderRadius: 2 }}>{opp.stage}</span>
                            <span style={{ fontSize: 10, color: T.inkMuted }}>·</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: T.inkMid }}>{fmtArr(opp.arr)}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Right: time + overdue badge + hover actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {timeLabel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: T.inkMuted, fontSize: 11 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
                        {timeLabel}
                    </div>
                )}
                {isOverdue
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: T.danger, background: 'rgba(156,58,46,0.1)', padding: '2px 7px', borderRadius: 2, letterSpacing: 0.5 }}>OVERDUE</span>
                    : isHigh
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: T.warn }}>HIGH</span>
                        : null
                }

                {/* Hover actions */}
                {hov && canEdit && (
                    <>
                        {/* Snooze */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={e => { e.stopPropagation(); setSnoozeOpen(o => !o); }}
                                title="Snooze"
                                style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 11, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9h6l-4 5h4"/></svg>
                                Snooze
                            </button>
                            {snoozeOpen && (
                                <SnoozePicker
                                    task={task}
                                    onSnooze={handleSnooze}
                                    onClose={() => setSnoozeOpen(false)}
                                />
                            )}
                        </div>
                        {/* Edit */}
                        <button
                            onClick={e => { e.stopPropagation(); setEditingTask(task); setShowTaskModal(true); }}
                            style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 11, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                            Edit
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Bucket group header ───────────────────────────────────────
function BucketHeader({ id, label, sublabel, count, color, open, onToggle, canEdit }) {
    const isOvr = id === 'overdue';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
            {/* Accent dot */}
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />

            {/* Label */}
            <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>{label}</span>
                <span style={{ fontSize: 11, color: T.inkMuted, fontWeight: 500, fontFamily: T.sans }}>{count}</span>
            </button>

            {sublabel && <span style={{ fontSize: 11, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>{sublabel}</span>}

            {isOvr && canEdit && (
                <span style={{ fontSize: 10, color: T.danger, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, textDecoration: 'underline', textDecorationColor: 'rgba(156,58,46,0.4)' }}
                    title="Bulk reschedule not yet available">
                    Clear these first
                </span>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {isOvr && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.info, cursor: 'pointer', fontFamily: T.sans, fontWeight: 600 }}
                        title="Bulk reschedule not yet available">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                        Reschedule all
                    </span>
                )}
                {/* Collapse toggle */}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" onClick={onToggle} style={{ cursor: 'pointer' }}>
                    {open ? <path d="M6 9l6 6 6-6"/> : <path d="M9 6l6 6-6 6"/>}
                </svg>
            </div>
        </div>
    );
}

// ── Bucket section ────────────────────────────────────────────
function Bucket({ id, label, sublabel, tasks: bTasks, color, defaultOpen = true, rowProps }) {
    const [open, setOpen] = useState(defaultOpen);
    if (bTasks.length === 0) return null;
    return (
        <div>
            <BucketHeader
                id={id} label={label} sublabel={sublabel}
                count={bTasks.length} color={color}
                open={open} onToggle={() => setOpen(o => !o)}
                canEdit={rowProps.canEdit}
            />
            {open && bTasks.map(t => <TaskRow key={t.id} task={t} isOverdue={id === 'overdue'} {...rowProps} />)}
        </div>
    );
}

// ── Main TasksTab ─────────────────────────────────────────────
export default function TasksTab() {
    const {
        tasks, opportunities, contacts, accounts, activities, settings,
        currentUser, userRole, canSeeAll,
        showConfirm,
        getStageColor, calculateDealHealth,
        visibleTasks,
        handleDeleteTask, handleCompleteTask, handleSaveTask,
        handleAddTaskToCalendar,
        calendarEvents, calendarConnected, calendarLoading,
        allPipelines, activePipeline,
        viewingRep, viewingTeam, viewingTerritory,
        setEditingTask, setShowTaskModal,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepOppId, setMeetingPrepOppId,
        viewingTask, setViewingTask,
        isMobile,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;

    // ── View & filter state — style guide key: tab:tasks:subView ─
    const [view,         setView]        = useState(() => localStorage.getItem('tab:tasks:subView') || 'list');
    const [typeFilter,   setTypeFilter]  = useState('All');
    const [ownerFilter,  setOwnerFilter] = useState('Mine');
    const [calDayOffset, setCalDayOffset] = useState(0);

    const setViewPersist = v => { setView(v); localStorage.setItem('tab:tasks:subView', v); };

    // ── Dates ─────────────────────────────────────────────────
    const today     = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
    const todayStr  = useMemo(() => today.toISOString().split('T')[0], [today]);
    const calDay    = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + calDayOffset); return d; }, [today, calDayOffset]);
    const calDayStr = useMemo(() => calDay.toISOString().split('T')[0], [calDay]);
    const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const weekStart = useMemo(() => {
        const d = new Date(calDay); d.setDate(d.getDate() - d.getDay()); return d;
    }, [calDay]);

    // ── Task types from settings ──────────────────────────────
    const taskTypes = useMemo(() => {
        const fromSettings = settings?.taskTypes || settings?.activityTypes || [];
        const base = ['Call','Email','Meeting','Follow-up','Demo'];
        return [...new Set([...base, ...fromSettings])];
    }, [settings]);

    // ── Filtered tasks ────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed');
        if (ownerFilter === 'Mine') list = list.filter(t => !t.assignedTo || t.assignedTo === currentUser);
        if (typeFilter  !== 'All')  list = list.filter(t => t.type === typeFilter);
        return list;
    }, [visibleTasks, ownerFilter, typeFilter, currentUser]);

    // ── Buckets ───────────────────────────────────────────────
    const { overdue, todayTasks, tomorrowTasks, thisWeekTasks, laterTasks } = useMemo(() => {
        const tomorrow    = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const weekEnd     = new Date(today); weekEnd.setDate(today.getDate() + 7);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        return {
            overdue:      filtered.filter(t => t.dueDate && new Date(t.dueDate+'T12:00:00') < today),
            todayTasks:   filtered.filter(t => t.dueDate === todayStr),
            tomorrowTasks:filtered.filter(t => t.dueDate === tomorrowStr),
            thisWeekTasks:filtered.filter(t => { if (!t.dueDate) return false; const d = new Date(t.dueDate+'T12:00:00'); return d > tomorrow && d <= weekEnd; }),
            laterTasks:   filtered.filter(t => { if (!t.dueDate) return false; const d = new Date(t.dueDate+'T12:00:00'); return d > weekEnd; }),
        };
    }, [filtered, today, todayStr]);

    const autoGenCount = filtered.filter(t => t.autoGenerated).length;

    // ── Calendar data ─────────────────────────────────────────
    const calTodayTasks = useMemo(() => visibleTasks.filter(t => t.dueDate === calDayStr && t.dueTime && (t.status||'Open') !== 'Completed'), [visibleTasks, calDayStr]);
    const unscheduled   = useMemo(() => visibleTasks.filter(t => !t.dueTime && (t.status||'Open') !== 'Completed'), [visibleTasks]);
    const calEvents     = useMemo(() => (calendarEvents||[]).filter(ev => { const d = ev.start?.date||ev.start?.dateTime?.split('T')[0]; return d === calDayStr; }).sort((a,b) => (a.start?.dateTime||'').localeCompare(b.start?.dateTime||'')), [calendarEvents, calDayStr]);

    const weekSummary = useMemo(() => Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
        const ds = d.toISOString().split('T')[0];
        return {
            d, ds,
            dayTasks:    visibleTasks.filter(t => t.dueDate === ds && (t.status||'Open') !== 'Completed').length,
            dayMeetings: (calendarEvents||[]).filter(ev => { const evd = ev.start?.date||ev.start?.dateTime?.split('T')[0]; return evd === ds; }).length,
        };
    }), [weekStart, visibleTasks, calendarEvents]);

    // ── Handlers ──────────────────────────────────────────────
    const handleAddTask  = () => { setEditingTask(null); setShowTaskModal(true); };
    const handleEditTask = (t) => { setEditingTask(t);   setShowTaskModal(true); };

    // Props bundle passed to every TaskRow
    const rowProps = { opportunities, contacts, getStageColor, canEdit, handleCompleteTask, handleSaveTask, setViewingTask, setEditingTask, setShowTaskModal };

    // ── Sub-tab views config ──────────────────────────────────
    const views = [
        { id: 'list',     label: 'List',      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
        { id: 'calendar', label: 'Calendar',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
        { id: 'voicelog', label: 'Voice log', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg> },
    ];

    // ── Filter row (list view only) ───────────────────────────
    const FilterRow = () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', padding: '8px 0' }}>
            {['Mine', 'Auto-generated', 'Team'].map(o => {
                const count  = o === 'Mine' ? filtered.length : o === 'Auto-generated' ? autoGenCount : null;
                const active = ownerFilter === o;
                return (
                    <button key={o} onClick={() => setOwnerFilter(o)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px',
                        background: active ? T.ink : 'transparent',
                        border: `1px solid ${active ? T.ink : T.border}`,
                        color: active ? T.surface : T.ink,
                        borderRadius: T.r, fontSize: 12, fontWeight: active ? 600 : 400,
                        cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms',
                    }}>
                        {o}
                        {count != null && <span style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.7)' : T.inkMuted }}>{count}</span>}
                    </button>
                );
            })}
            <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans }}>Type</span>
            {['All', ...taskTypes].map(t => {
                const active = typeFilter === t;
                const meta   = t !== 'All' ? getTypeMeta(t) : null;
                return (
                    <button key={t} onClick={() => setTypeFilter(t)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px',
                        background: active ? T.ink : 'transparent',
                        border: `1px solid ${active ? T.ink : T.border}`,
                        color: active ? T.surface : T.ink,
                        borderRadius: T.r, fontSize: 12, fontWeight: active ? 600 : 400,
                        cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms',
                    }}>
                        {meta && <span style={{ color: active ? T.surface : meta.color }}>{meta.icon}</span>}
                        {t}
                    </button>
                );
            })}
            <div style={{ marginLeft: 'auto', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                Admin can add task types in Settings →
            </div>
        </div>
    );

    // ── List view ─────────────────────────────────────────────
    const ListView = () => {
        const tomorrow      = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const tomorrowLabel = `${dayNames[tomorrow.getDay()]} ${monthNames[tomorrow.getMonth()]} ${tomorrow.getDate()}`;
        const todayLabel    = `${dayNames[today.getDay()]} ${monthNames[today.getMonth()]} ${today.getDate()}`;
        return (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                {filtered.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                        No open tasks{typeFilter !== 'All' ? ` of type "${typeFilter}"` : ''}.
                        {canEdit && <> <button onClick={handleAddTask} style={{ background: 'none', border: 'none', color: T.info, cursor: 'pointer', fontFamily: T.sans, fontSize: 13, fontWeight: 600 }}>Add one →</button></>}
                    </div>
                ) : (
                    <>
                        <Bucket id="overdue"   label="Overdue"   tasks={overdue}       color={T.danger}  rowProps={rowProps} />
                        <Bucket id="today"     label="Today"     sublabel={todayLabel}  tasks={todayTasks} color={T.info} rowProps={rowProps} />
                        <Bucket id="tomorrow"  label="Tomorrow"  sublabel={tomorrowLabel} tasks={tomorrowTasks} color={T.inkMid} rowProps={rowProps} />
                        <Bucket id="thisweek"  label="This Week" tasks={thisWeekTasks}  color={T.inkMuted} defaultOpen={false} rowProps={rowProps} />
                        <Bucket id="later"     label="Later"     tasks={laterTasks}     color={T.inkMuted} defaultOpen={false} rowProps={rowProps} />
                    </>
                )}
            </div>
        );
    };

    // ── Calendar view ─────────────────────────────────────────
    const CalendarView = () => {
        const hours    = Array.from({ length: 11 }, (_, i) => i + 8);
        const nowMins  = new Date().getHours() * 60 + new Date().getMinutes();
        const isToday  = calDayStr === todayStr;
        const HOUR_H   = 56;
        const TOP_OFFSET = 20;

        const timeToMins = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m||0); };
        const fmtHour    = h => { const ap = h >= 12 ? 'pm' : 'am'; return (h % 12 || 12) + ap; };
        const getTop     = (ts) => { const m = timeToMins(ts); return m === null ? null : TOP_OFFSET + (m - 8*60) * (HOUR_H/60); };

        const dayLabel    = isToday ? 'Today' : `${dayNames[calDay.getDay()]}, ${monthNames[calDay.getMonth()]} ${calDay.getDate()}`;
        const timedCount  = calTodayTasks.length;
        const meetingCount = calEvents.length;

        return (
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 190px', gap: 12, alignItems: 'start' }}>

                {/* LEFT — Unscheduled rail */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 600 }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Unscheduled</div>
                        <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, lineHeight: 1.4, fontFamily: T.sans }}>Tasks without a specific time.</div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                        {unscheduled.length === 0
                            ? <div style={{ padding: '16px 14px', fontSize: 11, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>All tasks have times</div>
                            : unscheduled.map(t => {
                                const opp  = t.opportunityId ? opportunities.find(o => o.id === t.opportunityId) : null;
                                const meta = getTypeMeta(t.type);
                                return (
                                    <div key={t.id} onClick={() => setViewingTask(t)}
                                        style={{ padding: '7px 14px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 22, height: 22, borderRadius: T.r, background: meta.color+'22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color }}>
                                                {meta.icon}
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                                        </div>
                                        {(opp || t.account) && <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 2, paddingLeft: 28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp?.account || t.account}</div>}
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>

                {/* CENTER — Day timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => setCalDayOffset(o => o-1)} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkMid }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, color: T.ink, lineHeight: 1 }}>{dayLabel}</div>
                            <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans, marginTop: 2 }}>{timedCount} timed · {meetingCount} meetings</div>
                        </div>
                        <button onClick={() => setCalDayOffset(o => o+1)} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkMid }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                        {hours.map(h => (
                            <div key={h} style={{ display: 'flex', alignItems: 'flex-start', height: HOUR_H, borderBottom: `1px solid ${T.border}` }}>
                                <div style={{ width: 44, flexShrink: 0, paddingTop: 4, paddingRight: 8, textAlign: 'right', fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{fmtHour(h)}</div>
                                <div style={{ flex: 1, borderLeft: `1px solid ${T.border}`, height: '100%' }} />
                            </div>
                        ))}
                        {/* NOW line */}
                        {isToday && nowMins >= 8*60 && nowMins <= 18*60 && (
                            <div style={{ position: 'absolute', left: 44, right: 0, top: TOP_OFFSET + (nowMins - 8*60) * (HOUR_H/60), borderTop: `1.5px solid ${T.danger}`, zIndex: 3, pointerEvents: 'none' }}>
                                <div style={{ position: 'absolute', left: -5, top: -4, width: 8, height: 8, borderRadius: '50%', background: T.danger }} />
                                <div style={{ position: 'absolute', right: 4, top: -8, fontSize: 8, color: T.danger, fontWeight: 700, fontFamily: T.sans }}>NOW</div>
                            </div>
                        )}
                        {/* Calendar events */}
                        {calEvents.map((ev, i) => {
                            const startMins = ev.start?.dateTime ? (new Date(ev.start.dateTime).getHours()*60 + new Date(ev.start.dateTime).getMinutes()) : null;
                            const endMins   = ev.end?.dateTime   ? (new Date(ev.end.dateTime).getHours()*60   + new Date(ev.end.dateTime).getMinutes())   : startMins ? startMins + 60 : null;
                            if (startMins === null || startMins < 8*60 || startMins > 18*60) return null;
                            const top    = TOP_OFFSET + (startMins - 8*60) * (HOUR_H/60);
                            const height = Math.max(28, ((endMins||startMins+60) - startMins) * (HOUR_H/60));
                            const provider = ev.provider || (ev.htmlLink?.includes('google') ? 'GOOGLE' : 'OUTLOOK');
                            return (
                                <div key={ev.id||i} style={{ position: 'absolute', left: 48, right: 8, top, height, background: 'rgba(58,90,122,0.07)', border: `1.5px dashed rgba(58,90,122,0.3)`, borderRadius: T.r, padding: '3px 8px', overflow: 'hidden', zIndex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: T.info, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{ev.summary}</div>
                                        <span style={{ fontSize: 8, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.5, flexShrink: 0, marginLeft: 4, fontFamily: T.sans }}>{provider}</span>
                                    </div>
                                    {ev.start?.dateTime && ev.end?.dateTime && (
                                        <div style={{ fontSize: 9, color: T.inkMuted, fontFamily: T.sans }}>
                                            {new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}–{new Date(ev.end.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {/* Timed tasks */}
                        {calTodayTasks.map(t => {
                            const top  = getTop(t.dueTime);
                            const meta = getTypeMeta(t.type);
                            if (top === null) return null;
                            return (
                                <div key={t.id} onClick={() => setViewingTask(t)}
                                    style={{ position: 'absolute', left: 48, right: 8, top: top+2, height: 28, background: T.surface, border: `1px solid ${T.borderStrong}`, borderLeft: `3px solid ${meta.color}`, borderRadius: `0 ${T.r}px ${T.r}px 0`, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', zIndex: 2 }}>
                                    <span style={{ color: meta.color }}>{meta.icon}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{t.title}</span>
                                    <div style={{ marginLeft: 'auto', width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${T.borderStrong}`, flexShrink: 0 }} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT — week summary rail */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Sync status card — info-blue tint */}
                    <div style={{
                        background: 'rgba(58,90,122,0.07)', border: '1px solid rgba(58,90,122,0.18)',
                        borderRadius: T.r+1, padding: '10px 12px',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: calendarConnected ? T.ok : T.inkMuted, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            {calendarConnected ? (
                                <>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: T.ok, fontFamily: T.sans }}>Synced</div>
                                    <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>Google · Outlook · 2m ago</div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>Calendar not connected</div>
                            )}
                        </div>
                    </div>

                    {/* This week */}
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>This week</div>
                        </div>
                        <div style={{ padding: '6px 8px' }}>
                            {weekSummary.map(({ d, ds, dayTasks, dayMeetings }) => {
                                const isCalDay   = ds === calDayStr;
                                const isTodayDay = ds === todayStr;
                                return (
                                    <div key={ds}
                                        onClick={() => setCalDayOffset(Math.round((d - today) / 86400000))}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: T.r, marginBottom: 2, cursor: 'pointer', background: isCalDay ? T.surface2 : 'transparent' }}
                                        onMouseEnter={e => { if (!isCalDay) e.currentTarget.style.background = T.bg; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = isCalDay ? T.surface2 : 'transparent'; }}>
                                        {/* Serif date number — editorial style */}
                                        <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>{dayNames[d.getDay()]}</div>
                                            <div style={{ fontSize: 16, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 400, color: isTodayDay ? T.ink : T.inkMid, lineHeight: 1 }}>{d.getDate()}</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: T.inkMid, fontFamily: T.sans, fontWeight: 500 }}>{dayTasks} task{dayTasks !== 1 ? 's' : ''}</div>
                                            <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{dayMeetings} meeting{dayMeetings !== 1 ? 's' : ''}</div>
                                        </div>
                                        {dayTasks > 0 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: isTodayDay ? T.info : T.borderStrong, flexShrink: 0 }} />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ── Voice log placeholder ─────────────────────────────────
    const VoiceLogView = () => (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
            Voice log coming soon.
        </div>
    );

    return (
        <div className="tab-page" style={{ fontFamily: T.sans }}>

            {/* ── Page header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, paddingBottom: 12 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>Tasks</div>
                    <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>
                        {overdue.length > 0 && <><span style={{ color: T.danger, fontWeight: 600 }}>{overdue.length} overdue</span><span style={{ margin: '0 6px', color: T.border }}>·</span></>}
                        <span style={{ fontWeight: 600, color: T.ink }}>{todayTasks.length}</span> due today
                        <span style={{ margin: '0 6px', color: T.border }}>·</span>
                        <span style={{ fontWeight: 600, color: T.ink }}>{filtered.length}</span> total
                        {calendarConnected && <><span style={{ margin: '0 6px', color: T.border }}>·</span><span style={{ color: T.ok }}>calendar synced</span></>}
                    </div>
                </div>
                {/* New task button */}
                {canEdit && (
                    <button onClick={handleAddTask} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.ink, border: 'none', color: T.surface, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        New task
                    </button>
                )}
            </div>

            {/* ── Underline sub-tab switcher ── */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
                {views.map(v => {
                    const active = view === v.id;
                    return (
                        <button key={v.id}
                            onClick={() => setViewPersist(v.id)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 16px', border: 'none',
                                borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent',
                                background: 'transparent',
                                color: active ? T.ink : T.inkMuted,
                                fontSize: 12, fontWeight: active ? 600 : 400,
                                cursor: 'pointer', fontFamily: T.sans,
                                transition: 'color 120ms, border-color 120ms',
                                whiteSpace: 'nowrap', marginBottom: -1,
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                            {v.icon}
                            {v.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Filter row — list view only ── */}
            {view === 'list' && <FilterRow />}

            {/* ── View content ── */}
            {view === 'list'     && <ListView />}
            {view === 'calendar' && <CalendarView />}
            {view === 'voicelog' && <VoiceLogView />}

        </div>
    );
}
