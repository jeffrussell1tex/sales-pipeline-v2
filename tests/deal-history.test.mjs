// deal-history.test.mjs — a deal's close-date history (state §0.239; docs/design/close-date-history, Jeff's Q1-Q4,
// 10 Nov 2026; guide §18b122), and the stage history's two gaps it closed.
//
// RULE: what an entry is (src/utils/dealHistory.js) — a close-date move, a stage move; a restore keeps a file's lists
// entry by entry; the History tab reads them. WIRING: the server decides a close-date move IN the write, from the date
// as stored (closeDatesWith), appends an import's stage move the same way (importStagesWith), refuses a body naming
// the list, keeps an untouched close date as stored, writes one audit row per move; the deal window leaves an untouched
// date out; the column is additive, nullable, no default, never in sanitize. The SQL itself runs in
// tests/integration/close-date-history.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    isDay, isCloseDateEntry, isStageEntry, keptEntries, restoredHistories, closeDateMovesOf, moveWords, HISTORY_WORDS, HISTORY_SOURCES,
} from '../src/utils/dealHistory.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const MOVE = { from: '2026-12-31', to: '2027-01-15', date: '2026-11-10', timestamp: '2026-11-10T15:00:00.000Z', author: 'Karen Russell', authorId: 'usr_karen', source: 'deal' };
const STAGE_NEW = { stage: 'Proposal', prevStage: 'Discovery', date: '2026-11-10', author: 'Karen Russell', authorId: 'usr_karen', timestamp: '2026-11-10T15:00:00.000Z', source: 'deal' };
const STAGE_OLD_SAVE = { stage: 'Proposal', prevStage: 'Discovery', date: '2026-10-01', author: 'Karen Russell', timestamp: '2026-10-01T15:00:00.000Z' };   // §0.236's shape
const STAGE_OLD_IMPORT = { prevStage: 'Qualification', stage: 'Discovery', date: '2026-08-06', source: 'import' };   // an import's before §0.239

// ── RULE ─────────────────────────────────────────────────────────────────────

test('RULE: a day is yyyy-mm-dd and a real day', () => {
    for (const d of ['2026-11-10', '2024-02-29', '2027-01-01']) assert.equal(isDay(d), true, d);
    for (const d of ['2026-02-30', '2026-13-01', '11/10/2026', '2026-11-10T00:00', '', null, undefined, 20261110]) assert.equal(isDay(d), false, String(d));
});

test('RULE: a close-date move is one the server would write — from and to the dates as stored (or none) and not the same, its day, its time, who, where', () => {
    assert.equal(isCloseDateEntry(MOVE), true);
    assert.equal(isCloseDateEntry({ ...MOVE, from: null }), true, 'a date set where there was none (Q1)');
    assert.equal(isCloseDateEntry({ ...MOVE, to: null }), true, 'a date cleared (Q1)');
    assert.equal(isCloseDateEntry({ ...MOVE, source: 'import' }), true);
    assert.equal(isCloseDateEntry({ ...MOVE, authorId: null }), true, 'a caller with no member row: no id');
    assert.equal(isCloseDateEntry({ ...MOVE, to: '3/15/2027' }), true, 'a date stored as sent (a body straight to the endpoint): recorded, shown, restored — never hidden (the review)');
    for (const [bad, why] of [
        [{ ...MOVE, to: MOVE.from }, 'no move'], [{ ...MOVE, from: null, to: null }, 'none to none'],
        [{ ...MOVE, from: '' }, 'a blank date (stored as none)'], [{ ...MOVE, to: 7 }, 'a date that is no text'], [{ ...MOVE, to: '2027-01-15T00:00:00.000Z+extra' }, 'longer than the column holds'],
        [{ ...MOVE, date: '' }, 'no day of its own'], [{ ...MOVE, timestamp: 'later' }, 'no time'], [{ ...MOVE, timestamp: undefined }, 'no time'],
        [{ ...MOVE, author: 5 }, 'an author that is no name'], [{ ...MOVE, authorId: 'user_2abc' }, 'a Clerk id, never the app id (§18b22)'],
        [{ ...MOVE, source: 'restore' }, 'no such source'], [{ ...MOVE, source: undefined }, 'no source'],
        [null, 'nothing'], ['x', 'a string'], [[MOVE], 'a list'],
    ]) assert.equal(isCloseDateEntry(bad), false, why);
    assert.deepEqual([...HISTORY_SOURCES], ['deal', 'import']);
});

