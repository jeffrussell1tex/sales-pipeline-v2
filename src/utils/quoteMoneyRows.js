// src/utils/quoteMoneyRows.js — a quote's money as its screens say it (state §0.241; docs/design/sales-tax R6, Jeff's
// answers 10 Nov). Pure — no React, no DOM, no database; the numbers are quoteTotals.js's, the one copy (R1).
//
// The totals block every quote screen draws — the builder, the customer preview, the compare columns, the print
// copy — reads these rows: Subtotal; Deal discount (where the quote has one); Tax (rate%), or "Tax exempt"; Total.
// Money to the cent in that block, so the rows add up (the rest of the tab keeps whole dollars). A quote with no rate
// and not exempt — every quote written before tax — shows no tax row, and its Total is its total as before.
//
// Also here: the tax rate as a member types it (Settings → Quotes' default, a quote's own rate), one rule for both;
// a new line's Taxable from its product (Q2: none reads taxable); and the short words a card says of a quote's tax.

import { cleanTaxRate, roundCents, lineTaxable } from './quoteTotals.js';
import { fmtMoney } from './invoices.js';

// A percent in words: 8.25 → "8.25", 10.00 → "10".
const pctWords = (v) => String(roundCents(Number(v) || 0));

/**
 * The money block's rows, in order: [{ key, label, value, total? }].
 *   subtotal  "Subtotal"                         the lines' totals
 *   deal      "Deal discount (5%)"               only where the quote's deal discount is not 0
 *   tax       "Tax (8.25%)" | "Tax exempt"       only where the quote has a rate, or is exempt
 *   total     "Total"                            with the tax (grandTotal) — the pre-tax total where there is none
 * `totals` is quoteTotals' answer; `dealDiscount` the quote's (a percent, "10.00" or 10).
 */
export function quoteMoneyRows(totals, dealDiscount) {
    const t = totals || {};
    const rows = [{ key: 'subtotal', label: 'Subtotal', value: fmtMoney(t.subtotal) }];
    const dd = Number(dealDiscount) || 0;
    if (dd !== 0) rows.push({ key: 'deal', label: `Deal discount (${pctWords(dd)}%)`, value: fmtMoney(-(Number(t.discountAmount) || 0)) });
    if (t.taxExempt === true) rows.push({ key: 'tax', label: 'Tax exempt', value: fmtMoney(0) });
    else if (t.taxRate != null) rows.push({ key: 'tax', label: `Tax (${pctWords(t.taxRate)}%)`, value: fmtMoney(t.taxAmount) });
    rows.push({ key: 'total', label: 'Total', value: fmtMoney(t.grandTotal), total: true });
    return rows;
}

/**
 * What a card says of a quote's tax beside its pre-tax value (the Approvals cards, Quotes in flight): null where the
 * quote has no rate and is not exempt; "Tax exempt"; else "+ $70.99 tax (8.25%)".
 */
export function quoteTaxNote(totals) {
    const t = totals || {};
    if (t.taxExempt === true) return 'Tax exempt';
    if (t.taxRate == null) return null;
    return `+ ${fmtMoney(t.taxAmount)} tax (${pctWords(t.taxRate)}%)`;
}

// The words of a refused rate — the quote builder and Settings → Quotes say the same.
export const TAX_RATE_REFUSAL = 'The tax rate must be a number from 0 to 100 (up to two decimal places), or blank for no tax.';

/**
 * A tax rate as a member typed it: blank is none ({ rate: null }); a number from 0 to 100 is kept to two places
 * ({ rate: 8.25 }); anything else is refused ({ error }) — never stored as no tax without a word (the server refuses
 * a rate it cannot read, a 400 naming taxRate; the screens refuse it first, in words).
 */
export function taxRateFromInput(text) {
    const s = String(text ?? '').trim();
    if (s === '') return { rate: null };
    // Two decimal places at most, as the words say: a third (8.875) is refused, never rounded without a word — the
    // quote stores two (numeric(5,2)).
    if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(s)) return { error: TAX_RATE_REFUSAL };
    const rate = cleanTaxRate(s);
    return rate == null ? { error: TAX_RATE_REFUSAL } : { rate };
}

// A stored rate in the input's words: none is blank; "8.25" → "8.25"; "8.00" → "8".
export const taxRateInputOf = (rate) => (rate == null || rate === '' || !Number.isFinite(Number(rate)) ? '' : pctWords(rate));

// A new line's Taxable, from its product (Q2): taxable unless the product says it is not — a product saved before tax
// (none) is taxable. The flag a line then carries is the line's own, switched on the quote.
export const productTaxable = (product) => lineTaxable(product);
