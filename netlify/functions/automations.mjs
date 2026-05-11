/**
 * automations.mjs — /.netlify/functions/automations
 *
 * GET    — list all automation rules for this org
 * POST   — create a new rule
 * PUT    — update a rule (toggle active, edit name/trigger/conditions/actions)
 * DELETE — permanently delete a rule
 *
 * GET ?runs=<automationId>  — list recent runs for a specific rule (last 50)
 */

import { db }          from '../../db/index.js';
import { automations, automationRuns } from '../../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import { verifyAuth }  from './auth.mjs';

const headers = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
};

// Admins and Managers can manage automations; all roles can read
const canWrite = (role) => ['Admin', 'Manager'].includes(role);

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    try {
        // ── GET /automations?runs=<id> — run history for one rule ─────────────
        if (event.httpMethod === 'GET' && event.queryStringParameters?.runs) {
            const automationId = event.queryStringParameters.runs;
            const runs = await db
                .select()
                .from(automationRuns)
                .where(and(eq(automationRuns.orgId, orgId), eq(automationRuns.automationId, automationId)))
                .orderBy(desc(automationRuns.createdAt))
                .limit(50);
            return { statusCode: 200, headers, body: JSON.stringify({ runs }) };
        }

        // ── GET /automations — list all rules ──────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rules = await db
                .select()
                .from(automations)
                .where(eq(automations.orgId, orgId))
                .orderBy(asc(automations.createdAt));
            return { statusCode: 200, headers, body: JSON.stringify({ automations: rules }) };
        }

        // Write operations — Admin/Manager only
        if (!canWrite(userRole)) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Insufficient role' }) };
        }

        // ── POST — create a rule ───────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.name?.trim())         return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) };
            if (!data.triggerEvent?.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'triggerEvent is required' }) };
            if (!Array.isArray(data.actions) || data.actions.length === 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'at least one action is required' }) };
            }
            const [inserted] = await db.insert(automations).values({
                id:           'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                orgId,
                name:         data.name.trim(),
                triggerEvent: data.triggerEvent.trim(),
                conditions:   Array.isArray(data.conditions) ? data.conditions : [],
                actions:      data.actions,
                active:       data.active ?? true,
                createdBy:    userId,
                runCount:     0,
                createdAt:    new Date(),
                updatedAt:    new Date(),
            }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ automation: inserted }) };
        }

        // ── PUT — update a rule ────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const updates = { updatedAt: new Date() };
            if (data.name         !== undefined) updates.name         = data.name;
            if (data.triggerEvent !== undefined) updates.triggerEvent = data.triggerEvent;
            if (data.conditions   !== undefined) updates.conditions   = data.conditions;
            if (data.actions      !== undefined) updates.actions      = data.actions;
            if (data.active       !== undefined) updates.active       = data.active;
            const [updated] = await db
                .update(automations)
                .set(updates)
                .where(and(eq(automations.id, data.id), eq(automations.orgId, orgId)))
                .returning();
            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            return { statusCode: 200, headers, body: JSON.stringify({ automation: updated }) };
        }

        // ── DELETE — remove a rule ─────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            await db.delete(automations).where(and(eq(automations.id, id), eq(automations.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('automations.mjs error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
