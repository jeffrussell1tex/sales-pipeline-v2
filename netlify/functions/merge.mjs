import { db } from '../../db/index.js';
import {
    accounts, contacts, tasks, activities, opportunities,
    spiffClaims, dispatchCustomers, dispatchJobs, mergeLog,
} from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';

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

// Survivor fields a user can resolve for a contact merge. managers/directReports
// are org-chart arrays handled structurally (unioned), never via this map.
const CONTACT_FIELDS = [
    'prefix', 'firstName', 'middleName', 'lastName', 'suffix', 'nickName', 'title',
    'company', 'department', 'workLocation', 'email', 'personalEmail', 'phone',
    'mobile', 'address', 'address2', 'city', 'state', 'zip', 'country',
    'assistantName', 'homeAddress', 'notes', 'assignedRep', 'assignedTerritory',
    'doNotContact', 'buyerPersona',
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
            if (body.mergeLogId) {
                const [lg] = await db.select({ entityType: mergeLog.entityType }).from(mergeLog).where(and(eq(mergeLog.id, body.mergeLogId), eq(mergeLog.orgId, orgId)));
                if (lg?.entityType === 'contact') return await reverseContactMerge({ body, orgId, headers });
            }
            return await reverseAccountMerge({ body, orgId, headers });
        }

        // ── MERGE ─────────────────────────────────────────────────────────────
        const {
            entityType, survivorId, archivedId,
            resolvedFields = {}, survivorUpdatedAt, archivedUpdatedAt,
            performedBy = null,
        } = body;

        if (entityType === 'contact') {
            return await mergeContacts({ body, orgId, userId, headers });
        }
        if (entityType !== 'account') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unsupported entityType.' }) };
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
        return { statusCode: 500, headers, body: serverErrorBody(err, 'merge') };
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

