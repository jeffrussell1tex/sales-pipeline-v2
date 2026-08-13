import { db } from '../../db/index.js';
import { accounts, settings as settingsTable, opportunities, contacts } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, requireRole, canSeeAll, isReadOnly, requireWrite } from './auth.mjs';
import { serverErrorBody, writeAudit, getCallerName, bulkUpsert } from './_lib.mjs';

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
async function resolveTerritory(orgId, account) {
    if (account.assignedTerritory) return null; // already assigned, do not override
    try {
        const rows = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        if (!rows.length) return null;
        const rules = rows[0].extra?.assignmentRules;
        if (!Array.isArray(rules) || rules.length === 0) return null;
        const featureFlags = rows[0].extra?.featureFlags || {};
        if (featureFlags['territory-rules'] === false) return null;
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
    } catch (e) {
        console.error('resolveTerritory error:', e.message);
    }
    return null;
}

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
        parentAccountId:   d.parentAccountId   || d.parentId || null,
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
            const results = await db.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.name));
            return { statusCode: 200, headers, body: JSON.stringify({ accounts: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            // Bulk insert — body is an array
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ accounts: [], inserted: 0 }) };
                const rows = data.map(d => ({ ...sanitize(d), orgId }));
                // onConflictDoNothing skips duplicates instead of erroring
                const inserted = await db.insert(accounts).values(rows).onConflictDoNothing().returning();
                return { statusCode: 201, headers, body: JSON.stringify({ accounts: inserted, inserted: inserted.length }) };
            }
            // Single insert
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const territoryAssign = await resolveTerritory(orgId, sanitize(data));
            const [inserted] = await db.insert(accounts).values({ ...sanitize(data), ...(territoryAssign || {}), orgId }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ account: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            // Bulk update — body is an array. Used by the CSV importer's
            // "overwrite" path, which previously issued one PUT per record.
            // See bulkUpsert in _lib.mjs for the chunking and safety notes.
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ updated: 0, notFound: [], forbidden: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // Reps may only overwrite their own or unassigned records. Resolved
                // once here rather than per row; null means "may edit everything".
                const callerName = canSeeAll(userRole) ? null : await getCallerName(userId);
                const result = await bulkUpsert({
                    table: accounts,
                    rows: data.map(d => sanitize(d)),
                    orgId,
                    ownerColumn: accounts.accountOwner,
                    callerName,
                });
                return { statusCode: 200, headers, body: JSON.stringify(result) };
            }
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            // Read the stored row first so a rename can be detected and cascaded below.
            const [prior] = await db.select().from(accounts).where(and(eq(accounts.id, clean.id), eq(accounts.orgId, orgId)));
            // PUT is strictly an update: unknown ids 404 instead of silently creating.
            if (!prior) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Account not found' }) };
            }
            // Object-level authorization: reps may only edit their own or unassigned accounts
            if (!canSeeAll(userRole)) {
                const callerName = await getCallerName(userId);
                if (prior.accountOwner && prior.accountOwner !== callerName) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: you can only modify your own or unassigned records' }) };
                }
            }
            const territoryAssignPut = await resolveTerritory(orgId, clean);
            const mergedPut = { ...clean, ...(territoryAssignPut || {}) };
            const { id: _putId, ...updateDataMerged } = mergedPut;
            const [upserted] = await db.insert(accounts).values({ ...mergedPut, orgId })
                .onConflictDoUpdate({ target: accounts.id, setWhere: eq(accounts.orgId, orgId), set: { ...updateDataMerged, updatedAt: new Date() } })
                .returning();
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
            return { statusCode: 200, headers, body: JSON.stringify({ account: upserted, renamed }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                // Org-wide wipe — Admin only, scoped to this org.
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                const deleted = await db.delete(accounts).where(eq(accounts.orgId, orgId)).returning({ id: accounts.id });
                await writeAudit(orgId, {
                    action: 'account.cleared', entityType: 'account', entityId: 'ALL',
                    entityName: 'All accounts', detail: `Cleared ${deleted.length} accounts via clear=true`, userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            // Object-level authorization: reps may only delete their own or unassigned accounts
            if (!canSeeAll(userRole)) {
                const [target] = await db.select({ owner: accounts.accountOwner }).from(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId)));
                const callerName = await getCallerName(userId);
                if (target?.owner && target.owner !== callerName) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: you can only modify your own or unassigned records' }) };
                }
            }
            // Promote children to top-level before deleting parent — prevents orphaned rows
            await db.update(accounts)
                .set({ parentAccountId: null })
                .where(and(eq(accounts.parentAccountId, id), eq(accounts.orgId, orgId)));
            await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Accounts error:', err.message);
        console.error('Accounts error stack:', err.stack);
        console.error('Accounts error detail:', JSON.stringify({ method: event.httpMethod, body: event.body?.slice(0, 500) }));
        return { statusCode: 500, headers, body: serverErrorBody(err, 'accounts') };
    }
};
