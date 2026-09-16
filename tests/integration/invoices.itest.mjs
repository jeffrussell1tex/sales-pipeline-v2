// tests/integration/invoices.itest.mjs
// Quote → job → invoice (state §0.149) against the real test database. Proves:
// an ACCEPTED quote becomes one job — the customer resolved through the deal's
// account (or created), the quote's lines as the job's line items at the net
// price, quote_id on the job, a history row, an audit row naming the quote;
// a second conversion is a 409 with the job; a Draft quote is refused; an org
// with Dispatch off is refused before anything is read; another org's quote is
// a 404; a Technician and a ReadOnly user are refused. Then the invoice: a
// draft from the job's lines, numbered INV-YYYY-0001, terms from the quote, the
// due date from the terms, the job MIRRORED; one live invoice per job; a draft
// edit recomputes the totals server-side; draft → paid is refused; issued;
// lines refused once issued; paid with the date and amount mirrored; nothing
// leaves paid; void then a fresh invoice; delete Admin-only and draft-only,
// the mirror reset; org B reads nothing and cannot touch org A's rows.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST; db/apply-invoices.mjs --test first)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'User';
            const userId = event.headers?.['x-test-user'] || 'clerk_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        isAppRole:    (r) => ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'].includes(r),
        isAdmin:      (role) => role === 'Admin',
        isManager:    (role) => role === 'Manager',
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole) ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers, opts = {}) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (auth?.userRole === 'ReadOnly') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            if (auth?.userRole === 'Technician' && !opts.allowTechnician) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            return null;
        },
    },
});
// dispatch-jobs.mjs (imported for its number generator) pulls the senders in;
// nothing here schedules a job, so nothing should send — recorded, never sent.
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async (o) => { mails.push(o); return { success: true }; }, emailTemplates: {} },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: toJob }   = await import('../../netlify/functions/quote-to-job.mjs');
const { handler: invoicesFn } = await import('../../netlify/functions/invoices.mjs');
const { db } = await import('../../db/index.js');
const {
    invoices, quotes, opportunities, products, settings, users, auditLog,
    dispatchJobs, dispatchJobLineItems, dispatchJobStatusHistory, dispatchCustomers,
} = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { eq, and, asc } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_inv_A', ORG_B = 'itest_inv_B', ORG_C = 'itest_inv_C';
const ORGS = [ORG_A, ORG_B, ORG_C];
const ACCT_A = 'acct_itest_inv_a';
const CUST_A = 'dcust_itest_inv_a';
const OPP_A = 'opp_itest_inv_a', OPP_A2 = 'opp_itest_inv_a2', OPP_B = 'opp_itest_inv_b';
const Q_ACCEPTED = 'q_itest_inv_accepted', Q_DRAFT = 'q_itest_inv_draft', Q_A2 = 'q_itest_inv_a2', Q_B = 'q_itest_inv_b';
const PROD = 'prod_itest_inv', PROD_EQUIP = 'prod_itest_inv_equip';
const DISPATCHER = 'clerk_itest_inv_dispatcher';
const YEAR = new Date().getFullYear();

