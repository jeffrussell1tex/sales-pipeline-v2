// src/utils/quoteTotals.js — a quote's money, ONE copy (state §0.241; docs/design/sales-tax R1, Jeff's answers 10 Nov).
//
// The server's calcTotals (quotes.mjs — what is stored, on every save), the screens, the PDF, the email, the job's
// discount lines and the QA seed read it, so a quote's numbers are worked out one way; the job's line price
// (invoices.js quoteLineToJobItem) is held to it by PARITY (tests/quote-tax-docs.test.mjs). Pure — no React, no DOM, no database.
//
// The rules, as quotes.mjs has always stored them (the pre-tax figures below are its old calcTotals's for every line
// whose net price is whole cents and whose quantity is positive — every stored quote, 10 Nov), and as the job and its
// invoice price a line (Jeff, 10 Nov: "Round each line"):
//   - a line's quantity reads 1 when it is not a positive number (0, blank, negative, not a number); its discount is
//     clamped 0-100;
//   - its net price is the list price less its discount, to the cent; its total the net price times the quantity, to
//     the cent;
//   - the subtotal is the lines' totals; the deal discount a percent of the subtotal; totalValue the subtotal less it —
//     PRE-TAX, always: accepting a quote writes totalValue to the deal's revenue (syncToOpportunity), so tax never
//     enters it;
//   - recurringValue annualises a recurring line billed by the month (x 12); oneTimeValue the rest;
//   - each figure is rounded to the cent at the end, as toFixed(2) did.
// And the tax (R2, R4, R5):
//   - a line is taxable unless it says it is not (taxable: false) — a line with no flag, every quote written before
//     tax, reads taxable (Q2);
//   - the taxable base is the taxable lines' share of the total after the deal discount, pro rata — the deal
//     discount spread over every line alike — to the cent (every line taxable: the total itself); a taxable credit
//     lowers it, below 0 too, as an invoice's does (Jeff, 10 Nov: "Credit lowers tax");
//   - the rate is a percent (8.25 means 8.25%), clamped 0-100; none (null) is no tax;
//   - an exempt quote is taxed nothing, whatever its rate;
//   - the tax is worked out to the cent; grandTotal is totalValue plus the tax.

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
// Rounded to the cent, half up, the float's noise taken off first (8.125% of 100 is 8.13, never 8.12).
export const roundCents = (n) => Math.round(Number((num(n) * 100).toPrecision(12))) / 100;
// As toFixed(2) rounds — the pre-tax figures keep the rounding quotes.mjs has always stored.
const fixed2 = (n) => Number(num(n).toFixed(2));

// A value that can be a rate: a number, or a string of one. Anything else (a boolean, a list, an object) is none —
// Number(true) and Number([]) read as numbers and must not.
const rateLike = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));

// A rate a request NAMES (a quote's POST or PUT): a number 0-100, kept to two places; anything else — blank, out of
// range, not a number — is none (null), never a guess.
export function cleanTaxRate(v) {
    if (!rateLike(v)) return null;
    const n = Number(v);
    return n >= 0 && n <= 100 ? roundCents(n) : null;
}

// A percent a request names (state §0.242, guide §18b125 rule 3): none (null or blank) or a number 0-100 — anything
// else is refused, naming the field, and nothing is written. The value the row already holds, named again (by meaning:
// the stored "12.50" and a screen's 12.5), is never asked again (§0.204), whatever it is. `stored` is that value, or
// none for a create.
// The same value by meaning when both are numbers; else the same text — a held value that is not a number (one stored
// before §0.242, "8,25") re-sent as it stands is still the row's own (the review).
export const samePercent = (v, stored) => (rateLike(v) && rateLike(stored) && Number(v) === Number(stored))
    || (stored != null && stored !== '' && typeof v !== 'object' && typeof stored !== 'object' && String(v).trim() === String(stored).trim());
export const percentRefused = (v, stored) => v != null && v !== '' && cleanTaxRate(v) == null && !samePercent(v, stored);

// A quote's deal discount as a request names it (state §0.242): a number 0-100, kept to two places; none (null or
// blank, or a body that leaves it out) is 0; anything else is refused (null) — quotes.mjs answers 400 naming the field.
export function cleanDealDiscount(v) {
    if (v == null || v === '') return 0;
    return cleanTaxRate(v);
}

// A quote's lines whose discount a request names out of range (state §0.242): a line's discountPct is none (null or
// blank) or a number 0-100. A line the stored lines hold — the same product at the same discount — is never asked
// again. The refusal names the line, counted from 1 ("Line 2: …"); null when every line stands.
export function lineDiscountRefusal(lineItems, storedLines = []) {
    const lines = Array.isArray(lineItems) ? lineItems : [];
    const held = Array.isArray(storedLines) ? storedLines : [];
    const at = lines.findIndex((li) => li && typeof li === 'object' && percentRefused(li.discountPct, null)
        && !held.some((s) => s && typeof s === 'object' && s.productId === li.productId && samePercent(li.discountPct, s.discountPct)));
    return at < 0 ? null : `Line ${at + 1}: discount must be a number from 0 to 100.`;
}

