// netlify/functions/calendar-connections.mjs
// CRUD for user and org calendar OAuth connections.
//
// GET    /.netlify/functions/calendar-connections
//   → Returns all personal connections for the current user,
//     plus all org connections for the current org.
//   Response: { userConnections: [...], orgConnections: [...] }
//
// DELETE /.netlify/functions/calendar-connections?id=<id>&scope=user|org
//   → Disconnects (deletes) a connection. Users can only delete their own personal
//     connections. Only Admins can delete org connections.
//
// Note: Connections are CREATED by calendar-oauth-callback.mjs after the OAuth flow
// completes — they are never created directly via this endpoint.

import { db } from '../../db/index.js';
import { userCalendarConnections, orgCalendarConnections } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;
    const isAdmin = userRole === 'Admin';

    try {
        // ── GET — list connections for this user and org ──────────────────────
        if (event.httpMethod === 'GET') {
            // Personal connections for this specific user only
            const userRows = await db
                .select({
                    id:            userCalendarConnections.id,
                    provider:      userCalendarConnections.provider,
                    calendarEmail: userCalendarConnections.calendarEmail,
                    connectedAt:   userCalendarConnections.connectedAt,
                })
                .from(userCalendarConnections)
                .where(
                    and(
                        eq(userCalendarConnections.userId, userId),
                        eq(userCalendarConnections.orgId, orgId)
                    )
                );

            // Org-wide connections — all users can see these (but only admins can manage)
            const orgRows = await db
                .select({
                    id:            orgCalendarConnections.id,
                    provider:      orgCalendarConnections.provider,
                    calendarName:  orgCalendarConnections.calendarName,
                    calendarEmail: orgCalendarConnections.calendarEmail,
                    connectedBy:   orgCalendarConnections.connectedBy,
                    connectedAt:   orgCalendarConnections.connectedAt,
                })
                .from(orgCalendarConnections)
                .where(eq(orgCalendarConnections.orgId, orgId));

            // Never return encrypted tokens to the frontend
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ userConnections: userRows, orgConnections: orgRows }),
            };
        }

        // ── DELETE — disconnect a calendar ────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const { id, scope } = event.queryStringParameters || {};

            if (!id || !scope) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id and scope are required' }) };
            }

            if (scope === 'user') {
                // Users can only delete their own connections
                const rows = await db
                    .select({ userId: userCalendarConnections.userId })
                    .from(userCalendarConnections)
                    .where(
                        and(
                            eq(userCalendarConnections.id, id),
                            eq(userCalendarConnections.orgId, orgId)
                        )
                    );

                if (rows.length === 0) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Connection not found' }) };
                }
                if (rows[0].userId !== userId) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only disconnect your own calendar' }) };
                }

                await db
                    .delete(userCalendarConnections)
                    .where(eq(userCalendarConnections.id, id));

                return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
            }

            if (scope === 'org') {
                if (!isAdmin) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only Admins can disconnect the company calendar' }) };
                }

                const rows = await db
                    .select({ id: orgCalendarConnections.id })
                    .from(orgCalendarConnections)
                    .where(
                        and(
                            eq(orgCalendarConnections.id, id),
                            eq(orgCalendarConnections.orgId, orgId)
                        )
                    );

                if (rows.length === 0) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Connection not found' }) };
                }

                await db
                    .delete(orgCalendarConnections)
                    .where(eq(orgCalendarConnections.id, id));

                return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
            }

            return { statusCode: 400, headers, body: JSON.stringify({ error: 'scope must be "user" or "org"' }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('calendar-connections error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
