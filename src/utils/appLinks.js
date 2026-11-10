// appLinks.js — a link in a message to a member opens what the message is about (state §0.237; guide §18b120;
// docs/design/email-links — Jeff's Q1 "Whole class", Q2 "Switch, then open", Q3 "A notice", Q4 "Pipeline tab").
//
// Until §0.237 only one link into the app was read: an approval email's ?quote=. "View Deal →" (?deal=), "View
// All Tasks →" (?tab=tasks), "View Full Pipeline →" (?tab=reports) and every "Manage notification preferences"
// (/settings) opened Home; five deal emails, the deal texts and Slack's "View deal →" buttons carried their deal
// and linked the bare app; no link named the org its record lives in.
//
// Now every message builds its link here — `appLink(base, { kind, id, org })` → `<base>/?open=<kind>&id=<id>&org=
// <org>` — and the app reads it here (`readAppLink`, `takeAppLink`): once, surviving the sign-in screen's reload in
// the tab's sessionStorage, as the quote link has since §0.158. A link already in an inbox keeps working: ?deal=,
// ?quote=, ?tab=tasks and ?tab=reports are read as their kind.
//
// Pure: the server's senders, App.jsx and tests/app-links.test.mjs run the same rules.

// What a link can open. `id` is a record's (deal, task, quote); `tasks`, `pipeline` and `notifications` open a
// place (the Tasks tab, the Pipeline tab, the profile panel's Notifications tab).
export const APP_LINK_KINDS = Object.freeze(['deal', 'task', 'quote', 'tasks', 'pipeline', 'notifications']);
export const RECORD_KINDS = Object.freeze(['deal', 'task', 'quote']);

// An id or an org id as a link may carry one: letters, digits, '_' and '-' (a deal's 'id_<uuid>' or 'opp_qa_01', a
// task's, a quote's 'qt_<uuid>', an org's 'org_…'). Anything else is no link.
const LINK_ID = /^[A-Za-z0-9_-]{1,80}$/;
export const isLinkId = (v) => typeof v === 'string' && LINK_ID.test(v);

// The parameters a link may put in the address bar — removed once it is read (any other stays).
export const APP_LINK_PARAMS = Object.freeze(['open', 'id', 'org', 'deal', 'quote', 'tab']);

/**
 * The link a message puts in front of a member.
 * @param {string} base  the app's address (APP_URL, else the sender's own fallback)
 * @param {Object} what  { kind, id?, org? }
 */
export function appLink(base, { kind, id, org } = {}) {
    const root = String(base || '').replace(/\/+$/, '');
    if (!APP_LINK_KINDS.includes(kind)) return root || '/';
    if (RECORD_KINDS.includes(kind) && !isLinkId(id)) return root || '/';
    const q = new URLSearchParams({ open: kind });
    if (RECORD_KINDS.includes(kind)) q.set('id', id);
    if (isLinkId(org)) q.set('org', org);
    return `${root}/?${q.toString()}`;
}

/**
 * What an address bar's query asks the app to open — or null. The shapes older messages sent are read too.
 * @returns {{ kind: string, id: string|null, org: string|null } | null}
 */
export function readAppLink(search) {
    let q;
    try { q = new URLSearchParams(typeof search === 'string' ? search : ''); } catch { return null; }
    const org = isLinkId(q.get('org')) ? q.get('org') : null;
    const open = q.get('open');
    if (open !== null) {
        if (!APP_LINK_KINDS.includes(open)) return null;
        if (!RECORD_KINDS.includes(open)) return { kind: open, id: null, org };
        return isLinkId(q.get('id')) ? { kind: open, id: q.get('id'), org } : null;
    }
    // Older links, already in inboxes.
    if (q.get('deal') !== null) return isLinkId(q.get('deal')) ? { kind: 'deal', id: q.get('deal'), org } : null;
    if (q.get('quote') !== null) return isLinkId(q.get('quote')) ? { kind: 'quote', id: q.get('quote'), org } : null;
    if (q.get('tab') === 'tasks') return { kind: 'tasks', id: null, org };
    if (q.get('tab') === 'reports') return { kind: 'pipeline', id: null, org };   // the weekly summary's (Q4)
    return null;
}

// The link waits in the tab's sessionStorage across the sign-in screen, which ends with a full load of "/" and
// drops the query (state §0.158): taken once on mount, dropped once used. A link in the address bar replaces a
// kept one; a kept one that no longer reads as a link is no link. These touch the store they are handed.
export const APP_LINK_KEY = 'accelerep.appLink';
const tabStore = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

export function dropAppLink(store = tabStore()) {
    try { store?.removeItem(APP_LINK_KEY); } catch { /* storage unavailable */ }
}

export function takeAppLink(search, store = tabStore()) {
    const here = readAppLink(search);
    if (here) {
        try { store?.setItem(APP_LINK_KEY, JSON.stringify(here)); } catch { /* storage unavailable */ }
        return here;
    }
    // A link in the address bar that does not read — a bad id, a kind no one knows — opens nothing, and a kept
    // one goes with it (as the quote link's did, §0.158): the newest link the member followed decides.
    let named = false;
    try { const q = new URLSearchParams(typeof search === 'string' ? search : ''); named = q.has('open') || q.has('deal') || q.has('quote'); } catch { named = false; }
    if (named) { dropAppLink(store); return null; }
    let kept = null;
    try { kept = JSON.parse(store?.getItem(APP_LINK_KEY) ?? 'null'); } catch { kept = null; }
    if (!kept || typeof kept !== 'object' || !APP_LINK_KINDS.includes(kept.kind)) return null;
    if (RECORD_KINDS.includes(kept.kind) && !isLinkId(kept.id)) return null;
    return { kind: kept.kind, id: RECORD_KINDS.includes(kept.kind) ? kept.id : null, org: isLinkId(kept.org) ? kept.org : null };
}

// The address without a link's parameters — any other parameter stays.
export function withoutAppLink(href) {
    const u = new URL(href);
    for (const p of APP_LINK_PARAMS) u.searchParams.delete(p);
    return u.pathname + u.search;
}

// What a member is told when a link names what they cannot open (Q3).
export const APP_LINK_WORDS = Object.freeze({
    deal:    'That deal isn\'t available to you — it may have been deleted or reassigned.',
    task:    'That task isn\'t available to you — it may have been deleted or reassigned.',
    quote:   'That quote isn\'t available to you — it may have been deleted or reassigned.',
    org:     'That link is for an organization you\'re not a member of.',
});
