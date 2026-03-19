import { db } from '../../db/index.js';
import { spiffClaims } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const sanitize = (d) => ({
    id:              d.id,
    spiffId:         d.spiffId         || null,
    spiffName:       d.spiffName       || null,
    opportunityId:   d.opportunityId   || null,
    opportunityName: d.opportunityName || null,
    account:         d.account         || null,
    repName:         d.repName         || null,
    amount:          d.amount          ?? null,
    multiplier:      d.multiplier      ?? null,
    spiffType:       d.spiffType       || null,
    dealArr:         d.dealArr         ?? null,
    status:          d.status          || 'pending',
    note:            d.note            || null,
    claimedAt:       d.claimedAt       ? new Date(d.claimedAt)  : new Date(),
    approvedAt:      d.approvedAt      ? new Date(d.approvedAt) : null,
    approvedBy:      d.approvedBy      || null,
    paidAt:          d.paidAt          ? new Date(d.paidAt)     : null,
});

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userRole } = auth;

    const isAdmin   = userRole === 'Admin';
    const isManager = userRole === 'Manager';

    try {
        // ── GET: fetch all claims for this org ────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db.select()
                .from(spiffClaims)
                .where(eq(spiffClaims.orgId, orgId))
                .orderBy(desc(spiffClaims.claimedAt));
            return { statusCode: 200, headers, body: JSON.stringify({ spiffClaims: rows }) };
        }

        // ── POST: submit a new claim (reps) ───────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id || !data.repName || !data.spiffId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, repName, spiffId required' }) };
            }
            const [inserted] = await db.insert(spiffClaims)
                .values({ ...sanitize(data), orgId })
                .returning();
            return { statusCode: 201, headers, body: JSON.stringify({ spiffClaim: inserted }) };
        }

        // ── PUT: update a claim — approve / reject / mark paid / upsert ───────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

            // Only managers/admins can change status to approved/rejected/paid
            if (['approved','rejected','paid'].includes(data.status) && !isAdmin && !isManager) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only managers and admins can approve or reject claims' }) };
            }

            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(spiffClaims)
                .values({ ...clean, orgId })
                .onConflictDoUpdate({ target: spiffClaims.id, set: { ...updateData, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ spiffClaim: upserted }) };
        }

        // ── DELETE: remove a claim (managers/admins only) ─────────────────────
        if (event.httpMethod === 'DELETE') {
            if (!isAdmin && !isManager) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only managers and admins can delete claims' }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            await db.delete(spiffClaims).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('spiff-claims error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
