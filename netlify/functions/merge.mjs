import { db } from '../../db/index.js';
import {
    accounts, contacts, tasks, activities, opportunities,
    spiffClaims, dispatchCustomers, dispatchJobs, mergeLog,
} from '../../db/schema.js';
import { eq, and, or, isNull, inArray, desc, sql, getTableColumns } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';
import { UNDO_CHANGED, undoRefusal, upIdOf, orgChartUnion, survivorRestore, undoPlaces, dealsByIdOf, survivorRowsOf, undoKept, undoDetail } from '../../src/utils/mergeUndo.js';
import { rankOf } from '../../src/utils/accountParent.js';

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

// The survivor's owner id when a merge resolves its owner name (state §0.193): the
// owner id of the record whose name was kept — the archived one's when its name
// won, else the survivor's own. A merge wrote the name and left the id, and a save
// that keeps the name keeps the owner, so the screen named one owner and another
// held the record.
// The merge screens send only the archived record's value; a name that is neither
// record's is refused rather than paired with an owner it never had.
const mergedOwnerId = (key, resolved, surv, arch) => {
    const name = String(resolved[key] ?? '');
    if (!name.trim()) return { ownerId: null };                                         // no owner kept
    if (name === String(surv[key] ?? '')) return { ownerId: surv.ownerId ?? null };     // the survivor's (or both records')
    if (name === String(arch[key] ?? '')) return { ownerId: arch.ownerId ?? null };     // the archived record's won
    return { error: 'The owner must be one of the two records being merged.' };
};

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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        // ── PAST MERGES (state §0.207) — after the role gate above: Admins and Managers ──
        if (event.httpMethod === 'GET') return await listMerges({ event, orgId, headers });

        const body = JSON.parse(event.body || '{}');

        // ── REVERSAL ──────────────────────────────────────────────────────────
        if (body.reverse) {
            if (body.mergeLogId) {
                const [lg] = await db.select({ entityType: mergeLog.entityType }).from(mergeLog).where(and(eq(mergeLog.id, body.mergeLogId), eq(mergeLog.orgId, orgId)));
                if (lg?.entityType === 'contact') return await reverseContactMerge({ body, orgId, userId, headers });
            }
            return await reverseAccountMerge({ body, orgId, userId, headers });
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
        // The owner id with the owner name (§0.193), decided before anything is written.
        const owner = 'accountOwner' in resolved ? mergedOwnerId('accountOwner', resolved, surv, arch) : null;
        if (owner?.error) return { statusCode: 400, headers, body: JSON.stringify({ error: owner.error }) };
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
            // A deal keeps the account picked, by id (state §0.198); a merge moves it with the
            // tasks and activities, and its undo moves it back, with its account's name, while it
            // still names the survivor (D14: "Yes, in batch 1"; state §0.207).
            { name: 'opportunities', table: opportunities, column: 'accountId', col: opportunities.accountId },
        ];
        for (const t of idTargets) {
            const ids = await snapIds(t.table, and(eq(t.col, archivedId), eq(t.table.orgId, orgId)));
            if (ids.length) rewrites.push({ table: t.name, column: t.column, kind: 'id', ids, oldValue: archivedId, newValue: survivorId });
        }

        // Re-parent the archived account's children onto the survivor — each one's tier logged as it stood (state §0.207;
        // the re-check, 17 Oct): an Undo puts one back under the record merged away whatever its rank only at that tier
        // (mergeUndo.js undoPlaces).
        const kids = await db.select({ id: accounts.id, accountTier: accounts.accountTier }).from(accounts).where(and(eq(accounts.parentAccountId, archivedId), eq(accounts.orgId, orgId)));
        const childIds = kids.map((k) => k.id);
        if (childIds.length) rewrites.push({ table: 'accounts', column: 'parentAccountId', kind: 'id', ids: childIds, oldValue: archivedId, newValue: survivorId, tiers: Object.fromEntries(kids.map((k) => [k.id, k.accountTier ?? null])) });

        // name-based references: rewrite each old name value separately, so an undo puts each back by its own value.
        // A deal carries the account's id since §0.198, so its name is rewritten only where it
        // is one of the two accounts' — the archived one's (which this batch moves to the
        // survivor first) or the survivor's — or names no account by id: merging one of two
        // same-named accounts (UKG's "Shell - Port Allen" twins) no longer renames the other
        // twin's deals, which would keep that twin's id under the survivor's name.
        const dealsOfMerge = () => or(isNull(opportunities.accountId), inArray(opportunities.accountId, [archivedId, survivorId]));
        const nameTargets = [
            { name: 'opportunities', table: opportunities, column: 'account', col: opportunities.account, scope: dealsOfMerge },
            { name: 'spiffClaims', table: spiffClaims, column: 'account', col: spiffClaims.account },
            { name: 'contacts', table: contacts, column: 'company', col: contacts.company },
        ];
        for (const t of nameTargets) {
            for (const oldVal of nameOldValues) {
                if (oldVal == null) continue;
                const ids = await snapIds(t.table, and(eq(t.col, oldVal), eq(t.table.orgId, orgId), ...(t.scope ? [t.scope()] : [])));
                // A deal's or contact's: which of them stood on the survivor by id (state §0.207; the re-check, 17 Oct) —
                // where their id puts them, which an Undo never renames back; one by name alone found there at an Undo
                // was linked since, and is counted kept (mergeUndo.js survivorRowsOf).
                if (ids.length) rewrites.push({ table: t.name, column: t.column, kind: 'name', ids, oldValue: oldVal, newValue: survName,
                    ...(t.table.accountId ? { onSurvivor: await snapIds(t.table, and(inArray(t.table.id, ids), eq(t.table.orgId, orgId), eq(t.table.accountId, survivorId))) } : {}) });
            }
        }

        // D22 (Jeff, 11 Oct: "Move them up"): a merge moves up the deals it would leave on a site —
        // by id; by name only where no other account has the name — except into a site with no live
        // account above it. A merge into a site (the
        // survivor's tier once merged) moves the merged-away account's deals — by its id, or by
        // its name where a deal has no id and no account but these two has the name — up to the
        // live account the site stands under, under that account's name, Site Name the site, in
        // this same batch. The log keeps each one's account, id and Site Name as they were, after
        // every other rewrite, so the undo puts them back last, each still where this put it (§0.207). A site with no live
        // account above it keeps them: there is nothing to move them up to.
        const survTier = 'accountTier' in resolved ? resolved.accountTier : surv.accountTier;
        const upId = surv.parentAccountId === archivedId ? (arch.parentAccountId || null) : (surv.parentAccountId || null);
        const [up] = survTier === 'site' && upId
            ? await db.select({ id: accounts.id, name: accounts.name, mergeArchived: accounts.mergeArchived }).from(accounts).where(and(eq(accounts.id, upId), eq(accounts.orgId, orgId)))
            : [];
        let lifted = [];
        if (up && up.mergeArchived !== true) {
            const named = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.name, archName), eq(accounts.orgId, orgId)));
            const byName = named.every((a) => a.id === archivedId || a.id === survivorId);
            lifted = await db.select({ id: opportunities.id, accountId: opportunities.accountId, account: opportunities.account, site: opportunities.site })
                .from(opportunities)
                .where(and(eq(opportunities.orgId, orgId), byName
                    ? or(eq(opportunities.accountId, archivedId), and(isNull(opportunities.accountId), eq(opportunities.account, archName)))
                    : eq(opportunities.accountId, archivedId)));
            if (lifted.length) rewrites.push({ table: 'opportunities', column: 'accountId', kind: 'lift', ids: lifted.map((d) => d.id), rows: lifted.map((d) => ({ id: d.id, old: { accountId: d.accountId ?? null, account: d.account ?? null, site: d.site ?? null } })) });
        }

        // ── Build the atomic batch ─────────────────────────────────────────────
        const now = new Date();
        const ops = [];

        ops.push(db.update(tasks).set({ accountId: survivorId, updatedAt: now }).where(and(eq(tasks.accountId, archivedId), eq(tasks.orgId, orgId))));
        ops.push(db.update(activities).set({ accountId: survivorId, updatedAt: now }).where(and(eq(activities.accountId, archivedId), eq(activities.orgId, orgId))));
        ops.push(db.update(dispatchCustomers).set({ accountId: survivorId, updatedAt: now }).where(and(eq(dispatchCustomers.accountId, archivedId), eq(dispatchCustomers.orgId, orgId))));
        ops.push(db.update(dispatchJobs).set({ accountId: survivorId, updatedAt: now }).where(and(eq(dispatchJobs.accountId, archivedId), eq(dispatchJobs.orgId, orgId))));
        ops.push(db.update(opportunities).set({ accountId: survivorId, updatedAt: now }).where(and(eq(opportunities.accountId, archivedId), eq(opportunities.orgId, orgId))));
        ops.push(db.update(accounts).set({ parentAccountId: survivorId, updatedAt: now }).where(and(eq(accounts.parentAccountId, archivedId), eq(accounts.orgId, orgId))));

        ops.push(db.update(opportunities).set({ account: survName, updatedAt: now }).where(and(inArray(opportunities.account, nameOldValues), eq(opportunities.orgId, orgId), dealsOfMerge())));
        ops.push(db.update(spiffClaims).set({ account: survName, updatedAt: now }).where(and(inArray(spiffClaims.account, nameOldValues), eq(spiffClaims.orgId, orgId))));
        ops.push(db.update(contacts).set({ company: survName, updatedAt: now }).where(and(inArray(contacts.company, nameOldValues), eq(contacts.orgId, orgId))));
        // D22: the merged-away account's deals, on a site now, moved up — after the id and name
        // rewrites above, so this is what they hold.
        if (lifted.length) ops.push(db.update(opportunities).set({ accountId: up.id, account: up.name, site: survName, updatedAt: now }).where(and(inArray(opportunities.id, lifted.map((d) => d.id)), eq(opportunities.orgId, orgId))));

        // Apply resolved field values to the survivor (+ name, + cycle-safe parent).
        const survSet = { ...resolved, name: survName, updatedAt: now };
        if (owner) survSet.ownerId = owner.ownerId;   // the id with the name (§0.193)
        delete survSet.parentAccountId; // never resolved via the field map
        if (surv.parentAccountId === archivedId) survSet.parentAccountId = arch.parentAccountId || null;
        // Lifted to the top level (it stood under the account merged away, which stood at the top),
        // the survivor is an account — the only tier that fits there (D21) — so the deals it takes
        // are not left on a site; the undo puts its stored parent and tier back while it holds these, the house parent
        // rule lets it, and no deal stands on it (undoPlaces — Jeff, 18 Oct: "Leave such deals and count them": it stays
        // an account, its deals where they are, counted; state §0.198, §0.207; the server critic, 12 Oct: a top-level
        // account merged into its own site left the site at the top, its deals on it).
        if (surv.parentAccountId === archivedId && !arch.parentAccountId) survSet.accountTier = 'account';
        ops.push(db.update(accounts).set(survSet).where(and(eq(accounts.id, survivorId), eq(accounts.orgId, orgId))));

        // Soft-archive the loser (kept for its Undo; no screen, report or public-API answer lists a merged-away row —
        // state §0.210; guide §18b101).
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
        // The merge log is the undo record; the audit log is the who-did-what record (§0.143).
        await auditAs(orgId, userId, { action: 'account.merged', entityType: 'account', entityId: survivorId, entityName: survName, detail: `${archName} merged in · ${Object.values(summary).reduce((a, n) => a + n, 0)} references repointed · undo ${logId}` });

        return { statusCode: 200, headers, body: JSON.stringify({ account: updatedSurvivor, archivedId, mergeLogId: logId, rewriteSummary: summary }) };
    } catch (err) {
        console.error('Merge error:', err.message);
        console.error('Merge error stack:', err.stack);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'merge') };
    }
};

