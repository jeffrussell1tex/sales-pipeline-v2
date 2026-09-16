// src/utils/invoices.js — quote → job → invoice, the pure half (state §0.149).
//
// No React, no db. Run by tests/invoices.test.mjs; imported by
// netlify/functions/quote-to-job.mjs and invoices.mjs (the writers), by
// QuotesTab (the Customer-accepted and Create-job controls) and by DispatchTab
// (the invoice panel and the Invoices view) — so the vocabulary, the arithmetic
// and the transitions live in exactly one place.
//
// The chain, in words:
//   • a quote the customer ACCEPTED can become ONE dispatch job (quote-to-job);
//     the job carries the quote's lines as its own line items and quote_id;
//   • a job can carry ONE live invoice at a time (draft → issued → paid, or
//     void at any point before paid); the lines are snapshotted onto the
//     invoice when it is created and editable only while it is a draft;
//   • dispatch_jobs.invoice_amount / invoice_status / invoice_paid_at MIRROR the
//     job's live invoice — written by invoices.mjs alone (guide §18b44).

export const INVOICE_STATUSES = Object.freeze(['draft', 'issued', 'paid', 'void']);

// From each status, where it may go. Nothing leaves paid or void.
export const INVOICE_TRANSITIONS = Object.freeze({
    draft:  Object.freeze(['issued', 'void']),
    issued: Object.freeze(['paid', 'void']),
    paid:   Object.freeze([]),
    void:   Object.freeze([]),
});

export const canTransition = (from, to) => (INVOICE_TRANSITIONS[from] || []).includes(to);

// Lines, terms and dates change only on a draft. An issued invoice is what the
// customer was sent; a paid one is what they paid.
export const isInvoiceEditable = (status) => status === 'draft';

// A live invoice is one that still counts: not void.
export const isLiveInvoice = (inv) => !!inv && inv.status !== 'void';

export const INVOICE_STATUS_LABELS = Object.freeze({ draft: 'Draft', issued: 'Issued', paid: 'Paid', void: 'Void' });
export const invoiceStatusLabel = (s) => INVOICE_STATUS_LABELS[s] || String(s || '');

// dispatch_job_line_items.item_type, and the invoice line's kind.
export const JOB_LINE_TYPES = Object.freeze(['labor', 'part', 'material', 'fee', 'discount']);

export const DEFAULT_PAYMENT_TERMS = 'Net 30';

// ── Product & service types (Jeff, 16 Sep: "leave it definable by admin") ────
// The org's own vocabulary for what a price-book item IS, and the job line kind
// each becomes when a quote turns into a job. Stored at settings.extra
// .productTypes as [{ id, name, lineKind }]; three built-ins are always present
// (their ids are what quotes.mjs, quote-pdf.mjs and the tab already branch on —
// 'recurring' annualises a monthly price), their kinds editable, never removed;
// an Admin adds more under Settings → Quoting → Product & service types.
export const BUILTIN_PRODUCT_TYPES = Object.freeze([
    Object.freeze({ id: 'recurring', name: 'Recurring', lineKind: 'fee' }),
    Object.freeze({ id: 'one_time',  name: 'One-time',  lineKind: 'part' }),
    Object.freeze({ id: 'service',   name: 'Service',   lineKind: 'labor' }),
]);
export const DEFAULT_PRODUCT_TYPES = BUILTIN_PRODUCT_TYPES;
const BUILTIN_IDS = BUILTIN_PRODUCT_TYPES.map(t => t.id);

/**
 * The stored list, cleaned: the built-ins first and always (a stored kind wins,
 * the name is fixed), then every custom type with an id, a name and a kind —
 * an unknown kind is a part, a blank name or a duplicate id drops. The result
 * is what every reader — the settings GET, the quote's Type select, the quote →
 * job mapping — works from, so an org that never saved anything sees the three.
 */
export function cleanProductTypes(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const byId = new Map();
    for (const t of list) {
        if (!t || typeof t !== 'object') continue;
        const id = String(t.id ?? '').trim().slice(0, 20);
        if (!/^[a-z0-9_]+$/.test(id) || byId.has(id)) continue;
        const lineKind = JOB_LINE_TYPES.includes(t.lineKind) ? t.lineKind : 'part';
        const name = String(t.name ?? '').trim().slice(0, 60);
        byId.set(id, { id, name, lineKind });
    }
    const out = BUILTIN_PRODUCT_TYPES.map(b => ({ id: b.id, name: b.name, lineKind: byId.get(b.id)?.lineKind || b.lineKind }));
    for (const [id, t] of byId) {
        if (BUILTIN_IDS.includes(id) || !t.name) continue;
        out.push(t);
    }
    return out;
}

