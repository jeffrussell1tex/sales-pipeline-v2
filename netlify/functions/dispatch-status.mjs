import { db } from '../../db/index.js';
import { dispatchJobs, dispatchCustomers, dispatchTechnicians, settings } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { esc, whenText, customerStatusLabel } from '../../src/utils/customerNotifications.js';

// dispatch-status.mjs — the customer's public job-status page (state §0.111,
// guide §18b35). The ONLY unauthenticated read of dispatch data in the app.
//
// Authority is the token alone: 24 random bytes issued by _customerNotify.mjs
// and stored on the job (dispatch_jobs.public_token, unique). No org id, no
// job id, no customer id is ever accepted or shown; an unknown or malformed
// token is a 404 with the same body either way. Everything rendered is
// escaped; the page is no-store and noindex; nothing on it links back into
// the authenticated app.
//
// Reached as /status/<token> (netlify.toml rewrites to ?t=).
const headers = {
    'Content-Type':    'text/html; charset=utf-8',
    'Cache-Control':   'no-store',
    'X-Robots-Tag':    'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
};

// base64url of 24 bytes is 32 chars; allow a little room, never more.
export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

const page = (title, body) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  body{margin:0;background:#f0ece4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#2a2622}
  .card{max-width:520px;margin:32px auto;background:#fbf8f3;border:1px solid #e6ddd0;border-radius:10px;padding:28px 28px 22px}
  .co{font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#8a8378;font-weight:700;margin:0 0 14px}
  h1{font-size:22px;margin:0 0 6px}
  .status{display:inline-block;margin:6px 0 18px;padding:5px 12px;border-radius:14px;background:#efe6d6;color:#7a6a48;font-weight:700;font-size:13px}
  .row{display:flex;gap:12px;padding:9px 0;border-top:1px solid #eee6da;font-size:14px}
  .row:first-of-type{border-top:0}
  .k{min-width:110px;color:#8a8378;font-weight:600}
  .v{color:#2a2622}
  .foot{margin-top:18px;font-size:12px;color:#8a8378}
</style></head><body><div class="card">${body}</div></body></html>`;

const notFound = () => ({
    statusCode: 404, headers,
    body: page('Status not found', '<h1>We could not find that visit</h1><p class="foot">The link may have expired or been copied incorrectly. Please use the link from your confirmation, or contact your service provider.</p>'),
});

export const handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: page('Not allowed', '<h1>Not allowed</h1>') };
    // The token arrives as the last PATH segment (/status/<token> is rewritten to
    // /.netlify/functions/dispatch-status/<token> — Netlify substitutes a
    // placeholder into a path, NOT into a query string: the first dev probe of
    // `?t=:token` reached this function with the literal ":token" and 404'd a
    // real link, state §0.111). `?t=` is still honoured for a direct call.
    const fromPath = String(event.path || '').match(/\/dispatch-status\/([^/?#]+)/);
    const token = String(event.queryStringParameters?.t || (fromPath ? decodeURIComponent(fromPath[1]) : '')).trim();
    if (!TOKEN_RE.test(token)) return notFound();

    try {
        const [job] = await db.select().from(dispatchJobs).where(eq(dispatchJobs.publicToken, token));
        if (!job) return notFound();

        // Everything else is read BY THE JOB'S ORG — the token found the job, the
        // job names the org, and nothing crosses it.
        const [cust] = await db.select().from(dispatchCustomers)
            .where(and(eq(dispatchCustomers.id, job.customerId), eq(dispatchCustomers.orgId, job.orgId)));
        const [tech] = job.assignedTechId
            ? await db.select().from(dispatchTechnicians)
                .where(and(eq(dispatchTechnicians.id, job.assignedTechId), eq(dispatchTechnicians.orgId, job.orgId)))
            : [];
        const [srow] = await db.select().from(settings).where(eq(settings.orgId, job.orgId));

        const company = srow?.extra?.companyDisplayName || srow?.companyName || 'Your service provider';
        const address = cust ? [cust.serviceAddress || cust.billingAddress, cust.serviceCity || cust.billingCity, cust.serviceState || cust.billingState]
            .filter(Boolean).join(', ') : '';
        const rows = [
            ['When',       whenText(job)],
            ['Technician', tech ? tech.firstName : 'To be assigned'],
            ['Where',      address || '—'],
            ['Reference',  job.jobNumber || '—'],
        ].map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');

        const body = `
<p class="co">${esc(company)}</p>
<h1>${esc(job.title || 'Service visit')}</h1>
<span class="status">${esc(customerStatusLabel(job.status))}</span>
${rows}
<p class="foot">This page shows the current status of your visit and updates as it changes. Questions? Reply to your confirmation email or call ${esc(company)}.</p>`;
        return { statusCode: 200, headers, body: page(`${job.title || 'Service visit'} — ${company}`, body) };
    } catch (err) {
        console.error('dispatch-status error:', err.message);
        return { statusCode: 500, headers, body: page('Temporarily unavailable', '<h1>Temporarily unavailable</h1><p class="foot">Please try again in a moment.</p>') };
    }
};
