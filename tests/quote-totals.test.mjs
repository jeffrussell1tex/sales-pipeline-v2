// tests/quote-totals.test.mjs — a quote's money, one copy (state §0.241; docs/design/sales-tax R1-R5).
//
// src/utils/quoteTotals.js is what quotes.mjs stores on every save. Its pre-tax figures are the old calcTotals's,
// exactly (OLD below is that function as it stood at 3ec2427, copied here so the parity is proved against the code that
// stored every quote so far, not against itself). The tax sits beside them: taxable lines only, the deal discount
// spread pro rata, an exempt quote taxed nothing, the rate clamped 0-100, the tax to the cent, and a line with no
// taxable flag — every quote written before tax — taxable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteTotals, cleanTaxRate, defaultTaxRateOf, cleanTaxExempt, lineTaxable, roundCents } from '../src/utils/quoteTotals.js';

// quotes.mjs calcTotals at 3ec2427, verbatim.
function OLD(lineItems = [], dealDiscountPct = 0) {
    let subtotal = 0;
    let recurringValue = 0;
    let oneTimeValue = 0;
    for (const item of lineItems) {
        const qty = Number(item.quantity) || 1;
        const listPrice = Number(item.listPrice) || 0;
        const discountPct = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
        const netPrice = listPrice * (1 - discountPct / 100);
        const total = netPrice * qty;
        subtotal += total;
        if (item.productType === 'recurring') {
            recurringValue += item.unit === 'month' ? total * 12 : total;
        } else {
            oneTimeValue += total;
        }
    }
    const discountAmount = subtotal * (Number(dealDiscountPct) || 0) / 100;
    const totalValue = subtotal - discountAmount;
    return {
        subtotal: subtotal.toFixed(2),
        totalValue: totalValue.toFixed(2),
        recurringValue: recurringValue.toFixed(2),
        oneTimeValue: oneTimeValue.toFixed(2),
    };
}
const asStored = (t) => ({ subtotal: t.subtotal.toFixed(2), totalValue: t.totalValue.toFixed(2), recurringValue: t.recurringValue.toFixed(2), oneTimeValue: t.oneTimeValue.toFixed(2) });

const L = (o) => ({ productId: 'p1', productName: 'Thing', productType: 'one_time', unit: 'flat', listPrice: 100, quantity: 1, discountPct: 0, ...o });

const QUOTES = [
    { lines: [], dd: 0 },
    { lines: [L({})], dd: 0 },
    { lines: [L({ productType: 'recurring', unit: 'month', listPrice: 99.99, quantity: 3, discountPct: 12.5 }), L({ listPrice: '1500', quantity: '2', discountPct: '7' })], dd: '5.00' },
    { lines: [L({ quantity: 0 }), L({ quantity: '' }), L({ quantity: 'x' })], dd: 0 },                    // quantity 0, blank, junk read 1
    { lines: [L({ listPrice: '' }), L({ listPrice: null }), L({ listPrice: 'abc' })], dd: 10 },            // custom price not yet entered
    { lines: [L({ discountPct: 150 }), L({ discountPct: -20 })], dd: 0 },                                  // the line discount clamped
    { lines: [L({ productType: 'recurring', unit: 'year', listPrice: 1200 }), L({ productType: 'recurring', unit: 'month', listPrice: 33.333, quantity: 7 })], dd: 12.34 },
    { lines: [L({ listPrice: 0.105, quantity: 10 }), L({ listPrice: 1.005 }), L({ listPrice: 2.675, quantity: 3 })], dd: 33.33 }, // half-cent floats
    { lines: [L({ listPrice: -50 }), L({ listPrice: 80, taxable: false })], dd: 0 },                        // a credit line
    { lines: [L({})], dd: null }, { lines: [L({})], dd: 'abc' }, { lines: [L({})], dd: 120 },              // an odd deal discount, kept as stored
];

