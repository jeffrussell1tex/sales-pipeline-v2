import { db } from '../../db/index.js';
import {
    accounts, contacts, tasks, activities, opportunities,
    spiffClaims, dispatchCustomers, dispatchJobs, mergeLog,
} from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

// ── Notes on atomicity ────────────────────────────────────────────────────────
// This project runs drizzle-orm/neon-http (@netlify/neon). That driver has NO
// interactive db.transaction(); instead we use db.batch([...]), which executes a
// fixed list of statements as a single server-side transaction (all-or-nothing).
// Pattern: read + snapshot the affected rows first (outside the batch, to build a
// reversible log), then commit every rewrite + soft-archive + log insert in ONE
// db.batch() call so a merge can never half-complete.

// Survivor fields a user is allowed to resolve in the merge modal. parentAccountId
// and the archive bookkeeping columns are handled structurally, never via this map.
const ACCOUNT_FIELDS = [
    'name', 'verticalMarket', 'industry', 'address', 'address2', 'city', 'state',
    'zip', 'country', 'website', 'phone', 'accountOwner', 'assignedRep',
    'assignedTerritory', 'accountTier', 'notes', 'doNotContact', 'customerTypes',
    'accountSegment', 'description', 'totalEmployees', 'annualRevenue',
    'fiscalYearEnd', 'foundedYear', 'linkedInUrl', 'sicCode', 'naicsCode',
];

