// tests/sales-tax.test.mjs — sales tax on quotes, batch A's core (state §0.241; docs/design/sales-tax R1-R5, Jeff's
// answers 10 Nov). The edit lock is RUN (quoteRules.js): the rate and the "Tax exempt" switch are terms, compared by
// meaning — "8.25" against 8.25, a line with no taxable flag against one flagged taxable — so a quote written before
// tax never reads as changed (an Approved one would fall to Draft, a Sent one's status move be refused). The endpoints
// import db/index.js and cannot load under `npm test` (§18b23): quotes.mjs, products.mjs and the schema are pinned by
// scan. The whole path against the test database: tests/integration/sales-tax.itest.mjs. The arithmetic:
// tests/quote-totals.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUOTE_TERMS_FIELDS, quoteTermsChanged, quoteEditOutcome } from '../src/utils/quoteRules.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

// ── the edit lock, RUN ───────────────────────────────────────────────────────

test('the rate and "Tax exempt" are terms: a change to either is a change; the stored "8.25" and a screen\'s 8.25 are not', () => {
    assert.ok(QUOTE_TERMS_FIELDS.includes('taxRate') && QUOTE_TERMS_FIELDS.includes('taxExempt'));
    const stored = { lineItems: [{ productId: 'p1', quantity: 1, listPrice: 100, discountPct: 0 }], dealDiscount: '0.00', taxRate: '8.25', taxExempt: false };
    assert.equal(quoteTermsChanged(stored, { ...stored, taxRate: 8.25 }), false, 'the database answers "8.25"');
    assert.equal(quoteTermsChanged(stored, { ...stored, taxRate: '8.250' }), false);
    assert.equal(quoteTermsChanged(stored, { ...stored, taxRate: 7 }), true);
    assert.equal(quoteTermsChanged(stored, { ...stored, taxRate: null }), true, 'the rate taken off');
    assert.equal(quoteTermsChanged(stored, { ...stored, taxExempt: true }), true);
    assert.equal(quoteTermsChanged(stored, { ...stored, taxExempt: null }), false, 'none is not exempt');
    assert.equal(quoteTermsChanged({ ...stored, taxExempt: true }, { ...stored, taxExempt: 'true' }), false);
    // An approved quote whose rate changes falls to Draft; a sent one's change is refused — as any term's.
    assert.equal(quoteEditOutcome({ status: 'Approved', termsChanged: quoteTermsChanged(stored, { ...stored, taxRate: 9 }) }).status, 'Draft');
    assert.match(quoteEditOutcome({ status: 'Sent to Customer', termsChanged: quoteTermsChanged(stored, { ...stored, taxExempt: true }) }).refusal, /lines and terms are final/);
});

test('a quote written before tax never reads as changed: no rate (null) against none or blank, no exempt (null) against false, no taxable flags against true — and none apart from 0', () => {
    const older = { lineItems: [{ productId: 'p1', quantity: '2', listPrice: 100, discountPct: 0 }, { productId: 'p2', quantity: 1, listPrice: '50.00', discountPct: 5 }],
        dealDiscount: '0.00', notes: null, taxRate: null, taxExempt: null };
    assert.equal(quoteTermsChanged(older, { ...older }), false);
    assert.equal(quoteTermsChanged(older, { ...older, taxRate: undefined, taxExempt: undefined }), false, 'a status move\'s merge');
    assert.equal(quoteTermsChanged(older, { ...older, taxExempt: false }), false, 'no exempt and not exempt are one');
    assert.equal(quoteTermsChanged(older, { ...older, taxRate: '' }), false, 'a blank rate is none');
    // None apart from 0 (the review, 10 Nov): none prints no tax row, 0 prints "Tax (0%)" — a move between them is a
    // change of what the customer holds.
    assert.equal(quoteTermsChanged(older, { ...older, taxRate: 0 }), true, 'REGRESSION: none and 0 read as one rate');
    assert.equal(quoteTermsChanged({ ...older, taxRate: '0.00' }, { ...older, taxRate: null }), true);
    assert.equal(quoteTermsChanged({ ...older, taxRate: '0.00' }, { ...older, taxRate: 0 }), false, '"0.00" is 0');
    assert.equal(quoteTermsChanged({ ...older, taxRate: '8.25' }, { ...older, taxRate: 8.25 }), false, '"8.25" is 8.25');
    const flagged = { ...older, lineItems: older.lineItems.map((li) => ({ ...li, taxable: true })) };
    assert.equal(quoteTermsChanged(older, flagged), false, 'a line with no flag is a taxable line');
    assert.equal(quoteTermsChanged(flagged, older), false, 'either way round');
    const shuffled = { ...older, lineItems: [{ taxable: true, discountPct: 0, listPrice: '100', quantity: 2, productId: 'p1' }, older.lineItems[1]] };
    assert.equal(quoteTermsChanged(older, shuffled), false, 'the flag sorts with the other keys');
    const off = { ...older, lineItems: [{ ...older.lineItems[0], taxable: false }, older.lineItems[1]] };
    assert.equal(quoteTermsChanged(older, off), true, 'a line switched to not taxable is a change');
    assert.equal(quoteTermsChanged(older, { ...older, lineItems: [{ ...older.lineItems[0], taxable: 'false' }, older.lineItems[1]] }), true);
    assert.equal(quoteTermsChanged({ ...older, lineItems: [null] }, { ...older, lineItems: [null] }), false, 'a null line reads as itself');
});

