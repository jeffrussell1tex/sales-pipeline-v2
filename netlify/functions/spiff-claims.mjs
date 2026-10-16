import { db } from '../../db/index.js';
import { spiffClaims } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';
import { checkLinks } from './_links.mjs';

// A claim's deal and its SPIFF (state §0.204 — Jeff, 15 Oct: "Any of this org's, refuse"): a deal of this org,
// an entry of its SPIFF list — any, an inactive one too — when a write names it anew; one the claim holds is
// never asked again (a SPIFF removed since, a deal deleted since). Anything else is refused, naming the field.
const CLAIM_LINKS = [{ key: 'opportunityId', kind: 'deal' }, { key: 'spiffId', kind: 'spiff' }];

// A claim names its rep by name only (spiff_claims has no owner id), so a rep's
// own claim is the one whose name is theirs — trimmed and in any case, as owners
// resolve (_lib.mjs, resolveOwnerId). State §0.169.
const sameName = (a, b) => {
    const x = String(a ?? '').trim().toLowerCase();
    return !!x && x === String(b ?? '').trim().toLowerCase();
};

// A claim's SPIFF or rep is blank (state §0.204) as its write would store it: text that is empty or spaces, or
// any value sanitize's `|| null` stores as none — 0 and false too, which read as set through String() and met
// the NOT NULL (a 500). Anything else is not blank: an object or a number is the link check's to refuse (a SPIFF
// that is no id is 400), never String()'s to throw on.
const blankText = (v) => (typeof v === 'string' ? !v.trim() : !v);

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
            // A SPIFF of spaces is none (state §0.204), as no SPIFF is; the rep is tested below, on the claim as written.
            if (!data.id || blankText(data.spiffId)) {
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
            // The rep it is filed for is named (state §0.204), on the claim as written: a rep's own claim is their
            // roster name, whatever the body sent; a manager's names the body's rep, and spaces name none — a claim
            // filed for "  " was no rep's, no name matches it.
            if (blankText(claim.repName)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, repName, spiffId required' }) };
            // A claim id is text (state §0.204), as a member's is.
            if (typeof data.id !== 'string') return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };
            // Its deal and SPIFF are this org's (CLAIM_LINKS), asked of the claim as written: no deal asks nothing.
            const linked = await checkLinks(CLAIM_LINKS, claim, null, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            // An id another org holds writes nothing — answered, not crashed on the key (state §0.204).
            const [inserted] = await db.insert(spiffClaims)
                .values({ ...claim, orgId })
                .onConflictDoNothing({ target: spiffClaims.id }).returning();
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That claim id is already in use.' }) };
            await auditAs(orgId, auth.userId, { action: 'spiff_claim.submitted', entityType: 'spiff_claim', entityId: inserted.id, entityName: `${inserted.repName} · ${inserted.spiffName || inserted.spiffId}`, detail: `${inserted.account || inserted.opportunityName || ''}${inserted.amount != null ? ` · $${Number(inserted.amount).toLocaleString()}` : ''}`.trim() || null });
            return { statusCode: 201, headers, body: JSON.stringify({ spiffClaim: inserted }) };
        }

        // ── PUT: update a claim — approve / reject / mark paid / edit ─────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            // A claim id is text (state §0.204), as a member's is.
            if (!data.id || typeof data.id !== 'string') return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

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
            // A claim this org does not hold is not found, for every role (state §0.204 — "(1) and (2) now"): a
            // manager's save of an unknown id created a claim.
            if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };
            let changes = data;
            if (!isAdmin && !isManager) {
                // A rep edits their own claim, while it is pending; its approval and
                // payment are a manager's (state §0.169) — a rep could edit any rep's
                // claim, and set who approved it and when it was paid.
                if (!sameName(existing.repName, await getCallerName(auth.userId, orgId))) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only edit your own claims.' }) };
                }
                if ((existing.status || 'pending') !== 'pending') {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'A claim can only be edited while it is pending.' }) };
                }
                const { status: _status, approvedAt: _approvedAt, approvedBy: _approvedBy, paidAt: _paidAt, repName: _repName, ...ownFields } = data;
                changes = ownFields;
            }
            // A claim names its SPIFF and its rep (state §0.204 — "(1) and (2) now"): a save that turns either from set
            // to blank — '', null, spaces, 0 or false (blankText) — is refused before anything is asked; a cleared one was the write's NOT
            // NULL, a 500, a rep of spaces was stored, and a SPIFF of spaces read as one not in the org. A value stored
            // blank before is not this save's to refuse.
            const blank = ['spiffId', 'repName'].find((k) => k in changes && !blankText(existing[k]) && blankText(changes[k]));
            if (blank) return { statusCode: 400, headers, body: JSON.stringify({ error: blank === 'spiffId' ? 'A claim names its SPIFF — it cannot be cleared.' : 'A claim names its rep — it cannot be cleared.', field: blank }) };
            // Each link it names anew is this org's (CLAIM_LINKS, state §0.204); one the claim holds is never asked
            // again — a SPIFF removed since, a deal deleted since.
            const linked = await checkLinks(CLAIM_LINKS, changes, existing, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            const clean = sanitize({ ...(existing || {}), ...changes });
            const { id, ...updateData } = clean;
            // Update-only (state §0.204): a claim deleted while this save was out is not found — the upsert put it back.
            const [updated] = await db.update(spiffClaims).set({ ...updateData, updatedAt: new Date() })
                .where(and(eq(spiffClaims.orgId, orgId), eq(spiffClaims.id, id)))
                .returning();
            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };
            await auditAs(orgId, auth.userId, { action: CLAIM_STATUS_ACTIONS[data.status] || 'spiff_claim.updated', entityType: 'spiff_claim', entityId: updated.id, entityName: `${updated.repName} · ${updated.spiffName || updated.spiffId}`, detail: `${updated.status || 'pending'}${updated.amount != null ? ` · $${Number(updated.amount).toLocaleString()}` : ''}` });
            return { statusCode: 200, headers, body: JSON.stringify({ spiffClaim: updated }) };
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
