import crypto from 'crypto';
import { db } from '../../db/index.js';
import { activities, contacts } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';

// ── BCC email dropbox ────────────────────────────────────────────────────────
// Each org gets a unique, unguessable BCC address. A rep BCCs it on any email;
// the provider (Resend Inbound) webhooks the parsed message here, and we log it
// as an Email activity on the matching contact (and their account).
//
// Address format:  log-<orgId>-<sig>@<INBOUND_DOMAIN>
//   sig = first 16 hex chars of HMAC-SHA256(orgId, BCC_SECRET)
// Stateless: no token table; the signature both identifies and authenticates
// the org, so a guessed/forged address fails verification.
//
// Endpoints:
//   GET  (Clerk-authed)  -> { address } for the caller's org, for display in Settings.
//   POST (webhook)       -> verified via Svix signature (RESEND_INBOUND_SECRET)
//                           or ?secret=<INBOUND_SHARED_SECRET> for other providers.
//
// Required env vars: BCC_SECRET, INBOUND_DOMAIN, RESEND_INBOUND_SECRET
// (or INBOUND_SHARED_SECRET), and RESEND_API_KEY (to fetch the full message —
// Resend's webhook carries metadata only: no body, no header recipients).

const NOTES_MAX = 4000;

const orgSig = (orgId) =>
    crypto.createHmac('sha256', process.env.BCC_SECRET || '')
        .update(orgId).digest('hex').slice(0, 16);

const orgAddress = (orgId) =>
    `log-${orgId}-${orgSig(orgId)}@${process.env.INBOUND_DOMAIN || ''}`;

// Parse "log-<orgId>-<sig>@domain" out of any recipient; verify sig; return orgId.
function orgFromRecipients(addresses) {
    for (const raw of addresses) {
        const addr = String(raw || '').toLowerCase();
        const m = addr.match(/(?:^|<|\s)log-([a-z0-9_]+)-([a-f0-9]{16})@/i);
        if (!m) continue;
        const [, orgIdLower, sig] = m;
        // Clerk org ids are case-sensitive but our match lowercased; recompute against
        // the literal substring from the original string to preserve case.
        const orig = String(raw).match(/log-([A-Za-z0-9_]+)-([A-Fa-f0-9]{16})@/);
        const orgId = orig ? orig[1] : orgIdLower;
        if (crypto.timingSafeEqual(Buffer.from(orgSig(orgId)), Buffer.from(sig.toLowerCase()))) return orgId;
    }
    return null;
}

// Verify a Resend (Svix) webhook signature: HMAC-SHA256 over "id.timestamp.body"
// with the base64 portion of the signing secret ("whsec_...").
function verifySvix(event) {
    const secret = process.env.RESEND_INBOUND_SECRET;
    if (!secret) return false;
    const id = event.headers['svix-id'];
    const ts = event.headers['svix-timestamp'];
    const sigHeader = event.headers['svix-signature'];
    if (!id || !ts || !sigHeader) return false;
    // Reject stale timestamps (5 min window) to blunt replay.
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto.createHmac('sha256', key)
        .update(`${id}.${ts}.${event.body}`).digest('base64');
    return sigHeader.split(' ').some(part => {
        const candidate = part.includes(',') ? part.split(',')[1] : part;
        try {
            return candidate.length === expected.length &&
                crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
        } catch { return false; }
    });
}

const emailOnly = (s) => {
    const m = String(s || '').match(/<([^>]+)>/);
    return (m ? m[1] : String(s || '')).trim().toLowerCase();
};