test('RULE: a stage move needs its stage, the stage before and its day; the rest where the entry has it — every shape stored so far reads', () => {
    for (const e of [STAGE_NEW, STAGE_OLD_SAVE, STAGE_OLD_IMPORT, { ...STAGE_NEW, prevStage: null }]) assert.equal(isStageEntry(e), true, JSON.stringify(e));
    for (const [bad, why] of [
        [{ ...STAGE_NEW, stage: '' }, 'no stage'], [{ ...STAGE_NEW, stage: '  ' }, 'a blank stage'], [{ ...STAGE_NEW, date: '2026-11-31' }, 'no such day'],
        [{ ...STAGE_NEW, prevStage: 3 }, 'a stage before that is no stage'], [{ ...STAGE_NEW, authorId: 'user_2abc' }, 'a Clerk id'],
        [{ ...STAGE_NEW, timestamp: 'x' }, 'no time'], [{ ...STAGE_NEW, source: 'csv' }, 'no such source'], [null, 'nothing'], [[], 'a list'],
    ]) assert.equal(isStageEntry(bad), false, why);
});

test('RULE: a file\'s list is kept entry by entry — the list or its JSON text; anything else is no list', () => {
    assert.deepEqual(keptEntries([MOVE, { ...MOVE, source: 'x' }, 'junk', null], isCloseDateEntry), [MOVE]);
    assert.deepEqual(keptEntries(JSON.stringify([MOVE, 7]), isCloseDateEntry), [MOVE], 'a list stored as its text');
    assert.equal(keptEntries('{not json', isCloseDateEntry), null);
    assert.equal(keptEntries({ 0: MOVE }, isCloseDateEntry), null);
    assert.equal(keptEntries(undefined, isCloseDateEntry), null);
    assert.deepEqual(keptEntries([], isCloseDateEntry), []);
});

test('RULE: a restored deal keeps each history entry by entry (Q4) — a hand-made slip or stage move is dropped; no list, no key', () => {
    const forged = { from: '2026-12-31', to: '2027-03-01' };   // no day, time, author or source
    const row = { id: 'd1', stage: 'Proposal', stageHistory: [STAGE_OLD_IMPORT, { stage: 'Won' }, STAGE_NEW], closeDateHistory: [MOVE, forged] };
    assert.deepEqual(restoredHistories(row), { ...row, stageHistory: [STAGE_OLD_IMPORT, STAGE_NEW], closeDateHistory: [MOVE] });
    assert.deepEqual(restoredHistories({ id: 'd2', stageHistory: 'oops', closeDateHistory: 7 }), { id: 'd2' }, 'no list: the column\'s default');
    assert.deepEqual(restoredHistories({ id: 'd3', closeDateHistory: null }), { id: 'd3' }, 'none stored: none restored');
    assert.deepEqual(restoredHistories({ id: 'd4', arr: 5 }), { id: 'd4', arr: 5 }, 'a file from before the column: the row as it is');
    assert.deepEqual(restoredHistories({ id: 'd5', closeDateHistory: JSON.stringify([MOVE]) }), { id: 'd5', closeDateHistory: [MOVE] });
    assert.equal(restoredHistories(null), null);
    const before = JSON.stringify(row);
    restoredHistories(row);
    assert.equal(JSON.stringify(row), before, 'the file\'s row untouched');
});

test('RULE: the History tab\'s moves — newest first, only entries; a move said from → to, none for no date', () => {
    const later = { ...MOVE, from: '2027-01-15', to: '2027-02-01', timestamp: '2026-11-12T09:00:00.000Z' };
    assert.deepEqual(closeDateMovesOf({ closeDateHistory: [MOVE, { junk: 1 }, later] }), [later, MOVE]);
    assert.deepEqual(closeDateMovesOf({ closeDateHistory: null }), []);
    assert.deepEqual(closeDateMovesOf({}), []);
    assert.deepEqual(closeDateMovesOf(null), []);
    assert.equal(moveWords(MOVE), '2026-12-31 → 2027-01-15');
    assert.equal(moveWords({ ...MOVE, from: null }), 'none → 2027-01-15');
    assert.equal(moveWords({ ...MOVE, to: null }), '2026-12-31 → none');
    assert.match(HISTORY_WORDS.wholeList, /server/);
});

// ── WIRING ───────────────────────────────────────────────────────────────────

