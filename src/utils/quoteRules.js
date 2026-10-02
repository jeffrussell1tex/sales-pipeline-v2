// src/utils/quoteRules.js — what may happen to a quote. ONE copy, read by the
// server (quotes.mjs, quote-email.mjs) and by the client (QuotesTab's buttons), so
// a button is never offered that the server refuses (state §0.155 — commit (C) of
// the rep / Dispatcher / quotes plan, guide §18b46's one-rule shape).
//
// Jeff's decisions (30 Sep, 2 Oct): an ACCEPTED quote is final — status and lines;
// a new version changes it. A quote's lines and terms lock once it is SENT — the
// customer holds that version. An APPROVED quote that is edited returns to Draft
// and needs approval again. Approval is enforced on the server: only an Admin or a
// Manager approves, or sends back a quote waiting for approval, and a quote whose
// discount needs approval is not sent until it has it.
//
// Before this, quotes.mjs checked none of it: a rep's PUT of `status: 'Approved'`
// on her own over-tier quote was stored (only the approvedBy stamp was gated), an
// accepted quote went back to "Sent" with one click, and its lines could change.
//
// The words are the ones the app stores. 'Sent' and 'Rejected' are older words a
// row may still hold; they lock like their current twins.

export const QUOTE_STATUSES = Object.freeze([
    'Draft', 'Pending Approval', 'Approved', 'Sent to Customer', 'Negotiating',
    'Accepted', 'Rejected / Lost', 'Superseded', 'Expired',
]);

// Lines and terms are fixed from here on: what the customer received, or a quote
// that is closed. A change is a new version.
export const LOCKED_QUOTE_STATUSES = Object.freeze([
    'Sent to Customer', 'Sent', 'Negotiating', 'Accepted', 'Rejected / Lost', 'Rejected', 'Superseded', 'Expired',
]);
export const quoteIsLocked = (status) => LOCKED_QUOTE_STATUSES.includes(status);

// What "the lines and terms" are — the fields the customer sees.
export const QUOTE_TERMS_FIELDS = Object.freeze(['lineItems', 'dealDiscount', 'validUntil', 'paymentTerms', 'billingContact', 'notes']);

// Who approves: the roles with write authority over other people's records.
export const canApproveQuotes = (role) => role === 'Admin' || role === 'Manager';

// The tiers when an org has saved none (Settings → Quoting → Approval tiers saves
// the same shape: a label, a maxDiscount ratio, an approver).
export const DEFAULT_QUOTE_APPROVAL_TIERS = Object.freeze([
    Object.freeze({ maxDiscount: 0.10, label: 'Rep',          approver: null }),
    Object.freeze({ maxDiscount: 0.20, label: 'Mgr approval', approver: 'Sales Manager' }),
    Object.freeze({ maxDiscount: 0.30, label: 'VP approval',  approver: 'VP Sales' }),
    Object.freeze({ maxDiscount: 1.00, label: 'CFO approval', approver: 'CFO' }),
]);

const pct = (v) => Math.min(Math.max(Number(v) || 0, 0), 100);

// The quote's discount, in percent — the arithmetic quotes.mjs has always stamped
// on "Pending Approval": the average line discount, or the deal-level discount when
// that is larger. The client's gauge, its buttons and the server read this one.
export function quoteDiscountPct(lineItems, dealDiscount) {
    const lines = Array.isArray(lineItems) ? lineItems : [];
    const avg = lines.length ? lines.reduce((s, li) => s + pct(li?.discountPct), 0) / lines.length : 0;
    return Math.max(avg, pct(dealDiscount));
}

// The tier a discount (in percent) falls in.
export function approvalTierFor(discountPct, tiers) {
    const list = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_QUOTE_APPROVAL_TIERS;
    const ratio = (Number(discountPct) || 0) / 100;
    for (const t of list) if (ratio <= Number(t?.maxDiscount)) return t;
    return list[list.length - 1];
}

// A tier that names an approver routes the quote to them before it is sent; the
// rep tier — and any tier saved without an approver — does not.
export const tierNeedsApproval = (tier) => !!String(tier?.approver ?? '').trim();

export function quoteNeedsApproval(quote, tiers) {
    return tierNeedsApproval(approvalTierFor(quoteDiscountPct(quote?.lineItems, quote?.dealDiscount), tiers));
}

// The words "this {status} quote", for a refusal.
const named = (s) => (s === 'Rejected / Lost' || s === 'Rejected' ? 'rejected' : String(s || 'draft').toLowerCase());

