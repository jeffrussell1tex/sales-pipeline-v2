// lead-requests.mjs — the §0.58 claim-request flow.
//
// Assignment is Manager/Admin-only (leads.mjs PUT enforces it), so a rep who
// wants an unassigned lead REQUESTS it here and a Manager/Admin approves —
// which assigns the lead to the requester — or denies. This endpoint is the
// ONLY path by which a rep's wish becomes an assignment, and the assignment
// itself is still performed by a canSeeAll caller (the approver), so the
// leads.mjs rule and this flow agree rather than tunnel around each other.
//
// Identity rules (the ownership lessons, applied from the first line):
//   - requesterId is stamped from getCallerId(), NEVER read from the payload —
//     a client-supplied requester is how one rep files requests as another.
//   - An unresolvable caller (null) is refused on POST/DELETE: a caller with
//     no roster row can own nothing, so it can request nothing (fail closed,
//     the mayMutate direction).
//   - requesterId === callerId comparisons are usr_-space on both sides; the
//     ownership-registry guard allowlists `.requesterId` for exactly this file.
//
// Approve is IDEMPOTENT: a retry that finds the lead already owned BY THE
// REQUESTER proceeds straight to resolving the request instead of refusing.
// Owned by anyone else → 409, the manager denies by hand.
//
// Each write lands only on what its checks read (state §0.279; OPEN_ITEMS §4.8, §0.275's found (5)): a cancel and a
// deny only while the request is still pending, in their own WHERE; an approve is ONE batch — the request still pending,
// the lead's owner as read, the requester still in the roster, claimed in that order (locked, else 1 / 0 and nothing
// lands), then the lead assigned, the request approved and its pending siblings denied. A miss is read again and said
// (missedRequest). Before, each was decided on a read and written by its id alone: a cancel deleted a request a manager
// had just approved, its history with it; a deny wrote "denied" over another manager's approve, the lead left assigned;
// an approve took a lead assigned to another rep since its read, or assigned one whose request was cancelled since.
import { db } from '../../db/index.js';
import { leadClaimRequests, leads, users } from '../../db/schema.js';
import { eq, and, ne, desc, sql } from 'drizzle-orm';
import { verifyAuth, canSeeAll, requireRole, requireWrite } from './auth.mjs';
import { serverErrorBody, writeAudit, getCallerId, ownerClaim, claimRefused } from './_lib.mjs';
import { ownIdTaken } from './_lib.mjs';   // a create's taken id, this org's (state §0.261)

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PENDING = eq(leadClaimRequests.status, 'pending');

