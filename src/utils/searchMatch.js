// src/utils/searchMatch.js
//
// One way to search a list as it is typed (state §0.194; Jeff, 9 Oct: "Account search
// fix first"). The account picker drew the first eight names holding what was typed, in
// the order the server sends them — by name, capitals first — and said nothing of the
// rest: in an org with 55 "ineos" accounts, "Ineos Acetyls - Texas City" was the 55th,
// and "Ineos - Acetyls" matched nothing, its dash being after "Acetyls". Every search
// list under src that cuts asks this module what matches, in what order, and how many
// it holds back.
//
// - What matches: every word typed is in the text, in any case, accents and punctuation
//   ignored — "Ineos - Acetyls" finds "INEOS Acetyls".
// - In what order: a name that starts with what was typed (the whole name first: it is
//   the shortest), then one where every word typed starts a word, then anywhere in the
//   name, then a match that needed the text searched beside the name (a company, an
//   email, a parent account); within each, A–Z as searchKey reads it, then the list's
//   own order.
// - Nothing typed (or only punctuation): the list as it came, in its own order — a field
//   that offers its list on focus still does; a field that waits for typing checks
//   searchKey itself.
// - The cut is announced: { shown, more }, and every caller draws "N more — keep typing"
//   (tests/search-match.test.mjs parses every caller).
// - The account picker's rows (pickerRows): each unit and site names its parent; in the
//   deal window, which lists every account but sites, a site whose OWN name matches is
//   listed after the accounts and picks its parent (Jeff, 9 Oct: "List matching sites
//   below"); a site whose whole name is typed comes first (Jeff, 10 Oct: "First, above
//   the accounts").
//
// Pure, so a test can run it. Its one piece of state is each row's keys, kept with the
// row in a WeakMap (below): nothing here outlives the rows it was worked out from.

// How many rows a single list that scrolls draws. A grouped box (the header's search, five
// a group; Dispatch's customer field, six — Jeff's choice, 9 Oct) or a box that does not
// scroll (the quick log, the @mention: six) passes its own.
export const SEARCH_LIMIT = 50;

// A text as a search reads it: accents dropped, lower case, an apostrophe dropped
// (O'Brien and O’Brien read obrien), every other run of punctuation or space one space.
// Printable ASCII (most names) takes the short road to the same key: it has no accent to
// drop, and its only letters and digits are a–z and 0–9.
const PRINTABLE_ASCII = /^[ -~]*$/;
function keyOf(text) {
    if (PRINTABLE_ASCII.test(text)) return text.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    return text
        .normalize('NFD').replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

export function searchKey(text) {
    return keyOf(String(text ?? ''));
}

// Each row's keys are kept with the row. A list is searched again on every keystroke, and
// working every key out each time cost several times the old filter at 5,000 accounts
// (state §0.194). A WeakMap holds them, from a row to its texts' keys. Keys are kept only
// for a row that has been searched, at most ROW_TEXTS texts a row, and they go when the
// app drops the row (an org switch drops every row, and their keys with them); a row the
// app still holds keeps its keys, shown or not. A key is found by the text it was worked
// out from, so a row renamed in place is read by its new name: the cache never changes an
// answer. A list of texts (a type-ahead's names) has no row to keep them with: each key is
// worked out as it is read.
const ROW_KEYS = new WeakMap();
const ROW_TEXTS = 8;

// The keys kept for a row, as [text, key, text, key, …]; null for a text.
function keysOf(row) {
    if (row === null || typeof row !== 'object') return null;
    let pairs = ROW_KEYS.get(row);
    if (pairs === undefined) { pairs = []; ROW_KEYS.set(row, pairs); }
    return pairs;
}

// A text's key: the one kept for it, or worked out (and kept, for a row).
function keyIn(pairs, text) {
    const s = String(text ?? '');
    if (pairs === null) return keyOf(s);
    for (let i = 0; i < pairs.length; i += 2) if (pairs[i] === s) return pairs[i + 1];
    if (pairs.length >= 2 * ROW_TEXTS) pairs.length = 0;
    const key = keyOf(s);
    pairs.push(s, key);
    return key;
}

// How many texts a row keeps a key for (the test reads it: ROW_TEXTS at most).
export function keptTexts(row) {
    const pairs = row !== null && typeof row === 'object' ? ROW_KEYS.get(row) : undefined;
    return pairs ? pairs.length / 2 : 0;
}

// How well a name answers the words typed: lower is better, -1 no match. (starts: each
// word with a space before it — a word that starts a word is at the start or after one.)
function rankOf(key, typed, words, starts) {
    for (let j = 0; j < words.length; j++) if (!key.includes(words[j])) return -1;
    if (key.startsWith(typed)) return 0;
    for (let j = 0; j < words.length; j++) if (!key.startsWith(words[j]) && !key.includes(starts[j])) return 2;
    return 1;
}

// A name that does not hold every word typed, with the texts beside it: 3 when each word
// is in the name or in one of those texts (each read on its own, never joined), else -1.
function besideRank(pairs, key, words, texts) {
    if (!texts) return -1;
    for (let j = 0; j < words.length; j++) {
        if (key.includes(words[j])) continue;
        let found = false;
        for (let t = 0; t < texts.length && !found; t++) found = !!texts[t] && keyIn(pairs, texts[t]).includes(words[j]);
        if (!found) return -1;
    }
    return 3;
}

// Every item that matches, best first. text(item) is what its row is called; also(item),
// other texts searched with it (a company, an email, a parent), ranked below the name and
// read only for an item its name does not answer.
export function rankMatches(items, query, text = (x) => x, also = null) {
    const list = Array.isArray(items) ? items : [];
    const typed = searchKey(query);
    if (!typed) return list.slice();
    const words = typed.split(' ');
    const starts = words.map((w) => ' ' + w);
    const hits = [];
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const pairs = keysOf(item);
        const key = keyIn(pairs, text(item));
        let rank = rankOf(key, typed, words, starts);
        if (rank < 0 && also) rank = besideRank(pairs, key, words, also(item));
        if (rank >= 0) hits.push({ item, rank, key, i });
    }
    hits.sort((a, b) => a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i));
    return hits.map((h) => h.item);
}

