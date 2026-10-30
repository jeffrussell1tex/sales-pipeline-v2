// tests/import-links.test.mjs
//
// Batch 3a of OPEN_ITEMS §1 item 1 (state §0.215; guide §18b105; docs/design/links-batch-3; Jeff, 29 Oct: "Refuse
// that row", "Refuse if same parent", "Ignore it and say so", "Refuse it"). The accounts CSV import took a
// sub-account's Parent Account as the first account of that name in any case and tier — a site, one of UKG's twin
// "Shell - Port Allen" — and a row's duplicate as the first existing account of its name, a merged-away one
// included; a cell that matched nothing or two imported the row flat and said nothing. The bulk create stored any
// parent a live account and every sub-account a business unit; the bulk overwrite could move or rename one. Here:
// src/utils/importLinks.js planAccountImport run on UKG-shaped rows; accountParent.js placeBulkRows (the server's
// rule for a bulk create) run; the receipt's refused rows; and THE GUARD — the modal plans at Preview and lists
// what it refused, and accounts.mjs places a bulk create and refuses a bulk move or rename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planAccountImport, describeRefused, accountNote } from '../src/utils/importLinks.js';
import { placeBulkRows } from '../src/utils/accountParent.js';
import { mapCsvRows } from '../src/utils/csvMapping.js';
import { receiptFromPreflight, mergeReceipts, isClean, describeReceipt, emptyReceipt } from '../src/utils/importReceipt.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// UKG's shape: Shell, its two "Shell - Port Allen" (a unit, and a site under it), a site straight under Shell;
// "Acme, Inc." live, and "Old Acme" merged into it.
const ACCOUNTS = [
    { id: 'shell', name: 'Shell', accountTier: 'account', parentAccountId: null },
    { id: 'pa_unit', name: 'Shell - Port Allen', accountTier: 'business_unit', parentAccountId: 'shell' },
    { id: 'pa_site', name: 'Shell - Port Allen', accountTier: 'site', parentAccountId: 'pa_unit' },
    { id: 'dock', name: 'Dock 9', accountTier: 'site', parentAccountId: 'shell' },
    { id: 'old_acme', name: 'Old Acme', mergeArchived: true, mergedIntoId: 'acme' },
    { id: 'acme', name: 'Acme, Inc.', accountTier: 'account', parentAccountId: null },
];
const plan = (rows, accounts = ACCOUNTS) => planAccountImport(rows, rows.map((_, i) => i + 2), accounts);
const why = (p, row) => (p.refused.find((r) => r.rowNumber === row) || {}).why;

test("a Parent Account two live accounts share — UKG's twin \"Shell - Port Allen\" — refuses the row, naming each by its parent; never the first of the name (REGRESSION: the unit or the site, by list order)", () => {
    const p = plan([{ name: 'Port Allen Annex', parentAccount: 'shell - port allen' }]);
    assert.deepEqual(p.records, [], 'not imported flat, nor under either twin');
    assert.equal(why(p, 2), 'More than one account is named “shell - port allen” — “Shell - Port Allen” (unit of Shell), “Shell - Port Allen” (site of Shell - Port Allen). Import this row without a Parent Account and set its parent on its page.');
    assert.equal(p.refused[0].field, 'Parent Account');
    assert.equal(p.refused[0].value, 'shell - port allen');
    const flip = plan([{ name: 'Port Allen Annex', parentAccount: 'Shell - Port Allen' }], [...ACCOUNTS].reverse());
    assert.equal(flip.records.length, 0, 'the same in either list order');
});

test('a Parent Account that is a site, or a name only a merged-away account has, or no account at all, refuses the row — each said; never imported with no parent (REGRESSION: silent)', () => {
    const p = plan([
        { name: 'Under Dock', parentAccount: 'Dock 9' },
        { name: 'Under Old', parentAccount: 'Old Acme' },
        { name: 'Under Nobody', parentAccount: 'Nobody Co' },
        { name: 'Self Co', parentAccount: 'self co' },
    ]);
    assert.deepEqual(p.records, []);
    assert.equal(why(p, 2), "“Dock 9” is a site — a site can't have accounts under it. Pick the account or business unit it belongs to.");
    assert.equal(why(p, 3), '“Old Acme” was merged into “Acme, Inc.” — name “Acme, Inc.” as its parent.', 'a merged-away name names the account it was merged into — never the merged-away one');
    assert.equal(why(p, 4), 'No account is named “Nobody Co” — import it first, or fix the name.');
    assert.equal(why(p, 5), "An account can't be its own parent.");
});

