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
import { planAccountImport, planContactImport, planDealImport, describeRefused, accountNote } from '../src/utils/importLinks.js';
import { placeBulkRows } from '../src/utils/accountParent.js';
import { mapCsvRows, filledCells } from '../src/utils/csvMapping.js';
import {
    receiptFromPreflight, mergeReceipts, isClean, describeReceipt, emptyReceipt, receiptFromInsert, receiptFromUpdate, describeOwners,
} from '../src/utils/importReceipt.js';
import { partialRows } from '../netlify/functions/_sanitize.mjs';
import { makeBulkClient, BULK_CHUNK } from '../src/utils/bulkClient.js';
import { buildOpportunityRow } from '../src/utils/importRows.js';

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
    assert.ok(m.includes("import { planAccountImport, planContactImport, planDealImport, describeRefused } from '../../utils/importLinks.js';"));
    assert.ok(m.includes("const plan = importType === 'accounts' ? planAccountImport(mapped.records, mapped.rowNumbers, accounts)"));
    assert.ok(m.includes('return { ...mapped, records: plan.records, conflicts: plan.conflicts, refused: plan.refused, mapped: mapped.records };'), 'the refused rows leave the records');
    assert.ok(m.includes('const droppedNotice = describeDropped({ ...previewMap, records: previewMap.mapped || previewMap.records }, csvRows.length);'), "the dropped banner counts the mapper's records — rows a name refused are not rows missing their fields (the review of 3a)");
    assert.ok(m.includes('setRefusedRows(refused);'), 'the Results list what the receipt counts');
    assert.ok(m.includes('const detectDuplicates = (importType, planned) => planned || [];') && m.includes('const found = detectDuplicates(importType, planned);'), "every import's conflicts are the plan's — never the first of the name (state §0.216)");
    assert.ok(!/existingAccounts\.find|norm\(a\.name\) === norm\(rec\.name\)/.test(m), 'no first-of-a-name account match left');
    assert.ok(m.includes('const checked = getMapped();\n        setCheckedMap(checked);\n        const { records: data, dropped, conflicts: planned, refused = [] } = checked;'), 'the plan Check for Duplicates read is kept');
    assert.ok(m.includes('const { records, dropped, refused = [] } = checkedMap || getMapped();'), 'the import from Conflicts sends the plan its conflicts index (the review of 3a)');
    assert.ok(m.includes("? ((importing || step === 'conflicts') && checkedMap ? checkedMap : previewPlan)"), 'not planned again while the rows it sends land, nor under the Conflicts step (the review of 3a)');
    assert.ok(m.includes('const previewPlan = useMemo(() => (onPreview ? getMapped() : null),') && m.includes('[onPreview, importType, csvRows, csvLines, fieldMapping, accounts, contacts, opportunities]);'), 'planned once for the file, its mapping and the lists — never on every render (the review of 3b)');
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
    assert.ok(put.includes('const stored = await db.select()\n                    .from(accounts).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, data.map(d => d.id))));'), "the stored rows read in this org only — another org's account is not found, never asked its name (the review of 3a); whole, for partialRows' fill (state §0.216)");
    assert.ok(p("if (renaming.length) return { statusCode: 400, headers, body: JSON.stringify({ error: BULK_RENAME, field: 'name', ids: renaming }) };") < p('const result = await bulkUpsert({'));
    assert.ok(put.includes("const anyName = data.some(d => 'name' in d);"));
    assert.ok(put.includes('const asSent = data.map(({ accountTier: _tier, ...d }) => (anyName && storedName.has(d.id) ? { ...d, name: storedName.get(d.id) } : d));'), "no tier stored; once any row sends a name, every row its own — never 'Unnamed Account' by the union (the review of 3a)");
    assert.ok(put.includes("const keyed = await rekeyBulkOwners(partialRows(asSent, sanitize, new Map(stored.map(r => [r.id, r]))), 'account', { table: accounts, orgId });"), 'a key one row leaves out is its stored value (Q14, state §0.216)');
    assert.ok(s.includes("const BULK_MOVE = 'An overwrite never moves an account — move each one on its own page.';"));
    assert.ok(s.includes("const BULK_RENAME = 'An overwrite never renames an account — rename each one on its own page.';"));
});

// ── Batch 3b: the contact and deal imports (state §0.216; guide §18b106; Jeff, 29 Oct: Q3 "Refuse the row", Q4
// "Re-link it", Q11 "Importer, by id"; 30 Oct: Q13 "Refuse both", Q14 "Keep what's stored") ─────────────────────

const CONTACTS = [
    { id: 'c_ann', firstName: 'Ann', lastName: 'Lee', email: 'ann@shell.com', company: 'Shell', accountId: 'shell' },
    { id: 'c_bo1', firstName: 'Bo', lastName: 'Ray', email: 'bo@acme.com', company: 'Acme, Inc.', accountId: 'acme' },
    { id: 'c_bo2', firstName: 'Bo', lastName: 'Ray', email: 'bo@shell.com', company: 'Shell', accountId: 'shell' },
    { id: 'c_twin1', firstName: 'Cy', lastName: 'One', email: 'shared@x.com', company: 'Shell', accountId: 'shell' },
    { id: 'c_twin2', firstName: 'Cy', lastName: 'Two', email: 'SHARED@x.com', company: 'Acme, Inc.', accountId: 'acme' },
    { id: 'c_old', firstName: 'Old', lastName: 'Ann', email: 'old@shell.com', company: 'Shell', accountId: 'shell', mergeArchived: true, mergedIntoId: 'c_ann' },
    { id: 'c_text', firstName: 'Di', lastName: 'Text', email: '', company: 'acme inc' },
];
const contactPlan = (rows, contacts = CONTACTS) => planContactImport(rows, rows.map((_, i) => i + 2), ACCOUNTS, contacts);

