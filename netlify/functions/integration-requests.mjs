// netlify/functions/integration-requests.mjs
//
// A workspace asks for a third-party integration that does not exist yet
// (state §0.90, handoff item 24 — Jeff: "option a"). This replaced a connect
// modal that showed "Morgan Reyes · morgan@accelerep.com", a fixed scope list
// and an Authorize button that closed the dialog. A request is honest: it is
// recorded on the org, audited, and — when INTEGRATION_REQUESTS_TO is set —
// mailed to the product owner through the shared Resend mailer, so the list of
// what customers actually want is real demand, not a catalogue.
//
//   POST /.netlify/functions/integration-requests   { appId, note? }
//     → 200 { request: { appId, requestedAt, byUserId, note }, already, notified }
//     400 unknown appId · 403 read-only / technician · 401 no session
//
// Storage: settings.extra.integrationRequests = { [appId]: { requestedAt,
// byUserId, byName, note } } — one entry per app per org; a second request for
// the same app returns the first (already:true), sends nothing, audits nothing.
// The key is carried by BOTH halves of settings.mjs (guide 18b12) so an Admin's
// settings save never wipes it. No new table (guide 18c not engaged).
//
// The catalogue is src/utils/integrationCatalog.js — the same module the panel
// renders — so an id the panel can show is exactly an id this accepts.
import { db } from '../../db/index.js';
import { settings, users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { writeAudit, serverErrorBody } from './_lib.mjs';
import { sendEmail } from './send-email.mjs';
import { requestableApp, cleanNote } from '../../src/utils/integrationCatalog.js';

const HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Who asked, for the mail and the record. users.clerk_user_id is the Clerk
// identity verifyAuth hands back; users.id is the app id — separate spaces.
async function requesterOf(orgId, clerkUserId) {
    try {
        const rows = await db
            .select({ name: users.name, email: users.email })
            .from(users)
            .where(and(eq(users.orgId, orgId), eq(users.clerkUserId, clerkUserId)))
            .limit(1);
        return rows[0] || null;
    } catch { return null; }
}

// Mail the owner. Never throws — the request is recorded whether or not the
// mail goes; the response says which.
async function notifyOwner({ app, orgId, orgName, requester, note, requestedAt, totalForOrg }) {
    const to = process.env.INTEGRATION_REQUESTS_TO;
    if (!to) return false;
    try {
        const who = requester ? `${requester.name || '(no name)'} <${requester.email || 'no email'}>` : '(unknown user)';
        await sendEmail({
            to,
            subject: `Integration request: ${app.name} — ${orgName || orgId}`,
            text: [
                `Integration requested: ${app.name} (${app.id}, ${app.category})`,
                `Workspace: ${orgName || '(no company name)'} · ${orgId}`,
                `Requested by: ${who}`,
                `When: ${requestedAt}`,
                `Note: ${note || '(none)'}`,
                `This workspace has now requested ${totalForOrg} integration${totalForOrg === 1 ? '' : 's'}.`,
            ].join('\n'),
            html: `<p><b>Integration requested:</b> ${esc(app.name)} <span style="color:#666">(${esc(app.id)}, ${esc(app.category)})</span></p>
<p><b>Workspace:</b> ${esc(orgName || '(no company name)')} · <code>${esc(orgId)}</code><br>
<b>Requested by:</b> ${esc(who)}<br>
<b>When:</b> ${esc(requestedAt)}</p>
<p><b>Note:</b> ${note ? esc(note) : '<i>(none)</i>'}</p>
<p style="color:#666">This workspace has now requested ${totalForOrg} integration${totalForOrg === 1 ? '' : 's'}.</p>`,
        });
        return true;
    } catch (err) {
        console.error('integration-requests: mail not sent —', err.message);
        return false;
    }
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const auth = await verifyAuth(event);
    if (auth.error) return json(auth.status || 401, { error: auth.error });
    const forbidden = requireWrite(auth, event, HEADERS);
    if (forbidden) return forbidden;
    const { userId, orgId } = auth;

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Body must be JSON' }); }
    const app = requestableApp(body.appId);
    if (!app) return json(400, { error: 'Unknown integration. Only apps in the catalogue can be requested.' });
    const note = cleanNote(body.note);

    try {
        const rows = await db.select().from(settings).where(eq(settings.orgId, orgId)).limit(1);
        const row = rows[0] || null;
        const existing = (row?.extra && typeof row.extra === 'object' ? row.extra.integrationRequests : null) || {};

        if (existing[app.id]?.requestedAt) {
            return json(200, { request: { appId: app.id, ...existing[app.id] }, already: true, notified: false });
        }

        const requester = await requesterOf(orgId, userId);
        const requestedAt = new Date().toISOString();
        const record = { requestedAt, byUserId: userId, byName: requester?.name || null, note: note || null };
        const next = { ...existing, [app.id]: record };

        if (row) {
            await db.update(settings)
                .set({ extra: { ...(row.extra || {}), integrationRequests: next }, updatedAt: new Date() })
                .where(eq(settings.orgId, orgId));
        } else {
            // No settings row yet (a workspace that never saved a setting): the
            // same shape settings.mjs's upsert creates, with only this key.
            await db.insert(settings).values({ id: orgId, orgId, extra: { integrationRequests: next }, updatedAt: new Date() });
        }

        await writeAudit(orgId, {
            action: 'integration.requested', entityType: 'integration', entityId: app.id, entityName: app.name,
            detail: note || null, userId, userName: requester?.name || null,
        });

        const notified = await notifyOwner({
            app, orgId, orgName: row?.companyName || null, requester, note, requestedAt,
            totalForOrg: Object.keys(next).length,
        });

        return json(200, { request: { appId: app.id, ...record }, already: false, notified });
    } catch (err) {
        // serverErrorBody is already a JSON string (it logs the requestId too).
        return { statusCode: 500, headers: HEADERS, body: serverErrorBody(err, 'integration-requests') };
    }
};