// ── Undo (state §0.207) ───────────────────────────────────────────────────────
// A merge's Undo (Jeff, 16 Oct: "Undo as its own batch next"; 17 Oct: "Undo, cleanup, profile") puts back what the
// merge changed that still holds what the merge wrote — each logged link that still names the survivor, each deal
// moved up (D22) still on the account above the site, each survivor field the merge wrote that nobody has edited
// since (survivorRestore) — un-archives the record merged away, and keeps what changed since, counted in its answer
// (Q3: "Keep later edits"). A deal comes back with its account's own name beside its id, and the survivor's own
// name, put back, is its deals' and contacts' again, as the accounts PUT's rename makes it (Q3: a deal's account id
// and account name always move together). A contact's company comes back by name only while the contact is not linked
// to the survivor by id, and a deal the merge moved up only by its lift: one linked to the survivor since keeps it,
// counted kept (the re-check, 17 Oct; contacts follow the deals' rule — Jeff, 18 Oct: "Yes, both"). Refused (409),
// writing nothing, when the merge was undone already, either record was deleted since, the survivor was merged into
// another record since, or the record merged away is no longer merged into the survivor (undoRefusal; Q4: "Undo
// refuses and explains"): the reverse moved links back to a deleted record, or pulled a later merge's rows back
// (OPEN_ITEMS §4.7). No age limit (Q2). A merge logged before this batch undoes as safely, its kept count perhaps off
// (Jeff, 18 Oct: "Accept the limits").
//
// What would break the house parent rule if put back — a loop, an account under a site, a row under the record merged
// away it does not rank above — stays where it stands, kept and counted the same way, never refusing the whole Undo
// (undoPlaces; the review and the re-check, 17 Oct; Jeff, 18 Oct: "Yes, both"). And no deal is ever put on a site
// (Jeff, 18 Oct: "Leave such deals and count them" — the account keeps its current level, the deal stays where it is,
// and it is counted): a survivor that would go back a site while a deal stands on it by id keeps its place, each
// such deal counted (undoPlaces held; noDealOn asks again in its statement), and no deal goes back to the record
// merged away while that is a site — by its id, by its lift, or (a deal with no account id) by its name (notASite;
// the re-check, 18 Oct) — each stays where it stands, counted.
//
// One batch — one transaction, all or nothing (drizzle neon-http's batch is the driver's transaction). Its first two
// statements write and assert at once: the claim (the log, from merged to undone) and the un-archive (the record
// merged away, live again, only while it is merged into this survivor) each abort the whole batch unless they wrote
// their row, and hold that row's lock from then on. So two Undos of one merge sent together: the second waits on the
// first's claim, then writes nothing (409). A delete of the record merged away that lands before this batch reaches
// it: nothing written (409); one that comes after waits for it, then deletes the record live. Each link restore writes
// only a row that still holds what the merge wrote, and the survivor's restore only the survivor as read, so whatever
// changes while the batch runs is kept. The survivor's name cascade writes every deal and contact linked to it by id,
// whatever they hold, as the accounts PUT's rename does — only while the survivor stands (the review, 17 Oct: deleted
// while the batch ran, its name is none). The parent rule is met on the org's accounts as read before the batch, as a
// delete's Undo meets it (restorePlace); in the batch, the record merged away must stand where that read found it
// (asserted after the un-archive, which holds its row), and nothing may stand under the survivor that would not rank
// below a tier it gets back. An account above the record merged away moved while the batch runs is not asked again.

