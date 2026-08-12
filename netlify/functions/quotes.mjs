import { db } from '../../db/index.js';
import { quotes, opportunities, settings as settingsTable } from '../../db/schema.js';
import { eq, asc, and, desc } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, withNumberRetry } from './_lib.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Fields that may be written by clients.
//
// `quoteNumber` is deliberately ABSENT. It used to be here, and was generated in
// the browser (useQuotes.js) from whatever quotes that user happened to have
// loaded — so two reps quoting at once produced the same number, and a filtered
// quote list produced one that collided with an existing quote. It is now
// server-assigned and immutable, matching dispatch_customers.customerNumber and
// dispatch_jobs.jobNumber.
const ALLOWED_FIELDS = [
    'id', 'opportunityId', 'version', 'name', 'status',
    'validUntil', 'paymentTerms', 'billingContact', 'lineItems',
    'subtotal', 'dealDiscount', 'totalValue', 'recurringValue', 'oneTimeValue',
    'notes', 'approvalNote', 'approvalTier', 'approvalReason', 'createdBy',
];

function sanitize(data) {
    return Object.fromEntries(
        Object.entries(data).filter(([k]) => ALLOWED_FIELDS.includes(k))
    );
}

// Human-readable quote number, Q-2026-001. Sequential per org per year.
//
// Concurrency: this is still read-max-then-add-one across two statements, so a
// unique index on (org_id, quote_number) plus a retry is the proper fix — the
// same outstanding item that applies to customerNumber and jobNumber. Moving
// generation to the server closes the much wider window that existed while the
// number was derived from one browser's partial list.
async function nextQuoteNumber(orgId) {
    const year   = new Date().getFullYear();
    const prefix = `Q-${year}-`;
    const rows   = await db.select({ n: quotes.quoteNumber })
        .from(quotes).where(eq(quotes.orgId, orgId));
    let max = 0;
    for (const r of rows) {
        const v = String(r.n || '');
        if (!v.startsWith(prefix)) continue;
        const num = parseInt(v.slice(prefix.length), 10);
        if (Number.isFinite(num) && num > max) max = num;
    }
    return prefix + String(max + 1).padStart(3, '0');
}