// Lookup used by the reversal path to resolve a snapshotted table name back to its
// Drizzle table object.
const TABLE_BY_NAME = {
    tasks, activities, opportunities, spiffClaims, dispatchCustomers,
    dispatchJobs, accounts, contacts,
};

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    // Merge is destructive (rewrites FKs, archives a record) — gate to elevated roles.
    if (userRole !== 'Admin' && userRole !== 'Manager') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only admins and managers can merge records.' }) };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');

        // ── REVERSAL ──────────────────────────────────────────────────────────
        if (body.reverse) {
            return await reverseAccountMerge({ body, orgId, headers });
        }

        // ── MERGE ─────────────────────────────────────────────────────────────
        const {
            entityType, survivorId, archivedId,
            resolvedFields = {}, survivorUpdatedAt, archivedUpdatedAt,
            performedBy = null,
        } = body;

        if (entityType !== 'account') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only account merge is enabled in this phase. Contact merge is coming next.' }) };
        }
        if (!survivorId || !archivedId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'survivorId and archivedId are required.' }) };
        }
        if (survivorId === archivedId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot merge a record into itself.' }) };
        }

        const [surv] = await db.select().from(accounts).where(and(eq(accounts.id, survivorId), eq(accounts.orgId, orgId)));
        const [arch] = await db.select().from(accounts).where(and(eq(accounts.id, archivedId), eq(accounts.orgId, orgId)));
        if (!surv) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Survivor account not found.' }) };
        if (!arch) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Account to archive not found.' }) };
        if (arch.mergeArchived) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That record has already been merged.' }) };
        if (surv.mergeArchived) return { statusCode: 409, headers, body: JSON.stringify({ error: 'The survivor was archived by a prior merge — refresh and try again.' }) };

        // Optimistic lock — reject if either record changed since the modal opened.
        const tsMatch = (current, sent) => !sent || new Date(current).getTime() === new Date(sent).getTime();
        if (!tsMatch(surv.updatedAt, survivorUpdatedAt) || !tsMatch(arch.updatedAt, archivedUpdatedAt)) {
            return { statusCode: 409, headers, body: JSON.stringify({ error: 'One of these records changed since you opened the merge. Please re-open and review again.' }) };
        }

        // Resolve the surviving field values (whitelist only).
        const resolved = {};
        for (const f of ACCOUNT_FIELDS) if (f in resolvedFields) resolved[f] = resolvedFields[f];
        const oldSurvName = surv.name;
        const survName = (resolved.name != null && String(resolved.name).trim()) ? resolved.name : oldSurvName;
        const archName = arch.name;

        // Name-string references that should now point at the surviving name.
        const nameOldValues = [archName];
        if (survName !== oldSurvName) nameOldValues.push(oldSurvName);

        // ── Snapshot affected rows (reads — build the reversible log) ──────────
        const rewrites = [];

        const snapIds = async (table, predicate) => {
            const rows = await db.select({ id: table.id }).from(table).where(predicate);
            return rows.map(r => r.id);
        };

        // id-based FK rewrites: archived id -> survivor id
        const idTargets = [
            { name: 'tasks', table: tasks, column: 'accountId', col: tasks.accountId },
            { name: 'activities', table: activities, column: 'accountId', col: activities.accountId },
            { name: 'dispatchCustomers', table: dispatchCustomers, column: 'accountId', col: dispatchCustomers.accountId },
            { name: 'dispatchJobs', table: dispatchJobs, column: 'accountId', col: dispatchJobs.accountId },
        ];
        for (const t of idTargets) {
            const ids = await snapIds(t.table, and(eq(t.col, archivedId), eq(t.table.orgId, orgId)));
            if (ids.length) rewrites.push({ table: t.name, column: t.column, kind: 'id', ids, oldValue: archivedId, newValue: survivorId });
        }

        // Re-parent the archived account's children onto the survivor.
        const childIds = await snapIds(accounts, and(eq(accounts.parentAccountId, archivedId), eq(accounts.orgId, orgId)));
        if (childIds.length) rewrites.push({ table: 'accounts', column: 'parentAccountId', kind: 'id', ids: childIds, oldValue: archivedId, newValue: survivorId });

        // name-based references: rewrite each old name value separately so reversal is exact.
        const nameTargets = [
            { name: 'opportunities', table: opportunities, column: 'account', col: opportunities.account },
            { name: 'spiffClaims', table: spiffClaims, column: 'account', col: spiffClaims.account },
            { name: 'contacts', table: contacts, column: 'company', col: contacts.company },
        ];
        for (const t of nameTargets) {
            for (const oldVal of nameOldValues) {
                if (oldVal == null) continue;
                const ids = await snapIds(t.table, and(eq(t.col, oldVal), eq(t.table.orgId, orgId)));
                if (ids.length) rewrites.push({ table: t.name, column: t.column, kind: 'name', ids, oldValue: oldVal, newValue: survName });
            }
        }

        // ── Build the atomic batch ─────────────────────────────────────────────
        const now = new Date();
        const ops = [];

        ops.push(db.update(tasks).set({ accountId: survivorId, updatedAt: now }).where(and(eq(tasks.accountId, archivedId), eq(tasks.orgId, orgId))));
        ops.push(db.update(activities).set({ accountId: survivorId, updatedAt: now }).where(and(eq(activities.accountId, archivedId), eq(activities.orgId, orgId))));
        ops.push(db.update(dispatchCustomers).set({ accountId: survivorId, updatedAt: now }).where(and(eq(dispatchCustomers.accountId, archivedId), eq(dispatchCustomers.orgId, orgId))));
        ops.push(db.update(dispatchJobs).set({ accountId: survivorId, updatedAt: now }).where(and(eq(dispatchJobs.accountId, archivedId), eq(dispatchJobs.orgId, orgId))));
        ops.push(db.update(accounts).set({ parentAccountId: survivorId, updatedAt: now }).where(and(eq(accounts.parentAccountId, archivedId), eq(accounts.orgId, orgId))));

        ops.push(db.update(opportunities).set({ account: survName, updatedAt: now }).where(and(inArray(opportunities.account, nameOldValues), eq(opportunities.orgId, orgId))));
        ops.push(db.update(spiffClaims).set({ account: survName, updatedAt: now }).where(and(inArray(spiffClaims.account, nameOldValues), eq(spiffClaims.orgId, orgId))));
        ops.push(db.update(contacts).set({ company: survName, updatedAt: now }).where(and(inArray(contacts.company, nameOldValues), eq(contacts.orgId, orgId))));

        // Apply resolved field values to the survivor (+ name, + cycle-safe parent).
        const survSet = { ...resolved, name: survName, updatedAt: now };
        delete survSet.parentAccountId; // never resolved via the field map
        if (surv.parentAccountId === archivedId) survSet.parentAccountId = arch.parentAccountId || null;
        ops.push(db.update(accounts).set(survSet).where(and(eq(accounts.id, survivorId), eq(accounts.orgId, orgId))));

        // Soft-archive the loser (kept for restore; reports filter mergeArchived=false).
        ops.push(db.update(accounts).set({ mergeArchived: true, mergedIntoId: survivorId, archivedAt: now, updatedAt: now }).where(and(eq(accounts.id, archivedId), eq(accounts.orgId, orgId))));

        // Reversible audit log.
        const logId = 'mrg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        ops.push(db.insert(mergeLog).values({
            id: logId,
            orgId,
            entityType: 'account',
            survivorId,
            survivorName: survName,
            archivedId,
            archivedName: archName,
            rewrites,
            resolvedFields: resolved,
            survivorSnapshot: surv,
            archivedSnapshot: arch,
            status: 'merged',
            performedBy,
            performedById: userId,
        }));

        await db.batch(ops);

        const [updatedSurvivor] = await db.select().from(accounts).where(and(eq(accounts.id, survivorId), eq(accounts.orgId, orgId)));
        const summary = rewrites.reduce((acc, r) => { acc[r.table] = (acc[r.table] || 0) + r.ids.length; return acc; }, {});

        return { statusCode: 200, headers, body: JSON.stringify({ account: updatedSurvivor, archivedId, mergeLogId: logId, rewriteSummary: summary }) };
    } catch (err) {
        console.error('Merge error:', err.message);
        console.error('Merge error stack:', err.stack);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, detail: err.stack?.split('\n')[0] }) };
    }
};