// The two records of a log as they stand now in this org — the survivor with its last-edited time as text, which
// its restore compares (never a Date: the driver reads it in the function's own time zone) — and the record the
// survivor was merged into since, when it was.
const undoRowsOf = async (table, log, orgId) => {
    const rows = await db.select({ ...getTableColumns(table), updatedAtText: sql`${table.updatedAt}::text` })
        .from(table).where(and(eq(table.orgId, orgId), inArray(table.id, [log.archivedId, log.survivorId])));
    const archived = rows.find((r) => r.id === log.archivedId);
    const survivor = rows.find((r) => r.id === log.survivorId);
    const [survivorInto] = survivor?.mergeArchived === true && survivor.mergedIntoId
        ? await db.select().from(table).where(and(eq(table.id, survivor.mergedIntoId), eq(table.orgId, orgId)))
        : [];
    return { archived, survivor, survivorInto };
};

// The org's accounts as the parent rule reads them (accounts.mjs orgTreeOf): what an account merge's Undo puts back
// under the record merged away meets the rule on them (undoPlaces).
const treeOf = (orgId) => db.select({
    id: accounts.id, name: accounts.name, parentAccountId: accounts.parentAccountId,
    accountTier: accounts.accountTier, mergeArchived: accounts.mergeArchived,
}).from(accounts).where(eq(accounts.orgId, orgId));

