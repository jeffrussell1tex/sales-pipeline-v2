import { db } from '../../db/index.js';
import { auditLog } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        // GET — return last 500 entries newest first
        if (event.httpMethod === 'GET') {
            const entries = await db
                .select()
                .from(auditLog)
                .orderBy(desc(auditLog.timestamp))
                .limit(500);

            return { statusCode: 200, headers, body: JSON.stringify({ entries }) };
        }

        // POST — write a single audit entry
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);

            if (!data.id || !data.action || !data.entityType || !data.entityId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: id, action, entityType, entityId' }) };
            }

            const [inserted] = await db.insert(auditLog).values({
                id:         data.id,
                action:     data.action,
                entityType: data.entityType,
                entityId:   data.entityId,
                entityName: data.entityName || null,
                detail:     data.detail     || null,
                userId:     data.userId     || null,
                userName:   data.userName   || null,
                timestamp:  data.timestamp  ? new Date(data.timestamp) : new Date(),
            }).returning();

            return { statusCode: 201, headers, body: JSON.stringify({ entry: inserted }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Audit log function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