// A line as every stored quote's are (the census, 10 Nov: 46 lines in 36 quotes): its net price whole cents, its
// quantity not negative. For these the old calcTotals and the rule since "Round each line" agree to the cent.
const netOf = (li) => (Number(li.listPrice) || 0) * (1 - Math.min(Math.max(Number(li.discountPct) || 0, 0), 100) / 100);
const storedLike = (lines) => lines.every((li) => Math.abs(netOf(li) - roundCents(netOf(li))) < 1e-9 && !(Number(li.quantity) < 0));
// The rule since (Jeff, 10 Nov: "Round each line"): each line's net to the cent, times the quantity (not a positive
// number reads 1), to the cent; the subtotal their sum.
const lineRule = (li) => { const q = Number(li.quantity); return roundCents(roundCents(netOf(li)) * (Number.isFinite(q) && q > 0 ? q : 1)); };
const subtotalRule = (lines) => roundCents(lines.reduce((s, li) => s + lineRule(li), 0));

test('parity: with no tax, the stored figures are what quotes.mjs calcTotals stored wherever a line is as stored lines are; the rest each line to the cent', () => {
    let same = 0, rounded = 0;
    for (const [i, q] of QUOTES.entries()) {
        const t = quoteTotals({ lineItems: q.lines, dealDiscount: q.dd });
        if (storedLike(q.lines)) { same++; assert.deepEqual(asStored(t), OLD(q.lines, q.dd), `quote ${i}`); }
        else { rounded++; assert.equal(t.subtotal, subtotalRule(q.lines), `quote ${i}: each line to the cent`); }
        assert.equal(t.taxAmount, 0, `quote ${i}: no rate, no tax`);
        assert.equal(t.grandTotal, t.totalValue, `quote ${i}: the grand total is the total`);
        assert.equal(t.taxRate, null);
    }
    // A thousand made-up quotes, the same.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 1000; n++) {
        const plain = rnd() < 0.5;   // half the quotes with no line discount — every net whole cents, as stored quotes'
        const lines = Array.from({ length: Math.floor(rnd() * 6) }, () => L({
            productType: rnd() < 0.5 ? 'recurring' : 'one_time', unit: rnd() < 0.5 ? 'month' : 'year',
            listPrice: Math.round(rnd() * 1e6) / 100, quantity: Math.floor(rnd() * 20), discountPct: plain ? 0 : Math.round(rnd() * 4000) / 100,
            taxable: rnd() < 0.3 ? false : undefined,
        }));
        const dd = Math.round(rnd() * 3000) / 100;
        const t = quoteTotals({ lineItems: lines, dealDiscount: dd, taxRate: rnd() < 0.5 ? 8.25 : null });
        const u = quoteTotals({ lineItems: lines, dealDiscount: dd });
        assert.deepEqual(asStored(t), asStored(u), `random quote ${n}: a rate never changes the pre-tax figures`);
        if (storedLike(lines)) { same++; assert.deepEqual(asStored(t), OLD(lines, dd), `random quote ${n}`); }
        else { rounded++; assert.equal(t.subtotal, subtotalRule(lines), `random quote ${n}: each line to the cent`); }
    }
    assert.ok(same > 100 && rounded > 100, `both kinds covered (${same} as stored, ${rounded} rounded)`);
});

