// tests/integration/sales-tax-docs.itest.mjs
// Sales tax on quotes, batch A — the documents and the invoice (state §0.241; docs/design/sales-tax R6, R7, §6;
// Jeff's answers 10 Nov: Q4 "Carry it") — against the real test database. Proves:
//   PDF       quote-pdf.mjs prints the STORED quote, read by its id in the caller's org: its rows, its deal discount,
//             its tax and its Total to the cent — a quote, lines or numbers the body carries print nothing; another
//             org's quote, a deal the caller cannot see (another rep's, a Technician's) and no id are refused
//   EMAIL     quote-email.mjs's rows are the quote's lines — each its quantity, its net price and its total, adding
//             up to the Subtotal — and its block Subtotal, Deal discount, Tax, Total, adding up (until §0.241 every
//             row said Qty 1 at the list price)
//   JOB       an accepted taxed quote's job keeps each line's Taxable and carries the deal discount as discount
//             lines; its invoice takes the quote's rate, and its totals are the quote's to the cent; an exempt
//             quote's invoice is rated 0; a quote with no rate (every one before tax) as before; a rate the request
//             names wins
//   ORG B     its own quote prints its own rate; its rows untouched by all of the above
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; the mailer is captured, SMS stubbed.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_taxdoc_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async (o) => { mails.push(o); return { success: true }; }, emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: quotesFn }   = await import('../../netlify/functions/quotes.mjs');
const { handler: pdfFn }      = await import('../../netlify/functions/quote-pdf.mjs');
const { handler: emailFn }    = await import('../../netlify/functions/quote-email.mjs');
const { handler: toJobFn }    = await import('../../netlify/functions/quote-to-job.mjs');
const { handler: invoicesFn } = await import('../../netlify/functions/invoices.mjs');
const { db } = await import('../../db/index.js');
const {
    users, opportunities, quotes, auditLog, settings, products, invoices,
    dispatchJobs, dispatchJobLineItems, dispatchJobStatusHistory, dispatchCustomers,
} = await import('../../db/schema.js');
const { eq, and, asc } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_taxdoc_*', and only this file writes to it.
const A = 'itest_taxdoc_A', B = 'itest_taxdoc_B';
const CLERK = { rep: 'clerk_itest_taxdoc_rep', rep2: 'clerk_itest_taxdoc_rep2', admin: 'clerk_itest_taxdoc_admin', adminB: 'clerk_itest_taxdoc_admin_b' };
const USR = { rep: 'usr_itest-taxdoc-rep', rep2: 'usr_itest-taxdoc-rep2', admin: 'usr_itest-taxdoc-admin', adminB: 'usr_itest-taxdoc-admin-b' };
const OPP = { a: 'opp_itest_taxdoc_a', b: 'opp_itest_taxdoc_b' };
const P = { taxed: 'p_itest_taxdoc_taxed', untaxed: 'p_itest_taxdoc_untaxed', b: 'p_itest_taxdoc_b' };