// The deals on an account by its id, in this org: an account merge's Undo reads the survivor's — a deal on it keeps
// it from going back a site (undoPlaces; Jeff, 18 Oct: "Leave such deals and count them").
const dealsOn = async (id, orgId) => (await db.select({ id: opportunities.id }).from(opportunities)
    .where(and(eq(opportunities.accountId, id), eq(opportunities.orgId, orgId)))).map((d) => d.id);

// A column as read: none read as none.
const asRead = (col, v) => (v == null ? isNull(col) : eq(col, v));

// Nothing stands under the survivor that would not rank below the tier it gets back — restorePlace's check, asked again
// in the survivor's own statement (the review, 17 Oct; a tier the rule does not know reads as an account): an account
// added under it while the Undo ran keeps the survivor where it stands, every field kept (undoKept). By then the
// children restore has moved the merge's own back.
const nothingUnder = (id, tier, orgId) => sql`not exists (select 1 from ${accounts} where ${accounts.parentAccountId} = ${id} and ${accounts.orgId} = ${orgId} and ${accounts.id} <> ${id} and (case ${accounts.accountTier} when 'business_unit' then 1 when 'site' then 2 else 0 end) <= ${sql.raw(String(rankOf(tier) ?? 0))})`;

// The survivor stands, in this org (the review, 17 Oct): nothing holds its row until its own restore writes it, and a
// survivor deleted while the batch ran has no name — its cascade then writes nothing.
const standsNow = (id, orgId) => sql`exists (select 1 from ${accounts} where ${accounts.id} = ${id} and ${accounts.orgId} = ${orgId})`;

// No deal stands on the survivor by id — asked in its own statement when it gets back a site's tier (Jeff, 18 Oct: an
// Undo never puts a deal on a site): a deal linked to it while the Undo ran keeps it where it stands, every field kept
// (undoKept), as nothingUnder does. By then the deal id restore has moved the merge's own back.
const noDealOn = (id, orgId) => sql`not exists (select 1 from ${opportunities} where ${opportunities.accountId} = ${id} and ${opportunities.orgId} = ${orgId})`;

// The record merged away is no site — asked in each statement that moves a deal back to it: the deal id restore, its
// lift, and the name restore of the deals by name alone the merge renamed from its name (Jeff, 18 Oct; the re-check,
// 18 Oct): one a site, at the merge or made one since, keeps them where they stand, each counted kept. The un-archive
// holds its row, in this org, from the batch's second statement on, so its tier is as each of these reads it.
const notASite = (id, orgId) => sql`exists (select 1 from ${accounts} where ${accounts.id} = ${id} and ${accounts.orgId} = ${orgId} and ${accounts.accountTier} is distinct from 'site')`;

// A write that aborts the Undo's whole batch (1 / 0: 22012) unless it wrote its row — inside the batch's own
// transaction, so the row stays locked by it until the batch ends.
const writesItsRow = (write) => db.execute(sql`with w as ${write} select 1 / count(*) from w`);

// An account's name as it stands inside the Undo's batch: a deal moved back by its id takes its account's own name
// (opportunities.mjs:154-155), and a survivor's deals and contacts take its name as the accounts PUT's rename does.
const nameNow = (id, orgId) => sql`(select ${accounts.name} from ${accounts} where ${accounts.id} = ${id} and ${accounts.orgId} = ${orgId})`;

