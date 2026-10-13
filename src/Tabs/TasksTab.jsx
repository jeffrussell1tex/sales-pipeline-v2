import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';
import { canEditCrm } from '../utils/roles.js';
import { dbFetch, requestOrg, stillOrg } from '../utils/storage';
import { isoLocal } from '../utils/dateLocal';
import { T } from '../tokens.js';

// ── Design tokens ──────────────────────────────────────────────

// ── Helpers ─────────────────────────────────────────────────────
const fmtCurrency = v => {
    const n = parseFloat(v) || 0;
    return n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M'
        : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K'
        : '$' + n.toLocaleString();
};

const fmtTime = hhmm => {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':');
    const hh = parseInt(h, 10);
    const ampm = hh >= 12 ? 'pm' : 'am';
    const h12 = hh % 12 || 12;
    return h12 + (m && m !== '00' ? ':' + m : '') + ampm;
};

const fmtClock = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return h + (m === 0 ? '' : ':' + String(m).padStart(2, '0')) + ampm;
};

const fmtAgo = iso => {
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

// Compact day label for "Coming up" strip
const dayLabelShort = isoDay => {
    const d   = new Date(isoDay + 'T12:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(isoDay + 'T12:00:00') - now) / 86400000);
    if (diff === 0)  return 'Today';
    if (diff === 1)  return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short' });
};

// Group activity items by ISO day, newest first
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

function resolveAccountName(item, opportunities, accounts) {
    if (item.accountId) {
        const a = accounts.find(a => a.id === item.accountId);
        if (a) return a.name;
    }
    if (item.opportunityId) {
        const opp = opportunities.find(o => o.id === item.opportunityId);
        if (opp) {
            if (opp.accountId) {
                const a = accounts.find(a => a.id === opp.accountId);
                if (a) return a.name;
            }
            if (opp.account) return opp.account;
        }
    }
    if (item.account) return item.account;
    return null;
}

// For a logged activity, resolve the company to display: account / opp link first,
// then fall back to the (first) linked contact's company so contact-only activities
// still surface a company in the feed (matches the rail rollups).
function resolveActivityAccount(item, opportunities, accounts, contacts) {
    const base = resolveAccountName(item, opportunities, accounts);
    if (base) return base;
    const cid = (Array.isArray(item.contactIds) && item.contactIds[0]) || item.contactId;
    if (cid) {
        const c = (contacts || []).find(x => x.id === cid);
        if (c && c.company) return c.company;
    }
    return '';
}

// ── Type icon map ───────────────────────────────────────────────
const TYPE_META = {
    'Call':      { color: '#3a5a7a', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.65A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.94 6.94l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> },
    'Email':     { color: '#7a5a3c', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/></svg> },
    'Meeting':   { color: '#4d6b3d', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
    'Follow-up': { color: '#b87333', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> },
    'Demo':      { color: '#6b5a7a', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
    'Note':      { color: '#5a7a6b', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg> },
    'default':   { color: '#8a8378', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 9h6M9 13h4"/></svg> },
};
function getTypeMeta(type) {
    if (TYPE_META[type]) return TYPE_META[type];
    const t = (type || '').toLowerCase();
    if (t.includes('call'))   return TYPE_META.Call;
    if (t.includes('email'))  return TYPE_META.Email;
    if (t.includes('demo'))   return TYPE_META.Demo;
    if (t.includes('meet'))   return TYPE_META.Meeting;
    if (t.includes('follow')) return TYPE_META['Follow-up'];
    if (t.includes('note'))   return TYPE_META.Note;
    return TYPE_META.default;
}

// ── Snooze picker ────────────────────────────────────────────────
function SnoozePicker({ onSnooze, onClose, anchorRect }) {
    const ref = useRef(null);

    useEffect(() => {
        const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const POPOVER_H = 168;
    const POPOVER_W = 200;
    const MARGIN    = 8;
    const openUpward = anchorRect && (anchorRect.bottom + POPOVER_H + MARGIN > window.innerHeight);
    const top  = openUpward ? anchorRect.top - POPOVER_H - MARGIN : anchorRect.bottom + MARGIN;
    const left = Math.min(anchorRect.right - POPOVER_W, window.innerWidth - POPOVER_W - MARGIN);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const addDays = n => { const d = new Date(today); d.setDate(d.getDate() + n); return isoLocal(d); };
    const options = [
        { label: 'Tomorrow', sublabel: new Date(addDays(1) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), days: 1 },
        { label: '2 Days',   sublabel: new Date(addDays(2) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), days: 2 },
        { label: '3 Days',   sublabel: new Date(addDays(3) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), days: 3 },
        { label: '1 Week',   sublabel: new Date(addDays(7) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), days: 7 },
        { label: '2 Weeks',  sublabel: new Date(addDays(14) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), days: 14 },
    ];

    return (
        <div ref={ref} style={{ position: 'fixed', top, left, zIndex: 9999, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, boxShadow: '0 8px 24px rgba(42,38,34,0.15)', width: POPOVER_W, overflow: 'hidden', fontFamily: T.sans }}>
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

// ── QRow — the new clean task row ───────────────────────────────
// Module-scope component (NOT defined inside TasksTab) — avoids React #310 remount bug.
function QRow({ task, isOverdue, isCompleted, opportunities, canEdit, handleCompleteTask, setTasks, setViewingTask, setEditingTask, onOpen }) {
    const [hov, setHov]                   = useState(false);
    const [snoozeOpen, setSnoozeOpen]     = useState(false);
    const [snoozeRect, setSnoozeRect]     = useState(null);
    const [completing, setCompleting]     = useState(false);
    const snoozeRef                       = useRef(null);

    const opp     = task.opportunityId ? opportunities.find(o => o.id === task.opportunityId) : null;
    const account = opp?.account || task.account || '';
    const meta    = getTypeMeta(task.type);
    const timeStr = isCompleted
        ? fmtClock(task.completedAt || task.updatedAt || task.when)
        : fmtTime(task.dueTime);

    const handleComplete = async e => {
        e.stopPropagation();
        if (!canEdit || completing) return;
        setCompleting(true);
        try { await handleCompleteTask(task.id, 'Completed'); } finally { setCompleting(false); }
    };

    const handleSnooze = async newDate => {
        setSnoozeOpen(false);
        if (!canEdit) return;
        const updated = { ...task, dueDate: newDate, status: 'Open', completed: false };
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
        // dbFetch returns a Response — check ok, then parse. This used to read
        // `data?.task` straight off the Response (always undefined), so the
        // else branch reverted the snooze even when the server had saved it.
        try {
            const res = await dbFetch('/.netlify/functions/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!stillOrg(askedOrg)) return;
            setTasks(prev => prev.map(t => t.id === task.id ? (data.task || updated) : t));
        } catch {
            if (!stillOrg(askedOrg)) return;
            setTasks(prev => prev.map(t => t.id === task.id ? task : t));
        }
    };

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => { setHov(false); setSnoozeOpen(false); }}
            onClick={() => (onOpen || setViewingTask)(task)}
            style={{
                display: 'grid', gridTemplateColumns: '18px 1fr auto',
                gap: 12, padding: '11px 14px',
                borderBottom: `1px solid ${T.border}`,
                background: hov ? 'rgba(200,185,154,0.06)' : 'transparent',
                alignItems: 'center', cursor: 'pointer', position: 'relative',
                fontFamily: T.sans, transition: 'background 80ms',
            }}
        >
            {/* 2px overdue rail */}
            {isOverdue && !isCompleted && (
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: T.danger }}/>
            )}

            {/* Type icon — bare glyph, no chip */}
            <span style={{ color: isCompleted ? T.inkMuted : meta.color, display: 'flex', alignItems: 'center' }}>
                {meta.icon}
            </span>

            {/* Title + meta */}
            <div style={{ minWidth: 0 }}>
                <div style={{
                    fontSize: 13.5, fontWeight: isCompleted ? 500 : 600, color: T.ink,
                    lineHeight: 1.3,
                    textDecoration: isCompleted ? 'line-through' : 'none',
                    textDecorationColor: T.inkMuted,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{task.title}</div>
                <div style={{ fontSize: 11.5, color: T.inkMid, marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {account && <span style={{ fontWeight: 500 }}>{account}</span>}
                    {opp && (
                        <><span style={{ color: T.border }}>·</span>
                        <span style={{ color: T.inkMuted }}>{fmtCurrency(opp.arr)}</span></>
                    )}
                </div>
            </div>

            {/* Right: time or hover actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                {hov && canEdit && !isCompleted ? (
                    <>
                        {/* Snooze */}
                        <div ref={snoozeRef} style={{ position: 'relative' }}>
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    if (snoozeRef.current) setSnoozeRect(snoozeRef.current.getBoundingClientRect());
                                    setSnoozeOpen(o => !o);
                                }}
                                title="Snooze"
                                style={{ width: 26, height: 26, borderRadius: T.rMd, border: `1px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkMid} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9h6l-4 5h4"/></svg>
                            </button>
                            {snoozeOpen && snoozeRect && (
                                <SnoozePicker onSnooze={handleSnooze} onClose={() => setSnoozeOpen(false)} anchorRect={snoozeRect}/>
                            )}
                        </div>
                        {/* Done */}
                        <button
                            onClick={handleComplete}
                            title="Mark complete"
                            style={{ width: 26, height: 26, borderRadius: T.rMd, border: 'none', background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                        </button>
                    </>
                ) : (
                    <div style={{ fontSize: 12, color: isOverdue && !isCompleted ? T.danger : T.inkMid, fontWeight: isOverdue && !isCompleted ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>
                        {timeStr}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── applyFilters — unchanged logic, new signature ───────────────
function applyFilters(feed, { source, type, range, account, scope, search, currentUserId, opportunities, accounts }) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return feed.filter(it => {
        if (source === 'open' && it.source !== 'task-open') return false;
        if (source === 'done' && it.source === 'task-open') return false;
        if (type !== 'all' && (it.type || '').toLowerCase() !== type.toLowerCase()) return false;
        if (scope === 'mine' && it.source === 'task-open') {
            // Keys on the OWNER ID, never the display name (18b22) — a stale
            // name-string must not hide a row the server granted. Unassigned
            // (null `ownerId`) stays visible under Mine, matching the server's
            // read policy. currentUserId is null until `?me=true` resolves and
            // fails CLOSED for that window, the same direction as getCallerId.
            if (it.ownerId && it.ownerId !== currentUserId) return false;
        }
        if (account && account !== 'all') {
            const acctName = resolveAccountName(it, opportunities, accounts);
            if (!acctName || acctName !== account) return false;
        }
        if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            const acctName = (resolveAccountName(it, opportunities, accounts) || '').toLowerCase();
            const title    = (it.title || '').toLowerCase();
            const typeStr  = (it.type || '').toLowerCase();
            if (!title.includes(q) && !acctName.includes(q) && !typeStr.includes(q)) return false;
        }

        // When/range filter — overdue open tasks always shown
        const td0 = new Date();
        const todayDateStr0 = td0.getFullYear() + '-' + String(td0.getMonth() + 1).padStart(2, '0') + '-' + String(td0.getDate()).padStart(2, '0');
        const isOverdueOpenTask = it.source === 'task-open' && it.dueDate && it.dueDate < todayDateStr0;
        if (range !== 'all' && !isOverdueOpenTask) {
            let refDateStr;
            if (it.source === 'task-open' && it.dueDate) {
                refDateStr = it.dueDate;
            } else {
                const d = new Date(it.when);
                refDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            }
            const td = new Date();
            const todayDateStr = td.getFullYear() + '-' + String(td.getMonth() + 1).padStart(2, '0') + '-' + String(td.getDate()).padStart(2, '0');
            if (range === 'today' && refDateStr !== todayDateStr) return false;
            if (range === 'week') {
                const todayD     = new Date(todayDateStr + 'T00:00:00');
                const sunOffset  = todayD.getDay();
                const weekSunStr = (() => { const d = new Date(todayD); d.setDate(d.getDate() - sunOffset); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
                const weekSatStr = (() => { const d = new Date(todayD); d.setDate(d.getDate() + (6 - sunOffset)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
                if (refDateStr < weekSunStr || refDateStr > weekSatStr) return false;
            }
            if (range === 'month' && refDateStr.slice(0, 7) !== todayDateStr.slice(0, 7)) return false;
        }
        return true;
    });
}

// ── Calendar view (unchanged from original) ─────────────────────
// Defined at module scope to avoid remount
function CalendarView({ calDay, calDayStr, todayStr, today, weekStart, dayNames, monthNames, calendarConnected, calTodayTasks, unscheduled, calEvts, weekSummary, setCalDayOffset }) {
    const hours    = Array.from({ length: 11 }, (_, i) => i + 8);
    const nowMins  = new Date().getHours() * 60 + new Date().getMinutes();
    const isToday  = calDayStr === todayStr;
    const HOUR_H   = 56;
    const TOP_OFFSET = 20;

    const timeToMins = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    const fmtHour    = h => { const ap = h >= 12 ? 'pm' : 'am'; return (h % 12 || 12) + ap; };
    const getTop     = ts => { const m = timeToMins(ts); return m === null ? null : TOP_OFFSET + (m - 8 * 60) * (HOUR_H / 60); };

    const dlabel = isToday ? 'Today' : `${dayNames[calDay.getDay()]}, ${monthNames[calDay.getMonth()]} ${calDay.getDate()}`;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 190px', gap: 12, alignItems: 'start' }}>
            {/* Unscheduled rail */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 600 }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Unscheduled</div>
                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, lineHeight: 1.4, fontFamily: T.sans }}>Tasks without a specific time.</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                    {unscheduled.length === 0
                        ? <div style={{ padding: '16px 14px', fontSize: 11, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>All tasks have times</div>
                        : unscheduled.map(t => (
                            <div key={t.id} style={{ padding: '8px 14px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{t.title}</div>
                                <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, fontFamily: T.sans }}>{t.type}</div>
                            </div>
                        ))
                    }
                </div>
            </div>

            {/* Calendar grid */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => setCalDayOffset(o => o - 1)} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, padding: '4px 8px', cursor: 'pointer', fontFamily: T.sans, fontSize: 12, color: T.inkMid }}>‹</button>
                    <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 13, color: T.ink, fontFamily: T.sans }}>{dlabel}</div>
                    <button onClick={() => setCalDayOffset(o => o + 1)} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r, padding: '4px 8px', cursor: 'pointer', fontFamily: T.sans, fontSize: 12, color: T.inkMid }}>›</button>
                </div>
                <div style={{ position: 'relative', height: HOUR_H * hours.length + TOP_OFFSET, overflowY: 'auto' }}>
                    {isToday && (
                        <div style={{ position: 'absolute', left: 48, right: 0, top: TOP_OFFSET + (nowMins - 8 * 60) * (HOUR_H / 60), height: 2, background: T.danger, zIndex: 2 }}/>
                    )}
                    {hours.map(h => (
                        <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: TOP_OFFSET + (h - 8) * HOUR_H, height: HOUR_H, borderTop: `1px solid ${T.border}` }}>
                            <div style={{ position: 'absolute', left: 0, width: 44, fontSize: 10, color: T.inkMuted, padding: '2px 4px', fontFamily: T.sans }}>{fmtHour(h)}</div>
                        </div>
                    ))}
                    {calTodayTasks.map(t => {
                        const top = getTop(t.dueTime);
                        if (top === null) return null;
                        return (
                            <div key={t.id} style={{ position: 'absolute', left: 52, right: 8, top, height: 36, background: T.info, borderRadius: T.r, padding: '4px 8px', overflow: 'hidden', cursor: 'pointer', zIndex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', fontFamily: T.sans }}>{t.title}</div>
                            </div>
                        );
                    })}
                    {calEvts.map((ev, i) => {
                        const start = ev.start?.dateTime?.split('T')[1]?.slice(0, 5);
                        const top   = start ? getTop(start) : null;
                        if (top === null) return null;
                        return (
                            <div key={i} style={{ position: 'absolute', left: 52, right: 8, top, height: 32, background: T.ok, borderRadius: T.r, padding: '3px 8px', overflow: 'hidden', cursor: 'pointer', zIndex: 1, opacity: 0.85 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', fontFamily: T.sans }}>{ev.summary || 'Event'}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Week summary rail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: 'rgba(58,90,122,0.07)', border: '1px solid rgba(58,90,122,0.18)', borderRadius: T.rMd, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: calendarConnected ? T.ok : T.inkMuted, flexShrink: 0 }}/>
                    <div style={{ flex: 1 }}>
                        {calendarConnected
                            ? (<><div style={{ fontSize: 11, fontWeight: 600, color: T.ok, fontFamily: T.sans }}>Synced</div><div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>Google · 2m ago</div></>)
                            : (<div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>Calendar not connected</div>)
                        }
                    </div>
                </div>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'hidden' }}>
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
}

// ── Voice log placeholder ────────────────────────────────────────
function VoiceLogView() {
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
            Voice log coming soon.
        </div>
    );
}

// ── Main TasksTab ────────────────────────────────────────────────
export default function TasksTab() {
    const {
        tasks, opportunities, contacts, accounts, activities, settings,
        currentUserId, userRole,
        getStageColor,
        visibleTasks,
        handleCompleteTask, setTasks,
        calendarEvents, calendarConnected, calendarLoading,
        allPipelines, activePipeline,
        setEditingTask,
        taskRailId, setTaskRailId, taskRailMode, setTaskRailMode,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        setViewingTask,
        isMobile,
    } = useApp();

    // Who may change CRM records (src/utils/roles.js): Admin, Manager, a rep. A
    // Dispatcher and ReadOnly view; the server's requireWrite is the boundary.
    const canEdit    = canEditCrm(userRole);

    // ── Persistent view ────────────────────────────────────────
    const [view, setView] = useState(() => localStorage.getItem('tab:tasks:subView') || 'list');
    const setViewPersist  = v => { setView(v); localStorage.setItem('tab:tasks:subView', v); };

    // ── Calendar state ─────────────────────────────────────────
    const [calDayOffset, setCalDayOffset] = useState(0);

    // ── V4 filter state ────────────────────────────────────────
    // Persisted PREFERENCE only — never data (the localStorage hazards in §18
    // and §0A000.8 were cached DATA). An unrecognised stored value renders as
    // Mine rather than leaving the segmented control with no active state
    // (§16's unmatched-select rule).
    const [scope,  setScope]  = useState(() => localStorage.getItem('tab:tasks:scope') === 'all' ? 'all' : 'mine');
    const setScopePersist     = v => { setScope(v); localStorage.setItem('tab:tasks:scope', v); };
    // The date range is a preference too (Jeff, 14 Sep: All time reset to the default on
    // every return) — persisted like scope, validated on read (§16's unmatched-select rule).
    const TASK_RANGES = ['today', 'week', 'month', 'all'];
    const [range,  setRangeRaw] = useState(() => { const v = localStorage.getItem('tab:tasks:range'); return TASK_RANGES.includes(v) ? v : 'week'; });
    const setRange = v => { setRangeRaw(v); localStorage.setItem('tab:tasks:range', v); };
    const [search, setSearch] = useState('');
    const [activityOpen, setActivityOpen] = useState(false);
    const searchRef = useRef(null);

    // ── Dates ──────────────────────────────────────────────────
    const today    = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
    const todayStr = useMemo(() => isoLocal(today), [today]);
    const calDay   = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + calDayOffset); return d; }, [today, calDayOffset]);
    const calDayStr = useMemo(() => isoLocal(calDay), [calDay]);
    const dayNames   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const weekStart = useMemo(() => { const d = new Date(calDay); d.setDate(d.getDate() - d.getDay()); return d; }, [calDay]);

    // Today display string for the eyebrow
    const todayDisplay = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), []);

    // ── Build unified feed ─────────────────────────────────────
    const allFeedItems = useMemo(() => {
        const items = [];
        const openTasks = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed');
        openTasks.forEach(t => items.push({ ...t, source: 'task-open', when: t.dueDate ? t.dueDate + 'T' + (t.dueTime || '12:00') + ':00' : new Date().toISOString() }));
        const completedTasks = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) === 'Completed');
        completedTasks.forEach(t => items.push({ ...t, source: 'task-completed', when: t.completedAt || t.updatedAt || (t.dueDate ? t.dueDate + 'T12:00:00' : new Date().toISOString()) }));
        // No client-side author filter: the server scopes activities per role
        // (own + unassigned for a rep) since the 28 Aug GET-scoping batch, and
        // a name-based filter here could only HIDE rows the server granted
        // when a stale name-string mismatches (18b22).
        const visibleActivities = activities || [];
        visibleActivities.forEach(a => items.push({
            ...a,
            source: 'log',
            type:    a.type || 'Note',
            title:   a.title || a.notes || a.subject || a.type || 'Activity',
            account: a.account || resolveActivityAccount(a, opportunities, accounts, contacts),
            when:    a.date ? a.date + 'T12:00:00' : (a.createdAt || new Date().toISOString()),
        }));
        return items;
    }, [visibleTasks, activities, opportunities, accounts, contacts]);

    // ── Header counts (unfiltered) ─────────────────────────────
    const headerCounts = useMemo(() => ({
        overdue:   allFeedItems.filter(f => f.source === 'task-open' && f.dueDate && f.dueDate < todayStr).length,
        dueToday:  allFeedItems.filter(f => f.source === 'task-open' && f.dueDate === todayStr).length,
        completed: allFeedItems.filter(f => f.source !== 'task-open').length,
        logged:    allFeedItems.filter(f => f.source === 'log').length,
    }), [allFeedItems, todayStr]);

    // ── Apply filters ──────────────────────────────────────────
    const filtered = useMemo(() => applyFilters(allFeedItems, {
        source: 'all', type: 'all', range, account: 'all', scope, search, currentUserId, opportunities, accounts,
    }), [allFeedItems, range, scope, search, currentUserId, opportunities, accounts]);

    // ── Buckets ────────────────────────────────────────────────
    const openItems = filtered.filter(f => f.source === 'task-open');

    const { nowItems, upcomingItems, undatedItems } = useMemo(() => {
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const sortByDT = (a, b) => ((a.dueDate || '') + (a.dueTime || '')).localeCompare((b.dueDate || '') + (b.dueTime || ''));
        const overdue  = openItems.filter(t => t.dueDate && new Date(t.dueDate + 'T12:00:00') < today).sort(sortByDT);
        const todayOpen = openItems.filter(t => t.dueDate === todayStr).sort((a, b) => (a.dueTime || '').localeCompare(b.dueTime || ''));
        const upcoming  = openItems.filter(t => t.dueDate && new Date(t.dueDate + 'T12:00:00') >= tomorrow).sort(sortByDT);
        // A task saved without a due date matched none of the three buckets above
        // and was rendered NOWHERE on this tab while still showing on its deal (0.62).
        // Oldest first: the longer it has sat undated, the more it needs a date.
        const undated   = openItems.filter(t => !t.dueDate).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        return { nowItems: [...overdue, ...todayOpen], upcomingItems: upcoming, undatedItems: undated };
    }, [openItems, today, todayStr]);

    // Completed + logged for activity accordion
    const completedItems = filtered.filter(f => f.source === 'task-completed').sort((a, b) => (b.when || '').localeCompare(a.when || ''));
    const loggedItems    = filtered.filter(f => f.source === 'log').sort((a, b) => (b.when || '').localeCompare(a.when || ''));

    // ── Calendar data ──────────────────────────────────────────
    const allOpenTasks  = visibleTasks.filter(t => (t.status || 'Open') !== 'Completed');
    const calTodayTasks = useMemo(() => allOpenTasks.filter(t => t.dueDate === calDayStr && t.dueTime), [allOpenTasks, calDayStr]);
    const unscheduled   = useMemo(() => allOpenTasks.filter(t => !t.dueTime), [allOpenTasks]);
    const calEvts       = useMemo(() => (calendarEvents || []).filter(ev => {
        const d = ev.start?.date || ev.start?.dateTime?.split('T')[0]; return d === calDayStr;
    }).sort((a, b) => (a.start?.dateTime || '').localeCompare(b.start?.dateTime || '')), [calendarEvents, calDayStr]);
    const weekSummary   = useMemo(() => Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
        const ds = isoLocal(d);
        return { d, ds, dayTasks: allOpenTasks.filter(t => t.dueDate === ds).length, dayMeetings: (calendarEvents || []).filter(ev => { const evd = ev.start?.date || ev.start?.dateTime?.split('T')[0]; return evd === ds; }).length };
    }), [weekStart, allOpenTasks, calendarEvents]);

    // ── Row props ──────────────────────────────────────────────
    // Open a feed item with consistent behavior: a logged activity opens in the
    // Activity rail (edit) just like a task opens the task view. Look the activity
    // up fresh from `activities` so the rail gets the clean record, not the feed copy.
    const openFeedItem = (item) => {
        if (item && item.source === 'log') {
            const real = (activities || []).find(a => a.id === item.id) || item;
            setActivityInitialContext && setActivityInitialContext(null);
            setEditingActivity(real);
            setShowActivityModal(true);
        } else {
            setViewingTask(item);
        }
    };
    const qRowProps = { opportunities, canEdit, handleCompleteTask, setTasks, setViewingTask, setEditingTask, onOpen: openFeedItem };
    const handleAddTask = () => { setTaskRailId('new'); setTaskRailMode('new'); };

    // ── View tabs config ───────────────────────────────────────
    const views = [
        { id: 'list',     label: 'List',      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
        { id: 'calendar', label: 'Calendar',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
        { id: 'voicelog', label: 'Voice log', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg> },
    ];

    // ── Render ─────────────────────────────────────────────────
    return (
        <div className="tab-page" style={{ fontFamily: T.sans }}>

            {/* ── Page header — Slim variant ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, paddingBottom: 14 }}>
                <div style={{ flex: 1 }}>
                    {/* The page title, then the date, then the counts — the same title block
                        every tab uses (Jeff, 14 Sep: the date "moved under the Tasks label
                        and above the 0 due today"). */}
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>
                        Tasks
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>
                        Today is {todayDisplay}
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMid, marginTop: 4, display: 'flex', gap: 14, fontFamily: T.sans }}>
                        {headerCounts.overdue > 0 && <span><span style={{ color: T.danger, fontWeight: 700 }}>{headerCounts.overdue}</span> overdue</span>}
                        <span><span style={{ color: T.ink, fontWeight: 700 }}>{headerCounts.dueToday}</span> due today</span>
                        <span style={{ color: T.inkMuted }}>{headerCounts.completed} done this week</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {canEdit && (
                        <button onClick={handleAddTask} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: T.ink, border: 'none', color: T.surface, borderRadius: T.r, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.sans }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                            New task
                        </button>
                    )}
                </div>
            </div>

            {/* ── Sub-tab strip (underline pattern) ── */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 0 }}>
                {views.map(v => {
                    const active = view === v.id;
                    return (
                        <button key={v.id} onClick={() => setViewPersist(v.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent', background: 'transparent', color: active ? T.ink : T.inkMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: T.sans, transition: 'color 120ms, border-color 120ms', whiteSpace: 'nowrap', marginBottom: -1 }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                            {v.icon}{v.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Single filter row (list view only) ── */}
            {view === 'list' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface, borderBottom: `1px solid ${T.border}`, margin: '0 -32px', padding: '10px 32px', flexWrap: 'nowrap', overflowX: 'auto' }}>

                    {/* Scope segmented control */}
                    <div style={{ display: 'inline-flex', border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, overflow: 'hidden', flexShrink: 0 }}>
                        {[{ k: 'mine', l: 'Mine' }, { k: 'all', l: 'All' }].map(s => {
                            const active = scope === s.k;
                            return (
                                <button key={s.k} onClick={() => setScopePersist(s.k)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: 'none', cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>
                                    {s.l}
                                </button>
                            );
                        })}
                    </div>

                    <span style={{ fontSize: 11, color: T.border, flexShrink: 0 }}>|</span>

                    {/* Date-range pills */}
                    <div style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                        {[{ k: 'today', l: 'Today' }, { k: 'week', l: 'This week' }, { k: 'month', l: 'This month' }, { k: 'all', l: 'All time' }].map(r => {
                            const active = range === r.k;
                            return (
                                <button key={r.k} onClick={() => setRange(r.k)} style={{ padding: '5px 10px', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? T.bg : 'transparent', color: active ? T.ink : T.inkMid, border: active ? `1px solid ${T.borderStrong}` : '1px solid transparent', borderRadius: T.rMd, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms', whiteSpace: 'nowrap' }}>
                                    {r.l}
                                </button>
                            );
                        })}
                    </div>

                    <span style={{ fontSize: 11, color: T.border, flexShrink: 0 }}>|</span>

                    {/* Search input */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 12, color: T.inkMuted, background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rMd, minWidth: 220, flex: 1, maxWidth: 360 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Account, contact, type…"
                            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: T.ink, fontFamily: T.sans, width: '100%' }}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
                        )}
                    </div>

                    <div style={{ flex: 1, minWidth: 8 }}/>

                    {/* More button — placeholder for future filter sheet */}
                    <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, fontWeight: 500, color: T.inkMid, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: 'pointer', fontFamily: T.sans, flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18" strokeWidth="2"/></svg>
                        More
                    </button>
                </div>
            )}

            {/* ── View content ── */}
            {view === 'list' && (
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>

                    {/* ── NOW hero card (overdue + today) ── */}
                    <div style={{ background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, overflow: 'hidden', boxShadow: '0 1px 0 rgba(42,38,34,0.04)' }}>
                        {/* Card header */}
                        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${T.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: 0.8 }}>What's on your plate</div>
                                {nowItems.filter(t => t.dueDate && t.dueDate < todayStr).length > 0 && (
                                    <span style={{ fontSize: 10.5, fontWeight: 700, color: T.danger, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                                        {nowItems.filter(t => t.dueDate && t.dueDate < todayStr).length} need attention
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 26, fontFamily: T.serif, fontStyle: 'italic', color: T.ink, marginTop: 4, lineHeight: 1.1 }}>
                                {nowItems.length === 0
                                    ? 'Caught up. Nothing due.'
                                    : nowItems.length === 1 ? '1 thing to clear today.'
                                    : `${nowItems.length} things to clear today.`}
                            </div>
                        </div>
                        {/* Rows */}
                        {nowItems.length === 0 ? (
                            <div style={{ padding: '60px 22px', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                                You're all caught up. Go close something. ✦
                            </div>
                        ) : (
                            nowItems.map(t => (
                                <QRow key={t.id} task={t} isOverdue={!!(t.dueDate && t.dueDate < todayStr)} isCompleted={false} {...qRowProps}/>
                            ))
                        )}
                    </div>

                    {/* ── Coming up strip ── */}
                    {upcomingItems.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 4px 8px' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Coming up</div>
                                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{upcomingItems.length} this week</div>
                                <div style={{ flex: 1 }}/>
                                <button style={{ fontSize: 11, fontWeight: 500, color: T.goldInk, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.sans }}>
                                    See all →
                                </button>
                            </div>
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                {upcomingItems.slice(0, 4).map((t, i) => {
                                    const meta = getTypeMeta(t.type);
                                    const account = resolveAccountName(t, opportunities, accounts) || '';
                                    return (
                                        <div key={t.id}
                                            onClick={() => setViewingTask(t)}
                                            style={{ display: 'grid', gridTemplateColumns: '70px 18px 1fr auto', gap: 12, padding: '9px 14px', borderBottom: i < Math.min(upcomingItems.length, 4) - 1 ? `1px solid ${T.border}` : 'none', alignItems: 'center', fontSize: 12.5, cursor: 'pointer', fontFamily: T.sans }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,185,154,0.06)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{dayLabelShort(t.dueDate)}</div>
                                            <span style={{ color: meta.color, display: 'flex', alignItems: 'center' }}>{meta.icon}</span>
                                            <div style={{ color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.title}
                                                {account && <span style={{ color: T.inkMuted, fontWeight: 400 }}> · {account}</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: T.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(t.dueTime)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── No due date ── */}
                    {undatedItems.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 4px 8px' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>No due date</div>
                                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{undatedItems.length} open · pick a date to schedule</div>
                            </div>
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                {undatedItems.map((t, i) => {
                                    const meta = getTypeMeta(t.type);
                                    const account = resolveAccountName(t, opportunities, accounts) || '';
                                    return (
                                        <div key={t.id}
                                            onClick={() => setViewingTask(t)}
                                            style={{ display: 'grid', gridTemplateColumns: '70px 18px 1fr auto', gap: 12, padding: '9px 14px', borderBottom: i < undatedItems.length - 1 ? `1px solid ${T.border}` : 'none', alignItems: 'center', fontSize: 12.5, fontFamily: T.sans, cursor: 'pointer', transition: 'background 0.12s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,185,154,0.06)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>—</div>
                                            <span style={{ color: meta.color, display: 'flex', alignItems: 'center' }}>{meta.icon}</span>
                                            <div style={{ color: T.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.title}
                                                {account && <span style={{ color: T.inkMuted, fontWeight: 400 }}> · {account}</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: T.inkMuted }}>no date</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Recent activity accordion ── */}
                    <div>
                        <button
                            onClick={() => setActivityOpen(o => !o)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', fontSize: 12.5, background: T.surface, border: `1px solid ${T.border}`, borderRadius: activityOpen ? `${T.r}px ${T.r}px 0 0` : T.r, cursor: 'pointer', textAlign: 'left', fontFamily: T.sans, transition: 'border-radius 0ms' }}
                        >
                            {/* Chevron */}
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkMid} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 200ms', transform: activityOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Recent activity</div>
                            <div style={{ flex: 1 }}/>
                            <div style={{ fontSize: 11, color: T.inkMid, display: 'flex', gap: 14, fontFamily: T.sans }}>
                                <span>
                                    <span style={{ color: T.ok, fontWeight: 600, marginRight: 4 }}>●</span>
                                    {completedItems.length} tasks completed
                                </span>
                                <span>
                                    <span style={{ color: T.gold, fontWeight: 600, marginRight: 4 }}>●</span>
                                    {loggedItems.length} activities logged
                                </span>
                            </div>
                        </button>

                        {activityOpen && (
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderTop: 'none', borderRadius: `0 0 ${T.r}px ${T.r}px`, overflow: 'hidden' }}>
                                {completedItems.length === 0 && loggedItems.length === 0 ? (
                                    <div style={{ padding: '32px 18px', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                                        Nothing to show yet.
                                    </div>
                                ) : (
                                    [...completedItems.slice(0, 4), ...loggedItems.slice(0, 4)]
                                        .sort((a, b) => (b.when || '').localeCompare(a.when || ''))
                                        .slice(0, 6)
                                        .map(t => (
                                            <QRow
                                                key={t.id}
                                                task={t}
                                                isOverdue={false}
                                                isCompleted={true}
                                                {...qRowProps}
                                            />
                                        ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {view === 'calendar' && (
                <div style={{ marginTop: 24 }}>
                    <CalendarView
                        calDay={calDay}
                        calDayStr={calDayStr}
                        todayStr={todayStr}
                        today={today}
                        weekStart={weekStart}
                        dayNames={dayNames}
                        monthNames={monthNames}
                        calendarConnected={calendarConnected}
                        calTodayTasks={calTodayTasks}
                        unscheduled={unscheduled}
                        calEvts={calEvts}
                        weekSummary={weekSummary}
                        setCalDayOffset={setCalDayOffset}
                    />
                </div>
            )}

            {view === 'voicelog' && (
                <div style={{ marginTop: 24 }}>
                    <VoiceLogView/>
                </div>
            )}
        </div>
    );
}
