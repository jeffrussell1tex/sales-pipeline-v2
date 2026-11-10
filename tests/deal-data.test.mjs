// tests/deal-data.test.mjs
//
// A deal's notes and stage history are added to, never written back whole; a contact's Undo keeps its owner
// (state §0.236; guide §18b119; docs/design/deal-data — Jeff's Q1-Q4, each the Recommended). Until §0.236 every
// writer sent a deal's whole notes list and whole stage history, built from the browser's copy (the deal list as
// loaded when the page opened): a tab left open wrote both back on any save and erased a colleague's note or stage
// move made since. The browser named a note's author; the server let anyone who could save the deal rewrite any
// note. A contact's delete Undo made whoever pressed it the owner of an unassigned contact.
//   RULE    src/utils/dealNotes.js, _stage.mjs's single-save move, src/utils/restoreOwner.js — run
//   GUARD   every deal PUT a screen sends carries neither notes nor a stage history (a parse of src)
//   WIRING  the endpoint applies a note by compare-and-set, refuses a whole list, appends a move in its write and
//           keeps both out of a save's update; the screens send operations, dealBody and the restore mark
// The writes themselves (two posts at once, a stale save, another org, a restore) are
// tests/integration/deal-data.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import {
    mentionsIn, mayChangeNote, noteOpOf, applyNoteOp, notesOf, dealBody, NOTE_WORDS, NOTE_TEXT_MAX,
} from '../src/utils/dealNotes.js';
import { moveDayOf, stageMoveOf } from '../netlify/functions/_stage.mjs';
import { restoredOwner } from '../src/utils/restoreOwner.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const KAREN = { id: 'usr_karen', name: 'Karen Russell' };
const BOB = { id: 'usr_bob', name: 'Bob Russell' };
const NAMES = ['Karen Russell', 'Bob Russell', 'Bob'];
const ctx = (me, extra = {}) => ({ me, now: '2026-11-09T21:00:00.000Z', newId: 'note_new', names: NAMES, ...extra });
const OLD = { id: 'c_1', text: 'From before', author: 'Karen Russell', timestamp: '2026-10-01T00:00:00Z', mentions: [] };   // no authorId
const NEW = { id: 'note_2', text: 'Hi', author: 'Bob Russell', authorId: 'usr_bob', timestamp: '2026-11-01T00:00:00Z', mentions: [] };

// ── RULE ─────────────────────────────────────────────────────────────────────

test('RULE: a note added is stamped by the server — the caller\'s name and id, the time, its id, its mentions; the list as stored kept', () => {
    const r = applyNoteOp([OLD, NEW], { op: 'add', text: 'Call @Bob Russell and @Karen Russell' }, ctx(KAREN));
    assert.equal(r.list.length, 3, 'appended to what is stored — nothing written over');
    assert.deepEqual(r.list.slice(0, 2), [OLD, NEW]);
    assert.deepEqual(r.note, { id: 'note_new', text: 'Call @Bob Russell and @Karen Russell', author: 'Karen Russell', authorId: 'usr_karen', timestamp: '2026-11-09T21:00:00.000Z', mentions: ['Bob Russell', 'Karen Russell'] });
    assert.deepEqual(applyNoteOp(null, { op: 'add', text: 'x' }, ctx(KAREN)).list.length, 1, 'a deal with no list: the first note');
    assert.deepEqual(applyNoteOp([], { op: 'add', text: 'x' }, ctx({ id: null, name: 'Ghost' })), { error: NOTE_WORDS.noMember, status: 403 }, 'REGRESSION (Q2): a caller who is no member posts as a name');
});

test('RULE: only a note\'s author edits or deletes it — by id; a note from before §0.236 by its author name', () => {
    assert.equal(mayChangeNote(NEW, BOB), true, 'its author, by id');
    assert.equal(mayChangeNote(NEW, KAREN), false, 'another member');
    assert.equal(mayChangeNote(NEW, { id: 'usr_other', name: 'Bob Russell' }), false, 'REGRESSION (Q2): a note with an author id is never matched by name — a namesake is not its author');
    assert.equal(mayChangeNote(OLD, KAREN), true, 'an older note: its author name');
    assert.equal(mayChangeNote(OLD, BOB), false);
    assert.equal(mayChangeNote(OLD, { id: null, name: '' }), false, 'no name matches no one');
    assert.equal(mayChangeNote(NEW, { id: null, name: 'Bob Russell' }), false, 'no member id, no change to a note that has one');
    assert.equal(mayChangeNote(null, KAREN), false);
});

