import { db } from '../../db/index.js';
import {
    backups, backupSchedule,
    opportunities, accounts, contacts, leads, tasks, activities,
    users, settings as settingsTable, quotes, products, pipelines,
    dispatchTechnicians, dispatchVehicles, dispatchEquipment,
    dispatchCustomers, dispatchServiceLocations,
    dispatchJobs, dispatchJobLineItems, dispatchJobStatusHistory,
} from '../../db/schema.js';
import { eq, and, desc, getTableColumns } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody, auditAs, memberNamesOf } from './_lib.mjs';
// One name per member of an org (state §0.196).
import { restorableMembers, restoreNotes, droppedErrors } from '../../src/utils/memberName.js';
import { clearStrayLinks } from './_links.mjs';
import { invalidateRoster } from './_lib.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// The date columns of a table, read from its own columns (state §0.205 — Jeff, 15 Oct: "Fix both in 4b-2"): drizzle's
// mode-less timestamp() and date({ mode: 'date' }) — the columns whose write calls toISOString — and never a text column
// holding a date. A list by name missed seven — a member's team date, a quote's approval, sent and accepted dates, a
// merged account's and contact's archive date, a lead's score date — so the app's own backup dropped every row holding
// one, silently; and it made a Date of a job's invoice paid date, a text column, which then could not be stored.
const dateKeysOf = (table) => Object.entries(getTableColumns(table)).filter(([, c]) => c.dataType === 'date').map(([k]) => k);

// What a restore says of a table's rows the database would not take, of the rows it never answered for, and of the
// file's rows already here (state §0.205 — 15 Oct "Fix both in 4b-2", 16 Oct "Fix both"; the review). Never which
// organization holds a row: ids are global.
const refusedWords = (label, n) => `${label}: ${n} record${n === 1 ? '' : 's'} could not be restored — ${n === 1 ? 'it has' : 'each has'} a value that cannot be stored, or lacks one that is required.`;
const alreadyWords = (n) => (n === 1
    ? '1 record in the file was already here — a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and was left as it is.'
    : `${n} records in the file were already here — for each, a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and were left as they are.`);
// The rows not reached, said once for the restore (state §0.205 — the review; the re-check): the database did not
// answer for them, or did not take them for a reason of its own — any failure isRefusal (below) does not lay on the
// file's data: no answer, a timeout, a connection, its resources, or any other code. Only what is known is said: not
// that they were not written — an insert that landed while its answer was lost wrote its row — and not which of the
// two. Run again, a row written is already here and left as it is, and the rest are sent again.
const unreachedWords = (n) => `${n} record${n === 1 ? '' : 's'} may not have been written — the database did not answer, or did not take ${n === 1 ? 'it' : 'them'} for a reason of its own. Restore the file again: a record already here is left as it is.`;
// A row is the file's — refused (state §0.205 — the review) — only when it held a value the driver cannot encode (a
// TypeError, thrown as the query is built: a number in a date column) or the database refused its data: a Postgres code
// (SQLSTATE) of class 22, a data exception (a value of the wrong kind, too long, out of range), or 23, an integrity
// constraint (a value required and missing, a link to no row). The code rides the driver's error drizzle wraps (e.cause
// — @neondatabase/serverless sets it only on a 400, from the database's own answer) or the error itself. Any other
// failure says nothing of the row and is counted not reached: no code (a fetch that failed, a server error), a code
// about the database's own state — a connection (08), a transaction rolled back (40), its resources (53), an operator's
// intervention or a timeout (57), the system (58), an internal error (XX) — or any other code.
const isRefusal = (e) => e instanceof TypeError || ['22', '23'].includes(String(e?.cause?.code || e?.code || '').slice(0, 2));

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

