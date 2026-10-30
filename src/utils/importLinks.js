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
import { searchKey, viaParent } from './searchMatch.js';
import { unarchived, isMergeArchived, survivorOf, parentLabel, resolveLink, siteOutOfReach, siteNotAccount } from './pickLink.js';
import { parentProblem, parentRefusal, rankOf } from './accountParent.js';
import { dealKeeps } from './dealAccount.js';

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

// ── The contact and deal imports (state §0.216 — batch 3b; guide §18b106; Jeff, 29 Oct: Q3 "Refuse the row", Q4
// "Re-link it"; 30 Oct: Q13 "Refuse both") ──────────────────────────────────────────────────────────────────────
// The contact import linked no contact to an account — a Company that named one live account sent its text alone —
// and made a new account for a name it met in no case of the WHOLE list, a merged-away account included, "Acme" and
// "ACME" two of them; its duplicate was the first contact of the email, else the first of the name. The deal import
// stored every deal by its Account TEXT, no id, a site's name and a twin's alike; its duplicate was the first deal of
// the name and the account text (docs/design/links-batch-3, I4, I5). Here, at Preview, by the file's row:

const lower = (s) => String(s ?? '').trim().toLowerCase();
const personName = (c) => [c?.firstName, c?.lastName].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');

// Each group of rows of two or more refused, in the words `why(rows, i)` gives (Q6, Q13; two rows on one record).
function refuseGroups(groups, refuse, field, valueOf, why) {
    for (const idx of groups.values()) {
        if (idx.length < 2) continue;
        for (const i of idx) refuse(i, field, valueOf(i), why(idx, i));
    }
}
const groupBy = (indexes, keyOf) => {
    const out = new Map();
    for (const i of indexes) {
        const k = keyOf(i);
        if (k == null) continue;
        if (!out.has(k)) out.set(k, []);
        out.get(k).push(i);
    }
    return out;
};

// What tells a contact apart from another of its name or email: its company and email.
export function contactNote(contact) {
    return [contact?.company, contact?.email].map((s) => String(s ?? '').trim()).filter(Boolean).join(' · ') || 'no company or email';
}
const contactsNamed = (list) => list.map((c) => `${quoted(personName(c) || c.email || 'a contact')} (${contactNote(c)})`).join(', ');

