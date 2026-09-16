// netlify/functions/invoices.mjs — the invoice a job produces (state §0.149).
//
// GET                 → { invoices } — the org's, newest first; ?jobId= narrows; ?id= one
// POST { jobId, … }   → 201 { invoice, job } — a DRAFT from the job's line items
//                       (or the body's), numbered INV-YYYY-NNNN, terms from the
//                       quote the job came from (else Net 30), due date from the
//                       terms. One live (non-void) invoice per job: 409 otherwise.
// PUT ?id= { … }      → 200 { invoice, job } — on a draft: lines, tax rate, dates,
//                       terms, PO, notes (totals recomputed here, never trusted);
//                       and/or a status move: issued (stamps issuedAt), paid
//                       ({ paidAt?, amountPaid? } — defaults today and the total),
//                       void. A move the table forbids is a 422, as is editing
//                       lines on anything but a draft.
// DELETE ?id=         → 200 — a DRAFT only, Admin only.
//
// Every write re-mirrors the job's three invoice_* columns from the job's live
// invoice (guide §18b44) and returns the job row so the client adopts it.
// Technicians see none of this (403 on every method); ReadOnly reads.
import { db } from '../../db/index.js';
import { invoices, quotes, dispatchJobs, dispatchJobLineItems } from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { verifyAuth, requireWrite, isTechnician, isAdmin } from './auth.mjs';
import { serverErrorBody, withNumberRetry, auditAs } from './_lib.mjs';
import { normaliseJob } from './dispatch-jobs.mjs';
import {
    canTransition, isInvoiceEditable, isLiveInvoice, cleanInvoicePatch, linesFromJobItems,
    invoiceTotals, dueDateFromTerms, isYmd, todayYmd, mirrorForJob, DEFAULT_PAYMENT_TERMS,
} from '../../src/utils/invoices.js';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// INV-2026-0001, per org per year, server-issued and immutable — the same
// shape and the same SQL as nextJobNumber (the numeric part MAX'd as an
// integer, TRIM'd, the year prefix narrowing the scan). A collision on the
// unique (org, number) index is retried by withNumberRetry.
async function nextInvoiceNumber(orgId) {
    const year   = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const [row] = await db
        .select({ max: sql`MAX(CAST(SUBSTRING(TRIM(${invoices.invoiceNumber}) FROM ${'^' + prefix + '([0-9]+)$'}) AS INTEGER))` })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), sql`TRIM(${invoices.invoiceNumber}) ~ ${'^' + prefix + '[0-9]+$'}`));
    const max = parseInt(row?.max, 10) || 0;
    return prefix + String(max + 1).padStart(4, '0');
}

// Decimal columns come back as strings; the client wants numbers to add.
function normaliseInvoice(row) {
    if (!row) return null;
    const n = (v) => (v == null ? null : Number(v));
    return {
        ...row,
        lineItems:  Array.isArray(row.lineItems) ? row.lineItems : [],
        subtotal:   n(row.subtotal), taxRate: n(row.taxRate), taxAmount: n(row.taxAmount),
        total:      n(row.total),    amountPaid: n(row.amountPaid),
    };
}

const totalsFor = (lines, taxRate) => {
    const t = invoiceTotals(lines, taxRate);
    return { subtotal: t.subtotal.toFixed(2), taxRate: t.taxRate.toFixed(2), taxAmount: t.taxAmount.toFixed(2), total: t.total.toFixed(2) };
};

// The job's live invoice, newest first — what the mirror follows.
async function liveInvoiceFor(orgId, jobId) {
    if (!jobId) return null;
    const rows = await db.select().from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.jobId, jobId)))
        .orderBy(desc(invoices.createdAt));
    return rows.find(isLiveInvoice) || null;
}

// Re-mirror the job from its live invoice; return the job as the client reads it.
async function mirrorJob(orgId, jobId) {
    if (!jobId) return null;
    const live = await liveInvoiceFor(orgId, jobId);
    await db.update(dispatchJobs).set({ ...mirrorForJob(live ? normaliseInvoice(live) : null), updatedAt: new Date() })
        .where(and(eq(dispatchJobs.id, jobId), eq(dispatchJobs.orgId, orgId)));
    const [job] = await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.id, jobId), eq(dispatchJobs.orgId, orgId)));
    return job ? normaliseJob(job) : null;
}

