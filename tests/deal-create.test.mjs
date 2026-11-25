// tests/deal-create.test.mjs
//
// A deal create names its lists empty or not at all (state §0.252; OPEN_ITEMS §4.2; guide §18b119 rule 2; Jeff,
// 16 Nov: "Refuse non-empty, all 3"). Until §0.252 both POSTs stored the team notes and the stage history a body
// sent — a request could make a deal holding notes under any author and time, and any history — while every PUT
// refused a whole list. Every screen sends the two empty (the deal window, the Closed Lost dialog, the CSV import),
// so the rule refuses an entry, never the key.
//   RULE    src/utils/dealCreate.js — run
//   WIRING  both POSTs refuse before any read or write; the screens' creates still send only empty lists
// The writes themselves (single, a whole batch, empty lists taken) are tests/integration/deal-data.itest.mjs and
// close-date-history.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREATE_LISTS, CREATE_LIST_WORDS, createListRefused } from '../src/utils/dealCreate.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// ── RULE ─────────────────────────────────────────────────────────────────────

test('RULE: the three lists a deal holds, each with its own words', () => {
    assert.deepEqual([...CREATE_LISTS], ['comments', 'stageHistory', 'closeDateHistory']);
    for (const f of CREATE_LISTS) assert.match(CREATE_LIST_WORDS[f], /^A new deal starts with no /, f);
    assert.ok(Object.isFrozen(CREATE_LISTS) && Object.isFrozen(CREATE_LIST_WORDS));
});

test('RULE: absent, null, undefined and an empty list are taken — what every screen sends', () => {
    assert.equal(createListRefused({ id: 'd' }), null);
    assert.equal(createListRefused({ id: 'd', comments: [], stageHistory: [], closeDateHistory: [] }), null);
    assert.equal(createListRefused({ id: 'd', comments: null, stageHistory: undefined, closeDateHistory: null }), null);
    assert.equal(createListRefused(null), null);
    assert.equal(createListRefused('x'), null, 'not a row: the endpoint\'s own checks answer it');
});

test('RULE: a list with anything in it is refused, naming it — the first of the three it names', () => {
    for (const f of CREATE_LISTS) {
        assert.deepEqual(createListRefused({ id: 'd', [f]: [{}] }), { field: f, error: CREATE_LIST_WORDS[f] }, f);
    }
    assert.equal(createListRefused({ comments: [], stageHistory: [{ stage: 'X' }], closeDateHistory: [{}] }).field, 'stageHistory');
    assert.equal(createListRefused({ comments: [{}], closeDateHistory: [{}] }).field, 'comments');
});

test('RULE: anything that is not a list is refused, an empty string or object too — sanitize stored it as sent', () => {
    for (const v of ['a note', '', 0, false, {}, { 0: 'x' }, 1]) {
        assert.equal(createListRefused({ comments: v })?.field, 'comments', JSON.stringify(v));
        assert.equal(createListRefused({ stageHistory: v })?.field, 'stageHistory', JSON.stringify(v));
    }
});

test('RULE: only a row\'s own keys — an inherited one is not the body\'s', () => {
    const row = Object.create({ comments: [{ text: 'inherited' }] });
    row.id = 'd';
    assert.equal(createListRefused(row), null);
});

// ── WIRING ───────────────────────────────────────────────────────────────────

test('WIRING: the single POST refuses after its id check and before any read; the bulk POST before its first read', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(s.includes("import { createListRefused } from '../../src/utils/dealCreate.js';"));
    const post = s.slice(s.indexOf("if (event.httpMethod === 'POST') {"), s.indexOf('const [inserted] = await db.insert(opportunities)'));
    assert.ok(post.length > 0);
    // Single.
    const single = post.slice(post.indexOf("if (!data.id) {\n"));
    assert.ok(post.indexOf("if (!data.id) {\n") > 0, 'the single create\'s id check');
    const refuse = single.indexOf('const listNamed = createListRefused(data);\n            if (listNamed) return { statusCode: 400, headers, body: JSON.stringify(listNamed) };');
    assert.ok(refuse > 0, 'the single create\'s refusal');
    assert.ok(refuse < single.indexOf('const link = await accountLink(data, null, orgId);'), 'before the account is read');
    assert.ok(refuse < single.indexOf('const people = await checkLinks(DEAL_LINKS, data, null, orgId);'));
    // Bulk.
    const bulk = post.slice(0, post.indexOf("if (!data.id) {\n"));
    const bRefuse = bulk.indexOf('const listRows = data.filter(d => createListRefused(d));\n                const firstList = listRows.length ? createListRefused(listRows[0]) : null;\n                if (firstList) return { statusCode: 400, headers, body: JSON.stringify({ ...firstList, ids: listRows.filter(d => createListRefused({ [firstList.field]: d[firstList.field] })).map(d => d.id) }) };');
    assert.ok(bRefuse > 0, 'the batch\'s refusal: the first list in its words, naming every row that names that one');
    const twice = bulk.indexOf("'A row id is sent twice in one batch.'");
    assert.ok(twice > 0 && bRefuse > twice, 'after the id checks (present: an indexOf of -1 passed the order alone)');
    assert.ok(bRefuse < bulk.indexOf('const linked = await bulkDealLinks(data, orgId);'), 'before the first read');
    assert.ok(bRefuse < bulk.indexOf('const result = await bulkInsert('), 'before the write');
});

test('WIRING: the screens\' creates send the lists empty, or not at all — so the rule refuses none of them', () => {
    const hook = read('src/hooks/useOpportunities.js');
    // A new deal has no stored deal: no move, so no entry, and no notes.
    assert.ok(hook.includes('const stageChanged = stageSent && prevOpp && prevOpp.stage !== formData.stage;'), 'a move only from a stored deal');
    assert.ok(hook.includes(': (prevOpp?.stageHistory || []),'), 'the deal window\'s new deal: an empty history');
    assert.ok(hook.includes('comments: prevOpp?.comments || [],'), 'and no notes');
    assert.ok(hook.includes('comments: prevOppRef?.comments || formData.comments || [],'), 'the Closed Lost dialog\'s, from the window\'s');
    const rows = read('src/utils/importRows.js');
    assert.ok(/stageHistory:\s*\[\],/.test(rows) && /comments:\s*\[\],/.test(rows), 'the import\'s new row');
});