test('WIRING: a close-date move is decided in the write, from the date as stored — any change, the list as stored kept', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(s.includes("const listOf = (col) => sql`(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END)`;"));
    assert.ok(s.includes("CASE WHEN ${opportunities.forecastedCloseDate} IS DISTINCT FROM excluded.forecasted_close_date THEN ${listOf(opportunities.closeDateHistory)} || jsonb_build_array(jsonb_build_object('from', ${opportunities.forecastedCloseDate}, 'to', excluded.forecasted_close_date,"), 'from the date as stored, to the one written, appended to the list as stored');
    assert.ok(s.includes("'date', ${day}::text, 'timestamp', ${now}::text, 'author', ${author}::text, 'authorId', ${authorId}::text, 'source', ${source}::text)) ELSE ${opportunities.closeDateHistory} END`;"), 'no move: the list stays');
    assert.ok(s.includes("CASE WHEN ${opportunities.stage} IS NOT NULL AND excluded.stage IS DISTINCT FROM ${opportunities.stage} THEN ${listOf(opportunities.stageHistory)}"), 'an import\'s stage move appended the same way (Q4)');
    assert.ok(s.includes("'authorId', ${authorId}::text, 'source', 'import')) ELSE ${opportunities.stageHistory} END`;"));
});

test('WIRING: the single save — a body naming the list refused; the move appended where the body names the date; an untouched date kept as stored; one audit row', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    const put = s.slice(s.indexOf("if ('comments' in data) return { statusCode: 400"), s.indexOf('const rep          = upserted.salesRep;'));
    assert.ok(put.includes("if ('closeDateHistory' in data) return { statusCode: 400, headers, body: JSON.stringify({ error: HISTORY_WORDS.wholeList }) };"));
    assert.ok(put.includes("const closeNamed = 'forecastedCloseDate' in data;"));
    assert.ok(put.includes("if (!closeNamed) { delete updateData.forecastedCloseDate; if (!('closeQuarter' in data)) delete updateData.closeQuarter; }"), 'Q2: a save that does not name the date keeps it as stored, never the copy read');
    assert.ok(put.includes("...(closeNamed ? { closeDateHistory: closeDatesWith({ day: moveDayOf(sentCloseDay, serverDay), author: me.name || '', authorId: me.id ?? null, now, source: 'deal' }) } : {}),"));
    assert.ok(put.indexOf("delete updateData.forecastedCloseDate") > put.indexOf('const { id, comments: _notes, stageHistory: _history, ...updateData } = clean;'), 'after the update is built');
    assert.ok(put.includes("const closeMove = closeNamed ? closeMoves[closeMoves.length - 1] : null;\n            if (closeMove && closeMove.timestamp === now) {"), 'the move this write made, by its time');
    assert.ok(put.includes("action: 'opportunity.close_date_moved', entityType: 'opportunity', entityId: upserted.id,"));
    assert.ok(put.includes('detail: moveWords(closeMove),'), 'from → to (§18b42 rule 4)');
    assert.ok(put.includes('delete data.closeDateMovedOn;'), 'the member\'s day is read, never written');
    const san = s.slice(s.indexOf('const sanitize = (data) => ({'), s.indexOf('});', s.indexOf('const sanitize = (data) => ({')));
    assert.ok(san.includes('stageHistory:       data.stageHistory') && !san.includes('closeDateHistory'), 'sanitize never names it: no POST, PUT or import writes a body\'s list');
});

test('WIRING: the import — a row naming the list refused; the batch\'s moves appended only where it writes the stage or the date; one audit row for the batch', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(s.includes("if (data.some(d => d && 'closeDateHistory' in d)) return { statusCode: 400, headers, body: JSON.stringify({ error: HISTORY_WORDS.wholeList }) };"));
    assert.ok(s.includes("...(sentKeys.has('stage') ? { stageHistory: importStagesWith(movedAt) } : {}),"));
    assert.ok(s.includes("...(sentKeys.has('forecastedCloseDate') ? { closeDateHistory: closeDatesWith({ ...movedAt, source: 'import' }) } : {}),"));
    assert.ok(s.includes("const movedAt = { day: importDate, author: importer.name || '', authorId: importer.id ?? null, now: new Date().toISOString() };"));
    assert.ok(s.includes("action: 'opportunity.close_dates_moved_bulk', entityType: 'opportunity', entityId: 'BATCH',"));
    assert.ok(s.includes('const closeMoved = keyed.rows.filter(r => \'forecastedCloseDate\' in r && priors.has(r.id) && !unwritten.has(r.id)'), 'a row refused or not found is not counted');
    const bulk = code(read('netlify/functions/_bulk.mjs'));
    assert.ok(bulk.includes("export async function bulkUpsert({ table, rows, orgId, ownerColumn = null, callerId = null, canSeeAll = false, client, extraSet = null }) {"));
    assert.ok(bulk.includes('for (const [k, expr] of Object.entries(extraSet || {})) if (table[k]?.name) set[k] = expr;'), 'only a column of the table');
    assert.ok(bulk.indexOf('set[k] = expr;') < bulk.indexOf('set.updatedAt = sql`now()`;'));
    const stage = code(read('netlify/functions/_stage.mjs'));
    assert.ok(stage.includes("const DERIVED_KEYS = ['stageChangedDate'];"), 'REGRESSION (Q4): the import writes no history list — the list as read, written whole, lost a save landing between');
    assert.ok(!stage.includes('patch.stageHistory'));
});

