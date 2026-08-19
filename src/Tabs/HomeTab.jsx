import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { useAuth } from '@clerk/clerk-react';
import { quarterOf, quarterStartDate, quarterEndDate } from '../utils/quarters';
import { isoLocal } from '../utils/dateLocal';

// ─────────────────────────────────────────────────────────────
//  Design tokens (V1 — matches variation1.jsx TOKENS exactly)
// ─────────────────────────────────────────────────────────────
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
    serif:        'Georgia, "Tiempos", serif',
    rSm:          3,
    rMd:          4,
    rLg:          6,
};

const eyebrow = (color) => ({
    fontSize: 10, fontWeight: 700, color: color || T.inkMuted,
    letterSpacing: 1, textTransform: 'uppercase', fontFamily: T.sans,
});

const avatarBg = (name) => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h * 31 + (name||'').charCodeAt(i)) | 0;
    return p[Math.abs(h) % p.length];
};

const fmtArr = v => v >= 1000000 ? '$'+(v/1000000).toFixed(1)+'M' : v >= 1000 ? '$'+Math.round(v/1000)+'K' : '$'+(v||0).toLocaleString();

// ─────────────────────────────────────────────────────────────
//  QuotaBar
// ─────────────────────────────────────────────────────────────
function QuotaBar({ closedArr, commitArr, quota, label }) {
    const closedPct = quota > 0 ? Math.min(100, (closedArr / quota) * 100) : 0;
    const commitPct = quota > 0 ? Math.min(100 - closedPct, (commitArr / quota) * 100) : 0;

    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '1rem 1.25rem' }}>
            <div style={{ ...eyebrow(T.goldInk), marginBottom: '0.5rem' }}>{label || 'Q2 Quota'}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: '700', color: T.ink, fontFamily: T.sans, lineHeight: 1 }}>{fmtArr(closedArr)}</span>
                <span style={{ fontSize: '0.8125rem', color: T.inkMid, fontFamily: T.sans }}>of {fmtArr(quota)}</span>
            </div>
            <div style={{ height: '8px', background: T.border, borderRadius: '2px', overflow: 'hidden', marginBottom: '0.5rem', display: 'flex' }}>
                <div style={{ width: closedPct + '%', background: T.ink, height: '100%', transition: 'width 0.4s' }}/>
                <div style={{ width: commitPct + '%', background: T.gold, height: '100%', transition: 'width 0.4s' }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: T.ink, borderRadius: '1px' }}/>
                    Closed {Math.round(closedPct)}%
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: T.gold, borderRadius: '1px' }}/>
                    + Commit {Math.round(closedPct + commitPct)}%
                </span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  SpiffPanel — active incentives + this rep's own claims
// ─────────────────────────────────────────────────────────────
const spiffRate = (s) => {
    const amt = parseFloat(s.amount) || 0;
    if (s.type === 'pct')        return `${amt}% of deal ARR`;
    if (s.type === 'multiplier') return `${amt}× commission`;
    return `$${amt.toLocaleString()} flat`;
};

const CLAIM_STATUS = {
    pending:  { label: 'Pending',  color: T.warn   },
    approved: { label: 'Approved', color: T.ok     },
    rejected: { label: 'Rejected', color: T.danger },
    paid:     { label: 'Paid',     color: T.info   },
};

