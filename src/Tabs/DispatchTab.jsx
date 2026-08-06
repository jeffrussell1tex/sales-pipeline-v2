import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';
import { dbFetch, waitForToken } from '../utils/storage';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
    bg:          '#f0ece4',
    surface:     '#fbf8f3',
    surface2:    '#f5efe3',
    border:      '#e6ddd0',
    borderStrong:'#d4c8b4',
    ink:         '#2a2622',
    inkMid:      '#5a544c',
    inkMuted:    '#8a8378',
    gold:        '#c8b99a',
    goldInk:     '#7a6a48',
    danger:      '#9c3a2e',
    warn:        '#b87333',
    ok:          '#4d6b3d',
    info:        '#3a5a7a',
    sans:        '"Plus Jakarta Sans", system-ui, sans-serif',
    serif:       'Georgia, "Source Serif 4", serif',
    mono:        '"ui-monospace", "Menlo", monospace',
    r:           4,
};

const DSP_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const LICENSE_ORDER = { Apprentice: 0, Journeyman: 1, Master: 2, Lead: 3 };
const fmt12 = (h) => h === 12 ? '12p' : h > 12 ? `${h-12}p` : `${h}a`;

// ── Priority color helper ─────────────────────────────────────────────────────
// Priority vocabulary reconciliation. The schema documents
// 'low' | 'normal' | 'high' | 'emergency', while these colour maps were written
// against an older 'urgent' | 'standard' | 'low' set. Both are accepted so
// existing rows keep their colours and newly created jobs (which store the
// schema-valid values) render correctly too.
const PRIORITY_LABELS = [
    { label: 'Low',     value: 'low' },
    { label: 'Medium',  value: 'normal' },
    { label: 'High',    value: 'high' },
    { label: 'Urgent',  value: 'emergency' },
];
const URGENT_PRIORITIES = ['urgent', 'emergency'];
const prioColor = (p) => ({ urgent: T.danger, emergency: T.danger, high: T.warn, standard: T.warn, normal: T.inkMid, low: T.inkMuted }[p] || T.inkMuted);

