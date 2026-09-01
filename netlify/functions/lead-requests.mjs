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
// Approve is IDEMPOTENT against its own partial failure: the Neon HTTP driver
// gives no transaction across the two writes (assign lead, resolve request),
// so the lead is assigned FIRST and a retry that finds the lead already owned
// BY THE REQUESTER proceeds straight to resolving the request instead of
// refusing. Owned by anyone else → 409, the manager denies by hand.
import { db } from '../../db/index.js';
import { leadClaimRequests, leads, users } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth, canSeeAll, requireRole, requireWrite } from './auth.mjs';
import { serverErrorBody, writeAudit, getCallerId } from './_lib.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
            if (existing.some(r => r.requesterId === callerId)) {
                return { statusCode: 409, headers, body: JSON.stringify({ error: 'You have already requested this lead.' }) };
            }
            const [inserted] = await db.insert(leadClaimRequests).values({
                id:          data.id,
                orgId,
                leadId:      data.leadId,
                requesterId: callerId,                        // server-stamped, never taken from the payload
                status:      'pending',
                note:        data.note || null,
            }).returning();
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
                return { statusCode: 409, headers, body: JSON.stringify({ error: `This request was already ${request.status}.` }) };
            }
            const resolverId = await getCallerId(userId, orgId);
            const resolution = { resolvedBy: resolverId, resolvedAt: new Date(), updatedAt: new Date() };

            if (data.action === 'deny') {
                const [denied] = await db.update(leadClaimRequests)
                    .set({ status: 'denied', note: data.note ?? request.note, ...resolution })
                    .where(and(eq(leadClaimRequests.id, data.id), eq(leadClaimRequests.orgId, orgId)))
                    .returning();
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

            await db.update(leads)
                .set({ ownerId: requester.id, assignedTo: requester.name, updatedAt: new Date() })
                .where(and(eq(leads.id, lead.id), eq(leads.orgId, orgId)));
            const [approved] = await db.update(leadClaimRequests)
                .set({ status: 'approved', ...resolution })
                .where(and(eq(leadClaimRequests.id, data.id), eq(leadClaimRequests.orgId, orgId)))
                .returning();
            // Sibling PENDING requests for the now-assigned lead are denied in
            // the same stroke — approving one of three must not leave two
            // requests promising a lead that is gone.
            const siblings = await db.select().from(leadClaimRequests)
                .where(and(
                    eq(leadClaimRequests.orgId, orgId),
                    eq(leadClaimRequests.leadId, request.leadId),
                    eq(leadClaimRequests.status, 'pending'),
                ));
            for (const s of siblings) {
                await db.update(leadClaimRequests)
                    .set({ status: 'denied', note: 'Lead was assigned to another rep', ...resolution })
                    .where(and(eq(leadClaimRequests.id, s.id), eq(leadClaimRequests.orgId, orgId)));
            }
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
            if (!request) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
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
            await db.delete(leadClaimRequests)
                .where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('lead-requests error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'lead-requests') };
    }
};