test('each line to the cent (Jeff, 10 Nov: "Round each line"): Qty x Unit Price is the row\'s total, the rows the subtotal — as the job prices it', () => {
    const t = quoteTotals({ lineItems: [L({ listPrice: 99.99, quantity: 10, discountPct: 15 })], taxRate: 8.25 });
    assert.equal(t.lines[0].netPrice, 84.99, 'REGRESSION: the net kept a fraction of a cent (84.9915)');
    assert.equal(t.lines[0].lineTotal, 849.9);
    assert.equal(t.subtotal, 849.9);
    assert.equal(t.taxAmount, 70.12);
    const two = quoteTotals({ lineItems: [L({ listPrice: 11.25, discountPct: 10 }), L({ listPrice: 11.25, discountPct: 10 })] });
    assert.equal(two.subtotal, roundCents(two.lines[0].lineTotal + two.lines[1].lineTotal), 'the rows add up to the subtotal');
    const third = quoteTotals({ lineItems: [L({ listPrice: 3.33, discountPct: 50, quantity: 3 })] });
    assert.equal(third.lines[0].lineTotal, roundCents(third.lines[0].netPrice * 3), 'Qty x Unit Price is the Total');
    // A quantity that is not a positive number reads 1, as the job and its invoice read it — and the line says so
    // (`pricedQty`, what the email's Qty column prints: a row's Qty x Unit Price is its Total, -2 included).
    for (const qty of [0, '', 'x', -2, '-1', null, Infinity]) {
        const t = quoteTotals({ lineItems: [L({ quantity: qty })] });
        assert.equal(t.subtotal, 100, `quantity ${JSON.stringify(qty)}`);
        assert.equal(t.lines[0].pricedQty, 1, `REGRESSION: the priced quantity of ${JSON.stringify(qty)} not 1`);
    }
    assert.equal(quoteTotals({ lineItems: [L({ quantity: '2.5' })] }).lines[0].pricedQty, 2.5);
});

test('the rows add up: the deal discount is the subtotal less the total as shown, never rounded on its own (the review, 10 Nov)', () => {
    // 10.10 at 15%: 1.515 rounds on its own to 1.51 (toFixed), while 10.10 - 8.58 is 1.52.
    for (const [lineItems, dd] of [[[{ listPrice: 10.10, quantity: 1 }], 15], [[{ listPrice: 10.12, quantity: 1 }], 12.5],
        [[{ listPrice: 10.15, quantity: 1 }], 10], [[{ listPrice: 11.25, discountPct: 10, quantity: 1 }], 10]]) {
        const t = quoteTotals({ lineItems, dealDiscount: dd });
        assert.equal(t.discountAmount, roundCents(t.subtotal - t.totalValue), `REGRESSION: Subtotal less Deal discount misses the Total (${JSON.stringify(lineItems)} at ${dd}%)`);
    }
    // And the seeded sample: every quote's three rows reconcile to the cent.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 2000; k++) {
        const lineItems = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ listPrice: Math.round(rnd() * 500000) / 100, quantity: 1 + Math.floor(rnd() * 5), discountPct: Math.floor(rnd() * 30) }));
        const t = quoteTotals({ lineItems, dealDiscount: Math.floor(rnd() * 40) / 2, taxRate: 8.25 });
        assert.equal(roundCents(t.subtotal - t.discountAmount), t.totalValue, `quote ${k}`);
        assert.equal(roundCents(t.totalValue + t.taxAmount), t.grandTotal, `quote ${k}: the grand total`);
    }
});

test('the lines: net price, line total and list, as the screens drew them; a product fills a line that names no price', () => {
    const t = quoteTotals({ lineItems: [L({ listPrice: 200, quantity: 3, discountPct: 10 })] });
    assert.equal(t.lines[0].netPrice, 180);
    assert.equal(t.lines[0].lineTotal, 540);
    assert.equal(t.lines[0].lineList, 600);
    assert.equal(t.lines[0].taxable, true);
    assert.equal(t.listTotal, 600);
    const withCatalog = quoteTotals({ lineItems: [{ productId: 'p9', quantity: 2 }], products: [{ id: 'p9', name: 'Nine', listPrice: '45.50', productType: 'recurring' }] });
    assert.equal(withCatalog.lines[0].lineTotal, 91);
    assert.equal(withCatalog.lines[0].productName, 'Nine');
    assert.equal(withCatalog.recurringValue, 91);
    assert.equal(quoteTotals({ lineItems: [{ productId: 'p9', quantity: 2 }] }).subtotal, 0, 'no catalog: a line with no price is 0, as the server stored it');
    assert.deepEqual(quoteTotals({ lineItems: [null, 'x', L({})] }).subtotal, 100, 'a line that is no object counts nothing');
});