// ── Customer typeahead ───────────────────────────────────────────────
// Defined at module scope on purpose: a component declared inside DispatchTab
// would be a new type on every render, remounting the input and losing focus
// on each keystroke.
// A job needs a real customerId (FK, notNull). Free text alone cannot produce
// one, so the field either resolves to an existing customer or offers to create
// a new one, which the save handler POSTs before the job.
const CustomerTypeahead = ({ customers, accounts, query, selectedId, selectedAccountId, onQueryChange, onPick, onPickAccount, onCreateIntent }) => {
    const [open, setOpen] = React.useState(false);
    const q = (query || '').trim().toLowerCase();

    const byName = (list) => (q ? list.filter(x => (x.name || '').toLowerCase().includes(q)) : list);

    // Group 1 — existing dispatch customers (already have a customerNumber).
    const custMatches = byName(customers || []).slice(0, 6);

    // Group 2 — CRM accounts with no dispatch customer yet. Picking one creates
    // the dispatch customer on save, linked back via accountId, so the same
    // company is not duplicated across the CRM and Dispatch.
    const linkedAccountIds = new Set((customers || []).map(c => c.accountId).filter(Boolean));
    const linkedNames      = new Set((customers || []).map(c => (c.name || '').trim().toLowerCase()));
    const acctMatches = byName(accounts || [])
        .filter(a => !linkedAccountIds.has(a.id) && !linkedNames.has((a.name || '').trim().toLowerCase()))
        .slice(0, 6);

    const exact = [...(customers || []), ...(accounts || [])]
        .some(x => (x.name || '').trim().toLowerCase() === q);
    const showCreate = q.length > 0 && !exact;

    const inputSt = { width: '100%', padding: '8px 10px', border: `1px solid ${selectedId ? T.ok : T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none' };
    const rowSt   = { padding: '7px 10px', fontSize: 13, color: T.ink, fontFamily: T.sans, cursor: 'pointer', borderBottom: `1px solid ${T.border}` };
    const hdrSt   = { padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkMuted, background: T.bg, fontFamily: T.sans };

    return (
        <div style={{ position: 'relative' }}>
            <input
                value={query}
                autoComplete="off"
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onChange={e => { onQueryChange(e.target.value); setOpen(true); }}
                placeholder="Search customers, or type a new name"
                style={inputSt} />
            {selectedId && (
                <div style={{ marginTop: 4, fontSize: 11, color: T.ok, fontWeight: 600, fontFamily: T.sans }}>
                    Existing dispatch customer selected
                </div>
            )}
            {!selectedId && selectedAccountId && (
                <div style={{ marginTop: 4, fontSize: 11, color: T.info, fontWeight: 600, fontFamily: T.sans }}>
                    CRM account — a linked dispatch customer will be created on save
                </div>
            )}
            {!selectedId && !selectedAccountId && query.trim() && (
                <div style={{ marginTop: 4, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                    New customer — will be created on save
                </div>
            )}
            {open && (custMatches.length > 0 || acctMatches.length > 0 || showCreate) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 3,
                    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
                    boxShadow: '0 6px 18px rgba(0,0,0,0.10)', maxHeight: 220, overflowY: 'auto' }}>
                    {custMatches.length > 0 && (
                        <div style={hdrSt}>Dispatch customers</div>
                    )}
                    {custMatches.map(c => (
                        <div key={c.id} style={rowSt}
                            onMouseDown={e => { e.preventDefault(); onPick(c); setOpen(false); }}>
                            <span style={{ fontWeight: 500 }}>{c.name}</span>
                            {c.customerNumber && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: T.inkMuted }}>{c.customerNumber}</span>
                            )}
                        </div>
                    ))}
                    {acctMatches.length > 0 && (
                        <div style={hdrSt}>CRM accounts — not yet in Dispatch</div>
                    )}
                    {acctMatches.map(a => (
                        <div key={a.id} style={rowSt}
                            onMouseDown={e => { e.preventDefault(); onPickAccount(a); setOpen(false); }}>
                            <span style={{ fontWeight: 500 }}>{a.name}</span>
                            {(a.city || a.state) && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: T.inkMuted }}>
                                    {[a.city, a.state].filter(Boolean).join(', ')}
                                </span>
                            )}
                        </div>
                    ))}
                    {showCreate && (
                        <div style={{ ...rowSt, borderBottom: 'none', color: T.info, fontWeight: 600 }}
                            onMouseDown={e => { e.preventDefault(); onCreateIntent(); setOpen(false); }}>
                            + Create “{query.trim()}”
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Score badge ───────────────────────────────────────────────────────────────
const ScoreBadge = ({ score }) => {
    const color = score >= 90 ? T.ok : score >= 70 ? T.warn : T.danger;
    return (
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2.5px solid ${color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: T.serif, fontStyle: 'italic' }}>{score}</span>
        </div>
    );
};

// ── Skill pill ────────────────────────────────────────────────────────────────
const SkillPill = ({ skill }) => (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8,
        background: `${skill.color}14`, border: `1px solid ${skill.color}40`,
        color: skill.color, fontWeight: 600, fontFamily: T.sans }}>
        {skill.name}
    </span>
);

// ── Avatar ────────────────────────────────────────────────────────────────────
const Avatar = ({ name, size = 32 }) => {
    const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: T.ink,
            color: '#fbf8f3', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.35, fontWeight: 700, flexShrink: 0, fontFamily: T.sans }}>
            {initials}
        </div>
    );
};

// ── Hours bar ─────────────────────────────────────────────────────────────────
const HoursBar = ({ used, cap }) => {
    const pct = Math.min(used / cap, 1) * 100;
    const over = used > cap;
    const near = used >= cap * 0.9;
    const barColor = over ? T.danger : near ? T.warn : T.ok;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ flex: 1, height: 4, background: T.surface2, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2 }}/>
            </div>
            <span style={{ fontSize: 9, fontFamily: T.mono, color: over ? T.danger : T.inkMid, fontWeight: 600 }}>{used}/{cap}</span>
        </div>
    );
};

// ── Match scoring engine ──────────────────────────────────────────────────────
const scoreTech = (tech, job, allJobs, skills) => {
    if (!tech || !job) return { score: 0, why: [], blockers: [] };
    const why = [], blockers = [];
    let score = 0;

    // Required-skill coverage (30pts)
    const techSkillIds = new Set(tech.dispatchSkills || []);
    const jobSkillIds = job.needSkills || [];
    const covered = jobSkillIds.filter(s => techSkillIds.has(s));
    if (jobSkillIds.length === 0 || covered.length === jobSkillIds.length) {
        score += 30;
        if (jobSkillIds.length > 0) why.push(`All skills · ${tech.license || 'Journeyman'}`);
    } else {
        const missing = jobSkillIds.filter(s => !techSkillIds.has(s))
            .map(s => skills.find(sk => sk.id === s)?.name || s);
        blockers.push(`Missing skill · ${missing.join(', ')}`);
        score += (covered.length / jobSkillIds.length) * 20;
    }

    // License level (15pts)
    const techLevel = LICENSE_ORDER[tech.license] ?? 1;
    const jobLevel = LICENSE_ORDER[job.minLicense] ?? 1;
    if (techLevel >= jobLevel) {
        score += 15;
        why.push(`${tech.license} license`);
    } else {
        blockers.push(`License too low · need ${job.minLicense}`);
    }

    // Cert currency (15pts)
    const now = new Date();
    const certs = tech.dispatchCerts || [];
    if (certs.length > 0) {
        const validCerts = certs.filter(c => !c.expiresAt || new Date(c.expiresAt) > now);
        if (validCerts.length === certs.length) {
            score += 15;
            why.push(`${validCerts.length} cert${validCerts.length > 1 ? 's' : ''} current`);
        } else {
            const expired = certs.filter(c => c.expiresAt && new Date(c.expiresAt) <= now);
            blockers.push(`Expired cert · ${expired.length} need renewal`);
            score += 8;
        }
    } else {
        score += 10;
    }

    // Hours cap (10pts)
    const hoursUsed = tech.hoursThisWeek || 0;
    const hoursCap = tech.hoursCap || 40;
    if (hoursUsed <= hoursCap * 0.8) {
        score += 10;
    } else if (hoursUsed > hoursCap) {
        blockers.push(`Over-hours · ${hoursUsed}/${hoursCap} this week`);
    } else {
        score += 5;
        why.push(`Near cap · ${hoursUsed}/${hoursCap}`);
    }

    // Availability - no overlap with existing jobs (15pts)
    const assignedJobs = allJobs.filter(j => j.id !== job.id && (j.assignedTechIds || []).includes(tech.id) && j.start != null);
    const overlaps = assignedJobs.filter(j => {
        const js = j.start, je = j.start + (j.durationHrs || 2);
        const ns = job.start || 9, ne = ns + (job.durationHrs || 2);
        return js < ne && je > ns;
    });
    if (overlaps.length === 0) {
        score += 15;
    } else {
        blockers.push(`Double-booked at ${fmt12(overlaps[0].start)}`);
    }

    // Customer preference (7pts)
    if (job.preferredTechId === tech.id) {
        score += 7;
        why.push('Preferred by customer');
    }

    // Vehicle (3pts)
    if (tech.vehicle) {
        score += 3;
    }

    return { score: Math.round(Math.min(score, 100)), why, blockers };
};

// ── Unassigned job card (left rail on board) ──────────────────────────────────
const UnassignedCard = ({ job, skills, onClick }) => {
    const pc = prioColor(job.priority);
    const jobSkills = (job.needSkills || []).map(id => skills.find(s => s.id === id)).filter(Boolean);
    return (
        <div onClick={onClick} style={{ padding: '10px 12px', background: T.surface,
            border: `1px solid ${T.border}`, borderLeft: `3px solid ${pc}`,
            borderRadius: T.r, cursor: 'pointer', marginBottom: 8,
            transition: 'box-shadow 120ms' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(42,38,34,0.1)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, flex: 1 }}>{job.customer}</span>
                <span style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 13, fontWeight: 700, color: T.ink }}>
                    ${((job.value || 0) / 1000).toFixed(1)}k
                </span>
            </div>
            <div style={{ fontSize: 10.5, color: T.inkMuted, marginBottom: 6 }}>{job.address}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
                {jobSkills.map(s => <SkillPill key={s.id} skill={s}/>)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: T.inkMid }}>
                <span>{job.window}</span>
                <span style={{ color: T.inkMuted }}>·</span>
                <span>{job.crewSize} tech{job.crewSize > 1 ? 's' : ''} · {job.durationHrs}h</span>
                <span style={{ flex: 1 }}/>
                <span style={{ fontSize: 10.5, color: T.goldInk, fontWeight: 600 }}>Build crew →</span>
            </div>
        </div>
    );
};

// ── Timeline job block ────────────────────────────────────────────────────────
const TimelineBlock = ({ job, conflict, colWidth, onClick, lane, laneCount }) => {
    const pc = prioColor(job.priority);
    const left = (job.start - 7) * colWidth + 4;
    const width = job.durationHrs * colWidth - 8;
    const LANE_H = 56; // height per lane
    const PAD = 4;
    const top  = PAD + lane * LANE_H;
    const height = LANE_H - PAD * 2;
    return (
        <div onClick={onClick} style={{
            position: 'absolute', left, top, width, height,
            background: `${pc}18`, border: `1.5px solid ${conflict ? T.danger : pc}`,
            borderRadius: T.r, padding: '5px 7px', cursor: 'pointer', overflow: 'hidden',
            boxShadow: conflict ? `0 0 0 2px ${T.danger}33` : 'none', zIndex: 1,
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {job.customer}
            </div>
            <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 2, whiteSpace: 'nowrap' }}>
                {job.durationHrs}h · {fmt12(job.start + job.durationHrs)}
            </div>
        </div>
    );
};

// Assign lanes to jobs so overlapping jobs stack vertically instead of painting over each other.
// Returns an array of { job, lane } in the same order as the input jobs array.
function assignLanes(jobs) {
    // Sort by start time so earlier jobs get lower lanes
    const sorted = [...jobs].sort((a, b) => (a.start || 0) - (b.start || 0));
    const lanes = []; // lanes[i] = end time of last job in lane i
    const result = new Map();

    for (const job of sorted) {
        const jobEnd = (job.start || 0) + (job.durationHrs || 0);
        let placed = false;
        for (let l = 0; l < lanes.length; l++) {
            if (lanes[l] <= (job.start || 0)) {
                lanes[l] = jobEnd;
                result.set(job.id, l);
                placed = true;
                break;
            }
        }
        if (!placed) {
            result.set(job.id, lanes.length);
            lanes.push(jobEnd);
        }
    }
    return { laneMap: result, laneCount: Math.max(1, lanes.length) };
}

// ── DISPATCH BOARD VIEW ───────────────────────────────────────────────────────
const BoardView = ({ jobs, techs, skills, onJobClick }) => {
    const COL_W  = 80;
    const RAIL_W = 220;
    const LANE_H = 56; // must match TimelineBlock
    const MIN_ROW_H = LANE_H; // single-lane row height

    const assignedJobs   = jobs.filter(j => j.start != null && (j.assignedTechIds || []).length > 0);
    const unassignedJobs = jobs.filter(j => !j.start || (j.assignedTechIds || []).length === 0);

    // Pre-compute lane assignments per tech
    const techLanes = useMemo(() => {
        const map = {};
        techs.forEach(tech => {
            const tj = assignedJobs.filter(j => (j.assignedTechIds || []).includes(tech.id));
            map[tech.id] = assignLanes(tj);
        });
        return map;
    }, [assignedJobs, techs]);

    const techConflicts = useMemo(() => {
        const conflicts = new Set();
        techs.forEach(tech => {
            const techJobs = assignedJobs.filter(j => (j.assignedTechIds || []).includes(tech.id));
            for (let i = 0; i < techJobs.length; i++) {
                for (let j = i + 1; j < techJobs.length; j++) {
                    const a = techJobs[i], b = techJobs[j];
                    const ae = a.start + a.durationHrs, be = b.start + b.durationHrs;
                    if (a.start < be && ae > b.start) {
                        conflicts.add(a.id); conflicts.add(b.id);
                    }
                }
            }
        });
        return conflicts;
    }, [assignedJobs, techs]);

    const overHours        = new Set(techs.filter(t => (t.hoursThisWeek || 0) > (t.hoursCap || 40)).map(t => t.id));
    const urgentUnassigned = unassignedJobs.filter(j => URGENT_PRIORITIES.includes(j.priority)).length;
    const overbookings     = techConflicts.size > 0 ? 1 : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Alert strip */}
            {(overbookings > 0 || urgentUnassigned > 0) && (
                <div style={{ background: `${T.danger}14`, borderBottom: `1px solid ${T.danger}40`,
                    padding: '6px 16px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                    {overbookings > 0 && (
                        <span style={{ fontSize: 12, color: T.danger, fontWeight: 600, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 5 }}>
                            ⚠ {overbookings} overbooking — review schedule
                        </span>
                    )}
                    {urgentUnassigned > 0 && (
                        <span style={{ fontSize: 12, color: T.danger, fontWeight: 600, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 5 }}>
                            ● {urgentUnassigned} urgent unassigned
                        </span>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left rail — unassigned jobs */}
                <div style={{ width: RAIL_W, flexShrink: 0, borderRight: `1px solid ${T.border}`,
                    display: 'flex', flexDirection: 'column', background: T.bg, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.7, fontFamily: T.sans }}>
                            Unassigned · {unassignedJobs.length}
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
                        {unassignedJobs.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.inkMuted, textAlign: 'center', padding: '2rem 0', fontStyle: 'italic', fontFamily: T.sans }}>
                                All jobs assigned ✓
                            </div>
                        ) : unassignedJobs.map(j => (
                            <UnassignedCard key={j.id} job={j} skills={skills} onClick={() => onJobClick(j)}/>
                        ))}
                    </div>
                </div>

                {/* Timeline grid */}
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {/* Hour header */}
                    <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${T.border}`,
                        background: T.surface, position: 'sticky', top: 0, zIndex: 3 }}>
                        <div style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${T.border}` }}/>
                        {DSP_HOURS.map(h => (
                            <div key={h} style={{ width: COL_W, flexShrink: 0, padding: '6px 0',
                                textAlign: 'center', fontSize: 11, fontWeight: 600, color: T.inkMuted,
                                fontFamily: T.sans, borderRight: `1px solid ${T.border}` }}>
                                {fmt12(h)}
                            </div>
                        ))}
                    </div>

                    {/* Tech rows — height expands to fit lane count */}
                    {techs.map(tech => {
                        const techJobs  = assignedJobs.filter(j => (j.assignedTechIds || []).includes(tech.id));
                        const { laneMap, laneCount } = techLanes[tech.id] || { laneMap: new Map(), laneCount: 1 };
                        const rowH = Math.max(MIN_ROW_H, laneCount * LANE_H);
                        const over = overHours.has(tech.id);
                        return (
                            <div key={tech.id} style={{ display: 'flex', borderBottom: `1px solid ${T.border}`,
                                height: rowH, flexShrink: 0, background: T.surface,
                                ...(over ? { boxShadow: `inset 3px 0 0 ${T.danger}` } : {}) }}>
                                {/* Tech header cell */}
                                <div style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${T.border}`,
                                    padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                                    background: T.surface, position: 'sticky', left: 0, zIndex: 2 }}>
                                    <Avatar name={tech.name} size={30}/>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, fontFamily: T.sans,
                                            display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tech.name}</span>
                                            <span style={{ fontSize: 9, color: T.inkMuted, fontWeight: 600, flexShrink: 0 }}>{tech.license || 'Apprentice'}</span>
                                        </div>
                                        <div style={{ fontSize: 9.5, color: T.inkMuted, marginTop: 1, fontFamily: T.sans,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {(tech.dispatchSkills || []).slice(0, 3).map(id => skills.find(s => s.id === id)?.name).filter(Boolean).join(' · ')}
                                        </div>
                                        <div style={{ marginTop: 3 }}>
                                            <HoursBar used={tech.hoursThisWeek || 0} cap={tech.hoursCap || 40}/>
                                        </div>
                                    </div>
                                </div>

                                {/* Hour cells + job blocks */}
                                <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
                                    {DSP_HOURS.map(h => (
                                        <div key={h} style={{ width: COL_W, flexShrink: 0, height: '100%',
                                            borderRight: `1px solid ${T.border}`, position: 'relative' }}/>
                                    ))}
                                    {techJobs.map(j => (
                                        <TimelineBlock key={j.id} job={j} conflict={techConflicts.has(j.id)}
                                            colWidth={COL_W} onClick={() => onJobClick(j)}
                                            lane={laneMap.get(j.id) || 0}
                                            laneCount={laneCount}/>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ── CREW BUILDER VIEW ─────────────────────────────────────────────────────────
const CrewBuilderView = ({ jobs, techs, skills, selectedJobId, onSelectJob, onBack }) => {
    const selectedJob = jobs.find(j => j.id === selectedJobId) || jobs.find(j => !j.start) || jobs[0];
    const [addedTechs, setAddedTechs] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setAddedTechs({});
    }, [selectedJobId]);

    const candidates = useMemo(() => {
        if (!selectedJob) return [];
        return techs
            .map(t => ({ tech: t, ...scoreTech(t, selectedJob, jobs, skills) }))
            .filter(c => c.score >= 50)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }, [selectedJob, techs, jobs, skills]);

    const crewSlots = selectedJob?.crewSize || 2;
    const addedCount = Object.values(addedTechs).filter(Boolean).length;
    const unscheduledJobs = jobs.filter(j => !j.start || (j.assignedTechIds || []).length === 0);
    const scheduledJobs = jobs.filter(j => j.start && (j.assignedTechIds || []).length > 0);
    const overbooking = techs.some(t => (t.hoursThisWeek || 0) > (t.hoursCap || 40));

    const prioColor2 = (p) => prioColor(p);   // single source of truth; accepts both priority vocabularies

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: T.sans }}>
            {/* Left — job queue */}
            <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${T.border}`,
                display: 'flex', flexDirection: 'column', background: T.bg, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>
                        Jobs to schedule
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {['Priority', 'Date', 'Value'].map((l, i) => (
                            <span key={l} style={{ fontSize: 11, padding: '3px 8px', borderRadius: T.r,
                                background: i === 0 ? T.ink : T.surface, color: i === 0 ? '#fbf8f3' : T.inkMid,
                                fontWeight: 600, cursor: 'pointer' }}>{l}</span>
                        ))}
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
                    {jobs.map(j => {
                        const pc = prioColor2(j.priority);
                        const isSel = j.id === selectedJob?.id;
                        const isScheduled = j.start && (j.assignedTechIds || []).length > 0;
                        return (
                            <div key={j.id} onClick={() => onSelectJob(j.id)}
                                style={{ padding: '10px 12px', marginBottom: 6,
                                    background: T.surface, borderRadius: T.r, cursor: 'pointer',
                                    border: `1.5px solid ${isSel ? T.goldInk : T.border}`,
                                    borderLeft: `4px solid ${pc}`,
                                    boxShadow: isSel ? '0 2px 8px rgba(42,38,34,0.08)' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                                        background: `${pc}22`, color: pc, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {j.priority}
                                    </span>
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, flex: 1,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {j.customer}
                                    </span>
                                    <span style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 13, fontWeight: 700, color: T.ink }}>
                                        ${((j.value || 0)/1000).toFixed(1)}k
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 5 }}>
                                    {(j.needSkills || []).map(id => {
                                        const s = skills.find(sk => sk.id === id);
                                        return s ? <SkillPill key={id} skill={s}/> : null;
                                    })}
                                </div>
                                <div style={{ fontSize: 10.5, color: T.inkMid, display: 'flex', gap: 6 }}>
                                    <span>◷ {j.window}</span>
                                    <span style={{ color: T.inkMuted }}>·</span>
                                    <span>{j.crewSize}p × {j.durationHrs}h</span>
                                    {isScheduled && <span style={{ marginLeft: 'auto', color: T.ok, fontWeight: 600 }}>✓ Scheduled</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Center — crew builder */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg }}>
                {selectedJob ? (
                    <>
                        {/* Selected job header */}
                        <div style={{ padding: '14px 18px', background: T.surface,
                            borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                                    background: `${prioColor2(selectedJob.priority)}22`, color: prioColor2(selectedJob.priority),
                                    textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    {selectedJob.priority}
                                </span>
                                <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{selectedJob.customer}</span>
                                <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.mono }}>{selectedJob.id}</span>
                                <span style={{ flex: 1 }}/>
                                <span style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: T.ink }}>
                                    ${((selectedJob.value || 0)/1000).toFixed(1)}k
                                </span>
                            </div>
                            <div style={{ fontSize: 12, color: T.inkMid, marginBottom: 10 }}>{selectedJob.address}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 10 }}>
                                {[
                                    { l: 'Window',      v: selectedJob.window },
                                    { l: 'Crew size',   v: `${selectedJob.crewSize} techs` },
                                    { l: 'Duration',    v: `${selectedJob.durationHrs}h` },
                                    { l: 'Min license', v: selectedJob.minLicense },
                                    { l: 'Preferred',   v: selectedJob.preferredTechId ? techs.find(t => t.id === selectedJob.preferredTechId)?.name?.split(' ')[0] || '—' : '—' },
                                ].map(s => (
                                    <div key={s.l}>
                                        <div style={{ fontSize: 9.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 }}>{s.l}</div>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{s.v}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.inkMid, marginRight: 4 }}>Required:</span>
                                {(selectedJob.needSkills || []).map(id => {
                                    const s = skills.find(sk => sk.id === id);
                                    return s ? <SkillPill key={id} skill={s}/> : null;
                                })}
                                {selectedJob.equipment && <>
                                    <span style={{ fontSize: 10.5, fontWeight: 600, color: T.inkMid, marginLeft: 12, marginRight: 4 }}>Equip:</span>
                                    <span style={{ fontSize: 11, color: T.inkMid }}>{selectedJob.equipment}</span>
                                </>}
                            </div>
                        </div>

                        {/* Crew suggestions */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Suggested crew — ranked by match</span>
                                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.inkMid }}>
                                    {addedCount} of {crewSlots} crew slots filled
                                </span>
                                <button style={{ padding: '4px 10px', background: T.surface, border: `1px solid ${T.borderStrong}`,
                                    borderRadius: T.r, fontSize: 11.5, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}>
                                    Manual pick
                                </button>
                            </div>

                            {candidates.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: T.inkMuted, fontSize: 13, fontStyle: 'italic' }}>
                                    No techs configured. Add tech profiles in Settings → People & Teams.
                                </div>
                            ) : candidates.map((c, i) => {
                                const isAdded = addedTechs[c.tech.id];
                                const canAdd = c.score >= 70;
                                return (
                                    <div key={c.tech.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 14px', background: T.surface, borderRadius: T.r,
                                        border: `1px solid ${isAdded ? T.ok : T.border}`,
                                        marginBottom: 8,
                                        boxShadow: isAdded ? `0 0 0 1px ${T.ok}40` : 'none' }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: T.inkMuted, width: 16, flexShrink: 0 }}>{i+1}</div>
                                        <ScoreBadge score={c.score}/>
                                        <Avatar name={c.tech.name} size={34}/>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
                                                {c.tech.name}
                                                <span style={{ fontSize: 10.5, color: T.inkMuted, fontWeight: 500, marginLeft: 8 }}>
                                                    {c.tech.license} · {c.tech.vehicle || 'No vehicle'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {c.why.map((w, wi) => (
                                                    <span key={wi} style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 8,
                                                        background: 'rgba(77,107,61,0.1)', color: T.ok, fontWeight: 600 }}>{w}</span>
                                                ))}
                                                {c.blockers.map((b, bi) => (
                                                    <span key={bi} style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 8,
                                                        background: 'rgba(156,58,46,0.1)', color: T.danger, fontWeight: 600 }}>⚠ {b}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.inkMid }}>{c.tech.hoursThisWeek || 0}/{c.tech.hoursCap || 40} hrs</span>
                                            {isAdded ? (
                                                <button onClick={() => setAddedTechs(prev => ({ ...prev, [c.tech.id]: false }))}
                                                    style={{ padding: '5px 12px', background: T.ok, color: '#fbf8f3', border: 'none',
                                                        borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                                    ✓ Added
                                                </button>
                                            ) : canAdd ? (
                                                <button onClick={() => setAddedTechs(prev => ({ ...prev, [c.tech.id]: true }))}
                                                    style={{ padding: '5px 12px', background: T.ink, color: '#fbf8f3', border: 'none',
                                                        borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                                    + Add
                                                </button>
                                            ) : (
                                                <button onClick={() => setAddedTechs(prev => ({ ...prev, [c.tech.id]: true }))}
                                                    style={{ padding: '5px 12px', background: 'transparent', color: T.warn,
                                                        border: `1px solid ${T.warn}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                                    Override
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {candidates.length > 0 && (
                                <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
                                    Score = weighted match of required skills, cert status, license level, hours-this-week, distance from job, and customer preference. Override by clicking Manual pick.
                                </div>
                            )}
                        </div>

                        {/* Action bar */}
                        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.border}`,
                            background: T.surface, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 12, color: T.inkMid, flex: 1 }}>
                                {selectedJob.start ? `${fmt12(selectedJob.start)} – ${fmt12(selectedJob.start + selectedJob.durationHrs)}` : 'No time set'}
                                {selectedJob.preferredTechId && (
                                    <span style={{ marginLeft: 8, fontSize: 11, color: T.inkMuted }}>
                                        Preferred: {techs.find(t => t.id === selectedJob.preferredTechId)?.name}
                                    </span>
                                )}
                            </div>
                            {addedCount > 0 && addedCount < crewSlots && (
                                <span style={{ fontSize: 11.5, color: T.warn, fontWeight: 600 }}>
                                    ⚠ {addedCount}/{crewSlots} crew — confirm?
                                </span>
                            )}
                            <button style={{ padding: '7px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
                                borderRadius: T.r, fontSize: 12.5, fontWeight: 500, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}>
                                Save draft
                            </button>
                            <button style={{ padding: '7px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
                                borderRadius: T.r, fontSize: 12.5, fontWeight: 500, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}>
                                Notify techs (SMS)
                            </button>
                            <button disabled={addedCount === 0} onClick={() => setSaving(true)}
                                style={{ padding: '7px 16px', background: addedCount > 0 ? T.ink : T.borderStrong,
                                    color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                                    cursor: addedCount > 0 ? 'pointer' : 'default', fontFamily: T.sans, transition: 'background 120ms' }}>
                                {saving ? 'Scheduling…' : 'Schedule & notify'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1,
                        color: T.inkMuted, fontSize: 14, fontStyle: 'italic' }}>
                        Select a job from the queue to build a crew.
                    </div>
                )}
            </div>

            {/* Right rail — day impact */}
            {selectedJob && (
                <div style={{ width: 220, flexShrink: 0, borderLeft: `1px solid ${T.border}`,
                    background: T.surface, overflowY: 'auto', padding: '14px 14px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
                        Day Impact · Today
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginBottom: 16 }}>
                        {fmt12(7)} – {fmt12(18)}
                    </div>
                    {candidates.slice(0, 3).map(c => {
                        const isAdded = addedTechs[c.tech.id];
                        return (
                            <div key={c.tech.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, width: 28 }}>{c.tech.name.split(' ')[0].slice(0, 2)}</span>
                                <div style={{ flex: 1, height: 8, background: T.surface2, borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                                    {/* Existing jobs */}
                                    {jobs.filter(j => (j.assignedTechIds || []).includes(c.tech.id) && j.start != null).map(j => {
                                        const left = ((j.start - 7) / 11) * 100;
                                        const width = (j.durationHrs / 11) * 100;
                                        return <div key={j.id} style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%', background: T.inkMuted, opacity: 0.5 }}/>;
                                    })}
                                    {/* Proposed */}
                                    {isAdded && selectedJob.start && (
                                        <div style={{ position: 'absolute',
                                            left: `${((selectedJob.start - 7) / 11) * 100}%`,
                                            width: `${(selectedJob.durationHrs / 11) * 100}%`,
                                            height: '100%', background: T.ok, opacity: 0.8 }}/>
                                    )}
                                </div>
                                {isAdded && <span style={{ fontSize: 9, color: T.ok, fontWeight: 700 }}>+</span>}
                            </div>
                        );
                    })}

                    {/* Customer history */}
                    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 12 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>
                            Customer History
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{selectedJob.customer}</div>
                        <div style={{ fontSize: 11, color: T.inkMid }}>{selectedJob.address}</div>
                    </div>
                </div>
            )}
        </div>
    );
};


// Board/CrewBuilder shape for a technician row. Hoisted to module scope so the
// Technicians editor can re-normalise a single saved row without duplicating it.
// Note this mapping intentionally drops userId, rates and notes — the board does
// not need them — which is why the editor works off the raw rows instead.
const normaliseTech = (t) => ({
    id:             t.id,
    name:           `${t.firstName} ${t.lastName}`.trim(),
    firstName:      t.firstName,
    lastName:       t.lastName,
    email:          t.email,
    phone:          t.phone,
    license:        t.employmentType === 'subcontractor' ? 'Journeyman' : (t.skills?.[0] ? 'Journeyman' : 'Apprentice'),
    dispatchSkills: t.skills        || [],
    dispatchCerts:  t.certifications || [],
    hoursThisWeek:  0,
    hoursCap:       40,
    vehicle:        t.assignedVehicleId || null,
    baseLocation:   t.homeZip || null,
    status:         t.status,
    employmentType: t.employmentType,
    avatarInitials: t.avatarInitials || `${t.firstName?.[0] || ''}${t.lastName?.[0] || ''}`.toUpperCase(),
});

// ── Dispatch customers view ───────────────────────────────────────────────────
// Until now nothing in the app could list, create, or edit dispatch customers —
// rows existed only in the database. This is the missing admin surface, and the
// place where the accountId link back to a CRM account is actually managed.
//
// Deliberately no delete: a customer with jobs would orphan dispatch_jobs.customerId
// (an FK with no cascade). Use "Do not service" to retire a customer instead.
const CUSTOMER_TYPES = ['commercial', 'residential', 'industrial', 'government'];
const AGREEMENTS     = ['none', 'basic', 'preferred', 'premium'];

const CustFieldRow = ({ label, children }) => (
    <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid,
            textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>{label}</label>
        {children}
    </div>
);

const custInput = {
    width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r,
    fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none',
};

const CustomersView = ({ customers, accounts, onSaved }) => {
    const [query,      setQuery]      = React.useState('');
    const [selectedId, setSelectedId] = React.useState(null);
    const [draft,      setDraft]      = React.useState(null);
    const [saving,     setSaving]     = React.useState(false);
    const [status,     setStatus]     = React.useState(null);

    const q = query.trim().toLowerCase();
    const list = (customers || [])
        .filter(c => !q
            || (c.name || '').toLowerCase().includes(q)
            || (c.customerNumber || '').toLowerCase().includes(q))
        .slice()
        .sort((a, b) => (a.customerNumber || '').localeCompare(b.customerNumber || ''));

    const selected = (customers || []).find(c => c.id === selectedId) || null;

    React.useEffect(() => {
        setDraft(selected ? { ...selected } : null);
        setStatus(null);
    }, [selectedId]);   // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
    const linkedAccount = draft && draft.accountId ? (accounts || []).find(a => a.id === draft.accountId) : null;

    const startNew = () => {
        setSelectedId(null);
        setStatus(null);
        setDraft({ id: 'dcust_' + crypto.randomUUID(), _isNew: true, name: '', accountId: '',
            customerType: 'commercial', contactName: '', contactPhone: '', contactEmail: '',
            serviceAddress: '', serviceCity: '', serviceState: '', serviceZip: '',
            serviceAgreement: 'none', doNotService: false, doNotServiceReason: '', notes: '' });
    };

    const copyFromAccount = () => {
        if (!linkedAccount) return;
        setDraft(d => ({ ...d,
            serviceAddress: linkedAccount.address || d.serviceAddress || '',
            serviceCity:    linkedAccount.city    || d.serviceCity    || '',
            serviceState:   linkedAccount.state   || d.serviceState   || '',
            serviceZip:     linkedAccount.zip     || d.serviceZip     || '',
        }));
    };

    const save = async () => {
        if (!draft || !(draft.name || '').trim()) { setStatus({ kind: 'err', msg: 'Name is required.' }); return; }
        setSaving(true); setStatus(null);
        try {
            const body = { ...draft, name: draft.name.trim(), accountId: draft.accountId || null };
            delete body._isNew;
            delete body.customerNumber;   // server-assigned and immutable

            const url = draft._isNew
                ? '/.netlify/functions/dispatch-customers'
                : '/.netlify/functions/dispatch-customers?id=' + encodeURIComponent(draft.id);
            const res = await dbFetch(url, {
                method: draft._isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 403) throw new Error('Your role cannot change dispatch customers.');
                throw new Error(data.error || ('HTTP ' + res.status));
            }
            const saved = data.customer;
            if (saved) { onSaved(saved); setSelectedId(saved.id); }
            setStatus({ kind: 'ok', msg: draft._isNew ? ('Created ' + ((saved && saved.customerNumber) || '')) : 'Saved' });
        } catch (e) {
            setStatus({ kind: 'err', msg: e.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            <div style={{ width: 300, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', background: T.surface }}>
                <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or CUST-…"
                        style={{ ...custInput, padding: '7px 9px', fontSize: 12.5 }}/>
                    <button onClick={startNew}
                        style={{ padding: '7px 12px', background: T.ink, color: T.surface, border: 'none',
                            borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                        + New
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {list.length === 0 && (
                        <div style={{ padding: 16, fontSize: 12.5, color: T.inkMuted, fontFamily: T.sans }}>
                            No dispatch customers{q ? ' match that search' : ' yet'}.
                        </div>
                    )}
                    {list.map(c => (
                        <div key={c.id} onClick={() => setSelectedId(c.id)}
                            style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                                background: c.id === selectedId ? T.surface2 : 'transparent' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: c.id === selectedId ? 700 : 500, color: T.ink, fontFamily: T.sans }}>{c.name}</span>
                                <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.mono }}>{c.customerNumber || '—'}</span>
                            </div>
                            <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{c.customerType || 'commercial'}</span>
                                {c.accountId
                                    ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.ok}14`, color: T.ok, fontWeight: 700 }}>linked</span>
                                    : <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.warn}14`, color: T.warn, fontWeight: 700 }}>unlinked</span>}
                                {c.doNotService && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.danger}14`, color: T.danger, fontWeight: 700 }}>do not service</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {!draft ? (
                    <div style={{ fontSize: 13, color: T.inkMuted, fontFamily: T.sans }}>
                        Select a customer, or create one.
                    </div>
                ) : (
                    <div style={{ maxWidth: 620 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                            <span style={{ fontSize: 20, fontStyle: 'italic', fontWeight: 300, color: T.ink, fontFamily: T.serif }}>
                                {draft._isNew ? 'New customer' : draft.name}
                            </span>
                            {draft.customerNumber && (
                                <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.mono }}>{draft.customerNumber}</span>
                            )}
                        </div>

                        <CustFieldRow label="Name *">
                            <input value={draft.name || ''} onChange={e => set('name', e.target.value)} style={custInput}/>
                        </CustFieldRow>

                        <CustFieldRow label="Linked CRM account">
                            <select value={draft.accountId || ''} onChange={e => set('accountId', e.target.value)} style={custInput}>
                                <option value="">— Not linked —</option>
                                {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            {linkedAccount && (
                                <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                    {[linkedAccount.address, linkedAccount.city, linkedAccount.state, linkedAccount.zip].filter(Boolean).join(', ') || 'No address on the account'}
                                    {' · '}
                                    <span onClick={copyFromAccount} style={{ color: T.info, cursor: 'pointer', fontWeight: 600 }}>copy address</span>
                                </div>
                            )}
                        </CustFieldRow>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="Customer type">
                                <select value={draft.customerType || 'commercial'} onChange={e => set('customerType', e.target.value)} style={custInput}>
                                    {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </CustFieldRow>
                            <CustFieldRow label="Service agreement">
                                <select value={draft.serviceAgreement || 'none'} onChange={e => set('serviceAgreement', e.target.value)} style={custInput}>
                                    {AGREEMENTS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </CustFieldRow>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            {[['contactName', 'Contact'], ['contactPhone', 'Phone'], ['contactEmail', 'Email']].map(([k, l]) => (
                                <CustFieldRow key={k} label={l}>
                                    <input value={draft[k] || ''} onChange={e => set(k, e.target.value)} style={custInput}/>
                                </CustFieldRow>
                            ))}
                        </div>

                        <CustFieldRow label="Service address">
                            <input value={draft.serviceAddress || ''} onChange={e => set('serviceAddress', e.target.value)} style={custInput}/>
                        </CustFieldRow>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                            {[['serviceCity', 'City'], ['serviceState', 'State'], ['serviceZip', 'Zip']].map(([k, l]) => (
                                <CustFieldRow key={k} label={l}>
                                    <input value={draft[k] || ''} onChange={e => set(k, e.target.value)} style={custInput}/>
                                </CustFieldRow>
                            ))}
                        </div>

                        <CustFieldRow label="Notes">
                            <textarea value={draft.notes || ''} onChange={e => set('notes', e.target.value)} rows={3}
                                style={{ ...custInput, resize: 'vertical' }}/>
                        </CustFieldRow>

                        <div style={{ padding: '10px 12px', border: `1px solid ${draft.doNotService ? T.danger : T.border}`,
                            borderRadius: T.r, marginBottom: 16, background: draft.doNotService ? `${T.danger}0a` : 'transparent' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: T.ink, fontFamily: T.sans }}>
                                <input type="checkbox" checked={!!draft.doNotService} onChange={e => set('doNotService', e.target.checked)}/>
                                Do not service
                            </label>
                            {draft.doNotService && (
                                <input value={draft.doNotServiceReason || ''} onChange={e => set('doNotServiceReason', e.target.value)}
                                    placeholder="Reason" style={{ ...custInput, marginTop: 8 }}/>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button onClick={save} disabled={saving}
                                style={{ padding: '8px 18px', background: saving ? T.inkMuted : T.ink, color: T.surface,
                                    border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 600,
                                    cursor: saving ? 'default' : 'pointer', fontFamily: T.sans }}>
                                {saving ? 'Saving…' : (draft._isNew ? 'Create customer' : 'Save changes')}
                            </button>
                            {status && (
                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.sans,
                                    color: status.kind === 'ok' ? T.ok : T.danger }}>{status.msg}</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// ── Technicians view ──────────────────────────────────────────────────────────
// dispatch_technicians is the source of truth for who can be dispatched. userId
// is a nullable FK to users: an employee tech who needs the mobile app gets one,
// a subcontractor who never logs in does not — so being schedulable never costs
// a Clerk seat. The old settings.users[].dispatch* fields are a separate, board-
// invisible store and are being retired in favour of this table.
const EMPLOYMENT_TYPES = ['employee', 'subcontractor'];
const TECH_STATUSES    = ['active', 'inactive', 'on_leave'];

const TechniciansView = ({ techsRaw, users, vehicles, skills, onSaved }) => {
    const [query,      setQuery]      = React.useState('');
    const [selectedId, setSelectedId] = React.useState(null);
    const [draft,      setDraft]      = React.useState(null);
    const [saving,     setSaving]     = React.useState(false);
    const [status,     setStatus]     = React.useState(null);

    const q = query.trim().toLowerCase();
    const list = (techsRaw || [])
        .filter(t => !q || `${t.firstName} ${t.lastName}`.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));

    const selected = (techsRaw || []).find(t => t.id === selectedId) || null;

    React.useEffect(() => {
        setDraft(selected ? { ...selected } : null);
        setStatus(null);
    }, [selectedId]);   // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

    const startNew = () => {
        setSelectedId(null);
        setStatus(null);
        setDraft({ id: 'dtech_' + crypto.randomUUID(), _isNew: true, firstName: '', lastName: '',
            userId: '', email: '', phone: '', employmentType: 'employee', status: 'active',
            homeZip: '', skills: [], laborRate: '', overtimeRate: '', assignedVehicleId: '', notes: '' });
    };

    const save = async () => {
        if (!draft || !(draft.firstName || '').trim() || !(draft.lastName || '').trim()) {
            setStatus({ kind: 'err', msg: 'First and last name are required.' }); return;
        }
        setSaving(true); setStatus(null);
        try {
            const body = { ...draft,
                firstName: draft.firstName.trim(),
                lastName:  draft.lastName.trim(),
                userId:    draft.userId || null,
                assignedVehicleId: draft.assignedVehicleId || null,
                laborRate:    draft.laborRate    === '' ? null : draft.laborRate,
                overtimeRate: draft.overtimeRate === '' ? null : draft.overtimeRate,
            };
            delete body._isNew;
            const url = draft._isNew
                ? '/.netlify/functions/dispatch-technicians'
                : '/.netlify/functions/dispatch-technicians?id=' + encodeURIComponent(draft.id);
            const res = await dbFetch(url, {
                method: draft._isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 403) throw new Error('Your role cannot change technicians.');
                throw new Error(data.error || ('HTTP ' + res.status));
            }
            const saved = data.technician;
            if (saved) { onSaved(saved); setSelectedId(saved.id); }
            setStatus({ kind: 'ok', msg: draft._isNew ? 'Technician created' : 'Saved' });
        } catch (e) {
            setStatus({ kind: 'err', msg: e.message });
        } finally {
            setSaving(false);
        }
    };

    const linkedUser = draft && draft.userId ? (users || []).find(u => u.id === draft.userId) : null;

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            <div style={{ width: 300, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', background: T.surface }}>
                <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search technicians"
                        style={{ ...custInput, padding: '7px 9px', fontSize: 12.5 }}/>
                    <button onClick={startNew}
                        style={{ padding: '7px 12px', background: T.ink, color: T.surface, border: 'none',
                            borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                        + New
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {list.length === 0 && (
                        <div style={{ padding: 16, fontSize: 12.5, color: T.inkMuted, fontFamily: T.sans }}>
                            No technicians{q ? ' match that search' : ' yet'}.
                        </div>
                    )}
                    {list.map(t => (
                        <div key={t.id} onClick={() => setSelectedId(t.id)}
                            style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                                background: t.id === selectedId ? T.surface2 : 'transparent' }}>
                            <div style={{ fontSize: 13, fontWeight: t.id === selectedId ? 700 : 500, color: T.ink, fontFamily: T.sans }}>
                                {t.firstName} {t.lastName}
                            </div>
                            <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{t.employmentType}</span>
                                {t.userId
                                    ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.ok}14`, color: T.ok, fontWeight: 700 }}>app user</span>
                                    : <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.inkMuted}14`, color: T.inkMuted, fontWeight: 700 }}>no login</span>}
                                {t.status !== 'active' && (
                                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.warn}14`, color: T.warn, fontWeight: 700 }}>{t.status}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {!draft ? (
                    <div style={{ fontSize: 13, color: T.inkMuted, fontFamily: T.sans }}>
                        Select a technician, or create one.
                    </div>
                ) : (
                    <div style={{ maxWidth: 620 }}>
                        <div style={{ fontSize: 20, fontStyle: 'italic', fontWeight: 300, color: T.ink, fontFamily: T.serif, marginBottom: 16 }}>
                            {draft._isNew ? 'New technician' : `${draft.firstName} ${draft.lastName}`}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="First name *">
                                <input value={draft.firstName || ''} onChange={e => set('firstName', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                            <CustFieldRow label="Last name *">
                                <input value={draft.lastName || ''} onChange={e => set('lastName', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                        </div>

                        <CustFieldRow label="Linked app user">
                            <select value={draft.userId || ''} onChange={e => set('userId', e.target.value)} style={custInput}>
                                <option value="">— No login (subcontractor) —</option>
                                {(users || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                            </select>
                            <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                {linkedUser
                                    ? 'Signs in to the app. Required for mobile access to their own jobs.'
                                    : 'Schedulable without an app login — no seat is consumed.'}
                            </div>
                        </CustFieldRow>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="Email">
                                <input value={draft.email || ''} onChange={e => set('email', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                            <CustFieldRow label="Phone">
                                <input value={draft.phone || ''} onChange={e => set('phone', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="Employment">
                                <select value={draft.employmentType || 'employee'} onChange={e => set('employmentType', e.target.value)} style={custInput}>
                                    {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </CustFieldRow>
                            <CustFieldRow label="Status">
                                <select value={draft.status || 'active'} onChange={e => set('status', e.target.value)} style={custInput}>
                                    {TECH_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                </select>
                            </CustFieldRow>
                            <CustFieldRow label="Home zip">
                                <input value={draft.homeZip || ''} onChange={e => set('homeZip', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                        </div>

                        {(skills || []).length > 0 && (
                            <CustFieldRow label="Skills">
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    {(skills || []).map(s => {
                                        const on = (draft.skills || []).includes(s.id);
                                        return (
                                            <span key={s.id}
                                                onClick={() => set('skills', on
                                                    ? (draft.skills || []).filter(x => x !== s.id)
                                                    : [...(draft.skills || []), s.id])}
                                                style={{ padding: '4px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 999,
                                                    border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.ink : 'transparent',
                                                    color: on ? T.surface : T.inkMid, fontFamily: T.sans }}>
                                                {s.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </CustFieldRow>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="Labor rate / hr">
                                <input type="number" step="0.01" value={draft.laborRate ?? ''} onChange={e => set('laborRate', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                            <CustFieldRow label="Overtime rate / hr">
                                <input type="number" step="0.01" value={draft.overtimeRate ?? ''} onChange={e => set('overtimeRate', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                            <CustFieldRow label="Assigned vehicle">
                                <select value={draft.assignedVehicleId || ''} onChange={e => set('assignedVehicleId', e.target.value)} style={custInput}>
                                    <option value="">— None —</option>
                                    {(vehicles || []).map(v => <option key={v.id} value={v.id}>{v.name || v.label || v.id}</option>)}
                                </select>
                            </CustFieldRow>
                        </div>

                        <CustFieldRow label="Notes">
                            <textarea value={draft.notes || ''} onChange={e => set('notes', e.target.value)} rows={3}
                                style={{ ...custInput, resize: 'vertical' }}/>
                        </CustFieldRow>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button onClick={save} disabled={saving}
                                style={{ padding: '8px 18px', background: saving ? T.inkMuted : T.ink, color: T.surface,
                                    border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 600,
                                    cursor: saving ? 'default' : 'pointer', fontFamily: T.sans }}>
                                {saving ? 'Saving…' : (draft._isNew ? 'Create technician' : 'Save changes')}
                            </button>
                            {status && (
                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.sans,
                                    color: status.kind === 'ok' ? T.ok : T.danger }}>{status.msg}</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── MAIN DISPATCH TAB ─────────────────────────────────────────────────────────
export default function DispatchTab() {
    const { settings, opportunities, accounts } = useApp();

    const [view, setView] = useState('board'); // 'board' | 'queue'
    const [selectedJobId, setSelectedJobId] = useState(null);

    // ── New Job form state ────────────────────────────────────────────────────
    const [showNewJobForm, setShowNewJobForm] = useState(false);
    const [newJobSaving,   setNewJobSaving]   = useState(false);
    const [newJobError,    setNewJobError]    = useState('');
    // customerId is the FK the server requires; `customer` is only the typed text.
    const EMPTY_JOB = { customer: '', customerId: '', accountId: '', title: '', address: '', city: '', state: '', zip: '',
        window: '', priority: 'normal', crewSize: 1, durationHrs: 2, minLicense: 'Journeyman',
        opportunityId: '', needSkills: [] };
    const [newJobForm, setNewJobForm] = useState(EMPTY_JOB);

    // ── DB-backed state ───────────────────────────────────────────────────────
    const [jobs,       setJobs]       = useState([]);
    const [techs,      setTechs]      = useState([]);
    const [vehicles,   setVehicles]   = useState([]);
    // Raw technician rows (userId, rates, notes) for the Technicians editor.
    const [techsRaw,   setTechsRaw]   = useState([]);
    const [equipment,  setEquipment]  = useState([]);
    const [customers,  setCustomers]  = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [loadError,  setLoadError]  = useState('');

    // ── Config from settings.extra (not record-level data) ───────────────────
    const skills    = settings?.dispatchSkills   || [];
    const crews     = settings?.dispatchCrews    || [];
    const licLevels = settings?.dispatchLicenses || ['Apprentice', 'Journeyman', 'Master', 'Lead'];

    // ── Filter state ──────────────────────────────────────────────────────────
    const [filterSkill,   setFilterSkill]   = useState(null);
    const [filterVehicle, setFilterVehicle] = useState(null);
    const [filterLicense, setFilterLicense] = useState(null);
    const [filterTeam,    setFilterTeam]    = useState(null);
    const [openFilter,    setOpenFilter]    = useState(null);
    const [filterRect,    setFilterRect]    = useState(null);

    const openFilterMenu = useCallback((e, key) => {
        e.stopPropagation();
        if (openFilter === key) { setOpenFilter(null); setFilterRect(null); return; }
        const r = e.currentTarget.getBoundingClientRect();
        setFilterRect({ top: r.bottom + 4, left: r.left });
        setOpenFilter(key);
    }, [openFilter]);

    const closeFilter = useCallback(() => { setOpenFilter(null); setFilterRect(null); }, []);

    // ── Load all dispatch data from DB on mount ───────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadError('');
            try {
                // Wait for Clerk JWT to be available before hitting DB
                await waitForToken();

                const [techsRes, vehiclesRes, equipRes, custsRes, jobsRes] = await Promise.all([
                    dbFetch('/.netlify/functions/dispatch-technicians'),
                    dbFetch('/.netlify/functions/dispatch-vehicles'),
                    dbFetch('/.netlify/functions/dispatch-equipment'),
                    dbFetch('/.netlify/functions/dispatch-customers'),
                    dbFetch('/.netlify/functions/dispatch-jobs'),
                ]);

                if (cancelled) return;

                // Surface non-2xx responses. Previously every response was parsed
                // blindly, so a 500 or 403 produced `{error}` with no `.customers`
                // key, fell through `|| []`, and rendered as "no customers yet" —
                // an endpoint failure was indistinguishable from an empty table.
                const failed = [
                    ['technicians', techsRes], ['vehicles', vehiclesRes], ['equipment', equipRes],
                    ['customers', custsRes],   ['jobs', jobsRes],
                ].filter(([, r]) => !r.ok);
                if (failed.length) {
                    const detail = failed.map(([n, r]) => `${n} (${r.status})`).join(', ');
                    throw new Error(`Dispatch data failed to load: ${detail}`);
                }

                const [techsData, vehiclesData, equipData, custsData, jobsData] = await Promise.all([
                    techsRes.json(),
                    vehiclesRes.json(),
                    equipRes.json(),
                    custsRes.json(),
                    jobsRes.json(),
                ]);

                // Normalise technicians — map DB fields to what BoardView/CrewBuilder expect
                const dbTechs = (techsData.technicians || []).map(normaliseTech);

                // Calculate hours this week from scheduled jobs
                const weekStart = new Date();
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                weekStart.setHours(0, 0, 0, 0);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);

                const dbJobs = (jobsData.jobs || []);
                const hoursMap = {};
                dbJobs.forEach(j => {
                    if (!j.scheduledDate || !j.durationMinutes) return;
                    const d = new Date(j.scheduledDate);
                    if (d < weekStart || d >= weekEnd) return;
                    const hrs = j.durationMinutes / 60;
                    const techIds = [j.assignedTechId, ...(j.coTechIds || [])].filter(Boolean);
                    techIds.forEach(tid => { hoursMap[tid] = (hoursMap[tid] || 0) + hrs; });
                });
                dbTechs.forEach(t => { t.hoursThisWeek = Math.round((hoursMap[t.id] || 0) * 10) / 10; });

                // Normalise jobs — map DB shape to what BoardView/CrewBuilder expect
                const normJobs = dbJobs.map(j => {
                    const cust = (custsData.customers || []).find(c => c.id === j.customerId);
                    // Convert scheduledStart "HH:MM" to decimal hour for timeline
                    let startHr = null;
                    if (j.scheduledStart) {
                        const [hh, mm] = j.scheduledStart.split(':').map(Number);
                        startHr = hh + mm / 60;
                    }
                    return {
                        id:             j.id,
                        jobNumber:      j.jobNumber,
                        opportunityId:  j.opportunityId,
                        customer:       cust?.name || j.title,
                        address:        cust ? `${cust.billingAddress || ''}, ${cust.billingCity || ''}`.trim().replace(/^,\s*/, '') : '',
                        needSkills:     [], // skills stored as strings in DB — map via settings.dispatchSkills
                        crewSize:       [j.assignedTechId, ...(j.coTechIds || [])].filter(Boolean).length || 1,
                        durationHrs:    j.durationMinutes ? j.durationMinutes / 60 : 2,
                        priority:       j.priority === 'emergency' ? 'urgent' : j.priority === 'low' ? 'low' : 'standard',
                        window:         j.timeSlot === 'exact' && j.scheduledStart
                            ? j.scheduledStart
                            : j.scheduledDate || 'TBD',
                        equipment:      (j.equipmentIds || []).join(', '),
                        value:          parseFloat(j.invoiceAmount || 0),
                        minLicense:     'Journeyman',
                        preferredTechId: j.assignedTechId || null,
                        assignedTechIds: [j.assignedTechId, ...(j.coTechIds || [])].filter(Boolean),
                        start:          startHr,
                        status:         j.status,
                        trade:          j.trade,
                        jobType:        j.jobType,
                        scheduledDate:  j.scheduledDate,
                        locationId:     j.locationId,
                        customerId:     j.customerId,
                        // raw DB fields preserved for saves
                        _raw:           j,
                    };
                });

                // Also surface Closed Won opps not yet in dispatch
                const existingOppIds = new Set(normJobs.map(j => j.opportunityId).filter(Boolean));
                const autoJobs = (opportunities || [])
                    .filter(o => o.stage === 'Closed Won' && !existingOppIds.has(o.id))
                    .map(o => ({
                        id:             'auto_' + o.id,
                        opportunityId:  o.id,
                        customer:       o.account || o.opportunityName || 'Unknown',
                        address:        '',
                        needSkills:     [],
                        crewSize:       1,
                        durationHrs:    4,
                        priority:       'standard',
                        window:         'TBD',
                        equipment:      '',
                        value:          parseFloat(o.arr || o.revenue || 0) || 0,
                        minLicense:     'Journeyman',
                        preferredTechId:null,
                        assignedTechIds:[],
                        start:          null,
                        status:         'unscheduled',
                        _raw:           null,
                    }));

                setTechs(dbTechs);
                setTechsRaw(techsData.technicians || []);
                setVehicles(vehiclesData.vehicles  || []);
                setEquipment(equipData.equipment   || []);
                setCustomers(custsData.customers   || []);
                setJobs([...normJobs, ...autoJobs]);
            } catch (err) {
                if (!cancelled) setLoadError(err.message || 'Failed to load dispatch data. Please refresh.');
                console.error('DispatchTab load error:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Save new job ──────────────────────────────────────────────────────────
    // Create is up to three writes, in dependency order:
    //   1. customer  (only when the typeahead did not resolve to an existing one)
    //   2. service location (only when an address was entered) — the job's
    //      address lives here; dispatch_jobs has no address column of its own
    //   3. the job itself, carrying customerId + locationId
    // Everything the form collects is now sent; previously address, crew size,
    // min licence and skills existed only in optimistic local state and vanished
    // on refresh.
    const handleSaveNewJob = async () => {
        const custName = newJobForm.customer.trim();
        const title    = newJobForm.title.trim();
        const address  = newJobForm.address.trim();
        const city     = newJobForm.city.trim();
        if (!custName) { setNewJobError('Customer is required.'); return; }
        if (!title)    { setNewJobError('Job title is required.'); return; }
        if (address && !city) { setNewJobError('City is required when a job address is entered.'); return; }

        setNewJobSaving(true);
        setNewJobError('');
        try {
            // 1 — resolve the customer FK
            let customerId  = newJobForm.customerId;
            let createdCust = null;
            if (!customerId) {
                const newCustId = 'dcust_' + crypto.randomUUID();
                const cres = await dbFetch('/.netlify/functions/dispatch-customers', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: newCustId,
                        name: custName,
                        accountId: newJobForm.accountId || null,
                    }),
                });
                const cdata = await cres.json();
                if (!cres.ok) throw new Error(cdata?.error || 'Could not create the customer.');
                createdCust = cdata.customer;
                customerId  = createdCust?.id || newCustId;
                setCustomers(prev => [...prev, createdCust].filter(Boolean));
            }

            // 2 — optional service location
            let locationId = null;
            if (address) {
                const locId = 'dloc_' + crypto.randomUUID();
                const lres = await dbFetch('/.netlify/functions/dispatch-customers?resource=locations', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: locId, customerId, name: address, address, city,
                        state: newJobForm.state.trim() || null,
                        zip:   newJobForm.zip.trim()   || null,
                        isDefault: !!createdCust,
                    }),
                });
                const ldata = await lres.json();
                if (!lres.ok) throw new Error(ldata?.error || 'Could not save the job address.');
                locationId = ldata.location?.id || locId;
            }

            // 3 — the job
            const jobId = 'djob_' + crypto.randomUUID();
            const payload = {
                id:              jobId,
                customerId,
                locationId,
                accountId:       newJobForm.accountId || createdCust?.accountId || null,
                title,
                jobType:         'repair',
                priority:        newJobForm.priority,
                status:          'unscheduled',
                durationMinutes: Math.round((parseFloat(newJobForm.durationHrs) || 2) * 60),
                crewSize:        parseInt(newJobForm.crewSize, 10) || 1,
                minLicense:      newJobForm.minLicense || null,
                needSkills:      newJobForm.needSkills || [],
                scheduledDate:   newJobForm.window || null,
                opportunityId:   newJobForm.opportunityId || null,
            };
            const res  = await dbFetch('/.netlify/functions/dispatch-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Save failed');
            // Optimistically add to local state
            const saved = data.job || data;
            const optimistic = {
                id:              saved.id || jobId,
                title,
                customerId,
                locationId,
                opportunityId:   newJobForm.opportunityId || null,
                customer:        custName,
                address:         address || '',
                needSkills:      newJobForm.needSkills || [],
                crewSize:        parseInt(newJobForm.crewSize) || 1,
                durationHrs:     parseFloat(newJobForm.durationHrs) || 2,
                priority:        newJobForm.priority,
                window:          newJobForm.window || 'TBD',
                equipment:       '',
                value:           0,
                minLicense:      newJobForm.minLicense,
                preferredTechId: null,
                assignedTechIds: [],
                start:           null,
                status:          'unscheduled',
                _raw:            data,
            };
            setJobs(prev => [optimistic, ...prev]);
            setSelectedJobId(optimistic.id);
            setNewJobForm(EMPTY_JOB);
            setShowNewJobForm(false);
        } catch (err) {
            setNewJobError(err.message || 'Failed to save job.');
        } finally {
            setNewJobSaving(false);
        }
    };
    const filteredTechs = useMemo(() => {
        let t = techs;
        if (filterSkill)   t = t.filter(tech => (tech.dispatchSkills || []).includes(filterSkill));
        if (filterVehicle) t = t.filter(tech => tech.vehicle === filterVehicle);
        if (filterLicense) t = t.filter(tech => tech.license === filterLicense);
        if (filterTeam) {
            const crew = crews.find(c => c.id === filterTeam);
            if (crew) t = t.filter(tech => (crew.members || []).includes(tech.id || tech.name));
        }
        return t;
    }, [techs, filterSkill, filterVehicle, filterLicense, filterTeam, crews]);

    const filteredJobs = useMemo(() => {
        if (!filterSkill && !filterVehicle && !filterLicense && !filterTeam) return jobs;
        return jobs.filter(j => {
            if (filterSkill && !(j.needSkills || []).includes(filterSkill)) return false;
            return true;
        });
    }, [jobs, filterSkill, filterVehicle, filterLicense, filterTeam]);

    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const unscheduled = jobs.filter(j => !j.start || (j.assignedTechIds || []).length === 0).length;
    const urgentUnassigned = jobs.filter(j => j.priority === 'urgent' && (!j.start || (j.assignedTechIds || []).length === 0)).length;

    const handleJobClick = (job) => {
        setSelectedJobId(job.id);
        setView('queue');
    };

    if (loading) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.inkMuted, fontFamily: T.sans }}>Loading dispatch…</div>;
    }

    if (loadError) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.danger, fontFamily: T.sans, fontSize: 13 }}>{loadError}</div>;
    }

    return (
        <div className="tab-page" style={{ fontFamily: T.sans, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                padding: '14px 20px 14px', borderBottom: `1px solid ${T.border}`, background: T.bg, flexShrink: 0 }}>
                <div style={{ borderLeft: `3px solid ${T.goldInk}`, paddingLeft: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>DISPATCH</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: T.ink, letterSpacing: -0.3, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300 }}>
                        {view === 'board' ? `Today · ${todayStr}` : view === 'queue' ? 'Jobs to schedule' : view === 'techs' ? `${techsRaw.length} technician${techsRaw.length === 1 ? '' : 's'}` : `${customers.length} dispatch customer${customers.length === 1 ? '' : 's'}`}
                    </div>
                    <div style={{ fontSize: 13, color: T.inkMid, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span>{techs.length} techs available · {jobs.length} jobs</span>
                        {urgentUnassigned > 0 && <>
                            <span style={{ color: T.inkMuted }}>•</span>
                            <span style={{ color: T.warn, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.warn, display: 'inline-block' }}/>
                                {urgentUnassigned} urgent unassigned
                            </span>
                        </>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* View toggle */}
                    <div style={{ display: 'inline-flex', borderRadius: T.r, border: `1px solid ${T.borderStrong}`, overflow: 'hidden' }}>
                        {[['board', 'Board'], ['queue', 'Queue'], ['customers', 'Customers'], ['techs', 'Technicians']].map(([v, l], i) => (
                            <button key={v} onClick={() => setView(v)}
                                style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                                    background: view === v ? T.ink : 'transparent',
                                    color: view === v ? '#fbf8f3' : T.inkMid,
                                    border: 'none', borderLeft: i > 0 ? `1px solid ${T.borderStrong}` : 'none',
                                    fontFamily: T.sans }}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <button style={{ padding: '6px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
                        borderRadius: T.r, fontSize: 12.5, fontWeight: 500, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                        Mass-schedule next week
                    </button>
                    <button onClick={() => { setNewJobForm(EMPTY_JOB); setNewJobError(''); setShowNewJobForm(true); }} style={{ padding: '6px 14px', background: T.ink, color: '#fbf8f3', border: 'none',
                        borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        + New job
                    </button>
                </div>
            </div>

            {/* Filter bar (board only) */}
            {view === 'board' && (() => {
                const filterPillStyle = (active) => ({
                    padding: '4px 10px', background: active ? T.ink : T.surface,
                    border: `1px solid ${active ? T.ink : T.borderStrong}`, borderRadius: 12,
                    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                    fontSize: 12, color: active ? '#fbf8f3' : T.inkMid, fontFamily: T.sans,
                    transition: 'all 100ms',
                });

                const filters = [
                    {
                        key: 'skills', active: filterSkill,
                        label: filterSkill ? (skills.find(s => s.id === filterSkill)?.name || 'Skill') : 'All skills',
                        items: [{ id: null, name: 'All skills' }, ...skills],
                        onSelect: (id) => { setFilterSkill(id); closeFilter(); },
                    },
                    {
                        key: 'vehicles', active: filterVehicle,
                        label: filterVehicle ? (vehicles.find(v => v.id === filterVehicle)?.name || 'Vehicle') : 'All vehicles',
                        items: [{ id: null, name: 'All vehicles' }, ...vehicles.map(v => ({ id: v.id, name: v.name }))],
                        onSelect: (id) => { setFilterVehicle(id); closeFilter(); },
                    },
                    {
                        key: 'licenses', active: filterLicense,
                        label: filterLicense || 'All licenses',
                        items: [{ id: null, name: 'All licenses' }, ...licLevels.map(l => ({ id: l, name: l }))],
                        onSelect: (id) => { setFilterLicense(id); closeFilter(); },
                    },
                    {
                        key: 'teams', active: filterTeam,
                        label: filterTeam ? (crews.find(c => c.id === filterTeam)?.name || 'Team') : 'All teams',
                        items: [{ id: null, name: 'All teams' }, ...crews],
                        onSelect: (id) => { setFilterTeam(id); closeFilter(); },
                    },
                ];

                const anyActive = filterSkill || filterVehicle || filterLicense || filterTeam;

                return (
                    <div style={{ padding: '8px 20px', background: T.surface, borderBottom: `1px solid ${T.border}`,
                        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {filters.map(f => (
                            <span key={f.key} onClick={e => openFilterMenu(e, f.key)}
                                style={filterPillStyle(!!f.active)}>
                                {f.label}
                                <span style={{ fontSize: 9 }}>▾</span>
                            </span>
                        ))}
                        {anyActive && (
                            <button onClick={() => { setFilterSkill(null); setFilterVehicle(null); setFilterLicense(null); setFilterTeam(null); }}
                                style={{ padding: '3px 9px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 11.5, color: T.inkMuted, cursor: 'pointer', fontFamily: T.sans }}>
                                Clear
                            </button>
                        )}
                        <span style={{ flex: 1 }}/>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.inkMid }}>
                            {[['urgent', T.danger], ['standard', T.warn], ['low', T.inkMuted]].map(([l, c]) => (
                                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }}/>
                                    {l.charAt(0).toUpperCase() + l.slice(1)}
                                </span>
                            ))}
                        </div>

                        {/* Filter popover — fixed positioned, outside overflow:hidden */}
                        {openFilter && filterRect && (() => {
                            const f = filters.find(fi => fi.key === openFilter);
                            if (!f) return null;
                            return (
                                <>
                                    <div style={{ position:'fixed', inset:0, zIndex:9998 }} onClick={closeFilter}/>
                                    <div style={{ position:'fixed', top:filterRect.top, left:filterRect.left, zIndex:9999,
                                        background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2,
                                        boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:160, maxHeight:240,
                                        overflowY:'auto', overscrollBehavior:'contain' }}>
                                        {f.items.map((item, i) => {
                                            const isActive = f.active === item.id;
                                            return (
                                                <button key={item.id ?? 'all'} onClick={() => f.onSelect(item.id)}
                                                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 14px',
                                                        background: isActive ? `${T.goldInk}12` : 'none', border:'none',
                                                        borderTop: i>0 ? `1px solid ${T.border}` : 'none',
                                                        textAlign:'left', fontSize:13, cursor:'pointer', fontFamily:T.sans,
                                                        color: item.id === null ? T.inkMuted : T.ink, fontStyle: item.id === null ? 'italic' : 'normal' }}
                                                    onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                                                    onMouseLeave={e=>e.currentTarget.style.background=isActive?`${T.goldInk}12`:'none'}>
                                                    {item.color && <span style={{ width:10, height:10, borderRadius:2, background:item.color, flexShrink:0 }}/>}
                                                    {item.name}
                                                    {isActive && <span style={{ marginLeft:'auto', color:T.goldInk, fontSize:14 }}>✓</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                );
            })()}

            {/* Main content */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {view === 'board' ? (
                    <BoardView jobs={filteredJobs} techs={filteredTechs} skills={skills} onJobClick={handleJobClick}/>
                ) : view === 'techs' ? (
                    <TechniciansView techsRaw={techsRaw} users={settings?.users || []}
                        vehicles={vehicles} skills={skills}
                        onSaved={saved => {
                            setTechsRaw(prev => {
                                const i = prev.findIndex(t => t.id === saved.id);
                                if (i === -1) return [...prev, saved];
                                const next = [...prev]; next[i] = saved; return next;
                            });
                            setTechs(prev => {
                                const norm = normaliseTech(saved);
                                const i = prev.findIndex(t => t.id === saved.id);
                                if (i === -1) return [...prev, norm];
                                const next = [...prev]; next[i] = { ...prev[i], ...norm }; return next;
                            });
                        }}/>
                ) : view === 'customers' ? (
                    <CustomersView customers={customers} accounts={accounts}
                        onSaved={saved => setCustomers(prev => {
                            const i = prev.findIndex(c => c.id === saved.id);
                            if (i === -1) return [...prev, saved];
                            const next = [...prev]; next[i] = saved; return next;
                        })}/>
                ) : (
                    <CrewBuilderView jobs={filteredJobs} techs={filteredTechs} skills={skills}
                        selectedJobId={selectedJobId || jobs[0]?.id}
                        onSelectJob={setSelectedJobId}
                        onBack={() => setView('board')}/>
                )}
            </div>

            {/* Empty state */}
            {techs.length === 0 && (
                <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2,
                    padding: '12px 20px', fontSize: 13, color: T.inkMid, fontFamily: T.sans,
                    boxShadow: '0 4px 16px rgba(42,38,34,0.1)', textAlign: 'center', zIndex: 10 }}>
                    No techs configured. Go to <strong>Settings → People & Teams → Crew</strong> to assign dispatch profiles.
                </div>
            )}

            {/* ── New Job modal ──────────────────────────────────────────────── */}
            {showNewJobForm && (
                <>
                    <div onClick={() => setShowNewJobForm(false)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(42,38,34,0.45)', zIndex: 1000 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                        zIndex: 1001, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r + 2,
                        boxShadow: '0 8px 40px rgba(42,38,34,0.22)', width: 480, maxWidth: '92vw', fontFamily: T.sans }}>
                        {/* Header */}
                        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>New Job</div>
                            <button onClick={() => setShowNewJobForm(false)}
                                style={{ background: 'none', border: 'none', fontSize: 18, color: T.inkMuted, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                        {/* Body */}
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Customer */}
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Customer *</label>
                                <CustomerTypeahead
                                    customers={customers}
                                    accounts={accounts}
                                    query={newJobForm.customer}
                                    selectedId={newJobForm.customerId}
                                    selectedAccountId={newJobForm.accountId}
                                    onQueryChange={v => setNewJobForm(f => ({ ...f, customer: v, customerId: '', accountId: '' }))}
                                    onPick={c => setNewJobForm(f => ({ ...f, customer: c.name, customerId: c.id, accountId: c.accountId || '' }))}
                                    onPickAccount={a => setNewJobForm(f => ({
                                        ...f,
                                        customer:  a.name,
                                        customerId: '',
                                        accountId:  a.id,
                                        // Prefill the service address from the CRM account, but only
                                        // where the form is still empty so typing is never clobbered.
                                        address: f.address || a.address || '',
                                        city:    f.city    || a.city    || '',
                                        state:   f.state   || a.state   || '',
                                        zip:     f.zip     || a.zip     || '',
                                    }))}
                                    onCreateIntent={() => setNewJobForm(f => ({ ...f, customerId: '', accountId: '' }))} />
                            </div>
                            {/* Title */}
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Job Title *</label>
                                <input value={newJobForm.title}
                                    onChange={e => setNewJobForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Rooftop unit not cooling"
                                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none' }} />
                            </div>
                            {/* Address */}
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Job Address</label>
                                <input value={newJobForm.address}
                                    onChange={e => setNewJobForm(f => ({ ...f, address: e.target.value }))}
                                    placeholder="Street address"
                                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none' }} />
                            </div>
                            {/* City / State / Zip — city is required by dispatch_service_locations */}
                            {newJobForm.address.trim() && (
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                                    {[['city', 'City *', 'Houston'], ['state', 'State', 'TX'], ['zip', 'Zip', '77006']].map(([k, lbl, ph]) => (
                                        <div key={k}>
                                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>{lbl}</label>
                                            <input value={newJobForm[k]}
                                                onChange={e => setNewJobForm(f => ({ ...f, [k]: e.target.value }))}
                                                placeholder={ph}
                                                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none' }} />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Row: Priority + Duration */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Priority</label>
                                    <select value={newJobForm.priority}
                                        onChange={e => setNewJobForm(f => ({ ...f, priority: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}>
                                        {PRIORITY_LABELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Duration (hrs)</label>
                                    <input type="number" min="0.5" max="24" step="0.5"
                                        value={newJobForm.durationHrs}
                                        onChange={e => setNewJobForm(f => ({ ...f, durationHrs: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none' }} />
                                </div>
                            </div>
                            {/* Row: Crew size + Scheduled date */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Crew Size</label>
                                    <input type="number" min="1" max="10"
                                        value={newJobForm.crewSize}
                                        onChange={e => setNewJobForm(f => ({ ...f, crewSize: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Scheduled Date</label>
                                    <input type="date"
                                        value={newJobForm.window}
                                        onChange={e => setNewJobForm(f => ({ ...f, window: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, boxSizing: 'border-box', outline: 'none' }} />
                                </div>
                            </div>
                            {/* Min licence + required skills — now persisted on the job */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Min License</label>
                                    <select value={newJobForm.minLicense}
                                        onChange={e => setNewJobForm(f => ({ ...f, minLicense: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}>
                                        {licLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                {skills.length > 0 && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Required Skills</label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                            {skills.map(s => {
                                                const on = (newJobForm.needSkills || []).includes(s.id);
                                                return (
                                                    <span key={s.id}
                                                        onClick={() => setNewJobForm(f => ({ ...f,
                                                            needSkills: on ? f.needSkills.filter(x => x !== s.id) : [...(f.needSkills || []), s.id] }))}
                                                        style={{ padding: '4px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 999,
                                                            border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.ink : 'transparent',
                                                            color: on ? T.surface : T.inkMid, fontFamily: T.sans }}>
                                                        {s.name}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Opportunity link (optional) */}
                            {(opportunities || []).filter(o => o.stage === 'Closed Won').length > 0 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Linked Opportunity (optional)</label>
                                    <select value={newJobForm.opportunityId}
                                        onChange={e => setNewJobForm(f => ({ ...f, opportunityId: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}>
                                        <option value="">— None —</option>
                                        {(opportunities || []).filter(o => o.stage === 'Closed Won').map(o => (
                                            <option key={o.id} value={o.id}>{o.opportunityName || o.account}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {/* Error */}
                            {newJobError && (
                                <div style={{ fontSize: 12, color: T.danger, fontWeight: 500 }}>{newJobError}</div>
                            )}
                        </div>
                        {/* Footer */}
                        <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowNewJobForm(false)}
                                style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 500, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                                Cancel
                            </button>
                            <button onClick={handleSaveNewJob} disabled={newJobSaving}
                                style={{ padding: '7px 18px', background: newJobSaving ? T.inkMuted : T.ink, border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 600, color: T.surface, cursor: newJobSaving ? 'not-allowed' : 'pointer', fontFamily: T.sans }}>
                                {newJobSaving ? 'Saving…' : 'Create Job'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
