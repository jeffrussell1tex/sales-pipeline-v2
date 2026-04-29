import React, { useState, useEffect, useRef } from 'react';
import { stages } from '../../utils/constants';
import { dbFetch } from '../../utils/storage';
import { useApp } from '../../AppContext';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

// ─────────────────────────────────────────────────────────────
//  Design tokens (inline — no build-time import needed)
// ─────────────────────────────────────────────────────────────
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    surfaceInk:   '#2a2622',
    surfaceInkFg: '#e6ddd0',
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
    serif:        '"Source Serif 4", Georgia, serif',
    r:            3,   // radiusSm
};

// Stage colour map — for StageRibbon
const STAGE_COLORS = {
    'Prospecting':   '#b0a088',
    'Qualification': '#c8a978',
    'Discovery':     '#b07a55',
    'Proposal':      '#b87333',
    'Negotiation':   '#7a5a3c',
    'Closing':       '#4d6b3d',
    'Closed Won':    '#3a5530',
    'Closed Lost':   '#9c3a2e',
};

// Eyebrow / label style helper
const ey = (color) => ({
    fontSize: 10.5, fontWeight: 600, color: color || T.inkMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans,
});

// ─────────────────────────────────────────────────────────────
//  Small shared atoms (self-contained, no external import)
// ─────────────────────────────────────────────────────────────

// Stroke icon — matches primitives set
const Icon = ({ name, size = 14, color = 'currentColor', sw = 1.5 }) => {
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (name) {
        case 'x':        return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
        case 'check':    return <svg {...p}><path d="M4 12l5 5L20 6"/></svg>;
        case 'plus':     return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
        case 'phone':    return <svg {...p}><path d="M5 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z"/></svg>;
        case 'mail':     return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
        case 'meeting':  return <svg {...p}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>;
        case 'doc':      return <svg {...p}><path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/></svg>;
        case 'layers':   return <svg {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/></svg>;
        case 'clock':    return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
        case 'alert':    return <svg {...p}><path d="M12 3l10 17H2L12 3z"/><path d="M12 10v5M12 18v.5" strokeWidth={sw*1.2}/></svg>;
        case 'sparkle':  return <svg {...p}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/></svg>;
        case 'chevron-r':return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
        case 'grip':     return <svg {...p}><circle cx="9" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="17" r="1"/></svg>;
        default:         return null;
    }
};

// Avatar — deterministic warm colour from name hash
const _initials = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const _avatarBg = (n) => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (n||'').length; i++) h = (h * 31 + (n||'').charCodeAt(i)) | 0;
    return p[Math.abs(h) % p.length];
};
const Avatar = ({ name = '?', size = 28 }) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: _avatarBg(name), color: '#fef4e6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.38), fontWeight: 600, letterSpacing: 0.3, flexShrink: 0, userSelect: 'none' }}>
        {_initials(name)}
    </div>
);

// Engagement dot
const ENG = { hot: T.danger, warm: T.warn, cool: T.info, stale: T.inkMuted };
const EngDot = ({ level = 'stale', size = 8 }) => (
    <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: ENG[level] || T.inkMuted, flexShrink: 0 }}/>
);

// Role badge
const RoleBadge = ({ role }) => (
    <span style={{ fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 700,
        color: T.goldInk, background: 'rgba(200,185,154,0.22)', padding: '2px 6px', borderRadius: 2, fontFamily: T.sans, whiteSpace: 'nowrap' }}>
        {role}
    </span>
);

// Signal chip — AI insight
const SIGNAL = {
    positive: { bg: 'rgba(77,107,61,0.09)',  border: 'rgba(77,107,61,0.3)',  icon: T.ok,     ic: 'check' },
    neutral:  { bg: T.surface2,              border: T.border,               icon: T.inkMid, ic: 'clock'  },
    risk:     { bg: 'rgba(156,58,46,0.07)',  border: 'rgba(156,58,46,0.28)', icon: T.danger, ic: 'alert'  },
};
const SignalChip = ({ kind = 'neutral', text }) => {
    const c = SIGNAL[kind] || SIGNAL.neutral;
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '7px 10px',
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: T.r }}>
            <Icon name={c.ic} size={12} color={c.icon} sw={2} />
            <span style={{ fontSize: 12, color: T.ink, lineHeight: 1.45, fontFamily: T.sans }}>{text}</span>
        </div>
    );
};

// Status badge
const STATUS_MAP = {
    'Open':      { bg: T.surface2,             fg: T.inkMid,  bd: T.border },
    'Won':       { bg: 'rgba(77,107,61,0.12)', fg: T.ok,      bd: 'rgba(77,107,61,0.3)'   },
    'Lost':      { bg: 'rgba(156,58,46,0.1)',  fg: T.danger,  bd: 'rgba(156,58,46,0.3)'  },
    'At risk':   { bg: 'rgba(184,115,51,0.1)', fg: T.warn,    bd: 'rgba(184,115,51,0.35)' },
    'Commit':    { bg: 'rgba(42,38,34,0.08)',  fg: T.ink,     bd: T.borderStrong          },
    'Best-case': { bg: 'rgba(58,90,122,0.1)',  fg: T.info,    bd: 'rgba(58,90,122,0.3)'   },
};
const StatusBadge = ({ status }) => {
    const s = STATUS_MAP[status] || STATUS_MAP['Open'];
    return (
        <span style={{ fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: 700,
            color: s.fg, background: s.bg, border: `1px solid ${s.bd}`,
            padding: '2px 7px', borderRadius: 2, fontFamily: T.sans, whiteSpace: 'nowrap' }}>
            {status}
        </span>
    );
};

// Ghost button
const GhostBtn = ({ children, icon, onClick, size = 'sm', danger = false, disabled = false, type = 'button' }) => {
    const [h, setH] = useState(false);
    const sm = size === 'sm';
    return (
        <button type={type} onClick={onClick} disabled={disabled}
            onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: sm ? '4px 9px' : '7px 13px',
                background: h ? (danger ? 'rgba(156,58,46,0.08)' : T.surface2) : 'transparent',
                border: `1px solid ${danger ? T.danger : T.border}`,
                color: danger ? T.danger : T.ink,
                fontSize: sm ? 11.5 : 12.5, fontWeight: 500,
                borderRadius: T.r, cursor: disabled ? 'not-allowed' : 'pointer',
                fontFamily: T.sans, whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1,
                transition: 'background 100ms' }}>
            {icon && <Icon name={icon} size={sm ? 12 : 13} color={danger ? T.danger : T.inkMid}/>}
            {children}
        </button>
    );
};

// Primary button
const PrimaryBtn = ({ children, icon, onClick, saving = false, disabled = false, type = 'submit' }) => (
    <button type={type} onClick={onClick} disabled={disabled || saving}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 16px',
            background: (disabled || saving) ? T.inkMuted : T.ink,
            border: 'none', color: T.surface,
            fontSize: 12.5, fontWeight: 600,
            borderRadius: T.r, cursor: (disabled || saving) ? 'not-allowed' : 'pointer',
            fontFamily: T.sans, whiteSpace: 'nowrap',
            opacity: (disabled || saving) ? 0.65 : 1, transition: 'opacity 120ms' }}>
        {saving && <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: T.surface, display: 'inline-block', animation: 'opp-spin 0.7s linear infinite' }}/>}
        {!saving && icon && <Icon name={icon} size={13} color={T.surface}/>}
        {children}
    </button>
);

// Section label (eyebrow in the rail)
const RailLabel = ({ children, color, action, onAction }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ ...ey(color || T.inkMuted) }}>{children}</div>
        {action && <GhostBtn icon="plus" size="sm" onClick={onAction}>{action}</GhostBtn>}
    </div>
);

// Chevron stage ribbon
const StageRibbon = ({ allStages, current, onStage }) => {
    const displayStages = allStages.filter(s => !s.startsWith('Closed'));
    const curIdx = displayStages.indexOf(current);
    return (
        <div style={{ display: 'flex', gap: 0, width: '100%', overflow: 'hidden', borderRadius: T.r }}>
            {displayStages.map((s, i) => {
                const done = i < curIdx, cur = i === curIdx;
                const bg = cur ? T.ink : done ? T.goldInk : T.surface2;
                const fg = cur ? T.surface : done ? '#fef4e6' : T.inkMuted;
                const clip = i === 0
                    ? 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%)'
                    : 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%, 9px 50%)';
                return (
                    <div key={s} onClick={() => onStage && onStage(s)} title={s}
                        style={{ flex: 1, padding: '7px 14px 7px 18px', marginLeft: i === 0 ? 0 : -7,
                            background: bg, color: fg, clipPath: clip,
                            fontSize: 11, fontWeight: cur ? 700 : 500,
                            textAlign: 'center', cursor: onStage ? 'pointer' : 'default',
                            whiteSpace: 'nowrap', fontFamily: T.sans,
                            transition: 'background 120ms', userSelect: 'none' }}>
                        {s}
                    </div>
                );
            })}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
