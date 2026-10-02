// src/utils/approvalNotices.js — who is emailed about a quote's approval, and when
// (state §0.158 — Jeff, 2 Oct, each answer a). Pure, but for the quote link's two
// (they touch the tab's sessionStorage — below): quotes.mjs (a submission, an
// approval, a send-back) and quote-reminders.mjs (the SLA reminder) read it, App.jsx
// reads the link, and tests/approval-notices.test.mjs runs it.
//
//   1a  a quote waiting for approval tells the tier's named approver (by person),
//       everyone holding the role (by role), every Manager (an org that has not
//       chosen) — never the person who submitted it
//   2a  the approval notices are INSTANT — each person's own switch decides
//       whether, never when (the header menu offers no digest for them)
//   3a  a tier's SLA passed with no decision reminds the backup, and with no
//       backup the approver again — once per submission
//
// When the group a notice names cannot be reached — the person left, the role is
// empty, no one has an email — it falls to the next: the backup, then the org's
// Admins (who may always approve), so a quote never waits unseen.
import { canApproveQuotes, slaHours } from './quoteRules.js';

// The header menu's switches for these notices (AppHeader's DEFAULT_PREFS keys).
// 'quoteRejected' is the stored key for "Quote sent back" — a key, not a word.
export const APPROVAL_NOTICE_KEYS = Object.freeze({ waiting: 'quotePending', approved: 'quoteApproved', sentBack: 'quoteRejected' });

// A person's own switch — ON unless they turned it off (the menu's default).
export function wantsNotice(user, key) {
    const prefs = user?.profile?.notificationPrefs || user?.notificationPrefs || {};
    const p = prefs?.[key];
    return p ? p.enabled !== false : true;
}

// Someone a notice can reach: active, with an email that is not the roster's
// placeholder for an invite never accepted.
export const reachable = (u) => {
    const email = String(u?.email ?? '').trim();
    return !!u && u.active !== false && !!email && !email.endsWith('@placeholder.local');
};

const holders = (people, role) => people.filter(u => u.role === role);
const named   = (people, id) => people.filter(u => u.id === id && canApproveQuotes(u.role));
const approverGroup = (tier, people) => (
    tier?.approverUserId ? named(people, tier.approverUserId)
        : tier?.approverRole ? holders(people, tier.approverRole)
        : holders(people, 'Manager')   // an org that has not chosen: every Manager (1a)
);
const backupGroup = (tier, people) => (
    tier?.backupUserId ? named(people, tier.backupUserId)
        : tier?.backupRole ? holders(people, tier.backupRole)
        : []
);
const firstGroup = (groups) => groups.find(g => g.length) || [];

// Who is told a quote waits for approval (1a). `roster`: THIS org's users rows;
// `excludeId`: the submitter's app id — never told of their own submission.
export function waitingRecipients(tier, roster, { excludeId = null } = {}) {
    const people = (Array.isArray(roster) ? roster : []).filter(reachable).filter(u => u.id !== excludeId);
    return firstGroup([approverGroup(tier, people), backupGroup(tier, people), holders(people, 'Admin')]);
}

// Who is reminded when the tier's SLA passes with no decision (3a): the backup,
// else the approver(s) again, else the Admins.
export function reminderRecipients(tier, roster, { excludeId = null } = {}) {
    const people = (Array.isArray(roster) ? roster : []).filter(reachable).filter(u => u.id !== excludeId);
    return firstGroup([backupGroup(tier, people), approverGroup(tier, people), holders(people, 'Admin')]);
}

const ms = (at) => { if (at == null) return null; const t = new Date(at).getTime(); return Number.isFinite(t) ? t : null; };

// Is a reminder due? The quote still waits; its tier has an SLA; it was submitted
// (on the record) more than the SLA ago; and no reminder followed that submission.
// A quote submitted before the record began has nothing to time from — no reminder.
export function reminderDue({ status, submittedAt, remindedAt, sla, now = Date.now() }) {
    if (status !== 'Pending Approval') return false;
    const hours = slaHours(sla);
    const sub = ms(submittedAt);
    if (!hours || sub === null) return false;
    const rem = ms(remindedAt);
    if (rem !== null && rem >= sub) return false;
    return now - sub >= hours * 3600000;
}

// The quote's link in the app (App.jsx reads ?quote= and opens it in the Quotes tab).
export const quoteLink = (appUrl, quoteId) => `${String(appUrl || '').replace(/\/+$/, '')}/?quote=${encodeURIComponent(String(quoteId || ''))}`;

// The app's side of that link. Opened signed out, it meets Clerk's <SignIn />, which
// ends with a full page load of its after-sign-in URL — "/" here, as the app sets
// none — and that load drops ?quote= (read in the clerk-js 5.128 the app loads:
// RedirectUrls → navigate → window.location.href). So the id waits in the tab's
// sessionStorage until the signed-in app has used it: App.jsx takes it once on
// mount and drops it once the quotes are in. A link in the URL replaces a kept one;
// an id that could not be a quote's ('qt_<uuid>', a seed's 'q_qa_02') is kept by
// no one. Only an id waits, never a quote — whether anything opens is the server's
// list's to say. These two touch the store they are handed (the tab's by default).
export const QUOTE_LINK_KEY = 'accelerep.quoteLink';
const QUOTE_LINK_ID = /^[A-Za-z0-9_-]{1,80}$/;
const tabStore = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

export function dropQuoteLink(store = tabStore()) {
    try { store?.removeItem(QUOTE_LINK_KEY); } catch { /* storage unavailable */ }
}

export function takeQuoteLink(search, store = tabStore()) {
    let id = null;
    try { id = new URLSearchParams(typeof search === 'string' ? search : '').get('quote'); } catch { id = null; }
    if (id !== null) {
        if (!QUOTE_LINK_ID.test(id)) { dropQuoteLink(store); return null; }
        try { store?.setItem(QUOTE_LINK_KEY, id); } catch { /* storage unavailable */ }
        return id;
    }
    let kept = null;
    try { kept = store?.getItem(QUOTE_LINK_KEY) ?? null; } catch { kept = null; }
    return kept && QUOTE_LINK_ID.test(kept) ? kept : null;
}
