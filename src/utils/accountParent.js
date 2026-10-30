// src/utils/accountParent.js
//
// Which account another may stand under, and the tier each then has (state §0.198; Jeff,
// 11 Oct — D3: "No self, no loops, no sites"; D21: "Keep what fits", which supersedes the
// depth reading of D3, D17 and D18). One rule for the account rail's Parent list, its Save,
// the accounts hook and accounts.mjs, which refuses a bad parent too.
//
// - A parent is not the account itself, not one of its own sub-accounts or sites (a loop),
//   not a site, not an account merged into another (D12), and not one under which the
//   account's own branch cannot fit. A name more than one account has is refused for the
//   reason first in that order, whatever order the list holds them in.
// - The tiers rank account < business unit < site. A top-level account is an 'account'; a
//   sub-account's rank is above its parent's; nothing sits under a site.
// - An account KEEPS its tier wherever it still fits; only what no longer fits changes (D21).
//   When its parent changes it takes, in order, its stored tier if it fits, else the tier the
//   write asks for if it fits, else the lowest rank above the new parent: a site moved from
//   one account to another stays a site — whatever tier a screen loaded before another
//   session's move sends — and an account moved under an account becomes a business unit. A
//   tier fits where it is above the parent's AND leaves room under it for the account's own
//   branch. Then every account under it keeps its tier where that still fits under its
//   (perhaps re-tiered) parent, else takes the lowest rank that does; a move that would put
//   any of them below a site is refused. A cleared parent makes it an 'account', and so does
//   a delete's lift of its sub-accounts (D18); the accounts under them keep what fits. A row
//   stored before the rule keeps its tier until its parent changes — 13 of UKG's
//   tier-'account' rows stand under an account — and is re-fitted then.
// - A delete's Undo puts each account it deleted or promoted back EXACTLY as stored (D21:
//   "Undo puts the stored tiers back") — its parent and its tier, legacy shapes included
//   (restorePlace) — checked only that the tier is one the rule knows, that the parent is a
//   live account of the org, no site, under which no loop forms (its whole chain walked), and
//   that no account under it would not rank below it (one added since the delete: a business
//   unit under a business unit, anything under a site). accounts.mjs honours the mark for an
//   Admin alone (only an Admin deletes), and on a PUT only for a top-level row the body names a
//   parent for — one that has a parent now, moved by another session since the delete, is
//   refused (movedSinceDelete), never run as a move; it moves no deal. What a delete re-fitted
//   deeper down (liftedBelow: legacy rows alone) is not put back, nor a row's created date, its
//   merge mark or its last-edited time.
// - A move that makes an account a site (sitesMade) hands the deals on it — by id; by name only
//   where no other account has the name — up to the account it then stands under, Site Name
//   the site (D22: "Move them up") — accounts.mjs.
// - A walk up a chain stops at a loop already in the data, and after PARENT_WALK steps — but
//   a restore's loop check, which walks the whole chain; a walk down a branch visits each
//   account once.
//
// Pure — no React, no DOM; it imports only ./pickLink.js. The rail hands it its own list (a
// rep's list may not hold every account under one it holds); the server hands it its own
// org's rows.
import { isMergeArchived, parentLabel, resolveLink } from './pickLink.js';

export const PARENT_WALK = 16;

// The tiers, lowest rank first. Nothing is deeper than a site.
const TIERS = ['account', 'business_unit', 'site'];
const SITE = TIERS.length - 1;

// A tier's rank — account 0, business unit 1, site 2 — or null for one the rule does not know.
export function rankOf(tier) {
    const rank = TIERS.indexOf(tier);
    return rank < 0 ? null : rank;
}

// A parent's rank: its tier's; a row stored with no tier the rule knows reads as an account,
// the column's default.
const parentRankOf = (parent) => rankOf(parent?.accountTier) ?? 0;

// Whether the account `ancestorId` stands above `id`.
export function isUnder(id, ancestorId, byId) {
    const seen = new Set();
    let row = byId ? byId.get(id) : null;
    for (let n = 0; row && row.parentAccountId && !seen.has(row.id) && n < PARENT_WALK; n++) {
        if (row.parentAccountId === ancestorId) return true;
        seen.add(row.id);
        row = byId.get(row.parentAccountId);
    }
    return false;
}

