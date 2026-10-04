/**
 * job-status.mjs — the scheduled jobs' heartbeats (state §0.98, handoff item 32;
 * per site since §0.100, handoff item 34).
 *
 * GET /.netlify/functions/job-status
 *   → { now, site, enabled, jobs: [{ site, job, schedule, lastStartedAt, lastFinishedAt, lastStatus,
 *                                    lastError, lastSummary, okCount, errorCount }] }
 *   `enabled` is jobsEnabled(process.env) — whether this site runs its jobs (item 36).
 *
 * Admin-only. The rows are SITE-wide (one per function on THIS deployment):
 * every org's Admin on a site sees the same rows, which is the point — a
 * stalled job is stalled for everyone on that site. Only this site's rows: dev
 * and prod share the database, and a prod Admin must read prod's jobs, not
 * dev's (item 34). The verdict is the client's (src/utils/jobHealth.js).
 *
 * But only each job's HEALTH (state §0.166 — Jeff: "Nobody in the app"): a
 * job's summary is counts across EVERY org on the site (orgs processed, emails
 * sent), and its error text can quote any org's data — a tenant's Admin read
 * both. They stay in the row, for the database and Netlify's log.
 */
import { db } from '../../db/index.js';
import { siteJobHeartbeats } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth, requireRole } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';
import { jobsEnabled, siteKey } from '../../src/utils/jobHealth.js';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// A job as a tenant's Admin sees it: status, run times and counts — never the
// cross-org summary or the error text (§0.166).
const publicJob = ({ lastSummary: _summary, lastError: _error, ...job }) => job;

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
    if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    const forbidden = requireRole(auth, ['Admin'], HEADERS);
    if (forbidden) return forbidden;

    try {
        const site = siteKey(process.env);
        const rows = await db.select().from(siteJobHeartbeats).where(eq(siteJobHeartbeats.site, site));
        // `enabled` (item 36): whether THIS site runs its jobs at all — the client's
        // verdict is 'disabled' for every job when it is false, whatever the rows say.
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ now: new Date().toISOString(), site, enabled: jobsEnabled(process.env), jobs: rows.map(publicJob) }) };
    } catch (err) {
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify(serverErrorBody(err, 'job-status')) };
    }
};