/** The job line kind a product type becomes; a type the org has not defined is a part. */
export function lineKindFor(productTypeId, types = DEFAULT_PRODUCT_TYPES) {
    const id = String(productTypeId || '').replace('-', '_');
    const t = (Array.isArray(types) ? types : []).find(x => x?.id === id);
    return t && JOB_LINE_TYPES.includes(t.lineKind) ? t.lineKind : 'part';
}

/** The type's display name, else the id as typed (never blank when an id exists). */
export function productTypeLabel(productTypeId, types = DEFAULT_PRODUCT_TYPES) {
    const id = String(productTypeId || '').replace('-', '_');
    return (Array.isArray(types) ? types : []).find(x => x?.id === id)?.name || productTypeId || '—';
}

// The quote statuses a customer decision can follow. 'Sent' is the server's
// word (quotes.mjs QUOTE_STATUS_ACTIONS); 'Sent to Customer' the tab's.
export const QUOTE_ACCEPTABLE_STATUSES = Object.freeze(['Approved', 'Sent', 'Sent to Customer', 'Negotiating']);
export const quoteCanBeAccepted = (quote) => QUOTE_ACCEPTABLE_STATUSES.includes(quote?.status);
// Only an accepted quote becomes work.
export const quoteCanBecomeJob = (quote) => quote?.status === 'Accepted';

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const cents = (n) => Math.round(n * 100) / 100;

export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

// Local calendar day, never toISOString (which is UTC and shifts a day in the
// evening on this side of Greenwich).
export const todayYmd = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Calendar arithmetic on a calendar day: anchored in UTC so no zone can move
// it, and read back part by part (never toISOString — tests/date-local.test.mjs).
export const addDaysYmd = (ymd, n) => {
    if (!isYmd(ymd)) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + num(n, 0)));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

/**
 * The invoice's lines, allowlisted and coerced. A line with no description is
 * dropped; quantity defaults to 1 and must be positive; unit price may be
 * negative (a discount line); an unknown kind is a part; taxable unless said
 * otherwise. totalPrice is always recomputed — never trusted from the client.
 */
export function cleanInvoiceLines(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const li of raw) {
        if (!li || typeof li !== 'object') continue;
        const description = String(li.description ?? '').trim();
        if (!description) continue;
        const q = num(li.quantity, 1);
        const quantity = q > 0 ? q : 1;
        const unitPrice = cents(num(li.unitPrice, 0));
        out.push({
            itemType:    JOB_LINE_TYPES.includes(li.itemType) ? li.itemType : 'part',
            description: description.slice(0, 500),
            partNumber:  li.partNumber != null && String(li.partNumber).trim() ? String(li.partNumber).trim().slice(0, 100) : null,
            quantity,
            unitPrice,
            totalPrice:  cents(quantity * unitPrice),
            taxable:     !(li.taxable === false || li.taxable === 'false'),
        });
    }
    return out;
}

/** dispatch_job_line_items rows → invoice lines, in the job's own order. */
export function linesFromJobItems(rows) {
    const sorted = (Array.isArray(rows) ? rows : []).slice()
        .sort((a, b) => num(a.sortOrder, 0) - num(b.sortOrder, 0));
    return cleanInvoiceLines(sorted.map(r => ({
        itemType: r.itemType, description: r.description, partNumber: r.partNumber,
        quantity: r.quantity, unitPrice: r.unitPrice, taxable: r.taxable,
    })));
}

/**
 * Subtotal, tax on the taxable lines only, total — to the cent. The rate is a
 * percentage (8.25 means 8.25%), clamped to 0–100.
 */
export function invoiceTotals(lines, taxRate) {
    const rate = Math.min(Math.max(num(taxRate, 0), 0), 100);
    let subtotal = 0, taxable = 0;
    for (const li of Array.isArray(lines) ? lines : []) {
        const t = num(li.totalPrice, num(li.quantity, 1) * num(li.unitPrice, 0));
        subtotal += t;
        if (li.taxable !== false) taxable += t;
    }
    subtotal = cents(subtotal);
    const taxAmount = cents(taxable * rate / 100);
    return { subtotal, taxRate: rate, taxAmount, total: cents(subtotal + taxAmount) };
}

/** "Net 30" → thirty days after the issue date; "Due on receipt" → the issue date; anything else → null. */
export function dueDateFromTerms(issueDate, terms) {
    if (!isYmd(issueDate)) return null;
    const t = String(terms || '').toLowerCase();
    if (/receipt/.test(t)) return issueDate;
    const m = t.match(/net\s*(\d{1,3})/);
    if (!m) return null;
    return addDaysYmd(issueDate, parseInt(m[1], 10));
}

