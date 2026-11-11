// tests/quote-tax-docs.test.mjs
//
// Sales tax on quotes, batch A — the documents and the invoice (state §0.241; docs/design/sales-tax R6, R7, §6;
// Jeff's answers 10 Nov: Q4 "Carry it"). Until §0.241:
//   - the quote PDF printed the quote, the deal and the lines the request body carried, past a sign-in check alone —
//     the client's numbers on a customer's document, and no deal-access check;
//   - the quote email's rows read li.qty and li.unitPrice, which no line carries: every row said Qty 1 at the list
//     price, and the rows did not add up to its Total;
//   - a job made from a quote marked every line taxable and dropped the quote's deal discount, and its invoice's rate
//     was the request's or 0.
// These hold it:
//   JOB      quoteLineToJobItem keeps each line's Taxable (none reads taxable); quoteDiscountJobItems makes the deal
//            discount the job's discount lines — on the taxable items and on the rest — adding up to the quote's
//            total, and the invoice's tax to the quote's tax; invoiceTaxRateOfQuote the quote's rate, 0 when exempt
//   PARITY   a quote's lines and discount, made a job and invoiced at the quote's rate, are the quote to the cent
//   WIRING   the PDF reads the stored quote by id in the caller's org and its deal's access; the screen sends the id;
//            the PDF and the email read the one money copy and the one block of rows; quote-to-job carries the
//            discount; a new invoice reads the quote's rate in the org where the request names none
// The renders are tests/quote-pdf-pages.test.mjs (TAX); the database paths tests/integration/sales-tax-docs.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    quoteLineToJobItem, quoteDiscountJobItems, invoiceTaxRateOfQuote, invoiceTotals, linesFromJobItems,
} from '../src/utils/invoices.js';
import { quoteTotals } from '../src/utils/quoteTotals.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (s, sub) => s.split(sub).length - 1;

// A quote as stored: numerics as strings.
const line = (listPrice, extra = {}) => ({ productName: 'Thing', productType: 'one_time', unit: 'flat', listPrice, quantity: 1, discountPct: 0, ...extra });
const quoteOf = (lineItems, extra = {}) => ({ lineItems, dealDiscount: '0.00', taxRate: '8.25', taxExempt: false, ...extra });
const netOf = (li) => (Number(li.listPrice) || 0) * (1 - Math.min(Math.max(Number(li.discountPct) || 0, 0), 100) / 100);
// The job a quote becomes (quote-to-job.mjs), and the invoice invoices.mjs makes from it at the quote's rate.
const jobOf = (quote) => {
    const items = quote.lineItems.map((li, i) => quoteLineToJobItem(li, i));
    return [...items, ...quoteDiscountJobItems(items, quote, items.length)];
};
const invoiceOf = (quote) => invoiceTotals(linesFromJobItems(jobOf(quote)), invoiceTaxRateOfQuote(quote));

// ── JOB ──────────────────────────────────────────────────────────────────────

test('JOB: a job line keeps its quote line\'s Taxable — a line with no flag taxable, false or "false" not', () => {
    assert.equal(quoteLineToJobItem(line(100)).taxable, true, 'a line written before tax is taxable (Q2)');
    assert.equal(quoteLineToJobItem(line(100, { taxable: true })).taxable, true);
    assert.equal(quoteLineToJobItem(line(100, { taxable: false })).taxable, false, 'REGRESSION (§0.241): an untaxed quote line taxed on the job');
    assert.equal(quoteLineToJobItem(line(100, { taxable: 'false' })).taxable, false);
    assert.equal(quoteLineToJobItem({}).taxable, true);
});

