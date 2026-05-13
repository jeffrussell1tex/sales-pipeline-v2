import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';

// ── Design tokens ──────────────────────────────────────────────
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

// ── Type icon + colour map ─────────────────────────────────────
const TYPE_META = {
    'Call':      { color: '#3a5a7a', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.65A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.94 6.94l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> },
    'Email':     { color: '#7a5a3c', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg> },
    'Meeting':   { color: '#4d6b3d', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
    'Follow-up': { color: '#b87333', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> },
    'Demo':      { color: '#6b5a7a', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
    'Note':      { color: '#5a7a6b', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg> },
    'default':   { color: '#8a8378', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 9h6M9 13h4"/></svg> },
};
const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.default;

// ── Format helpers ─────────────────────────────────────────────
const fmtClock = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return h + (m === 0 ? '' : ':' + String(m).padStart(2, '0')) + ampm;
};

const fmtAgo = (iso) => {
    if (!iso) return '—';
    const now  = new Date();
    const then = new Date(iso);
    const diffMin = Math.round((now - then) / 60000);
    if (diffMin < 1)       return 'just now';
    if (diffMin < 60)      return diffMin + 'm ago';
    if (diffMin < 60 * 24) return Math.round(diffMin / 60) + 'h ago';
    const diffDay = Math.round(diffMin / 60 / 24);
    if (diffDay === 1)     return 'yesterday';
    if (diffDay < 7)       return diffDay + 'd ago';
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtDueTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hh = parseInt(h, 10);
    const ampm = hh >= 12 ? 'pm' : 'am';
    const h12 = hh % 12 || 12;
    return h12 + (m === '00' ? '' : ':' + m) + ampm;
};

const dayLabel = (isoDay) => {
    const d    = new Date(isoDay + 'T12:00:00');
    const now  = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.round((now - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// ── Snooze picker (unchanged from original) ────────────────────
function SnoozePicker({ task, onSnooze, onClose, anchorRect }) {
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const POPOVER_H = 168;
    const POPOVER_W = 200;
    const MARGIN = 8;

    // Decide whether to open above or below the button
    const openUpward = anchorRect && (anchorRect.bottom + POPOVER_H + MARGIN > window.innerHeight);

    const top  = openUpward
        ? anchorRect.top - POPOVER_H - MARGIN
        : anchorRect.bottom + MARGIN;
    const left = Math.min(
        anchorRect.right - POPOVER_W,
        window.innerWidth - POPOVER_W - MARGIN
    );

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
    const options = [
        { label: 'Tomorrow',   sublabel: new Date(addDays(1)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 1 },
        { label: 'In 3 days',  sublabel: new Date(addDays(3)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 3 },
        { label: 'Next week',  sublabel: new Date(addDays(7)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 7 },
        { label: 'In 2 weeks', sublabel: new Date(addDays(14)+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}), days: 14 },
    ];
    return (
        <div ref={ref} style={{ position: 'fixed', top, left, zIndex: 9999, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, boxShadow: '0 8px 24px rgba(42,38,34,0.15)', width: POPOVER_W, overflow: 'hidden', fontFamily: T.sans }}>
            <div style={{ padding: '8px 12px 6px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>Snooze until</div>
            </div>
            {options.map(({ label, sublabel, days }) => (
                <div key={days} onClick={() => onSnooze(addDays(days))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: T.ink }}>{label}</span>
                    <span style={{ fontSize: 11, color: T.inkMuted }}>{sublabel}</span>
                </div>
            ))}
        </div>
    );
}

// ── Source badge (Logged / Task done) ─────────────────────────
function SourceBadge({ source }) {
    if (source === 'log') return (
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.goldInk, background: 'rgba(200,185,154,0.22)', padding: '2px 6px', borderRadius: 2, lineHeight: 1.2, flexShrink: 0 }}>Logged</span>
    );
    if (source === 'task-completed') return (
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.ok, background: 'rgba(77,107,61,0.10)', padding: '2px 6px', borderRadius: 2, lineHeight: 1.2, flexShrink: 0 }}>Task done</span>
    );
    return null;
}

// ── Type chip (small icon square) ─────────────────────────────
function TypeChip({ kind, dim }) {
    const meta = getTypeMeta(kind);
    return (
        <div style={{ width: 24, height: 24, borderRadius: T.r, background: dim ? T.surface2 : '#fff', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: dim ? T.inkMuted : meta.color }}>
            {meta.icon}
        </div>
    );
}

// ── Outcome chip ───────────────────────────────────────────────
function OutcomeChip({ outcome }) {
    if (!outcome) return null;
    return (
        <span style={{ fontSize: 11, color: T.inkMid, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.inkMuted, flexShrink: 0 }}/>
            {outcome}
        </span>
    );
}

// ── 3px left rail wrapper ──────────────────────────────────────
function RailedRow({ children, railColor, bgTint }) {
    return (
        <div style={{ position: 'relative', background: bgTint || 'transparent' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: railColor }}/>
            {children}
        </div>
    );
}

// ── Section banner ─────────────────────────────────────────────
function SectionBanner({ eyebrow, title, subtitle, accent, dim, badges, icon }) {
    return (
        <div style={{ padding: '14px 18px 12px', background: dim ? T.surface2 : '#efe9dc', borderTop: `2px solid ${accent}`, borderBottom: `1px solid ${T.borderStrong}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 36, height: 36, borderRadius: 4, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{eyebrow}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontStyle: 'italic', letterSpacing: -0.2, lineHeight: 1.2 }}>{title}</div>
                {subtitle && <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>{subtitle}</div>}
            </div>
            {badges && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{badges}</div>}
        </div>
    );
}

// ── Sub-group header (Overdue / Today / Upcoming / day labels) ─
function SubGroupHeader({ label, count, accent, subtle }) {
    return (
        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.border}`, background: T.bg }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent || T.inkMuted, flexShrink: 0 }}/>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>{label}</span>
            <span style={{ fontSize: 11, color: T.inkMuted, fontWeight: 500 }}>{count}</span>
            {subtle && <span style={{ fontSize: 11, color: T.inkMuted }}>· {subtle}</span>}
        </div>
    );
}

// ── Open task row ──────────────────────────────────────────────
function OpenTaskRow({ task, isOverdue, opportunities, contacts, getStageColor, canEdit, handleCompleteTask, handleSaveTask, setViewingTask, setEditingTask, setShowTaskModal }) {
    const [hov,        setHov]        = useState(false);
    const [snoozeOpen, setSnoozeOpen] = useState(false);
    const [snoozeAnchorRect, setSnoozeAnchorRect] = useState(null);
    const [completing, setCompleting] = useState(false);
    const snoozeButtonRef = useRef(null);

    const opp     = task.opportunityId ? opportunities.find(o => o.id === task.opportunityId) : null;
    const contact = task.contactId     ? contacts.find(c => c.id === task.contactId)          : null;
    const account = opp?.account || task.account || '';
    const sc      = opp ? getStageColor(opp.stage) : null;
    const meta    = getTypeMeta(task.type);
    const isHigh  = (task.priority || '').toUpperCase() === 'HIGH';

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
            onMouseLeave={() => setHov(false)}
            onClick={() => setViewingTask(task)}
            style={{ display: 'grid', gridTemplateColumns: '22px 28px 1fr auto', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${T.border}`, alignItems: 'flex-start', cursor: 'pointer', fontFamily: T.sans, transition: 'background 80ms', background: hov ? T.surface2 : 'transparent', position: 'relative' }}
        >
            {/* Circle checkbox */}
            <div onClick={handleComplete} title="Mark complete" style={{ paddingTop: 2, flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${completing ? T.ok : isOverdue ? T.danger : T.borderStrong}`, background: completing ? T.ok : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canEdit ? 'pointer' : 'default', transition: 'all 120ms' }}>
                    {(hov || completing) && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={completing ? '#fff' : T.inkMuted} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                    )}
                </div>
            </div>

            {/* Type chip */}
            <div style={{ paddingTop: 2 }}>
                <TypeChip kind={task.type} dim={false}/>
            </div>

            {/* Title + meta */}
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{task.title}</span>
                    {task.autoGenerated && <span style={{ fontSize: 9, fontWeight: 700, color: T.goldInk, background: 'rgba(200,185,154,0.2)', padding: '1px 5px', borderRadius: 2, border: `1px solid ${T.gold}`, letterSpacing: 0.5 }}>AUTO</span>}
                </div>
                <div style={{ fontSize: 11.5, color: T.inkMid, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {account && <span style={{ fontWeight: 600, color: T.info }}>{account}</span>}
                    {contact && <><span style={{ color: T.border }}>·</span><span>{contact.firstName} {contact.lastName}</span></>}
                    {opp && (
                        <>
                            {(account || contact) && <span style={{ color: T.border }}>·</span>}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc?.text || T.inkMuted }}/>
                                {opp.stage}
                            </span>
                            <span style={{ color: T.border }}>·</span>
                            <span style={{ fontWeight: 600 }}>{fmtArr(opp.arr)}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Right: time + overdue + hover actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 2, flexShrink: 0 }}>
                {/* Hover actions */}
                {hov && canEdit && (
                    <>
                        <div ref={snoozeButtonRef} style={{ position: 'relative' }}>
                            <button onClick={e => {
                                    e.stopPropagation();
                                    if (snoozeButtonRef.current) {
                                        setSnoozeAnchorRect(snoozeButtonRef.current.getBoundingClientRect());
                                    }
                                    setSnoozeOpen(o => !o);
                                }} title="Snooze"
                                style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 11, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9h6l-4 5h4"/></svg>
                                Snooze
                            </button>
                            {snoozeOpen && <SnoozePicker task={task} onSnooze={handleSnooze} onClose={() => setSnoozeOpen(false)} anchorRect={snoozeAnchorRect}/>}
                        </div>
                        <button onClick={e => { e.stopPropagation(); setEditingTask(task); setShowTaskModal(true); }}
                            style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 11, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                            Edit
                        </button>
                    </>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, minWidth: 60 }}>
                    <span style={{ fontSize: 11.5, color: isOverdue ? T.danger : T.inkMid, fontWeight: isOverdue ? 600 : 500, whiteSpace: 'nowrap' }}>
                        {fmtDueTime(task.dueTime) || '—'}
                    </span>
                    {isOverdue && (
                        <span style={{ fontSize: 10, background: 'rgba(156,58,46,0.08)', color: T.danger, padding: '1px 5px', borderRadius: 2, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Overdue</span>
                    )}
                    {!isOverdue && isHigh && (
                        <span style={{ fontSize: 10, color: T.warn, fontWeight: 700 }}>HIGH</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Completed task row ─────────────────────────────────────────
function CompletedTaskRow({ task, opportunities, setViewingTask }) {
    const meta    = getTypeMeta(task.type);
    const opp     = task.opportunityId ? opportunities.find(o => o.id === task.opportunityId) : null;
    const account = opp?.account || task.account || '';
    const compIso = task.completedAt || task.updatedAt || null;

    return (
        <div
            onClick={() => setViewingTask(task)}
            style={{ display: 'grid', gridTemplateColumns: '22px 28px 1fr auto', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${T.border}`, alignItems: 'flex-start', cursor: 'pointer', opacity: 0.78 }}
            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            {/* Filled green check */}
            <div style={{ paddingTop: 2 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: T.ok, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                </div>
            </div>

            {/* Type chip (dim) */}
            <div style={{ paddingTop: 2 }}>
                <TypeChip kind={task.type} dim={true}/>
            </div>

            {/* Title + meta */}
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: T.inkMid, textDecoration: 'line-through', textDecorationColor: T.borderStrong, textDecorationThickness: 1 }}>{task.title}</span>
                    <SourceBadge source="task-completed"/>
                    {task.autoGenerated && <span style={{ fontSize: 9, fontWeight: 700, color: T.goldInk, background: 'rgba(200,185,154,0.2)', padding: '1px 5px', borderRadius: 2, letterSpacing: 0.5 }}>AUTO</span>}
                </div>
                <div style={{ fontSize: 11.5, color: T.inkMid, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {account && <span style={{ fontWeight: 600 }}>{account}</span>}
                    {opp && <><span style={{ color: T.border }}>·</span><span>{opp.stage} · {fmtArr(opp.arr)}</span></>}
                    <OutcomeChip outcome={task.outcome}/>
                </div>
            </div>

            {/* Right: clock + relative */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingTop: 2, minWidth: 60 }}>
                <span style={{ fontSize: 11.5, color: T.inkMid, whiteSpace: 'nowrap' }}>{compIso ? fmtClock(compIso) : '—'}</span>
                <span style={{ fontSize: 10.5, color: T.inkMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{compIso ? fmtAgo(compIso) : ''}</span>
            </div>
        </div>
    );
}

// ── Activity log row ───────────────────────────────────────────
function ActivityLogRow({ activity, opportunities, accounts, setViewingTask }) {
    // Resolve account: activity may have accountId directly, or via opportunityId
    const opp  = activity.opportunityId ? opportunities.find(o => o.id === activity.opportunityId) : null;
    const acct = activity.accountId
        ? accounts.find(a => a.id === activity.accountId)
        : opp ? accounts.find(a => a.id === opp.accountId) : null;
    const acctName = acct?.name || opp?.account || '';

    const loggedIso = activity.date
        ? activity.date + 'T12:00:00'
        : activity.createdAt || null;

    return (
        <div
            onClick={() => setViewingTask(activity)}
            style={{ display: 'grid', gridTemplateColumns: '22px 28px 1fr auto', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${T.border}`, alignItems: 'flex-start', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            {/* Type icon in soft circle */}
            <div style={{ paddingTop: 2 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: T.surface2, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ color: T.inkMid, transform: 'scale(0.85)' }}>{getTypeMeta(activity.type).icon}</div>
                </div>
            </div>

            {/* Type chip (dim) */}
            <div style={{ paddingTop: 2 }}>
                <TypeChip kind={activity.type} dim={true}/>
            </div>

            {/* Title + body + meta */}
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{activity.subject || activity.notes?.split('\n')[0] || 'Activity'}</span>
                    <SourceBadge source="log"/>
                </div>
                {/* Body quote — italic, 2-line clamp */}
                {activity.notes && (
                    <div style={{ fontSize: 12, color: T.inkMid, marginTop: 3, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
                        "{activity.notes}"
                    </div>
                )}
                <div style={{ fontSize: 11.5, color: T.inkMid, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {acctName && <span style={{ fontWeight: 600 }}>{acctName}</span>}
                    {opp && <><span style={{ color: T.border }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{opp.stage} · {fmtArr(opp.arr)}</span></>}
                    <OutcomeChip outcome={activity.outcome}/>
                    {activity.duration && <span style={{ color: T.inkMuted }}>{activity.duration}m</span>}
                </div>
            </div>

            {/* Right: clock + relative */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingTop: 2, minWidth: 60 }}>
                <span style={{ fontSize: 11.5, color: T.inkMid, whiteSpace: 'nowrap' }}>{loggedIso ? fmtClock(loggedIso) : '—'}</span>
                <span style={{ fontSize: 10.5, color: T.inkMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{loggedIso ? fmtAgo(loggedIso) : ''}</span>
            </div>
        </div>
    );
}

// ── Account picker dropdown ────────────────────────────────────
function AccountPicker({ accountOptions, value, onChange }) {
    const [open,  setOpen]  = useState(false);
    const [query, setQuery] = useState('');
    const ref     = useRef(null);
    const btnRef  = useRef(null);
    const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 260 });

    // Recompute dropdown position each time it opens so it escapes overflow:hidden parents
    const openDropdown = () => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(260, r.width) });
        }
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const selected = value === 'all' ? null : accountOptions.find(a => a.id === value);
    const q        = query.trim().toLowerCase();
    const filtered = q ? accountOptions.filter(a => a.name.toLowerCase().includes(q)) : accountOptions;

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && filtered.length > 0) {
            onChange(filtered[0].id);
            setOpen(false);
            setQuery('');
        }
        if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    };

    return (
        <div style={{ position: 'relative' }}>
            <button ref={btnRef} onClick={() => open ? setOpen(false) : openDropdown()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 12, fontWeight: 500, background: selected ? T.ink : T.surface, color: selected ? T.surface : T.inkMid, border: `1px solid ${selected ? T.ink : T.borderStrong}`, borderRadius: 4, cursor: 'pointer', maxWidth: 200, fontFamily: T.sans }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.name : 'All accounts'}</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>

            {open && (
                <div ref={ref} style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999, width: dropPos.width, maxHeight: 320, display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r+1, boxShadow: '0 8px 24px rgba(42,38,34,0.14)', overflow: 'hidden' }}>
                    <div style={{ padding: 8, borderBottom: `1px solid ${T.border}` }}>
                        <input autoFocus value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search accounts… or press Enter"
                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, color: T.ink, outline: 'none', fontFamily: T.sans, boxSizing: 'border-box' }}/>
                    </div>
                    <div style={{ overflow: 'auto', flex: 1 }}>
                        <button onClick={() => { onChange('all'); setOpen(false); setQuery(''); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', fontSize: 12, fontWeight: value === 'all' ? 700 : 500, background: value === 'all' ? T.surface2 : 'transparent', color: T.ink, border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={value === 'all' ? T.ok : 'transparent'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                            All accounts
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: T.inkMuted }}>{accountOptions.length}</span>
                        </button>
                        {filtered.map(a => (
                            <button key={a.id} onClick={() => { onChange(a.id); setOpen(false); setQuery(''); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', fontSize: 12, fontWeight: value === a.id ? 700 : 500, background: value === a.id ? T.surface2 : 'transparent', color: T.ink, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: T.sans }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={value === a.id ? T.ok : 'transparent'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.name}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ padding: '14px 12px', fontSize: 12, color: T.inkMuted, textAlign: 'center', fontFamily: T.sans }}>No matches.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── applyFilters — pure function ───────────────────────────────
// feed items each have: { id, source, kind/type, when, dueDate?, dueTime?, accountId?, oppId?, title, ... }
function applyFilters(feed, { source, type, range, account, scope, currentUser, opportunities, accounts }) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return feed.filter(it => {
        // Source filter
        if (source === 'open' && it.source !== 'task-open') return false;
        if (source === 'done' && it.source === 'task-open') return false;

        // Type filter (tasks use .type, activities use .type)
        if (type !== 'all' && (it.type || '').toLowerCase() !== type.toLowerCase()) return false;

        // Scope filter — Mine only for tasks; activities always shown under Mine for now
        if (scope === 'mine' && it.source === 'task-open') {
            if (it.assignedTo && it.assignedTo !== currentUser) return false;
        }

        // Account filter — keyed by name (tasks store account as name string via opp.account)
        if (account && account !== 'all') {
            const acctName = resolveAccountName(it, opportunities, accounts);
            if (!acctName || acctName !== account) return false;
        }

        // When / range filter
        // Overdue open tasks are always shown regardless of range — hiding them causes users to miss work.
        // Strategy: work entirely in local YYYY-MM-DD strings to avoid UTC offset bugs.
        // completedAt/updatedAt are UTC ISO strings — convert to local date string first.
        // dueDate is already a local YYYY-MM-DD string — use directly.
        const td0 = new Date();
        const todayDateStr0 = td0.getFullYear() + '-' + String(td0.getMonth()+1).padStart(2,'0') + '-' + String(td0.getDate()).padStart(2,'0');
        const isOverdueOpenTask = it.source === 'task-open' && it.dueDate && it.dueDate < todayDateStr0;

        if (range !== 'all' && !isOverdueOpenTask) {
            // Get the reference date string in local time (YYYY-MM-DD)
            let refDateStr;
            if (it.source === 'task-open' && it.dueDate) {
                refDateStr = it.dueDate; // already local YYYY-MM-DD
            } else {
                // Convert the when timestamp to local date string
                const d = new Date(it.when);
                refDateStr = d.getFullYear() + '-'
                    + String(d.getMonth() + 1).padStart(2, '0') + '-'
                    + String(d.getDate()).padStart(2, '0');
            }

            // today as local YYYY-MM-DD
            const td = new Date();
            const todayDateStr = td.getFullYear() + '-'
                + String(td.getMonth() + 1).padStart(2, '0') + '-'
                + String(td.getDate()).padStart(2, '0');

            if (range === 'today') {
                if (refDateStr !== todayDateStr) return false;
            }
            if (range === 'week') {
                // Sunday of current week through Saturday (inclusive)
                const todayD = new Date(todayDateStr + 'T00:00:00');
                const sunOffset = todayD.getDay(); // 0=Sun
                const weekSunStr = (() => { const d = new Date(todayD); d.setDate(d.getDate() - sunOffset); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
                const weekSatStr = (() => { const d = new Date(todayD); d.setDate(d.getDate() + (6 - sunOffset)); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
                if (refDateStr < weekSunStr || refDateStr > weekSatStr) return false;
            }
            if (range === 'month') {
                // Same YYYY-MM prefix
                if (refDateStr.slice(0, 7) !== todayDateStr.slice(0, 7)) return false;
            }
        }

        return true;
    });
}

// Resolve account name string for a feed item (task or activity).
// Tasks link to accounts via opp.account (a name string), not an ID.
// We use name as the canonical filter key throughout to stay consistent.
function resolveAccountName(item, opportunities, accounts) {
    // Direct accountId on the item (activities)
    if (item.accountId) {
        const a = accounts.find(a => a.id === item.accountId);
        if (a) return a.name;
    }
    // Via opportunityId
    if (item.opportunityId) {
        const opp = opportunities.find(o => o.id === item.opportunityId);
        if (opp) {
            // opp.accountId present
            if (opp.accountId) {
                const a = accounts.find(a => a.id === opp.accountId);
                if (a) return a.name;
            }
            // opp.account is a name string (most common in this codebase)
            if (opp.account) return opp.account;
        }
    }
    // Direct account name on item (tasks sometimes store this)
    if (item.account) return item.account;
    return null;
}

// Group activity/completed items by ISO day, newest first
function groupByDay(items) {
    const map = new Map();
    for (const it of items) {
        if (!it.when) continue;
        const day = it.when.split('T')[0];
        if (!map.has(day)) map.set(day, []);
        map.get(day).push(it);
    }
    return [...map.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([day, dayItems]) => ({ day, items: dayItems.sort((a, b) => (b.when || '').localeCompare(a.when || '')) }));
}

// ── Main TasksTab ──────────────────────────────────────────────
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

    // ── Persistent view state ──────────────────────────────────
    const [view, setView] = useState(() => localStorage.getItem('tab:tasks:subView') || 'list');
    const setViewPersist  = v => { setView(v); localStorage.setItem('tab:tasks:subView', v); };

    // ── Calendar state (unchanged) ─────────────────────────────
    const [calDayOffset, setCalDayOffset] = useState(0);

    // ── Unified list filter state ──────────────────────────────
    // source: 'all' | 'open' | 'done' | 'log'
    const [source,  setSource]  = useState('all');
    const [type,    setType]    = useState('all');
    const [scope,   setScope]   = useState('mine');
    const [range,   setRange]   = useState('week');
    const [account, setAccount] = useState('all');

    // ── Dates ──────────────────────────────────────────────────
    const today    = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
    const todayStr = useMemo(() => today.toISOString().split('T')[0], [today]);
    const calDay   = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + calDayOffset); return d; }, [today, calDayOffset]);
    const calDayStr = useMemo(() => calDay.toISOString().split('T')[0], [calDay]);
    const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const weekStart = useMemo(() => {
        const d = new Date(calDay); d.setDate(d.getDate() - d.getDay()); return d;
    }, [calDay]);

    // ── Task types from settings ───────────────────────────────
    const taskTypes = useMemo(() => {
        const fromSettings = settings?.taskTypes || settings?.activityTypes || [];
        const base = ['Call','Email','Meeting','Follow-up','Demo','Note'];
        return [...new Set([...base, ...fromSettings])];
    }, [settings]);

    // ── Build the unified feed ────────────────────────────────
    // Each item gets: { id, source, type, when, dueDate?, dueTime?, title, opportunityId?, accountId?, outcome?, notes?, ... }
    const allFeedItems = useMemo(() => {
        const items = [];

        // Open tasks
        const openTasks = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed');
        openTasks.forEach(t => items.push({
            ...t,
            source: 'task-open',
            when: t.dueDate ? t.dueDate + 'T' + (t.dueTime || '12:00') + ':00' : new Date().toISOString(),
        }));

        // Completed tasks
        const completedTasks = visibleTasks.filter(t => {
            const s = t.status || (t.completed ? 'Completed' : 'Open');
            return s === 'Completed';
        });
        completedTasks.forEach(t => items.push({
            ...t,
            source: 'task-completed',
            when: t.completedAt || t.updatedAt || (t.dueDate ? t.dueDate + 'T12:00:00' : new Date().toISOString()),
        }));

        // Activity logs
        const visibleActivities = canSeeAll
            ? (activities || [])
            : (activities || []).filter(a => !a.author || a.author === currentUser);
        visibleActivities.forEach(a => items.push({
            ...a,
            source: 'log',
            type: a.type || 'Note',
            when: a.date ? a.date + 'T12:00:00' : (a.createdAt || new Date().toISOString()),
        }));

        return items;
    }, [visibleTasks, activities, canSeeAll, currentUser]);

    // ── Unfiltered counts for the segmented control badges ────
    // Per spec: counts derived from UNFILTERED feed so they don't shift
    const rawCounts = useMemo(() => ({
        all:       allFeedItems.length,
        open:      allFeedItems.filter(f => f.source === 'task-open').length,
        completed: allFeedItems.filter(f => f.source !== 'task-open').length,
    }), [allFeedItems]);

    // ── Header counters (also unfiltered, per spec) ────────────
    const headerCounts = useMemo(() => ({
        overdue:   allFeedItems.filter(f => f.source === 'task-open' && f.dueDate && f.dueDate < todayStr).length,
        dueToday:  allFeedItems.filter(f => f.source === 'task-open' && f.dueDate === todayStr).length,
        completed: allFeedItems.filter(f => f.source !== 'task-open').length,
    }), [allFeedItems, todayStr]);

    // ── Account options for the picker ─────────────────────────
    const accountOptions = useMemo(() => {
        const seen = new Set();
        allFeedItems.forEach(it => {
            const name = resolveAccountName(it, opportunities, accounts);
            if (name) seen.add(name);
        });
        return [...seen].sort((a, b) => a.localeCompare(b)).map(name => ({ id: name, name }));
    }, [allFeedItems, opportunities, accounts]);

    // ── Apply all filters ──────────────────────────────────────
    const filtered = useMemo(() => applyFilters(allFeedItems, { source, type, range, account, scope, currentUser, opportunities, accounts }), [allFeedItems, source, type, range, account, scope, currentUser, opportunities, accounts]);

    // ── Split filtered into open tasks vs activity section ─────
    const openItems      = filtered.filter(f => f.source === 'task-open');
    const activityItems  = filtered.filter(f => f.source !== 'task-open');

    // Open task buckets
    const { overdue, todayOpen, upcoming } = useMemo(() => {
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const sortByDateTime = (a, b) => ((a.dueDate||'') + (a.dueTime||'')).localeCompare((b.dueDate||'') + (b.dueTime||''));
        return {
            overdue:  openItems.filter(t => t.dueDate && new Date(t.dueDate+'T12:00:00') < today).sort(sortByDateTime),
            todayOpen: openItems.filter(t => t.dueDate === todayStr).sort((a,b) => (a.dueTime||'').localeCompare(b.dueTime||'')),
            upcoming: openItems.filter(t => t.dueDate && new Date(t.dueDate+'T12:00:00') >= tomorrow).sort(sortByDateTime),
        };
    }, [openItems, today, todayStr]);

    // Activity section: group by day descending
    const activityDays = useMemo(() => groupByDay(activityItems), [activityItems]);

    // Section visibility
    const showOpen     = source === 'all' || source === 'open';
    const showActivity = source === 'all' || source === 'done';

    // ── Calendar state (unchanged) ─────────────────────────────
    const allOpenTasks  = visibleTasks.filter(t => (t.status||'Open') !== 'Completed');
    const calTodayTasks = useMemo(() => allOpenTasks.filter(t => t.dueDate === calDayStr && t.dueTime), [allOpenTasks, calDayStr]);
    const unscheduled   = useMemo(() => allOpenTasks.filter(t => !t.dueTime), [allOpenTasks]);
    const calEvts       = useMemo(() => (calendarEvents||[]).filter(ev => { const d = ev.start?.date||ev.start?.dateTime?.split('T')[0]; return d === calDayStr; }).sort((a,b) => (a.start?.dateTime||'').localeCompare(b.start?.dateTime||'')), [calendarEvents, calDayStr]);

    const weekSummary = useMemo(() => Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
        const ds = d.toISOString().split('T')[0];
        return {
            d, ds,
            dayTasks:    allOpenTasks.filter(t => t.dueDate === ds).length,
            dayMeetings: (calendarEvents||[]).filter(ev => { const evd = ev.start?.date||ev.start?.dateTime?.split('T')[0]; return evd === ds; }).length,
        };
    }), [weekStart, allOpenTasks, calendarEvents]);

    // ── Handlers ───────────────────────────────────────────────
    const handleAddTask = () => { setEditingTask(null); setShowTaskModal(true); };

    // Row props bundle for OpenTaskRow
    const rowProps = { opportunities, contacts, getStageColor, canEdit, handleCompleteTask, handleSaveTask, setViewingTask, setEditingTask, setShowTaskModal };

    // ── Sub-tab views config ───────────────────────────────────
    const views = [
        { id: 'list',     label: 'List',      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
        { id: 'calendar', label: 'Calendar',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
        { id: 'voicelog', label: 'Voice log', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg> },
    ];

    // ── Filter rail ────────────────────────────────────────────
    const FilterRail = () => (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, marginBottom: 0, overflow: 'hidden' }}>
            {/* LINE 1: source segmented · scope · when · account */}
            <div style={{ padding: '10px 14px 7px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${T.border}` }}>

                {/* Source segmented control */}
                <div style={{ display: 'inline-flex', borderRadius: T.r, border: `1px solid ${T.borderStrong}`, overflow: 'hidden', background: T.bg, flexShrink: 0 }}>
                    {[
                        { k: 'all',  l: 'All',         n: rawCounts.all,       icon: null },
                        { k: 'open', l: 'Open tasks',  n: rawCounts.open,      icon: null },
                        { k: 'done', l: 'Completed',   n: rawCounts.completed, icon: 'check' },
                    ].map(s => {
                        const active = source === s.k;
                        return (
                            <button key={s.k} onClick={() => setSource(s.k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: 'none', cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms', whiteSpace: 'nowrap' }}>
                                {s.icon === 'check' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                                {s.icon === 'edit'  && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                                {s.l}
                                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }}/>

                {/* Scope: Mine / Team */}
                {['mine', 'team'].map(s => (
                    <button key={s} onClick={() => setScope(s)} style={{ padding: '4px 10px', fontSize: 12, fontWeight: scope === s ? 700 : 500, background: scope === s ? T.ink : 'transparent', color: scope === s ? T.surface : T.inkMid, border: `1px solid ${scope === s ? T.ink : T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms', textTransform: 'capitalize' }}>
                        {s === 'mine' ? 'Mine' : 'Team'}
                    </button>
                ))}

                {/* Divider */}
                <div style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }}/>

                {/* When label */}
                <span style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 0 }}>When</span>

                {/* Range pills */}
                {[
                    { k: 'today', l: 'Today' },
                    { k: 'week',  l: 'This week' },
                    { k: 'month', l: 'This month' },
                    { k: 'all',   l: 'All time' },
                ].map(r => (
                    <button key={r.k} onClick={() => setRange(r.k)} style={{ padding: '4px 10px', fontSize: 12, fontWeight: range === r.k ? 700 : 500, background: range === r.k ? T.ink : 'transparent', color: range === r.k ? T.surface : T.inkMid, border: `1px solid ${range === r.k ? T.ink : T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms', whiteSpace: 'nowrap' }}>
                        {r.l}
                    </button>
                ))}

                {/* Divider */}
                <div style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }}/>

                {/* Account picker */}
                <AccountPicker accountOptions={accountOptions} value={account} onChange={setAccount}/>
            </div>

            {/* LINE 2: Type pills */}
            <div style={{ padding: '7px 14px 8px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 0 }}>Type</span>
                <button onClick={() => setType('all')} style={{ padding: '4px 10px', fontSize: 12, fontWeight: type === 'all' ? 700 : 500, background: type === 'all' ? T.ink : 'transparent', color: type === 'all' ? T.surface : T.inkMid, border: `1px solid ${type === 'all' ? T.ink : T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms', flexShrink: 0 }}>
                    All
                </button>
                {taskTypes.map(tt => {
                    const active = type === tt.toLowerCase() || type === tt;
                    const meta   = getTypeMeta(tt);
                    return (
                        <button key={tt} onClick={() => setType(active ? 'all' : tt)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: `1px solid ${active ? T.ink : T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            <span style={{ color: active ? T.surface : meta.color }}>{meta.icon}</span>
                            {tt}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    // ── Unified List View ──────────────────────────────────────
    const ListView = () => {
        const todayLabel     = new Date(today).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const isEmpty        = (!showOpen || openItems.length === 0) && (!showActivity || activityDays.length === 0) && filtered.length === 0;

        // Section badge helper
        const Badge = ({ children, color, bg }) => (
            <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '4px 10px', borderRadius: 12 }}>{children}</span>
        );

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>

                {/* ═══ TASKS — open work ═══ */}
                {showOpen && openItems.length > 0 && (
                    <>
                        <SectionBanner
                            eyebrow="To do"
                            title="Tasks"
                            subtitle="Things you owe — sorted by when they're due"
                            accent={T.goldInk}
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                            badges={
                                <>
                                    {overdue.length > 0 && <Badge color={T.danger} bg="rgba(156,58,46,0.10)">{overdue.length} overdue</Badge>}
                                    <Badge color={T.ink} bg={T.surface}><span style={{ border: `1px solid ${T.border}`, padding: '4px 10px', borderRadius: 12, display: 'inline-block', margin: '-4px -10px' }}>{openItems.length} open</span></Badge>
                                </>
                            }
                        />

                        {/* Overdue sub-group */}
                        {overdue.length > 0 && (
                            <>
                                <SubGroupHeader label="Overdue" count={overdue.length} accent={T.danger} subtle="Clear these first"/>
                                <div style={{ background: 'rgba(156,58,46,0.025)' }}>
                                    {overdue.map(t => (
                                        <RailedRow key={t.id} railColor={T.danger}>
                                            <OpenTaskRow task={t} isOverdue={true} {...rowProps}/>
                                        </RailedRow>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Today sub-group */}
                        {todayOpen.length > 0 && (
                            <>
                                <SubGroupHeader label="Today" count={todayOpen.length} accent={T.ok} subtle={todayLabel}/>
                                {todayOpen.map(t => (
                                    <RailedRow key={t.id} railColor={T.gold}>
                                        <OpenTaskRow task={t} isOverdue={false} {...rowProps}/>
                                    </RailedRow>
                                ))}
                            </>
                        )}

                        {/* Upcoming — only when source === 'open' per spec */}
                        {upcoming.length > 0 && source === 'open' && (
                            <>
                                <SubGroupHeader label="Upcoming" count={upcoming.length} accent={T.gold}/>
                                {upcoming.slice(0, 5).map(t => (
                                    <RailedRow key={t.id} railColor={T.gold}>
                                        <OpenTaskRow task={t} isOverdue={false} {...rowProps}/>
                                    </RailedRow>
                                ))}
                                {upcoming.length > 5 && (
                                    <div style={{ padding: '10px 16px', fontSize: 12, color: T.inkMuted, textAlign: 'center', borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }}>
                                        {upcoming.length - 5} more upcoming — switch to "Open tasks" to see all
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

            </div>
            {/* ═══ COMPLETED — separate card with gap above ═══ */}
            {showActivity && activityDays.length > 0 && (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                    <>
                        <SectionBanner
                            eyebrow="Activity"
                            title="Completed &amp; logged"
                            subtitle="Done tasks and the calls, emails, meetings, and notes you've logged"
                            accent={T.goldInk}
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                            badges={
                                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.inkMid }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.ok }}/>
                                        <span style={{ fontWeight: 600, color: T.ink }}>{activityItems.filter(o => o.source === 'task-completed').length}</span> tasks completed
                                    </span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.gold }}/>
                                        <span style={{ fontWeight: 600, color: T.ink }}>{activityItems.filter(o => o.source === 'log').length}</span> activities logged
                                    </span>
                                </div>
                            }
                        />
                        <div style={{ background: T.surface2 }}>
                            {activityDays.map(({ day, items }) => (
                                <React.Fragment key={day}>
                                    <SubGroupHeader label={dayLabel(day)} count={items.length} accent={T.inkMuted}/>
                                    {items.map(it => (
                                        <RailedRow key={it.id} railColor={T.borderStrong}>
                                            {it.source === 'task-completed'
                                                ? <CompletedTaskRow task={it} opportunities={opportunities} setViewingTask={setViewingTask}/>
                                                : <ActivityLogRow activity={it} opportunities={opportunities} accounts={accounts} setViewingTask={setViewingTask}/>
                                            }
                                        </RailedRow>
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                    </>

                </div>
            )}
                {/* Empty state */}
                {isEmpty && (
                    <div style={{ textAlign: 'center', padding: '3.5rem 2rem', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                        <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>✓</div>
                        <div style={{ fontWeight: 600, color: T.ink, marginBottom: 6 }}>No items match these filters</div>
                        <div>Try widening the date range or clearing the account filter.</div>
                        {showOpen && canEdit && (
                            <button onClick={handleAddTask} style={{ marginTop: 16, background: 'none', border: 'none', color: T.info, cursor: 'pointer', fontFamily: T.sans, fontSize: 13, fontWeight: 600 }}>
                                + Add a task →
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ── Calendar view (completely unchanged) ───────────────────
    const CalendarView = () => {
        const hours    = Array.from({ length: 11 }, (_, i) => i + 8);
        const nowMins  = new Date().getHours() * 60 + new Date().getMinutes();
        const isToday  = calDayStr === todayStr;
        const HOUR_H   = 56;
        const TOP_OFFSET = 20;

        const timeToMins = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m||0); };
        const fmtHour    = h => { const ap = h >= 12 ? 'pm' : 'am'; return (h % 12 || 12) + ap; };
        const getTop     = (ts) => { const m = timeToMins(ts); return m === null ? null : TOP_OFFSET + (m - 8*60) * (HOUR_H/60); };

        const dlabel       = isToday ? 'Today' : `${dayNames[calDay.getDay()]}, ${monthNames[calDay.getMonth()]} ${calDay.getDate()}`;
        const timedCount   = calTodayTasks.length;
        const meetingCount = calEvts.length;

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
                                            <div style={{ width: 22, height: 22, borderRadius: T.r, background: meta.color+'22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color }}>{meta.icon}</div>
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
                            <div style={{ fontSize: 14, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, color: T.ink, lineHeight: 1 }}>{dlabel}</div>
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
                                <div style={{ flex: 1, borderLeft: `1px solid ${T.border}`, height: '100%' }}/>
                            </div>
                        ))}
                        {isToday && nowMins >= 8*60 && nowMins <= 18*60 && (
                            <div style={{ position: 'absolute', left: 44, right: 0, top: TOP_OFFSET + (nowMins - 8*60) * (HOUR_H/60), borderTop: `1.5px solid ${T.danger}`, zIndex: 3, pointerEvents: 'none' }}>
                                <div style={{ position: 'absolute', left: -5, top: -4, width: 8, height: 8, borderRadius: '50%', background: T.danger }}/>
                                <div style={{ position: 'absolute', right: 4, top: -8, fontSize: 8, color: T.danger, fontWeight: 700, fontFamily: T.sans }}>NOW</div>
                            </div>
                        )}
                        {calEvts.map((ev, i) => {
                            const startMins = ev.start?.dateTime ? (new Date(ev.start.dateTime).getHours()*60 + new Date(ev.start.dateTime).getMinutes()) : null;
                            const endMins   = ev.end?.dateTime   ? (new Date(ev.end.dateTime).getHours()*60   + new Date(ev.end.dateTime).getMinutes())   : startMins ? startMins + 60 : null;
                            if (startMins === null || startMins < 8*60 || startMins > 18*60) return null;
                            const top    = TOP_OFFSET + (startMins - 8*60) * (HOUR_H/60);
                            const height = Math.max(28, ((endMins||startMins+60) - startMins) * (HOUR_H/60));
                            const provider = ev.provider || (ev.htmlLink?.includes('google') ? 'GOOGLE' : 'OUTLOOK');
                            return (
                                <div key={ev.id||i} style={{ position: 'absolute', left: 48, right: 8, top, height, background: 'rgba(58,90,122,0.07)', border: '1.5px dashed rgba(58,90,122,0.3)', borderRadius: T.r, padding: '3px 8px', overflow: 'hidden', zIndex: 1 }}>
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
                        {calTodayTasks.map(t => {
                            const top  = getTop(t.dueTime);
                            const meta = getTypeMeta(t.type);
                            if (top === null) return null;
                            return (
                                <div key={t.id} onClick={() => setViewingTask(t)}
                                    style={{ position: 'absolute', left: 48, right: 8, top: top+2, height: 28, background: T.surface, border: `1px solid ${T.borderStrong}`, borderLeft: `3px solid ${meta.color}`, borderRadius: `0 ${T.r}px ${T.r}px 0`, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', zIndex: 2 }}>
                                    <span style={{ color: meta.color }}>{meta.icon}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{t.title}</span>
                                    <div style={{ marginLeft: 'auto', width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${T.borderStrong}`, flexShrink: 0 }}/>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT — Week summary rail */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ background: 'rgba(58,90,122,0.07)', border: '1px solid rgba(58,90,122,0.18)', borderRadius: T.r+1, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: calendarConnected ? T.ok : T.inkMuted, flexShrink: 0 }}/>
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
                                        <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>{dayNames[d.getDay()]}</div>
                                            <div style={{ fontSize: 16, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 400, color: isTodayDay ? T.ink : T.inkMid, lineHeight: 1 }}>{d.getDate()}</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: T.inkMid, fontFamily: T.sans, fontWeight: 500 }}>{dayTasks} task{dayTasks !== 1 ? 's' : ''}</div>
                                            <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{dayMeetings} meeting{dayMeetings !== 1 ? 's' : ''}</div>
                                        </div>
                                        {dayTasks > 0 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: isTodayDay ? T.info : T.borderStrong, flexShrink: 0 }}/>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ── Voice log placeholder (unchanged) ──────────────────────
    const VoiceLogView = () => (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
            Voice log coming soon.
        </div>
    );

    // ── Render ─────────────────────────────────────────────────
    return (
        <div className="tab-page" style={{ fontFamily: T.sans }}>

            {/* ── Page header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, paddingBottom: 12 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>
                        Tasks &amp; Activity
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {headerCounts.overdue > 0 && (
                            <><span style={{ color: T.danger, fontWeight: 600 }}>{headerCounts.overdue} overdue</span><span style={{ color: T.border }}>·</span></>
                        )}
                        <span><span style={{ fontWeight: 600, color: T.ink }}>{headerCounts.dueToday}</span> due today</span>
                        <span style={{ color: T.border }}>·</span>
                        <span><span style={{ fontWeight: 600, color: T.ink }}>{headerCounts.completed}</span> completed</span>
                        {calendarConnected && <><span style={{ color: T.border }}>·</span><span style={{ color: T.ok }}>calendar synced</span></>}
                    </div>
                </div>
                {/* Header action buttons */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {canEdit && (
                        <button onClick={handleAddTask} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.ink, border: 'none', color: T.surface, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                            New task
                        </button>
                    )}
                </div>
            </div>

            {/* ── Sub-tab switcher (style-guide underline pattern) ── */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
                {views.map(v => {
                    const active = view === v.id;
                    return (
                        <button key={v.id} onClick={() => setViewPersist(v.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent', background: 'transparent', color: active ? T.ink : T.inkMuted, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: T.sans, transition: 'color 120ms, border-color 120ms', whiteSpace: 'nowrap', marginBottom: -1 }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                            {v.icon}
                            {v.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Filter rail — list view only ── */}
            {view === 'list' && <FilterRail/>}

            {/* ── View content ── */}
            {view === 'list'     && <ListView/>}
            {view === 'calendar' && <CalendarView/>}
            {view === 'voicelog' && <VoiceLogView/>}

        </div>
    );
}
