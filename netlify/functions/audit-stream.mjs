// audit-stream.mjs — an org's audit streaming destinations (state §0.87).
//
//   GET              list, without secrets (secretHint + a computed status)
//   POST             create { name, url, fmt } → 201 { destination, secret }  (the secret is shown ONCE)
//   POST ?test=<id>  send a signed audit.test event → 200 { ok, status, error }
//   PUT              { id, name?, url?, fmt?, paused?, rotateSecret? } → 200 { destination, newSecret? }
//   DELETE ?id=<id>  remove
//
// Admin only, every query org-scoped. Delivery itself happens at the audit
// write (_auditStream.mjs), not here.
import { randomUUID } from 'crypto';
import { db } from '../../db/index.js';
import { auditStreamDestinations } from '../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { verifyAuth, requireRole } from './auth.mjs';
import { encrypt } from './crypto.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';
import { invalidateAuditStream, sendTestEvent } from './_auditStream.mjs';
import { validateDestination, newSecret, secretHintOf, destinationView } from './_auditPayload.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// encrypt() throws when SETTINGS_ENCRYPTION_KEY is unset; the BYOK save answers
// 503 for the same reason and so does this.
const sealed = (secret) => {
    try { return { ciphertext: encrypt(secret) }; }
    catch (err) { console.error('[audit-stream] encrypt failed:', err?.message); return { error: json(503, { error: 'Key encryption is not available. Contact your administrator.' }) }; }
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return json(auth.status || 401, { error: auth.error });
    const { orgId, userId } = auth;
    const denied = requireRole(auth, ['Admin'], headers);
    if (denied) return denied;

    const rowOf = async (id) => (await db.select().from(auditStreamDestinations)
        .where(and(eq(auditStreamDestinations.id, id), eq(auditStreamDestinations.orgId, orgId))))[0] || null;

    try {
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(auditStreamDestinations)
                .where(eq(auditStreamDestinations.orgId, orgId)).orderBy(asc(auditStreamDestinations.createdAt));
            return json(200, { destinations: rows.map(destinationView) });
        }

        if (event.httpMethod === 'POST') {
            const testId = event.queryStringParameters?.test;
            if (testId) {
                const dest = await rowOf(testId);
                if (!dest) return json(404, { error: 'Destination not found.' });
                const result = await sendTestEvent(orgId, dest);
                return json(200, { ...result, destination: destinationView(await rowOf(testId)) });
            }
            const data = JSON.parse(event.body || '{}');
            const v = validateDestination(data);
            if (!v.ok) return json(400, { error: v.error });
            const secret = newSecret();
            const s = sealed(secret);
            if (s.error) return s.error;
            const now = new Date();
            const [row] = await db.insert(auditStreamDestinations).values({
                id: 'asd_' + randomUUID(), orgId, ...v.value,
                secret: s.ciphertext, secretHint: secretHintOf(secret),
                createdBy: userId, createdAt: now, updatedAt: now,
            }).returning();
            invalidateAuditStream(orgId);
            await writeAudit(orgId, { action: 'audit_stream.created', entityType: 'audit_stream', entityId: row.id, entityName: row.name, detail: `Destination ${row.url} (${row.fmt})`, userId, userName: await getCallerName(userId, orgId) });
            return json(201, { destination: destinationView(row), secret });
        }

        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return json(400, { error: 'id is required.' });
            const existing = await rowOf(data.id);
            if (!existing) return json(404, { error: 'Destination not found.' });
            const patch = { updatedAt: new Date() };
            if (data.name !== undefined || data.url !== undefined || data.fmt !== undefined) {
                const v = validateDestination({ name: data.name ?? existing.name, url: data.url ?? existing.url, fmt: data.fmt ?? existing.fmt });
                if (!v.ok) return json(400, { error: v.error });
                Object.assign(patch, v.value);
            }
            if (data.paused !== undefined) {
                patch.paused = !!data.paused;
                if (!patch.paused) { patch.failures = 0; patch.lastError = null; }   // a resume is a fresh start
            }
            let newSecretPlain = null;
            if (data.rotateSecret) {
                newSecretPlain = newSecret();
                const s = sealed(newSecretPlain);
                if (s.error) return s.error;
                patch.secret = s.ciphertext;
                patch.secretHint = secretHintOf(newSecretPlain);
            }
            const [row] = await db.update(auditStreamDestinations).set(patch)
                .where(and(eq(auditStreamDestinations.id, data.id), eq(auditStreamDestinations.orgId, orgId))).returning();
            invalidateAuditStream(orgId);
            const what = data.rotateSecret ? 'secret rotated' : data.paused !== undefined ? (patch.paused ? 'paused' : 'resumed') : 'edited';
            await writeAudit(orgId, { action: 'audit_stream.updated', entityType: 'audit_stream', entityId: row.id, entityName: row.name, detail: `Destination ${what}`, userId, userName: await getCallerName(userId, orgId) });
            return json(200, { destination: destinationView(row), ...(newSecretPlain ? { newSecret: newSecretPlain } : {}) });
        }

        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return json(400, { error: 'id is required.' });
            const existing = await rowOf(id);
            if (!existing) return json(404, { error: 'Destination not found.' });
            await db.delete(auditStreamDestinations)
                .where(and(eq(auditStreamDestinations.id, id), eq(auditStreamDestinations.orgId, orgId)));
            invalidateAuditStream(orgId);
            await writeAudit(orgId, { action: 'audit_stream.deleted', entityType: 'audit_stream', entityId: id, entityName: existing.name, detail: `Destination ${existing.url} removed`, userId, userName: await getCallerName(userId, orgId) });
            return json(200, { success: true });
        }

        return json(405, { error: 'Method not allowed' });
    } catch (err) {
        return { statusCode: 500, headers, body: serverErrorBody(err, 'audit-stream') };
    }
};
