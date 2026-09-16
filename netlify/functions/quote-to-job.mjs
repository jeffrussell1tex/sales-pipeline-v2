// netlify/functions/quote-to-job.mjs — an accepted quote becomes a dispatch job
// (state §0.149). The first link in quote → job → invoice → QuickBooks.
//
// POST { quoteId }  → 201 { job, customerCreated }
//   Gates, in order: Clerk auth; a dispatcher's write (requireWrite — no
//   Technician); the org has Dispatch ON (a CRM-only workspace never grows
//   dispatch rows); the quote is THIS org's (404 otherwise — never a probe);
//   the quote is Accepted (422); no job already carries this quote (409, with
//   the job). Then, server-side and org-scoped: the dispatch customer is
//   resolved from the opportunity (its account, else its account's name) or
//   created; the job is inserted with quote_id, opportunity_id, account_id,
//   the quote's lines as its line items (net price each), a status-history
//   row, and an audit row that names the quote.
// GET ?quoteId=   → 200 { job: { …, invoice } | null } — the linked job and its
//   live invoice, for the quote card.
//
// The job is created UNSCHEDULED, so no customer notification is due (§0.111
// confirms on a date); scheduling it later goes through dispatch-jobs.mjs as
// any job does.
import { db } from '../../db/index.js';
import {
    quotes, opportunities, products, invoices,
    dispatchJobs, dispatchJobLineItems, dispatchJobStatusHistory, dispatchCustomers,
    settings as settingsTable,
} from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { verifyAuth, requireWrite, isTechnician } from './auth.mjs';
import { serverErrorBody, withNumberRetry, auditAs } from './_lib.mjs';
import { nextJobNumber, normaliseJob } from './dispatch-jobs.mjs';
import { nextCustomerNumber } from './dispatch-customers.mjs';
import { quoteCanBecomeJob, jobFromQuote, quoteLineToJobItem, resolveCustomerForOpp, cleanProductTypes } from '../../src/utils/invoices.js';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// The org's settings.extra, read once: the Dispatch switch and the Admin's
// product & service types (the job line kind each quote line becomes).
async function orgExtra(orgId) {
    const [row] = await db.select({ extra: settingsTable.extra }).from(settingsTable).where(eq(settingsTable.orgId, orgId)).limit(1);
    return row?.extra && typeof row.extra === 'object' ? row.extra : {};
}
const dispatchEnabledFor = (extra) => !!extra?.dispatchEnabled;

