import { db } from '../../db/index.js';
import { contacts } from '../../db/schema.js';
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
            'id','prefix','firstName','lastName','middleName','suffix','nickName',
            'title','company','department','workLocation','email','personalEmail',
            'phone','mobile','address','city','state','zip','country',
            'managers','directReports','assistantName','homeAddress','notes',
            'assignedRep','assignedTerritory'
        ];
        return Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    };
    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(contacts).orderBy(asc(contacts.lastName));
            return { statusCode: 200, headers, body: JSON.stringify({ contacts: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [inserted] = await db.insert(contacts).values(sanitize(data)).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ contact: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const { createdAt, ...upsertData } = sanitize(data);
            const { id, ...updateData } = upsertData;
            const [upserted] = await db.insert(contacts)
                .values(upsertData)
                .onConflictDoUpdate({
                    target: contacts.id,
                    set: { ...updateData, updatedAt: new Date() }
                })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ contact: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            const clear = event.queryStringParameters?.clear;
            if (clear === 'true') {
                await db.delete(contacts);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            }
            await db.delete(contacts).where(eq(contacts.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Contacts function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
