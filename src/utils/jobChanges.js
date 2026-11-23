// src/utils/jobChanges.js — a Dispatch office save names only what it changed (state §0.286; OPEN_ITEMS §4.8, §0.285's
// found (i); Jeff, 22 Nov: "Do your recommended"). Dispatch reads its jobs once, and its senders sent their whole copy:
// a screen behind another member's change — another dispatcher, a technician's Start travel — wrote its old status and
// schedule back (a backwards move in the history, a second confirmation to the customer). Now each sender sends the
// fields its press changes from the job as its screen holds it, and a status move names the status it moved FROM; the
// server refuses that move when the job no longer stands there (409 'stale', the job as stored), and takes a press sent
// again over a job that already holds all it sent as done (409 'already'). Since §0.289 (OPEN_ITEMS §4.8, §0.286's found
// (a); Jeff, 23 Nov: "Next race finding") a save that sends the appointment or the crew names the one its screen saw too
// (`fromAppointment`, `fromCrew`): the job rescheduled or given another crew since, its status unmoved, was written over —
// the customer confirmed for the old time. Pure: no React, no database — the screen and dispatch-jobs.mjs read the same
// rules.

// The job's statuses (db/schema.ts dispatch_job_status).
export const JOB_STATUSES = Object.freeze(['unscheduled', 'scheduled', 'en_route', 'on_site', 'paused', 'completed', 'cancelled', 'requires_follow_up']);

// One rule per kind of column, so a value read back from the database and one a screen holds compare as the same value.
const LISTS = new Set(['coTechIds', 'needSkills', 'equipmentIds', 'assignedEquipmentIds', 'tags']);
const NUMBERS = new Set(['durationMinutes', 'crewSize', 'laborHours', 'laborCost', 'materialCost', 'totalCost', 'photosCount']);
const FLAGS = new Set(['customerSignature', 'requiresFollowUp']);
const TIMES = new Set(['actualStart', 'actualEnd']);

// A list as stored: an array, or JSON text of one (a co-technician list is often held as text); none is empty.
export const listOf = (v) => {
    if (v == null || v === '') return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try { const p = JSON.parse(v); return Array.isArray(p) ? p : [p]; } catch { return [v]; }
    }
    return [v];
};
const blank = (v) => v == null || v === '';

/** Whether two values of one column are the same value. */
export function sameJobValue(key, a, b) {
    if (LISTS.has(key)) return JSON.stringify(listOf(a)) === JSON.stringify(listOf(b));
    if (NUMBERS.has(key)) return (blank(a) || blank(b)) ? blank(a) === blank(b) : Number(a) === Number(b);
    if (FLAGS.has(key)) return (a ?? null) === (b ?? null);   // none stored is not false (the §0.278 review)
    if (TIMES.has(key)) {
        const t = (v) => (blank(v) ? null : new Date(v).getTime());
        return t(a) === t(b);
    }
    if (key === 'status') return (a || 'unscheduled') === (b || 'unscheduled');
    if (key === 'customFields') {   // an object, or JSON text of one as a write holds it; keys in any order
        const obj = (v) => { if (blank(v)) return {}; if (typeof v === 'string') { try { return JSON.parse(v) ?? {}; } catch { return v; } } return v; };
        const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]])) : JSON.stringify(v));
        return canon(obj(a)) === canon(obj(b));
    }
    return (blank(a) ? '' : String(a)) === (blank(b) ? '' : String(b));   // text: none and '' are one value
}

// Two values of a job that are one value each: the crew (the lead and the co-technicians — the server's one crew,
// dispatch-jobs.mjs CREW) and the appointment (a start from one save and an end from another never meet).
const CREW = ['assignedTechId', 'coTechIds'];
const APPOINTMENT = ['scheduledDate', 'scheduledStart', 'scheduledEnd', 'timeSlot'];
const GROUPS = [CREW, APPOINTMENT];