// Pull every email address out of a raw header value (handles display names,
// angle brackets, and multiple comma-separated addresses).
const extractEmails = (s) =>
    (String(s || '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi) || [])
        .map(a => a.toLowerCase());

// Resend's received-email `to`/`cc`/`bcc` carry the SMTP ENVELOPE recipient
// (our dropbox address) — NOT the message's header To/Cc. The real recipients
// (the contact a rep BCC'd us on) live in the parsed `headers` map. Pull them
// from the recipient-bearing headers, normalizing key case and the two header
// shapes Resend may return (object map, or array of { name, value }).
function headerAddresses(full) {
    const h = full && full.headers;
    if (!h) return [];
    const map = {};
    if (Array.isArray(h)) {
        for (const it of h) {
            const name = String((it && (it.name || it.key)) || '').toLowerCase();
            if (name) map[name] = (it && it.value) || '';
        }
    } else if (typeof h === 'object') {
        for (const k of Object.keys(h)) map[k.toLowerCase()] = h[k];
    }
    const wanted = ['to', 'cc', 'delivered-to', 'x-original-to', 'x-forwarded-to'];
    return wanted.flatMap(name => extractEmails(map[name]));
}

// Last resort: if neither the structured fields nor the headers map surface a
// usable recipient, download the raw RFC822 message (signed, short-lived URL)
// and parse To/Cc out of its header block. Header parsing only — bounded work.
async function rawRecipients(full) {
    const url = full && full.raw && full.raw.download_url;
    if (!url) return [];
    try {
        const res = await fetch(url);
        if (!res.ok) { console.log(`email-inbound: raw download -> ${res.status}`); return []; }
        const raw = await res.text();
        // Header block ends at the first blank line; unfold folded continuation lines.
        const headerBlock = raw.split(/\r?\n\r?\n/, 1)[0] || '';
        const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
        const addrs = [];
        for (const line of unfolded.split(/\r?\n/)) {
            const m = line.match(/^(to|cc|delivered-to|x-original-to):(.*)$/i);
            if (m) addrs.push(...extractEmails(m[2]));
        }
        return addrs;
    } catch (e) {
        console.warn('email-inbound: raw parse failed:', e.message);
        return [];
    }
}

// Resend's email.received webhook payload contains ONLY metadata plus the SMTP
// envelope recipient in `to` (i.e. the dropbox address itself) — the real header
// To/Cc and the body are NOT included and must be fetched back by email_id via
// the Received emails API (docs: “Webhooks do not include the email body,
// headers, or attachments”). Falls back to the sent-email endpoint defensively.
async function fetchReceivedEmail(emailId) {
    const key = process.env.RESEND_API_KEY;
    if (!key || !emailId) return null;
    const get = async (url) => {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) {
            console.log(`email-inbound: GET ${url} -> ${res.status}`);
            return null;
        }
        return res.json();
    };
    try {
        const fromReceiving = await get(`https://api.resend.com/emails/receiving/${emailId}`);
        if (fromReceiving) return { data: fromReceiving, endpoint: 'receiving' };
        const fromEmails = await get(`https://api.resend.com/emails/${emailId}`);
        if (fromEmails) return { data: fromEmails, endpoint: 'emails' };
        return null;
    } catch (e) {
        console.warn('email-inbound: fetch of received email failed:', e.message);
        return null;
    }
}

// The retrieved html can arrive as a data URI (html_format: 'data_uri') —
// decode it before stripping tags.
function htmlToText(html) {
    let h = String(html || '');
    if (h.startsWith('data:')) {
        const comma = h.indexOf(',');
        const meta = h.slice(0, comma);
        const payload = h.slice(comma + 1);
        try { h = meta.includes('base64') ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload); }
        catch { h = ''; }
    }
    return h.replace(/<[^>]+>/g, ' ');
}

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    try {
        // ── GET: return this org's dropbox address (Clerk-authed, for Settings UI) ──
        if (event.httpMethod === 'GET') {
            // verifyAuth returns { userId, orgId, ... } on success or { error, status }
            // on failure (see accounts.mjs) — not a payload object.
            const auth = await verifyAuth(event);
            if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
            if (!process.env.BCC_SECRET || !process.env.INBOUND_DOMAIN) {
                return { statusCode: 200, headers, body: JSON.stringify({ address: null, configured: false }) };
            }
            return { statusCode: 200, headers, body: JSON.stringify({ address: orgAddress(auth.orgId), configured: true }) };
        }

        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
        }

        // ── POST: provider webhook ──
        const qs = event.queryStringParameters || {};
        const sharedOk = process.env.INBOUND_SHARED_SECRET && qs.secret === process.env.INBOUND_SHARED_SECRET;
        if (!sharedOk && !verifySvix(event)) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid webhook signature' }) };
        }

        const body = JSON.parse(event.body || '{}');
        // Resend inbound shape: { type: 'email.received', data: { from, to, cc, bcc, subject, text, html } }
        // Accept a flat shape too, for other providers / manual tests.
        const mail = body.data || body;
        const from = mail.from?.email || mail.from || '';
        const toList = [].concat(mail.to || [], mail.cc || [], mail.bcc || [])
            .map(r => (r && typeof r === 'object') ? (r.email || '') : r);
        const orgId = orgFromRecipients(toList);
        if (!orgId) {
            // Unknown/forged dropbox address — acknowledge so the provider doesn't retry.
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true, matched: false, reason: 'no valid dropbox recipient' }) };
        }

        // The webhook's `to` was just the dropbox (envelope); fetch the full parsed
        // message for the real header To/Cc (contact matching) and the body (notes).
        const fetched = await fetchReceivedEmail(mail.email_id);
        const full = fetched?.data || null;

        const subject = String((full?.subject ?? mail.subject) || '').slice(0, 500);
        const rawText = full
            ? (full.text || htmlToText(full.html))
            : (mail.text || htmlToText(mail.html));
        const text = String(rawText || '').replace(/\s+/g, ' ').trim();

        // Match a contact: prefer the real header recipients (a rep BCCs us on mail
        // addressed TO the contact), then the sender (inbound mail forwarded to the
        // dropbox). The header To/Cc are NOT in `full.to` — that's the envelope, i.e.
        // our own dropbox address — so we read `full.headers`, with a raw-MIME fallback.
        const fromEmail = emailOnly(from);
        const isExternal = (e) => e && !e.startsWith('log-');

        // Structured fields too (defensive: tolerate string OR { email } entry shapes).
        const structured = full
            ? [].concat(full.to || [], full.cc || [], full.bcc || [])
                .map(r => (r && typeof r === 'object') ? (r.email || '') : r)
                .map(emailOnly)
            : [];

        let recipients = [
            ...headerAddresses(full),
            ...structured,
            ...toList.map(emailOnly),
        ].filter(isExternal);

        // Only download the raw message if the parsed fields yielded nothing to match.
        let usedRaw = false;
        if (recipients.length === 0 && full) {
            recipients = (await rawRecipients(full)).filter(isExternal);
            usedRaw = true;
        }

        const candidates = [...new Set([...recipients, fromEmail].filter(Boolean))];

        const orgContacts = await db.select().from(contacts).where(eq(contacts.orgId, orgId));
        let matched = null;
        for (const cand of candidates) {
            matched = orgContacts.find(c =>
                (c.email || '').trim().toLowerCase() === cand || (c.personalEmail || '').trim().toLowerCase() === cand);
            if (matched) break;
        }
        if (!matched) {
            // Surface what we tried so the webhook delivery log is self-diagnosing:
            // whether the full-email fetch worked, and which addresses we matched on.
            const shape = full ? {
                endpoint: fetched.endpoint,
                keys: Object.keys(full),
                headerKeys: (full.headers && typeof full.headers === 'object' && !Array.isArray(full.headers))
                    ? Object.keys(full.headers)
                    : (Array.isArray(full.headers) ? 'array' : null),
                to: full.to ?? null, cc: full.cc ?? null, bcc: full.bcc ?? null,
                rawAvailable: !!(full.raw && full.raw.download_url), usedRaw,
            } : null;
            console.log('email-inbound: no match', JSON.stringify({ fetchedFullEmail: !!full, candidates, orgContactCount: orgContacts.length, shape }));
            return { statusCode: 200, headers, body: JSON.stringify({
                ok: true, matched: false, reason: 'no contact matched participants',
                debug: { fetchedFullEmail: !!full, candidates, shape },
            }) };
        }

        const today = new Date().toISOString().slice(0, 10);
        const activity = {
            id: 'id_' + crypto.randomUUID(),
            type: 'Email',
            date: today,
            subject: subject || null,
            notes: ((subject ? subject + ' \u2014 ' : '') + text).slice(0, NOTES_MAX) || 'Email (no body captured)',
            outcome: null,
            duration: null,
            opportunityId: null,
            contactId: matched.id,
            contactIds: [matched.id],
            accountId: matched.accountId || null,
            leadId: null,
            author: fromEmail || null,
            createdAt: new Date(),
            orgId,
        };
        const [inserted] = await db.insert(activities).values(activity).returning();

        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, matched: true, activityId: (inserted || activity).id }) };
    } catch (error) {
        console.error('email-inbound error:', error);
        return { statusCode: 500, headers, body: serverErrorBody(error) };
    }
};