// A snapshot's id (state §0.205 — Jeff, 16 Oct: "Fix now"): the minute it was taken, then 12 random hex characters.
// The id is the backups table's GLOBAL primary key (db/schema.ts), and it was the minute alone: a second backup in
// the same minute — by any org — answered 500, and an import's snapshot row was lost, its audit entry and its answer
// naming an id another org may hold. Nothing reads the date back out of an id: the list is ordered by createdAt.
function generateSnapId() {
    const now = new Date();
    const y  = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(now.getUTCDate()).padStart(2, '0');
    const h  = String(now.getUTCHours()).padStart(2, '0');
    const mi = String(now.getUTCMinutes()).padStart(2, '0');
    return `bk_snap_${y}_${mo}_${d}_${h}${mi}_${randomBytes(6).toString('hex')}`;
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
            await auditAs(orgId, userId, { action: 'backup.created', entityType: 'backup', entityId: snapId, entityName: 'Manual snapshot', detail: `${recordCount} records · ${formatSize(sizeBytes)}` });

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
                target: backupSchedule.id, setWhere: eq(backupSchedule.orgId, orgId),
                set: {
                    frequency:       frequency       || 'Daily',
                    timeUtc:         timeUtc         || '03:00',
                    retentionDays:   retentionDays != null ? Number(retentionDays) : 30,
                    notifyOnFailure: notifyOnFailure || '',
                    updatedAt:       new Date(),
                },
            });
            await auditAs(orgId, userId, { action: 'backup.schedule_set', entityType: 'backup', entityId: schedId, entityName: 'Backup schedule', detail: `${frequency || 'Daily'} at ${timeUtc || '03:00'} UTC · keep ${retentionDays != null ? Number(retentionDays) : 30} days` });

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

            // JSONB columns that must be stringified when coming in as arrays/objects
            const JSONB_KEYS = new Set([
                'serviceZones','skills','certifications','workingHours',
                'equipmentIds','tags','customFields',
                'equipment_ids','custom_fields',
            ]);
            // Lists of ids the link clean-up reads (state §0.201): stored as the lists they are — stringified,
            // a list landed as a jsonb string, which the clean-up cannot read — and one a file carries as a
            // string read back to its list.
            const ID_LISTS = new Set(['coTechIds', 'assignedEquipmentIds', 'co_tech_ids', 'assigned_equipment_ids']);

            // Stamp orgId, make each date column's text a Date (state §0.205: the table's own date columns), stringify JSONB arrays/objects
            const stamp = (table, rows) => (rows || []).map(r => {
                const out = { ...r, orgId };
                dateKeysOf(table).forEach(k => {
                    if (typeof out[k] === 'string') {
                        const d = new Date(out[k]);
                        out[k] = isNaN(d.getTime()) ? undefined : d;
                    }
                    // null stays null, Date stays Date; '' or text that is no date is left to the column — its default, or none (state §0.205); a number is left — refused, and said
                });
                JSONB_KEYS.forEach(k => {
                    if (k in out && (Array.isArray(out[k]) || (out[k] !== null && typeof out[k] === 'object'))) {
                        out[k] = JSON.stringify(out[k]);
                    }
                });
                ID_LISTS.forEach(k => {
                    if (typeof out[k] !== 'string') return;
                    try { const list = JSON.parse(out[k]); if (Array.isArray(list)) out[k] = list; } catch { /* kept as the file has it */ }
                });
                return out;
            });

            // The rows this restore inserted, by table — a row another org's id kept out is not one — for
            // the link clean-up after it (state §0.199, E4). Answers how many the insert wrote (state §0.205).
            const restored = new Map();
            const keepRestored = (table, rows) => {
                const ids = restored.get(table) || [];
                for (const r of rows || []) if (r && r.id) ids.push(r.id);
                restored.set(table, ids);
                return (rows || []).length;
            };
            // Each table's rows — sent, written, refused by the database, not reached (the database did not answer, or
            // did not take them for a reason of its own: isRefusal) — and the first cause of a refusal and of a row not
            // reached, for the function log only (state §0.205): the rest were already here.
            const tally = new Map();
            const firstCause = new Map();
            const firstMiss = new Map();

            const CHUNK = 50;
            async function upsertChunked(table, rows) {
                if (!rows || rows.length === 0) return 0;
                const stamped = stamp(table, rows);
                let count = 0;
                let refused = 0;
                let unreached = 0;
                for (let i = 0; i < stamped.length; i += CHUNK) {
                    const chunk = stamped.slice(i, i + CHUNK);
                    try {
                        // onConflictDoNothing: a row already here — its id (any org's), a number, an email, a login or a
                        // link token another row holds, or a settings row where this org has one — is left as it is; the
                        // insert answers only the rows it wrote, and only those count
                        count += keepRestored(table, await db.insert(table).values(chunk).onConflictDoNothing().returning({ id: table.id }));
                    } catch {
                        // Bulk failed — fall back row-by-row: a row the database refuses is counted, and said by its table;
                        // a row not reached — no answer, or a reason of the database's own — is counted apart: never the
                        // file's fault, never already here (§0.205)
                        for (const row of chunk) {
                            try {
                                count += keepRestored(table, await db.insert(table).values(row).onConflictDoNothing().returning({ id: table.id }));
                            } catch (e) {
                                if (!isRefusal(e)) {
                                    unreached++;
                                    if (!firstMiss.has(table)) firstMiss.set(table, e?.cause?.message || e?.message);
                                    continue;
                                }
                                refused++;
                                if (!firstCause.has(table)) firstCause.set(table, e?.cause?.message || e?.message);
                            }
                        }
                    }
                }
                tally.set(table, { sent: stamped.length, written: count, refused, unreached });
                return count;
            }

            // A restored settings row is THIS org's (state §0.161 — the cross-org audit).
            // Its id is the org's, never the file's: a file naming another org's id could
            // take that id before that org's first save, and every later save of theirs
            // would write nothing. And it carries no credential a file cannot prove is
            // this org's — the web form's token (another org's would make two rows carry
            // it) and the stored Anthropic key (one encryption key serves every org): the
            // form comes back turned off, the key is entered again. With settings unique
            // on org_id, a restore fills an org that has no settings row, and changes
            // nothing for one that has.
            const ownSettings = (rows) => rows.map(r => {
                const extra = r?.extra && typeof r.extra === 'object' && !Array.isArray(r.extra) ? { ...r.extra } : {};
                if (extra.webToLead && typeof extra.webToLead === 'object') extra.webToLead = { ...extra.webToLead, token: null, enabled: false };
                delete extra.anthropicApiKey;
                return { ...r, id: orgId, extra };
            });

            let imported = 0;
            const errs = [];
            // One name per member of an org (state §0.196): a member the file brings in
            // under a name a member here already has is restored numbered, "Pat Smith
            // (2)" — nobody can be asked mid-restore — and said so below once the row has
            // landed. A row whose id or address is blank or not text, or that no free
            // name is left for, is not restored, and is an error. Fails closed: names
            // that cannot be checked restore no member.
            const notes = [];
            let renamedMembers = [];
            if (Array.isArray(ents.users) && ents.users.length) {
                try { const own = restorableMembers(await memberNamesOf(orgId), ents.users); ents.users = own.rows; renamedMembers = own.renamed; errs.push(...droppedErrors(own.dropped)); }
                catch (e) { ents.users = []; console.warn('backup: the names of the members could not be read:', e.message); errs.push('users: not restored — the names of the members could not be checked. Try again.'); }
            }

            // A table's rows the database would not take, said by the table (state §0.205 — Jeff, 15 Oct: "Fix both in
            // 4b-2": they were dropped silently); the cause — the driver's words — to the function log only. Its rows the
            // database never answered for are said once for the restore, below. Each table's count of either is kept for
            // the audit row (notWritten): the window's answer is never stored.
            const notWritten = [];
            const sayRefused = (label, table) => {
                const u = tally.get(table)?.unreached || 0;
                const n = tally.get(table)?.refused || 0;
                if (n || u) notWritten.push({ label, refused: n, unreached: u });
                if (u) console.warn('backup: rows not reached', label, u, firstMiss.get(table));
                if (!n) return;
                errs.push(refusedWords(label, n));
                console.warn('backup: rows refused', label, n, firstCause.get(table));
            };

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
                try { imported += await upsertChunked(table, key === 'settings' ? ownSettings(rows) : rows); }
                catch (e) { errs.push(`${key}: ${e.message}`); }
                sayRefused(key, table);
            }
            // Members restored: this function's own roster and caller caches are dropped, as after any write of users in a
            // request (state §0.205 — _lib.mjs). Each other warm function's 30-second caches — another endpoint resolving
            // an owner by name — still miss them until they expire, as after every write of users.
            if (Array.isArray(ents.users) && ents.users.length) invalidateRoster(orgId);
            // A renamed member is reported only once its row is here — a row whose id
            // another org holds was skipped by the insert, and was never restored.
            if (renamedMembers.length) {
                try {
                    const landed = new Set((await memberNamesOf(orgId)).map((u) => u.id));
                    notes.push(...restoreNotes(renamedMembers.filter((m) => landed.has(m.id))));
                } catch { /* the restore stands; only its note is lost */ }
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
                    sayRefused(`dispatch.${key}`, table);
                }
            }

            // The rows not reached — the database did not answer for them, or did not take them for a reason of its own —
            // said once (state §0.205 — the review): an error — the snapshot 'partial', and a restore that wrote nothing
            // and found nothing already here a 500, as with any error — and counted in the answer (unreached, below).
            const missed = [...tally.values()].reduce((n, t) => n + t.unreached, 0);
            if (missed) errs.push(unreachedWords(missed));

            // The file's rows already here — the same id (any org's), a number, an email, a login or a link token a row holds,
            // or a settings row where this org has one; the insert leaves each as it is — are said apart, never counted as
            // restored (state §0.205 — Jeff, 16 Oct: "Fix both"): the rows sent, less those written, refused or not reached.
            const already = [...tally.values()].reduce((n, t) => n + t.sent - t.written - t.refused - t.unreached, 0);
            if (already) notes.push(alreadyWords(already));

            // On the rows it restored, every link that names no row of this org is cleared, and the answer says
            // how many; a file is never refused over a link (state §0.199, E4: "Clear stray links"; Dispatch's
            // links since §0.201). A job's customer, a quote's deal, a location's customer and a line item's or
            // a history entry's job are required: such rows are counted, not changed.
            let swept = null;
            try {
                swept = await clearStrayLinks(orgId, restored);
                if (swept.cleared) notes.push(`${swept.cleared} link${swept.cleared === 1 ? '' : 's'} that named no record of this organization ${swept.cleared === 1 ? 'was' : 'were'} cleared.`);
                if (swept.jobsWithoutCustomer) notes.push(`${swept.jobsWithoutCustomer} job${swept.jobsWithoutCustomer === 1 ? ' names' : 's name'} a customer that is not in this organization — a job's customer can't be cleared, so ${swept.jobsWithoutCustomer === 1 ? 'it was' : 'they were'} left as restored.`);
                if (swept.quotesWithoutDeal) notes.push(`${swept.quotesWithoutDeal} quote${swept.quotesWithoutDeal === 1 ? ' names' : 's name'} a deal that is not in this organization — a quote's deal can't be cleared, so ${swept.quotesWithoutDeal === 1 ? 'it was' : 'they were'} left as restored.`);
                if (swept.locationsWithoutCustomer) notes.push(`${swept.locationsWithoutCustomer} service location${swept.locationsWithoutCustomer === 1 ? ' names' : 's name'} a customer that is not in this organization — a location's customer can't be cleared, so ${swept.locationsWithoutCustomer === 1 ? 'it was' : 'they were'} left as restored.`);
                if (swept.lineItemsWithoutJob) notes.push(`${swept.lineItemsWithoutJob} job line item${swept.lineItemsWithoutJob === 1 ? ' names' : 's name'} a job that is not in this organization — a line item's job can't be cleared, so ${swept.lineItemsWithoutJob === 1 ? 'it was' : 'they were'} left as restored.`);
                if (swept.historyWithoutJob) notes.push(`${swept.historyWithoutJob} status-history entr${swept.historyWithoutJob === 1 ? 'y names' : 'ies name'} a job that is not in this organization — an entry's job can't be cleared, so ${swept.historyWithoutJob === 1 ? 'it was' : 'they were'} left as restored.`);
                if (swept.failed.length) errs.push(`links: not checked on ${swept.failed.join(', ')} — the restore stands, those links as the file had them.`);
                if (swept.shelfFailed) errs.push('equipment: the units whose holder was cleared could not be marked available — they show as checked out to no one. Set them to Available in Settings → Dispatch → Vehicles & equipment.');
            } catch (e) { errs.push(`links: not checked — ${e?.cause?.message || e?.message}`); }

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
            // A restore writes rows into every table it names — the most consequential
            // write an Admin can make, and the one the log must carry (§0.143).
            // The links it cleared and the rows it left are the log's too (§0.143), not only the answer's.
            const linkDetail = swept ? [
                swept.cleared ? `${swept.cleared} link${swept.cleared === 1 ? '' : 's'} cleared` : '',
                swept.jobsWithoutCustomer ? `${swept.jobsWithoutCustomer} job${swept.jobsWithoutCustomer === 1 ? '' : 's'} with a customer not in this org` : '',
                swept.quotesWithoutDeal ? `${swept.quotesWithoutDeal} quote${swept.quotesWithoutDeal === 1 ? '' : 's'} with a deal not in this org` : '',
                swept.locationsWithoutCustomer ? `${swept.locationsWithoutCustomer} location${swept.locationsWithoutCustomer === 1 ? '' : 's'} with a customer not in this org` : '',
                swept.lineItemsWithoutJob ? `${swept.lineItemsWithoutJob} line item${swept.lineItemsWithoutJob === 1 ? '' : 's'} with a job not in this org` : '',
                swept.historyWithoutJob ? `${swept.historyWithoutJob} history entr${swept.historyWithoutJob === 1 ? 'y' : 'ies'} with a job not in this org` : '',
            ].filter(Boolean).join(' · ') : '';
            // And which tables' rows were refused or not reached, each with its count (state §0.205 — the review): the
            // window's answer is never stored, so this row is the record that outlives it ("· refused: products 1").
            const rowsBy = (k) => notWritten.filter((t) => t[k]).map((t) => `${t.label} ${t[k]}`).join(', ');
            const rowDetail = [rowsBy('refused') && `refused: ${rowsBy('refused')}`, rowsBy('unreached') && `not reached: ${rowsBy('unreached')}`].filter(Boolean).join(' · ');
            await auditAs(orgId, userId, { action: 'backup.restored', entityType: 'backup', entityId: snapId, entityName: 'Restore from file', detail: `${imported} records imported${linkDetail ? ` · ${linkDetail}` : ''}${already ? ` · ${already} already here` : ''}${errs.length ? ` · ${errs.length} error${errs.length === 1 ? '' : 's'}` : ''}${rowDetail ? ` · ${rowDetail}` : ''}` });

            // The answer counts the rows not reached (state §0.205 — the re-check): with any, the restore may have
            // written records no count shows, so the window reloads the page on Close — on a 500 as on a 200.
            return {
                statusCode: errs.length && imported === 0 && !already ? 500 : 200,
                headers,
                body: JSON.stringify({ ok: imported > 0, imported, unreached: missed, errors: errs, notes, snapId }),
            };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Backup error:', err.message);
        console.error('Backup error stack:', err.stack);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'backup') };
    }
};
