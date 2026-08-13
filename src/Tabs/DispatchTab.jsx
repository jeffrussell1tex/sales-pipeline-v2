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

// ── Availability ─────────────────────────────────────────────────────────────
// Two layers: workingHours (recurring weekly pattern on the technician row) and
// dispatch_schedule_blocks (dated exceptions). Both existed in the schema but
// nothing consumed them, so the scheduler treated every tech as available
// 7a-6p, seven days a week.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_SHIFT = { start: '07:00', end: '17:00' };

const shiftForDate = (tech, dateStr) => {
    const wh = tech?.workingHours || {};
    const d = wh[DAY_KEYS[fromYmd(dateStr).getDay()]];
    if (!d || !d.start || !d.end) return null;         // not scheduled to work
    return d;
};

// A block covers a date when the date falls inside its inclusive range.
const blocksOnDate = (blocks, techId, dateStr) =>
    (blocks || []).filter(b => b.techId === techId && b.startDate <= dateStr && b.endDate >= dateStr);

const addDaysStr = (str, n) => { const d = fromYmd(str); d.setDate(d.getDate() + n); return ymd(d); };

const hhToNum = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) + (m || 0) / 60; };

// Weekly capacity implied by the shift pattern. Falls back to 40 only when no
// pattern is set, rather than asserting 40 for everyone as before.
const capFromPattern = (wh) => {
    const days = Object.values(wh || {}).filter(d => d && d.start && d.end);
    if (!days.length) return 40;
    return Math.round(days.reduce((sum, d) => sum + Math.max(0, hhToNum(d.end) - hhToNum(d.start)), 0) * 10) / 10;
};
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
const PRIORITY_RANK = { low: 0, normal: 1, high: 2, emergency: 3 };

