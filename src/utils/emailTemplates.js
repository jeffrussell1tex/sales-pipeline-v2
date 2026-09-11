// emailTemplates.js — email templates for reps (state §0.122). Pure: no React,
// no db; shared by settings.mjs (both halves), the Settings panel and the
// contact rail.
//
// THE MODEL. An org keeps a library of templates (settings.extra.emailTemplates)
// that Admins write and every rep uses. A template is a subject and a body with
// merge fields — {{firstName}}, {{company}}, {{repName}} … — and it is SENT BY
// THE REP'S OWN MAIL CLIENT: the rail renders the template for the contact
// in view and opens a mailto: link, then logs the Email activity the way the
// plain ✉ Email button already does. Nothing is sent by the app, so there is
// no per-org sending domain to verify, no deliverability to own, and no copy
// of the message anywhere but the rep's Sent folder — the honest v1 the
// assessment recommended. Sending from the app is a different project.

export const MERGE_FIELDS = Object.freeze([
    Object.freeze({ key: 'firstName',   label: 'Contact first name' }),
    Object.freeze({ key: 'lastName',    label: 'Contact last name' }),
    Object.freeze({ key: 'fullName',    label: 'Contact full name' }),
    Object.freeze({ key: 'company',     label: 'Contact company' }),
    Object.freeze({ key: 'title',       label: 'Contact title' }),
    Object.freeze({ key: 'repName',     label: 'Your name' }),
    Object.freeze({ key: 'repEmail',    label: 'Your email' }),
    Object.freeze({ key: 'repPhone',    label: 'Your phone' }),
    Object.freeze({ key: 'companyName', label: 'Your company' }),
]);
export const MERGE_KEYS = Object.freeze(MERGE_FIELDS.map(f => f.key));

export const LIMITS = Object.freeze({ name: 80, subject: 200, body: 5000, count: 100 });

const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);

/**
 * Normalise what was saved. Each template keeps { id, name, subject, body };
 * a template with no id or no name is dropped, ids are unique (first wins),
 * strings are trimmed and capped, garbage is an empty library.
 */
export function cleanEmailTemplates(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const t of raw) {
        if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
        const id = str(t.id, 64);
        const name = str(t.name, LIMITS.name);
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name, subject: str(t.subject, LIMITS.subject), body: str(t.body, LIMITS.body) });
        if (out.length >= LIMITS.count) break;
    }
    return out;
}

/**
 * The values a template is rendered with, from the contact in view, the rep
 * who is sending (their roster profile) and the org. Every merge key is
 * present; a missing value is ''.
 */
export function mergeContext({ contact, rep, org } = {}) {
    const c = contact || {}, r = rep || {}, o = org || {};
    const first = str(c.firstName, 255), last = str(c.lastName, 255);
    return {
        firstName:   first,
        lastName:    last,
        fullName:    [first, last].filter(Boolean).join(' '),
        company:     str(c.company, 255),
        title:       str(c.title, 255),
        repName:     str(r.name, 255),
        repEmail:    str(r.email, 255),
        repPhone:    str(r.phone, 64),
        companyName: str(o.companyDisplayName || o.companyName, 255),
    };
}

/**
 * Replace every {{key}} (spaces inside the braces tolerated) with its value.
 * A key that is not a merge field is left as typed — a rep sees exactly what
 * would go out and can fix it; an unknown field silently vanishing would not
 * be noticed until the customer read it.
 */
export function renderTemplate(text, ctx) {
    const c = ctx || {};
    return String(text ?? '').replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (m, key) => (MERGE_KEYS.includes(key) ? (c[key] ?? '') : m));
}

/** The mailto: link the rep's client opens. Subject and body are URL-encoded. */
export function mailtoHref(to, subject, body) {
    const params = [];
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    if (body)    params.push('body='    + encodeURIComponent(body));
    return `mailto:${String(to || '').trim()}${params.length ? '?' + params.join('&') : ''}`;
}

/** A rendered template for one contact — what the rail hands to mailtoHref. */
export function renderForContact(template, ctx) {
    const t = template || {};
    return { subject: renderTemplate(t.subject, ctx), body: renderTemplate(t.body, ctx) };
}
