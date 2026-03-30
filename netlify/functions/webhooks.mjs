/**
 * Webhook subscription management — /.netlify/functions/webhooks
 *
 * GET    — list all subscriptions for this org
 * POST   — create a new subscription
 * PUT    — update a subscription (toggle active, change URL/events)
 * DELETE — permanently delete a subscription
 *
 * Webhook dispatch is handled by dispatchWebhook() which is called
 * by other Netlify functions when relevant events occur (opportunity saved, etc.)
 *
 * Payload format sent to customer endpoints:
 * {
 *   event:     "opportunity.stage_changed",
 *   timestamp: "2025-01-15T10:30:00.000Z",
 *   org_id:    "org_abc123",
 *   data:      { ...entity fields }
 * }
 *
 * Signature header: X-SPT-Signature: sha256=<HMAC-SHA256 hex>
 * Customers verify: HMAC-SHA256(secret, JSON.stringify(payload))
 */

import { db } from '../../db/index.js';
import { webhookSubscriptions } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { createHmac, randomBytes } from 'crypto';

// ── Supported event types ─────────────────────────────────────────────────────
export const WEBHOOK_EVENTS = [
    'opportunity.created',
    'opportunity.stage_changed',
    'opportunity.won',
    'opportunity.lost',
    'lead.created',
    'lead.converted',
    'task.overdue',
    'task.completed',
    'spiff.claimed',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateSecret = () => 'whsec_' + randomBytes(24).toString('hex');

const requireAdmin = (userRole) => userRole === 'Admin';

const signPayload = (secret, payloadJson) =>
    'sha256=' + createHmac('sha256', secret).update(payloadJson).digest('hex');

// ── dispatchWebhook ───────────────────────────────────────────────────────────
// Called by other functions (e.g. opportunities.mjs) when events occur.
// Usage: await dispatchWebhook(orgId, 'opportunity.won', dealData);
// This is exported so other Netlify functions can import and call it directly.
export const dispatchWebhook = async (orgId, eventType, data) => {
    try {
        // Find all active subscriptions for this org + event
        const subs = await db
            .select()
            .from(webhookSubscriptions)
            .where(and(
                eq(webhookSubscriptions.orgId, orgId),
                eq(webhookSubscriptions.active, true),
            ));

        const matching = subs.filter(s =>
            Array.isArray(s.eventTypes) && s.eventTypes.includes(eventType)
        );

        if (matching.length === 0) return;

        const payload = {
            event:     eventType,
            timestamp: new Date().toISOString(),
            org_id:    orgId,
            data,
        };
        const payloadJson = JSON.stringify(payload);

        // Dispatch to all matching endpoints in parallel
        await Promise.allSettled(matching.map(async (sub) => {
            const signature = signPayload(sub.secret, payloadJson);
            let status = null;
            try {
                const res = await fetch(sub.targetUrl, {
                    method:  'POST',
                    headers: {
                        'Content-Type':     'application/json',
                        'X-SPT-Signature':  signature,
                        'X-SPT-Event':      eventType,
                        'User-Agent':       'Accelerep-Webhooks/1.0',
                    },
                    body:    payloadJson,
                    signal:  AbortSignal.timeout(10000), // 10s timeout
                });
                status = res.status;
            } catch (err) {
                console.error(`Webhook dispatch failed for ${sub.id} → ${sub.targetUrl}:`, err.message);
                status = 0;
            }

            // Update lastFiredAt + lastStatus (fire and forget)
            db.update(webhookSubscriptions)
              .set({ lastFiredAt: new Date(), lastStatus: status, updatedAt: new Date() })
              .where(eq(webhookSubscriptions.id, sub.id))
              .catch(err => console.error('webhook status update failed:', err.message));
        }));
    } catch (err) {
        console.error('dispatchWebhook error:', err.message);
    }
};

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userRole, userId } = auth;

    if (!requireAdmin(userRole)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required.' }) };
    }

    try {
        // ── GET — list all subscriptions ──────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db
                .select()
                .from(webhookSubscriptions)
                .where(eq(webhookSubscriptions.orgId, orgId));

            // Never expose the secret in list view — callers see it only on create
            const subs = rows.map(s => ({
                id:          s.id,
                name:        s.name,
                targetUrl:   s.targetUrl,
                eventTypes:  s.eventTypes,
                active:      s.active,
                lastFiredAt: s.lastFiredAt,
                lastStatus:  s.lastStatus,
                createdAt:   s.createdAt,
                updatedAt:   s.updatedAt,
                // Expose masked secret so users can rotate if needed
                secretMasked: s.secret ? s.secret.slice(0, 12) + '••••••••' : null,
            }));

            return { statusCode: 200, headers, body: JSON.stringify({ webhooks: subs, supportedEvents: WEBHOOK_EVENTS }) };
        }

        // ── POST — create a new subscription ──────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');

            if (!data.name?.trim())       return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name is required.' }) };
            if (!data.targetUrl?.trim())  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Target URL is required.' }) };
            if (!data.targetUrl.startsWith('https://')) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Target URL must use HTTPS.' }) };
            if (!Array.isArray(data.eventTypes) || data.eventTypes.length === 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'At least one event type is required.' }) };
            }

            // Validate event types
            const invalid = data.eventTypes.filter(e => !WEBHOOK_EVENTS.includes(e));
            if (invalid.length > 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown event type(s): ${invalid.join(', ')}` }) };
            }

            const secret = generateSecret();
            const id     = 'wh_' + Date.now() + '_' + randomBytes(3).toString('hex');

            await db.insert(webhookSubscriptions).values({
                id,
                orgId,
                name:       data.name.trim(),
                targetUrl:  data.targetUrl.trim(),
                eventTypes: data.eventTypes,
                secret,
                active:     true,
                createdBy:  userId,
                createdAt:  new Date(),
                updatedAt:  new Date(),
            });

            // Return the secret ONCE — not shown again after this
            return {
                statusCode: 201,
                headers,
                body: JSON.stringify({
                    webhook: { id, name: data.name.trim(), targetUrl: data.targetUrl.trim(), eventTypes: data.eventTypes, active: true },
                    secret, // shown once only
                }),
            };
        }

        // ── PUT — update a subscription ────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Webhook id is required.' }) };

            const [existing] = await db
                .select()
                .from(webhookSubscriptions)
                .where(and(eq(webhookSubscriptions.id, data.id), eq(webhookSubscriptions.orgId, orgId)));

            if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Webhook not found.' }) };

            const updates = { updatedAt: new Date() };
            if (data.name      !== undefined) updates.name       = data.name.trim();
            if (data.targetUrl !== undefined) {
                if (!data.targetUrl.startsWith('https://')) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Target URL must use HTTPS.' }) };
                }
                updates.targetUrl = data.targetUrl.trim();
            }
            if (data.eventTypes !== undefined) {
                const invalid = data.eventTypes.filter(e => !WEBHOOK_EVENTS.includes(e));
                if (invalid.length > 0) return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown event type(s): ${invalid.join(', ')}` }) };
                updates.eventTypes = data.eventTypes;
            }
            if (data.active !== undefined) updates.active = !!data.active;

            // Rotate secret if explicitly requested
            let newSecret = null;
            if (data.rotateSecret) {
                newSecret = generateSecret();
                updates.secret = newSecret;
            }

            await db.update(webhookSubscriptions).set(updates).where(eq(webhookSubscriptions.id, data.id));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    ...(newSecret ? { newSecret } : {}), // return new secret if rotated
                }),
            };
        }

        // ── DELETE — remove a subscription ────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Webhook id is required.' }) };

            const [existing] = await db
                .select()
                .from(webhookSubscriptions)
                .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.orgId, orgId)));

            if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Webhook not found.' }) };

            await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id));

            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed.' }) };
    } catch (err) {
        console.error('webhooks error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