test('WIRING: the screens — dealBody strips the list; the window leaves an untouched date out and sends the member\'s day; the History tab lists the moves', () => {
    assert.ok(code(read('src/utils/dealNotes.js')).includes('const { comments: _notes, stageHistory: _history, closeDateHistory: _closeDates, ...rest } = row;'));
    const hook = code(read('src/hooks/useOpportunities.js'));
    assert.equal((hook.match(/closeDateMovedOn: today/g) || []).length, 2, 'the deal window\'s save and the Closed Lost dialog\'s');
    const m = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.ok(m.includes("...((formData.forecastedCloseDate ?? '') === closeSeed ? ['forecastedCloseDate', 'closeQuarter'] : []),"), 'Q2');
    assert.ok(m.includes("import { closeDateMovesOf } from '../../utils/dealHistory.js';"));
    assert.ok(m.includes('function CloseDateMoves({ deal }) {\n    const moves = closeDateMovesOf(deal);'), 'at module scope (the house rule)');
    assert.ok(m.indexOf('function CloseDateMoves(') < m.indexOf('function DealHistoryTab('), 'never inside the tab');
    assert.ok(m.includes('<CloseDateMoves deal={opportunity}/>'), 'Q3: shown in the History tab');
    assert.ok(m.includes("forecastedCloseDate: base.forecastedCloseDate ?? (opportunity?.id ? '' :"), 'an undated deal opens empty (Jeff: "Open with the date empty"); a new one on today');
    const ml = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(ml.includes("overwritesBuilt.some(r => 'stage' in r || 'forecastedCloseDate' in r)) loadOpportunities(() => {});"), 'the list reads the deals again after an Overwrite that moved a stage or a date');
    assert.ok(m.includes("{fmtMoveDay(m.from)} → {fmtMoveDay(m.to)}"), 'from → to');
});

test('WIRING: a restore lands a deal\'s histories entry by entry (Q4)', () => {
    const b = code(read('netlify/functions/backup.mjs'));
    assert.ok(b.includes("import { restoredHistories } from '../../src/utils/dealHistory.js';"));
    assert.ok(b.includes("key === 'settings' ? ownSettings(rows) : key === 'opportunities' ? rows.map(restoredHistories) : rows"));
});

test('SCHEMA: one nullable jsonb column, no default, added by a script that only adds — the test database guarded by host', () => {
    const schema = read('db/schema.ts');
    assert.ok(schema.includes("    closeDateHistory:     jsonb('close_date_history'),\n"), 'the guarded shape (tests/deal-fields.test.mjs), no default');
    const apply = read('db/apply-close-date-history.mjs');
    assert.ok(!/\b(DROP|ALTER COLUMN|TRUNCATE|DELETE|UPDATE|INSERT)\b/.test(code(apply)), 'additive only (guide §18c)');
    assert.equal((code(apply).match(/await sql`ALTER TABLE/g) || []).length, 1, 'one statement that changes the database');
    assert.ok(code(apply).includes('ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "close_date_history" jsonb'));
    assert.ok(code(apply).includes("if (useTest && host.includes('ep-soft-morning')) throw"), 'the test path never reaches the shared app database');
    assert.ok(code(apply).includes("const apply = process.argv.includes('--apply');") && code(apply).includes('if (!apply) {'), 'checks only without --apply');
    assert.ok(code(apply).includes("if (c.column_default != null) throw"), 'read back: no default');
    assert.ok(read('tests/integration/_schema-guard.mjs').includes("['opportunities', 'close_date_history'],"), 'the test-schema guard names it');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/deal-history.test.mjs'), 'SUITES runs this file');
});