// Whether the account `ancestorId` stands anywhere above `id` — its whole chain walked, each
// account once (a loop already in the data ends it), with no PARENT_WALK cap: a restore's loop
// check. A restore skips the depth rule, so a chain it builds can run longer than any move
// allows, and a loop closed past the cap was taken (the server critic, 12 Oct: a chain of 18
// accounts, its first put back under its last).
function standsUnder(id, ancestorId, byId) {
    const seen = new Set();
    for (let row = byId.get(id); row && row.parentAccountId && !seen.has(row.id); row = byId.get(row.parentAccountId)) {
        if (row.parentAccountId === ancestorId) return true;
        seen.add(row.id);
    }
    return false;
}

const rowsOf = (accounts) => (Array.isArray(accounts) ? accounts.filter((a) => a && a.id) : []);

// The accounts in a list, by parent id.
function childrenOf(list) {
    const kids = new Map();
    for (const a of list) {
        if (!a.parentAccountId) continue;
        if (!kids.has(a.parentAccountId)) kids.set(a.parentAccountId, []);
        kids.get(a.parentAccountId).push(a);
    }
    return kids;
}

// `rootId` and every account under it, in walk order, each once: [{ id, below, kids }] —
// below, how many levels under rootId; kids, the ids walked from it. `seen` holds the ids
// not to visit (rootId among them): a loop already in the data ends the walk.
function branchOf(rootId, kids, seen) {
    const out = [];
    let level = [rootId];
    for (let below = 0; level.length; below++) {
        const next = [];
        for (const id of level) {
            const node = { id, below, kids: [] };
            out.push(node);
            for (const c of kids.get(id) || []) {
                if (seen.has(c.id)) continue;
                seen.add(c.id);
                node.kids.push(c.id);
                next.push(c.id);
            }
        }
        level = next;
    }
    return out;
}

// How many levels of accounts stand under each account of a walked branch: Map(id → levels).
function heightsOf(branch) {
    const height = new Map();
    for (let i = branch.length - 1; i >= 0; i--) {
        const { id, kids } = branch[i];
        height.set(id, kids.reduce((h, k) => Math.max(h, height.get(k) + 1), 0));
    }
    return height;
}

// How many levels of accounts stand under `id` in byId (a Map of id → account): the room its
// own branch needs below it, wherever it goes. None for a new account.
export function heightUnder(id, byId) {
    if (!id || !byId) return 0;
    return heightsOf(branchOf(id, childrenOf(rowsOf([...byId.values()])), new Set([id]))).get(id);
}

// The rank an account takes under a parent of rank `parentRank` (-1: none, the top level)
// with `height` levels of accounts under it: the first tier of `wanted` that fits — above the
// parent, with room under it for its own levels — else the lowest rank above the parent if
// that leaves the room; null when nothing does. At the top level, an account.
function fitRank(wanted, parentRank, height) {
    if (parentRank < 0) return height <= SITE ? 0 : null;
    for (const tier of wanted) {
        const rank = rankOf(tier);
        if (rank !== null && rank > parentRank && rank + height <= SITE) return rank;
    }
    return parentRank + 1 + height <= SITE ? parentRank + 1 : null;
}

// The tiers of a walked branch whose top takes rank `top`: each account under it keeps its
// stored tier where that still fits under its parent, else takes the lowest rank that does —
// never deeper than a site (only a delete meets a branch too deep for that: it is never
// refused). Map(id → tier).
function refit(branch, byId, height, top) {
    const rank = new Map([[branch[0].id, top]]);
    for (const { id, kids } of branch) {
        for (const k of kids) {
            const fit = fitRank([byId.get(k)?.accountTier], rank.get(id), height.get(k));
            rank.set(k, fit === null ? Math.min(rank.get(id) + 1, SITE) : fit);
        }
    }
    return new Map([...rank].map(([id, r]) => [id, TIERS[r]]));
}

// Why `candidate` may not be the parent of the account `selfId` (null: a new account) —
// 'missing'; then, in this order, 'self', 'descendant', 'site', 'archived', 'below-site' (its
// own branch would sit below a site) — or null when it may. height: how many levels of
// accounts stand under selfId (heightUnder), which move with it.
export function parentProblem(candidate, selfId, byId, height = heightUnder(selfId, byId)) {
    if (!candidate) return 'missing';
    if (selfId && candidate.id === selfId) return 'self';
    if (selfId && isUnder(candidate.id, selfId, byId)) return 'descendant';
    if (candidate.accountTier === 'site') return 'site';
    if (isMergeArchived(candidate)) return 'archived';
    if (parentRankOf(candidate) + 1 + height > SITE) return 'below-site';
    return null;
}

