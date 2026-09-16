// tests/invoices.test.mjs
//
// Quote → job → invoice (state §0.149). The pure module is RUN here — the
// transitions, the line cleaning, the totals, the terms, the quote-line
// mapping, the customer resolution. The wiring — the schema and its apply
// script, the two endpoints' gates and their org scoping, the job endpoint's
// refusal to write the mirror or the quote link, the Quotes card, the Dispatch
// panel and view, the audit category — is pinned by source scan (§18b23), and
// the whole path is proven against the real test database in
// tests/integration/invoices.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
    INVOICE_STATUSES, INVOICE_TRANSITIONS, canTransition, isInvoiceEditable, isLiveInvoice, invoiceStatusLabel,
    JOB_LINE_TYPES, DEFAULT_PAYMENT_TERMS, QUOTE_ACCEPTABLE_STATUSES, quoteCanBeAccepted, quoteCanBecomeJob,
    isYmd, todayYmd, addDaysYmd, cleanInvoiceLines, linesFromJobItems, invoiceTotals, dueDateFromTerms,
    cleanInvoicePatch, mirrorForJob, quoteLineToJobItem, jobFromQuote, resolveCustomerForOpp, fmtMoney,
    BUILTIN_PRODUCT_TYPES, DEFAULT_PRODUCT_TYPES, cleanProductTypes, lineKindFor, productTypeLabel,
} from '../src/utils/invoices.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the vocabulary and the transitions ───────────────────────────────────────

test('four statuses; draft goes to issued or void, issued to paid or void, and nothing leaves paid or void', () => {
    assert.deepEqual([...INVOICE_STATUSES], ['draft', 'issued', 'paid', 'void']);
    assert.ok(canTransition('draft', 'issued') && canTransition('draft', 'void'));
    assert.ok(canTransition('issued', 'paid') && canTransition('issued', 'void'));
    assert.equal(canTransition('draft', 'paid'), false, 'a draft is not paid — it is issued first');
    assert.equal(canTransition('paid', 'void'), false, 'money received is not undone by a status');
    assert.equal(canTransition('void', 'issued'), false);
    assert.equal(canTransition('issued', 'draft'), false);
    assert.equal(canTransition('bogus', 'issued'), false);
    assert.deepEqual([...INVOICE_TRANSITIONS.paid], []);
    assert.deepEqual([...INVOICE_TRANSITIONS.void], []);
    assert.equal(isInvoiceEditable('draft'), true);
    for (const s of ['issued', 'paid', 'void', undefined]) assert.equal(isInvoiceEditable(s), false, `${s} is not editable`);
    assert.equal(isLiveInvoice({ status: 'void' }), false);
    assert.equal(isLiveInvoice({ status: 'paid' }), true);
    assert.equal(isLiveInvoice(null), false);
    assert.equal(invoiceStatusLabel('issued'), 'Issued');
    assert.equal(invoiceStatusLabel('nope'), 'nope');
    assert.deepEqual([...JOB_LINE_TYPES], ['labor', 'part', 'material', 'fee', 'discount']);
    assert.equal(DEFAULT_PAYMENT_TERMS, 'Net 30');
});

test('a quote is accepted from Approved, Sent, Sent to Customer or Negotiating; only an Accepted quote becomes a job', () => {
    assert.deepEqual([...QUOTE_ACCEPTABLE_STATUSES], ['Approved', 'Sent', 'Sent to Customer', 'Negotiating']);
    for (const s of QUOTE_ACCEPTABLE_STATUSES) assert.ok(quoteCanBeAccepted({ status: s }), s);
    for (const s of ['Draft', 'Pending Approval', 'Accepted', 'Rejected / Lost', undefined]) assert.equal(quoteCanBeAccepted({ status: s }), false, `${s}`);
    assert.equal(quoteCanBecomeJob({ status: 'Accepted' }), true);
    for (const s of ['Draft', 'Approved', 'Sent to Customer', 'Declined']) assert.equal(quoteCanBecomeJob({ status: s }), false, s);
    assert.equal(quoteCanBecomeJob(null), false);
});

// ── dates ────────────────────────────────────────────────────────────────────

test('isYmd, todayYmd and addDaysYmd: calendar days, never a UTC shift', () => {
    assert.ok(isYmd('2026-09-16'));
    assert.equal(isYmd('2026-9-16'), false);
    assert.equal(isYmd('2026-13-40'), false);
    assert.equal(isYmd(20260916), false);
    assert.equal(todayYmd(new Date(2026, 8, 16, 23, 30)), '2026-09-16', 'late evening is still today locally');
    assert.equal(addDaysYmd('2026-01-31', 30), '2026-03-02');
    assert.equal(addDaysYmd('2026-12-25', 10), '2027-01-04');
    assert.equal(addDaysYmd('bad', 3), null);
});

