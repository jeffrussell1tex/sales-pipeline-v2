// saved-reports.mjs — the report library (state §0.133 the builder saves in
// place; §0.135 sharing, scheduled delivery, "Send now").
//
// Visibility: a report is its owner's until they share it. GET returns the
// caller's own reports and the shared ones (an Admin reads the whole org). The
// endpoint used to return every row in the org and call it "own + shared" —
// `isShared` was stored and read by nothing.
//
// PUT is READ-THEN-MERGE (CLAUDE.md: `sanitize()` is a full-row builder). A
// partial body — a share toggle `{ id, isShared }`, a schedule `{ id, delivery }`
// — merges over the stored row; before this it rebuilt the row from the body
// and wiped the definition, and re-stamped ownerId with the CALLER, so an
// Admin touching someone's report took it. The owner never changes on PUT.
//
// The delivery schedule (config.delivery) is an allowlisted shape
// (reportDelivery.js cleanDelivery — guide §18b37) and its recipients are
// roster ids resolved in THIS org: an id from anywhere else is dropped. The
// job's stamps (lastDeliveredAt, lastError) are the job's — a client body
// never sets them.
import { db }            from '../../db/index.js';
import { savedReports, users } from '../../db/schema.js';
import { eq, and, or, desc } from 'drizzle-orm';
import { verifyAuth, requireWrite, isAdmin } from './auth.mjs';
import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';
import { ownIdTaken } from './_lib.mjs';   // a create's taken id, this org's (state §0.261)
import { cleanDelivery, deliverySummary } from '../../src/utils/reportDelivery.js';
import { noAddresses } from '../../src/utils/reportDelivery.js';
import { namedByMaker } from '../../src/utils/reportMaker.js';
import { deliverReport } from './report-deliveries.mjs';

const headers = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const sanitize = (data) => ({
    id:          data.id,
    orgId:       data.orgId,
    ownerId:     data.ownerId,
    ownerName:   data.ownerName   ?? null,
    name:        data.name        ?? 'Untitled report',
    description: data.description ?? null,
    source:      data.source      ?? null,
    dims:        data.dims        ?? null,
    metrics:     data.metrics     ?? null,
    chartType:   data.chartType   ?? null,
    filters:     data.filters     ?? null,
    config:      data.config      ?? null,
    isShared:    data.isShared === true,
});

// The stored delivery from a body's, with the recipients limited to THIS org's
// roster and the job's stamps carried from what is stored. `null` clears it.
const deliveryFor = async (bodyDelivery, existingDelivery, orgId) => {
    const d = cleanDelivery(bodyDelivery);
    if (!d) return null;
    if (d.emailTo.length) {
        const roster = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId));
        const ids = new Set(roster.map(u => u.id));
        d.emailTo = d.emailTo.filter(id => ids.has(id));
    }
    const prior = cleanDelivery(existingDelivery);
    d.lastDeliveredAt = prior?.lastDeliveredAt ?? null;
    d.lastSentAt      = prior?.lastSentAt ?? null;
    d.lastError       = prior?.lastError ?? null;
    return d;
};

// Who made each report (state §0.250, guide §18b125 rule 2): the maker's LIVE name — the member of THIS org whose
// Clerk id is the row's ownerId — else the stored name, else none (namedByMaker, src/utils/reportMaker.js). One read
// of this org's roster, its names and Clerk ids only, mapped in JS: never another org's member; nothing is written.
// Display only: a roster read that fails answers the rows with their stored names — never a 500 over a create or a
// save that landed (a retried create would meet its own id's 409), nor over the whole library's GET.
const makersNamed = async (rows, orgId) => {
    if (!orgId || !rows.some(Boolean)) return rows;
    let roster;
    try {
        roster = await db.select({ clerkUserId: users.clerkUserId, name: users.name }).from(users).where(eq(users.orgId, orgId));
    } catch (e) {
        console.warn('saved-reports makers:', e.message);
        return rows;
    }
    return namedByMaker(rows, roster);
};

// A report with the addresses a last error kept until §0.298 named taken out of it: read for an answer, or to be saved again.
const addressesOff = (r) => (r.config?.delivery?.lastError ? { ...r, config: { ...r.config, delivery: { ...r.config.delivery, lastError: noAddresses(r.config.delivery.lastError) } } } : r);

