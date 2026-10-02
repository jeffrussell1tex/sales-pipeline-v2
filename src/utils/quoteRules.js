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

// Waiting for approval, a quote's lines and terms are HELD (Jeff, 2 Oct — state
// §0.156): the approver decides on what they read, so the rep withdraws it to change
// it. A rep could edit a pending quote, and an approver approve lines that changed
// after they looked.
export const quoteIsHeld = (status) => status === 'Pending Approval';
// May the lines and terms change now? Not once the quote is sent or closed, nor while held.
export const quoteTermsEditable = (status) => !quoteIsLocked(status) && !quoteIsHeld(status);

// What "the lines and terms" are — the fields the customer sees.
export const QUOTE_TERMS_FIELDS = Object.freeze(['lineItems', 'dealDiscount', 'validUntil', 'paymentTerms', 'billingContact', 'notes']);

// Who approves: the roles with write authority over other people's records.
export const canApproveQuotes = (role) => role === 'Admin' || role === 'Manager';

// The tiers when an org has saved none (Settings → Quoting → Approval tiers saves
// the same shape: a label, a maxDiscount ratio, an approver, the reminder's time).
// The page draws its starting tiers from this list, and quote-reminders.mjs reminds
// by it — an org that never saved is reminded at the times the page shows (Jeff,
// 2 Oct: "Remind at 8h/24h/48h"; §0.158).
export const DEFAULT_QUOTE_APPROVAL_TIERS = Object.freeze([
    Object.freeze({ maxDiscount: 0.10, label: 'Rep',          approver: null,            sla: null }),
    Object.freeze({ maxDiscount: 0.20, label: 'Mgr approval', approver: 'Sales Manager', sla: '8h' }),
    Object.freeze({ maxDiscount: 0.30, label: 'VP approval',  approver: 'VP Sales',      sla: '24h' }),
    Object.freeze({ maxDiscount: 1.00, label: 'CFO approval', approver: 'CFO',           sla: '48h' }),
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
// rep tier — and any tier saved without an approver — does not. The approver is a
// ROLE or a PERSON the Admin chose (§0.157), or, in an org that has not chosen, the
// old free-text name — a band that needs approval from any Admin or Manager.
export const tierNeedsApproval = (tier) => !!(tier?.approverRole || tier?.approverUserId || String(tier?.approver ?? '').trim());

export function quoteNeedsApproval(quote, tiers) {
    return tierNeedsApproval(approvalTierFor(quoteDiscountPct(quote?.lineItems, quote?.dealDiscount), tiers));
}

// ── Who approves a tier (Jeff, 2 Oct — state §0.157) ─────────────────────────
// "An admin setting for approvals. They can choose by role or by person. If by
// role they define the approver and backup, and if by person the admin sets the
// person and the backup." Per tier; the backup may act at any time; an Admin
// always may (a quote is never stuck behind an approver who left); only Admins and
// Managers approve (a rep cannot read another rep's deal). Settings → Quoting →
// Approval tiers stores the choice (`approvalRouting`) and each tier's approver and
// backup; the server enforces it on every approval and send-back (quotes.mjs).
export const APPROVAL_ROUTING_MODES = Object.freeze(['role', 'person']);
export const APPROVER_ROLES = Object.freeze(['Manager', 'Admin']);
export const cleanApprovalRouting = (v) => (APPROVAL_ROUTING_MODES.includes(v) ? v : null);

// May this caller approve — or send back — a quote at this tier? `userId` is the
// caller's app id (users.id), never the Clerk id. A tier that names no one (an org
// that has not chosen) is any approving role's, as before §0.157.
export function mayDecideQuote({ tier, role, userId }) {
    if (role === 'Admin') return true;
    if (!canApproveQuotes(role)) return false;
    const roles = [tier?.approverRole, tier?.backupRole].filter(Boolean);
    const people = [tier?.approverUserId, tier?.backupUserId].filter(Boolean);
    if (!roles.length && !people.length) return true;
    return roles.includes(role) || (!!userId && people.includes(userId));
}

// Who decides this tier, in words a screen or a refusal can show — "Bob Russell
// (backup: Jeff Russell)", "a Manager (backup: an Admin)", "a Manager or an Admin".
// `nameOf(id)` turns an app id into a name; an id it cannot name reads as "a
// former approver" — never the raw id.
const roleWords = (r) => (r === 'Admin' ? 'an Admin' : r === 'Manager' ? 'a Manager' : null);
export function tierApproverWords(tier, nameOf = () => null) {
    const person = (id) => (id ? (nameOf(id) || 'a former approver') : null);
    const who = roleWords(tier?.approverRole) || person(tier?.approverUserId);
    if (!who) return tierNeedsApproval(tier) ? 'a Manager or an Admin' : null;
    const backup = roleWords(tier?.backupRole) || person(tier?.backupUserId);
    return backup ? `${who} (backup: ${backup})` : who;
}

// The same, with the Admin who always may — once: "Bob Russell (backup: Jane Doe),
// or an Admin"; "an Admin" alone when the tier is an Admin's already.
export function decidedByWords(tier, nameOf) {
    const words = tierApproverWords(tier, nameOf);
    if (!words) return null;
    return /\ban Admin\b/.test(words) ? words : `${words}, or an Admin`;
}

// A tier's SLA in hours — "8h", "24 h", "2d" — the time a quote may wait for a
// decision before the backup is reminded (§0.158, Jeff's 3a). Anything else, or 0,
// is no reminder.
export function slaHours(sla) {
    const m = /^\s*(\d{1,4})\s*(h|hr|hrs|hour|hours|d|day|days)?\s*$/i.exec(String(sla ?? ''));
    if (!m) return null;
    const n = Number(m[1]);
    if (!n) return null;
    return /^d/i.test(m[2] || '') ? n * 24 : n;
}

// The tiers an Admin saves, cleaned for the mode chosen — what the settings PUT
// stores and the page sends. The bands ascend and the last is open-ended; each
// keeps only its own mode's approver and backup (a backup needs an approver, and
// is not the approver); an org with no mode keeps the old free-text name. Whether
// a named PERSON is an active Admin or Manager of this org is the server's check
// (settings.mjs) — a pure cleaner cannot read the roster.
export function cleanApprovalTiers(tiers, mode) {
    if (!Array.isArray(tiers) || tiers.length === 0) return null;
    const role = (v) => (APPROVER_ROLES.includes(v) ? v : null);
    const person = (v) => (typeof v === 'string' && /^usr_[A-Za-z0-9-]{1,64}$/.test(v) ? v : null);
    const out = tiers.slice(0, 12).map((t, i) => {
        const cap = Number(t?.maxDiscount);
        const tier = {
            id: String(t?.id || `tier_${i + 1}`).slice(0, 64),
            label: String(t?.label ?? '').trim().slice(0, 60) || `Tier ${i + 1}`,
            color: /^#[0-9a-fA-F]{6}$/.test(String(t?.color)) ? t.color : null,
            maxDiscount: Number.isFinite(cap) ? Math.min(1, Math.max(0.01, cap)) : 1,
            // The reminder's time, as the reminder reads it (§0.158): "8h", or none.
            sla: slaHours(t?.sla) ? `${slaHours(t.sla)}h` : null,
            approverRole: null, backupRole: null, approverUserId: null, backupUserId: null, approver: null,
        };
        if (mode === 'role') {
            tier.approverRole = role(t?.approverRole);
            tier.backupRole = tier.approverRole ? role(t?.backupRole) : null;
            if (tier.backupRole === tier.approverRole) tier.backupRole = null;
        } else if (mode === 'person') {
            tier.approverUserId = person(t?.approverUserId);
            tier.backupUserId = tier.approverUserId ? person(t?.backupUserId) : null;
            if (tier.backupUserId === tier.approverUserId) tier.backupUserId = null;
        } else {
            tier.approver = String(t?.approver ?? '').trim().slice(0, 60) || null;
        }
        return tier;
    }).sort((a, b) => a.maxDiscount - b.maxDiscount);
    out[out.length - 1].maxDiscount = 1;
    return out;
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
            // The customer's no (§0.156): an approver's is a send-back, to Draft.
            if (f === 'Pending Approval') return 'A quote waiting for approval is sent back to the rep, not marked lost.';
            return ['Approved', 'Sent to Customer', 'Sent', 'Negotiating'].includes(f) ? null : `A ${named(f)} quote is not marked lost.`;
        default:
            return `"${t}" is set by the app, not by hand.`;   // Superseded, Expired
    }
}

// A SEND-BACK (Jeff, 2 Oct — state §0.156): an approver returns a quote waiting for
// approval to the rep as a Draft, with a note saying what to change. It is the
// approver's "no" — Rejected / Lost is the customer's, and closes the quote. The
// rep's own Pending → Draft is a withdrawal and needs no note.
export const SEND_BACK_NOTE_MAX = 1000;
export function quoteSendBackRefusal({ from, role, note }) {
    if ((from || 'Draft') !== 'Pending Approval') return 'Only a quote waiting for approval is sent back.';
    if (!canApproveQuotes(role)) return 'Only an Admin or a Manager sends back a quote waiting for approval.';
    const n = String(note ?? '').trim();
    if (!n) return 'Say what to change — a send-back carries a note for the rep.';
    if (n.length > SEND_BACK_NOTE_MAX) return `Keep the note under ${SEND_BACK_NOTE_MAX} characters.`;
    return null;
}

// What a BUTTON may offer: a real move the rule allows. quoteTransitionRefusal lets
// a save keep its status (that is not a move, and the server must allow it), so on
// its own it would offer "Submit" on a quote already submitted and "Send" on one
// already sent — the pane caught exactly that (§0.155).
export const quoteMoveAllowed = (args) => (args?.from || 'Draft') !== args?.to && quoteTransitionRefusal(args) === null;

// What an EDIT does — `termsChanged`: any QUOTE_TERMS_FIELDS value differs from the
// stored row. A locked quote refuses, and a held one (waiting for approval); an
// approved one returns to Draft (the approval no longer matches what would be
// sent); anything else keeps its status.
export function quoteEditOutcome({ status, termsChanged }) {
    if (!termsChanged) return { status, refusal: null, approvalCleared: false };
    if (status === 'Accepted') return { status, refusal: 'An accepted quote is final — start a new version to change it.', approvalCleared: false };
    if (quoteIsLocked(status)) return { status, refusal: 'This quote was sent — its lines and terms are final. Start a new version to change them.', approvalCleared: false };
    if (quoteIsHeld(status)) return { status, refusal: 'This quote is waiting for approval — withdraw it to change it.', approvalCleared: false };
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