test('dueDateFromTerms: Net N adds N days, Due on receipt is the issue date, anything else is unknown', () => {
    assert.equal(dueDateFromTerms('2026-09-16', 'Net 30 · Annual'), '2026-10-16', 'the quote’s own terms string');
    assert.equal(dueDateFromTerms('2026-09-16', 'net15'), '2026-10-01');
    assert.equal(dueDateFromTerms('2026-09-16', 'Due on receipt'), '2026-09-16');
    assert.equal(dueDateFromTerms('2026-09-16', 'Annual'), null);
    assert.equal(dueDateFromTerms('2026-09-16', ''), null);
    assert.equal(dueDateFromTerms('not a date', 'Net 30'), null);
});

// ── lines and totals ─────────────────────────────────────────────────────────

test('cleanInvoiceLines: allowlisted, coerced, recomputed — a blank line drops, a bad kind is a part, a lying total is ignored', () => {
    assert.deepEqual(cleanInvoiceLines(undefined), []);
    assert.deepEqual(cleanInvoiceLines('x'), []);
    const out = cleanInvoiceLines([
        { description: '  Compressor  ', itemType: 'part', partNumber: ' CP-9 ', quantity: '2', unitPrice: '149.999', taxable: true, totalPrice: 1 },
        { description: 'Labor', itemType: 'labor', quantity: 0, unitPrice: 95, taxable: 'false' },
        { description: 'Loyalty discount', itemType: 'discount', quantity: 1, unitPrice: -20 },
        { description: '', quantity: 5, unitPrice: 100 },
        { description: 'Mystery', itemType: 'gadget', quantity: 'many', unitPrice: 'free', extra: 'ignored' },
        null, 7,
    ]);
    assert.deepEqual(out, [
        { itemType: 'part', description: 'Compressor', partNumber: 'CP-9', quantity: 2, unitPrice: 150, totalPrice: 300, taxable: true },
        { itemType: 'labor', description: 'Labor', partNumber: null, quantity: 1, unitPrice: 95, totalPrice: 95, taxable: false },
        { itemType: 'discount', description: 'Loyalty discount', partNumber: null, quantity: 1, unitPrice: -20, totalPrice: -20, taxable: true },
        { itemType: 'part', description: 'Mystery', partNumber: null, quantity: 1, unitPrice: 0, totalPrice: 0, taxable: true },
    ]);
    assert.equal(Object.keys(out[0]).includes('extra'), false, 'unknown keys never reach the row');
    assert.equal(cleanInvoiceLines([{ description: 'x'.repeat(600), unitPrice: 1 }])[0].description.length, 500);
});

test('invoiceTotals: tax on the taxable lines only, the rate clamped, everything to the cent', () => {
    const lines = cleanInvoiceLines([
        { description: 'A', quantity: 2, unitPrice: 90, taxable: true },
        { description: 'B', quantity: 1, unitPrice: 500, taxable: true },
        { description: 'C', quantity: 1, unitPrice: 25, taxable: false },
    ]);
    assert.deepEqual(invoiceTotals(lines, 8.25), { subtotal: 705, taxRate: 8.25, taxAmount: 56.1, total: 761.1 });
    assert.deepEqual(invoiceTotals(lines, 0), { subtotal: 705, taxRate: 0, taxAmount: 0, total: 705 });
    assert.deepEqual(invoiceTotals(lines, -5), { subtotal: 705, taxRate: 0, taxAmount: 0, total: 705 }, 'a negative rate is zero');
    assert.equal(invoiceTotals(lines, 500).taxRate, 100, 'a rate above 100 is 100');
    assert.deepEqual(invoiceTotals([], 8), { subtotal: 0, taxRate: 8, taxAmount: 0, total: 0 });
    assert.deepEqual(invoiceTotals(undefined, 'x'), { subtotal: 0, taxRate: 0, taxAmount: 0, total: 0 });
    // three dimes at 8.25% — 0.02475 tax — rounds to two cents, and the float sum of the dimes is a clean 0.30
    const dimes = cleanInvoiceLines([1, 2, 3].map(i => ({ description: 'd' + i, quantity: 1, unitPrice: 0.1 })));
    assert.deepEqual(invoiceTotals(dimes, 8.25), { subtotal: 0.3, taxRate: 8.25, taxAmount: 0.02, total: 0.32 });
    // a line without totalPrice is priced from quantity × unit
    assert.equal(invoiceTotals([{ quantity: 3, unitPrice: 10 }], 0).subtotal, 30);
});