// ── the wiring, by scan ──────────────────────────────────────────────────────

test('quotes.mjs: its money is quoteTotals\'s; the rate stored on the quote, the tax the server\'s; the deal\'s arr the pre-tax total', () => {
    const s = code(read('netlify/functions/quotes.mjs'));
    assert.equal(count(s, "import { quoteTotals, cleanTaxRate, cleanTaxExempt, defaultTaxRateOf, cleanDealDiscount, percentRefused, lineDiscountRefusal, samePercent } from '../../src/utils/quoteTotals.js';"), 1);
    assert.equal(count(s, "import { customerForDeal } from '../../src/utils/dispatchCustomer.js';"), 1);
    const calc = between(s, 'function calcTotals(', '\n}\n');
    assert.ok(calc.includes('const t = quoteTotals({ lineItems, dealDiscount: dealDiscountPct, taxRate, taxExempt });'), 'one copy of the money');
    assert.ok(calc.includes('totalValue: t.totalValue.toFixed(2),') && !calc.includes('grandTotal'), 'totalValue is pre-tax — never the grand total');
    assert.ok(calc.includes('taxAmount: t.taxRate == null ? null : t.taxAmount.toFixed(2),'), 'no rate, no tax amount stored');
    assert.ok(!/let subtotal|for \(const item of lineItems\)/.test(calc), 'the old arithmetic is gone');
    // The allowlist names the rate and the switch, never the amount.
    const allowed = between(s, 'const ALLOWED_FIELDS = [', '];');
    assert.ok(allowed.includes("'taxRate', 'taxExempt',") && !allowed.includes("'taxAmount'"), 'the amount is the server\'s');
    // The default: the org's quoteDefaults through the one clamped reader, by org.
    const dflt = between(s, 'export async function getDefaultTaxRate(orgId) {', '\n}\n');
    assert.ok(dflt.includes('.where(eq(settingsTable.orgId, orgId))') && dflt.includes('return defaultTaxRateOf(row?.extra?.quoteDefaults);'));
    // "Tax exempt" from the deal's dispatch customer: this org's rows alone, Dispatch's one rule.
    const exempt = between(s, 'async function dealCustomerExempt(orgId, opportunityId) {', '\n}\n');
    assert.ok(exempt.includes('eq(opportunities.id, String(opportunityId)), eq(opportunities.orgId, orgId)'));
    assert.ok(exempt.includes('.from(dispatchCustomers).where(eq(dispatchCustomers.orgId, orgId));'));
    assert.ok(exempt.includes('.from(accounts).where(eq(accounts.orgId, orgId));'));
    assert.ok(exempt.includes('return customerForDeal(orgCustomers, opp, orgAccounts).customer?.taxExempt === true;'));
    // A create: the body's rate cleaned, else the org default; the switch the body's, else the customer's.
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    // A named rate it cannot read is refused, naming the field — never stored as no tax without a word (the review).
    assert.ok(s.includes("const taxRateRefused = (data) => 'taxRate' in data && data.taxRate != null && data.taxRate !== '' && cleanTaxRate(data.taxRate) == null;"));
    const REFUSE = "if (taxRateRefused(data)) return { statusCode: 400, headers, body: JSON.stringify({ error: TAX_RATE_REFUSED, field: 'taxRate' }) };";
    order(post,
        'if (!access.canWrite) return refuse(403,',
        REFUSE,
        "const taxRate = 'taxRate' in data ? cleanTaxRate(data.taxRate) : await getDefaultTaxRate(orgId);",
        'const taxExempt = data.taxExempt != null ? cleanTaxExempt(data.taxExempt) : await dealCustomerExempt(orgId, access.deal.id);',
        'const totals = calcTotals(lineItems, dealDiscount, taxRate, taxExempt);',
        '...sanitize(data),',
        '...totals,',
        'taxRate: taxRate == null ? null : String(taxRate),',
        'taxExempt,',
        'db.insert(quotes).values({ ...basePayload, quoteNumber })');
    // A save: cleaned before the terms are compared; left out, the stored ones — never the default read again.
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(put,
        REFUSE,
        '...existing, ...sanitize(data),',
        "merged.taxRate = 'taxRate' in data ? cleanTaxRate(data.taxRate) : existing.taxRate;",
        "merged.taxExempt = 'taxExempt' in data ? cleanTaxExempt(data.taxExempt) : existing.taxExempt;",
        'const totals = calcTotals(lineItems, merged.dealDiscount ?? 0, merged.taxRate, merged.taxExempt);',
        'const termsChanged = quoteTermsChanged(existing, merged);',
        'await syncToOpportunity(orgId, existing.opportunityId, totals.totalValue);',
        '...totals,',
        'taxRate: merged.taxRate == null ? null : String(merged.taxRate),',
        'taxExempt: merged.taxExempt ?? null,');
    assert.ok(!put.includes('getDefaultTaxRate('), 'a save never reads the default — a default change never reprices a stored quote');
    assert.ok(!/syncToOpportunity\([^)]*(grandTotal|taxAmount)/.test(s), 'the deal\'s arr never takes the tax');
});