test("THE CONTACT IMPORT (state §0.216): a Company is one account or a new company made once, never the first of a name — twins, a merged-away name and punctuation refused; a duplicate is one contact by email, else by name at its Company; two rows on one contact, or two new rows of one email (Q13), refused", () => {
    const p = contactPlan([
        { firstName: 'New', lastName: 'A', email: 'a@n.com', company: 'shell' },
        { firstName: 'New', lastName: 'B', email: 'b@n.com', company: 'ACME INC' },
        { firstName: 'New', lastName: 'C', email: 'c@n.com', company: 'Shell - Port Allen' },
        { firstName: 'New', lastName: 'D', email: 'd@n.com', company: 'Old Acme' },
        { firstName: 'New', lastName: 'E', email: 'e@n.com', company: '--' },
        { firstName: 'New', lastName: 'F', email: 'f@n.com', company: 'Zeta Co' },
        { firstName: 'New', lastName: 'G', email: 'g@n.com', company: 'ZETA, co.' },
        { firstName: 'New', lastName: 'H', email: 'h@n.com', company: '' },
        { firstName: 'New', lastName: 'I', email: 'i@n.com' },
    ]);
    const co = (last) => p.records.find((r) => r.lastName === last)?._company;
    assert.deepEqual(co('A'), { id: 'shell', name: 'Shell' }, "one account: linked by id, under its own spelling (REGRESSION: the text alone, no id)");
    assert.deepEqual(co('B'), { id: 'acme', name: 'Acme, Inc.' }, 'read as the pickers read it (searchKey)');
    assert.equal(why(p, 4), "More than one account is named “Shell - Port Allen” — “Shell - Port Allen” (unit of Shell), “Shell - Port Allen” (site of Shell - Port Allen). Import this row without a Company and set it on the contact's page.", 'twins: refused, naming each (REGRESSION: a twin company made, or the first taken)');
    assert.equal(why(p, 5), '“Old Acme” was merged into “Acme, Inc.” — write “Acme, Inc.” in its place.', 'a merged-away name: never matched, never made again (REGRESSION: "not in the list" read the merged-away account as there)');
    assert.equal(why(p, 6), '“--” has no letter or digit — a company name needs one.');
    assert.deepEqual(co('F'), { key: 'zeta co', name: 'Zeta Co' }, 'no account of the name: a new company');
    assert.deepEqual(co('G'), { key: 'zeta co', name: 'Zeta Co' }, 'made ONCE, under its first row\'s spelling (REGRESSION: "Zeta Co" and "ZETA, co." two accounts)');
    assert.equal(co('H'), null, 'a blank Company: no link');
    assert.equal(co('I'), null, 'no Company column: no link');
    assert.equal(p.conflicts.length, 0);

    const d = contactPlan([
        { firstName: 'Ann', lastName: 'Lee', email: ' ANN@shell.com ', company: '' },
        { firstName: 'Cy', lastName: 'X', email: 'shared@x.com', company: '' },
        { firstName: 'Q', lastName: 'Q', email: 'old@shell.com', company: '' },
        { firstName: 'Bo', lastName: 'Ray', email: '', company: 'Shell' },
        { firstName: 'Bo', lastName: 'Ray', email: '', company: '' },
        { firstName: 'Di', lastName: 'Text', email: '', company: 'Acme, Inc.' },
        { firstName: 'Bo', lastName: 'Ray', email: '', company: 'Nowhere Ltd' },
    ]);
    assert.deepEqual(d.conflicts.map((c) => [d.records[c.incomingIndex].firstName, c.existing.id, c.matchReason, c.note]), [
        ['Ann', 'c_ann', 'same email', 'Shell · ann@shell.com'],
        ['Bo', 'c_bo2', 'name match', 'Shell · bo@shell.com'],
        ['Di', 'c_text', 'name match', 'acme inc'],
    ], 'one contact of the email; else of the name AT its Company — by the account id, or a contact with none by its company\'s name (REGRESSION: the first of the email or name)');
    assert.equal(why(d, 3), 'More than one contact has the email “shared@x.com” — “Cy One” (Shell · shared@x.com), “Cy Two” (Acme, Inc. · SHARED@x.com). Change the one you mean on its page.', 'two of the email: refused, naming each');
    assert.equal(why(d, 4), 'The contact with “old@shell.com” was merged into “Ann Lee” — update “Ann Lee” instead.', 'an email only a merged-away contact has: never made again');
    assert.equal(why(d, 6), 'More than one contact is named “Bo Ray” — “Bo Ray” (Acme, Inc. · bo@acme.com), “Bo Ray” (Shell · bo@shell.com). Give this row the email of the one you mean.', 'two of the name, no Company to tell them: refused');
    assert.ok(d.records.some((r) => r.lastName === 'Ray' && r.company === 'Nowhere Ltd') && !d.conflicts.some((c) => d.records[c.incomingIndex].company === 'Nowhere Ltd'), 'a name at a company no Bo Ray stands on: a new contact');

    const twice = contactPlan([
        { firstName: 'Ann', lastName: 'Lee', email: 'ann@shell.com' },
        { firstName: 'Annie', lastName: 'Lee', email: 'Ann@Shell.com' },
        { firstName: 'N', lastName: 'One', email: 'dup@n.com' },
        { firstName: 'N', lastName: 'Two', email: 'DUP@n.com' },
        { firstName: 'N', lastName: 'Three', email: 'solo@n.com' },
    ]);
    assert.equal(why(twice, 2), 'Rows 2 and 3 both match “Ann Lee” — keep one of them.', 'two rows on one contact: both refused — never two overwrites of one');
    assert.equal(why(twice, 3), 'Rows 2 and 3 both match “Ann Lee” — keep one of them.');
    assert.equal(why(twice, 4), 'Rows 4 and 5 are the same contact (“dup@n.com”) — keep one of them.', 'Q13: two new rows of one email, both refused (REGRESSION: both made)');
    assert.equal(why(twice, 5), 'Rows 4 and 5 are the same contact (“DUP@n.com”) — keep one of them.');
    assert.deepEqual(twice.records.map((r) => r.lastName), ['Three']);
    const flip = contactPlan([{ firstName: 'Bo', lastName: 'Ray', company: 'Shell' }], [...CONTACTS].reverse());
    assert.equal(flip.conflicts[0].existing.id, 'c_bo2', 'the same in either list order');
});