// A write that missed what its checks read (state §0.279): what stands now decides, in the words the checks before it
// use. The request gone: not found (a cancel's `gone` — an earlier press landed). Resolved since: a cancel is refused
// (resolved requests are history); an approve or deny that finds its own answer stored is done (`already`, as a press
// sent again is), else refused naming what it is now. Still pending (an approve's lead or requester moved): the
// approve's own refusals, read again; else the request changed since it was read.
async function missedRequest(orgId, id, action) {
    const [now] = await db.select().from(leadClaimRequests).where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, orgId)));
    if (!now) return action === 'cancel'
        ? { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', code: 'gone' }) }
        : { statusCode: 404, headers, body: JSON.stringify({ error: 'Request not found' }) };
    if (now.status !== 'pending') {
        // With the request as stored (the caller's own — the check above read it as theirs), so the screen shows it and its
        // lead as they stand (the review).
        if (action === 'cancel') return { statusCode: 409, headers, body: JSON.stringify({ error: `This request was ${now.status} since — resolved requests are history. Nothing was cancelled.`, leadRequest: now }) };
        const again = (action === 'approve' && now.status === 'approved') || (action === 'deny' && now.status === 'denied');
        return { statusCode: 409, headers, body: JSON.stringify({ error: `This request was already ${now.status}.`, ...(again ? { code: 'already' } : {}) }) };
    }
    if (action === 'approve') {
        const [lead] = await db.select().from(leads).where(and(eq(leads.id, now.leadId), eq(leads.orgId, orgId)));
        if (!lead) return { statusCode: 409, headers, body: JSON.stringify({ error: 'The requested lead no longer exists — deny the request instead.' }) };
        if (lead.ownerId && lead.ownerId !== now.requesterId) return { statusCode: 409, headers, body: JSON.stringify({ error: 'This lead was already assigned to someone else — deny the request instead.' }) };
        const [requester] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, now.requesterId), eq(users.orgId, orgId)));
        if (!requester) return { statusCode: 409, headers, body: JSON.stringify({ error: 'The requester is no longer in the roster — deny the request instead.' }) };
    }
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'This request changed since it was read. Nothing was saved; reload to see it.' }) };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        // ── GET: reps see their OWN requests; Admin/Manager see the org's ────
        if (event.httpMethod === 'GET') {
            let rows = await db.select().from(leadClaimRequests)
                .where(eq(leadClaimRequests.orgId, orgId))
                .orderBy(desc(leadClaimRequests.createdAt));
            if (!canSeeAll(userRole)) {
                const callerId = await getCallerId(userId, orgId);
                // requesterId is NOT NULL, so a null caller matches nothing —
                // an unresolvable caller sees no requests, fail closed.
                rows = rows.filter(r => r.requesterId === callerId);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ leadRequests: rows }) };
        }

        // ── POST: a rep requests an unassigned lead for THEMSELVES ───────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id || !data.leadId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and leadId are required' }) };
            }
            const callerId = await getCallerId(userId, orgId);
            if (!callerId) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Your account is not in this organization\'s roster.' }) };
            }
            const [lead] = await db.select().from(leads)
                .where(and(eq(leads.id, data.leadId), eq(leads.orgId, orgId)));
            if (!lead) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead not found' }) };
            if (lead.ownerId) {
                return { statusCode: 409, headers, body: JSON.stringify({ error: 'This lead is already assigned.' }) };
            }
            const existing = await db.select().from(leadClaimRequests)
                .where(and(
                    eq(leadClaimRequests.orgId, orgId),
                    eq(leadClaimRequests.leadId, data.leadId),
                    eq(leadClaimRequests.status, 'pending'),
                ));
            // This request itself, sent again (state §0.261, Part 6): an earlier press landed — code 'already'.
            if (existing.some(r => r.requesterId === callerId)) {
                return { statusCode: 409, headers, body: JSON.stringify({ error: 'You have already requested this lead.', ...(existing.some(r => r.id === data.id) ? { code: 'already' } : {}) }) };
            }
            const [inserted] = await db.insert(leadClaimRequests).values({
                id:          data.id,
                orgId,
                leadId:      data.leadId,
                requesterId: callerId,                        // server-stamped, never taken from the payload
                status:      'pending',
                note:        data.note || null,
            // A taken id writes nothing and is answered 409 (state §0.261, Part 6): it was a primary-key 500.
            }).onConflictDoNothing({ target: leadClaimRequests.id }).returning();
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That request id is already in use.', ...(await ownIdTaken(leadClaimRequests, data.id, orgId) ? { code: 'idInUse' } : {}) }) };
            await writeAudit(orgId, {
                action: 'lead.claim_requested', entityType: 'lead', entityId: lead.id,
                entityName: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company || lead.id,
                detail: 'Assignment requested', userId,
            });
            return { statusCode: 201, headers, body: JSON.stringify({ leadRequest: inserted }) };
        }

        // ── PUT: approve / deny — Manager/Admin only ─────────────────────────
        if (event.httpMethod === 'PUT') {
            const forbiddenRole = requireRole(auth, ['Admin', 'Manager'], headers);
            if (forbiddenRole) return forbiddenRole;

            const data = JSON.parse(event.body);
            if (!data.id || !['approve', 'deny'].includes(data.action)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and action ("approve" | "deny") are required' }) };
            }
            const [request] = await db.select().from(leadClaimRequests)
                .where(and(eq(leadClaimRequests.id, data.id), eq(leadClaimRequests.orgId, orgId)));
            if (!request) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Request not found' }) };
            if (request.status !== 'pending') {
                // The same answer sent again — an earlier press landed (state §0.261, Part 6): code 'already'.
                const again = (data.action === 'approve' && request.status === 'approved') || (data.action === 'deny' && request.status === 'denied');
                return { statusCode: 409, headers, body: JSON.stringify({ error: `This request was already ${request.status}.`, ...(again ? { code: 'already' } : {}) }) };
            }
            const resolverId = await getCallerId(userId, orgId);
            const resolution = { resolvedBy: resolverId, resolvedAt: new Date(), updatedAt: new Date() };

            if (data.action === 'deny') {
                // Only while still pending (state §0.279): an approve landing since its read is never written over.
                const [denied] = await db.update(leadClaimRequests)
                    .set({ status: 'denied', note: data.note ?? request.note, ...resolution })
                    .where(and(eq(leadClaimRequests.id, data.id), eq(leadClaimRequests.orgId, orgId), PENDING))
                    .returning();
                if (!denied) return await missedRequest(orgId, data.id, 'deny');
                await writeAudit(orgId, {
                    action: 'lead.claim_denied', entityType: 'lead', entityId: request.leadId,
                    entityName: request.leadId, detail: 'Assignment request denied', userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ leadRequest: denied }) };
            }

            // approve
            const [lead] = await db.select().from(leads)
                .where(and(eq(leads.id, request.leadId), eq(leads.orgId, orgId)));
            if (!lead) return { statusCode: 409, headers, body: JSON.stringify({ error: 'The requested lead no longer exists — deny the request instead.' }) };
            // Idempotency window: owned by the requester means a prior approve
            // assigned the lead and died before resolving the request — finish
            // the resolve. Owned by anyone ELSE is a real conflict.
            if (lead.ownerId && lead.ownerId !== request.requesterId) {
                return { statusCode: 409, headers, body: JSON.stringify({ error: 'This lead was already assigned to someone else — deny the request instead.' }) };
            }
            const [requester] = await db.select().from(users)
                .where(and(eq(users.id, request.requesterId), eq(users.orgId, orgId)));
            if (!requester) return { statusCode: 409, headers, body: JSON.stringify({ error: 'The requester is no longer in the roster — deny the request instead.' }) };

            // One batch (state §0.279): what the checks above read, claimed in this order — the lead's owner as read
            // (compared as read: the check's rule is exact, never SQL's trim), the request still pending, the requester
            // still in the roster — then the lead assigned, the request approved and its pending siblings denied (approving
            // one of three must not leave two requests promising a lead that is gone). A claim that fails aborts the batch.
            // The lead is locked FIRST (the review): two approves of sibling requests at once each held its own request and
            // waited on the lead, then on the other's request — a deadlock, a 500; now the second waits on the lead before
            // it holds any request, then finds the lead's owner moved and is refused in words.
            const claims = [
                ...ownerClaim(leads, lead.id, orgId, sql`${leads.ownerId} is not distinct from ${lead.ownerId}`),
                ...ownerClaim(leadClaimRequests, request.id, orgId, PENDING),
                ...ownerClaim(users, requester.id, orgId, sql`true`),
            ];
            let done;
            try {
                done = await db.batch([
                    ...claims,
                    db.update(leads)
                        .set({ ownerId: requester.id, assignedTo: requester.name, updatedAt: new Date() })
                        .where(and(eq(leads.id, lead.id), eq(leads.orgId, orgId))),
                    db.update(leadClaimRequests)
                        .set({ status: 'approved', ...resolution })
                        .where(and(eq(leadClaimRequests.id, data.id), eq(leadClaimRequests.orgId, orgId)))
                        .returning(),
                    db.update(leadClaimRequests)
                        .set({ status: 'denied', note: 'Lead was assigned to another rep', ...resolution })
                        .where(and(eq(leadClaimRequests.orgId, orgId), eq(leadClaimRequests.leadId, request.leadId), PENDING, ne(leadClaimRequests.id, request.id))),
                ]);
            } catch (e) {
                if (!claimRefused(e)) throw e;
                return await missedRequest(orgId, data.id, 'approve');
            }
            const [approved] = done[claims.length + 1];
            await writeAudit(orgId, {
                action: 'lead.claim_approved', entityType: 'lead', entityId: lead.id,
                entityName: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company || lead.id,
                detail: `Assigned to ${requester.name} by request`, userId,
            });
            return { statusCode: 200, headers, body: JSON.stringify({ leadRequest: approved }) };
        }

        // ── DELETE: a rep cancels their own PENDING request ──────────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const [request] = await db.select().from(leadClaimRequests)
                .where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, orgId)));
            // Already gone (state §0.271): an earlier press landed though its answer was lost — said with code 'gone', which the
            // screen reads as done (landedBefore), never "not deleted" over a row that is gone.
            if (!request) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', code: 'gone' }) };
            if (!canSeeAll(userRole)) {
                const callerId = await getCallerId(userId, orgId);
                // NOT NULL requesterId vs a possibly-null caller: never equal,
                // so an unresolvable caller is refused — fail closed.
                if (!(request.requesterId === callerId)) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only cancel your own request.' }) };
                }
            }
            if (request.status !== 'pending') {
                return { statusCode: 409, headers, body: JSON.stringify({ error: 'Only pending requests can be cancelled — resolved requests are history.' }) };
            }
            // Only while still pending (state §0.279): a request a manager resolved since the check read it is history,
            // never deleted. Who filed it is not asked again — requesterId is stamped once, at the create, and no
            // write changes it.
            const [cancelled] = await db.delete(leadClaimRequests)
                .where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, orgId), PENDING))
                .returning({ id: leadClaimRequests.id });
            if (!cancelled) return await missedRequest(orgId, id, 'cancel');
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('lead-requests error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'lead-requests') };
    }
};
