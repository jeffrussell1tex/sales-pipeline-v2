import { db } from '../../db/index.js';
import { products } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const ALLOWED_FIELDS = [
    'id', 'name', 'sku', 'description', 'productType', 'listPrice',
    'minPrice', 'unit', 'category', 'active', 'sortOrder', 'createdBy',
];

function sanitize(data) {
    return Object.fromEntries(
        Object.entries(data).filter(([k]) => ALLOWED_FIELDS.includes(k))
    );
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
            if (!data.name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) };
            if (data.listPrice == null) return { statusCode: 400, headers, body: JSON.stringify({ error: 'listPrice is required' }) };

            const payload = {
                ...sanitize(data),
                orgId,
                listPrice: String(data.listPrice),
                minPrice: data.minPrice != null ? String(data.minPrice) : null,
            };
            const [inserted] = await db.insert(products).values(payload).returning();
            await auditAs(orgId, auth.userId, { action: 'product.created', entityType: 'product', entityId: inserted.id, entityName: inserted.name, detail: `${inserted.category || 'uncategorised'} · list $${Number(inserted.listPrice || 0).toLocaleString()}` });
            return { statusCode: 201, headers, body: JSON.stringify({ product: inserted }) };
        }

        // ── PUT — update product (admin only, upsert pattern) ─────────────────
        if (event.httpMethod === 'PUT') {
            if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };

            const payload = {
                ...sanitize(data),
                orgId,
                listPrice: data.listPrice != null ? String(data.listPrice) : undefined,
                minPrice: data.minPrice != null ? String(data.minPrice) : null,
                updatedAt: new Date(),
            };
            const [updated] = await db
                .insert(products).values({ ...payload, createdAt: new Date() })
                .onConflictDoUpdate({ target: products.id, setWhere: eq(products.orgId, orgId), set: payload })
                .returning();
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
