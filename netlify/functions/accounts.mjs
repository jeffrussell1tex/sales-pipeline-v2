import { db } from '../../db/index.js';
import { accounts, settings as settingsTable, opportunities, contacts } from '../../db/schema.js';
import { eq, asc, and, or, isNull, inArray } from 'drizzle-orm';
import { verifyAuth, requireRole, canSeeAll, isReadOnly, requireWrite } from './auth.mjs';
import { crmReadScope } from '../../src/utils/roles.js';
import {
    serverErrorBody, writeAudit, getCallerId, bulkUpsert, bulkInsert, assertOwnership,
    stampOwnerId, stampOwnerIds, ownerIdForUpdate, rekeyBulkOwners, ambiguousOwnerResponse, rosterUserById,
} from './_lib.mjs';
import { ownerColumnOf } from './_ownership.mjs';
import { deletionAudit } from './_audit.mjs';
import { openDealOfAccount, openDealOfAnyAccount, openDealRefusal, dealLabel } from './_openDeals.mjs';
import { partialRows } from './_sanitize.mjs';
import { checkBulkLinks, clearStrayLinks } from './_links.mjs';
import { placeAccount, restorePlace, liftedBelow, tierChanges, sitesMade, movedSinceDelete } from '../../src/utils/accountParent.js';

// A bulk row's parent: a live account of this org, or one of the batch's own (state §0.199). One merged
// away is refused, as the single save's placeAccount refuses it (§0.198); the rest of the parent rule on
// the bulk paths is batch 3's (OPEN_ITEMS §4.7).
const PARENT_LINK = [{ key: 'parentAccountId', kind: 'account', follow: false }];

// ── Website normalizer ────────────────────────────────────────────────────────
// Unwraps markdown links — e.g. "[www.x.com](https://www.x.com)" -> "https://www.x.com"
// — and trims whitespace so junk never lands in the DB. Normal URLs pass through
// untouched. Keeps the website field clean for display AND for domain-based
// duplicate detection (see duplicates.mjs domainOf).
const cleanWebsite = (w) => {
    if (!w) return null;
    let s = String(w).trim();
    const md = s.match(/\]\(([^)]+)\)/);   // markdown [text](href) -> href
    if (md) s = md[1].trim();
    return s || null;
};

// ── Territory auto-assign ─────────────────────────────────────────────────────
// Reads assignmentRules from settings and returns territory/rep assignment if a rule matches.
// Rule shape: { field: 'industry'|'verticalMarket'|'name', contains: string, territory: string, rep?: string }
// First matching rule wins. Only runs if 'territory-rules' flag is enabled (default: true).
//
// Split into load + apply so the bulk path can read the rules ONCE for the whole
// import rather than once per row. The bulk POST previously skipped territory
// assignment altogether — every CSV-imported account landed unassigned while an
// identical account created through the UI got a territory, which reads as the
// rules being broken rather than as an import gap.
async function loadTerritoryRules(orgId) {
    try {
        const rows = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        if (!rows.length) return null;
        const rules = rows[0].extra?.assignmentRules;
        if (!Array.isArray(rules) || rules.length === 0) return null;
        const featureFlags = rows[0].extra?.featureFlags || {};
        if (featureFlags['territory-rules'] === false) return null;
        return rules;
    } catch (e) {
        console.error('loadTerritoryRules error:', e.message);
        return null;
    }
}

function applyTerritoryRules(rules, account) {
    if (!rules || account.assignedTerritory) return null;   // already assigned, do not override
    for (const rule of rules) {
        if (!rule.territory || !rule.contains) continue;
        const haystack = (account[rule.field] || '').toLowerCase();
        if (haystack.includes(rule.contains.toLowerCase())) {
            return {
                assignedTerritory: rule.territory,
                assignedRep:       rule.rep || account.assignedRep || null,
            };
        }
    }
    return null;
}

async function resolveTerritory(orgId, account) {
    if (account.assignedTerritory) return null; // already assigned, do not override
    return applyTerritoryRules(await loadTerritoryRules(orgId), account);
}