// The ids of the accounts in `accounts` that `selfId` may stand under: the Parent list.
export function parentChoices(accounts, selfId, byId) {
    const ids = new Set();
    const height = heightUnder(selfId, byId);
    for (const a of Array.isArray(accounts) ? accounts : []) {
        if (a && a.id && !parentProblem(a, selfId, byId, height)) ids.add(a.id);
    }
    return ids;
}

// The tier of a new account under `parentId` that asks for none: the lowest rank above its
// parent's — a business unit under an account, a site under a business unit; none, an
// account. A parent the list does not hold reads as an account (accounts.mjs decides again
// from the org's rows).
export function tierUnder(parentId, byId) {
    if (!parentId) return TIERS[0];
    return TIERS[Math.min(parentRankOf(byId ? byId.get(parentId) : null) + 1, SITE)];
}

// An account moved under `newParentId` (none: to the top level), and every account under it,
// placed by the rule above (D21). wanted: the tier the write asks for, tried AFTER the stored
// one — a stale screen's tier never re-tiers an account whose own still fits; it counts only
// where the stored one no longer does. { tiers: Map(id → tier) } for the moved account and
// each one under it; or { problem: 'below-site', names } — the names of those that would sit
// below a site — and the move is refused (parentRefusal). It does not judge the parent
// itself: parentProblem does, first.
export function branchTiers(accounts, movedId, newParentId, wanted = null) {
    const list = rowsOf(accounts);
    const byId = new Map(list.map((a) => [a.id, a]));
    const branch = branchOf(movedId, childrenOf(list), new Set([movedId]));
    const height = heightsOf(branch);
    const parentRank = newParentId ? parentRankOf(byId.get(newParentId)) : -1;
    const top = fitRank([byId.get(movedId)?.accountTier, wanted], parentRank, height.get(movedId));
    if (top === null) {
        return { problem: 'below-site', names: branch.filter((n) => parentRank + 1 + n.below > SITE).map((n) => byId.get(n.id)?.name || '') };
    }
    return { tiers: refit(branch, byId, height, top) };
}

// D18 and D21: a deleted account's sub-accounts go to the top level (accounts.mjs) — a
// parent cleared for each: it becomes an 'account', and the accounts under it keep their
// tiers where they still fit (lifted, they do, but for a row stored before the rule). A
// delete is never refused: an account deeper than a site (a fourth level stored before the
// rule) is a site. Map(id → tier) for each account lifted and every one under it; the
// delete's Undo puts each lifted account back under its parent exactly as stored
// (restorePlace).
export function promotedTiers(accounts, deletedId) {
    const list = rowsOf(accounts);
    const byId = new Map(list.map((a) => [a.id, a]));
    const kids = childrenOf(list);
    const seen = new Set([deletedId]);
    const tiers = new Map();
    for (const child of kids.get(deletedId) || []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        const branch = branchOf(child.id, kids, seen);
        for (const [id, tier] of refit(branch, byId, heightsOf(branch), 0)) tiers.set(id, tier);
    }
    return tiers;
}

// The accounts below a deleted account's lifted sub-accounts whose tier the lift changes (D18,
// D21) — only a row stored before the rule can need one (lifted, every conforming row still
// fits) — each with the chain it stands on as read: [its parent, …, the lifted sub-account, the
// deleted account]. accounts.mjs writes each one's tier only while that chain still stands, in
// the delete's own batch, so a delete another session made first — which lifted them itself —
// writes nothing (state §0.198; the critics, 12 Oct). [{ id, accountTier, chain }], in the
// walk's order. A delete's Undo does not put these back: it re-sends only the rows the delete
// took and the sub-accounts it promoted (OPEN_ITEMS §4.2).
export function liftedBelow(accounts, deletedId) {
    const list = rowsOf(accounts);
    const byId = new Map(list.map((a) => [a.id, a]));
    const out = [];
    for (const [id, tier] of promotedTiers(list, deletedId)) {
        const row = byId.get(id);
        if (!row || row.parentAccountId === deletedId || row.accountTier === tier) continue;
        const chain = [];
        for (let up = row.parentAccountId; up && !chain.includes(up); up = byId.get(up)?.parentAccountId) {
            chain.push(up);
            if (up === deletedId) break;
        }
        if (chain[chain.length - 1] === deletedId) out.push({ id, accountTier: tier, chain });
    }
    return out;
}

