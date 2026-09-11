// lead-intake.mjs — the public web-to-lead endpoint (state §0.121, guide
// §18b35). The app's SECOND unauthenticated surface after the customer
// job-status page, and its first unauthenticated WRITE.
//
// Authority is the org's form token alone (settings.extra.webToLead.token, minted
// by the settings PUT): no org id, no user, no owner is ever accepted. The token
// finds the settings row, the row names the org, and the ONE write this file
// makes — an UNASSIGNED lead — carries that org id and nothing a caller chose
// about ownership. An unknown, malformed or turned-off token is a 404 with the
// same body either way.
//
//   GET  /lead-form/<token>                 the hosted form (HTML, embeddable)
//   POST /.netlify/functions/lead-intake?t=<token>
//        JSON  { firstName, lastName, company, email, phone, message }  → 201 { ok }
//        form-encoded (the hosted form, or any <form>)                   → a thank-you page,
//                                                                          or 303 to the org's https thankYouUrl
//
// Defences, all cheap: a honeypot field (a filled "website" is silently
// accepted and NOT stored), a per-token rate limit (in memory per instance, the
// public-api.mjs approach), a 16 kB body cap, every field trimmed and capped,
// every rendered value escaped. No cookie, no session, no link back into the
// app. Rejections and the thank-you page are no-store and noindex. The form
// page carries NO X-Frame-Options and `frame-ancestors *`, because being
// framed on the customer's site is the point.
import { db } from '../../db/index.js';
import { settings, leads } from '../../db/schema.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { scoreLead, DEFAULT_LEAD_SCORING } from './score-lead.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import { dispatchAutomations } from './dispatch-automations.mjs';
import { sendSlackToOrg, slackTemplates } from './send-slack.mjs';
import { esc } from '../../src/utils/customerNotifications.js';
import { TOKEN_RE, INTAKE_FIELDS, HONEYPOT_FIELD, cleanWebToLead, cleanIntake } from '../../src/utils/webToLead.js';

const BODY_CAP    = 16 * 1024;
const RATE_LIMIT  = 30;                 // submissions per token …
const WINDOW_MS   = 15 * 60 * 1000;     // … per 15 minutes, per function instance
const rateMap = new Map();              // token → { count, windowStart }
function rateLimited(token) {
    const now = Date.now();
    const e = rateMap.get(token) || { count: 0, windowStart: now };
    if (now - e.windowStart > WINDOW_MS) { rateMap.set(token, { count: 1, windowStart: now }); return false; }
    e.count++; rateMap.set(token, e);
    return e.count > RATE_LIMIT;
}