const DEALS = [
    { id: 'd_pump', opportunityName: 'Pump', account: 'Shell', accountId: 'shell', stage: 'Proposal' },
    { id: 'd_text', opportunityName: 'Valves', account: 'acme, inc.', stage: 'Discovery' },
    { id: 'd_old', opportunityName: 'Seals', account: 'Old Acme', accountId: 'old_acme', stage: 'Qualification' },
    { id: 'd_twin1', opportunityName: 'Twin', account: 'Shell', accountId: 'shell', stage: 'Proposal' },
    { id: 'd_twin2', opportunityName: 'twin', account: 'Shell', accountId: 'shell', stage: 'Closed Lost' },
];
const dealPlan = (rows, accounts = ACCOUNTS) => planDealImport(rows, rows.map((_, i) => i + 2), accounts, DEALS);

test("THE DEAL IMPORT (state §0.216): an Account is one account the deal window takes — a site typed in full its account, the site its Site Name; none (Q3), twins, a site out of reach and a merged-away name refused; a duplicate is one deal of the name on that account; two rows on one deal, or two new rows of one deal (Q13), refused", () => {
    const p = dealPlan([
        { opportunityName: 'A', account: 'SHELL' },
        { opportunityName: 'B', account: 'Dock 9' },
        { opportunityName: 'C', account: 'Shell - Port Allen' },
        { opportunityName: 'D', account: 'Old Acme' },
        { opportunityName: 'E', account: 'Nobody Co' },
        { opportunityName: 'F', account: '' },
        { opportunityName: 'G' },
        { opportunityName: 'H', account: '…' },
        { opportunityName: '', account: 'acme inc' },
    ]);
    const link = (n) => p.records.find((r) => r.opportunityName === n)?._link;
    assert.deepEqual(link('A'), { id: 'shell', name: 'Shell', site: '', siteId: '' }, 'one account: by id, under its own spelling (REGRESSION: the text alone, no id)');
    assert.equal(p.records.find((r) => r.opportunityName === 'A').account, 'Shell', "the row reads the account's own spelling");
    assert.deepEqual(link('B'), { id: 'shell', name: 'Shell', site: 'Dock 9', siteId: 'dock' }, "a site typed in full: its account, the site its Site Name (D5) — REGRESSION: the site stored as the deal's account");
    assert.equal(why(p, 4), "More than one account is named “Shell - Port Allen” — “Shell - Port Allen” (unit of Shell), “Shell - Port Allen” (site of Shell - Port Allen). Rename one of them, or set this deal's account on its page.", "UKG's twins: refused, naming each");
    assert.equal(why(p, 5), '“Old Acme” was merged into “Acme, Inc.” — write “Acme, Inc.” in its place.');
    assert.equal(why(p, 6), 'No account is named “Nobody Co” — import or create the account first.', 'Q3: "Refuse the row"');
    assert.equal(why(p, 7), 'A deal needs its account — this row names none.');
    assert.equal(why(p, 8), 'A deal needs its account — this row names none.', 'no Account column: refused too');
    assert.equal(why(p, 9), '“…” has no letter or digit — an account name needs one.');
    assert.deepEqual(link('acme inc'), { id: 'acme', name: 'Acme, Inc.', site: '', siteId: '' }, 'a blank Opportunity Name: the Account as typed');
    const outOfReach = dealPlan([{ opportunityName: 'Z', account: 'Dock 9' }], ACCOUNTS.filter((a) => a.id !== 'shell'));
    assert.equal(why(outOfReach, 2), '“Dock 9” is a site of an account you can\'t open — ask your manager to link it.', "a site whose account the list does not hold (a rep's scope, D11)");

    const d = dealPlan([
        { opportunityName: 'pump', account: 'Shell' },
        { opportunityName: 'Valves', account: 'Acme Inc' },
        { opportunityName: 'Seals', account: 'Acme, Inc.' },
        { opportunityName: 'Twin', account: 'Shell' },
        { opportunityName: 'Pump', account: 'Acme, Inc.' },
    ]);
    assert.deepEqual(d.conflicts.map((c) => [d.records[c.incomingIndex].opportunityName, c.existing.id, c.note]), [
        ['pump', 'd_pump', 'Shell · Proposal'],
        ['Valves', 'd_text', 'acme, inc. · Discovery'],
        ['Seals', 'd_old', 'Old Acme · Qualification'],
    ], 'one deal of the name on its account: by id, an id merged away standing on its survivor, a deal with no id by its account\'s name (REGRESSION: the first deal of the name and account TEXT)');
    assert.equal(why(d, 5), 'More than one deal is named “Twin” on “Shell” — “Twin” (Proposal), “twin” (Closed Lost). Change the one you mean on its page.');
    assert.ok(d.records.some((r) => r.opportunityName === 'Pump' && r._link.id === 'acme') && d.conflicts.every((c) => d.records[c.incomingIndex]._link.id !== 'acme' || c.existing.id !== 'd_pump'), 'the name on another account: a new deal');

    const twice = dealPlan([
        { opportunityName: 'Pump', account: 'Shell' },
        { opportunityName: 'PUMP', account: 'shell' },
        { opportunityName: 'New', account: 'Shell' },
        { opportunityName: 'new', account: 'Dock 9' },
        { opportunityName: 'New', account: 'Acme, Inc.' },
    ]);
    assert.equal(why(twice, 2), 'Rows 2 and 3 both match the deal “Pump” — keep one of them.', 'two rows on one deal: both refused');
    assert.equal(why(twice, 4), 'Rows 4 and 5 each make the deal “New” on “Shell” — keep one of them.', "Q13: two new rows of one deal — a site typed in full is its account's — both refused");
    assert.equal(why(twice, 5), 'Rows 4 and 5 each make the deal “new” on “Shell” — keep one of them.');
    assert.deepEqual(twice.records.map((r) => [r.opportunityName, r._link.id]), [['New', 'acme']], 'the name on another account: its own deal');
});