test('RULE: an edit replaces the text of that note alone; a delete removes it alone; another\'s refused; one gone since is a 409', () => {
    const e = applyNoteOp([OLD, NEW], { op: 'edit', id: 'note_2', text: 'Hello @Karen Russell' }, ctx(BOB));
    assert.deepEqual(e.list[0], OLD, 'the others as stored');
    assert.deepEqual(e.list[1], { ...NEW, text: 'Hello @Karen Russell', mentions: ['Karen Russell'], edited: true, editedAt: '2026-11-09T21:00:00.000Z' });
    assert.deepEqual(applyNoteOp([OLD, NEW], { op: 'delete', id: 'c_1' }, ctx(KAREN)).list, [NEW]);
    assert.deepEqual(applyNoteOp([OLD, NEW], { op: 'delete', id: 'note_2' }, ctx(KAREN)), { error: NOTE_WORDS.notAuthor, status: 403 }, 'REGRESSION (Q2): another member deletes a note');
    assert.deepEqual(applyNoteOp([OLD, NEW], { op: 'edit', id: 'c_1', text: 'x' }, ctx(BOB)), { error: NOTE_WORDS.notAuthor, status: 403 });
    assert.deepEqual(applyNoteOp([OLD], { op: 'edit', id: 'note_2', text: 'x' }, ctx(BOB)), { error: NOTE_WORDS.gone, status: 409 });
    assert.deepEqual(applyNoteOp([OLD], { op: 'delete', id: 'note_2' }, ctx(BOB)), { error: NOTE_WORDS.gone, status: 409 });
});

test('RULE: an operation is read for its shape — add text, edit an id and text, delete an id; empty, too long or unknown refused', () => {
    assert.deepEqual(noteOpOf({ op: 'add', text: '  hi  ' }), { op: 'add', text: 'hi' });
    assert.deepEqual(noteOpOf({ op: 'edit', id: 'n1', text: 'x' }), { op: 'edit', id: 'n1', text: 'x' });
    assert.deepEqual(noteOpOf({ op: 'delete', id: 'n1', text: 'ignored' }), { op: 'delete', id: 'n1' });
    for (const bad of [null, [], 'add', {}, { op: 'replace' }, { op: 'edit', text: 'x' }, { op: 'delete' }, { op: 'delete', id: '  ' }]) {
        assert.deepEqual(noteOpOf(bad), { error: NOTE_WORDS.shape }, JSON.stringify(bad));
    }
    assert.deepEqual(noteOpOf({ op: 'add', text: '   ' }), { error: NOTE_WORDS.empty });
    assert.deepEqual(noteOpOf({ op: 'add', text: 'x'.repeat(NOTE_TEXT_MAX + 1) }), { error: NOTE_WORDS.tooLong });
    assert.deepEqual(noteOpOf({ op: 'add', text: 'x'.repeat(NOTE_TEXT_MAX) }).op, 'add', 'the longest allowed');
    assert.deepEqual(notesOf('x'), []);
});

test('RULE: mentions — each "@" read against the team\'s names, the longest that starts it, once each', () => {
    assert.deepEqual(mentionsIn('@Bob Russell, @Bob and @Bob Russell again', NAMES), ['Bob Russell', 'Bob']);
    assert.deepEqual(mentionsIn('@Bob Russell', ['Bob', 'Bob Russell']), ['Bob Russell'], 'REGRESSION: the shorter name, listed first, read for the longer');
    assert.deepEqual(mentionsIn('email bob@x.co', NAMES), [], 'an address is no mention');
    assert.deepEqual(mentionsIn('', NAMES), []);
    assert.deepEqual(mentionsIn('@Karen', []), []);
});

