import { db } from '../../db/index.js';
import { tasks } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, requireRole, isReadOnly, requireWrite } from './auth.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import {
    serverErrorBody, writeAudit, assertOwnership,
    stampOwnerId, ownerIdForUpdate, ambiguousOwnerResponse,
} from './_lib.mjs';
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
            // A task created with no assignee belongs to its creator; one
            // assigned from the roster picker belongs to that person.
            const newRow = await stampOwnerId(sanitize(data), 'task', { clerkUserId: userId, orgId });
            const [inserted] = await db.insert(tasks).values({ ...newRow, orgId }).returning();
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
            // Object-level authorization: reps may only edit their own or
            // unassigned tasks. `existing` is the full row, already loaded above,
            // so no second query is issued.
            //
            // OPEN QUESTION, unchanged by this refactor: a rep completing a
            // teammate's task 403s here, the client rolls back, and the checkbox
            // flips itself off. Correct per the role matrix, arguably wrong for
            // the workflow. Recorded in CURRENT_STATE section 9; not decided.
            const forbiddenPut = await assertOwnership({
                table: tasks, entity: 'task', id: data.id, orgId, userId, userRole, headers, row: existing,
            });
            if (forbiddenPut) return forbiddenPut;
            const wasCompleted = existing?.completed === true;

            const clean = sanitize(data);
            // Reassigning a task re-keys its ownership; a PUT that never
            // mentioned the assignee leaves it alone (18b13).
            const ownPut = await ownerIdForUpdate({ payload: data, entity: 'task', orgId });
            if (ownPut.change) clean.ownerId = ownPut.ownerId;
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
            // Object-level authorization: reps may only delete their own or
            // unassigned tasks.
            //
            // Unlike accounts / opportunities / leads, there is NO Admin role gate
            // after this: a rep may delete a task they own. That asymmetry is
            // deliberate -- deals are closed Won/Lost rather than deleted, tasks
            // are ordinary work items -- and is preserved unchanged here.
            const forbiddenOwn = await assertOwnership({
                table: tasks, entity: 'task', id, orgId, userId, userRole, headers,
            });
            if (forbiddenOwn) return forbiddenOwn;
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
        const amb = ambiguousOwnerResponse(err, headers);
        if (amb) return amb;
        console.error('Tasks error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'tasks') };
    }
};