test('JOB: the deal discount as discount lines — one on the taxable items, one on the rest, each only where it is not 0', () => {
    const items = (lines) => lines.map((li, i) => quoteLineToJobItem(li, i));
    const mixed = [line(600), line(400, { taxable: false })];
    assert.deepEqual(quoteDiscountJobItems(items(mixed), quoteOf(mixed, { dealDiscount: '10.00' }), 2), [
        { itemType: 'discount', description: 'Discount (10%)', partNumber: null, quantity: '1', unitPrice: '-60.00', totalPrice: '-60.00', taxable: true, sortOrder: 2 },
        { itemType: 'discount', description: 'Discount (10%), untaxed items', partNumber: null, quantity: '1', unitPrice: '-40.00', totalPrice: '-40.00', taxable: false, sortOrder: 3 },
    ]);
    const taxedOnly = [line(600), line(400)];
    assert.deepEqual(quoteDiscountJobItems(items(taxedOnly), quoteOf(taxedOnly, { dealDiscount: 12.5 }), 2).map((i) => [i.description, i.totalPrice, i.taxable]),
        [['Discount (12.5%)', '-125.00', true]], 'all taxable: one taxable line');
    const untaxedOnly = [line(600, { taxable: false })];
    assert.deepEqual(quoteDiscountJobItems(items(untaxedOnly), quoteOf(untaxedOnly, { dealDiscount: '5' }), 1).map((i) => [i.description, i.totalPrice, i.taxable]),
        [['Discount (5%)', '-30.00', false]], 'none taxable: one untaxed line');
    for (const dd of ['0.00', 0, null, undefined, 'abc']) {
        assert.deepEqual(quoteDiscountJobItems(items(mixed), quoteOf(mixed, { dealDiscount: dd }), 2), [], `no discount line for ${JSON.stringify(dd)}`);
    }
    // A deal discount below 0 (a surcharge, by the API only) is carried as the quote counts it — the job its total.
    const up = quoteOf(mixed, { dealDiscount: '-5' });
    assert.deepEqual(quoteDiscountJobItems(items(mixed), up, 2).map((i) => [i.totalPrice, i.taxable]), [['30.00', true], ['20.00', false]]);
    assert.equal(invoiceOf(up).subtotal, quoteTotals(up).totalValue);
    assert.deepEqual(quoteDiscountJobItems([], quoteOf([], { dealDiscount: '10' }), 0), [], 'no lines, no discount');
    // A half-cent of tax: 2 × 300 less 10% (540, taxed) + 400 not, 10% off, 8.25% — 486 taxed, 40.095, 40.10 on the
    // quote. Each part is its own 10%: the invoice's tax is the quote's without a cent moved.
    const split = [line(300, { quantity: 2, discountPct: 10 }), line(400, { taxable: false })];
    assert.deepEqual(quoteDiscountJobItems(items(split), quoteOf(split, { dealDiscount: '10.00' }), 2).map((i) => [i.totalPrice, i.taxable]),
        [['-54.00', true], ['-40.00', false]]);
    assert.equal(invoiceTotals([{ totalPrice: 540 }, { totalPrice: -54 }], 8.25).taxAmount, 40.1);
    // The invoice rounds its tax half up as the quote does, the float's noise taken off: 10.05 at 10% is 1.005, 1.01 —
    // Math.round of its float (100.49999…) said 1.00, a cent under the quote's.
    assert.equal(quoteTotals(quoteOf([line(10.05)], { taxRate: '10' })).taxAmount, 1.01);
    assert.equal(invoiceTotals([{ totalPrice: 10.05 }], 10).taxAmount, 1.01, 'REGRESSION (§0.241): an invoice\'s half cent of tax rounded down by the float');
    assert.deepEqual(invoiceOf(quoteOf([line(10.05)], { taxRate: '10' })), { subtotal: 10.05, taxRate: 10, taxAmount: 1.01, total: 11.06 }, 'the quote\'s, to the cent');
    assert.deepEqual(quoteDiscountJobItems(items(mixed), null, 2), [], 'no quote, no discount');
});

test('JOB: a new invoice\'s rate is the quote\'s — 0 when it is exempt, or holds none, or one that cannot be a rate', () => {
    assert.equal(invoiceTaxRateOfQuote({ taxRate: '8.25', taxExempt: false }), 8.25);
    assert.equal(invoiceTaxRateOfQuote({ taxRate: '8.25', taxExempt: null }), 8.25, 'an older quote\'s switch (none) is off');
    assert.equal(invoiceTaxRateOfQuote({ taxRate: '8.25', taxExempt: true }), 0, 'REGRESSION (Q4): an exempt quote\'s invoice taxed');
    assert.equal(invoiceTaxRateOfQuote({ taxRate: null }), 0, 'a quote written before tax: 0, as every invoice was');
    assert.equal(invoiceTaxRateOfQuote({ taxRate: '0.00' }), 0);
    for (const bad of ['150', '-1', 'abc', true, {}]) assert.equal(invoiceTaxRateOfQuote({ taxRate: bad }), 0, String(bad));
    assert.equal(invoiceTaxRateOfQuote(null), 0, 'a job from no quote');
    assert.equal(invoiceTaxRateOfQuote(undefined), 0);
});