// The crew and the appointment as a job holds them, in the form the server compares: none of a field is '' (a slot,
// 'anytime' — as the database's own default and every answer read it), a crew list its ids; the appointment with the
// length every end, shift and clash is worked out from (the review: a job made longer, with no start, moved none of it).
const crewOf = (job) => ({ assignedTechId: job?.assignedTechId || '', coTechIds: listOf(job?.coTechIds).filter((t) => typeof t === 'string' && t) });
const appointmentOf = (job) => ({ scheduledDate: job?.scheduledDate || '', scheduledStart: job?.scheduledStart || '', scheduledEnd: job?.scheduledEnd || '', timeSlot: job?.timeSlot || 'anytime',
    durationMinutes: blank(job?.durationMinutes) ? '' : Number(job.durationMinutes) });
/** Where a screen saw the job (`job` as stored — never a form's reading of it), for a write that relies on it; {} for a job
 * it did not see as stored: made by a press whose answer could not be read, or moved by one whose answer proved nothing. */
export const seenOf = (job) => (job?.id && !job._maybe ? { fromAppointment: appointmentOf(job), fromCrew: crewOf(job) } : {});
export const sameAppointment = (a, b) => JSON.stringify(appointmentOf(a)) === JSON.stringify(appointmentOf(b));
export const sameCrew = (a, b) => JSON.stringify(crewOf(a)) === JSON.stringify(crewOf(b));

/** What a body says its screen saw: { seen: { status?, appointment?, crew? } } — or { field, error } for one that is not a
 * status, an appointment or a crew (the server refuses it, nothing written). */
export function seenIn(data) {
    const seen = {};
    if (Object.hasOwn(data, 'fromStatus')) {
        if (!JOB_STATUSES.includes(data.fromStatus)) return { field: 'fromStatus', error: 'fromStatus is the status the job was seen in — one of the job statuses.' };
        seen.status = data.fromStatus;
    }
    const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const text = (v) => v == null || typeof v === 'string';
    if (Object.hasOwn(data, 'fromAppointment')) {
        const a = data.fromAppointment;
        if (!plain(a) || !APPOINTMENT.every((k) => text(a[k])) || !(blank(a.durationMinutes) || Number.isFinite(Number(a.durationMinutes)))) return { field: 'fromAppointment', error: 'fromAppointment is the appointment the job was seen at — its day, start, end, slot and length.' };
        seen.appointment = appointmentOf(a);
    }
    if (Object.hasOwn(data, 'fromCrew')) {
        const c = data.fromCrew;
        if (!plain(c) || !text(c.assignedTechId) || !Array.isArray(c.coTechIds) || !c.coTechIds.every((t) => typeof t === 'string')) return { field: 'fromCrew', error: 'fromCrew is the crew the job was seen with — its lead and its list of the rest.' };
        seen.crew = crewOf(c);
    }
    return { seen };
}

/** The words of a save refused because the job moved since its screen read it: what moved, the status first. */
export function movedWords(now, seen = {}) {
    if (seen.status !== undefined && (now.status || 'unscheduled') !== seen.status) return `This job is ${String(now.status || 'unscheduled').replace(/_/g, ' ')} now — it changed since you opened it. Nothing was saved.`;
    const appointment = !!seen.appointment && !sameAppointment(now, seen.appointment);
    const crew = !!seen.crew && !sameCrew(now, seen.crew);
    // "Time", not "rescheduled": a queued job's preferred day, window or length is in it too; "this screen loaded it": a
    // board, a plan and a drag opened nothing (the review).
    if (appointment && crew) return 'This job’s time and crew changed since this screen loaded it. Nothing was saved.';
    if (appointment) return 'This job’s time changed since this screen loaded it. Nothing was saved.';
    if (crew) return 'This job’s crew changed since this screen loaded it. Nothing was saved.';
    return 'This job changed since this screen loaded it. Nothing was saved.';
}