// A new VERSION of an existing quote keeps that quote's number — v2 of Q-2026-004
// is still Q-2026-004. The client sends the number it is versioning, but it is
// treated as a REFERENCE to be verified, never as a value to store: the row must
// already exist in this org on the same opportunity. Anything else gets a fresh
// server-issued number.
async function resolveQuoteNumber(orgId, data) {
    const claimed = String(data.quoteNumber || '').trim();
    const version = Number(data.version) || 1;
    if (version > 1 && claimed && data.opportunityId) {
        const [sibling] = await db.select({ n: quotes.quoteNumber })
            .from(quotes)
            .where(and(
                eq(quotes.orgId, orgId),
                eq(quotes.opportunityId, data.opportunityId),
                eq(quotes.quoteNumber, claimed)))
            .limit(1);
        if (sibling?.n) return sibling.n;
    }
    return nextQuoteNumber(orgId);
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
// ── Compute which approval tier applies ──────────────────────────────────────
const DEFAULT_APPROVAL_TIERS = [
    { maxDiscount: 0.10, label: 'Rep',          approver: null           },
    { maxDiscount: 0.20, label: 'Mgr approval', approver: 'Sales Manager'},
    { maxDiscount: 0.30, label: 'VP approval',  approver: 'VP Sales'     },
    { maxDiscount: 1.00, label: 'CFO approval', approver: 'CFO'          },
];

async function getApprovalTiers(orgId) {
    try {
        const rows = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        const extra = rows[0]?.extra;
        if (extra?.approvalTiers?.length) return extra.approvalTiers;
    } catch(e) { /* fallback */ }
    return DEFAULT_APPROVAL_TIERS;
}

function computeApprovalTier(avgDiscountPct, tiers) {
    // avgDiscountPct is 0-100 (e.g. 22 means 22%)
    const ratio = avgDiscountPct / 100;
    for (const tier of tiers) {
        if (ratio <= tier.maxDiscount) return tier;
    }
    return tiers[tiers.length - 1];
}

async function syncToOpportunity(orgId, opportunityId, totalValue) {
    if (!opportunityId) return;
    await db.update(opportunities)
        .set({ arr: String(totalValue), updatedAt: new Date() })
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
}

// ── Approval stats helper (used by Settings → Approval tiers) ───────────────
// GET /.netlify/functions/quotes?approvalStats=true
// Returns counts grouped by approvalTier for the last 90 days

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };

    const { orgId, userRole } = auth;
    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    // Shared write gate rather than a local ReadOnly-only const: that const
    // shadowed the imported helper and would have let a Technician write quotes.
    const forbiddenWrite = requireWrite(auth, event, headers);
    if (forbiddenWrite) return forbiddenWrite;

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

            // Approval stats — grouped by tier for the last 90 days
            if (event.queryStringParameters?.approvalStats === 'true') {
                const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
                const allQuotes = await db.select().from(quotes).where(eq(quotes.orgId, orgId));
                const recent = allQuotes.filter(q => new Date(q.updatedAt) >= ninetyDaysAgo);
                // Get org's approval tiers to ensure all tiers are represented
                const tiers = await getApprovalTiers(orgId);
                const stats = tiers.map(tier => {
                    const tierQuotes = recent.filter(q => q.approvalTier === tier.label);
                    const approved   = tierQuotes.filter(q => q.status === 'Approved').length;
                    const declined   = tierQuotes.filter(q => q.status === 'Declined').length;
                    const pending    = tierQuotes.filter(q => q.status === 'Pending Approval').length;
                    // Avg hours from submission to approval
                    const times = tierQuotes
                        .filter(q => q.approvedAt && q.updatedAt)
                        .map(q => (new Date(q.approvedAt) - new Date(q.updatedAt)) / 3600000);
                    const avgHours = times.length > 0 ? Math.round(times.reduce((a,b) => a+b,0) / times.length) : 0;
                    return { tier: tier.label, quotes: tierQuotes.length, approved, declined, pending, avgHours };
                });
                // Also count Rep tier (no approval needed — all non-pending quotes)
                return { statusCode: 200, headers, body: JSON.stringify({ approvalStats: stats }) };
            }

            return { statusCode: 200, headers, body: JSON.stringify({ quotes: rows }) };
        }

        // ── POST — create quote ───────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            if (!data.opportunityId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'opportunityId is required' }) };
            // quoteNumber is no longer required from the client — it is issued here.

            const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
            const totals = calcTotals(lineItems, data.dealDiscount || 0);

            const basePayload = {
                ...sanitize(data),
                orgId,
                lineItems,
                ...totals,
                version: Number(data.version) || 1,
                dealDiscount: String(data.dealDiscount || 0),
                status: 'Draft',
            };

            // Resolved inside the retry so a collision re-reads the maximum. Note a
            // NEW VERSION reuses its predecessor's number by design, and the unique
            // index is on (org, number, version) — so versioning cannot trip it.
            const [inserted] = await withNumberRetry(async () => {
                const quoteNumber = await resolveQuoteNumber(orgId, data);
                return db.insert(quotes).values({ ...basePayload, quoteNumber }).returning();
            }, { label: 'quote number' });
            return { statusCode: 201, headers, body: JSON.stringify({ quote: inserted }) };
        }

        // ── PUT — update quote ────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };

            const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
            const totals = calcTotals(lineItems, data.dealDiscount || 0);

            // Approval / acceptance logic
            const statusUpdates = {};
            if (data.status === 'Pending Approval') {
                // Calculate which approval tier applies based on avg discount across line items
                const tiers = await getApprovalTiers(orgId);
                const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
                let avgDisc = 0;
                if (lineItems.length > 0) {
                    avgDisc = lineItems.reduce((s, item) => s + (Number(item.discountPct) || 0), 0) / lineItems.length;
                }
                // Also check deal-level discount
                const dealDisc = Number(data.dealDiscount) || 0;
                const effectiveDisc = Math.max(avgDisc, dealDisc);
                const matchedTier = computeApprovalTier(effectiveDisc, tiers);
                const prevTier = tiers[tiers.indexOf(matchedTier) - 1];
                const threshold = prevTier ? Math.round(prevTier.maxDiscount * 100) : 0;
                statusUpdates.approvalTier   = matchedTier.label;
                statusUpdates.approvalReason = `Avg discount ${Math.round(effectiveDisc)}% > ${threshold}% ${prevTier?.label || 'rep'} tier`;
            }
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

            // quote_number is NOT NULL and `sanitize` no longer lets it through, so
            // the INSERT half of this upsert must supply it explicitly. Postgres
            // validates NOT NULL while building the tuple — BEFORE ON CONFLICT can
            // divert to the update — so omitting it fails the whole statement even
            // when the row already exists. That broke every quote save, including
            // line-item edits, which is how a quote could look saved and come back
            // empty.
            const [existing] = await db.select({ n: quotes.quoteNumber })
                .from(quotes).where(and(eq(quotes.id, data.id), eq(quotes.orgId, orgId))).limit(1);

            const [updated] = await withNumberRetry(async () => {
                // An existing row keeps its number, so the retry only ever re-issues
                // for the upsert-creates-a-row case.
                const quoteNumber = existing?.n || await resolveQuoteNumber(orgId, data);
                return db
                    .insert(quotes).values({ ...payload, quoteNumber, createdAt: new Date() })
                    // `set` excludes quoteNumber: assigned once, never changed.
                    .onConflictDoUpdate({ target: quotes.id, setWhere: eq(quotes.orgId, orgId), set: payload })
                    .returning();
            }, { label: 'quote number' });
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
        return { statusCode: 500, headers, body: serverErrorBody(err, 'quotes') };
    }
};
