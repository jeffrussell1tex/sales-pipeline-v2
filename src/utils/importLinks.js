// src/utils/importLinks.js
//
// The accounts CSV import's names (state §0.215 — batch 3a of OPEN_ITEMS §1 item 1; guide §18b105; Jeff, 29 Oct:
// "Refuse that row", "Refuse if same parent", "Ignore it and say so"). A pick is saved as the record picked
// (guide §18b91): a name in the file is ONE record or the row is refused — never the first of a name. The import
// took a sub-account's Parent Account as the first account of that name in any case and any tier (a site
// included), and a row's duplicate as the first existing account of its name, an account merged away included;
// a Parent cell that matched two took the first, and one that matched nothing imported the row with no parent and
// said nothing (docs/design/
// links-batch-3, I1, I3). Here, read at Preview, before anything is sent:
//
// - A row's own name (searchKey: case, spacing and punctuation ignored) is one live account — the duplicate the
//   Conflicts step offers to Skip or Overwrite — or none: a new account. Two live accounts of the name refuse
//   the row, naming each by its parent; a name only accounts merged into another have refuses it, naming the one
//   it was merged into (the duplicate a merge removed is not made again). Two rows of the file matching one
//   account refuse both.
// - Two new rows of one name under one Parent Account cell refuse both (Q6); under different parents both are
//   made (UKG's twin "Shell - Port Allen", a unit and a site, are real).
// - A new row's Parent Account is ONE account: a live account of the caller's list or a new row of the file —
//   two (an account and a row of the file, two accounts, two rows) refuse the row, naming them; a site, a name
//   only a merged-away account has, no account at all, the row itself, a parent row refused, or a chain that
//   leads back to the row, refuse it too. A parent row of the file is placed before the rows under it, at any
//   depth (Account > Unit > Site), each new row taking the lowest tier above its parent's (accountParent.js
//   tierUnder); a row under a row that is a site is refused.
// The caller's own list — a Sales Rep's holds her accounts and the unassigned ones (Q2: "Leave it, decide
// later"). Pure — no React, no DOM.
import { searchKey } from './searchMatch.js';
import { unarchived, isMergeArchived, survivorOf, parentLabel } from './pickLink.js';
import { parentProblem, parentRefusal, rankOf } from './accountParent.js';

const TIERS = ['account', 'business_unit', 'site'];
const TIER_WORDS = { account: 'an account', business_unit: 'a business unit', site: 'a site' };

const quoted = (s) => `“${String(s ?? '').trim()}”`;

// What tells an account apart from another of its name: its parent ("site of Shell"), else its place.
export function accountNote(account, byId) {
    if (!account) return '';
    const parent = account.parentAccountId && byId ? byId.get(account.parentAccountId) : null;
    const label = parentLabel(account, parent);
    if (label) return label;
    if (account.parentAccountId) return TIER_WORDS[account.accountTier] || 'a sub-account';
    return 'top level';
}