test('tax: on the taxable lines only; a line with no taxable flag is taxable; false (or "false") is not', () => {
    const lines = [L({ listPrice: 1000 }), L({ listPrice: 500, taxable: false }), L({ listPrice: 200, taxable: 'false' }), L({ listPrice: 300, taxable: true })];
    const t = quoteTotals({ lineItems: lines, taxRate: 10 });
    assert.equal(t.totalValue, 2000, 'the total is pre-tax');
    assert.equal(t.taxableBase, 1300);
    assert.equal(t.taxAmount, 130);
    assert.equal(t.grandTotal, 2130);
    assert.deepEqual(t.lines.map((l) => l.taxable), [true, false, false, true]);
    assert.equal(lineTaxable({}), true, 'an older line, no flag: taxable');
    assert.equal(lineTaxable(undefined), true);
    assert.equal(lineTaxable({ taxable: null }), true, 'a null flag is no flag');
    assert.equal(lineTaxable({ taxable: false }), false);
    // An older quote — no flags anywhere — is taxed whole.
    const older = [{ productId: 'p1', listPrice: 100, quantity: 2, discountPct: 0 }];
    assert.equal(quoteTotals({ lineItems: older, taxRate: 8.25 }).taxAmount, 16.5);
});

test('tax: the deal discount is spread over every line alike — the taxable lines\' share of the total after it', () => {
    const lines = [L({ listPrice: 600 }), L({ listPrice: 400, taxable: false })];
    const t = quoteTotals({ lineItems: lines, dealDiscount: 10, taxRate: 5 });
    assert.equal(t.subtotal, 1000);
    assert.equal(t.discountAmount, 100);
    assert.equal(t.totalValue, 900);
    assert.equal(t.taxableBase, 540, '600 less its 10%');
    assert.equal(t.taxAmount, 27);
    assert.equal(t.grandTotal, 927);
    const all = quoteTotals({ lineItems: [L({ listPrice: 333.33, quantity: 3 })], dealDiscount: 12.5, taxRate: 7 });
    assert.equal(all.taxableBase, all.totalValue, 'every line taxable: the base is the total');
    // A taxable credit lowers the tax, below 0 too, as the job's invoice works it out (Jeff, 10 Nov: "Credit lowers tax").
    assert.equal(quoteTotals({ lineItems: [L({})], dealDiscount: 150, taxRate: 10 }).taxAmount, -5, 'a total below 0 taxed as the invoice would');
    assert.equal(quoteTotals({ lineItems: [L({ listPrice: -100 })], taxRate: 10 }).taxAmount, -10, 'a credit-only quote: its tax a credit too');
    const credit = quoteTotals({ lineItems: [L({ listPrice: 1000, taxable: false }), L({ listPrice: -200 })], taxRate: 8.25 });
    assert.equal(credit.taxableBase, -200);
    assert.equal(credit.taxAmount, -16.5, 'REGRESSION: a taxable credit floored to no tax (the invoice says -16.50)');
    assert.equal(credit.grandTotal, 783.5);
});

test('exempt: no tax whatever the rate; the pre-tax figures unchanged', () => {
    const lines = [L({ listPrice: 1234.56 })];
    const t = quoteTotals({ lineItems: lines, taxRate: 9.5, taxExempt: true });
    assert.equal(t.taxAmount, 0);
    assert.equal(t.taxExempt, true);
    assert.equal(t.grandTotal, 1234.56);
    assert.equal(quoteTotals({ lineItems: lines, taxRate: 9.5, taxExempt: 'true' }).taxAmount, 0);
    assert.equal(quoteTotals({ lineItems: lines, taxRate: 9.5, taxExempt: null }).taxAmount, 117.28, 'none is not exempt');
    assert.equal(quoteTotals({ lineItems: lines, taxRate: 9.5, taxExempt: false }).taxAmount, 117.28);
});

