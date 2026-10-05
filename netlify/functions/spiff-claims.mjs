import { db } from '../../db/index.js';
import { spiffClaims } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';

// A claim names its rep by name only (spiff_claims has no owner id), so a rep's
// own claim is the one whose name is theirs — trimmed and in any case, as owners
// resolve (_lib.mjs, resolveOwnerId). State §0.169.
const sameName = (a, b) => {
    const x = String(a ?? '').trim().toLowerCase();
    return !!x && x === String(b ?? '').trim().toLowerCase();
};

// A status a manager sets names the event (§0.143); a rep's edit is an update.
const CLAIM_STATUS_ACTIONS = Object.freeze({ approved: 'spiff_claim.approved', rejected: 'spiff_claim.rejected', paid: 'spiff_claim.paid' });

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

    // POST (claim submission) had no role check at all — approve/reject and
    // delete were already gated below.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

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
            // A rep's claim is filed in their own name, pending, with nothing
            // approved or paid on it (state §0.169) — the body named any rep and
            // any state. The name is the roster's, as a document's owner is
            // (§0.166): the client sends the deal's rep, and a rename never reaches
            // a deal's stored rep, so comparing the two would refuse a renamed rep's
            // own deal. A manager files for the deal's rep, as sent.
            let claim = sanitize(data);
            if (!isAdmin && !isManager) {
                const me = await getCallerName(auth.userId, orgId);
                if (!me) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Your account is not on this organization\'s team list.' }) };
                claim = { ...claim, repName: me, status: 'pending', approvedAt: null, approvedBy: null, paidAt: null };
            }
            const [inserted] = await db.insert(spiffClaims)
                .values({ ...claim, orgId })
                .returning();
            await auditAs(orgId, auth.userId, { action: 'spiff_claim.submitted', entityType: 'spiff_claim', entityId: inserted.id, entityName: `${inserted.repName} · ${inserted.spiffName || inserted.spiffId}`, detail: `${inserted.account || inserted.opportunityName || ''}${inserted.amount != null ? ` · $${Number(inserted.amount).toLocaleString()}` : ''}`.trim() || null });
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

            // The stored claim is the base of the update (state §0.169). sanitize()
            // builds a FULL row (CLAUDE.md): a body naming the claim's SPIFF and rep
            // but not its status reset an approved claim to pending and blanked its
            // approval, and a body naming neither failed the insert's NOT NULL check
            // — a 500.
            const [existing] = await db.select().from(spiffClaims)
                .where(and(eq(spiffClaims.id, data.id), eq(spiffClaims.orgId, orgId)));
            let changes = data;
            if (!isAdmin && !isManager) {
                // A rep edits their own claim, while it is pending; its approval and
                // payment are a manager's (state §0.169) — a rep could edit any rep's
                // claim, and set who approved it and when it was paid.
                if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };
                if (!sameName(existing.repName, await getCallerName(auth.userId, orgId))) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only edit your own claims.' }) };
                }
                if ((existing.status || 'pending') !== 'pending') {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'A claim can only be edited while it is pending.' }) };
                }
                const { status: _status, approvedAt: _approvedAt, approvedBy: _approvedBy, paidAt: _paidAt, repName: _repName, ...ownFields } = data;
                changes = ownFields;
            }
            const clean = sanitize({ ...(existing || {}), ...changes });
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(spiffClaims)
                .values({ ...clean, orgId })
                .onConflictDoUpdate({ target: spiffClaims.id, setWhere: eq(spiffClaims.orgId, orgId), set: { ...updateData, updatedAt: new Date() } })
                .returning();
            // An id another org holds (state §0.166): the org-scoped upsert writes
            // nothing, and this went on to crash on the missing row — a 500.
            if (!upserted) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };
            await auditAs(orgId, auth.userId, { action: CLAIM_STATUS_ACTIONS[data.status] || 'spiff_claim.updated', entityType: 'spiff_claim', entityId: upserted.id, entityName: `${upserted.repName} · ${upserted.spiffName || upserted.spiffId}`, detail: `${upserted.status || 'pending'}${upserted.amount != null ? ` · $${Number(upserted.amount).toLocaleString()}` : ''}` });
            return { statusCode: 200, headers, body: JSON.stringify({ spiffClaim: upserted }) };
        }

        // ── DELETE: remove a claim (managers/admins only) ─────────────────────
        if (event.httpMethod === 'DELETE') {
            if (!isAdmin && !isManager) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only managers and admins can delete claims' }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            const [gone] = await db.delete(spiffClaims).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, orgId))).returning({ id: spiffClaims.id, repName: spiffClaims.repName, spiffName: spiffClaims.spiffName, spiffId: spiffClaims.spiffId, status: spiffClaims.status });
            if (gone) await auditAs(orgId, auth.userId, { action: 'spiff_claim.deleted', entityType: 'spiff_claim', entityId: gone.id, entityName: `${gone.repName} · ${gone.spiffName || gone.spiffId}`, detail: `was ${gone.status || 'pending'}` });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('spiff-claims error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'spiff-claims') };
    }
};
