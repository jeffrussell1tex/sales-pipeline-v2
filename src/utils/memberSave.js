// memberSave.js — what the member profile page (Settings → Users) sends (state §0.211 — Jeff, 15 Oct: "Send only
// what changed"; 16 Oct: "File it, own batch next"). Pure, so the rules run under node --test.
// The page edits seven fields of the member's flat row (users.mjs flatten: the profile's keys and the columns side
// by side). A save sends those that differ from the member as the page holds them — the row it opened on, then the
// row as stored after each save — and nothing else: never access, the status, the login or the pins (§0.202,
// §0.205), never a field it only shows (the email) or does not show. The server's merge keeps every key it stores
// that a save leaves out (users.mjs mergeForUpdate). The role is not one of them: user-role.mjs alone changes it.

// A team is two fields: its id (the link — guide §18b98 rule 1) and its name (text the digest, alerts and Reports
// read), always sent together.
export const PAGE_FIELDS = Object.freeze(['name', 'title', 'phone', 'team', 'teamId', 'manager', 'territory']);

// '', null and absent are one value: the server stores each as none (users.mjs sanitize, `|| null`).
const blank = (v) => v === null || v === undefined || v === '';
export const sameValue = (a, b) => (blank(a) && blank(b)) || a === b;

// The body of a save, less its id: each page field that differs from `first`, as the form holds it.
export function memberChanges(first, form) {
    const out = {};
    for (const k of PAGE_FIELDS) if (!sameValue(first?.[k], form?.[k])) out[k] = form[k] ?? null;
    // A Full name typed is the member's name (§0.196; Jeff: "Yes, Full name wins"): the server builds the name from
    // First and Last first, so they are cleared with it — always, for they may have been set since the page opened.
    if ('name' in out) { out.firstName = null; out.lastName = null; }
    // A team is its id and its name together: the server never pairs them.
    if ('team' in out || 'teamId' in out) { out.team = form.team ?? null; out.teamId = form.teamId ?? null; }
    return out;
}

// Whether the Role box names another role than the member's, by the users.role column — never `userType`, the
// profile's stale copy (§0.163). An unknown stored role, untouched, is no change.
export const roleChanged = (first, form) => !!form?.role && form.role !== (first?.role || 'User');

// The server's words as a clause the page's own sentence goes on from: without the full stop they end in — dbWrite's
// own words are whole sentences (storage.js) — so "— {words}. Save changes …" never reads "..".
export const clause = (words) => String(words ?? '').trim().replace(/\.+$/, '');

// The form once a save landed: the member as stored, but for a field typed while the save was out (it differs from
// what was sent) and the role when it did not land (keepRole) — those still wait for Save.
export function formAfterSave(current, sent, stored, keepRole) {
    const next = { ...stored };
    for (const k of PAGE_FIELDS) if (!sameValue(current?.[k], sent?.[k])) next[k] = current[k];
    if (keepRole || !sameValue(current?.role, sent?.role)) next.role = current?.role;
    return next;
}
