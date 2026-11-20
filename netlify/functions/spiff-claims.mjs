import { db } from '../../db/index.js';
import { spiffClaims } from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';
import { ownIdTaken } from './_lib.mjs';   // a create's taken id, this org's (state §0.261)
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
            // Held in THIS org: an earlier press of this create landed (state §0.261, the unknown-save rule's Part 6) — said
            // with code 'idInUse', which the screen reads as landed. Another org's id: the words alone, below.
            if (!inserted && await ownIdTaken(spiffClaims, claim.id, orgId)) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That claim id is already in use.', code: 'idInUse' }) };
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
            // The status a screen saw (state §0.276), held in the write below: a status is text.
            if (Object.hasOwn(data, 'fromStatus') && typeof data.fromStatus !== 'string') return { statusCode: 400, headers, body: JSON.stringify({ error: 'fromStatus is the status the claim was seen in.', field: 'fromStatus' }) };
            let changes = data;
            const isRep = !isAdmin && !isManager;
            const me = isRep ? await getCallerName(auth.userId, orgId) : null;   // the rep's roster name, asked once
            if (isRep) {
                // A rep edits their own claim, while it is pending; its approval and
                // payment are a manager's (state §0.169) — a rep could edit any rep's
                // claim, and set who approved it and when it was paid.
                if (!sameName(existing.repName, me)) {
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
            // A save writes only what it names (state §0.276, guide §18b125): the row built over the claim as read wrote
            // every column of that read back — a Manager's approval, or another save, landing between the read and the
            // write was put back (OPEN_ITEMS §4.8, §0.275's found (1)). Each key the save names, as sanitize stores it.
            const named = Object.fromEntries(Object.entries(updateData).filter(([k]) => Object.hasOwn(changes, k)));
            // A rep's write lands only while the claim is as the check read it (state §0.276): its rep and its status exactly
            // as read — the check passed on those values (sameName, the pending rule), so a claim approved, or moved to
            // another rep, since is touched by nothing. Compared as read, never normalised again in SQL (the review: SQL's
            // trim and case are not sameName's — a rep's own claim was refused). None for an Admin or Manager.
            const stillTheirs = isRep
                ? and(eq(spiffClaims.repName, existing.repName), eq(spiffClaims.status, existing.status))
                : undefined;
            // A status move decided on a screen's copy (state §0.276, the review: the Sales Manager's Approve and Reject show
            // only on a claim its list holds pending): the status it saw, sent as fromStatus, held in the write — a claim
            // approved, rejected or paid since is not moved again, nor a second press after the first landed.
            const seen = Object.hasOwn(data, 'fromStatus') ? sql`coalesce(nullif(${spiffClaims.status}, ''), 'pending') = ${data.fromStatus || 'pending'}` : undefined;
            // Update-only (state §0.204): a claim deleted while this save was out is not found — the upsert put it back.
            const [updated] = await db.update(spiffClaims).set({ ...named, updatedAt: new Date() })
                .where(and(eq(spiffClaims.orgId, orgId), eq(spiffClaims.id, id), stillTheirs, seen))
                .returning();
            if (!updated) {
                // Touched nothing: the claim as it stands now decides (state §0.276), nothing written — gone: the 404; for
                // a rep, approved or another rep's since the check: the check's own words; else it changed since it was
                // read (its status since the screen's copy, or its rep's spelling since the check): said, with what it is.
                const [now] = await db.select().from(spiffClaims).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, orgId)));
                if (!now) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };
                if (isRep && (now.status || 'pending') !== 'pending') return { statusCode: 403, headers, body: JSON.stringify({ error: 'A claim can only be edited while it is pending.' }) };
                if (isRep && !sameName(now.repName, me)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only edit your own claims.' }) };
                return { statusCode: 409, headers, body: JSON.stringify({ error: `This claim is ${now.status || 'pending'} now — it changed since it was loaded. Nothing was saved; reload to see it.` }) };
            }
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
