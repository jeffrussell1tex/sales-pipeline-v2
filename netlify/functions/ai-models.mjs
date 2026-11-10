/**
 * ai-models.mjs — which of the app's AI models this workspace's key can call (state §0.238; Jeff, 9 Nov:
 * decision 4, "checked against what the workspace's key can call before they are listed").
 *
 * GET /.netlify/functions/ai-models   (an Admin's — the Features panel asks as it opens)
 *
 * Answers 200 with ONE of:
 *   { checked: true,  usingOrgKey, callable: [model ids] }   — the app's models (src/utils/aiModels.js)
 *                                                               Anthropic lists for the key in use
 *   { checked: false, reason: 'no_key' | 'refused' | 'unreachable', status? }
 *
 * The key in use is the one a score would use: the org's BYOK key, else the site's (_aiKey.mjs), read from
 * THIS org's settings row. Anthropic's models list costs nothing and sends no record of the org. Nothing is
 * cached: the answer is this org's key's, now — a module-level copy would hand one org's answer to another
 * in a warm instance. The key never leaves the server; the answer is ids only.
 */
import { db } from '../../db/index.js';
import { settings as settingsTable } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth, requireRole } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';
import { resolveAnthropicKey } from './_aiKey.mjs';
import { AI_MODELS } from '../../src/utils/aiModels.js';

const headers = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const answer = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return answer(405, { error: 'Method not allowed' });

    const auth = await verifyAuth(event);
    if (auth.error) return answer(auth.status || 401, { error: auth.error });
    const forbidden = requireRole(auth, ['Admin'], headers);
    if (forbidden) return forbidden;

    try {
        const [row] = await db.select({ extra: settingsTable.extra })
            .from(settingsTable).where(eq(settingsTable.orgId, auth.orgId)).limit(1);
        const { apiKey, usingOrgKey } = resolveAnthropicKey(row?.extra);
        if (!apiKey) return answer(200, { checked: false, reason: 'no_key' });

        let response;
        try {
            response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
                signal: AbortSignal.timeout(8000),
            });
        } catch {
            return answer(200, { checked: false, reason: 'unreachable', usingOrgKey });
        }
        if (!response.ok) return answer(200, { checked: false, reason: response.status === 401 || response.status === 403 ? 'refused' : 'unreachable', status: response.status, usingOrgKey });
        const listed = await response.json().catch(() => null);
        const ids = new Set(Array.isArray(listed?.data) ? listed.data.map((m) => m?.id).filter((id) => typeof id === 'string') : []);
        return answer(200, { checked: true, usingOrgKey, callable: AI_MODELS.map((m) => m.id).filter((id) => ids.has(id)) });
    } catch (err) {
        console.error('ai-models error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'ai-models') };
    }
};
