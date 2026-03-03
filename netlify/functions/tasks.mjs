import { db } from '../../db/index.js';
import { tasks } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(tasks).orderBy(asc(tasks.dueDate));
            return { statusCode: 200, headers, body: JSON.stringify({ tasks: results }) };
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [inserted] = await db.insert(tasks).values(data).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ task: inserted }) };
        }

        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const { id, createdAt, ...updateData } = data;
            const [updated] = await db.update(tasks)
                .set({ ...updateData, updatedAt: new Date() })
                .where(eq(tasks.id, id))
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ task: updated }) };
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            await db.delete(tasks).where(eq(tasks.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};