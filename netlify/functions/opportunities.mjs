import { db } from '../../db/index.js';
import { opportunities } from '../../db/schema.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isManager } from './auth.mjs';

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

    // Verify Clerk JWT
    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }
    const { userId, userRole, managedReps } = auth;

    try {
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(opportunities).orderBy(asc(opportunities.createdAt));

            // Role-based filtering:
            // Admin — sees all
            // Manager — sees reps assigned to them (managedReps array from Clerk metadata)
            // User (Rep) — sees only their own opportunities
            if (!canSeeAll(userRole)) {
                results = results.filter(o => !o.salesRep || o.salesRep === userId);
            } else if (isManager(userRole) && managedReps.length > 0) {
                results = results.filter(o => !o.salesRep || managedReps.includes(o.salesRep));
            }

            return { statusCode: 200, headers, body: JSON.stringify({ opportunities: results }) };
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [inserted] = await db.insert(opportunities).values(data).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ opportunity: inserted }) };
        }

        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const { id, createdAt, ...updateData } = data;
            const [updated] = await db.update(opportunities)
                .set({ ...updateData, updatedAt: new Date() })
                .where(eq(opportunities.id, id))
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ opportunity: updated }) };
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            await db.delete(opportunities).where(eq(opportunities.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Opportunities function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
