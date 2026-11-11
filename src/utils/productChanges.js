// productChanges.js — what the Price Book sends (state §0.242, guide §18b125 rule 1 — Jeff, 10 Nov: "Parts 1-4
// now"). Pure, so the rules run under node --test, in the memberSave.js pattern.
// The products PUT writes only the keys a body names, so a save sends the fields of the form that differ from the
// product as stored and nothing else: a key the form does not show (the SKU, the minimum price, the order) is never
// sent, and a blank Category or Description never writes '' over a stored none. A new product is the whole form.
// "Custom / Variable Price" is a real column since §0.242 (Q2): a custom product's list price is none here — the
// server stores 0 — and a product switched back from custom always names its list price, which the server needs
// (a switch off that names none keeps the stored 0).
import { lineTaxable } from './quoteTotals.js';

// The Price Book form's fields, as CatalogTab (QuotesTab.jsx) draws them.
export const FORM_FIELDS = Object.freeze(['name', 'category', 'productType', 'listPrice', 'unit', 'description', 'active', 'customPrice', 'taxable']);

// '', whitespace, null and absent are one value: none.
const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
const sameText = (a, b) => (blank(a) && blank(b)) || a === b;
const textOf = (v) => (blank(v) ? null : v);
// A price as the form holds it (typed text) and as stored (the column's text): the same by number — the stored
// "1200.00" and a typed "1200" are one price.
const samePrice = (a, b) => (blank(a) && blank(b)) || (!blank(a) && !blank(b) && Number(a) === Number(b));

// The form an edit opens with, from the product as stored. `defaults` are the form's first type and unit, shown for a
// product that holds none — shown, not changed: a save sends them only when picked anew.
export function productForm(p, { typeId = 'recurring', unit = 'flat' } = {}) {
    const custom = p?.customPrice === true;
    return {
        name: p?.name || '',
        category: p?.category || '',
        productType: p?.productType || p?.type || typeId,
        // A custom product's stored 0 is no price: the box opens empty, and is typed when the switch goes off.
        listPrice: custom ? '' : (p?.listPrice || p?.price || ''),
        unit: p?.unit || unit,
        description: p?.description || '',
        active: p?.active !== false,
        customPrice: custom,
        // Taxable (state §0.241): the stored one; none reads taxable.
        taxable: lineTaxable(p),
    };
}

// The body of a save, less its id. `stored` is the product as stored (null for a new one); `form` the form as typed;
// `defaults` as productForm takes them. An edit that changed nothing is {} — the screen sends nothing.
export function productChanges(stored, form, defaults) {
    const f = form || {};
    const custom = f.customPrice === true;
    const price = custom ? null : Number(f.listPrice);
    if (!stored) {
        return {
            name: f.name,
            category: textOf(f.category),
            productType: f.productType,
            listPrice: price,
            unit: f.unit,
            description: textOf(f.description),
            active: f.active !== false,
            customPrice: custom,
            taxable: f.taxable !== false,
        };
    }
    const first = productForm(stored, defaults);
    const out = {};
    if (!sameText(first.name, f.name)) out.name = f.name;
    for (const k of ['category', 'description']) if (!sameText(first[k], f[k])) out[k] = textOf(f[k]);
    for (const k of ['productType', 'unit']) if (!sameText(first[k], f[k])) out[k] = f[k];
    for (const k of ['active', 'taxable']) if ((first[k] !== false) !== (f[k] !== false)) out[k] = f[k] !== false;
    // The switch and the price travel together: switched on, the price is none (stored 0); switched off, the price
    // typed. Unswitched, a price changed is sent; a custom product's is never.
    if (first.customPrice !== custom) { out.customPrice = custom; out.listPrice = price; }
    else if (!custom && !samePrice(first.listPrice, f.listPrice)) out.listPrice = price;
    return out;
}