const ev = (org, role, user, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const asAdmin = (fn, m, b, qs) => fn(ev(A, 'Admin', CLERK.admin, m, b, qs)).then(parse);
const pdfAs = (org, role, user, body) => pdfFn(ev(org, role, user, 'POST', body));

// The PDF's text, read back in the order written: each content stream inflated, each TJ's hex pieces joined.
const pdfWords = (b64) => {
    const raw = Buffer.from(b64, 'base64').toString('latin1');
    const out = [];
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        let s;
        try { s = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { s = m[1]; }
        for (const t of s.matchAll(/\[([^\]]*)\]\s*TJ/g)) out.push([...t[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''));
    }
    return out;
};
const totalsBlock = (w) => w.slice(w.indexOf('Subtotal'), w.indexOf('QUOTE TOTAL'));
const cents = (s) => Math.round(Number(String(s).replace(/[$,]/g, '')) * 100);

const line = (productId, productName, listPrice, extra = {}) => ({ productId, productName, productType: 'one_time', unit: 'flat', listPrice, quantity: 1, discountPct: 0, ...extra });
// The design's quote: 600 taxable (no flag) + 400 not, 10% off, 8.25% — 900.00 + 44.55 = 944.55.
const DESIGN = () => [line(P.taxed, 'Itest Taxdoc taxed', 600), line(P.untaxed, 'Itest Taxdoc untaxed', 400, { taxable: false })];
// A quantity and a line discount (the email's lost fields), and a half-cent of tax: 2 × 300 less 10% (540, taxable)
// + 400 not, 10% off — 846.00; the tax on 486 at 8.25% is 40.095, 40.10 — 886.10.
const SPLIT = () => [line(P.taxed, 'Itest Taxdoc taxed', 300, { quantity: 2, discountPct: 10 }), line(P.untaxed, 'Itest Taxdoc untaxed', 400, { taxable: false })];

let n = 0;
// A quote made through quotes.mjs (the server's totals), then moved to `status` in this file's own org.
const makeQuote = async (body, status, org = A) => {
    const id = `q_itest_taxdoc_${++n}`;
    const r = await quotesFn(ev(org, 'Admin', org === A ? CLERK.admin : CLERK.adminB, 'POST',
        { id, opportunityId: org === A ? OPP.a : OPP.b, name: `Itest Taxdoc quote ${n}`, ...body })).then(parse);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    if (status) await db.update(quotes).set({ status, approvedAt: status === 'Approved' ? new Date() : null }).where(and(eq(quotes.id, id), eq(quotes.orgId, org)));
    return (await db.select().from(quotes).where(eq(quotes.id, id)))[0];
};

const snapshotB = async () => ({
    quotes: await db.select().from(quotes).where(eq(quotes.orgId, B)).orderBy(asc(quotes.id)),
    settings: await db.select().from(settings).where(eq(settings.orgId, B)),
    products: await db.select().from(products).where(eq(products.orgId, B)),
    deals: await db.select().from(opportunities).where(eq(opportunities.orgId, B)),
    jobs: await db.select().from(dispatchJobs).where(eq(dispatchJobs.orgId, B)),
    invoices: await db.select().from(invoices).where(eq(invoices.orgId, B)),
});

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(invoices).where(eq(invoices.orgId, o));
        await db.delete(dispatchJobLineItems).where(eq(dispatchJobLineItems.orgId, o));
        await db.delete(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.orgId, o));
        await db.delete(dispatchJobs).where(eq(dispatchJobs.orgId, o));
        await db.delete(dispatchCustomers).where(eq(dispatchCustomers.orgId, o));
        await db.delete(quotes).where(eq(quotes.orgId, o));
        await db.delete(products).where(eq(products.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

let bBefore, qB;
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const u = (key, role, org = A) => ({ id: USR[key], clerkUserId: CLERK[key], orgId: org, name: `Itest Taxdoc ${key}`, email: `taxdoc-${key}@itest.local`, role });
    await db.insert(users).values([u('rep', 'User'), u('rep2', 'User'), u('admin', 'Admin'), u('adminB', 'Admin', B)]);
    invalidateRoster();
    await db.insert(settings).values([
        { id: 'itest_taxdoc_settings_A', orgId: A, extra: { companyDisplayName: 'Itest Taxdoc Alpha', dispatchEnabled: true, quoteDefaults: { taxRate: 8.25 } } },
        { id: 'itest_taxdoc_settings_B', orgId: B, extra: { companyDisplayName: 'Itest Taxdoc Bravo', dispatchEnabled: true, quoteDefaults: { taxRate: 5 } } },
    ]);
    await db.insert(opportunities).values([
        { id: OPP.a, orgId: A, ownerId: USR.rep, salesRep: 'Itest Taxdoc rep', opportunityName: 'Itest Taxdoc deal', account: 'Itest Taxdoc Customer', pipelineId: 'default', stage: 'Proposal', arr: '1.00' },
        { id: OPP.b, orgId: B, ownerId: USR.adminB, salesRep: 'Itest Taxdoc adminB', opportunityName: 'Itest Taxdoc B deal', account: 'Itest Taxdoc B Customer', pipelineId: 'default', stage: 'Proposal', arr: '1.00' },
    ]);
    await db.insert(products).values([
        { id: P.taxed, orgId: A, name: 'Itest Taxdoc taxed', productType: 'one_time', unit: 'flat', listPrice: '600.00' },
        { id: P.untaxed, orgId: A, name: 'Itest Taxdoc untaxed', productType: 'one_time', unit: 'flat', listPrice: '400.00', taxable: false },
        { id: P.b, orgId: B, name: 'Itest Taxdoc B thing', productType: 'one_time', unit: 'flat', listPrice: '100.00' },
    ]);
    // Org B's own quote, its default rate (5%): 100.00 + 5.00.
    qB = await makeQuote({ lineItems: [line(P.b, 'Itest Taxdoc B thing', 100)], taxExempt: false }, null, B);
    bBefore = await snapshotB();
});
after(cleanup);

