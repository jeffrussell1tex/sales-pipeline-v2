import { db } from '../../db/index.js';
import {
    backups, backupSchedule,
    opportunities, accounts, contacts, leads, tasks, activities,
    users, settings as settingsTable, quotes, products, pipelines,
    dispatchTechnicians, dispatchVehicles, dispatchEquipment,
    dispatchCustomers, dispatchServiceLocations,
    dispatchJobs, dispatchJobLineItems, dispatchJobStatusHistory,
} from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function formatDuration(ms) {
    if (!ms) return '0m 00s';
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

// Collect all org data and return as a serialised JSON string + stats.
// Called for both POST (record metrics) and GET ?download=1 (serve the file).
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

    const json = JSON.stringify(payload, null, 2);
    const recordCount = opps.length + accs.length + conts.length + lds.length +
                        tsks.length + acts.length + usrs.length + qts.length + prods.length;
    const sizeBytes = Buffer.byteLength(json, 'utf8');

    return { json, recordCount, sizeBytes };
}

// Normalise a Drizzle row — neon-http may return camelCase or snake_case
function normaliseRow(r) {
    const recordCount   = r.recordCount   ?? r.record_count   ?? 0;
    const sizeBytes     = r.sizeBytes     ?? r.size_bytes     ?? 0;
    const durationMs    = r.durationMs    ?? r.duration_ms    ?? 0;
    const triggeredBy   = r.triggeredBy   ?? r.triggered_by   ?? null;
    const createdAt     = r.createdAt     ?? r.created_at     ?? null;
    return {
        id:            r.id,
        createdAt,
        type:          r.type,
        recordCount,
        sizeBytes,
        sizeLabel:     formatSize(sizeBytes),
        durationMs,
        durationLabel: formatDuration(durationMs),
        status:        r.status,
        triggeredBy,
    };
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

            // ?id=xxx&download=1  →  regenerate export fresh and stream as a file download
            // We do NOT store the payload in the DB. We regenerate it on demand.
            // This avoids Netlify's 6 MB response body limit for the POST and keeps
            // the backups table lean (metadata only).
            if (params.id && params.download === '1') {
                // Verify this snapshot belongs to the org
                const [snap] = await db.select().from(backups)
                    .where(and(eq(backups.id, params.id), eq(backups.orgId, orgId)));
                if (!snap) {
                    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Snapshot not found' }) };
                }

                const { json } = await collectOrgData(orgId);

                // Return as a plain JSON file — Content-Disposition tells the browser to download it.
                // NOTE: this endpoint is called directly via window.fetch (not dbFetch) on the
                // frontend so the raw text body reaches the Blob constructor untouched.
                return {
                    statusCode: 200,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        'Content-Disposition': `attachment; filename="${snap.id}.json"`,
                    },
                    body: json,
                };
            }

            // Normal GET — list snapshots + schedule config
            const [rows, schedRows] = await Promise.all([
                db.select().from(backups).where(eq(backups.orgId, orgId)).orderBy(desc(backups.createdAt)).limit(30),
                db.select().from(backupSchedule).where(eq(backupSchedule.orgId, orgId)).limit(1),
            ]);

            const schedule = schedRows[0] || {
                frequency: 'Daily', timeUtc: '03:00', retentionDays: 30, notifyOnFailure: '',
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ snapshots: rows.map(normaliseRow), schedule }),
            };
        }

        // ── POST: create snapshot row (metadata only) ─────────────────────────
        if (event.httpMethod === 'POST') {
            const snapId  = generateSnapId();
            const startMs = Date.now();

            // Collect data to measure real record count and size
            const { recordCount, sizeBytes } = await collectOrgData(orgId);
            const durationMs = Date.now() - startMs;

            await db.insert(backups).values({
                id:          snapId,
                orgId,
                type:        'manual',
                status:      'ready',
                recordCount,
                sizeBytes,
                durationMs,
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

        // ── PATCH: import / restore from an uploaded JSON backup file ─────────
        if (event.httpMethod === 'PATCH') {
            let payload;
            try {
                payload = JSON.parse(event.body || '{}');
            } catch {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
            }

            const ents = payload.entities;
            if (!ents || typeof ents !== 'object') {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing entities key' }) };
            }

            const TIMESTAMP_KEYS = new Set([
                'createdAt','updatedAt','checkedOutAt','actualStart','actualEnd','invoicePaidAt',
                'created_at','updated_at','checked_out_at','actual_start','actual_end','invoice_paid_at',
            ]);

            // JSONB columns that must be stringified when coming in as arrays/objects
            const JSONB_KEYS = new Set([
                'serviceZones','skills','certifications','workingHours',
                'coTechIds','equipmentIds','tags','customFields',
                'co_tech_ids','equipment_ids','custom_fields',
            ]);

            // Stamp orgId, coerce timestamps → Date, stringify JSONB arrays/objects
            const stamp = rows => (rows || []).map(r => {
                const out = { ...r, orgId };
                TIMESTAMP_KEYS.forEach(k => {
                    if (out[k] && typeof out[k] === 'string') {
                        const d = new Date(out[k]);
                        out[k] = isNaN(d.getTime()) ? null : d;
                    }
                    // null stays null, Date stays Date
                });
                JSONB_KEYS.forEach(k => {
                    if (k in out && (Array.isArray(out[k]) || (out[k] !== null && typeof out[k] === 'object'))) {
                        out[k] = JSON.stringify(out[k]);
                    }
                });
                return out;
            });

            const CHUNK = 50;
            async function upsertChunked(table, rows, conflictTarget) {
                if (!rows || rows.length === 0) return 0;
                const stamped = stamp(rows);
                for (let i = 0; i < stamped.length; i += CHUNK) {
                    const chunk = stamped.slice(i, i + CHUNK);
                    const setCols = Object.fromEntries(
                        Object.keys(chunk[0])
                            .filter(k => k !== 'id' && k !== 'orgId')
                            .map(k => [k, table[k]])
                            .filter(([, v]) => v !== undefined)
                    );
                    await db.insert(table)
                        .values(chunk)
                        .onConflictDoUpdate({ target: conflictTarget || table.id, set: setCols })
                        .catch(() => {});
                }
                return stamped.length;
            }

            let imported = 0;
            const errs = [];

            // Standard CRM entities
            const crmEntities = [
                { key: 'opportunities', table: opportunities },
                { key: 'accounts',      table: accounts      },
                { key: 'contacts',      table: contacts      },
                { key: 'leads',         table: leads         },
                { key: 'tasks',         table: tasks         },
                { key: 'activities',    table: activities    },
                { key: 'users',         table: users         },
                { key: 'settings',      table: settingsTable },
                { key: 'quotes',        table: quotes        },
                { key: 'products',      table: products      },
                { key: 'pipelines',     table: pipelines     },
            ];

            for (const { key, table } of crmEntities) {
                const rows = ents[key];
                if (!Array.isArray(rows) || rows.length === 0) continue;
                try { imported += await upsertChunked(table, rows); }
                catch (e) { errs.push(`${key}: ${e.message}`); }
            }

            // Dispatch entities (nested under entities.dispatch)
            const dispatch = ents.dispatch;
            if (dispatch && typeof dispatch === 'object') {
                const dispatchEntities = [
                    { key: 'technicians',      table: dispatchTechnicians      },
                    { key: 'vehicles',         table: dispatchVehicles         },
                    { key: 'equipment',        table: dispatchEquipment        },
                    { key: 'customers',        table: dispatchCustomers        },
                    { key: 'serviceLocations', table: dispatchServiceLocations },
                    { key: 'jobs',             table: dispatchJobs             },
                    { key: 'jobLineItems',     table: dispatchJobLineItems     },
                    { key: 'jobStatusHistory', table: dispatchJobStatusHistory },
                ];
                for (const { key, table } of dispatchEntities) {
                    const rows = dispatch[key];
                    if (!Array.isArray(rows) || rows.length === 0) continue;
                    try { imported += await upsertChunked(table, rows); }
                    catch (e) { errs.push(`dispatch.${key}: ${e.message}`); }
                }
            }

            // Record a synthetic snapshot entry
            const snapId = generateSnapId() + '_import';
            try {
                await db.insert(backups).values({
                    id:          snapId,
                    orgId,
                    type:        'import',
                    status:      errs.length ? 'partial' : 'ready',
                    recordCount: imported,
                    sizeBytes:   Buffer.byteLength(event.body || '', 'utf8'),
                    durationMs:  0,
                    triggeredBy: userId,
                    createdAt:   new Date(),
                });
            } catch { /* non-fatal */ }

            return {
                statusCode: errs.length && imported === 0 ? 500 : 200,
                headers,
                body: JSON.stringify({ ok: imported > 0, imported, errors: errs, snapId }),
            };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Backup error:', err.message);
        console.error('Backup error stack:', err.stack);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, detail: err.stack?.split('\n')[0] }) };
    }
};
