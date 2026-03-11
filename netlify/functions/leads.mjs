import { db } from '../../db/index.js';
import { leads } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth, canSeeAll } from './auth.mjs';

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
    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }
    const { userId, userRole } = auth;
    try {
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(leads).orderBy(asc(leads.createdAt));
            if (!canSeeAll(userRole)) {
                results = results.filter(l => !l.assignedTo || l.assignedTo === userId);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ leads: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            // Bulk insert: array of leads
            if (Array.isArray(data)) {
                if (data.length === 0) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty array' }) };
                }
                const rows = data.map(({ createdAt, updatedAt, ...d }) => ({
                    ...d,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }));
                const inserted = await db.insert(leads).values(rows).returning();
                return { statusCode: 201, headers, body: JSON.stringify({ leads: inserted }) };
            }
            // Single insert
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const { createdAt, updatedAt, ...insertData } = data;
            const [inserted] = await db.insert(leads).values({
                ...insertData,
                createdAt: new Date(),
                updatedAt: new Date(),
            }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ lead: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const { id, createdAt, updatedAt, ...updateData } = data;
            const [upserted] = await db.insert(leads)
                .values({ id, ...updateData, createdAt: new Date(), updatedAt: new Date() })
                .onConflictDoUpdate({
                    target: leads.id,
                    set: { ...updateData, updatedAt: new Date() }
                })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ lead: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            const clear = event.queryStringParameters?.clear;
            if (clear === 'true') {
                await db.delete(leads);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            }
            await db.delete(leads).where(eq(leads.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
            await db.delete(leads).where(eq(leads.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Leads function error:', err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
