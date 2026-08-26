import { db } from '../../db/index.js';
import { activities, leads, settings as settingsTable } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, requireRole, canSeeAll, isReadOnly, requireWrite } from './auth.mjs';
import {
    serverErrorBody, writeAudit, assertOwnership,
    stampOwnerId, ownerIdForUpdate, ambiguousOwnerResponse,
} from './_lib.mjs';
import { ownerColumnOf, ownerKeyFor } from './_ownership.mjs';
import { deletionAudit } from './_audit.mjs';
import { scoreLead, DEFAULT_LEAD_SCORING } from './score-lead.mjs';

async function rescoreLead(orgId, leadId) {
    if (!leadId) return;
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
    if (!lead) return;
    let cfg = DEFAULT_LEAD_SCORING;
    try {
        const [srow] = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        cfg = srow?.extra?.leadScoring || DEFAULT_LEAD_SCORING;
    } catch (e) { /* defaults */ }
    if (cfg.enabled === false) return;
    const acts = await db.select().from(activities).where(and(eq(activities.orgId, orgId), eq(activities.leadId, leadId)));
    const events = acts.map(a => ({ type: a.type, at: a.date || a.createdAt }));
    const sc = scoreLead(lead, cfg, Date.now(), events);
    if (!sc) return;
    await db.update(leads).set({
        leadScoreFit: sc.leadScoreFit, leadScoreEngagement: sc.leadScoreEngagement,
        leadScoreBucket: sc.leadScoreBucket, scoreBreakdown: sc.scoreBreakdown,
        score: sc.score, scoreUpdatedAt: new Date(),
    }).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
}

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole, managedReps } = auth;

    // Server-side role enforcement: ReadOnly can never mutate, regardless of
    // what the client UI allows. Runs before any handler logic.
    // Shared write gate. Denies ReadOnly AND Technician: a technician's only
    // write capability is the field whitelist in dispatch-jobs.mjs, so they must
    // not be able to mutate CRM records. Previously this checked isReadOnly
    // alone, which would have granted a new role full write access by default.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    const sanitize = (d) => {
        // contactIds is the source of truth (multi-contact); contactId is kept as the
        // primary/first mirror for back-compat with any singular reader. A legacy
        // payload sending only contactId is migrated forward into the array here.
        const contactIds = Array.isArray(d.contactIds)
            ? [...new Set(d.contactIds.filter(Boolean))]
            : (d.contactId ? [d.contactId] : []);
        return {
            id:            d.id,
            type:          d.type          || null,
            date:          d.date          || null,
            subject:       d.subject       || null,
            notes:         d.notes         || null,
            outcome:       d.outcome       || null,
            duration:      d.duration      ?? null,
            opportunityId: d.opportunityId || null,
            contactId:     contactIds[0]   || null,
            contactIds,
            accountId:     d.accountId     || null,
            leadId:        d.leadId        || null,
            author:        d.author        || null,
        };
    };

    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(asc(activities.date));
            return { statusCode: 200, headers, body: JSON.stringify({ activities: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const newRow = await stampOwnerId(sanitize(data), 'activity', { clerkUserId: userId, orgId });
            const [inserted] = await db.insert(activities).values({ ...newRow, orgId }).returning();
            if (inserted.leadId) { try { await rescoreLead(orgId, inserted.leadId); } catch (e) { console.warn('lead rescore (post) failed:', e.message); } }
            return { statusCode: 201, headers, body: JSON.stringify({ activity: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            // PUT is strictly an update: unknown ids 404 instead of silently creating.
            const [target] = await db.select({ id: activities.id, [ownerKeyFor('activity')]: ownerColumnOf(activities, 'activity') })
                .from(activities).where(and(eq(activities.id, data.id), eq(activities.orgId, orgId)));
            if (!target) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Activity not found' }) };
            }
            // Object-level authorization. Previously selected activities.repName,
            // which is not a column on this table -- the column is `author`. As
            // with contacts.createdBy, db.select({ owner: undefined }) THREW, so
            // a rep editing any activity got a 500 rather than an answer.
            const forbiddenPut = await assertOwnership({
                table: activities, entity: 'activity', id: data.id, orgId, userId, userRole, headers, row: target,
            });
            if (forbiddenPut) return forbiddenPut;
            // Changing the author re-keys ownership; a PUT that never mentioned
            // it leaves it alone (18b13).
            const ownPut = await ownerIdForUpdate({ payload: data, entity: 'activity', orgId });
            if (ownPut.change) { clean.ownerId = ownPut.ownerId; updateData.ownerId = ownPut.ownerId; }
            const [upserted] = await db.insert(activities).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: activities.id, setWhere: eq(activities.orgId, orgId), set: { ...updateData, updatedAt: new Date() } })
                .returning();
            if (!upserted) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Activity not found in your organization' }) };
            }
            if (upserted.leadId) { try { await rescoreLead(orgId, upserted.leadId); } catch (e) { console.warn('lead rescore (put) failed:', e.message); } }
            return { statusCode: 200, headers, body: JSON.stringify({ activity: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                // Org-wide wipe — Admin only.
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                const deleted = await db.delete(activities).where(eq(activities.orgId, orgId)).returning({ id: activities.id });
                await writeAudit(orgId, {
                    action: 'activity.cleared', entityType: 'activity', entityId: 'ALL',
                    entityName: 'All activities', detail: `Cleared ${deleted.length} activities via clear=true`, userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            const [delActy] = await db.select({ leadId: activities.leadId, [ownerKeyFor('activity')]: ownerColumnOf(activities, 'activity') })
                .from(activities).where(and(eq(activities.id, id), eq(activities.orgId, orgId)));
            // Object-level authorization: reps may only delete their own or
            // unassigned activities. Same repName fault as the PUT above.
            const forbiddenDel = await assertOwnership({
                table: activities, entity: 'activity', id, orgId, userId, userRole, headers, row: delActy,
            });
            if (forbiddenDel) return forbiddenDel;
            // .returning() rather than a bare delete: a hard delete destroys the
            // audit trail's subject, so the row has to be captured in the same
            // statement that removes it. An id alone cannot be resolved back to a
            // name once the record is gone.
            const [deletedRow] = await db.delete(activities).where(and(eq(activities.id, id), eq(activities.orgId, orgId))).returning();
            // An unknown id used to return success:true. It deleted nothing.
            if (!deletedRow) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await writeAudit(orgId, deletionAudit('activity', deletedRow, { userId }));
            if (delActy?.leadId) { try { await rescoreLead(orgId, delActy.leadId); } catch (e) { console.warn('lead rescore (del) failed:', e.message); } }
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        const amb = ambiguousOwnerResponse(err, headers);
        if (amb) return amb;
        console.error('Activities error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'activities') };
    }
};