// ── Contact merge ──────────────────────────────────────────────────────────────
// Contacts have no single name column (firstName/lastName) and no account FK
// (linked to accounts by company NAME). The new rewrite wrinkle vs accounts is
// JSONB references: opportunities.contactIds (array of ids) and every other
// contact's managers/directReports ({id,name} arrays). Those are rewritten per
// affected row, with each row's pre-merge array snapshotted for exact reversal.
async function mergeContacts({ body, orgId, userId, headers }) {
    const {
        survivorId, archivedId,
        resolvedFields = {}, survivorUpdatedAt, archivedUpdatedAt,
        performedBy = null,
    } = body;

    if (!survivorId || !archivedId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'survivorId and archivedId are required.' }) };
    if (survivorId === archivedId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cannot merge a record into itself.' }) };

    const [surv] = await db.select().from(contacts).where(and(eq(contacts.id, survivorId), eq(contacts.orgId, orgId)));
    const [arch] = await db.select().from(contacts).where(and(eq(contacts.id, archivedId), eq(contacts.orgId, orgId)));
    if (!surv) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Survivor contact not found.' }) };
    if (!arch) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contact to archive not found.' }) };
    if (arch.mergeArchived) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That record has already been merged.' }) };
    if (surv.mergeArchived) return { statusCode: 409, headers, body: JSON.stringify({ error: 'The survivor was archived by a prior merge — refresh and try again.' }) };

    const tsMatch = (current, sent) => !sent || new Date(current).getTime() === new Date(sent).getTime();
    if (!tsMatch(surv.updatedAt, survivorUpdatedAt) || !tsMatch(arch.updatedAt, archivedUpdatedAt)) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'One of these records changed since you opened the merge. Please re-open and review again.' }) };
    }

    const resolved = {};
    for (const f of CONTACT_FIELDS) if (f in resolvedFields) resolved[f] = resolvedFields[f];

    const nameOf = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.email || c.id;
    const survFirst = resolved.firstName != null ? resolved.firstName : surv.firstName;
    const survLast  = resolved.lastName  != null ? resolved.lastName  : surv.lastName;
    const survName  = [survFirst, survLast].filter(Boolean).join(' ').trim() || surv.email || surv.id;
    const archName  = nameOf(arch);

    const now = new Date();
    const rewrites = [];
    const ops = [];

    // 1) scalar id FK rewrites: tasks.contactId, activities.contactId
    const idTargets = [
        { name: 'tasks', table: tasks, column: 'contactId', col: tasks.contactId },
        { name: 'activities', table: activities, column: 'contactId', col: activities.contactId },
    ];
    for (const t of idTargets) {
        const found = await db.select({ id: t.table.id }).from(t.table).where(and(eq(t.col, archivedId), eq(t.table.orgId, orgId)));
        const ids = found.map(r => r.id);
        if (ids.length) {
            rewrites.push({ table: t.name, column: t.column, kind: 'id', ids, oldValue: archivedId, newValue: survivorId });
            ops.push(db.update(t.table).set({ [t.column]: survivorId, updatedAt: now }).where(and(eq(t.col, archivedId), eq(t.table.orgId, orgId))));
        }
    }

    // 2) opportunities.contactIds (jsonb array of ids) — per-row rewrite + dedupe
    const allOpps = await db.select().from(opportunities).where(eq(opportunities.orgId, orgId));
    const oppRows = [];
    for (const o of allOpps) {
        const arr = Array.isArray(o.contactIds) ? o.contactIds : [];
        if (!arr.includes(archivedId)) continue;
        const next = [];
        for (const id of arr) { const v = id === archivedId ? survivorId : id; if (!next.includes(v)) next.push(v); }
        oppRows.push({ id: o.id, old: arr, new: next });
        ops.push(db.update(opportunities).set({ contactIds: next, updatedAt: now }).where(and(eq(opportunities.id, o.id), eq(opportunities.orgId, orgId))));
    }
    if (oppRows.length) rewrites.push({ table: 'opportunities', column: 'contactIds', kind: 'jsonbArray', rows: oppRows });

    // 3) other contacts' managers/directReports ({id,name} arrays) — per-row rewrite
    const allContacts = await db.select().from(contacts).where(eq(contacts.orgId, orgId));
    const repointObjArr = (arr, ownerId) => {
        const list = Array.isArray(arr) ? arr : [];
        if (!list.some(x => x && x.id === archivedId)) return null;
        const out = []; const seen = new Set();
        for (const item of list) {
            if (!item || !item.id) continue;
            const it = item.id === archivedId ? { id: survivorId, name: survName } : item;
            if (it.id === ownerId) continue;   // drop self-reference
            if (seen.has(it.id)) continue;      // dedupe
            seen.add(it.id); out.push(it);
        }
        return out;
    };
    for (const c of allContacts) {
        if (c.id === archivedId || c.id === survivorId) continue; // survivor handled via union below
        for (const col of ['managers', 'directReports']) {
            const next = repointObjArr(c[col], c.id);
            if (next === null) continue;
            const entry = rewrites.find(r => r.table === 'contacts' && r.column === col && r.kind === 'jsonbObjArray');
            const row = { id: c.id, old: c[col] || [], new: next };
            if (entry) entry.rows.push(row);
            else rewrites.push({ table: 'contacts', column: col, kind: 'jsonbObjArray', rows: [row] });
            ops.push(db.update(contacts).set({ [col]: next, updatedAt: now }).where(and(eq(contacts.id, c.id), eq(contacts.orgId, orgId))));
        }
    }

    // 4) Survivor: resolved fields + unioned org-chart arrays (archived merged in).
    const unionObjArr = (a, b) => {
        const out = []; const seen = new Set();
        for (const item of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
            if (!item || !item.id) continue;
            const id = item.id === archivedId ? survivorId : item.id;
            if (id === survivorId) continue;   // survivor can't reference itself
            if (seen.has(id)) continue;
            seen.add(id); out.push(item);
        }
        return out;
    };
    const survSet = {
        ...resolved,
        firstName: survFirst, lastName: survLast,
        managers: unionObjArr(surv.managers, arch.managers),
        directReports: unionObjArr(surv.directReports, arch.directReports),
        updatedAt: now,
    };
    ops.push(db.update(contacts).set(survSet).where(and(eq(contacts.id, survivorId), eq(contacts.orgId, orgId))));

    // 5) Soft-archive the loser.
    ops.push(db.update(contacts).set({ mergeArchived: true, mergedIntoId: survivorId, archivedAt: now, updatedAt: now }).where(and(eq(contacts.id, archivedId), eq(contacts.orgId, orgId))));

    // 6) Reversible audit log.
    const logId = 'mrg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    ops.push(db.insert(mergeLog).values({
        id: logId, orgId, entityType: 'contact',
        survivorId, survivorName: survName, archivedId, archivedName: archName,
        rewrites, resolvedFields: resolved,
        survivorSnapshot: surv, archivedSnapshot: arch,
        status: 'merged', performedBy, performedById: userId,
    }));

    await db.batch(ops);

    const [updatedSurvivor] = await db.select().from(contacts).where(and(eq(contacts.id, survivorId), eq(contacts.orgId, orgId)));
    const summary = {};
    for (const r of rewrites) summary[r.table + '.' + r.column] = (r.ids ? r.ids.length : (r.rows ? r.rows.length : 0));

    return { statusCode: 200, headers, body: JSON.stringify({ contact: updatedSurvivor, archivedId, mergeLogId: logId, rewriteSummary: summary }) };
}