// planContactImport(records, rowNumbers, accounts, contacts)
//   records, rowNumbers  as planAccountImport's; accounts, contacts: the caller's FULL lists, merged-away rows included.
// { records, conflicts, refused }, as planAccountImport's. Each row kept carries `_company`: null (no Company), an
// account of the list { id, name } — the contact is saved linked to it, under its own spelling — or a new company of
// the file { key, name }: made once for every row whose Company reads as it (searchKey), named as its first row
// spells it (ModalLayer.jsx makes it, for the rows sent).
// - A Company is ONE account of any tier (a contact's Company takes any record — the rail's anyRecord), or none: a
//   new company (the import's Create). Two accounts of the name, a name only accounts merged into another have, or
//   one of no letter or digit, refuse the row.
// - A row's duplicate is ONE live contact: of its email, else of its first and last name at its Company (the account
//   it links, by id — a contact with no account id by its company's name — any company for a row with none). Two
//   such contacts refuse the row, naming each; an email only contacts merged into another have refuses it, naming the
//   one it was merged into. Two rows of the file on one contact refuse both; two rows of one email that would make two
//   contacts of it — new rows, or a new row and one matched by name — refuse both (Q13).
export function planContactImport(records, rowNumbers, accounts, contacts) {
    const rows = Array.isArray(records) ? records : [];
    const allAccounts = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const allContacts = Array.isArray(contacts) ? contacts.filter(Boolean) : [];
    const byId = new Map(allAccounts.map((a) => [a.id, a]));
    const rowOf = (i) => (Array.isArray(rowNumbers) && rowNumbers[i]) || i + 2;
    const refused = new Map();
    const refuse = (i, field, value, why) => { if (!refused.has(i)) refused.set(i, { rowNumber: rowOf(i), field, value: String(value ?? '').trim(), why }); };

    // 1. Each row's Company: none, one account, a new company of the file — or refused.
    const companyOf = new Map();
    rows.forEach((rec, i) => {
        const text = String(rec?.company ?? '');
        if (text.trim() === '') { companyOf.set(i, null); return; }
        const field = 'Company';
        const r = resolveLink({ text, records: allAccounts });
        if (r.how === 'typed') companyOf.set(i, { id: r.record.id, name: r.record.name });
        else if (r.refusal === 'many') refuse(i, field, text, `More than one account is named ${quoted(text)} — ${accountsNamed(r.matches, byId)}. Import this row without a Company and set it on the contact's page.`);
        else if (r.refusal === 'merged') refuse(i, field, text, mergedWords(text, survivorNamed(r.matches, allAccounts), (n) => `write ${n} in its place`));
        else if (!searchKey(text)) refuse(i, field, text, `${quoted(text)} has no letter or digit — a company name needs one.`);
        else companyOf.set(i, { key: searchKey(text) });   // a new company, named once the refusals are known (below)
    });

    // 2. Each row's duplicate: one live contact of its email, else of its name at its Company; two refuse the row.
    const live = unarchived(allContacts);
    const gone = allContacts.filter(isMergeArchived);
    // The account a contact stands on: its account id's — one merged away, the account it was merged into.
    const standsOn = (c) => { const a = c.accountId ? byId.get(c.accountId) : null; return a ? survivorOf(a, allAccounts)?.id ?? null : c.accountId || null; };
    const atCompany = (c, co) => (!co ? true
        : co.id ? (c.accountId ? standsOn(c) === co.id : searchKey(c.company) === searchKey(co.name))
            // a new company: a contact with no account id at that text — or one linked outside the caller's list whose
            // company reads as it (the held pair, kept below: the review of 3b)
            : (!c.accountId || !byId.has(c.accountId)) && searchKey(c.company) === co.key);
    const existingOf = new Map();
    const fresh = [];
    rows.forEach((rec, i) => {
        if (refused.has(i)) return;
        const email = lower(rec?.email);
        if (email) {
            const same = live.filter((c) => lower(c.email) === email);
            if (same.length > 1) { refuse(i, 'Email', rec.email, `More than one contact has the email ${quoted(rec.email)} — ${contactsNamed(same)}. Change the one you mean on its page.`); return; }
            if (same.length === 1) { existingOf.set(i, { existing: same[0], reason: 'same email' }); return; }
            const merged = gone.filter((c) => lower(c.email) === email);
            if (merged.length) {
                const into = survivorNamed(merged, allContacts);
                refuse(i, 'Email', rec.email, into
                    ? `The contact with ${quoted(rec.email)} was merged into ${quoted(personName(into))} — update ${quoted(personName(into))} instead.`
                    : `The contact with ${quoted(rec.email)} was merged into another contact.`);
                return;
            }
        }
        const first = lower(rec?.firstName);
        const last = lower(rec?.lastName);
        if (first && last) {
            const co = companyOf.get(i);
            const same = live.filter((c) => lower(c.firstName) === first && lower(c.lastName) === last && atCompany(c, co));
            const name = personName(rec);
            if (same.length > 1) { refuse(i, 'Name', name, `More than one contact is named ${quoted(name)}${co ? ` at ${quoted(co.name || String(rec.company).trim())}` : ''} — ${contactsNamed(same)}. Give this row the email of the one you mean.`); return; }
            if (same.length === 1) { existingOf.set(i, { existing: same[0], reason: 'name match' }); return; }
        }
        fresh.push(i);
    });

    // 3. Two rows of the file on one contact: both refused — never two overwrites of one contact.
    refuseGroups(groupBy([...existingOf.keys()], (i) => existingOf.get(i).existing.id), refuse, 'Name', (i) => personName(rows[i]) || rows[i].email,
        (idx, i) => `${capital(rowsNamed(idx.map(rowOf)))} ${idx.length === 2 ? 'both' : 'all'} match ${quoted(personName(existingOf.get(i).existing) || existingOf.get(i).existing.email)} — keep one of them.`);
    // 4. Two rows of one email that would make two contacts of it — new rows, or a new row and one matched by name
    // (whose overwrite gives its contact that email): both refused (Q13; the review of 3b).
    const byName = [...existingOf.keys()].filter((i) => existingOf.get(i).reason === 'name match');
    refuseGroups(groupBy([...fresh, ...byName].sort((a, b) => a - b), (i) => lower(rows[i].email) || null), refuse, 'Email', (i) => rows[i].email,
        (idx, i) => `${capital(rowsNamed(idx.map(rowOf)))} are the same contact (${quoted(rows[i].email)}) — keep one of them.`);

    // A new company is named as the first row that imports spells it — never a row refused above (the review of 3b).
    const spelt = new Map();
    rows.forEach((rec, i) => {
        const co = companyOf.get(i);
        const was = existingOf.get(i)?.existing;
        const held = !!was && !!was.accountId && !byId.has(was.accountId) && !!co && !!co.key && searchKey(was.company) === co.key;
        if (!refused.has(i) && !held && co && co.key && !spelt.has(co.key)) spelt.set(co.key, String(rec.company).trim());
    });
    const kept = [];
    const conflicts = [];
    rows.forEach((rec, i) => {
        if (refused.has(i)) return;
        const found = companyOf.get(i) || null;
        // A duplicate linked to an account the caller's list does not hold (a rep's scope), whose Company reads as its
        // own: the Company could not be checked, and the overwrite keeps the stored pair — never a new company made of
        // the name and the contact moved onto it (the review of 3b).
        const was = existingOf.get(i)?.existing;
        const held = !!was && !!was.accountId && !byId.has(was.accountId) && !!found && !!found.key && searchKey(was.company) === found.key;
        const co = held ? { keep: true, name: String(was.company ?? '').trim() } : found && found.key ? { key: found.key, name: spelt.get(found.key) } : found;
        // The row reads the Company it is saved under, as the Preview shows it (the review of 3b).
        const row = { ...rec, ...(co ? { company: co.name } : {}), _company: co };
        if (existingOf.has(i)) {
            const { existing, reason } = existingOf.get(i);
            conflicts.push({ incomingIndex: kept.length, incoming: row, existing, note: contactNote(existing), matchReason: reason, action: 'skip' });
        }
        kept.push(row);
    });
    return { records: kept, conflicts, refused: [...refused.values()].sort((a, b) => a.rowNumber - b.rowNumber) };
}

