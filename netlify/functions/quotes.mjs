import { db } from '../../db/index.js';
import { quotes, opportunities, settings as settingsTable } from '../../db/schema.js';
import { eq, asc, and, desc, sql } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, withNumberRetry, auditAs, getCallerName } from './_lib.mjs';
// A quote belongs to its DEAL (state §0.155, guide §18b48): who may read or change a
// quote is who may read or change the deal — the deals list's own rule, imported
// directly so a suite that mocks auth.mjs still runs the real one. What may HAPPEN
// to a quote is one rule too; QuotesTab's buttons read the same module.
import { dealVisibleTo } from '../../src/utils/roles.js';
import { dealReadContext, dealAccess } from './_dealAccess.mjs';
import {
    DEFAULT_QUOTE_APPROVAL_TIERS, approvalTierFor, quoteDiscountPct, quoteNeedsApproval,
    quoteTransitionRefusal, quoteEditOutcome, quoteTermsChanged, canApproveQuotes,
} from '../../src/utils/quoteRules.js';

// A status a save MOVES the quote to names the event (§0.143); anything else is an
// update. The words are the ones the app stores: this map listed 'Sent' and
// 'Rejected', which nothing sends, so a send or a reject was audited as a plain
// update and sentAt was never stamped (§0.155).
const QUOTE_STATUS_ACTIONS = Object.freeze({
    'Pending Approval': 'quote.submitted',
    Approved:           'quote.approved',
    'Rejected / Lost':  'quote.rejected',
    'Sent to Customer': 'quote.sent',
    Accepted:           'quote.accepted',
});

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
// See nextCustomerNumber. Quote numbers pad to only THREE digits, so the
// lexicographic-MAX bug would appear at just 1000 quotes in a year rather than
// 10000 — the shortest fuse of the three.
async function nextQuoteNumber(orgId) {
    const year   = new Date().getFullYear();
    const prefix = `Q-${year}-`;
    const [row] = await db
        .select({ max: sql`MAX(CAST(SUBSTRING(TRIM(${quotes.quoteNumber}) FROM ${'^' + prefix + '([0-9]+)$'}) AS INTEGER))` })
        .from(quotes)
        .where(and(
            eq(quotes.orgId, orgId),
            sql`TRIM(${quotes.quoteNumber}) ~ ${'^' + prefix + '[0-9]+$'}`,
        ));
    const max = parseInt(row?.max, 10) || 0;
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

// ── Approval tiers: the org's (Settings → Quoting → Approval tiers), else the
// defaults the rules module carries. Exported for quote-email.mjs, which applies
// the same "needs approval before it is sent" rule.
export async function getApprovalTiers(orgId) {
    try {
        const rows = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        const extra = rows[0]?.extra;
        if (extra?.approvalTiers?.length) return extra.approvalTiers;
    } catch(e) { /* fallback */ }
    return DEFAULT_QUOTE_APPROVAL_TIERS;
}

// What a quote submitted for approval is stamped with: the tier its discount falls
// in, and why — "Avg discount 25% > 20% Mgr approval tier".
function approvalStamp(quote, tiers) {
    const disc = quoteDiscountPct(quote.lineItems, quote.dealDiscount);
    const tier = approvalTierFor(disc, tiers);
    const prevTier = tiers[tiers.indexOf(tier) - 1];
    const threshold = prevTier ? Math.round(prevTier.maxDiscount * 100) : 0;
    return { approvalTier: tier.label, approvalReason: `Avg discount ${Math.round(disc)}% > ${threshold}% ${prevTier?.label || 'rep'} tier` };
}

// When a quote is accepted, push its totalValue to the linked opportunity's arr field
async function syncToOpportunity(orgId, opportunityId, totalValue) {
    if (!opportunityId) return;
    await db.update(opportunities)
        .set({ arr: String(totalValue), updatedAt: new Date() })
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
}

const refuse = (statusCode, error) => ({ statusCode, headers, body: JSON.stringify({ error }) });
// A quote on a deal the caller may not see answers as missing — never "it exists,
// but it is not yours".
const NOT_FOUND = 'Quote not found';

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };

    const { orgId, userRole } = auth;
    const isAdmin = userRole === 'Admin';
    // Shared write gate rather than a local ReadOnly-only const: that const
    // shadowed the imported helper and would have let a Technician write quotes.
    const forbiddenWrite = requireWrite(auth, event, headers);
    if (forbiddenWrite) return forbiddenWrite;

    try {
        // ── GET — the quotes on the deals the caller can see ─────────────────
        if (event.httpMethod === 'GET') {
            // Approval stats — grouped by tier for the last 90 days. Settings →
            // Approval tiers reads them; they count every rep's quotes, so they are
            // for the roles that approve.
            if (event.queryStringParameters?.approvalStats === 'true') {
                if (!canApproveQuotes(userRole)) return refuse(403, 'Forbidden: approval statistics are for an Admin or a Manager');
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
                return { statusCode: 200, headers, body: JSON.stringify({ approvalStats: stats }) };
            }

            // A quote reaches the caller where its DEAL does (dealVisibleTo): a rep
            // her own deals' quotes — and an unassigned deal's where the Admin's
            // switch shows it to her — a Technician none, Admin, Manager and a
            // Dispatcher the org's. Every member used to receive every quote; the
            // Quotes tab then filtered by the creator's NAME (§0.155).
            const ctx = await dealReadContext(auth);
            const deals = await db.select({ id: opportunities.id, ownerId: opportunities.ownerId, salesRep: opportunities.salesRep })
                .from(opportunities).where(eq(opportunities.orgId, orgId));
            const visible = new Set(deals.filter(d => dealVisibleTo(d, ctx)).map(d => d.id));
            const oppId = event.queryStringParameters?.opportunityId;
            let rows;
            if (oppId) {
                // All versions for a specific opportunity
                rows = visible.has(oppId)
                    ? await db.select().from(quotes)
                        .where(and(eq(quotes.orgId, orgId), eq(quotes.opportunityId, oppId)))
                        .orderBy(asc(quotes.quoteNumber), asc(quotes.version))
                    : [];
            } else {
                rows = (await db.select().from(quotes)
                    .where(eq(quotes.orgId, orgId))
                    .orderBy(desc(quotes.createdAt)))
                    .filter(q => visible.has(q.opportunityId));
            }
            return { statusCode: 200, headers, body: JSON.stringify({ quotes: rows }) };
        }

        // ── POST — create a quote, on a deal the caller may change ───────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return refuse(400, 'id is required');
            if (!data.opportunityId) return refuse(400, 'opportunityId is required');
            // quoteNumber is no longer required from the client — it is issued here.

            // The deal decides: one this org holds, that the caller sees and may
            // change — a rep her own, or an unassigned one the switch shows her.
            const access = await dealAccess(auth, data.opportunityId);
            if (!access.canRead) return refuse(404, 'Deal not found');
            if (!access.canWrite) return refuse(403, 'Forbidden: you can only quote your own or unassigned deals');

            const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
            const totals = calcTotals(lineItems, data.dealDiscount || 0);

            const basePayload = {
                ...sanitize(data),
                orgId,
                opportunityId: access.deal.id,
                lineItems,
                ...totals,
                version: Number(data.version) || 1,
                dealDiscount: String(data.dealDiscount || 0),
                status: 'Draft',
                // A new draft carries no approval stamp — the server writes one when
                // the quote is submitted.
                approvalTier: null, approvalReason: null,
                // Who wrote it, from the roster — not the body's word for it.
                createdBy: (await getCallerName(auth.userId, orgId)) || data.createdBy || null,
            };

            // Resolved inside the retry so a collision re-reads the maximum. Note a
            // NEW VERSION reuses its predecessor's number by design, and the unique
            // index is on (org, number, version) — so versioning cannot trip it.
            const [inserted] = await withNumberRetry(async () => {
                const quoteNumber = await resolveQuoteNumber(orgId, data);
                return db.insert(quotes).values({ ...basePayload, quoteNumber }).returning();
            }, { label: 'quote number' });
            await auditAs(orgId, auth.userId, {
                action: 'quote.created', entityType: 'quote', entityId: inserted.id, entityName: inserted.name || inserted.quoteNumber,
                detail: `${inserted.quoteNumber} v${inserted.version} · ${lineItems.length} line item${lineItems.length === 1 ? '' : 's'}`,
            });
            return { statusCode: 201, headers, body: JSON.stringify({ quote: inserted }) };
        }

        // ── PUT — change a quote the caller may change, by the rules ─────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body || '{}');
            if (!data.id) return refuse(400, 'id is required');

            // The stored quote, in this org. A PUT no longer CREATES one: it was an
            // upsert, so a PUT could make a quote in any status and skip the POST's
            // forced Draft. New quotes are POSTed (useQuotes does).
            const [existing] = await db.select().from(quotes)
                .where(and(eq(quotes.id, String(data.id)), eq(quotes.orgId, orgId))).limit(1);
            if (!existing) return refuse(404, NOT_FOUND);
            // Its DEAL decides who may change it — the stored deal, never the body's.
            const access = await dealAccess(auth, existing.opportunityId);
            if (!access.canRead) return refuse(404, NOT_FOUND);
            if (!access.canWrite) return refuse(403, 'Forbidden: you can only change quotes on your own or unassigned deals');

            // Merged over the stored row: a save names what it changes, and a field it
            // leaves out keeps its value — a PUT without lineItems used to write [] and
            // zero totals. The deal, the version and the author are the stored ones.
            // The approval tier and its reason are the server's stamp — what an
            // approver reads — so a save cannot rewrite them either.
            const merged = {
                ...existing, ...sanitize(data),
                id: existing.id, opportunityId: existing.opportunityId, version: existing.version, createdBy: existing.createdBy,
                approvalTier: existing.approvalTier, approvalReason: existing.approvalReason,
            };
            const lineItems = Array.isArray(merged.lineItems) ? merged.lineItems : [];
            const totals = calcTotals(lineItems, merged.dealDiscount || 0);
            const tiers = await getApprovalTiers(orgId);

            // The rules (src/utils/quoteRules.js — the client's buttons read the same):
            // an edit to a sent or accepted quote's lines or terms is refused, an edit
            // to an approved one returns it to Draft; then the status move, if any.
            const from = existing.status || 'Draft';
            const termsChanged = quoteTermsChanged(existing, merged);
            const edit = quoteEditOutcome({ status: from, termsChanged });
            if (edit.refusal) return refuse(409, edit.refusal);
            const requested = data.status ?? from;
            const to = requested === from ? edit.status : requested;
            const moveRefusal = quoteTransitionRefusal({
                from: edit.status, to, role: userRole,
                needsApproval: quoteNeedsApproval({ lineItems, dealDiscount: merged.dealDiscount }, tiers),
            });
            if (moveRefusal) {
                // A move only an approver makes is a 403; any other refusal is the
                // quote's state (409).
                const approverMove = to === 'Approved' || (to === 'Rejected / Lost' && edit.status === 'Pending Approval');
                return refuse(approverMove && !canApproveQuotes(userRole) ? 403 : 409, moveRefusal);
            }

            const moved = to !== from;
            const stamps = {};
            if (edit.approvalCleared) { stamps.approvedBy = null; stamps.approvedAt = null; }
            if (to === 'Pending Approval' && (moved || termsChanged)) {
                Object.assign(stamps, approvalStamp({ lineItems, dealDiscount: merged.dealDiscount }, tiers));
            }
            if (moved && to === 'Approved') {
                // The approver's NAME — it is what "Recent decisions" shows; the audit
                // row records who, by id. It used to hold the Clerk id.
                stamps.approvedBy = (await getCallerName(auth.userId, orgId)) || 'Approver';
                stamps.approvedAt = new Date();
            }
            if (moved && to === 'Sent to Customer') stamps.sentAt = new Date();
            if (moved && to === 'Accepted') {
                stamps.acceptedAt = new Date();
                stamps.syncedToOpp = true;
                // The accepted value is the deal's — the STORED deal, never the body's.
                await syncToOpportunity(orgId, existing.opportunityId, totals.totalValue);
            }

            const { id: _id, ...fields } = sanitize(merged);
            const payload = {
                ...fields,
                lineItems,
                ...totals,
                dealDiscount: String(merged.dealDiscount || 0),
                status: to,
                ...stamps,
                updatedAt: new Date(),
            };
            const [updated] = await db.update(quotes).set(payload)
                .where(and(eq(quotes.id, existing.id), eq(quotes.orgId, orgId)))
                .returning();
            await auditAs(orgId, auth.userId, {
                action: (moved && QUOTE_STATUS_ACTIONS[to]) || 'quote.updated', entityType: 'quote', entityId: updated.id, entityName: updated.name || updated.quoteNumber,
                detail: `${updated.quoteNumber} v${updated.version} · ${moved ? `${from} → ${to}` : (updated.status || 'Draft')}${edit.approvalCleared ? ' · an edit cleared the approval' : ''}${stamps.approvalTier ? ' · ' + stamps.approvalTier : ''}`,
            });
            return { statusCode: 200, headers, body: JSON.stringify({ quote: updated }) };
        }

        // ── DELETE — remove a quote version ──────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            if (!isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin only' }) };
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param required' }) };

            const [gone] = await db.delete(quotes)
                .where(and(eq(quotes.id, id), eq(quotes.orgId, orgId)))
                .returning({ id: quotes.id, name: quotes.name, quoteNumber: quotes.quoteNumber, version: quotes.version });
            if (gone) await auditAs(orgId, auth.userId, { action: 'quote.deleted', entityType: 'quote', entityId: gone.id, entityName: gone.name || gone.quoteNumber, detail: `${gone.quoteNumber} v${gone.version}` });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('quotes error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'quotes') };
    }
};