// ── Reverse a contact merge ─────────────────────────────────────────────────────
async function reverseContactMerge({ body, orgId, headers }) {
    const { mergeLogId } = body;
    if (!mergeLogId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'mergeLogId is required to reverse a merge.' }) };

    const [log] = await db.select().from(mergeLog).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId)));
    if (!log) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Merge record not found.' }) };
    if (log.status === 'reversed') return { statusCode: 409, headers, body: JSON.stringify({ error: 'This merge has already been reversed.' }) };
    if (log.entityType !== 'contact') return { statusCode: 400, headers, body: JSON.stringify({ error: 'Not a contact merge.' }) };

    const now = new Date();
    const ops = [];

    for (const rw of (log.rewrites || [])) {
        const table = TABLE_BY_NAME[rw.table];
        if (!table) continue;
        if (rw.kind === 'id' || rw.kind === 'name') {
            if (Array.isArray(rw.ids) && rw.ids.length) ops.push(db.update(table).set({ [rw.column]: rw.oldValue }).where(and(inArray(table.id, rw.ids), eq(table.orgId, orgId))));
        } else if (rw.kind === 'jsonbArray' || rw.kind === 'jsonbObjArray') {
            for (const row of (rw.rows || [])) ops.push(db.update(table).set({ [rw.column]: row.old }).where(and(eq(table.id, row.id), eq(table.orgId, orgId))));
        }
    }

    // Un-archive the loser.
    ops.push(db.update(contacts).set({ mergeArchived: false, mergedIntoId: null, archivedAt: null, updatedAt: now }).where(and(eq(contacts.id, log.archivedId), eq(contacts.orgId, orgId))));

    // Restore the survivor's merge-touched fields from its pre-merge snapshot.
    const snapS = log.survivorSnapshot || {};
    const restore = {
        updatedAt: now,
        firstName: snapS.firstName ?? null,
        lastName: snapS.lastName ?? null,
        managers: snapS.managers ?? [],
        directReports: snapS.directReports ?? [],
    };
    for (const k of Object.keys(log.resolvedFields || {})) {
        if (k === 'firstName' || k === 'lastName') continue;
        restore[k] = snapS[k] ?? null;
    }
    ops.push(db.update(contacts).set(restore).where(and(eq(contacts.id, log.survivorId), eq(contacts.orgId, orgId))));

    ops.push(db.update(mergeLog).set({ status: 'reversed', reversedAt: now }).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId))));

    await db.batch(ops);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, reversed: mergeLogId, restoredId: log.archivedId }) };
}
