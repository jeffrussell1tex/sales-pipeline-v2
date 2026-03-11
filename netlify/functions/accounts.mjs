import { db } from '../../db/index.js';
import { accounts } from '../../db/schema.js';
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
            'id','name','verticalMarket','industry','address','city','state','zip',
            'country','website','phone','accountOwner','assignedRep','assignedTerritory',
            'parentAccountId','notes'
        ];
        return Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    };
    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(accounts).orderBy(asc(accounts.name));
            return { statusCode: 200, headers, body: JSON.stringify({ accounts: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            if (data.parentId && !data.parentAccountId) data.parentAccountId = data.parentId;
            const [inserted] = await db.insert(accounts).values(sanitize(data)).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ account: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            if (data.parentId && !data.parentAccountId) data.parentAccountId = data.parentId;
            const { createdAt, ...upsertData } = sanitize(data);
            const { id, ...updateData } = upsertData;
            const [upserted] = await db.insert(accounts)
                .values(upsertData)
                .onConflictDoUpdate({
                    target: accounts.id,
                    set: { ...updateData, updatedAt: new Date() }
                })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ account: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            await db.delete(accounts).where(eq(accounts.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Accounts function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
