import { db } from '../../db/index.js';
import { contacts } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole, managedReps } = auth;

    const sanitize = (d) => ({
        id:                d.id,
        prefix:            d.prefix            || null,
        firstName:         d.firstName         || null,
        middleName:        d.middleName        || null,
        lastName:          d.lastName          || null,
        suffix:            d.suffix            || null,
        nickName:          d.nickName          || null,
        title:             d.title             || null,
        company:           d.company           || null,
        department:        d.department        || null,
        workLocation:      d.workLocation      || null,
        email:             d.email             || null,
        personalEmail:     d.personalEmail     || null,
        phone:             d.phone             || null,
        mobile:            d.mobile            || null,
        address:           d.address           || null,
        city:              d.city              || null,
        state:             d.state             || null,
        zip:               d.zip               || null,
        country:           d.country           || null,
        managers:          d.managers          || [],
        directReports:     d.directReports     || [],
        assistantName:     d.assistantName     || null,
        homeAddress:       d.homeAddress       || null,
        notes:             d.notes             || null,
        assignedRep:       d.assignedRep       || null,
        assignedTerritory: d.assignedTerritory || null,
        doNotContact:      d.doNotContact === true ? true : false,
    });

    try {
        if (event.httpMethod === 'GET') {
            const results = await db.select().from(contacts).where(eq(contacts.orgId, orgId)).orderBy(asc(contacts.lastName));
            return { statusCode: 200, headers, body: JSON.stringify({ contacts: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            // Bulk insert — body is an array
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ contacts: [], inserted: 0 }) };
                const rows = data.map(d => ({ ...sanitize(d), orgId }));
                const inserted = await db.insert(contacts).values(rows).onConflictDoNothing().returning();
                return { statusCode: 201, headers, body: JSON.stringify({ contacts: inserted, inserted: inserted.length }) };
            }
            // Single insert
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const [inserted] = await db.insert(contacts).values({ ...sanitize(data), orgId }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ contact: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(contacts).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: contacts.id, set: { ...updateData, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ contact: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                await db.delete(contacts).where(eq(contacts.orgId, orgId));
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Contacts error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