test('one account of the name — read as searchKey reads it, case, spacing and punctuation ignored — is the parent; the new row takes the lowest tier above it', () => {
    const p = plan([{ name: 'Acme Plant', parentAccount: 'ACME INC' }, { name: 'Shell North', parentAccount: 'shell' }]);
    assert.deepEqual(p.refused, []);
    assert.deepEqual(p.records.map((r) => [r.name, r._ref, r._parent]), [['Acme Plant', 0, { id: 'acme' }], ['Shell North', 1, { id: 'shell' }]]);
    const deep = plan([{ name: 'U', parentAccount: 'Shell' }, { name: 'S', parentAccount: 'U' }, { name: 'Too deep', parentAccount: 'S' }]);
    assert.deepEqual(deep.records.map((r) => [r.name, r._parent]), [['U', { id: 'shell' }], ['S', { ref: 0 }]], 'under an account a unit, under the unit a site');
    assert.equal(why(deep, 4), "“S” is a site — a site can't have accounts under it. Pick the account or business unit it belongs to.", 'nothing under the site the file makes');
    const punct = plan([{ name: 'Odd', parentAccount: '!!!' }]);
    assert.equal(why(punct, 2), 'No account is named “!!!” — import it first, or fix the name.', 'punctuation alone names no account');
    const marks = plan([{ name: '---', parentAccount: '' }, { name: '---', parentAccount: '' }, { name: 'X', parentAccount: '' }, { name: 'X', parentAccount: '-' }], [...ACCOUNTS, { id: 'dashes', name: '---' }]);
    assert.equal(why(marks, 2), '“---” has no letter or digit — an account name needs one.', 'a name that reads as none is refused — never made again beside one of its text (the review of 3a)');
    assert.equal(why(marks, 3), '“---” has no letter or digit — an account name needs one.');
    assert.equal(why(marks, 5), 'No account is named “-” — import it first, or fix the name.', 'a blank Parent cell and one of punctuation are not one cell (the review of 3a)');
    assert.deepEqual(marks.records.map((r) => r.name), ['X'], 'the top-level X is made');
});