const call = (fn, method, org, { body, params, role, user } = {}) => fn({
    httpMethod: method,
    queryStringParameters: params || {},
    headers: { 'x-test-org': org, 'x-test-user': user || DISPATCHER, ...(role ? { 'x-test-role': role } : {}) },
    body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const jobRow = async (id) => (await db.select().from(dispatchJobs).where(eq(dispatchJobs.id, id)))[0];
const auditRows = (org, action) => db.select().from(auditLog).where(and(eq(auditLog.orgId, org), eq(auditLog.action, action)));

const cleanup = async () => {
    for (const o of ORGS) {
        await db.delete(invoices).where(eq(invoices.orgId, o));
        await db.delete(dispatchJobLineItems).where(eq(dispatchJobLineItems.orgId, o));
        await db.delete(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.orgId, o));
        await db.delete(dispatchJobs).where(eq(dispatchJobs.orgId, o));
        await db.delete(dispatchCustomers).where(eq(dispatchCustomers.orgId, o));
        await db.delete(quotes).where(eq(quotes.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(products).where(eq(products.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(settings).values([
        // Org A's Admin defined a custom type (Equipment → material) and left the built-ins alone.
        { id: 'settings_' + ORG_A, orgId: ORG_A, companyName: 'Itest Invoicing A', extra: { dispatchEnabled: true, productTypes: [{ id: 'pt_equip', name: 'Equipment', lineKind: 'material' }] } },
        { id: 'settings_' + ORG_B, orgId: ORG_B, companyName: 'Itest CRM-only B', extra: { dispatchEnabled: false } },
        { id: 'settings_' + ORG_C, orgId: ORG_C, companyName: 'Itest Dispatch C', extra: { dispatchEnabled: true } },
    ]);
    await db.insert(users).values([
        { id: 'usr_itest_inv_a', clerkUserId: DISPATCHER, name: 'Itest Dispatcher', email: 'inv-dispatcher@itest.local', role: 'User', orgId: ORG_A },
    ]);
    invalidateRoster();
    await db.insert(products).values([
        { id: PROD, orgId: ORG_A, name: 'Itest Platform', sku: 'PLT-1', productType: 'recurring', listPrice: '100.00', unit: 'month' },
        { id: PROD_EQUIP, orgId: ORG_A, name: 'Itest Condenser', sku: 'CND-9', productType: 'pt_equip', listPrice: '1200.00', unit: 'flat' },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: CUST_A, orgId: ORG_A, name: 'Itest Customer A', accountId: ACCT_A, customerType: 'commercial', customerNumber: 'CUST-0001' },
    ]);
    await db.insert(opportunities).values([
        { id: OPP_A,  orgId: ORG_A, pipelineId: 'pipe_itest', stage: 'Closed Won', opportunityName: 'Itest rooftop units', account: 'Itest Customer A', accountId: ACCT_A },
        { id: OPP_A2, orgId: ORG_A, pipelineId: 'pipe_itest', stage: 'Closed Won', opportunityName: 'Brand new deal', account: 'Brand New Co', accountId: null },
        { id: OPP_B,  orgId: ORG_B, pipelineId: 'pipe_itest', stage: 'Closed Won', opportunityName: 'B deal', account: 'B Co' },
    ]);
    const lines = [
        { productId: PROD, productName: 'Itest Platform', productType: 'recurring', unit: 'month', listPrice: 100, quantity: 2, discountPct: 10 },
        { productId: 'p_none', productName: 'Install service', productType: 'service', listPrice: 500, quantity: 1 },
        { productId: PROD_EQUIP, productName: 'Itest Condenser', productType: 'pt_equip', listPrice: 1200, quantity: 1 },
    ];
    await db.insert(quotes).values([
        { id: Q_ACCEPTED, orgId: ORG_A, opportunityId: OPP_A,  quoteNumber: 'Q-2026-901', version: 2, name: 'Itest rooftop units v2', status: 'Accepted', paymentTerms: 'Net 15 · Annual', lineItems: lines },
        { id: Q_DRAFT,    orgId: ORG_A, opportunityId: OPP_A,  quoteNumber: 'Q-2026-902', version: 1, name: 'Itest draft v1', status: 'Draft', lineItems: lines },
        { id: Q_A2,       orgId: ORG_A, opportunityId: OPP_A2, quoteNumber: 'Q-2026-903', version: 1, name: 'Brand new deal v1', status: 'Accepted', lineItems: [] },
        { id: Q_B,        orgId: ORG_B, opportunityId: OPP_B,  quoteNumber: 'Q-2026-904', version: 1, name: 'B v1', status: 'Accepted', lineItems: lines },
    ]);
});

after(async () => { await cleanup(); });

let jobA = null;     // the job Q_ACCEPTED became
let jobA2 = null;    // the job Q_A2 became (a created customer)
let invA = null;     // the invoice on jobA

// ── quote → job ──────────────────────────────────────────────────────────────

test('an accepted quote becomes one unscheduled job: the customer resolved by the deal’s account, the quote’s lines at net price, quote_id, a history row, an audit row naming the quote', async () => {
    const r = parse(await call(toJob, 'POST', ORG_A, { body: { quoteId: Q_ACCEPTED } }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    jobA = r.body.job;
    assert.equal(r.body.customerCreated, false);
    assert.equal(jobA.customerId, CUST_A, 'resolved through the account, not created');
    assert.equal(jobA.quoteId, Q_ACCEPTED);
    assert.equal(jobA.opportunityId, OPP_A);
    assert.equal(jobA.accountId, ACCT_A);
    assert.equal(jobA.title, 'Itest rooftop units', 'the " v2" dropped');
    assert.equal(jobA.description, 'From quote Q-2026-901 v2');
    assert.equal(jobA.status, 'unscheduled');
    assert.match(jobA.jobNumber, /^JOB-\d{4}-\d{4}$/);
    assert.equal(jobA.invoiceStatus, 'none');
    assert.equal(jobA.invoice, null);

    const items = await db.select().from(dispatchJobLineItems)
        .where(and(eq(dispatchJobLineItems.orgId, ORG_A), eq(dispatchJobLineItems.jobId, jobA.id))).orderBy(asc(dispatchJobLineItems.sortOrder));
    assert.equal(items.length, 3);
    assert.deepEqual([items[0].itemType, items[0].description, items[0].partNumber, items[0].quantity, items[0].unitPrice, items[0].totalPrice, items[0].taxable],
        ['fee', 'Itest Platform', 'PLT-1', '2.00', '90.00', '180.00', true], 'list 100 less 10% = 90, ×2; the SKU from THIS org’s catalog; a built-in type at its default kind');
    assert.deepEqual([items[1].itemType, items[1].description, items[1].partNumber, items[1].unitPrice], ['labor', 'Install service', null, '500.00']);
    assert.deepEqual([items[2].itemType, items[2].description, items[2].partNumber, items[2].unitPrice], ['material', 'Itest Condenser', 'CND-9', '1200.00'], 'the Admin’s own type decides the kind');

    const hist = await db.select().from(dispatchJobStatusHistory).where(and(eq(dispatchJobStatusHistory.orgId, ORG_A), eq(dispatchJobStatusHistory.jobId, jobA.id)));
    assert.equal(hist.length, 1);
    assert.equal(hist[0].note, 'Job created from quote Q-2026-901 v2');

    const audit = await auditRows(ORG_A, 'dispatch_job.created_from_quote');
    assert.equal(audit.length, 1);
    assert.equal(audit[0].entityId, jobA.id);
    assert.equal(audit[0].userName, 'Itest Dispatcher', 'the caller is named');
    assert.match(audit[0].detail, /^from Q-2026-901 v2 · 3 line items$/);
    assert.equal(mails.length, 0, 'an unscheduled job tells the customer nothing');
});

test('a second conversion is a 409 carrying the job; GET names the linked job (no invoice yet)', async () => {
    const again = parse(await call(toJob, 'POST', ORG_A, { body: { quoteId: Q_ACCEPTED } }));
    assert.equal(again.status, 409);
    assert.equal(again.body.job.id, jobA.id);
    assert.match(again.body.error, /already exists for this quote/);
    const got = parse(await call(toJob, 'GET', ORG_A, { params: { quoteId: Q_ACCEPTED } }));
    assert.equal(got.status, 200);
    assert.equal(got.body.job.id, jobA.id);
    assert.equal(got.body.job.invoice, null);
    assert.equal((await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.orgId, ORG_A), eq(dispatchJobs.quoteId, Q_ACCEPTED)))).length, 1, 'still one job');
});

test('a Draft quote is refused; an org with Dispatch off is refused before its quote is read; another org’s quote is a 404; a Technician and a ReadOnly user are refused', async () => {
    const draft = parse(await call(toJob, 'POST', ORG_A, { body: { quoteId: Q_DRAFT } }));
    assert.equal(draft.status, 422);
    assert.match(draft.body.error, /Only an accepted quote becomes a job — this one is Draft/);

    const off = parse(await call(toJob, 'POST', ORG_B, { body: { quoteId: Q_B } }));
    assert.equal(off.status, 422);
    assert.match(off.body.error, /Dispatch is not enabled/);
    assert.equal((await db.select().from(dispatchJobs).where(eq(dispatchJobs.orgId, ORG_B))).length, 0, 'a CRM-only org grew no dispatch rows');

    const cross = parse(await call(toJob, 'POST', ORG_C, { body: { quoteId: Q_ACCEPTED } }));
    assert.equal(cross.status, 404, 'org C (Dispatch on) cannot see org A’s quote');
    assert.equal((await db.select().from(dispatchJobs).where(eq(dispatchJobs.orgId, ORG_C))).length, 0);
    const crossGet = parse(await call(toJob, 'GET', ORG_C, { params: { quoteId: Q_ACCEPTED } }));
    assert.equal(crossGet.body.job, null, 'nor its job');

    assert.equal(parse(await call(toJob, 'POST', ORG_A, { body: { quoteId: Q_A2 }, role: 'Technician' })).status, 403);
    assert.equal(parse(await call(toJob, 'GET', ORG_A, { params: { quoteId: Q_ACCEPTED }, role: 'Technician' })).status, 403);
    assert.equal(parse(await call(toJob, 'POST', ORG_A, { body: { quoteId: Q_A2 }, role: 'ReadOnly' })).status, 403);
    assert.equal(parse(await call(toJob, 'POST', ORG_A, { body: {} })).status, 400);
});

test('a deal with no dispatch customer gets one created in THIS org, numbered, named after the account', async () => {
    const r = parse(await call(toJob, 'POST', ORG_A, { body: { quoteId: Q_A2 } }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    jobA2 = r.body.job;
    assert.equal(r.body.customerCreated, true);
    const [cust] = await db.select().from(dispatchCustomers).where(and(eq(dispatchCustomers.orgId, ORG_A), eq(dispatchCustomers.id, jobA2.customerId)));
    assert.ok(cust, 'the customer exists in org A');
    assert.equal(cust.name, 'Brand New Co');
    assert.equal(cust.customerNumber, 'CUST-0002', 'the next number after the seeded CUST-0001');
    assert.equal((await auditRows(ORG_A, 'dispatch_customer.created')).length, 1);
    const items = await db.select().from(dispatchJobLineItems).where(and(eq(dispatchJobLineItems.orgId, ORG_A), eq(dispatchJobLineItems.jobId, jobA2.id)));
    assert.equal(items.length, 0, 'a quote with no lines makes a job with none');
});

// ── the invoice ──────────────────────────────────────────────────────────────

test('a draft invoice from the job’s lines: INV-YYYY-0001, terms from the quote, the due date from the terms, totals server-side, the job mirrored', async () => {
    const r = parse(await call(invoicesFn, 'POST', ORG_A, { body: { jobId: jobA.id, issueDate: '2026-09-16', total: 1, subtotal: 1 } }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    invA = r.body.invoice;
    assert.equal(invA.invoiceNumber, `INV-${YEAR}-0001`);
    assert.equal(invA.status, 'draft');
    assert.equal(invA.jobId, jobA.id);
    assert.equal(invA.quoteId, Q_ACCEPTED);
    assert.equal(invA.customerId, CUST_A);
    assert.equal(invA.opportunityId, OPP_A);
    assert.equal(invA.paymentTerms, 'Net 15 · Annual', 'the quote’s terms');
    assert.equal(invA.issueDate, '2026-09-16');
    assert.equal(invA.dueDate, '2026-10-01', 'Net 15 from the issue date');
    assert.equal(invA.lineItems.length, 3);
    assert.deepEqual(invA.lineItems[0], { itemType: 'fee', description: 'Itest Platform', partNumber: 'PLT-1', quantity: 2, unitPrice: 90, totalPrice: 180, taxable: true });
    assert.equal(invA.subtotal, 1880);
    assert.equal(invA.taxRate, 0);
    assert.equal(invA.total, 1880, 'the body’s total was ignored');
    assert.equal(r.body.job.id, jobA.id);
    assert.equal(r.body.job.invoiceStatus, 'draft');
    assert.equal(r.body.job.invoiceAmount, '1880.00');
    const row = await jobRow(jobA.id);
    assert.equal(row.invoiceStatus, 'draft');
    assert.equal(row.invoiceAmount, '1880.00');
    assert.equal(row.invoicePaidAt, null);
    assert.equal((await auditRows(ORG_A, 'invoice.created')).length, 1);
    const linked = parse(await call(toJob, 'GET', ORG_A, { params: { quoteId: Q_ACCEPTED } }));
    assert.equal(linked.body.job.invoice.invoiceNumber, invA.invoiceNumber, 'the quote card sees the invoice');
});

test('one live invoice per job; a draft edit recomputes the totals (tax on taxable lines only); draft → paid is refused', async () => {
    const dup = parse(await call(invoicesFn, 'POST', ORG_A, { body: { jobId: jobA.id } }));
    assert.equal(dup.status, 409);
    assert.match(dup.body.error, /is already open on this job/);

    const edit = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: {
        lineItems: [...invA.lineItems, { description: 'Disposal fee', itemType: 'fee', quantity: 1, unitPrice: 25, taxable: false, totalPrice: 9999 }],
        taxRate: 8.25, customerPoNumber: 'PO-77', notes: 'Thank you', total: 1,
    } }));
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal(edit.body.invoice.lineItems.length, 4);
    assert.equal(edit.body.invoice.lineItems[3].totalPrice, 25, 'the lying total was recomputed');
    assert.equal(edit.body.invoice.subtotal, 1905);
    assert.equal(edit.body.invoice.taxAmount, 155.1, '8.25% of the 1880 taxable, not of 1905');
    assert.equal(edit.body.invoice.total, 2060.1);
    assert.equal(edit.body.invoice.customerPoNumber, 'PO-77');
    assert.equal(edit.body.job.invoiceAmount, '2060.10', 'the mirror follows');
    assert.equal((await jobRow(jobA.id)).invoiceAmount, '2060.10');

    const bad = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: { taxRate: 250 } }));
    assert.equal(bad.status, 400);
    const skip = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: { status: 'paid' } }));
    assert.equal(skip.status, 422);
    assert.match(skip.body.error, /cannot go from draft to paid/);
    invA = edit.body.invoice;
});