/**
 * The body of an office save: the job's id and each field of `after` that differs from `before` (a group whole when
 * any of it differs), with `fromStatus` — the status `before` holds — when the status is among them. `before` and
 * `after` are built the same way (one builder each side). → { id, ...changed, fromStatus? } | null when nothing changed.
 * A job the screen holds no copy of (`before` none): the whole of `after` and no fromStatus — the server decides it as it
 * did before (the review: a diff against nothing read every field as unchanged, or guessed where the job stood).
 * `checkStatus` — a press whose meaning is a status (a schedule, a hold, a time off): whenever it sends anything it names
 * the status and where it saw the job, unchanged or not, so a job another member moved since is refused (the review: a
 * hold over a job the screen held unscheduled, scheduled since by another, landed unchecked and left it scheduled on the
 * held crew). The Jobs editor's fields-only save does not: another member's status stands beside its fields.
 * `seen` — the job as stored that the save relies on (state §0.289): a save that sends the appointment or the crew names
 * the one it saw, and one that puts the job on the schedule the appointment it goes on at; a press (`checkStatus`, whose
 * `before` is the job as stored) names both, sent or not — a crew changed for the time it was seen at is no crew for
 * another time, and a hold takes the job off the time it was seen at.
 */
export function jobChanges(before, after, id, { checkStatus = false, seen = checkStatus ? before : null } = {}) {
    if (!before) return { id, ...after };
    const out = {};
    for (const k of Object.keys(after)) if (!sameJobValue(k, before?.[k], after[k])) out[k] = after[k];
    for (const g of GROUPS) if (g.some((k) => k in out)) for (const k of g) if (k in after) out[k] = after[k];
    if (!Object.keys(out).length) return null;
    if (checkStatus && 'status' in after) out.status = after.status;
    if ('status' in out) out.fromStatus = before?.status || 'unscheduled';
    const { fromAppointment, fromCrew } = seenOf(seen);
    if (fromAppointment && (checkStatus || out.status === 'scheduled' || [...APPOINTMENT, 'durationMinutes'].some((k) => k in out))) out.fromAppointment = fromAppointment;
    if (fromCrew && (checkStatus || CREW.some((k) => k in out))) out.fromCrew = fromCrew;
    return { id, ...out };
}

/** What a body sets on the job (its id and what its screen saw aside) — a landed press whose answer cannot be read is kept as this
 * (state §0.263), in both copies and the base the next press diffs against (the review: the row moved as sent while its
 * base stayed the old job, and the next press could send nothing and say done). */
export const sentOf = (body) => { const { id: _id, fromStatus: _from, fromAppointment: _appointment, fromCrew: _crew, ...rest } = body || {}; return rest; };

// ── What each press means ───────────────────────────────────────────────────

// Schedule now and Mass-schedule: the crew at a time, its units reserved.
export const scheduleFields = ({ leadId, coIds = [], date, start, end, units = [] }) => ({
    status: 'scheduled', assignedTechId: leadId, coTechIds: coIds,
    scheduledDate: date, scheduledStart: start, scheduledEnd: end, timeSlot: 'exact',
    assignedEquipmentIds: units,
});
// Wait for group schedule (Hold, and Release with no ids): the crew on the job with no time — its units released, by
// name (the server released them only when a body named the status 'unscheduled', and an unchanged status is no longer sent).
export const heldCrewFields = (ids = []) => {
    const [leadId = null, ...coIds] = ids;
    return { status: 'unscheduled', assignedTechId: leadId, coTechIds: coIds, assignedEquipmentIds: [] };
};
// A technician's time off over the job: back to the queue, no crew, no time, its units released.
export const unassignFields = () => ({
    status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: null, scheduledEnd: null, assignedEquipmentIds: [],
});