test("AN OVERWRITE'S BLANK CELL (Q14, state §0.216): the Overwrite sends only the cells the file fills — the server fills a left-out key from the stored row, never writes it empty (filledCells, partialRows run)", () => {
    assert.deepEqual(filledCells({ id: 'x', stage: '', salesRep: '  ', arr: '0', notes: 'n', _link: { id: 'a' }, amount: 0 }), { id: 'x', arr: '0', notes: 'n', _link: { id: 'a' }, amount: 0 }, 'blank text left out; a filled cell, a zero and an annotation kept');
    assert.deepEqual(filledCells(undefined), {});
    const sanitize = (d) => ({ id: d.id, stage: d.stage || 'Discovery', salesRep: d.salesRep || null, arr: d.arr ?? null, notes: d.notes || null });
    const rows = [{ id: 'd1', stage: 'Proposal' }, { id: 'd2', notes: 'hello' }];
    assert.deepEqual(partialRows(rows, sanitize), [{ id: 'd1', stage: 'Proposal', notes: null }, { id: 'd2', stage: 'Discovery', notes: 'hello' }], 'REGRESSION without the stored rows: the union wrote a left-out key empty — d2 set to Discovery, d1 its notes blanked');
    const stored = new Map([['d1', { id: 'd1', stage: 'Won', notes: 'kept', salesRep: 'Ann' }], ['d2', { id: 'd2', stage: 'Proposal', notes: 'old' }]]);
    assert.deepEqual(partialRows(rows, sanitize, stored), [{ id: 'd1', stage: 'Proposal', notes: 'kept' }, { id: 'd2', stage: 'Proposal', notes: 'hello' }], 'each left-out key its stored value; a key no row sends never written');
    assert.deepEqual(partialRows([{ id: 'gone', stage: 'X' }, { id: 'd2', notes: 'y' }], sanitize, stored), [{ id: 'gone', stage: 'X', notes: null }, { id: 'd2', stage: 'Proposal', notes: 'y' }], 'a row not stored: as before (bulkUpsert answers it not found)');
});

test("THE RECEIPT (state §0.216): the contact import's new companies are counted apart, never as contacts; the server's owner names are kept, each once, and said on the Results (Q11)", () => {
    const a = { ...emptyReceipt(), created: 2, unmatchedOwners: ['Zed'], ambiguousOwners: ['Sam'] };
    const b = { ...emptyReceipt(), updated: 1, unmatchedOwners: ['Zed', 'Yan'], companies: 0 };
    const c = { ...emptyReceipt(), companies: 2 };
    const m = mergeReceipts(a, b, c);
    assert.equal(m.created, 2, 'REGRESSION: 2 contacts and 2 companies read "4 contacts created"');
    assert.equal(m.companies, 2);
    assert.deepEqual(m.unmatchedOwners, ['Zed', 'Yan']);
    assert.deepEqual(m.ambiguousOwners, ['Sam']);
    assert.ok(isClean(m), 'an owner name is said, never a failure');
    assert.deepEqual(describeOwners(m), [
        'No member is named “Zed”, “Yan” — those rows were saved with no owner. Set the owner on each record\'s page.',
        'More than one member is named “Sam” — those rows were saved with no owner (an overwrite kept the owner it had). Set the owner on each record\'s page.',
    ]);
    assert.equal(describeOwners(emptyReceipt()), null);
    assert.deepEqual(receiptFromInsert({ attempted: 1, landed: [{}], unmatchedOwners: ['Q'] }).unmatchedOwners, ['Q']);
    assert.deepEqual(receiptFromUpdate({ attempted: 1, updated: 1, ambiguousOwners: ['R'] }).ambiguousOwners, ['R']);
});

test('THE BULK CLIENT (state §0.216): the owner names each chunk answers are kept across the chunks, each once — they were dropped', async () => {
    const answers = [
        { insertedIds: Array.from({ length: BULK_CHUNK }, (_, i) => `n${i}`), unmatchedOwners: ['Zed'], ambiguousOwners: [] },
        { insertedIds: ['n400'], unmatchedOwners: ['Zed', 'Yan'], ambiguousOwners: ['Sam'] },
    ];
    let k = 0;
    const fetchFn = async () => ({ ok: true, status: 201, json: async () => answers[k++] });
    const res = await makeBulkClient(fetchFn).postNew('/x', Array.from({ length: BULK_CHUNK + 1 }, (_, i) => ({ id: `n${i}` })));
    assert.deepEqual(res.unmatchedOwners, ['Zed', 'Yan']);
    assert.deepEqual(res.ambiguousOwners, ['Sam']);
    const put = await makeBulkClient(async () => ({ ok: true, status: 200, json: async () => ({ updated: 1, notFound: [], forbidden: [], ambiguousOwners: ['Sam'] }) })).putBulk('/x', [{ id: 'a' }]);
    assert.deepEqual(put.ambiguousOwners, ['Sam']);
    assert.deepEqual(put.unmatchedOwners, []);
});