async function linkedJob(orgId, quoteId) {
    const [row] = await db.select().from(dispatchJobs)
        .where(and(eq(dispatchJobs.orgId, orgId), eq(dispatchJobs.quoteId, quoteId)))
        .orderBy(desc(dispatchJobs.createdAt)).limit(1);
    if (!row) return null;
    const [inv] = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status, total: invoices.total })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.jobId, row.id)))
        .orderBy(desc(invoices.createdAt)).limit(1);
    return { ...normaliseJob(row), invoice: inv || null };
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return reply(auth.status || 401, { error: auth.error });
    const { orgId, userId } = auth;
    // A technician neither reads quotes nor makes jobs.
    if (isTechnician(auth.userRole)) return reply(403, { error: 'Technicians cannot convert quotes.' });
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        if (event.httpMethod === 'GET') {
            const quoteId = event.queryStringParameters?.quoteId;
            if (!quoteId) return reply(400, { error: 'quoteId is required' });
            return reply(200, { job: await linkedJob(orgId, quoteId) });
        }

        if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

        let data;
        try { data = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid JSON' }); }
        const quoteId = String(data.quoteId || '').trim();
        if (!quoteId) return reply(400, { error: 'quoteId is required' });

        const extra = await orgExtra(orgId);
        if (!dispatchEnabledFor(extra)) {
            return reply(422, { error: 'Dispatch is not enabled for this workspace. Turn it on under Settings → Features & AI first.' });
        }

        const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId))).limit(1);
        if (!quote) return reply(404, { error: 'Quote not found' });
        if (!quoteCanBecomeJob(quote)) {
            return reply(422, { error: `Only an accepted quote becomes a job — this one is ${quote.status || 'Draft'}.` });
        }
        const existing = await linkedJob(orgId, quoteId);
        if (existing) return reply(409, { error: `${existing.jobNumber || 'A job'} already exists for this quote.`, job: existing });

        const [opp] = quote.opportunityId
            ? await db.select().from(opportunities).where(and(eq(opportunities.id, quote.opportunityId), eq(opportunities.orgId, orgId))).limit(1)
            : [null];

        // ── the customer: resolved in THIS org, else created ─────────────────
        const orgCustomers = await db.select({ id: dispatchCustomers.id, name: dispatchCustomers.name, accountId: dispatchCustomers.accountId })
            .from(dispatchCustomers).where(eq(dispatchCustomers.orgId, orgId));
        let customer = resolveCustomerForOpp(orgCustomers, opp);
        let customerCreated = false;
        if (!customer) {
            const name = String(opp?.account || opp?.opportunityName || quote.name || 'Customer').trim().slice(0, 255);
            const id = 'dcust_' + randomUUID();
            await withNumberRetry(async () => {
                const customerNumber = await nextCustomerNumber(orgId);
                await db.insert(dispatchCustomers).values({
                    id, orgId, customerNumber, name,
                    accountId: opp?.accountId ?? null,
                    customerType: 'commercial',
                    tags: JSON.stringify([]),
                    createdAt: new Date(), updatedAt: new Date(),
                });
            }, { label: 'customer number' });
            customer = { id, name, accountId: opp?.accountId ?? null };
            customerCreated = true;
            await auditAs(orgId, userId, { action: 'dispatch_customer.created', entityType: 'dispatch_customer', entityId: id, entityName: name, detail: `from quote ${quote.quoteNumber}` });
        }

        // ── the job ──────────────────────────────────────────────────────────
        const { title, description } = jobFromQuote(quote, opp);
        const jobId = 'djob_' + randomUUID();
        const now = new Date();
        await withNumberRetry(async () => {
            const jobNumber = await nextJobNumber(orgId);
            await db.insert(dispatchJobs).values({
                id: jobId, orgId, jobNumber,
                customerId: customer.id,
                accountId: opp?.accountId ?? customer.accountId ?? null,
                opportunityId: quote.opportunityId ?? null,
                quoteId: quote.id,
                title, description,
                trade: '', jobType: '',
                status: 'unscheduled', priority: 'normal', timeSlot: 'anytime',
                needSkills: JSON.stringify([]), coTechIds: JSON.stringify([]),
                equipmentIds: JSON.stringify([]), assignedEquipmentIds: JSON.stringify([]),
                tags: JSON.stringify([]), customFields: JSON.stringify({}),
                invoiceStatus: 'none',
                createdBy: userId ?? null,
                createdAt: now, updatedAt: now,
            });
        }, { label: 'job number' });

        // ── the lines: the quote's, at the price the customer accepted ───────
        const quoteLines = Array.isArray(quote.lineItems) ? quote.lineItems : [];
        let lineCount = 0;
        if (quoteLines.length) {
            const ids = [...new Set(quoteLines.map(li => li?.productId).filter(Boolean))];
            const catalog = ids.length
                ? await db.select({ id: products.id, name: products.name, sku: products.sku, productType: products.productType, listPrice: products.listPrice, unit: products.unit })
                    .from(products).where(eq(products.orgId, orgId))
                : [];
            const byId = new Map(catalog.map(p => [p.id, p]));
            const types = cleanProductTypes(extra.productTypes);   // the Admin's kinds
            const rows = quoteLines.map((li, i) => ({
                id: 'djli_' + randomUUID(), orgId, jobId,
                ...quoteLineToJobItem(li, i, byId.get(li?.productId) || null, types),
                createdAt: now, updatedAt: now,
            }));
            await db.insert(dispatchJobLineItems).values(rows);
            lineCount = rows.length;
        }

        await db.insert(dispatchJobStatusHistory).values({
            id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            orgId, jobId, fromStatus: null, toStatus: 'unscheduled',
            changedBy: userId ?? null, note: `Job created from quote ${quote.quoteNumber} v${quote.version || 1}`, createdAt: now,
        }).catch(() => {}); // non-fatal, as dispatch-jobs.mjs treats it

        const [written] = await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.id, jobId), eq(dispatchJobs.orgId, orgId)));
        await auditAs(orgId, userId, {
            action: 'dispatch_job.created_from_quote', entityType: 'dispatch_job', entityId: jobId,
            entityName: `${written.jobNumber} · ${written.title || 'Untitled'}`,
            detail: `from ${quote.quoteNumber} v${quote.version || 1} · ${lineCount} line item${lineCount === 1 ? '' : 's'}${customerCreated ? ' · customer created' : ''}`,
        });
        return reply(201, { job: { ...normaliseJob(written), invoice: null }, customerCreated });
    } catch (err) {
        console.error('quote-to-job error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'quote-to-job') };
    }
};