test('products.mjs: Taxable is true, false or none — refused otherwise; a save that leaves it out keeps the stored one', () => {
    const s = code(read('netlify/functions/products.mjs'));
    assert.ok(between(s, 'const ALLOWED_FIELDS = [', '];').includes("'taxable',"));
    assert.ok(s.includes('const taxableOf = (v) => (v === true || v === false ? v : v == null ? null : undefined);'));
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    order(post,
        "if (taxableOf(data.taxable) === undefined) return { statusCode: 400, headers, body: JSON.stringify({ error: TAXABLE_REFUSAL, field: 'taxable' }) };",
        'taxable: taxableOf(data.taxable),',
        'db.insert(products).values(payload)');
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    // The PUT is an update of the keys the body names (state §0.242): the stored row read in the org, then sanitize's keys.
    order(put,
        "if ('taxable' in data && taxableOf(data.taxable) === undefined) return { statusCode: 400,",
        'const { id: _id, ...named } = sanitize(data);',
        'const changes = { ...named, ...pricesOf(data, stored.customPrice), updatedAt: new Date() };',
        'db.update(products).set(changes)');
    assert.ok(!/taxable:\s*taxableOf/.test(put), 'the save names taxable only when the body does (sanitize) — never written as none for a body that left it out');
});

test('the schema: the four columns, nullable, no default — as db/apply-sales-tax.mjs added them', () => {
    const s = read('db/schema.ts');
    const quotes = between(s, "export const quotes = pgTable('quotes', {", '\n}, (t) =>');
    for (const line of [
        "    taxRate:         decimal('tax_rate', { precision: 5, scale: 2 }),",
        "    taxAmount:       decimal('tax_amount', { precision: 12, scale: 2 }),",
        "    taxExempt:       boolean('tax_exempt'),",
    ]) assert.equal(count(quotes, line + '\n'), 1, line);
    const products = between(s, "export const products = pgTable('products', {", '\n}, (t) =>');
    assert.equal(count(products, "    taxable:      boolean('taxable'),\n"), 1);
    for (const block of [quotes, products]) {
        for (const l of block.split('\n').filter((x) => /\b(tax_rate|tax_amount|tax_exempt|taxable)'/.test(x))) {
            assert.ok(!/\.default\(|\.notNull\(/.test(l), `no default, nullable: ${l.trim()}`);
            assert.match(l, /^ {4}(\w+): +\w+\(/, 'the guarded shape');
        }
    }
});
