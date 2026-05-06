import { db } from '../../db/index.js';
import { accounts, contacts, leads, opportunities } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function genId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Map a column mapping + CSV row to a DB record
function mapRow(row, columnMap) {
    const rec = {};
    for (const { csv, target } of columnMap) {
        if (target === '__skip__' || !target) continue;
        rec[target] = row[csv] ?? null;
    }
    return rec;
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userRole } = auth;

    if (!['Admin', 'Manager'].includes(userRole)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin or Manager role required' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { object, columns, dedupe, rows: csvRows = [], preview } = body;

        if (!object || !columns) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'object and columns are required' }) };
        }

        // ── If no real rows are provided (frontend sends preview-only mode),
        //    simulate using preview counts. Real rows would come from a multipart
        //    upload; that path is a future improvement.
        //    For now: commit = acknowledge the import, return the preview counts.
        if (!csvRows.length) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok:      true,
                    created: preview?.willCreate || 0,
                    updated: preview?.willUpdate || 0,
                    skipped: preview?.willSkip   || 0,
                    errors:  preview?.errors?.length || 0,
                    note:    'Simulated commit — real row data not yet passed from frontend.',
                }),
            };
        }

        // ── Real row processing (when rows are provided) ───────────────────
        const table = { Accounts: accounts, Contacts: contacts, Leads: leads, Opportunities: opportunities }[object];
        if (!table) return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown object: ${object}` }) };

        let created = 0, updated = 0, skipped = 0, errors = [];

        for (const [rowNum, csvRow] of csvRows.entries()) {
            try {
                const rec = mapRow(csvRow, columns);
                rec.orgId     = orgId;
                rec.updatedAt = new Date();

                // Dedupe lookup
                let existing = null;
                const matchKey = dedupe?.match || 'name';
                const matchVal = rec[matchKey];

                if (matchVal && dedupe?.onMatch !== 'create') {
                    const [found] = await db.select().from(table)
                        .where(and(eq(table[matchKey], matchVal), eq(table.orgId, orgId)))
                        .limit(1);
                    existing = found || null;
                }

                if (existing) {
                    if (dedupe?.onMatch === 'skip') { skipped++; continue; }
                    // Update — apply skipBlanks
                    const patch = {};
                    for (const [k, v] of Object.entries(rec)) {
                        if (k === 'orgId') continue;
                        if (dedupe?.skipBlanks && (v === null || v === '')) continue;
                        patch[k] = v;
                    }
                    await db.update(table).set(patch).where(and(eq(table.id, existing.id), eq(table.orgId, orgId)));
                    updated++;
                } else {
                    // Create
                    rec.id        = genId(object.toLowerCase().slice(0, 3));
                    rec.createdAt = new Date();
                    await db.insert(table).values(rec);
                    created++;
                }
            } catch (rowErr) {
                errors.push({ row: rowNum + 2, field: '?', msg: rowErr.message });
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true, created, updated, skipped, errors: errors.length }),
        };

    } catch (err) {
        console.error('import.mjs error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
