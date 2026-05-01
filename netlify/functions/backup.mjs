// netlify/functions/backup.mjs
// Handles backup snapshots: list, run (export JSON), update schedule, download.
//
// GET  /.netlify/functions/backup              → list snapshots + schedule config
// POST /.netlify/functions/backup              → run a manual backup now (create snapshot row, return full JSON export)
// PUT  /.netlify/functions/backup              → update schedule config only
// GET  /.netlify/functions/backup?id=xxx&download=1 → re-stream a snapshot's data JSON

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import {
    backups, backupSchedule,
    opportunities, accounts, contacts, leads,
    tasks, activities, users, settings as settingsTable,
    quotes, products, pipelines,
} from '../../db/schema.ts';

function getDb() {
    const sql = neon(process.env.NEON_DATABASE_URL);
    return drizzle(sql);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateId() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    const mi = String(now.getUTCMinutes()).padStart(2, '0');
    return `bk_snap_${y}_${mo}_${d}_${h}${mi}`;
}

// Fetch all org data from every entity table. Returns { data, recordCount, sizeBytes }.
async function collectOrgData(db, orgId) {
    const [
        opps, accs, conts, lds, tsks, acts, usrs, sets, qts, prods, pipes,
    ] = await Promise.all([
        db.select().from(opportunities).where(eq(opportunities.orgId, orgId)),
        db.select().from(accounts).where(eq(accounts.orgId, orgId)),
        db.select().from(contacts).where(eq(contacts.orgId, orgId)),
        db.select().from(leads).where(eq(leads.orgId, orgId)),
        db.select().from(tasks).where(eq(tasks.orgId, orgId)),
        db.select().from(activities).where(eq(activities.orgId, orgId)),
        db.select().from(users).where(eq(users.orgId, orgId)),
        db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId)),
        db.select().from(quotes).where(eq(quotes.orgId, orgId)),
        db.select().from(products).where(eq(products.orgId, orgId)),
        db.select().from(pipelines).where(eq(pipelines.orgId, orgId)),
    ]);

    const payload = {
        exportedAt: new Date().toISOString(),
        orgId,
        schema: '1.0',
        entities: {
            opportunities: opps,
            accounts: accs,
            contacts: conts,
            leads: lds,
            tasks: tsks,
            activities: acts,
            users: usrs,
            settings: sets,
            quotes: qts,
            products: prods,
            pipelines: pipes,
        },
    };

    const json = JSON.stringify(payload);
    const recordCount =
        opps.length + accs.length + conts.length + lds.length +
        tsks.length + acts.length + usrs.length + qts.length + prods.length;

    return { data: json, recordCount, sizeBytes: new TextEncoder().encode(json).length };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
    try {
        const auth = await verifyAuth(event);
        if (auth.status) return auth; // 401/403
        const { orgId, userId, userRole } = auth;

        // Only admins can touch backups
        if (userRole !== 'Admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Admin only' }) };
        }

        const db = getDb();
        const method = event.httpMethod;
        const params = event.queryStringParameters || {};

        // ── GET: list snapshots + schedule ────────────────────────────────────
        if (method === 'GET') {
            // Download mode: return the stored JSON payload for a snapshot
            if (params.id && params.download === '1') {
                const [snap] = await db.select()
                    .from(backups)
                    .where(and(eq(backups.id, params.id), eq(backups.orgId, orgId)));

                if (!snap) {
                    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
                }

                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Disposition': `attachment; filename="${snap.id}.json"`,
                    },
                    body: snap.payload || '{}',
                };
            }

            // Normal GET: list + schedule
            const [rows, schedRows] = await Promise.all([
                db.select().from(backups).where(eq(backups.orgId, orgId)).orderBy(desc(backups.createdAt)).limit(30),
                db.select().from(backupSchedule).where(eq(backupSchedule.orgId, orgId)).limit(1),
            ]);

            const schedule = schedRows[0] || {
                frequency: 'Daily',
                timeUtc: '03:00',
                retentionDays: 30,
                notifyOnFailure: '',
            };

            // Strip large payload from listing — only return metadata
            const snapshots = rows.map(r => ({
                id: r.id,
                createdAt: r.createdAt,
                type: r.type,
                recordCount: r.recordCount,
                sizeBytes: r.sizeBytes,
                sizeLabel: formatSize(r.sizeBytes || 0),
                durationMs: r.durationMs,
                durationLabel: formatDuration(r.durationMs || 0),
                status: r.status,
                triggeredBy: r.triggeredBy,
            }));

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshots, schedule }),
            };
        }

        // ── POST: run a backup now ────────────────────────────────────────────
        if (method === 'POST') {
            const snapId = generateId();
            const startMs = Date.now();

            // Collect all org data
            const { data: jsonPayload, recordCount, sizeBytes } = await collectOrgData(db, orgId);

            const durationMs = Date.now() - startMs;

            // Persist snapshot row (payload stored for download)
            await db.insert(backups).values({
                id: snapId,
                orgId,
                type: 'manual',
                status: 'ready',
                recordCount,
                sizeBytes,
                durationMs,
                payload: jsonPayload,
                triggeredBy: userId,
                createdAt: new Date(),
            });

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    // Tell browser to download the file immediately
                    'X-Backup-Id': snapId,
                },
                body: JSON.stringify({
                    id: snapId,
                    recordCount,
                    sizeBytes,
                    sizeLabel: formatSize(sizeBytes),
                    durationMs,
                    durationLabel: formatDuration(durationMs),
                    status: 'ready',
                    type: 'manual',
                    createdAt: new Date().toISOString(),
                    // Include data inline so the client can trigger a download
                    downloadData: jsonPayload,
                }),
            };
        }

        // ── PUT: update schedule config ───────────────────────────────────────
        if (method === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { frequency, timeUtc, retentionDays, notifyOnFailure } = body;

            // Upsert: one row per org
            const schedId = `sched_${orgId}`;
            await db.insert(backupSchedule).values({
                id: schedId,
                orgId,
                frequency: frequency || 'Daily',
                timeUtc: timeUtc || '03:00',
                retentionDays: retentionDays != null ? Number(retentionDays) : 30,
                notifyOnFailure: notifyOnFailure || '',
                updatedAt: new Date(),
            }).onConflictDoUpdate({
                target: backupSchedule.id,
                set: {
                    frequency: frequency || 'Daily',
                    timeUtc: timeUtc || '03:00',
                    retentionDays: retentionDays != null ? Number(retentionDays) : 30,
                    notifyOnFailure: notifyOnFailure || '',
                    updatedAt: new Date(),
                },
            });

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ok: true }),
            };
        }

        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('[backup.mjs]', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
        };
    }
};
