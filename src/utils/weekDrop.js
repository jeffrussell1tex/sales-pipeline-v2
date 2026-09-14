// weekDrop.js — what a drop on the dispatch week board means, and whether it
// is allowed (state §0.134; Jeff: "Drag-to-reschedule on the dispatch week
// grid"). Pure: no React, no db. The board hands a dragged job and the cell it
// landed on; this decides the crew after the drop, the gates that refuse it,
// and the PARTIAL body the dispatch-jobs PUT receives — only the fields that
// change, never `status`, so a held crew stays held, a scheduled job keeps its
// time, and the server's own status-history and customer-confirmation logic
// (§0.111) reads a real change.
//
// A drag is a write path, and it runs the SAME gates the crew builder's
// Schedule now runs before its PUT: rostered that day, not marked out for the
// day, inside the shift, clear of a partial-day block, not double-booked. Those
// come in through `lookup(techId)` — the board's shiftForDate / blocksOnDate /
// jobs live in DispatchTab and are injected, so the rules are testable here
// without the tab. Equipment (§0.116) and the soft eligibility blockers the
// builder confirms before overriding stay with the caller.

export const DAY_NAMES = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

const hhToNum = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) + (m || 0) / 60; };

// Local parts — `new Date('2026-09-15')` parses as UTC and names the wrong day
// west of Greenwich (guide §18b26).
export const dayNameOf = (ymd) => {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    return DAY_NAMES[new Date(y, m - 1, d).getDay()];
};

// A decimal hour for readers: 8 → 8a, 13.5 → 1:30p, 12 → 12p.
export const fmtHour = (h) => {
    if (h == null || Number.isNaN(Number(h))) return '';
    const total = Math.round(Number(h) * 60);
    const hh = Math.floor(total / 60) % 24, mm = total % 60;
    const suffix = hh >= 12 ? 'p' : 'a';
    const base = hh % 12 === 0 ? 12 : hh % 12;
    return mm ? `${base}:${String(mm).padStart(2, '0')}${suffix}` : `${base}${suffix}`;
};

/**
 * The crew after a drop. A job appears in every crew member's row, so a card
 * dragged from A's row onto B's row means "B instead of A"; dropped on a row
 * whose technician is already on the crew it is a date move only; from the
 * "Needs a crew" row (no fromTechId) it takes that technician as its crew.
 * → { crew, changed, swapped: { from, to } | null }
 */
export function nextCrewAfterDrop(crew, fromTechId = null, toTechId = null) {
    const cur = Array.isArray(crew) ? crew.filter(Boolean) : [];
    if (!toTechId || cur.includes(toTechId)) return { crew: cur, changed: false, swapped: null };
    if (fromTechId && cur.includes(fromTechId)) {
        return { crew: cur.map(id => id === fromTechId ? toTechId : id), changed: true, swapped: { from: fromTechId, to: toTechId } };
    }
    return { crew: [toTechId, ...cur], changed: true, swapped: null };
}

const refuse = (reason) => ({ ok: false, noop: false, reason });

/**
 * @param {object} p
 * @param {object} p.job          the board's job shape: id, scheduledDate, start (decimal hour or null),
 *                                durationHrs, assignedTechIds, isBridge, title/customer
 * @param {string|null} p.fromTechId  the row the card was dragged from (null = the "Needs a crew" row)
 * @param {string|null} p.toTechId    the row it landed on (null = the "Needs a crew" row)
 * @param {string} p.toDate       'YYYY-MM-DD' of the cell
 * @param {(techId: string) => ({ tech, shift, dayBlocks, rivals } | null)} p.lookup
 *        the board's read of one technician ON toDate: the row (name), the
 *        shift for that day (null = not rostered), the schedule blocks covering
 *        it, and the OTHER jobs on that technician that day with a placed start
 * @param {Array} p.blockTypes    settings.dispatchBlockTypes, for a block's name
 * → { ok: false, noop: true }                                  nothing changes
 * → { ok: false, noop: false, reason }                         refused, in words
 * → { ok: true, crew, crewChanged, dateChanged, swapped, checked, payload }
 */
export function planWeekDrop({ job, fromTechId = null, toTechId = null, toDate, lookup, blockTypes = [] }) {
    if (!job || !job.id) return refuse('Nothing to move.');
    if (!toDate) return refuse('Drop the job on a day.');
    if (job.isBridge) return refuse('This is a won opportunity, not a job yet. Use "Create job" on it first.');
    const crew = Array.isArray(job.assignedTechIds) ? job.assignedTechIds.filter(Boolean) : [];
    if (fromTechId && !crew.includes(fromTechId)) return refuse('This job’s crew has changed since the board loaded — refresh and try again.');
    if (!toTechId && crew.length) return refuse('Drop a crewed job on a technician’s row — the "Needs a crew" row holds jobs with no crew.');

    const next = nextCrewAfterDrop(crew, fromTechId, toTechId);
    const dateChanged = toDate !== job.scheduledDate;
    if (!next.changed && !dateChanged) return { ok: false, noop: true };

    // Who has to be free on the target day: a new member always; the whole crew
    // when the day moves under them.
    const checked = dateChanged ? next.crew : (next.changed ? [toTechId] : []);
    const typeName = (b) => (blockTypes || []).find(t => t.id === b.blockType)?.name || 'time off';
    for (const techId of checked) {
        const ctx = (typeof lookup === 'function' ? lookup(techId) : null) || {};
        const name = ctx.tech?.name || 'This technician';
        if (!ctx.shift) return refuse(`${name} is not rostered on ${dayNameOf(toDate) || toDate}.`);
        const dayBlocks = Array.isArray(ctx.dayBlocks) ? ctx.dayBlocks : [];
        const allDay = dayBlocks.find(b => b.allDay !== false);
        if (allDay) return refuse(`${name} is out (${typeName(allDay)}) on ${toDate}.`);
        if (job.start != null) {
            const s = Number(job.start), e = s + (Number(job.durationHrs) || 2);
            if (s < hhToNum(ctx.shift.start) || e > hhToNum(ctx.shift.end)) {
                return refuse(`${name} works ${ctx.shift.start}–${ctx.shift.end} that day — the job runs outside their shift.`);
            }
            const partial = dayBlocks
                .filter(b => b.allDay === false && b.startTime && b.endTime)
                .find(b => s < hhToNum(b.endTime) && e > hhToNum(b.startTime));
            if (partial) return refuse(`${name} is out (${typeName(partial)}) ${partial.startTime}–${partial.endTime} that day.`);
            const rivals = Array.isArray(ctx.rivals) ? ctx.rivals : [];
            const clash = rivals.find(r => r.id !== job.id && r.start != null && Number(r.start) < e && Number(r.start) + (Number(r.durationHrs) || 2) > s);
            if (clash) return refuse(`${name} is already on ${clash.title || clash.customer || 'another job'} at ${fmtHour(clash.start)} that day.`);
        }
    }

    // Only what changes. No status: a held crew stays 'unscheduled', a
    // scheduled job stays 'scheduled' with its time; sending 'unscheduled'
    // would also release the job's reserved equipment on the server.
    const payload = { id: job.id };
    if (dateChanged) payload.scheduledDate = toDate;
    if (next.changed) { payload.assignedTechId = next.crew[0] ?? null; payload.coTechIds = next.crew.slice(1); }
    return { ok: true, noop: false, crew: next.crew, crewChanged: next.changed, dateChanged, swapped: next.swapped, checked, payload };
}
