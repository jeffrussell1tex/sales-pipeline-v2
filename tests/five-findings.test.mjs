// five-findings.test.mjs — today's five findings (state §0.240; docs/design/five-findings, Jeff's answers 10 Nov 2026).
// Findings 1, 2, 3 and 5 here; finding 4 (the day counts) is tests/date-local.test.mjs's.
//
// 1. A blank AI recommendation reads once more on the fallback and, when no answer brings one, the score is kept with
//    no next action; a signal with no words is dropped; the heading shows only over a next action.
// 2. A message link's refusal is an error — ⚠, kept until closed; a read that failed is said apart and keeps the link;
//    a partial bulk delete keeps its error on the Undo toast.
// 3. A deal email names who acted by member name, never the Clerk id; a rep's own move sends none, by owner id.
// 5. A deal's created date is the server's once it exists; a move to Closed Won with no won date is dated by the move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attemptOutcome } from '../src/utils/aiCall.js';
import { keepAppLink, APP_LINK_KEY, APP_LINK_WORDS } from '../src/utils/appLinks.js';
import { dealBody } from '../src/utils/dealNotes.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const answer = (body) => ({ status: 200, json: { content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason: 'end_turn' } });
const SCORE = { score: 40, verdict: 'At Risk', headline: 'h', signals: [], recommendation: 'Book the call' };

// ── 1 ────────────────────────────────────────────────────────────────────────

test('RULE (1): a blank recommendation is unreadable and retried, its answer carried; a next action reads', () => {
    for (const rec of ['', '   ', undefined, null, 7]) {
        const o = attemptOutcome(answer({ ...SCORE, recommendation: rec }));
        assert.deepEqual([o.ok, o.cause, o.retry, o.detail], [false, 'unreadable', true, 'a blank recommendation'], String(rec));
        assert.equal(o.parsed?.score, 40, 'the answer carried, to be kept when no answer brings one');
    }
    assert.deepEqual(attemptOutcome(answer(SCORE)), { ok: true, parsed: SCORE });
    assert.equal(attemptOutcome(answer({ ...SCORE, signals: [] })).ok, true, 'an empty signals list is no reason to ask again');
    assert.equal(attemptOutcome(answer({ ...SCORE, headline: '' })).ok, true, 'a blank headline neither (no screen shows it)');
});

test('WIRING (1): the scorer keeps the last answer that read, else one with no next action — said in the row; the screens hide what is blank', () => {
    const s = code(read('netlify/functions/ai-score.mjs'));
    assert.ok(s.includes('const kept = [...attempts].reverse().find((a) => a.outcome.ok) || [...attempts].reverse().find((a) => a.outcome.parsed) || null;'));
    assert.ok(s.includes('        if (!kept) {'), 'none read, none kept: the 502');
    assert.ok(s.includes("const fellBack = attempts.filter((a) => a !== kept).map((a) => ` · ${a === attempts[0] ? 'after' : 'then'} ${a.model}: ${a.outcome.detail}`).join('');"), 'every attempt not kept named');
    const m = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.ok(m.includes('{score.recommendation && (<>'), 'the heading only over a next action');
    assert.ok(m.includes('{(score.signals || []).some((s) => s?.text) && ('));
    assert.ok(m.includes('{score.signals.filter((s) => s?.text).map((s, i) => ('), 'no empty chip in the tab');
    assert.ok(m.includes('{aiSignals.filter((s) => s?.text).slice(0, 4).map((s, i) => ('), 'nor in the rail');
});

// ── 2 ────────────────────────────────────────────────────────────────────────

test('RULE (2): a link kept for a reload is a link of a kind the reader knows; the words for a read that failed', () => {
    const store = new Map();
    const fake = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
    keepAppLink({ kind: 'deal', id: 'opp_1', org: 'org_1' }, fake);
    assert.deepEqual(JSON.parse(store.get(APP_LINK_KEY)), { kind: 'deal', id: 'opp_1', org: 'org_1' });
    store.clear();
    keepAppLink({ kind: 'nope', id: 'x' }, fake);
    keepAppLink(null, fake);
    assert.equal(store.size, 0, 'no kind it knows, nothing kept');
    assert.doesNotThrow(() => keepAppLink({ kind: 'deal', id: 'x' }, { setItem: () => { throw new Error('quota'); } }), 'storage that refuses is no crash');
    assert.match(APP_LINK_WORDS.unread, /reload/);
    assert.notEqual(APP_LINK_WORDS.unread, APP_LINK_WORDS.deal, 'a read that failed is not a refusal');
});