test('RULE: a single save\'s move — the entry from the stored stage, dated the member\'s day within a day of the server\'s', () => {
    const at = { day: '2026-11-09', author: 'Karen Russell', authorId: 'usr_karen', now: '2026-11-09T21:00:00.000Z' };
    // The author's name AND id, and where it was made (state §0.239; Jeff's Q4 — guide §18b119 rule 5).
    assert.deepEqual(stageMoveOf({ stage: 'Proposal' }, { stage: 'Negotiation' }, at),
        { stage: 'Negotiation', date: '2026-11-09', prevStage: 'Proposal', author: 'Karen Russell', authorId: 'usr_karen', timestamp: '2026-11-09T21:00:00.000Z', source: 'deal' });
    assert.equal(stageMoveOf({ stage: 'Proposal' }, { stage: 'Negotiation' }, { ...at, authorId: undefined }).authorId, null, 'a caller with no member row: no id, never another\'s');
    for (const body of [{}, { stage: '' }, { stage: '  ' }, { stage: null }, { stage: 'Proposal' }]) assert.equal(stageMoveOf({ stage: 'Proposal' }, body, at), null, JSON.stringify(body));
    assert.equal(stageMoveOf({ stage: null }, { stage: 'Proposal' }, at), null, 'no stored stage: no move, as an import reads it');
    assert.equal(moveDayOf('2026-11-08', '2026-11-09'), '2026-11-08', 'the member\'s day, a day behind the server\'s (an evening in Chicago)');
    assert.equal(moveDayOf('2026-11-10', '2026-11-09'), '2026-11-10');
    for (const bad of ['2026-11-07', '2025-01-01', '2026-11-31', '11/09/2026', '', null, undefined, '2026-11-09T00:00']) assert.equal(moveDayOf(bad, '2026-11-09'), '2026-11-09', String(bad));
});

test('RULE: a restore keeps the stored owner by id — a member of this org, else none and the name with it; never the caller', () => {
    const row = { id: 'c1', firstName: 'Pat', assignedRep: 'Bob Russell' };
    assert.deepEqual(restoredOwner(row, 'usr_bob', { id: 'usr_bob', name: 'Bob Russell' }, 'assignedRep'), { ...row, ownerId: 'usr_bob' });
    assert.deepEqual(restoredOwner(row, 'usr_gone', null, 'assignedRep'), { ...row, ownerId: null, assignedRep: null }, 'an owner gone since: unassigned, no name');
    const un = { id: 'c2', firstName: 'Lee', assignedRep: null };
    assert.deepEqual(restoredOwner(un, null, null, 'assignedRep'), { ...un, ownerId: null }, 'REGRESSION (Q4): an unassigned contact stays unassigned');
    const named = { id: 'c3', assignedRep: 'Old Name' };
    assert.deepEqual(restoredOwner(named, null, null, 'assignedRep'), { ...named, ownerId: null }, 'a name stored with no id stays as stored (UKG\'s four)');
});

test('RULE: a deal\'s save sends neither its notes nor its stage history nor its close-date history — the rest as given', () => {
    assert.deepEqual(dealBody({ id: 'd', stage: 'X', comments: [1], stageHistory: [2], closeDateHistory: [3], arr: 5 }), { id: 'd', stage: 'X', arr: 5 });
    assert.equal(dealBody(null), null);
});

// ── THE GUARD ────────────────────────────────────────────────────────────────

const walkFiles = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walkFiles(p) : /\.(jsx?|mjs)$/.test(n) ? [p] : [];
});
const treeOf = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
const visit = (n, f) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => visit(x, f)); return; }
    if (n.type) f(n);
    for (const k of Object.keys(n)) if (k !== 'loc' && !k.endsWith('Comments')) visit(n[k], f);
};
const strOf = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked).join('*') : null);
const propOf = (obj, key) => obj?.properties?.find((p) => p.type === 'ObjectProperty' && (p.key?.name || p.key?.value) === key);

