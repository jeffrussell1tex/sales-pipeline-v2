import { db } from '../../db/index.js';
import { products } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const ALLOWED_FIELDS = [
    'id', 'name', 'sku', 'description', 'productType', 'listPrice',
    'minPrice', 'unit', 'category', 'active', 'sortOrder',
    // The Taxable switch (state §0.241): true or false, or none (null — taxable); cleaned by taxableOf below.
    'taxable',
    // "Custom / Variable Price" (state §0.242 — Jeff, 10 Nov: "Add the column"): true, false or none; a custom-price
    // product stores a list price of 0, and the rep enters the price on each quote.
    'customPrice',
    // createdBy is NOT here (guide §18b125 rule 2): who made a product is the server's, stamped by the POST.
];

function sanitize(data) {
    return Object.fromEntries(
        Object.entries(data).filter(([k]) => ALLOWED_FIELDS.includes(k))
    );
}

// A product's Taxable switch as a body names it: true, false, or none (null, which reads taxable); anything else is
// refused (undefined here), never guessed. A body that leaves the key out names nothing — the PUT keeps the stored one.
const TAXABLE_REFUSAL = 'taxable must be true or false';
const taxableOf = (v) => (v === true || v === false ? v : v == null ? null : undefined);

// A price a body names: a number, or a string of one, stored as the column's text; anything else is none here
// (undefined) — Number(true) and Number([]) read as numbers and must not.
const priceText = (v) => ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? String(Number(v)) : undefined);
const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
// Is the product custom-priced as this write leaves it? The body's switch when it names one, else the stored one.
const customAfter = (data, storedCustom) => ('customPrice' in data ? data.customPrice === true : storedCustom === true);

// What a body names that a product cannot hold (state §0.242), as the answer's body ({ error, field }), else null.
// Each is asked only when the body names it: a name not blank; the custom-price switch true, false or none; a list
// price a number — none (null or blank) only for a custom-price product, which stores 0 (Q2); a minimum price a
// number or none.
function productRefused(data, storedCustom = false) {
    if ('name' in data && blank(data.name)) return { error: 'name is required', field: 'name' };
    if ('customPrice' in data && taxableOf(data.customPrice) === undefined) return { error: 'customPrice must be true or false', field: 'customPrice' };
    if ('listPrice' in data && priceText(data.listPrice) === undefined && !(blank(data.listPrice) && customAfter(data, storedCustom))) {
        return { error: blank(data.listPrice) ? 'listPrice is required' : 'listPrice must be a number', field: 'listPrice' };
    }
    if ('minPrice' in data && !blank(data.minPrice) && priceText(data.minPrice) === undefined) return { error: 'minPrice must be a number', field: 'minPrice' };
    return null;
}

