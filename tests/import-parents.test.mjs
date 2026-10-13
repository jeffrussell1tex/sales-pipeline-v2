// tests/import-parents.test.mjs
//
// The accounts CSV import's parents (state §0.199 — the review of batch 4: server S4, decisions S3, screens S3,
// tests S3). The importer took a sub-account's Parent Account as the first account of that name in the whole
// list, merge-archived rows included, and sent every row in one stream of 400-row requests. Since §0.199 the
// server refuses a bulk parent that is no live row of the org (merged away, or a row that did not land), so such
// a file was refused whole, the import stopped, and the words named neither row nor parent. Here:
// src/utils/importParents.js run on made-up rows — a live account first, then the file's own rows, then a
// merged-away name's survivor; never the merged-away one — and the sub-accounts as sent once the parents have
// landed; and THE GUARD: ModalLayer's account import goes through them, parents first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importParentId, importPasses, subsAfterParents } from '../src/utils/importParents.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// The org's accounts as the app holds them (merge-archived rows included, as the accounts GET answers): Acme
// live; "Old Acme" merged into Acme; "Twin" merged into "Twin Live" (a twin's name), "Twin Live" live; "Lost"
// merged into an account the list does not hold.
const ACCOUNTS = [
    { id: 'old_acme', name: 'Old Acme', mergeArchived: true, mergedIntoId: 'acme' },
    { id: 'acme', name: 'Acme', mergeArchived: false },
    { id: 'twin_old', name: 'Twin', mergeArchived: true, mergedIntoId: 'twin_live' },
    { id: 'twin_live', name: 'Twin', mergeArchived: false },
    { id: 'lost', name: 'Lost', mergeArchived: true, mergedIntoId: 'gone' },
];

test('importParentId: a live account of the name, in any case; a merged-away name is its survivor, never itself', () => {
    assert.equal(importParentId('acme', ACCOUNTS, []), 'acme');
    assert.equal(importParentId('ACME', ACCOUNTS, []), 'acme');
    assert.equal(importParentId('Old Acme', ACCOUNTS, []), 'acme', 'a name only a merged-away account has: the account it was merged into');
    assert.equal(importParentId('Twin', ACCOUNTS, []), 'twin_live', 'the live twin, though the merged-away one comes first in the list');
    assert.equal(importParentId('Lost', ACCOUNTS, []), null, 'a survivor the list does not hold: no parent — never the merged-away row');
    assert.equal(importParentId('Nobody', ACCOUNTS, []), null);
    assert.equal(importParentId('', ACCOUNTS, []), null);
    assert.equal(importParentId(undefined, undefined, undefined), null);
});

test("importParentId: a live account comes before a row of the file, and a row of the file before a merged-away name's survivor", () => {
    const file = [{ id: 'f_acme', name: 'Acme' }, { id: 'f_old', name: 'Old Acme' }];
    assert.equal(importParentId('Acme', ACCOUNTS, file), 'acme', 'the live account of the name');
    assert.equal(importParentId('Old Acme', ACCOUNTS, file), 'f_old', 'the file makes "Old Acme" anew: its own row, not the old one\'s survivor');
    assert.equal(importParentId('New Co', ACCOUNTS, [{ id: 'f_new', name: 'new co' }]), 'f_new');
});

test('importPasses: the top-level rows with no parent, the sub-accounts each with the parent its name finds — the Parent Account column dropped', () => {
    let n = 0;
    const { parents, subs } = importPasses([
        { name: 'New Co', parentAccount: '' },
        { name: 'Plant 1', parentAccount: 'New Co' },
        { name: 'Plant 2', parentAccount: 'Old Acme' },
        { name: 'Plant 3', parentAccount: 'Lost' },
        { name: 'Solo', parentAccount: '   ' },
    ], ACCOUNTS, () => `id${++n}`);
    assert.deepEqual(parents, [{ name: 'New Co', id: 'id1', parentAccountId: null }, { name: 'Solo', id: 'id2', parentAccountId: null }]);
    assert.deepEqual(subs, [
        { name: 'Plant 1', id: 'id3', parentAccountId: 'id1' },
        { name: 'Plant 2', id: 'id4', parentAccountId: 'acme' },
        { name: 'Plant 3', id: 'id5', parentAccountId: null },
    ]);
    assert.deepEqual(importPasses(undefined, ACCOUNTS, () => 'x'), { parents: [], subs: [] });
});

test("subsAfterParents: a sub-account whose parent is a row of the file that did not land names no parent; one under a landed row, or an account, keeps it", () => {
    const parents = [{ id: 'p1' }, { id: 'p2' }];
    const subs = [{ id: 's1', parentAccountId: 'p1' }, { id: 's2', parentAccountId: 'p2' }, { id: 's3', parentAccountId: 'acme' }, { id: 's4', parentAccountId: null }];
    assert.deepEqual(subsAfterParents(subs, parents, [{ id: 'p1' }]), [
        { id: 's1', parentAccountId: 'p1' },
        { id: 's2', parentAccountId: null },
        { id: 's3', parentAccountId: 'acme' },
        { id: 's4', parentAccountId: null },
    ]);
    assert.deepEqual(subsAfterParents(subs, parents, []).map((s) => s.parentAccountId), [null, null, 'acme', null], 'no parent landed');
    assert.deepEqual(subsAfterParents(undefined, parents, []), []);
});

test("THE GUARD: ModalLayer's account import finds parents through importPasses and sends the sub-accounts once the parents have landed", () => {
    const m = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(m.includes("import { importPasses, subsAfterParents } from '../../utils/importParents.js';"));
    assert.ok(m.includes('const { parents: parentsWithIds, subs: subsWithIds } = importPasses(newAccounts, accounts, () => crypto.randomUUID());'));
    assert.ok(!m.includes('allAccountsSoFar'), 'no parent found by name over the whole list, merged-away rows included');
    const first = "const first = await bulk.postNew('/.netlify/functions/accounts', parentsWithIds, {";
    const second = ": await bulk.postNew('/.netlify/functions/accounts', subsAfterParents(subsWithIds, parentsWithIds, first.landed), {";
    const at = m.indexOf(first);
    assert.ok(at >= 0 && m.indexOf(second, at) > at, 'the parents first, then the sub-accounts, each knowing which parents landed');
    assert.ok(m.includes('const second = first.error\n                                ? { landed: [], failed: [], error: null, attempted: 0 }'), 'a request that failed whole sends no sub-account after it');
    assert.ok(m.includes('const res = { landed: [...first.landed, ...second.landed], failed: [...first.failed, ...second.failed], error: first.error || second.error, attempted: allWithIds.length };'), 'one receipt for the two');
});
