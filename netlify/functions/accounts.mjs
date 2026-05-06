import { db } from '../../db/index.js';
import { accounts, settings as settingsTable } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

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
        website:           d.website           || null,
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
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const territoryAssignPut = await resolveTerritory(orgId, clean);
            const mergedPut = { ...clean, ...(territoryAssignPut || {}) };
            const { id: _putId, ...updateDataMerged } = mergedPut;
            const [upserted] = await db.insert(accounts).values({ ...mergedPut, orgId })
                .onConflictDoUpdate({ target: accounts.id, set: { ...updateDataMerged, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ account: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                // Scope clear to this org only
                await db.delete(accounts).where(eq(accounts.orgId, orgId));
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
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
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, detail: err.stack?.split('\n')[0] }) };
    }
};
