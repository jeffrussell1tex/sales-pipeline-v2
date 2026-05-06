import { db }                                                        from '../../db/index.js';
import { exportRuns, exportSchedules,
         accounts, contacts, opportunities,
         tasks, activities, leads }                                   from '../../db/schema.js';
import { eq, and, desc }                                              from 'drizzle-orm';
import { verifyAuth }                                                 from './auth.mjs';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Scope → table map ─────────────────────────────────────────────────────────
const SCOPE_TABLE = {
    accounts:      accounts,
    contacts:      contacts,
    opportunities: opportunities,
    tasks:         tasks,
    activities:    activities,
    leads:         leads,
};

// ── CSV serialiser ─────────────────────────────────────────────────────────────
// Converts an array of DB rows to a CSV string.
// Skips internal columns (orgId, updatedAt for brevity) and jsonb blobs.
const SKIP_COLS = new Set(['orgId', 'org_id']);

function rowsToCsv(rows) {
    if (!rows || rows.length === 0) return '';
    const allKeys = Object.keys(rows[0]).filter(k => !SKIP_COLS.has(k));
    const escape  = (v) => {
        if (v === null || v === undefined) return '';
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        // Wrap in quotes if contains comma, newline, or quote
        if (s.includes(',') || s.includes('\n') || s.includes('"')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };
    const header = allKeys.join(',');
    const body   = rows.map(r => allKeys.map(k => escape(r[k])).join(','));
    return [header, ...body].join('\r\n');
}

// ── Human-readable file size ───────────────────────────────────────────────────
function fmtSize(bytes) {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    try {
        // ── GET — list recent runs (last 20) ──────────────────────────────
        if (event.httpMethod === 'GET') {
            const rows = await db
                .select()
                .from(exportRuns)
                .where(eq(exportRuns.orgId, orgId))
                .orderBy(desc(exportRuns.createdAt))
                .limit(20);
            return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ runs: rows }) };
        }

        // ── POST — trigger an ad-hoc export ───────────────────────────────
        // Body: { id, scope, format, name?, scheduleId? }
        if (event.httpMethod === 'POST') {
            if (userRole === 'ReadOnly') {
                return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Export not permitted for ReadOnly users' }) };
            }

            const data = JSON.parse(event.body);
            if (!data.id)    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'id is required' }) };
            if (!data.scope) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'scope is required' }) };

            const table = SCOPE_TABLE[data.scope];
            if (!table) {
                return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: `Unknown scope: ${data.scope}` }) };
            }

            const format     = (data.format || 'CSV').toUpperCase();
            const t0         = Date.now();

            // Query all rows for this org scoped to the requested entity
            const rows = await db
                .select()
                .from(table)
                .where(eq(table.orgId, orgId));

            // Build the export payload
            let payload, contentType, ext;
            if (format === 'JSON') {
                payload     = JSON.stringify(rows, null, 2);
                contentType = 'application/json';
                ext         = 'json';
            } else {
                // Default to CSV
                payload     = rowsToCsv(rows);
                contentType = 'text/csv';
                ext         = 'csv';
            }

            const durationMs = Date.now() - t0;
            const sizeBytes  = Buffer.byteLength(payload, 'utf8');
            const name       = data.name || `Ad-hoc · ${data.scope} · ${new Date().toISOString().split('T')[0]}`;

            // Record the run
            const [run] = await db
                .insert(exportRuns)
                .values({
                    id:          data.id,
                    orgId,
                    scheduleId:  data.scheduleId || null,
                    name,
                    scope:       data.scope,
                    format,
                    triggeredBy: userId,
                    rowCount:    rows.length,
                    sizeBytes,
                    durationMs,
                    status:      'ok',
                })
                .returning();

            // Return the CSV/JSON as a base64-encoded download payload
            // The client will decode and trigger a browser download.
            return {
                statusCode: 200,
                headers: HEADERS,
                body: JSON.stringify({
                    run,
                    download: {
                        filename:    `accelerep-export-${data.scope}-${new Date().toISOString().split('T')[0]}.${ext}`,
                        contentType,
                        data:        Buffer.from(payload).toString('base64'),
                        rowCount:    rows.length,
                        sizeLabel:   fmtSize(sizeBytes),
                        durationMs,
                    },
                }),
            };
        }

        return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('export-runs error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
};