test("Q11 (state §0.216): a new deal with no Sales Rep is the importer's, by id — the server stamps the member's name; with no profile yet, the name as before; an overwrite never sends one", () => {
    const opts = { currentUser: 'Jeff Russell', currentUserId: 'usr_jeff', today: '2026-10-30', newId: () => 'n1' };
    const made = buildOpportunityRow({ opportunityName: 'X', account: 'Shell' }, opts);
    assert.equal(made.ownerId, 'usr_jeff', 'the importer by id (REGRESSION: by NAME, unowned where another member shares it)');
    assert.equal(made.salesRep, '', 'no name sent: the server stamps the member\'s own');
    const named = buildOpportunityRow({ opportunityName: 'X', account: 'Shell', salesRep: 'Karen' }, opts);
    assert.equal(named.salesRep, 'Karen');
    assert.ok(!('ownerId' in named), 'a Sales Rep named: resolved by name, as before');
    const early = buildOpportunityRow({ opportunityName: 'X', account: 'Shell' }, { ...opts, currentUserId: '' });
    assert.equal(early.salesRep, 'Jeff Russell');
    assert.ok(!('ownerId' in early));
    const over = buildOpportunityRow({ opportunityName: 'X' }, { ...opts, existingId: 'd1' });
    assert.ok(!('ownerId' in over) && !('salesRep' in over), 'an overwrite sends what the file fills, no owner');
});

test("THE GUARD (state §0.216): the modal plans the contact and deal imports at Preview, an Overwrite sends the cells the file fills, and the Results count the new companies and say the owner names", () => {
    const m = code(read('src/components/modals/CsvImportModal.jsx'));
    assert.ok(m.includes(": importType === 'contacts' ? planContactImport(mapped.records, mapped.rowNumbers, accounts, contacts)"), "the caller's whole lists — merged-away rows name their survivors");
    assert.ok(m.includes(": importType === 'opportunities' ? planDealImport(mapped.records, mapped.rowNumbers, accounts, opportunities)"));
    assert.ok(m.includes('.map(c => ({ ...filledCells(c.incoming), _existingId: c.existing.id }));'), 'Q14: an Overwrite\'s blank cell is not sent');
    assert.ok(m.includes("import { mapCsvRows, describeDropped, filledCells } from '../../utils/csvMapping';"));
    assert.ok(!/existingContacts\.find|existingOpps\.find|norm\(o\.account\) === norm\(rec\.account\)/.test(m), 'no first-of-a-name contact or deal match left');
    assert.ok(m.includes("{importType === 'contacts' && r.companies > 0 && ` ${r.companies} new compan${r.companies === 1 ? 'y was' : 'ies were'} added to your Accounts list.`}"), 'the new companies counted apart');
    assert.ok(m.includes('{(describeOwners(r) || []).map(line => ('), 'the owner names said');
    const ml = code(read('src/components/layout/ModalLayer.jsx'));
    const contacts = ml.slice(ml.indexOf('onImportContacts={async'), ml.indexOf('onImportAccounts={async'));
    assert.ok(contacts.includes('if (co && co.key && !made.has(co.key)) made.set(co.key, { id: crypto.randomUUID(), name: co.name });'), 'a new company made ONCE per name, for the rows sent — a skipped row makes none');
    assert.ok(contacts.includes('for (const c of [...newContacts, ...overwrites]) {'), "an overwrite's new Company is made too (Q4)");
    assert.ok(contacts.includes('return { ...row, company: to.name, accountId: to.id };'), 'every contact linked by id, its Company the account\'s own name (REGRESSION: no contact was ever linked)');
    assert.ok(contacts.includes('...paired(c),') && contacts.includes('const { _existingId, ...row } = paired(c);'), 'new and overwritten alike');
    assert.ok(contacts.includes("if (companies < newAccts.length) {") && contacts.includes("}, 'contact');"), 'a company that did not save: no contact sent, every contact counted not saved, the companies apart');
    assert.ok(contacts.includes('return settle(mergeReceipts(...phases, { ...emptyReceipt(), companies }), \'contact\');'), 'the companies never summed into the contacts');
    assert.ok(!contacts.includes('existingNames') && !contacts.includes('newCompanies'), 'no whole-list name compare left');
    const deals = ml.slice(ml.indexOf('onImportOpportunities={async'), ml.indexOf('onImportUsers={async'));
    assert.ok(deals.includes('const { _link: link, ...csv } = o;') && deals.includes('return { ...row, account: link.name, accountId: link.id, ...(link.site ? { site: link.site } : {}) };'), "each deal by its account's id and own name, a site typed in full its Site Name");
    assert.ok(deals.includes('currentUserId,'), 'Q11: the importer by id');
    assert.ok(deals.includes('if (created) loadOpportunities(() => {});') && deals.indexOf('if (created) loadOpportunities(() => {});') > deals.indexOf('phases.push(receiptFromUpdate(ow));'), 'the deals read again as stored — the owner and name the server stamped — once the overwrite is answered (the review of 3b)');
    assert.ok(deals.includes('if (!isClean(receipt) && created) loadOpportunities(() => {});'), 'and before a failure is said');
});

test("THE GUARD (state §0.216): the deals bulk create stamps the importer by id as a member of this org, and every bulk overwrite fills a left-out key from its stored row", () => {
    const o = read('netlify/functions/opportunities.mjs');
    const own = o.slice(o.indexOf('async function importerOwners(rows, orgId) {'), o.indexOf('// ── Handler'));
    assert.ok(own.includes("const sent = rows.map((d) => (String(d?.salesRep ?? '').trim() === '' && d?.ownerId ? String(d.ownerId) : null));"), 'only a row naming no Sales Rep');
    assert.ok(own.includes('for (const id of new Set(sent.filter(Boolean))) members.set(id, await rosterUserById(id, orgId));'), 'a member of THIS org');
    assert.ok(own.includes("if (strangers.length) return { status: 400, error: OWNER_NOT_MEMBER, field: 'ownerId', ids: strangers };"), 'another id refuses the request, naming its rows');
    const post = o.slice(o.indexOf('// Bulk insert — body is an array'), o.indexOf('// Single insert'));
    assert.ok(post.includes('const importer = await importerOwners(people.rows, orgId);') && post.indexOf('const importer = await importerOwners(') < post.indexOf('const result = await bulkInsert('));
    assert.ok(post.includes('if (importer.error) return { statusCode: importer.status, headers, body: JSON.stringify({ error: importer.error, field: importer.field, ids: importer.ids }) };'), "the refusal is answered, naming its rows — never a 500 from a stranger's id");
    assert.ok(post.includes('owned.rows = owned.rows.map((r, i) => { const m = importer.memberOf(i); return m ? { ...r, ownerId: m.id, salesRep: m.name || null } : r; });'), "the member's id and name together — never one without the other");
    assert.ok(o.includes("const keyed = await rekeyBulkOwners(partialRows(staged.rows, sanitize, priors), 'opportunity', { table: opportunities, orgId });"));
    const san = read('netlify/functions/_sanitize.mjs');
    assert.ok(san.includes('export function partialRows(rows, sanitize, stored = null) {'));
    assert.ok(san.includes('if (was) for (const key of supplied) if (!Object.hasOwn(row, key) && Object.hasOwn(was, key)) filled[key] = was[key];') && san.includes('const full = sanitize({ ...filled, ...row });'));
});