// ── An account's parent and tier (state §0.198; Jeff, 11 Oct — D3: "No self, no loops, no
// sites"; D18: "Yes, make them 'account'"; D21: "Keep what fits") ──────────────────────────
// The rule is the account rail's own (src/utils/accountParent.js placeAccount), run on THIS
// org's rows: a parent another org holds is not found — the 404 a missing one gets, so
// nothing leaks — and never on the caller's read scope: a rep keeps a parent she can't open
// (D1, D16). The bulk paths (a CSV's) store a parent unchecked until batch 3.
const orgTreeOf = (orgId) => db.select({
    id: accounts.id, name: accounts.name, parentAccountId: accounts.parentAccountId,
    accountTier: accounts.accountTier, mergeArchived: accounts.mergeArchived,
}).from(accounts).where(eq(accounts.orgId, orgId));

// Each account's tier as the rule re-fitted it — the accounts under a moved one (D21) — for
// this org's rows only, one update a tier: the statements, which the move they follow sends in
// its own db.batch — all or nothing, as merge.mjs writes (neon-http has no interactive
// transaction). Written one by one after the move had committed, a failure between left a
// business unit under a business unit while the screen said the save had failed. A delete's
// tiers are its own (below): each keyed to the rows as they stand when it runs.
function tierWrites(orgId, changes) {
    return [...new Set(changes.map((c) => c.accountTier))].map((tier) => {
        const ids = changes.filter((c) => c.accountTier === tier).map((c) => c.id);
        return db.update(accounts).set({ accountTier: tier }).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, ids)));
    });
}

// An account below a deleted account's lifted sub-account stands where its tier was worked out
// (accountParent.js liftedBelow) while its parent is chain[0], that one's parent chain[1], … the
// last the account the delete removes — read in the statement itself, a subquery of this org's
// rows a level (state §0.198; the critics, 12 Oct: a delete wrote tiers worked out from a read
// another session's write had made stale).
const standsOn = (orgId, [parentId, ...up]) => and(eq(accounts.parentAccountId, parentId), up.length
    ? inArray(accounts.parentAccountId, db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, parentId), standsOn(orgId, up))))
    : undefined);

// D22 (Jeff, 11 Oct: "Move them up"): a move moves up the deals it would leave on a site — by
// id; by name only where no other account has the name. When a move makes an account a
// site (accountParent.js sitesMade), the deals on it — by its id, or by its name where a deal
// has no id and no other account has the name (UKG's twins: neither's by name) — move up to
// the account it then stands under, under that account's name, Site Name the site: this
// org's deals only, in the move's own db.batch, each answering with the deal as written (the
// screen takes them). An account edit has no Undo: moving the account back does not move its
// deals back.
const dealLifts = (orgId, made) => made.map((s) => db.update(opportunities)
    .set({ accountId: s.parentId, account: s.parentName, site: s.name, updatedAt: new Date() })
    .where(and(eq(opportunities.orgId, orgId), s.alone
        ? or(eq(opportunities.accountId, s.id), and(isNull(opportunities.accountId), eq(opportunities.account, s.storedName)))
        : eq(opportunities.accountId, s.id)))
    .returning({ id: opportunities.id, accountId: opportunities.accountId, account: opportunities.account, site: opportunities.site }));