// ── PARITY ───────────────────────────────────────────────────────────────────

test('PARITY: the design\'s quote — 600 taxed + 400 not, 10% off, 8.25% — is its invoice to the cent', () => {
    const quote = quoteOf([line(600), line(400, { taxable: false })], { dealDiscount: '10.00' });
    const q = quoteTotals(quote);
    const inv = invoiceOf(quote);
    assert.deepEqual([q.totalValue, q.taxAmount, q.grandTotal], [900, 44.55, 944.55]);
    assert.deepEqual([inv.subtotal, inv.taxRate, inv.taxAmount, inv.total], [900, 8.25, 44.55, 944.55], 'REGRESSION (§0.241): the invoice is not the quote');
    assert.deepEqual(invoiceOf({ ...quote, taxExempt: true }), { subtotal: 900, taxRate: 0, taxAmount: 0, total: 900 }, 'exempt: no tax on the invoice');
    assert.deepEqual(invoiceOf({ ...quote, taxRate: null }), { subtotal: 900, taxRate: 0, taxAmount: 0, total: 900 }, 'no rate: 0, its total the quote\'s');
});

test('PARITY: a thousand seeded quotes, whole-cent prices — the job adds up to the quote\'s total, and the invoice\'s tax is the quote\'s, every kind', () => {
    let seed = 41;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    let mixed = 0, allTaxed = 0;
    for (let k = 0; k < 1000; k++) {
        // A net price of whole cents: whole dollars, or a cents price with no line discount.
        const lineItems = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => {
            const cents = rnd() < 0.5;
            return line(Math.round(rnd() * 3000) + (cents ? Math.round(rnd() * 99) / 100 : 0), {
                quantity: 1 + Math.floor(rnd() * 4), discountPct: cents ? 0 : pick([0, 5, 10, 15, 20]), ...(rnd() < 0.3 ? { taxable: false } : {}),
            });
        });
        const quote = quoteOf(lineItems, { dealDiscount: String(pick([0, 5, 7, 10, 12.5, 15, 33])), taxRate: String(pick([8.25, 6.5, 7, 10, 5.13, 0])) });
        const q = quoteTotals(quote), inv = invoiceOf(quote);
        assert.equal(inv.subtotal, q.totalValue, `REGRESSION (§0.241): quote ${k}: the job's lines add to ${inv.subtotal}, the quote's total is ${q.totalValue}`);
        const some = lineItems.some((li) => li.taxable === false), all = lineItems.every((li) => li.taxable === false);
        if (some && !all) mixed++; else if (!all) allTaxed++;
        // Every kind exact (the review, 10 Nov): an all-taxable quote taxes its total as shown — the base the invoice's
        // lines add up to — never the unrounded base a cent away.
        assert.equal(inv.taxAmount, q.taxAmount, `REGRESSION (§0.241): quote ${k}: the invoice's tax ${inv.taxAmount}, the quote's ${q.taxAmount}`);
        assert.equal(inv.total, q.grandTotal, `REGRESSION (§0.241): quote ${k}: the invoice's total ${inv.total}, the quote's ${q.grandTotal}`);
    }
    assert.ok(mixed > 200 && allTaxed > 200, `the sample covers both kinds (${mixed} mixed, ${allTaxed} all taxed)`);
});

test('PARITY: ten thousand seeded quotes of every kind — fractional-cent nets, credits taxed and not, surcharges, discounts over 100% — the invoice is the quote to the cent', () => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    let credits = 0, fractional = 0;
    for (let k = 0; k < 10000; k++) {
        const lineItems = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => {
            const credit = rnd() < 0.2;
            const li = line((credit ? -1 : 1) * Math.round(rnd() * 300000) / 100, {
                quantity: pick([1, 2, 3, 10, 0, '', -2]), discountPct: pick([0, 5, 12.5, 15, 33, 7.5]), ...(rnd() < 0.35 ? { taxable: false } : {}),
            });
            if (credit) credits++;
            if (Math.abs(netOf(li) - Math.round(netOf(li) * 100) / 100) > 1e-9) fractional++;
            return li;
        });
        const quote = quoteOf(lineItems, { dealDiscount: String(pick([0, 5, 10, 12.5, 33, -5, 150])), taxRate: String(pick([8.25, 6.5, 7, 10, 5.13, 0])),
            taxExempt: rnd() < 0.1 });
        const q = quoteTotals(quote), inv = invoiceOf(quote);
        assert.equal(inv.subtotal, q.totalValue, `REGRESSION (§0.241): quote ${k}: the job adds to ${inv.subtotal}, the quote's total is ${q.totalValue}`);
        assert.equal(inv.taxAmount, q.taxAmount, `REGRESSION (§0.241): quote ${k}: the invoice's tax ${inv.taxAmount}, the quote's ${q.taxAmount}`);
        assert.equal(inv.total, q.grandTotal, `REGRESSION (§0.241): quote ${k}: the invoice's total ${inv.total}, the quote's ${q.grandTotal}`);
    }
    assert.ok(credits > 1000 && fractional > 1000, `covered: ${credits} credit lines, ${fractional} fractional-cent nets`);
});