// Every PUT a source sends to the deals endpoint through dbFetch / dbWrite, and what its body may carry.
export function dealPutsIn(src, file = 'src') {
    const found = [];
    visit(treeOf(src), (n) => {
        if (n.type !== 'CallExpression' || !['dbFetch', 'dbWrite'].includes(n.callee?.name)) return;
        const url = strOf(n.arguments[0]);
        if (!url || !/functions\/opportunities\b/.test(url)) return;
        const opts = n.arguments[1];
        if (strOf(propOf(opts, 'method')?.value) !== 'PUT') return;
        const body = propOf(opts, 'body')?.value;
        const line = src.slice(n.start, n.end).split('\n')[0].trim().slice(0, 100);
        const sent = body?.type === 'CallExpression' && body.callee?.object?.name === 'JSON' ? body.arguments[0] : null;
        let fault = null;
        if (!sent) fault = 'a body not read';
        else if (sent.type === 'ObjectExpression') {
            const keys = sent.properties.map((p) => (p.type === 'SpreadElement' ? '...' : p.key?.name || p.key?.value));
            if (keys.includes('comments') || keys.includes('stageHistory') || keys.includes('closeDateHistory')) fault = 'sends notes or a stage history';
            else if (keys.includes('...')) fault = 'spreads a row (it would carry its notes)';
        } else if (!(sent.type === 'CallExpression' && sent.callee?.name === 'dealBody')) fault = 'a row not through dealBody';
        found.push({ file, line, fault });
    });
    return found;
}

test('THE GUARD: no screen sends a deal\'s notes or its stage history — every deal PUT a literal without them, or a row through dealBody', () => {
    const files = walkFiles(fileURLToPath(new URL('../src', import.meta.url)));
    const puts = files.flatMap((f) => dealPutsIn(readFileSync(f, 'utf8'), f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/')));
    assert.deepEqual(puts.filter((p) => p.fault).map((p) => `${p.file}: ${p.fault} — ${p.line}`), [], 'REGRESSION (§0.236): a deal PUT that can write a whole notes list or stage history back');
    const where = new Set(puts.map((p) => p.file));
    for (const f of ['src/hooks/useOpportunities.js', 'src/components/KanbanView.jsx', 'src/Tabs/ReportsTab.jsx']) assert.ok(where.has(f), `the guard reads ${f}'s deal PUTs`);
    assert.ok(puts.length >= 6, `the guard sees the screens' deal PUTs (${puts.length})`);
});

test('THE GUARD reads what is sent: a list or history key, a spread row and a bare row fail; dealBody and a literal without them pass', () => {
    const one = (body) => { const [p] = dealPutsIn(`dbFetch('/.netlify/functions/opportunities', { method: 'PUT', body: JSON.stringify(${body}) });`); return p ? p.fault : 'none seen'; };
    assert.equal(one('{ id, comments }'), 'sends notes or a stage history');
    assert.equal(one('{ id, stageHistory: h }'), 'sends notes or a stage history');
    assert.equal(one('{ id, closeDateHistory: h }'), 'sends notes or a stage history', 'nor a close-date history (state §0.239)');
    assert.equal(one('{ ...row, id }'), 'spreads a row (it would carry its notes)');
    assert.equal(one('sentBody(row)'), 'a row not through dealBody');
    assert.equal(one('row'), 'a row not through dealBody');
    assert.equal(one('dealBody(sentBody(row))'), null);
    assert.equal(one('{ id, stage, stageChangedDate }'), null);
    assert.equal(dealPutsIn("dbWrite(`/.netlify/functions/opportunities?id=${id}`, { method: 'DELETE' });").length, 0, 'a DELETE is no PUT');
    assert.equal(dealPutsIn("dbFetch('/.netlify/functions/opportunities', { method: 'POST', body: JSON.stringify(row) });").length, 0, 'a create is a new row — its lists are its own');
    assert.equal(dealPutsIn("dbFetch('/.netlify/functions/contacts', { method: 'PUT', body: JSON.stringify(row) });").length, 0, 'another endpoint');
});

// ── WIRING ───────────────────────────────────────────────────────────────────

test('WIRING: the endpoint applies a note by compare-and-set, stamps it from the caller, and answers a refusal with the notes as stored', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    const branch = s.slice(s.indexOf("if ('note' in data) {"), s.indexOf("if ('comments' in data) return"));
    assert.ok(branch.length > 0, 'the note branch, before the whole-list refusal');
    assert.ok(s.indexOf("if ('note' in data) {") > s.indexOf('if (forbiddenPut) return forbiddenPut;'), 'after the ownership check');
    assert.ok(branch.includes("if (Object.keys(data).some(k => k !== 'id' && k !== 'note')) return { statusCode: 400"), 'a note alone');
    assert.ok(branch.includes('const me = await resolveCaller(userId, orgId);'), 'the caller from the session, never the body');
    assert.ok(branch.includes("const applied = applyNoteOp(stored.comments, op, { me, now: new Date().toISOString(), newId: 'note_' + crypto.randomUUID(), names });"));
    assert.ok(branch.includes('.where(and(eq(opportunities.id, data.id), eq(opportunities.orgId, orgId), notesStill(stored.comments)))'), 'the compare-and-set, in this org');
    assert.ok(branch.includes('[stored] = await db.select().from(opportunities).where(and(eq(opportunities.id, data.id), eq(opportunities.orgId, orgId)));'), 'a moved list read again');
    assert.ok(branch.includes("body: JSON.stringify({ error: applied.error, comments: notesOf(stored.comments) })"), 'a refusal answers the notes as stored');
    assert.ok(s.includes("? isNull(opportunities.comments)\n    : sql`${opportunities.comments} = ${JSON.stringify(stored)}::jsonb`);"));
});

test('WIRING: a whole notes list is refused, a single save\'s history and stage date are the server\'s, and neither is ever in a save\'s update', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(s.includes("if ('comments' in data) return { statusCode: 400, headers, body: JSON.stringify({ error: NOTE_WORDS.wholeList }) };"));
    assert.ok(s.includes("if (data.some(d => d && ('comments' in d || 'stageHistory' in d))) return { statusCode: 400"), 'nor in a bulk row');
    assert.ok(s.includes('delete data.stageHistory;\n            delete data.stageChangedDate;\n            delete data.closeDateMovedOn;'), 'a body\'s history and dates never written');
    assert.ok(s.includes('const move = stageMoveOf(existing, data, {\n                day: moveDayOf(sentDay, serverDay),\n                author: me.name || \'\', authorId: me.id ?? null,'));
    assert.ok(s.includes('const { id, comments: _notes, stageHistory: _history, ...updateData } = clean;'), 'the notes and history out of the update');
    assert.ok(s.includes('...(move ? { stageHistory: historyWith(move) } : {}),'), 'a move appended in the write');
    assert.ok(s.includes("THEN ${opportunities.stageHistory} ELSE '[]'::jsonb END) || ${JSON.stringify([entry])}::jsonb`;"), 'to the history as stored');
    assert.ok(!s.includes('previousComments'), 'no diff of two lists');
});

