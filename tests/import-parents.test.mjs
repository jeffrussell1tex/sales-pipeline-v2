// tests/import-parents.test.mjs
//
// The accounts CSV import's sending, by depth (state §0.199; §0.215 — batch 3a). Which account a Parent Account
// names is decided at Preview, one record or a refusal (src/utils/importLinks.js, tests/import-links.test.mjs);
// here src/utils/importParents.js sends the rows kept, parents first at any depth, run on made-up rows — and THE
// GUARD: ModalLayer's account import sends level by level, a row whose file parent did not land with no parent,
// and an overwrite in the account's own spelling with no Parent Account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importLevels, levelAfterLanded, sendLevels } from '../src/utils/importParents.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test('importLevels: the rows a plan kept, by depth — top level, then the rows under them, then theirs — each with its new id and the parent it names; the plan\'s keys and the Parent Account column dropped', () => {
    let n = 0;
    const levels = importLevels([
        { name: 'Site A', parentAccount: 'Unit A', _ref: 4, _parent: { ref: 2 } },
        { name: 'New Co', parentAccount: '', _ref: 0, _parent: null },
        { name: 'Unit A', parentAccount: 'New Co', _ref: 2, _parent: { ref: 0 } },
        { name: 'Under Acme', parentAccount: 'Acme', _ref: 3, _parent: { id: 'acme' } },
    ], () => `id${++n}`);
    assert.deepEqual(levels, [
        [{ name: 'New Co', id: 'id2', parentAccountId: null }, { name: 'Under Acme', id: 'id4', parentAccountId: 'acme' }],
        [{ name: 'Unit A', id: 'id3', parentAccountId: 'id2' }],
        [{ name: 'Site A', id: 'id1', parentAccountId: 'id3' }],
    ], 'ids taken in the file\'s order; a row of the file under its parent row\'s new id, at its depth — never before it');
    assert.deepEqual(importLevels(undefined, () => 'x'), []);
    assert.deepEqual(importLevels([{ name: 'Lost', _ref: 7, _parent: { ref: 99 } }], () => 'z'), [[{ name: 'Lost', id: 'z', parentAccountId: null }]], 'a parent row the list does not hold: no parent, the top level');
    n = 0;
    assert.deepEqual(importLevels([
        { name: 'Top', _ref: 0, _parent: null, _tier: 'account' },
        { name: 'Unit', _ref: 1, _parent: { ref: 0 }, _tier: 'business_unit' },
        { name: 'Lost kid', _ref: 2, _parent: { ref: 9 }, _tier: 'site' },
    ], () => `t${++n}`), [
        [{ name: 'Top', id: 't1', parentAccountId: null, accountTier: 'account' }, { name: 'Lost kid', id: 't3', parentAccountId: null, accountTier: 'account' }],
        [{ name: 'Unit', id: 't2', parentAccountId: 't1', accountTier: 'business_unit' }],
    ], "each row asks the tier its plan gave it — the screen's copy holds the tier stored (the review of 3a); at the top level an account");
});

test('levelAfterLanded: a row whose parent is a row of the file that did not land names no parent; one under a landed row, or an account, keeps it', () => {
    const fileIds = new Set(['p1', 'p2']);
    const level = [{ id: 's1', parentAccountId: 'p1' }, { id: 's2', parentAccountId: 'p2' }, { id: 's3', parentAccountId: 'acme' }, { id: 's4', parentAccountId: null }];
    assert.deepEqual(levelAfterLanded(level, fileIds, new Set(['p1'])), [
        { id: 's1', parentAccountId: 'p1' },
        { id: 's2', parentAccountId: null },
        { id: 's3', parentAccountId: 'acme' },
        { id: 's4', parentAccountId: null },
    ]);
    assert.deepEqual(levelAfterLanded(level, fileIds, new Set()).map((s) => s.parentAccountId), [null, null, 'acme', null], 'no parent landed');
    assert.deepEqual(levelAfterLanded(undefined, fileIds, new Set()), []);
    assert.deepEqual(levelAfterLanded([{ id: 's9', parentAccountId: 'p2', accountTier: 'site' }], fileIds, new Set()), [{ id: 's9', parentAccountId: null, accountTier: 'account' }], 'sent at the top level: an account, as the server stores it');
});

// A fake postNew: each level's rows land but those named in fails; a level holding a row named in refuse fails whole.
const fakePost = ({ fails = [], refuse = [] } = {}) => {
    const calls = [];
    const post = async (rows, offset) => {
        calls.push({ rows, offset });
        if (rows.some((r) => refuse.includes(r.id))) return { landed: [], failed: rows, error: 'refused whole' };
        return { landed: rows.filter((r) => !fails.includes(r.id)), failed: rows.filter((r) => fails.includes(r.id)), error: null };
    };
    return { post, calls };
};
const LEVELS = [[{ id: 'p1', parentAccountId: null }, { id: 'p2', parentAccountId: 'acme' }], [{ id: 'k1', parentAccountId: 'p1' }, { id: 'k2', parentAccountId: 'p2' }], [{ id: 'g1', parentAccountId: 'k1' }]];