test('PARITY: the review\'s cases — an all-taxable quote with a deal discount taxes its total as shown, and its invoice is the quote to the cent', () => {
    for (const [lineItems, dd, rate, tax] of [
        [[line(585.94)], 5, 7, 38.96],                      // the unrounded base 556.643 taxed 38.97; the total shown 556.64 taxes 38.96
        [[line(344.01, { quantity: 5 })], 10, 10, 154.81],   // 1548.045 taxed 154.80; the total shown 1548.05 taxes 154.81
    ]) {
        const quote = quoteOf(lineItems, { dealDiscount: String(dd), taxRate: String(rate) });
        const q = quoteTotals(quote), inv = invoiceOf(quote);
        assert.equal(q.taxableBase, q.totalValue, 'every line taxable: the base is the total as shown');
        assert.equal(q.taxAmount, tax, 'REGRESSION: the tax worked on the unrounded base');
        assert.equal(inv.taxAmount, q.taxAmount);
        assert.equal(inv.total, q.grandTotal);
    }
});

// ── WIRING ───────────────────────────────────────────────────────────────────

test('WIRING: the PDF reads the STORED quote by its id in the caller\'s org, its deal\'s access before anything is drawn; the screen sends the id', () => {
    const f = code(read('netlify/functions/quote-pdf.mjs'));
    assert.ok(f.includes("import { dealAccess } from './_dealAccess.mjs';"));
    assert.ok(f.includes('const { quoteId } = body;'), 'the body names the id');
    assert.ok(!/body\.(quote|opportunity|lines)\b/.test(f) && !/const \{[^}]*\b(quote|opportunity|lines)\b[^}]*\} = body/.test(f), 'REGRESSION (§0.241): the PDF prints a quote, a deal or lines the body carries');
    const read1 = f.indexOf('.where(and(eq(quotes.id, String(quoteId)), eq(quotes.orgId, orgId))).limit(1);');
    const access = f.indexOf("if (!(await dealAccess(auth, quote.opportunityId)).canRead) return json(404, { error: 'Quote not found' });");
    const opp = f.indexOf('.where(and(eq(opportunities.id, quote.opportunityId), eq(opportunities.orgId, orgId))).limit(1);');
    const draw = f.indexOf('const pdfBuffer = await buildPDF(quote, opportunity || null, null, await orgIdentityFor(auth.orgId));');
    assert.ok(read1 > 0 && access > read1 && opp > access && draw > opp, 'the quote in the org, then its deal\'s access, then its deal in the org, then the PDF');
    assert.ok(f.includes("if (!quote) return json(404, { error: 'Quote not found' });"), 'another org\'s quote is a 404');
    const tab = code(read('src/Tabs/QuotesTab.jsx'));
    // Since §0.246 (docs/design/refusal-sweep 7a) the request is quotePdfOf's to send — its answer read ok-first.
    assert.ok(tab.includes("quotePdfOf(() => dbFetch('/.netlify/functions/quote-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: activeQuote.id }) }));"),
        'the screen asks for the quote by its id');
    assert.ok(!tab.includes('JSON.stringify({ quote: activeQuote'), 'REGRESSION (§0.241): the screen sends its own copy of the quote to print');
});

