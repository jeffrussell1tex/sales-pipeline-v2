/**
 * job-status.mjs — the scheduled jobs' heartbeats (state §0.98, handoff item 32).
 *
 * GET /.netlify/functions/job-status
 *   → { now, jobs: [{ job, schedule, lastStartedAt, lastFinishedAt, lastStatus,
 *                     lastError, lastSummary, okCount, errorCount }] }
 *
 * Admin-only. The rows are SITE-wide (one per function, no tenant data — see
 * the schema note): every org's Admin sees the same four rows, which is the
 * point — a stalled job is stalled for everyone. The verdict is the client's
 * (src/utils/jobHealth.js), so this returns the rows as stored.
 */
import { db } from '../../db/index.js';
import { jobHeartbeats } from '../../db/schema.js';
import { verifyAuth, requireRole } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
    if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    const forbidden = requireRole(auth, ['Admin'], HEADERS);
    if (forbidden) return forbidden;

    try {
        const rows = await db.select().from(jobHeartbeats);
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ now: new Date().toISOString(), jobs: rows }) };
    } catch (err) {
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify(serverErrorBody(err, 'job-status')) };
    }
};
