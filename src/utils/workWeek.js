// workWeek.js — the default shift pattern a new technician starts with
// (state §0.113; Jeff: "prefill a work schedule when adding a tech — M-F 8AM
// to 5PM as default"). Pure, no imports: the technician editor (client) and the
// technicians function (server) both read it, so a technician created from
// either side is rostered Mon–Fri from the first minute instead of "Not
// rostered" every day until someone opens Work Schedules. An explicit `{}`
// still means "no working days" — only an ABSENT pattern takes the default.
//
// Shape: { mon: { start: 'HH:MM', end: 'HH:MM' }, … } — a missing day is a day
// off, which is what shiftForDate and the Work Schedules grid already read.

export const DEFAULT_SHIFT_HOURS = Object.freeze({ start: '08:00', end: '17:00' });

export const WORK_WEEK_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri']);

/** A fresh Mon–Fri 08:00–17:00 pattern — a new object every call, safe to mutate. */
export const defaultWorkWeek = () =>
    Object.fromEntries(WORK_WEEK_DAYS.map(d => [d, { ...DEFAULT_SHIFT_HOURS }]));