test('the rate: clamped 0-100 in the arithmetic; none, blank or junk is no tax; 0 is a rate of nothing', () => {
    const lines = [L({ listPrice: 100 })];
    assert.equal(quoteTotals({ lineItems: lines, taxRate: 150 }).taxAmount, 100, 'clamped to 100');
    assert.equal(quoteTotals({ lineItems: lines, taxRate: 150 }).taxRate, 100);
    assert.equal(quoteTotals({ lineItems: lines, taxRate: -5 }).taxAmount, 0, 'clamped to 0');
    assert.equal(quoteTotals({ lineItems: lines, taxRate: '8.25' }).taxAmount, 8.25, 'the database answers "8.25"');
    assert.equal(quoteTotals({ lineItems: lines, taxRate: 0 }).taxRate, 0);
    for (const none of [null, undefined, '', '  ', 'abc', true, [], {}]) {
        const t = quoteTotals({ lineItems: lines, taxRate: none });
        assert.equal(t.taxAmount, 0, JSON.stringify(none));
        assert.equal(t.taxRate, null, JSON.stringify(none));
    }
});

test('cents: the tax rounds half up to the cent, the float\'s noise off; the grand total adds to the cent', () => {
    assert.equal(quoteTotals({ lineItems: [L({ listPrice: 100 })], taxRate: 8.125 }).taxAmount, 8.13);
    assert.equal(quoteTotals({ lineItems: [L({ listPrice: 19.99, quantity: 3 })], taxRate: 8.25 }).taxAmount, 4.95);   // 4.947525
    assert.equal(quoteTotals({ lineItems: [L({ listPrice: 10.1 })], taxRate: 5 }).taxAmount, 0.51);                     // 0.505
    assert.equal(quoteTotals({ lineItems: [L({ listPrice: 1.15 })], taxRate: 10 }).taxAmount, 0.12);                    // 0.115
    const t = quoteTotals({ lineItems: [L({ listPrice: 0.1, quantity: 3 })], taxRate: 7.75 });
    assert.equal(t.grandTotal, 0.32, '0.30 + 0.0233 → 0.30 + 0.02');
    assert.equal(roundCents(1.005), 1.01);
    assert.equal(roundCents(2.675), 2.68);
    assert.equal(roundCents('x'), 0);
});

test('a rate a request names: a number 0-100 kept to two places, else none; the default reader clamps; exempt is true only for true', () => {
    assert.equal(cleanTaxRate(8.25), 8.25);
    assert.equal(cleanTaxRate('8.25'), 8.25);
    assert.equal(cleanTaxRate(' 7 '), 7);
    assert.equal(cleanTaxRate(8.255), 8.26);
    assert.equal(cleanTaxRate(0), 0);
    assert.equal(cleanTaxRate(100), 100);
    for (const bad of [-0.01, 100.01, 150, null, undefined, '', ' ', 'abc', true, false, [], [5], {}, NaN, Infinity]) {
        assert.equal(cleanTaxRate(bad), null, String(bad));
    }
    assert.equal(defaultTaxRateOf({ taxRate: 8.25 }), 8.25);
    assert.equal(defaultTaxRateOf({ taxRate: '6.125' }), 6.13);
    assert.equal(defaultTaxRateOf({ taxRate: 150 }), 100, 'the stored blob is unvalidated: clamped');
    assert.equal(defaultTaxRateOf({ taxRate: -3 }), 0);
    for (const none of [undefined, null, {}, { taxRate: '' }, { taxRate: 'abc' }, { taxRate: true }, { taxRate: [7] }, 'x', 7]) {
        assert.equal(defaultTaxRateOf(none), null, JSON.stringify(none));
    }
    assert.equal(cleanTaxExempt(true), true);
    assert.equal(cleanTaxExempt('true'), true);
    assert.equal(cleanTaxExempt(false), false);
    assert.equal(cleanTaxExempt('yes'), false);
    assert.equal(cleanTaxExempt(1), false);
    assert.equal(cleanTaxExempt(null), null, 'none stays none — an older quote\'s stored value');
    assert.equal(cleanTaxExempt(undefined), null);
});