// An account merge's links, in log order — ids, children, names, then the lift — each back where it still holds what
// the merge wrote: a deal the merge moved up by its lift alone. restores gets what each statement names and its place
// in the batch, to count what it left. subs: the sub-accounts the parent rule puts back (undoPlaces).
const accountRestores = (log, orgId, now, ops, restores, subs) => {
    const upId = upIdOf(log);
    const lifted = new Set((log.rewrites || []).filter((r) => r.kind === 'lift').flatMap((r) => r.ids || []));
    for (const rw of (log.rewrites || [])) {
        const table = TABLE_BY_NAME[rw.table];
        if (!table || !Array.isArray(rw.ids) || rw.ids.length === 0) continue;
        // D22: each deal a merge into a site moved up, back to the account, id and Site Name it had — the log's last
        // rewrite, so it is what stands — while it is still on the account above the site, under the site; one moved
        // up from the account merged away takes that account's name as it stands now — while the account merged away is
        // no site (notASite — Jeff, 18 Oct: an Undo never puts a deal on a site; one that stays is counted kept). Only
        // here: the deal id restore never writes one.
        if (rw.kind === 'lift') {
            for (const row of (rw.rows || [])) {
                const fromArchived = row.old?.accountId === log.archivedId;
                restores.push({ table: rw.table, ids: [row.id], at: ops.length });
                ops.push(db.update(table).set({ accountId: row.old?.accountId ?? null, account: fromArchived ? nameNow(log.archivedId, orgId) : (row.old?.account ?? null), site: row.old?.site ?? null, updatedAt: now })
                    .where(and(eq(table.id, row.id), eq(table.orgId, orgId), eq(table.accountId, upId), eq(table.site, log.survivorName), notASite(log.archivedId, orgId)))
                    .returning({ id: table.id }));
            }
            continue;
        }
        // Each row the merge moved, back where it still holds what the merge wrote. Never the survivor's own parent:
        // the merge wrote it again after this rewrite, and its restore is the survivor's (undoOps). A deal moved by its
        // id comes back with its account's name; a deal named by its account's name alone comes back by name only
        // while it names no account by id — a deal linked by id carries that account's name.
        const ids = rw.ids.filter((id) => !(rw.table === 'accounts' && id === log.survivorId));
        if (!ids.length) continue;
        const dealId = rw.table === 'opportunities' && rw.column === 'accountId';
        const dealName = rw.table === 'opportunities' && rw.column === 'account';
        const contactName = rw.table === 'contacts' && rw.column === 'company';
        // A deal by name alone the merge renamed from the name of the record merged away goes back under that name — on
        // it by its name — so only while that is no site, as by its id (the re-check, 18 Oct; one whose name another
        // account shares too stays as well, counted). Never asked where the merge left the name as it was (the twins; a
        // survivor given the merged-away name): that restore moves no deal.
        const toArchivedName = dealName && rw.oldValue === log.archivedName && rw.newValue !== rw.oldValue;
        // A sub-account goes back only where the parent rule puts it back (undoPlaces): one it refuses stays under the
        // survivor — named here, so counted kept. A deal the merge moved up never by its id (the re-check, 17 Oct): the
        // lift overwrote its id move in the merge's own batch, so it never stood on the survivor after the merge — one
        // there now was moved there since, kept; named here, so counted kept when its lift does not put it back either.
        const writes = rw.table === 'accounts' ? ids.filter((id) => subs.includes(id)) : dealId ? ids.filter((id) => !lifted.has(id)) : ids;
        restores.push({ table: rw.table, ids, at: writes.length ? ops.length : -1 });
        if (!writes.length) continue;
        // A deal back to the record merged away — by its id, or by its name alone (toArchivedName) — only while that is
        // no site (notASite — Jeff, 18 Oct: an Undo never puts a deal on a site): one that stays is named here, so counted
        // kept. A contact's company by name only while the contact is not linked to the survivor by id (the re-check,
        // 17 Oct; contacts follow the deals' rule — Jeff, 18 Oct: "Yes, both"): one linked there since carries the
        // survivor's name with its id, as the contact rail writes it, and one there at the merge is read last
        // (survivorRowsOf). One linked to another account — the other of two same-named accounts, whose contacts the merge
        // renamed by name — comes back.
        ops.push(db.update(table).set({ [rw.column]: rw.oldValue, ...(dealId ? { account: nameNow(log.archivedId, orgId) } : {}), updatedAt: now })
            .where(and(inArray(table.id, writes), eq(table.orgId, orgId), eq(table[rw.column], rw.newValue), ...(dealName ? [isNull(table.accountId)] : []),
                ...(dealId || toArchivedName ? [notASite(log.archivedId, orgId)] : []),
                ...(contactName ? [or(isNull(table.accountId), sql`${table.accountId} <> ${log.survivorId}`)] : [])))
            .returning({ id: table.id }));
    }
};

// A contact merge's links: each id back while it still names the survivor; each list — a deal's contacts, a
// colleague's managers or reports — back as it was, while it is still the list the merge wrote.
const contactRestores = (log, orgId, now, ops, restores) => {
    for (const rw of (log.rewrites || [])) {
        const table = TABLE_BY_NAME[rw.table];
        if (!table) continue;
        if (rw.kind === 'id' || rw.kind === 'name') {
            if (!Array.isArray(rw.ids) || !rw.ids.length) continue;
            restores.push({ table: rw.table, ids: rw.ids, at: ops.length });
            ops.push(db.update(table).set({ [rw.column]: rw.oldValue, updatedAt: now })
                .where(and(inArray(table.id, rw.ids), eq(table.orgId, orgId), eq(table[rw.column], rw.newValue)))
                .returning({ id: table.id }));
        } else if (rw.kind === 'jsonbArray' || rw.kind === 'jsonbObjArray') {
            for (const row of (rw.rows || [])) {
                restores.push({ table: rw.table, ids: [row.id], at: ops.length });
                ops.push(db.update(table).set({ [rw.column]: row.old, updatedAt: now })
                    .where(and(eq(table.id, row.id), eq(table.orgId, orgId), sql`${table[rw.column]} = ${JSON.stringify(row.new)}::jsonb`))
                    .returning({ id: table.id }));
            }
        }
    }
};