test('WIRING (2): a partial bulk delete keeps its error on the Undo toast — contacts and accounts', () => {
    for (const [file, next] of [['src/hooks/useContacts.js', 'const handleSaveContact = async'], ['src/hooks/useAccounts.js', 'const handleSaveAccount = async']]) {
        const s = code(read(file));
        assert.ok(s.includes('let failNote = null;'), file);
        assert.ok(s.includes('                setUndoToast({ error: failNote });'), file);
        const tail = s.slice(0, s.indexOf(next));
        assert.ok(tail.trimEnd().endsWith('            );\n            if (failNote) setUndoToast(t => (t ? { ...t, error: failNote } : t));\n        });\n    };'), `${file}: the error put back on the Undo toast after softDelete`);
    }
});

// ── 3 ────────────────────────────────────────────────────────────────────────

test('WIRING (3): the deal emails name who acted, never the Clerk id; a rep\'s own move by owner id', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    assert.deepEqual(s.match(/\b(createdBy|closedBy|changedBy|updatedBy|commentBy):\s*[^,\n]*\buserId\b/g) || [], [], 'REGRESSION (§0.240): a Clerk id in a name slot');
    assert.ok(!/\b(rep|salesRep)\s*!==\s*userId\b/.test(s), 'REGRESSION (§0.176 (c)): a name compared to a Clerk id');
    assert.ok(s.includes("const actedBy = me.name || 'Someone';"));
    assert.ok(s.includes('const ownMove = !!upserted.ownerId && !!me.id && upserted.ownerId === me.id;'), 'by id, the null === null collision guarded');
    assert.ok(s.includes('            if (rep && stageChanged && !ownMove) {'));
    assert.ok(s.includes('            if (rep && !stageChanged && !ownMove) {'));
    for (const slot of ['closedBy:      actedBy,', 'changedBy:     actedBy,', 'updatedBy:     actedBy,', "createdBy:     creatorName || 'Someone',", "commentBy:     applied.note.author || 'Someone',"]) assert.ok(s.includes(slot), slot);
});

// ── 5 ────────────────────────────────────────────────────────────────────────

test('RULE (5): a deal\'s save sends no created date', () => {
    assert.deepEqual(dealBody({ id: 'd', createdDate: '2001-01-01', stage: 'X' }), { id: 'd', stage: 'X' });
});

test('WIRING (5): the created date is the server\'s once the deal exists; a create keeps a real day, else the server\'s; a won date by the move', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(s.includes('const createdDayOf = (d) => (isDay(d?.createdDate) ? d.createdDate : new Date().toISOString().slice(0, 10));'));
    assert.ok(s.includes("people.rows.map(d => sanitize({ ...d, createdDate: createdDayOf(d) }))"), 'the import\'s new rows');
    assert.ok(s.includes('const dated = { ...named, createdDate: createdDayOf(named) };'), 'a single create');
    assert.ok(s.includes("for (const d of data) if (d && typeof d === 'object') delete d.createdDate;"), 'an import row\'s left out — its stored one kept');
    assert.ok(s.includes('            delete data.createdDate;'), 'a single save\'s');
    assert.ok(s.includes("if (move && move.stage === 'Closed Won') clean.wonDate = (isDay(data.wonDate) && data.wonDate !== existing.wonDate) ? data.wonDate : move.date;"), 'a move into Closed Won dated by the move, or a real day the save names that is not the stored one');
    assert.ok(s.includes("else if (move && existing.stage === 'Closed Won') clean.wonDate = null;"), 'REGRESSION (the review): a deal reopened on the board kept its first win\'s date');
    const h = code(read('src/hooks/useOpportunities.js'));
    assert.ok(h.includes("? (!prevOpp ? (formData.wonDate || today) : prevOpp.stage === 'Closed Won' ? (prevOpp.wonDate || '') : today)"), 'a deal already won keeps its won date, none included; one won in this save is won today');
    assert.ok(code(read('src/utils/dealNotes.js')).includes('closeDateHistory: _closeDates, createdDate: _created, ...rest } = row;'));
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/five-findings.test.mjs'), 'SUITES runs this file');
});