const jsonHeaders = {
    'Content-Type':                 'application/json',
    'Cache-Control':                'no-store',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
const htmlHeaders = {
    'Content-Type':            'text/html; charset=utf-8',
    'Cache-Control':           'no-store',
    'X-Robots-Tag':            'noindex, nofollow',
    'Referrer-Policy':         'no-referrer',
    'Content-Security-Policy': "frame-ancestors *; default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
};

const page = (title, body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  body{margin:0;background:#f0ece4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#2a2622}
  .card{max-width:520px;margin:24px auto;background:#fbf8f3;border:1px solid #e6ddd0;border-radius:10px;padding:26px 26px 20px}
  .co{font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#8a8378;font-weight:700;margin:0 0 12px}
  h1{font-size:21px;margin:0 0 14px}
  label{display:block;font-size:12.5px;font-weight:600;color:#5a544c;margin:12px 0 4px}
  input,textarea{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d9d0c3;border-radius:6px;background:#fff;font:inherit;font-size:14px;color:#2a2622}
  textarea{min-height:96px;resize:vertical}
  .hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
  button{margin-top:16px;padding:10px 18px;background:#2a2622;color:#fbf8f3;border:0;border-radius:6px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
  .err{margin:10px 0 0;padding:9px 12px;background:rgba(156,58,46,.08);border-left:3px solid #9c3a2e;border-radius:4px;font-size:13px}
  .foot{margin-top:16px;font-size:12px;color:#8a8378}
</style></head><body><div class="card">${body}</div></body></html>`;

const notFound = () => ({
    statusCode: 404, headers: htmlHeaders,
    body: page('Form not found', '<h1>This form is not available</h1><p class="foot">The link may have been turned off or copied incorrectly.</p>'),
});

const formBody = ({ company, token, error, values }) => {
    const v = values || {};
    const field = (f) => f.key === 'message'
        ? `<label for="f-${f.key}">${esc(f.label)}</label><textarea id="f-${f.key}" name="${f.key}" maxlength="${f.max}">${esc(v[f.key])}</textarea>`
        : `<label for="f-${f.key}">${esc(f.label)}</label><input id="f-${f.key}" name="${f.key}" maxlength="${f.max}" type="${f.key === 'email' ? 'email' : f.key === 'phone' ? 'tel' : 'text'}" value="${esc(v[f.key])}"${f.key === 'email' ? ' autocomplete="email"' : ''}>`;
    return `
<p class="co">${esc(company)}</p>
<h1>Get in touch</h1>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="/.netlify/functions/lead-intake?t=${esc(token)}">
${INTAKE_FIELDS.map(field).join('\n')}
<div class="hp" aria-hidden="true"><label for="f-hp">Leave this empty</label><input id="f-hp" name="${HONEYPOT_FIELD}" tabindex="-1" autocomplete="off"></div>
<button type="submit">Send</button>
</form>
<p class="foot">We will reply by email or phone.</p>`;
};

const thanksBody = (company) => `
<p class="co">${esc(company)}</p>
<h1>Thank you</h1>
<p>We have your details and will be in touch shortly.</p>`;

// The org whose form this token is: the settings row that carries it, and its
// config normalised. null when the token is unknown OR the form is off — the
// same 404 for both, so the response never says which.
async function orgForToken(token) {
    if (!TOKEN_RE.test(token)) return null;
    const [row] = await db.select().from(settings)
        .where(sql`${settings.extra}->'webToLead'->>'token' = ${token}`);
    if (!row?.orgId) return null;
    const cfg = cleanWebToLead(row.extra?.webToLead);
    if (!cfg.enabled || cfg.token !== token) return null;
    return { orgId: row.orgId, cfg, company: row.extra?.companyDisplayName || row.companyName || 'Contact us', scoring: row.extra?.leadScoring || DEFAULT_LEAD_SCORING };
}

const tokenOf = (event) => {
    const fromPath = String(event.path || '').match(/\/(?:lead-form|lead-intake)\/([^/?#]+)/);
    return String(event.queryStringParameters?.t || (fromPath ? decodeURIComponent(fromPath[1]) : '')).trim();
};

const parseBody = (event) => {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : String(event.body || '');
    if (raw.length > BODY_CAP) return { tooLarge: true };
    const ct = String(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
        try { return { json: true, body: JSON.parse(raw || '{}') }; } catch { return { json: true, body: null }; }
    }
    return { json: false, body: Object.fromEntries(new URLSearchParams(raw)) };
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: jsonHeaders, body: '' };
    const token = tokenOf(event);

    if (event.httpMethod === 'GET') {
        const org = await orgForToken(token).catch(() => null);
        if (!org) return notFound();
        return { statusCode: 200, headers: htmlHeaders, body: page(`${org.company} — Get in touch`, formBody({ company: org.company, token })) };
    }
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };

    const parsed = parseBody(event);
    const wantsJson = parsed.json || String(event.headers?.accept || event.headers?.Accept || '').includes('application/json');
    const fail = (status, error, org, values) => wantsJson
        ? { statusCode: status, headers: jsonHeaders, body: JSON.stringify({ ok: false, error }) }
        : org
            ? { statusCode: status, headers: htmlHeaders, body: page(`${org.company} — Get in touch`, formBody({ company: org.company, token, error, values })) }
            : notFound();

    try {
        const org = await orgForToken(token);
        if (!org) return wantsJson ? { statusCode: 404, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Form not found' }) } : notFound();
        if (parsed.tooLarge) return fail(413, 'That submission is too large.', org);
        if (parsed.body == null) return fail(400, 'That submission could not be read.', org);
        if (rateLimited(token)) return fail(429, 'Too many submissions right now — please try again in a few minutes.', org, parsed.body);

        const clean = cleanIntake(parsed.body);
        const thanks = () => org.cfg.thankYouUrl && !wantsJson
            ? { statusCode: 303, headers: { ...htmlHeaders, Location: org.cfg.thankYouUrl }, body: '' }
            : wantsJson
                ? { statusCode: 201, headers: jsonHeaders, body: JSON.stringify({ ok: true }) }
                : { statusCode: 200, headers: htmlHeaders, body: page(`${org.company} — Thank you`, thanksBody(org.company)) };
        // A bot that filled the honeypot gets the same thank-you and no row.
        if (!clean.ok && clean.spam) return thanks();
        if (!clean.ok) return fail(400, clean.error, org, parsed.body);

        const referer = String(event.headers?.referer || event.headers?.Referer || '').slice(0, 300);
        const notes = [clean.lead.notes, `Submitted via web form${referer ? ` from ${referer}` : ''}.`].filter(Boolean).join('\n\n');
        const base = {
            id: 'lead_web_' + randomUUID(),
            ...clean.lead,
            notes,
            source:     org.cfg.source,
            status:     'New',
            score:      50,
            assignedTo: null,       // UNASSIGNED — the claim-request pool. Never from the caller.
            ownerId:    null,
        };
        const sc = scoreLead({ ...base, createdAt: new Date().toISOString() }, org.scoring, Date.now(), []);
        const scored = sc ? { ...sc, scoreUpdatedAt: new Date() } : {};
        const [inserted] = await db.insert(leads).values({ ...base, ...scored, orgId: org.orgId }).returning();

        // The same fan-out leads.mjs POST does — none of it may fail the submission.
        await dispatchWebhook(org.orgId, 'lead.created', {
            id: inserted.id, first_name: inserted.firstName, last_name: inserted.lastName, company: inserted.company,
            email: inserted.email, source: inserted.source, status: inserted.status, score: inserted.score,
            estimated_arr: null, assigned_to: null,
        }).catch(e => console.warn('lead-intake webhook:', e.message));
        dispatchAutomations(org.orgId, 'lead.created', {
            id: inserted.id, first_name: inserted.firstName, last_name: inserted.lastName, company: inserted.company, email: inserted.email, assigned_to: null,
        }).catch(e => console.warn('lead-intake automations:', e.message));
        await sendSlackToOrg(org.orgId, slackTemplates.webLead({
            name: [inserted.firstName, inserted.lastName].filter(Boolean).join(' ') || '—',
            company: inserted.company || '—', email: inserted.email || '—', phone: inserted.phone || '—', message: clean.lead.notes || '',
        }), 'webLead').catch(() => false);

        return thanks();
    } catch (err) {
        console.error('lead-intake error:', err.message);
        return wantsJson
            ? { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'Something went wrong — please try again.' }) }
            : { statusCode: 500, headers: htmlHeaders, body: page('Something went wrong', '<h1>Something went wrong</h1><p class="foot">Please try again in a moment.</p>') };
    }
};