test('WIRING: the screens send operations and dealBody; the drag no history; the deal window offers edit and delete by the server\'s rule; a contact\'s Undo is a restore', () => {
    const hook = code(read('src/hooks/useOpportunities.js'));
    assert.ok(!hook.includes('saveDealComments'), 'REGRESSION: the whole-list save is back');
    const modal = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.ok(modal.includes('const r = await onSaveComment(opportunity.id, text);'), 'a post sends its text alone');
    assert.ok(!modal.includes("id: 'c_' + Date.now()"), 'REGRESSION (Q2): the browser names a note');
    assert.ok(modal.includes('const isOwn = mayChangeNote(c, { id: currentUserId, name: currentUser });'));
    assert.ok(code(read('src/components/layout/ModalLayer.jsx')).includes('currentUserId={currentUserId}'), 'the deal window knows the member\'s id');
    const undo = code(read('src/hooks/useContacts.js'));
    assert.ok(undo.includes('body: JSON.stringify({ ...c, restore: true }),'), 'the Undo marks a restore (Q4)');
    const c = code(read('netlify/functions/contacts.mjs'));
    assert.ok(c.includes('const newRow = data.restore === true'), 'the restore mark read');
    assert.ok(!c.includes("data.restore === true && userRole === 'Admin'"), 'for any role that may delete (Q4)');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/deal-data.test.mjs'), 'SUITES runs this file');
});