// Display-only. Stored values remain lowercase snake_case; this only prettifies
// the label ('en_route' -> 'En route').
const labelise = (v) => {
    const t = String(v || '').replace(/_/g, ' ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};
const normalisePriority = (p) => PRIORITY_ALIASES[p] || p || 'normal';
const URGENT_PRIORITIES = ['emergency'];
const prioColor = (p) => ({ emergency: T.danger, high: T.warn, normal: T.inkMid, low: T.inkMuted }[normalisePriority(p)] || T.inkMuted);

// ── Job templates ────────────────────────────────────────────────────────────
// settings.dispatchJobTemplates records are { id, name, ctype, crew, hrs,
// skills[], minLicense, equip, autojob, priority, used }.
//
// Three fields are deliberately NOT written to the form:
//   • equip   — free text ("Recovery cart, spares"); the only job-side
//               counterpart is equipmentIds, an array of equipment FK ids.
//               It is shown to the dispatcher instead of being written.
//   • ctype   — populated from settings.customerTypes, which is the CRM account
//               vocabulary, not dispatch_customers.customerType (a fixed enum of
//               commercial/residential/industrial/government). The two never
//               match, so matching a template to a customer by type is not
//               possible until that vocabulary is reconciled.
//   • autojob — no auto-create-on-Closed-Won exists anywhere in the codebase.
//
// Values that no longer exist in the org's current vocabulary are reported as
// skipped rather than written. A minLicense the org has since renamed would
// otherwise fall through to the first <option> and silently downgrade the job's
// requirement from Master to Apprentice.
const applyJobTemplate = (form, tmpl, { skills = [], licLevels = [], equipCategories = [], vehicleTypes = [] } = {}) => {
    const applied = [];
    const skipped = [];
    const next = { ...form };

    const crew = parseInt(tmpl.crew, 10);
    if (crew > 0) { next.crewSize = crew; applied.push(`crew ${crew}`); }

    const hrs = parseFloat(tmpl.hrs);
    if (hrs > 0) { next.durationHrs = hrs; applied.push(`${hrs}h`); }

    const prio = normalisePriority(tmpl.priority);
    if (PRIORITIES.some(p => p.value === prio)) {
        next.priority = prio;
        applied.push(prio);
    } else if (tmpl.priority) {
        skipped.push(`priority "${tmpl.priority}" is not a current priority`);
    }

    if (tmpl.minLicense) {
        if (licLevels.includes(tmpl.minLicense)) {
            next.minLicense = tmpl.minLicense;
            applied.push(tmpl.minLicense);
        } else {
            skipped.push(`min licence "${tmpl.minLicense}" is no longer in your licence list`);
        }
    }

    const known = new Set((skills || []).map(s => s.id));
    const keep  = (tmpl.skills || []).filter(id => known.has(id));
    const lost  = (tmpl.skills || []).length - keep.length;
    if (keep.length) {
        next.needSkills = keep;
        applied.push(`${keep.length} skill${keep.length === 1 ? '' : 's'}`);
    }
    if (lost > 0) skipped.push(`${lost} required skill${lost === 1 ? '' : 's'} no longer defined`);

    const knownCats = new Set(equipCategories || []);
    const keepEq = (tmpl.equipCategories || []).filter(c => knownCats.has(c));
    const lostEq = (tmpl.equipCategories || []).length - keepEq.length;
    if (keepEq.length) {
        next.equipCategories = keepEq;
        applied.push(`${keepEq.length} item${keepEq.length === 1 ? '' : 's'}`);
    }
    if (lostEq > 0) skipped.push(`${lostEq} required equipment categor${lostEq === 1 ? 'y is' : 'ies are'} no longer stocked`);

    if (tmpl.vehicleType) {
        if ((vehicleTypes || []).includes(String(tmpl.vehicleType).toLowerCase())) {
            next.requiredVehicleType = String(tmpl.vehicleType).toLowerCase();
            applied.push(`${tmpl.vehicleType} required`);
        } else {
            skipped.push(`vehicle class "${tmpl.vehicleType}" is not in your fleet`);
        }
    }
    if ((tmpl.equipUnmatched || []).length) skipped.push(`unmatched template equipment: ${tmpl.equipUnmatched.join(', ')}`);

    return { next, applied, skipped };
};

const templateLabel = (t) => t.name || t.ctype || 'Untitled template';

// ── Equipment availability ───────────────────────────────────────────────────
// A job's equipCategories are KINDS of equipment required — `category` values on
// dispatch_equipment rows. They are not individual assets: asset-level checkout
// lives on that same table and points the other way, via checkedOutJobId.
//
// They persist in dispatch_jobs.equipment_ids, which no client has ever written
// (every POST sent []), so no migration was needed to give the column this
// meaning.
//
// Concurrency uses the same hour-overlap test as technician double-booking, so
// there is only one notion of "at the same time" in this file. A job with no
// start time cannot be overlap-tested, so it is treated as holding the item for
// the whole day rather than assumed not to clash.
const jobsOverlap = (a, b) => {
    if (a.start == null || b.start == null) return true;
    const as = a.start, ae = as + (a.durationHrs || 2);
    const bs = b.start, be = bs + (b.durationHrs || 2);
    return as < be && ae > bs;
};

// `units` are dispatch_equipment rows — one row per physical unit, grouped by
// `category`. A requirement names a category; availability is the count of units
// in it that are not out of service, minus the units committed to overlapping
// jobs. Counting rows rather than a quantity field is what lets one unit sit in
// maintenance while its twin stays bookable.
const equipmentConflicts = (job, allJobs, units = [], dateStr, probeOverride = null) => {
    const need = job?.equipCategories || [];
    if (!need.length || !dateStr) return [];
    const probe = probeOverride || { start: job.start, durationHrs: job.durationHrs };

    const rivals = (allJobs || []).filter(j =>
        j.id !== job.id &&
        j.scheduledDate === dateStr &&
        j.status !== 'cancelled' && j.status !== 'completed' &&
        (j.equipCategories || []).length > 0 &&
        jobsOverlap(probe, j));

    const out = [];
    need.forEach(cat => {
        const all = (units || []).filter(u => (u.category || '').trim() === cat);
        if (!all.length) { out.push({ cat, missing: true, usable: 0, owned: 0, committed: 0 }); return; }
        // A unit in maintenance or out of service cannot be dispatched, so it is
        // not capacity. A checked-out unit still counts: the overlap test below
        // is what decides whether it is free at this time.
        const usable = all.filter(u => {
            const st = u.status || 'available';
            return st !== 'maintenance' && st !== 'out_of_service';
        }).length;
        const committed = rivals.filter(j => (j.equipCategories || []).includes(cat)).length;
        if (usable === 0 || committed >= usable) {
            out.push({ cat, missing: false, usable, owned: all.length, committed });
        }
    });
    return out;
};

const describeConflict = (c) => {
    if (c.missing) return `${c.cat} — no units exist in Vehicles & equipment`;
    if (c.usable === 0) return `${c.cat} — all ${c.owned} unit(s) are in maintenance or out of service`;
    return `${c.cat} — all ${c.usable} available unit(s) committed to overlapping jobs that day`;
};

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
const scoreTech = (tech, job, allJobs, skills, avail = {}) => {
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

    // Availability (day level). A technician who is not rostered that day, or is
    // marked out for the whole day, cannot take the job at all. Partial-day blocks
    // are handled where a time is actually chosen (the planner's slot search and
    // handleSchedule), since scoring runs before a start time exists.
    const availDate = avail.dateStr || job.scheduledDate || null;
    if (availDate) {
        const dayName = DOW[fromYmd(availDate).getDay()];
        if (!shiftForDate(tech, availDate)) {
            blockers.push(`Not rostered on ${dayName}`);
        }
        const dayBlocks = blocksOnDate(avail.blocks, tech.id, availDate);
        const allDayBlock = dayBlocks.find(b => b.allDay !== false);
        if (allDayBlock) {
            const name = (avail.blockTypes || []).find(t => t.id === allDayBlock.blockType)?.name || 'Time off';
            blockers.push(`Off · ${name}`);
        }
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

    // Vehicle class (3pts).
    //
    // Unlike equipment, a vehicle requirement is NOT a job-level shortage — a
    // vehicle attaches to a technician (dispatch_vehicles.assignedTechId), so
    // "needs a bucket truck" filters WHO can serve the job. That makes it a
    // per-technician blocker, which is why it lives here and equipment does not.
    //
    // The bare `if (tech.vehicle) score += 3` this replaces rewarded having any
    // vehicle at all, which never distinguished a bucket truck from a hatchback.
    const myVehicle = (avail.vehicles || []).find(v => v.id === tech.vehicle) || null;
    if (job.requiredVehicleType) {
        const want = String(job.requiredVehicleType).toLowerCase();
        if (!myVehicle) {
            blockers.push(`No vehicle assigned · job needs a ${labelise(job.requiredVehicleType)}`);
        } else if (String(myVehicle.type || '').toLowerCase() !== want) {
            blockers.push(`${myVehicle.name} is a ${labelise(myVehicle.type || 'vehicle')} · job needs a ${labelise(job.requiredVehicleType)}`);
        } else if ((myVehicle.status || 'available') !== 'available') {
            blockers.push(`${myVehicle.name} is ${labelise(myVehicle.status)}`);
        } else {
            score += 3;
            why.push(`${labelise(myVehicle.type)} · ${myVehicle.name}`);
        }
    } else if (tech.vehicle) {
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
const BoardView = ({ jobs, techs, skills, blocks, blockTypes, dateStr, onJobClick }) => {
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
                        // Availability for the day on screen: no shift = not rostered,
                        // an all-day block = out. Both shade the whole lane so a
                        // dispatcher never drops a job onto someone who is away.
                        const dayShift  = dateStr ? shiftForDate(tech, dateStr) : null;
                        const dayBlocks = dateStr ? blocksOnDate(blocks, tech.id, dateStr) : [];
                        const allDayOff = dayBlocks.find(b => b.allDay !== false);
                        const offLabel  = allDayOff
                            ? ((blockTypes || []).find(t => t.id === allDayOff.blockType)?.name || 'Time off')
                            : (dateStr && !dayShift ? 'Not rostered' : null);
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
                                            {offLabel && (
                                                <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                                                    background: `${T.warn}1e`, color: T.warn, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                                    {offLabel}
                                                </span>
                                            )}
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
                                    {DSP_HOURS.map(h => {
                                        // Hours outside the shift, or covered by time off, are shaded.
                                        const outside = dateStr && (!dayShift || h < hhToNum(dayShift.start) || h >= hhToNum(dayShift.end));
                                        const partial = !allDayOff && dayBlocks.some(b =>
                                            b.allDay === false && b.startTime && b.endTime &&
                                            h < hhToNum(b.endTime) && (h + 1) > hhToNum(b.startTime));
                                        return (
                                            <div key={h} style={{ width: COL_W, flexShrink: 0, height: '100%',
                                                borderRight: `1px solid ${T.border}`, position: 'relative',
                                                background: allDayOff || outside ? `${T.borderStrong}44`
                                                    : partial ? `${T.warn}18` : 'transparent' }}/>
                                        );
                                    })}
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
// Queue sort. These three were rendered as spans with a hardcoded `i === 0`
// highlight and no onClick — decorative, never wired.
const QUEUE_SORTS = {
    Priority: (a, b) => (PRIORITY_RANK[normalisePriority(b.priority)] ?? 1) - (PRIORITY_RANK[normalisePriority(a.priority)] ?? 1),
    // Undated jobs sort last rather than leading the list.
    Date:     (a, b) => (a.scheduledDate || '9999-12-31').localeCompare(b.scheduledDate || '9999-12-31'),
    Value:    (a, b) => (b.value || 0) - (a.value || 0),
};

const CrewBuilderView = ({ jobs, techs, allTechs, skills, equipUnits = [], vehicles = [], blocks, blockTypes, selectedJobId, onSelectJob, onBack, onScheduled, onCreateBridgeJob }) => {
    const [queueSort, setQueueSort] = useState('Priority');
    const sortedQueue = useMemo(() => jobs.slice().sort(QUEUE_SORTS[queueSort] || QUEUE_SORTS.Priority), [jobs, queueSort]);
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
            .map(t => ({ tech: t, ...scoreTech(t, selectedJob, jobs, skills, { blocks, blockTypes, vehicles, dateStr: scheduleDate || selectedJob.scheduledDate }) }))
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
    }, [selectedJob, techs, jobs, skills, blocks, blockTypes, scheduleDate]);

    // Full roster, independent of the board filters, so the preference note can
    // tell "filtered out of this view" apart from "not on the roster".
    const roster = (allTechs && allTechs.length) ? allTechs : techs;

    // Why the customer's preferred technician is not the top suggestion. The
    // preference is worth 7 points and never blocks, so without this the tech
    // the customer asked for is quietly out-ranked with no explanation.
    const preferredNote = useMemo(() => {
        if (!selectedJob || !selectedJob.preferredTechId) return null;
        const pt = roster.find(t => t.id === selectedJob.preferredTechId);
        if (!pt) return { tone: 'warn', text: 'The preferred technician on this customer is no longer on the roster.' };

        const topId = candidates[0]?.tech.id;
        if (topId === pt.id) return null;

        const inPool = techs.some(t => t.id === pt.id);
        if (!inPool) return { tone: 'muted', text: `${pt.name} is preferred by this customer but is hidden by the current board filter.` };

        const s = scoreTech(pt, selectedJob, jobs, skills,
            { blocks, blockTypes, vehicles, dateStr: scheduleDate || selectedJob.scheduledDate });
        if (s.blockers.length) return { tone: 'warn', text: `${pt.name} is preferred by this customer but is blocked — ${s.blockers.join('; ')}.` };
        if (!candidates.some(c => c.tech.id === pt.id)) return { tone: 'muted', text: `${pt.name} is preferred by this customer but did not reach the shortlist (match ${s.score}).` };
        return { tone: 'muted', text: `${pt.name} is preferred by this customer; another technician scores higher on this job.` };
    }, [selectedJob, roster, techs, candidates, jobs, skills, blocks, blockTypes, scheduleDate]);

    // Live equipment read for the job on screen, so the shortage is visible while
    // the dispatcher is still choosing a date rather than only on the failed save.
    const equipNote = useMemo(() => {
        if (!selectedJob) return null;
        const dateStr = scheduleDate || selectedJob.scheduledDate || '';
        if (!dateStr) return null;
        const probe = scheduleTime
            ? { start: hhToNum(scheduleTime), durationHrs: selectedJob.durationHrs }
            : null;
        const conf = equipmentConflicts(selectedJob, jobs, equipUnits, dateStr, probe);
        if (!conf.length) return null;
        return conf.map(describeConflict).join('; ');
    }, [selectedJob, jobs, equipUnits, scheduleDate, scheduleTime]);

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

        // Partial-day time off and shift bounds can only be checked once a start
        // time exists, so this is the last gate before the write.
        const [vh, vm] = scheduleTime.split(':').map(Number);
        const startNum = vh + vm / 60;
        const endNum   = startNum + (selectedJob.durationHrs || 2);
        for (const id of addedIds) {
            const t = techs.find(x => x.id === id);
            if (!t) continue;
            const shift = shiftForDate(t, dateStr);
            if (shift && (startNum < hhToNum(shift.start) || endNum > hhToNum(shift.end))) {
                setScheduleError(`${t.name} works ${shift.start}–${shift.end} that day — the job runs outside their shift.`);
                return;
            }
            const clash = blocksOnDate(blocks, id, dateStr)
                .filter(b => b.allDay === false && b.startTime && b.endTime)
                .find(b => startNum < hhToNum(b.endTime) && endNum > hhToNum(b.startTime));
            if (clash) {
                const nm = (blockTypes || []).find(x => x.id === clash.blockType)?.name || 'time off';
                setScheduleError(`${t.name} is out (${nm}) ${clash.startTime}–${clash.endTime} that day.`);
                return;
            }
        }

        // Equipment is a job-level constraint, not a per-technician one — every
        // candidate would carry the identical blocker — so it gates here, where
        // the start time that defines the overlap window is finally known.
        // A bridge row has no dispatch_jobs record, so the PUT below would 404.
        // Previously it reached the endpoint and failed with a bare HTTP error;
        // now it says what to do instead.
        if (selectedJob.isBridge) {
            setScheduleError('This is a won opportunity, not a job yet. Use "Create job" on it first.');
            return;
        }

        const eqConf = equipmentConflicts(selectedJob, jobs, equipUnits, dateStr,
            { start: startNum, durationHrs: selectedJob.durationHrs });
        if (eqConf.length) {
            setScheduleError(`Equipment unavailable — ${eqConf.map(describeConflict).join('; ')}.`);
            return;
        }

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
                        {['Priority', 'Date', 'Value'].map(l => (
                            <span key={l} onClick={() => setQueueSort(l)}
                                style={{ fontSize: 11, padding: '3px 8px', borderRadius: T.r,
                                    background: queueSort === l ? T.ink : T.surface,
                                    color: queueSort === l ? '#fbf8f3' : T.inkMid,
                                    fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>{l}</span>
                        ))}
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
                    {sortedQueue.map(j => {
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 10 }}>
                                {[
                                    { l: 'Window',      v: selectedJob.window },
                                    { l: 'Crew size',   v: `${selectedJob.crewSize} techs` },
                                    { l: 'Duration',    v: `${selectedJob.durationHrs}h` },
                                    { l: 'Min license', v: selectedJob.minLicense },
                                    { l: 'Vehicle',     v: selectedJob.requiredVehicleType ? labelise(selectedJob.requiredVehicleType) : 'Any' },
                                    { l: 'Preferred',   v: selectedJob.preferredTechId ? roster.find(t => t.id === selectedJob.preferredTechId)?.name?.split(' ')[0] || 'Unknown' : '—' },
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
                                {(selectedJob.equipCategories || []).length > 0 && <>
                                    <span style={{ fontSize: 10.5, fontWeight: 600, color: T.inkMid, marginLeft: 12, marginRight: 4 }}>Equip:</span>
                                    <span style={{ fontSize: 11, color: T.inkMid }}>{(selectedJob.equipCategories || []).join(', ')}</span>
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

                            {selectedJob.isBridge && (
                                <div style={{ padding: '11px 13px', marginBottom: 12, borderRadius: T.r,
                                    background: `${T.goldInk}12`, borderLeft: `3px solid ${T.goldInk}`,
                                    display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontFamily: T.sans, lineHeight: 1.45, color: T.ink }}>
                                        <strong>Won opportunity — not a job yet.</strong>{' '}
                                        {selectedJob.templateName
                                            ? `Defaults shown come from the "${selectedJob.templateName}" template.`
                                            : 'No template matched, so crew, duration and licence are unset.'}
                                        {' '}Create the job to schedule it.
                                    </div>
                                    {onCreateBridgeJob && (
                                        <button onClick={() => onCreateBridgeJob(selectedJob)}
                                            style={{ padding: '6px 12px', background: T.ink, color: '#fbf8f3', border: 'none',
                                                borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                fontFamily: T.sans, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                            Create job
                                        </button>
                                    )}
                                </div>
                            )}

                            {equipNote && (
                                <div style={{ padding: '7px 11px', marginBottom: 12, borderRadius: T.r,
                                    fontSize: 11.5, fontFamily: T.sans, lineHeight: 1.45,
                                    background: `${T.danger}12`, borderLeft: `3px solid ${T.danger}`, color: T.ink }}>
                                    <strong>Equipment unavailable</strong> — {equipNote}. Scheduling is blocked until a unit frees up or the requirement is removed.
                                </div>
                            )}

                            {preferredNote && (
                                <div style={{ padding: '7px 11px', marginBottom: 12, borderRadius: T.r,
                                    fontSize: 11.5, fontFamily: T.sans, lineHeight: 1.45,
                                    background: preferredNote.tone === 'warn' ? `${T.warn}14` : T.surface2,
                                    borderLeft: `3px solid ${preferredNote.tone === 'warn' ? T.warn : T.borderStrong}`,
                                    color: preferredNote.tone === 'warn' ? T.ink : T.inkMid }}>
                                    {preferredNote.text}
                                </div>
                            )}

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
                                        Preferred: {roster.find(t => t.id === selectedJob.preferredTechId)?.name || 'unknown technician'}
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
    hoursCap:       capFromPattern(t.workingHours),
    vehicle:        t.assignedVehicleId || null,
    baseLocation:   t.homeZip || null,
    status:         t.status,
    employmentType: t.employmentType,
    avatarInitials: t.avatarInitials || `${t.firstName?.[0] || ''}${t.lastName?.[0] || ''}`.toUpperCase(),
});


// ── Week board: technician rows x 7 day columns ───────────────────────────────
// Keeps the "who is loaded" read of the day board. An hour axis does not extend
// to a week (12 columns becomes 84), so the cell is the unit instead of the hour.
const WeekBoardView = ({ jobs, techs, skills, blocks, blockTypes, anchor, onJobClick }) => {
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
                            const cellJobs   = techJobs.filter(j => j.scheduledDate === ds);
                            const cellBlocks = blocksOnDate(blocks, tech.id, ds);
                            const cellOff    = cellBlocks.find(b => b.allDay !== false);
                            return (
                                <div key={ds} style={{ flex: 1, minWidth: 120, borderRight: `1px solid ${T.border}`,
                                    padding: 5, display: 'flex', flexDirection: 'column', gap: 4,
                                    background: cellOff ? `${T.borderStrong}44`
                                        : ds === todayStr ? `${T.gold}12` : 'transparent' }}>
                                    {cellBlocks.map(b => {
                                        const bt = (blockTypes || []).find(t => t.id === b.blockType);
                                        const col = bt?.color || T.warn;
                                        return (
                                            <div key={b.id} style={{ padding: '2px 6px', borderRadius: T.r,
                                                background: `${col}1e`, borderLeft: `3px solid ${col}` }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: col, fontFamily: T.sans }}>
                                                    {bt?.name || 'Time off'}
                                                    {b.allDay === false && b.startTime ? ` ${b.startTime}–${b.endTime}` : ''}
                                                </div>
                                            </div>
                                        );
                                    })}
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
// Property types are org-configurable (Settings → Dispatch → Property types).
// These four are the seed, and their IDS are load-bearing: every existing
// dispatch_customers.customer_type row holds one of them.
const DEFAULT_PROPERTY_TYPES = [
    { id: 'commercial',  label: 'Commercial',  icon: 'building' },
    { id: 'residential', label: 'Residential', icon: 'home' },
    { id: 'industrial',  label: 'Industrial',  icon: 'factory' },
    { id: 'government',  label: 'Government',  icon: 'gov' },
];

// Configured list, plus any value still written on a customer record but no
// longer configured — an unlisted type stays visible and filterable rather than
// silently vanishing from the rail and taking its customers with it.
const propertyTypesFor = (settings, customers) => {
    const configured = (settings?.dispatchPropertyTypes || []).length
        ? settings.dispatchPropertyTypes
        : DEFAULT_PROPERTY_TYPES;
    const known = new Set(configured.map(t => t.id));
    const orphans = [...new Set((customers || []).map(c => c.customerType || 'commercial'))]
        .filter(id => !known.has(id))
        .map(id => ({ id, label: labelise(id), icon: 'building', unlisted: true }));
    return [...configured, ...orphans];
};
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

// ── Closed Won → Dispatch bridge ─────────────────────────────────────────────
// A won opportunity appears in dispatch as a SYNTHETIC row (`auto_` prefix). It
// is computed, never written: nothing exists in dispatch_jobs until a dispatcher
// creates the job. Two consequences worth stating, because they are why this
// approach was chosen:
//
//   • A CRM-only org (settings.dispatchEnabled false) needs no special handling.
//     The Dispatch tab does not render, so the derivation never runs and no rows
//     are created. Toggling the flag on or off cannot strand data.
//   • Deleting or re-opening the opportunity simply removes the row next render.
//
// If auto-create is ever moved server-side — a webhook or scheduled function that
// WRITES a job on stage change — it must check settings.dispatchEnabled first.
// That is the one place the flag becomes load-bearing rather than cosmetic.

// Previously these rows carried hardcoded crewSize 1, durationHrs 4 and
// minLicense 'Journeyman' — fabricated numbers that looked like decisions. The
// values now come from a job template, and anything a template does not supply is
// left null so the UI can say "not set" instead of inventing a figure.
//
// Template matching uses `ctype`, which is populated from settings.customerTypes
// (the CRM account vocabulary) and is compared against the account's own
// customerTypes. Whether that is the right axis — CRM relationship tier vs.
// dispatch premises segment — is still an open decision; see the state doc. Until
// it is settled, an unmatched opportunity gets no template rather than a guess.
// A template declares two optional filters — `ctypes` (CRM account types) and
// `propertyTypes` (dispatch premises segments). An empty filter means "any".
//
// A template APPLIES when every filter it specifies matches. Where several apply,
// the MOST SPECIFIC wins: a template naming both axes beats one naming a single
// axis, which beats a catch-all. That is what lets an org keep a general "Install"
// template alongside a "Residential install" override without them fighting.
//
// Ties are not resolved by guessing. If two templates are equally specific, none
// is chosen — the same rule as before, because a wrong template silently supplies
// wrong crew, hours and licence, which is worse than supplying none.
const matchTemplateForOpp = (opp, account, templates, customer) => {
    const list = (templates || []).filter(t => t && t.id);
    if (!list.length) return null;

    const norm  = (x) => String(x || '').trim().toLowerCase();
    const tiers = (account?.customerTypes || []).map(norm).filter(Boolean);
    const prem  = norm(customer?.customerType);

    const scored = list.map(t => {
        const wantTiers = (t.ctypes || []).map(norm).filter(Boolean);
        const wantPrem  = (t.propertyTypes || []).map(norm).filter(Boolean);

        // A filter the record cannot answer is a MISS, not a pass. An opportunity
        // whose account has no type set does not match a tier-restricted template.
        if (wantTiers.length && !wantTiers.some(x => tiers.includes(x))) return null;
        if (wantPrem.length  && !(prem && wantPrem.includes(prem)))      return null;

        return { t, specificity: (wantTiers.length ? 1 : 0) + (wantPrem.length ? 1 : 0) };
    }).filter(Boolean);

    if (!scored.length) return null;
    const best = Math.max(...scored.map(x => x.specificity));
    const top  = scored.filter(x => x.specificity === best);
    return top.length === 1 ? top[0].t : null;
};

const buildWonBridgeJobs = ({ opportunities, jobs, customers, accounts, templates }) => {
    const claimed = new Set((jobs || []).map(j => j.opportunityId).filter(Boolean));
    return (opportunities || [])
        .filter(o => o.stage === 'Closed Won' && !claimed.has(o.id))
        .map(o => {
            const account = (accounts || []).find(a => a.id === o.accountId || a.name === o.account) || null;
            // A dispatch customer may already exist for this account, in which case
            // its address and preferences are real data rather than blanks.
            const cust = (customers || []).find(c =>
                (account && c.accountId === account.id) ||
                (o.account && (c.name || '').trim().toLowerCase() === String(o.account).trim().toLowerCase())) || null;
            const tmpl = matchTemplateForOpp(o, account, templates, cust);

            const crew = parseInt(tmpl?.crew, 10);
            const hrs  = parseFloat(tmpl?.hrs);

            return {
                id:              'auto_' + o.id,
                opportunityId:   o.id,
                isBridge:        true,          // synthetic — not a dispatch_jobs row
                templateId:      tmpl?.id || null,
                templateName:    tmpl ? (tmpl.name || tmpl.ctype || 'Untitled template') : null,
                customerId:      cust?.id || null,
                accountId:       account?.id || null,
                customer:        cust?.name || o.account || o.opportunityName || 'Unknown',
                title:           o.opportunityName || 'Won opportunity',
                address:         cust?.serviceAddress || '',
                city:            cust?.serviceCity    || '',
                state:           cust?.serviceState   || '',
                zip:             cust?.serviceZip     || '',
                needSkills:      (tmpl?.skills || []).slice(),
                equipCategories: (tmpl?.equipCategories || []).slice(),
                requiredVehicleType: tmpl?.vehicleType || null,
                crewSize:        crew > 0 ? crew : null,
                durationHrs:     hrs  > 0 ? hrs  : null,
                minLicense:      tmpl?.minLicense || null,
                priority:        tmpl ? normalisePriority(tmpl.priority) : 'normal',
                window:          'Not scheduled',
                value:           parseFloat(o.arr || o.revenue || 0) || 0,
                preferredTechId: cust?.preferredTechId || null,
                assignedTechIds: [],
                scheduledDate:   null,
                start:           null,
                status:          'unscheduled',
                _raw:            null,
            };
        });
};

// ── Service plan recurrence ──────────────────────────────────────────────────
// Visits are COMPUTED, not generated. Nothing is written until a dispatcher acts
// on a due visit, so a plan running for years costs one pass over that customer's
// plan jobs rather than a table full of speculative future rows.
//
// `leadDays` on the plan is the only thing that decides when work becomes
// visible: an occurrence surfaces in the Service Due queue once it is within that
// many days of falling due.
const MAX_OCCURRENCES = 400;   // guard against a pathological interval, not a real limit

const planVisitState = (customer, plan, jobs, todayStr) => {
    if (!plan)                 return { state: 'none' };
    if (plan.active === false) return { state: 'inactive' };
    if (customer.doNotService) return { state: 'blocked', reason: 'Customer is marked do-not-service' };

    const interval = parseInt(plan.intervalDays, 10);
    if (!Number.isFinite(interval) || interval <= 0)
        return { state: 'unconfigured', reason: 'This plan has no visit interval' };
    if (!customer.planStartDate)
        return { state: 'unconfigured', reason: 'No plan start date on this customer' };

    const mine = (jobs || []).filter(j =>
        j.customerId === customer.id && j.servicePlanId === plan.id && j.status !== 'cancelled');

    // Only a COMPLETED job retires an occurrence. A scheduled one means the visit
    // is in hand but still outstanding — retiring it would advance the pointer and
    // hide the very visit that is about to happen.
    const doneOn = new Set(mine.filter(j => j.status === 'completed').map(j => j.planDueDate).filter(Boolean));
    const openOn = new Map();
    mine.filter(j => j.status !== 'completed' && j.planDueDate).forEach(j => {
        if (!openOn.has(j.planDueDate)) openOn.set(j.planDueDate, j);
    });

    const coverageEnd = customer.agreementExpiry || null;
    let due;
    let missed = 0;

    if (plan.anchorMode === 'rolling') {
        // Interval runs from when the unit was actually serviced, so a late visit
        // pushes everything after it. Only ever one outstanding occurrence.
        const completed = mine.filter(j => j.status === 'completed' && j.scheduledDate)
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
        const last = completed[completed.length - 1];
        due = last ? addDaysStr(last.scheduledDate, interval) : customer.planStartDate;
    } else {
        // Fixed contract grid: occurrences sit on planStart + n x interval whatever
        // actually happened, so four visits a contract year stay four. Missed ones
        // accumulate and are counted rather than silently skipped.
        let cur = customer.planStartDate;
        const outstanding = [];
        for (let i = 0; i < MAX_OCCURRENCES; i++) {
            if (!doneOn.has(cur)) {
                outstanding.push(cur);
                if (cur > todayStr) break;
            }
            if (coverageEnd && cur > coverageEnd) break;
            cur = addDaysStr(cur, interval);
        }
        if (!outstanding.length) return { state: 'upToDate' };
        due    = outstanding[0];
        missed = Math.max(0, outstanding.filter(d => d < todayStr).length - 1);
    }

    if (coverageEnd && due > coverageEnd) return { state: 'ended', due, coverageEnd };

    const open = openOn.get(due);
    if (open) return { state: 'scheduled', due, job: open, missed };

    const lead = Number.isFinite(parseInt(plan.leadDays, 10)) ? parseInt(plan.leadDays, 10) : 14;
    const daysUntil = daysBetween(todayStr, due);
    if (daysUntil < 0)     return { state: 'overdue',  due, daysUntil, missed };
    if (daysUntil <= lead) return { state: 'due',      due, daysUntil, missed };
    return { state: 'upcoming', due, daysUntil, missed };
};

// Only these reach the queue. 'upcoming' is deliberately excluded — that is the
// whole point of leadDays; surfacing everything would make the queue a customer
// list rather than a work list.
const ACTIONABLE_VISIT_STATES = ['overdue', 'due'];

const buildVisitQueue = (customers, plans, jobs, todayStr) =>
    (customers || [])
        .map(c => {
            const plan = (plans || []).find(p => p.id === c.servicePlanId);
            if (!plan) return null;
            const st = planVisitState(c, plan, jobs, todayStr);
            return { customer: c, plan, ...st };
        })
        .filter(r => r && (ACTIONABLE_VISIT_STATES.includes(r.state) || r.state === 'scheduled'))
        .sort((a, b) => (a.due || '').localeCompare(b.due || ''));

// ── Service Due ──────────────────────────────────────────────────────────────
// Plan visits inside their lead window, plus any already scheduled so the queue
// reads as the full picture rather than only the outstanding half. Every row is
// computed; nothing here exists in the database until "Create visit" is used.
const VISIT_TONE = {
    overdue:   { bg: 'danger', label: 'Overdue' },
    due:       { bg: 'warn',   label: 'Due' },
    scheduled: { bg: 'ok',     label: 'Scheduled' },
};

const ServiceDueView = ({ rows, today, onStart, onOpenJob, onOpenCustomer }) => {
    const tone = (k) => ({ danger: T.danger, warn: T.warn, ok: T.ok }[k] || T.inkMuted);
    const outstanding = rows.filter(r => r.state === 'overdue' || r.state === 'due');
    const booked      = rows.filter(r => r.state === 'scheduled');

    return (
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>Service due</span>
                <span style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                    {outstanding.length} to book{booked.length ? ` · ${booked.length} already scheduled` : ''}
                </span>
            </div>
            <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans, marginBottom: 14 }}>
                A visit appears here once it is within its plan&rsquo;s lead window. Change how early that happens
                under Settings &rarr; Dispatch &rarr; Service plans.
            </div>

            {rows.length === 0 && (
                <div style={{ padding: '18px 2px', fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>
                    Nothing due. Customers on a plan will appear as their next visit comes into range.
                </div>
            )}

            {rows.map(r => {
                const t = VISIT_TONE[r.state] || VISIT_TONE.due;
                const when = r.state === 'overdue'
                    ? `${Math.abs(r.daysUntil)} day${Math.abs(r.daysUntil) === 1 ? '' : 's'} overdue`
                    : r.state === 'due'
                        ? (r.daysUntil === 0 ? 'due today' : `in ${r.daysUntil} day${r.daysUntil === 1 ? '' : 's'}`)
                        : 'booked';
                return (
                    <div key={`${r.customer.id}:${r.due}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
                            border: `1px solid ${T.border}`, borderLeft: `3px solid ${tone(t.bg)}`,
                            borderRadius: T.r, marginBottom: 8, background: T.surface }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span onClick={onOpenCustomer}
                                    style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans, cursor: 'pointer' }}>
                                    {r.customer.name}
                                </span>
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 700,
                                    background: `${tone(t.bg)}14`, color: tone(t.bg), fontFamily: T.sans }}>{t.label}</span>
                                {r.missed > 0 && (
                                    <span title="Earlier occurrences on this plan were never completed"
                                        style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 700,
                                            background: `${T.danger}14`, color: T.danger, fontFamily: T.sans }}>
                                        {r.missed} earlier visit{r.missed === 1 ? '' : 's'} missed
                                    </span>
                                )}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                {r.plan.name}
                                <span style={{ fontFamily: T.mono, marginLeft: 8 }}>due {r.due}</span>
                                <span style={{ marginLeft: 8 }}>· {when}</span>
                                {r.customer.customerNumber && (
                                    <span style={{ fontFamily: T.mono, marginLeft: 8, opacity: 0.7 }}>{r.customer.customerNumber}</span>
                                )}
                            </div>
                        </div>
                        {r.state === 'scheduled' ? (
                            <button onClick={() => onOpenJob(r.job.id)}
                                style={{ padding: '6px 12px', background: T.surface, border: `1px solid ${T.borderStrong}`,
                                    borderRadius: T.r, fontSize: 12, fontWeight: 600, color: T.inkMid,
                                    cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                Open job
                            </button>
                        ) : (
                            <button onClick={() => onStart(r)}
                                style={{ padding: '6px 12px', background: T.ink, color: '#fbf8f3', border: 'none',
                                    borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                Create visit
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// Have the visible fields of a draft diverged from the record it was loaded from?
// Compared field-by-field rather than by JSON string: the draft carries UI-only
// keys (_isNew) and the record carries server keys (updatedAt) that would make a
// whole-object comparison report a difference on every open form.
const draftIsDirty = (draft, original) => {
    if (!draft) return false;
    if (draft._isNew) {
        // A new draft counts as dirty once anything has actually been typed.
        return Object.entries(draft).some(([k, v]) =>
            !k.startsWith('_') && k !== 'id' && v !== '' && v !== null && v !== false &&
            !(Array.isArray(v) && v.length === 0) &&
            !(k === 'customerType' || k === 'employmentType' || k === 'status' || k === 'serviceAgreement'));
    }
    if (!original) return false;
    return Object.keys(draft).some(k => {
        if (k.startsWith('_')) return false;
        const a = draft[k], b = original[k];
        if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a || []) !== JSON.stringify(b || []);
        return (a ?? '') !== (b ?? '');
    });
};

const UNSAVED_MSG = 'You have unsaved changes. Discard them?';

// ── Dispatch customer segmentation ───────────────────────────────────────────
// Service history is derived from jobs rather than stored on the customer: a
// denormalised "jobCount" would need maintaining on every job write and would be
// wrong the moment one was deleted. Nothing here needs a schema change.
// Coverage has two eras. `servicePlanId` points at a dispatch_service_plans row;
// `serviceAgreement` is the pre-plan varchar label, kept because it is the only
// record of what a customer was on before plans existed. A customer on neither is
// uncovered; a customer on the legacy string alone is covered but unmapped, and
// that state is shown rather than quietly treated as "no plan".
const coverageOf = (c, plans) => {
    if (c.servicePlanId) {
        const plan = (plans || []).find(p => p.id === c.servicePlanId);
        return plan
            ? { kind: 'plan', id: plan.id, label: plan.name, plan }
            : { kind: 'missing', id: c.servicePlanId, label: 'Unknown plan', plan: null };
    }
    if (c.serviceAgreement && c.serviceAgreement !== 'none') {
        return { kind: 'legacy', id: 'legacy:' + c.serviceAgreement, label: labelise(c.serviceAgreement), plan: null };
    }
    return { kind: 'none', id: 'none', label: 'No plan', plan: null };
};

const custStats = (customer, jobs, todayStr) => {
    const mine = (jobs || []).filter(j => j.customerId === customer.id && j.status !== 'cancelled');
    const done = mine.filter(j => j.status === 'completed');
    const dated = done.map(j => j.scheduledDate).filter(Boolean).sort();
    const upcoming = mine.filter(j => j.scheduledDate && j.scheduledDate >= todayStr && j.status !== 'completed');
    return {
        total:      mine.length,
        completed:  done.length,
        lastServed: dated.length ? dated[dated.length - 1] : null,
        upcoming:   upcoming.length,
        nextDate:   upcoming.map(j => j.scheduledDate).sort()[0] || null,
    };
};

const activityBucket = (st) => {
    if (st.upcoming > 0)    return 'active';
    if (st.completed === 0) return 'never';
    if (st.completed === 1) return 'once';
    return 'repeat';
};

const daysBetween = (fromStr, toStr) => Math.round(
    (fromYmd(toStr).getTime() - fromYmd(fromStr).getTime()) / 86400000);

// ── Dispatch → Customers ─────────────────────────────────────────────────────
// Three-column master–detail: an organised facet rail, the list, and a real
// service-customer record. Replaces a wall of unlabelled chips and a detail pane
// that was empty until something was selected.
//
// Contract tier in the reference design was a fixed four-value enum. Here it is
// a dispatch_service_plans row, so the "tiers" are whatever plans the org has
// defined. Rank, colour and fill are therefore DERIVED (by annual value, then
// name) rather than stored — see planPresentation.

const PLAN_SWATCHES = ['#7a6a48', '#3a5a7a', '#5a544c', '#4d6b3d', '#b87333', '#7a5a3c'];
const NO_PLAN_COLOR = '#8a8378';

const hexFill = (hex, alpha) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// Annualised so plans on different billing periods can sit in one column and be
// summed. `per_visit` multiplies by the derived visit count, which is why that
// field is kept consistent with intervalDays server-side.
const annualPlanValue = (plan) => {
    const p = parseFloat(plan?.price);
    if (!Number.isFinite(p)) return 0;
    switch (plan.billingPeriod) {
        case 'monthly':   return p * 12;
        case 'quarterly': return p * 4;
        case 'per_visit': return p * (parseInt(plan.visitsPerYear, 10) || 1);
        default:          return p;
    }
};

const planSlaText = (plan) => {
    const h = parseInt(plan?.responseHours, 10);
    if (!Number.isFinite(h)) return 'No response target set';
    if (h % 24 === 0) return `${h / 24}-day response`;
    return `${h}-hour response`;
};

const planPmText = (plan) => {
    if (!plan) return 'Time & materials';
    const cad = { monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Twice-yearly', annual: 'Annual', custom: 'Scheduled' }[plan.cadence] || 'Scheduled';
    const hrs = parseFloat(plan.includedHours);
    return `${cad} PM` + (Number.isFinite(hrs) && hrs > 0 ? ` · ${hrs} hrs included` : '');
};

// Ordered, coloured presentation of every coverage state actually reachable:
// active plans, plans still held by a customer even if retired, and "No plan".
// Built from the customers as well as the plan list so a retired plan someone is
// still on cannot become unfilterable.
const planPresentation = (plans, customers) => {
    const inUse = new Set((customers || []).map(c => c.servicePlanId).filter(Boolean));
    const rows = (plans || [])
        .filter(p => p.active !== false || inUse.has(p.id))
        .map(p => ({ id: p.id, label: p.name, plan: p, value: annualPlanValue(p) }))
        .sort((a, b) => (b.value - a.value) || a.label.localeCompare(b.label));
    rows.forEach((r, i) => {
        r.color = PLAN_SWATCHES[i % PLAN_SWATCHES.length];
        r.fill  = hexFill(r.color, 0.14);
    });
    rows.push({ id: 'none', label: 'No plan', plan: null, value: 0,
        color: NO_PLAN_COLOR, fill: hexFill(NO_PLAN_COLOR, 0.10) });
    return rows;
};

const presentationFor = (customer, presentation) =>
    presentation.find(p => p.id === (customer.servicePlanId || 'none'))
    || presentation[presentation.length - 1];

// Only the glyphs this screen needs. Kept at module scope so they are one shape
// each — the reference handoff is explicit that a name must render one picture.
const DIcon = ({ name, size = 14, color = 'currentColor', sw = 1.5 }) => {
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
        strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (name) {
        case 'shield':   return <svg {...p}><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/></svg>;
        case 'pin':      return <svg {...p}><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>;
        case 'link':     return <svg {...p}><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19"/></svg>;
        case 'calendar': return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
        case 'wrench':   return <svg {...p}><path d="M15 3a5 5 0 00-4.3 7.6L4 17.3V20h2.7l6.7-6.7A5 5 0 1015 3z"/></svg>;
        case 'check':    return <svg {...p}><path d="M20 6L9 17l-5-5"/></svg>;
        case 'alert':    return <svg {...p}><path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17.5v.01"/></svg>;
        case 'renew':    return <svg {...p}><path d="M3 12a9 9 0 1015.5-6.3M21 4v5h-5"/></svg>;
        case 'building': return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>;
        case 'home':     return <svg {...p}><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/></svg>;
        case 'factory':  return <svg {...p}><path d="M3 21V10l5 3V10l5 3V8l6 3v10z"/><path d="M7 17h1M12 17h1M17 17h1"/></svg>;
        case 'gov':      return <svg {...p}><path d="M3 21h18M4 21V10M20 21V10M12 3l9 5H3z"/><path d="M8 21v-7M12 21v-7M16 21v-7"/></svg>;
        default:         return null;
    }
};

const eyebrow = (color, size) => ({ fontSize: size || 9.5, fontWeight: 600, color: color || T.inkMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans });

const PlanBadge = ({ pres, small }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        padding: small ? '2px 7px' : '3px 9px', fontSize: small ? 10 : 10.5, fontWeight: 700,
        letterSpacing: 0.4, textTransform: 'uppercase', color: pres.color, background: pres.fill,
        borderRadius: 2, fontFamily: T.sans }}>
        {pres.id !== 'none' && <DIcon name="shield" size={small ? 9 : 10} color={pres.color}/>}
        {pres.label}
    </span>
);

const PropertyTag = ({ type, types }) => {
    const ptype = (types || []).find(x => x.id === (type || 'commercial'));
    return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: ptype?.unlisted ? T.warn : T.inkMid, fontFamily: T.sans }}>
        <DIcon name={ptype?.icon || 'building'} size={11} color={ptype?.unlisted ? T.warn : T.inkMuted}/>{ptype?.label || labelise(type || 'commercial')}
    </span>
    );
};

const FacetGroup = ({ label, note, first, children }) => (
    <div style={{ marginBottom: 18, borderTop: first ? 'none' : `1px solid ${T.border}`, paddingTop: first ? 0 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 8 }}>
            <div style={eyebrow(T.ink)}>{label}</div>
            {note && <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{note}</div>}
        </div>
        {children}
    </div>
);

const TierFacet = ({ pres, count, value, active, onClick }) => (
    <div onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: T.r,
            cursor: 'pointer', marginBottom: 3, fontFamily: T.sans,
            background: active ? pres.fill : 'transparent',
            boxShadow: active ? `inset 2px 0 0 ${pres.color}` : 'none' }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: pres.color, flexShrink: 0 }}/>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 700 : 600,
            color: active ? pres.color : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pres.label}</span>
        {pres.id !== 'none' && value > 0 && (
            <span style={{ fontSize: 10.5, color: T.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{money(value)}</span>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: active ? pres.color : T.inkMid,
            minWidth: 18, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
);

const CheckFacet = ({ label, count, checked, dim, onClick }) => (
    <div onClick={dim ? undefined : onClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', borderRadius: T.r,
            cursor: dim ? 'default' : 'pointer', opacity: dim ? 0.42 : 1, fontFamily: T.sans }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0,
            background: checked ? T.ink : T.surface,
            border: `1.5px solid ${checked ? T.ink : T.borderStrong}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {checked && <DIcon name="check" size={10} color={T.surface}/>}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: checked ? 600 : 500, color: T.ink }}>{label}</span>
        <span style={{ fontSize: 10.5, color: T.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
);

const MiniStat = ({ label, value, tone }) => (
    <div style={{ flex: 1, minWidth: 0, padding: '9px 11px', background: T.surface,
        border: `1px solid ${T.border}`, borderRadius: T.r }}>
        <div style={eyebrow(null, 9)}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: tone || T.ink, marginTop: 3,
            fontFamily: T.sans, fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
);

const WorkRow = ({ icon, label, meta }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: 6 }}>
        <DIcon name={icon} size={14} color={T.inkMid}/>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>{meta}</div>
        </div>
    </div>
);

const money = (n) => n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n);
const shortDate = (iso) => iso ? fromYmd(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

// The edit form, unchanged in content from the previous single-column view — the
// redesign replaces the LAYOUT, not the ability to edit a customer. It is hoisted
// to module scope so it is one component type across renders rather than a new
// one per keystroke.
// linkedAccount and copyFromAccount are PROPS, not closure reads. This form used
// to be declared inside CustomersView and picked them up from the parent scope;
// hoisting it to module scope (correct — it was remounting on every keystroke)
// left those two references dangling, and `copyFromAccount` never existed at all.
const CustomerEditForm = ({ draft, set, accounts, techs, plans, propertyTypes, planOnDraft, linkedAccount, copyFromAccount,
    prefTech, prefMissing, prefOptions, saving, status, onSave, onCancel }) => (
    <div style={{ maxWidth: 620 }}>
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
                        {/* A type removed from settings must not fall through to the
                            first option — that silently reassigns the customer. */}
                        {draft.customerType && !(propertyTypes || []).some(t => t.id === draft.customerType) && (
                            <option value={draft.customerType}>Unlisted type ({draft.customerType})</option>
                        )}
                        {(propertyTypes || []).filter(t => !t.unlisted).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </CustFieldRow>
                <CustFieldRow label="Service plan">
                    <select value={draft.servicePlanId || ''} onChange={e => set('servicePlanId', e.target.value || null)} style={custInput}>
                        <option value="">— No plan —</option>
                        {/* A deleted plan must not fall through to "No plan":
                            that clears real coverage on the next save. */}
                        {draft.servicePlanId && !(plans || []).some(p => p.id === draft.servicePlanId) && (
                            <option value={draft.servicePlanId}>Deleted plan ({draft.servicePlanId})</option>
                        )}
                        {(plans || [])
                            .filter(p => p.active !== false || p.id === draft.servicePlanId)
                            .map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.name}{p.active === false ? ' (inactive)' : ''}
                                </option>
                            ))}
                    </select>
                    {planOnDraft && (
                        <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                            {[
                                planOnDraft.visitsPerYear ? `${planOnDraft.visitsPerYear} visit${planOnDraft.visitsPerYear === 1 ? '' : 's'}/yr` : null,
                                planOnDraft.includedHours ? `${planOnDraft.includedHours} hrs included` : null,
                                planOnDraft.responseHours ? `${planOnDraft.responseHours}h response` : null,
                            ].filter(Boolean).join(' · ') || 'No terms recorded on this plan.'}
                        </div>
                    )}
                </CustFieldRow>
            </div>

            {/* Legacy coverage. `serviceAgreement` predates plans and is the
                only record of what this customer was on beforehand, so it is
                shown rather than silently overwritten when a plan is chosen. */}
            {draft.serviceAgreement && draft.serviceAgreement !== 'none' && (
                <div style={{ padding: '7px 10px', marginBottom: 12, borderRadius: T.r,
                    background: draft.servicePlanId ? T.surface2 : `${T.warn}12`,
                    borderLeft: `3px solid ${draft.servicePlanId ? T.borderStrong : T.warn}`,
                    fontSize: 11.5, fontFamily: T.sans, color: T.inkMid }}>
                    Legacy agreement label: <strong style={{ color: T.ink }}>{labelise(draft.serviceAgreement)}</strong>
                    {draft.servicePlanId
                        ? ' — superseded by the plan above, kept for reference.'
                        : ' — not yet mapped to a service plan. Pick one above, or leave it if this customer is genuinely uncovered.'}
                    {' '}
                    <span onClick={() => set('serviceAgreement', 'none')}
                        style={{ color: T.info, fontWeight: 600, cursor: 'pointer' }}>Clear label</span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <CustFieldRow label="Plan starts">
                    <input type="date" value={draft.planStartDate || ''}
                        onChange={e => set('planStartDate', e.target.value || null)}
                        disabled={!draft.servicePlanId}
                        style={{ ...custInput, opacity: draft.servicePlanId ? 1 : 0.5,
                            border: (draft.servicePlanId && !draft.planStartDate) ? `1px solid ${T.warn}` : undefined }}/>
                    {/* This date is the anchor every visit is counted from. Without
                        it the customer is simply absent from Service Due — silently,
                        which is exactly the failure mode worth shouting about. */}
                    {draft.servicePlanId && !draft.planStartDate && (
                        <div style={{ marginTop: 5, fontSize: 11, color: T.warn, fontFamily: T.sans }}>
                            Required — visits are counted from this date. Without it no visit will ever come due.
                        </div>
                    )}
                </CustFieldRow>
                {/* agreementExpiry existed on the record from the start with no
                    control to set it, so every renewal warning was unreachable. */}
                <CustFieldRow label="Coverage ends">
                    <input type="date" value={draft.agreementExpiry || ''}
                        onChange={e => set('agreementExpiry', e.target.value || null)}
                        disabled={coverageOf(draft, plans).kind === 'none'}
                        style={{ ...custInput, opacity: coverageOf(draft, plans).kind === 'none' ? 0.5 : 1 }}/>
                </CustFieldRow>
            </div>

            <CustFieldRow label="Preferred technician">
                <select value={draft.preferredTechId || ''} onChange={e => set('preferredTechId', e.target.value || null)} style={custInput}>
                    <option value="">— No preference —</option>
                    {/* A stale id must not fall through to the first option: an
                        unmatched select value renders as "No preference" and the
                        next save would clear a real preference without saying so. */}
                    {prefMissing && <option value={draft.preferredTechId}>Unknown technician ({draft.preferredTechId})</option>}
                    {prefOptions.map(t => (
                        <option key={t.id} value={t.id}>
                            {t.name}{t.status !== 'active' ? ` (${labelise(t.status || 'inactive')})` : ''}
                        </option>
                    ))}
                </select>
                {prefMissing && (
                    <div style={{ marginTop: 5, fontSize: 11, fontFamily: T.sans, color: T.danger }}>
                        This technician is no longer on the roster. Pick another, or set no preference and save to clear it.
                    </div>
                )}
                {prefTech && prefTech.status !== 'active' && (
                    <div style={{ marginTop: 5, fontSize: 11, fontFamily: T.sans, color: T.warn }}>
                        {prefTech.name} is {labelise(prefTech.status)}. The crew builder will still favour them when they return.
                    </div>
                )}
            </CustFieldRow>

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
                <button onClick={onSave} disabled={saving}
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
        <div style={{ marginTop: 4 }}>
            <button onClick={onCancel}
                style={{ padding: '8px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
                    borderRadius: T.r, fontSize: 13, fontWeight: 600, color: T.inkMid,
                    cursor: 'pointer', fontFamily: T.sans }}>
                {draft._isNew ? 'Discard' : 'Done editing'}
            </button>
        </div>
    </div>
);

const CustomersView = ({ customers, accounts, techs, jobs, plans, propertyTypes, onSaved, onScheduleJob, onGoToDue, confirmDiscard }) => {
    const [query,      setQuery]      = React.useState('');
    const [selectedId, setSelectedId] = React.useState(null);
    const [draft,      setDraft]      = React.useState(null);
    const [editing,    setEditing]    = React.useState(false);
    const [saving,     setSaving]     = React.useState(false);
    const [status,     setStatus]     = React.useState(null);
    const [showEmpty,  setShowEmpty]  = React.useState(false);

    // Multi-select within a group (OR), AND across groups — the reference
    // behaviour. Sets rather than a single value, which the old chips used.
    const [fPlans,     setFPlans]     = React.useState(() => new Set());
    const [fTypes,     setFTypes]     = React.useState(() => new Set());
    const [fHistory,   setFHistory]   = React.useState(() => new Set());
    const [fAttention, setFAttention] = React.useState(() => new Set());

    const todayStr = React.useMemo(() => ymd(new Date()), []);
    const soonStr  = React.useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 30); return ymd(d); }, []);

    const stats = React.useMemo(() => {
        const m = {};
        (customers || []).forEach(c => { m[c.id] = custStats(c, jobs, todayStr); });
        return m;
    }, [customers, jobs, todayStr]);

    // Overdue PM count per customer, straight from the recurrence model — the
    // same numbers the Service Due queue shows, so the two can never disagree.
    const overdueBy = React.useMemo(() => {
        const m = {};
        (customers || []).forEach(c => {
            const plan = (plans || []).find(p => p.id === c.servicePlanId);
            if (!plan) { m[c.id] = 0; return; }
            const st = planVisitState(c, plan, jobs, todayStr);
            m[c.id] = st.state === 'overdue' ? 1 + (st.missed || 0) : (st.missed || 0);
        });
        return m;
    }, [customers, plans, jobs, todayStr]);

    const presentation = React.useMemo(() => planPresentation(plans, customers), [plans, customers]);
    const presOf = (c) => presentationFor(c, presentation);

    const renewalDays = (c) => {
        const covered = !!c.servicePlanId || (c.serviceAgreement && c.serviceAgreement !== 'none');
        if (!covered || !c.agreementExpiry) return null;
        return daysBetween(todayStr, c.agreementExpiry);
    };

    const q = query.trim().toLowerCase();
    const textMatch = (c) => !q
        || (c.name || '').toLowerCase().includes(q)
        || (c.customerNumber || '').toLowerCase().includes(q);

    const attentionHit = (c, key) => {
        if (key === 'renewal')   { const d = renewalDays(c); return d != null && d <= 30; }
        if (key === 'overdue')   return (overdueBy[c.id] || 0) > 0;
        if (key === 'unsched')   return !(stats[c.id] || {}).nextDate;
        return false;
    };

    const matches = (c) => {
        if (!textMatch(c)) return false;
        if (fPlans.size     && !fPlans.has(c.servicePlanId || 'none')) return false;
        if (fTypes.size     && !fTypes.has(c.customerType || 'commercial')) return false;
        if (fHistory.size   && !fHistory.has(activityBucket(stats[c.id] || { upcoming: 0, completed: 0 }))) return false;
        if (fAttention.size && ![...fAttention].some(k => attentionHit(c, k))) return false;
        return true;
    };

    // Sorted by renewal urgency: the thing the "Needs attention" group exists for
    // should also be the default reading order. Customers with no renewal date
    // fall to the bottom rather than sorting as zero.
    const list = (customers || []).filter(matches).slice().sort((a, b) => {
        const ra = renewalDays(a), rb = renewalDays(b);
        if (ra == null && rb == null) return (a.name || '').localeCompare(b.name || '');
        if (ra == null) return 1;
        if (rb == null) return -1;
        return ra - rb;
    });

    // Counts ignore their OWN group so a facet's number answers "what would I get
    // if I clicked this", not "what is left after everything already applied".
    const countExcluding = (group, predicate) => (customers || []).filter(c => {
        if (!textMatch(c)) return false;
        if (group !== 'plan'      && fPlans.size     && !fPlans.has(c.servicePlanId || 'none')) return false;
        if (group !== 'type'      && fTypes.size     && !fTypes.has(c.customerType || 'commercial')) return false;
        if (group !== 'history'   && fHistory.size   && !fHistory.has(activityBucket(stats[c.id] || { upcoming: 0, completed: 0 }))) return false;
        if (group !== 'attention' && fAttention.size && ![...fAttention].some(k => attentionHit(c, k))) return false;
        return predicate(c);
    }).length;

    const toggle = (setter) => (key) => setter(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const anyFilter = fPlans.size || fTypes.size || fHistory.size || fAttention.size;
    const clearAll = () => { setFPlans(new Set()); setFTypes(new Set()); setFHistory(new Set()); setFAttention(new Set()); };

    // Header ledger.
    const underContract = (customers || []).filter(c => c.servicePlanId);
    const contractARR = underContract.reduce((s, c) => {
        const p = (plans || []).find(x => x.id === c.servicePlanId);
        return s + (p ? annualPlanValue(p) : 0);
    }, 0);

    // The record pane must never sit empty the way the old one did — EXCEPT while
    // a new customer is being created. `startNew` clears selectedId to mean "no row
    // is selected", which this effect read as "nothing selected, select the first
    // one", immediately re-pointing at an existing customer; the editing effect
    // below then overwrote the blank draft with that customer's data. Pressing
    // "+ New customer" opened an existing record.
    const creating = !!(draft && draft._isNew);
    React.useEffect(() => {
        if (creating) return;
        if (selectedId && list.some(c => c.id === selectedId)) return;
        if (list.length) setSelectedId(list[0].id);
        else setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.map(c => c.id).join(','), selectedId, creating]);

    const selected = (customers || []).find(c => c.id === selectedId) || null;

    React.useEffect(() => {
        if (!editing) return;
        // A new customer has no row to load from, and loading `null` over it would
        // blank the form the moment the user started typing.
        if (draft && draft._isNew) return;
        const c = (customers || []).find(x => x.id === selectedId);
        setDraft(c ? { ...c } : null);
        setStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing, selectedId]);

    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

    // Everything that abandons an in-progress form goes through here, so there is
    // one place deciding whether to warn — not a confirm bolted onto each call
    // site, which is how one of them ends up missing it.
    const guarded = (action) => {
        if (draftIsDirty(draft, (customers || []).find(c => c.id === draft?.id))) {
            if (confirmDiscard) { confirmDiscard(UNSAVED_MSG, action); return; }
        }
        action();
    };

    const startNew = () => guarded(() => {
        setSelectedId(null);
        setDraft({ _isNew: true, id: 'cust_' + crypto.randomUUID(), name: '', accountId: '',
            contactName: '', contactPhone: '', contactEmail: '',
            customerType: (propertyTypes || [])[0]?.id || 'commercial',
            serviceAddress: '', serviceCity: '', serviceState: '', serviceZip: '',
            serviceAgreement: 'none', servicePlanId: '', planStartDate: '', preferredTechId: '',
            doNotService: false, doNotServiceReason: '', notes: '' });
        setEditing(true);
        setStatus(null);
    });

    const planOnDraft = draft && draft.servicePlanId ? (plans || []).find(p => p.id === draft.servicePlanId) : null;
    const prefTech    = draft && draft.preferredTechId ? (techs || []).find(t => t.id === draft.preferredTechId) : null;
    const prefMissing = !!(draft && draft.preferredTechId) && !prefTech;
    const prefOptions = (techs || [])
        .filter(t => t.status === 'active' || t.id === (draft && draft.preferredTechId))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const save = async () => {
        if (!draft || !(draft.name || '').trim()) { setStatus({ kind: 'err', msg: 'Name is required.' }); return; }
        setSaving(true); setStatus(null);
        try {
            const body = { ...draft, name: draft.name.trim(), accountId: draft.accountId || null,
                preferredTechId: draft.preferredTechId || null,
                servicePlanId:   draft.servicePlanId   || null,
                planStartDate:   draft.planStartDate   || null };
            const isNew = body._isNew; delete body._isNew;
            const res = await dbFetch('/.netlify/functions/dispatch-customers'
                + (isNew ? '' : '?id=' + encodeURIComponent(draft.id)), {
                method: isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot change customers.' : (data.error || 'HTTP ' + res.status));
            const saved = data.customer || body;
            onSaved(saved);
            // Clear the draft so `creating` goes false again — otherwise the
            // auto-select guard above stays disabled for the rest of the session.
            setDraft(null);
            setSelectedId(saved.id);
            setEditing(false);
            setStatus({ kind: 'ok', msg: 'Saved.' });
        } catch (err) {
            setStatus({ kind: 'err', msg: err.message });
        }
        setSaving(false);
    };

    const st  = selected ? (stats[selected.id] || {}) : {};
    const pres = selected ? presOf(selected) : null;
    const selPlan = selected ? (plans || []).find(p => p.id === selected.servicePlanId) : null;
    const rDays = selected ? renewalDays(selected) : null;
    const linkedAccount = selected && selected.accountId ? (accounts || []).find(a => a.id === selected.accountId) : null;

    // Resolved against the DRAFT, not the selected row: while editing, the account
    // being pointed at is whichever one the picker currently shows.
    const draftAccount = draft && draft.accountId ? (accounts || []).find(a => a.id === draft.accountId) : null;

    // Copies the CRM account's address onto the service address. Never overwrites
    // silently — a service address that is already filled in is usually a site
    // address that deliberately differs from the billing account.
    const copyFromAccount = () => {
        if (!draftAccount) return;
        setDraft(d => ({
            ...d,
            serviceAddress: d.serviceAddress || draftAccount.address || '',
            serviceCity:    d.serviceCity    || draftAccount.city    || '',
            serviceState:   d.serviceState   || draftAccount.state   || '',
            serviceZip:     d.serviceZip     || draftAccount.zip     || '',
        }));
    };

    const custJobs = selected ? (jobs || []).filter(j => j.customerId === selected.id) : [];
    const upcoming = custJobs
        .filter(j => j.scheduledDate && j.scheduledDate >= todayStr && j.status !== 'completed' && j.status !== 'cancelled')
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).slice(0, 4);
    const recent = custJobs
        .filter(j => j.status === 'completed' && j.scheduledDate)
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)).slice(0, 4);
    const techName = (id) => (techs || []).find(t => t.id === id)?.name || 'Unassigned';

    const HIST = [
        { k: 'repeat', label: 'Repeat (2+)' },
        { k: 'once',   label: 'Served once' },
        { k: 'never',  label: 'Never served' },
    ];

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Ledger line + actions */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, padding: '0 0 12px', flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontFamily: T.serif, fontStyle: 'italic', color: T.ink, lineHeight: 1.15 }}>
                        Service customers
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMid, marginTop: 4, fontFamily: T.sans }}>
                        {(customers || []).length} customer{(customers || []).length === 1 ? '' : 's'}
                        {' · '}{underContract.length} under contract
                        {contractARR > 0 && ` · ${money(contractARR)} contract value`}
                    </div>
                </div>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or CUST-…"
                    style={{ ...custInput, width: 190, padding: '7px 9px', fontSize: 12.5 }}/>
                {onGoToDue && (
                    <button onClick={onGoToDue}
                        style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap',
                            background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r,
                            cursor: 'pointer', fontFamily: T.sans }}>
                        Mass-schedule PM visits
                    </button>
                )}
                <button onClick={startNew}
                    style={{ padding: '8px 15px', fontSize: 12.5, fontWeight: 700, color: T.surface, whiteSpace: 'nowrap',
                        background: T.ink, border: 'none', borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                    + New customer
                </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '236px 336px 1fr',
                border: `1px solid ${T.border}`, borderRadius: T.r, background: T.bg, overflow: 'hidden' }}>

                {/* ── LEFT: organised facets ─────────────────────────────── */}
                <div style={{ borderRight: `1px solid ${T.border}`, minHeight: 0, overflow: 'auto', padding: '16px 14px' }}>
                    <FacetGroup label="Service contract" note="primary" first>
                        {presentation.map(p => {
                            const n = countExcluding('plan', c => (c.servicePlanId || 'none') === p.id);
                            if (n === 0 && !showEmpty && !fPlans.has(p.id)) return null;
                            const value = (customers || [])
                                .filter(c => (c.servicePlanId || 'none') === p.id)
                                .reduce((s) => s + (p.plan ? annualPlanValue(p.plan) : 0), 0);
                            return <TierFacet key={p.id} pres={p} count={n} value={value}
                                active={fPlans.has(p.id)} onClick={() => toggle(setFPlans)(p.id)}/>;
                        })}
                    </FacetGroup>

                    <FacetGroup label="Property type">
                        {(propertyTypes || []).map(t => {
                            const n = countExcluding('type', c => (c.customerType || 'commercial') === t.id);
                            if (n === 0 && !showEmpty && !fTypes.has(t.id)) return null;
                            return <CheckFacet key={t.id} label={t.unlisted ? `${t.label} (unlisted)` : t.label}
                                count={n} dim={n === 0}
                                checked={fTypes.has(t.id)} onClick={() => toggle(setFTypes)(t.id)}/>;
                        })}
                    </FacetGroup>

                    <FacetGroup label="Service history">
                        {HIST.map(h => {
                            const n = countExcluding('history', c => activityBucket(stats[c.id] || { upcoming: 0, completed: 0 }) === h.k);
                            if (n === 0 && !showEmpty && !fHistory.has(h.k)) return null;
                            return <CheckFacet key={h.k} label={h.label} count={n} dim={n === 0}
                                checked={fHistory.has(h.k)} onClick={() => toggle(setFHistory)(h.k)}/>;
                        })}
                    </FacetGroup>

                    <FacetGroup label="Needs attention">
                        {[
                            { k: 'renewal', label: 'Renewal ≤ 30 days' },
                            { k: 'overdue', label: 'Overdue PM visits' },
                            { k: 'unsched', label: 'No visit scheduled' },
                        ].map(a => {
                            const n = countExcluding('attention', c => attentionHit(c, a.k));
                            if (n === 0 && !showEmpty && !fAttention.has(a.k)) return null;
                            return <CheckFacet key={a.k} label={a.label} count={n} dim={n === 0}
                                checked={fAttention.has(a.k)} onClick={() => toggle(setFAttention)(a.k)}/>;
                        })}
                    </FacetGroup>

                    <button onClick={() => setShowEmpty(v => !v)}
                        style={{ width: '100%', marginTop: 4, padding: '6px 0', fontSize: 11, fontWeight: 600,
                            color: T.goldInk, background: 'transparent', border: `1px dashed ${T.borderStrong}`,
                            borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                        {showEmpty ? 'Hide empty options' : 'Show empty options'}
                    </button>
                    {anyFilter > 0 && (
                        <button onClick={clearAll}
                            style={{ width: '100%', marginTop: 6, padding: '6px 0', fontSize: 11, fontWeight: 600,
                                color: T.inkMid, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.sans }}>
                            Clear all filters
                        </button>
                    )}
                </div>

                {/* ── MIDDLE: the list ───────────────────────────────────── */}
                <div style={{ borderRight: `1px solid ${T.border}`, minHeight: 0, overflow: 'auto', background: T.surface }}>
                    <div style={{ padding: '11px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex',
                        alignItems: 'baseline', gap: 8, position: 'sticky', top: 0, background: T.surface, zIndex: 1 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>
                            {fPlans.size === 1
                                ? (presentation.find(p => fPlans.has(p.id)) || {}).label
                                : anyFilter ? 'Filtered' : 'All customers'}
                        </span>
                        <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                            {list.length} of {(customers || []).length} · sorted by renewal
                        </span>
                    </div>
                    {list.length === 0 && (
                        <div style={{ padding: '16px 14px', fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>
                            No customers match these filters.
                        </div>
                    )}
                    {list.map(c => {
                        const p  = presOf(c);
                        const cs = stats[c.id] || {};
                        const on = c.id === selectedId;
                        const od = overdueBy[c.id] || 0;
                        const rd = renewalDays(c);
                        return (
                            <div key={c.id} onClick={() => guarded(() => { setDraft(null); setSelectedId(c.id); setEditing(false); })}
                                style={{ padding: '11px 14px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                                    background: on ? 'rgba(200,185,154,0.16)' : 'transparent',
                                    boxShadow: on ? `inset 3px 0 0 ${p.color}` : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                    <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.mono }}>{c.customerNumber || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                                    <PlanBadge pres={p} small/><PropertyTag type={c.customerType} types={propertyTypes}/>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 11,
                                    color: T.inkMuted, fontFamily: T.sans, flexWrap: 'wrap' }}>
                                    <span>{cs.completed ? `${cs.completed} visit${cs.completed === 1 ? '' : 's'}` : 'Never served'}</span>
                                    <span>·</span>
                                    <span>{cs.nextDate ? `Next ${shortDate(cs.nextDate)}` : 'Unscheduled'}</span>
                                    {od > 0 && <><span>·</span><span style={{ color: T.warn, fontWeight: 700 }}>{od} overdue</span></>}
                                    {rd != null && rd <= 30 && <><span>·</span><span style={{ color: T.danger, fontWeight: 700 }}>{rd}d</span></>}
                                    {c.doNotService && <><span>·</span><span style={{ color: T.danger, fontWeight: 700 }}>do not service</span></>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── RIGHT: the service-customer record ─────────────────── */}
                <div style={{ minHeight: 0, overflow: 'auto', padding: '18px 24px 24px' }}>
                    {editing && draft ? (
                        <CustomerEditForm draft={draft} set={set} accounts={accounts} techs={techs} plans={plans}
                            propertyTypes={propertyTypes}
                            linkedAccount={draftAccount} copyFromAccount={copyFromAccount}
                            planOnDraft={planOnDraft} prefTech={prefTech} prefMissing={prefMissing} prefOptions={prefOptions}
                            saving={saving} status={status} onSave={save}
                            onCancel={() => guarded(() => { setEditing(false); setDraft(null); setStatus(null); })}/>
                    ) : !selected ? (
                        <div style={{ fontSize: 13, color: T.inkMuted, fontFamily: T.sans, fontStyle: 'italic' }}>
                            No customers yet. Use <strong style={{ color: T.ink }}>+ New customer</strong> to add the first one.
                        </div>
                    ) : (
                        <>
                            {/* Identity */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: 22, fontFamily: T.serif, fontStyle: 'italic', color: T.ink, lineHeight: 1.15 }}>
                                            {selected.name}
                                        </div>
                                        <PlanBadge pres={pres}/>
                                        {selected.doNotService && (
                                            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.danger, fontFamily: T.sans,
                                                background: `${T.danger}1a`, padding: '2px 8px', borderRadius: 999 }}>Do not service</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 12,
                                        color: T.inkMid, fontFamily: T.sans, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: T.mono, fontSize: 11 }}>{selected.customerNumber || '—'}</span>
                                        <span>·</span>
                                        <PropertyTag type={selected.customerType} types={propertyTypes}/>
                                        {(selected.serviceAddress || selected.serviceCity) && <>
                                            <span>·</span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <DIcon name="pin" size={11} color={T.inkMuted}/>
                                                {[selected.serviceAddress, selected.serviceCity, selected.serviceState].filter(Boolean).join(', ')}
                                            </span>
                                        </>}
                                    </div>
                                    {linkedAccount && (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11.5,
                                            fontWeight: 600, color: T.goldInk, background: T.surface, padding: '4px 9px',
                                            border: `1px solid ${T.border}`, borderRadius: 999, fontFamily: T.sans }}>
                                            <DIcon name="link" size={11} color={T.goldInk}/>Linked to account · {linkedAccount.name}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    <button onClick={() => setEditing(true)}
                                        style={{ padding: '7px 13px', fontSize: 12, fontWeight: 600, color: T.inkMid,
                                            background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r,
                                            cursor: 'pointer', fontFamily: T.sans }}>Edit details</button>
                                    {onScheduleJob && (
                                        <button onClick={() => onScheduleJob(selected)}
                                            style={{ padding: '7px 13px', fontSize: 12, fontWeight: 700, color: T.surface,
                                                background: T.ink, border: 'none', borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                                            Schedule job
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Contract card */}
                            <div style={{ marginTop: 18, padding: '14px 16px', background: pres.fill,
                                borderLeft: `3px solid ${pres.color}`, borderRadius: T.r }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <DIcon name="shield" size={15} color={pres.color}/>
                                    <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
                                        color: pres.color, fontFamily: T.sans }}>
                                        {selPlan ? `${pres.label} contract` : 'No service contract'}
                                    </span>
                                    <div style={{ flex: 1 }}/>
                                    {rDays != null && rDays <= 30 && (
                                        <span style={{ fontSize: 10.5, fontWeight: 700, color: T.danger, fontFamily: T.sans,
                                            background: `${T.danger}1a`, padding: '2px 8px', borderRadius: 999 }}>
                                            {rDays < 0 ? `Expired ${Math.abs(rDays)} days ago` : `Renews in ${rDays} days`}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 12 }}>
                                    <div>
                                        <div style={eyebrow(null, 9)}>Response SLA</div>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginTop: 2, fontFamily: T.sans }}>
                                            {selPlan ? planSlaText(selPlan) : 'Best effort'}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={eyebrow(null, 9)}>Preventive maintenance</div>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginTop: 2, fontFamily: T.sans }}>
                                            {planPmText(selPlan)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={eyebrow(null, 9)}>Annual value</div>
                                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginTop: 2,
                                            fontFamily: T.sans, fontVariantNumeric: 'tabular-nums' }}>
                                            {selPlan && annualPlanValue(selPlan) > 0
                                                ? '$' + Math.round(annualPlanValue(selPlan)).toLocaleString()
                                                : '—'}
                                        </div>
                                    </div>
                                </div>
                                {selected.servicePlanId && !selected.planStartDate && (
                                    <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 600, color: T.warn, fontFamily: T.sans }}>
                                        No plan start date — visits are counted from it, so none will ever come due.
                                    </div>
                                )}
                            </div>

                            {/* Service stats */}
                            <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
                                <MiniStat label="Visits to date" value={st.completed ?? 0}/>
                                <MiniStat label="Open jobs"     value={st.upcoming ?? 0}/>
                                <MiniStat label="Last service"
                                    value={st.lastServed ? `${daysBetween(st.lastServed, todayStr)}d ago` : 'Never'}/>
                                <MiniStat label="Overdue PM" value={overdueBy[selected.id] || 0}
                                    tone={(overdueBy[selected.id] || 0) > 0 ? T.warn : undefined}/>
                            </div>

                            {/* Upcoming + recent */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
                                <div>
                                    <div style={{ ...eyebrow(T.ink), marginBottom: 9 }}>Upcoming work</div>
                                    {upcoming.length === 0 && (
                                        <div style={{ fontSize: 11.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>Nothing scheduled.</div>
                                    )}
                                    {upcoming.map(j => (
                                        <WorkRow key={j.id} icon="calendar" label={j.title || 'Job'}
                                            meta={`${shortDate(j.scheduledDate)} · ${techName(j.assignedTechId)}`}/>
                                    ))}
                                </div>
                                <div>
                                    <div style={{ ...eyebrow(T.ink), marginBottom: 9 }}>Recent service</div>
                                    {recent.length === 0 && (
                                        <div style={{ fontSize: 11.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>No completed visits yet.</div>
                                    )}
                                    {recent.map(j => (
                                        <WorkRow key={j.id} icon="wrench" label={j.title || 'Job'}
                                            meta={`${shortDate(j.scheduledDate)} · ${techName(j.assignedTechId)}`}/>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
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

const TechniciansView = ({ techsRaw, users, vehicles, skills, certs, licenseLevels, onSaved, confirmDiscard }) => {
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
        // `startNew` clears selectedId and then sets a blank draft. Without this
        // guard the effect fired on that same change, found no matching row, and
        // set the draft back to null — so with a technician selected, "+ New"
        // produced NO FORM AT ALL. Only reload from a row when not creating.
        if (draft && draft._isNew) return;
        setDraft(selected ? { ...selected } : null);
        setStatus(null);
    }, [selectedId]);   // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

    const guarded = (action) => {
        if (draftIsDirty(draft, (techsRaw || []).find(t => t.id === draft?.id))) {
            if (confirmDiscard) { confirmDiscard(UNSAVED_MSG, action); return; }
        }
        action();
    };

    const startNew = () => guarded(() => {
        setSelectedId(null);
        setStatus(null);
        setDraft({ id: 'dtech_' + crypto.randomUUID(), _isNew: true, firstName: '', lastName: '',
            userId: '', email: '', phone: '', employmentType: 'employee', status: 'active',
            homeZip: '', skills: [], laborRate: '', overtimeRate: '', assignedVehicleId: '', notes: '' });
    });

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
                        <div key={t.id} onClick={() => guarded(() => setSelectedId(t.id))}
                            style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                                background: t.id === selectedId ? T.surface2 : 'transparent' }}>
                            <div style={{ fontSize: 13, fontWeight: t.id === selectedId ? 700 : 500, color: T.ink, fontFamily: T.sans }}>
                                {t.firstName} {t.lastName}
                            </div>
                            <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{labelise(t.employmentType)}</span>
                                {t.userId
                                    ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.ok}14`, color: T.ok, fontWeight: 700 }}>app user</span>
                                    : <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.inkMuted}14`, color: T.inkMuted, fontWeight: 700 }}>no login</span>}
                                {t.status !== 'active' && (
                                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${T.warn}14`, color: T.warn, fontWeight: 700 }}>{labelise(t.status)}</span>
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
                                    {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{labelise(t)}</option>)}
                                </select>
                            </CustFieldRow>
                            <CustFieldRow label="Status">
                                <select value={draft.status || 'active'} onChange={e => set('status', e.target.value)} style={custInput}>
                                    {TECH_STATUSES.map(s => <option key={s} value={s}>{labelise(s)}</option>)}
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
                        {JOB_STATUSES.map(s2 => <option key={s2} value={s2}>{labelise(s2)}</option>)}
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
                                    {labelise(normalisePriority(j.priority))}
                                </span>
                                <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{labelise(j.status)}</span>
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
                                    {JOB_STATUSES.map(s2 => <option key={s2} value={s2}>{labelise(s2)}</option>)}
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

// ── Mass-schedule planner ─────────────────────────────────────────────────────
// Reuses scoreTech, so bulk assignment ranks candidates and detects blockers with
// exactly the same logic as the crew builder — no second implementation to drift.
//
// Nothing is written until the proposal is confirmed. A job whose every candidate
// carries a blocker is left alone and reported as unplaceable, rather than being
// assigned with a warning nobody reads.
// Mass-scheduling. Three things this used to ignore, all of which produced
// proposals that the single-job scheduler would have refused:
//
//   1. crewSize — one technician was assigned regardless, so a job needing three
//      was silently under-crewed. Partial crews are now SKIPPED with a reason
//      rather than proposed: a job that looks scheduled but is two techs short is
//      worse than one that is visibly still in the queue.
//   2. equipCategories — availability was never checked, so two jobs in the same
//      run could both claim the last pressure tester.
//   3. Placements made EARLIER IN THIS RUN were invisible to equipment checks.
//      Technician load already had a running `busy` ledger; equipment needed the
//      same, or the first two proposals would each look fine in isolation.
const planWeek = ({ jobs, techs, skills, blocks, blockTypes, vehicles = [], equipUnits = [], fromStr, toStr }) => {
    const proposals = [];
    const skipped   = [];

    // Running per-tech load so the planner does not stack every job on the best tech.
    const busy = {};   // techId -> [{ date, start, end }]
    techs.forEach(t => {
        busy[t.id] = jobs
            .filter(j => (j.assignedTechIds || []).includes(t.id) && j.start != null)
            .map(j => ({ date: j.scheduledDate, start: j.start, end: j.start + (j.durationHrs || 2) }));
    });

    // Running equipment ledger — existing commitments plus everything placed so far
    // in this run. Shaped like a job so it can be fed straight to equipmentConflicts.
    const placedSoFar = [];

    const equipFree = (job, dateStr, startHr) => {
        if (!(job.equipCategories || []).length) return [];
        return equipmentConflicts(
            job,
            [...jobs, ...placedSoFar],
            equipUnits,
            dateStr,
            { start: startHr, durationHrs: job.durationHrs || 2 });
    };

    // Every technician who could work this job on this day, each with the first
    // slot inside their own shift where they are free. Sorted best-first.
    const candidatesForDay = (job, dateStr) => {
        const dur = job.durationHrs || 2;
        return techs
            .map(t => ({ tech: t, ...scoreTech(t, job, jobs, skills, { blocks, blockTypes, vehicles, dateStr }) }))
            .filter(c => c.blockers.length === 0)
            .sort((a, b) => b.score - a.score)
            .map(c => {
                const shift = shiftForDate(c.tech, dateStr);
                if (!shift) return null;
                const shiftStart = hhToNum(shift.start);
                const shiftEnd   = hhToNum(shift.end);
                // Partial-day time off carves further holes out of the shift.
                const partials = blocksOnDate(blocks, c.tech.id, dateStr)
                    .filter(b => b.allDay === false && b.startTime && b.endTime)
                    .map(b => ({ start: hhToNum(b.startTime), end: hhToNum(b.endTime) }));

                const slots = [];
                for (const h of DSP_HOURS) {
                    if (h < shiftStart || h + dur > shiftEnd) continue;
                    const clash = (busy[c.tech.id] || []).some(b =>
                        b.date === dateStr && h < b.end && (h + dur) > b.start);
                    if (clash) continue;
                    if (partials.some(pb => h < pb.end && (h + dur) > pb.start)) continue;
                    slots.push(h);
                }
                return slots.length ? { ...c, slots } : null;
            })
            .filter(Boolean);
    };

    // A crew must work the SAME hour, so the slot is chosen first and the crew
    // assembled from whoever is free then — not the other way round, which would
    // pick the best techs and then find they never overlap.
    const crewForDay = (job, dateStr, need) => {
        const cands = candidatesForDay(job, dateStr);
        if (cands.length < need) return { crew: null, shortfall: cands.length };

        for (const h of DSP_HOURS) {
            const free = cands.filter(c => c.slots.includes(h));
            if (free.length < need) continue;
            const eq = equipFree(job, dateStr, h);
            if (eq.length) continue;                 // equipment busy at this hour
            return { crew: free.slice(0, need), startHr: h };
        }
        // Distinguish "not enough people" from "people, but never at the same time
        // or the kit was busy" — they need different fixes.
        return { crew: null, shortfall: cands.length, noCommonSlot: true };
    };

    // Unscheduled jobs only; urgent first so the best techs go to the worst jobs.
    const queue = jobs
        .filter(j => !j.start || (j.assignedTechIds || []).length === 0)
        .slice()
        .sort((a, b) => (PRIORITY_RANK[normalisePriority(b.priority)] ?? 1) - (PRIORITY_RANK[normalisePriority(a.priority)] ?? 1));

    for (const job of queue) {
        const need = Math.max(1, parseInt(job.crewSize, 10) || 1);

        // Respect an existing date; otherwise try each day in the window.
        const days = job.scheduledDate
            ? [job.scheduledDate]
            : (() => {
                const out = []; let d = fromYmd(fromStr);
                while (ymd(d) <= toStr) { out.push(ymd(d)); d = addDays(d, 1); }
                return out;
            })();

        let placed = null;
        let lastMiss = null;
        for (const dateStr of days) {
            const r = crewForDay(job, dateStr, need);
            if (r.crew) { placed = { dateStr, crew: r.crew, startHr: r.startHr }; break; }
            lastMiss = r;
        }

        if (!placed) {
            const anyCandidate = techs
                .map(t => ({ tech: t, ...scoreTech(t, job, jobs, skills, { blocks, blockTypes, vehicles, dateStr: job.scheduledDate }) }))
                .sort((a, b) => a.blockers.length - b.blockers.length)[0];

            let reason;
            if (need > 1 && lastMiss && lastMiss.shortfall < need && !lastMiss.noCommonSlot) {
                reason = `Needs ${need} technicians; only ${lastMiss.shortfall} available`;
            } else if (need > 1 && lastMiss && lastMiss.noCommonSlot) {
                reason = `Needs ${need} technicians free at the same time — no common slot`;
            } else if (anyCandidate?.blockers?.length) {
                reason = anyCandidate.blockers[0];
            } else if ((job.equipCategories || []).length) {
                // Only claim equipment when technicians were genuinely available.
                reason = 'No slot where the required equipment is free';
            } else {
                reason = 'No technician free in this window';
            }
            skipped.push({ job, reason });
            continue;
        }

        const dur = job.durationHrs || 2;
        placed.crew.forEach(c => {
            busy[c.tech.id] = [...(busy[c.tech.id] || []),
                { date: placed.dateStr, start: placed.startHr, end: placed.startHr + dur }];
        });
        // Booked equipment becomes visible to every later job in this same run.
        placedSoFar.push({
            id: 'plan_' + job.id,
            equipCategories: job.equipCategories || [],
            scheduledDate: placed.dateStr,
            start: placed.startHr,
            durationHrs: dur,
            status: 'scheduled',
        });

        proposals.push({
            job,
            tech: placed.crew[0].tech,                       // lead
            crew: placed.crew.map(c => c.tech),
            dateStr: placed.dateStr,
            startHr: placed.startHr,
            score: placed.crew[0].score,
        });
    }

    return { proposals, skipped };
};

const hhmm = (hr) => `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.round((hr % 1) * 60)).padStart(2, '0')}`;

const MassSchedulePanel = ({ plan, fromStr, toStr, saving, progress, onCancel, onConfirm }) => (
    <div onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', zIndex: 99998,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={e => e.stopPropagation()}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
                width: 640, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>
                    Proposed schedule
                </div>
                <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans, marginTop: 3 }}>
                    {fromStr} to {toStr} · {plan.proposals.length} to assign
                    {plan.skipped.length > 0 && ` · ${plan.skipped.length} unplaceable`}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                {plan.proposals.length === 0 && plan.skipped.length === 0 && (
                    <div style={{ fontSize: 13, color: T.inkMuted, fontFamily: T.sans, padding: '10px 0' }}>
                        Nothing to schedule — every job in this window already has a crew.
                    </div>
                )}

                {plan.proposals.map(pr => (
                    <div key={pr.job.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ width: 3, alignSelf: 'stretch', background: prioColor(pr.job.priority), borderRadius: 2 }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {pr.job.title || pr.job.customer}
                            </div>
                            <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                {pr.dateStr} · {fmt12(pr.startHr)} · {pr.job.durationHrs || 2}h
                            </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                            {(pr.crew || [pr.tech]).length > 1
                                ? `${pr.tech.name} +${(pr.crew || []).length - 1}`
                                : pr.tech.name}
                        </div>
                        <span style={{ fontSize: 10.5, fontFamily: T.mono, color: T.inkMuted, width: 26, textAlign: 'right' }}>
                            {pr.score}
                        </span>
                    </div>
                ))}

                {plan.skipped.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.warn, textTransform: 'uppercase',
                            letterSpacing: 0.6, marginBottom: 6, fontFamily: T.sans }}>
                            Cannot be placed — left unscheduled
                        </div>
                        {plan.skipped.map(sk => (
                            <div key={sk.job.id} style={{ padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
                                <div style={{ fontSize: 12.5, color: T.ink, fontFamily: T.sans }}>
                                    {sk.job.title || sk.job.customer}
                                </div>
                                <div style={{ fontSize: 11, color: T.warn, fontFamily: T.sans }}>{sk.reason}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                {saving && (
                    <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.mono, marginRight: 'auto' }}>
                        {progress.done}/{progress.total} scheduled{progress.failed ? ` · ${progress.failed} failed` : ''}
                    </span>
                )}
                <button onClick={onCancel} disabled={saving}
                    style={{ padding: '7px 14px', background: 'transparent', color: T.inkMid,
                        border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                        cursor: saving ? 'default' : 'pointer', fontFamily: T.sans }}>
                    Cancel
                </button>
                <button onClick={onConfirm} disabled={saving || plan.proposals.length === 0}
                    style={{ padding: '7px 16px', background: (saving || plan.proposals.length === 0) ? T.borderStrong : T.ink,
                        color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                        cursor: (saving || plan.proposals.length === 0) ? 'default' : 'pointer', fontFamily: T.sans }}>
                    {saving ? 'Scheduling…' : `Schedule ${plan.proposals.length} job${plan.proposals.length === 1 ? '' : 's'}`}
                </button>
            </div>
        </div>
    </div>
);


// ── Availability model ────────────────────────────────────────────────────────
// Two independent layers:
//   1. workingHours (jsonb on dispatch_technicians) — the recurring weekly shift
//      pattern. A day that is missing or null means "not working".
//   2. dispatch_schedule_blocks — dated exceptions (PTO, sick, training…).
// Both were declared in the schema and never used. Nothing consumes them for
// scheduling yet; that lands with the scoreTech integration.

// Jobs this technician is already committed to during a proposed time-off range.
// An all-day block conflicts with everything that day; a partial block only with
// jobs whose hours actually overlap it.
const jobsDuringBlock = (jobs, blk) => (jobs || []).filter(j => {
    if (!(j.assignedTechIds || []).includes(blk.techId)) return false;
    if (!j.scheduledDate) return false;
    if (j.scheduledDate < blk.startDate || j.scheduledDate > blk.endDate) return false;
    if (blk.allDay !== false) return true;
    if (j.start == null || !blk.startTime || !blk.endTime) return true;
    const jStart = j.start, jEnd = j.start + (j.durationHrs || 2);
    return jStart < hhToNum(blk.endTime) && jEnd > hhToNum(blk.startTime);
});

const schNav = { padding: '4px 8px', background: 'transparent', border: `1px solid ${T.border}`,
    borderRadius: T.r, fontSize: 13, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans, lineHeight: 1 };

const ScheduleView = ({ techsRaw, jobs, blocks, blockTypes, anchor, onPrev, onNext, onToday, onSaveBlock, onDeleteBlock, onSaveHours }) => {
    const weekStart = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const todayStr = ymd(new Date());
    const RAIL_W = 200;

    const [editing, setEditing] = React.useState(null);   // { techId, dateStr } | block
    const [hoursFor, setHoursFor] = React.useState(null); // techId whose pattern is open
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState('');
    const [conflict, setConflict] = React.useState(null);   // { block, jobs }

    const typeOf = (id) => (blockTypes || []).find(t => t.id === id) || null;

    const blank = (techId, dateStr) => ({
        id: 'dblk_' + crypto.randomUUID(), techId,
        blockType: (blockTypes || [])[0]?.id || 'pto',
        startDate: dateStr, endDate: dateStr, allDay: true,
        startTime: '', endTime: '', title: '', notes: '', _isNew: true,
    });

    const submit = async () => {
        if (!editing) return;
        if (editing.endDate < editing.startDate) { setErr('End date cannot be before the start date.'); return; }
        if (!editing.allDay && (!editing.startTime || !editing.endTime)) {
            setErr('A partial-day block needs both a start and an end time.'); return;
        }
        // Warn before booking someone out over work they are already committed to.
        // Saving silently would leave jobs assigned to a technician who is away.
        const clashing = jobsDuringBlock(jobs, editing);
        if (clashing.length > 0) { setConflict({ block: editing, jobs: clashing }); return; }

        setBusy(true); setErr('');
        try { await onSaveBlock(editing); setEditing(null); }
        catch (e) { setErr(e.message); }
        finally { setBusy(false); }
    };

    const confirmWithUnassign = async () => {
        setBusy(true); setErr('');
        try {
            await onSaveBlock(conflict.block, conflict.jobs.map(j => j.id));
            setConflict(null); setEditing(null);
        } catch (e) { setErr(e.message); }
        finally { setBusy(false); }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                <button onClick={onPrev} style={schNav}>‹</button>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans, minWidth: 150 }}>
                    {fromYmd(ymd(weekStart)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {fromYmd(ymd(addDays(weekStart, 6))).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <button onClick={onNext} style={schNav}>›</button>
                {ymd(anchor) !== todayStr && (
                    <button onClick={onToday} style={{ ...schNav, width: 'auto', padding: '4px 10px' }}>This week</button>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                    Click a cell to mark someone out
                </span>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
                <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3,
                    background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: RAIL_W, flexShrink: 0, borderRight: `1px solid ${T.border}` }}/>
                    {days.map(d => {
                        const ds = ymd(d);
                        return (
                            <div key={ds} style={{ flex: 1, minWidth: 118, padding: '7px 0', textAlign: 'center',
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

                {(techsRaw || []).length === 0 && (
                    <div style={{ padding: 24, fontSize: 13, color: T.inkMuted, fontFamily: T.sans, fontStyle: 'italic' }}>
                        No technicians yet.
                    </div>
                )}

                {(techsRaw || []).map(tech => (
                    <div key={tech.id} style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, minHeight: 62 }}>
                        <div style={{ width: RAIL_W, flexShrink: 0, borderRight: `1px solid ${T.border}`,
                            padding: '10px 12px', background: T.surface }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>
                                {tech.firstName} {tech.lastName}
                            </div>
                            <span onClick={() => setHoursFor(hoursFor === tech.id ? null : tech.id)}
                                style={{ fontSize: 10.5, color: T.info, fontFamily: T.sans, cursor: 'pointer', fontWeight: 600 }}>
                                {Object.keys(tech.workingHours || {}).length ? 'Edit shift pattern' : 'Set shift pattern'}
                            </span>
                        </div>
                        {days.map(d => {
                            const ds = ymd(d);
                            const shift = shiftForDate(tech, ds);
                            const dayBlocks = blocksOnDate(blocks, tech.id, ds);
                            return (
                                <div key={ds} onClick={() => { setErr(''); setEditing(blank(tech.id, ds)); }}
                                    style={{ flex: 1, minWidth: 118, borderRight: `1px solid ${T.border}`,
                                        padding: 5, cursor: 'pointer',
                                        background: !shift ? `${T.border}55` : ds === todayStr ? `${T.gold}12` : 'transparent' }}>
                                    {!shift && dayBlocks.length === 0 && (
                                        <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>Off</div>
                                    )}
                                    {shift && dayBlocks.length === 0 && (
                                        <div style={{ fontSize: 10.5, color: T.inkMid, fontFamily: T.mono }}>
                                            {shift.start}–{shift.end}
                                        </div>
                                    )}
                                    {dayBlocks.map(b => {
                                        const bt = typeOf(b.blockType);
                                        const col = bt?.color || T.inkMuted;
                                        return (
                                            <div key={b.id}
                                                onClick={e => { e.stopPropagation(); setErr(''); setEditing({ ...b }); }}
                                                style={{ padding: '3px 6px', marginBottom: 3, borderRadius: T.r,
                                                    background: `${col}1e`, borderLeft: `3px solid ${col}` }}>
                                                <div style={{ fontSize: 10.5, fontWeight: 600, color: col, fontFamily: T.sans,
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {bt?.name || b.blockType}
                                                </div>
                                                {!b.allDay && b.startTime && (
                                                    <div style={{ fontSize: 9.5, color: T.inkMuted, fontFamily: T.mono }}>
                                                        {b.startTime}–{b.endTime}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {hoursFor && (
                <ShiftPatternDialog
                    tech={(techsRaw || []).find(t => t.id === hoursFor)}
                    onCancel={() => setHoursFor(null)}
                    onSave={async (wh) => { await onSaveHours(hoursFor, wh); setHoursFor(null); }}/>
            )}

            {conflict && (
                <div onClick={() => !busy && setConflict(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.5)', zIndex: 99999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()}
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
                            padding: 20, width: 480, maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.danger, fontFamily: T.sans, marginBottom: 8 }}>
                            Already scheduled
                        </div>
                        <div style={{ fontSize: 13, color: T.inkMid, fontFamily: T.sans, lineHeight: 1.55, marginBottom: 12 }}>
                            This technician is committed to {conflict.jobs.length} job{conflict.jobs.length === 1 ? '' : 's'} during
                            that time. Accepting the time off will unassign them and return the work to the queue to be re-crewed.
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
                            {conflict.jobs.map(j => (
                                <div key={j.id} style={{ display: 'flex', gap: 8, alignItems: 'center',
                                    padding: '7px 0', borderBottom: `1px solid ${T.border}` }}>
                                    <span style={{ width: 3, alignSelf: 'stretch', background: prioColor(j.priority), borderRadius: 2 }}/>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans,
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {j.title || j.customer}
                                        </div>
                                        <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                            {j.scheduledDate}{j.start != null ? ` · ${fmt12(Math.floor(j.start))}` : ''} · {j.durationHrs || 2}h
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {err && (
                            <div style={{ fontSize: 12, color: T.danger, fontWeight: 600, fontFamily: T.sans, marginBottom: 10 }}>{err}</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setConflict(null)} disabled={busy}
                                style={{ padding: '7px 14px', background: 'transparent', color: T.inkMid,
                                    border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                                    cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                                Reject — keep the schedule
                            </button>
                            <button onClick={confirmWithUnassign} disabled={busy}
                                style={{ padding: '7px 16px', background: busy ? T.borderStrong : T.danger, color: '#fbf8f3',
                                    border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                                    cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                                {busy ? 'Working…' : 'Accept & re-crew'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editing && (
                <div onClick={() => !busy && setEditing(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', zIndex: 99998,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()}
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
                            padding: 20, width: 420, maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: T.sans, marginBottom: 14 }}>
                            {editing._isNew ? 'Mark unavailable' : 'Edit time off'}
                        </div>

                        <CustFieldRow label="Reason">
                            <select value={editing.blockType}
                                onChange={e => setEditing(p => ({ ...p, blockType: e.target.value }))} style={custInput}>
                                {(blockTypes || []).length === 0 && <option value="">No types defined</option>}
                                {(blockTypes || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </CustFieldRow>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <CustFieldRow label="From">
                                <input type="date" value={editing.startDate}
                                    onChange={e => setEditing(p => ({ ...p, startDate: e.target.value }))} style={custInput}/>
                            </CustFieldRow>
                            <CustFieldRow label="To">
                                <input type="date" value={editing.endDate}
                                    onChange={e => setEditing(p => ({ ...p, endDate: e.target.value }))} style={custInput}/>
                            </CustFieldRow>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                            fontSize: 13, color: T.ink, fontFamily: T.sans, cursor: 'pointer' }}>
                            <input type="checkbox" checked={editing.allDay !== false}
                                onChange={e => setEditing(p => ({ ...p, allDay: e.target.checked }))}/>
                            All day
                        </label>

                        {editing.allDay === false && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <CustFieldRow label="Start">
                                    <input type="time" value={editing.startTime || ''}
                                        onChange={e => setEditing(p => ({ ...p, startTime: e.target.value }))} style={custInput}/>
                                </CustFieldRow>
                                <CustFieldRow label="End">
                                    <input type="time" value={editing.endTime || ''}
                                        onChange={e => setEditing(p => ({ ...p, endTime: e.target.value }))} style={custInput}/>
                                </CustFieldRow>
                            </div>
                        )}

                        <CustFieldRow label="Notes">
                            <textarea value={editing.notes || ''} rows={2}
                                onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                                style={{ ...custInput, resize: 'vertical' }}/>
                        </CustFieldRow>

                        {err && (
                            <div style={{ fontSize: 12, color: T.danger, fontWeight: 600, fontFamily: T.sans, marginBottom: 10 }}>{err}</div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                            {!editing._isNew && (
                                <button onClick={async () => { setBusy(true); try { await onDeleteBlock(editing.id); setEditing(null); } catch (e) { setErr(e.message); } finally { setBusy(false); } }}
                                    disabled={busy}
                                    style={{ marginRight: 'auto', padding: '7px 12px', background: 'transparent', color: T.danger,
                                        border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                                        cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                                    Delete
                                </button>
                            )}
                            <button onClick={() => setEditing(null)} disabled={busy}
                                style={{ padding: '7px 14px', background: 'transparent', color: T.inkMid,
                                    border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                                    cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                                Cancel
                            </button>
                            <button onClick={submit} disabled={busy}
                                style={{ padding: '7px 16px', background: busy ? T.borderStrong : T.ink, color: '#fbf8f3',
                                    border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                                    cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                                {busy ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Recurring weekly pattern. Unchecked day = not working, which is what makes a
// grey "Off" cell on the schedule grid.
const ShiftPatternDialog = ({ tech, onCancel, onSave }) => {
    const [wh, setWh] = React.useState(() => ({ ...(tech?.workingHours || {}) }));
    const [busy, setBusy] = React.useState(false);

    const toggle = (k) => setWh(p => {
        const next = { ...p };
        if (next[k]) delete next[k]; else next[k] = { ...DEFAULT_SHIFT };
        return next;
    });

    return (
        <div onClick={() => !busy && onCancel()}
            style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', zIndex: 99998,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
                    padding: 20, width: 420, maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: T.sans, marginBottom: 4 }}>
                    Shift pattern
                </div>
                <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans, marginBottom: 14 }}>
                    {tech?.firstName} {tech?.lastName} — repeats every week.
                </div>

                {DAY_KEYS.map((k, i) => {
                    const on = !!wh[k];
                    return (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 7, width: 92, cursor: 'pointer',
                                fontSize: 12.5, color: T.ink, fontFamily: T.sans }}>
                                <input type="checkbox" checked={on} onChange={() => toggle(k)}/>
                                {DOW[i]}
                            </label>
                            {on ? (
                                <>
                                    <input type="time" value={wh[k].start}
                                        onChange={e => setWh(p => ({ ...p, [k]: { ...p[k], start: e.target.value } }))}
                                        style={{ ...custInput, padding: '5px 7px', width: 110 }}/>
                                    <span style={{ fontSize: 12, color: T.inkMuted }}>to</span>
                                    <input type="time" value={wh[k].end}
                                        onChange={e => setWh(p => ({ ...p, [k]: { ...p[k], end: e.target.value } }))}
                                        style={{ ...custInput, padding: '5px 7px', width: 110 }}/>
                                </>
                            ) : (
                                <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>Not working</span>
                            )}
                        </div>
                    );
                })}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button onClick={onCancel} disabled={busy}
                        style={{ padding: '7px 14px', background: 'transparent', color: T.inkMid,
                            border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                            cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                        Cancel
                    </button>
                    <button onClick={async () => { setBusy(true); try { await onSave(wh); } finally { setBusy(false); } }}
                        disabled={busy}
                        style={{ padding: '7px 16px', background: busy ? T.borderStrong : T.ink, color: '#fbf8f3',
                            border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600,
                            cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                        {busy ? 'Saving…' : 'Save pattern'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// ── Technician field view ─────────────────────────────────────────────────────
// What a Technician sees instead of the dispatcher UI. Deliberately narrow: the
// server only permits status transitions plus techNotes / completionNotes /
// photosCount / customerSignature on their own jobs, so anything else here would
// render a control the API refuses.
//
// This is also the shape the mobile app should mirror — my jobs, my schedule.
const TECH_NEXT = {
    scheduled: [{ to: 'en_route',  label: 'Start travel' }],
    en_route:  [{ to: 'on_site',   label: 'Arrived on site' }],
    on_site:   [{ to: 'paused',    label: 'Pause' }, { to: 'completed', label: 'Complete job' }],
    paused:    [{ to: 'on_site',   label: 'Resume' }],
};

const TechJobCard = ({ job, customerName, blocks, onUpdate, busyId }) => {
    const [notes, setNotes] = React.useState(job.techNotes || '');
    const [completion, setCompletion] = React.useState(job.completionNotes || '');
    const [open, setOpen] = React.useState(false);
    const [err, setErr] = React.useState('');

    const busy = busyId === job.id;
    const nexts = TECH_NEXT[job.status] || [];
    const done = job.status === 'completed';

    const run = async (patch) => {
        setErr('');
        try { await onUpdate(job.id, patch); }
        catch (e) { setErr(e.message); }
    };

    return (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, marginBottom: 10,
            background: T.surface, borderLeft: `4px solid ${prioColor(job.priority)}`, opacity: done ? 0.72 : 1 }}>
            <div onClick={() => setOpen(o => !o)} style={{ padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.ink, fontFamily: T.sans, flex: 1 }}>
                        {job.title}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                        background: done ? `${T.ok}1e` : `${T.info}1e`, color: done ? T.ok : T.info }}>
                        {labelise(job.status)}
                    </span>
                </div>
                <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: T.sans, marginTop: 3 }}>
                    {customerName}
                </div>
                <div style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.mono, marginTop: 2 }}>
                    {job.scheduledDate}{job.scheduledStart ? ` \u00b7 ${job.scheduledStart}` : ''}
                    {job.durationMinutes ? ` \u00b7 ${Math.round(job.durationMinutes / 6) / 10}h` : ''}
                </div>
            </div>

            {open && (
                <div style={{ padding: '0 14px 14px' }}>
                    {job.description && (
                        <div style={{ fontSize: 12.5, color: T.inkMid, fontFamily: T.sans, marginBottom: 10, lineHeight: 1.5 }}>
                            {job.description}
                        </div>
                    )}

                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: T.inkMid,
                        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontFamily: T.sans }}>
                        Notes from the field
                    </label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                        placeholder="What you found, what you did…"
                        style={{ ...custInput, resize: 'vertical', marginBottom: 8 }}/>
                    <button onClick={() => run({ techNotes: notes })} disabled={busy}
                        style={{ padding: '6px 12px', background: 'transparent', color: T.inkMid,
                            border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600,
                            cursor: busy ? 'default' : 'pointer', fontFamily: T.sans, marginBottom: 12 }}>
                        Save notes
                    </button>

                    {(job.status === 'on_site' || done) && (
                        <>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: T.inkMid,
                                textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontFamily: T.sans }}>
                                Completion notes
                            </label>
                            <textarea value={completion} onChange={e => setCompletion(e.target.value)} rows={2}
                                style={{ ...custInput, resize: 'vertical', marginBottom: 12 }}/>
                        </>
                    )}

                    {err && (
                        <div style={{ fontSize: 12, color: T.danger, fontWeight: 600, fontFamily: T.sans, marginBottom: 8 }}>{err}</div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {nexts.map(n => (
                            <button key={n.to} disabled={busy}
                                onClick={() => run(n.to === 'completed'
                                    ? { status: 'completed', completionNotes: completion, techNotes: notes }
                                    : { status: n.to })}
                                style={{ padding: '8px 16px',
                                    background: n.to === 'completed' ? T.ok : T.ink, color: '#fbf8f3',
                                    border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 600,
                                    cursor: busy ? 'default' : 'pointer', fontFamily: T.sans }}>
                                {busy ? 'Saving\u2026' : n.label}
                            </button>
                        ))}
                        {done && (
                            <span style={{ fontSize: 12, color: T.ok, fontWeight: 600, fontFamily: T.sans }}>
                                Completed — contact dispatch if this needs reopening.
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const TechnicianView = ({ jobs, customers, blocks, blockTypes, myTech, onUpdate, busyId }) => {
    const todayStr = ymd(new Date());
    const custName = (id) => (customers || []).find(c => c.id === id)?.name || 'Customer';

    const sorted = (jobs || []).slice().sort((a, b) =>
        (a.scheduledDate || '9999').localeCompare(b.scheduledDate || '9999')
        || String(a.scheduledStart || '').localeCompare(String(b.scheduledStart || '')));

    const today    = sorted.filter(j => j.scheduledDate === todayStr && j.status !== 'completed');
    const upcoming = sorted.filter(j => (j.scheduledDate || '') > todayStr && j.status !== 'completed');
    const earlier  = sorted.filter(j => j.status !== 'completed'
        && j.scheduledDate && j.scheduledDate < todayStr);
    const finished = sorted.filter(j => j.status === 'completed').slice(-5).reverse();

    const myBlocks = (blocks || []).filter(b => b.endDate >= todayStr).slice(0, 3);

    const Section = ({ title, list, empty }) => (
        <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase',
                letterSpacing: 0.6, marginBottom: 8, fontFamily: T.sans }}>{title}</div>
            {list.length === 0
                ? <div style={{ fontSize: 12.5, color: T.inkMuted, fontFamily: T.sans, fontStyle: 'italic' }}>{empty}</div>
                : list.map(j => (
                    <TechJobCard key={j.id} job={j} customerName={custName(j.customerId)}
                        blocks={blocks} onUpdate={onUpdate} busyId={busyId}/>
                ))}
        </div>
    );

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 2px', maxWidth: 640 }}>
            {myTech && (
                <div style={{ marginBottom: 18, fontSize: 12.5, color: T.inkMid, fontFamily: T.sans }}>
                    {myTech.firstName} {myTech.lastName}
                    {myTech.licenseLevel ? ` \u00b7 ${myTech.licenseLevel}` : ''}
                </div>
            )}

            {earlier.length > 0 && (
                <Section title="Overdue" list={earlier} empty=""/>
            )}
            <Section title="Today" list={today} empty="Nothing scheduled for today."/>
            <Section title="Coming up" list={upcoming} empty="Nothing scheduled yet."/>

            {myBlocks.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase',
                        letterSpacing: 0.6, marginBottom: 8, fontFamily: T.sans }}>Your time off</div>
                    {myBlocks.map(b => {
                        const bt = (blockTypes || []).find(t => t.id === b.blockType);
                        return (
                            <div key={b.id} style={{ fontSize: 12.5, color: T.inkMid, fontFamily: T.sans, marginBottom: 4 }}>
                                {bt?.name || 'Time off'} · {b.startDate}{b.endDate !== b.startDate ? ` \u2013 ${b.endDate}` : ''}
                            </div>
                        );
                    })}
                </div>
            )}

            {finished.length > 0 && (
                <Section title="Recently completed" list={finished} empty=""/>
            )}
        </div>
    );
};

// ── MAIN DISPATCH TAB ─────────────────────────────────────────────────────────
export default function DispatchTab() {
    const { settings, opportunities, accounts, addAudit, userRole, showConfirm } = useApp();

    // Reuses the app-wide confirm modal rather than introducing a second dialog
    // style. Falls through to the action if the modal is unavailable — a missing
    // confirm must not silently swallow the click.
    const confirmDiscard = useCallback((msg, action) => {
        if (showConfirm) showConfirm(msg, action, true);
        else action();
    }, [showConfirm]);
    const isTech = userRole === 'Technician';

    // Sub-tab state persists to localStorage so navigating away and back restores
    // the last view, matching every other tab in the app (style guide §10).
    const [view, setViewRaw] = useState(() => localStorage.getItem('tab:dispatch:subView') || 'board');
    const setView = (v) => { setViewRaw(v); localStorage.setItem('tab:dispatch:subView', v); };
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
        opportunityId: '', needSkills: [], equipCategories: [], requiredVehicleType: '',
        servicePlanId: '', planDueDate: '' };
    const [newJobForm, setNewJobForm] = useState(EMPTY_JOB);
    // { id, name, applied[], skipped[], equip, prevForm }. prevForm is the form
    // as it stood before the template was applied, so Undo — and switching to a
    // second template — restore rather than compound.
    const [appliedTemplate, setAppliedTemplate] = useState(null);

    // ── DB-backed state ───────────────────────────────────────────────────────
    const [jobs,       setJobs]       = useState([]);
    const [techs,      setTechs]      = useState([]);
    const [vehicles,   setVehicles]   = useState([]);
    // Raw technician rows (userId, rates, notes) for the Technicians editor.
    const [techsRaw,   setTechsRaw]   = useState([]);
    const [jobsRaw,    setJobsRaw]    = useState([]);
    const [techBusyId, setTechBusyId] = useState(null);
    const [blocks,     setBlocks]     = useState([]);
    const [schedAnchor, setSchedAnchor] = useState(() => new Date());
    const [massPlan,   setMassPlan]   = useState(null);   // { proposals, skipped, fromStr, toStr }
    const [massSaving, setMassSaving] = useState(false);
    const [massProg,   setMassProg]   = useState({ done: 0, total: 0, failed: 0 });
    const [equipment,  setEquipment]  = useState([]);   // dispatch_equipment rows — one per physical unit
    const [servicePlans, setServicePlans] = useState([]);
    const [customers,  setCustomers]  = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [loadError,  setLoadError]  = useState('');

    // ── Config from settings.extra (not record-level data) ───────────────────
    const skills    = settings?.dispatchSkills   || [];

    const crews     = settings?.dispatchCrews    || [];
    const licLevels = settings?.dispatchLicenses || ['Apprentice', 'Journeyman', 'Master', 'Lead'];
    // Requirement vocabulary, derived from the equipment table rather than stored
    // separately — a category exists exactly when a unit carries it.
    const equipCategories = useMemo(
        () => [...new Set(equipment.map(e => (e.category || '').trim()).filter(Boolean))].sort(),
        [equipment]);
    // Requirable vehicle classes are the ones actually in the fleet. Offering a
    // class nobody owns would only ever produce a job no technician can serve.
    const vehicleTypes = useMemo(
        () => [...new Set(vehicles.map(v => (v.type || '').trim().toLowerCase()).filter(Boolean))].sort(),
        [vehicles]);

    // Org-configured premises segments, plus any unlisted value still on a record.
    const propertyTypes = useMemo(() => propertyTypesFor(settings, customers), [settings, customers]);

    // Synthetic rows for won opportunities with no dispatch job yet. Recomputed
    // whenever templates, customers or jobs change, so creating the real job makes
    // the placeholder disappear on the same render.
    const bridgeJobs = useMemo(() => buildWonBridgeJobs({
        opportunities, jobs, customers, accounts,
        templates: settings?.dispatchJobTemplates || [],
    }), [opportunities, jobs, customers, accounts, settings]);

    // Real jobs plus placeholders. `jobs` stays the real-rows-only list so service
    // history, plan recurrence and anything that writes cannot see a synthetic id.
    const jobsWithBridge = useMemo(() => [...jobs, ...bridgeJobs], [jobs, bridgeJobs]);

    // ── Service plan recurrence ───────────────────────────────────────────────
    // MUST stay below the state and derived values it closes over. `visitQueue`
    // is a useMemo, so it evaluates during render: declared any earlier it reads
    // `servicePlans` / `customers` / `jobs` in their temporal dead zone. Vite's
    // dev bundle tolerates that; the minified production build throws
    // "Cannot access 'X' before initialization" and the whole tab fails to mount.
    // ISO date. Deliberately not the `todayStr` further down this component, which
    // is a human-readable label ("Mon, Aug 10") used in the board header — string
    // comparison against a plan due date needs YYYY-MM-DD.
    const todayYmd = useMemo(() => ymd(new Date()), []);

    // Recomputed from jobs, so completing a visit moves the queue on immediately
    // without anything having to be written back to the customer or the plan.
    const visitQueue = useMemo(
        () => buildVisitQueue(customers, servicePlans, jobs, todayYmd),
        [customers, servicePlans, jobs, todayYmd]);
    const visitsActionable = visitQueue.filter(r => r.state === 'overdue' || r.state === 'due').length;

    // Opens New Job pre-filled for a plan occurrence. The visit is materialised
    // only here — planDueDate records WHICH occurrence it satisfies, which is what
    // stops a visit run three weeks late from looking like the next one.
    // Turn a Closed Won placeholder into a real job. The opportunity link is
    // carried through, so once saved the placeholder stops being generated —
    // buildWonBridgeJobs skips any opportunity already claimed by a job.
    const startBridgeJob = (row) => {
        let form = {
            ...EMPTY_JOB,
            customer:       row.customer || '',
            customerId:     row.customerId || '',
            accountId:      row.accountId  || '',
            opportunityId:  row.opportunityId,
            title:          row.title || '',
            address: row.address || '', city: row.city || '',
            state:   row.state   || '', zip:  row.zip  || '',
        };
        let note = null;
        const tmpl = (settings?.dispatchJobTemplates || []).find(t => t.id === row.templateId);
        if (tmpl) {
            const { next, applied, skipped } = applyJobTemplate(form, tmpl, { skills, licLevels, equipCategories, vehicleTypes });
            form = next;
            note = { id: tmpl.id, name: templateLabel(tmpl), applied, skipped,
                equip: (next.equipCategories || []).join(', '), prevForm: form };
        }
        setNewJobForm(form);
        setAppliedTemplate(note);
        setNewJobError(tmpl
            ? ''
            : 'No job template matched this opportunity, so crew, duration and licence are unset. Pick a template above or set them by hand.');
        setShowNewJobForm(true);
    };

    const startPlanVisit = (row) => {
        const cust = row.customer;
        const tmpl = (settings?.dispatchJobTemplates || []).find(t => t.id === row.plan.visitTemplateId);
        let form = {
            ...EMPTY_JOB,
            customer:      cust.name || '',
            customerId:    cust.id,
            accountId:     cust.accountId || '',
            title:         `${row.plan.name} visit`,
            address:       cust.address || '', city: cust.city || '',
            state:         cust.state   || '', zip:  cust.zip  || '',
            servicePlanId: row.plan.id,
            planDueDate:   row.due,
            window:        row.due,
        };
        let note = null;
        if (tmpl) {
            const { next, applied, skipped } = applyJobTemplate(form, tmpl, { skills, licLevels, equipCategories, vehicleTypes });
            form = next;
            note = { id: tmpl.id, name: templateLabel(tmpl), applied, skipped,
                equip: (next.equipCategories || []).join(', '), prevForm: form };
        }
        setNewJobForm(form);
        setAppliedTemplate(note);
        setNewJobError(tmpl ? '' : 'This plan has no visit template, so crew, duration and skills are unset.');
        setShowNewJobForm(true);
    };

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

                const [techsRes, vehiclesRes, equipRes, custsRes, jobsRes, blocksRes, plansRes] = await Promise.all([
                    dbFetch('/.netlify/functions/dispatch-technicians'),
                    dbFetch('/.netlify/functions/dispatch-vehicles'),
                    dbFetch('/.netlify/functions/dispatch-equipment'),
                    dbFetch('/.netlify/functions/dispatch-customers'),
                    dbFetch('/.netlify/functions/dispatch-jobs'),
                    dbFetch('/.netlify/functions/dispatch-schedule-blocks'),
                    dbFetch('/.netlify/functions/dispatch-service-plans'),
                ]);

                if (cancelled) return;

                // Surface non-2xx responses. Previously every response was parsed
                // blindly, so a 500 or 403 produced `{error}` with no `.customers`
                // key, fell through `|| []`, and rendered as "no customers yet" —
                // an endpoint failure was indistinguishable from an empty table.
                const failed = [
                    ['technicians', techsRes], ['vehicles', vehiclesRes], ['equipment', equipRes],
                    ['customers', custsRes],   ['jobs', jobsRes], ['schedule', blocksRes],
                    ['service plans', plansRes],
                ].filter(([, r]) => !r.ok);
                if (failed.length) {
                    const detail = failed.map(([n, r]) => `${n} (${r.status})`).join(', ');
                    throw new Error(`Dispatch data failed to load: ${detail}`);
                }

                const [techsData, vehiclesData, equipData, custsData, jobsData, blocksData, plansData] = await Promise.all([
                    techsRes.json(),
                    vehiclesRes.json(),
                    equipRes.json(),
                    custsRes.json(),
                    jobsRes.json(),
                    blocksRes.json(),
                    plansRes.json(),
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
                        // equipment_ids stores required equipment CATEGORIES, not asset
                        // ids. Asset-level checkout is tracked the other way round, on
                        // dispatch_equipment.checkedOutJobId.
                        equipCategories: j.equipmentIds || [],
                        requiredVehicleType: j.requiredVehicleType || null,
                        servicePlanId:  j.servicePlanId || null,
                        planDueDate:    j.planDueDate   || null,
                        value:          parseFloat(j.invoiceAmount || 0),
                        // Was hardcoded 'Journeyman', discarding the stored requirement —
                        // so every licence blocker compared against a constant.
                        minLicense:     j.minLicense || null,
                        // Comes from the customer record, not the current assignment.
                        // Was `j.assignedTechId || null`, which made the crew-builder
                        // preference rule circular: null on every unassigned job — the
                        // only case the builder runs on — and on an assigned job it
                        // handed the bonus to the tech who was already on it.
                        preferredTechId: cust?.preferredTechId || null,
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

                // Closed Won opportunities are surfaced as synthetic rows, but that
                // derivation lives in a useMemo below — it reads job templates and
                // customers, and this effect has [] deps, so anything resolved here
                // would be frozen against whatever settings held at mount.

                setTechs(dbTechs);
                setTechsRaw(techsData.technicians || []);
                setVehicles(vehiclesData.vehicles  || []);
                setEquipment(equipData.equipment   || []);
                setServicePlans(plansData.plans    || []);
                setCustomers(custsData.customers   || []);
                setJobs(normJobs);
                setJobsRaw(dbJobs);
                setBlocks(blocksData.blocks || []);
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
                equipmentIds:    newJobForm.equipCategories || [],
                requiredVehicleType: newJobForm.requiredVehicleType || null,
                servicePlanId:   newJobForm.servicePlanId || null,
                planDueDate:     newJobForm.planDueDate   || null,
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
                equipCategories: newJobForm.equipCategories || [],
                requiredVehicleType: newJobForm.requiredVehicleType || null,
                servicePlanId:   newJobForm.servicePlanId || null,
                planDueDate:     newJobForm.planDueDate   || null,
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
            setAppliedTemplate(null);
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
        if (!filterSkill && !filterVehicle && !filterLicense && !filterTeam) return jobsWithBridge;
        return jobsWithBridge.filter(j => {
            if (filterSkill && !(j.needSkills || []).includes(filterSkill)) return false;
            return true;
        });
    }, [jobsWithBridge, filterSkill, filterVehicle, filterLicense, filterTeam]);

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

    // Build a proposal for the coming week. Nothing is written here.
    const openMassSchedule = () => {
        const start = addDays(new Date(), 1);
        const fromStr = ymd(start);
        const toStr   = ymd(addDays(start, 6));
        const { proposals, skipped } = planWeek({
            // Placeholders are excluded: planWeek would propose a slot for a job
            // that does not exist, and every write would 404.
            jobs: filteredJobs.filter(j => !j.isBridge), techs: filteredTechs, skills, vehicles,
            equipUnits: equipment,
            blocks, blockTypes: settings?.dispatchBlockTypes || [],
            fromStr, toStr,
        });
        setMassProg({ done: 0, total: proposals.length, failed: 0 });
        setMassPlan({ proposals, skipped, fromStr, toStr });
    };

    // Commit the approved proposal, one PUT per job so a single failure does not
    // abandon the rest. Failures are counted and the panel stays open.
    const confirmMassSchedule = async () => {
        if (!massPlan) return;
        setMassSaving(true);
        let done = 0, failed = 0;
        const applied = [];
        for (const pr of massPlan.proposals) {
            try {
                const dur    = pr.job.durationHrs || 2;
                const startS = hhmm(pr.startHr);
                const endS   = hhmm(pr.startHr + dur);
                const res = await dbFetch('/.netlify/functions/dispatch-jobs?id=' + encodeURIComponent(pr.job.id), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: pr.job.id, status: 'scheduled',
                        // The whole crew is persisted, not just the lead. This used
                        // to send `coTechIds: []`, so a three-tech proposal was
                        // written as a one-tech job.
                        assignedTechId: pr.tech.id,
                        coTechIds: (pr.crew || []).slice(1).map(t => t.id),
                        scheduledDate: pr.dateStr, scheduledStart: startS, scheduledEnd: endS,
                        timeSlot: 'exact',
                    }),
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                applied.push(pr);
                done += 1;
            } catch (e) {
                failed += 1;
            }
            setMassProg({ done, total: massPlan.proposals.length, failed });
        }

        setJobs(prev => prev.map(j => {
            const pr = applied.find(a => a.job.id === j.id);
            // Whole crew, not just the lead — otherwise the board shows a
            // one-tech job until the next reload contradicts it.
            return pr ? { ...j, assignedTechIds: (pr.crew || [pr.tech]).map(t => t.id), start: pr.startHr,
                status: 'scheduled', scheduledDate: pr.dateStr, window: hhmm(pr.startHr) } : j;
        }));

        if (addAudit && applied.length) {
            addAudit('dispatch.schedule.bulk', 'dispatch_job', 'bulk',
                `${applied.length} jobs`,
                `Mass-scheduled ${applied.length} job${applied.length === 1 ? '' : 's'} ` +
                `${massPlan.fromStr}–${massPlan.toStr}` +
                (failed ? ` — ${failed} failed` : '') +
                (massPlan.skipped.length ? ` — ${massPlan.skipped.length} unplaceable` : ''));
        }

        setMassSaving(false);
        if (!failed) setMassPlan(null);
    };

    // Availability writes. Schedule blocks are dated exceptions; the weekly
    // pattern lives on the technician row itself.
    // unassignJobIds: work the technician can no longer do. Saved first so the
    // block is recorded even if a later unassign fails, then each job is returned
    // to the queue and the dispatcher is taken there to re-crew it.
    const saveBlock = async (blk, unassignJobIds = []) => {
        const isNew = !!blk._isNew;
        const body = { ...blk }; delete body._isNew;
        const res = await dbFetch('/.netlify/functions/dispatch-schedule-blocks'
            + (isNew ? '' : '?id=' + encodeURIComponent(blk.id)), {
            method: isNew ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (res.status === 403) throw new Error('Your role cannot change availability.');
            throw new Error(data.error || ('HTTP ' + res.status));
        }
        const saved = data.block;
        setBlocks(prev => {
            const i = prev.findIndex(b => b.id === saved.id);
            if (i === -1) return [...prev, saved];
            const next = [...prev]; next[i] = saved; return next;
        });

        if (!unassignJobIds.length) return;

        const freed = [];
        for (const jobId of unassignJobIds) {
            try {
                const r = await dbFetch('/.netlify/functions/dispatch-jobs?id=' + encodeURIComponent(jobId), {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: jobId, status: 'unscheduled',
                        assignedTechId: null, coTechIds: [],
                        scheduledStart: null, scheduledEnd: null,
                    }),
                });
                if (r.ok) freed.push(jobId);
            } catch (e) { /* counted below by omission */ }
        }

        setJobs(prev => prev.map(j => freed.includes(j.id)
            ? { ...j, assignedTechIds: [], start: null, status: 'unscheduled', window: 'TBD' }
            : j));

        const techName = (techsRaw.find(t => t.id === blk.techId) || {});
        if (addAudit) {
            addAudit('dispatch.timeoff.unassign', 'dispatch_technician', blk.techId,
                `${techName.firstName || ''} ${techName.lastName || ''}`.trim() || blk.techId,
                `Time off ${blk.startDate}–${blk.endDate} — ${freed.length} job(s) returned to the queue` +
                (freed.length !== unassignJobIds.length ? ` — ${unassignJobIds.length - freed.length} failed` : ''));
        }

        // Drop the dispatcher into the queue so the freed work is in front of them.
        if (freed.length) { setSelectedJobId(freed[0]); setView('queue'); }
    };

    const deleteBlock = async (id) => {
        const res = await dbFetch('/.netlify/functions/dispatch-schedule-blocks?id=' + encodeURIComponent(id), { method: 'DELETE' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setBlocks(prev => prev.filter(b => b.id !== id));
    };

    const saveWorkingHours = async (techId, workingHours) => {
        const res = await dbFetch('/.netlify/functions/dispatch-technicians?id=' + encodeURIComponent(techId), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: techId, workingHours }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        if (data.technician) setTechsRaw(prev => prev.map(t => t.id === techId ? data.technician : t));
    };

    // Field update. The server enforces the whitelist; this only sends fields it
    // accepts, so a rejection here means a genuine mismatch worth surfacing.
    const updateMyJob = async (jobId, patch) => {
        setTechBusyId(jobId);
        try {
            const res = await dbFetch('/.netlify/functions/dispatch-jobs?id=' + encodeURIComponent(jobId), {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: jobId, ...patch }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
            if (data.job) setJobsRaw(prev => prev.map(j => j.id === jobId ? data.job : j));
        } finally {
            setTechBusyId(null);
        }
    };

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

    // Technicians bypass the dispatcher chrome entirely. The server already
    // scopes /dispatch-jobs to their own assignments and /dispatch-technicians to
    // their own record, so jobsRaw and techsRaw here are already just theirs.
    if (isTech) {
        return (
            <div className="tab-page" style={{ background: T.bg, minHeight: '100%' }}>
                <div style={{ padding: '4px 0 14px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, letterSpacing: 1,
                        textTransform: 'uppercase', fontFamily: T.sans }}>Dispatch</div>
                    <div style={{ fontSize: 24, fontStyle: 'italic', fontWeight: 300, color: T.ink, fontFamily: T.serif }}>
                        My jobs
                    </div>
                </div>
                <TechnicianView
                    jobs={jobsRaw}
                    customers={customers}
                    blocks={blocks}
                    blockTypes={settings?.dispatchBlockTypes || []}
                    myTech={techsRaw[0] || null}
                    onUpdate={updateMyJob}
                    busyId={techBusyId}/>
            </div>
        );
    }

    return (
        <div className="tab-page" style={{ fontFamily: T.sans, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                padding: '14px 20px 14px', borderBottom: `1px solid ${T.border}`, background: T.bg, flexShrink: 0 }}>
                <div style={{ borderLeft: `3px solid ${T.goldInk}`, paddingLeft: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>DISPATCH</div>
                    <div style={{ fontSize: 24, color: T.ink, letterSpacing: -0.3, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300 }}>
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
                    <button onClick={openMassSchedule}
                        style={{ padding: '6px 14px', background: T.surface, border: `1px solid ${T.borderStrong}`,
                            borderRadius: T.r, fontSize: 12.5, fontWeight: 500, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                        Mass-schedule next week
                    </button>
                    <button onClick={() => { setNewJobForm(EMPTY_JOB); setAppliedTemplate(null); setNewJobError(''); setShowNewJobForm(true); }} style={{ padding: '6px 14px', background: T.ink, color: '#fbf8f3', border: 'none',
                        borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        + New job
                    </button>
                </div>
            </div>

            {massPlan && (
                <MassSchedulePanel plan={massPlan} fromStr={massPlan.fromStr} toStr={massPlan.toStr}
                    saving={massSaving} progress={massProg}
                    onCancel={() => { if (!massSaving) setMassPlan(null); }}
                    onConfirm={confirmMassSchedule}/>
            )}

            {/* Sub-tabs — same underline treatment as Quotes, Reports and Sales Manager */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 12, flexShrink: 0 }}>
                {[
                    { id: 'board',     label: 'Job Board' },
                    { id: 'queue',     label: 'Queue' },
                    { id: 'jobs',      label: 'Jobs' },
                    { id: 'due',       label: 'Service Due', count: visitsActionable },
                    { id: 'customers', label: 'Customers' },
                    { id: 'techs',     label: 'Technicians' },
                    { id: 'schedule',  label: 'Work Schedules' },
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
                            {v.count > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
                                    background: T.danger, color: T.surface, fontFamily: T.mono }}>{v.count}</span>
                            )}
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
                            <BoardView jobs={boardJobs} techs={filteredTechs} skills={skills}
                                blocks={blocks} blockTypes={settings?.dispatchBlockTypes || []}
                                dateStr={ymd(boardAnchor)} onJobClick={handleJobClick}/>
                        ) : boardRange === 'week' ? (
                            <WeekBoardView jobs={rangeJobs} techs={filteredTechs} skills={skills}
                                blocks={blocks} blockTypes={settings?.dispatchBlockTypes || []}
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
                ) : view === 'schedule' ? (
                    <ScheduleView techsRaw={techsRaw} jobs={jobsWithBridge} blocks={blocks}
                        blockTypes={settings?.dispatchBlockTypes || []}
                        anchor={schedAnchor}
                        onPrev={() => setSchedAnchor(a => addDays(a, -7))}
                        onNext={() => setSchedAnchor(a => addDays(a, 7))}
                        onToday={() => setSchedAnchor(new Date())}
                        onSaveBlock={saveBlock} onDeleteBlock={deleteBlock}
                        onSaveHours={saveWorkingHours}/>
                ) : view === 'techs' ? (
                    <TechniciansView techsRaw={techsRaw} users={settings?.users || []}
                        vehicles={vehicles} skills={skills} certs={settings?.dispatchCerts || []} licenseLevels={licLevels}
                        confirmDiscard={confirmDiscard}
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
                ) : view === 'due' ? (
                    <ServiceDueView rows={visitQueue} today={todayYmd}
                        onStart={startPlanVisit}
                        onOpenJob={id => { setSelectedJobId(id); setView('queue'); }}
                        onOpenCustomer={() => setView('customers')}/>
                ) : view === 'customers' ? (
                    <CustomersView customers={customers} accounts={accounts} techs={techs} jobs={jobs} plans={servicePlans} propertyTypes={propertyTypes} confirmDiscard={confirmDiscard}
                        onSaved={saved => setCustomers(prev => {
                            const i = prev.findIndex(c => c.id === saved.id);
                            if (i === -1) return [...prev, saved];
                            const next = [...prev]; next[i] = saved; return next;
                        })}
                        onGoToDue={() => setView('due')}
                        onScheduleJob={cust => {
                            // Same prefill path as a plan visit, minus the plan link:
                            // the customer is fixed, everything else is the dispatcher's.
                            setNewJobForm({ ...EMPTY_JOB,
                                customer:   cust.name || '',
                                customerId: cust.id,
                                accountId:  cust.accountId || '',
                                address:    cust.serviceAddress || '', city: cust.serviceCity  || '',
                                state:      cust.serviceState   || '', zip:  cust.serviceZip   || '' });
                            setAppliedTemplate(null);
                            setNewJobError('');
                            setShowNewJobForm(true);
                        }}/>
                ) : (
                    <CrewBuilderView jobs={filteredJobs} techs={filteredTechs} allTechs={techs} skills={skills} equipUnits={equipment} vehicles={vehicles}
                        blocks={blocks} blockTypes={settings?.dispatchBlockTypes || []}
                        onCreateBridgeJob={startBridgeJob}
                        selectedJobId={selectedJobId || jobsWithBridge[0]?.id}
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
                            {/* Start from template */}
                            {(settings?.dispatchJobTemplates || []).length > 0 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Start from template</label>
                                    <select value={appliedTemplate ? appliedTemplate.id : ''}
                                        onChange={e => {
                                            const list = settings?.dispatchJobTemplates || [];
                                            // Switching templates re-applies from the pre-template
                                            // form, never from the already-templated one.
                                            const base = appliedTemplate ? appliedTemplate.prevForm : newJobForm;
                                            const t = list.find(x => x.id === e.target.value);
                                            if (!t) { setNewJobForm(base); setAppliedTemplate(null); return; }
                                            const { next, applied, skipped } = applyJobTemplate(base, t, { skills, licLevels, equipCategories, vehicleTypes });
                                            setNewJobForm(next);
                                            setAppliedTemplate({ id: t.id, name: templateLabel(t), applied, skipped, equip: (next.equipCategories || []).join(', '), prevForm: base });
                                        }}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}>
                                        <option value="">— None —</option>
                                        {(settings?.dispatchJobTemplates || []).map(t => (
                                            <option key={t.id} value={t.id}>{templateLabel(t)}</option>
                                        ))}
                                    </select>
                                    {appliedTemplate && (
                                        <div style={{ marginTop: 6, padding: '7px 10px', borderRadius: T.r,
                                            background: T.surface2, borderLeft: `3px solid ${T.goldInk}`,
                                            fontSize: 11.5, lineHeight: 1.5, color: T.inkMid }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                <span style={{ flex: 1 }}>
                                                    Applied <strong style={{ color: T.ink }}>{appliedTemplate.name}</strong>
                                                    {appliedTemplate.applied.length > 0 && ` — ${appliedTemplate.applied.join(', ')}`}
                                                </span>
                                                <span onClick={() => { setNewJobForm(appliedTemplate.prevForm); setAppliedTemplate(null); }}
                                                    style={{ color: T.info, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Undo</span>
                                            </div>
                                            {appliedTemplate.equip && (
                                                <div style={{ marginTop: 3, color: T.inkMid }}>
                                                    Bring: {appliedTemplate.equip}
                                                </div>
                                            )}
                                            {appliedTemplate.skipped.map((s, i) => (
                                                <div key={i} style={{ marginTop: 3, color: T.warn }}>Not applied — {s}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
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
                            {/* Required vehicle class */}
                            {vehicleTypes.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Required Vehicle</label>
                                    <select value={newJobForm.requiredVehicleType || ''}
                                        onChange={e => setNewJobForm(f => ({ ...f, requiredVehicleType: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, color: T.ink, fontFamily: T.sans, background: T.bg, outline: 'none' }}>
                                        <option value="">— Any vehicle —</option>
                                        {vehicleTypes.map(vt => {
                                            const n = vehicles.filter(v => (v.type || '').toLowerCase() === vt).length;
                                            return <option key={vt} value={vt}>{labelise(vt)} ({n} in fleet)</option>;
                                        })}
                                    </select>
                                    <div style={{ marginTop: 4, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                                        Only technicians assigned a vehicle of this class can be crewed onto the job.
                                    </div>
                                </div>
                            )}
                            {/* Required equipment */}
                            {equipCategories.length > 0 && (
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Required Equipment</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                        {equipCategories.map(cat => {
                                            const on    = (newJobForm.equipCategories || []).includes(cat);
                                            const units = equipment.filter(e => (e.category || '').trim() === cat);
                                            const free  = units.filter(u => (u.status || 'available') === 'available').length;
                                            return (
                                                <span key={cat}
                                                    onClick={() => setNewJobForm(f => ({ ...f,
                                                        equipCategories: on ? (f.equipCategories || []).filter(x => x !== cat) : [...(f.equipCategories || []), cat] }))}
                                                    title={`${free} of ${units.length} unit(s) currently available`}
                                                    style={{ padding: '4px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 999,
                                                        border: `1px solid ${on ? T.ink : T.border}`, background: on ? T.ink : 'transparent',
                                                        color: on ? T.surface : T.inkMid, fontFamily: T.sans }}>
                                                    {cat}
                                                    <span style={{ marginLeft: 5, opacity: 0.65, fontFamily: T.mono }}>{free}/{units.length}</span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
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
