import { db } from '../../db/index.js';
import { tasks } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };

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
        accountId:     d.accountId     || null,
        relatedTo:     d.relatedTo     || null,
    });

    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(tasks).orderBy(asc(tasks.dueDate));
            return { statusCode: 200, headers, body: JSON.stringify({ tasks: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const [inserted] = await db.insert(tasks).values(sanitize(data)).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ task: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(tasks).values(clean)
                .onConflictDoUpdate({ target: tasks.id, set: { ...updateData, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ task: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                await db.delete(tasks);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            await db.delete(tasks).where(eq(tasks.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Tasks error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
