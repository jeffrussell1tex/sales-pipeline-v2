// _lib.mjs — shared helpers for Netlify functions.
import { randomUUID } from 'crypto';
import { db } from '../../db/index.js';
import { auditLog, users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

// Browser origins allowed to call the API. Kept in sync with the Clerk
// authorizedParties list in auth.mjs. Exported for the CORS follow-up; any
// origin not on this list already fails Clerk auth.
export const ALLOWED_ORIGINS = [
    'https://salespipelinetracker.com',
    'https://sales-pipeline-v2.netlify.app',
    'https://accelerep.netlify.app',
    'http://localhost:5173',
    'http://localhost:8888',
];
const PRIMARY_ORIGIN = 'https://salespipelinetracker.com';

// Echo the caller's origin only if allow-listed; otherwise the primary domain.
export function allowOrigin(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || '';
    return ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
}

// Standardized 500 body: logs the real error server-side with a correlation id
// and returns ONLY a generic message + that id to the client, so DB driver text
// and stack traces never leak. Returns the JSON string for use as a 500 body.
export function serverErrorBody(err, label = 'function') {
    const requestId = randomUUID();
    console.error(`[${label}] error ${requestId}:`, err?.message, err?.stack);
    return JSON.stringify({ error: 'Internal server error', requestId });
}

// Best-effort audit-log writer shared by entity endpoints. Never throws —
// an audit failure must not fail (or roll back the visibility of) the
// operation being audited; it is logged server-side instead.
export async function writeAudit(orgId, { action, entityType, entityId, entityName = null, detail = null, userId = null, userName = null }) {
    try {
        await db.insert(auditLog).values({
            id: 'audit_' + randomUUID(),
            orgId,
            action,
            entityType,
            entityId: String(entityId || ''),
            entityName,
            detail,
            userId,
            userName,
            timestamp: new Date(),
        });
    } catch (e) {
        console.warn('writeAudit error:', e.message);
    }
}

// Resolve the caller's display name for name-based ownership checks.
// Entity ownership fields (salesRep, accountOwner, assignedTo, repName,
// createdBy) store display names, not Clerk userIds, so object-level write
// authorization compares against this. Cached briefly (per warm container)
// since it runs on every rep-role mutation. Returns null on miss/error —
// callers treat null as "does not own any assigned record" (fail closed).
const callerNameCache = new Map();
const CALLER_NAME_TTL_MS = 30_000;
export async function getCallerName(userId) {
    if (!userId) return null;
    const cached = callerNameCache.get(userId);
    if (cached && Date.now() - cached.ts < CALLER_NAME_TTL_MS) return cached.name;
    try {
        const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
        const name = row?.name || null;
        callerNameCache.set(userId, { name, ts: Date.now() });
        if (callerNameCache.size > 500) callerNameCache.delete(callerNameCache.keys().next().value);
        return name;
    } catch (e) {
        console.warn('getCallerName error:', e.message);
        return null;
    }
}