// A parent placeAccount refused: the rail shows the error (useAccounts reads data.error).
const refusedPlace = (placed, headers) => ({ statusCode: placed.status, headers, body: JSON.stringify({ error: placed.error }) });

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole, managedReps } = auth;

    // Server-side role enforcement: ReadOnly can never mutate, regardless of
    // what the client UI allows. Runs before any handler logic.
    // Shared write gate. Denies ReadOnly AND Technician: a technician's only
    // write capability is the field whitelist in dispatch-jobs.mjs, so they must
    // not be able to mutate CRM records. Previously this checked isReadOnly
    // alone, which would have granted a new role full write access by default.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;
    // The restore mark (a delete's Undo, below) is honoured for an Admin alone: only an Admin
    // deletes (the DELETE's role gate), so only an Admin's Undo sends it. Anyone else's marked
    // write is an ordinary save — the parent rule, the tier that fits, D22's deals moved up — as
    // if it carried no mark (state §0.198; the critics, 12 Oct: a rep's forged mark put an
    // account under a site and stored any tier).
    const mayRestore = userRole === 'Admin';

    const sanitize = (d) => ({
        id:                d.id,
        name:              d.name              || 'Unnamed Account',
        verticalMarket:    d.verticalMarket    || null,
        industry:          d.industry          || null,
        address:           d.address           || null,
        address2:          d.address2          || null,
        city:              d.city              || null,
        state:             d.state             || null,
        zip:               d.zip               || null,
        country:           d.country           || null,
        website:           cleanWebsite(d.website),
        phone:             d.phone             || null,
        accountOwner:      d.accountOwner      || null,
        assignedRep:       d.assignedRep       || null,
        assignedTerritory: d.assignedTerritory || null,
        parentAccountId:   d.parentAccountId   || null,   // no legacy `parentId`: the parent stored is the parent checked (§0.199)
        accountTier:       d.accountTier       || (d.parentAccountId ? 'business_unit' : 'account'),
        notes:             d.notes             || null,
        doNotContact:      d.doNotContact      === true ? true : false,
        customerTypes:     Array.isArray(d.customerTypes) ? d.customerTypes : [],
        accountSegment:    d.accountSegment     || null,
        // Account Details tab fields
        description:       d.description       || null,
        totalEmployees:    d.totalEmployees     || null,
        annualRevenue:     d.annualRevenue      || null,
        fiscalYearEnd:     d.fiscalYearEnd      || null,
        foundedYear:       d.foundedYear        || null,
        linkedInUrl:       d.linkedInUrl        || null,
        sicCode:           d.sicCode            || null,
        naicsCode:         d.naicsCode          || null,
    });

    try {
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.name));
            // What the caller may READ (src/utils/roles.js): 'all' for Admin, Manager
            // and a Dispatcher, 'none' for a Technician, 'own' for everyone else. A
            // READ scope only — canSeeAll stays the WRITE authority (guide §18b45).
            const readScope = crmReadScope(userRole);
            if (readScope === 'none') {
                results = [];
            } else if (readScope === 'own') {
                // Rep scoping. This endpoint returned every row in the org to
                // every caller until now — the client filter in App.jsx was the
                // only thing narrowing it, and a client filter is not a boundary.
                //
                // Same predicate as opportunities.mjs: unassigned is visible to
                // everyone, owned rows only to their owner. Keys on the OWNER ID,
                // never the display name — two users sharing a name saw each
                // other's records, and renaming one detached theirs (18b22).
                //
                // A caller that cannot be resolved stays null and sees only
                // unassigned rows, matching mayMutate()'s direction on writes.
                const callerId = await getCallerId(userId, orgId);
                results = results.filter(r => !r.ownerId || r.ownerId === callerId);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ accounts: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            // Bulk insert — body is an array
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ accounts: [], inserted: 0, failed: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // A parent among the batch's own new rows needs no read; an id this org already holds is no new
                // row (its insert will not land), so a parent naming it is asked as any parent is (state §0.199).
                const batchIds = data.map(d => d.id);
                const taken = new Set((await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, batchIds)))).map(r => r.id));
                const parents = await checkBulkLinks(PARENT_LINK, data, orgId, { also: { kind: 'account', ids: new Set(batchIds.filter(id => !taken.has(id))) } });
                if (parents.error) return { statusCode: parents.status, headers, body: JSON.stringify({ error: parents.error, field: parents.field, ids: parents.ids }) };
                // Rules read once for the batch, not once per row.
                const rules = await loadTerritoryRules(orgId);
                const rows = data.map(d => {
                    const clean = sanitize(d);
                    return { ...clean, ...(applyTerritoryRules(rules, clean) || {}) };
                });
                // Chunked with per-row isolation by bisection — see bulkInsert in
                // _lib.mjs (18b8). One malformed row no longer discards the import.
                // A blank owner stays UNASSIGNED on an import — it is not
                // stamped with whoever ran it. See stampOwnerIds.
                const owned = await stampOwnerIds(rows, 'account', { clerkUserId: userId, orgId });
                const result = await bulkInsert({ table: accounts, rows: owned.rows, orgId });
                // A row of the batch that did not land leaves no link to it: a parent naming one is cleared
                // (state §0.199 — the batch's own rows were counted live).
                if (result.failed.length) {
                    const swept = await clearStrayLinks(orgId, new Map([[accounts, result.insertedIds]]));
                    result.linksCleared = swept.cleared;
                    if (swept.failed.length) result.linksNotChecked = swept.failed;   // said, not left silent
                }
                return { statusCode: 201, headers, body: JSON.stringify({
                    ...result,
                    ambiguousOwners: owned.ambiguousOwners,
                    unmatchedOwners: owned.unmatchedOwners,
                }) };
            }
            // Single insert
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            // Its parent, if it names one, is an account of this org it may stand under, and its
            // tier is the one the body asks for where that fits under the parent, else the lowest
            // above it (state §0.198; D3, D21); with no parent nothing is read: a top-level
            // account. A delete's Undo posts the stored row back marked a restore (D21: "Undo puts
            // the stored tiers back") — an Admin's alone (mayRestore): its parent and tier exactly
            // as stored, checked only that the tier is one the rule knows, that the parent is a
            // live account of THIS org, no site, under which no loop forms, and that no account
            // under it would not rank below it (restorePlace, over the org's rows whatever the
            // parent); its owner as stored — the stored owner id where it is a member of THIS
            // org, else none, never the caller, so a blank owner stays unassigned; an owner id it
            // drops (another org's, or a member gone since) takes the owner's name with it, since
            // an unassigned row shows no owner; and no territory rule (the server critic, 12 Oct:
            // the create's stamp made the Admin who pressed Undo the owner of an unassigned
            // account, and every rep lost it from their list; the critics, 12 Oct: a restore kept
            // the name of an owner whose id it dropped). Its created date is not put back: the
            // column's default, the moment of the Undo, stands — the app's driver reads a
            // `timestamp without time zone` in the function process's own time zone (state
            // §0.91), so a date read back and written again moves by that zone's offset (the
            // behaviour critic, 12 Oct). Nor are its merge mark and its last-edited time
            // (OPEN_ITEMS §4.2).
            const asked = sanitize(data);
            const placed = data.restore === true && mayRestore
                ? restorePlace(await orgTreeOf(orgId), { selfId: asked.id, selfName: asked.name, parentId: asked.parentAccountId, tier: asked.accountTier })
                : placeAccount(asked.parentAccountId ? await orgTreeOf(orgId) : [], { selfId: asked.id, selfName: asked.name, parentId: asked.parentAccountId, tier: data.accountTier });
            if (placed.error) return refusedPlace(placed, headers);
            const territoryAssign = data.restore === true && mayRestore ? null : await resolveTerritory(orgId, sanitize(data));
            // The caller owns what they create unless the payload names someone else; a restore
            // keeps the owner it was stored with.
            const newRow = data.restore === true && mayRestore
                ? { ...sanitize(data), ownerId: (await rosterUserById(data.ownerId, orgId))?.id ?? null, accountTier: placed.tiers.get(asked.id) }
                : await stampOwnerId({ ...sanitize(data), accountTier: placed.tiers.get(asked.id), ...(territoryAssign || {}) }, 'account', { clerkUserId: userId, orgId });
            if (data.restore === true && mayRestore && data.ownerId && !newRow.ownerId) newRow.accountOwner = null;
            // An id another org holds writes nothing — answered, not crashed on the key (state §0.199).
            const [inserted] = await db.insert(accounts).values({ ...newRow, orgId }).onConflictDoNothing({ target: accounts.id }).returning();
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That account id is already in use.' }) };
            return { statusCode: 201, headers, body: JSON.stringify({ account: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            // Bulk update — body is an array. Used by the CSV importer's
            // "overwrite" path, which previously issued one PUT per record.
            // See bulkUpsert in _bulk.mjs for the chunking and safety notes.
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ updated: 0, notFound: [], forbidden: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // Reps may only overwrite their own or unassigned records,
                // resolved once here rather than per row.
                //
                // The caller is resolved UNCONDITIONALLY. This used to be
                // `canSeeAll(userRole) ? null : await getCallerName(...)`, which
                // is the shape 18b20 is about: it made a null callerName carry
                // "trusted Admin" as well as "could not identify the caller".
                // canSeeAll is an explicit parameter now, so the ternary bought
                // one cached lookup and kept a retired hazard in the source.
                const callerId = await getCallerId(userId, orgId);
                    // partialRows, not sanitize() alone. sanitize() is a FULL-ROW
                    // builder -- it expands a payload rather than filtering one --
                    // and bulkUpsert derives its SET clause from the keys supplied,
                    // so feeding it a sanitized row wrote every column. A CSV
                    // overwrite carrying fourteen columns wrote all forty, blanking
                    // stage history, Team Notes and linked contacts with the empty
                    // arrays sanitize had just invented. 18b13: the fix belongs
                    // here, in the endpoint. The previous one was in the caller and
                    // sanitize put the columns straight back.
                // The owner id moves with the owner name (state §0.193).
                // A parent a row names anew is a live account of this org; one the account already holds is
                // not asked again (state §0.199).
                const stored = await db.select({ id: accounts.id, parentAccountId: accounts.parentAccountId })
                    .from(accounts).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, data.map(d => d.id))));
                const parents = await checkBulkLinks(PARENT_LINK, data, orgId, { held: new Map(stored.map(r => [r.id, r])) });
                if (parents.error) return { statusCode: parents.status, headers, body: JSON.stringify({ error: parents.error, field: parents.field, ids: parents.ids }) };
                const keyed = await rekeyBulkOwners(partialRows(data, sanitize), 'account', { table: accounts, orgId });
                const result = await bulkUpsert({
                    table: accounts,
                    rows: keyed.rows,
                    orgId,
                    // Through the registry, never named here. A column named at
                    // the call site is a column nothing checks against the real
                    // schema -- that is how contacts.createdBy survived, and
                    // bulkUpsert's `if (ownerColumn)` turns a wrong name into a
                    // silent org-wide write bypass rather than an error (18b19).
                    ownerColumn: ownerColumnOf(accounts, 'account'),
                    callerId,
                    canSeeAll: canSeeAll(userRole),
                });
                return { statusCode: 200, headers, body: JSON.stringify({ ...result, ambiguousOwners: keyed.ambiguousOwners, unmatchedOwners: keyed.unmatchedOwners }) };
            }
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            // Read the stored row first: a rename is detected and cascaded below, and
            // the update is built over it (state §0.169). sanitize() builds a FULL
            // row, so a body naming three fields blanked the rest — and an unset
            // territory let the rules reassign one (CLAUDE.md; leads, opportunities
            // and tasks merge the same way).
            const [prior] = await db.select().from(accounts).where(and(eq(accounts.id, data.id), eq(accounts.orgId, orgId)));
            // PUT is strictly an update: unknown ids 404 instead of silently creating.
            if (!prior) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Account not found' }) };
            }
            const clean = sanitize({ ...prior, ...data });
            const { id, ...updateData } = clean;
            // Object-level authorization: reps may only edit their own or
            // unassigned accounts. `prior` is the full row, already loaded above,
            // so passing it means no second query -- the policy applied is
            // identical either way.
            const forbiddenPut = await assertOwnership({
                table: accounts, entity: 'account', id: clean.id, orgId, userId, userRole, headers, row: prior,
            });
            if (forbiddenPut) return forbiddenPut;
            // A move (state §0.198; D3, D21): a parent this write names that is not the one stored
            // is an account of this org it may stand under, and the tiers are re-fitted — its own
            // stored one if it fits there, else the body's if it fits, else the lowest above the
            // new parent (a cleared parent: an account), so a screen loaded before another
            // session's move cannot re-tier it; every account under it keeps what still fits.
            // Refused when any would sit below a site. An account the move makes a site hands its
            // deals up to the account it then stands under (D22, dealLifts). A parent the write
            // leaves as stored is not asked about again — a field nobody touched keeps its link
            // (D1), even one from before this rule — and the tier stays as stored, whatever the
            // body says: a screen loaded before another session's move sends the old tier. A
            // delete's Undo marks its re-saves a restore: the parent and tier as stored, exactly,
            // checked only for the tier, the org, a site and loops — nothing re-fitted, no deal
            // moved (D21) — honoured for an Admin's write alone (mayRestore), and only when the
            // body names a parent: the Undo always does, and a mark that names none is an ordinary
            // save, the stored tier kept (the critics, 12 Oct: it turned any top-level account into
            // a site). Only a row whose stored parent is none is put back — what a delete lifts: one
            // that has a parent now (moved by another session since the delete, or never lifted) is
            // refused (409, movedSinceDelete), never run as a move (the behaviour critic, 12 Oct:
            // as a move it overrode that session's move, and D22 could move every deal of the row
            // up, open or closed, its Site Name overwritten). It is
            // refused (restorePlace, 400) over an account under it that would not rank below the
            // tier put back — a sub-account another session added since the delete. It moves no
            // deal: a deal on the account stays where it is — one on a site before the delete
            // (UKG's deals on sites stay until changed by hand), and one linked onto the lifted
            // account between the delete and its Undo, which the Undo then puts back on a site
            // (OPEN_ITEMS §4.2, D22's edges; the critics, 12 Oct: a re-save placed as a move moved
            // every deal of the site up, open or closed, its Site Name overwritten). A restore
            // taken meets no territory rule, as the Undo's POST meets none: the row comes back as
            // stored. After the ownership check: a caller who may not save learns nothing.
            let retiered = [];
            let made = [];
            const marked = data.restore === true && mayRestore && data.parentAccountId;
            if (marked && prior.parentAccountId) return refusedPlace({ status: 409, error: movedSinceDelete(clean.name) }, headers);
            const restored = marked
                ? restorePlace(await orgTreeOf(orgId), { selfId: clean.id, selfName: clean.name, parentId: clean.parentAccountId, tier: clean.accountTier })
                : null;
            if (restored) {
                if (restored.error) return refusedPlace(restored, headers);
            } else if ((clean.parentAccountId || null) !== (prior.parentAccountId || null)) {
                const tree = await orgTreeOf(orgId);
                const placed = placeAccount(tree, { selfId: clean.id, selfName: clean.name, parentId: clean.parentAccountId, tier: data.accountTier, branch: true });
                if (placed.error) return refusedPlace(placed, headers);
                clean.accountTier = placed.tiers.get(clean.id);
                retiered = tierChanges(tree, placed.tiers, clean.id);
                made = sitesMade(tree, placed.tiers, { selfId: clean.id, selfName: clean.name, parentId: clean.parentAccountId });
            } else {
                clean.accountTier = sanitize(prior).accountTier;
            }
            const territoryAssignPut = restored ? null : await resolveTerritory(orgId, clean);
            const mergedPut = { ...clean, ...(territoryAssignPut || {}) };
            // Re-key ownership only when the payload actually mentioned the owner.
            // A partial PUT that says nothing about it must not blank it (18b13).
            const ownPut = await ownerIdForUpdate({ payload: data, entity: 'account', orgId, stored: prior });
            if (ownPut.change) mergedPut.ownerId = ownPut.ownerId;
            const { id: _putId, ...updateDataMerged } = mergedPut;
            // One write: the account; the deals of any account the move made a site, moved up
            // (D22); the accounts under a moved one, with the tiers the move gave them (D17, D21).
            const [[upserted], ...lifts] = await db.batch([
                db.insert(accounts).values({ ...mergedPut, orgId })
                    .onConflictDoUpdate({ target: accounts.id, setWhere: eq(accounts.orgId, orgId), set: { ...updateDataMerged, updatedAt: new Date() } })
                    .returning(),
                ...dealLifts(orgId, made),
                ...tierWrites(orgId, retiered),
            ]);
            const liftedDeals = lifts.slice(0, made.length).flat();
            // Cascade rename: opportunities.account and contacts.company are denormalized
            // display labels keyed by accountId. Keep them in sync so a rename never
            // leaves stale names anywhere in the UI or reports.
            let renamed = false;
            if (prior && upserted && prior.name !== upserted.name) {
                await db.update(opportunities).set({ account: upserted.name })
                    .where(and(eq(opportunities.accountId, upserted.id), eq(opportunities.orgId, orgId)));
                await db.update(contacts).set({ company: upserted.name })
                    .where(and(eq(contacts.accountId, upserted.id), eq(contacts.orgId, orgId)));
                renamed = true;
            }
            return { statusCode: 200, headers, body: JSON.stringify({ account: upserted, renamed, retiered, liftedDeals }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                // Org-wide wipe — Admin only, scoped to this org.
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                // An account with an open deal is kept (state §0.178): the wipe is refused while any is.
                const everyAccount = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.orgId, orgId));
                const holding = await openDealOfAnyAccount(orgId, everyAccount);
                if (holding) {
                    return openDealRefusal(headers, `Accounts with open deals cannot be cleared — "${dealLabel(holding)}" is open. Close the deals, or move them, first.`);
                }
                const deleted = await db.delete(accounts).where(eq(accounts.orgId, orgId)).returning({ id: accounts.id });
                await writeAudit(orgId, {
                    action: 'account.cleared', entityType: 'account', entityId: 'ALL',
                    entityName: 'All accounts', detail: `Cleared ${deleted.length} accounts via clear=true`, userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            // Object-level authorization: reps may only delete their own or
            // unassigned accounts.
            //
            // ORDERING IS LOAD-BEARING. This runs BEFORE the Admin role gate
            // below, and must keep doing so: both refusals are 403 and the BODY
            // is the only way to tell them apart, so a rep who does not own the
            // row gets the ownership message while a rep who does own it gets the
            // role message. FIXTURE_MANIFEST's delete gate asserts exactly that
            // split. Reordering these two silently collapses six distinct
            // outcomes into one.
            const forbiddenOwn = await assertOwnership({
                table: accounts, entity: 'account', id, orgId, userId, userRole, headers,
            });
            if (forbiddenOwn) return forbiddenOwn;
            // Admin only. Reps close deals Won or Lost rather than deleting them,
            // and that rule was DESIGN INTENT ONLY -- this branch was ownership-
            // checked, so canSeeAll being false for a rep still let them delete
            // their own records through the API. The clear=true branch above has
            // always been gated; this one never was.
            const forbiddenDelete = requireRole(auth, ['Admin'], headers);
            if (forbiddenDelete) return forbiddenDelete;
            // An account with an open deal is kept (state §0.178; Jeff: "Block it"). Its
            // sub-accounts are not deleted with it — they are promoted below — so its own
            // deals are what hold it.
            const [target] = await db.select({ id: accounts.id, name: accounts.name })
                .from(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId)));
            const holding = target ? await openDealOfAccount(orgId, target) : null;
            if (holding) {
                return openDealRefusal(headers, `This account has an open deal ("${dealLabel(holding)}"). Close the deal, or move it to another account, before deleting.`);
            }
            // An unknown id used to return success:true. It deleted nothing — and now
            // nothing is written for it.
            if (!target) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

            // Its sub-accounts are lifted to the top level (below): each becomes an account, and
            // the accounts under them keep what still fits (state §0.198; Jeff, 11 Oct, D18: "Yes,
            // make them 'account'"; D21). Only a row stored before the rule can need a new tier
            // below them (a misfit); those are worked out from this org's rows, read first.
            const tree = await orgTreeOf(orgId);
            const below = liftedBelow(tree, id);

            // ONE write (db.batch, all or nothing, as merge.mjs writes), every statement keyed to
            // the rows as they stand when it runs, not as read above (the critics, 12 Oct: when
            // another session's delete landed between the read and the write, this one wrote the
            // tiers it had read onto rows moved since, and answered 404): each sub-account as
            // stored — its parent and its tier, which the answer hands the delete's Undo to put back
            // exactly (a restore), not the screen's copy of it — read in the batch before the
            // delete; the delete; each account below a lifted one re-fitted while it still stands
            // there (standsOn); then the lift itself — one update of every row that still names the
            // deleted account as its parent: the top level, an account (D18). A delete that takes
            // nothing — another session's came first, and lifted them itself — writes nothing.
            // Written apart, a failure between left the children under a deleted parent with their
            // old tiers while the screen counted the delete as failed (the server critic, 12 Oct).
            //
            // .returning() rather than a bare delete: a hard delete destroys the
            // audit trail's subject, so the row has to be captured in the same
            // statement that removes it. An id alone cannot be resolved back to a
            // name once the record is gone.
            //
            // The promotion used to run ABOVE the role gate, which made an attempt
            // destructive on its own: a rep who could not delete an account still
            // detached every sub-account under it, permanently, and left no trace.
            // The audit write sits below the gate the request never reached, so
            // there was no record that anything had happened, and parentAccountId
            // is not recoverable from the surviving row. Confirmed on dev
            // 24 Aug 2026 -- see 0.24 and FIXTURE_MANIFEST step 15.
            //
            // Promotion is a CONSEQUENCE of a deletion, so it is conditional on one:
            // a 403 and a 404 both return before reaching this, and it runs after the
            // delete in the same batch, so it stands or falls with it.
            const [storedKids, gone, ...written] = await db.batch([
                db.select({ id: accounts.id, parentAccountId: accounts.parentAccountId, accountTier: accounts.accountTier })
                    .from(accounts).where(and(eq(accounts.parentAccountId, id), eq(accounts.orgId, orgId))),
                db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId))).returning(),
                ...below.map((b) => db.update(accounts).set({ accountTier: b.accountTier })
                    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, b.id), standsOn(orgId, b.chain)))
                    .returning({ id: accounts.id, accountTier: accounts.accountTier })),
                db.update(accounts)
                    .set({ parentAccountId: null, accountTier: 'account' })
                    .where(and(eq(accounts.parentAccountId, id), eq(accounts.orgId, orgId)))
                    .returning({ id: accounts.id }),
            ]);
            const promoted = written[written.length - 1];
            const [deletedRow] = gone;
            // Gone before this write (another session's delete, which lifted its sub-accounts
            // itself): nothing was written — a 404, as for any id not found.
            if (!deletedRow) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            const promotedIds = new Set(promoted.map((r) => r.id));
            const children = storedKids.filter((c) => promotedIds.has(c.id));
            // What the delete wrote, for the screen: each sub-account it lifted that was not an
            // account, and each account below whose tier it changed.
            const retiered = [...children.filter((c) => c.accountTier !== 'account').map((c) => ({ id: c.id, accountTier: 'account' })), ...written.slice(0, -1).flat()];

            // Record the detachment. A deletion that silently restructured other
            // rows is exactly the shape this defect had; the count belongs in the
            // audit entry rather than only in the deleted row's snapshot.
            const audit = deletionAudit('account', deletedRow, { userId, byRole: 'Admin' });
            if (promoted.length > 0) {
                audit.detail += ` \u2014 ${promoted.length} sub-account${promoted.length === 1 ? '' : 's'} promoted to top level`;
            }
            await writeAudit(orgId, audit);
            // The deleted row as it was stored, and each sub-account it lifted as it was stored
            // before (its parent, its tier): the Undo re-sends exactly these (state §0.198).
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, deleted: deletedRow, children, promoted: promoted.length, retiered }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        const amb = ambiguousOwnerResponse(err, headers);
        if (amb) return amb;
        console.error('Accounts error:', err.message);
        console.error('Accounts error stack:', err.stack);
        console.error('Accounts error detail:', JSON.stringify({ method: event.httpMethod, body: event.body?.slice(0, 500) }));
        return { statusCode: 500, headers, body: serverErrorBody(err, 'accounts') };
    }
};
