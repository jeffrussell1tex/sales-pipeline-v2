// src/utils/importParents.js
//
// The accounts CSV import's sending, by depth (state §0.199; §0.215 — batch 3a). Which account a sub-account's
// Parent Account names is decided at Preview, one record or a refusal (src/utils/importLinks.js
// planAccountImport); here the rows it kept are sent parents first: the file's top-level rows, then the rows under
// them, then the rows under those — any depth (Account > Unit > Site). A row whose parent is a row of the file
// that did not save is sent with no parent — the receipt names the parents lost — never naming a row that is not
// there, which the server refuses for the whole request (a link names a live row of the org, §0.199).

// The rows planAccountImport kept as new (each with `_ref` and `_parent`), as the levels the import sends:
// [[top-level rows], [rows under them], …], each row with its new id and the parent it names — an account's id,
// or a row of the file's new id — and none of the plan's own keys or the Parent Account column. makeId: a new
// row's id, taken in the file's order.
export function importLevels(rows, makeId) {
    const list = Array.isArray(rows) ? rows : [];
    const idOf = new Map(list.map((r) => [r._ref, makeId()]));
    const byRef = new Map(list.map((r) => [r._ref, r]));
    const depth = new Map();
    const depthOf = (r, seen = new Set()) => {
        if (depth.has(r._ref)) return depth.get(r._ref);
        const up = r._parent && r._parent.ref !== undefined ? byRef.get(r._parent.ref) : null;
        const d = up && !seen.has(r._ref) ? depthOf(up, new Set([...seen, r._ref])) + 1 : 0;
        depth.set(r._ref, d);
        return d;
    };
    const levels = [];
    for (const r of list) {
        const { parentAccount: _drop, _ref, _parent, _tier, ...rest } = r;
        const parentAccountId = !_parent ? null : _parent.id !== undefined ? _parent.id : idOf.get(_parent.ref) ?? null;
        const d = depthOf(r);
        (levels[d] = levels[d] || []).push({ ...rest, id: idOf.get(_ref), parentAccountId, ...(_tier ? { accountTier: parentAccountId ? _tier : 'account' } : {}) });
    }
    return levels.filter(Boolean);
}

// The levels sent in order (state §0.215): post(rows, offset) — the client's postNew for one level, answering
// { landed, failed, error } — each level once the one above has answered, its rows under a file parent that did not
// land sent with none (levelAfterLanded); a request that failed sends no level after it, and its error is the
// answer's. stillOrg() — the org that started the import is still on screen (state §0.175): once it is not, the
// levels stop and the answer says so ({ stopped: true }). onLanded(rows) — each level's landed rows, as they land.
// { stopped, res: { landed, failed, error, attempted } } — attempted, every row of every level.
export async function sendLevels(levels, post, { stillOrg = () => true, onLanded = () => {} } = {}) {
    const list = Array.isArray(levels) ? levels : [];
    const all = list.flat();
    const fileIds = new Set(all.map((r) => r.id));
    const landedIds = new Set();
    const res = { landed: [], failed: [], error: null, attempted: all.length };
    let sent = 0;
    for (const level of list) {
        if (res.error) break;
        const out = await post(levelAfterLanded(level, fileIds, landedIds), sent);
        if (!stillOrg()) return { stopped: true, res };
        if (out.landed.length > 0) onLanded(out.landed);
        for (const r of out.landed) landedIds.add(r.id);
        res.landed.push(...out.landed);
        res.failed.push(...out.failed);
        res.error = out.error;
        sent += level.length;
    }
    return { stopped: false, res };
}

// A level as sent once the levels above it have been: a row whose parent is a row of the file (fileIds) that did
// not land (landedIds) names no parent — at the top level, an account (the server stores one there whatever is asked).
export function levelAfterLanded(level, fileIds, landedIds) {
    return (Array.isArray(level) ? level : []).map((r) => (r.parentAccountId && fileIds.has(r.parentAccountId) && !landedIds.has(r.parentAccountId)
        ? { ...r, parentAccountId: null, ...('accountTier' in r ? { accountTier: 'account' } : {}) }
        : r));
}