const detailOf = (inv) => `${inv.status} · $${Number(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}${inv.dueDate ? ' · due ' + inv.dueDate : ''}`;

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return reply(auth.status || 401, { error: auth.error });
    const { orgId, userId } = auth;
    if (isTechnician(auth.userRole)) return reply(403, { error: 'Technicians cannot view invoices.' });
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    const params = event.queryStringParameters || {};

    try {
        if (event.httpMethod === 'GET') {
            if (params.id) {
                const [row] = await db.select().from(invoices).where(and(eq(invoices.id, params.id), eq(invoices.orgId, orgId)));
                if (!row) return reply(404, { error: 'Not found' });
                return reply(200, { invoice: normaliseInvoice(row) });
            }
            const where = params.jobId
                ? and(eq(invoices.orgId, orgId), eq(invoices.jobId, params.jobId))
                : eq(invoices.orgId, orgId);
            const rows = await db.select().from(invoices).where(where).orderBy(desc(invoices.createdAt));
            return reply(200, { invoices: rows.map(normaliseInvoice) });
        }

        if (event.httpMethod === 'POST') {
            let data;
            try { data = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid JSON' }); }
            const jobId = String(data.jobId || '').trim();
            if (!jobId) return reply(400, { error: 'jobId is required' });

            const [job] = await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.id, jobId), eq(dispatchJobs.orgId, orgId)));
            if (!job) return reply(404, { error: 'Job not found' });
            const live = await liveInvoiceFor(orgId, jobId);
            if (live) return reply(409, { error: `${live.invoiceNumber} is already open on this job. Void it to start another.`, invoice: normaliseInvoice(live) });

            const { patch, errors } = cleanInvoicePatch(data);
            if (errors.length) return reply(400, { error: errors.join('; ') });

            // Lines: the body's when it sends any, else the job's own line items.
            let lines = patch.lineItems;
            if (!lines) {
                const items = await db.select().from(dispatchJobLineItems)
                    .where(and(eq(dispatchJobLineItems.orgId, orgId), eq(dispatchJobLineItems.jobId, jobId)));
                lines = linesFromJobItems(items);
            }
            // Terms: the quote the job came from, else the house default.
            let paymentTerms = patch.paymentTerms;
            if (paymentTerms === undefined) {
                const [q] = job.quoteId
                    ? await db.select({ paymentTerms: quotes.paymentTerms }).from(quotes).where(and(eq(quotes.id, job.quoteId), eq(quotes.orgId, orgId))).limit(1)
                    : [null];
                paymentTerms = q?.paymentTerms || DEFAULT_PAYMENT_TERMS;
            }
            const issueDate = patch.issueDate === undefined ? todayYmd() : patch.issueDate;
            const dueDate   = patch.dueDate   === undefined ? dueDateFromTerms(issueDate, paymentTerms) : patch.dueDate;
            const taxRate   = patch.taxRate ?? 0;
            const id = 'inv_' + randomUUID();
            const now = new Date();
            const [inserted] = await withNumberRetry(async () => {
                const invoiceNumber = await nextInvoiceNumber(orgId);
                return db.insert(invoices).values({
                    id, orgId, invoiceNumber,
                    jobId, quoteId: job.quoteId ?? null, customerId: job.customerId ?? null,
                    accountId: job.accountId ?? null, opportunityId: job.opportunityId ?? null,
                    status: 'draft', issueDate, dueDate, paymentTerms,
                    customerPoNumber: patch.customerPoNumber ?? job.customerPoNumber ?? null,
                    lineItems: lines, ...totalsFor(lines, taxRate),
                    amountPaid: null, paidAt: null, notes: patch.notes ?? null,
                    createdBy: userId ?? null, createdAt: now, updatedAt: now,
                }).returning();
            }, { label: 'invoice number' });
            const mirrored = await mirrorJob(orgId, jobId);
            await auditAs(orgId, userId, { action: 'invoice.created', entityType: 'invoice', entityId: inserted.id, entityName: inserted.invoiceNumber, detail: `${detailOf(inserted)} · ${job.jobNumber || jobId} · ${lines.length} line item${lines.length === 1 ? '' : 's'}` });
            return reply(201, { invoice: normaliseInvoice(inserted), job: mirrored });
        }

        if (event.httpMethod === 'PUT') {
            const id = params.id;
            if (!id) return reply(400, { error: 'id required' });
            let data;
            try { data = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid JSON' }); }
            const [current] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)));
            if (!current) return reply(404, { error: 'Not found' });

            const { patch, errors } = cleanInvoicePatch(data);
            if (errors.length) return reply(400, { error: errors.join('; ') });
            const editing = Object.keys(patch).filter(k => k !== 'paidAt');
            if (editing.length && !isInvoiceEditable(current.status)) {
                return reply(422, { error: `${current.invoiceNumber} is ${current.status} — only a draft can be edited.` });
            }

            const updates = { updatedAt: new Date() };
            for (const k of ['issueDate', 'dueDate', 'paymentTerms', 'customerPoNumber', 'notes']) if (k in patch) updates[k] = patch[k];
            const lines   = patch.lineItems ?? (Array.isArray(current.lineItems) ? current.lineItems : []);
            const taxRate = patch.taxRate ?? Number(current.taxRate || 0);
            if ('lineItems' in patch || 'taxRate' in patch) { updates.lineItems = lines; Object.assign(updates, totalsFor(lines, taxRate)); }
            if ('issueDate' in patch && !('dueDate' in patch) && patch.issueDate) {
                const due = dueDateFromTerms(patch.issueDate, updates.paymentTerms ?? current.paymentTerms);
                if (due) updates.dueDate = due;
            }

            let action = 'invoice.updated';
            const to = data.status;
            if (to !== undefined && to !== current.status) {
                if (!canTransition(current.status, to)) {
                    return reply(422, { error: `${current.invoiceNumber} cannot go from ${current.status} to ${to}.` });
                }
                updates.status = to;
                if (to === 'issued') {
                    updates.issuedAt = new Date();
                    if (!current.issueDate && !updates.issueDate) updates.issueDate = todayYmd();
                    action = 'invoice.issued';
                } else if (to === 'paid') {
                    const paidAt = patch.paidAt ?? todayYmd();
                    if (!isYmd(paidAt)) return reply(400, { error: 'paidAt must be YYYY-MM-DD' });
                    const amt = data.amountPaid == null || data.amountPaid === '' ? Number(current.total || 0) : Number(data.amountPaid);
                    if (!Number.isFinite(amt) || amt < 0) return reply(400, { error: 'amountPaid must be a number' });
                    updates.paidAt = paidAt;
                    updates.amountPaid = amt.toFixed(2);
                    action = 'invoice.paid';
                } else if (to === 'void') {
                    updates.voidedAt = new Date();
                    action = 'invoice.voided';
                }
            }

            const [updated] = await db.update(invoices).set(updates)
                .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId))).returning();
            const mirrored = await mirrorJob(orgId, updated.jobId);
            const changed = Object.keys(updates).filter(k => k !== 'updatedAt');
            await auditAs(orgId, userId, { action, entityType: 'invoice', entityId: updated.id, entityName: updated.invoiceNumber, detail: `${detailOf(updated)}${action === 'invoice.updated' ? ' · ' + changed.join(', ') : ''}`.slice(0, 300) });
            return reply(200, { invoice: normaliseInvoice(updated), job: mirrored });
        }

        if (event.httpMethod === 'DELETE') {
            if (!isAdmin(auth.userRole)) return reply(403, { error: 'Admin only' });
            const id = params.id;
            if (!id) return reply(400, { error: 'id required' });
            const [current] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)));
            if (!current) return reply(404, { error: 'Not found' });
            if (current.status !== 'draft') return reply(422, { error: `${current.invoiceNumber} is ${current.status} — void it instead of deleting it.` });
            await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)));
            const mirrored = await mirrorJob(orgId, current.jobId);
            await auditAs(orgId, userId, { action: 'invoice.deleted', entityType: 'invoice', entityId: current.id, entityName: current.invoiceNumber, detail: detailOf(current) });
            return reply(200, { ok: true, job: mirrored });
        }

        return reply(405, { error: 'Method not allowed' });
    } catch (err) {
        console.error('invoices error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'invoices') };
    }
};
