import { db } from '../../db/index.js';
import { activities } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    const sanitize = (data) => {
        const allowed = [
            'id','type','date','subject','notes','outcome','duration',
            'opportunityId','contactId','accountId','author'
        ];
        return Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    };
    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(activities).orderBy(asc(activities.date));
            return { statusCode: 200, headers, body: JSON.stringify({ activities: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [inserted] = await db.insert(activities).values(sanitize(data)).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ activity: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const { createdAt, ...upsertData } = sanitize(data);
            const { id, ...updateData } = upsertData;
            const [upserted] = await db.insert(activities)
                .values(upsertData)
                .onConflictDoUpdate({
                    target: activities.id,
                    set: { ...updateData, updatedAt: new Date() }
                })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ activity: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            await db.delete(activities).where(eq(activities.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Activities function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
