import { db } from '../../db/index.js';
import { tasks } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, requireRole, canSeeAll, isReadOnly, requireWrite } from './auth.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';
import { deletionAudit } from './_audit.mjs';

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

    const sanitize = (d) => ({
        id:            d.id,
        title:         d.title         || null,
        description:   d.description   || null,
        type:          d.type          || null,
        dueDate:       d.dueDate       || null,
        dueTime:       d.dueTime       || null,
        reminderDate:  d.reminderDate  || null,
        reminderTime:  d.reminderTime  || null,
        assignedTo:    d.assignedTo    || null,
        priority:      d.priority      || null,
        status:        d.status        || null,
        completed:     d.completed     ?? false,
        completedDate: d.completedDate || null,
        opportunityId: d.opportunityId || null,
        contactId:     d.contactId     || null,
        contacts:      d.contacts      ?? null,
        accountId:     d.accountId     || null,
        relatedTo:     d.relatedTo     || null,
    });

    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(tasks).where(eq(tasks.orgId, orgId)).orderBy(asc(tasks.dueDate));
            return { statusCode: 200, headers, body: JSON.stringify({ tasks: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const [inserted] = await db.insert(tasks).values({ ...sanitize(data), orgId }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ task: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };

            // Fetch existing so we can detect completion
            const [existing] = await db.select().from(tasks).where(and(eq(tasks.id, data.id), eq(tasks.orgId, orgId)));
            // PUT is strictly an update: unknown ids 404 instead of silently creating.
            if (!existing) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Task not found' }) };
            }
            // Object-level authorization: reps may only edit their own or unassigned tasks
            if (!canSeeAll(userRole)) {
                const callerName = await getCallerName(userId);
                if (existing.assignedTo && existing.assignedTo !== callerName) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: you can only modify your own or unassigned records' }) };
                }
            }
            const wasCompleted = existing?.completed === true;

            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(tasks).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: tasks.id, setWhere: eq(tasks.orgId, orgId), set: { ...updateData, updatedAt: new Date() } })
                .returning();

            // Webhook: task.completed — only fires the first time completed flips to true
            if (!wasCompleted && upserted.completed) {
                await dispatchWebhook(orgId, 'task.completed', {
                    id:             upserted.id,
                    title:          upserted.title,
                    type:           upserted.type,
                    assigned_to:    upserted.assignedTo,
                    opportunity_id: upserted.opportunityId,
                    completed_date: upserted.completedDate,
                });
            }

            return { statusCode: 200, headers, body: JSON.stringify({ task: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                // Org-wide wipe — Admin only.
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                const deleted = await db.delete(tasks).where(eq(tasks.orgId, orgId)).returning({ id: tasks.id });
                await writeAudit(orgId, {
                    action: 'task.cleared', entityType: 'task', entityId: 'ALL',
                    entityName: 'All tasks', detail: `Cleared ${deleted.length} tasks via clear=true`, userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            // Object-level authorization: reps may only delete their own or unassigned tasks
            if (!canSeeAll(userRole)) {
                const [target] = await db.select({ owner: tasks.assignedTo }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.orgId, orgId)));
                const callerName = await getCallerName(userId);
                if (target?.owner && target.owner !== callerName) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: you can only modify your own or unassigned records' }) };
                }
            }
            // .returning() rather than a bare delete: a hard delete destroys the
            // audit trail's subject, so the row has to be captured in the same
            // statement that removes it. An id alone cannot be resolved back to a
            // name once the record is gone.
            const [deletedRow] = await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.orgId, orgId))).returning();
            // An unknown id used to return success:true. It deleted nothing.
            if (!deletedRow) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await writeAudit(orgId, deletionAudit('task', deletedRow, { userId }));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Tasks error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'tasks') };
    }
};