test('the file\'s own rows are parents at any depth — Account > Unit > Site lands nested; a row under a row that is a site, a refused parent row, or a chain that closes on itself, is refused', () => {
    const p = plan([
        { name: 'New Co', parentAccount: '' },
        { name: 'Unit A', parentAccount: 'new co' },
        { name: 'Site A', parentAccount: 'Unit A' },
        { name: 'Deeper', parentAccount: 'Site A' },
        { name: 'X', parentAccount: 'Y' },
        { name: 'Y', parentAccount: 'X' },
        { name: 'Kid of bad', parentAccount: 'Under Nobody' },
        { name: 'Under Nobody', parentAccount: 'Nobody' },
    ]);
    assert.deepEqual(p.records.map((r) => [r.name, r._parent]), [['New Co', null], ['Unit A', { ref: 0 }], ['Site A', { ref: 1 }]]);
    assert.equal(why(p, 5), "“Site A” is a site — a site can't have accounts under it. Pick the account or business unit it belongs to.", 'a third level is a site: nothing under it');
    assert.equal(why(p, 6), 'Its Parent Account leads back to this row — a chain of parents in this file closes on itself.');
    assert.equal(why(p, 7), 'Its Parent Account leads back to this row — a chain of parents in this file closes on itself.');
    assert.equal(why(p, 8), 'Its parent “Under Nobody” (row 9) is refused too.');
    assert.deepEqual(p.records.map((r) => r._tier), ['account', 'business_unit', 'site'], 'each kept row carries the tier it takes (the review of 3a)');
    const tail = plan([{ name: 'I', parentAccount: 'J' }, { name: 'J', parentAccount: 'K' }, { name: 'K', parentAccount: 'L' }, { name: 'L', parentAccount: 'K' }]);
    assert.deepEqual(tail.refused.map((r) => [r.rowNumber, r.why]), [
        [2, 'Its parent “J” (row 3) is refused too.'],
        [3, 'Its parent “K” (row 4) is refused too.'],
        [4, 'Its Parent Account leads back to this row — a chain of parents in this file closes on itself.'],
        [5, 'Its Parent Account leads back to this row — a chain of parents in this file closes on itself.'],
    ], 'only a row its chain comes back to is on the loop (the review of 3a)');
    const walk = plan([{ name: 'P', parentAccount: 'Q' }, { name: 'P', parentAccount: '' }, { name: 'Q', parentAccount: 'P' }]);
    assert.equal(why(walk, 4), 'More than one account is named “P” — rows 2 and 3 of this file. Import this row without a Parent Account and set its parent on its page.');
    assert.equal(why(walk, 2), 'Its parent “Q” (row 4) is refused too.', 'its parent row refused — said so, never as a loop (the review of 3a)');
    const orderA = [{ name: 'Unit', parentAccount: 'Ghost1' }, { name: 'Unit', parentAccount: 'Ghost2' }, { name: 'Site', parentAccount: 'Unit' }];
    const whyOf = (rows) => Object.fromEntries(plan(rows).refused.map((r) => [`${rows[r.rowNumber - 2].name}/${r.value}`, r.why.replace(/\(rows? [^)]*\)/, '(rows)')]));
    assert.deepEqual(whyOf([orderA[2], orderA[0], orderA[1]]), whyOf(orderA), 'the same rows in another order: the same reasons (the review of 3a)');
    assert.equal(whyOf(orderA)['Site/Unit'], 'Its parent “Unit” (rows) is refused too.');
    const twins = plan([{ name: 'Plant', parentAccount: 'Shell' }, { name: 'Plant', parentAccount: 'Shell' }, { name: 'Line', parentAccount: 'Plant' }]);
    assert.equal(why(twins, 4), 'Its parent “Plant” (rows 2 and 3) is refused too.', "the parent rows refused as Q6's twins — not that no account has the name (the review of 3a)");
});

test('two rows of the file of one name are two — the row naming it is refused, naming both; a row of an account\'s own name is that account\'s conflict, and a row naming it stands under the account', () => {
    const p = plan([{ name: 'shell', parentAccount: '' }, { name: 'Kid', parentAccount: 'Shell' }]);
    assert.deepEqual(p.conflicts.map((c) => [c.incoming.name, c.existing.id]), [['shell', 'shell']], 'a row named as an account is its conflict, never a second Shell');
    assert.deepEqual(p.records.filter((r) => '_ref' in r).map((r) => [r.name, r._parent]), [['Kid', { id: 'shell' }]], 'the row naming it stands under the account');
    const three = plan([{ name: 'Port Allen', parentAccount: 'Shell' }, { name: 'Port Allen', parentAccount: 'SHELL' }, { name: 'Port Allen', parentAccount: 'Acme Inc' }, { name: 'Dock', parentAccount: 'Port Allen' }]);
    assert.equal(why(three, 5), 'More than one account is named “Port Allen” — rows 2, 3 and 4 of this file. Import this row without a Parent Account and set its parent on its page.', 'three rows of the name: refused whatever became of two of them (REGRESSION, the review of 3a: the one left after Q6 was taken)');
    assert.deepEqual(three.records.map((r) => r.name), ['Port Allen'], 'the row under Acme is made; Dock is not');
    const two = plan([{ name: 'Gamma', parentAccount: '' }, { name: 'gamma', parentAccount: 'Shell' }, { name: 'Kid', parentAccount: 'GAMMA' }]);
    assert.equal(why(two, 4), 'More than one account is named “GAMMA” — rows 2 and 3 of this file. Import this row without a Parent Account and set its parent on its page.', 'two rows of the file of the name, under different parents: both made (Q6), the row naming them refused');
    assert.deepEqual(two.records.map((r) => r.name), ['Gamma', 'gamma']);
});