// ── PDF ──────────────────────────────────────────────────────────────────────

test('PDF: the stored quote — its rows, deal discount, tax and Total to the cent; nothing the body carries is printed', async () => {
    const q = await makeQuote({ lineItems: DESIGN(), dealDiscount: 10, taxRate: 8.25, taxExempt: false });
    assert.deepEqual([q.totalValue, q.taxRate, q.taxAmount], ['900.00', '8.25', '44.55'], 'the server\'s stored figures');
    // The owning rep, sending a quote and numbers of her own beside the id.
    const r = await pdfAs(A, 'User', CLERK.rep, { quoteId: q.id, quote: { ...q, name: 'Body name', taxRate: 50, lineItems: [line(P.taxed, 'Body line', 1)] },
        lines: [{ productName: 'Body line', lineTotal: 1 }], opportunity: { opportunityName: 'Body deal' } });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.headers['Content-Type'], 'application/pdf');
    const w = pdfWords(r.body);
    assert.deepEqual(totalsBlock(w), ['Subtotal', '$1,000.00', 'Deal discount (10%)', '-$100.00', 'Tax (8.25%)', '$44.55', 'Total', '$944.55'],
        'REGRESSION (§0.241): the PDF\'s totals are not the stored quote\'s');
    assert.ok(w.includes(q.name) && w.includes('Itest Taxdoc deal') && w.includes('Itest Taxdoc taxed') && w.includes('Itest Taxdoc untaxed'), 'the stored quote, its deal and its lines');
    for (const bodyWord of ['Body name', 'Body line', 'Body deal', 'Tax (50%)']) assert.ok(!w.includes(bodyWord), `REGRESSION (§0.241): the body's "${bodyWord}" printed`);
    // Exempt, and written before tax: "Tax exempt"; no tax row.
    const ex = await makeQuote({ lineItems: DESIGN(), dealDiscount: 10, taxRate: 8.25, taxExempt: true });
    assert.deepEqual(totalsBlock(pdfWords((await pdfAs(A, 'Admin', CLERK.admin, { quoteId: ex.id })).body)),
        ['Subtotal', '$1,000.00', 'Deal discount (10%)', '-$100.00', 'Tax exempt', '$0.00', 'Total', '$900.00']);
    const old = await makeQuote({ lineItems: DESIGN().map(({ taxable, ...li }) => li), dealDiscount: 10, taxRate: null, taxExempt: false });
    assert.equal(old.taxAmount, null, 'no rate: no tax amount stored');
    assert.deepEqual(totalsBlock(pdfWords((await pdfAs(A, 'Admin', CLERK.admin, { quoteId: old.id })).body)),
        ['Subtotal', '$1,000.00', 'Deal discount (10%)', '-$100.00', 'Total', '$900.00'], 'a quote with no rate: no tax row, its Total as before');
});

test('PDF: refused — another org\'s quote, a deal the caller cannot see, a Technician, no id; never a probe', async () => {
    const q = await makeQuote({ lineItems: DESIGN(), taxExempt: false });
    const nf = (r, why) => { assert.equal(r.statusCode, 404, `${why}: ${r.body}`); assert.deepEqual(JSON.parse(r.body), { error: 'Quote not found' }, why); };
    nf(await pdfAs(B, 'Admin', CLERK.adminB, { quoteId: q.id }), 'REGRESSION (§0.241): org B reads org A\'s quote');
    nf(await pdfAs(A, 'User', CLERK.rep2, { quoteId: q.id }), 'REGRESSION (§0.241): a rep reads another rep\'s deal\'s quote');
    nf(await pdfAs(A, 'Technician', CLERK.rep, { quoteId: q.id }), 'REGRESSION (§0.241): a Technician reads a quote');
    nf(await pdfAs(A, 'Admin', CLERK.admin, { quoteId: 'q_itest_taxdoc_none' }), 'an id that names none');
    // The body's quote alone, as the screen sent it until §0.241: refused, nothing drawn.
    const bodyOnly = await pdfAs(A, 'Admin', CLERK.admin, { quote: q, lines: [] });
    assert.equal(bodyOnly.statusCode, 400, 'REGRESSION (§0.241): a quote in the body printed without its id');
    assert.equal((await pdfFn({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ quoteId: q.id }) })).statusCode, 401, 'signed out');
    assert.equal((await pdfAs(A, 'Admin', CLERK.admin, null)).statusCode, 400, 'no body');
    // Org B's own quote, its own rate.
    const rb = await pdfAs(B, 'Admin', CLERK.adminB, { quoteId: qB.id });
    assert.equal(rb.statusCode, 200);
    assert.deepEqual(totalsBlock(pdfWords(rb.body)), ['Subtotal', '$100.00', 'Tax (5%)', '$5.00', 'Total', '$105.00'], 'org B\'s default, never A\'s');
});

