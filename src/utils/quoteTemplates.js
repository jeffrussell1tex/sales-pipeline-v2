// quoteTemplates.js — which of an org's saved quote templates can START a quote,
// and the line items one seeds (state §0.142; Jeff: "It looks to me like all
// the templates are fake place holders … remove the fake ones and just add a
// place holder … and have that go away if actual templates are available").
// Pure: no React, no db.
//
// WHAT IT WAS. The Start-quote picker drew four hard-coded cards ("SMB
// Starter", "Growth Package", "Enterprise", "Trial → Paid") with INVENTED win
// rates and product lists sliced from whatever the catalog held — and the
// parent ignored the pick: every card created the same blank quote. The org's
// real template library (Settings → Quoting → Quote templates,
// settings.quoteTemplates) holds a name and a description per template and no
// line items, so nothing in it can seed a quote either.
//
// NOW. A template is USABLE by the picker only when it carries `productIds`
// that resolve in the org's catalog — the one thing a template can hand a new
// quote. Until the library stores line items no template qualifies, the picker
// shows one honest placeholder, and the moment an Admin saves a template with
// products it appears here and its pick seeds the quote (templateLineItems —
// the configurator's own line-item shape).

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * The saved templates that can start a quote: an id, a name, and at least one
 * productId that resolves in the catalog. Unknown product ids are dropped per
 * template; a template left with none is not offered. Never the panel's
 * illustrative defaults (they carry no products) — nothing here is invented.
 * → [{ id, name, desc, productIds, products: [{ id, name }] }]
 */
export function usableQuoteTemplates(templates, products) {
    const byId = new Map(arr(products).filter(p => p && p.id).map(p => [p.id, p]));
    const out = [];
    for (const t of arr(templates)) {
        if (!t || typeof t !== 'object') continue;
        const id = str(t.id), name = str(t.name);
        if (!id || !name) continue;
        const ids = [...new Set(arr(t.productIds).map(str).filter(Boolean))].filter(pid => byId.has(pid));
        if (!ids.length) continue;
        out.push({ id, name, desc: str(t.desc), productIds: ids, products: ids.map(pid => ({ id: pid, name: str(byId.get(pid).name) || pid })) });
    }
    return out;
}

/**
 * The line items a template seeds into a new quote — the same shape the
 * configurator's "add product" builds, one per resolved product, quantity 1,
 * no discount. A catalog product's price is its listPrice (else price), or a
 * custom price the rep fills in.
 */
export function templateLineItems(template, products, now = Date.now()) {
    const byId = new Map(arr(products).filter(p => p && p.id).map(p => [p.id, p]));
    return arr(template?.productIds).map(str).filter(pid => byId.has(pid)).map((pid, i) => {
        const prod = byId.get(pid);
        const normType = String(prod.productType || prod.type || '').replace('_', '-');
        return {
            _key:        now + i,
            productId:   prod.id,
            productName: prod.name,
            productType: normType,
            unit:        prod.unit || 'flat',
            listPrice:   prod.customPrice ? '' : (Number(prod.listPrice || prod.price) || 0),
            quantity:    1,
            discountPct: 0,
            customPrice: prod.customPrice === true,
        };
    });
}

/** The words on the picker when the org has no template that can start a quote. */
export const NO_TEMPLATES_NOTE = 'No quote templates yet. When an Admin builds templates with line items under Settings → Quoting → Quote templates, they appear here and a pick starts the quote with them. For now, start from scratch below.';