/**
 * What a client may change on a DRAFT, validated. Unknown keys are ignored;
 * a bad date is an error, not a silent drop. Returns { patch, errors }.
 */
export function cleanInvoicePatch(data) {
    const patch = {}, errors = [];
    const d = data && typeof data === 'object' ? data : {};
    for (const k of ['issueDate', 'dueDate', 'paidAt']) {
        if (!(k in d)) continue;
        if (d[k] == null || d[k] === '') { patch[k] = null; continue; }
        if (!isYmd(d[k])) { errors.push(`${k} must be YYYY-MM-DD`); continue; }
        patch[k] = d[k];
    }
    if ('paymentTerms' in d)     patch.paymentTerms     = d.paymentTerms ? String(d.paymentTerms).slice(0, 100) : null;
    if ('customerPoNumber' in d) patch.customerPoNumber = d.customerPoNumber ? String(d.customerPoNumber).slice(0, 100) : null;
    if ('notes' in d)            patch.notes            = d.notes ? String(d.notes) : null;
    if ('taxRate' in d) {
        const r = num(d.taxRate, NaN);
        if (!Number.isFinite(r) || r < 0 || r > 100) errors.push('taxRate must be between 0 and 100');
        else patch.taxRate = r;
    }
    if ('lineItems' in d) {
        if (!Array.isArray(d.lineItems)) errors.push('lineItems must be a list');
        else patch.lineItems = cleanInvoiceLines(d.lineItems);
    }
    return { patch, errors };
}

/** The three job columns that mirror the job's live invoice. */
export function mirrorForJob(invoice) {
    if (!invoice) return { invoiceAmount: null, invoiceStatus: 'none', invoicePaidAt: null };
    return {
        invoiceAmount: invoice.total != null ? String(invoice.total) : null,
        invoiceStatus: invoice.status || 'none',
        invoicePaidAt: invoice.paidAt || null,
    };
}

// ── quote → job ──────────────────────────────────────────────────────────────

/**
 * A quote line as a job line item. The KIND comes from the org's product &
 * service types (lineKindFor — the Admin's mapping, never a guess here); the
 * unit price is the NET price (list less the line's discount), the number the
 * customer accepted. `product` (optional) supplies the SKU and fills what the
 * line lacks; `types` is the org's cleaned list.
 */
export function quoteLineToJobItem(li, index = 0, product = null, types = DEFAULT_PRODUCT_TYPES) {
    const q = num(li?.quantity, 1);
    const quantity = q > 0 ? q : 1;
    const list = num(li?.listPrice ?? product?.listPrice, 0);
    const disc = Math.min(Math.max(num(li?.discountPct, 0), 0), 100);
    const unitPrice = cents(list * (1 - disc / 100));
    const itemType = lineKindFor(li?.productType || product?.productType, types);
    return {
        itemType,
        description: String(li?.productName || product?.name || 'Quoted item').slice(0, 500),
        partNumber:  product?.sku ? String(product.sku).slice(0, 100) : null,
        quantity:    String(quantity),
        unitPrice:   unitPrice.toFixed(2),
        totalPrice:  cents(unitPrice * quantity).toFixed(2),
        taxable:     true,
        sortOrder:   index,
    };
}

/** The job's title and description from the quote (the " vN" suffix dropped). */
export function jobFromQuote(quote, opp) {
    const base = String(quote?.name || '').replace(/\s+v\d+\s*$/i, '').trim();
    const title = base || opp?.opportunityName || opp?.account || 'Job from quote';
    const description = `From quote ${quote?.quoteNumber || ''} v${quote?.version || 1}`.replace(/\s+/g, ' ').trim();
    return { title: title.slice(0, 500), description };
}

/**
 * The dispatch customer for an opportunity: the one linked to its account,
 * else the one whose name matches its account name — the bridge's own rule
 * (DispatchTab buildWonBridgeJobs). Null means "create one".
 */
export function resolveCustomerForOpp(customers, opp) {
    const list = Array.isArray(customers) ? customers : [];
    if (opp?.accountId) {
        const byAccount = list.find(c => c.accountId && c.accountId === opp.accountId);
        if (byAccount) return byAccount;
    }
    const name = String(opp?.account || '').trim().toLowerCase();
    if (!name) return null;
    return list.find(c => String(c.name || '').trim().toLowerCase() === name) || null;
}

/** Money the app's way: $1,234.50 — always two places on an invoice. */
export const fmtMoney = (n) => {
    const v = num(n, 0);
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-$' : '$') + s;
};