// The Undo's batch, in order: the claim, the un-archive, the survivor's assert, the record merged away's place (when
// anything goes back under it), the links, the survivor's fields, when an account survivor's name comes back its deals'
// and contacts' name, and the survivor's own deals and contacts renamed by name read. rows: undoRowsOf's, with tree —
// the org's accounts (treeOf) — and deals — the survivor's by id (dealsOn) — an account merge's. Exported for the
// integration suite, which runs a batch built from a log read as merged after the records changed under it.
export function undoOps(kind, log, rows, orgId, now) {
    const records = kind === 'contact' ? contacts : accounts;
    const ops = [
        // The claim: the log, from merged to undone — only while it reads merged. A second Undo of this merge waits on
        // it, then writes nothing; so does an Undo sent from a list read before this merge was undone and made again.
        writesItsRow(db.update(mergeLog).set({ status: 'reversed', reversedAt: now })
            .where(and(eq(mergeLog.id, log.id), eq(mergeLog.orgId, orgId), eq(mergeLog.status, 'merged')))
            .returning({ id: mergeLog.id })),
        // The record merged away, live again — only while it is merged into this survivor: deleted, made live, or
        // merged elsewhere since undoRowsOf read it, and the batch writes nothing.
        writesItsRow(db.update(records).set({ mergeArchived: false, mergedIntoId: null, archivedAt: null, updatedAt: now })
            .where(and(eq(records.id, log.archivedId), eq(records.orgId, orgId), eq(records.mergeArchived, true), eq(records.mergedIntoId, log.survivorId)))
            .returning({ id: records.id })),
        // The survivor still stands, live (1 / 0: 22012 otherwise).
        db.select({ ok: sql`1 / count(*)` }).from(records).where(and(eq(records.orgId, orgId), eq(records.id, log.survivorId),
            or(isNull(records.mergeArchived), eq(records.mergeArchived, false)))),
    ];
    // The survivor's fields the merge wrote that nobody has edited since (survivorRestore) — and, an account merge's,
    // what goes back under the record merged away by the house parent rule (undoPlaces; the review, 17 Oct).
    const restored = survivorRestore(kind, log, rows.survivor);
    const placed = kind === 'account' ? undoPlaces(log, rows.tree, restored, rows.deals) : null;
    // The record merged away where the parent rule read it, while anything goes back under it — after the un-archive,
    // which holds its row from then on (1 / 0: 22012 otherwise, read again as "changed while the merge was being undone").
    if (placed?.under) {
        ops.push(db.select({ ok: sql`1 / count(*)` }).from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, log.archivedId),
            asRead(accounts.parentAccountId, placed.under.parentAccountId), asRead(accounts.accountTier, placed.under.accountTier))));
    }
    const restores = [];
    if (kind === 'contact') contactRestores(log, orgId, now, ops, restores);
    else accountRestores(log, orgId, now, ops, restores, placed.subs);
    // The deals that keep the survivor at its level, each left where it is and counted (undoPlaces held — Jeff, 18 Oct:
    // "the deal stays where it is, and it is counted"), whatever a later statement reads of them.
    if (placed?.held.length) restores.push({ table: 'opportunities', ids: placed.held, at: -1, held: true });
    // The survivor: each field the merge wrote and nobody has edited since, back as it was — only while the row is as
    // undoRowsOf read it; an edit landing between keeps every field, and the answer says so (undoKept). A tier it gets
    // back, only while nothing stands under it that would not rank below that tier (nothingUnder); a site's, only while
    // no deal stands on it by id (noDealOn — Jeff, 18 Oct).
    const { set, keptFields } = placed || restored;
    let survivorAt = -1;
    if (Object.keys(set).length) {
        survivorAt = ops.length;
        ops.push(db.update(records).set({ ...set, updatedAt: now })
            .where(and(eq(records.id, log.survivorId), eq(records.orgId, orgId), sql`${records.updatedAt}::text = ${rows.survivor.updatedAtText}`,
                ...(set.accountTier === 'site' ? [noDealOn(log.survivorId, orgId)] : []),
                ...('accountTier' in set ? [nothingUnder(log.survivorId, set.accountTier, orgId)] : [])))
            .returning({ id: records.id }));
    }
    // An account survivor's name back: its deals and contacts by id take its name as it now stands, as the accounts
    // PUT's rename does (accounts.mjs:424-431) — a deal's account id and account name move together (Jeff, 17 Oct: Q3) —
    // only while the survivor stands (standsNow). One the merge never left on the survivor — a deal it moved up, a deal
    // or contact by name alone — was linked there since: its name taken with its id, never counted put back (since —
    // survivorRowsOf; the re-check, 17 Oct) — nor one the deal id restore left there, the record merged away a site
    // (dealsByIdOf; Jeff, 18 Oct).
    const cascades = [];
    const deals = kind === 'account' ? survivorRowsOf(log, 'opportunities') : null;
    const people = kind === 'account' ? survivorRowsOf(log, 'contacts') : null;
    if (kind === 'account' && 'name' in set) {
        cascades.push({ table: 'opportunities', ids: [], at: ops.length, since: [...deals.since, ...dealsByIdOf(log)] });
        ops.push(db.update(opportunities).set({ account: nameNow(log.survivorId, orgId) })
            .where(and(eq(opportunities.accountId, log.survivorId), eq(opportunities.orgId, orgId), standsNow(log.survivorId, orgId)))
            .returning({ id: opportunities.id }));
        cascades.push({ table: 'contacts', ids: [], at: ops.length, since: people.since });
        ops.push(db.update(contacts).set({ company: nameNow(log.survivorId, orgId) })
            .where(and(eq(contacts.accountId, log.survivorId), eq(contacts.orgId, orgId), standsNow(log.survivorId, orgId)))
            .returning({ id: contacts.id }));
    }
    // A deal or contact the merge renamed by name that stood on the survivor by id — one that already carried the name
    // of the record merged away: UKG's "Shell - Port Allen" twins (the merge wrote the name they had), a deal moved before
    // §0.198 (its old account's name beside its new id), a contact of the survivor's under the other's name — is where
    // its id puts it: never put back by name (Q3). Read last, so one still on the survivor under its name as it now
    // stands is counted put back: no change made since (the review and the re-check, 17 Oct).
    if (kind === 'account') {
        if (deals.on.length) {
            restores.push({ table: 'opportunities', ids: deals.on, at: ops.length });
            ops.push(db.select({ id: opportunities.id }).from(opportunities).where(and(inArray(opportunities.id, deals.on), eq(opportunities.orgId, orgId),
                eq(opportunities.accountId, log.survivorId), eq(opportunities.account, nameNow(log.survivorId, orgId)))));
        }
        if (people.on.length) {
            restores.push({ table: 'contacts', ids: people.on, at: ops.length });
            ops.push(db.select({ id: contacts.id }).from(contacts).where(and(inArray(contacts.id, people.on), eq(contacts.orgId, orgId),
                eq(contacts.accountId, log.survivorId), eq(contacts.company, nameNow(log.survivorId, orgId)))));
        }
    }
    return { ops, restores, cascades, survivorAt, set, keptFields };
}

