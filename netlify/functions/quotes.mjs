import { db } from '../../db/index.js';
import { quotes, opportunities } from '../../db/schema.js';
import { eq, asc, and, desc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Fields that may be written by clients
const ALLOWED_FIELDS = [
    'id', 'opportunityId', 'quoteNumber', 'version', 'name', 'status',
    'validUntil', 'paymentTerms', 'billingContact', 'lineItems',
    'subtotal', 'dealDiscount', 'totalValue', 'recurringValue', 'oneTimeValue',
    'notes', 'approvalNote', 'createdBy',
];

function sanitize(data) {
    return Object.fromEntries(
        Object.entries(data).filter(([k]) => ALLOWED_FIELDS.includes(k))
    );
}

// Recalculate totals server-side from line items to prevent client tampering
function calcTotals(lineItems = [], dealDiscountPct = 0) {
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
            // Annualize: if unit is 'month', multiply by 12; otherwise treat as annual already
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

// When a quote is accepted, push its totalValue to the linked opportunity's arr field
async function syncToOpportunity(orgId, opportunityId, totalValue) {
    if (!opportunityId) return;
    await db.update(opportunities)
        .set({ arr: String(totalValue), updatedAt: new Date() })
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };

    const { orgId, userRole } = auth;
    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';

    try {
        // ── GET — list quotes ─────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const oppId = event.queryStringParameters?.opportunityId;
            let rows;
            if (oppId) {
                // All versions for a specific opportunity
                rows = await db.select().from(quotes)
                    .where(and(eq(quotes.orgId, orgId), eq(quotes.opportunityId, oppId)))
                    .orderBy(asc(quotes.quoteNumber), asc(quotes.version));
            } else {
                // All quotes for the org (for the global Quotes tab)
                rows = await db.select().from(quotes)
                    .where(eq(quotes.orgId, orgId))
                    .orderBy(desc(quotes.createdAt));
            }
            return { statusCode: 200, headers, body: JSON.stringify({ quotes: rows }) };
        }

        // ── POST — create quote ───────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            if (isReadOnly) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Read-only users cannot create quotes' }) };
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            if (!data.opportunityId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'opportunityId is required' }) };
            if (!data.quoteNumber) return { statusCode: 400, headers, body: JSON.stringify({ error: 'quoteNumber is required' }) };

            const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
            const totals = calcTotals(lineItems, data.dealDiscount || 0);

            const payload = {
                ...sanitize(data),
                orgId,
                lineItems,
                ...totals,
                version: Number(data.version) || 1,
                dealDiscount: String(data.dealDiscount || 0),
                status: 'Draft',
            };

            const [inserted] = await db.insert(quotes).values(payload).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ quote: inserted }) };
        }

        // ── PUT — update quote ────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            if (isReadOnly) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Read-only users cannot update quotes' }) };
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };

            const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
            const totals = calcTotals(lineItems, data.dealDiscount || 0);

            // Approval / acceptance logic
            const statusUpdates = {};
            if (data.status === 'Approved' && (isAdmin || isManager)) {
                statusUpdates.approvedBy = auth.userId;
                statusUpdates.approvedAt = new Date();
            }
            if (data.status === 'Sent') {
                statusUpdates.sentAt = new Date();
            }
            if (data.status === 'Accepted') {
                statusUpdates.acceptedAt = new Date();
                statusUpdates.syncedToOpp = true;
                // Push revenue to opportunity
                await syncToOpportunity(orgId, data.opportunityId, totals.totalValue);
            }

            const payload = {
                ...sanitize(data),
                orgId,
                lineItems,
                ...totals,
                dealDiscount: String(data.dealDiscount || 0),
                ...statusUpdates,
                updatedAt: new Date(),
            };

            const [updated] = await db
                .insert(quotes).values({ ...payload, createdAt: new Date() })
                .onConflictDoUpdate({ target: quotes.id, set: payload })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ quote: updated }) };
        }

        // ── DELETE — remove a quote version ──────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param required' }) };

            await db.delete(quotes)
                .where(and(eq(quotes.id, id), eq(quotes.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('quotes error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
