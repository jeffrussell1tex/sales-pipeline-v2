import { db } from '../../db/index.js';
import { accounts } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole, managedReps } = auth;

    const sanitize = (d) => ({
        id:                d.id,
        name:              d.name              || 'Unnamed Account',
        verticalMarket:    d.verticalMarket    || null,
        industry:          d.industry          || null,
        address:           d.address           || null,
        city:              d.city              || null,
        state:             d.state             || null,
        zip:               d.zip               || null,
        country:           d.country           || null,
        website:           d.website           || null,
        phone:             d.phone             || null,
        accountOwner:      d.accountOwner      || null,
        assignedRep:       d.assignedRep       || null,
        assignedTerritory: d.assignedTerritory || null,
        parentAccountId:   d.parentAccountId   || d.parentId || null,
        notes:             d.notes             || null,
    });

    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.name));
            return { statusCode: 200, headers, body: JSON.stringify({ accounts: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const [inserted] = await db.insert(accounts).values({ ...sanitize(data), orgId }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ account: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(accounts).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: accounts.id, set: { ...updateData, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ account: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                await db.delete(accounts);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Accounts error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
