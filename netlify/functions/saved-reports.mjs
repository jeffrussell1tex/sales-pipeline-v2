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
import { serverErrorBody } from './_lib.mjs';
import { cleanDelivery } from '../../src/utils/reportDelivery.js';
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
    d.lastError       = prior?.lastError ?? null;
    return d;
};

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
        return row || null;
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
            const rows = await db.select().from(savedReports).where(where).orderBy(desc(savedReports.updatedAt));
            return { statusCode: 200, headers, body: JSON.stringify({ reports: rows }) };
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
            return { statusCode: result.ok ? 200 : 400, headers, body: JSON.stringify(result) };
        }

        // POST — create
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const delivery = 'delivery' in data ? await deliveryFor(data.delivery, null, orgId) : null;
            const payload = sanitize({ ...data, orgId, ownerId: userId, config: configFor(data.config, null, delivery) });
            const [inserted] = await db.insert(savedReports).values(payload).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ report: inserted }) };
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
                ownerName: existing.ownerName ?? data.ownerName ?? null,
                isShared:  'isShared' in data ? data.isShared === true : existing.isShared === true,
                config:    configFor(data.config, existing.config, delivery),
            });
            const { id, ...set } = merged;
            const [updated] = await db.update(savedReports)
                .set({ ...set, updatedAt: new Date() })
                .where(and(eq(savedReports.id, id), eq(savedReports.orgId, orgId)))
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ report: updated }) };
        }

        // DELETE
        if (event.httpMethod === 'DELETE') {
            const { id } = JSON.parse(event.body || '{}');
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const row = await rowOf(id);
            if (row && !mayTouch(row)) return forbiddenOwner;
            await db.delete(savedReports)
                .where(and(eq(savedReports.id, id), eq(savedReports.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ deleted: id }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('saved-reports error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'saved-reports') };
    }
};