// The batch. A statement that found the records not as read (22012), a stricter isolation level's conflict (40001)
// or a deadlock with a write racing it (40P01) wrote nothing: the log and the records are read again and the refusal
// said — or, when nothing reads wrong now, that something changed while it ran. Any other failure is the handler's
// 500. Exported for the integration suite.
export const undoBatch = async (ops, { log, table, orgId, headers }) => {
    try { return { results: await db.batch(ops) }; }
    catch (e) {
        if (!['22012', '40001', '40P01'].includes(String(e?.cause?.code || e?.code || ''))) throw e;
        const [again] = await db.select().from(mergeLog).where(and(eq(mergeLog.id, log.id), eq(mergeLog.orgId, orgId)));
        const refusal = again ? undoRefusal({ log: again, ...(await undoRowsOf(table, again, orgId)) }) : null;
        return { refused: { statusCode: 409, headers, body: JSON.stringify({ error: refusal || UNDO_CHANGED }) } };
    }
};

// An Undo of either kind: read, refuse, then the one batch; the audit line, and the answer — the record back, and what
// it left as it is now (undoKept: the linked records, and the survivor's fields).
const undoMergeLog = async ({ kind, body, orgId, userId, headers }) => {
    const { mergeLogId } = body;
    if (!mergeLogId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'mergeLogId is required to reverse a merge.' }) };

    const [log] = await db.select().from(mergeLog).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId)));
    if (!log) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Merge record not found.' }) };
    if (log.entityType !== kind) return { statusCode: 400, headers, body: JSON.stringify({ error: kind === 'contact' ? 'Not a contact merge.' : 'Only account merges can be reversed in this phase.' }) };
    const table = kind === 'contact' ? contacts : accounts;
    const rows = await undoRowsOf(table, log, orgId);
    // Its status read again after its records (the review, 17 Oct): an Undo of this merge committed between the two
    // reads makes this one "already been undone" — never its record, live again, read as no longer merged.
    const [again] = await db.select({ status: mergeLog.status }).from(mergeLog).where(and(eq(mergeLog.id, mergeLogId), eq(mergeLog.orgId, orgId)));
    const refusal = undoRefusal({ log: { ...log, status: again?.status ?? log.status }, ...rows });
    if (refusal) return { statusCode: 409, headers, body: JSON.stringify({ error: refusal }) };

    // An account merge's: the org's accounts, on which what goes back under the record merged away meets the parent rule;
    // and the survivor's deals by id, which keep it from going back a site (Jeff, 18 Oct).
    const tree = kind === 'account' ? await treeOf(orgId) : null;
    const deals = kind === 'account' ? await dealsOn(log.survivorId, orgId) : null;
    const built = undoOps(kind, log, { ...rows, tree, deals }, orgId, new Date());
    const done = await undoBatch(built.ops, { log, table, orgId, headers });
    if (done.refused) return done.refused;
    const { keptLinks, keptFields } = undoKept(built, done.results);
    await auditAs(orgId, userId, { action: kind === 'contact' ? 'contact.merge_undone' : 'account.merge_undone', entityType: kind, entityId: log.survivorId, entityName: log.survivorName, detail: undoDetail(log, mergeLogId, keptLinks, keptFields) });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, reversed: mergeLogId, restoredId: log.archivedId, restoredName: log.archivedName, keptLinks, keptFields }) };
};
const reverseAccountMerge = (args) => undoMergeLog({ ...args, kind: 'account' });
const reverseContactMerge = (args) => undoMergeLog({ ...args, kind: 'contact' });

