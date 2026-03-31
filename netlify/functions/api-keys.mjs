import { db } from '../../db/index.js';
import { apiKeys } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { createHash, randomBytes } from 'crypto';

// ── Helpers ───────────────────────────────────────────────────────────────────

const sha256 = (str) => createHash('sha256').update(str).digest('hex');

const generateKey = () => {
    const raw = randomBytes(32).toString('hex');         // 64 hex chars
    return `spt_live_${raw}`;                            // e.g. spt_live_a1b2c3...
};

// Admin-only guard — API key management is restricted to Admins
const requireAdmin = (userRole) => userRole === 'Admin';

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
        // ── GET — list all active keys for this org ────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db
                .select()
                .from(apiKeys)
                .where(and(eq(apiKeys.orgId, orgId)));

            // Never expose keyHash — return display-safe fields only
            const keys = rows.map(k => ({
                id:          k.id,
                name:        k.name,
                keyPrefix:   k.keyPrefix,
                scopes:      k.scopes,
                lastUsedAt:  k.lastUsedAt,
                createdBy:   k.createdBy,
                createdAt:   k.createdAt,
                revokedAt:   k.revokedAt,
            }));

            return { statusCode: 200, headers, body: JSON.stringify({ keys }) };
        }

        // ── POST — generate a new API key ─────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.name || !data.name.trim()) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Key name is required.' }) };
            }

            const plaintext = generateKey();
            const hash      = sha256(plaintext);
            const prefix    = plaintext.slice(0, 16);   // "spt_live_a1b2c3d" — safe to show
            const id        = 'apikey_' + Date.now() + '_' + randomBytes(3).toString('hex');

            await db.insert(apiKeys).values({
                id,
                orgId,
                name:      data.name.trim(),
                keyHash:   hash,
                keyPrefix: prefix,
                scopes:    ['read'],
                createdBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Return the plaintext key ONCE — it is never retrievable again
            return {
                statusCode: 201,
                headers,
                body: JSON.stringify({
                    key: {
                        id,
                        name:      data.name.trim(),
                        keyPrefix: prefix,
                        scopes:    ['read'],
                        createdAt: new Date().toISOString(),
                    },
                    // IMPORTANT: this is the only time the full key is returned
                    plaintextKey: plaintext,
                }),
            };
        }

        // ── DELETE — revoke a key (soft delete — sets revokedAt) ──────────────
        if (event.httpMethod === 'DELETE') {
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Key id is required.' }) };

            // Scope check — only revoke keys belonging to this org
            const [existing] = await db
                .select()
                .from(apiKeys)
                .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, orgId)));

            if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Key not found.' }) };
            if (existing.revokedAt) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Key already revoked.' }) };

            await db
                .update(apiKeys)
                .set({ revokedAt: new Date(), updatedAt: new Date() })
                .where(eq(apiKeys.id, id));

            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed.' }) };
    } catch (err) {
        console.error('api-keys error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
