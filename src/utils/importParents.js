// src/utils/importParents.js
//
// The accounts CSV import's parents (state §0.199 — the review of batch 4). A sub-account's Parent Account is
// found by its name among the live accounts and the file's own top-level rows; one merged away is never a parent
// — a name only a merged-away account has names the account it was merged into (`survivorOf`, as a picker does
// since §0.198). The importer sends the file's top-level rows first and its sub-accounts once those have landed:
// a sub-account whose file parent did not save is sent with no parent — the receipt names the parents lost —
// never naming a row that is not there, which the server refuses for the whole request (a link names a live
// row of the org, §0.199). Which of two live accounts sharing a name is the parent is batch 3's (OPEN_ITEMS §4.7).

import { unarchived, survivorOf, isMergeArchived } from './pickLink.js';

const nameKey = (s) => String(s || '').toLowerCase();

// The parent a sub-account's Parent Account names: a live account of that name, else a top-level row of the
// file, else the account one merged away was merged into — or none.
export function importParentId(name, accounts, fileParents) {
    const key = nameKey(name);
    if (!key) return null;
    const all = Array.isArray(accounts) ? accounts : [];
    const live = unarchived(all).find((a) => nameKey(a.name) === key);
    if (live) return live.id;
    const own = (Array.isArray(fileParents) ? fileParents : []).find((p) => nameKey(p.name) === key);
    if (own) return own.id;
    const merged = all.find((a) => isMergeArchived(a) && nameKey(a.name) === key);
    const survivor = merged ? survivorOf(merged, all) : null;
    return survivor ? survivor.id : null;
}

// The import's two passes: the file's top-level rows (no parent), and its sub-accounts, each with the parent
// its Parent Account names, or none. makeId: a new row's id.
export function importPasses(newAccounts, accounts, makeId) {
    const rows = Array.isArray(newAccounts) ? newAccounts : [];
    const parents = rows.filter((a) => !a.parentAccount?.trim()).map((a) => {
        const { parentAccount: _drop, ...rest } = a;
        return { ...rest, id: makeId(), parentAccountId: null };
    });
    const subs = rows.filter((a) => a.parentAccount?.trim()).map((a) => {
        const { parentAccount: _drop, ...rest } = a;
        return { ...rest, id: makeId(), parentAccountId: importParentId(a.parentAccount, accounts, parents) };
    });
    return { parents, subs };
}

// The sub-accounts as sent once the file's parents have been: one whose parent is a row of the file that did not
// land names no parent.
export function subsAfterParents(subs, parents, landed) {
    const fileIds = new Set((Array.isArray(parents) ? parents : []).map((p) => p.id));
    const saved = new Set((Array.isArray(landed) ? landed : []).map((r) => r.id));
    return (Array.isArray(subs) ? subs : []).map((s) => (s.parentAccountId && fileIds.has(s.parentAccountId) && !saved.has(s.parentAccountId)
        ? { ...s, parentAccountId: null }
        : s));
}