// The words a refusal names records in: accounts by their notes, rows of the file by number.
const accountsNamed = (list, byId) => list.map((a) => `${quoted(a.name)} (${accountNote(a, byId)})`).join(', ');
const rowsNamed = (numbers) => {
    const list = numbers.map(String);
    if (list.length <= 1) return `row ${list[0] || ''}`.trim();
    return `rows ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The one live account a name only merged-away accounts have leads to, or null (none, or more than one).
function survivorNamed(gone, all) {
    const into = new Map(gone.map((a) => survivorOf(a, all)).filter(Boolean).map((s) => [s.id, s]));
    return into.size === 1 ? [...into.values()][0] : null;
}

// A name only accounts merged into another have: the one it was merged into, and what to write in its place.
const mergedWords = (text, into, then) => (into
    ? `${quoted(text)} was merged into ${quoted(into.name)} — ${then(quoted(into.name))}.`
    : `${quoted(text)} was merged into another account.`);

// planAccountImport(records, rowNumbers, accounts)
//   records     the mapped rows (csvMapping.js mapCsvRows): { name, parentAccount, … }.
//   rowNumbers  each record's row in the file (mapCsvRows' rowNumbers); none: index + 2.
//   accounts    the caller's FULL list, merged-away accounts included (they name their survivors).
// { records, conflicts, refused }:
//   records    the rows not refused, in the file's order. A new row carries `_ref` (its place in the file's
//              records), `_parent`: null (the top level), { id } (an account of the list) or { ref } (a new row
//              of the file), and `_tier`, the tier it takes there — importParents.js importLevels sends them by
//              depth, each asking that tier (the server fits it again: placeBulkRows), so the copy the screen
//              keeps holds the tier stored and a later import's plan reads a site as a site.
//   conflicts  [{ incomingIndex, incoming, existing, note, matchReason, action: 'skip' }] — incomingIndex into
//              `records`; note, what tells the existing account apart (its parent, or its place).
//   refused    [{ rowNumber, field, value, why }], in the file's order.
export function planAccountImport(records, rowNumbers, accounts) {
    const rows = Array.isArray(records) ? records : [];
    const all = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const byId = new Map(all.map((a) => [a.id, a]));
    const rowOf = (i) => (Array.isArray(rowNumbers) && rowNumbers[i]) || i + 2;
    const live = new Map();
    const gone = new Map();
    for (const a of all) {
        const k = searchKey(a.name);
        if (!k) continue;
        const into = isMergeArchived(a) ? gone : live;
        if (!into.has(k)) into.set(k, []);
        into.get(k).push(a);
    }
    const refused = new Map();
    const refuse = (i, field, value, why) => { if (!refused.has(i)) refused.set(i, { rowNumber: rowOf(i), field, value: String(value ?? '').trim(), why }); };

    // 1. Each row's own name: one live account (a conflict), two (refused), only merged-away ones (refused), none (new).
    const existingOf = new Map();
    const fresh = [];
    rows.forEach((rec, i) => {
        const key = searchKey(rec?.name);
        const same = key ? live.get(key) || [] : [];
        // A name of no letter or digit reads as no name: matched to nothing, it could be made twice (the review of 3a).
        if (!key) refuse(i, 'Account Name', rec?.name, `${quoted(rec?.name)} has no letter or digit — an account name needs one.`);
        else if (same.length > 1) refuse(i, 'Account Name', rec.name, `More than one account is named ${quoted(rec.name)} — ${accountsNamed(same, byId)}. Change the one you mean on its page.`);
        else if (same.length === 1) existingOf.set(i, same[0]);
        else if (gone.has(key)) refuse(i, 'Account Name', rec.name, mergedWords(rec.name, survivorNamed(gone.get(key), all), (n) => `write ${n} in its place to update it`));
        else fresh.push(i);
    });

    // 2. Two rows of the file matching one account: both refused — never two overwrites of one account.
    const byExisting = new Map();
    for (const [i, a] of existingOf) {
        if (!byExisting.has(a.id)) byExisting.set(a.id, []);
        byExisting.get(a.id).push(i);
    }
    for (const [, idx] of byExisting) {
        if (idx.length < 2) continue;
        for (const i of idx) refuse(i, 'Account Name', rows[i].name, `${capital(rowsNamed(idx.map(rowOf)))} ${idx.length === 2 ? 'both' : 'all'} match ${quoted(existingOf.get(i).name)} — keep one of them.`);
    }

    // 3. Two new rows of one name under one Parent Account cell: both refused (Q6).
    const twins = new Map();
    for (const i of fresh) {
        const key = searchKey(rows[i].name);
        // A blank Parent cell is the top level; any other is read as step 4 reads it (punctuation alone is a cell).
        const cell = (rows[i].parentAccount || '').trim();
        const pair = JSON.stringify([key, cell === '' ? null : searchKey(cell)]);
        if (!twins.has(pair)) twins.set(pair, []);
        twins.get(pair).push(i);
    }
    for (const [, idx] of twins) {
        if (idx.length < 2) continue;
        for (const i of idx) refuse(i, 'Account Name', rows[i].name, `${capital(rowsNamed(idx.map(rowOf)))} each make ${quoted(rows[i].name)} under the same Parent Account — keep one of them.`);
    }

    // 4. Each new row's parent: one account of the list or one new row of the file, placed parents first. Every new
    // row of the file counts as one of its name — a refused twin too: a name three rows have is no one row because
    // two of them were refused (the review of 3a). A new row has no live account of its name (else it is a conflict),
    // so a Parent cell names accounts of the list or rows of the file, never both.
    const newRows = fresh.filter((i) => !refused.has(i));
    const fileByKey = new Map();
    for (const i of fresh) {
        const key = searchKey(rows[i].name);
        if (!fileByKey.has(key)) fileByKey.set(key, []);
        fileByKey.get(key).push(i);
    }
    const placed = new Map();   // file index → { parent, tier }
    let pending = [];
    for (const i of newRows) {
        if ((rows[i].parentAccount || '').trim() === '') placed.set(i, { parent: null, tier: TIERS[0] });
        else pending.push(i);
    }
    // The rows of the file a Parent cell names (itself left out).
    const rowsNamedBy = (i) => (fileByKey.get(searchKey(rows[i].parentAccount)) || []).filter((j) => j !== i);
    // Passes until nothing moves; then a row still waiting on several rows of its parent's name — they wait on it, or
    // on each other — is refused as naming more than one, and the passes go on: the rows waiting on it are refused
    // with it, never as a loop they are not on (the review of 3a).
    for (let stalled = true; stalled;) {
        for (let moved = true; moved && pending.length;) {
            moved = false;
            const waiting = [];
            for (const i of pending) {
                const text = rows[i].parentAccount;
                const pkey = searchKey(text);
                const field = 'Parent Account';
                if (pkey && pkey === searchKey(rows[i].name)) { refuse(i, field, text, "An account can't be its own parent."); moved = true; continue; }
                const accountsOf = pkey ? live.get(pkey) || [] : [];
                const rowsOf = pkey ? (fileByKey.get(pkey) || []).filter((j) => j !== i) : [];
                // Rows of the name not yet placed or refused: decided on a later pass, so the reason never hangs on the
                // order of the file (the review of 3a).
                if (rowsOf.length > 1 && rowsOf.some((j) => !refused.has(j) && !placed.has(j))) { waiting.push(i); continue; }
                if (rowsOf.length > 1 && rowsOf.every((j) => refused.has(j))) {
                    refuse(i, field, text, `Its parent ${quoted(text)} (${rowsNamed(rowsOf.map(rowOf))}) is refused too.`);
                    moved = true;
                    continue;
                }
                if (accountsOf.length > 1 || rowsOf.length > 1) {
                    const named = accountsOf.length ? accountsNamed(accountsOf, byId) : `${rowsNamed(rowsOf.map(rowOf))} of this file`;
                    refuse(i, field, text, `More than one account is named ${quoted(text)} — ${named}. Import this row without a Parent Account and set its parent on its page.`);
                    moved = true;
                    continue;
                }
                if (accountsOf.length === 1) {
                    const parent = accountsOf[0];
                    const problem = parentProblem(parent, null, byId, 0);
                    if (problem) refuse(i, field, text, parentRefusal(problem, parent.name));
                    else placed.set(i, { parent: { id: parent.id }, tier: TIERS[Math.min((rankOf(parent.accountTier) ?? 0) + 1, TIERS.length - 1)] });
                    moved = true;
                    continue;
                }
                if (rowsOf.length === 1) {
                    const j = rowsOf[0];
                    if (refused.has(j)) { refuse(i, field, text, `Its parent ${quoted(text)} (row ${rowOf(j)}) is refused too.`); moved = true; continue; }
                    if (!placed.has(j)) { waiting.push(i); continue; }
                    const up = placed.get(j);
                    if (up.tier === 'site') refuse(i, field, text, parentRefusal('site', rows[j].name));
                    else placed.set(i, { parent: { ref: j }, tier: TIERS[rankOf(up.tier) + 1] });
                    moved = true;
                    continue;
                }
                if (pkey && gone.has(pkey)) refuse(i, field, text, mergedWords(text, survivorNamed(gone.get(pkey), all), (n) => `name ${n} as its parent`));
                else refuse(i, field, text, `No account is named ${quoted(text)} — import it first, or fix the name.`);
                moved = true;
            }
            pending = waiting;
        }
        const several = pending.filter((i) => rowsNamedBy(i).length > 1);
        for (const i of several) refuse(i, 'Parent Account', rows[i].parentAccount, `More than one account is named ${quoted(rows[i].parentAccount)} — ${rowsNamed(rowsNamedBy(i).map(rowOf))} of this file. Import this row without a Parent Account and set its parent on its page.`);
        pending = pending.filter((i) => !refused.has(i));
        stalled = several.length > 0;
    }
    // What waits still is a chain of rows of the file, each naming one: a row its own chain comes back to is on the
    // loop; a row whose chain only reaches the loop is refused with its parent.
    const upOf = (i) => rowsNamedBy(i)[0];
    for (const i of pending) {
        let j = upOf(i);
        for (let n = 0; j !== undefined && j !== i && n < pending.length; n++) j = upOf(j);
        if (j === i) refuse(i, 'Parent Account', rows[i].parentAccount, 'Its Parent Account leads back to this row — a chain of parents in this file closes on itself.');
        else refuse(i, 'Parent Account', rows[i].parentAccount, `Its parent ${quoted(rows[i].parentAccount)} (row ${rowOf(upOf(i))}) is refused too.`);
    }

    // The rows kept, in the file's order; the conflicts index into them.
    const kept = [];
    const conflicts = [];
    rows.forEach((rec, i) => {
        if (refused.has(i)) return;
        if (existingOf.has(i)) {
            const existing = existingOf.get(i);
            conflicts.push({ incomingIndex: kept.length, incoming: rec, existing, note: accountNote(existing, byId), matchReason: 'same name', action: 'skip' });
            kept.push(rec);
            return;
        }
        kept.push({ ...rec, _ref: i, _parent: placed.get(i)?.parent || null, _tier: placed.get(i)?.tier || TIERS[0] });
    });
    return { records: kept, conflicts, refused: [...refused.values()].sort((a, b) => a.rowNumber - b.rowNumber) };
}

// One line for the Preview banner, as csvMapping.js describeDropped says its drops: null for none.
export function describeRefused(refused, totalRows) {
    const list = Array.isArray(refused) ? refused : [];
    if (!list.length) return null;
    return `${list.length} of ${totalRows} rows will be refused — each is listed below with why; the rest import.`;
}
