import { db }            from '../../db/index.js';
import { savedReports }  from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth }    from './auth.mjs';

const headers = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const sanitize = (data) => ({
    id:          data.id,
    orgId:       data.orgId,
    ownerId:     data.ownerId,
    ownerName:   data.ownerName   ?? null,
    name:        data.name        ?? 'Untitled report',
    description: data.description ?? null,
    source:      data.source      ?? null,
    dims:        data.dims        ?? null,
    metrics:     data.metrics     ?? null,
    chartType:   data.chartType   ?? null,
    filters:     data.filters     ?? null,
    config:      data.config      ?? null,
    isShared:    data.isShared    ?? false,
});

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId } = auth;

    try {
        // GET — return all saved reports for this org (own + shared)
        if (event.httpMethod === 'GET') {
            const rows = await db
                .select()
                .from(savedReports)
                .where(eq(savedReports.orgId, orgId))
                .orderBy(desc(savedReports.updatedAt));
            return { statusCode: 200, headers, body: JSON.stringify({ reports: rows }) };
        }

        // POST — create new saved report
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const payload = sanitize({ ...data, orgId, ownerId: userId });
            const [inserted] = await db.insert(savedReports).values(payload).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ report: inserted }) };
        }

        // PUT — update (rename, share toggle, etc.) using upsert
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const payload = sanitize({ ...data, orgId, ownerId: userId });
            const [updated] = await db
                .insert(savedReports)
                .values(payload)
                .onConflictDoUpdate({ target: savedReports.id, set: { ...payload, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ report: updated }) };
        }

        // DELETE
        if (event.httpMethod === 'DELETE') {
            const { id } = JSON.parse(event.body || '{}');
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            await db
                .delete(savedReports)
                .where(and(eq(savedReports.id, id), eq(savedReports.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ deleted: id }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('saved-reports error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