test('linesFromJobItems: the job’s rows, in sort order, decimals coerced', () => {
    const out = linesFromJobItems([
        { itemType: 'labor', description: 'Second', partNumber: null, quantity: '1.50', unitPrice: '95.00', taxable: false, sortOrder: 1 },
        { itemType: 'part', description: 'First', partNumber: 'P1', quantity: '2', unitPrice: '10.00', taxable: true, sortOrder: 0 },
    ]);
    assert.deepEqual(out.map(l => l.description), ['First', 'Second']);
    assert.deepEqual(out[1], { itemType: 'labor', description: 'Second', partNumber: null, quantity: 1.5, unitPrice: 95, totalPrice: 142.5, taxable: false });
    assert.deepEqual(linesFromJobItems(null), []);
});

test('cleanInvoicePatch: the draft’s editable fields, a bad date or rate named, unknown keys ignored', () => {
    const { patch, errors } = cleanInvoicePatch({ issueDate: '2026-09-16', dueDate: '', paymentTerms: 'Net 15', customerPoNumber: 'PO-7', notes: 'Thanks', taxRate: '8.25', lineItems: [{ description: 'A', unitPrice: 1 }], status: 'paid', total: 999, orgId: 'other' });
    assert.deepEqual(Object.keys(patch).sort(), ['customerPoNumber', 'dueDate', 'issueDate', 'lineItems', 'notes', 'paymentTerms', 'taxRate']);
    assert.equal(patch.dueDate, null, 'an empty date clears');
    assert.equal(patch.taxRate, 8.25);
    assert.equal(patch.lineItems[0].totalPrice, 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(cleanInvoicePatch({ issueDate: '16/09/2026' }).errors, ['issueDate must be YYYY-MM-DD']);
    assert.deepEqual(cleanInvoicePatch({ taxRate: 101 }).errors, ['taxRate must be between 0 and 100']);
    assert.deepEqual(cleanInvoicePatch({ lineItems: 'x' }).errors, ['lineItems must be a list']);
    assert.deepEqual(cleanInvoicePatch({ paidAt: '2026-09-20' }).patch, { paidAt: '2026-09-20' });
    assert.deepEqual(cleanInvoicePatch(null), { patch: {}, errors: [] });
});

test('mirrorForJob: the three job columns from the live invoice, or none', () => {
    assert.deepEqual(mirrorForJob(null), { invoiceAmount: null, invoiceStatus: 'none', invoicePaidAt: null });
    assert.deepEqual(mirrorForJob({ total: 761.1, status: 'paid', paidAt: '2026-09-20' }), { invoiceAmount: '761.1', invoiceStatus: 'paid', invoicePaidAt: '2026-09-20' });
    assert.deepEqual(mirrorForJob({ total: '590.00', status: 'draft' }), { invoiceAmount: '590.00', invoiceStatus: 'draft', invoicePaidAt: null });
});

// ── quote → job ──────────────────────────────────────────────────────────────

// ── product & service types — the Admin's kinds ──────────────────────────────

test('cleanProductTypes: the three built-ins always and first (names fixed, kinds the Admin’s), then the org’s own; a bad kind is a part, a blank name or a bad id drops', () => {
    assert.deepEqual(cleanProductTypes(undefined), [...BUILTIN_PRODUCT_TYPES].map(t => ({ ...t })));
    assert.equal(DEFAULT_PRODUCT_TYPES, BUILTIN_PRODUCT_TYPES);
    assert.deepEqual(cleanProductTypes([
        { id: 'service', name: 'Renamed', lineKind: 'fee' },              // a built-in: the kind wins, the name does not
        { id: 'pt_equip', name: ' Equipment ', lineKind: 'material' },
        { id: 'pt_permit', name: 'Permit', lineKind: 'gadget', extra: 1 },  // unknown kind → part; unknown key dropped
        { id: 'pt_blank', name: '  ', lineKind: 'fee' },                    // no name
        { id: 'Bad Id!', name: 'x', lineKind: 'fee' },                      // bad id
        { id: 'pt_equip', name: 'Duplicate', lineKind: 'labor' },           // duplicate id
        null, 'x',
    ]), [
        { id: 'recurring', name: 'Recurring', lineKind: 'fee' },
        { id: 'one_time',  name: 'One-time',  lineKind: 'part' },
        { id: 'service',   name: 'Service',   lineKind: 'fee' },
        { id: 'pt_equip',  name: 'Equipment', lineKind: 'material' },
        { id: 'pt_permit', name: 'Permit',    lineKind: 'part' },
    ]);
    assert.equal(cleanProductTypes([{ id: 'pt_' + 'x'.repeat(40), name: 'Long', lineKind: 'fee' }])[3].id.length, 20, 'an id fits products.product_type varchar(20)');
});

test('lineKindFor and productTypeLabel: the type decides the kind; an undefined type is a part and keeps its id as its label', () => {
    const types = cleanProductTypes([{ id: 'service', lineKind: 'fee' }, { id: 'pt_equip', name: 'Equipment', lineKind: 'material' }]);
    assert.equal(lineKindFor('recurring', types), 'fee');
    assert.equal(lineKindFor('one_time', types), 'part');
    assert.equal(lineKindFor('one-time', types), 'part', 'the hyphenated spelling the tab normalises to');
    assert.equal(lineKindFor('service', types), 'fee', 'the Admin changed it');
    assert.equal(lineKindFor('pt_equip', types), 'material');
    assert.equal(lineKindFor('pt_gone', types), 'part');
    assert.equal(lineKindFor(undefined), 'part');
    assert.equal(lineKindFor('service'), 'labor', 'the default list');
    assert.equal(productTypeLabel('pt_equip', types), 'Equipment');
    assert.equal(productTypeLabel('one-time', types), 'One-time');
    assert.equal(productTypeLabel('pt_gone', types), 'pt_gone');
    assert.equal(productTypeLabel(''), '—');
});

test('quoteLineToJobItem: the NET price the customer accepted; the kind from the org’s types (the Admin’s mapping, no guess from the unit); the SKU from the catalog', () => {
    const product = { id: 'p1', name: 'Platform', sku: 'PLT-1', productType: 'recurring', listPrice: '100.00', unit: 'month' };
    assert.deepEqual(quoteLineToJobItem({ productId: 'p1', productName: 'Platform', productType: 'recurring', unit: 'month', listPrice: 100, quantity: 2, discountPct: 10 }, 3, product),
        { itemType: 'fee', description: 'Platform', partNumber: 'PLT-1', quantity: '2', unitPrice: '90.00', totalPrice: '180.00', taxable: true, sortOrder: 3 });
    assert.equal(quoteLineToJobItem({ productName: 'Install', productType: 'service', listPrice: 500 }).itemType, 'labor');
    assert.equal(quoteLineToJobItem({ productName: 'Consulting', productType: 'one_time', unit: 'hour', listPrice: 150 }).itemType, 'part', 'the unit says nothing — the type does');
    assert.equal(quoteLineToJobItem({ productName: 'Furnace', productType: 'one_time', unit: 'flat', listPrice: 3000 }).itemType, 'part');
    const types = cleanProductTypes([{ id: 'one_time', lineKind: 'material' }, { id: 'pt_permit', name: 'Permit', lineKind: 'fee' }]);
    assert.equal(quoteLineToJobItem({ productName: 'Furnace', productType: 'one_time', listPrice: 3000 }, 0, null, types).itemType, 'material', 'the Admin retyped one-time');
    assert.equal(quoteLineToJobItem({ productId: 'p9', productName: 'City permit', productType: 'pt_permit', listPrice: 120 }, 0, null, types).itemType, 'fee');
    assert.equal(quoteLineToJobItem({ productId: 'p9', productName: 'Old thing', productType: 'pt_removed', listPrice: 1 }, 0, null, types).itemType, 'part', 'a removed type is a part until retyped');
    assert.equal(quoteLineToJobItem({ productName: 'Furnace', productType: 'one-time', listPrice: 3000, discountPct: 150 }).unitPrice, '0.00', 'a discount past 100% is 100%');
    // the catalog fills what the line lacks; a missing product leaves the SKU null
    const fromCatalog = quoteLineToJobItem({ productId: 'p1', quantity: 0 }, 0, product);
    assert.equal(fromCatalog.description, 'Platform');
    assert.equal(fromCatalog.unitPrice, '100.00');
    assert.equal(fromCatalog.quantity, '1', 'a zero quantity is one');
    assert.equal(quoteLineToJobItem({ productName: 'X', listPrice: 1 }).partNumber, null);
    assert.equal(quoteLineToJobItem({}).description, 'Quoted item');
});

test('jobFromQuote: the quote’s name without its version suffix, else the deal; the description names the quote', () => {
    assert.deepEqual(jobFromQuote({ name: 'Acme rooftop units v2', quoteNumber: 'Q-2026-004', version: 2 }, { opportunityName: 'ignored' }),
        { title: 'Acme rooftop units', description: 'From quote Q-2026-004 v2' });
    assert.equal(jobFromQuote({ name: '  ', quoteNumber: 'Q-2026-005' }, { opportunityName: 'Deal name', account: 'Acme' }).title, 'Deal name');
    assert.equal(jobFromQuote({ name: null }, { account: 'Acme' }).title, 'Acme');
    assert.equal(jobFromQuote({}, null).title, 'Job from quote');
    assert.equal(jobFromQuote({ quoteNumber: 'Q-1' }, null).description, 'From quote Q-1 v1');
});

test('resolveCustomerForOpp: the customer on the deal’s account first, else the one named like the account, else none', () => {
    const customers = [
        { id: 'c1', name: 'Acme Corp', accountId: 'acct_1' },
        { id: 'c2', name: 'acme corp', accountId: null },
        { id: 'c3', name: 'Beta', accountId: 'acct_3' },
    ];
    assert.equal(resolveCustomerForOpp(customers, { accountId: 'acct_1', account: 'Something else' }).id, 'c1');
    assert.equal(resolveCustomerForOpp(customers, { accountId: 'acct_missing', account: ' ACME CORP ' }).id, 'c1', 'the first name match');
    assert.equal(resolveCustomerForOpp(customers, { account: 'Gamma' }), null);
    assert.equal(resolveCustomerForOpp(customers, null), null);
    assert.equal(resolveCustomerForOpp(undefined, { account: 'Acme Corp' }), null);
});

test('fmtMoney: two places, a thousands separator, a leading minus', () => {
    assert.equal(fmtMoney(761.1), '$761.10');
    assert.equal(fmtMoney('1234567.891'), '$1,234,567.89');
    assert.equal(fmtMoney(-20), '-$20.00');
    assert.equal(fmtMoney(null), '$0.00');
});

// ── the schema and its apply script ──────────────────────────────────────────

test('schema: dispatch_jobs.quote_id and the invoices table with its unique (org, number) index; the apply script and the test-schema guard name both', () => {
    const s = code(read('db/schema.ts'));
    assert.ok(s.includes("    quoteId:            text('quote_id'),"), 'the quote link on the job');
    assert.ok(s.includes("export const invoices = pgTable('invoices', {"));
    assert.ok(s.includes("    uniqueIndex('invoices_org_number_uq').on(t.orgId, t.invoiceNumber),"));
    assert.ok(s.includes("    index('invoices_org_job_idx').on(t.orgId, t.jobId),"));
    for (const col of ['quickbooksId', 'quickbooksRealmId', 'quickbooksSyncedAt', 'quickbooksSyncError']) assert.ok(s.includes(col + ':'), `${col} reserved for the export`);
    assert.ok(existsSync(new URL('../db/apply-invoices.mjs', import.meta.url)));
    const a = read('db/apply-invoices.mjs');
    assert.ok(a.includes('ALTER TABLE "dispatch_jobs" ADD COLUMN IF NOT EXISTS "quote_id" text'));
    assert.ok(a.includes('CREATE TABLE IF NOT EXISTS "invoices" ('));
    assert.ok(a.includes('CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_number_uq" ON "invoices" ("org_id", "invoice_number")'));
    assert.ok(!/DROP |TRUNCATE|ALTER COLUMN/.test(a), 'additive only');
    const g = code(read('tests/integration/_schema-guard.mjs'));
    assert.ok(g.includes("    ['invoices', 'id'],"));
    assert.ok(g.includes("    ['dispatch_jobs', 'quote_id'],"));
});

// ── the job endpoint: the mirror and the link are not the client’s to write ──

test('dispatch-jobs.mjs: quoteId is read, never accepted on PUT; the three invoice columns are off the PUT allowlist and untouched by the POST upsert (§18b44)', () => {
    const f = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(f.includes('export function normaliseJob(row) {'), 'shared with the two new functions');
    assert.ok(f.includes('export async function nextJobNumber(orgId) {'));
    assert.ok(f.includes("        quoteId:          row.quoteId           ?? row.quote_id           ?? null,"));
    const scalar = f.slice(f.indexOf('const scalarFields = ['), f.indexOf('];', f.indexOf('const scalarFields = [')));
    for (const k of ['quoteId', 'invoiceAmount', 'invoiceStatus', 'invoicePaidAt', 'jobNumber']) assert.ok(!scalar.includes(`'${k}'`), `${k} is not client-writable`);
    assert.ok(scalar.includes("'customerPoNumber'"), 'the PO stays writable');
    assert.ok(f.includes('set: { ...r, createdAt: undefined, invoiceAmount: undefined, invoiceStatus: undefined, invoicePaidAt: undefined } });'),
        'an upsert of an existing job leaves the mirror alone');
    assert.ok(!/quoteId:\s+data\.quoteId/.test(f), 'the POST never takes a quote id from the body');
    const c = code(read('netlify/functions/dispatch-customers.mjs'));
    assert.ok(c.includes('export async function nextCustomerNumber(orgId) {'));
});

// ── quote-to-job.mjs ─────────────────────────────────────────────────────────

test('quote-to-job.mjs: technician 403, the org’s Dispatch switch before any read, the quote read BY ORG, Accepted only, one job per quote, the link written on insert, the audit word', () => {
    const f = code(read('netlify/functions/quote-to-job.mjs'));
    assert.ok(f.includes("import { quoteCanBecomeJob, jobFromQuote, quoteLineToJobItem, resolveCustomerForOpp, cleanProductTypes } from '../../src/utils/invoices.js';"));
    assert.ok(f.includes("if (isTechnician(auth.userRole)) return reply(403, { error: 'Technicians cannot convert quotes.' });"));
    assert.ok(f.includes('const forbidden = requireWrite(auth, event, headers);'));
    const gate = f.indexOf('if (!dispatchEnabledFor(extra)) {');
    const quoteRead = f.indexOf('await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId))).limit(1);');
    assert.ok(gate !== -1 && quoteRead !== -1 && gate < quoteRead, 'the switch is checked before the quote is read');
    assert.ok(f.includes("if (!quote) return reply(404, { error: 'Quote not found' });"), 'another org’s quote is a 404, never a probe');
    assert.ok(f.includes('if (!quoteCanBecomeJob(quote)) {'));
    assert.ok(f.includes("if (existing) return reply(409, { error: `${existing.jobNumber || 'A job'} already exists for this quote.`, job: existing });"));
    assert.ok(f.includes('                quoteId: quote.id,'), 'the link is written with the job');
    assert.ok(f.includes("status: 'unscheduled', priority: 'normal', timeSlot: 'anytime',"), 'created unscheduled — no notification is due');
    assert.ok(f.includes("action: 'dispatch_job.created_from_quote'"));
    assert.ok(f.includes('.from(dispatchCustomers).where(eq(dispatchCustomers.orgId, orgId));'), 'customers resolved in THIS org');
    assert.ok(f.includes('.from(products).where(eq(products.orgId, orgId))'), 'SKUs from THIS org’s catalog');
    assert.ok(f.includes('.where(and(eq(dispatchJobs.orgId, orgId), eq(dispatchJobs.quoteId, quoteId)))'), 'the link is read by org');
    assert.ok(f.includes('const types = cleanProductTypes(extra.productTypes);'), 'the Admin’s kinds, from THIS org’s settings');
    assert.ok(f.includes('...quoteLineToJobItem(li, i, byId.get(li?.productId) || null, types),'), 'and handed to every line');
});

test('product & service types: settings.mjs carries productTypes in BOTH halves (18b12); the Settings card, its panel and the Catalog’s Type select read the org’s list', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { cleanProductTypes } from '../../src/utils/invoices.js';"));
    assert.ok(s.includes('                productTypes:         cleanProductTypes(row.extra?.productTypes),'), 'the GET half — the built-ins even when never saved');
    assert.ok(s.includes("                productTypes:         'productTypes'         in data ? cleanProductTypes(data.productTypes)    : existingExtra.productTypes         || null,"), 'the PUT half — read-then-merge, cleaned');
    const cat = read('src/Tabs/settings/catalogue.js');
    assert.ok(cat.includes("{ id:'product-types',    scope:'workspace', category:'Quoting', name:'Product & service types',"));
    const cards = code(read('src/utils/settingsCards.js'));
    assert.ok(cards.includes("    if (item.id === 'product-types')   statusDetail = countOrNull(len(settings?.productTypes), 'type');"));
    const av = code(read('src/Tabs/AdminView.jsx'));
    assert.ok(av.includes("import { ProductTypesDetail } from './settings/quoting/ProductTypesDetail.jsx';"));
    assert.ok(av.includes("        'product-types':        'product-types',"));
    assert.ok(av.includes("        if (id === 'product-types')   return <ProductTypesDetail  settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;"));
    const panel = code(read('src/Tabs/settings/quoting/ProductTypesDetail.jsx'));
    assert.ok(panel.includes("import { cleanProductTypes, BUILTIN_PRODUCT_TYPES, JOB_LINE_TYPES } from '../../../utils/invoices.js';"), 'one vocabulary');
    assert.ok(panel.includes('const payload = { productTypes: cleanProductTypes(types) };'), 'saved cleaned');
    assert.ok(panel.includes('await putSettings(payload);'), 'through the shared save (a refusal throws)');
    assert.ok(panel.includes("setError('Could not save: ' + e.message);"), 'and is shown');
    assert.ok(panel.includes('{builtin ? <span/> : ('), 'a built-in cannot be removed');
    assert.ok(!panel.includes('updatedAt="') && !panel.includes('updatedBy='), 'no typed edit history');
    const q = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(q.includes('    const typeOpts  = cleanProductTypes(settings?.productTypes);'), 'the Catalog’s Type select is the org’s list');
    assert.ok(!q.includes("pbCfg.types      || ['recurring', 'one_time', 'service']"), 'the fixed list is gone');
    assert.ok(q.includes('{typeOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}'), 'names shown, ids stored');
    assert.ok(q.includes('React.useEffect(() => { PRODUCT_TYPES_LIVE = cleanProductTypes(settings?.productTypes); }, [settings?.productTypes]);'), 'the badge names a custom type');
});