// The org's default rate (R3), read through this one reader: Settings → Quotes keeps it in the quoteDefaults blob,
// which the settings PUT stores as sent — so it is clamped here, 0-100 and two places, and anything that is not a
// number is none (null). `quoteDefaults` is the blob (settings.extra.quoteDefaults, or the settings GET's).
export function defaultTaxRateOf(quoteDefaults) {
    const v = quoteDefaults && typeof quoteDefaults === 'object' ? quoteDefaults.taxRate : undefined;
    return rateLike(v) ? roundCents(clamp(Number(v), 0, 100)) : null;
}

// A quote's "Tax exempt" switch as a request names it: true only for true; none stays none (null) — the stored
// value of every quote written before tax; anything else is false.
export function cleanTaxExempt(v) {
    if (v == null) return null;
    return v === true || v === 'true';
}

// Is this line taxed? Yes unless it says no — an older line, with no flag, is taxable (Q2).
export const lineTaxable = (li) => !(li?.taxable === false || li?.taxable === 'false');

// The rate a quote is taxed at, for the arithmetic: clamped 0-100; none is null.
const rateOf = (taxRate) => (rateLike(taxRate) ? clamp(Number(taxRate), 0, 100) : null);

/**
 * quoteTotals({ lineItems, dealDiscount, taxRate, taxExempt, products }) — numbers, not strings:
 *   lines           each line with netPrice, lineTotal, lineList and taxable (true/false) added
 *   subtotal        the lines' totals
 *   discountAmount  the deal discount, in money
 *   totalValue      pre-tax: subtotal less the deal discount (what the deal's revenue takes)
 *   taxableBase     the taxable lines' share of totalValue
 *   taxRate         the rate applied (null for none); taxExempt true when the quote is exempt
 *   taxAmount       to the cent; 0 when exempt or no rate
 *   grandTotal      totalValue + taxAmount
 *   recurringValue  recurring lines, annualised; oneTimeValue the rest
 * `products` (optional) fills a line's list price, name and type where the line has none, as the screens did.
 */
export function quoteTotals({ lineItems = [], dealDiscount = 0, taxRate = null, taxExempt = false, products = [] } = {}) {
    const catalog = Array.isArray(products) ? products : [];
    let subtotal = 0, taxableNet = 0, untaxedNet = 0, recurring = 0, oneTime = 0, listTotal = 0;
    const lines = (Array.isArray(lineItems) ? lineItems : []).filter((li) => li && typeof li === 'object').map((item) => {
        const p = (item.productId != null && catalog.find((x) => x && x.id === item.productId)) || {};
        // As the job and its invoice read a line (invoices.js quoteLineToJobItem, cleanInvoiceLines): a quantity that
        // is not a positive number is 1; the net price to the cent, then times the quantity, to the cent (Jeff, 10 Nov:
        // "Round each line") — so a row's Qty x Unit Price is its Total, the rows are the Subtotal, and the job is the
        // quote to the cent.
        const q = Number(item.quantity);
        const qty = Number.isFinite(q) && q > 0 ? q : 1;
        const list = Number(item.listPrice ?? p.listPrice ?? p.price) || 0;
        const disc = clamp(Number(item.discountPct) || 0, 0, 100);
        const netPrice = roundCents(list * (1 - disc / 100));
        const lineTotal = roundCents(netPrice * qty);
        const lineList = list * qty;
        const taxable = lineTaxable(item);
        subtotal += lineTotal;
        listTotal += lineList;
        if (taxable) taxableNet += lineTotal; else untaxedNet += lineTotal;
        const type = String(item.productType || p.type || p.productType || '').replace('_', '-');
        if (type === 'recurring') recurring += item.unit === 'month' ? lineTotal * 12 : lineTotal;
        else oneTime += lineTotal;
        return { ...item, pricedQty: qty, netPrice, lineTotal, lineList, taxable, productName: item.productName || p.name || '' };
    });
    const dd = Number(dealDiscount) || 0;
    const totalValue = subtotal - subtotal * dd / 100;
    const total = fixed2(totalValue);
    const sub = fixed2(subtotal);
    // The deal discount the documents print is the subtotal less the total, as shown — never rounded on its own, or
    // Subtotal less Deal discount can miss the Total by a cent (the review, 10 Nov).
    const discountAmount = roundCents(sub - total);
    // The tax is worked out on a base to the cent: every line taxable, the total as shown (so the Tax row is the rate
    // of the rows above it, and the job's invoice — whose lines add up to that total — works out the same tax); a
    // mix, the taxable lines' share after the deal discount, rounded; none taxable, nothing. A taxable credit (a
    // negative line) lowers it, below 0 too, as the invoice's tax does (Jeff, 10 Nov: "Credit lowers tax").
    const taxableBase = untaxedNet === 0 ? total
        : taxableNet === 0 ? 0
        : roundCents(taxableNet - taxableNet * dd / 100);
    const exempt = taxExempt === true || taxExempt === 'true';
    const rate = rateOf(taxRate);
    const taxAmount = exempt || rate == null ? 0 : roundCents(taxableBase * rate / 100);
    return {
        lines,
        listTotal: fixed2(listTotal),
        subtotal: sub,
        discountAmount,
        totalValue: total,
        taxableBase,
        taxRate: rate,
        taxExempt: exempt,
        taxAmount,
        grandTotal: fixed2(total + taxAmount),
        recurringValue: fixed2(recurring),
        oneTimeValue: fixed2(oneTime),
    };
}