// Where a write puts an account — accounts.mjs's answer, from its org's own rows (state
// §0.198; D3, D21). The parent checked by the rule above, and the tiers that follow.
//   rows      the org's accounts (id, name, parentAccountId, accountTier, mergeArchived).
//   selfId    the account written; a new one too (a row already naming it as its parent
//             stands under it, so it is no parent of it).
//   parentId  the parent the write names; none: the top level.
//   tier      the tier the write asks for: a create's, kept where it fits; a move's, tried
//             after the stored one.
//   branch    a stored account moved: its stored tier is tried first, and every account under
//             it is re-fitted (D21).
// { tiers: Map(id → tier) } — a create's its own alone: the tier asked where it fits under the
// parent, else the lowest rank above it; at the top level an account — or { status, error }:
// 404 for a parent the org does not hold — another org's id reads as none, so nothing leaks
// — and 400 with parentRefusal's words for one it may not stand under, or for a move that
// would put any account of the branch below a site.
export function placeAccount(rows, { selfId = null, selfName = '', parentId = null, tier = null, branch = false } = {}) {
    const list = rowsOf(rows);
    const byId = new Map(list.map((a) => [a.id, a]));
    if (parentId) {
        const parent = byId.get(parentId) || null;
        const problem = parentProblem(parent, selfId, byId, branch ? heightUnder(selfId, byId) : 0);
        if (problem) return { status: problem === 'missing' ? 404 : 400, error: parentRefusal(problem, parent?.name, selfName) };
    }
    if (!branch) return { tiers: new Map([[selfId, TIERS[fitRank([tier], parentId ? parentRankOf(byId.get(parentId)) : -1, 0)]]]) };
    const moved = branchTiers(list, selfId, parentId, tier);
    if (moved.problem) return { status: 400, error: parentRefusal('below-site', null, selfName) };
    return { tiers: moved.tiers };
}

// A bulk create's rows placed by the single save's rule (state §0.215 — batch 3a; guide §18b105): each new row's
// parent checked by placeAccount over the org's accounts AND the batch's own new rows as they will stand, parents
// first (parentsFirst), so a row may stand under another row of the batch at any depth — never under a site, never
// itself, never a row under it (two rows naming each other) — and each takes the tier placeAccount gives it: the
// tier it asks for where that fits under its parent, else the lowest above it; at the top level, an account. A CSV
// sent every sub-account as a business unit, under a unit or a site alike (docs/design/links-batch-3, I2).
//   orgRows  the org's accounts (id, name, parentAccountId, accountTier, mergeArchived).
//   rows     the batch as sent (id, name, parentAccountId, accountTier).
//   newIds   the batch's ids no row of the org holds — the rows whose inserts will land; a row of an id the org
//            holds is placed as stored (its insert writes nothing).
// { tiers: Map(id → tier) } for each new row, or { status, error, ids } — the first refusal's status and words
// (parentRefusal), and the id of every row refused: the whole request is refused, as checkBulkLinks refuses it.
export function placeBulkRows(orgRows, rows, newIds) {
    const own = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id && newIds && newIds.has(r.id));
    // One row of an id is placed, so an id twice is refused: the other could land unplaced (the review of 3a).
    const twice = [...new Set(own.map((r) => r.id).filter((id, k, all) => all.indexOf(id) !== k))];
    if (twice.length) return { status: 400, error: 'A row id is sent twice in one batch.', ids: twice };
    const list = new Map(rowsOf(orgRows).map((a) => [a.id, a]));
    for (const r of own) list.set(r.id, { id: r.id, name: r.name || '', parentAccountId: r.parentAccountId || null, accountTier: null, mergeArchived: false });
    const tiers = new Map();
    const refused = [];
    for (const r of parentsFirst(own)) {
        const placed = placeAccount([...list.values()], { selfId: r.id, selfName: r.name || '', parentId: r.parentAccountId || null, tier: r.accountTier || null });
        if (placed.error) { refused.push({ id: r.id, status: placed.status, error: placed.error }); continue; }
        const tier = placed.tiers.get(r.id);
        tiers.set(r.id, tier);
        list.set(r.id, { ...list.get(r.id), accountTier: tier });
    }
    if (refused.length) return { status: refused[0].status, error: refused[0].error, ids: refused.map((x) => x.id) };
    return { tiers };
}

