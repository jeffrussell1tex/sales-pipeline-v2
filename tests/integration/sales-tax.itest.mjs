// tests/integration/sales-tax.itest.mjs
// Sales tax on quotes, batch A's core (state §0.241; docs/design/sales-tax R1-R5, Jeff's answers 10 Nov) — against the
// real test database. Proves, on quotes.mjs and products.mjs:
//   DEFAULT   a new quote naming no rate takes the org's default (Settings → Quotes, quoteDefaults.taxRate), stored on
//             it; one naming a rate keeps it (two places); none, blank or out of range is no rate and no tax
//   LINES     the tax is on the taxable lines only — a line with no flag taxable — after the deal discount, pro rata;
//             totalValue stays pre-tax
//   EXEMPT    a new quote's "Tax exempt" is the deal's dispatch customer's (Dispatch's one rule, this org's rows only);
//             an exempt quote is taxed nothing; the body's switch wins
//   ARR       accepting a taxed quote writes the PRE-TAX total to the deal's arr
//   STORED    a default change never reprices a stored quote on its next save; a new quote takes the new default
//   OLDER     a quote written before tax (no rate, no flags) moved Sent → Accepted, or saved whole as a screen sends
//             it, is neither refused nor re-tiered, and gains no tax
//   PRODUCTS  a product's Taxable is true, false or none — refused otherwise — and a save that leaves it out keeps it
//   ORG B     its quotes, products and settings untouched; its default and its customers never reach org A's quotes
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; mail and SMS are stubbed.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_tax_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: quotesFn } = await import('../../netlify/functions/quotes.mjs');
const { handler: productsFn } = await import('../../netlify/functions/products.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, quotes, auditLog, settings, products, accounts, dispatchCustomers } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_tax_*', and only this file writes to it.
const A = 'itest_tax_A', B = 'itest_tax_B';
const CLERK = { rep: 'clerk_itest_tax_rep', admin: 'clerk_itest_tax_admin', adminB: 'clerk_itest_tax_admin_b' };
const USR = { rep: 'usr_itest-tax-rep', admin: 'usr_itest-tax-admin', adminB: 'usr_itest-tax-admin-b' };
const ACC = { plain: 'acc_itest_tax_plain', exempt: 'acc_itest_tax_exempt', b: 'acc_itest_tax_b' };
const OPP = {
    plain:  'opp_itest_tax_plain',    // on an account with no dispatch customer
    exempt: 'opp_itest_tax_exempt',   // on an account whose one dispatch customer is exempt
    twin:   'opp_itest_tax_twin',     // on no account, named as org B's exempt customer is
    older:  'opp_itest_tax_older',    // the quote written before tax
    b:      'opp_itest_tax_b',
};
const P = { taxed: 'p_itest_tax_taxed', untaxed: 'p_itest_tax_untaxed', b: 'p_itest_tax_b' };
const Q = { older: 'q_itest_tax_older', olderApproved: 'q_itest_tax_older_appr', b: 'q_itest_tax_b' };

const ev = (org, role, user, method = 'GET', body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const rep = (m, b, qs) => quotesFn(ev(A, 'User', CLERK.rep, m, b, qs)).then(parse);
const adminProducts = (org, m, b) => productsFn(ev(org, 'Admin', org === A ? CLERK.admin : CLERK.adminB, m, b)).then(parse);
const row = async (id) => (await db.select().from(quotes).where(eq(quotes.id, id)))[0];
const product = async (id) => (await db.select().from(products).where(eq(products.id, id)))[0];
const dealArr = async (id) => (await db.select({ arr: opportunities.arr }).from(opportunities).where(eq(opportunities.id, id)))[0].arr;
let n = 0;
const newId = () => `q_itest_tax_new_${++n}`;

const line = (productId, listPrice, extra = {}) => ({ productId, productName: 'Itest Tax thing', productType: 'one_time', unit: 'flat', listPrice, quantity: 1, discountPct: 0, ...extra });
// The two lines most tests price: 1000 taxable (no flag), 500 not taxable.
const MIXED = () => [line(P.taxed, 1000), line(P.untaxed, 500, { taxable: false })];
const QD = (taxRate) => ({ validity: '30 days', paymentTerms: 'Net-30', taxRate });

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(quotes).where(eq(quotes.orgId, o));
        await db.delete(products).where(eq(products.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(dispatchCustomers).where(eq(dispatchCustomers.orgId, o));
        await db.delete(accounts).where(eq(accounts.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

let bBefore;
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const u = (key, role, org = A) => ({ id: USR[key], clerkUserId: CLERK[key], orgId: org, name: `Itest Tax ${key}`, email: `tax-${key}@itest.local`, role });
    await db.insert(users).values([u('rep', 'User'), u('admin', 'Admin'), u('adminB', 'Admin', B)]);
    invalidateRoster();
    await db.insert(settings).values([
        { id: 'itest_tax_settings_A', orgId: A, extra: { quoteDefaults: QD(8.25) } },
        { id: 'itest_tax_settings_B', orgId: B, extra: { quoteDefaults: QD(5) } },
    ]);
    await db.insert(accounts).values([
        { id: ACC.plain, orgId: A, name: 'Itest Tax Plain Co' },
        { id: ACC.exempt, orgId: A, name: 'Itest Tax Church' },
        { id: ACC.b, orgId: B, name: 'Itest Tax B Co' },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: 'cust_itest_tax_exempt', orgId: A, name: 'Itest Tax Church', accountId: ACC.exempt, customerNumber: 'CUST-0001', taxExempt: true },
        // Org B's exempt customer, of the name org A's twin deal carries: never org A's.
        { id: 'cust_itest_tax_twin_b', orgId: B, name: 'Itest Tax Twin', accountId: null, customerNumber: 'CUST-0001', taxExempt: true },
    ]);
    const opp = (id, org, accountId, account) => ({ id, orgId: org, ownerId: org === A ? USR.rep : null, salesRep: org === A ? 'Itest Tax rep' : '',
        opportunityName: id, account, accountId, pipelineId: 'default', stage: 'Proposal', arr: '1.00' });
    await db.insert(opportunities).values([
        opp(OPP.plain, A, ACC.plain, 'Itest Tax Plain Co'), opp(OPP.exempt, A, ACC.exempt, 'Itest Tax Church'),
        opp(OPP.twin, A, null, 'Itest Tax Twin'), opp(OPP.older, A, ACC.plain, 'Itest Tax Plain Co'), opp(OPP.b, B, ACC.b, 'Itest Tax B Co'),
    ]);
    await db.insert(products).values([
        { id: P.taxed, orgId: A, name: 'Itest Tax taxed', productType: 'one_time', unit: 'flat', listPrice: '1000.00' },
        { id: P.untaxed, orgId: A, name: 'Itest Tax untaxed', productType: 'one_time', unit: 'flat', listPrice: '500.00', taxable: false },
        { id: P.b, orgId: B, name: 'Itest Tax B', productType: 'one_time', unit: 'flat', listPrice: '10.00', taxable: false },
    ]);
    // Written before tax: no taxable flags, no rate, no amount, no switch — Sent, and an Approved one with its stamp.
    const olderLines = [{ productId: P.taxed, productName: 'Itest Tax taxed', productType: 'one_time', unit: 'flat', listPrice: 100, quantity: 2, discountPct: 0 }];
    const older = (id, status, extra = {}) => ({ id, orgId: A, opportunityId: OPP.older, quoteNumber: 'Q-2026-9' + (id === Q.older ? '01' : '02'), version: 1,
        name: id, status, lineItems: olderLines, subtotal: '200.00', dealDiscount: '0.00', totalValue: '200.00', recurringValue: '0.00', oneTimeValue: '200.00',
        createdBy: 'Itest Tax rep', approvalTier: 'Rep', ...extra });
    await db.insert(quotes).values([
        older(Q.older, 'Sent to Customer', { sentAt: new Date() }),
        older(Q.olderApproved, 'Approved', { approvedBy: 'Itest Tax mgr', approvedAt: new Date() }),
        { id: Q.b, orgId: B, opportunityId: OPP.b, quoteNumber: 'Q-2026-950', version: 1, name: 'B', status: 'Draft',
            lineItems: [line(P.b, 10)], subtotal: '10.00', dealDiscount: '0', totalValue: '10.00', recurringValue: '0.00', oneTimeValue: '10.00',
            taxRate: '5.00', taxAmount: '0.00', taxExempt: false, createdBy: 'B' },
    ]);
    bBefore = {
        quotes: JSON.stringify(await db.select().from(quotes).where(eq(quotes.orgId, B))),
        products: JSON.stringify(await db.select().from(products).where(eq(products.orgId, B))),
        settings: JSON.stringify(await db.select().from(settings).where(eq(settings.orgId, B))),
        opps: JSON.stringify(await db.select().from(opportunities).where(eq(opportunities.orgId, B))),
    };
});
after(cleanup);

// ── DEFAULT ──────────────────────────────────────────────────────────────────

test('DEFAULT: a new quote naming no rate takes the org\'s default, stored on it; the tax is the server\'s, the total pre-tax', async () => {
    const id = newId();
    const res = await rep('POST', { id, opportunityId: OPP.plain, lineItems: MIXED(), taxAmount: '999.99', totalValue: '1.00' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const r = await row(id);
    assert.equal(r.taxRate, '8.25', 'the org default (quoteDefaults.taxRate)');
    assert.equal(r.taxAmount, '82.50', '8.25% of the 1000 taxable — never the body\'s figure');
    assert.equal(r.totalValue, '1500.00', 'pre-tax');
    assert.equal(r.subtotal, '1500.00');
    assert.equal(r.taxExempt, false, 'the deal\'s account has no dispatch customer');
    assert.equal(res.body.quote.taxRate, '8.25', 'the answer carries it');
});

test('DEFAULT: a rate the quote names is kept to two places; none or blank is no rate and no tax; out of range or junk is refused, naming the field', async () => {
    const named = newId();
    assert.equal((await rep('POST', { id: named, opportunityId: OPP.plain, lineItems: MIXED(), taxRate: '6.555' })).status, 201);
    assert.equal((await row(named)).taxRate, '6.56');
    assert.equal((await row(named)).taxAmount, '65.60');
    // Refused, nothing written — never stored as no tax without a word (the review, 10 Nov); on a save too.
    for (const bad of [150, -1, 'abc', '8,25', true]) {
        const id = newId();
        const res = await rep('POST', { id, opportunityId: OPP.plain, lineItems: MIXED(), taxRate: bad });
        assert.equal(res.status, 400, `${JSON.stringify(bad)}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.field, 'taxRate');
        assert.equal(await row(id), undefined, `${JSON.stringify(bad)}: nothing written`);
        const put = await rep('PUT', { id: named, taxRate: bad });
        assert.equal(put.status, 400, `PUT ${JSON.stringify(bad)}`);
        assert.equal((await row(named)).taxRate, '6.56', `PUT ${JSON.stringify(bad)}: the stored rate kept`);
    }
    for (const none of [null, '']) {
        const id = newId();
        const res = await rep('POST', { id, opportunityId: OPP.plain, lineItems: MIXED(), taxRate: none });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const r = await row(id);
        assert.equal(r.taxRate, null, JSON.stringify(none));
        assert.equal(r.taxAmount, null, `${JSON.stringify(none)}: no rate, no tax amount`);
        assert.equal(r.totalValue, '1500.00');
    }
    const zero = newId();
    await rep('POST', { id: zero, opportunityId: OPP.plain, lineItems: MIXED(), taxRate: 0 });
    assert.equal((await row(zero)).taxRate, '0.00');
    assert.equal((await row(zero)).taxAmount, '0.00');
});

// ── LINES ────────────────────────────────────────────────────────────────────

test('LINES: tax on the taxable lines only, after the deal discount spread pro rata; a save re-works it', async () => {
    const id = newId();
    const lines = [line(P.taxed, 600), line(P.untaxed, 400, { taxable: false })];
    assert.equal((await rep('POST', { id, opportunityId: OPP.plain, lineItems: lines, dealDiscount: 10, taxRate: 5 })).status, 201);
    let r = await row(id);
    assert.equal(r.totalValue, '900.00');
    assert.equal(r.taxAmount, '27.00', '5% of 600 less its 10%');
    // Every line taxable now: the base is the whole total.
    const res = await rep('PUT', { id, lineItems: lines.map((l) => ({ ...l, taxable: true })) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    r = await row(id);
    assert.equal(r.taxAmount, '45.00');
    assert.equal(r.totalValue, '900.00', 'the total never moves with the tax');
    // The rate changed on the Draft: the stored one, the tax re-worked.
    assert.equal((await rep('PUT', { id, taxRate: 7.25 })).status, 200);
    r = await row(id);
    assert.equal(r.taxRate, '7.25');
    assert.equal(r.taxAmount, '65.25');
});

// ── EXEMPT ───────────────────────────────────────────────────────────────────

test('EXEMPT: a new quote on a deal whose dispatch customer is exempt is exempt — taxed nothing, its rate still stored; the body\'s switch wins', async () => {
    const id = newId();
    assert.equal((await rep('POST', { id, opportunityId: OPP.exempt, lineItems: MIXED() })).status, 201);
    let r = await row(id);
    assert.equal(r.taxExempt, true, 'the customer linked to the deal\'s account is exempt');
    assert.equal(r.taxRate, '8.25');
    assert.equal(r.taxAmount, '0.00');
    assert.equal(r.totalValue, '1500.00');
    const off = newId();
    assert.equal((await rep('POST', { id: off, opportunityId: OPP.exempt, lineItems: MIXED(), taxExempt: false })).status, 201);
    assert.equal((await row(off)).taxExempt, false);
    assert.equal((await row(off)).taxAmount, '82.50');
    const on = newId();
    assert.equal((await rep('POST', { id: on, opportunityId: OPP.plain, lineItems: MIXED(), taxExempt: true })).status, 201);
    assert.equal((await row(on)).taxAmount, '0.00');
    // The switch turned off on a Draft: taxed.
    assert.equal((await rep('PUT', { id, taxExempt: false })).status, 200);
    r = await row(id);
    assert.equal(r.taxExempt, false);
    assert.equal(r.taxAmount, '82.50');
});

test('EXEMPT is this org\'s: org B\'s exempt customer of the deal\'s name never makes org A\'s quote exempt', async () => {
    const id = newId();
    assert.equal((await rep('POST', { id, opportunityId: OPP.twin, lineItems: MIXED() })).status, 201);
    assert.equal((await row(id)).taxExempt, false);
    assert.equal((await row(id)).taxAmount, '82.50');
});

// ── ARR ──────────────────────────────────────────────────────────────────────

test('ARR: accepting a taxed quote writes the PRE-TAX total to the deal — never the tax', async () => {
    const id = newId();
    assert.equal((await rep('POST', { id, opportunityId: OPP.plain, lineItems: MIXED() })).status, 201);
    assert.equal((await rep('PUT', { id, status: 'Sent to Customer' })).status, 200);
    const res = await rep('PUT', { id, status: 'Accepted' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await row(id);
    assert.equal(r.status, 'Accepted');
    assert.equal(r.taxAmount, '82.50');
    assert.equal(await dealArr(OPP.plain), '1500.00', 'the deal\'s arr is the pre-tax total, not 1582.50');
});

// ── STORED ───────────────────────────────────────────────────────────────────

test('STORED: a default change never reprices a stored quote on its next save; a new quote takes the new default', async () => {
    const id = newId();
    assert.equal((await rep('POST', { id, opportunityId: OPP.plain, lineItems: MIXED() })).status, 201);
    assert.equal((await row(id)).taxRate, '8.25');
    await db.update(settings).set({ extra: { quoteDefaults: QD(10) } }).where(eq(settings.orgId, A));
    try {
        const res = await rep('PUT', { id, notes: 'Re-saved after the default changed', lineItems: MIXED() });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const r = await row(id);
        assert.equal(r.taxRate, '8.25', 'the stored rate');
        assert.equal(r.taxAmount, '82.50', 'not repriced at 10%');
        assert.equal((await rep('PUT', { id, status: 'Sent to Customer' })).status, 200, 'a status move neither');
        assert.equal((await row(id)).taxAmount, '82.50');
        const fresh = newId();
        assert.equal((await rep('POST', { id: fresh, opportunityId: OPP.plain, lineItems: MIXED() })).status, 201);
        assert.equal((await row(fresh)).taxRate, '10.00');
        assert.equal((await row(fresh)).taxAmount, '100.00');
    } finally {
        await db.update(settings).set({ extra: { quoteDefaults: QD(8.25) } }).where(eq(settings.orgId, A));
    }
});

test('STORED: a sent quote\'s rate and switch are its terms — a change is refused, nothing written', async () => {
    const id = newId();
    assert.equal((await rep('POST', { id, opportunityId: OPP.plain, lineItems: MIXED() })).status, 201);
    assert.equal((await rep('PUT', { id, status: 'Sent to Customer' })).status, 200);
    for (const change of [{ taxRate: 9 }, { taxRate: null }, { taxExempt: true }, { lineItems: [line(P.taxed, 1000, { taxable: false }), line(P.untaxed, 500, { taxable: false })] }]) {
        const res = await rep('PUT', { id, ...change });
        assert.equal(res.status, 409, JSON.stringify(change));
    }
    const r = await row(id);
    assert.equal(r.taxRate, '8.25');
    assert.equal(r.taxExempt, false);
    assert.equal(r.taxAmount, '82.50');
    // The stored values sent back as a screen sends them ("8.25", the flags spelled out) are no change.
    const res = await rep('PUT', { ...r, taxRate: '8.25', lineItems: r.lineItems.map((l) => ({ ...l, taxable: l.taxable !== false })), status: 'Sent to Customer' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
});

// ── OLDER ────────────────────────────────────────────────────────────────────

test('OLDER: a quote written before tax, moved Sent → Accepted, is not refused, not re-tiered, gains no tax; the deal\'s arr its total', async () => {
    const res = await rep('PUT', { id: Q.older, status: 'Accepted' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await row(Q.older);
    assert.equal(r.status, 'Accepted');
    assert.equal(r.taxRate, null);
    assert.equal(r.taxAmount, null);
    assert.equal(r.taxExempt, null);
    assert.equal(r.approvalTier, 'Rep', 'not re-tiered');
    assert.equal(r.totalValue, '200.00');
    assert.deepEqual(r.lineItems.map((l) => 'taxable' in l), [false], 'its lines as stored');
    assert.equal(await dealArr(OPP.older), '200.00');
});

test('OLDER: an approved quote written before tax, saved whole as a screen sends it (flags spelled out), stays approved', async () => {
    const got = await rep('GET', null, { opportunityId: OPP.older });
    const q = got.body.quotes.find((x) => x.id === Q.olderApproved);
    assert.ok(q, 'the rep reads it');
    assert.equal(q.taxRate, null);
    // The builder sends its blank rate field as none (taxRateFromInput('') is { rate: null }).
    for (const body of [{ ...q }, { ...q, lineItems: q.lineItems.map((l) => ({ ...l, taxable: true })), taxExempt: false, taxRate: null }]) {
        const res = await rep('PUT', body);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const r = await row(Q.olderApproved);
        assert.equal(r.status, 'Approved', 'no change in meaning: the approval holds');
        assert.equal(r.approvedBy, 'Itest Tax mgr');
        assert.equal(r.approvalTier, 'Rep');
        assert.equal(r.totalValue, '200.00');
    }
    // A rate of 0 is a change (the review, 10 Nov): the customer's copy gains a "Tax (0%)" row, so the approval goes.
    const res = await rep('PUT', { ...q, taxRate: 0 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await row(Q.olderApproved);
    assert.equal(r.status, 'Draft', 'REGRESSION: none to 0 kept the approval');
    assert.equal(r.taxRate, '0.00');
});

// ── PRODUCTS ─────────────────────────────────────────────────────────────────

test('PRODUCTS: Taxable is true, false or none — refused otherwise; a save that leaves it out keeps the stored one', async () => {
    const id = 'p_itest_tax_made';
    const made = await adminProducts(A, 'POST', { id, name: 'Itest Tax made', listPrice: 25, taxable: false });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal((await product(id)).taxable, false);
    // The product PUT is an upsert whose insert half needs the name and price (a body without them is a 500 today,
    // before and after this batch), so each save sends them, as the Products screen does.
    const save = (extra) => adminProducts(A, 'PUT', { id, name: 'Itest Tax made, renamed', listPrice: 30, ...extra });
    assert.equal((await save({})).status, 200);
    assert.equal((await product(id)).taxable, false, 'left out: kept');
    assert.equal((await product(id)).name, 'Itest Tax made, renamed');
    assert.equal((await save({ taxable: true })).status, 200);
    assert.equal((await product(id)).taxable, true);
    assert.equal((await save({})).status, 200);
    assert.equal((await product(id)).taxable, true, 'left out: kept (true)');
    assert.equal((await save({ taxable: null })).status, 200);
    assert.equal((await product(id)).taxable, null, 'none: taxable');
    for (const bad of ['yes', 1, 'false', {}]) {
        const res = await save({ taxable: bad });
        assert.equal(res.status, 400, JSON.stringify(bad));
        assert.equal(res.body.field, 'taxable');
    }
    assert.equal((await product(id)).taxable, null, 'a refusal writes nothing');
    assert.equal((await adminProducts(A, 'POST', { id: 'p_itest_tax_bad', name: 'Bad', listPrice: 1, taxable: 'no' })).status, 400);
    assert.equal(await product('p_itest_tax_bad'), undefined);
    const plain = await adminProducts(A, 'POST', { id: 'p_itest_tax_plain', name: 'Itest Tax plain', listPrice: 5 });
    assert.equal(plain.status, 201);
    assert.equal((await product('p_itest_tax_plain')).taxable, null, 'none named: none (taxable)');
    // Org B's product through org A's save: not found, untouched.
    assert.equal((await adminProducts(A, 'PUT', { id: P.b, name: 'Itest Tax B', listPrice: 10, taxable: true })).status, 404);
});

// ── ORG B ────────────────────────────────────────────────────────────────────

test('ORG B: its quotes, products, settings and deals are untouched; org A cannot save its quote; its own default is its own', async () => {
    const res = await rep('PUT', { id: Q.b, taxRate: 1 });
    assert.equal(res.status, 404);
    assert.equal(JSON.stringify(await db.select().from(quotes).where(eq(quotes.orgId, B))), bBefore.quotes);
    assert.equal(JSON.stringify(await db.select().from(products).where(eq(products.orgId, B))), bBefore.products);
    assert.equal(JSON.stringify(await db.select().from(settings).where(eq(settings.orgId, B))), bBefore.settings);
    assert.equal(JSON.stringify(await db.select().from(opportunities).where(eq(opportunities.orgId, B))), bBefore.opps);
    // Org B's own new quote takes org B's default (5), never org A's.
    const id = 'q_itest_tax_b_new';
    const made = parse(await quotesFn(ev(B, 'Admin', CLERK.adminB, 'POST', { id, opportunityId: OPP.b, lineItems: [line(P.b, 10, { taxable: true })] })));
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal((await row(id)).taxRate, '5.00');
    assert.equal((await row(id)).taxAmount, '0.50');
});
