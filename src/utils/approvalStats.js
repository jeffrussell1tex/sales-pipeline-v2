// src/utils/approvalStats.js — what the quote approvals actually did, from the
// RECORD of it (state §0.156). Pure: the server's tier statistics (quotes.mjs,
// Settings → Approval tiers) and the Approvals tab's cards read the same arithmetic.
//
// The record is the audit log's quote events, which quotes.mjs writes as it moves a
// quote — a member cannot post one (audit-log.mjs refuses `quote.*`). Before this,
// the Approvals tab printed two fixed sub-labels ("0.7× baseline", "5% error bars
// for my role"), took an approval rate from the first five quotes in a status list,
// counted a quote SENT TO THE CUSTOMER as approved, and the tier statistics timed an
// approval from the row's last update (after it) and counted a status nothing sets.

export const APPROVAL_EVENT = Object.freeze({
    submitted: 'quote.submitted',   // → Pending Approval
    approved:  'quote.approved',    // Pending Approval → Approved, by an approver
    sentBack:  'quote.sentback',    // Pending Approval → Draft, by an approver, with a note
    withdrawn: 'quote.withdrawn',   // Pending Approval → Draft, by the deal's writer
});
export const APPROVAL_FLOW_ACTIONS = Object.freeze(Object.values(APPROVAL_EVENT));

// A send-back's audit detail ends with this mark and the approver's note — the one
// place a note older than the quote's latest send-back survives.
export const SENT_BACK_MARK = ' · sent back: ';
export const sendBackNoteOf = (detail) => {
    const d = String(detail ?? '');
    const i = d.indexOf(SENT_BACK_MARK);
    return i >= 0 ? d.slice(i + SENT_BACK_MARK.length) : null;
};

const ms = (at) => { const t = new Date(at).getTime(); return Number.isFinite(t) ? t : null; };

// Every decision, oldest first: { quoteId, kind: 'approved' | 'sentBack', at, by,
// note, hours }. `hours` runs from the submission that decision answered — the
// quote's latest submission before it — and is null when the record holds none (a
// submission older than the events read). A withdrawal ends a submission unanswered.
export function decisionsFrom(events) {
    const list = (Array.isArray(events) ? events : [])
        .filter(e => e && e.quoteId && ms(e.at) !== null)
        .slice()
        .sort((a, b) => ms(a.at) - ms(b.at));
    const openSince = new Map();   // quoteId → when its unanswered submission was made
    const out = [];
    for (const e of list) {
        const t = ms(e.at);
        if (e.action === APPROVAL_EVENT.submitted) { openSince.set(e.quoteId, t); continue; }
        if (e.action === APPROVAL_EVENT.withdrawn) { openSince.delete(e.quoteId); continue; }
        const kind = e.action === APPROVAL_EVENT.approved ? 'approved' : e.action === APPROVAL_EVENT.sentBack ? 'sentBack' : null;
        if (!kind) continue;
        const from = openSince.has(e.quoteId) ? openSince.get(e.quoteId) : null;
        openSince.delete(e.quoteId);
        out.push({
            quoteId: e.quoteId, kind, at: e.at, by: e.by || null,
            note: kind === 'sentBack' ? sendBackNoteOf(e.detail) : null,
            hours: from === null || t < from ? null : (t - from) / 3600000,
        });
    }
    return out;
}

// The decisions of the last `days` days: how many, how many approved, the approval
// rate (null with none — never 0%), the mean hours from submission to decision (null
// when none can be timed), and the decisions themselves, newest first.
//
// A window has a START and no end. The audit log's time is `timestamp without time
// zone`, which a machine off UTC reads as its local time — five hours LATE on a
// Chicago laptop — so a decision made in the last few hours reads as the future
// there, and an end at "now" dropped it (the integration suite caught it). Nothing
// is decided in the future; durations are unaffected (both ends read alike).
export function approvalSummary(events, { now = Date.now(), days = 30 } = {}) {
    const since = now - days * 86400000;
    const decisions = decisionsFrom(events).filter(d => ms(d.at) >= since);
    const approved = decisions.filter(d => d.kind === 'approved').length;
    const sentBack = decisions.length - approved;
    const timed = decisions.map(d => d.hours).filter(h => h !== null);
    return {
        days, total: decisions.length, approved, sentBack,
        rate: decisions.length ? Math.round((approved / decisions.length) * 100) : null,
        avgHours: timed.length ? timed.reduce((s, h) => s + h, 0) / timed.length : null,
        decisions: decisions.slice().reverse(),
    };
}

// "35m", "6h", "2.5d" — a duration a card can hold; "—" for none.
export function formatHours(h) {
    if (h === null || h === undefined || !Number.isFinite(Number(h))) return '—';
    const n = Number(h);
    if (n < 1) return `${Math.max(1, Math.round(n * 60))}m`;
    if (n < 48) return `${Math.round(n)}h`;
    const d = n / 24;
    return `${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)}d`;
}

// Settings → Approval tiers' panel: per tier, over the last `days` days — the quotes
// at that tier with a decision or a submission in the window, or waiting now; how many
// were approved and sent back; how many wait now; the mean hours to a decision. A
// quote's tier is the one the server stamped on its latest submission (approvalTier).
export function approvalTierStats(events, quotes, tiers, { now = Date.now(), days = 90 } = {}) {
    const since = now - days * 86400000;
    const tierOf = new Map((Array.isArray(quotes) ? quotes : []).map(q => [q.id, q.approvalTier || null]));
    const inWindow = (at) => { const t = ms(at); return t !== null && t >= since; };   // a start, no end (approvalSummary)
    const decisions = decisionsFrom(events).filter(d => inWindow(d.at));
    const touched = new Set([
        ...decisions.map(d => d.quoteId),
        ...(Array.isArray(events) ? events : []).filter(e => e?.action === APPROVAL_EVENT.submitted && inWindow(e.at)).map(e => e.quoteId),
    ]);
    return (Array.isArray(tiers) ? tiers : []).map(tier => {
        const label = tier?.label;
        const atTier = (id) => tierOf.get(id) === label;
        const mine = decisions.filter(d => atTier(d.quoteId));
        const pendingIds = (Array.isArray(quotes) ? quotes : []).filter(q => q.status === 'Pending Approval' && q.approvalTier === label).map(q => q.id);
        const timed = mine.map(d => d.hours).filter(h => h !== null);
        return {
            tier: label,
            quotes: new Set([...[...touched].filter(atTier), ...pendingIds]).size,
            approved: mine.filter(d => d.kind === 'approved').length,
            sentBack: mine.filter(d => d.kind === 'sentBack').length,
            pending: pendingIds.length,
            avgHours: timed.length ? Math.round(timed.reduce((s, h) => s + h, 0) / timed.length) : 0,
        };
    });
}