// config after a body: the body's config keys merge over the stored ones; the
// delivery key is decided separately and never overwritten by a body's config.
const configFor = (bodyConfig, existingConfig, delivery) => {
    const base = { ...(existingConfig || {}), ...(bodyConfig && typeof bodyConfig === 'object' && !Array.isArray(bodyConfig) ? bodyConfig : {}) };
    delete base.delivery;
    if (delivery) base.delivery = delivery;
    return Object.keys(base).length ? base : null;
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    const params = event.queryStringParameters || {};

    // A saved report belongs to whoever created it. Only that owner or an Admin
    // may modify, deliver or delete it.
    const rowOf = async (id) => {
        const [row] = await db.select().from(savedReports)
            .where(and(eq(savedReports.id, id), eq(savedReports.orgId, orgId)));
        return row ? addressesOff(row) : null;
    };
    const mayTouch = (row) => isAdmin(userRole) || row.ownerId === userId;
    const forbiddenOwner = { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: you can only modify your own saved reports' }) };
    const notFound = { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

    try {
        // GET — the caller's own reports and the shared ones; an Admin reads the org
        if (event.httpMethod === 'GET') {
            const where = isAdmin(userRole)
                ? eq(savedReports.orgId, orgId)
                : and(eq(savedReports.orgId, orgId), or(eq(savedReports.ownerId, userId), eq(savedReports.isShared, true)));
            const rows = (await db.select().from(savedReports).where(where).orderBy(desc(savedReports.updatedAt))).map(addressesOff);
            return { statusCode: 200, headers, body: JSON.stringify({ reports: await makersNamed(rows, orgId) }) };
        }

        // POST ?action=deliver&id= — run the report now and send it where its
        // schedule says (owner or Admin). The same path the hourly job takes.
        if (event.httpMethod === 'POST' && params.action === 'deliver') {
            const id = params.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            const row = await rowOf(id);
            if (!row) return notFound;
            if (!mayTouch(row)) return forbiddenOwner;
            const result = await deliverReport(row, { now: new Date(), trigger: 'manual' });
            // The audit log says where it went (§0.143). The job logs its own scheduled sends.
            const went = [...(result.sent?.email || []), ...(result.sent?.slack ? ['Slack'] : [])];
            await auditAs(orgId, userId, {
                action: 'saved_report.sent_now', entityType: 'saved_report', entityId: row.id, entityName: row.name,
                detail: (went.length ? `Sent to ${went.join(', ')} — ${result.rows} rows` : `Not sent: ${(result.errors || []).join(' | ')}`).slice(0, 300),
            });
            return { statusCode: result.ok ? 200 : 400, headers, body: JSON.stringify(result) };
        }

        // POST — create
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const delivery = 'delivery' in data ? await deliveryFor(data.delivery, null, orgId) : null;
            const payload = sanitize({
                ...data, orgId, ownerId: userId, config: configFor(data.config, null, delivery),
                // Who made it (state §0.250, guide §18b125 rule 2): the server's — the caller's member name on this
                // org's roster, none when they have no row here — after the body's keys, so a body naming one is ignored.
                ownerName: (await getCallerName(userId, orgId)) || null,
            });
            // A taken id — this org's or another's — writes nothing and is answered 409 (state §0.250, as products §0.242).
            const [inserted] = await db.insert(savedReports).values(payload).onConflictDoNothing({ target: savedReports.id }).returning();
            // Held in THIS org: an earlier press of this create landed (state §0.261, the unknown-save rule's Part 6) — said
            // with code 'idInUse', which the screen reads as landed. Another org's id: the words alone, below.
            if (!inserted && await ownIdTaken(savedReports, payload.id, orgId)) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That report id is already in use.', code: 'idInUse' }) };
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That report id is already in use.' }) };
            await auditAs(orgId, userId, {
                action: 'saved_report.created', entityType: 'saved_report', entityId: inserted.id, entityName: inserted.name,
                detail: inserted.description || `${inserted.source || 'Opportunities'}${inserted.isShared ? ' · shared' : ''}`,
            });
            return { statusCode: 201, headers, body: JSON.stringify({ report: (await makersNamed([inserted], orgId))[0] }) };
        }

        // PUT — read-then-merge: rename, share, schedule, or the builder's save in place
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const existing = await rowOf(data.id);
            if (!existing) return notFound;
            if (!mayTouch(existing)) return forbiddenOwner;
            const delivery = 'delivery' in data
                ? await deliveryFor(data.delivery, existing.config?.delivery, orgId)
                : (cleanDelivery(existing.config?.delivery) || null);
            const merged = sanitize({
                ...existing, ...data,
                orgId,
                ownerId:   existing.ownerId,                       // never the caller's
                ownerName: existing.ownerName ?? null,                 // the stored one, never a body's (§0.250)
                isShared:  'isShared' in data ? data.isShared === true : existing.isShared === true,
                config:    configFor(data.config, existing.config, delivery),
            });
            const { id, ...set } = merged;
            const [updated] = await db.update(savedReports)
                .set({ ...set, updatedAt: new Date() })
                .where(and(eq(savedReports.id, id), eq(savedReports.orgId, orgId)))
                .returning();
            // One event per gesture (§0.143): a schedule carries the schedule in words,
            // a share toggle is its own event, everything else is an update.
            const action = 'delivery' in data ? 'saved_report.scheduled' : ('isShared' in data && !('name' in data) && !('dims' in data)) ? (data.isShared ? 'saved_report.shared' : 'saved_report.unshared') : 'saved_report.updated';
            await auditAs(orgId, userId, {
                action, entityType: 'saved_report', entityId: updated.id, entityName: updated.name,
                detail: action === 'saved_report.scheduled' ? deliverySummary(updated.config?.delivery) : null,
            });
            return { statusCode: 200, headers, body: JSON.stringify({ report: (await makersNamed([updated], orgId))[0] }) };
        }

        // DELETE
        if (event.httpMethod === 'DELETE') {
            const { id } = JSON.parse(event.body || '{}');
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const row = await rowOf(id);
            if (row && !mayTouch(row)) return forbiddenOwner;
            await db.delete(savedReports)
                .where(and(eq(savedReports.id, id), eq(savedReports.orgId, orgId)));
            if (row) await auditAs(orgId, userId, { action: 'saved_report.deleted', entityType: 'saved_report', entityId: id, entityName: row.name, detail: row.description || null });
            return { statusCode: 200, headers, body: JSON.stringify({ deleted: id }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('saved-reports error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'saved-reports') };
    }
};
