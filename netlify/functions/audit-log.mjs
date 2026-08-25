import { db } from '../../db/index.js';
import { auditLog } from '../../db/schema.js';
import { desc, and, eq } from 'drizzle-orm';
import { verifyAuth, requireWrite, requireRole } from './auth.mjs';
import { serverErrorBody, getCallerName } from './_lib.mjs';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId } = auth;

    // The audit log is the evidence trail for every other control in the app,
    // so it is append-only and its actor fields are server-derived (below).
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        if (event.httpMethod === 'GET') {
            // Reading the org's activity trail is a privileged view.
            const denied = requireRole(auth, ['Admin', 'Manager'], headers);
            if (denied) return denied;
            const entries = await db.select().from(auditLog).where(eq(auditLog.orgId, orgId)).orderBy(desc(auditLog.timestamp)).limit(500);
            return { statusCode: 200, headers, body: JSON.stringify({ entries }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id || !data.action || !data.entityType || !data.entityId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: id, action, entityType, entityId' }) };
            }
            // Actor and time are derived server-side and the client's values are
            // ignored. Previously these were taken straight from the request body
            // (App.jsx sends a display name as userId), which let any authenticated
            // member forge entries attributing arbitrary actions to another user at
            // an arbitrary timestamp — and a log anyone can write to is not evidence.
            const callerName = await getCallerName(userId, orgId);
            const [inserted] = await db.insert(auditLog).values({ orgId,
                id:         data.id,
                action:     data.action,
                entityType: data.entityType,
                entityId:   data.entityId,
                entityName: data.entityName || null,
                detail:     data.detail     || null,
                userId,
                userName:   callerName || null,
                timestamp:  new Date(),
            }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ entry: inserted }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Audit log error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'audit-log') };
    }
};