// ── Contact merge ──────────────────────────────────────────────────────────────
// Contacts have no single name column (firstName/lastName) and no account FK
// (linked to accounts by company NAME). The new rewrite wrinkle vs accounts is
// JSONB references: opportunities.contactIds (array of ids) and every other
// contact's managers/directReports ({id,name} arrays). Those are rewritten per
// affected row, with each row's pre-merge array snapshotted: an undo puts it back while it is still the array written.
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
    // The owner id with the owner name (§0.193), decided before anything is written.
    const owner = 'assignedRep' in resolved ? mergedOwnerId('assignedRep', resolved, surv, arch) : null;
    if (owner?.error) return { statusCode: 400, headers, body: JSON.stringify({ error: owner.error }) };

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

    // 4) Survivor: resolved fields + unioned org-chart arrays (archived merged in) — orgChartUnion
    //    (src/utils/mergeUndo.js), which an Undo reads too, to see whether it still holds what this wrote.
    const survSet = {
        ...resolved,
        firstName: survFirst, lastName: survLast,
        managers: orgChartUnion(surv.managers, arch.managers, archivedId, survivorId),
        directReports: orgChartUnion(surv.directReports, arch.directReports, archivedId, survivorId),
        updatedAt: now,
    };
    if (owner) survSet.ownerId = owner.ownerId;   // the id with the name (§0.193)
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
    await auditAs(orgId, userId, { action: 'contact.merged', entityType: 'contact', entityId: survivorId, entityName: survName, detail: `${archName} merged in · ${Object.values(summary).reduce((a, n) => a + n, 0)} references repointed · undo ${logId}` });

    return { statusCode: 200, headers, body: JSON.stringify({ contact: updatedSurvivor, archivedId, mergeLogId: logId, rewriteSummary: summary }) };
}

// ── Past merges (state §0.207 — Jeff, 17 Oct: Q1 "Past merges on each page") ──────
// GET ?entityType=account|contact: this org's merges of that kind, newest first, the latest MERGES_SHOWN — each with
// why it can no longer be undone, by the Undo's own rule (undoRefusal), as its two records stand now. Who merged: the
// member's name by the server's own id, else the name the merge was sent with. Dates as UTC text, never through the
// driver's local reading. No rewrites, no snapshots.
const MERGES_SHOWN = 50;
async function listMerges({ event, orgId, headers }) {
    const entityType = event.queryStringParameters?.entityType === 'contact' ? 'contact' : 'account';
    const table = entityType === 'contact' ? contacts : accounts;
    const utc = (col) => sql`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
    const logs = await db.select({
        id: mergeLog.id, entityType: mergeLog.entityType, status: mergeLog.status,
        survivorId: mergeLog.survivorId, survivorName: mergeLog.survivorName,
        archivedId: mergeLog.archivedId, archivedName: mergeLog.archivedName,
        performedBy: mergeLog.performedBy, performedById: mergeLog.performedById,
        createdAt: utc(mergeLog.createdAt), reversedAt: utc(mergeLog.reversedAt),
    }).from(mergeLog).where(and(eq(mergeLog.orgId, orgId), eq(mergeLog.entityType, entityType)))
        .orderBy(desc(mergeLog.createdAt)).limit(MERGES_SHOWN + 1);
    const shown = logs.slice(0, MERGES_SHOWN);
    const ids = [...new Set(shown.flatMap((l) => [l.survivorId, l.archivedId]))];
    const rows = ids.length ? await db.select().from(table).where(and(eq(table.orgId, orgId), inArray(table.id, ids))) : [];
    const intoIds = [...new Set(rows.filter((r) => r.mergeArchived === true && r.mergedIntoId).map((r) => r.mergedIntoId))];
    const into = intoIds.length ? await db.select().from(table).where(and(eq(table.orgId, orgId), inArray(table.id, intoIds))) : [];
    const byId = new Map([...rows, ...into].map((r) => [r.id, r]));
    const names = new Map();
    for (const by of new Set(shown.map((l) => l.performedById).filter(Boolean))) names.set(by, await getCallerName(by, orgId));
    // Each log's status read again after its records (the review, 17 Oct — as an Undo reads it): a merge undone between
    // the two reads is listed undone, never its record, live again, read as no longer merged.
    const again = shown.length ? await db.select({ id: mergeLog.id, status: mergeLog.status, reversedAt: utc(mergeLog.reversedAt) }).from(mergeLog)
        .where(and(eq(mergeLog.orgId, orgId), inArray(mergeLog.id, shown.map((l) => l.id)))) : [];
    const statusNow = new Map(again.map((l) => [l.id, l]));
    const merges = shown.map((read) => {
        const l = { ...read, ...(statusNow.get(read.id) || {}) };
        const survivor = byId.get(l.survivorId);
        return {
            id: l.id, status: l.status,
            survivorId: l.survivorId, survivorName: l.survivorName, archivedId: l.archivedId, archivedName: l.archivedName,
            by: names.get(l.performedById) || l.performedBy || null,
            createdAt: l.createdAt, reversedAt: l.reversedAt,
            refusal: l.status === 'merged'
                ? undoRefusal({ log: l, archived: byId.get(l.archivedId), survivor, survivorInto: survivor?.mergedIntoId ? byId.get(survivor.mergedIntoId) : undefined })
                : null,
        };
    });
    return { statusCode: 200, headers, body: JSON.stringify({ merges, more: logs.length > MERGES_SHOWN }) };
}
