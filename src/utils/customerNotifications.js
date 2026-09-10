// customerNotifications.js — what a dispatch customer is told, and when (state §0.111).
//
// THE COMPANY DECIDES, per org: Settings → Dispatch → Customer notifications
// saves `settings.extra.customerNotifications`. Off by default — a new
// workspace never emails a customer until an Admin turns it on. Two moments:
//
//   confirmation — a job becomes scheduled with a date, or its date/time changes
//                  while scheduled ("your visit is booked for …")
//   on_the_way   — a job's status becomes en_route ("your technician is on the way")
//
// Each can go by email (Resend, today) and by SMS (Twilio, once the site has
// credentials — until then the trail on the job records "SMS not configured"
// and nothing else changes). The public status link is a per-job unguessable
// token, never an id (guide §18b35).
//
// Pure: no React, no db, no imports — shared by the settings panel, the jobs
// function, the notifier and the public page, and reachable by `node --test`.

export const CUSTOMER_NOTIFICATION_DEFAULTS = Object.freeze({
    enabled:           false,   // master switch — the whole feature per org
    confirmationEmail: true,
    confirmationSms:   true,
    onTheWayEmail:     true,
    onTheWaySms:       true,
    statusLink:        true,    // include the public job-status link in messages
});
export const CUSTOMER_NOTIFICATION_KEYS = Object.freeze(Object.keys(CUSTOMER_NOTIFICATION_DEFAULTS));

/** Normalise whatever was saved: every key a boolean, unknown keys dropped, garbage is the defaults. */
export function cleanCustomerNotifications(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const k of CUSTOMER_NOTIFICATION_KEYS) out[k] = typeof src[k] === 'boolean' ? src[k] : CUSTOMER_NOTIFICATION_DEFAULTS[k];
    return out;
}

// What the customer reads for each internal status. Internal vocabulary
// (dispatch_jobs.status) stays internal.
export const CUSTOMER_STATUS_LABELS = Object.freeze({
    unscheduled:        'Being scheduled',
    scheduled:          'Scheduled',
    en_route:           'Your technician is on the way',
    on_site:            'Your technician is on site',
    paused:             'Paused — we will be back',
    completed:          'Completed',
    cancelled:          'Cancelled',
    requires_follow_up: 'A follow-up visit is needed',
});
export const customerStatusLabel = (status) => CUSTOMER_STATUS_LABELS[status] || 'Scheduled';

// ── When ─────────────────────────────────────────────────────────────────────
const DAYS   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const longDate = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12);
    return `${DAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
};
export const to12h = (hhmm) => {
    if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (h > 23 || m > 59) return null;
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
};
const SLOT_TEXT = { morning: 'in the morning', afternoon: 'in the afternoon', evening: 'in the evening', anytime: 'during the day' };

/** "Tuesday, September 15, 2026 between 8:00 AM and 10:00 AM" / "… in the morning" / "Date to be confirmed". */
export function whenText(job) {
    if (!job || !isYmd(job.scheduledDate)) return 'Date to be confirmed';
    const date = longDate(job.scheduledDate);
    const start = to12h(job.scheduledStart), end = to12h(job.scheduledEnd);
    if (job.timeSlot === 'exact' && start) return end ? `${date} between ${start} and ${end}` : `${date} at ${start}`;
    return `${date} ${SLOT_TEXT[job.timeSlot] || SLOT_TEXT.anytime}`;
}

// ── What a change means ──────────────────────────────────────────────────────
const sameAppointment = (a, b) =>
    (a.scheduledDate || null) === (b.scheduledDate || null) &&
    (a.scheduledStart || null) === (b.scheduledStart || null) &&
    (a.timeSlot || null) === (b.timeSlot || null);

/**
 * Which notifications a job change calls for, under the org's switches.
 * `before` is the stored row before the write (null on create); `after` the row
 * after it. → [] | ['confirmation'] | ['on_the_way'] | both (a job that goes
 * straight to en_route with a new date is confirmed AND announced).
 */
export function notificationPlan({ before, after, cfg }) {
    const c = cleanCustomerNotifications(cfg);
    if (!c.enabled || !after) return [];
    const out = [];
    const scheduledNow = after.status === 'scheduled' && isYmd(after.scheduledDate);
    const alreadyTold  = !!before && before.status === 'scheduled' && sameAppointment(before, after);
    if (scheduledNow && !alreadyTold && (c.confirmationEmail || c.confirmationSms)) out.push('confirmation');
    const enRouteNow = after.status === 'en_route' && (!before || before.status !== 'en_route');
    if (enRouteNow && (c.onTheWayEmail || c.onTheWaySms)) out.push('on_the_way');
    return out;
}

export function channelsFor(type, cfg) {
    const c = cleanCustomerNotifications(cfg);
    if (type === 'confirmation') return { email: c.confirmationEmail, sms: c.confirmationSms };
    if (type === 'on_the_way')   return { email: c.onTheWayEmail,     sms: c.onTheWaySms };
    return { email: false, sms: false };
}

// ── Text ─────────────────────────────────────────────────────────────────────
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const publicStatusPath = (token) => `/status/${encodeURIComponent(token)}`;

/** One SMS, plain text, no markup — the company name first so it is never anonymous. */
export function smsText(type, { companyName, jobTitle, when, techFirstName, statusUrl }) {
    const co = companyName || 'Your service provider';
    const what = jobTitle ? `your ${jobTitle} visit` : 'your service visit';
    const link = statusUrl ? ` Details: ${statusUrl}` : '';
    if (type === 'on_the_way') return `${co}: ${techFirstName || 'Your technician'} is on the way for ${what}.${link}`;
    return `${co}: ${what} is scheduled for ${when}.${link}`;
}