test("Q6: two new rows of one name under one Parent Account are both refused; a row's own name two live accounts share, or only a merged-away account has, refuses it; two rows matching one account refuse both", () => {
    const p = plan([
        { name: 'Dup', parentAccount: 'Shell' },
        { name: 'dup', parentAccount: 'SHELL' },
        { name: 'Shell - Port Allen', parentAccount: '' },
        { name: 'Old Acme', parentAccount: '' },
        { name: 'Acme Inc', parentAccount: '' },
        { name: 'ACME, INC', parentAccount: '' },
    ]);
    assert.deepEqual(p.records, []);
    assert.equal(why(p, 2), 'Rows 2 and 3 each make “Dup” under the same Parent Account — keep one of them.');
    assert.equal(why(p, 4), 'More than one account is named “Shell - Port Allen” — “Shell - Port Allen” (unit of Shell), “Shell - Port Allen” (site of Shell - Port Allen). Change the one you mean on its page.');
    assert.equal(why(p, 5), '“Old Acme” was merged into “Acme, Inc.” — write “Acme, Inc.” in its place to update it.', 'the duplicate a merge removed is not made again');
    assert.equal(why(p, 6), 'Rows 6 and 7 both match “Acme, Inc.” — keep one of them.', 'never two overwrites of one account');
});

test('a row of one live account of its name is its conflict — that one account, with what tells it apart; the conflicts index the rows kept (REGRESSION: the first of the name, merged-away included)', () => {
    const p = plan([{ name: 'Nope', parentAccount: 'Nobody' }, { name: 'acme inc', phone: '1' }, { name: 'New One', parentAccount: '' }]);
    assert.deepEqual(p.conflicts.map((c) => [c.incomingIndex, c.existing.id, c.note, c.matchReason, c.action]), [[0, 'acme', 'top level', 'same name', 'skip']]);
    assert.deepEqual(p.records.map((r) => r.name), ['acme inc', 'New One']);
    assert.ok(!('_ref' in p.records[0]), 'a conflict is no new row');
    const byId = new Map(ACCOUNTS.map((a) => [a.id, a]));
    assert.equal(accountNote(ACCOUNTS[2], byId), 'site of Shell - Port Allen');
    assert.equal(accountNote({ id: 'x', parentAccountId: 'gone', accountTier: 'business_unit' }, byId), 'a business unit', 'a parent the list does not hold: its tier');
    assert.equal(describeRefused(p.refused, 4), '1 of 4 rows will be refused — each is listed below with why; the rest import.');
    assert.equal(describeRefused([], 4), null);
});

test('mapCsvRows hands each record its row in the file — a refusal names it', () => {
    const fields = [{ key: 'name', label: 'Account Name', required: true }, { key: 'parentAccount', label: 'Parent Account' }];
    const m = mapCsvRows([['A', ''], ['', ''], ['B', 'A']], fields, { name: 0, parentAccount: 1 });
    assert.deepEqual(m.rowNumbers, [2, 4]);
    const p = planAccountImport(m.records, m.rowNumbers, []);
    assert.deepEqual(p.records.map((r) => [r.name, r._parent]), [['A', null], ['B', { ref: 0 }]]);
    assert.equal(planAccountImport([{ name: 'Z', parentAccount: 'Q' }], null, []).refused[0].rowNumber, 2, 'no numbers: index + 2');
    const lined = mapCsvRows([['A', ''], ['', ''], ['B', 'Nope']], fields, { name: 0, parentAccount: 1 }, [2, 4, 6]);
    assert.deepEqual([lined.rowNumbers, lined.dropped.map((d) => d.rowNumber)], [[2, 6], [4]], "each row named by its line in the file — the blank lines the parse dropped counted (the review of 3a)");
    const modal = code(read('src/components/modals/CsvImportModal.jsx'));
    assert.ok(modal.includes("return lines.map((l, i) => ({ l, row: i + 1 })).filter(x => x.l.trim());"), 'the parse keeps each record\'s row in the file');
    assert.ok(modal.includes('const body = records.slice(1).map(x => ({ cells: parseLine(x.l), row: x.row })).filter(x => x.cells.some(cell => cell));'));
    assert.ok(modal.includes('setCsvLines(body.map(x => x.row));') && modal.includes('const mapped = mapCsvRows(csvRows, appFields, fieldMapping, csvLines);'), 'and hands them to the mapper');
    const skipped = mapCsvRows([['A', ''], ['', ''], ['B', 'Nope']], fields, { name: 0, parentAccount: 1 });
    assert.deepEqual(planAccountImport(skipped.records, skipped.rowNumbers, []).refused.map((r) => r.rowNumber), [4], "the refusal names the file's row 4 — never 3, the row the mapper dropped (the review of 3a)");
});

