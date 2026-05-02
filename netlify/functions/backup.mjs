import { db } from '../../db/index.js';
import { backups, backupSchedule, opportunities, accounts, contacts, leads, tasks, activities, users, settings as settingsTable, quotes, products, pipelines } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateSnapId() {
    const now = new Date();
    const y  = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(now.getUTCDate()).padStart(2, '0');
    const h  = String(now.getUTCHours()).padStart(2, '0');
    const mi = String(now.getUTCMinutes()).padStart(2, '0');
    return `bk_snap_${y}_${mo}_${d}_${h}${mi}`;
}

async function collectOrgData(orgId) {
    const [opps, accs, conts, lds, tsks, acts, usrs, sets, qts, prods, pipes] = await Promise.all([
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
            accounts:      accs,
            contacts:      conts,
            leads:         lds,
            tasks:         tsks,
            activities:    acts,
            users:         usrs,
            settings:      sets,
            quotes:        qts,
            products:      prods,
            pipelines:     pipes,
        },
    };

    const json = JSON.stringify(payload);
    const recordCount = opps.length + accs.length + conts.length + lds.length +
                        tsks.length + acts.length + usrs.length + qts.length + prods.length;
    const sizeBytes = Buffer.byteLength(json, 'utf8');

    return { json, recordCount, sizeBytes };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId, userRole } = auth;

    if (userRole !== 'Admin') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
    }

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const params = event.queryStringParameters || {};

            // Download a stored snapshot payload
            if (params.id && params.download === '1') {
                const [snap] = await db.select().from(backups)
                    .where(and(eq(backups.id, params.id), eq(backups.orgId, orgId)));
                if (!snap) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Snapshot not found' }) };
                return {
                    statusCode: 200,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        'Content-Disposition': `attachment; filename="${snap.id}.json"`,
                    },
                    body: snap.payload || '{}',
                };
            }

            // List snapshots + schedule
            const [rows, schedRows] = await Promise.all([
                db.select().from(backups).where(eq(backups.orgId, orgId)).orderBy(desc(backups.createdAt)).limit(30),
                db.select().from(backupSchedule).where(eq(backupSchedule.orgId, orgId)).limit(1),
            ]);

            const schedule = schedRows[0] || {
                frequency: 'Daily', timeUtc: '03:00', retentionDays: 30, notifyOnFailure: '',
            };

            const snapshots = rows.map(r => ({
                id:            r.id,
                createdAt:     r.createdAt,
                type:          r.type,
                recordCount:   r.recordCount,
                sizeBytes:     r.sizeBytes,
                sizeLabel:     formatSize(r.sizeBytes),
                durationMs:    r.durationMs,
                durationLabel: formatDuration(r.durationMs),
                status:        r.status,
                triggeredBy:   r.triggeredBy,
            }));

            return { statusCode: 200, headers, body: JSON.stringify({ snapshots, schedule }) };
        }

        // ── POST: run backup now ──────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const snapId  = generateSnapId();
            const startMs = Date.now();

            const { json: jsonPayload, recordCount, sizeBytes } = await collectOrgData(orgId);
            const durationMs = Date.now() - startMs;

            await db.insert(backups).values({
                id:          snapId,
                orgId,
                type:        'manual',
                status:      'ready',
                recordCount,
                sizeBytes,
                durationMs,
                payload:     jsonPayload,
                triggeredBy: userId,
                createdAt:   new Date(),
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    id:            snapId,
                    recordCount,
                    sizeBytes,
                    sizeLabel:     formatSize(sizeBytes),
                    durationMs,
                    durationLabel: formatDuration(durationMs),
                    status:        'ready',
                    type:          'manual',
                    createdAt:     new Date().toISOString(),
                    downloadData:  jsonPayload,
                }),
            };
        }

        // ── PUT: save schedule config ─────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { frequency, timeUtc, retentionDays, notifyOnFailure } = body;
            const schedId = `sched_${orgId}`;

            await db.insert(backupSchedule).values({
                id:              schedId,
                orgId,
                frequency:       frequency       || 'Daily',
                timeUtc:         timeUtc         || '03:00',
                retentionDays:   retentionDays != null ? Number(retentionDays) : 30,
                notifyOnFailure: notifyOnFailure || '',
                updatedAt:       new Date(),
            }).onConflictDoUpdate({
                target: backupSchedule.id,
                set: {
                    frequency:       frequency       || 'Daily',
                    timeUtc:         timeUtc         || '03:00',
                    retentionDays:   retentionDays != null ? Number(retentionDays) : 30,
                    notifyOnFailure: notifyOnFailure || '',
                    updatedAt:       new Date(),
                },
            });

            return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Backup error:', err.message);
        console.error('Backup error stack:', err.stack);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, detail: err.stack?.split('\n')[0] }) };
    }
};