test('issued: stamped and mirrored; the lines are then frozen; paid with the date and amount, mirrored to the job; nothing leaves paid', async () => {
    const issued = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: { status: 'issued' } }));
    assert.equal(issued.status, 200, JSON.stringify(issued.body));
    assert.equal(issued.body.invoice.status, 'issued');
    assert.ok(issued.body.invoice.issuedAt);
    assert.equal((await jobRow(jobA.id)).invoiceStatus, 'issued');
    assert.equal((await auditRows(ORG_A, 'invoice.issued')).length, 1);

    const frozen = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: { lineItems: [] } }));
    assert.equal(frozen.status, 422);
    assert.match(frozen.body.error, /only a draft can be edited/);
    assert.equal((await db.select().from(invoices).where(eq(invoices.id, invA.id)))[0].lineItems.length, 4, 'nothing changed');

    const paid = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: { status: 'paid', paidAt: '2026-09-20' } }));
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.invoice.status, 'paid');
    assert.equal(paid.body.invoice.paidAt, '2026-09-20');
    assert.equal(paid.body.invoice.amountPaid, 2060.1, 'the total when no amount is given');
    const row = await jobRow(jobA.id);
    assert.deepEqual([row.invoiceStatus, row.invoiceAmount, row.invoicePaidAt], ['paid', '2060.10', '2026-09-20']);
    assert.equal((await auditRows(ORG_A, 'invoice.paid')).length, 1);

    const undo = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: { status: 'void' } }));
    assert.equal(undo.status, 422, 'paid is final');
    const reopen = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: invA.id }, body: { status: 'draft' } }));
    assert.equal(reopen.status, 422);
});