test('the receipt counts the refused rows: never clean, said in its words', () => {
    const r = mergeReceipts(receiptFromPreflight({ refused: 2 }), { ...emptyReceipt(), created: 3, attempted: 3 });
    assert.equal(r.refused, 2);
    assert.equal(isClean(r), false);
    assert.equal(describeReceipt(r, 'account'), '3 accounts created. 2 rows refused — each is listed below with why.');
    assert.equal(isClean(mergeReceipts(receiptFromPreflight({}), { ...emptyReceipt(), created: 1, attempted: 1 })), true);
});

test("placeBulkRows: a bulk create's rows placed by the single save's rule over the org's accounts and the batch — a site, a loop, itself refused, naming the rows; each takes the tier that fits", () => {
    const fresh = (...ids) => new Set(ids);
    assert.deepEqual(placeBulkRows(ACCOUNTS, [{ id: 'n1', name: 'a', parentAccountId: 'pa_site' }], fresh('n1')),
        { status: 400, error: "“Shell - Port Allen” is a site — a site can't have accounts under it. Pick the account or business unit it belongs to.", ids: ['n1'] });
    const loop = placeBulkRows(ACCOUNTS, [{ id: 'n1', name: 'a', parentAccountId: 'n2' }, { id: 'n2', name: 'b', parentAccountId: 'n1' }], fresh('n1', 'n2'));
    assert.equal(loop.status, 400);
    assert.deepEqual([...loop.ids].sort(), ['n1', 'n2'], 'two rows naming each other');
    assert.deepEqual(placeBulkRows(ACCOUNTS, [{ id: 'n4', name: 'self', parentAccountId: 'n4' }], fresh('n4')), { status: 400, error: "An account can't be its own parent.", ids: ['n4'] });
    const ok = placeBulkRows(ACCOUNTS, [
        { id: 'n3', name: 'c', parentAccountId: 'n2' },
        { id: 'n1', name: 'a', parentAccountId: 'pa_unit' },
        { id: 'n2', name: 'b', parentAccountId: 'shell' },
        { id: 'n5', name: 'top', parentAccountId: null, accountTier: 'site' },
    ], fresh('n1', 'n2', 'n3', 'n5'));
    assert.deepEqual(Object.fromEntries(ok.tiers), { n1: 'site', n2: 'business_unit', n3: 'site', n5: 'account' }, 'a unit under an account, a site under a unit — the batch\'s own parent first; a top-level row an account, whatever it asks (REGRESSION: every sub-account a business unit)');
    const asked = placeBulkRows(ACCOUNTS, [{ id: 'a1', name: 'a', parentAccountId: 'shell', accountTier: 'site' }, { id: 'a2', name: 'b', parentAccountId: 'pa_unit', accountTier: 'business_unit' }], fresh('a1', 'a2'));
    assert.deepEqual(Object.fromEntries(asked.tiers), { a1: 'site', a2: 'site' }, 'the tier asked where it fits under its parent — a site under an account; else the lowest above it — a unit under a unit is a site');
    assert.deepEqual(placeBulkRows(ACCOUNTS, [{ id: 'x', name: 'A' }, { id: 'x', name: 'B', parentAccountId: 'pa_site' }], fresh('x')), { status: 400, error: 'A row id is sent twice in one batch.', ids: ['x'] }, 'an id twice: refused — one copy unplaced could land under a site (the review of 3a)');
    const taken = placeBulkRows(ACCOUNTS, [{ id: 'shell', name: 'Shell', parentAccountId: 'dock' }], fresh());
    assert.deepEqual([...taken.tiers], [], "a row of an id the org holds writes nothing — not placed");
});