test("THE REVIEW OF 3b, round 1: a contact on an account merged away is matched on the account it was merged into; a linked contact whose company text reads as a new company is not that company's; a name-matched row and a new row of one email both refused; a deal name of no letter or digit refused; a site that leads to no account refused as a site", () => {
    const people = [
        { id: 'c_onold', firstName: 'Eve', lastName: 'Old', email: '', company: 'Old Acme', accountId: 'old_acme' },
        { id: 'c_stale', firstName: 'Fay', lastName: 'Ng', email: '', company: 'Zeta Co', accountId: 'shell' },
        { id: 'c_named', firstName: 'Gus', lastName: 'Lo', email: 'gus@old.com', company: 'Shell', accountId: 'shell' },
        { id: 'c_gone', firstName: 'X', lastName: 'Gone', email: 'x@gone.com', mergeArchived: true, mergedIntoId: 'c_named' },
    ];
    const p = planContactImport([
        { firstName: 'Eve', lastName: 'Old', company: 'Acme, Inc.' },
        { firstName: 'Fay', lastName: 'Ng', company: 'Zeta Co' },
        { firstName: 'Gus', lastName: 'Lo', email: 'gus@new.com', company: 'Shell' },
        { firstName: 'Hal', lastName: 'Ma', email: 'GUS@new.com' },
    ], [2, 3, 4, 5], ACCOUNTS, people);
    assert.deepEqual(p.conflicts.map((c) => [p.records[c.incomingIndex].firstName, c.existing.id]), [['Eve', 'c_onold']], 'a contact on an account merged into Acme stands on Acme');
    assert.deepEqual(p.records.find((r) => r.firstName === 'Fay')._company, { key: 'zeta co', name: 'Zeta Co' });
    assert.ok(!p.conflicts.some((c) => c.existing.id === 'c_stale'), "a contact linked to Shell is not the new company Zeta Co's, whatever its text says");
    assert.equal(why(p, 4), 'Rows 4 and 5 are the same contact (“gus@new.com”) — keep one of them.', 'an overwrite by name would give Gus the email the new row makes a second contact of');
    assert.equal(why(p, 5), 'Rows 4 and 5 are the same contact (“GUS@new.com”) — keep one of them.');

    const d = planDealImport([{ opportunityName: '***', account: 'Shell' }, { opportunityName: '!!!', account: 'Shell' }], [2, 3], ACCOUNTS, [{ id: 'dx', opportunityName: '---', account: 'Shell', accountId: 'shell' }]);
    assert.equal(why(d, 2), '“***” has no letter or digit — a deal name needs one.', 'never one name with every other such name');
    assert.equal(why(d, 3), '“!!!” has no letter or digit — a deal name needs one.');
    assert.equal(d.conflicts.length, 0);
    const lone = planDealImport([{ opportunityName: 'Z', account: 'Lone Site' }], [2], [...ACCOUNTS, { id: 'lone', name: 'Lone Site', accountTier: 'site', parentAccountId: 'dock' }], []);
    assert.equal(why(lone, 2), '“Lone Site” is a site — pick the account it belongs to.', 'a site whose parent is a site leads to no account');
});

test("THE REVIEW OF 3b, round 2: a deal an older import saved on a site — by the site's id, or with no id by its name — is the duplicate of a row typed as that site; a new company is named as the first row that imports spells it, and each row reads it; a contact with no account id at a company no account has is the duplicate by name there", () => {
    const old = [
        { id: 'd_site_id', opportunityName: 'Q4', account: 'Dock 9', accountId: 'dock', stage: 'Proposal' },
        { id: 'd_site_text', opportunityName: 'Q5', account: 'dock 9', stage: 'Discovery' },
    ];
    const d = planDealImport([{ opportunityName: 'Q4', account: 'Dock 9' }, { opportunityName: 'q5', account: 'Dock 9' }], [2, 3], ACCOUNTS, old);
    assert.deepEqual(d.conflicts.map((c) => c.existing.id), ['d_site_id', 'd_site_text'], 'REGRESSION: each made again on Shell');

    const p = planContactImport([
        { firstName: 'R', lastName: 'One', email: 'x@y.com', company: 'ACME CO' },
        { firstName: 'R', lastName: 'Two', email: 'X@y.com', company: 'acme co' },
        { firstName: 'R', lastName: 'Three', email: 'q@y.com', company: 'Acme Co' },
        { firstName: 'R', lastName: 'Four', email: 'z@y.com', company: 'ACME co' },
    ], [2, 3, 4, 5], ACCOUNTS, []);
    assert.deepEqual(p.records.map((r) => [r.lastName, r.company, r._company]), [
        ['Three', 'Acme Co', { key: 'acme co', name: 'Acme Co' }],
        ['Four', 'Acme Co', { key: 'acme co', name: 'Acme Co' }],
    ], "never the spelling of a row refused (2 and 3, Q13); each row reads the Company it is saved under");

    const people = [
        { id: 'c_free', firstName: 'Sam', lastName: 'Free', email: '', company: 'zeta co' },
        { id: 'c_other', firstName: 'Sam', lastName: 'Free', email: '', company: 'Other Text' },
    ];
    const q = planContactImport([{ firstName: 'Sam', lastName: 'Free', company: 'Zeta Co' }], [2], ACCOUNTS, people);
    assert.deepEqual(q.conflicts.map((c) => [c.existing.id, c.matchReason]), [['c_free', 'name match']], 'by its company text where neither has an account id — not one at another text');
});

