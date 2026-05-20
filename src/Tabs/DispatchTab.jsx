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
const prioColor = (p) => ({ urgent: T.danger, standard: T.warn, low: T.inkMuted }[p] || T.inkMuted);

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
    const urgentUnassigned = unassignedJobs.filter(j => j.priority === 'urgent').length;
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

    const prioColor2 = (p) => ({ urgent: T.danger, standard: T.warn, low: T.inkMuted }[p] || T.inkMuted);

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

// ── MAIN DISPATCH TAB ─────────────────────────────────────────────────────────
export default function DispatchTab() {
    const { settings, opportunities } = useApp();

    const [view, setView] = useState('board'); // 'board' | 'queue'
    const [selectedJobId, setSelectedJobId] = useState(null);

    // ── DB-backed state ───────────────────────────────────────────────────────
    const [jobs,       setJobs]       = useState([]);
    const [techs,      setTechs]      = useState([]);
    const [vehicles,   setVehicles]   = useState([]);
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

                const [techsData, vehiclesData, equipData, custsData, jobsData] = await Promise.all([
                    techsRes.json(),
                    vehiclesRes.json(),
                    equipRes.json(),
                    custsRes.json(),
                    jobsRes.json(),
                ]);

                // Normalise technicians — map DB fields to what BoardView/CrewBuilder expect
                const dbTechs = (techsData.technicians || []).map(t => ({
                    id:             t.id,
                    name:           `${t.firstName} ${t.lastName}`.trim(),
                    firstName:      t.firstName,
                    lastName:       t.lastName,
                    email:          t.email,
                    phone:          t.phone,
                    license:        t.employmentType === 'subcontractor' ? 'Journeyman' : (t.skills?.[0] ? 'Journeyman' : 'Apprentice'),
                    dispatchSkills: t.skills        || [],
                    dispatchCerts:  t.certifications || [],
                    hoursThisWeek:  0, // calculated from jobs below
                    hoursCap:       40,
                    vehicle:        t.assignedVehicleId || null,
                    baseLocation:   t.homeZip || null,
                    status:         t.status,
                    employmentType: t.employmentType,
                    avatarInitials: t.avatarInitials || `${t.firstName?.[0] || ''}${t.lastName?.[0] || ''}`.toUpperCase(),
                }));

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
                setVehicles(vehiclesData.vehicles  || []);
                setEquipment(equipData.equipment   || []);
                setCustomers(custsData.customers   || []);
                setJobs([...normJobs, ...autoJobs]);
            } catch (err) {
                if (!cancelled) setLoadError('Failed to load dispatch data. Please refresh.');
                console.error('DispatchTab load error:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Apply filters ────────────────────────────────────────────────────────
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
                        {view === 'board' ? `Today · ${todayStr}` : 'Jobs to schedule'}
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
                        {[['board', 'Board'], ['queue', 'Queue']].map(([v, l], i) => (
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
                    <button style={{ padding: '6px 14px', background: T.ink, color: '#fbf8f3', border: 'none',
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
        </div>
    );
}
