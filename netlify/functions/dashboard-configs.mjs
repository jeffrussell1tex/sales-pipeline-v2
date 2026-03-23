import { db } from '../../db/index.js';
import { dashboardConfigs } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId } = auth;

    try {
        if (event.httpMethod === 'GET') {
            const [row] = await db.select()
                .from(dashboardConfigs)
                .where(and(eq(dashboardConfigs.userId, userId), eq(dashboardConfigs.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ config: row || null }) };
        }

        if (event.httpMethod === 'PUT') {
            const { widgets } = JSON.parse(event.body);
            if (!Array.isArray(widgets)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'widgets must be an array' }) };

            const id = 'dash_' + userId + '_' + orgId;
            const [upserted] = await db.insert(dashboardConfigs)
                .values({ id, userId, orgId, widgets })
                .onConflictDoUpdate({
                    target: dashboardConfigs.id,
                    set: { widgets, updatedAt: new Date() },
                })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ config: upserted }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Dashboard configs error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