// The first `limit` of a list, and how many more.
export function capMatches(list, limit = SEARCH_LIMIT) {
    const all = Array.isArray(list) ? list : [];
    return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

// What a search list draws: the best `limit` matches, and how many more.
export function matchSearch(items, query, { text, also, limit } = {}) {
    return capMatches(rankMatches(items, query, text, also), limit);
}

// The parent a record leads to in a picker that leaves the record out: the deal window
// keeps every account but sites (`keep`), and offers a site as a way to its parent — when
// the list holds that parent (byId) and keeps it. null for a record the picker keeps, a
// parent outside the list (a rep's scope), or a parent the picker leaves out too.
export function viaParent(record, byId, keep) {
    if (!record || !keep || keep(record)) return null;
    const parent = record.parentAccountId && byId ? byId.get(record.parentAccountId) : null;
    return parent && keep(parent) ? parent : null;
}

// The account picker's rows, as AccountPicker draws them: { shown: [{ account, parent,
// via }], more, exact, unlisted }.
// - keep: the accounts the host lists (the deal window: every tier but a site); none, every
//   account. A kept row is found by its own name, or — ranked below every row its name
//   answers — by its parent's, so "dow texas" finds a site named "Texas City Terminal"
//   under Dow; its row names that parent (Jeff, 9 Oct: "Yes, listed below own-name
//   matches").
// - viaParents: an account the host leaves out is listed AFTER every kept row (but for the
//   next point), and only when its OWN name matches what was typed (never by its parent's);
//   picking it picks its parent (via). Jeff, 9 Oct: "List matching sites below".
// - A row whose name reads as exactly what was typed is listed first, before the cut, in
//   both modes (in the rails it sorts first anyway): in the deal window a site typed in
//   full comes before the accounts and is not pushed past the cut by fifty kept rows that
//   also match (Jeff, 10 Oct: "First, above the accounts").
// - exact: an account of any tier whose name reads as what was typed — "Ineos - Acetyls"
//   is INEOS Acetyls, a site's name is taken too — so the picker offers no Create. Two
//   accounts can share a name (UKG's two "Shell - Port Allen" under Shell, a unit and a
//   site; the GET orders by name only): the one a drawn row offers is taken first.
// - unlisted: that account, when no row drawn has the name (in the deal window, a site
//   whose parent is not in the list — a rep's scope): the picker says what it is, rather
//   than drawing nothing.
// - byId: the host's map of its accounts by id, if it keeps one.
export function pickerRows(accounts, query, { keep = null, viaParents = true, limit = SEARCH_LIMIT, byId = null } = {}) {
    const all = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const ids = byId || new Map(all.map((a) => [a.id, a]));
    const parentOf = (a) => (a.parentAccountId && ids.get(a.parentAccountId)) || null;
    const typed = searchKey(query);
    const isTyped = (a) => typed !== '' && keyIn(keysOf(a), a.name) === typed;
    const kept = keep ? all.filter((a) => keep(a)) : all;
    const rows = rankMatches(kept, query, (a) => a.name, (a) => [parentOf(a)?.name])
        .map((a) => ({ account: a, parent: parentOf(a), via: null }));
    if (keep && viaParents && typed) {
        const left = all.filter((a) => !keep(a));
        for (const a of rankMatches(left, query, (x) => x.name)) {
            const via = viaParent(a, ids, keep);
            if (via) rows.push({ account: a, parent: via, via });
        }
    }
    const named = [];
    const rest = [];
    for (const r of rows) (isTyped(r.account) ? named : rest).push(r);
    const { shown, more } = capMatches(named.concat(rest), limit);
    const drawn = shown.find((r) => isTyped(r.account));
    const exact = drawn ? drawn.account : all.find(isTyped) || null;
    const unlisted = exact && !drawn ? exact : null;
    return { shown, more, exact, unlisted };
}