test('void then a fresh invoice on the same job; delete is Admin-only and draft-only, and resets the mirror when nothing live remains', async () => {
    const first = parse(await call(invoicesFn, 'POST', ORG_A, { body: { jobId: jobA2.id, lineItems: [{ description: 'Site survey', itemType: 'labor', quantity: 2, unitPrice: 75 }] } }));
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.invoice.invoiceNumber, `INV-${YEAR}-0002`);
    assert.equal(first.body.invoice.paymentTerms, 'Net 30', 'no quote terms on this one — the house default');
    assert.equal(first.body.invoice.total, 150);
    assert.equal((await jobRow(jobA2.id)).invoiceStatus, 'draft');

    const voided = parse(await call(invoicesFn, 'PUT', ORG_A, { params: { id: first.body.invoice.id }, body: { status: 'void' } }));
    assert.equal(voided.status, 200);
    assert.ok(voided.body.invoice.voidedAt);
    assert.equal((await jobRow(jobA2.id)).invoiceStatus, 'none', 'a void invoice is not live — the mirror clears');
    assert.equal((await auditRows(ORG_A, 'invoice.voided')).length, 1);

    const second = parse(await call(invoicesFn, 'POST', ORG_A, { body: { jobId: jobA2.id } }));
    assert.equal(second.status, 201, 'a new invoice may follow a void one');
    assert.equal(second.body.invoice.invoiceNumber, `INV-${YEAR}-0003`);
    assert.equal(second.body.invoice.lineItems.length, 0, 'from the job’s (empty) lines');
    assert.equal((await jobRow(jobA2.id)).invoiceStatus, 'draft');

    const asUser = parse(await call(invoicesFn, 'DELETE', ORG_A, { params: { id: second.body.invoice.id } }));
    assert.equal(asUser.status, 403);
    const paidDelete = parse(await call(invoicesFn, 'DELETE', ORG_A, { params: { id: invA.id }, role: 'Admin' }));
    assert.equal(paidDelete.status, 422, 'a paid invoice is never deleted');
    const gone = parse(await call(invoicesFn, 'DELETE', ORG_A, { params: { id: second.body.invoice.id }, role: 'Admin' }));
    assert.equal(gone.status, 200);
    assert.equal((await db.select().from(invoices).where(eq(invoices.id, second.body.invoice.id))).length, 0);
    const row = await jobRow(jobA2.id);
    assert.deepEqual([row.invoiceStatus, row.invoiceAmount, row.invoicePaidAt], ['none', null, null], 'only the void one remains — the mirror is reset');
    assert.equal((await auditRows(ORG_A, 'invoice.deleted')).length, 1);
});