// The Jobs editor's form as a save body — the expressions its Save always sent (DispatchTab.jsx JobsView), so the job
// as opened and the job as edited compare field for field. `job` is a draft or the job as stored.
const hoursOf = (job) => parseFloat(job.durationHrs ?? ((job.durationMinutes || 120) / 60)) || 2;
// DispatchTab.jsx's addHoursHHMM over its hhToNum, as written (the end the editor always sent).
const hhToNum = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) + (m || 0) / 60; };
const addHours = (hhmm, hrs) => {
    const mins = (Math.round((hhToNum(hhmm) + (Number(hrs) || 0)) * 60) % (24 * 60) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
export const editorFields = (job, locationId) => ({
    title:           (job.title || '').trim(),
    description:     job.description || null,
    priority:        job.priority || 'normal',
    status:          job.status || 'unscheduled',
    // Both columns are NOT NULL; '' is "none", as the create path writes (§0.113).
    jobType:         job.jobType || '',
    trade:           job.trade || '',
    durationMinutes: Math.round(hoursOf(job) * 60),
    crewSize:        parseInt(job.crewSize, 10) || 1,
    minLicense:      job.minLicense || null,
    needSkills:      job.needSkills || [],
    equipmentIds:    Array.isArray(job.equipmentIds) ? job.equipmentIds : [],
    scheduledDate:   job.scheduledDate || null,
    // A preferred start makes the window exact and sets the end from the duration (§0.112).
    scheduledStart:  job.scheduledStart || null,
    scheduledEnd:    job.scheduledStart ? addHours(job.scheduledStart, hoursOf(job)) : null,
    timeSlot:        job.scheduledStart ? 'exact' : (job.timeSlot && job.timeSlot !== 'exact' ? job.timeSlot : 'anytime'),
    locationId:      locationId ?? null,
});
// The draft's own fields behind each sent one (the end is the start's and the duration's).
const DRAFT_OF = { durationMinutes: ['durationHrs', 'durationMinutes'], scheduledEnd: [], locationId: ['locationId'] };

/**
 * An editor refused as stale shows the job as stored with what the member typed over it: a field they changed keeps
 * their value, one they did not takes the stored one — so its next Save sends only their changes, from the job as it is.
 */
export function rebaseDraft(opened, draft, stored, { refused = false } = {}) {
    const before = editorFields(opened, opened.locationId);
    const mine = editorFields(draft, draft.locationId);
    const next = { ...stored };
    for (const k of Object.keys(mine)) {
        if (sameJobValue(k, before[k], mine[k])) continue;
        for (const f of (DRAFT_OF[k] || [k])) if (f in draft) next[f] = draft[f];
    }
    // A refused save over another appointment (state §0.289, the review): the appointment is one value — the stored one is
    // shown whole. Field by field, a start typed for one day stood beside the day another member moved it to, an
    // appointment nobody chose, and the next Save sent it.
    if (refused && appointmentMoved(opened, stored)) for (const k of APPOINTMENT) next[k] = stored[k] ?? null;
    return next;
}
const appointmentMoved = (a, b) => APPOINTMENT.some((k) => (a?.[k] || (k === 'timeSlot' ? 'anytime' : '')) !== (b?.[k] || (k === 'timeSlot' ? 'anytime' : '')));
/** Whether a refused rebase put the stored appointment over one the member had typed — said, so they choose again. */
export const appointmentDropped = (opened, draft, stored) => appointmentMoved(opened, stored) && appointmentMoved(opened, draft);

// ── The server's side ───────────────────────────────────────────────────────

/** Whether a job as stored holds every value a write would set (`updatedAt` aside) — none named is never held. */
export function jobHolds(row, updates) {
    const keys = Object.keys(updates || {}).filter((k) => k !== 'updatedAt');
    return !!row && keys.length > 0 && keys.every((k) => sameJobValue(k, row[k], updates[k]));
}

/** Whether an earlier press of this save landed: the job holds every value it would set, and everything else it named is as
 * it saw it (the review: judged on what was sent alone, a press refused for the time or the crew it relied on read as
 * done when the other member had chosen the same crew, or the same day). */
export function pressLanded(now, updates, seen = {}) {
    if (!jobHolds(now, updates)) return false;
    const has = (k) => Object.hasOwn(updates, k);
    if (seen.status !== undefined && (now.status || 'unscheduled') !== (has('status') ? updates.status : seen.status)) return false;
    const held = (group, keys) => ({ ...group, ...Object.fromEntries(keys.filter(has).map((k) => [k, updates[k]])) });
    if (seen.appointment && !sameAppointment(now, held(seen.appointment, [...APPOINTMENT, 'durationMinutes']))) return false;
    return !seen.crew || sameCrew(now, held(seen.crew, CREW));
}

/** An office save's refusal read: 'already' (an earlier press landed — the job as stored), 'stale' (the job moved since
 * the screen read it — the job as stored, the words said) or null; only ever about the job pressed. */
export function jobAnswerOf(status, body, id) {
    if (status !== 409 || !body?.job || body.job.id !== id) return null;
    if (body.code === 'already') return 'already';
    if (body.code === 'stale') return 'stale';
    return null;
}
