// mergeLinks.js — what a merge writes by link, decided (state §0.218; batch 3c of OPEN_ITEMS §1 item 1; guide
// §18b108). Pure: merge.mjs reads the rows and hands them here; tests/merge-links.test.mjs runs every branch.
// Jeff, 30 Oct: Q15 "Still on survivor", Q16 "Skip if shared", Q17 "Show it to pick", Q12 (29 Oct) "Fold it in".

export const PAIR_NOT_OURS = 'The Company must be one of the two contacts being merged.';
export const companyGone = (company) => `${company ? `“${company}”` : 'That account'} no longer exists — keep the survivor's Company, or link the contact to an account first.`;

const text = (v) => String(v ?? '');
const idOf = (v) => (v == null || v === '' ? null : String(v));

// The old names a merge renames a record with NO account id by — a contact, a deal or a SPIFF claim — each only where
// no live account outside the merged pair has that name (Q16: "Skip if shared"; the D22 lift's own test): a record with
// no id under a name a third account shares could be that account's. named: the live accounts of the org that have
// one of the names ({ id, name }); pair: the two records' ids.
export function idlessNamesOf(oldNames, named, pair) {
    return (oldNames || []).filter((v) => v != null && !(named || []).some((a) => a.name === v && !pair.includes(a.id)));
}

// A record of the merge by its link: on one of the ids by id, or with no id under a name the merge renames by.
export const ofMerge = (accountId, name, pair, idlessNames) => (accountId ? pair.includes(accountId) : idlessNames.includes(name));

// The SPIFF claims an account merge renames, each to the name its deal will carry (Q12, 29 Oct: "Fold it in" — only
// claims on a deal of the merge, and claims with no deal by name; they were renamed org-wide by name): a claim on a deal
// of the merge takes that deal's account name after the merge — the survivor's, or, a deal the D22 lift moves up, the
// account above the site (upName); a claim with no live deal, by its own name where the merge renames a record with no
// id by it (idlessNames); any other claim — on another account's deal, or under a name a third account shares — is
// left. Only a claim whose text is one of the merge's old names is read (merge.mjs). Answers one rename per old name and
// new name, the ids it writes: each is logged as the merge logs a name (kind 'name'), so its Undo puts each back.
// claims: [{ id, account, opportunityId }]; deals: Map(id → { id, accountId, account }), the claims' deals as read in
// this org (a deal not in it is none); lifted: Set of the deal ids the lift moves.
export function claimRenames(claims, deals, { pair, idlessNames, lifted, survName, upName }) {
    const out = new Map();
    for (const c of claims || []) {
        const d = c.opportunityId ? deals.get(c.opportunityId) : null;
        const to = d
            ? (ofMerge(d.accountId, d.account, pair, idlessNames) ? (lifted.has(d.id) ? upName : survName) : null)
            : (idlessNames.includes(c.account) ? survName : null);
        if (to == null || to === c.account) continue;
        const key = JSON.stringify([c.account, to]);
        if (!out.has(key)) out.set(key, { oldValue: c.account, newValue: to, ids: [] });
        out.get(key).ids.push(c.id);
    }
    return [...out.values()];
}

// How many records a merge's rewrites touched, each counted once (Jeff, 30 Oct: Q18 — the audit's double count): a
// record two rewrites name — a deal moved by its id and renamed, a deal moved up, a contact in two org charts — was
// counted once for each. keyOf(rewrite): the key it is counted under (a table, or a table and column); a record goes
// under the first rewrite that names it. Answers { key: count }.
export function recordsTouched(rewrites, keyOf) {
    const seen = new Set(), out = {};
    for (const r of rewrites || []) {
        const ids = Array.isArray(r.ids) ? r.ids : (r.rows || []).map((x) => x.id);
        for (const id of ids) {
            if (seen.has(`${r.table}:${id}`)) continue;
            seen.add(`${r.table}:${id}`);
            out[keyOf(r)] = (out[keyOf(r)] || 0) + 1;
        }
    }
    return out;
}

// A contact merge's Company and account id, one pair (Q17: "Show it to pick" — the Company text and the account id
// travel together): which record's pair the survivor keeps. resolvedFields: what the window sent — `accountId` (the
// picked record's link) and/or `company` (an older window's text alone). Answers null (neither sent: the survivor's pair
// stands), { error } (a link or a text neither contact holds — never paired with a link it never had, as mergedOwnerId
// refuses an owner), { from: 'survivor' } (its own pair stands), or { from: 'archived', accountId, company } (the record
// merged away's pair — merge.mjs checks its link in this org first, a merged-away account followed).
export function contactPairOf(resolvedFields, surv, arch) {
    const r = resolvedFields || {};
    const hasId = Object.hasOwn(r, 'accountId'), hasCo = Object.hasOwn(r, 'company');
    if (!hasId && !hasCo) return null;
    const s = idOf(surv?.accountId), a = idOf(arch?.accountId);
    const archived = () => ({ from: 'archived', accountId: a, company: arch?.company ?? null });
    if (hasId) {
        const id = idOf(r.accountId);
        if (id !== s && id !== a) return { error: PAIR_NOT_OURS };
        if (id !== s) return archived();
        if (id !== a) return { from: 'survivor' };
        if (!hasCo) return { from: 'survivor' };   // one link: the survivor's pair stands
    }
    // By the text the window picked: the survivor's, or the record merged away's with its link.
    if (text(r.company) === text(surv?.company)) return { from: 'survivor' };
    if (text(r.company) === text(arch?.company)) return archived();
    return { error: PAIR_NOT_OURS };
}