// ── Reversal ──────────────────────────────────────────────────────────────────
// Reverses every snapshotted FK / name rewrite to its pre-merge value, un-archives
// the loser, and restores the survivor's merge-touched fields from its snapshot.
// Caveat: field-level restore of the survivor (name + the keys that were resolved)
// will override any later manual edit to those same fields — acceptable for undo.
async function reverseAccountMerge({ body, orgId, headers }) {
    const { mergeLogId } = body;
    if (!mergeLogId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'mergeLogId is required to reverse a merge.' }) };

    const [log] = await db.select().from(mergeLog).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId)));
    if (!log) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Merge record not found.' }) };
    if (log.status === 'reversed') return { statusCode: 409, headers, body: JSON.stringify({ error: 'This merge has already been reversed.' }) };
    if (log.entityType !== 'account') return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only account merges can be reversed in this phase.' }) };

    const now = new Date();
    const ops = [];

    for (const rw of (log.rewrites || [])) {
        const table = TABLE_BY_NAME[rw.table];
        if (!table || !Array.isArray(rw.ids) || rw.ids.length === 0) continue;
        ops.push(db.update(table).set({ [rw.column]: rw.oldValue }).where(and(inArray(table.id, rw.ids), eq(table.orgId, orgId))));
    }

    // Un-archive the loser.
    ops.push(db.update(accounts).set({ mergeArchived: false, mergedIntoId: null, archivedAt: null, updatedAt: now }).where(and(eq(accounts.id, log.archivedId), eq(accounts.orgId, orgId))));

    // Restore the survivor's merge-touched fields from its pre-merge snapshot.
    const snapS = log.survivorSnapshot || {};
    const restore = { updatedAt: now, name: snapS.name, parentAccountId: snapS.parentAccountId ?? null };
    for (const k of Object.keys(log.resolvedFields || {})) {
        if (k === 'name' || k === 'parentAccountId') continue;
        restore[k] = snapS[k] ?? null;
    }
    ops.push(db.update(accounts).set(restore).where(and(eq(accounts.id, log.survivorId), eq(accounts.orgId, orgId))));

    ops.push(db.update(mergeLog).set({ status: 'reversed', reversedAt: now }).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId))));

    await db.batch(ops);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, reversed: mergeLogId, restoredId: log.archivedId }) };
}