test("THE REVIEW OF 3b, round 3: a deal saved on a site is on the site's account whichever way a row names it — two rows on it both refused; a rep's contact linked outside her list, its Company its own, keeps its stored pair — never moved onto a new company", () => {
    const onSite = [{ id: 'd_dock', opportunityName: 'Pump', account: 'Dock 9', accountId: 'dock', stage: 'Proposal' }];
    const one = planDealImport([{ opportunityName: 'Pump', account: 'Shell' }], [2], ACCOUNTS, onSite);
    assert.deepEqual(one.conflicts.map((c) => c.existing.id), ['d_dock'], "a row naming Shell meets the deal on Shell's site");
    const textOnly = planDealImport([{ opportunityName: 'Pump', account: 'Shell' }], [2], ACCOUNTS, [{ id: 'd_txt', opportunityName: 'Pump', account: 'dock 9' }]);
    assert.deepEqual(textOnly.conflicts.map((c) => c.existing.id), ['d_txt'], 'a deal with no id, by its site\'s name');
    const both = planDealImport([{ opportunityName: 'Pump', account: 'Dock 9' }, { opportunityName: 'pump', account: 'Shell' }], [2, 3], ACCOUNTS, onSite);
    assert.equal(why(both, 2), 'Rows 2 and 3 both match the deal “Pump” — keep one of them.', 'REGRESSION: one an overwrite of the site deal, the other a second Pump on Shell');
    assert.equal(both.records.length, 0);

    const mine = [{ id: 'c_mine', firstName: 'Kay', lastName: 'Rep', email: 'kay@x.com', company: 'Acme Hidden', accountId: 'acct_other_rep' }];
    const p = planContactImport([
        { firstName: 'Kay', lastName: 'Rep', email: 'kay@x.com', company: 'ACME hidden' },
        { firstName: 'New', lastName: 'Person', email: 'np@x.com', company: 'Acme Hidden' },
    ], [2, 3], ACCOUNTS, mine);
    const kay = p.records.find((r) => r.firstName === 'Kay');
    assert.deepEqual(kay._company, { keep: true, name: 'Acme Hidden' }, 'the stored pair stands — its account is outside the list, its name its own');
    assert.equal(p.conflicts[0].existing.id, 'c_mine');
    assert.deepEqual(p.records.find((r) => r.firstName === 'New')._company, { key: 'acme hidden', name: 'Acme Hidden' }, 'a new contact of the name: a new company, as Q2 leaves it');
    const elsewhere = planContactImport([{ firstName: 'Kay', lastName: 'Rep', email: 'kay@x.com', company: 'Zeta Co' }], [2], ACCOUNTS, mine);
    assert.deepEqual(elsewhere.records[0]._company, { key: 'zeta co', name: 'Zeta Co' }, 'another Company: re-linked, as Q4 says');
    const ml = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(ml.includes('if (co.keep) { const { company: _held, ...kept } = row; return kept; }'), 'the overwrite sends neither the Company nor an account id');
});

test("THE REVIEW OF 3b, round 4: a rep's own deal on an account outside her list is its duplicate, its stored pair kept — never refused as an account not saved; a deal on another account's site is not the duplicate; the two contact refusals with no survivor and at a Company", () => {
    const hers = [{ id: 'd_hers', opportunityName: 'Widget', account: 'Bob Acme', accountId: 'acct_bob', stage: 'Proposal' }];
    const p = planDealImport([{ opportunityName: 'Widget', account: 'bob acme' }, { opportunityName: 'Gadget', account: 'Bob Acme' }], [2, 3], ACCOUNTS, hers);
    assert.deepEqual(p.conflicts.map((c) => [c.existing.id, p.records[c.incomingIndex]._link]), [['d_hers', { id: 'acct_bob', name: 'Bob Acme', site: '', siteId: '', keep: true }]], 'her deal: the duplicate, its pair kept (REGRESSION: refused as no account of the name)');
    assert.equal(why(p, 3), 'No account is named “Bob Acme” — import or create the account first.', 'a new deal there: still refused (Q3)');
    const ml = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(ml.includes('if (link.keep) { const { account: _held, ...kept } = row; return kept; }'), 'the overwrite sends neither the account nor its id');

    const other = planDealImport([{ opportunityName: 'Pump', account: 'Acme, Inc.' }], [2], ACCOUNTS, [
        { id: 'd_dock', opportunityName: 'Pump', account: 'Dock 9', accountId: 'dock', stage: 'Proposal' },
        { id: 'd_dock_text', opportunityName: 'Pump', account: 'Dock 9', stage: 'Proposal' },
    ]);
    assert.equal(other.conflicts.length, 0, "a site of Shell is not Acme's");
    assert.deepEqual([other.refused.length, other.records.length], [0, 1], "nor its name's — the row imports new (the harness: a site of any account read as Acme's refused it as two)");

    const twins = planDealImport([{ opportunityName: 'Widget', account: 'Bob Acme' }], [2], ACCOUNTS, [
        ...hers, { id: 'd_hers_old', opportunityName: 'Widget', account: 'Bob Acme Old', accountId: 'acct_bob', stage: 'Lead' },
    ]);
    assert.equal(why(twins, 2), 'More than one deal is named “Widget” on “Bob Acme” — “Widget” (Proposal), “Widget” (Lead). Change the one you mean on its page.', 'two of her deals of the name on the held account refuse the row, as on a listed account — never the one whose stored text reads as the row (the harness)');

    const q = planContactImport([
        { firstName: 'Lo', lastName: 'Ne', email: 'lone@x.com' },
        { firstName: 'Bo', lastName: 'Ray', company: 'Shell' },
    ], [2, 3], ACCOUNTS, [
        { id: 'c_lost', firstName: 'Lo', lastName: 'Ne', email: 'lone@x.com', mergeArchived: true, mergedIntoId: 'nobody' },
        { id: 'b1', firstName: 'Bo', lastName: 'Ray', email: 'b1@x.com', company: 'Shell', accountId: 'shell' },
        { id: 'b2', firstName: 'Bo', lastName: 'Ray', email: 'b2@x.com', company: 'Shell', accountId: 'shell' },
    ]);
    assert.equal(why(q, 2), 'The contact with “lone@x.com” was merged into another contact.');
    assert.equal(why(q, 3), 'More than one contact is named “Bo Ray” at “Shell” — “Bo Ray” (Shell · b1@x.com), “Bo Ray” (Shell · b2@x.com). Give this row the email of the one you mean.');
});