// What a restore says of a tier the rule does not know: none is stored (SELECT 12 Oct, all 829
// accounts: account, business unit or site), so only a forged request meets it.
export const UNKNOWN_TIER = 'That is not an account tier — an account, a business unit or a site.';

// A delete's Undo (state §0.198; D21: "Undo puts the stored tiers back", read as a restore):
// the account written with the parent and tier it was stored with, EXACTLY — a tier-'account'
// row under an account, a business unit at the top, a site straight under an account, as
// stored before the rule or since. Checked that the tier is one the rule knows (400), and that
// the parent, if it names one, is a live account of the org (rows: the org's own — another
// org's id reads as none, 404) that is not a site — no account stands under one (SELECT 12
// Oct: none of 829), so no Undo needs it — and under which no loop forms: not itself, not one
// of its own sub-accounts, its whole chain walked (standsUnder). Nor is it put back over an
// account under it that would not rank below it (rows: every account of the org, read whatever
// the parent; a tier the rule does not know reads as an account): a lifted account can gain a
// sub-account before its Undo — a business unit, which would stand under a business unit put
// back, or anything, under a site put back — and D21 has a sub-account rank above its parent
// (the critics, 12 Oct: a business unit was put back over a business unit added since) —
// refused (overRefusal; a site in a move's words). The legacy shapes the Undo restores keep what
// ranks above them: a business unit over its sites, a tier-'account' row over its units and
// sites; a row stored before the rule under it that does not (a unit under a unit) refuses it
// too — none in today's data (SELECT 12 Oct, all 829 accounts: the 13 that do not rank above
// their parent each stand straight under a top-level account, so no delete lifts one's parent).
// Nothing under it is re-fitted. accounts.mjs asks it for an Admin's marked write alone (only an
// Admin deletes). { tiers: Map(id → tier) } — placeAccount's answer — or { status, error } in
// parentRefusal's words.
export function restorePlace(rows, { selfId = null, selfName = '', parentId = null, tier = null } = {}) {
    if (rankOf(tier) === null) return { status: 400, error: UNKNOWN_TIER };
    if (parentId) {
        const byId = new Map(rowsOf(rows).map((a) => [a.id, a]));
        const parent = byId.get(parentId) || null;
        if (!parent) return { status: 404, error: parentRefusal('missing') };
        if (selfId && parent.id === selfId) return { status: 400, error: parentRefusal('self') };
        if (selfId && standsUnder(parent.id, selfId, byId)) return { status: 400, error: parentRefusal('descendant', parent.name, selfName) };
        if (parent.accountTier === 'site') return { status: 400, error: parentRefusal('site', parent.name) };
        if (isMergeArchived(parent)) return { status: 400, error: parentRefusal('archived', parent.name) };
    }
    if (selfId && rowsOf(rows).some((a) => a.parentAccountId === selfId && a.id !== selfId && (rankOf(a.accountTier) ?? 0) <= rankOf(tier))) return { status: 400, error: overRefusal(tier, selfName) };
    return { tiers: new Map([[selfId, tier]]) };
}

// What a restore says when an account under the one it puts back would not rank below it: under
// a site, a move's words (it would sit below a site); under a business unit or an account, which
// tier it can't stand under.
const TIER_WORDS = { account: 'an account', business_unit: 'a business unit', site: 'a site' };
function overRefusal(tier, selfName) {
    if (tier === 'site') return parentRefusal('below-site', null, selfName);
    return `${quoted(selfName) || 'This account'} has an account under it that can't stand under ${TIER_WORDS[tier]} — it can't be put back as one.`;
}

// What accounts.mjs says of an Admin's marked PUT — a delete's Undo re-saving a sub-account it
// lifted — for a row that has a parent now: a delete lifts what it promotes to the top level, so
// another session moved it since. Refused (409), never run as a move over that session's (the
// behaviour critic, 12 Oct: as a move it could move every deal of the row up, D22).
export function movedSinceDelete(selfName) {
    return `${quoted(selfName) || 'This account'} was moved since the delete — not put back.`;
}