// The prices a body names, as stored (state §0.242): a custom-price product's list price is 0 whenever the write
// names its price or its switch; a minimum price is written only when named — blank or none is none. A key the body
// leaves out is not here, so the update keeps the stored value (every Price Book edit wiped the minimum price).
function pricesOf(data, storedCustom = false) {
    const out = {};
    if (customAfter(data, storedCustom) && ('listPrice' in data || 'customPrice' in data)) out.listPrice = '0';
    else if ('listPrice' in data) out.listPrice = priceText(data.listPrice);
    if ('minPrice' in data) out.minPrice = blank(data.minPrice) ? null : priceText(data.minPrice);
    return out;
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };

    const { orgId, userRole } = auth;
    const isAdmin = userRole === 'Admin';

    try {
        // ── GET — list all active products for this org ───────────────────────
        if (event.httpMethod === 'GET') {
            const includeInactive = event.queryStringParameters?.includeInactive === 'true';
            let rows;
            if (includeInactive && isAdmin) {
                rows = await db.select().from(products)
                    .where(eq(products.orgId, orgId))
                    .orderBy(asc(products.sortOrder), asc(products.name));
            } else {
                rows = await db.select().from(products)
                    .where(and(eq(products.orgId, orgId), eq(products.active, true)))
                    .orderBy(asc(products.sortOrder), asc(products.name));
            }
            return { statusCode: 200, headers, body: JSON.stringify({ products: rows }) };
        }

        // ── POST — create new product (admin only) ────────────────────────────
        if (event.httpMethod === 'POST') {
            if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            if (blank(data.name)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required', field: 'name' }) };
            if (data.listPrice == null && data.customPrice !== true) return { statusCode: 400, headers, body: JSON.stringify({ error: 'listPrice is required', field: 'listPrice' }) };
            if (taxableOf(data.taxable) === undefined) return { statusCode: 400, headers, body: JSON.stringify({ error: TAXABLE_REFUSAL, field: 'taxable' }) };
            const refused = productRefused(data);
            if (refused) return { statusCode: 400, headers, body: JSON.stringify(refused) };

            const payload = {
                ...sanitize(data),
                orgId,
                ...pricesOf(data),
                taxable: taxableOf(data.taxable),
                // Who made it (guide §18b125 rule 2): the server's, never the body's — the caller's name from the roster,
                // as products.created_by has always held a name (and quotes.mjs stamps a quote's).
                createdBy: (await getCallerName(auth.userId, orgId)) || null,
            };
            // A taken id — this org's or another's — writes nothing and is answered 409 (state §0.242, as accounts
            // §0.199): it was a primary-key 500.
            const [inserted] = await db.insert(products).values(payload).onConflictDoNothing({ target: products.id }).returning();
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That id is already in use.' }) };
            await auditAs(orgId, auth.userId, { action: 'product.created', entityType: 'product', entityId: inserted.id, entityName: inserted.name, detail: `${inserted.category || 'uncategorised'} · list $${Number(inserted.listPrice || 0).toLocaleString()}` });
            return { statusCode: 201, headers, body: JSON.stringify({ product: inserted }) };
        }

        // ── PUT — change a product this org holds (admin only) ────────────────
        if (event.httpMethod === 'PUT') {
            if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            // The product as stored, in this org (state §0.242 — Jeff, 10 Nov: "404, write nothing"). A PUT changes a
            // product and never makes one — a create is the POST, past its checks: an id this org does not hold (none,
            // or another org's) is a 404 and nothing is written. It was an upsert: a body naming no name or list price
            // was a 500 on the insert's NOT NULL, and an unknown id made a product the audit called "updated".
            const [stored] = await db.select().from(products)
                .where(and(eq(products.id, String(data.id)), eq(products.orgId, orgId))).limit(1);
            if (!stored) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Product not found in your organization' }) };
            // The Taxable switch: kept as stored when the body leaves it out (the update names only the keys sent —
            // sanitize drops the absent one); a value it names is true, false or none.
            if ('taxable' in data && taxableOf(data.taxable) === undefined) return { statusCode: 400, headers, body: JSON.stringify({ error: TAXABLE_REFUSAL, field: 'taxable' }) };
            const refused = productRefused(data, stored.customPrice);
            if (refused) return { statusCode: 400, headers, body: JSON.stringify(refused) };

            // A save writes only the columns it names (guide §18b125 rule 1): one it leaves out keeps the stored value.
            // Who made the product, and when, are the stored ones. A body naming nothing writes nothing.
            const { id: _id, ...named } = sanitize(data);
            if (!Object.keys(named).length) return { statusCode: 200, headers, body: JSON.stringify({ product: stored }) };
            const changes = { ...named, ...pricesOf(data, stored.customPrice), updatedAt: new Date() };
            const [updated] = await db.update(products).set(changes)
                .where(and(eq(products.id, stored.id), eq(products.orgId, orgId)))
                .returning();
            // Gone between the read and the write: nothing written, and no audit row.
            if (!updated) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Product not found in your organization' }) };
            await auditAs(orgId, auth.userId, { action: 'product.updated', entityType: 'product', entityId: updated.id, entityName: updated.name, detail: `${updated.category || 'uncategorised'} · list $${Number(updated.listPrice || 0).toLocaleString()}${updated.active === false ? ' · inactive' : ''}` });
            return { statusCode: 200, headers, body: JSON.stringify({ product: updated }) };
        }

        // ── DELETE — soft-delete by setting active = false (admin only) ───────
        if (event.httpMethod === 'DELETE') {
            if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param required' }) };

            const [off] = await db.update(products)
                .set({ active: false, updatedAt: new Date() })
                .where(and(eq(products.id, id), eq(products.orgId, orgId)))
                .returning({ id: products.id, name: products.name });
            if (off) await auditAs(orgId, auth.userId, { action: 'product.deactivated', entityType: 'product', entityId: off.id, entityName: off.name, detail: 'Removed from the catalog (kept on past quotes)' });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('products error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'products') };
    }
};
