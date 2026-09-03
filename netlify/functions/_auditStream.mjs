// _auditStream.mjs — deliver audit rows to an org's streaming destinations
// (state §0.87). Called after every audit_log insert (the four write sites);
// never throws — an audit write must never fail because a customer's endpoint
// did. Imports db, schema, crypto and the pure module; it must NOT import
// _lib.mjs (which imports this one).
import { randomUUID } from 'crypto';
import { db } from '../../db/index.js';
import { auditStreamDestinations } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { decrypt } from './crypto.mjs';
import {
    auditPayloadOf, testPayloadOf, bodyFor, signBody, deliveryHeaders,
    nextDeliveryState, DELIVERY_TIMEOUT_MS,
} from './_auditPayload.mjs';

// ── per-org cache of the destinations, so an audited write adds no SELECT ────
// 30 s, like the roster cache in _lib.mjs; the endpoint invalidates on write.
const CACHE_TTL_MS = 30_000;
const destCache = new Map();

export function invalidateAuditStream(orgId) {
    if (!orgId) { destCache.clear(); return; }
    destCache.delete(orgId);
}

async function destinationsOf(orgId) {
    const hit = destCache.get(orgId);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.rows;
    const rows = await db.select().from(auditStreamDestinations)
        .where(eq(auditStreamDestinations.orgId, orgId));
    destCache.set(orgId, { rows, ts: Date.now() });
    if (destCache.size > 200) destCache.delete(destCache.keys().next().value);
    return rows;
}

// ── one attempt ──────────────────────────────────────────────────────────────

async function attempt(dest, payload, type) {
    const at = new Date();
    const secret = decrypt(dest.secret);
    if (!secret) return { status: 0, error: 'Secret unreadable (encryption key changed?) — rotate the secret', at };
    const body = bodyFor(payload, dest.fmt);
    const headers = deliveryHeaders({
        signature: signBody(secret, body), deliveryId: payload.delivery_id, sentAt: payload.sent_at, type, fmt: dest.fmt,
    });
    try {
        const res = await fetch(dest.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS) });
        return { status: res.status, error: null, at };
    } catch (err) {
        const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        return { status: 0, error: timedOut ? `No response within ${DELIVERY_TIMEOUT_MS / 1000}s` : (err?.message || 'Request failed'), at };
    }
}

async function record(orgId, dest, result) {
    const patch = nextDeliveryState(dest, result);
    try {
        await db.update(auditStreamDestinations).set(patch)
            .where(and(eq(auditStreamDestinations.id, dest.id), eq(auditStreamDestinations.orgId, orgId)));
    } catch (e) {
        console.warn('audit-stream: could not record delivery state:', e.message);
    }
    invalidateAuditStream(orgId);
    return patch;
}

/**
 * Deliver one audit row to every un-paused destination of its org, in
 * parallel, each with its own timeout, recording every attempt. Returns
 * { attempted, delivered } for callers that want to know; never throws.
 */
export async function streamAudit(orgId, row) {
    try {
        if (!orgId || !row) return { attempted: 0, delivered: 0 };
        const dests = (await destinationsOf(orgId)).filter(d => !d.paused);
        if (!dests.length) return { attempted: 0, delivered: 0 };
        const payload = auditPayloadOf(row, { deliveryId: randomUUID(), sentAt: new Date().toISOString() });
        const results = await Promise.allSettled(dests.map(async (dest) => {
            const result = await attempt(dest, payload, 'audit');
            await record(orgId, dest, result);
            return result;
        }));
        const delivered = results.filter(r => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300).length;
        return { attempted: dests.length, delivered };
    } catch (err) {
        console.warn('audit-stream: streamAudit error:', err?.message);
        return { attempted: 0, delivered: 0 };
    }
}

/** "Send test event": the same path as a real row, for one destination. Returns { ok, status, error }. */
export async function sendTestEvent(orgId, dest) {
    const payload = testPayloadOf(orgId, dest, { deliveryId: randomUUID(), sentAt: new Date().toISOString() });
    const result = await attempt(dest, payload, 'audit.test');
    await record(orgId, dest, result);
    const ok = result.status >= 200 && result.status < 300;
    return { ok, status: result.status, error: ok ? null : (result.error || `Endpoint answered ${result.status}`) };
}