test('sendLevels: each level once the one above has answered, at its offset; a row under a file parent that did not land sent with none; one answer for every level', async () => {
    const { post, calls } = fakePost({ fails: ['p2'] });
    const seen = [];
    const out = await sendLevels(LEVELS, post, { onLanded: (rows) => seen.push(rows.map((r) => r.id)) });
    assert.deepEqual(calls.map((c) => [c.offset, c.rows.map((r) => [r.id, r.parentAccountId])]), [
        [0, [['p1', null], ['p2', 'acme']]],
        [2, [['k1', 'p1'], ['k2', null]]],
        [4, [['g1', 'k1']]],
    ]);
    assert.deepEqual(seen, [['p1'], ['k1', 'k2'], ['g1']], 'each level reaches the screen as it lands');
    assert.deepEqual([out.stopped, out.res.landed.map((r) => r.id), out.res.failed.map((r) => r.id), out.res.error, out.res.attempted], [false, ['p1', 'k1', 'k2', 'g1'], ['p2'], null, 5]);
});

test('sendLevels: a request that failed whole sends no level after it, and the answer carries its error (REGRESSION: the rows under it made at the top level); an org switch stops', async () => {
    const { post, calls } = fakePost({ refuse: ['p1'] });
    const out = await sendLevels(LEVELS, post);
    assert.equal(calls.length, 1, 'no level after the refused one');
    assert.deepEqual([out.res.error, out.res.landed, out.res.failed.map((r) => r.id), out.res.attempted], ['refused whole', [], ['p1', 'p2'], 5]);
    let ok = true;
    const two = fakePost();
    const cut = await sendLevels(LEVELS, async (rows, offset) => { const r = await two.post(rows, offset); ok = false; return r; }, { stillOrg: () => ok });
    assert.deepEqual([cut.stopped, two.calls.length], [true, 1], 'the org switched: nothing more sent, and the answer says so');
    assert.deepEqual(await sendLevels(undefined, post), { stopped: false, res: { landed: [], failed: [], error: null, attempted: 0 } });
});

test("THE GUARD: ModalLayer's account import sends the plan's rows level by level, each level knowing which rows landed; a failed request sends no level after it; an overwrite sends neither the name nor the Parent Account", () => {
    const m = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(m.includes("import { importLevels, sendLevels } from '../../utils/importParents.js';"));
    assert.ok(m.includes('const levels = importLevels(newAccounts, () => crypto.randomUUID());'));
    assert.ok(!/importPasses|importParentId|subsAfterParents|allAccountsSoFar/.test(m), 'no parent found by name in the handler — the plan found it at Preview');
    assert.ok(m.includes('const sentLevels = await sendLevels(levels,'), 'the levels sent by sendLevels (run above)');
    assert.ok(m.includes("(rows, offset) => bulk.postNew('/.netlify/functions/accounts', rows, { onProgress, progressOffset: offset, progressTotal: totalProgress, stillOrg: still }),"), 'each level at its offset, stopping on an org switch');
    assert.ok(m.includes('{ stillOrg: still, onLanded: (landed) => setAccounts(prev => [...prev, ...landed]) });'), 'what saved reaches the screen before a failure is said');
    assert.ok(m.includes('if (sentLevels.stopped) return stopped();'));
    assert.ok(m.includes('const { res } = sentLevels;'), 'one receipt for every level');
    assert.ok(m.includes('const lostParents = res.failed.filter(f => allWithIds.some(r => r.parentAccountId === f.id));'), 'a parent lost at any depth is named');
    assert.ok(m.includes('const orphaned = res.landed.filter(r => lostIds.has(parentOf.get(r.id)));') && m.includes('${orphaned.length ? `, so ${orphaned.length} sub-account'), 'only sub-accounts that landed are said to have landed without it (the review of 3a)');
    const ow = m.slice(m.indexOf('const overwritesWithIds = overwrites.map(a => {'), m.indexOf("const ow = await bulk.putBulk('/.netlify/functions/accounts'"));
    assert.ok(ow.includes('const { parentAccount: _drop, name: _name, _existingId, ...rest } = a;'), 'neither the Parent Account (Q5) nor the name — the row matched the account as its name reads; a name from a screen loaded before another session\'s rename would refuse the whole request (the review of 3a)');
    assert.ok(ow.includes('return { ...rest, id: _existingId };'));
    assert.ok(!ow.includes('accounts.find('), 'no name read from the screen\'s list');
});
