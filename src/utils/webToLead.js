// webToLead.js — the embeddable web-to-lead form (state §0.121). Pure: no
// React, no db, no crypto; shared by settings.mjs (the org's config, both
// halves), lead-intake.mjs (the public endpoint) and the Connected Apps card.
//
// THE MODEL. An org has ONE form, reached by ONE unguessable token that is the
// whole authority — no org id ever travels in a URL or a payload, exactly the
// public job-status rule (guide §18b35). The token is minted SERVER-SIDE in the
// settings PUT (24 random bytes, base64url) the first time the form is turned
// on, kept across every later save, and replaced only by an explicit rotate.
// A submission becomes an UNASSIGNED lead in that org — the same pool the
// claim-request flow (§0.58) and the Manager's assignment already serve — so a
// web lead is handled the way every other unowned lead is, and nothing about
// who-may-write changes for a public caller: it never names an owner.

export const WEB_LEAD_SOURCE = 'Web form';

// base64url of 24 bytes is 32 chars; the same shape as the job-status token.
export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

// What a submission may carry, with caps — a public endpoint takes nothing it
// did not ask for and nothing longer than the column holds.
export const INTAKE_FIELDS = Object.freeze([
    Object.freeze({ key: 'firstName', label: 'First name', max: 255 }),
    Object.freeze({ key: 'lastName',  label: 'Last name',  max: 255 }),
    Object.freeze({ key: 'company',   label: 'Company',    max: 255 }),
    Object.freeze({ key: 'email',     label: 'Email',      max: 255 }),
    Object.freeze({ key: 'phone',     label: 'Phone',      max: 50 }),
    Object.freeze({ key: 'message',   label: 'How can we help?', max: 4000 }),
]);

// The honeypot: a field a person never sees and a bot fills. Not in
// INTAKE_FIELDS — it is not data.
export const HONEYPOT_FIELD = 'website';

const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalise the org's config. Every key exists in the result; a missing or
 * malformed config is OFF with no token. `prev` is the stored config (the
 * settings PUT passes it so a save never drops the token); `mint` is the
 * server's token factory — passed ONLY by the PUT, and only called when the
 * form is on and has no token, or a rotate was asked for. The GET and the
 * client pass no mint and can therefore never create a token.
 */
export function cleanWebToLead(raw, prev = null, mint = null) {
    const src  = raw  && typeof raw  === 'object' && !Array.isArray(raw)  ? raw  : {};
    const kept = prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
    const enabled = src.enabled === true;
    let token = typeof src.token === 'string' && TOKEN_RE.test(src.token) ? src.token
        : typeof kept.token === 'string' && TOKEN_RE.test(kept.token) ? kept.token
        : null;
    if (typeof mint === 'function' && (src.rotate === true || (enabled && !token))) {
        const t = mint();
        if (typeof t === 'string' && TOKEN_RE.test(t)) token = t;
    }
    const source = str(src.source, 100) || WEB_LEAD_SOURCE;
    // Where a plain <form> post lands afterwards. https only, or nothing — a
    // redirect target that came from the submission itself would be an open
    // redirect, so it is config, never payload.
    const thank = str(src.thankYouUrl, 500);
    const thankYouUrl = /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(thank) ? thank : null;
    return { enabled, token, source, thankYouUrl };
}

/**
 * A submission, cleaned. Returns { ok: true, lead } or { ok: false, error }.
 * The lead carries only INTAKE_FIELDS (message → notes); nothing else in the
 * payload is read. A submission with no way to reach the person is refused.
 */
export function cleanIntake(body) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    if (str(b[HONEYPOT_FIELD], 10)) return { ok: false, error: 'spam', spam: true };
    const out = {};
    for (const f of INTAKE_FIELDS) out[f.key] = str(b[f.key], f.max);
    if (out.email && !EMAIL_RE.test(out.email)) return { ok: false, error: 'That email address does not look right.' };
    if (!out.email && !out.phone) return { ok: false, error: 'Please give an email address or a phone number so we can reach you.' };
    if (!out.firstName && !out.lastName && !out.company) return { ok: false, error: 'Please tell us your name or your company.' };
    return {
        ok: true,
        lead: {
            firstName: out.firstName || null,
            lastName:  out.lastName  || null,
            company:   out.company   || null,
            email:     out.email     || null,
            phone:     out.phone     || null,
            notes:     out.message   || null,
        },
    };
}

/** The hosted form's public URL and the embed snippet, from the site origin. */
export function webToLeadLinks(origin, token) {
    const base = String(origin || '').replace(/\/+$/, '');
    if (!token) return { formUrl: null, embed: null, postUrl: null };
    const formUrl = `${base}/lead-form/${token}`;
    const postUrl = `${base}/.netlify/functions/lead-intake?t=${token}`;
    const embed = `<iframe src="${formUrl}" title="Contact us" width="100%" height="620" style="border:0;max-width:560px" loading="lazy"></iframe>`;
    return { formUrl, postUrl, embed };
}
