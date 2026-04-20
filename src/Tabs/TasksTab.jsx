import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import TaskItem from '../components/ui/TaskItem';

// ── V1 Design tokens ──────────────────────────────────────────
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

// Task type icons (SVG stroke)
const TYPE_ICON = {
    'Call':       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.65A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.94 6.94l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
    'Email':      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg>,
    'Meeting':    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
    'Follow-up':  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
    'Demo':       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
    'default':    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 9h6M9 13h4"/></svg>,
};

const getTypeIcon = (type) => TYPE_ICON[type] || TYPE_ICON.default;

export default function TasksTab() {
    const {
        tasks, opportunities, contacts, accounts, activities, settings,
        currentUser, userRole, canSeeAll,
        showConfirm, softDelete,
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

    // ── View & filter state ───────────────────────────────────
    const [view,         setView]         = useState(() => localStorage.getItem('tasks:view') || 'list');
    const [typeFilter,   setTypeFilter]   = useState('All');
    const [ownerFilter,  setOwnerFilter]  = useState('Mine');
    const [calDayOffset, setCalDayOffset] = useState(0); // days from today

    const setViewPersist = v => { setView(v); localStorage.setItem('tasks:view', v); };

    // ── Derived dates ─────────────────────────────────────────
    const today      = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
    const todayStr   = useMemo(() => today.toISOString().split('T')[0], [today]);
    const calDay     = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + calDayOffset); return d; }, [today, calDayOffset]);
    const calDayStr  = useMemo(() => calDay.toISOString().split('T')[0], [calDay]);
    const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Week start (Sun) for the current cal day
    const weekStart = useMemo(() => {
        const d = new Date(calDay);
        d.setDate(d.getDate() - d.getDay());
        return d;
    }, [calDay]);

    // ── Task type options (from settings or defaults) ─────────
    const taskTypes = useMemo(() => {
        const fromSettings = settings?.taskTypes || settings?.activityTypes || [];
        const base = ['Call','Email','Meeting','Follow-up','Demo'];
        const merged = [...new Set([...base, ...fromSettings])];
        return merged;
    }, [settings]);

    // ── Filtered tasks ────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed');
        if (ownerFilter === 'Mine')   list = list.filter(t => !t.assignedTo || t.assignedTo === currentUser);
        if (typeFilter  !== 'All')    list = list.filter(t => t.type === typeFilter);
        return list;
    }, [visibleTasks, ownerFilter, typeFilter, currentUser]);

    // ── Bucket computation ────────────────────────────────────
    const { overdue, todayTasks, tomorrowTasks, thisWeekTasks, laterTasks } = useMemo(() => {
        const tomorrow    = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const weekEnd     = new Date(today); weekEnd.setDate(today.getDate() + 7);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const overdue       = filtered.filter(t => t.dueDate && new Date(t.dueDate+'T12:00:00') < today);
        const todayTasks    = filtered.filter(t => t.dueDate === todayStr);
        const tomorrowTasks = filtered.filter(t => t.dueDate === tomorrowStr);
        const thisWeekTasks = filtered.filter(t => {
            if (!t.dueDate) return false;
            const d = new Date(t.dueDate+'T12:00:00');
            return d > tomorrow && d <= weekEnd;
        });
        const laterTasks    = filtered.filter(t => {
            if (!t.dueDate) return false;
            const d = new Date(t.dueDate+'T12:00:00');
            return d > weekEnd;
        });
        return { overdue, todayTasks, tomorrowTasks, thisWeekTasks, laterTasks };
    }, [filtered, today, todayStr]);

    // Count for subtitle
    const autoGenCount = filtered.filter(t => t.autoGenerated).length;

    // ── Calendar data ─────────────────────────────────────────
    const calTodayTasks  = useMemo(() => visibleTasks.filter(t => t.dueDate === calDayStr && t.dueTime && (t.status||'Open') !== 'Completed'), [visibleTasks, calDayStr]);
    const unscheduled    = useMemo(() => visibleTasks.filter(t => !t.dueTime && (t.status||'Open') !== 'Completed'), [visibleTasks]);
    const calEvents      = useMemo(() => (calendarEvents || []).filter(ev => { const d = ev.start?.date || ev.start?.dateTime?.split('T')[0]; return d === calDayStr; }).sort((a,b) => (a.start?.dateTime||'').localeCompare(b.start?.dateTime||'')), [calendarEvents, calDayStr]);

    // This week summary for right rail
    const weekSummary = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
            const ds = d.toISOString().split('T')[0];
            const dayTasks = visibleTasks.filter(t => t.dueDate === ds && (t.status||'Open') !== 'Completed').length;
            const dayMeetings = (calendarEvents || []).filter(ev => { const evd = ev.start?.date || ev.start?.dateTime?.split('T')[0]; return evd === ds; }).length;
            return { d, ds, dayTasks, dayMeetings };
        });
    }, [weekStart, visibleTasks, calendarEvents]);

    // ── Handlers ──────────────────────────────────────────────
    const handleAddTask  = () => { setEditingTask(null); setShowTaskModal(true); };
    const handleEditTask = (t)  => { setEditingTask(t); setShowTaskModal(true); };

    // ── VIEW BUTTONS (top right) ──────────────────────────────
    const ViewButtons = () => (
        <div style={{ display: 'flex', gap: 6 }}>
            {[
                { id: 'list',     label: 'List',      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
                { id: 'calendar', label: 'Calendar',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
                { id: 'voicelog', label: 'Voice log', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg> },
            ].map(v => (
                <button key={v.id} onClick={() => setViewPersist(v.id)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px',
                    background: view === v.id ? T.ink : 'transparent',
                    border: `1px solid ${view === v.id ? T.ink : T.border}`,
                    color:  view === v.id ? T.surface : T.inkMid,
                    borderRadius: T.r, fontSize: 12, fontWeight: view === v.id ? 600 : 400,
                    cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms',
                }}>
                    {v.icon} {v.label}
                </button>
            ))}
            {canEdit && (
                <button onClick={handleAddTask} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: T.ink, border: 'none', color: T.surface, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                    New task
                </button>
            )}
        </div>
    );

    // ── FILTER ROW ────────────────────────────────────────────
    const FilterRow = () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', padding: '8px 0' }}>
            {/* Owner chips */}
            {['Mine', 'Auto-generated', 'Team'].map(o => {
                const count = o === 'Mine' ? filtered.length : o === 'Auto-generated' ? autoGenCount : null;
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
            {/* Divider */}
            <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />
            {/* Type: label */}
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans }}>Type</span>
            {/* Type chips */}
            {['All', ...taskTypes].map(t => {
                const active = typeFilter === t;
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
                        {t !== 'All' && <span style={{ color: active ? T.surface : T.inkMuted }}>{getTypeIcon(t)}</span>}
                        {t}
                    </button>
                );
            })}
            {/* Right: settings hint */}
            <div style={{ marginLeft: 'auto', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                Admin can add task types in Settings →
            </div>
        </div>
    );

    // ── TASK ROW (List view) ──────────────────────────────────
    const TaskRow = ({ task, isOverdue }) => {
        const [hov, setHov] = useState(false);
        const opp     = task.opportunityId ? opportunities.find(o => o.id === task.opportunityId) : null;
        const contact = task.contactId     ? contacts.find(c => c.id === task.contactId) : null;
        const account = opp?.account || task.account || '';
        const sc      = opp ? getStageColor(opp.stage) : null;
        const doneStatus = task.status === 'Completed' || task.completed;

        const timeLabel = task.dueTime || '';
        const priority  = task.priority || 'NORMAL';

        return (
            <div
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
                onClick={() => setViewingTask(task)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 16px',
                    borderBottom: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${isOverdue ? T.danger : 'transparent'}`,
                    background: hov ? T.surface2 : isOverdue ? 'rgba(156,58,46,0.025)' : 'transparent',
                    cursor: 'pointer', fontFamily: T.sans, transition: 'background 80ms',
                }}>

                {/* Circle checkbox */}
                <div
                    onClick={e => { e.stopPropagation(); if (canEdit) handleCompleteTask(task.id, 'Completed'); }}
                    style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        border: `1.5px solid ${isOverdue ? T.danger : T.borderStrong}`,
                        background: doneStatus ? T.ink : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: canEdit ? 'pointer' : 'default', transition: 'all 120ms',
                    }}>
                    {doneStatus && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbf8f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                </div>

                {/* Type icon */}
                <div style={{ color: T.inkMuted, flexShrink: 0 }}>{getTypeIcon(task.type)}</div>

                {/* Title + pills */}
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

                {/* Right: time + status/priority */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {timeLabel && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: T.inkMuted, fontSize: 11 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
                            {timeLabel}
                        </div>
                    )}
                    {isOverdue
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: T.danger, background: 'rgba(156,58,46,0.1)', padding: '2px 7px', borderRadius: 2, letterSpacing: 0.5 }}>OVERDUE</span>
                        : <span style={{ fontSize: 10, fontWeight: 600, color: priority === 'HIGH' ? T.warn : T.inkMuted }}>{priority}</span>
                    }
                    {hov && canEdit && (
                        <button onClick={e => { e.stopPropagation(); handleEditTask(task); }} style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 11, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>Edit</button>
                    )}
                </div>
            </div>
        );
    };

    // ── BUCKET SECTION (List view) ────────────────────────────
    const Bucket = ({ id, label, sublabel, tasks: bTasks, color, defaultOpen = true, extra }) => {
        const [open, setOpen] = useState(defaultOpen);
        if (bTasks.length === 0) return null;
        const isOvr = id === 'overdue';

        return (
            <div>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                    <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.inkMuted, display: 'flex', alignItems: 'center' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            {open ? <path d="M6 9l6 6 6-6"/> : <path d="M9 6l6 6-6 6"/>}
                        </svg>
                    </button>
                    <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>
                        {label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color, background: color+'20', padding: '1px 7px', borderRadius: 999 }}>{bTasks.length}</span>
                    {sublabel && <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{sublabel}</span>}
                    {isOvr && canEdit && (
                        <button style={{ fontSize: 10, color: T.danger, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontWeight: 600, textDecoration: 'underline' }}>
                            Clear these first
                        </button>
                    )}
                    {isOvr && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.info, cursor: 'pointer', fontFamily: T.sans, fontWeight: 600 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                        Reschedule all
                    </div>}
                    {!isOvr && extra}
                </div>
                {open && bTasks.map(t => <TaskRow key={t.id} task={t} isOverdue={id === 'overdue'} />)}
            </div>
        );
    };

    // ── LIST VIEW ─────────────────────────────────────────────
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
                        <Bucket id="overdue"   label="Overdue"                          tasks={overdue}       color={T.danger} />
                        <Bucket id="today"     label="Today"     sublabel={todayLabel}   tasks={todayTasks}    color={T.info}   />
                        <Bucket id="tomorrow"  label="Tomorrow"  sublabel={tomorrowLabel} tasks={tomorrowTasks} color={T.inkMid} />
                        <Bucket id="thisweek"  label="This Week"                         tasks={thisWeekTasks} color={T.inkMuted} defaultOpen={false} />
                        <Bucket id="later"     label="Later"                             tasks={laterTasks}    color={T.inkMuted} defaultOpen={false} />
                    </>
                )}
            </div>
        );
    };

    // ── CALENDAR VIEW ─────────────────────────────────────────
    const CalendarView = () => {
        const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8am - 6pm
        const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
        const isToday = calDayStr === todayStr;

        const timeToMins = (t) => {
            if (!t) return null;
            const [h, m] = t.split(':').map(Number);
            return h * 60 + (m||0);
        };

        const fmtHour = h => { const ampm = h >= 12 ? 'pm' : 'am'; return (h % 12 || 12) + ampm; };

        const dayLabel = isToday ? 'Today' : `${dayNames[calDay.getDay()]}, ${monthNames[calDay.getMonth()]} ${calDay.getDate()}`;
        const timedCount = calTodayTasks.length;
        const meetingCount = calEvents.length;

        // Place items in time grid — each hour = 56px
        const HOUR_H = 56;
        const TOP_OFFSET = 20; // header padding

        const getTop = (timeStr) => {
            const mins = timeToMins(timeStr);
            if (mins === null) return null;
            return TOP_OFFSET + (mins - 8*60) * (HOUR_H / 60);
        };

        return (
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 180px', gap: 12, alignItems: 'start' }}>

                {/* ── LEFT: Unscheduled rail ── */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
                    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Unscheduled</div>
                        <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, fontFamily: T.sans }}>Tasks without a specific time. Drag to the timeline to schedule one.</div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                        {unscheduled.length === 0
                            ? <div style={{ padding: '16px 14px', fontSize: 11, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>All tasks have times</div>
                            : unscheduled.map(t => {
                                const opp = t.opportunityId ? opportunities.find(o => o.id === t.opportunityId) : null;
                                return (
                                    <div key={t.id} onClick={() => setViewingTask(t)} style={{ padding: '7px 14px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ color: T.inkMuted, flexShrink: 0 }}>{getTypeIcon(t.type)}</span>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                                        </div>
                                        {(opp || t.account) && <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 2, paddingLeft: 19, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp?.account || t.account}</div>}
                                        {t.priority === 'HIGH' && <div style={{ fontSize: 9, color: T.warn, fontWeight: 700, paddingLeft: 19, marginTop: 1, fontFamily: T.sans }}>High</div>}
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>

                {/* ── CENTER: Day timeline ── */}
                <div style={{ display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                    {/* Day header */}
                    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => setCalDayOffset(o => o-1)} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkMid }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{dayLabel}</div>
                            <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{timedCount} timed · {meetingCount} meetings</div>
                        </div>
                        <button onClick={() => setCalDayOffset(o => o+1)} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkMid }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>

                    {/* Hour grid */}
                    <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                        {/* Hour rows */}
                        {hours.map(h => (
                            <div key={h} style={{ display: 'flex', alignItems: 'flex-start', height: HOUR_H, borderBottom: `1px solid ${T.border}` }}>
                                <div style={{ width: 44, flexShrink: 0, paddingTop: 4, paddingRight: 8, textAlign: 'right', fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{fmtHour(h)}</div>
                                <div style={{ flex: 1, borderLeft: `1px solid ${T.border}`, height: '100%', position: 'relative' }} />
                            </div>
                        ))}

                        {/* NOW line */}
                        {isToday && nowMins >= 8*60 && nowMins <= 18*60 && (
                            <div style={{ position: 'absolute', left: 44, right: 0, top: TOP_OFFSET + (nowMins - 8*60) * (HOUR_H/60), borderTop: `1.5px solid ${T.danger}`, zIndex: 3, pointerEvents: 'none' }}>
                                <div style={{ position: 'absolute', left: -5, top: -4, width: 8, height: 8, borderRadius: '50%', background: T.danger }} />
                                <div style={{ position: 'absolute', right: 4, top: -8, fontSize: 8, color: T.danger, fontWeight: 700, fontFamily: T.sans }}>NOW</div>
                            </div>
                        )}

                        {/* Calendar events (dashed border) */}
                        {calEvents.map((ev, i) => {
                            const startMins = ev.start?.dateTime ? (new Date(ev.start.dateTime).getHours()*60 + new Date(ev.start.dateTime).getMinutes()) : null;
                            const endMins   = ev.end?.dateTime   ? (new Date(ev.end.dateTime).getHours()*60   + new Date(ev.end.dateTime).getMinutes())   : startMins ? startMins + 60 : null;
                            if (startMins === null || startMins < 8*60 || startMins > 18*60) return null;
                            const top = TOP_OFFSET + (startMins - 8*60) * (HOUR_H/60);
                            const height = Math.max(28, ((endMins||startMins+60) - startMins) * (HOUR_H/60));
                            const provider = ev.provider || (ev.htmlLink?.includes('google') ? 'GOOGLE' : 'OUTLOOK');
                            return (
                                <div key={ev.id||i} style={{ position: 'absolute', left: 48, right: 8, top, height, border: `1.5px dashed ${T.border}`, borderRadius: T.r, background: T.surface2, padding: '3px 8px', overflow: 'hidden', zIndex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{ev.summary}</div>
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

                        {/* Tasks with times */}
                        {calTodayTasks.map((t, i) => {
                            const top = getTop(t.dueTime);
                            if (top === null) return null;
                            return (
                                <div key={t.id} onClick={() => setViewingTask(t)} style={{ position: 'absolute', left: 48, right: 8, top: top+2, height: 28, background: T.surface, border: `1px solid ${T.borderStrong}`, borderLeft: `3px solid ${T.info}`, borderRadius: `0 ${T.r}px ${T.r}px 0`, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', zIndex: 2 }}>
                                    <span style={{ color: T.info }}>{getTypeIcon(t.type)}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{t.title}</span>
                                    <div style={{ marginLeft: 'auto', width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${T.borderStrong}`, flexShrink: 0 }} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── RIGHT: This week rail ── */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {/* Sync status */}
                    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
                        {calendarConnected ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.ok, flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: T.ok, fontFamily: T.sans }}>Synced</div>
                                    <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>Google · Outlook · 2m ago</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>Calendar not connected</div>
                        )}
                    </div>

                    {/* This week summary */}
                    <div style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontFamily: T.sans }}>This week</div>
                        {weekSummary.map(({ d, ds, dayTasks, dayMeetings }) => {
                            const isCalDay  = ds === calDayStr;
                            const isTodayDay = ds === todayStr;
                            return (
                                <div key={ds} onClick={() => setCalDayOffset(Math.round((d - today) / 86400000))}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: T.r, marginBottom: 2, cursor: 'pointer', background: isCalDay ? T.surface2 : 'transparent', fontFamily: T.sans }}
                                    onMouseEnter={e => { if (!isCalDay) e.currentTarget.style.background = T.bg; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = isCalDay ? T.surface2 : 'transparent'; }}>
                                    <div style={{ width: 30, fontSize: 11, fontWeight: isTodayDay ? 700 : 400, color: isTodayDay ? T.ink : T.inkMid }}>
                                        {dayNames[d.getDay()]} {d.getDate()}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 10, color: T.inkMid }}>{dayTasks} task{dayTasks !== 1 ? 's' : ''}</div>
                                        <div style={{ fontSize: 10, color: T.inkMuted }}>{dayMeetings} meeting{dayMeetings !== 1 ? 's' : ''}</div>
                                    </div>
                                    {isTodayDay && <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.info, flexShrink: 0 }} />}
                                </div>
                            );
                        })}
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
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>
                        Tasks
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>
                        {overdue.length > 0 && <><span style={{ color: T.danger, fontWeight: 600 }}>{overdue.length} overdue</span><span style={{ margin: '0 6px', color: T.border }}>·</span></>}
                        <span style={{ fontWeight: 600, color: T.ink }}>{todayTasks.length}</span> due today
                        <span style={{ margin: '0 6px', color: T.border }}>·</span>
                        <span style={{ fontWeight: 600, color: T.ink }}>{filtered.length}</span> total
                        {calendarConnected && (
                            <><span style={{ margin: '0 6px', color: T.border }}>·</span><span style={{ color: T.ok }}>synced with Google · Outlook</span></>
                        )}
                    </div>
                </div>
                <ViewButtons />
            </div>

            {/* ── Filter row (list view only) ── */}
            {view === 'list' && <FilterRow />}

            {/* ── View content ── */}
            {view === 'list'     && <ListView />}
            {view === 'calendar' && <CalendarView />}
            {view === 'voicelog' && <VoiceLogView />}

        </div>
    );
}