// D22 (Jeff, 11 Oct: "Move them up"): the accounts a move makes sites — the moved account, or
// one under it, whose stored tier was not 'site' and whose tier in `tiers` is — each with the
// account it then stands under. accounts.mjs moves up the deals a move would leave on such a
// site — by id; by name only where no other account has the name (alone, below) — to that
// account, under its name, Site Name the site, in the same write. selfId,
// selfName, parentId: the account moved, its name as saved, its new parent (the others keep
// theirs). [{ id, name, storedName, alone, parentId, parentName }] in the list's order: name,
// the site's as saved; storedName, the one a deal saved by name alone carries; alone, no other
// row of the list has that stored name — a deal with no id is the site's by name only then
// (UKG's "Shell - Port Allen" twins: neither's by name).
export function sitesMade(accounts, tiers, { selfId = null, selfName = '', parentId = null } = {}) {
    if (!tiers) return [];
    const list = rowsOf(accounts);
    const byId = new Map(list.map((a) => [a.id, a]));
    const nameOf = (id) => (id === selfId && selfName ? selfName : byId.get(id)?.name || '');
    return list
        .filter((a) => tiers.get(a.id) === 'site' && a.accountTier !== 'site')
        .map((a) => {
            const up = (a.id === selfId ? parentId : a.parentAccountId) || null;
            const storedName = a.name || '';
            return { id: a.id, name: nameOf(a.id), storedName, alone: !list.some((b) => b.id !== a.id && (b.name || '') === storedName), parentId: up, parentName: up ? nameOf(up) : '' };
        })
        .filter((s) => s.parentId);
}

// The accounts whose stored tier `tiers` changes, as [{ id, accountTier }] in the list's
// order, `exceptId` left out (the account a write saves with its own row): what accounts.mjs
// writes after a move or a delete, and hands back for the screen.
export function tierChanges(accounts, tiers, exceptId = null) {
    if (!tiers) return [];
    return rowsOf(accounts)
        .filter((a) => a.id !== exceptId && tiers.has(a.id) && tiers.get(a.id) !== a.accountTier)
        .map((a) => ({ id: a.id, accountTier: tiers.get(a.id) }));
}

// The list with the tiers the server answered ([{ id, accountTier }]): the accounts under a
// moved one (D17), those a delete lifted, and those its Undo put back (D18). The same list
// when the answer holds none.
export function withTiers(accounts, changes) {
    const list = Array.isArray(accounts) ? accounts : [];
    const tierOf = new Map((Array.isArray(changes) ? changes : []).filter((c) => c && c.id && c.accountTier).map((c) => [c.id, c.accountTier]));
    if (!tierOf.size) return list;
    return list.map((a) => (a && tierOf.has(a.id) && tierOf.get(a.id) !== a.accountTier ? { ...a, accountTier: tierOf.get(a.id) } : a));
}

// The list with each row the server answered put in whole ([{ id, … }]): the accounts a delete's
// Undo posted back, as the server wrote them — so an owner id the restore dropped (no member of
// the org now) shows dropped, with no owner name, at once, not after a reload (the behaviour
// critic, 12 Oct: the screen kept the delete's copy of the row). The same list when the answer
// holds none.
export function withRows(accounts, rows) {
    const list = Array.isArray(accounts) ? accounts : [];
    const rowOf = new Map((Array.isArray(rows) ? rows : []).filter((r) => r && r.id).map((r) => [r.id, r]));
    return rowOf.size ? list.map((a) => (a && rowOf.has(a.id) ? rowOf.get(a.id) : a)) : list;
}

// The accounts with each one's parent before it, where the list holds the parent: the order a
// delete's Undo posts several back in, since accounts.mjs now checks that a parent exists —
// the Accounts tab deletes in name order, a sub-account named before its parent among them.
// A loop already in the data is cut where it closes; every account is kept, once.
export function parentsFirst(accounts) {
    const list = rowsOf(accounts);
    const byId = new Map(list.map((a) => [a.id, a]));
    const out = [];
    const placed = new Set();
    const visit = (a, path) => {
        if (placed.has(a.id) || path.has(a.id)) return;
        path.add(a.id);
        const parent = a.parentAccountId ? byId.get(a.parentAccountId) : null;
        if (parent) visit(parent, path);
        placed.add(a.id);
        out.push(a);
    };
    for (const a of list) visit(a, new Set());
    return out;
}