// ── invoices.mjs ─────────────────────────────────────────────────────────────

test('invoices.mjs: technician 403, every read and write by org, totals recomputed, the transition table and the draft-only edit enforced, the job re-mirrored after every write, Admin-only draft-only delete', () => {
    const f = code(read('netlify/functions/invoices.mjs'));
    assert.ok(f.includes("if (isTechnician(auth.userRole)) return reply(403, { error: 'Technicians cannot view invoices.' });"));
    assert.ok(f.includes("const prefix = `INV-${year}-`;"));
    assert.ok(f.includes("return prefix + String(max + 1).padStart(4, '0');"));
    assert.ok((f.match(/eq\(invoices\.orgId, orgId\)/g) || []).length >= 8, 'every invoice statement carries the org');
    assert.ok(f.includes('lineItems: lines, ...totalsFor(lines, taxRate),'), 'the client never sets a total');
    assert.ok(f.includes("if (editing.length && !isInvoiceEditable(current.status)) {"));
    assert.ok(f.includes('if (!canTransition(current.status, to)) {'));
    assert.ok(f.includes("if (live) return reply(409, { error: `${live.invoiceNumber} is already open on this job. Void it to start another.`, invoice: normaliseInvoice(live) });"));
    assert.equal((f.match(/await mirrorJob\(orgId, /g) || []).length, 3, 'POST, PUT and DELETE each re-mirror the job');
    assert.ok(f.includes("if (!isAdmin(auth.userRole)) return reply(403, { error: 'Admin only' });"));
    assert.ok(f.includes("if (current.status !== 'draft') return reply(422, { error: `${current.invoiceNumber} is ${current.status} — void it instead of deleting it.` });"));
    for (const a of ['invoice.created', 'invoice.issued', 'invoice.paid', 'invoice.voided', 'invoice.updated', 'invoice.deleted']) assert.ok(f.includes(`'${a}'`), a);
    assert.ok(f.includes("paymentTerms = q?.paymentTerms || DEFAULT_PAYMENT_TERMS;"), 'terms from the quote the job came from');
    const s = code(read('src/Tabs/settings/audit/AuditDetail.jsx'));
    assert.ok(s.includes("invoice:'data',"), 'the log files an invoice under Data');
});

// ── the Quotes card ──────────────────────────────────────────────────────────

test('QuotesTab: Customer accepted for an acceptable quote (editors only); the job card for an accepted one — off-switch note, the job once it exists, the button for editors; the read keyed on the quote, its status and the org’s switch', () => {
    const s = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(s.includes("import { quoteCanBeAccepted, quoteCanBecomeJob, invoiceStatusLabel, fmtMoney, cleanProductTypes, productTypeLabel, DEFAULT_PRODUCT_TYPES } from '../utils/invoices.js';"));
    assert.ok(s.includes('{quoteCanBeAccepted(quote) && onAccept && ('));
    assert.ok(s.includes('Customer accepted this quote →'));
    assert.ok(s.includes('{quoteCanBecomeJob(quote) && ('));
    assert.ok(s.includes('Dispatch is off for this workspace.'));
    assert.ok(s.includes("{jobBusy ? 'Creating job…' : 'Create dispatch job →'}"));
    assert.ok(s.includes("onAccept={canEdit ? handleAccept : null} dispatchEnabled={!!settings?.dispatchEnabled}"));
    assert.ok(s.includes('onCreateJob={canEdit ? handleCreateJob : null} />}'), 'a ReadOnly user is offered no button');
    assert.ok(s.includes("await handleSaveQuote({ ...activeQuote, status: 'Accepted' }, activeQuote);"));
    assert.ok(s.includes("if (res.status === 409 && data.job) { setLinkedJob(data.job); return; }"), 'an existing job is adopted');
    assert.ok(s.includes("if (!res.ok || !data.job) { setJobError(data.error || `The job was not created (HTTP ${res.status}).`); return; }"), 'a refusal is shown, never logged');
    assert.ok(s.includes("}, [activeQuote?.id, activeQuote?.status, settings?.dispatchEnabled]);"), 'the read re-keys on the quote and the switch');
    assert.ok(s.includes("if (!activeQuote || !quoteCanBecomeJob(activeQuote) || !settings?.dispatchEnabled) { setJobLoading(false); return; }"));
    assert.ok(s.includes('{jobError && <div role="alert"'));
});

// ── the Dispatch panel and view ──────────────────────────────────────────────

test('DispatchTab: the invoice panel and the Invoices view at module scope; the sub-tab, the caption and the mount; the panel under the job editor adopting the mirrored job; a void through the app-wide confirm; the board reads the mirror', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("    JOB_LINE_TYPES, todayYmd as invoiceToday, fmtMoney } from '../utils/invoices.js';"));
    for (const c of ['InvoiceStatusPill', 'InvoiceLineEditor', 'InvoiceTotals', 'JobInvoicePanel', 'InvoicesView']) {
        assert.ok(new RegExp(`^const ${c} = \\(`, 'm').test(s), `${c} is declared at module scope`);
    }
    assert.ok(s.includes("                    { id: 'invoices',  label: 'Invoices' },"));
    assert.ok(s.includes("view === 'invoices' ? 'Invoices' :"));
    assert.ok(s.includes("                ) : view === 'invoices' ? (\n                    <InvoicesView customers={customers} jobsRaw={jobsRaw} onOpenJob={openJobRecord}/>"));
    assert.ok(s.includes('{selected && <JobInvoicePanel job={selected} showConfirm={showConfirm} onJobMirror={onSaved}/>}'));
    assert.ok(s.includes('openJobRequest={openJobRequest} showConfirm={showConfirm}'));
    assert.ok(s.includes('                                    value: parseFloat(saved.invoiceAmount || 0),'), 'the board adopts the mirrored amount');
    assert.ok(s.includes('if (showConfirm) showConfirm(`Void ${invoice.invoiceNumber}? It stays on record as void, and a new invoice can be raised for this job.`, go, true);'), 'the danger variant');
    assert.ok(s.includes("if (!res.ok) { setErr(data.error || `${failText} (HTTP ${res.status}).`); return null; }"), 'a refusal is shown in the panel');
    assert.ok(s.includes('if (data.job && onJobMirror) onJobMirror(data.job);'), 'the server’s job is adopted');
    assert.ok(s.includes("setInvoice(list.find(isLiveInvoice) || list[0] || null);"), 'the live invoice leads');
    assert.ok(s.includes("<InvoiceTotals lines={cleanInvoiceLines(draft.lineItems)} taxRate={draft.taxRate}/>"), 'the draft’s preview runs the same arithmetic');
    // The five old native time inputs elsewhere in this file are a sweep of their own (state §9); none is added here.
    const panel = s.slice(s.indexOf('const InvoiceStatusPill = ('), s.indexOf('const JobsView = ('));
    assert.ok(panel.length > 1000 && !panel.includes('type="time"'), 'no native time picker in the invoice panel or the Invoices view');
});

test('the suites: the integration suite is in test:int and this file is in the harness', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.scripts['test:int'].includes('tests/integration/invoices.itest.mjs'));
    const h = read('scripts/mutate-import.mjs');
    assert.ok(h.includes('tests/invoices.test.mjs'));
    const a = read('tests/audit-coverage.test.mjs');
    assert.ok(a.includes("'quote-to-job.mjs':             ['dispatch_job.created_from_quote', 'dispatch_customer.created'],"));
    assert.ok(a.includes("'invoices.mjs':                 ['invoice.created', 'invoice.updated', 'invoice.issued', 'invoice.paid', 'invoice.voided', 'invoice.deleted'],"));
});
