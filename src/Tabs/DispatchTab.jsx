import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';
import { dbFetch, waitForToken } from '../utils/storage';
import TimeDropdown from '../components/ui/TimeDropdown.jsx';

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

// scheduledDate is a 'YYYY-MM-DD' varchar. Compare as strings and build dates
// from local parts — `new Date('2026-08-12')` parses as UTC and shifts a day in
// negative-offset timezones, which would put jobs on the wrong board column.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromYmd = (str) => { const [y, m, d] = String(str).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => addDays(d, -d.getDay());              // Sunday
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Inclusive date-range filter. Jobs with no scheduledDate are never in range —
// they belong in the unassigned tray, which stays unfiltered by design.
const jobsInRange = (jobs, fromStr, toStr) =>
    jobs.filter(j => j.scheduledDate && j.scheduledDate >= fromStr && j.scheduledDate <= toStr);
const LICENSE_ORDER = { Apprentice: 0, Journeyman: 1, Master: 2, Lead: 3 };
const fmt12 = (h) => h === 12 ? '12p' : h > 12 ? `${h-12}p` : `${h}a`;

// ── Priority color helper ─────────────────────────────────────────────────────
// Priority vocabulary — ONE set, matching the schema: low | normal | high | emergency.
// Three incompatible vocabularies previously coexisted (schema, these colour maps,
// and the create form), so every new consumer picked one at random. Stored values
// are normalised; legacy rows are translated on read by PRIORITY_ALIASES.
const PRIORITIES = [
    { label: 'Low',       value: 'low' },
    { label: 'Normal',    value: 'normal' },
    { label: 'High',      value: 'high' },
    { label: 'Emergency', value: 'emergency' },
];
// Legacy -> canonical. Applied at the read boundary only; nothing downstream
// should ever see 'urgent' or 'standard' again.
const PRIORITY_ALIASES = { urgent: 'emergency', standard: 'normal', medium: 'normal' };
const normalisePriority = (p) => PRIORITY_ALIASES[p] || p || 'normal';
const URGENT_PRIORITIES = ['emergency'];
const prioColor = (p) => ({ emergency: T.danger, high: T.warn, normal: T.inkMid, low: T.inkMuted }[normalisePriority(p)] || T.inkMuted);

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
        if (jobSkillIds.length > 0) why.push(`All skills${tech.license ? ` · ${tech.license}` : ''}`);
    } else {
        const missing = jobSkillIds.filter(s => !techSkillIds.has(s))
            .map(s => skills.find(sk => sk.id === s)?.name || s);
        blockers.push(`Missing skill · ${missing.join(', ')}`);
        score += (covered.length / jobSkillIds.length) * 20;
    }

    // License level (15pts). An unset licence BLOCKS any job that specifies a
    // minimum — an incomplete technician record must not dispatch someone to
    // work they may not be qualified for. The blocker names the real cause so
    // the dispatcher fixes the record rather than hunting a phantom mismatch.
    if (job.minLicense && !tech.license) {
        blockers.push(`License not set · job needs ${job.minLicense}`);
    } else if (job.minLicense) {
        const techLevel = LICENSE_ORDER[tech.license] ?? -1;
        const jobLevel  = LICENSE_ORDER[job.minLicense] ?? 0;
        if (techLevel >= jobLevel) {
            score += 15;
            why.push(`${tech.license} license`);
        } else {
            blockers.push(`License too low · need ${job.minLicense}`);
        }
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
                                            <span style={{ fontSize: 9, color: T.inkMuted, fontWeight: 600, flexShrink: 0 }}>{tech.license || '—'}</span>
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
const CrewBuilderView = ({ jobs, techs, skills, selectedJobId, onSelectJob, onBack, onScheduled }) => {
    const selectedJob = jobs.find(j => j.id === selectedJobId) || jobs.find(j => !j.start) || jobs[0];
    const [addedTechs, setAddedTechs] = useState({});
    // Pending override: { tech, blockers }. Assigning a blocked technician is a
    // deliberate act (licence, expired cert, over-hours, double-booking), so it
    // takes a confirmation that names the blockers rather than a single click.
    const [overridePrompt, setOverridePrompt] = useState(null);
    const [scheduleTime,   setScheduleTime]   = useState('');   // 'HH:MM'
    const [scheduleDate,   setScheduleDate]   = useState('');   // 'YYYY-MM-DD'
    const [scheduleError,  setScheduleError]  = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setAddedTechs({});
    }, [selectedJobId]);

    const candidates = useMemo(() => {
        if (!selectedJob) return [];
        return techs
            .map(t => ({ tech: t, ...scoreTech(t, selectedJob, jobs, skills) }))
            .filter(c => c.score >= 50)
            // Blocked candidates sort below every clean one regardless of score.
            // Score answers "how good a fit is this?"; blockers answer "may this
            // person work this job at all?" — a tech who is close by and free can
            // out-score a qualified one, which put an ineligible tech at the top.
            .sort((a, b) => {
                const aBlocked = a.blockers.length > 0, bBlocked = b.blockers.length > 0;
                if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;
                return b.score - a.score;
            })
            .slice(0, 5);
    }, [selectedJob, techs, jobs, skills]);

    // Persist the crew and record the assignment. The lead is the first tech
    // added; the rest become coTechIds (the schema is singular + co-techs, and
    // the read mapping already collapses both back into assignedTechIds).
    // Any tech added despite blockers is named in the audit detail — that is the
    // point of gating the override behind a confirmation.
    const handleSchedule = async () => {
        const addedIds = Object.entries(addedTechs).filter(([, v]) => v).map(([k]) => k);
        if (!selectedJob || addedIds.length === 0) return;
        const dateStr = scheduleDate || selectedJob.scheduledDate || '';
        if (!dateStr)      { setScheduleError('Set a date before scheduling.'); return; }
        if (!scheduleTime) { setScheduleError('Set a start time before scheduling.'); return; }

        setScheduleError('');
        setSaving(true);
        try {
            const [leadId, ...coIds] = addedIds;
            const durMin   = Math.round((selectedJob.durationHrs || 2) * 60);
            const [hh, mm] = scheduleTime.split(':').map(Number);
            const endMins  = hh * 60 + mm + durMin;
            const endStr   = `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

            const res = await dbFetch('/.netlify/functions/dispatch-jobs?id=' + encodeURIComponent(selectedJob.id), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id:             selectedJob.id,
                    status:         'scheduled',
                    assignedTechId: leadId,
                    coTechIds:      coIds,
                    scheduledDate:  dateStr,
                    scheduledStart: scheduleTime,
                    scheduledEnd:   endStr,
                    timeSlot:       'exact',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 403) throw new Error('Your role cannot schedule jobs.');
                throw new Error(data.error || ('HTTP ' + res.status));
            }

            // Blockers ignored by an explicit override, named for the audit trail.
            const overridden = candidates
                .filter(c => addedIds.includes(c.tech.id) && c.blockers.length > 0)
                .map(c => `${c.tech.name}: ${c.blockers.join('; ')}`);
            const crewNames = addedIds.map(id => techs.find(t => t.id === id)?.name || id);

            // The parent owns jobs state and the audit logger.
            onScheduled({
                jobId:     selectedJob.id,
                jobName:   selectedJob.title || selectedJob.customer,
                techIds:   addedIds,
                crewNames,
                startHr:   hh + mm / 60,
                startTime: scheduleTime,
                startDate: dateStr,
                overridden,
            });

            setAddedTechs({});
            setScheduleTime('');
            setScheduleDate('');
        } catch (e) {
            setScheduleError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const crewSlots = selectedJob?.crewSize || 2;
    const addedCount = Object.values(addedTechs).filter(Boolean).length;
    const unscheduledJobs = jobs.filter(j => !j.start || (j.assignedTechIds || []).length === 0);
    const scheduledJobs = jobs.filter(j => j.start && (j.assignedTechIds || []).length > 0);
    const overbooking = techs.some(t => (t.hoursThisWeek || 0) > (t.hoursCap || 40));

    const prioColor2 = prioColor;   // kept as an alias for existing call sites

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
                                // Blockers are authoritative. Previously this was score-only,
                                // so a blocked tech scoring >= 70 got the normal "+ Add"
                                // button — the warning rendered but nothing enforced it.
                                // Applies to missing skills, expired certs, over-hours and
                                // double-booking too, not just licence.
                                const canAdd = c.blockers.length === 0 && c.score >= 70;
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
                                                    {c.tech.license || 'No licence'} · {c.tech.vehicle || 'No vehicle'}
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
                                                <button onClick={() => setOverridePrompt({ tech: c.tech, blockers: c.blockers })}
                                                    style={{ padding: '5px 12px', background: 'transparent', color: T.warn,
                                                        border: `1px solid ${T.warn}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                                    Override
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {overridePrompt && (
                                <div onClick={() => setOverridePrompt(null)}
                                    style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', zIndex: 99998,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div onClick={e => e.stopPropagation()}
                                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
                                            padding: 20, width: 420, maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: T.danger, fontFamily: T.sans, marginBottom: 8 }}>
                                            Assign anyway?
                                        </div>
                                        <div style={{ fontSize: 13, color: T.inkMid, fontFamily: T.sans, lineHeight: 1.55, marginBottom: 12 }}>
                                            <strong>{overridePrompt.tech.name}</strong> does not meet the requirements for this job:
                                        </div>
                                        <ul style={{ margin: '0 0 14px 0', paddingLeft: 18 }}>
                                            {overridePrompt.blockers.map((b, bi) => (
                                                <li key={bi} style={{ fontSize: 12.5, color: T.danger, fontFamily: T.sans, marginBottom: 4 }}>{b}</li>
                                            ))}
                                        </ul>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                            <button onClick={() => setOverridePrompt(null)}
                                                style={{ padding: '7px 14px', background: 'transparent', color: T.inkMid,
                                                    border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                                Cancel
                                            </button>
                                            <button onClick={() => {
                                                    setAddedTechs(prev => ({ ...prev, [overridePrompt.tech.id]: true }));
                                                    setOverridePrompt(null);
                                                }}
                                                style={{ padding: '7px 14px', background: T.danger, color: '#fbf8f3',
                                                    border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                                Override and assign
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                            {addedCount > 0 && (
                                <span style={{ fontSize: 11.5, color: T.warn, fontWeight: 600, fontFamily: T.sans }}>
                                    {addedCount}/{crewSlots} added — not scheduled yet
                                </span>
                            )}
                            {scheduleError && (
                                <span style={{ fontSize: 11.5, color: T.danger, fontWeight: 600, fontFamily: T.sans }}>{scheduleError}</span>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.inkMid, fontFamily: T.sans }}>
                                <span>Date</span>
                                <input type="date"
                                    value={scheduleDate || selectedJob.scheduledDate || ''}
                                    onChange={e => { setScheduleDate(e.target.value); setScheduleError(''); }}
                                    style={{ padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r,
                                        fontSize: 12.5, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}/>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.inkMid, fontFamily: T.sans }}>
                                <span>Start</span>
                                <div style={{ width: 132 }}>
                                    <TimeDropdown
                                        value={scheduleTime}
                                        onChange={v => { setScheduleTime(v || ''); setScheduleError(''); }}
                                        stepMinutes={30}
                                        ariaLabel="Crew start time"/>
                                </div>
                            </div>
                            {/* SMS is stubbed until the Twilio A2P campaign clears carrier review.
                                Scheduling persists regardless; notification is a separate step. */}
                            <button disabled title="SMS notification is not enabled yet"
                                style={{ padding: '7px 14px', background: T.surface, border: `1px solid ${T.border}`,
                                    borderRadius: T.r, fontSize: 12.5, fontWeight: 500, color: T.inkMuted, cursor: 'default', fontFamily: T.sans }}>
                                Notify techs (SMS)
                            </button>
                            <button disabled={addedCount === 0 || saving} onClick={handleSchedule}
                                style={{ padding: '7px 16px', background: (addedCount > 0 && !saving) ? T.ink : T.borderStrong,
                                    color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                                    cursor: (addedCount > 0 && !saving) ? 'pointer' : 'default', fontFamily: T.sans, transition: 'background 120ms' }}>
                                {saving ? 'Scheduling…' : addedCount > 0 ? `Schedule crew (${addedCount})` : 'Schedule crew'}
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
    // The stored credential, never inferred. This used to be fabricated from
    // employmentType/skills, which silently promoted a tech with one skill to
    // Journeyman and demoted a real Master with none — while the board matched
    // job eligibility against that invented value.
    license:        t.licenseLevel || null,
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


// ── Week board: technician rows x 7 day columns ───────────────────────────────
// Keeps the "who is loaded" read of the day board. An hour axis does not extend
// to a week (12 columns becomes 84), so the cell is the unit instead of the hour.
const WeekBoardView = ({ jobs, techs, skills, anchor, onJobClick }) => {
    const weekStart = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const todayStr = ymd(new Date());
    const RAIL_W = 190;

    return (
        <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3,
                background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: RAIL_W, flexShrink: 0, borderRight: `1px solid ${T.border}` }}/>
                {days.map(d => {
                    const ds = ymd(d);
                    return (
                        <div key={ds} style={{ flex: 1, minWidth: 120, padding: '7px 0', textAlign: 'center',
                            borderRight: `1px solid ${T.border}`,
                            background: ds === todayStr ? `${T.gold}22` : 'transparent' }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, fontFamily: T.sans,
                                textTransform: 'uppercase', letterSpacing: 0.5 }}>{DOW[d.getDay()]}</div>
                            <div style={{ fontSize: 13, fontWeight: ds === todayStr ? 700 : 500, color: T.ink, fontFamily: T.sans }}>
                                {d.getDate()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {techs.length === 0 && (
                <div style={{ padding: 24, fontSize: 13, color: T.inkMuted, fontFamily: T.sans, fontStyle: 'italic' }}>
                    No technicians yet.
                </div>
            )}

            {/* Jobs with a date but no crew. Week renders jobs inside technician
                rows, so without this row an uncrewed job is invisible here while
                still showing in the month grid — the two views disagreed. */}
            {(() => {
                const uncrewed = jobs.filter(j => (j.assignedTechIds || []).length === 0);
                if (uncrewed.length === 0) return null;
                return (
                    <div style={{ display: 'flex', borderBottom: `2px solid ${T.borderStrong}`, minHeight: 68, background: `${T.warn}0a` }}>
                        <div style={{ width: RAIL_W, flexShrink: 0, borderRight: `1px solid ${T.border}`, padding: '10px 12px' }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.warn, fontFamily: T.sans }}>Needs a crew</div>
                            <div style={{ fontSize: 10.5, fontFamily: T.mono, color: T.inkMuted }}>
                                {uncrewed.length} job{uncrewed.length === 1 ? '' : 's'}
                            </div>
                        </div>
                        {days.map(d => {
                            const ds = ymd(d);
                            const cellJobs = uncrewed.filter(j => j.scheduledDate === ds);
                            return (
                                <div key={ds} style={{ flex: 1, minWidth: 120, borderRight: `1px solid ${T.border}`,
                                    padding: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {cellJobs.map(j => (
                                        <div key={j.id} onClick={() => onJobClick(j)}
                                            style={{ padding: '4px 6px', borderRadius: T.r, cursor: 'pointer',
                                                background: T.surface, border: `1px dashed ${T.warn}` }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, fontFamily: T.sans,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {j.title || j.customer}
                                            </div>
                                            <div style={{ fontSize: 10, color: T.warn, fontFamily: T.sans }}>Build crew →</div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                );
            })()}

            {techs.map(tech => {
                const techJobs = jobs.filter(j => (j.assignedTechIds || []).includes(tech.id));
                const weekHours = techJobs.reduce((sum, j) => sum + (j.durationHrs || 0), 0);
                const cap = tech.hoursCap || 40;
                return (
                    <div key={tech.id} style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, minHeight: 68 }}>
                        <div style={{ width: RAIL_W, flexShrink: 0, borderRight: `1px solid ${T.border}`,
                            padding: '10px 12px', background: T.surface }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{tech.name}</div>
                            <div style={{ fontSize: 10.5, fontFamily: T.mono,
                                color: weekHours > cap ? T.danger : T.inkMuted }}>
                                {Math.round(weekHours * 10) / 10}/{cap} hrs
                            </div>
                        </div>
                        {days.map(d => {
                            const ds = ymd(d);
                            const cellJobs = techJobs.filter(j => j.scheduledDate === ds);
                            return (
                                <div key={ds} style={{ flex: 1, minWidth: 120, borderRight: `1px solid ${T.border}`,
                                    padding: 5, display: 'flex', flexDirection: 'column', gap: 4,
                                    background: ds === todayStr ? `${T.gold}12` : 'transparent' }}>
                                    {cellJobs.map(j => (
                                        <div key={j.id} onClick={() => onJobClick(j)}
                                            style={{ padding: '4px 6px', borderRadius: T.r, cursor: 'pointer',
                                                background: T.surface2, borderLeft: `3px solid ${prioColor(j.priority)}` }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, fontFamily: T.sans,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {j.title || j.customer}
                                            </div>
                                            <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.mono }}>
                                                {j.start != null ? fmt12(Math.floor(j.start)) : 'TBD'} · {j.durationHrs || 0}h
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};

// ── Month board: calendar grid ────────────────────────────────────────────────
// Per-tech rows are unreadable at month scale, so this drops that dimension.
// The question changes from "who is free" to "how heavy is that week".
const MonthBoardView = ({ jobs, techs, anchor, onJobClick, onPickDay }) => {
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const weeks = 6;
    const todayStr = ymd(new Date());
    const monthIdx = anchor.getMonth();

    return (
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: T.border }}>
                {DOW.map(d => (
                    <div key={d} style={{ background: T.surface, padding: '6px 0', textAlign: 'center',
                        fontSize: 10.5, fontWeight: 700, color: T.inkMuted, fontFamily: T.sans,
                        textTransform: 'uppercase', letterSpacing: 0.5 }}>{d}</div>
                ))}
                {Array.from({ length: weeks * 7 }, (_, i) => {
                    const d = addDays(gridStart, i);
                    const ds = ymd(d);
                    const dayJobs = jobs.filter(j => j.scheduledDate === ds);
                    const outside = d.getMonth() !== monthIdx;
                    const hours = dayJobs.reduce((sum, j) => sum + (j.durationHrs || 0), 0);
                    return (
                        <div key={ds} onClick={() => onPickDay && onPickDay(ds)}
                            style={{ background: T.surface, minHeight: 92, padding: 6, cursor: 'pointer',
                                opacity: outside ? 0.45 : 1,
                                outline: ds === todayStr ? `2px solid ${T.gold}` : 'none', outlineOffset: -2 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: ds === todayStr ? 700 : 500, color: T.ink, fontFamily: T.sans }}>
                                    {d.getDate()}
                                </span>
                                {dayJobs.length > 0 && (
                                    <span style={{ fontSize: 9.5, fontFamily: T.mono, color: T.inkMuted }}>
                                        {dayJobs.length} · {Math.round(hours * 10) / 10}h
                                    </span>
                                )}
                            </div>
                            {dayJobs.slice(0, 2).map(j => (
                                <div key={j.id} onClick={e => { e.stopPropagation(); onJobClick(j); }}
                                    style={{ padding: '2px 5px', marginBottom: 3, borderRadius: T.r,
                                        background: T.surface2, borderLeft: `3px solid ${prioColor(j.priority)}`,
                                        fontSize: 10.5, color: T.ink, fontFamily: T.sans,
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {j.title || j.customer}
                                </div>
                            ))}
                            {dayJobs.length > 2 && (
                                <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>
                                    +{dayJobs.length - 2} more
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

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

const TechniciansView = ({ techsRaw, users, vehicles, skills, certs, licenseLevels, onSaved }) => {
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
                                {!t.licenseLevel && (
                                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.danger}14`, color: T.danger, fontWeight: 700 }}>no license</span>
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

                        <CustFieldRow label="License level">
                            <select value={draft.licenseLevel || ''} onChange={e => set('licenseLevel', e.target.value)} style={custInput}>
                                <option value="">— Not set —</option>
                                {(licenseLevels || []).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                {draft.licenseLevel
                                    ? 'Matched against each job\u2019s minimum licence requirement.'
                                    : 'Unset — this technician is blocked from any job that specifies a minimum licence.'}
                            </div>
                        </CustFieldRow>

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

                        {/* Skills and certifications are always shown. Hiding them when the
                            catalogue is empty made it look as though there was nowhere to set
                            them; the empty state now says where the catalogue is configured. */}
                        <CustFieldRow label="Skills">
                            {(skills || []).length === 0 ? (
                                <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                                    No skills defined yet — add them under Settings → Dispatch → Skills &amp; certifications.
                                </div>
                            ) : (
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
                            )}
                        </CustFieldRow>

                        <CustFieldRow label="Certifications">
                            {(certs || []).length === 0 ? (
                                <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                                    No certifications defined yet — add them under Settings → Dispatch → Skills &amp; certifications.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    {(certs || []).map(c => {
                                        const on = (draft.certifications || []).includes(c.id);
                                        return (
                                            <span key={c.id}
                                                onClick={() => set('certifications', on
                                                    ? (draft.certifications || []).filter(x => x !== c.id)
                                                    : [...(draft.certifications || []), c.id])}
                                                style={{ padding: '4px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 999,
                                                    border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.ink : 'transparent',
                                                    color: on ? T.surface : T.inkMid, fontFamily: T.sans }}>
                                                {c.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </CustFieldRow>

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


// ── Jobs view ─────────────────────────────────────────────────────────────────
// Every job, editable. Until now a job could be created and crewed but never
// corrected — priority, title, duration, crew size, licence, skills and the
// service address were all frozen after create, even though the PUT endpoint
// supported all of them.
//
// Address lives on dispatch_service_locations (the job only holds locationId),
// so saving an address is create-or-update on that row. Editing an address that
// other jobs share updates it for all of them — that is usually the intent (the
// site address was wrong), and the UI says so.
const JOB_STATUSES = ['unscheduled', 'scheduled', 'en_route', 'on_site', 'paused', 'completed', 'cancelled'];

// Types are scoped to a category. A type with no categoryId is shared and shows
// under every category, so partially-categorised lists still work.
const typesForCategory = (allTypes, categoryId) =>
    (allTypes || []).filter(t => !t.categoryId || t.categoryId === categoryId);

const JobsView = ({ jobsRaw, customers, techs, skills, licenseLevels, categories, jobTypes, onSaved }) => {
    const [query,      setQuery]      = React.useState('');
    const [statusFilt, setStatusFilt] = React.useState('all');
    const [selectedId, setSelectedId] = React.useState(null);
    const [draft,      setDraft]      = React.useState(null);
    const [loc,        setLoc]        = React.useState(null);   // { id, address, city, state, zip }
    const [saving,     setSaving]     = React.useState(false);
    const [status,     setStatus]     = React.useState(null);

    const q = query.trim().toLowerCase();
    const list = (jobsRaw || [])
        .filter(j => statusFilt === 'all' || j.status === statusFilt)
        .filter(j => !q
            || (j.title || '').toLowerCase().includes(q)
            || (j.jobNumber || '').toLowerCase().includes(q))
        .slice()
        .sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || ''));

    const selected = (jobsRaw || []).find(j => j.id === selectedId) || null;

    React.useEffect(() => {
        setDraft(selected ? { ...selected } : null);
        setStatus(null);
        setLoc(null);
        if (!selected) return;
        let cancelled = false;
        (async () => {
            if (!selected.customerId) return;
            try {
                const res = await dbFetch('/.netlify/functions/dispatch-customers?resource=locations&customerId=' + encodeURIComponent(selected.customerId));
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const match = (data.locations || []).find(l => l.id === selected.locationId) || null;
                setLoc(match ? { ...match } : { id: null, address: '', city: '', state: '', zip: '' });
            } catch (e) { /* address panel stays hidden */ }
        })();
        return () => { cancelled = true; };
    }, [selectedId]);   // eslint-disable-line react-hooks/exhaustive-deps

    const set    = (k, v) => setDraft(d => ({ ...d, [k]: v }));
    const setLocF = (k, v) => setLoc(l => ({ ...(l || {}), [k]: v }));

    const customerName = (id) => (customers || []).find(c => c.id === id)?.name || '—';

    const save = async () => {
        if (!draft) return;
        if (!(draft.title || '').trim()) { setStatus({ kind: 'err', msg: 'Title is required.' }); return; }
        if (loc && (loc.address || '').trim() && !(loc.city || '').trim()) {
            setStatus({ kind: 'err', msg: 'City is required when an address is set.' }); return;
        }
        setSaving(true); setStatus(null);
        try {
            let locationId = draft.locationId || null;

            // 1 — address, when one has been entered or changed
            if (loc && (loc.address || '').trim()) {
                const locId = loc.id || ('dloc_' + crypto.randomUUID());
                const lres = await dbFetch('/.netlify/functions/dispatch-customers?resource=locations'
                    + (loc.id ? '&id=' + encodeURIComponent(loc.id) : ''), {
                    method: loc.id ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: locId, customerId: draft.customerId,
                        name: loc.address.trim(), address: loc.address.trim(),
                        city: (loc.city || '').trim(),
                        state: (loc.state || '').trim() || null,
                        zip: (loc.zip || '').trim() || null,
                    }),
                });
                const ldata = await lres.json().catch(() => ({}));
                if (!lres.ok) throw new Error(ldata.error || 'Could not save the address.');
                locationId = ldata.location?.id || locId;
            }

            // 2 — the job
            const res = await dbFetch('/.netlify/functions/dispatch-jobs?id=' + encodeURIComponent(draft.id), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id:              draft.id,
                    title:           draft.title.trim(),
                    description:     draft.description || null,
                    priority:        draft.priority || 'normal',
                    status:          draft.status || 'unscheduled',
                    jobType:         draft.jobType || null,
                    trade:           draft.trade   || null,
                    durationMinutes: Math.round((parseFloat(draft.durationHrs ?? ((draft.durationMinutes || 120) / 60)) || 2) * 60),
                    crewSize:        parseInt(draft.crewSize, 10) || 1,
                    minLicense:      draft.minLicense || null,
                    needSkills:      draft.needSkills || [],
                    scheduledDate:   draft.scheduledDate || null,
                    locationId,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 403) throw new Error('Your role cannot edit jobs.');
                throw new Error(data.error || ('HTTP ' + res.status));
            }
            if (data.job) { onSaved(data.job); setSelectedId(data.job.id); }
            setStatus({ kind: 'ok', msg: 'Saved' });
        } catch (e) {
            setStatus({ kind: 'err', msg: e.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            <div style={{ width: 320, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', background: T.surface }}>
                <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title or job number"
                        style={{ ...custInput, padding: '7px 9px', fontSize: 12.5 }}/>
                    <select value={statusFilt} onChange={e => setStatusFilt(e.target.value)}
                        style={{ ...custInput, padding: '6px 9px', fontSize: 12 }}>
                        <option value="all">All statuses</option>
                        {JOB_STATUSES.map(s2 => <option key={s2} value={s2}>{s2.replace('_', ' ')}</option>)}
                    </select>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {list.length === 0 && (
                        <div style={{ padding: 16, fontSize: 12.5, color: T.inkMuted, fontFamily: T.sans }}>No jobs match.</div>
                    )}
                    {list.map(j => (
                        <div key={j.id} onClick={() => setSelectedId(j.id)}
                            style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                                borderLeft: `3px solid ${prioColor(j.priority)}`,
                                background: j.id === selectedId ? T.surface2 : 'transparent' }}>
                            <div style={{ fontSize: 13, fontWeight: j.id === selectedId ? 700 : 500, color: T.ink, fontFamily: T.sans }}>
                                {j.title}
                            </div>
                            <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans, marginTop: 2 }}>
                                {customerName(j.customerId)} · {j.scheduledDate || 'unscheduled'}
                            </div>
                            <div style={{ marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                    background: `${prioColor(j.priority)}18`, color: prioColor(j.priority), fontWeight: 700 }}>
                                    {normalisePriority(j.priority)}
                                </span>
                                <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{(j.status || '').replace('_', ' ')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {!draft ? (
                    <div style={{ fontSize: 13, color: T.inkMuted, fontFamily: T.sans }}>Select a job to edit.</div>
                ) : (
                    <div style={{ maxWidth: 640 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                            <span style={{ fontSize: 20, fontStyle: 'italic', fontWeight: 300, color: T.ink, fontFamily: T.serif }}>
                                {draft.title}
                            </span>
                            {draft.jobNumber && (
                                <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.mono }}>{draft.jobNumber}</span>
                            )}
                        </div>

                        <CustFieldRow label="Title *">
                            <input value={draft.title || ''} onChange={e => set('title', e.target.value)} style={custInput}/>
                        </CustFieldRow>

                        <CustFieldRow label="Customer">
                            <div style={{ ...custInput, background: T.surface2, color: T.inkMid }}>
                                {customerName(draft.customerId)}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                The customer cannot be changed after creation — create a new job instead.
                            </div>
                        </CustFieldRow>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="Job category">
                                <select value={draft.trade || ''}
                                    onChange={e => {
                                        const cid = e.target.value;
                                        // Clear a type that does not belong to the new category.
                                        const stillValid = typesForCategory(jobTypes, cid).some(t => t.id === draft.jobType);
                                        setDraft(d => ({ ...d, trade: cid, jobType: stillValid ? d.jobType : '' }));
                                    }}
                                    style={custInput}>
                                    <option value="">— None —</option>
                                    {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </CustFieldRow>
                            <CustFieldRow label="Job type">
                                <select value={draft.jobType || ''} onChange={e => set('jobType', e.target.value)} style={custInput}>
                                    <option value="">— None —</option>
                                    {typesForCategory(jobTypes, draft.trade).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                {(categories || []).length === 0 && (
                                    <div style={{ marginTop: 4, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                        Define these under Settings → Dispatch → Job categories &amp; types.
                                    </div>
                                )}
                            </CustFieldRow>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="Priority">
                                <select value={normalisePriority(draft.priority)} onChange={e => set('priority', e.target.value)} style={custInput}>
                                    {PRIORITIES.map(pp => <option key={pp.value} value={pp.value}>{pp.label}</option>)}
                                </select>
                            </CustFieldRow>
                            <CustFieldRow label="Status">
                                <select value={draft.status || 'unscheduled'} onChange={e => set('status', e.target.value)} style={custInput}>
                                    {JOB_STATUSES.map(s2 => <option key={s2} value={s2}>{s2.replace('_', ' ')}</option>)}
                                </select>
                            </CustFieldRow>
                            <CustFieldRow label="Scheduled date">
                                <input type="date" value={draft.scheduledDate || ''} onChange={e => set('scheduledDate', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="Duration (hrs)">
                                <input type="number" step="0.5" min="0.5"
                                    value={draft.durationHrs ?? ((draft.durationMinutes || 120) / 60)}
                                    onChange={e => set('durationHrs', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                            <CustFieldRow label="Crew size">
                                <input type="number" min="1" value={draft.crewSize ?? 1}
                                    onChange={e => set('crewSize', e.target.value)} style={custInput}/>
                            </CustFieldRow>
                            <CustFieldRow label="Min license">
                                <select value={draft.minLicense || ''} onChange={e => set('minLicense', e.target.value)} style={custInput}>
                                    <option value="">— None —</option>
                                    {(licenseLevels || []).map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </CustFieldRow>
                        </div>

                        <CustFieldRow label="Required skills">
                            {(skills || []).length === 0 ? (
                                <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                                    No skills defined yet — add them under Settings → Dispatch.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    {(skills || []).map(sk => {
                                        const on = (draft.needSkills || []).includes(sk.id);
                                        return (
                                            <span key={sk.id}
                                                onClick={() => set('needSkills', on
                                                    ? (draft.needSkills || []).filter(x => x !== sk.id)
                                                    : [...(draft.needSkills || []), sk.id])}
                                                style={{ padding: '4px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 999,
                                                    border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.ink : 'transparent',
                                                    color: on ? T.surface : T.inkMid, fontFamily: T.sans }}>
                                                {sk.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </CustFieldRow>

                        <CustFieldRow label="Description">
                            <textarea value={draft.description || ''} onChange={e => set('description', e.target.value)} rows={3}
                                style={{ ...custInput, resize: 'vertical' }}/>
                        </CustFieldRow>

                        {loc && (
                            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, padding: 12, marginBottom: 14 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase',
                                    letterSpacing: 0.6, marginBottom: 8, fontFamily: T.sans }}>Service address</div>
                                <CustFieldRow label="Street">
                                    <input value={loc.address || ''} onChange={e => setLocF('address', e.target.value)} style={custInput}/>
                                </CustFieldRow>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                                    <CustFieldRow label="City *">
                                        <input value={loc.city || ''} onChange={e => setLocF('city', e.target.value)} style={custInput}/>
                                    </CustFieldRow>
                                    <CustFieldRow label="State">
                                        <input value={loc.state || ''} onChange={e => setLocF('state', e.target.value)} style={custInput}/>
                                    </CustFieldRow>
                                    <CustFieldRow label="Zip">
                                        <input value={loc.zip || ''} onChange={e => setLocF('zip', e.target.value)} style={custInput}/>
                                    </CustFieldRow>
                                </div>
                                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                    This is the customer's service location. Other jobs at the same location will see the change too.
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button onClick={save} disabled={saving}
                                style={{ padding: '8px 18px', background: saving ? T.inkMuted : T.ink, color: T.surface,
                                    border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 600,
                                    cursor: saving ? 'default' : 'pointer', fontFamily: T.sans }}>
                                {saving ? 'Saving…' : 'Save changes'}
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
    const { settings, opportunities, accounts, addAudit } = useApp();

    const [view, setView] = useState('board'); // 'board' | 'queue'
    const [selectedJobId, setSelectedJobId] = useState(null);
    const [boardRange,   setBoardRange]   = useState('today');   // 'today' | 'week' | 'month'
    const [boardAnchor,  setBoardAnchor]  = useState(() => new Date());

    // ── New Job form state ────────────────────────────────────────────────────
    const [showNewJobForm, setShowNewJobForm] = useState(false);
    const [newJobSaving,   setNewJobSaving]   = useState(false);
    const [newJobError,    setNewJobError]    = useState('');
    // customerId is the FK the server requires; `customer` is only the typed text.
    const EMPTY_JOB = { customer: '', customerId: '', accountId: '', title: '', trade: '', jobType: '', address: '', city: '', state: '', zip: '',
        window: '', priority: 'normal', crewSize: 1, durationHrs: 2, minLicense: 'Journeyman',
        opportunityId: '', needSkills: [] };
    const [newJobForm, setNewJobForm] = useState(EMPTY_JOB);

    // ── DB-backed state ───────────────────────────────────────────────────────
    const [jobs,       setJobs]       = useState([]);
    const [techs,      setTechs]      = useState([]);
    const [vehicles,   setVehicles]   = useState([]);
    // Raw technician rows (userId, rates, notes) for the Technicians editor.
    const [techsRaw,   setTechsRaw]   = useState([]);
    const [jobsRaw,    setJobsRaw]    = useState([]);
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
                        needSkills:     j.needSkills || [],
                        crewSize:       j.crewSize || ([j.assignedTechId, ...(j.coTechIds || [])].filter(Boolean).length || 1),
                        durationHrs:    j.durationMinutes ? j.durationMinutes / 60 : 2,
                        priority:       normalisePriority(j.priority),
                        window:         j.timeSlot === 'exact' && j.scheduledStart
                            ? j.scheduledStart
                            : j.scheduledDate || 'TBD',
                        equipment:      (j.equipmentIds || []).join(', '),
                        value:          parseFloat(j.invoiceAmount || 0),
                        // Was hardcoded 'Journeyman', discarding the stored requirement —
                        // so every licence blocker compared against a constant.
                        minLicense:     j.minLicense || null,
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
                        priority:       'normal',
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
                setJobsRaw(dbJobs);
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
                trade:           newJobForm.trade   || null,
                jobType:         newJobForm.jobType || null,
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

    const navBtn = { padding: '4px 8px', background: 'transparent', border: `1px solid ${T.border}`,
        borderRadius: T.r, fontSize: 13, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans, lineHeight: 1 };

    // Range window. The board previously showed every job with a start time
    // regardless of date, so "Today" was a label rather than a filter.
    const [rangeFrom, rangeTo] = useMemo(() => {
        if (boardRange === 'today') { const d = ymd(boardAnchor); return [d, d]; }
        if (boardRange === 'week')  { const s0 = startOfWeek(boardAnchor); return [ymd(s0), ymd(addDays(s0, 6))]; }
        const s0 = startOfMonth(boardAnchor);
        return [ymd(s0), ymd(new Date(boardAnchor.getFullYear(), boardAnchor.getMonth() + 1, 0))];
    }, [boardRange, boardAnchor]);

    const rangeJobs = useMemo(() => jobsInRange(filteredJobs, rangeFrom, rangeTo), [filteredJobs, rangeFrom, rangeTo]);

    // The day board also needs the unassigned tray, which stays unfiltered by
    // design — an unscheduled job has no date to filter on.
    const boardJobs = useMemo(
        () => [...rangeJobs, ...filteredJobs.filter(j => !j.scheduledDate || !j.start || (j.assignedTechIds || []).length === 0)],
        [rangeJobs, filteredJobs]);

    const boardRangeLabel = useMemo(() => {
        const opts = { month: 'short', day: 'numeric' };
        if (boardRange === 'today') return boardAnchor.toLocaleDateString('en-US', { weekday: 'short', ...opts });
        if (boardRange === 'week')  return `${fromYmd(rangeFrom).toLocaleDateString('en-US', opts)} – ${fromYmd(rangeTo).toLocaleDateString('en-US', opts)}`;
        return boardAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, [boardRange, boardAnchor, rangeFrom, rangeTo]);
    const unscheduled = jobs.filter(j => !j.start || (j.assignedTechIds || []).length === 0).length;
    const urgentUnassigned = jobs.filter(j => URGENT_PRIORITIES.includes(j.priority) && (!j.start || (j.assignedTechIds || []).length === 0)).length;

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
                        {view === 'board' ? boardRangeLabel : view === 'queue' ? 'Jobs to schedule' : view === 'techs' ? `${techsRaw.length} technician${techsRaw.length === 1 ? '' : 's'}` : `${customers.length} dispatch customer${customers.length === 1 ? '' : 's'}`}
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

            {/* Sub-tabs — same underline treatment as Quotes, Reports and Sales Manager */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 12, flexShrink: 0 }}>
                {[
                    { id: 'board',     label: 'Board' },
                    { id: 'queue',     label: 'Queue' },
                    { id: 'jobs',      label: 'Jobs' },
                    { id: 'customers', label: 'Customers' },
                    { id: 'techs',     label: 'Technicians' },
                ].map(v => {
                    const active = view === v.id;
                    return (
                        <button key={v.id} onClick={() => setView(v.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 16px',
                                border: 'none', borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent',
                                background: 'transparent', color: active ? T.ink : T.inkMuted,
                                fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: T.sans,
                                transition: 'color 120ms, border-color 120ms', whiteSpace: 'nowrap', marginBottom: -1 }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                            {v.label}
                        </button>
                    );
                })}
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
                            {[['Emergency', T.danger], ['High', T.warn], ['Normal', T.inkMid], ['Low', T.inkMuted]].map(([l, c]) => (
                                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }}/>
                                    {l}
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
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                            borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                            <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                {[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([r, label], i) => (
                                    <button key={r} onClick={() => { setBoardRange(r); setBoardAnchor(new Date()); }}
                                        style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            fontFamily: T.sans, border: 'none',
                                            borderLeft: i ? `1px solid ${T.border}` : 'none',
                                            background: boardRange === r ? T.ink : 'transparent',
                                            color: boardRange === r ? T.surface : T.inkMid }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setBoardAnchor(a => addDays(a, boardRange === 'today' ? -1 : boardRange === 'week' ? -7 : -30))}
                                style={navBtn}>‹</button>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans, minWidth: 170 }}>
                                {boardRangeLabel}
                            </span>
                            <button onClick={() => setBoardAnchor(a => addDays(a, boardRange === 'today' ? 1 : boardRange === 'week' ? 7 : 30))}
                                style={navBtn}>›</button>
                            {ymd(boardAnchor) !== ymd(new Date()) && (
                                <button onClick={() => setBoardAnchor(new Date())} style={{ ...navBtn, width: 'auto', padding: '4px 10px' }}>
                                    Today
                                </button>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                                {rangeJobs.length} scheduled in view
                            </span>
                        </div>
                        {boardRange === 'today' ? (
                            <BoardView jobs={boardJobs} techs={filteredTechs} skills={skills} onJobClick={handleJobClick}/>
                        ) : boardRange === 'week' ? (
                            <WeekBoardView jobs={rangeJobs} techs={filteredTechs} skills={skills}
                                anchor={boardAnchor} onJobClick={handleJobClick}/>
                        ) : (
                            <MonthBoardView jobs={rangeJobs} techs={filteredTechs}
                                anchor={boardAnchor} onJobClick={handleJobClick}
                                onPickDay={ds => { setBoardAnchor(fromYmd(ds)); setBoardRange('today'); }}/>
                        )}
                    </div>
                ) : view === 'jobs' ? (
                    <JobsView jobsRaw={jobsRaw} customers={customers} techs={techs} skills={skills}
                        licenseLevels={licLevels}
                        categories={settings?.dispatchTrades || []}
                        jobTypes={settings?.dispatchJobTypes || []}
                        onSaved={saved => {
                            setJobsRaw(prev => prev.map(j => j.id === saved.id ? saved : j));
                            // Keep the board in step without a reload.
                            setJobs(prev => prev.map(j => j.id === saved.id
                                ? { ...j, title: saved.title, priority: normalisePriority(saved.priority),
                                    status: saved.status, scheduledDate: saved.scheduledDate,
                                    durationHrs: (saved.durationMinutes || 120) / 60,
                                    crewSize: saved.crewSize || j.crewSize,
                                    minLicense: saved.minLicense || null,
                                    needSkills: saved.needSkills || [] }
                                : j));
                        }}/>
                ) : view === 'techs' ? (
                    <TechniciansView techsRaw={techsRaw} users={settings?.users || []}
                        vehicles={vehicles} skills={skills} certs={settings?.dispatchCerts || []} licenseLevels={licLevels}
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
                        onBack={() => setView('board')}
                        onScheduled={({ jobId, jobName, techIds, crewNames, startHr, startTime, startDate, overridden }) => {
                            setJobs(prev => prev.map(j => j.id === jobId
                                ? { ...j, assignedTechIds: techIds, start: startHr, status: 'scheduled',
                                    window: startTime, scheduledDate: startDate }
                                : j));
                            if (addAudit) {
                                addAudit(
                                    overridden.length ? 'dispatch.schedule.override' : 'dispatch.schedule',
                                    'dispatch_job',
                                    jobId,
                                    jobName,
                                    `Crew: ${crewNames.join(', ')} on ${startDate} at ${startTime}` +
                                    (overridden.length ? ` — OVERRIDE: ${overridden.join(' | ')}` : '')
                                );
                            }
                            setSelectedJobId(null);
                        }}/>
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
                            {/* Job category + type */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Job Category</label>
                                    <select value={newJobForm.trade}
                                        onChange={e => {
                                            const cid = e.target.value;
                                            const stillValid = typesForCategory(settings?.dispatchJobTypes, cid).some(t => t.id === newJobForm.jobType);
                                            setNewJobForm(f => ({ ...f, trade: cid, jobType: stillValid ? f.jobType : '' }));
                                        }}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}>
                                        <option value="">— None —</option>
                                        {(settings?.dispatchTrades || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Job Type</label>
                                    <select value={newJobForm.jobType}
                                        onChange={e => setNewJobForm(f => ({ ...f, jobType: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}>
                                        <option value="">— None —</option>
                                        {typesForCategory(settings?.dispatchJobTypes, newJobForm.trade).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
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
                                        {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
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