//  Deal History — preserved from original, accessible via rail
//  "See all" link
// ─────────────────────────────────────────────────────────────
function DealHistoryTab({ opportunity, oppActivities, stages, settings, contacts, activityTypeIcon, onSaveActivity, onDeleteActivity, currentUser, onClose, saving, onUpdate }) {
    const [showLogActivity, setShowLogActivity] = React.useState(false);
    const [newActivity, setNewActivity] = React.useState({
        type: 'Call',
        date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
        notes: ''
    });
    const activityTypes = ['Call', 'Email', 'Meeting', 'Demo', 'Proposal Sent', 'Follow-up', 'Other'];

    const stageHistory = opportunity.stageHistory || [];
    const allStages = stages && stages.length > 0 ? stages : ['Qualification','Discovery','Evaluation (Demo)','Proposal','Negotiation/Review','Contracts','Closed Won','Closed Lost'];

    const stageDateMap = {};
    if (opportunity.createdDate) {
        const firstStage = stageHistory.length > 0 ? stageHistory[0].prevStage : opportunity.stage;
        if (firstStage) stageDateMap[firstStage] = opportunity.createdDate;
    }
    stageHistory.forEach(h => { if (!stageDateMap[h.stage]) stageDateMap[h.stage] = h.date; });

    const currentStageIdx = allStages.indexOf(opportunity.stage);
    const journeyStages = allStages.map((s, i) => ({
        name: s,
        date: stageDateMap[s] || null,
        status: i < currentStageIdx ? 'done' : i === currentStageIdx ? 'active' : 'future',
    }));

    const allDates = [
        opportunity.createdDate,
        ...oppActivities.map(a => a.date),
        ...stageHistory.map(h => h.date),
    ].filter(Boolean).map(d => new Date(d + 'T12:00:00').getTime());
    const minTs = allDates.length ? Math.min(...allDates) : Date.now();
    const maxTs = allDates.length ? Math.max(...allDates) : Date.now() + 86400000;
    const tspan = maxTs - minTs || 1;
    const pct = (dateStr) => Math.max(2, Math.min(96, ((new Date(dateStr + 'T12:00:00').getTime() - minTs) / tspan) * 96 + 2));

    const byType = { Call: [], Email: [], Meeting: [], Demo: [], 'Proposal Sent': [], 'Follow-up': [], Other: [] };
    oppActivities.forEach(a => { const k = byType[a.type] ? a.type : 'Other'; byType[k].push(a); });
    const swimLanes = Object.entries(byType).filter(([, acts]) => acts.length > 0);

    const stageEvents = stageHistory.map(h => ({ date: h.date, label: `→ ${h.stage}`, prev: h.prevStage, next: h.stage }));
    if (opportunity.createdDate) stageEvents.unshift({ date: opportunity.createdDate, label: 'Deal opened', prev: null, next: allStages[0] });

    const today = new Date();
    const dealAge = opportunity.createdDate ? Math.floor((today - new Date(opportunity.createdDate + 'T12:00:00')) / 86400000) : null;
    const timeInStage = opportunity.stageChangedDate ? Math.floor((today - new Date(opportunity.stageChangedDate + 'T12:00:00')) / 86400000) : null;
    const actCounts = oppActivities.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});

    const contactEngagement = {};
    oppActivities.forEach(a => {
        if (a.contactName) {
            if (!contactEngagement[a.contactName]) contactEngagement[a.contactName] = { calls: 0, emails: 0, meetings: 0, last: a.date };
            if (a.type === 'Call' || a.type === 'Follow-up') contactEngagement[a.contactName].calls++;
            else if (a.type === 'Email' || a.type === 'Proposal Sent') contactEngagement[a.contactName].emails++;
            else contactEngagement[a.contactName].meetings++;
            if (a.date > contactEngagement[a.contactName].last) contactEngagement[a.contactName].last = a.date;
        }
    });
    const oppContactNames = (opportunity.contacts || '').split(', ').filter(Boolean).map(c => c.split(' (')[0]);
    oppContactNames.forEach(n => { if (!contactEngagement[n]) contactEngagement[n] = { calls: 0, emails: 0, meetings: 0, last: null }; });

    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const [tooltip, setTooltip] = React.useState(null);

    const typeColors = {
        Call: { bg: '#EAF3DE', text: '#3B6D11', dot: '#639922' },
        Email: { bg: '#E6F1FB', text: '#185FA5', dot: '#378ADD' },
        Meeting: { bg: '#EEEDFE', text: '#534AB7', dot: '#7F77DD' },
        Demo: { bg: '#FAEEDA', text: '#854F0B', dot: '#EF9F27' },
        'Proposal Sent': { bg: '#FBEAF0', text: '#993556', dot: '#D4537E' },
        'Follow-up': { bg: '#E1F5EE', text: '#0F6E56', dot: '#1D9E75' },
        Other: { bg: '#F1EFE8', text: '#5F5E5A', dot: '#888780' },
    };

    return (
        <div style={{ paddingBottom: '1rem' }}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '1.25rem' }}>
                {[
                    { val: dealAge !== null ? `${dealAge}d` : '—', lbl: 'Deal age', color: dealAge > 90 ? T.danger : dealAge > 60 ? T.warn : T.ok },
                    { val: timeInStage !== null ? `${timeInStage}d` : '—', lbl: 'In this stage', color: timeInStage > 30 ? T.danger : timeInStage > 14 ? T.warn : T.ok },
                    { val: oppActivities.length, lbl: 'Activities', color: T.info },
                    { val: Object.keys(contactEngagement).length, lbl: 'Contacts engaged', color: T.inkMid },
                ].map(({ val, lbl, color }) => (
                    <div key={lbl} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '10px 12px' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color }}>{val}</div>
                        <div style={{ fontSize: '0.6875rem', color: T.inkMuted, marginTop: '2px', fontFamily: T.sans }}>{lbl}</div>
                    </div>
                ))}
            </div>

            {/* Journey map + swim lanes — dark panel */}
            <div style={{ background: '#1e293b', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ marginBottom: '0.75rem', ...ey('rgba(255,255,255,0.45)') }}>Deal journey</div>
                {(() => {
                    const count = journeyStages.length;
                    const svgW = 760, padX = 30, trackY = 28;
                    const spacing = (svgW - padX * 2) / Math.max(count - 1, 1);
                    return (
                        <svg width="100%" viewBox={`0 0 ${svgW} 80`} style={{ display: 'block', marginBottom: oppActivities.length > 0 ? '1.25rem' : '0' }}>
                            {journeyStages.map((s, i) => {
                                if (i === 0) return null;
                                const x1 = padX + (i - 1) * spacing + 8, x2 = padX + i * spacing - 8;
                                const isDone = journeyStages[i - 1].status === 'done' || journeyStages[i - 1].status === 'active';
                                const color = isDone ? (s.status === 'future' ? 'rgba(255,255,255,0.15)' : '#4ade80') : 'rgba(255,255,255,0.15)';
                                return <rect key={`t-${i}`} x={x1} y={trackY - 2} width={Math.max(x2 - x1, 0)} height={4} rx={2} fill={color} opacity={s.status === 'future' ? 0.4 : 1}/>;
                            })}
                            {journeyStages.map((s, i) => {
                                const cx = padX + i * spacing;
                                const isDone = s.status === 'done', isActive = s.status === 'active';
                                const dotFill = isDone ? '#4ade80' : isActive ? '#60a5fa' : 'rgba(255,255,255,0.2)';
                                const labelColor = isDone ? '#86efac' : isActive ? '#93c5fd' : 'rgba(255,255,255,0.3)';
                                const r = isActive ? 9 : 7;
                                return (
                                    <g key={`d-${i}`}>
                                        {isActive && <circle cx={cx} cy={trackY} r={13} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.5}/>}
                                        <circle cx={cx} cy={trackY} r={r} fill={dotFill}/>
                                        <text x={cx} y={52} textAnchor="middle" fill={labelColor} fontSize={9} fontWeight={isActive ? '700' : '500'} fontFamily="inherit">
                                            {s.name.length > 12 ? s.name.replace('/', '/\u200B') : s.name}
                                        </text>
                                        {s.date && <text x={cx} y={65} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={8} fontFamily="inherit">{fmtDate(s.date)}</text>}
                                    </g>
                                );
                            })}
                        </svg>
                    );
                })()}

                {oppActivities.length > 0 && (
                    <>
                        <div style={{ marginBottom: '0.5rem', ...ey('rgba(255,255,255,0.45)') }}>Activity map</div>
                        <div style={{ position: 'relative', marginBottom: '0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '10px' }}>
                                <div style={{ width: '72px', fontSize: '0.625rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>Stages</div>
                                <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.12)', borderRadius: '1px', position: 'relative' }}>
                                    {stageEvents.map((ev, i) => (
                                        <div key={i}
                                            style={{ position: 'absolute', left: `${pct(ev.date)}%`, top: '50%', transform: 'translate(-50%,-50%) rotate(45deg)', width: '10px', height: '10px', background: 'rgba(255,255,255,0.55)', borderRadius: '2px', cursor: 'pointer', border: '1.5px solid #1e293b' }}
                                            title={`${ev.label} · ${fmtDate(ev.date)}`}
                                            onMouseEnter={() => setTooltip({ title: ev.label, sub: fmtDate(ev.date) })}
                                            onMouseLeave={() => setTooltip(null)}
                                        />
                                    ))}
                                </div>
                            </div>
                            {swimLanes.map(([type, acts]) => {
                                const c = typeColors[type] || typeColors.Other;
                                return (
                                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '10px' }}>
                                        <div style={{ width: '72px', fontSize: '0.625rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{type}</div>
                                        <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.12)', borderRadius: '1px', position: 'relative' }}>
                                            {acts.map((act, i) => (
                                                <div key={i}
                                                    style={{ position: 'absolute', left: `${pct(act.date)}%`, top: '50%', transform: 'translate(-50%,-50%)', width: '12px', height: '12px', borderRadius: '50%', background: c.dot, border: '2px solid #1e293b', cursor: 'pointer' }}
                                                    onMouseEnter={() => setTooltip({ title: `${act.type} · ${fmtDate(act.date)}`, sub: act.notes ? act.notes.slice(0, 60) + (act.notes.length > 60 ? '…' : '') : '' })}
                                                    onMouseLeave={() => setTooltip(null)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {tooltip && (
                                <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '80px', background: '#0f172a', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '0.75rem', pointerEvents: 'none', zIndex: 50, maxWidth: '260px', whiteSpace: 'normal', lineHeight: 1.4, border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontWeight: '700' }}>{tooltip.title}</div>
                                    {tooltip.sub && <div style={{ opacity: 0.65, marginTop: '2px' }}>{tooltip.sub}</div>}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px', paddingLeft: '72px' }}>
                                {swimLanes.map(([type]) => {
                                    const c = typeColors[type] || typeColors.Other;
                                    return (
                                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.dot, flexShrink: 0 }}/>
                                            <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.5)' }}>{type} ({(actCounts[type] || 0)})</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Activity list */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>Activity Log</span>
                    <GhostBtn icon="plus" size="sm" onClick={() => setShowLogActivity(v => !v)}>
                        {showLogActivity ? 'Cancel' : 'Log Activity'}
                    </GhostBtn>
                </div>

                {showLogActivity && (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '0.875rem', marginBottom: '0.875rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }}>
                            <div>
                                <label style={{ ...ey(), display: 'block', marginBottom: 4 }}>Type</label>
                                <select value={newActivity.type} onChange={e => setNewActivity(p => ({ ...p, type: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem 0.625rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, background: T.surface, color: T.ink }}>
                                    {activityTypes.map(t => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ ...ey(), display: 'block', marginBottom: 4 }}>Date</label>
                                <input type="date" value={newActivity.date} onChange={e => setNewActivity(p => ({ ...p, date: e.target.value }))}
                                    style={{ width: '100%', padding: '0.5rem 0.625rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, background: T.surface, color: T.ink }}/>
                            </div>
                        </div>
                        <div style={{ marginBottom: '0.625rem' }}>
                            <label style={{ ...ey(), display: 'block', marginBottom: 4 }}>Notes</label>
                            <textarea value={newActivity.notes} onChange={e => setNewActivity(p => ({ ...p, notes: e.target.value }))}
                                rows={2} placeholder="What happened?"
                                style={{ width: '100%', padding: '0.5rem 0.625rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, resize: 'vertical', background: T.surface, color: T.ink, boxSizing: 'border-box' }}/>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <GhostBtn onClick={() => setShowLogActivity(false)}>Cancel</GhostBtn>
                            <PrimaryBtn type="button" onClick={() => {
                                if (onSaveActivity) {
                                    onSaveActivity({ ...newActivity, opportunityId: opportunity.id, contactName: '' });
                                    setNewActivity({ type: 'Call', date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'), notes: '' });
                                    setShowLogActivity(false);
                                }
                            }}>Save Activity</PrimaryBtn>
                        </div>
                    </div>
                )}

                {oppActivities.length === 0 && !showLogActivity && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: T.inkMuted, fontSize: '0.8125rem', background: T.surface, borderRadius: T.r, border: `1px dashed ${T.border}`, fontFamily: T.sans }}>
                        No activities logged yet.
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {oppActivities.map(act => (
                        <div key={act.id} style={{ display: 'flex', gap: '0.625rem', padding: '0.625rem 0.75rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: T.bg, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: '0.75rem' }}>{activityTypeIcon[act.type] || '📝'}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: T.ink, fontFamily: T.sans }}>{act.type}</span>
                                    <span style={{ fontSize: '0.6875rem', color: T.inkMuted, flexShrink: 0, fontFamily: T.sans }}>{fmtDate(act.date)}</span>
                                </div>
                                {act.notes && <div style={{ fontSize: '0.75rem', color: T.inkMid, marginTop: '2px', lineHeight: 1.5, fontFamily: T.sans }}>{act.notes}</div>}
                            </div>
                            {onDeleteActivity && (
                                <button type="button" onClick={() => onDeleteActivity(act.id)}
                                    style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: '1rem', padding: '0.125rem', lineHeight: 1, borderRadius: T.r, flexShrink: 0 }}
                                    onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                    onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}` }}>
                <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                <PrimaryBtn type="button" onClick={() => onUpdate && onUpdate()}>Update</PrimaryBtn>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  Contact Engagement Tab (preserved)
// ─────────────────────────────────────────────────────────────
function ContactEngagementTab({ opportunity, oppActivities, contacts, onClose, onUpdate, saving }) {
    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const contactEngagement = {};
    oppActivities.forEach(a => {
        if (a.contactName) {
            if (!contactEngagement[a.contactName]) contactEngagement[a.contactName] = { calls: 0, emails: 0, meetings: 0, last: a.date };
            if (a.type === 'Call' || a.type === 'Follow-up') contactEngagement[a.contactName].calls++;
            else if (a.type === 'Email' || a.type === 'Proposal Sent') contactEngagement[a.contactName].emails++;
            else contactEngagement[a.contactName].meetings++;
            if (a.date > contactEngagement[a.contactName].last) contactEngagement[a.contactName].last = a.date;
        }
    });
    const oppContactNames = (opportunity.contacts || '').split(', ').filter(Boolean).map(c => c.split(' (')[0]);
    oppContactNames.forEach(n => { if (!contactEngagement[n]) contactEngagement[n] = { calls: 0, emails: 0, meetings: 0, last: null }; });

    const enriched = Object.entries(contactEngagement).map(([name, data]) => {
        const firstName = name.split(' (')[0];
        const contact = (contacts || []).find(c => `${c.firstName} ${c.lastName}`.toLowerCase() === firstName.toLowerCase());
        return { name: firstName, title: contact?.title || '', company: contact?.company || '', ...data };
    });

    return (
        <div style={{ paddingBottom: '1rem' }}>
            {enriched.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: T.inkMuted, fontSize: '0.8125rem', background: T.surface, borderRadius: T.r, border: `1px dashed ${T.border}`, fontFamily: T.sans }}>
                    No contacts linked yet.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {enriched.map(c => (
                        <div key={c.name} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '0.75rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Avatar name={c.name} size={36}/>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>{c.name}</div>
                                {c.title && <div style={{ fontSize: '0.75rem', color: T.inkMid, fontFamily: T.sans }}>{c.title}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', flexShrink: 0 }}>
                                {[['📞', c.calls], ['✉️', c.emails], ['🤝', c.meetings]].map(([icon, count], i) => (
                                    <div key={i} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem' }}>{icon}</div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>{count}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>Last touch</div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: T.ink, fontFamily: T.sans }}>{c.last ? fmtDate(c.last) : '—'}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}` }}>
                <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                <PrimaryBtn type="button" onClick={() => onUpdate && onUpdate()}>Update</PrimaryBtn>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  AI Score Tab (preserved)
// ─────────────────────────────────────────────────────────────
function AiScoreTab({ opportunity, oppActivities, currentUser, onClose, onUpdate }) {
    const [score, setScore] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [scoreHistory, setScoreHistory] = useState(opportunity?.scoreHistory || []);

    const fetchScore = async (forceRefresh = false) => {
        setLoading(true); setError(null);
        try {
            const res = await dbFetch('/.netlify/functions/ai-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ opportunity, activities: oppActivities, currentUser, forceRefresh }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Scoring failed');
            setScore(data.score);
            if (data.score) setScoreHistory(prev => [data.score, ...prev.slice(0, 4)]);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (opportunity?.cachedScore && !score) {
            setScore(opportunity.cachedScore);
            if (opportunity.scoreHistory) setScoreHistory(opportunity.scoreHistory);
        }
    }, [opportunity?.id]);

    const verdictConfig = {
        'Strong':   { color: T.ok,     bg: 'rgba(77,107,61,0.09)',  border: 'rgba(77,107,61,0.3)'   },
        'Healthy':  { color: T.ok,     bg: 'rgba(77,107,61,0.09)',  border: 'rgba(77,107,61,0.3)'   },
        'Neutral':  { color: T.inkMid, bg: T.surface2,              border: T.border                 },
        'At Risk':  { color: T.warn,   bg: 'rgba(184,115,51,0.09)', border: 'rgba(184,115,51,0.3)'  },
        'Critical': { color: T.danger, bg: 'rgba(156,58,46,0.09)',  border: 'rgba(156,58,46,0.3)'  },
    };

    return (
        <div style={{ paddingBottom: '1rem' }}>
            {loading && (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: `3px solid ${T.border}`, borderTopColor: T.ink, margin: '0 auto 1rem', animation: 'opp-spin 0.7s linear infinite' }}/>
                    <div style={{ fontSize: '0.875rem', color: T.inkMid, fontFamily: T.sans }}>Analysing deal signals…</div>
                </div>
            )}
            {error && (
                <div style={{ padding: '1rem', background: 'rgba(156,58,46,0.07)', border: `1px solid rgba(156,58,46,0.3)`, borderRadius: T.r, color: T.danger, fontSize: '0.875rem', marginBottom: '1rem', fontFamily: T.sans }}>
                    {error}
                </div>
            )}
            {!loading && score && (() => {
                const vc = verdictConfig[score.verdict] || verdictConfig['Neutral'];
                return (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: vc.bg, border: `1px solid ${vc.border}`, borderRadius: T.r, marginBottom: '1.25rem' }}>
                            <div style={{ textAlign: 'center', minWidth: '56px' }}>
                                <div style={{ fontSize: '2rem', fontWeight: '800', color: vc.color, lineHeight: 1, fontFamily: T.sans }}>{score.score}</div>
                                <div style={{ fontSize: '0.625rem', fontWeight: '700', color: vc.color, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.sans }}>{score.verdict}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px', fontFamily: T.sans }}>Recommended next action</div>
                                <div style={{ fontSize: '0.875rem', color: T.ink, fontWeight: '500', lineHeight: 1.5, fontFamily: T.sans }}>{score.recommendation}</div>
                            </div>
                        </div>
                        {score.signals && score.signals.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                {score.signals.map((s, i) => (
                                    <SignalChip key={i} kind={s.kind} text={s.text}/>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '0.6875rem', color: T.inkMuted, lineHeight: 1.5, fontFamily: T.sans }}>
                                Powered by Claude AI · Deal data is sent to Anthropic's API
                            </div>
                            <GhostBtn onClick={() => fetchScore(true)}>↻ Refresh score</GhostBtn>
                        </div>
                        {scoreHistory.length > 0 && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}` }}>
                                <div style={{ ...ey(), marginBottom: 8 }}>Score history</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {scoreHistory.map((h, i) => {
                                        const hvc = verdictConfig[h.verdict] || verdictConfig['Neutral'];
                                        const ageLabel = h.scoredAt ? (() => {
                                            const m = Math.floor((Date.now() - new Date(h.scoredAt).getTime()) / 60000);
                                            return m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m/60) + 'h ago' : Math.floor(m/1440) + 'd ago';
                                        })() : null;
                                        return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: hvc.bg, border: `0.5px solid ${hvc.border}`, borderRadius: T.r }}>
                                                <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: hvc.color, fontFamily: T.sans }}>{h.score}</span>
                                                <span style={{ fontSize: '0.6875rem', color: hvc.color, opacity: 0.75, fontFamily: T.sans }}>{h.verdict}</span>
                                                {ageLabel && <span style={{ fontSize: '0.625rem', color: T.inkMuted, fontFamily: T.sans }}>· {ageLabel}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}
            {!loading && !error && !score && (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🤖</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: T.ink, marginBottom: '4px', fontFamily: T.sans }}>No score yet</div>
                    <div style={{ fontSize: '0.75rem', color: T.inkMuted, marginBottom: '1.25rem', fontFamily: T.sans }}>Generate an AI health assessment for this deal</div>
                    <PrimaryBtn type="button" onClick={() => fetchScore(false)}>Score this deal</PrimaryBtn>
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}` }}>
                <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                <PrimaryBtn type="button" onClick={() => onUpdate && onUpdate()}>Update</PrimaryBtn>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  Quotes panel (preserved)
// ─────────────────────────────────────────────────────────────
function OppQuotesPanel({ opportunity, contacts, onClose }) {
    const { quotes, setActiveTab, setQuotesDeepLinkOppId } = useApp();
    const oppQuotes = React.useMemo(() =>
        (quotes || []).filter(q => q.opportunityId === opportunity?.id).sort((a, b) => (b.version || 1) - (a.version || 1)),
        [quotes, opportunity?.id]
    );
    const fmtCurrency = (v) => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
    const statusColors = {
        'Draft':            { bg: T.surface2,              color: T.inkMid  },
        'Pending Approval': { bg: 'rgba(184,115,51,0.12)', color: T.warn    },
        'Approved':         { bg: 'rgba(77,107,61,0.12)',  color: T.ok      },
        'Sent to Customer': { bg: 'rgba(58,90,122,0.12)',  color: T.info    },
        'Accepted':         { bg: 'rgba(77,107,61,0.16)',  color: T.ok      },
        'Rejected / Lost':  { bg: 'rgba(156,58,46,0.1)',   color: T.danger  },
    };
    const handleNavigate = () => {
        if (setQuotesDeepLinkOppId) setQuotesDeepLinkOppId(opportunity?.id);
        if (setActiveTab) setActiveTab('quotes');
        if (onClose) onClose();
    };
    const primaryContact = React.useMemo(() => {
        const contactNames = (opportunity?.contacts || '').split(', ').filter(Boolean);
        if (!contactNames.length) return null;
        const firstName = contactNames[0].split(' (')[0];
        return (contacts || []).find(c => `${c.firstName} ${c.lastName}` === firstName) || null;
    }, [opportunity, contacts]);

    return (
        <div style={{ padding: '0.5rem 0' }}>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '0.875rem 1.125rem', marginBottom: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div><div style={{ ...ey(), marginBottom: 2 }}>Opportunity</div><div style={{ fontSize: '0.875rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>{opportunity?.opportunityName || opportunity?.account || '—'}</div></div>
                <div><div style={{ ...ey(), marginBottom: 2 }}>Account</div><div style={{ fontSize: '0.875rem', fontWeight: '600', color: T.inkMid, fontFamily: T.sans }}>{opportunity?.account || '—'}</div></div>
                {primaryContact && <div><div style={{ ...ey(), marginBottom: 2 }}>Primary Contact</div><div style={{ fontSize: '0.875rem', fontWeight: '600', color: T.inkMid, fontFamily: T.sans }}>{primaryContact.firstName} {primaryContact.lastName}{primaryContact.title ? ` · ${primaryContact.title}` : ''}</div></div>}
                <div><div style={{ ...ey(), marginBottom: 2 }}>Revenue</div><div style={{ fontSize: '0.875rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>{fmtCurrency(opportunity?.arr)}</div></div>
            </div>
            {oppQuotes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: T.inkMuted, fontSize: '0.875rem', fontFamily: T.sans }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: T.inkMid }}>No quotes yet</div>
                    <div>Click below to open the Quote Builder for this opportunity.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {oppQuotes.map(q => {
                        const sc = statusColors[q.status] || { bg: T.surface2, color: T.inkMid };
                        return (
                            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: '700', fontSize: '0.875rem', color: T.ink, fontFamily: T.sans }}>{q.name || q.quoteNumber} <span style={{ fontWeight: '400', color: T.inkMuted }}>v{q.version || 1}</span></div>
                                    {q.updatedAt && <div style={{ fontSize: '0.75rem', color: T.inkMuted, marginTop: '1px', fontFamily: T.sans }}>Updated {new Date(q.updatedAt).toLocaleDateString()}</div>}
                                </div>
                                <span style={{ background: sc.bg, color: sc.color, fontSize: '0.6875rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', whiteSpace: 'nowrap', fontFamily: T.sans }}>{q.status}</span>
                                <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: T.ink, flexShrink: 0, fontFamily: T.sans }}>{fmtCurrency(q.total ?? q.subtotal)}</div>
                            </div>
                        );
                    })}
                </div>
            )}
            <button onClick={handleNavigate} style={{ width: '100%', background: T.ink, color: T.surface, border: 'none', borderRadius: T.r, padding: '0.75rem', fontSize: '0.9375rem', fontWeight: '700', cursor: 'pointer', fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                📋 {oppQuotes.length === 0 ? 'Build First Quote' : 'Open in Quote Builder'} →
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  Nested new contact form (preserved from original)
// ─────────────────────────────────────────────────────────────
function NestedNewContactForm({ firstName, lastName, onSave, onCancel }) {
    const [form, setForm] = useState({ firstName: firstName || '', lastName: lastName || '', title: '', email: '', phone: '' });
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                {[['firstName','First Name'],['lastName','Last Name']].map(([k, lbl]) => (
                    <div key={k}>
                        <label style={{ ...ey(), display: 'block', marginBottom: 4 }}>{lbl}</label>
                        <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                            style={{ width: '100%', padding: '0.5rem 0.625rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, boxSizing: 'border-box', background: T.surface, color: T.ink }}/>
                    </div>
                ))}
            </div>
            {[['title','Title'],['email','Email'],['phone','Phone']].map(([k, lbl]) => (
                <div key={k}>
                    <label style={{ ...ey(), display: 'block', marginBottom: 4 }}>{lbl}</label>
                    <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                        style={{ width: '100%', padding: '0.5rem 0.625rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, boxSizing: 'border-box', background: T.surface, color: T.ink }}/>
                </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
                <PrimaryBtn type="button" onClick={() => {
                    if (form.firstName.trim() || form.lastName.trim()) {
                        const id = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        onSave({ ...form, id });
                    }
                }}>Save Contact</PrimaryBtn>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  Right Rail — 3 sections (AI, Contacts, Activity)
// ─────────────────────────────────────────────────────────────
function RightRail({ opportunity, oppActivities, contacts, settings, onOpenActivity, onOpenContact, onOpenHistory, onOpenAi, onOpenContacts }) {

    // Last touch recency → engagement level
    const engLevel = (lastActivityDate) => {
        if (!lastActivityDate) return 'stale';
        const days = Math.floor((Date.now() - new Date(lastActivityDate + 'T12:00:00').getTime()) / 86400000);
        if (days <= 3) return 'hot';
        if (days <= 10) return 'warm';
        if (days <= 21) return 'cool';
        return 'stale';
    };

    // Build contact engagement map from activities
    const contactEngMap = {};
    oppActivities.forEach(a => {
        if (a.contactName) {
            if (!contactEngMap[a.contactName]) contactEngMap[a.contactName] = { last: a.date };
            if (a.date > contactEngMap[a.contactName].last) contactEngMap[a.contactName].last = a.date;
        }
    });

    // Enrich contacts linked to this opp
    const oppContactNames = (opportunity?.contacts || '').split(', ').filter(Boolean).map(c => c.split(' (')[0]);
    const enrichedContacts = oppContactNames.slice(0, 5).map(name => {
        const contact = (contacts || []).find(c => `${c.firstName} ${c.lastName}`.toLowerCase() === name.toLowerCase());
        const lastAct = contactEngMap[name]?.last || null;
        return { name, title: contact?.title || '', lastTouch: lastAct, engagement: engLevel(lastAct) };
    });

    // AI signals from cachedScore or empty
    const aiSignals = opportunity?.cachedScore?.signals || [];
    const aiScore   = opportunity?.cachedScore?.score || null;
    const aiVerdict = opportunity?.cachedScore?.verdict || null;

    // Recent activities for timeline (top 5)
    const recentActs = oppActivities.slice(0, 5);
    const actIconMap = { Call: 'phone', Email: 'mail', Meeting: 'meeting', Demo: 'meeting', 'Proposal Sent': 'doc', 'Follow-up': 'phone', Other: 'doc', stage: 'layers' };
    const actColorMap = { Call: T.info, Email: T.inkMid, Meeting: T.ok, Demo: T.ok, 'Proposal Sent': T.goldInk, 'Follow-up': T.info, Other: T.inkMuted, stage: T.goldInk };

    const fmtDateShort = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* ── AI Read ─────────────────────────────────────── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ ...ey(T.goldInk) }}>AI read</div>
                    {aiScore != null && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFeatureSettings: '"tnum"', fontFamily: T.sans }}>{aiScore}</span>
                            <span style={{ fontSize: 10, color: T.ok, fontWeight: 700, fontFamily: T.sans }}>/ 100</span>
                        </div>
                    )}
                </div>
                {aiSignals.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {aiSignals.slice(0, 4).map((s, i) => (
                            <SignalChip key={i} kind={s.kind} text={s.text}/>
                        ))}
                        {(aiSignals.length > 4 || true) && (
                            <button type="button" onClick={onOpenAi}
                                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontSize: 11, color: T.inkMuted, cursor: 'pointer', fontFamily: T.sans, textDecoration: 'underline', textDecorationColor: T.border }}>
                                Full AI analysis →
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: '12px', background: T.surface2, border: `1px dashed ${T.border}`, borderRadius: T.r, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans, marginBottom: 8 }}>No score yet</div>
                        <GhostBtn size="sm" icon="sparkle" onClick={onOpenAi}>Score this deal</GhostBtn>
                    </div>
                )}
            </div>

            {/* ── Buying committee ────────────────────────────── */}
            <div>
                <RailLabel color={T.goldInk} action="Add" onAction={onOpenContact}>
                    Buying committee{enrichedContacts.length > 0 ? ` · ${enrichedContacts.length}` : ''}
                </RailLabel>
                {enrichedContacts.length === 0 ? (
                    <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans, fontStyle: 'italic', padding: '8px 0' }}>No contacts linked yet.</div>
                ) : (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                        {enrichedContacts.map((c, i) => (
                            <div key={c.name} style={{ display: 'flex', gap: 10, padding: '9px 12px', alignItems: 'center', borderTop: i === 0 ? 'none' : `1px solid ${T.border}` }}>
                                <Avatar name={c.name} size={30}/>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{c.name}</span>
                                        <EngDot level={c.engagement} size={7}/>
                                    </div>
                                    {c.title && <div style={{ fontSize: 11, color: T.inkMid, marginTop: 1, fontFamily: T.sans }}>{c.title}</div>}
                                </div>
                                {c.lastTouch && (
                                    <div style={{ fontSize: 10, color: T.inkMuted, flexShrink: 0, fontFamily: T.sans }}>
                                        {fmtDateShort(c.lastTouch)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {enrichedContacts.length > 0 && (
                    <button type="button" onClick={onOpenContacts}
                        style={{ background: 'none', border: 'none', padding: '6px 0 0', textAlign: 'left', fontSize: 11, color: T.inkMuted, cursor: 'pointer', fontFamily: T.sans, textDecoration: 'underline', textDecorationColor: T.border }}>
                        Engagement details →
                    </button>
                )}
            </div>

            {/* ── Activity timeline ───────────────────────────── */}
            <div>
                <RailLabel action="Log" onAction={onOpenActivity}>
                    Activity{recentActs.length > 0 ? ` · ${oppActivities.length}` : ''}
                </RailLabel>
                {recentActs.length === 0 ? (
                    <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans, fontStyle: 'italic', padding: '8px 0' }}>No activities yet.</div>
                ) : (
                    <div style={{ borderLeft: `1px solid ${T.border}`, paddingLeft: 14, position: 'relative' }}>
                        {recentActs.map((a, i) => (
                            <div key={a.id} style={{ position: 'relative', paddingBottom: i < recentActs.length - 1 ? 14 : 0 }}>
                                <div style={{ position: 'absolute', left: -19, top: 3, width: 10, height: 10, borderRadius: '50%',
                                    background: T.surface, border: `1.5px solid ${T.goldInk}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon name={actIconMap[a.type] || 'doc'} size={6} color={T.goldInk} sw={2.5}/>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.3, fontFamily: T.sans }}>{a.type}</div>
                                    <div style={{ fontSize: 10.5, color: T.inkMuted, flexShrink: 0, marginLeft: 8, fontFamily: T.sans }}>{fmtDateShort(a.date)}</div>
                                </div>
                                {a.notes && (
                                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 3, lineHeight: 1.45, fontFamily: T.serif, fontStyle: 'italic' }}>"{a.notes.slice(0, 80)}{a.notes.length > 80 ? '…' : ''}"</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {oppActivities.length > 5 && (
                    <button type="button" onClick={onOpenHistory}
                        style={{ background: 'none', border: 'none', padding: '8px 0 0', textAlign: 'left', fontSize: 11, color: T.inkMuted, cursor: 'pointer', fontFamily: T.sans, textDecoration: 'underline', textDecorationColor: T.border }}>
                        See all {oppActivities.length} →
                    </button>
                )}
            </div>

        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  Main export
// ─────────────────────────────────────────────────────────────
export default function OpportunityModal({
    opportunity, accounts, contacts, settings, pipelines, activePipelineId,
    currentUser, activities, onSaveActivity, onDeleteActivity,
    onSaveComment, onEditComment, onDeleteComment,
    onClose, onSave, onAddAccount, onSaveNewContact, onSaveNewAccount, onAddContact,
    lastCreatedAccountName, onAddRep, lastCreatedRepName,
    errorMessage, onDismissError, saving
}) {
    const stages = (settings.funnelStages && settings.funnelStages.length > 0)
        ? settings.funnelStages.filter(s => s.name.trim()).map(s => s.name)
        : ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'];

    const allPipelines = (pipelines && pipelines.length > 0) ? pipelines : [{ id: 'default', name: 'New Business', color: T.info }];

    const modalUserRecord = (settings.users || []).find(u => u.name === currentUser);
    const modalUserRole = modalUserRecord ? (modalUserRecord.userType || 'User') : (settings.users || []).length === 0 ? 'Admin' : 'User';
    const canViewField = (fieldKey) => {
        const fv = settings.fieldVisibility || {};
        const rules = fv[fieldKey];
        if (!rules) return true;
        return rules[modalUserRole] !== false;
    };

    // ── Form state ──────────────────────────────────────────
    const [formData, setFormData] = useState(() => {
        const base = opportunity || {
            opportunityName: '', account: '', site: '', salesRep: '',
            painPoints: '', contacts: '', stage: 'Qualification',
            probability: null, arr: 0, implementationCost: 0,
            forecastedCloseDate: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
            products: '', unionized: 'No', notes: '', nextSteps: '',
            pipelineId: activePipelineId || 'default'
        };
        return {
            ...base,
            opportunityName: base.opportunityName ?? '',
            account:         base.account ?? '',
            site:            base.site ?? '',
            salesRep:        base.salesRep ?? '',
            painPoints:      base.painPoints ?? '',
            contacts:        base.contacts ?? '',
            stage:           base.stage ?? 'Qualification',
            notes:           base.notes ?? '',
            nextSteps:       base.nextSteps ?? '',
            products:        base.products ?? '',
            unionized:       base.unionized ?? 'No',
            forecastedCloseDate: base.forecastedCloseDate ?? [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
            pipelineId:      base.pipelineId ?? activePipelineId ?? 'default',
            arr:             parseFloat(base.arr) || 0,
            implementationCost: parseFloat(base.implementationCost) || 0,
            productRevenues: (base.productRevenues && typeof base.productRevenues === 'object') ? base.productRevenues : {},
        };
    });


    const [contactSearch, setContactSearch]             = useState('');
    const [showContactSuggestions, setShowContactSuggestions] = useState(false);
    const [accountSearch, setAccountSearch]             = useState(opportunity?.account || '');
    const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
    const [siteSearch, setSiteSearch]                   = useState(opportunity?.site || '');
    const [showSiteSuggestions, setShowSiteSuggestions] = useState(false);
    const [repSearch, setRepSearch]                     = useState(opportunity?.salesRep || '');
    const [showRepSuggestions, setShowRepSuggestions]   = useState(false);
    const [selectedContacts, setSelectedContacts]       = useState(opportunity?.contacts ? opportunity.contacts.split(', ').filter(c => c) : []);
    const [selectedContactIds, setSelectedContactIds]   = useState(opportunity?.contactIds || []);
    const [nestedModal, setNestedModal]                 = useState(null);
    const [validationErrors, setValidationErrors]       = useState({});


    // Rail drawer state — which detail panel is open
    // null = show rail, 'history' | 'contacts' | 'ai-score' | 'quotes' = show full-width tab
    const [detailTab, setDetailTab] = useState(null);

    // Comment thread state (fully preserved)
    const [commentDraft, setCommentDraft]               = useState('');
    const [editingCommentId, setEditingCommentId]       = useState(null);
    const [editingCommentText, setEditingCommentText]   = useState('');
    const [mentionQuery, setMentionQuery]               = useState(null);
    const [mentionAnchorPos, setMentionAnchorPos]       = useState(0);
    const commentTextareaRef = useRef(null);

    const comments = (opportunity?.comments || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const teamMembers = (settings?.users || []).map(u => u.name).filter(Boolean).sort();

    // Auto-populate account when a new one is created
    useEffect(() => {
        if (lastCreatedAccountName) {
            setAccountSearch(lastCreatedAccountName);
            setFormData(prev => ({ ...prev, account: lastCreatedAccountName }));
        }
    }, [lastCreatedAccountName]);

    // Auto-populate rep when a new one is created
    useEffect(() => {
        if (lastCreatedRepName) {
            setRepSearch(lastCreatedRepName);
            setFormData(prev => ({ ...prev, salesRep: lastCreatedRepName }));
        }
    }, [lastCreatedRepName]);

    // ── Fiscal quarter helper ────────────────────────────────
    const calculateCloseQuarter = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const fiscalStart = settings?.fiscalYearStart || 10;
        let monthsFromFiscalStart = month - fiscalStart;
        if (monthsFromFiscalStart < 0) monthsFromFiscalStart += 12;
        const quarter = Math.floor(monthsFromFiscalStart / 3) + 1;
        const fiscalYear = month >= fiscalStart ? year + 1 : year;
        return `FY${fiscalYear} Q${quarter}`;
    };
    const closeQuarter = calculateCloseQuarter(formData.forecastedCloseDate);

    // ── Account/site option builders (fully preserved) ───────
    const allAccountOptions = [];
    const topLevel = (accounts || []).filter(a => !a.parentAccountId);
    topLevel.forEach(account => {
        allAccountOptions.push({ value: account.name, label: account.name, tier: 'account', id: account.id });
        const bus = (accounts || []).filter(a => a.parentAccountId === account.id);
        bus.forEach(bu => {
            allAccountOptions.push({ value: bu.name, label: `${account.name} › ${bu.name}`, tier: 'business_unit', id: bu.id, parentName: account.name });
            (accounts || []).filter(a => a.parentAccountId === bu.id).forEach(site => {
                allAccountOptions.push({ value: site.name, label: `${account.name} › ${bu.name} › ${site.name}`, tier: 'site', id: site.id, parentName: bu.name });
            });
        });
        const directSites = (accounts || []).filter(a => a.parentAccountId === account.id && a.accountTier === 'site');
        directSites.forEach(site => {
            if (!allAccountOptions.find(o => o.id === site.id))
                allAccountOptions.push({ value: site.name, label: `${account.name} › ${site.name}`, tier: 'site', id: site.id, parentName: account.name });
        });
    });

    const getSitesForAccount = (accountName) => {
        if (!accountName) return [];
        const matched = (accounts || []).find(a => a.name.toLowerCase() === accountName.toLowerCase());
        if (!matched) return [];
        const directChildren = (accounts || []).filter(a => a.parentAccountId === matched.id);
        if (matched.parentAccountId) return directChildren;
        const directSites = directChildren.filter(a => a.accountTier === 'site' || !(accounts || []).some(x => x.parentAccountId === a.id));
        const bus = directChildren.filter(a => a.accountTier === 'business_unit' || (accounts || []).some(x => x.parentAccountId === a.id));
        const viaBU = bus.flatMap(bu => (accounts || []).filter(a => a.parentAccountId === bu.id));
        return [...directSites, ...viaBU];
    };

    // ── Field change handler (fully preserved) ───────────────
    const handleChange = (field, value) => {
        if (validationErrors[field]) setValidationErrors(prev => { const n = {...prev}; delete n[field]; return n; });
        if (field === 'stage') {
            const stageDefault = (settings?.funnelStages || []).find(s => s.name === value);
            const defaultProb = stageDefault ? stageDefault.weight : null;
            const prevStageDefault = (settings?.funnelStages || []).find(s => s.name === formData.stage);
            const prevDefaultProb = prevStageDefault ? prevStageDefault.weight : null;
            const probIsDefault = formData.probability === null || formData.probability === prevDefaultProb;
            setFormData({ ...formData, [field]: value, probability: probIsDefault ? defaultProb : formData.probability });
        } else {
            setFormData({ ...formData, [field]: value });
        }
    };

    // ── Submit handler (fully preserved) ─────────────────────
    const handleSubmit = (e) => {
        e.preventDefault();
        const errors = {};
        if (!formData.opportunityName || !formData.opportunityName.trim()) errors.opportunityName = 'Opportunity name is required';
        if (!formData.account || !formData.account.trim()) errors.account = 'Account name is required';
        if (!formData.salesRep || !formData.salesRep.trim()) errors.salesRep = 'Sales rep is required';
        if (!formData.forecastedCloseDate) errors.forecastedCloseDate = 'Close date is required';
        if (formData.arr === '' || formData.arr === null || formData.arr === undefined || parseFloat(formData.arr) < 0)
            errors.arr = 'Revenue is required';
        if (formData.account && formData.account.trim()) {
            const isJustCreated = lastCreatedAccountName && lastCreatedAccountName.toLowerCase() === formData.account.trim().toLowerCase();
            if (!isJustCreated) {
                const accountExists = (accounts || []).some(a => a.name && a.name.toLowerCase() === formData.account.trim().toLowerCase());
                if (!accountExists) errors.account = '__not_found__';
            }
        }
        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            setTimeout(() => { const el = document.querySelector('.opp-field-error'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
            return;
        }
        setValidationErrors({});
        onSave({ ...formData, arr: parseFloat(formData.arr) || 0, probability: (formData.probability !== null && formData.probability !== undefined && !isNaN(formData.probability)) ? formData.probability : null, closeQuarter, contactIds: selectedContactIds });
    };

    // ── @mention helpers (fully preserved) ───────────────────
    const extractMentions = (text) => {
        if (!text) return [];
        const found = [];
        const parts = text.split('@');
        for (let i = 1; i < parts.length; i++) {
            for (const name of [...teamMembers].sort((a, b) => b.length - a.length)) {
                if (parts[i].startsWith(name)) { found.push(name); break; }
            }
        }
        return [...new Set(found)];
    };
    const renderCommentText = (text) => {
        if (!text) return null;
        return text.split(/(@[\w][\w\s]*)/g).map((part, i) => {
            if (part.startsWith('@')) {
                const name = part.slice(1).trim();
                return teamMembers.includes(name)
                    ? <span key={i} style={{ background: 'rgba(58,90,122,0.15)', color: T.info, borderRadius: T.r, padding: '0.0625rem 0.375rem', fontWeight: '700', fontSize: '0.8125rem' }}>{part}</span>
                    : <span key={i}>{part}</span>;
            }
            return <span key={i}>{part}</span>;
        });
    };
    const handleCommentDraftChange = (e) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart;
        setCommentDraft(val);
        const textBeforeCursor = val.slice(0, cursor);
        const atMatch = textBeforeCursor.match(/@([\w\s]*)$/);
        if (atMatch) { setMentionQuery(atMatch[1]); setMentionAnchorPos(textBeforeCursor.lastIndexOf('@')); }
        else setMentionQuery(null);
    };
    const insertMention = (name) => {
        const before = commentDraft.slice(0, mentionAnchorPos);
        const after = commentDraft.slice(mentionAnchorPos).replace(/@[\w\s]*/, '');
        setCommentDraft(before + '@' + name + ' ' + after);
        setMentionQuery(null);
        if (commentTextareaRef.current) commentTextareaRef.current.focus();
    };
    const filteredMentions = mentionQuery !== null ? teamMembers.filter(m => m.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6) : [];

    // ── Activity data for this opp ────────────────────────────
    const oppActivities = opportunity
        ? (activities || []).filter(a => a.opportunityId === opportunity.id).sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'))
        : [];

    const activityTypeIcon = { Call: '📞', Email: '✉️', Meeting: '🤝', Demo: '🖥️', 'Proposal Sent': '📄', 'Follow-up': '🔄', Other: '📝' };

    // ── Drag + resize (unchanged) ─────────────────────────────
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(1100, 780, 760, 540);

    // ── Deal age metadata ─────────────────────────────────────
    const dealAgeInfo = opportunity ? (() => {
        const today = new Date();
        const dealAge = opportunity.createdDate ? Math.floor((today - new Date(opportunity.createdDate + 'T12:00:00')) / 86400000) : null;
        const timeInStage = opportunity.stageChangedDate ? Math.floor((today - new Date(opportunity.stageChangedDate + 'T12:00:00')) / 86400000) : null;
        return { dealAge, timeInStage };
    })() : null;

    // Whether to show the split layout or single column (below min-width)
    const showSplit = size.w >= 760 && !detailTab;

    // ── Inline input styles ───────────────────────────────────
    const inputStyle = (err) => ({
        width: '100%', padding: '7px 10px',
        border: `1px solid ${err ? T.danger : T.border}`,
        borderRadius: T.r, fontSize: 13, fontFamily: T.sans,
        background: err ? 'rgba(156,58,46,0.04)' : T.surface,
        color: T.ink, boxSizing: 'border-box', outline: 'none',
    });
    const fieldLabelStyle = { ...ey(), display: 'block', marginBottom: 4 };

    const suggestionDropStyle = {
        position: 'absolute', top: '100%', left: 0, right: 0,
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
        marginTop: 3, maxHeight: 200, overflowY: 'auto', zIndex: 1000,
        boxShadow: '0 4px 12px rgba(42,38,34,0.12)',
    };
    const suggestionItemStyle = (hovered) => ({
        padding: '8px 10px', cursor: 'pointer', fontSize: 13, fontFamily: T.sans,
        background: hovered ? T.surface2 : 'transparent',
        borderBottom: `1px solid ${T.border}`, color: T.ink,
    });

    // ─────────────────────────────────────────────────────────
    //  RENDER
    // ─────────────────────────────────────────────────────────
    return (
        <>
            <style>{`@keyframes opp-spin { to { transform: rotate(360deg); } }`}</style>

            {/* Error overlay (fully preserved) */}
            {errorMessage && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ background: T.surface, borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center', fontFamily: T.sans }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(156,58,46,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: T.ink }}>Failed to Save Opportunity</h3>
                        <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: T.inkMid, lineHeight: 1.6 }}>{errorMessage}</p>
                        <GhostBtn onClick={onDismissError}>OK</GhostBtn>
                    </div>
                </div>
            )}

            {/* Three-div overlay pattern — UNCHANGED */}
            <div style={{ ...overlayStyle }} />
            <div style={clickCatcherStyle} />

            {/* Modal container */}
            <div
                ref={containerRef}
                onClick={e => e.stopPropagation()}
                style={{
                    ...dragOffsetStyle,
                    width: size.w, height: size.h,
                    background: T.bg,
                    borderRadius: 6,
                    boxShadow: '0 24px 60px rgba(42,38,34,0.32), 0 4px 12px rgba(42,38,34,0.16)',
                    border: `1px solid ${T.borderStrong}`,
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden', fontFamily: T.sans,
                }}
            >
                {/* ── Header bar ─────────────────────────────────── */}
                <div {...dragHandleProps} style={{
                    ...dragHandleProps.style,
                    background: T.surfaceInk,
                    padding: '0 20px',
                    height: 50,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                    borderRadius: '6px 6px 0 0',
                }}>
                    {/* Left: deal name + pipeline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'inherit', userSelect: 'none' }}>
                            <Icon name="grip" size={14} color="rgba(230,221,208,0.35)" sw={1.5}/>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.surfaceInkFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 400, cursor: 'inherit', userSelect: 'none' }}>
                                {opportunity ? (opportunity.opportunityName || opportunity.account || 'Edit Opportunity') : 'New Opportunity'}
                            </div>
                            {opportunity && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
                                    {opportunity.account && <span style={{ fontSize: 11, color: T.gold }}>{opportunity.account}</span>}
                                    {opportunity.stage && <StatusBadge status={opportunity.stage === 'Closed Won' ? 'Won' : opportunity.stage === 'Closed Lost' ? 'Lost' : 'Open'}/>}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Right: ID + detail tabs + close */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {opportunity && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(245,241,235,0.35)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: T.r, padding: '2px 8px', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
                                {opportunity.id}
                            </span>
                        )}
                        {/* Detail tab pills (only for existing opps) */}
                        {opportunity && (
                            <div style={{ display: 'flex', gap: 2 }}>
                                {[
                                    { id: 'history',   label: 'History'   },
                                    { id: 'contacts',  label: 'Contacts'  },
                                    ...(settings?.aiScoringEnabled ? [{ id: 'ai-score', label: 'AI Score' }] : []),
                                    { id: 'quotes',    label: 'Quotes'    },
                                ].map(tab => (
                                    <button key={tab.id} type="button" onClick={() => setDetailTab(detailTab === tab.id ? null : tab.id)}
                                        style={{ padding: '3px 10px', fontSize: 11, fontWeight: detailTab === tab.id ? 700 : 500, fontFamily: T.sans,
                                            cursor: 'pointer', border: 'none',
                                            borderBottom: detailTab === tab.id ? `2px solid ${T.gold}` : '2px solid transparent',
                                            background: 'transparent',
                                            color: detailTab === tab.id ? T.gold : 'rgba(230,221,208,0.55)',
                                            transition: 'all 0.15s' }}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button type="button" onClick={onClose}
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: T.r, color: T.surfaceInkFg, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 }}>
                            <Icon name="x" size={14} color={T.surfaceInkFg} sw={2}/>
                        </button>
                    </div>
                </div>

                {/* ── Body ───────────────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                    {/* ── Detail tabs (full width, replaces split layout) ── */}
                    {detailTab && opportunity && (
                        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                            {detailTab === 'history' && (
                                <DealHistoryTab opportunity={opportunity} oppActivities={oppActivities} stages={stages} settings={settings} contacts={contacts}
                                    activityTypeIcon={activityTypeIcon} onSaveActivity={onSaveActivity} onDeleteActivity={onDeleteActivity}
                                    currentUser={currentUser} onClose={onClose} saving={saving}
                                    onUpdate={() => { const f = document.getElementById('opp-form'); if (f) f.requestSubmit(); }}/>
                            )}
                            {detailTab === 'contacts' && (
                                <ContactEngagementTab opportunity={opportunity} oppActivities={oppActivities} contacts={contacts}
                                    onClose={onClose} saving={saving}
                                    onUpdate={() => { const f = document.getElementById('opp-form'); if (f) f.requestSubmit(); }}/>
                            )}
                            {detailTab === 'ai-score' && (
                                <AiScoreTab opportunity={opportunity} oppActivities={oppActivities} currentUser={currentUser}
                                    onClose={onClose}
                                    onUpdate={() => { const f = document.getElementById('opp-form'); if (f) f.requestSubmit(); }}/>
                            )}
                            {detailTab === 'quotes' && (
                                <OppQuotesPanel opportunity={opportunity} contacts={contacts} onClose={onClose}/>
                            )}
                        </div>
                    )}

                    {/* ── Split cockpit ─────────────────────────────── */}
                    {!detailTab && (
                        <>
                            {/* LEFT — scrollable form */}
                            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', borderRight: showSplit ? `1px solid ${T.border}` : 'none', minWidth: 0 }}>
                                <form id="opp-form" onSubmit={handleSubmit}>

                                    {/* ── Lost reason banner ── */}
                                    {opportunity && opportunity.stage === 'Closed Lost' && (opportunity.lostCategory || opportunity.lostReason) && (
                                        <div style={{ padding: '0.75rem 0.875rem', background: 'rgba(156,58,46,0.07)', border: `1px solid rgba(156,58,46,0.25)`, borderRadius: T.r, marginBottom: '1rem' }}>
                                            <div style={{ ...ey(T.danger), marginBottom: 4 }}>Loss Reason</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {opportunity.lostCategory && <span style={{ fontWeight: 700, fontSize: 13, color: T.danger, fontFamily: T.sans }}>{opportunity.lostCategory}</span>}
                                                {opportunity.lostReason && <span style={{ fontSize: 13, color: T.inkMid, fontFamily: T.sans }}>{opportunity.lostReason}</span>}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Deal age strip ── */}
                                    {opportunity && dealAgeInfo && (dealAgeInfo.dealAge !== null || dealAgeInfo.timeInStage !== null) && (
                                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: '1rem', padding: '7px 12px', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            {dealAgeInfo.dealAge !== null && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span style={{ ...ey() }}>Deal Age</span>
                                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: dealAgeInfo.dealAge > 90 ? T.danger : dealAgeInfo.dealAge > 60 ? T.warn : T.ok, fontFamily: T.sans }}>{dealAgeInfo.dealAge}d</span>
                                                </div>
                                            )}
                                            {dealAgeInfo.timeInStage !== null && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span style={{ ...ey() }}>In Stage</span>
                                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: dealAgeInfo.timeInStage > 30 ? T.danger : dealAgeInfo.timeInStage > 14 ? T.warn : T.ok, fontFamily: T.sans }}>{dealAgeInfo.timeInStage}d</span>
                                                    {dealAgeInfo.timeInStage > 14 && opportunity.stage !== 'Closed Won' && opportunity.stage !== 'Closed Lost' && (
                                                        <span style={{ fontSize: 10, color: dealAgeInfo.timeInStage > 30 ? T.danger : T.warn, fontWeight: 700, background: dealAgeInfo.timeInStage > 30 ? 'rgba(156,58,46,0.08)' : 'rgba(184,115,51,0.08)', padding: '1px 6px', borderRadius: T.r, border: `1px solid ${dealAgeInfo.timeInStage > 30 ? 'rgba(156,58,46,0.25)' : 'rgba(184,115,51,0.25)'}`, fontFamily: T.sans }}>⚠ Stale</span>
                                                    )}
                                                </div>
                                            )}
                                            {oppActivities.length > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span style={{ ...ey() }}>Last Activity</span>
                                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkMid, fontFamily: T.sans }}>
                                                        {new Date(oppActivities[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {oppActivities[0].type}
                                                    </span>
                                                </div>
                                            )}
                                            {oppActivities.length === 0 && opportunity.stage !== 'Closed Won' && opportunity.stage !== 'Closed Lost' && (
                                                <span style={{ fontSize: 11, fontWeight: 700, color: T.danger, background: 'rgba(156,58,46,0.08)', padding: '2px 8px', borderRadius: T.r, border: `1px solid rgba(156,58,46,0.22)`, fontFamily: T.sans }}>⚠ No activities</span>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Stage ribbon ── */}
                                    <div style={{ marginBottom: 20 }}>
                                        <div style={{ ...ey(T.goldInk), marginBottom: 6 }}>Stage</div>
                                        <StageRibbon allStages={stages} current={formData.stage} onStage={(s) => handleChange('stage', s)}/>
                                        {(() => {
                                            const stageDefault = (settings?.funnelStages || []).find(s => s.name === formData.stage);
                                            const timeInStage = opportunity?.stageChangedDate ? Math.floor((Date.now() - new Date(opportunity.stageChangedDate + 'T12:00:00').getTime()) / 86400000) : null;
                                            if (!stageDefault && timeInStage === null) return null;
                                            return (
                                                <div style={{ fontSize: 11.5, color: T.inkMuted, marginTop: 6, fontFamily: T.serif, fontStyle: 'italic' }}>
                                                    {timeInStage !== null ? `${timeInStage} days in ${formData.stage}` : formData.stage}
                                                    {stageDefault?.weight != null && ` · ${stageDefault.weight}% default probability`}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* ── Opp name + Pipeline ── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: allPipelines.length > 1 ? '1fr 180px' : '1fr', gap: 12, marginBottom: 16 }}>
                                        <div>
                                            <label style={fieldLabelStyle}>Opportunity Name *</label>
                                            <input type="text" value={formData.opportunityName}
                                                onChange={e => handleChange('opportunityName', e.target.value)}
                                                placeholder="e.g. Acme Corp — Q3 Expansion"
                                                style={inputStyle(validationErrors.opportunityName)}/>
                                            {validationErrors.opportunityName && <div className="opp-field-error" style={{ color: T.danger, fontSize: 11, fontWeight: 600, marginTop: 3, fontFamily: T.sans }}>⚠ {validationErrors.opportunityName}</div>}
                                        </div>
                                        {allPipelines.length > 1 && (
                                            <div>
                                                <label style={fieldLabelStyle}>Pipeline</label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {allPipelines.map(p => {
                                                        const sel = formData.pipelineId === p.id;
                                                        return (
                                                            <button key={p.id} type="button" onClick={() => handleChange('pipelineId', p.id)}
                                                                style={{ padding: '5px 12px', border: `1.5px solid ${sel ? p.color : T.border}`, borderRadius: T.r, background: sel ? p.color + '18' : T.surface, color: sel ? p.color : T.inkMid, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>
                                                                {p.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Account + Site ── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                        {/* Account */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={fieldLabelStyle}>Account *</label>
                                            <input type="text" value={accountSearch}
                                                onChange={e => { setAccountSearch(e.target.value); setShowAccountSuggestions(e.target.value.length > 0); if (validationErrors.account) setValidationErrors(prev => { const n={...prev}; delete n.account; return n; }); if (!e.target.value.trim()) { setFormData(prev => ({ ...prev, account: '' })); } }}
                                                onFocus={() => setShowAccountSuggestions(accountSearch.length > 0)}
                                                onBlur={() => setTimeout(() => setShowAccountSuggestions(false), 200)}
                                                placeholder="Start typing account name…"
                                                autoComplete="off"
                                                style={inputStyle(validationErrors.account)}/>
                                            {validationErrors.account && validationErrors.account !== '__not_found__' && (
                                                <div className="opp-field-error" style={{ color: T.danger, fontSize: 11, fontWeight: 600, marginTop: 3, fontFamily: T.sans }}>⚠ {validationErrors.account}</div>
                                            )}
                                            {validationErrors.account === '__not_found__' && (
                                                <div style={{ marginTop: 4, background: 'rgba(184,115,51,0.09)', border: `1px solid rgba(184,115,51,0.3)`, borderRadius: T.r, padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                    <span style={{ color: T.warn, fontSize: 12, fontWeight: 600, fontFamily: T.sans }}>⚠ "{formData.account}" not in accounts list.</span>
                                                    <button type="button" onClick={() => { setValidationErrors(prev => { const n = {...prev}; delete n.account; return n; }); onAddAccount(formData); }}
                                                        style={{ background: T.warn, color: '#fff', border: 'none', borderRadius: T.r, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: T.sans }}>
                                                        + Create Account
                                                    </button>
                                                </div>
                                            )}
                                            {showAccountSuggestions && (
                                                <div style={suggestionDropStyle}>
                                                    {allAccountOptions.filter(opt => opt.tier !== 'site').filter(opt => !accountSearch || opt.value.toLowerCase().includes(accountSearch.toLowerCase()) || opt.label.toLowerCase().includes(accountSearch.toLowerCase())).map(opt => (
                                                        <div key={opt.id || opt.value}
                                                            onMouseDown={e => e.preventDefault()}
                                                            onClick={() => { setAccountSearch(opt.value); setFormData(prev => ({ ...prev, account: opt.value, site: '' })); setSiteSearch(''); setShowAccountSuggestions(false); setValidationErrors(prev => { const n={...prev}; delete n.account; return n; }); const sites = getSitesForAccount(opt.value); if (sites.length > 0) setShowSiteSuggestions(true); }}
                                                            style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontFamily: T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <div style={{ fontWeight: 600, color: T.ink }}>{opt.value}</div>
                                                            {opt.parentName && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{opt.label}</div>}
                                                        </div>
                                                    ))}
                                                    <div onMouseDown={e => e.preventDefault()} onClick={() => { setShowAccountSuggestions(false); onAddAccount(formData); }}
                                                        style={{ padding: '8px 10px', cursor: 'pointer', color: T.info, fontWeight: 600, fontSize: 13, fontFamily: T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        + New Account
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* Site */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={fieldLabelStyle}>Site Name</label>
                                            <input type="text" value={siteSearch}
                                                onChange={e => { setSiteSearch(e.target.value); handleChange('site', e.target.value); setShowSiteSuggestions(true); }}
                                                onFocus={() => setShowSiteSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowSiteSuggestions(false), 200)}
                                                placeholder="Plant / location…"
                                                autoComplete="off"
                                                style={inputStyle(false)}/>
                                            {showSiteSuggestions && (() => {
                                                const available = getSitesForAccount(formData.account);
                                                const filtered = available.filter(s => !siteSearch || s.name.toLowerCase().includes(siteSearch.toLowerCase()));
                                                if (filtered.length === 0) return null;
                                                return (
                                                    <div style={suggestionDropStyle}>
                                                        {filtered.map(s => (
                                                            <div key={s.id} onMouseDown={e => e.preventDefault()}
                                                                onClick={() => { setSiteSearch(s.name); handleChange('site', s.name); setShowSiteSuggestions(false); }}
                                                                style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontFamily: T.sans }}
                                                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                {s.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* ── Rep + Close date ── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                        {/* Sales rep */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={fieldLabelStyle}>Sales Rep *</label>
                                            <input type="text" value={repSearch}
                                                onChange={e => { setRepSearch(e.target.value); setShowRepSuggestions(true); handleChange('salesRep', e.target.value); }}
                                                onFocus={() => setShowRepSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowRepSuggestions(false), 200)}
                                                placeholder="Assign to…"
                                                autoComplete="off"
                                                style={inputStyle(validationErrors.salesRep)}/>
                                            {validationErrors.salesRep && <div className="opp-field-error" style={{ color: T.danger, fontSize: 11, fontWeight: 600, marginTop: 3, fontFamily: T.sans }}>⚠ {validationErrors.salesRep}</div>}
                                            {showRepSuggestions && (
                                                <div style={suggestionDropStyle}>
                                                    {(settings?.users || []).filter(u => u.name.toLowerCase().startsWith(repSearch.toLowerCase())).map(user => (
                                                        <div key={user.id} onMouseDown={e => e.preventDefault()}
                                                            onClick={() => { setRepSearch(user.name); handleChange('salesRep', user.name); setShowRepSuggestions(false); }}
                                                            style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, fontWeight: 600, fontSize: 13, fontFamily: T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            {user.name}
                                                        </div>
                                                    ))}
                                                    <div onMouseDown={e => e.preventDefault()} onClick={() => { setShowRepSuggestions(false); if (onAddRep) onAddRep(); }}
                                                        style={{ padding: '8px 10px', cursor: 'pointer', color: T.info, fontWeight: 600, fontSize: 13, fontFamily: T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        + New Rep
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* Close date */}
                                        <div>
                                            <label style={fieldLabelStyle}>
                                                Close Date * {closeQuarter && <span style={{ color: T.inkMuted, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>{closeQuarter}</span>}
                                            </label>
                                            <input type="date" value={formData.forecastedCloseDate}
                                                onChange={e => handleChange('forecastedCloseDate', e.target.value)}
                                                style={inputStyle(validationErrors.forecastedCloseDate)}/>
                                            {validationErrors.forecastedCloseDate && <div className="opp-field-error" style={{ color: T.danger, fontSize: 11, fontWeight: 600, marginTop: 3, fontFamily: T.sans }}>⚠ {validationErrors.forecastedCloseDate}</div>}
                                        </div>
                                    </div>

                                    {/* ── Probability ── */}
                                    {canViewField('probability') && (() => {
                                        const stageDefault = (settings?.funnelStages || []).find(s => s.name === formData.stage);
                                        const rawWeight = stageDefault ? parseFloat(stageDefault.weight) : NaN;
                                        const defaultProb = !isNaN(rawWeight) ? rawWeight : null;
                                        const effectiveProb = (formData.probability !== null && formData.probability !== undefined && !isNaN(formData.probability)) ? formData.probability : defaultProb;
                                        const isOverridden = formData.probability !== null && formData.probability !== undefined && !isNaN(formData.probability) && formData.probability !== defaultProb;
                                        return (
                                            <div style={{ marginBottom: 16 }}>
                                                <label style={{ ...fieldLabelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    Probability (%)
                                                    {isOverridden && <span style={{ fontSize: 10, fontWeight: 700, color: T.warn, background: 'rgba(184,115,51,0.1)', border: `1px solid rgba(184,115,51,0.3)`, padding: '1px 6px', borderRadius: T.r, letterSpacing: '0.03em', fontFamily: T.sans }}>✎ OVERRIDDEN</span>}
                                                    {!isOverridden && defaultProb !== null && <span style={{ fontSize: 10, color: T.inkMuted, fontWeight: 400, fontFamily: T.sans }}>stage default</span>}
                                                </label>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <input type="number" min="0" max="100"
                                                        value={(effectiveProb !== null && effectiveProb !== undefined && !isNaN(effectiveProb)) ? effectiveProb : ''}
                                                        placeholder={defaultProb !== null ? String(defaultProb) : '0'}
                                                        onChange={e => { const val = e.target.value === '' ? null : Math.min(100, Math.max(0, parseInt(e.target.value) || 0)); handleChange('probability', val); }}
                                                        style={{ ...inputStyle(false), flex: 1 }}/>
                                                    {isOverridden && (
                                                        <GhostBtn type="button" onClick={() => handleChange('probability', defaultProb)}>↺ Reset</GhostBtn>
                                                    )}
                                                </div>
                                                {isOverridden && defaultProb !== null && (
                                                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 3, fontFamily: T.sans }}>
                                                        Stage default: {defaultProb}% · your override: {formData.probability}%
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* ── Forecast Category ── */}
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={{ ...fieldLabelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            Forecast Category
                                            <span style={{ fontSize: 10, color: T.inkMuted, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontFamily: T.sans }}>drives Reports forecast</span>
                                        </label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {[
                                                { value: 'commit',    label: 'Commit',    bg: 'rgba(42,38,34,0.08)',  fg: T.ink,    bd: T.borderStrong,         hint: 'High confidence — counts in forecast' },
                                                { value: 'best_case', label: 'Best Case', bg: 'rgba(58,90,122,0.10)', fg: T.info,   bd: 'rgba(58,90,122,0.35)', hint: 'Upside — possible but not certain' },
                                                { value: 'pipeline',  label: 'Pipeline',  bg: T.surface2,             fg: T.inkMid, bd: T.border,               hint: 'Too early to call' },
                                                { value: 'omit',      label: 'Omit',      bg: 'rgba(156,58,46,0.07)', fg: T.danger, bd: 'rgba(156,58,46,0.28)', hint: 'Excluded from forecast' },
                                            ].map(({ value, label, bg, fg, bd, hint }) => {
                                                const sel = (formData.forecastCategory || 'pipeline') === value;
                                                return (
                                                    <button key={value} type="button"
                                                        title={hint}
                                                        onClick={() => handleChange('forecastCategory', value)}
                                                        style={{
                                                            flex: 1, padding: '7px 4px',
                                                            border: `1.5px solid ${sel ? bd : T.border}`,
                                                            borderRadius: T.r,
                                                            background: sel ? bg : T.surface,
                                                            color: sel ? fg : T.inkMuted,
                                                            fontSize: 12, fontWeight: sel ? 700 : 500,
                                                            cursor: 'pointer', fontFamily: T.sans,
                                                            transition: 'all 120ms', textAlign: 'center',
                                                        }}>
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 4, fontFamily: T.sans }}>
                                            {formData.forecastCategory === 'commit'    && 'Rep is confident this deal closes this period.'}
                                            {formData.forecastCategory === 'best_case' && 'Best Case — upside if everything goes right.'}
                                            {formData.forecastCategory === 'omit'      && 'Excluded from all forecast calculations.'}
                                            {(!formData.forecastCategory || formData.forecastCategory === 'pipeline') && 'Pipeline — tracking but not yet forecastable.'}
                                        </div>
                                    </div>

                                    {/* ── Revenue ── */}
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={fieldLabelStyle}>Revenue ($)</label>
                                        <input type="number" min="0"
                                            value={formData.arr ?? 0}
                                            onChange={e => handleChange('arr', e.target.value)}
                                            placeholder="0"
                                            style={inputStyle(validationErrors.arr)}/>
                                        {validationErrors.arr && (
                                            <div className="opp-field-error" style={{ color: T.danger, fontSize: 11, fontWeight: 600, marginTop: 3, fontFamily: T.sans }}>⚠ {validationErrors.arr}</div>
                                        )}
                                        <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 4, fontFamily: T.sans }}>
                                            Total deal value — product line items are managed in the Quotes tab.
                                        </div>
                                    </div>

                                    {/* ── Contacts ── */}
                                    <div style={{ marginBottom: 16, position: 'relative' }}>
                                        <label style={fieldLabelStyle}>Contacts</label>
                                        {selectedContacts.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                                {selectedContacts.map((contact, idx) => (
                                                    <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '3px 8px', fontSize: 12, color: T.ink, fontFamily: T.sans }}>
                                                        {contact}
                                                        <button type="button" onClick={() => {
                                                            const newContacts = selectedContacts.filter((_, i) => i !== idx);
                                                            const newIds = selectedContactIds.filter((_, i) => i !== idx);
                                                            setSelectedContacts(newContacts);
                                                            setSelectedContactIds(newIds);
                                                            handleChange('contacts', newContacts.join(', '));
                                                        }} style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: '0.875rem', padding: 0, lineHeight: 1 }}
                                                            onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                                            onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <input type="text" value={contactSearch}
                                            onChange={e => { setContactSearch(e.target.value); setShowContactSuggestions(e.target.value.length > 0); }}
                                            onFocus={() => setShowContactSuggestions(contactSearch.length > 0)}
                                            onBlur={() => setTimeout(() => setShowContactSuggestions(false), 200)}
                                            placeholder="Search contacts to link…"
                                            autoComplete="off"
                                            style={inputStyle(false)}/>
                                        {showContactSuggestions && (
                                            <div style={suggestionDropStyle}>
                                                {(contacts || []).filter(c => {
                                                    const fullName = `${c.firstName} ${c.lastName}`;
                                                    return fullName.toLowerCase().includes(contactSearch.toLowerCase()) && !selectedContacts.some(s => s.startsWith(fullName));
                                                }).map(contact => (
                                                    <div key={contact.id}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => {
                                                            const display = `${contact.firstName} ${contact.lastName}${contact.title ? ` (${contact.title})` : ''}`;
                                                            const newContacts = [...selectedContacts, display];
                                                            const newIds = [...selectedContactIds, contact.id];
                                                            setSelectedContacts(newContacts);
                                                            setSelectedContactIds(newIds);
                                                            handleChange('contacts', newContacts.join(', '));
                                                            setContactSearch('');
                                                            setShowContactSuggestions(false);
                                                        }}
                                                        style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, fontWeight: 600, fontSize: 13, fontFamily: T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <div style={{ color: T.ink }}>{contact.firstName} {contact.lastName}</div>
                                                        {contact.title && <div style={{ fontSize: 11, color: T.inkMuted, fontWeight: 400 }}>{contact.title}</div>}
                                                    </div>
                                                ))}
                                                <div onMouseDown={e => e.preventDefault()}
                                                    onClick={() => { setShowContactSuggestions(false); setNestedModal({ type: 'contact', firstName: contactSearch.split(/\s+/)[0] || '', lastName: contactSearch.split(/\s+/).slice(1).join(' ') || '' }); setContactSearch(''); }}
                                                    style={{ padding: '8px 10px', cursor: 'pointer', color: T.info, fontWeight: 600, fontSize: 13, fontFamily: T.sans }}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    + New Contact
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Pain points ── */}
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={fieldLabelStyle}>Pain Points</label>
                                        {(() => {
                                            const selectedPainPoints = formData.painPoints ? formData.painPoints.split(', ').filter(p => p) : [];

                                            // settings.painPoints is grouped: [{ cat, items }]
                                            // Fall back to a flat default list if not configured
                                            const rawPainPoints = settings?.painPoints;
                                            const isGrouped = Array.isArray(rawPainPoints) && rawPainPoints.length > 0 && typeof rawPainPoints[0] === 'object' && rawPainPoints[0].cat;
                                            const groups = isGrouped
                                                ? rawPainPoints
                                                : [{ cat: 'Pain Points', items: rawPainPoints?.length ? rawPainPoints : ['High Turnover', 'Scheduling Complexity', 'Compliance Issues', 'Manual Processes', 'Poor Visibility'] }];

                                            return (
                                                <>
                                                    {selectedPainPoints.length > 0 && (
                                                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                                            {selectedPainPoints.map((pp, idx) => (
                                                                <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(184,115,51,0.12)', border: `1px solid rgba(184,115,51,0.3)`, borderRadius: T.r, padding: '3px 8px', fontSize: 12, color: T.warn, fontFamily: T.sans }}>
                                                                    {pp}
                                                                    <button type="button" onClick={() => handleChange('painPoints', selectedPainPoints.filter((_, i) => i !== idx).join(', '))}
                                                                        style={{ background: 'none', border: 'none', color: T.warn, cursor: 'pointer', fontSize: '0.875rem', padding: 0, lineHeight: 1 }}>×</button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <select value="" onChange={e => {
                                                        const value = e.target.value;
                                                        if (value && !selectedPainPoints.includes(value))
                                                            handleChange('painPoints', [...selectedPainPoints, value].join(', '));
                                                    }} style={{ ...inputStyle(false), cursor: 'pointer' }}>
                                                        <option value="">Add a pain point…</option>
                                                        {groups.map((g, gi) => (
                                                            <optgroup key={gi} label={g.cat}>
                                                                {(g.items || []).map(pp => (
                                                                    <option key={pp} value={pp} disabled={selectedPainPoints.includes(pp)}>
                                                                        {pp}{selectedPainPoints.includes(pp) ? ' ✓' : ''}
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        ))}
                                                    </select>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    {/* ── Next steps (prominent gold accent) ── */}
                                    {canViewField('nextSteps') && (
                                        <div style={{ marginBottom: 16 }}>
                                            <label style={{ ...ey(T.goldInk), display: 'block', marginBottom: 6 }}>Next Steps</label>
                                            <div style={{ border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.gold}`, borderRadius: T.r, background: T.surface, overflow: 'hidden' }}>
                                                <textarea value={formData.nextSteps} onChange={e => handleChange('nextSteps', e.target.value)}
                                                    placeholder="Actions to move this deal forward…"
                                                    rows={3}
                                                    style={{ width: '100%', padding: '10px 12px', border: 'none', fontSize: 13, fontFamily: T.sans, resize: 'vertical', background: 'transparent', color: T.ink, outline: 'none', boxSizing: 'border-box', lineHeight: 1.55 }}/>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Deal notes (serif italic) ── */}
                                    {canViewField('notes') && (
                                        <div style={{ marginBottom: 16 }}>
                                            <label style={fieldLabelStyle}>Description / Background</label>
                                            <textarea value={formData.notes} onChange={e => handleChange('notes', e.target.value)}
                                                placeholder="Deal context, background, key details…"
                                                rows={3}
                                                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, resize: 'vertical', background: T.surface, color: T.ink, outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}/>
                                        </div>
                                    )}

                                    {/* ── Comments thread ── */}
                                    {opportunity && (
                                        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 20 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>💬 Team Notes</span>
                                                {comments.length > 0 && (
                                                    <span style={{ background: 'rgba(58,90,122,0.12)', color: T.info, border: `1px solid rgba(58,90,122,0.25)`, padding: '1px 7px', borderRadius: '999px', fontSize: 10, fontWeight: 700, fontFamily: T.sans }}>
                                                        {comments.length}
                                                    </span>
                                                )}
                                                <span style={{ fontSize: 11, color: T.inkMuted, marginLeft: 2, fontFamily: T.sans }}>Visible to all team members</span>
                                            </div>

                                            {/* Compose box */}
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                                                <Avatar name={currentUser || 'A'} size={28}/>
                                                <div style={{ flex: 1, position: 'relative' }}>
                                                    <textarea ref={commentTextareaRef} value={commentDraft} onChange={handleCommentDraftChange}
                                                        onKeyDown={e => {
                                                            if (mentionQuery !== null && filteredMentions.length > 0) {
                                                                if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
                                                                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); insertMention(filteredMentions[0]); return; }
                                                            }
                                                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentDraft.trim()) {
                                                                e.preventDefault();
                                                                const text = commentDraft.trim();
                                                                const comment = { id: 'c_' + Date.now(), text, author: currentUser || 'Anonymous', timestamp: new Date().toISOString(), mentions: extractMentions(text) };
                                                                onSaveComment && onSaveComment(opportunity.id, comment);
                                                                setCommentDraft(''); setMentionQuery(null);
                                                            }
                                                        }}
                                                        placeholder="Add a note… Type @ to mention someone (⌘/Ctrl+Enter to post)"
                                                        rows={2}
                                                        style={{ width: '100%', padding: '7px 10px', border: `1.5px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontFamily: T.sans, resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, background: T.surface, color: T.ink, transition: 'border-color 0.15s' }}
                                                        onFocus={e => e.target.style.borderColor = T.ink}
                                                        onBlur={e => { e.target.style.borderColor = T.border; setTimeout(() => setMentionQuery(null), 150); }}/>
                                                    {/* @mention dropdown */}
                                                    {mentionQuery !== null && filteredMentions.length > 0 && (
                                                        <div style={{ position: 'absolute', bottom: 'calc(100% - 0.5rem)', left: 0, zIndex: 300, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, boxShadow: '0 4px 16px rgba(42,38,34,0.14)', minWidth: 180, overflow: 'hidden' }}>
                                                            <div style={{ padding: '5px 10px', ...ey(), borderBottom: `1px solid ${T.border}` }}>Mention a teammate</div>
                                                            {filteredMentions.map(name => (
                                                                <div key={name} onMouseDown={e => { e.preventDefault(); insertMention(name); }}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}
                                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                    <Avatar name={name} size={22}/>
                                                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {commentDraft.trim() && (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, gap: 6 }}>
                                                            <GhostBtn onClick={() => { setCommentDraft(''); setMentionQuery(null); }}>Discard</GhostBtn>
                                                            <PrimaryBtn type="button" onClick={() => {
                                                                if (!commentDraft.trim()) return;
                                                                const text = commentDraft.trim();
                                                                const comment = { id: 'c_' + Date.now(), text, author: currentUser || 'Anonymous', timestamp: new Date().toISOString(), mentions: extractMentions(text) };
                                                                onSaveComment && onSaveComment(opportunity.id, comment);
                                                                setCommentDraft(''); setMentionQuery(null);
                                                            }}>Post Note</PrimaryBtn>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Comment list */}
                                            {comments.length === 0 && (
                                                <div style={{ textAlign: 'center', padding: '1.25rem', color: T.inkMuted, fontSize: 12.5, background: T.surface, borderRadius: T.r, border: `1px dashed ${T.border}`, fontFamily: T.sans }}>
                                                    No team notes yet. Be the first to leave a note.
                                                </div>
                                            )}
                                            {comments.length > 0 && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                                                    {comments.map(c => {
                                                        const isOwn = c.author === currentUser;
                                                        const ts = new Date(c.timestamp), now = new Date();
                                                        const diffMs = now - ts, diffMins = Math.floor(diffMs / 60000), diffHours = Math.floor(diffMs / 3600000), diffDays = Math.floor(diffMs / 86400000);
                                                        const timeAgo = diffMins < 1 ? 'just now' : diffMins < 60 ? `${diffMins}m ago` : diffHours < 24 ? `${diffHours}h ago` : diffDays < 7 ? `${diffDays}d ago` : ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: ts.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
                                                        const fullDate = ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
                                                        const isEditing = editingCommentId === c.id;
                                                        return (
                                                            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '8px 10px', background: isOwn ? 'rgba(58,90,122,0.06)' : T.surface, border: `1px solid ${isOwn ? 'rgba(58,90,122,0.18)' : T.border}`, borderRadius: T.r, alignItems: 'flex-start' }}>
                                                                <Avatar name={c.author || 'A'} size={28}/>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                                                                        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>{c.author}</span>
                                                                        <span title={fullDate} style={{ fontSize: 11, color: T.inkMuted, cursor: 'default', fontFamily: T.sans }}>{timeAgo}</span>
                                                                        {c.edited && <span style={{ fontSize: 10, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>(edited)</span>}
                                                                    </div>
                                                                    {isEditing ? (
                                                                        <div>
                                                                            <textarea autoFocus value={editingCommentText} onChange={e => setEditingCommentText(e.target.value)} rows={2}
                                                                                style={{ width: '100%', padding: '6px 8px', border: `1.5px solid ${T.ink}`, borderRadius: T.r, fontSize: 12.5, fontFamily: T.sans, resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, background: T.surface, color: T.ink }}/>
                                                                            <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                                                                                <GhostBtn onClick={() => setEditingCommentId(null)}>Cancel</GhostBtn>
                                                                                <PrimaryBtn type="button" onClick={() => { if (editingCommentText.trim()) onEditComment && onEditComment(opportunity.id, c.id, editingCommentText.trim()); setEditingCommentId(null); }}>Save</PrimaryBtn>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: T.sans }}>{renderCommentText(c.text)}</div>
                                                                    )}
                                                                </div>
                                                                {isOwn && !isEditing && (
                                                                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                                                        <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.text); }} title="Edit"
                                                                            style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: '0.75rem', padding: '2px 4px', lineHeight: 1, borderRadius: T.r }}
                                                                            onMouseEnter={e => e.currentTarget.style.color = T.info}
                                                                            onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>✏️</button>
                                                                        <button type="button" onClick={() => onDeleteComment && onDeleteComment(opportunity.id, c.id)} title="Delete"
                                                                            style={{ background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: '0.75rem', padding: '2px 4px', lineHeight: 1, borderRadius: T.r }}
                                                                            onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                                                            onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>✕</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Validation summary ── */}
                                    {Object.keys(validationErrors).length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(156,58,46,0.07)', border: `1px solid rgba(156,58,46,0.25)`, borderRadius: T.r, marginTop: 12, color: T.danger, fontSize: 12.5, fontWeight: 600, fontFamily: T.sans }}>
                                            ⚠ Please fill in all required fields before saving.
                                        </div>
                                    )}

                                    {/* ── Footer actions ── */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                                        <GhostBtn type="button" onClick={onClose} disabled={saving}>Cancel</GhostBtn>
                                        <PrimaryBtn saving={saving}>
                                            {saving ? 'Saving…' : opportunity ? 'Update' : 'Create'}
                                        </PrimaryBtn>
                                    </div>

                                </form>
                            </div>

                            {/* RIGHT RAIL — context panel */}
                            {showSplit && (
                                <div style={{ width: 340, minWidth: 300, overflow: 'auto', padding: '20px 18px', background: T.surface, borderLeft: `1px solid ${T.border}`, flexShrink: 0 }}>
                                    {opportunity ? (
                                        <RightRail
                                            opportunity={opportunity}
                                            oppActivities={oppActivities}
                                            contacts={contacts}
                                            settings={settings}
                                            onOpenActivity={() => setDetailTab('history')}
                                            onOpenContact={() => setDetailTab('contacts')}
                                            onOpenHistory={() => setDetailTab('history')}
                                            onOpenAi={() => setDetailTab('ai-score')}
                                            onOpenContacts={() => setDetailTab('contacts')}
                                        />
                                    ) : (
                                        /* New opp — empty rail hint */
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 8, padding: '2rem 1rem' }}>
                                            <div style={{ fontSize: 32, opacity: 0.25 }}>✦</div>
                                            <div style={{ fontSize: 12.5, color: T.inkMuted, lineHeight: 1.6, fontFamily: T.sans }}>
                                                Save this opportunity to start tracking activity, contacts, and AI signals.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <ResizeHandles getResizeHandleProps={getResizeHandleProps}/>
            </div>

            {/* Nested new contact modal (preserved) */}
            {nestedModal && nestedModal.type === 'contact' && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setNestedModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', background: T.surface, borderRadius: 8, fontFamily: T.sans }}>
                        <h2 style={{ marginBottom: '1rem', fontSize: 16, fontWeight: 700, color: T.ink }}>New Contact</h2>
                        <NestedNewContactForm
                            firstName={nestedModal.firstName}
                            lastName={nestedModal.lastName}
                            onSave={(data) => {
                                if (onSaveNewContact) {
                                    const saved = onSaveNewContact(data);
                                    if (saved) {
                                        const display = `${saved.firstName} ${saved.lastName}${saved.title ? ` (${saved.title})` : ''}`;
                                        const newContacts = [...selectedContacts, display];
                                        const newIds = [...selectedContactIds, saved.id];
                                        setSelectedContacts(newContacts);
                                        setSelectedContactIds(newIds);
                                        handleChange('contacts', newContacts.join(', '));
                                    }
                                }
                                setNestedModal(null);
                            }}
                            onCancel={() => setNestedModal(null)}/>
                    </div>
                </div>
            )}
        </>
    );
}