// What a delete's Undo re-sends (state §0.198; the server critic, 12 Oct: it re-sent the
// screen's copies, so a screen loaded before another session's move put back an account the
// delete never touched, with a stale tier): the server's answers to one go's deletes, in order
// ([{ deleted, children }] — the row as stored, and each sub-account it promoted as stored
// before the write: { id, parentAccountId, accountTier }). { deleted, promoted }: each row
// deleted, as stored — or, where an earlier delete of this go lifted it, with the parent and the
// tier it had before; and each sub-account promoted, as it stood before this go ({ id, parentId,
// tier }: the first answer that names it), but one deleted too, which is posted back.
export function undoOfDeletes(answers) {
    const before = new Map();
    const gone = [];
    for (const r of Array.isArray(answers) ? answers : []) {
        if (r && r.deleted) gone.push(r.deleted);
        for (const c of (r && r.children) || []) {
            if (c && c.id && !before.has(c.id)) before.set(c.id, { id: c.id, parentId: c.parentAccountId || null, tier: c.accountTier || null });
        }
    }
    const deleted = gone.map((row) => (before.has(row.id) ? { ...row, parentAccountId: before.get(row.id).parentId, accountTier: before.get(row.id).tier || row.accountTier } : row));
    const ids = new Set(deleted.map((a) => a.id));
    return { deleted, promoted: [...before.values()].filter((c) => !ids.has(c.id)) };
}

// A name in quotes, or null for none.
const quoted = (name) => {
    const s = String(name ?? '').trim();
    return s ? `“${s}”` : null;
};

// What the rail and the server say of a parent they refuse, by why: parentProblem's answer,
// or branchTiers' 'below-site' (selfName: the account being moved).
export function parentRefusal(problem, parentName, selfName) {
    const parent = quoted(parentName) || 'That account';
    switch (problem) {
        case 'missing': return 'Parent account not found.';
        case 'self': return "An account can't be its own parent.";
        case 'archived': return `${parent} was merged into another account — pick the account it was merged into.`;
        case 'descendant': return `${parent} is under ${quoted(selfName) || 'this account'} — an account can't be moved under one of its own sub-accounts or sites.`;
        case 'site': return `${parent} is a site — a site can't have accounts under it. Pick the account or business unit it belongs to.`;
        case 'below-site': return `${quoted(selfName) || 'This account'} has accounts under it that would sit below a site — it can't go there.`;
        default: return null;
    }
}

// The parent's label beside a name, in the account picker's words (pickLink.js
// parentLabel): " · unit of Shell", " · site of Shell", " · in Shell"; '' when byId holds
// no parent.
export function parentNote(account, byId) {
    const parent = account && account.parentAccountId && byId ? byId.get(account.parentAccountId) : null;
    const label = parentLabel(account, parent);
    return label ? ` · ${label}` : '';
}

// The order a refusal is told in when a name is more than one account's (UKG's twins: editing
// the unit, "Shell - Port Allen" is itself AND a site) — the same reason whatever order the
// list holds them in.
const REASONS = ['self', 'descendant', 'site', 'archived', 'below-site'];

// Of `matches`, the reason first in REASONS order, in parentRefusal's words; null for none.
function firstReason(matches, selfId, byId, selfName, height) {
    let best = null;
    for (const m of matches) {
        const problem = parentProblem(m, selfId, byId, height);
        const at = REASONS.indexOf(problem);
        if (at >= 0 && (!best || at < best.at)) best = { at, m, problem };
    }
    return best ? parentRefusal(best.problem, best.m.name, selfName) : null;
}

// A name typed in the Parent field that only accounts this one may not stand under answer
// (as resolveLink reads a typed name): why — the reason first in REASONS order — rather than
// that no account has the name. null otherwise (no account of the name, or one it may stand
// under). The Parent Save's 'ineligible' refusal says this.
export function typedParentRefusal(text, accounts, selfId, byId, selfName) {
    const height = heightUnder(selfId, byId);
    const found = resolveLink({ text, records: accounts, eligible: (a) => !parentProblem(a, selfId, byId, height) });
    if (found.refusal !== 'ineligible') return null;
    return firstReason(found.matches, selfId, byId, selfName, height);
}

// The line the Parent list draws for a name it leaves out (AccountPicker's leftOut, handed
// the first account of the name in the list's order): the Save's reason — over every account
// of that name, first in REASONS order — so twins in either order read the same.
export function parentLeftOut(account, accounts, selfId, byId, selfName) {
    return typedParentRefusal(account?.name, accounts, selfId, byId, selfName)
        || parentRefusal(parentProblem(account, selfId, byId), account?.name, selfName);
}