test('org B lists nothing of org A’s and cannot read, edit or delete its rows; a Technician sees no invoice at all; a ReadOnly user reads and cannot write', async () => {
    const list = parse(await call(invoicesFn, 'GET', ORG_B));
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.invoices, []);
    assert.equal(parse(await call(invoicesFn, 'GET', ORG_B, { params: { id: invA.id } })).status, 404);
    assert.equal(parse(await call(invoicesFn, 'GET', ORG_B, { params: { jobId: jobA.id } })).body.invoices.length, 0);
    assert.equal(parse(await call(invoicesFn, 'PUT', ORG_B, { params: { id: invA.id }, body: { notes: 'x' } })).status, 404);
    assert.equal(parse(await call(invoicesFn, 'DELETE', ORG_B, { params: { id: invA.id }, role: 'Admin' })).status, 404);
    assert.equal(parse(await call(invoicesFn, 'POST', ORG_B, { body: { jobId: jobA.id } })).status, 404, 'org A’s job is not org B’s to invoice');
    assert.equal((await db.select().from(invoices).where(eq(invoices.id, invA.id)))[0].notes, 'Thank you', 'untouched');

    assert.equal(parse(await call(invoicesFn, 'GET', ORG_A, { role: 'Technician' })).status, 403);
    const ro = parse(await call(invoicesFn, 'GET', ORG_A, { role: 'ReadOnly' }));
    assert.equal(ro.status, 200);
    assert.equal(ro.body.invoices.length, 2, 'the paid one and the void one');
    assert.equal(parse(await call(invoicesFn, 'POST', ORG_A, { body: { jobId: jobA2.id }, role: 'ReadOnly' })).status, 403);
});