// May a quote move from `from` to `to`? null = yes; otherwise the refusal, in words
// a screen can show. `role` is the caller's; `needsApproval` whether the quote's
// discount (as it will be saved) needs an approver. A save that keeps the status is
// not a move — quoteEditOutcome decides what an edit may do.
export function quoteTransitionRefusal({ from, to, role, needsApproval = false }) {
    const f = from || 'Draft';
    const t = to || f;
    if (t === f) return null;
    if (!QUOTE_STATUSES.includes(t)) return `"${t}" is not a quote status.`;
    if (f === 'Accepted') return 'An accepted quote is final — start a new version to change it.';
    if (['Rejected / Lost', 'Rejected', 'Superseded', 'Expired'].includes(f)) return `This ${named(f)} quote is closed — start a new version.`;
    switch (t) {
        case 'Draft':
            return f === 'Pending Approval' || f === 'Approved' ? null : `A ${named(f)} quote cannot go back to Draft — start a new version.`;
        case 'Pending Approval':
            return f === 'Draft' ? null : `Only a draft is submitted for approval — this one is ${named(f)}.`;
        case 'Approved':
            if (!canApproveQuotes(role)) return 'Only an Admin or a Manager approves a quote.';
            return f === 'Pending Approval' ? null : 'Only a quote waiting for approval can be approved.';
        case 'Sent to Customer':
            if (f === 'Approved') return null;
            if (f === 'Pending Approval') return 'This quote is waiting for approval — it is sent once approved.';
            if (f === 'Draft') return needsApproval ? 'This discount needs approval before the quote is sent.' : null;
            return `This quote is already ${named(f)} — start a new version to send another.`;
        case 'Negotiating':
            return f === 'Sent to Customer' || f === 'Sent' ? null : 'Only a sent quote goes into negotiation.';
        case 'Accepted':
            // The statuses invoices.js's quoteCanBeAccepted offers the button on.
            return ['Approved', 'Sent to Customer', 'Sent', 'Negotiating'].includes(f) ? null : 'Only a sent or approved quote can be accepted.';
        case 'Rejected / Lost':
            if (f === 'Pending Approval') return canApproveQuotes(role) ? null : 'Only an Admin or a Manager sends back a quote waiting for approval.';
            return ['Approved', 'Sent to Customer', 'Sent', 'Negotiating'].includes(f) ? null : `A ${named(f)} quote is not marked lost.`;
        default:
            return `"${t}" is set by the app, not by hand.`;   // Superseded, Expired
    }
}

// What a BUTTON may offer: a real move the rule allows. quoteTransitionRefusal lets
// a save keep its status (that is not a move, and the server must allow it), so on
// its own it would offer "Submit" on a quote already submitted and "Send" on one
// already sent — the pane caught exactly that (§0.155).
export const quoteMoveAllowed = (args) => (args?.from || 'Draft') !== args?.to && quoteTransitionRefusal(args) === null;

// What an EDIT does — `termsChanged`: any QUOTE_TERMS_FIELDS value differs from the
// stored row. A locked quote refuses; an approved one returns to Draft (the
// approval no longer matches what would be sent); anything else keeps its status.
export function quoteEditOutcome({ status, termsChanged }) {
    if (!termsChanged) return { status, refusal: null, approvalCleared: false };
    if (status === 'Accepted') return { status, refusal: 'An accepted quote is final — start a new version to change it.', approvalCleared: false };
    if (quoteIsLocked(status)) return { status, refusal: 'This quote was sent — its lines and terms are final. Start a new version to change them.', approvalCleared: false };
    if (status === 'Approved') return { status: 'Draft', refusal: null, approvalCleared: true };
    return { status, refusal: null, approvalCleared: false };
}

// Did an edit change the terms? Compared as JSON of each field, the money as
// numbers (the database returns "0.00" where the client sends 0).
export function quoteTermsChanged(stored, next) {
    for (const k of QUOTE_TERMS_FIELDS) {
        const a = stored?.[k], b = next?.[k];
        if (k === 'dealDiscount') { if ((Number(a) || 0) !== (Number(b) || 0)) return true; continue; }
        if (k === 'lineItems') { if (JSON.stringify(normLines(a)) !== JSON.stringify(normLines(b))) return true; continue; }
        if ((a ?? '') !== (b ?? '')) return true;
    }
    return false;
}

// Line items compared by what they mean, not by key order (jsonb reorders keys).
function normLines(lines) {
    return (Array.isArray(lines) ? lines : []).map(li => {
        const o = {};
        for (const k of Object.keys(li || {}).sort()) {
            const v = li[k];
            o[k] = ['quantity', 'listPrice', 'discountPct', 'unitPrice', 'netPrice'].includes(k) ? Number(v) || 0 : v;
        }
        return o;
    });
}