// ── EMAIL ────────────────────────────────────────────────────────────────────

test('EMAIL: each row the line\'s quantity, net price and total, the rows the Subtotal; the block Subtotal, Deal discount, Tax, Total, adding up', async () => {
    const q = await makeQuote({ lineItems: SPLIT(), dealDiscount: 10, taxRate: 8.25, taxExempt: false, billingContact: 'Pat Buyer <pat@customer.itest>' }, 'Approved');
    assert.deepEqual([q.subtotal, q.totalValue, q.taxAmount], ['940.00', '846.00', '40.10']);
    mails.length = 0;
    const r = parse(await emailFn(ev(A, 'User', CLERK.rep, 'POST', { quoteId: q.id })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(mails.length, 1);
    const html = mails[0].html;
    const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((t) => t[1])).filter((cells) => cells.length === 4);
    assert.deepEqual(rows, [['Itest Taxdoc taxed', '2', '$270.00', '$540.00'], ['Itest Taxdoc untaxed', '1', '$400.00', '$400.00']],
        'REGRESSION (§0.241): the email\'s rows read fields no line has — Qty 1 at the list price');
    for (const [, qty, unit, total] of rows) assert.equal(Number(qty) * cents(unit), cents(total), 'a row\'s quantity times its price is its total');
    const block = [...html.matchAll(/<div style="text-align:right;[^"]*">([^<]*)<\/div>/g)].map((m) => m[1]);
    assert.deepEqual(block, ['Subtotal: $940.00', 'Deal discount (10%): -$94.00', 'Tax (8.25%): $40.10', 'Total: $886.10']);
    const amount = (s) => cents(s.slice(s.lastIndexOf(': ') + 2));
    assert.equal(rows.reduce((sum, row) => sum + cents(row[3]), 0), amount(block[0]), 'the rows are the Subtotal');
    assert.equal(amount(block[0]) + amount(block[1]) + amount(block[2]), amount(block[3]), 'the block adds up to its Total');
    // Written before tax: no tax row, the Total the pre-tax total as before.
    const old = await makeQuote({ lineItems: SPLIT().map(({ taxable, ...li }) => li), taxRate: null, taxExempt: false, billingContact: 'pat@customer.itest' }, 'Approved');
    mails.length = 0;
    assert.equal((await emailFn(ev(A, 'User', CLERK.rep, 'POST', { quoteId: old.id }))).statusCode, 200);
    assert.deepEqual([...mails[0].html.matchAll(/<div style="text-align:right;[^"]*">([^<]*)<\/div>/g)].map((m) => m[1]), ['Subtotal: $940.00', 'Total: $940.00']);
});

// ── JOB → INVOICE ────────────────────────────────────────────────────────────

const jobFor = async (quoteId) => {
    const r = parse(await toJobFn(ev(A, 'Admin', CLERK.admin, 'POST', { quoteId })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const items = await db.select().from(dispatchJobLineItems)
        .where(and(eq(dispatchJobLineItems.orgId, A), eq(dispatchJobLineItems.jobId, r.body.job.id))).orderBy(asc(dispatchJobLineItems.sortOrder));
    return { job: r.body.job, items: items.map((i) => [i.itemType, i.description, i.quantity, i.unitPrice, i.totalPrice, i.taxable]) };
};
const invoiceFor = async (jobId, extra = {}) => {
    const r = parse(await invoicesFn(ev(A, 'Admin', CLERK.admin, 'POST', { jobId, ...extra })));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.invoice;
};

test('JOB: a taxed quote\'s job keeps each line\'s Taxable and the deal discount; its invoice takes the quote\'s rate, its totals the quote\'s to the cent', async () => {
    const q = await makeQuote({ lineItems: SPLIT(), dealDiscount: 10, taxRate: 8.25, taxExempt: false }, 'Accepted');
    const { job, items } = await jobFor(q.id);
    assert.deepEqual(items, [
        ['part', 'Itest Taxdoc taxed', '2.00', '270.00', '540.00', true],
        ['part', 'Itest Taxdoc untaxed', '1.00', '400.00', '400.00', false],
        ['discount', 'Discount (10%)', '1.00', '-54.00', '-54.00', true],
        ['discount', 'Discount (10%), untaxed items', '1.00', '-40.00', '-40.00', false],
    ], 'REGRESSION (§0.241): the job lost a line\'s Taxable, or the deal discount');
    const inv = await invoiceFor(job.id);
    assert.equal(inv.taxRate, 8.25, 'REGRESSION (§0.241): the invoice\'s rate is not its quote\'s');
    assert.deepEqual([inv.subtotal, inv.taxAmount, inv.total], [846, 40.1, 886.1], 'REGRESSION (§0.241): the invoice is not the quote');
    assert.equal(Math.round(inv.total * 100), Math.round((Number(q.totalValue) + Number(q.taxAmount)) * 100), 'the quote\'s grand total, to the cent');
    assert.equal(inv.lineItems.filter((l) => l.taxable === false).length, 2, 'its lines\' Taxable from the job');
    const [jobRow] = await db.select().from(dispatchJobs).where(eq(dispatchJobs.id, job.id));
    assert.equal(jobRow.invoiceAmount, '886.10', 'the job mirrors it');
});

test('JOB: an exempt quote\'s invoice is rated 0; a quote with no rate as before; a rate the request names wins', async () => {
    const ex = await makeQuote({ lineItems: SPLIT(), dealDiscount: 10, taxRate: 8.25, taxExempt: true }, 'Accepted');
    const exJob = await jobFor(ex.id);
    assert.deepEqual(exJob.items.map((i) => i[5]), [true, false, true, false], 'the lines keep their Taxable');
    const exInv = await invoiceFor(exJob.job.id);
    assert.deepEqual([exInv.taxRate, exInv.taxAmount, exInv.total], [0, 0, 846], 'REGRESSION (Q4): an exempt quote\'s invoice taxed');
    // Written before tax: no rate, no deal discount, no flags — every line taxable, no discount line, the rate 0.
    const old = await makeQuote({ lineItems: SPLIT().map(({ taxable, ...li }) => li), taxRate: null, taxExempt: false }, 'Accepted');
    const oldJob = await jobFor(old.id);
    assert.deepEqual(oldJob.items.map((i) => [i[0], i[5]]), [['part', true], ['part', true]], 'every line taxable, no discount line');
    const oldInv = await invoiceFor(oldJob.job.id);
    assert.deepEqual([oldInv.taxRate, oldInv.taxAmount, oldInv.total], [0, 0, 940], 'as every invoice was before');
    // The request's rate wins over the quote's.
    const named = await makeQuote({ lineItems: SPLIT(), dealDiscount: 10, taxRate: 8.25, taxExempt: false }, 'Accepted');
    const namedInv = await invoiceFor((await jobFor(named.id)).job.id, { taxRate: 5 });
    assert.deepEqual([namedInv.taxRate, namedInv.taxAmount], [5, 24.3], 'the rate the request names: 5% of 486');
});

// ── ORG B ────────────────────────────────────────────────────────────────────

test('ORG B: its quote, settings, products, deals, jobs and invoices untouched by all of the above; it cannot make a job of org A\'s quote', async () => {
    const q = await makeQuote({ lineItems: DESIGN(), taxExempt: false }, 'Accepted');
    const r = parse(await toJobFn(ev(B, 'Admin', CLERK.adminB, 'POST', { quoteId: q.id })));
    assert.equal(r.status, 404, 'org A\'s quote is no job of org B\'s');
    assert.deepEqual(await snapshotB(), bBefore, 'REGRESSION: org B\'s rows changed');
});