// What tells a deal apart from another of its name: its account and stage.
const dealNote = (d) => [d?.account, d?.stage].map((s) => String(s ?? '').trim()).filter(Boolean).join(' · ') || 'no account or stage';
const dealName = (d) => String(d?.opportunityName || d?.account || '').trim();

// planDealImport(records, rowNumbers, accounts, deals)
//   records, rowNumbers  as planAccountImport's; accounts: the caller's FULL list, merged-away accounts included;
//   deals: the deals the caller's screen holds.
// { records, conflicts, refused }, as planAccountImport's. Each row kept reads its account's own spelling in
// `account` and carries `_link`: { id, name, site } — the account it is saved on, and the Site Name a site typed in
// full gives (else ''). A duplicate is a deal on that same account, so an overwrite never moves a deal.
// - An Account is ONE account the deal window takes (any tier but a site — dealAccount.js dealKeeps); a site typed in
//   full is its account, the site its Site Name, as a click on the site's row (D5). No Account, none of the name
//   (Q3: "Refuse the row" — import or create it first), two, a site whose account the list does not hold (a rep's
//   scope) or that leads to no account, a name only accounts merged into another have, or one of no letter or digit,
//   refuse the row.
// - A row's duplicate is ONE deal of its name (its Opportunity Name, else its account's) on its account — a deal
//   linked by id, on the account its id stands for; one with no id, by its account's name. Two such deals refuse the
//   row, naming each with its stage; a name of no letter or digit refuses it. Two rows of the file on one deal refuse
//   both; two new rows of one name on one account refuse both (Q13).
export function planDealImport(records, rowNumbers, accounts, deals) {
    const rows = Array.isArray(records) ? records : [];
    const allAccounts = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const allDeals = Array.isArray(deals) ? deals.filter(Boolean) : [];
    const byId = new Map(allAccounts.map((a) => [a.id, a]));
    const listedById = new Map(unarchived(allAccounts).map((a) => [a.id, a]));
    const rowOf = (i) => (Array.isArray(rowNumbers) && rowNumbers[i]) || i + 2;
    const refused = new Map();
    const refuse = (i, field, value, why) => { if (!refused.has(i)) refused.set(i, { rowNumber: rowOf(i), field, value: String(value ?? '').trim(), why }); };

    // 1. Each row's Account: one account the deal window takes, or a site's account — or refused.
    const linkOf = new Map();
    rows.forEach((rec, i) => {
        const text = String(rec?.account ?? '');
        const field = 'Account Name';
        if (text.trim() === '') { refuse(i, field, text, 'A deal needs its account — this row names none.'); return; }
        if (!searchKey(text)) { refuse(i, field, text, `${quoted(text)} has no letter or digit — an account name needs one.`); return; }
        const r = resolveLink({ text, records: allAccounts, eligible: dealKeeps, via: (a) => viaParent(a, listedById, dealKeeps) });
        if (r.how === 'typed') linkOf.set(i, { id: r.record.id, name: r.record.name, site: r.via ? r.via.name : '', siteId: r.via ? r.via.id : '' });
        else if (r.refusal === 'many') refuse(i, field, text, `More than one account is named ${quoted(text)} — ${accountsNamed(r.matches, byId)}. Rename one of them, or set this deal's account on its page.`);
        else if (r.refusal === 'unreachable') refuse(i, field, text, siteOutOfReach(text.trim()));
        else if (r.refusal === 'ineligible') refuse(i, field, text, siteNotAccount(text.trim()));
        else if (r.refusal === 'merged') refuse(i, field, text, mergedWords(text, survivorNamed(r.matches, allAccounts), (n) => `write ${n} in its place`));
        else {
            // No account of the caller's list has the name — but her own deal of the row's name may stand on one outside
            // it (a rep's deal on another rep's account): that deal is the duplicate, and an overwrite keeps the stored
            // pair, never refused as an account that is not saved (the review of 3b).
            const own = String(rec?.opportunityName || '').trim() || text.trim();
            const theirs = allDeals.filter((d) => d.accountId && !byId.has(d.accountId) && searchKey(d.account) === searchKey(text) && searchKey(dealName(d)) === searchKey(own));
            // Its duplicate is then found as any row's is (step 2, by the held id): two of her deals of the name there
            // refuse the row, as on a listed account.
            if (theirs.length === 1) linkOf.set(i, { id: theirs[0].accountId, name: String(theirs[0].account ?? '').trim(), site: '', siteId: '', keep: true });
            else if (theirs.length > 1) refuse(i, 'Opportunity Name', own, `More than one deal is named ${quoted(own)} on ${quoted(text.trim())} — ${theirs.map((d) => `${quoted(dealName(d))} (${d.stage || 'no stage'})`).join(', ')}. Change the one you mean on its page.`);
            else refuse(i, field, text, `No account is named ${quoted(text)} — import or create the account first.`);
        }
    });

    // 2. Each row's duplicate: one deal of its name on its account; two refuse the row.
    const standsOn = (d) => { const a = d.accountId ? byId.get(d.accountId) : null; return a ? survivorOf(a, allAccounts)?.id ?? null : d.accountId || null; };
    // A deal an older import saved on a site — by the site's id, or with no id by its name — is on the site's account,
    // whichever way a row names that account (its own name, or the site's): else a re-import would make each such deal
    // again, or one file leave two deals of a name on one account (the review of 3b).
    const siteOf = (a, link) => !!a && !isMergeArchived(a) && a.accountTier === 'site' && a.parentAccountId === link.id;
    const onAccount = (d, link) => {
        if (d.accountId) return standsOn(d) === link.id || siteOf(byId.get(standsOn(d)), link);
        const key = searchKey(d.account);
        return key === searchKey(link.name) || allAccounts.some((a) => siteOf(a, link) && searchKey(a.name) === key);
    };
    // A blank Opportunity Name is the Account as typed — a site's name too, never its account's — as the import has
    // always named it, so a re-import meets the deal an older import made (the review of 3b).
    const nameOf = (i) => String(rows[i].opportunityName || '').trim() || String(rows[i].account ?? '').trim();
    const existingOf = new Map();
    const fresh = [];
    rows.forEach((rec, i) => {
        if (refused.has(i)) return;
        const link = linkOf.get(i);
        const name = nameOf(i);
        // A name of no letter or digit reads as no name: it would match any other such deal (the review of 3b).
        if (!searchKey(name)) { refuse(i, 'Opportunity Name', name, `${quoted(name)} has no letter or digit — a deal name needs one.`); return; }
        const same = allDeals.filter((d) => searchKey(dealName(d)) === searchKey(name) && onAccount(d, link));
        if (same.length > 1) refuse(i, 'Opportunity Name', name, `More than one deal is named ${quoted(name)} on ${quoted(link.name)} — ${same.map((d) => `${quoted(dealName(d))} (${d.stage || 'no stage'})`).join(', ')}. Change the one you mean on its page.`);
        else if (same.length === 1) existingOf.set(i, same[0]);
        else fresh.push(i);
    });

    // 3. Two rows of the file on one deal: both refused. 4. Two new rows of one name on one account: both refused (Q13).
    refuseGroups(groupBy([...existingOf.keys()], (i) => existingOf.get(i).id), refuse, 'Opportunity Name', nameOf,
        (idx, i) => `${capital(rowsNamed(idx.map(rowOf)))} ${idx.length === 2 ? 'both' : 'all'} match the deal ${quoted(dealName(existingOf.get(i)))} — keep one of them.`);
    refuseGroups(groupBy(fresh, (i) => JSON.stringify([searchKey(nameOf(i)), linkOf.get(i).id])), refuse, 'Opportunity Name', nameOf,
        (idx, i) => `${capital(rowsNamed(idx.map(rowOf)))} each make the deal ${quoted(nameOf(i))} on ${quoted(linkOf.get(i).name)} — keep one of them.`);

    const kept = [];
    const conflicts = [];
    rows.forEach((rec, i) => {
        if (refused.has(i)) return;
        const link = linkOf.get(i);
        const existing = existingOf.get(i) || null;
        // A new deal is named as nameOf names it; an overwrite's blank Opportunity Name is not sent (Q14).
        const row = { ...rec, ...(existing ? {} : { opportunityName: nameOf(i) }), account: link.name, _link: link };
        if (existing) conflicts.push({ incomingIndex: kept.length, incoming: row, existing, note: dealNote(existing), matchReason: 'same name + account', action: 'skip' });
        kept.push(row);
    });
    return { records: kept, conflicts, refused: [...refused.values()].sort((a, b) => a.rowNumber - b.rowNumber) };
}