test('THE GUARD: the modal plans an account import at Preview through planAccountImport over the caller\'s whole list, lists what it refused there and on the Results, counts them, and says an overwrite\'s Parent Account is not changed', () => {
    const m = code(read('src/components/modals/CsvImportModal.jsx'));
    assert.ok(m.includes("import { planAccountImport, describeRefused } from '../../utils/importLinks.js';"));
    assert.ok(m.includes('const plan = planAccountImport(mapped.records, mapped.rowNumbers, accounts);'));
    assert.ok(m.includes('return { ...mapped, records: plan.records, conflicts: plan.conflicts, refused: plan.refused, mapped: mapped.records };'), 'the refused rows leave the records');
    assert.ok(m.includes('const droppedNotice = describeDropped({ ...previewMap, records: previewMap.mapped || previewMap.records }, csvRows.length);'), "the dropped banner counts the mapper's records — rows a name refused are not rows missing their fields (the review of 3a)");
    assert.ok(m.includes('setRefusedRows(refused);'), 'the Results list what the receipt counts');
    assert.ok(m.includes("if (importType === 'accounts') return planned || conflicts;"), "an account's conflicts are the plan's — never the first of the name");
    assert.ok(!/existingAccounts\.find|norm\(a\.name\) === norm\(rec\.name\)/.test(m), 'no first-of-a-name account match left');
    assert.ok(m.includes('const checked = getMapped();\n        setCheckedMap(checked);\n        const { records: data, dropped, conflicts: planned, refused = [] } = checked;'), 'the plan Check for Duplicates read is kept');
    assert.ok(m.includes('const { records, dropped, refused = [] } = checkedMap || getMapped();'), 'the import from Conflicts sends the plan its conflicts index (the review of 3a)');
    assert.ok(m.includes("? ((importing || step === 'conflicts') && checkedMap ? checkedMap : getMapped())"), 'not planned again while the rows it sends land, nor under the Conflicts step (the review of 3a)');
    assert.ok(m.includes("{previewData.length > 0 && conflicts.length === previewData.length && bulkMode === 'skip' && ("), 'nothing to import is said whatever was refused (the review of 3a)');
    assert.ok(m.includes('{previewRefused.length > 0\n                                    ? `Every row of this file that can be imported already exists (${previewRefused.length} refused — listed at Preview).`'), '…and never that every record exists when some were refused');
    assert.ok(m.includes('runImport(data, [], dropped.length, refused);') && m.includes('runImport(records, conflicts, dropped.length, refused);'), 'both ways in carry the refused rows');
    assert.ok(m.includes('const preflight = receiptFromPreflight({ skipped: skippedCount, dropped: droppedCount, refused: refused.length });'));
    assert.ok(m.includes("setParentsIgnored(importType === 'accounts'\n            ? resolvedConflicts.filter(c => c.action === 'overwrite' && (c.incoming.parentAccount || '').trim() !== '').length"), 'Q5: an account overwrite\'s Parent Account counted');
    assert.ok(m.includes('Parent Account is not changed by an overwrite — {parentsIgnored} row{parentsIgnored === 1 ? \'\' : \'s\'} named one. Move each account on its own page.'));
    assert.ok(m.includes('<RefusedList rows={previewRefused} />') && m.includes('<RefusedList rows={refusedRows} />'), 'listed at Preview and on the Results');
    assert.ok(m.includes("{c.note ? `${c.note} · ${c.matchReason}` : c.matchReason}"), 'the conflict row says what tells the account apart');
    assert.ok(/^function RefusedList\(\{ rows \}\) \{/m.test(m), 'a module-scope component');
    assert.ok(m.includes('{refusedNotice && ('), 'the Preview says how many rows are refused');
    assert.ok(m.includes("{ n: r.refused,   label: 'refused',   color: T.warn,    show: r.refused > 0 },"), 'the Results count them in a tile');
});

test('THE GUARD: accounts.mjs places a bulk create by placeBulkRows before anything is written, and refuses a bulk overwrite that moves or renames an account, before the stored rows are written', () => {
    const s = read('netlify/functions/accounts.mjs');
    const post = s.slice(s.indexOf('// Bulk insert — body is an array'), s.indexOf('// Single insert'));
    assert.ok(post.includes('const repeated = [...new Set(batchIds.filter((id, k) => batchIds.indexOf(id) !== k))];'));
    assert.ok(post.indexOf("if (repeated.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'A row id is sent twice in one batch.', field: 'id', ids: repeated }) };") >= 0 && post.indexOf('if (repeated.length) return') < post.indexOf('const parents = await checkBulkLinks('), 'an id twice refuses the batch before anything is read (the review of 3a)');
    const at = (t) => { const i = post.indexOf(t); assert.ok(i >= 0, `missing: ${t.slice(0, 70)}`); return i; };
    assert.ok(at('const placed = placeBulkRows(data.some(d => d.parentAccountId) ? await orgTreeOf(orgId) : [], data, newIds);') > at('if (parents.error) return'), 'after the parents are known to be live rows of this org');
    assert.ok(at("if (placed.error) return { statusCode: placed.status, headers, body: JSON.stringify({ error: placed.error, field: 'parentAccountId', ids: placed.ids }) };") < at('const result = await bulkInsert('), 'refused whole, naming its rows, before the insert');
    assert.ok(post.includes('const clean = { ...sanitize(d), ...(placed.tiers.has(d.id) ? { accountTier: placed.tiers.get(d.id) } : {}) };'), "the rule's tier, never sanitize's business unit");
    const putAt = s.indexOf('// Bulk update — body is an array.');
    const put = s.slice(putAt, s.indexOf("if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };", putAt));
    assert.ok(putAt > 0 && put.length > 0);
    const p = (t) => { const i = put.indexOf(t); assert.ok(i >= 0, `missing: ${t.slice(0, 70)}`); return i; };
    assert.ok(p("if (moving.length) return { statusCode: 400, headers, body: JSON.stringify({ error: BULK_MOVE, field: 'parentAccountId', ids: moving }) };") > 0);
    assert.ok(put.includes("const renaming = data.filter(d => 'name' in d && storedName.has(d.id) && searchKey(d.name) !== searchKey(storedName.get(d.id))).map(d => d.id);"));
    assert.ok(put.includes("const storedName = new Map(stored.filter(r => mayMutate({ ownerId: r.ownerId, callerId, canSeeAll: canSeeAll(userRole) })).map(r => [r.id, r.name || '']));"), "only a row the caller may save is asked its name — a refusal never tells a rep the name of an account she can't open (the review of 3a)");
    assert.ok(p('const storedName = new Map(') > p('const callerId = await getCallerId(userId, orgId);'));
    assert.ok(put.includes('const stored = await db.select({ id: accounts.id, name: accounts.name, ownerId: accounts.ownerId })\n                    .from(accounts).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, data.map(d => d.id))));'), "the stored names read in this org only — another org's account is not found, never asked its name (the review of 3a)");
    assert.ok(p("if (renaming.length) return { statusCode: 400, headers, body: JSON.stringify({ error: BULK_RENAME, field: 'name', ids: renaming }) };") < p('const result = await bulkUpsert({'));
    assert.ok(put.includes("const anyName = data.some(d => 'name' in d);"));
    assert.ok(put.includes('const asSent = data.map(({ accountTier: _tier, ...d }) => (anyName && storedName.has(d.id) ? { ...d, name: storedName.get(d.id) } : d));'), "no tier stored; once any row sends a name, every row its own — never 'Unnamed Account' by the union (the review of 3a)");
    assert.ok(put.includes("const keyed = await rekeyBulkOwners(partialRows(asSent, sanitize), 'account', { table: accounts, orgId });"));
    assert.ok(s.includes("const BULK_MOVE = 'An overwrite never moves an account — move each one on its own page.';"));
    assert.ok(s.includes("const BULK_RENAME = 'An overwrite never renames an account — rename each one on its own page.';"));
});