test("THE REVIEW OF 3b, round 5: a rep's own contact linked outside her list is the duplicate by name too, its pair kept; two of her deals of a name outside her list refuse the row naming both; a deal on a listed account is never matched by stale text", () => {
    const mine = [{ id: 'c_js', firstName: 'John', lastName: 'Smith', email: '', company: 'Acme Hidden', accountId: 'acct_other_rep' }];
    const p = planContactImport([{ firstName: 'John', lastName: 'Smith', email: '', company: 'ACME HIDDEN' }], [2], ACCOUNTS, mine);
    assert.deepEqual(p.conflicts.map((c) => [c.existing.id, c.matchReason]), [['c_js', 'name match']], 'REGRESSION: a second John Smith and a second company');
    assert.deepEqual(p.records[0]._company, { keep: true, name: 'Acme Hidden' });

    const two = [
        { id: 'w1', opportunityName: 'Widget', account: 'Bob Acme', accountId: 'acct_bob', stage: 'Proposal' },
        { id: 'w2', opportunityName: 'widget', account: 'Bob Acme', accountId: 'acct_bob', stage: 'Closed Lost' },
    ];
    const d = planDealImport([{ opportunityName: 'Widget', account: 'Bob Acme' }], [2], ACCOUNTS, two);
    assert.equal(why(d, 2), 'More than one deal is named “Widget” on “Bob Acme” — “Widget” (Proposal), “widget” (Closed Lost). Change the one you mean on its page.', 'never the first, and never "no account" while the account stands');
    const apart = planDealImport([{ opportunityName: 'Widget', account: 'Bob Acme' }], [2], ACCOUNTS, [
        two[0], { ...two[1], accountId: 'acct_bob_2' },
    ]);
    assert.equal(why(apart, 2), 'More than one deal is named “Widget” on “Bob Acme” — “Widget” (Proposal), “widget” (Closed Lost). Change the one you mean on its page.', 'two of her deals of the name on two accounts of that name outside her list: refused — never the first one\'s account taken (the harness of §0.216)');
    assert.equal(apart.conflicts.length, 0);
    const stale = planDealImport([{ opportunityName: 'Old', account: 'Shell Old Name' }], [2], ACCOUNTS, [{ id: 'd_stale', opportunityName: 'Old', account: 'Shell Old Name', accountId: 'shell', stage: 'Proposal' }]);
    assert.equal(why(stale, 2), 'No account is named “Shell Old Name” — import or create the account first.', "a deal on a listed account is matched by its account, never by text it kept from before a rename");
});

test("THE REVIEW OF 3b, round 6: a blank Opportunity Name is the Account as typed — a site's name, never its account's — so a re-import meets the deal an older import made, and two sites of one account make two deals", () => {
    const older = [{ id: 'd_older', opportunityName: 'Dock 9', account: 'Dock 9', stage: 'Discovery' }];
    const again = planDealImport([{ opportunityName: '', account: 'Dock 9' }], [2], ACCOUNTS, older);
    assert.deepEqual(again.conflicts.map((c) => c.existing.id), ['d_older'], 'REGRESSION: a second deal named Shell beside it');
    const accounts = [...ACCOUNTS, { id: 'dock2', name: 'Dock 10', accountTier: 'site', parentAccountId: 'shell' }];
    const two = planDealImport([{ opportunityName: '', account: 'Dock 9' }, { opportunityName: '', account: 'Dock 10' }], [2, 3], accounts, []);
    assert.deepEqual(two.records.map((r) => [r.opportunityName, r.account, r._link.site]), [['Dock 9', 'Shell', 'Dock 9'], ['Dock 10', 'Shell', 'Dock 10']], 'each named as typed, on Shell with its Site Name — REGRESSION: both refused as one deal "Shell"');
});

test("THE REVIEW OF 3b, round 7: an overwrite's blank Opportunity Name is not sent — the stored name stands (Q14); a site under an account merged away leads to no account", () => {
    const p = planDealImport([{ opportunityName: '', account: 'Shell' }], [2], ACCOUNTS, [{ id: 'd_caps', opportunityName: 'SHELL', account: 'Shell', accountId: 'shell', stage: 'Proposal' }]);
    assert.equal(p.conflicts[0].existing.id, 'd_caps');
    assert.equal(p.conflicts[0].incoming.opportunityName, '', 'REGRESSION: renamed "Shell" by its Account cell');
    assert.deepEqual(filledCells(p.conflicts[0].incoming).opportunityName, undefined);
    const accounts = [...ACCOUNTS, { id: 'pine_site', name: 'Pine Site', accountTier: 'site', parentAccountId: 'old_acme' }];
    const q = planDealImport([{ opportunityName: 'X', account: 'Pine Site' }], [2], accounts, []);
    assert.equal(why(q, 2), '“Pine Site” is a site — pick the account it belongs to.', 'never the merged-away account under it');
});