test('WIRING: the PDF and the email read the one money copy and the one block of rows — no copy of their own', () => {
    const pdf = code(read('netlify/functions/_quotePdf.mjs'));
    assert.ok(pdf.includes("import { quoteTotals } from '../../src/utils/quoteTotals.js';") && pdf.includes("import { quoteMoneyRows } from '../../src/utils/quoteMoneyRows.js';"));
    assert.ok(pdf.includes('const totals = quoteTotals({ lineItems, dealDiscount: quote.dealDiscount, taxRate: quote.taxRate, taxExempt: quote.taxExempt });'), 'the stored rate and switch');
    assert.ok(pdf.includes('const totalsRows = quoteMoneyRows(totals, quote.dealDiscount).map((row) => ({'));
    assert.ok(!pdf.includes('subtotal += ') && !pdf.includes("'Deal Discount ("), 'REGRESSION (§0.241): the PDF\'s own untaxed copy of the money');
    assert.ok(pdf.includes('.text(row.label, totalsX, y, { width: 130, height: 10, ellipsis: true });')
        && pdf.includes(".text(row.value, totalsX + 130, y, { width: 90, align: 'right', height: row.bold ? 14 : 10, ellipsis: true });"), 'each totals text bounded to its line (§18b118 rule 3)');
    assert.ok(pdf.includes("{ label: 'Quote Total',        value: fmtMoney(grandTotal),"), 'the Quote Total figure with the tax');
    const mail = code(read('netlify/functions/quote-email.mjs'));
    assert.ok(mail.includes('const totals = quoteTotals({ lineItems: quote.lineItems, dealDiscount: quote.dealDiscount, taxRate: quote.taxRate, taxExempt: quote.taxExempt });'));
    assert.ok(mail.includes('const lineRows = totals.lines.map(li => `') && mail.includes('${esc(li.pricedQty)}')
        && mail.includes('${esc(fmtMoney(li.netPrice))}') && mail.includes('${esc(fmtMoney(li.lineTotal))}'), 'each row its quantity, net price and total');
    assert.ok(!/li\.qty|li\.unitPrice/.test(mail), 'REGRESSION (§0.241): the email reads fields no quote line has — every row Qty 1 at list');
    assert.ok(mail.includes('const moneyRows = quoteMoneyRows(totals, quote.dealDiscount).map(r => r.total') && mail.includes('      ${moneyRows}` : \'\'}'), 'the block of rows, under the table');
    assert.ok(mail.includes('${esc(r.label)}: ${esc(r.value)}'), 'escaped, as every value in the email is');
    assert.ok(!mail.includes('quote.totalValue ?? quote.subtotal'), 'REGRESSION (§0.241): the email\'s Total its pre-tax stored figure');
});

test('WIRING: quote-to-job carries the deal discount; a new invoice takes its quote\'s rate, read in the org, where the request names none', () => {
    const j = code(read('netlify/functions/quote-to-job.mjs'));
    assert.ok(j.includes('rows.push(...quoteDiscountJobItems(rows, quote, rows.length).map((item) => ({'), 'REGRESSION (§0.241): the deal discount never reaches the job');
    assert.ok(j.includes("id: 'djli_' + randomUUID(), orgId, jobId, ...item, createdAt: now, updatedAt: now,"), 'each discount line the job\'s, in this org');
    assert.ok(j.indexOf('rows.push(...quoteDiscountJobItems(') < j.indexOf('await db.insert(dispatchJobLineItems).values(rows);'), 'written with the lines');
    const inv = code(read('netlify/functions/invoices.mjs'));
    assert.ok(inv.includes('let taxRate = patch.taxRate;') && inv.includes('if (paymentTerms === undefined || taxRate === undefined) {'));
    assert.ok(inv.includes('? await db.select({ paymentTerms: quotes.paymentTerms, taxRate: quotes.taxRate, taxExempt: quotes.taxExempt }).from(quotes).where(and(eq(quotes.id, job.quoteId), eq(quotes.orgId, orgId))).limit(1)'),
        'the job\'s quote, in this org');
    assert.ok(inv.includes('if (taxRate === undefined) taxRate = invoiceTaxRateOfQuote(q);'), 'REGRESSION (§0.241): a new invoice\'s rate 0 whatever its quote');
    assert.ok(!inv.includes('patch.taxRate ?? 0'), 'the old default');
    assert.equal(count(inv, 'lineItems: lines, ...totalsFor(lines, taxRate),'), 1, 'the totals recomputed from the rate');
    const utils = code(read('src/utils/invoices.js'));
    assert.ok(utils.includes('        taxable:     lineTaxable(li),'), 'the line\'s own Taxable');
    assert.ok(!utils.includes('        taxable:     true,\n        sortOrder:   index,'), 'REGRESSION (§0.241): every job line taxable');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/quote-tax-docs.test.mjs'), 'SUITES runs this file');
});