function SpiffPanel({ spiffs, claims }) {
    const active = (spiffs || []).filter(s => s.active);
    const mine   = [...(claims || [])].sort(
        (a, b) => new Date(b.claimedAt || 0) - new Date(a.claimedAt || 0)
    );
    // Nothing to say — don't take up a slot on the page.
    if (!active.length && !mine.length) return null;

    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '1rem 1.25rem' }}>
            <div style={{ ...eyebrow(T.goldInk), marginBottom: '0.75rem' }}>SPIFFs</div>

            {active.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: T.inkMuted, fontFamily: T.sans }}>
                    No active SPIFFs right now.
                </div>
            ) : active.map(s => (
                <div key={s.id} style={{ marginBottom: '0.625rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: T.ink, fontFamily: T.sans }}>
                            {s.name || 'Unnamed SPIFF'}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: T.goldInk, fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                            {spiffRate(s)}
                        </span>
                    </div>
                    {s.condition && (
                        <div style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans, marginTop: '2px' }}>
                            {s.condition}
                        </div>
                    )}
                </div>
            ))}

            {mine.length > 0 && (
                <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: `1px solid ${T.border}` }}>
                    <div style={{ ...eyebrow(), marginBottom: '0.5rem' }}>My claims</div>
                    {mine.map(c => {
                        const st = CLAIM_STATUS[c.status] || { label: c.status || 'Unknown', color: T.inkMuted };
                        return (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                                <span style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', color: T.inkMid, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.spiffName || 'SPIFF'}
                                    <span style={{ color: T.inkMuted }}> · {c.opportunityName || c.account || ''}</span>
                                </span>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: T.ink, fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                    {c.spiffType === 'multiplier' ? `${c.multiplier || 1}×` : `$${Math.round(c.amount || 0).toLocaleString()}`}
                                </span>
                                <span style={{ fontSize: '0.5625rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 6px', borderRadius: '999px', background: st.color + '22', color: st.color, fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                    {st.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  HomeTab
// ─────────────────────────────────────────────────────────────
export default function HomeTab() {
    const {
        opportunities, accounts, contacts, tasks, activities, settings,
        currentUser, userRole, canSeeAll, spiffClaims,
        getStageColor, getQuarter, getQuarterLabel,
        calculateDealHealth, getKpiColor,
        visibleOpportunities, visibleTasks, activePipeline, allPipelines, stages,
        handleCompleteTask,
        calendarEvents, calendarConnected, calendarLoading,
        setActiveTab, isMobile,
        setEditingOpp, setShowModal,
        setEditingTask, setShowTaskModal,
        setTaskRailId, setTaskRailMode,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepOppId, setMeetingPrepOppId,
    } = useApp();

    const { userId, orgId } = useAuth();
    const [calSrc, setCalSrc] = React.useState('all'); // 'all' | 'user' | 'org'
    const connectMyCalendar = () => {
        const qs = new URLSearchParams({ provider: 'google', scope: 'user', userId: userId || '', orgId: orgId || '', userRole: userRole || 'User' });
        window.location.href = '/.netlify/functions/calendar-oauth-start?' + qs.toString();
    };

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;

    // ── Date / greeting ──────────────────────────────────────
    const now        = new Date();
    // isoLocal, not toISOString(): the latter converts to UTC before formatting, so
    // west of Greenwich it returns TOMORROW's date all evening (UTC-5 from 7pm) and
    // east of it yesterday's all morning. todayStr drives todayTasks, so an evening
    // user saw tomorrow's tasks under "due today" and none of today's.
    const todayStr   = isoLocal(now);
    const today12    = new Date(todayStr + 'T12:00:00');
    // Company calendar (Settings → Company → Company calendar) acts as the corporate calendar.
    // Entries are stored as 'MMM D' (e.g. 'Jun 4'), so match on that.
    const todayMMMD = now.toLocaleString('en-US', { month: 'short' }) + ' ' + now.getDate();
    const todayCompanyEntries = [...(settings?.federalHolidays || []), ...(settings?.customHolidays || [])]
        .filter(h => h.date === todayMMMD);
    const hasCorpEvents = (calendarEvents || []).some(ev => ev.source === 'org') || todayCompanyEntries.length > 0;
    const firstName  = currentUser ? currentUser.split(' ')[0] : 'there';
    const hour       = now.getHours();
    const greeting   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dayNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Q and week come from utils/quarters.js, the same helper the Pipeline list
    // uses. This block previously computed `Math.floor(now.getMonth() / 3) + 1`,
    // a CALENDAR quarter that ignored settings.fiscalYearStart entirely: with an
    // October fiscal year, August rendered as Q3 when it is Q4. getQuarter was
    // already destructured from useApp() above and used correctly 140 lines below
    // for the quota card, so the fiscal rule was in scope and simply not called.
    //
    // Default 10 matches App.jsx, OpportunityModal, AnalyticsDashboard and
    // ReportsTab. NOTE: ListView.jsx:349 defaults to 1 instead, so an org that has
    // never set fiscalYearStart gets calendar quarters there and October quarters
    // everywhere else. Not fixed here — flagged for the consolidation pass.
    const fiscalStart = parseInt(settings?.fiscalYearStart) || 10;
    const todayQk     = quarterOf(todayStr, fiscalStart);
    const quarter     = todayQk ? todayQk.q : Math.floor(now.getMonth() / 3) + 1;

    // Weeks INTO the fiscal quarter, counted from its real first day. The old
    // `weekNum - (quarter - 1) * 13` assumed every quarter is exactly 13 weeks
    // from Jan 1, which drifts within a year and cannot follow a fiscal start.
    const qStart      = todayQk ? quarterStartDate(todayQk.fiscalYear, todayQk.q, fiscalStart) : new Date(now.getFullYear(), 0, 1);
    const qWeek       = Math.floor((today12 - qStart) / 86400000 / 7) + 1;
    const dateContext = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()} · Q${quarter} · Week ${qWeek}`;

    // ── Task / calendar data ──────────────────────────────────
    const openTasks    = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed');
    const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate + 'T12:00:00') < today12);
    const todayTasks   = openTasks.filter(t => t.dueDate === todayStr);

    const todayCalEvents = calendarConnected && calendarEvents
        ? calendarEvents
            .filter(ev => {
                const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
                return d === todayStr;
            })
            .filter(ev => calSrc === 'all' || (ev.source || 'user') === calSrc)
            .sort((a,b) => (a.start?.dateTime||'').localeCompare(b.start?.dateTime||''))
        : [];

    // Everything the calendar returned that has not happened yet. `todayCalEvents`
    // only covers today, so on a quiet day it is empty and the calendar becomes
    // invisible — which is exactly what made a freshly connected calendar look
    // broken.
    const upcomingCalEvents = calendarConnected && calendarEvents
        ? calendarEvents
            .filter(ev => {
                const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
                return d && d >= todayStr;
            })
            .sort((a, b) => (a.start?.dateTime || a.start?.date || '').localeCompare(b.start?.dateTime || b.start?.date || ''))
        : [];
    const nextCalEvent = upcomingCalEvents.find(ev => {
        const d = ev.start?.date || ev.start?.dateTime?.split('T')[0];
        return d > todayStr;
    });

    // ── "On Your Plate" — unified ordered list ────────────────
    // Order: overdue tasks → today calendar events → today tasks
    const plate = [];

    overdueTasks.forEach(t => {
        plate.push({
            type:      'task',
            urgency:   'overdue',
            timeLabel: 'Overdue',
            timeColor: T.danger,
            title:     t.title,
            sub:       [t.type, t.account || ''].filter(Boolean).join(' · ') || 'Task',
            arr:       null,
            stage:     null,
            ctaLabel:  'View task',
            // Inline complete — tasks only
            onComplete: canEdit ? () => handleCompleteTask(t.id || t._id) : null,
            onClick:   () => { setTaskRailId(t.id || t._id); setTaskRailMode('view'); },
            item:      t,
            isMeeting: false,
        });
    });

    todayCalEvents.forEach(ev => {
        const timeStr   = ev.start?.dateTime
            ? new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
            : 'All day';
        const linkedOpp = ev.oppId ? visibleOpportunities.find(o => o.id === ev.oppId) : null;
        plate.push({
            type:      'meeting',
            urgency:   'meeting',
            timeLabel: timeStr,
            timeColor: T.inkMid,
            title:     ev.summary,
            sub:       (ev.source === 'org' ? 'Corporate · ' : '') + (ev.attendees?.[0]?.displayName || ev.location || 'Meeting'),
            arr:       linkedOpp ? parseFloat(linkedOpp.arr)||0 : null,
            stage:     linkedOpp?.stage || null,
            // "Open prep" wires to Meeting Prep panel
            ctaLabel:  linkedOpp ? 'Open prep' : null,
            onComplete: null,
            onClick: linkedOpp
                ? () => {
                    setMeetingPrepEvent(ev);
                    setMeetingPrepOppId(linkedOpp.id);
                    setMeetingPrepOpen(true);
                }
                : null,
            item:      ev,
            isMeeting: true,
        });
    });

    // Corporate: company-calendar entries (holidays / company days) for today
    if (calSrc !== 'user') {
        todayCompanyEntries.forEach(h => {
            plate.push({
                type: 'meeting', urgency: 'meeting',
                timeLabel: 'All day', timeColor: T.inkMid,
                title: h.name, sub: 'Corporate · Company calendar',
                arr: null, stage: null, ctaLabel: null, onComplete: null, onClick: null,
                item: h, isMeeting: true,
            });
        });
    }

    todayTasks.filter(t => !overdueTasks.includes(t)).forEach(t => {
        const relOpp = t.opportunityId ? visibleOpportunities.find(o => o.id === t.opportunityId) : null;
        plate.push({
            type:      'task',
            urgency:   'today',
            timeLabel: t.dueTime || 'Today',
            timeColor: T.inkMid,
            title:     t.title,
            sub:       [t.type, relOpp?.account || t.account || ''].filter(Boolean).join(' · ') || 'Task',
            arr:       relOpp ? parseFloat(relOpp.arr)||0 : null,
            stage:     relOpp?.stage || null,
            ctaLabel:  relOpp ? 'Open deal' : 'View task',
            onComplete: canEdit ? () => handleCompleteTask(t.id || t._id) : null,
            onClick: relOpp
                ? () => { setEditingOpp(relOpp); setShowModal(true); }
                : () => { setTaskRailId(t.id || t._id); setTaskRailMode('view'); },
            item:      t,
            isMeeting: false,
        });
    });

    const plateCount   = plate.length;
    const overdueCount = overdueTasks.length;

    // ── Quota data ────────────────────────────────────────────
    const myUserObj      = (settings?.users || []).find(u => u.name === currentUser);
    const myAnnualQuota  = myUserObj?.annualQuota || 0;
    const quarterlyQuota = myAnnualQuota / 4;

    // Always scoped to current user — canSeeAll Admins/Managers still see their own home
    const myOpps         = visibleOpportunities.filter(o => !o.salesRep || o.salesRep === currentUser);
    const myClosedWonARR = myOpps.filter(o => o.stage === 'Closed Won').reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const myCommitARR    = myOpps.filter(o => ['Negotiation','Closing','Negotiation/Review','Contracts'].includes(o.stage)).reduce((s,o) => s+(parseFloat(o.arr)||0), 0);

    // Quarter label
    const qLabel = (() => {
        const quarterlyData = {};
        visibleOpportunities.forEach(opp => {
            if (opp.forecastedCloseDate) {
                const q  = getQuarter(opp.forecastedCloseDate);
                const ql = getQuarterLabel(q, opp.forecastedCloseDate);
                if (!quarterlyData[ql]) quarterlyData[ql] = 0;
                quarterlyData[ql] += opp.arr || 0;
            }
        });
        const sorted = Object.keys(quarterlyData);
        return sorted.length > 0 ? sorted[0] : `Q${quarter}`;
    })();

    // ── Pipeline summary (greeting subline) ───────────────────
    const activeMyOpps = myOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const activePipelineARR = activeMyOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);

    // Closing this quarter (for "This Week" 4th tile)
    // Fiscal quarter window, not the calendar one. With an October fiscal start the
    // two happen to coincide because the boundaries line up; with a start month of
    // 2, 3, 5, 6, 8, 9, 11 or 12 they do not, and this tile would have counted the
    // wrong three months. isoLocal rather than toISOString: the latter converts to
    // UTC first, so west of Greenwich it returns tomorrow's date all evening.
    const quarterStart = isoLocal(todayQk ? quarterStartDate(todayQk.fiscalYear, todayQk.q, fiscalStart) : new Date(now.getFullYear(), (quarter-1)*3, 1));
    const quarterEnd   = isoLocal(todayQk ? quarterEndDate(todayQk.fiscalYear, todayQk.q, fiscalStart)   : new Date(now.getFullYear(), quarter*3, 0));
    const closingThisQ = myOpps.filter(o => {
        const cd = o.forecastedCloseDate || o.closeDate || '';
        return cd >= quarterStart && cd <= quarterEnd && !['Closed Won','Closed Lost'].includes(o.stage);
    });
    const closingThisQARR = closingThisQ.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);

    // ── Activity feed ─────────────────────────────────────────
    // Always filter to current user regardless of role — Home is a personal dashboard
    const myActivities = (activities||[]).filter(a => a.salesRep === currentUser || a.author === currentUser);

    const recentFeed = [...myActivities]
        .sort((a,b) => (b.date||'').localeCompare(a.date||''))
        .slice(0, 5);

    const fmtRelDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T12:00:00');
        const diffDays = Math.floor((now - d) / 86400000);
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1d ago';
        if (diffDays < 7)  return diffDays + 'd ago';
        if (diffDays < 30) return Math.floor(diffDays/7) + 'wk ago';
        return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    };

    // ── "This Week" stats ─────────────────────────────────────
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0,0,0,0);
    // Local midnight Sunday. toISOString() happens to survive this in negative UTC
    // offsets and loses a day in positive ones (Tokyo midnight is the previous day
    // in UTC), so it was right in Chicago and wrong in Sydney.
    const weekStartStr = isoLocal(weekStart);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(weekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setMilliseconds(-1);
    const prevWeekStartStr = isoLocal(prevWeekStart);
    // prevWeekEnd is Saturday 23:59:59.999 LOCAL, which in UTC-5 is Sunday 04:59
    // UTC — so toISOString() returned THIS Sunday and the previous-week range ran
    // [lastSunday .. thisSunday] inclusive, overlapping the current week by a day.
    // Today's activities were counted in both, inflating prevWeekActs and skewing
    // the delta arrow on the "This week" tile.
    const prevWeekEndStr   = isoLocal(prevWeekEnd);

    const weekActs      = myActivities.filter(a => a.date >= weekStartStr);
    const prevWeekActs  = myActivities.filter(a => a.date >= prevWeekStartStr && a.date <= prevWeekEndStr);
    const actDelta      = weekActs.length - prevWeekActs.length;

    const weekCompletedTasks = visibleTasks.filter(t => {
        const done = t.status === 'Completed' || t.completed;
        const comp = t.completedDate || t.updatedAt || '';
        return done && comp >= weekStartStr;
    });
    const stillOpenTasks = openTasks.length;

    const dealsAdvanced = visibleOpportunities.filter(o => {
        const sc = o.stageChangedDate || '';
        return sc >= weekStartStr && !['Closed Won','Closed Lost'].includes(o.stage);
    });
    const advancedNames = dealsAdvanced.slice(0,3).map(o => (o.opportunityName || o.account || '').split(' — ')[0]).join(', ');

    // ── "Worth Your Attention" ────────────────────────────────
    const worthAttention = (() => {
        const items = [];
        const activeOpps = visibleOpportunities.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');

        activeOpps.forEach(opp => {
            const oppActs     = (activities||[]).filter(a => a.opportunityId === opp.id).sort((a,b) => (b.date||'').localeCompare(a.date||''));
            const lastActDate = oppActs[0]?.date || opp.createdDate;
            const daysSinceAct = lastActDate ? Math.floor((now - new Date(lastActDate + 'T12:00:00'))/86400000) : null;
            const arr          = parseFloat(opp.arr) || 0;
            const name         = opp.opportunityName || opp.account || 'Unnamed';

            // Stalled
            if (daysSinceAct !== null && daysSinceAct >= 14) {
                items.push({
                    id: `stale-${opp.id}`, priority: daysSinceAct >= 21 ? 0 : 1,
                    category: 'Stalled deal', categoryColor: T.danger,
                    title: `${name} — ${daysSinceAct} days silent`,
                    body: `${fmtArr(arr)} in ${opp.stage} stage. Last ${oppActs[0]?.type?.toLowerCase() || 'email'} unanswered.`,
                    onClick: () => { setEditingOpp(opp); setShowModal(true); },
                    borderColor: T.danger,
                });
            }
            // Missing stakeholder
            const contactNames    = (opp.contacts||'').split(', ').filter(Boolean);
            const engagedContacts = new Set(oppActs.map(a => a.contactName).filter(Boolean));
            if (contactNames.length >= 2 && engagedContacts.size < 2 && arr >= 20000) {
                items.push({
                    id: `coverage-${opp.id}`, priority: 2,
                    category: 'Missing stakeholder', categoryColor: T.warn,
                    title: `${name} has ${contactNames.length} contacts, no economic buyer`,
                    body: `${contactNames.filter(n => !engagedContacts.has(n.split(' (')[0]))[0]?.split(' (')[0] || 'Key contact'} not engaged.`,
                    onClick: () => { setEditingOpp(opp); setShowModal(true); },
                    borderColor: T.warn,
                });
            }
            // Velocity win
            const createdDays = opp.createdDate ? Math.floor((now - new Date(opp.createdDate + 'T12:00:00'))/86400000) : null;
            const stageCount  = (opp.stageHistory||[]).length;
            if (createdDays !== null && createdDays <= 14 && stageCount >= 2) {
                items.push({
                    id: `velocity-${opp.id}`, priority: 3,
                    category: 'Velocity win', categoryColor: T.ok,
                    title: `${name} moved ${opp.stageHistory?.[opp.stageHistory.length-2]?.stage || 'stage'} → ${opp.stage} in ${createdDays} days`,
                    body: `Faster than your avg (14d). Keep the pace.`,
                    onClick: () => { setEditingOpp(opp); setShowModal(true); },
                    borderColor: T.ok,
                });
            }
        });

        return items.sort((a,b) => a.priority - b.priority).slice(0, 3);
    })();

    // ── Urgency left-border color ─────────────────────────────
    const urgencyBorder = (urgency) => {
        if (urgency === 'overdue')  return T.danger;
        if (urgency === 'meeting') return T.info;
        return T.warn;
    };

    // ─────────────────────────────────────────────────────────
    return (
        <div className="tab-page" style={{ gap: 0, padding: 0, background: T.bg, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* ── Greeting header ── */}
            <div style={{ padding: '1.5rem 2rem 1.125rem', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                <div style={{ fontSize: '1.875rem', fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, color: T.ink, letterSpacing: '-0.5px', lineHeight: 1.15, marginBottom: '0.25rem' }}>
                    {greeting},{' '}
                    <span style={{ fontWeight: 600 }}>{firstName}.</span>
                    {(overdueCount > 0 || plateCount > 0) && (
                        <span style={{ marginLeft: '1rem', fontSize: '0.9375rem', fontFamily: T.sans, fontStyle: 'normal', fontWeight: 400, color: T.inkMid, verticalAlign: 'baseline' }}>
                            {overdueCount > 0 && <span style={{ color: T.danger, fontWeight: 600 }}>{overdueCount} overdue</span>}
                            {overdueCount > 0 && plateCount > overdueCount && <span style={{ color: T.borderStrong }}> · </span>}
                            {plateCount > overdueCount && <span>{plateCount - overdueCount} on your plate today</span>}
                        </span>
                    )}
                </div>

                {/* Date context + pipeline summary */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.75rem', color: T.inkMuted, fontFamily: T.sans }}>{dateContext}</div>
                    {activePipelineARR > 0 && (
                        <>
                            <div style={{ width: '1px', height: '12px', background: T.border }}/>
                            <div style={{ fontSize: '0.75rem', color: T.inkMid, fontFamily: T.sans }}>
                                <span style={{ fontWeight: 600, color: T.ink }}>{fmtArr(activePipelineARR)}</span>
                                {' '}pipeline
                                {' · '}
                                <span style={{ fontWeight: 600, color: T.ink }}>{activeMyOpps.length}</span>
                                {' '}open {activeMyOpps.length === 1 ? 'deal' : 'deals'}
                                {closingThisQ.length > 0 && (
                                    <span style={{ color: T.inkMuted }}>
                                        {' · '}
                                        <span style={{ color: T.ok, fontWeight: 600 }}>{closingThisQ.length}</span>
                                        {' '}closing {qLabel}
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Main body: two columns ── */}
            <div style={{
                flex: 1, display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
                gap: 0, overflow: 'hidden',
            }}>

                {/* ── LEFT COLUMN ── */}
                <div style={{ overflowY: 'auto', padding: '1.5rem 1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* ON YOUR PLATE */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                            <div style={eyebrow()}>On your plate</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {hasCorpEvents && (
                                    <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                        {[{ k: 'all', l: 'Both' }, { k: 'user', l: 'Mine' }, { k: 'org', l: 'Corporate' }].map(o => (
                                            <button key={o.k} onClick={() => setCalSrc(o.k)} style={{ padding: '3px 9px', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, border: 'none', background: calSrc === o.k ? T.ink : T.surface, color: calSrc === o.k ? '#fbf8f3' : T.inkMid }}>{o.l}</button>
                                        ))}
                                    </div>
                                )}
                                <div style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>Ordered by time · urgency</div>
                            </div>
                        </div>

                        {plate.length === 0 ? (
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '2rem', textAlign: 'center' }}>
                                <div style={{ color: T.inkMuted, fontSize: '0.875rem', fontFamily: T.sans, marginBottom: '0.75rem' }}>
                                    All clear — nothing on your plate today.
                                </div>
                                {canEdit && (
                                    <button
                                        onClick={() => { setTaskRailId('new'); setTaskRailMode('new'); }}
                                        style={{ fontSize: '0.8125rem', color: T.goldInk, fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans }}>
                                        + Add a task
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'hidden' }}>
                                <div style={{
                                    maxHeight: plate.length > 5 ? '325px' : 'none',
                                    overflowY: plate.length > 5 ? 'auto' : 'visible',
                                }}>
                                {plate.map((item, idx) => (
                                    <PlateRow
                                        key={idx}
                                        item={item}
                                        idx={idx}
                                        total={plate.length}
                                        urgencyBorder={urgencyBorder}
                                        getStageColor={getStageColor}
                                        T={T}
                                        fmtArr={fmtArr}
                                    />
                                ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* THIS WEEK */}
                    <div>
                        <div style={{ ...eyebrow(), marginBottom: '0.625rem' }}>This week</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                            {/* Activities */}
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '0.875rem 1rem' }}>
                                <div style={{ ...eyebrow(), marginBottom: '0.3rem' }}>Activities</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: T.ink, fontFamily: T.sans, lineHeight: 1 }}>{weekActs.length}</span>
                                    {actDelta !== 0 && (
                                        <span style={{ fontSize: '0.75rem', color: actDelta > 0 ? T.ok : T.danger, fontWeight: '600', fontFamily: T.sans }}>
                                            {actDelta > 0 ? '+' : ''}{actDelta} vs last wk
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Tasks completed */}
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '0.875rem 1rem' }}>
                                <div style={{ ...eyebrow(), marginBottom: '0.3rem' }}>Tasks done</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: T.ink, fontFamily: T.sans, lineHeight: 1 }}>{weekCompletedTasks.length}</span>
                                    {stillOpenTasks > 0 && (
                                        <span style={{ fontSize: '0.75rem', color: T.inkMid, fontFamily: T.sans }}>
                                            {stillOpenTasks} open
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Deals advanced */}
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '0.875rem 1rem' }}>
                                <div style={{ ...eyebrow(), marginBottom: '0.3rem' }}>Deals advanced</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: T.ink, fontFamily: T.sans, lineHeight: 1 }}>{dealsAdvanced.length}</span>
                                    {advancedNames && (
                                        <span style={{ fontSize: '0.75rem', color: T.inkMid, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>{advancedNames}</span>
                                    )}
                                </div>
                            </div>
                            {/* Closing this quarter — NEW */}
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '0.875rem 1rem' }}>
                                <div style={{ ...eyebrow(T.goldInk), marginBottom: '0.3rem' }}>Closing {qLabel}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '700', color: T.ink, fontFamily: T.sans, lineHeight: 1 }}>{closingThisQ.length}</span>
                                    {closingThisQARR > 0 && (
                                        <span style={{ fontSize: '0.75rem', color: T.inkMid, fontFamily: T.sans }}>
                                            {fmtArr(closingThisQARR)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* WORTH YOUR ATTENTION */}
                    {worthAttention.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                                <div style={eyebrow()}>Worth your attention</div>
                                {worthAttention.length >= 3 && (
                                    <button
                                        onClick={() => setActiveTab('pipeline')}
                                        style={{ fontSize: '0.75rem', color: T.goldInk, fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans }}>
                                        See all →
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                                {worthAttention.map(item => (
                                    <div key={item.id} onClick={item.onClick}
                                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${item.borderColor}`, borderRadius: `0 ${T.rSm}px ${T.rSm}px 0`, padding: '0.875rem 1rem', cursor: 'pointer', transition: 'background 0.1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                        onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                                        <div style={{ fontSize: '0.5625rem', fontWeight: '700', color: item.categoryColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.375rem', fontFamily: T.sans }}>{item.category}</div>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: T.ink, lineHeight: 1.35, marginBottom: '0.375rem', fontFamily: T.sans }}>{item.title}</div>
                                        <div style={{ fontSize: '0.75rem', color: T.inkMid, lineHeight: 1.5, fontFamily: T.sans }}>{item.body}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Calendar status. Meetings are folded into ON YOUR PLATE rather
                        than shown as a calendar, so on a day with no meetings there was
                        previously nothing here at all — a freshly connected calendar
                        looked identical to no calendar. This strip is the one place that
                        always says which it is. */}
                    {!calendarConnected ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface, border: `1px dashed ${T.borderStrong}`, borderRadius: T.rMd, padding: '10px 12px', marginTop: '0.25rem' }}>
                            <div style={{ flex: 1, fontSize: '0.8125rem', color: T.inkMid, fontFamily: T.sans }}>Connect your calendar to see your meetings on Home.</div>
                            <button onClick={connectMyCalendar} style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 600, background: T.ink, color: '#fbf8f3', border: 'none', borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>Connect calendar</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '10px 12px', marginTop: '0.25rem' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.ok, flexShrink: 0 }}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.8125rem', color: T.ink, fontWeight: 600, fontFamily: T.sans }}>
                                    {todayCalEvents.length > 0
                                        ? `${todayCalEvents.length} meeting${todayCalEvents.length === 1 ? '' : 's'} today`
                                        : 'Calendar connected — no meetings today'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: T.inkMuted, marginTop: 2, fontFamily: T.sans }}>
                                    {nextCalEvent
                                        ? `Next: ${nextCalEvent.summary || 'Untitled'} · ${new Date((nextCalEvent.start?.dateTime || (nextCalEvent.start?.date + 'T12:00:00'))).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                                        : upcomingCalEvents.length === 0
                                            ? 'Nothing scheduled in the next 7 days.'
                                            : 'Nothing further scheduled this week.'}
                                </div>
                            </div>
                            {calendarLoading && (
                                <span style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>Refreshing…</span>
                            )}
                        </div>
                    )}

                </div>

                {/* ── RIGHT COLUMN ── */}
                {!isMobile && (
                    <div style={{
                        borderLeft: `1px solid ${T.border}`,
                        background: T.surface,
                        overflowY: 'auto',
                        padding: '1.5rem 1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.25rem',
                        flexShrink: 0,
                    }}>

                        {/* QUOTA */}
                        <QuotaBar
                            closedArr={myClosedWonARR}
                            commitArr={myCommitARR}
                            quota={quarterlyQuota}
                            label={`${qLabel} Quota`}
                        />

                        {/* SPIFFS — reps and managers only */}
                        {['User', 'Manager', 'Admin'].includes(userRole) && (
                            <SpiffPanel
                                spiffs={settings.spiffs}
                                claims={(spiffClaims || []).filter(c => c.repName === currentUser)}
                            />
                        )}

                        {/* QUICK LOG */}
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '1rem 1.25rem' }}>
                            <div style={{ ...eyebrow(), marginBottom: '0.75rem' }}>Quick log</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                {[
                                    { label: 'Call',    icon: '☎', fn: () => { setActivityInitialContext({ type: 'Call' }); setEditingActivity(null); setShowActivityModal(true); } },
                                    { label: 'Email',   icon: '✉', fn: () => { setActivityInitialContext({ type: 'Email' }); setEditingActivity(null); setShowActivityModal(true); } },
                                    { label: 'Meeting', icon: '▶', fn: () => { setActivityInitialContext({ type: 'Meeting' }); setEditingActivity(null); setShowActivityModal(true); } },
                                    { label: 'Note',    icon: '◻', fn: () => { setActivityInitialContext({ type: 'Note' }); setEditingActivity(null); setShowActivityModal(true); } },
                                ].map(({ label, icon, fn }) => (
                                    <button key={label} onClick={canEdit ? fn : undefined}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            justifyContent: 'center',
                                            padding: '0.5rem 0.75rem',
                                            background: T.bg, border: `1px solid ${T.border}`,
                                            borderRadius: T.rSm, color: T.ink,
                                            fontSize: '0.8125rem', fontWeight: '500',
                                            cursor: canEdit ? 'pointer' : 'not-allowed',
                                            fontFamily: T.sans, transition: 'background 0.1s, border-color 0.1s',
                                            opacity: canEdit ? 1 : 0.5,
                                        }}
                                        onMouseEnter={e => { if (canEdit) { e.currentTarget.style.background = T.surface2; e.currentTarget.style.borderColor = T.borderStrong; } }}
                                        onMouseLeave={e => { e.currentTarget.style.background = T.bg; e.currentTarget.style.borderColor = T.border; }}>
                                        <span style={{ fontSize: '0.875rem', color: T.inkMid }}>{icon}</span>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ACTIVITY FEED */}
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'hidden' }}>
                            <div style={{ padding: '0.875rem 1.25rem', borderBottom: `1px solid ${T.border}` }}>
                                <div style={eyebrow()}>Recent activity</div>
                            </div>
                            {recentFeed.length === 0 ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: T.inkMuted, fontSize: '0.8125rem', fontFamily: T.sans }}>No recent activity</div>
                            ) : (
                                <div>
                                    {recentFeed.map((act, idx) => {
                                        const name     = act.salesRep || act.author || currentUser;
                                        const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                                        const relOpp   = act.opportunityId ? visibleOpportunities.find(o => o.id === act.opportunityId) : null;

                                        return (
                                            <div key={act.id || idx} style={{
                                                display: 'flex', gap: '0.625rem',
                                                padding: '0.75rem 1.25rem',
                                                borderBottom: idx < recentFeed.length - 1 ? `1px solid ${T.border}` : 'none',
                                            }}>
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: avatarBg(name), color: '#fef4e6',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '10px', fontWeight: '700', flexShrink: 0,
                                                    fontFamily: T.sans, letterSpacing: '0.3px',
                                                }}>
                                                    {initials}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.8125rem', color: T.ink, lineHeight: 1.4, fontFamily: T.sans }}>
                                                        <span style={{ fontWeight: '600' }}>{name}</span>
                                                        {' '}{act.type ? act.type.toLowerCase() : 'logged activity'}
                                                        {relOpp && <span style={{ color: T.inkMid }}> · {(relOpp.opportunityName || relOpp.account || '').split(' — ')[0]}</span>}
                                                        {act.notes && !relOpp && <span style={{ color: T.inkMid }}> — {act.notes.slice(0,60)}{act.notes.length > 60 ? '…' : ''}</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.6875rem', color: T.inkMuted, marginTop: '2px', fontFamily: T.sans }}>{fmtRelDate(act.date)}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  PlateRow — extracted to keep HomeTab render clean
// ─────────────────────────────────────────────────────────────
function PlateRow({ item, idx, total, urgencyBorder, getStageColor, T, fmtArr }) {
    const [completing, setCompleting] = useState(false);
    const sc = item.stage && getStageColor ? getStageColor(item.stage) : { text: T.inkMuted };

    const handleComplete = async (e) => {
        e.stopPropagation();
        if (!item.onComplete || completing) return;
        setCompleting(true);
        try {
            await item.onComplete();
        } finally {
            setCompleting(false);
        }
    };

    const baseBg = idx === 0 && item.urgency === 'overdue' ? 'rgba(156,58,46,0.03)' : 'transparent';
    return (
        <div
            onClick={item.onClick || undefined}
            onMouseEnter={item.onClick ? (e => { e.currentTarget.style.background = T.surface2; }) : undefined}
            onMouseLeave={item.onClick ? (e => { e.currentTarget.style.background = baseBg; }) : undefined}
            style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.875rem 1.125rem',
                borderBottom: idx < total - 1 ? `1px solid ${T.border}` : 'none',
                borderLeft: `3px solid ${urgencyBorder(item.urgency)}`,
                background: baseBg,
                transition: 'background 0.1s',
                cursor: item.onClick ? 'pointer' : 'default',
            }}>
            {/* Time / urgency label */}
            <div style={{ width: '68px', flexShrink: 0 }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: item.timeColor, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: T.sans }}>
                    {item.timeLabel}
                </div>
                {item.arr > 0 && item.stage && (
                    <div style={{ fontSize: '0.6875rem', color: T.inkMuted, marginTop: '2px', fontFamily: T.sans }}>{fmtArr(item.arr)} · {item.stage}</div>
                )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: T.ink, lineHeight: 1.3, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                </div>
                <div style={{ fontSize: '0.8125rem', color: T.inkMid, marginTop: '2px', fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.sub}
                </div>
            </div>

            {/* CTA button */}
            {item.ctaLabel && item.onClick && (
                <button onClick={(e) => { e.stopPropagation(); item.onClick(); }} style={{
                    flexShrink: 0, padding: '0.375rem 0.875rem',
                    border: `1px solid ${T.border}`,
                    borderRadius: T.rSm, background: T.surface,
                    color: T.ink, fontSize: '0.8125rem', fontWeight: '600',
                    cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap',
                    transition: 'background 0.1s, border-color 0.1s',
                }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.borderColor = T.borderStrong; }}
                    onMouseLeave={e => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.border; }}>
                    {item.ctaLabel}
                </button>
            )}
        </div>
    );
}
