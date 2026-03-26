import { db } from '../../db/index.js';
import { leads, users } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth, canSeeAll } from './auth.mjs';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    const sanitize = (d) => ({
        id:           d.id,
        firstName:    d.firstName    || null,
        lastName:     d.lastName     || null,
        company:      d.company      || null,
        title:        d.title        || null,
        email:        d.email        || null,
        phone:        d.phone        || null,
        source:       d.source       || null,
        status:       d.status       || 'New',
        score:        d.score        ?? 50,
        estimatedARR: d.estimatedARR ?? null,
        assignedTo:   d.assignedTo   || null,
        notes:        d.notes        || null,
        convertedAt:  d.convertedAt  || null,
    });

    try {
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(leads).where(eq(leads.orgId, orgId)).orderBy(asc(leads.createdAt));
            if (!canSeeAll(userRole)) {
                // assignedTo is stored as a display name, not a Clerk userId — look up the current user's name
                let repDisplayName = null;
                try {
                    const [repRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
                    repDisplayName = repRow?.name || null;
                } catch (e) {
                    console.warn('Could not look up rep display name for leads filtering:', e.message);
                }
                results = results.filter(l => !l.assignedTo || l.assignedTo === repDisplayName);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ leads: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const [inserted] = await db.insert(leads).values({ ...sanitize(data), orgId }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ lead: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(leads).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: leads.id, set: { ...updateData, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ lead: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                await db.delete(leads);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            await db.delete(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Leads error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
