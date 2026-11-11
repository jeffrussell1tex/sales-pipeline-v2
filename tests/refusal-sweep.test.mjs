// tests/refusal-sweep.test.mjs — the rest of the refusal sweep: every refusal and every failed request is said, kept until
// closed, in the house words (state §0.245, guide §18b125 rule 5, §18b123 rule 4; docs/design/refusal-sweep, Jeff's answers
// of 11 Nov: "Parts 1-4 now (Recommended)", Q1-Q20 "All Recommended").
//
// tests/refusals-said.test.mjs stays THE GUARD (its three scans; each Part adds the files it cleans to SWEPT). This suite
// RUNS each Part's handlers — extracted from the source with between()/code(), built with new Function over stubs, and
// run against the answers a member meets: a refusal with the server's words and a ref, a 403, a 502's HTML page, a
// request that never left, an answer that lands after an org switch — and holds the WIRING the RUN cannot reach.
//
// Part 1 (1a-1e): the Pipeline's stage drag said nothing when refused and left the card where it was dropped — the deal
// window then sent the refused stage with its next save; it is said in a press notice (Q1) and put back, by identity.
// The drag is offered only to a member who may change deals (Q2). The deal window reads the ok check first and says the
// house words (Q3) — a 502's page said "…Please check your connection" though the server answered. The Closed Lost
// dialog's rollback puts back only its own copy (1e).
//
// Part 2 (2a-2d): the Tasks tab's ✓ and Snooze un-ticked without a word — the completion read its body before the ok
// check (a 502's page, or a landed answer that was not JSON, rolled it back) and the Snooze threw 'HTTP ' + status. One
// helper reads every task write's answer (taskWriteAnswer); a refusal is put back by identity and said in a press notice
// (Q1); the task window says the house words (Q3); Home's dead Complete is gone (Q5); the reminder popups send nothing.
//
// Part 3 (3a-3d): Reports' "Contacts on this deal" — a refused add or remove left the panel open or the contact on with
// nothing said, and a refused buyer persona fell back to the loaded copy (a persona that landed earlier reverted) after
// sending the whole loaded contact. One banner in that section says each, kept until its Close; a landed change clears it,
// and so does picking another deal (Q6). The persona sends only what changes and puts back what the chip showed, only
// while that pick is still the one shown.
//
// Part 4 (4a-4b): Settings → Data → Export — a refused schedule Delete set the LOAD's error, which replaced the whole
// page with a red box and no Close, and its rollback put back the whole list as at the click (a Pause landed meanwhile
// undone). It is said on the panel's banner, kept until its Close, and only its own row is put back. A refused schedule
// save or GDPR request was window.alert("Save failed: Failed to fetch"); it is said inside the open window, above its
// buttons, in the house words, and the window stays open until it saves or is closed (Q8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRefusal, failureWords } from '../src/utils/refusalWords.js';
import { refusalOf, NETWORK_ERROR } from '../src/utils/storage.js';
import { pressNoticeOf } from '../src/utils/pressNotice.js';
import { taskWriteAnswer } from '../src/utils/taskWrite.js';
import { sentBody, shownRow } from '../src/utils/leaveOut.js';
import { dealBody } from '../src/utils/dealNotes.js';
import { contactNamesText } from '../src/utils/oppText.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const quiet = { error: () => {}, warn: () => {}, log: () => {} };
// A state setter that applies updaters, as React's does.
const stateOf = (initial) => {
    const s = { value: initial };
    s.set = (u) => { s.value = typeof u === 'function' ? u(s.value) : u; };
    return s;
};

// ── Part 1 ──────────────────────────────────────────────────────────────────────────────────────────────────────

// pressNoticeOf (1a): a notice of its own per press — its own id, the title and words, no notes refused.
test('Part 1a: pressNoticeOf — one notice per press, its own id, kept by ModalLayer until its ✕ — RUN', () => {
    const a = pressNoticeOf('Acme renewal', 'Not moved to Proposal: Admin only');
    const b = pressNoticeOf('Acme renewal', 'Not moved to Proposal: Admin only');
    assert.deepEqual({ ...a, id: 'x' }, { id: 'x', title: 'Acme renewal', words: 'Not moved to Proposal: Admin only', refused: null });
    assert.ok(a.id.startsWith('press_') && a.id.length > 'press_'.length, a.id);
    assert.notEqual(a.id, b.id, 'two presses, two notices: the ✕ closes one by its id');
    // Drawn as TaskRail's notices are: "⚠ <title> — <words>", a ✕ that closes it by id; no timer closes one.
    const layer = code(read('src/components/layout/ModalLayer.jsx'));
    order(between(layer, '{pressNotices && pressNotices.length > 0 && (', '{notesPopover && ('),
        '⚠ <strong>{n.title}</strong> — {n.words}', '<button onClick={() => setPressNotices(list => list.filter(x => x.id !== n.id))}', '✕</button>');
    assert.ok(!/setTimeout\([^;]*setPressNotices/.test(layer), 'REGRESSION: a press notice closed on a timer');
    assert.ok(read('src/hooks/useModalState.js').includes('const [pressNotices, setPressNotices] = useOrgBoundState(remembered, []);'), 'cleared by an org switch');
});

// handleKanbanDrop, extracted and run (1a, 1d): a refused or unsent move is put back — this drag's own copy, by identity —
// and said in a press notice; a landed move takes the deal as stored; an answer after an org switch changes nothing.
let builtDrop;
const kanbanDrop = () => builtDrop || (builtDrop = (() => {
    const fn = between(code(read('src/components/KanbanView.jsx')), '    const handleKanbanDrop = (toStage) => {', '\n    };') + '\n    };';
    return new Function('kanbanDragging', 'setKanbanDragging', 'setKanbanDragOver', 'todayLocal', 'opportunities', 'currentUser',
        'setOpportunities', 'requestOrg', 'dbWrite', 'stillOrg', 'setPressNotices', 'pressNoticeOf', 'promptSpiffClaim', 'console',
        'dragBase', `${fn}\nreturn handleKanbanDrop;`);
})());
// The module's dragBase (KanbanView.jsx): one map across every drag, as at module scope.
const DRAG_BASE = new WeakMap();
const DEAL = Object.freeze({ id: 'd1', opportunityName: 'Acme renewal', account: 'Acme', stage: 'Qualification', stageChangedDate: '2025-12-01', stageHistory: [] });
const OTHER = Object.freeze({ id: 'd2', opportunityName: 'Beta', account: 'Beta Co', stage: 'Proposal' });
const drag = async ({ toStage = 'Proposal', answer, list = [DEAL, OTHER], oppId = 'd1', meanwhile, switchOrg = false }) => {
    const opps = stateOf(list), notices = stateOf([]);
    const did = { sent: [], spiff: [], dragging: [], dragOver: [] };
    let org = 'org_a', answerWith;
    const answered = new Promise((r) => { answerWith = r; });
    const drop = kanbanDrop()({ oppId, fromStage: 'Qualification' }, (v) => did.dragging.push(v), (v) => did.dragOver.push(v),
        () => '2026-01-02', list, 'Karen Rep', opps.set, () => 'org_a',
        (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); return answered; },
        (o) => o === org, notices.set, pressNoticeOf, (d) => did.spiff.push(d), quiet, DRAG_BASE);
    drop(toStage);
    const shown = opps.value;
    if (meanwhile) meanwhile(opps);
    if (switchOrg) org = 'org_b';
    answerWith(answer);
    await settle();
    return { list: opps.value, shown, notices: notices.value, ...did };
};
const refused403 = async () => ({ ok: false, status: 403, error: await refusalOf({ status: 403, json: async () => ({ error: 'Forbidden' }) }) });

test('Part 1a: a refused drag is put back — the same row it was — and said in a press notice; no SPIFF offered — RUN', async () => {
    const r = await drag({ answer: await refused403() });
    assert.deepEqual(r.sent, [['/.netlify/functions/opportunities', 'PUT', { id: 'd1', stage: 'Proposal', stageChangedDate: '2026-01-02' }]],
        'the stage and the member\'s day (todayLocal, 1d) — nothing else');
    assert.equal(r.shown[0].stage, 'Proposal', 'shown at once');
    assert.equal(r.list[0], DEAL, 'REGRESSION: the card left where it was dropped — the deal window would send the refused stage');
    assert.equal(r.list[1], OTHER, 'nothing else is touched');
    assert.equal(r.notices.length, 1);
    assert.equal(r.notices[0].title, 'Acme renewal');
    assert.equal(r.notices[0].words, 'Not moved to Proposal: You do not have permission to make this change.');
    assert.equal(r.notices[0].refused, null);
    assert.deepEqual([r.dragging, r.dragOver], [[null], [null]], 'the drag ends');
    const won = await drag({ toStage: 'Closed Won', answer: await refused403() });
    assert.equal(won.list[0], DEAL);
    assert.deepEqual(won.spiff, [], 'REGRESSION: a refused Closed Won offers a SPIFF claim');
    assert.equal(won.notices[0].words, 'Not moved to Closed Won: You do not have permission to make this change.');
    // The server's words with their ref, as dbWrite says them (refusalOf).
    const words = await refusalOf({ status: 409, json: async () => ({ error: 'Stage not in this pipeline', requestId: 'r7' }) });
    const r409 = await drag({ answer: { ok: false, status: 409, error: words } });
    assert.equal(r409.notices[0].words, 'Not moved to Proposal: Stage not in this pipeline (ref r7)');
    // A deal with no name is named by its account, else "A deal".
    const unnamed = await drag({ list: [{ ...DEAL, opportunityName: '' }], answer: await refused403() });
    assert.equal(unnamed.notices[0].title, 'Acme');
    const bare = await drag({ list: [{ ...DEAL, opportunityName: '', account: '' }], answer: await refused403() });
    assert.equal(bare.notices[0].title, 'A deal');
});

test('Part 1a: a drag that never left is put back and said — RUN', async () => {
    const r = await drag({ answer: { ok: false, status: 0, error: NETWORK_ERROR } });
    assert.equal(r.list[0], DEAL);
    assert.deepEqual(r.notices.map((n) => n.words), [`Not moved to Proposal: ${NETWORK_ERROR}`]);
});

test('Part 1a: a landed drag takes the deal as stored and says nothing; Closed Won offers the stored deal — RUN', async () => {
    const stored = { ...DEAL, stage: 'Proposal', stageChangedDate: '2026-01-02', stageHistory: [{ stage: 'Proposal' }], accountId: 'acc_1' };
    const r = await drag({ answer: { ok: true, status: 200, error: null, data: { opportunity: stored } } });
    assert.equal(r.list[0], stored);
    assert.deepEqual(r.notices, []);
    assert.deepEqual(r.spiff, []);
    const wonRow = { ...stored, stage: 'Closed Won' };
    const won = await drag({ toStage: 'Closed Won', answer: { ok: true, status: 200, error: null, data: { opportunity: wonRow } } });
    assert.deepEqual(won.spiff, [wonRow], 'the claim offered on the deal as stored');
    // An answer with no row keeps the move shown, and offers the shown deal.
    const none = await drag({ toStage: 'Closed Won', answer: { ok: true, status: 200, error: null, data: null } });
    assert.equal(none.list[0], none.shown[0]);
    assert.equal(none.spiff[0], none.shown[0]);
    assert.deepEqual(none.notices, []);
});

test('Part 1a: an answer after an org switch puts nothing back and says nothing — RUN', async () => {
    const refused = await drag({ answer: await refused403(), switchOrg: true });
    assert.equal(refused.list, refused.shown, 'REGRESSION: the last org\'s refusal put back into the list on screen');
    assert.deepEqual(refused.notices, [], 'REGRESSION: the last org\'s refusal said in the org switched to');
    const stored = { ...DEAL, stage: 'Proposal' };
    const landed = await drag({ answer: { ok: true, status: 200, error: null, data: { opportunity: stored } }, switchOrg: true, toStage: 'Closed Won' });
    assert.equal(landed.list, landed.shown, 'the last org\'s deal never written into the list on screen');
    assert.deepEqual(landed.spiff, []);
});

test('Part 1a: put back by identity — a list read again before the answer stands; the words are still said — RUN', async () => {
    let fresh;
    const r = await drag({ answer: await refused403(), meanwhile: (opps) => { fresh = opps.value.map((o) => ({ ...o, stage: o.id === 'd1' ? 'Proposal' : o.stage })); opps.set(fresh); } });
    assert.equal(r.list[0], fresh[0], 'REGRESSION: the list read since was overwritten with the copy this drag began on');
    assert.equal(r.list[1], fresh[1]);
    assert.equal(r.notices.length, 1, 'still said');
    // A second drag of the same deal before the first answers: the first's refusal leaves the second's copy.
    const second = { ...DEAL, stage: 'Discovery' };
    const r2 = await drag({ answer: await refused403(), meanwhile: (opps) => opps.set(opps.value.map((o) => (o.id === 'd1' ? second : o))) });
    assert.equal(r2.list[0], second);
});

// Two drags of one deal, the second made while the first is unanswered: the board re-renders between them, so drag 2
// begins from drag 1's copy. Each drop's answer is held until the case gives it.
const dragChain = () => {
    const opps = stateOf([DEAL, OTHER]), notices = stateOf([]);
    const drop = (toStage, fromStage) => {
        let answerWith;
        const answered = new Promise((r) => { answerWith = r; });
        kanbanDrop()({ oppId: 'd1', fromStage }, () => {}, () => {}, () => '2026-01-02', opps.value, 'Karen Rep', opps.set,
            () => 'org_a', () => answered, (o) => o === 'org_a', notices.set, pressNoticeOf, () => {}, quiet, DRAG_BASE)(toStage);
        return { answer: async (a) => { answerWith(a); await settle(); } };
    };
    return { opps, notices, drop };
};

test('Part 1a: two drags of one deal, the second before the first answers, both refused — the deal as stored put back, answers in order or reversed — RUN', async () => {
    for (const reversed of [false, true]) {
        const c = dragChain();
        const one = c.drop('Proposal', 'Qualification');
        const two = c.drop('Negotiation', 'Proposal');
        assert.equal(c.opps.value[0].stage, 'Negotiation', 'drag 2 shown');
        const [first, second] = reversed ? [two, one] : [one, two];
        await first.answer(await refused403());
        if (!reversed) assert.equal(c.opps.value[0].stage, 'Negotiation', 'drag 1\'s refusal leaves drag 2\'s copy while it is out');
        else assert.equal(c.opps.value[0], DEAL, 'drag 2\'s refusal puts back the deal as stored');
        await second.answer(await refused403());
        assert.equal(c.opps.value[0], DEAL, `REGRESSION: the card left in drag 1's stage, never stored (${reversed ? 'reversed' : 'in order'})`);
        assert.equal(c.opps.value[1], OTHER);
        assert.deepEqual(c.notices.value.map((n) => n.words).sort(),
            ['Not moved to Negotiation: You do not have permission to make this change.', 'Not moved to Proposal: You do not have permission to make this change.'],
            'each refusal said');
    }
});

test('Part 1a: two drags of one deal — drag 1 landed, drag 2 refused — the deal as stored stands; a drag begun from a stored row puts back that row — RUN', async () => {
    const stored = Object.freeze({ ...DEAL, stage: 'Proposal', stageChangedDate: '2026-01-02', accountId: 'acc_1' });
    const landed = { ok: true, status: 200, error: null, data: { opportunity: stored } };
    for (const reversed of [false, true]) {
        const c = dragChain();
        const one = c.drop('Proposal', 'Qualification');
        const two = c.drop('Negotiation', 'Proposal');
        if (reversed) {
            await two.answer(await refused403());
            assert.equal(c.opps.value[0], DEAL, 'drag 2 refused first: the start of the chain');
            await one.answer(landed);
        } else {
            await one.answer(landed);
            await two.answer(await refused403());
        }
        assert.equal(c.opps.value[0], stored, `REGRESSION: drag 1's stored deal overwritten by drag 2's put-back (${reversed ? 'reversed' : 'in order'})`);
        assert.equal(c.notices.value.length, 1, 'drag 2\'s refusal said');
    }
    // Drag 1 landed before drag 2 began: drag 2 begins from the stored row, and its refusal puts that row back.
    const c = dragChain();
    await c.drop('Proposal', 'Qualification').answer(landed);
    assert.equal(c.opps.value[0], stored);
    await c.drop('Negotiation', 'Proposal').answer(await refused403());
    assert.equal(c.opps.value[0], stored, 'REGRESSION: a drag begun from the stored row put back something else');
});

test('Part 1d: a drop on a deal gone since ends the drag, sends nothing — RUN', async () => {
    const r = await drag({ oppId: 'gone', answer: await refused403() });
    assert.deepEqual(r.sent, []);
    assert.deepEqual([r.dragging, r.dragOver], [[null], [null]], 'REGRESSION: the drag state left set');
    assert.deepEqual(r.notices, []);
});

test('Part 1a/1b/1d: WIRING — the drag writes through dbWrite and says a refusal; only a member who may change deals drags', () => {
    const k = code(read('src/components/KanbanView.jsx'));
    const drop = between(k, '    const handleKanbanDrop = (toStage) => {', '\n    };');
    assert.ok(!k.includes("console.error('Stage change not saved'"), 'REGRESSION: a refused move logged, never said');
    assert.ok(drop.includes("dbWrite('/.netlify/functions/opportunities', {") && !drop.includes('dbFetch('), 'dbWrite: never throws, so the catch never puts back a move that landed');
    assert.ok(k.includes("import { dbWrite, requestOrg, stillOrg } from '../utils/storage';"));
    assert.ok(k.includes("import { pressNoticeOf } from '../utils/pressNotice.js';"));
    assert.ok(k.includes('const { stages, opportunities, setOpportunities, currentUser, activities, promptSpiffClaim, setPressNotices } = useApp();'));
    assert.ok(!k.includes('setTimeout'), 'REGRESSION: a refusal on the board closed on a timer');
    assert.ok(!drop.includes('setUndoToast'), 'never the one-slot toast a later toast replaces (Q1)');
    assert.ok(drop.includes('const today = todayLocal();') && !drop.includes('getFullYear'), '1d: the member\'s day through todayLocal');
    // The chain's start (the review): one map at module scope, outside the component — every render shares it.
    assert.equal(count(k, 'const dragBase = new WeakMap();'), 1);
    assert.ok(k.indexOf('const dragBase = new WeakMap();') < k.indexOf('export default function KanbanView('), 'at module scope');
    assert.ok(k.includes('\nconst dragBase = new WeakMap();'), 'not inside a function');
    // 1b (Q2): the card is draggable, and a drag starts, only for canEdit — canEditCrm, PipelineTab's.
    assert.equal(count(k, 'draggable={canEdit}'), 1);
    assert.ok(!/\bdraggable\s*\n/.test(k) && !/\bdraggable\s*=\s*\{\s*true\s*\}/.test(k), 'REGRESSION: every card draggable');
    assert.ok(k.includes('onDragStart={() => { if (canEdit) setKanbanDragging({ oppId: opp.id, fromStage: stage }); }}'));
    assert.ok(k.includes('onTouchStart={() => { if (canEdit) setKanbanDragging({ oppId: opp.id, fromStage: stage }); }}'));
    assert.equal(count(k, 'setKanbanDragging({'), 2, 'no other start');
    assert.ok(k.includes('    canEdit = false,'), 'a board not told may not drag');
    const p = code(read('src/Tabs/PipelineTab.jsx'));
    assert.ok(p.includes('const canEdit    = canEditCrm(userRole);'));
    assert.ok(between(p, '<KanbanView', '/>').includes('canEdit={canEdit}'), 'PipelineTab hands the board its canEdit');
});

// handleSave, extracted and run (1c): the ok check first; a refusal says the server's words with their ref, else "The
// server returned N."; a request that never left says "The server could not be reached."; the list unchanged.
let builtSave;
const dealSave = () => builtSave || (builtSave = (() => {
    const hook = code(read('src/hooks/useOpportunities.js'));
    const fn = between(hook, '    const handleSave = (formData, editingOpp, activePipeline, currentUser,', '\n    };\n\n    const completeLostSave') + '\n    };';
    return new Function('opportunities', 'setOpportunities', 'setOppModalError', 'setOppModalSaving', 'requestOrg', 'stillOrg', 'dbFetch',
        'dealBody', 'sentBody', 'shownRow', 'readRefusal', 'failureWords', 'addAudit', 'fireMentionSms', 'deps', 'console',
        `${fn}\nreturn handleSave;`);
})());
const STORED = Object.freeze({ id: 'd1', opportunityName: 'Acme renewal', account: 'Acme', stage: 'Proposal', createdDate: '2026-01-01', stageChangedDate: '2026-01-01' });
const save = async ({ answer, create = false, switchOrg = false }) => {
    const list = [STORED];
    const opps = stateOf(list);
    const did = { errors: [], saving: [], audits: [], closed: [], sent: [] };
    let org = 'org_a';
    const handleSave = dealSave()([STORED], opps.set, (v) => did.errors.push(v), (v) => did.saving.push(v), () => 'org_a', (o) => o === org,
        async (url, opts) => { did.sent.push(opts.method); if (switchOrg) org = 'org_b'; if (answer instanceof Error) throw answer; return answer; },
        dealBody, sentBody, shownRow, readRefusal, failureWords, (...a) => did.audits.push(a), () => {}, {}, quiet);
    const formData = { opportunityName: 'Acme renewal', account: 'Acme', stage: 'Proposal', salesRep: '' };
    handleSave(formData, create ? null : { id: 'd1' }, { id: 'pl_1' }, 'Karen Rep', (v) => did.closed.push(v), () => {});
    await settle();
    return { ...did, list: opps.value, same: opps.value === list, said: did.errors[did.errors.length - 1] };
};
const answerOf = (status, body) => ({ ok: status < 400, status, json: async () => { if (body instanceof Error) throw body; return body; } });
const PAGE_502 = () => answerOf(502, new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"));

test('Part 1c: the deal window says a refused save in the house words, the list unchanged — RUN', async () => {
    const cases = [
        [answerOf(403, { error: 'Only the deal owner or a manager can change this deal' }), 'Only the deal owner or a manager can change this deal'],
        [answerOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
        [answerOf(400, {}), 'The server returned 400.'],
        [PAGE_502(), 'The server returned 502.'],
        [new TypeError('Failed to fetch'), 'The server could not be reached.'],
    ];
    for (const [answer, words] of cases) {
        const r = await save({ answer });
        assert.deepEqual(r.sent, ['PUT']);
        assert.equal(r.said, words, `REGRESSION: ${words}`);
        assert.ok(r.same, 'the list unchanged');
        assert.deepEqual([r.audits, r.closed], [[], []], 'no audit; the window stays open');
        assert.equal(r.saving[r.saving.length - 1], false, 'the Save button back');
    }
    const landed = await save({ answer: answerOf(200, { opportunity: { ...STORED, arr: 5 } }) });
    assert.deepEqual(landed.list, [{ ...STORED, arr: 5 }], 'the deal as stored');
    assert.equal(landed.said, null);
    assert.deepEqual(landed.closed, [false]);
    // A 200 whose body was not JSON: saved — the list shows the copy sent, never a parse error.
    const unread = await save({ answer: answerOf(200, new SyntaxError('Unexpected end of JSON input')) });
    assert.equal(unread.said, null);
    assert.equal(unread.list[0].id, 'd1');
    assert.deepEqual(unread.closed, [false]);
});

test('Part 1c: a new deal\'s refused or unsent save says the house words, appends nothing — RUN', async () => {
    for (const [answer, words] of [[PAGE_502(), 'The server returned 502.'], [new TypeError('Failed to fetch'), 'The server could not be reached.'],
        [answerOf(409, { error: 'A deal with this name exists', requestId: 'r2' }), 'A deal with this name exists (ref r2)']]) {
        const r = await save({ answer, create: true });
        assert.deepEqual(r.sent, ['POST']);
        assert.equal(r.said, words, `REGRESSION: ${words}`);
        assert.ok(r.same, 'nothing appended');
        assert.deepEqual([r.audits, r.closed], [[], []]);
    }
    const landed = await save({ answer: answerOf(201, { opportunity: { id: 'd9', opportunityName: 'Acme renewal' } }), create: true });
    assert.deepEqual(landed.list.map((o) => o.id), ['d1', 'd9']);
    assert.deepEqual(landed.closed, [false]);
});

test('Part 1c: an answer after an org switch says nothing and writes nothing — RUN', async () => {
    for (const create of [false, true]) {
        const refused = await save({ answer: answerOf(403, { error: 'Forbidden' }), create, switchOrg: true });
        assert.deepEqual(refused.errors, [null], `${create ? 'create' : 'edit'}: REGRESSION — the last org's refusal said on the window of the org switched to`);
        const landed = await save({ answer: answerOf(200, { opportunity: { id: create ? 'd9' : 'd1', stage: 'Won elsewhere' } }), create, switchOrg: true });
        assert.ok(landed.same, `${create ? 'create' : 'edit'}: REGRESSION — the last org's deal written into the list on screen`);
        assert.deepEqual(landed.audits, []);
        const offline = await save({ answer: new TypeError('Failed to fetch'), create, switchOrg: true });
        assert.deepEqual(offline.errors, [null]);
    }
});

test('Part 1c: WIRING — the deal window reads the ok check first; no old sentence left', () => {
    const hook = code(read('src/hooks/useOpportunities.js'));
    assert.ok(hook.includes("import { readRefusal, failureWords } from '../utils/refusalWords.js';"));
    assert.equal(count(hook, 'if (!res.ok) { const why = await readRefusal(res); if (!stillOrg(askedOrg)) return; setOppModalError(why); return; }'), 2, 'the edit and the create');
    assert.equal(count(hook, 'const data = await res.json().catch(() => ({}));'), 2);
    assert.ok(!hook.includes('Please check your connection'), 'REGRESSION: "check your connection" when the server answered');
    assert.ok(!hook.includes("data.error || 'Failed to save opportunity"), 'REGRESSION: a refusal with no words said as a fallback, not the status');
    assert.equal(count(hook, 'setOppModalError(failureWords(err));'), 2);
});

// completeLostSave (1e), extracted and run: a refused Closed Lost puts back only the copy it showed, by identity.
test('Part 1e: the Closed Lost dialog\'s refusal puts back only its own copy — a list read again since stands — RUN', async () => {
    const hook = code(read('src/hooks/useOpportunities.js'));
    const fn = between(hook, '    const completeLostSave = async (', '\n    };\n') + '\n    };';
    const run = async ({ answer, meanwhile }) => {
        const before = { id: 'd1', opportunityName: 'Acme renewal', stage: 'Proposal' };
        const opps = stateOf([before]);
        let answerWith;
        const answered = new Promise((r) => { answerWith = r; });
        const lostSave = new Function('opportunities', 'setOpportunities', 'requestOrg', 'stillOrg', 'dbWrite', 'dealBody', 'sentBody', 'shownRow', 'addAudit',
            `${fn}\nreturn completeLostSave;`)([before], opps.set, () => 'org_a', () => true, () => answered, dealBody, sentBody, shownRow, () => {});
        const out = lostSave({ ...before, stage: 'Closed Lost' }, { id: 'd1' }, 'Price', 'Budget', { id: 'pl_1' }, 'Karen Rep', () => {});
        const shown = opps.value[0];
        if (meanwhile) meanwhile(opps);
        answerWith(answer);
        return { said: await out, list: opps.value, before, shown };
    };
    const refused = { ok: false, status: 403, error: 'You do not have permission to make this change.' };
    const r = await run({ answer: refused });
    assert.equal(r.shown.stage, 'Closed Lost', 'shown at once');
    assert.equal(r.list[0], r.before, 'put back');
    assert.equal(r.said.error, 'Not saved as Closed Lost — You do not have permission to make this change.');
    let fresh;
    const r2 = await run({ answer: refused, meanwhile: (opps) => { fresh = { id: 'd1', opportunityName: 'Acme renewal', stage: 'Negotiation' }; opps.set([fresh]); } });
    assert.equal(r2.list[0], fresh, 'REGRESSION: a list read again since overwritten with the copy the dialog began on');
});

// ── Part 2 ──────────────────────────────────────────────────────────────────────────────────────────────────────

const FORBIDDEN = 'Forbidden: you can only modify your own or unassigned records';   // _ownership.mjs OWNERSHIP_FORBIDDEN
// The answers a task write meets: [answer, the words said]. A thrown answer is the request that never left.
const TASK_REFUSALS = () => [
    [answerOf(403, { error: FORBIDDEN, code: 'OWNERSHIP_FORBIDDEN' }), FORBIDDEN],
    [answerOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
    [answerOf(400, {}), 'The server returned 400.'],
    [PAGE_502(), 'The server returned 502.'],
    [new TypeError('Failed to fetch'), 'The server could not be reached.'],
];

// taskWriteAnswer (2a): the ok check first; the house words; a landed answer that is not JSON is landed; never throws.
test('Part 2a: taskWriteAnswer — a refusal in the server\'s words with their ref, else the status; unsent, the plain words; a landed page not JSON is landed — RUN', async () => {
    for (const [answer, words] of TASK_REFUSALS()) {
        const got = await taskWriteAnswer(async () => { if (answer instanceof Error) throw answer; return answer; });
        assert.deepEqual(got, { ok: false, error: words }, `REGRESSION: ${words}`);
    }
    // A refused answer's body is read once, after the ok check — never before it.
    let reads = 0;
    const refused = { ok: false, status: 409, json: async () => { reads += 1; return { error: 'Changed since', requestId: 'r9' }; } };
    assert.deepEqual(await taskWriteAnswer(async () => refused), { ok: false, error: 'Changed since (ref r9)' });
    assert.equal(reads, 1);
    // Landed: the task as stored; a body with none, or no JSON at all, is still landed — the screen keeps its copy.
    const stored = { id: 't1', title: 'Call Dana', status: 'Completed' };
    assert.deepEqual(await taskWriteAnswer(async () => answerOf(200, { task: stored })), { ok: true, task: stored });
    assert.deepEqual(await taskWriteAnswer(async () => answerOf(200, {})), { ok: true, task: null });
    assert.deepEqual(await taskWriteAnswer(async () => answerOf(200, new SyntaxError('Unexpected end of JSON input'))), { ok: true, task: null },
        'REGRESSION: a completion the server saved rolled back because its answer was not JSON');
    // A send that throws a non-network failure says its answer could not be read — never the error's own words.
    assert.deepEqual(await taskWriteAnswer(async () => { throw new SyntaxError("Unexpected token '<'"); }), { ok: false, error: 'Its answer could not be read.' });
    const src = code(read('src/utils/taskWrite.js'));
    assert.ok(src.includes("import { readRefusal, failureWords } from './refusalWords.js';"));
    order(src, 'if (!res.ok) return { ok: false, error: await readRefusal(res) };', 'const data = await res.json().catch(() => null);');
});

// handleCompleteTask (2b), extracted and run over the real taskWriteAnswer: a refused or unsent completion is put back —
// this press's own copy, by identity — and answers { ok: false, error } in the house words; a landed one takes the task
// as stored and writes its audit row; an answer after an org switch changes nothing and answers undefined.
let builtComplete;
const completeTask = () => builtComplete || (builtComplete = (() => {
    const fn = between(code(read('src/hooks/useTasks.js')), '    const handleCompleteTask = async (taskId, newStatus) => {', '\n    };\n\n    const handleAddTaskToCalendar') + '\n    };';
    return new Function('tasks', 'setTasks', 'dbFetch', 'taskWriteAnswer', 'addAudit', 'requestOrg', 'stillOrg', 'console',
        `${fn}\nreturn handleCompleteTask;`);
})());
const TASK = Object.freeze({ id: 't1', title: 'Call Dana', type: 'Call', status: 'Open', completed: false, dueDate: '2026-11-10' });
const TASK_2 = Object.freeze({ id: 't2', title: 'Email Ben', status: 'Open', completed: false });
const complete = async ({ answer, list = [TASK, TASK_2], taskId = 't1', meanwhile, switchOrg = false }) => {
    const tasks = stateOf(list);
    const did = { sent: [], audits: [], logged: [] };
    let org = 'org_a', answerWith;
    const answered = new Promise((r) => { answerWith = r; });
    const out = completeTask()(list, tasks.set,
        (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); return answered.then((a) => { if (a instanceof Error) throw a; return a; }); },
        taskWriteAnswer, (...a) => did.audits.push(a), () => 'org_a', (o) => o === org,
        { error: (...a) => did.logged.push(a), warn: () => {}, log: () => {} })(taskId, 'Completed');
    const shown = tasks.value;
    if (meanwhile) meanwhile(tasks);
    if (switchOrg) org = 'org_b';
    answerWith(answer);
    return { said: await out, list: tasks.value, shown, ...did };
};

test('Part 2b: a refused or unsent completion is put back — the same row it was — and answers the house words — RUN', async () => {
    for (const [answer, words] of TASK_REFUSALS()) {
        const r = await complete({ answer });
        assert.equal(r.sent.length, 1);
        assert.deepEqual([r.sent[0][0], r.sent[0][1], r.sent[0][2].id, r.sent[0][2].status, r.sent[0][2].completed], ['/.netlify/functions/tasks', 'PUT', 't1', 'Completed', true]);
        assert.equal(r.shown[0].status, 'Completed', 'shown at once');
        assert.deepEqual(r.said, { ok: false, error: words }, `REGRESSION: ${words}`);
        assert.equal(r.list[0], TASK, 'REGRESSION: a refused completion left ticked on screen');
        assert.equal(r.list[1], TASK_2, 'nothing else is touched');
        assert.deepEqual(r.audits, [], 'no audit row for a completion that did not land');
    }
});

test('Part 2b: put back by identity — a row a load brought in since stands — RUN', async () => {
    let fresh;
    const r = await complete({ answer: answerOf(403, { error: FORBIDDEN }), meanwhile: (tasks) => { fresh = { ...TASK, title: 'Call Dana (moved)', status: 'Completed' }; tasks.set([fresh, TASK_2]); } });
    assert.equal(r.list[0], fresh, 'REGRESSION: the row read since was overwritten with the copy this press began on');
    assert.deepEqual(r.said, { ok: false, error: FORBIDDEN }, 'still answered');
});

test('Part 2b: a landed completion takes the task as stored, writes its audit row and answers ok — RUN', async () => {
    const stored = { ...TASK, status: 'Completed', completed: true, completedDate: '2026-11-11', updatedAt: 'now' };
    const r = await complete({ answer: answerOf(200, { task: stored }) });
    assert.deepEqual(r.said, { ok: true });
    assert.equal(r.list[0], stored);
    assert.equal(r.list[1], TASK_2);
    assert.deepEqual(r.audits, [['update', 'task', 't1', 'Call Dana', 'Completed']]);
    // A landed answer that is not JSON: landed — the copy sent stays, the audit is written, never rolled back.
    const unread = await complete({ answer: answerOf(200, new SyntaxError('Unexpected end of JSON input')) });
    assert.deepEqual(unread.said, { ok: true }, 'REGRESSION: a completion the server saved said as not completed');
    assert.equal(unread.list[0], unread.shown[0]);
    assert.equal(unread.list[0].status, 'Completed');
    assert.equal(unread.audits.length, 1);
});

test('Part 2b: an answer after an org switch puts nothing back, writes nothing and answers undefined — RUN', async () => {
    for (const answer of [answerOf(403, { error: FORBIDDEN }), new TypeError('Failed to fetch'), answerOf(200, { task: { ...TASK, status: 'Completed' } })]) {
        const r = await complete({ answer, switchOrg: true });
        assert.equal(r.said, undefined, 'REGRESSION: the last org\'s answer said in the org switched to');
        assert.equal(r.list, r.shown, 'REGRESSION: the last org\'s answer written into the list on screen');
        assert.deepEqual(r.audits, []);
    }
});

test('Part 2b: a task gone from the list says so and sends nothing — RUN', async () => {
    const r = await complete({ taskId: 'gone', answer: answerOf(200, {}) });
    assert.deepEqual(r.sent, []);
    assert.deepEqual(r.said, { ok: false, error: 'The task could not be found. Reload the page to try again.' });
    assert.equal(r.list, r.shown, 'nothing touched');
});

// QRow's ✓ and Snooze (2c), extracted and run; TasksTab's sayRefused with them: a refusal is said in a press notice.
let builtRow;
const qRowHandlers = () => builtRow || (builtRow = (() => {
    const t = code(read('src/Tabs/TasksTab.jsx'));
    const fn = between(t, '    const handleComplete = async e => {', '\n    return (');
    const say = between(t, '    const sayRefused = (task, words) =>', '\n');
    return {
        row: new Function('task', 'canEdit', 'completing', 'setCompleting', 'handleCompleteTask', 'onRefused', 'setSnoozeOpen', 'setTasks',
            'requestOrg', 'stillOrg', 'dbFetch', 'taskWriteAnswer', `${fn}\nreturn { handleComplete, handleSnooze };`),
        say: new Function('setPressNotices', 'pressNoticeOf', `${say}\nreturn sayRefused;`),
    };
})());
const FEED_ITEM = Object.freeze({ ...TASK, source: 'task-open', when: '2026-11-10T12:00:00' });
const rowPress = ({ task = FEED_ITEM, canEdit = true, done, answer, list = [TASK, TASK_2], meanwhile, switchOrg = false } = {}) => {
    const tasks = stateOf(list), notices = stateOf([]);
    const did = { completing: [], snoozeOpen: [], sent: [], asked: [], stopped: 0 };
    let org = 'org_a', answerWith;
    const answered = new Promise((r) => { answerWith = r; });
    const built = qRowHandlers();
    const sayRefused = built.say(notices.set, pressNoticeOf);
    const handlers = built.row(task, canEdit, false, (v) => did.completing.push(v),
        async (...a) => { did.asked.push(a); if (switchOrg) org = 'org_b'; return done; }, sayRefused, (v) => did.snoozeOpen.push(v), tasks.set,
        () => 'org_a', (o) => o === org,
        (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); return answered.then((a) => { if (a instanceof Error) throw a; return a; }); },
        taskWriteAnswer);
    return {
        tick: async () => { await handlers.handleComplete({ stopPropagation: () => { did.stopped += 1; } }); return { notices: notices.value, ...did }; },
        snooze: async (newDate) => {
            const out = handlers.handleSnooze(newDate);
            const shown = tasks.value;
            if (meanwhile) meanwhile(tasks);
            if (switchOrg) org = 'org_b';
            answerWith(answer);
            await out;
            return { notices: notices.value, list: tasks.value, shown, ...did };
        },
    };
};

test('Part 2c: a refused ✓ is said in a press notice — "Not completed: <why>", kept until its ✕; an org switch\'s undefined says nothing — RUN', async () => {
    const r = await rowPress({ done: { ok: false, error: FORBIDDEN } }).tick();
    assert.deepEqual(r.asked, [['t1', 'Completed']]);
    assert.equal(r.stopped, 1, 'the press never opens the row');
    assert.deepEqual(r.completing, [true, false]);
    assert.equal(r.notices.length, 1, 'REGRESSION: a refused ✓ un-ticked without a word');
    assert.equal(r.notices[0].title, 'Call Dana');
    assert.equal(r.notices[0].words, `Not completed: ${FORBIDDEN}`);
    assert.equal(r.notices[0].refused, null);
    assert.ok(r.notices[0].id.startsWith('press_'));
    const unsent = await rowPress({ done: { ok: false, error: 'The server could not be reached.' } }).tick();
    assert.equal(unsent.notices[0].words, 'Not completed: The server could not be reached.');
    const untitled = await rowPress({ task: { ...FEED_ITEM, title: '' }, done: { ok: false, error: FORBIDDEN } }).tick();
    assert.equal(untitled.notices[0].title, 'A task');
    for (const done of [undefined, { ok: true }]) {
        const quiet2 = await rowPress({ done }).tick();
        assert.deepEqual(quiet2.notices, [], `${JSON.stringify(done)}: nothing said`);
        assert.deepEqual(quiet2.completing, [true, false]);
    }
    const viewer = await rowPress({ canEdit: false, done: { ok: false, error: FORBIDDEN } }).tick();
    assert.deepEqual([viewer.asked, viewer.notices], [[], []], 'a member who may not change tasks sends nothing');
    // An answer after an org switch says nothing, whatever it holds; the press still lets go of its wait.
    const away = await rowPress({ done: { ok: false, error: FORBIDDEN }, switchOrg: true }).tick();
    assert.deepEqual(away.notices, [], 'REGRESSION: the last org\'s refusal said in the org switched to');
    assert.deepEqual(away.completing, [true, false]);
});

test('Part 2c: a refused or unsent Snooze is put back — the row without the feed\'s keys — and said in a press notice — RUN', async () => {
    for (const [answer, words] of TASK_REFUSALS()) {
        const r = await rowPress({ answer }).snooze('2026-11-12');
        assert.deepEqual(r.snoozeOpen, [false]);
        assert.equal(r.sent.length, 1);
        const [url, method, body] = r.sent[0];
        assert.deepEqual([url, method], ['/.netlify/functions/tasks', 'PUT']);
        assert.deepEqual(body, { ...TASK, dueDate: '2026-11-12', status: 'Open', completed: false }, 'the feed\'s source and when never sent');
        assert.equal(r.shown[0].dueDate, '2026-11-12', 'shown at once');
        assert.deepEqual(r.list[0], TASK, 'REGRESSION: a refused Snooze left on screen');
        assert.ok(!('source' in r.list[0]) && !('when' in r.list[0]), 'REGRESSION: the feed\'s keys put back into the list');
        assert.equal(r.list[1], TASK_2);
        assert.deepEqual(r.notices.map((n) => [n.title, n.words]), [['Call Dana', `Not snoozed: ${words}`]], `REGRESSION: ${words}`);
    }
});

test('Part 2c: Snooze puts back by identity; a landed Snooze takes the task as stored and says nothing; an org switch changes nothing — RUN', async () => {
    let fresh;
    const r = await rowPress({ answer: answerOf(403, { error: FORBIDDEN }), meanwhile: (tasks) => { fresh = { ...TASK, dueDate: '2026-12-01' }; tasks.set([fresh, TASK_2]); } }).snooze('2026-11-12');
    assert.equal(r.list[0], fresh, 'REGRESSION: the row read since was overwritten with the copy this press began on');
    assert.equal(r.notices.length, 1, 'still said');
    const stored = { ...TASK, dueDate: '2026-11-12', updatedAt: 'now' };
    const landed = await rowPress({ answer: answerOf(200, { task: stored }) }).snooze('2026-11-12');
    assert.equal(landed.list[0], stored);
    assert.deepEqual(landed.notices, []);
    const unread = await rowPress({ answer: answerOf(200, new SyntaxError('Unexpected end of JSON input')) }).snooze('2026-11-12');
    assert.equal(unread.list[0], unread.shown[0], 'a landed Snooze whose answer was not JSON keeps the copy sent');
    assert.deepEqual(unread.notices, []);
    for (const answer of [answerOf(403, { error: FORBIDDEN }), answerOf(200, { task: stored })]) {
        const away = await rowPress({ answer, switchOrg: true }).snooze('2026-11-12');
        assert.equal(away.list, away.shown, 'REGRESSION: the last org\'s answer written into the list on screen');
        assert.deepEqual(away.notices, [], 'REGRESSION: the last org\'s refusal said in the org switched to');
    }
    const viewer = await rowPress({ canEdit: false, answer: answerOf(200, {}) }).snooze('2026-11-12');
    assert.deepEqual([viewer.sent, viewer.notices, viewer.snoozeOpen], [[], [], [false]]);
});

test('Part 2a-2c: WIRING — the task writes read their answer through taskWriteAnswer; the Tasks tab says a refusal in a press notice', () => {
    const t = code(read('src/Tabs/TasksTab.jsx'));
    const row = between(t, 'function QRow(', '\n}\n');
    assert.ok(!row.includes("'HTTP '") && !row.includes('res.json()'), 'REGRESSION: QRow reads its own answer again ("HTTP N", the body)');
    assert.ok(row.includes('handleCompleteTask, setTasks, setViewingTask, setEditingTask, onOpen, onRefused }) {'));
    assert.ok(t.includes("import { taskWriteAnswer } from '../utils/taskWrite.js';") && t.includes("import { pressNoticeOf } from '../utils/pressNotice.js';"));
    assert.ok(between(t, 'export default function TasksTab() {', '} = useApp();').includes('setPressNotices,'));
    assert.ok(t.includes('const qRowProps = { opportunities, canEdit, handleCompleteTask, setTasks, setViewingTask, setEditingTask, onOpen: openFeedItem, onRefused: sayRefused };'));
    // Every row is handed the props that carry onRefused.
    const rows = t.split('<QRow').slice(1).map((r) => r.slice(0, r.indexOf('/>')));
    assert.equal(rows.length, 2);
    for (const r of rows) assert.ok(r.includes('{...qRowProps}'), 'a QRow drawn without onRefused');
    assert.ok(!t.includes('setTimeout(() => setPressNotices') && !/setTimeout\([^;]*setPressNotices/.test(t), 'REGRESSION: a refusal on the Tasks tab closed on a timer');
    assert.ok(!between(t, '    const sayRefused', '\n').includes('setUndoToast'), 'never the one-slot toast a later toast replaces (Q1)');
    const h = code(read('src/hooks/useTasks.js'));
    const done = between(h, '    const handleCompleteTask = async (taskId, newStatus) => {', '\n    };\n');
    assert.ok(h.includes("import { taskWriteAnswer } from '../utils/taskWrite.js';"));
    assert.ok(!done.includes('res.json()') && !done.includes('throw new Error('), 'REGRESSION: the completion reads its body before the ok check again');
    assert.ok(!done.includes('t.id === taskId ? current'), 'REGRESSION: the rollback puts back by id (a newer row overwritten)');
});

test('Part 2d: WIRING — Home draws no dead Complete; the reminder popups\' Snooze and Dismiss send nothing', () => {
    const home = code(read('src/Tabs/HomeTab.jsx'));
    assert.ok(!home.includes('onComplete'), 'REGRESSION: Home\'s plate holds a Complete no row draws');
    assert.ok(!home.includes('handleCompleteTask'), 'REGRESSION: Home reads the completion it never offers');
    assert.ok(!between(home, 'function PlateRow(', '\n}\n').includes('completing'), 'the plate row holds no completion state');
    const layer = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(!layer.includes('handleCompleteTask'), 'ModalLayer reads no completion');
    // The reminder and due popups only keep their own state: a Snooze is a re-alert-at time, a Dismiss a list — no request.
    const handlers = between(layer, '    const showNextDue = () => {', '    const closeClaimModal');
    const popups = between(layer, '{/* Task Reminder Popup */}', '{/* ════ SPIFF CLAIM MODAL ════ */}');
    assert.ok(popups.includes('setSnoozedReminders(prev => ({ ...prev, [task.id]: Date.now() + ms }));') && popups.includes('setSnoozedDueAlerts(prev => ({ ...prev, [task.id]: Date.now() + ms }));'), 'the popups as read');
    for (const [where, s] of [['the popups\' handlers', handlers], ['the popups', popups]]) {
        assert.ok(!/\b(dbFetch|dbWrite|fetch)\s*\(/.test(s), `REGRESSION: ${where} send a request — one that can be refused with no place to say it`);
    }
});

// ── Part 3 ──────────────────────────────────────────────────────────────────────────────────────────────────────

// The three handlers of Reports' "Contacts on this deal" (3b-3d), extracted from ActivityHistoryTab's Section 3 and run
// over stubs. ReportsTab remounts on an org switch (App.jsx's keyed Fragment), so these setters hold no org check.
const reportsSrc = () => code(read('src/Tabs/ReportsTab.jsx'));
let builtDealContacts;
const dealContactHandlers = () => builtDealContacts || (builtDealContacts = (() => {
    const r = reportsSrc();
    const add = between(r, 'onSave={async (newIds) => {', '\n                                            />').trimEnd();
    assert.ok(add.endsWith('}}'), 'the add handler, whole');
    const addFn = `const onSave = ${add.slice('onSave={'.length, -1)};`;
    const end = '\n                                                    };';
    const removeFn = between(r, '                                                    const handleRemove = async (contact) => {', end) + end;
    const personaFn = between(r, '                                                    const handleSetPersona = async (contact, personaId) => {', end) + end;
    return {
        add: new Function('oppContactIds', 'contacts', 'selectedOpp', 'setAddContactSaving', 'dbWrite', 'contactNamesText',
            'setDealContactsError', 'setLocalContactIds', 'setShowAddContact', 'console', 'shownOppIdRef', `${addFn}\nreturn onSave;`),
        remove: new Function('localContactIds', 'oppContactIds', 'contacts', 'selectedOpp', 'dbWrite', 'contactNamesText',
            'setDealContactsError', 'setLocalContactIds', 'shownOppIdRef', `${removeFn}\nreturn handleRemove;`),
        persona: new Function('localPersonaMap', 'setLocalPersonaMap', 'dbWrite', 'setDealContactsError', 'selectedOpp', 'shownOppIdRef',
            'personaSavingRef', `${personaFn}\nreturn handleSetPersona;`),
    };
})());
// ActivityHistoryTab's shownOppIdRef: the deal shown now. A case that picks another deal before the answer moves it.
const shownOn = (id = 'd1') => ({ current: id });
const DANA = Object.freeze({ id: 'c1', firstName: 'Dana', lastName: 'Ruiz', buyerPersona: 'p_champion' });
const BEN = Object.freeze({ id: 'c2', firstName: 'Ben', lastName: 'Ode' });
const CAL = Object.freeze({ id: 'c3', firstName: 'Cal', lastName: '' });
const NAMELESS = Object.freeze({ id: 'c9', firstName: '', lastName: '' });
const SEL_DEAL = Object.freeze({ id: 'd1', opportunityName: 'Acme renewal', account: 'Acme' });
const PERMISSION = 'You do not have permission to make this change.';
// dbWrite's answers (storage.js): a refusal in refusalOf's words — a 403's sentence, the server's words with their ref, a
// 502's page as its status — and one that never left, NETWORK_ERROR; [answer, the words said].
const writeRefusals = async () => [
    [{ ok: false, status: 403, error: await refusalOf(answerOf(403, { error: 'Forbidden' })) }, PERMISSION],
    [{ ok: false, status: 404, error: await refusalOf(answerOf(404, { error: 'Contact not found', requestId: 'r4' })) }, 'Contact not found (ref r4)'],
    [{ ok: false, status: 502, error: await refusalOf(PAGE_502()) }, 'The server returned 502.'],
    [{ ok: false, status: 0, error: NETWORK_ERROR }, NETWORK_ERROR],
];
const LANDED = Object.freeze({ ok: true, status: 200, error: null, data: {} });

const addContacts = async ({ newIds, answer, oppContactIds = ['c1'], pickedMeanwhile = null }) => {
    const did = { sent: [], saving: [], said: [], ids: [], panel: [], logged: [] };
    const shown = shownOn();
    const onSave = dealContactHandlers().add(oppContactIds, [DANA, BEN, CAL], SEL_DEAL, (v) => did.saving.push(v),
        async (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); if (pickedMeanwhile) shown.current = pickedMeanwhile; return answer; }, contactNamesText,
        (v) => did.said.push(v), (v) => did.ids.push(v), (v) => did.panel.push(v),
        { error: (...a) => did.logged.push(a), warn: () => {}, log: () => {} }, shown);
    await onSave(newIds);
    return did;
};

test('Part 3b: a refused or unsent add is said in the section\'s banner — the panel left open, the contacts unchanged — RUN', async () => {
    for (const [answer, why] of await writeRefusals()) {
        const one = await addContacts({ newIds: ['c2'], answer });
        assert.deepEqual(one.sent, [['/.netlify/functions/opportunities?id=d1', 'PUT', { id: 'd1', contactIds: ['c1', 'c2'], contacts: contactNamesText(['Dana Ruiz', 'Ben Ode']) }]],
            'the deal\'s id and its contacts alone (state §0.198)');
        assert.deepEqual(one.said, [`The contact was not added to this deal — ${why}`], `REGRESSION: a refused add said nothing (${why})`);
        assert.deepEqual(one.ids, [], 'REGRESSION: a refused add shown as added');
        assert.deepEqual(one.panel, [], 'the panel stays open, its picks kept');
        assert.deepEqual(one.saving, [true, false], 'the panel lets go of its wait');
        const two = await addContacts({ newIds: ['c2', 'c3'], answer });
        assert.deepEqual(two.said, [`2 contacts were not added to this deal — ${why}`]);
        assert.deepEqual([two.ids, two.panel], [[], []]);
    }
});

test('Part 3b: a landed add clears the banner, shows the contacts and closes the panel; none picked sends nothing — RUN', async () => {
    const r = await addContacts({ newIds: ['c2', 'c3'], answer: LANDED });
    assert.deepEqual(r.said, [''], 'REGRESSION: a landed add left the last refusal standing');
    assert.deepEqual(r.ids, [['c1', 'c2', 'c3']]);
    assert.deepEqual(r.panel, [false]);
    assert.deepEqual(r.saving, [true, false]);
    assert.deepEqual(r.logged, []);
    const none = await addContacts({ newIds: [], answer: LANDED });
    assert.deepEqual([none.sent, none.said, none.saving, none.ids], [[], [], [], []]);
});

test('Part 3b: an add\'s answer after another deal was picked — refused or landed — sets nothing and says nothing; the panel lets go of its wait — RUN', async () => {
    const [[refused]] = await writeRefusals();
    for (const answer of [refused, LANDED]) {
        const r = await addContacts({ newIds: ['c2'], answer, pickedMeanwhile: 'd2' });
        assert.equal(r.sent[0][0], '/.netlify/functions/opportunities?id=d1', 'sent for the deal asked about');
        assert.deepEqual(r.said, [], `REGRESSION: the last deal's ${answer.ok ? 'landed clear' : 'refusal'} said over the deal picked`);
        assert.deepEqual(r.ids, [], 'REGRESSION: the last deal\'s contacts shown on the deal picked');
        assert.deepEqual(r.panel, []);
        assert.deepEqual(r.saving, [true, false], 'the finally still lets go of the wait');
    }
});

const removeContact = async ({ contact = DANA, answer, localContactIds = null, oppContactIds = ['c1', 'c2'], pickedMeanwhile = null }) => {
    const did = { sent: [], said: [], ids: [] };
    const shown = shownOn();
    const handleRemove = dealContactHandlers().remove(localContactIds, oppContactIds, [DANA, BEN, CAL], SEL_DEAL,
        async (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); if (pickedMeanwhile) shown.current = pickedMeanwhile; return answer; }, contactNamesText,
        (v) => did.said.push(v), (v) => did.ids.push(v), shown);
    await handleRemove(contact);
    return did;
};

test('Part 3c: a refused or unsent remove is said in the banner by the contact\'s name — the contact left on the deal — RUN', async () => {
    for (const [answer, why] of await writeRefusals()) {
        const r = await removeContact({ answer });
        assert.deepEqual(r.sent, [['/.netlify/functions/opportunities?id=d1', 'PUT', { id: 'd1', contactIds: ['c2'], contacts: contactNamesText(['Ben Ode']) }]]);
        assert.deepEqual(r.said, [`Dana Ruiz was not taken off this deal — ${why}`], `REGRESSION: a refused remove said nothing (${why})`);
        assert.deepEqual(r.ids, [], 'REGRESSION: a refused remove shown as removed');
    }
    const [[refused]] = await writeRefusals();
    const unnamed = await removeContact({ contact: NAMELESS, oppContactIds: ['c9', 'c2'], answer: refused });
    assert.deepEqual(unnamed.said, [`The contact was not taken off this deal — ${PERMISSION}`]);
});

test('Part 3c: a landed remove clears the banner and shows the deal without it, from the list shown — RUN', async () => {
    const r = await removeContact({ answer: LANDED, localContactIds: ['c1', 'c2', 'c3'] });
    assert.deepEqual(r.sent[0][2].contactIds, ['c2', 'c3'], 'from the list shown — an add landed since included');
    assert.deepEqual(r.ids, [['c2', 'c3']]);
    assert.deepEqual(r.said, [''], 'REGRESSION: a landed remove left the last refusal standing');
});

test('Part 3c: a remove\'s answer after another deal was picked — refused or landed — sets nothing and says nothing — RUN', async () => {
    const [[refused]] = await writeRefusals();
    for (const answer of [refused, LANDED]) {
        const r = await removeContact({ answer, pickedMeanwhile: 'd2' });
        assert.equal(r.sent[0][0], '/.netlify/functions/opportunities?id=d1', 'sent for the deal asked about');
        assert.deepEqual(r.sent[0][2].id, 'd1');
        assert.deepEqual(r.said, [], `REGRESSION: the last deal's ${answer.ok ? 'landed clear' : 'refusal'} said over the deal picked`);
        assert.deepEqual(r.ids, [], 'REGRESSION: the last deal\'s contact list written over the deal picked');
    }
});

// handleSetPersona is defined in the row's render: localPersonaMap is the map the member saw when they picked. The map's
// setter is shared across picks, as React's is; each pick's answer is held until the case gives it.
// The deal shown (shownOppIdRef) and the saves out (personaSavingRef) are the component's, shared across picks.
const personaPicks = () => {
    const map = stateOf({}), said = [], sent = [];
    const shown = shownOn(), saving = { current: new Set() };
    const pick = (contact, personaId) => {
        let answerWith;
        const answered = new Promise((r) => { answerWith = r; });
        const done = dealContactHandlers().persona(map.value, map.set,
            async (url, opts) => { sent.push([url, opts.method, JSON.parse(opts.body)]); return answered; },
            (v) => said.push(v), SEL_DEAL, shown, saving)(contact, personaId);
        return { answer: async (a) => { answerWith(a); await done; } };
    };
    return { map, said, sent, pick, shown, saving };
};

test('Part 3d: a buyer persona sends only what changes; a landed pick stays shown and clears the banner — RUN', async () => {
    const p = personaPicks();
    const a = p.pick({ ...DANA, title: 'VP (stale)', email: 'stale@example.com' }, 'p_economic');
    assert.deepEqual(p.map.value, { c1: 'p_economic' }, 'shown at once');
    await a.answer(LANDED);
    assert.deepEqual(p.sent, [['/.netlify/functions/contacts?id=c1', 'PUT', { id: 'c1', buyerPersona: 'p_economic' }]],
        'REGRESSION: the whole loaded contact sent — every stale field of the copy written (guide §18b125 rule 1)');
    assert.deepEqual(p.map.value, { c1: 'p_economic' });
    assert.deepEqual(p.said, ['']);
});

test('Part 3d: a refused or unsent pick puts back what the chip showed and says why — RUN', async () => {
    for (const [answer, why] of await writeRefusals()) {
        const p = personaPicks();
        await p.pick({ ...DANA }, 'p_economic').answer(answer);
        assert.deepEqual(p.map.value, { c1: 'p_champion' }, 'no pick yet: the contact\'s own persona, as the chip showed it');
        assert.deepEqual(p.said, [`Dana Ruiz's buyer persona was not saved — ${why}`], `REGRESSION: ${why}`);
    }
    const [[refused]] = await writeRefusals();
    const legacy = personaPicks();
    await legacy.pick({ id: 'c4', firstName: 'Lee', lastName: 'Ng', persona: 'p_legacy' }, 'p_economic').answer(refused);
    assert.deepEqual(legacy.map.value, { c4: 'p_legacy' }, 'the chip\'s own fallback: a persona stored as `persona`');
    const unnamed = personaPicks();
    await unnamed.pick({ ...NAMELESS, buyerPersona: 'p_champion' }, 'p_economic').answer(refused);
    assert.deepEqual(unnamed.said, [`The contact's buyer persona was not saved — ${PERMISSION}`]);
});

test('Part 3d: a refused pick puts back the map\'s earlier landed value, never the loaded copy\'s; a prior none is put back as none — RUN', async () => {
    const [[refused]] = await writeRefusals();
    const p = personaPicks();
    await p.pick({ ...DANA, buyerPersona: 'p_y' }, 'p_x').answer(LANDED);     // X landed earlier in the session
    await p.pick({ ...DANA, buyerPersona: 'p_y' }, 'p_z').answer(refused);    // the loaded copy still holds Y
    assert.deepEqual(p.map.value, { c1: 'p_x' }, 'REGRESSION: a persona that landed earlier reverted to the loaded copy');
    assert.deepEqual(p.said, ['', `Dana Ruiz's buyer persona was not saved — ${PERMISSION}`]);
    const none = personaPicks();
    await none.pick(CAL, 'p_z').answer(refused);
    assert.ok('c3' in none.map.value, 'put back, not dropped');
    assert.equal(none.map.value.c3, '', 'REGRESSION: a prior none shown is put back as something else');
    assert.deepEqual(none.said, [`Cal's buyer persona was not saved — ${PERMISSION}`]);
});

// Replaces "A then B — A refused after B was sent" (the review): two refused picks put back the first pick, never
// stored. One save at a time per contact — a pick while one is out sends nothing and changes nothing shown.
test('Part 3d: one persona save at a time per contact — a pick while one is out sends nothing; after the answer a pick sends again — RUN', async () => {
    const [[refused]] = await writeRefusals();
    for (const first of [refused, LANDED]) {
        const p = personaPicks();
        const a = p.pick({ ...DANA }, 'p_a');
        const b = p.pick({ ...DANA, buyerPersona: 'p_a' }, 'p_b');   // the chip showed A when B was picked
        assert.deepEqual(p.sent.map(([, , body]) => body.buyerPersona), ['p_a'], 'REGRESSION: a second pick sent while the first is out (two refusals put back the first, never stored)');
        assert.deepEqual(p.map.value, { c1: 'p_a' }, 'the pick sent nothing and shows nothing');
        await b.answer(LANDED);   // nothing was sent: no answer reaches it
        assert.deepEqual(p.said, [], 'the pick not sent says nothing');
        await a.answer(first);
        assert.deepEqual(p.map.value, { c1: first.ok ? 'p_a' : 'p_champion' }, first.ok ? 'A landed' : 'A refused: what the chip showed at A, the deal as stored');
        assert.deepEqual(p.said, [first.ok ? '' : `Dana Ruiz's buyer persona was not saved — ${PERMISSION}`]);
        assert.equal(p.saving.current.size, 0, 'the save let go of the contact');
        const c = p.pick({ ...DANA }, 'p_c');
        assert.deepEqual(p.sent.map(([, , body]) => body.buyerPersona), ['p_a', 'p_c'], 'REGRESSION: after the answer, a pick sends nothing');
        await c.answer(LANDED);
        assert.deepEqual(p.map.value, { c1: 'p_c' });
    }
    // Per contact: Ben's pick sends while Dana's is out.
    const q = personaPicks();
    const dana = q.pick({ ...DANA }, 'p_a');
    const ben = q.pick({ ...BEN }, 'p_b');
    assert.deepEqual(q.sent.map(([url]) => url), ['/.netlify/functions/contacts?id=c1', '/.netlify/functions/contacts?id=c2']);
    await dana.answer(LANDED);
    await ben.answer(LANDED);
    assert.deepEqual(q.map.value, { c1: 'p_a', c2: 'p_b' });
});

test('Part 3d: a persona\'s answer after another deal was picked — refused or landed — sets nothing and says nothing; the contact is let go — RUN', async () => {
    const [[refused]] = await writeRefusals();
    for (const answer of [refused, LANDED]) {
        const p = personaPicks();
        const a = p.pick({ ...DANA }, 'p_a');
        p.shown.current = 'd2'; p.map.set({});   // picking another deal clears the map (the picker's onClick)
        await a.answer(answer);
        assert.deepEqual(p.map.value, {}, 'REGRESSION: the last deal\'s put-back written into the map of the deal picked');
        assert.deepEqual(p.said, [], `REGRESSION: the last deal's ${answer.ok ? 'landed clear' : 'refusal'} said over the deal picked`);
        assert.equal(p.saving.current.size, 0, 'REGRESSION: the contact held, every later pick refused unsent');
    }
});

test('Part 3a-3d: WIRING — one banner in "Contacts on this deal", kept until its Close; cleared by picking another deal; the persona never sends the loaded copy', () => {
    const r = reportsSrc();
    const top = between(r, 'function ActivityHistoryTab(', 'const [period, setPeriod]');
    assert.ok(top.includes("const [dealContactsError, setDealContactsError] = React.useState('');"));
    // The review: the deal shown and the persona saves out are the component's own, at its top level — never a render's.
    assert.ok(top.includes("const shownOppIdRef = React.useRef(''); shownOppIdRef.current = selectedOppId;"));
    assert.ok(top.includes('const personaSavingRef = React.useRef(new Set());'));
    assert.equal(count(r, 'React.useRef(new Set())'), 1);
    assert.equal(count(r, 'if (shownOppIdRef.current !== forDeal) return;'), 3, 'the add, the remove and the persona each ask after the answer');
    const section = between(r, '{/* ── Section 3: Contacts on this deal ── */}', '{/* ── Section 4');
    order(section, 'Contacts on this deal ({oppContacts.length})', '{dealContactsError && (', '{showAddContact && selectedOpp && (');
    const banner = between(section, '{dealContactsError && (', '\n                                        )}');
    order(banner, '<div role="alert"', '✕ {dealContactsError}', "<button onClick={() => setDealContactsError('')}", 'Close', '</button>');
    assert.equal(count(r, '{dealContactsError && ('), 1, 'one banner for the three');
    // Picking another deal clears it, with the section's other state (Q6).
    assert.ok(r.includes("onClick={() => { setSelectedOppId(o.id); setOppOpen(false); setOppSearch(''); setLocalContactIds(null); setShowAddContact(false); setLocalPersonaMap({}); setDealContactsError(''); }}"),
        'REGRESSION: a refusal of the last deal said over the deal picked');
    assert.ok(!/setTimeout\([^)]*setDealContactsError/.test(r) && !/setTimeout\([^;]*setDealContactsError/.test(r), 'REGRESSION: the banner closed on a timer');
    assert.ok(!r.includes('JSON.stringify({ ...contact, buyerPersona'), 'REGRESSION: the whole loaded contact sent with a persona');
    // The rows hand the kebab the two handlers; the banner is set only by the three handlers run above.
    assert.ok(section.includes('onRemove={handleRemove}') && section.includes('onSetPersona={handleSetPersona}'));
    assert.equal(count(r, 'setDealContactsError('), 8, 'the three refusals, the three landed clears, the Close and the picker — none else');
});

// ── Part 4 ──────────────────────────────────────────────────────────────────────────────────────────────────────

// Settings → Data → Export (4a, 4b): the Delete and the two windows' saves, extracted from ExportDetail.jsx and run over
// stubs. The Settings view remounts on an org switch (App.jsx's keyed Fragment), so these hold no org check.
const EXPORT = 'src/Tabs/settings/data/ExportDetail.jsx';
const exportSrc = () => code(read(EXPORT));
const SCH_A = Object.freeze({ id: 'sch_1', name: 'Weekly accounts', enabled: true });
const SCH_B = Object.freeze({ id: 'sch_2', name: 'Nightly deals', enabled: true });
const SCH_C = Object.freeze({ id: 'sch_3', name: 'Monthly leads', enabled: false });
const deleteSched = async ({ sched = SCH_B, list = [SCH_A, SCH_B, SCH_C], answer, meanwhile, banner = '' }) => {
    const ex = exportSrc();
    const fn = between(ex, '    const handleDeleteSched = async (sched) => {', '\n    };') + '\n    };';
    const schedules = stateOf(list), actionError = stateOf(banner);
    const did = { sent: [], errorSet: [], said: [] };
    const handleDeleteSched = new Function('schedules', 'setSchedules', 'dbWrite', 'setActionError', 'setError', `${fn}\nreturn handleDeleteSched;`)(
        list, schedules.set,
        async (url, opts) => { did.sent.push([url, opts.method]); if (meanwhile) meanwhile(schedules.set); return answer; },
        (v) => { actionError.set(v); if (typeof v !== 'function') did.said.push(v); },
        (v) => did.errorSet.push(v));
    await handleDeleteSched(sched);
    return { ...did, list: schedules.value, banner: actionError.value };
};

test('Part 4a: a refused or unsent Delete puts its row back where it stood and says why on the banner — never the page\'s load error — RUN', async () => {
    for (const [answer, why] of await writeRefusals()) {
        const r = await deleteSched({ answer });
        assert.deepEqual(r.sent, [['/.netlify/functions/export-schedules?id=sch_2', 'DELETE']]);
        assert.deepEqual(r.list, [SCH_A, SCH_B, SCH_C], `REGRESSION: a refused delete left the row gone (${why})`);
        assert.equal(r.list[1], SCH_B, 'the same row it was');
        assert.deepEqual(r.said, [`"Nightly deals" was not deleted — ${why}`], `REGRESSION: a refused delete said nothing on the banner (${why})`);
        assert.deepEqual(r.errorSet, [], 'REGRESSION: the load\'s error set — the whole page replaced by a red box with no Close');
    }
});

test('Part 4a: put back only its own row — a Pause landed meanwhile stands; a list read again with the row in it is not doubled — RUN', async () => {
    const [[refused, why]] = await writeRefusals();
    const PAUSED_A = { ...SCH_A, enabled: false };
    const paused = await deleteSched({ answer: refused, meanwhile: (set) => set((prev) => prev.map((s) => (s.id === 'sch_1' ? PAUSED_A : s))) });
    assert.deepEqual(paused.list, [PAUSED_A, SCH_B, SCH_C], 'REGRESSION: the rollback put back the whole list as at the click — the Pause undone');
    assert.equal(paused.list[0], PAUSED_A);
    assert.deepEqual(paused.said, [`"Nightly deals" was not deleted — ${why}`]);
    const NEW = { id: 'sch_9', name: 'New one', enabled: true };
    const added = await deleteSched({ answer: refused, meanwhile: (set) => set((prev) => [NEW, ...prev]) });
    assert.deepEqual(added.list.map((s) => s.id), ['sch_9', 'sch_2', 'sch_1', 'sch_3'], 'a new schedule landed meanwhile stands; the row back at its index');
    const reread = await deleteSched({ answer: refused, meanwhile: (set) => set(() => [SCH_A, SCH_B, SCH_C]) });
    assert.deepEqual(reread.list, [SCH_A, SCH_B, SCH_C], 'REGRESSION: a row already back in the list put back twice');
    const first = await deleteSched({ sched: SCH_A, answer: refused });
    assert.deepEqual(first.list, [SCH_A, SCH_B, SCH_C], 'the first row back first');
});

test('Part 4a: a landed Delete takes the row out and clears only its own words; the id is sent encoded — RUN', async () => {
    const landed = await deleteSched({ answer: LANDED, banner: '"Nightly deals" was not deleted — The server returned 502.' });
    assert.deepEqual(landed.list, [SCH_A, SCH_C]);
    assert.equal(landed.banner, '', 'REGRESSION: the banner still says "not deleted" about a schedule that was deleted');
    assert.deepEqual([landed.said, landed.errorSet], [[], []]);
    const other = await deleteSched({ answer: LANDED, banner: 'Request dsr_9 was not marked complete — Admin only' });
    assert.equal(other.banner, 'Request dsr_9 was not marked complete — Admin only', 'another row\'s words stand until closed');
    const odd = await deleteSched({ sched: { id: 'sch_a&b=1', name: 'Odd' }, list: [{ id: 'sch_a&b=1', name: 'Odd' }], answer: LANDED });
    assert.deepEqual(odd.sent, [['/.netlify/functions/export-schedules?id=sch_a%26b%3D1', 'DELETE']], 'the id one query value');
});

// The two windows' saves (4b): '' when landed (the window closed), else the words, which the window draws.
const exportSaves = ({ answer, list = [SCH_A] }) => {
    const ex = exportSrc();
    const end = '\n    };';
    const fns = between(ex, '    const saveSchedule = async (payload) => {', end) + end + '\n'
        + between(ex, '    const saveDsr = async (payload) => {', end) + end;
    const schedules = stateOf(list), dsr = stateOf([{ id: 'dsr_1', status: 'open' }]);
    const did = { sent: [], closed: [], editing: [], dsrClosed: [] };
    const h = new Function('schedules', 'setSchedules', 'setShowModal', 'setEditingSched', 'setDsrItems', 'setShowDsrModal',
        'dbFetch', 'readRefusal', 'failureWords', 'crypto', `${fns}\nreturn { saveSchedule, saveDsr };`)(
        list, schedules.set, (v) => did.closed.push(v), (v) => did.editing.push(v), dsr.set, (v) => did.dsrClosed.push(v),
        async (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); if (answer instanceof Error) throw answer; return answer; },
        readRefusal, failureWords, { randomUUID: () => 'u1' });
    return { h, did, schedules, dsr };
};
const SAVE_REFUSALS = () => [
    [answerOf(403, { error: 'Admin only' }), 'Admin only'],
    [answerOf(400, { error: 'name is required', requestId: 'r7' }), 'name is required (ref r7)'],
    [PAGE_502(), 'The server returned 502.'],
    [new TypeError('Failed to fetch'), 'The server could not be reached.'],
    [answerOf(200, new SyntaxError("Unexpected token '<'")), 'Its answer could not be read.'],
];

test('Part 4b: a refused or unsent schedule save or GDPR request answers the house words — the window left open, nothing added — RUN', async () => {
    for (const [answer, why] of SAVE_REFUSALS()) {
        const s = exportSaves({ answer });
        assert.equal(await s.h.saveSchedule({ id: null, name: 'Weekly contacts', scope: 'contacts' }), `The schedule was not saved — ${why}`,
            `REGRESSION: a refused schedule save said in window.alert or raw words (${why})`);
        assert.equal(await s.h.saveSchedule({ id: 'sch_1', name: 'Weekly accounts (renamed)' }), `The schedule was not saved — ${why}`);
        assert.equal(await s.h.saveDsr({ subject: 'a@x.test', type: 'access', notes: null }), `The request was not saved — ${why}`,
            `REGRESSION: a refused GDPR request said in window.alert or raw words (${why})`);
        assert.deepEqual([s.did.closed, s.did.editing, s.did.dsrClosed], [[], [], []], 'REGRESSION: a refused save closed its window');
        assert.deepEqual(s.schedules.value, [SCH_A]);
        assert.deepEqual(s.dsr.value, [{ id: 'dsr_1', status: 'open' }]);
        assert.deepEqual(s.did.sent.map(([url, m]) => [url, m]), [['/.netlify/functions/export-schedules', 'POST'], ['/.netlify/functions/export-schedules', 'PUT'], ['/.netlify/functions/export-dsr', 'POST']]);
    }
});

test('Part 4b: a landed schedule save or GDPR request answers nothing, shows the row and closes its window — RUN', async () => {
    const STORED_NEW = { id: 'sch_u1', name: 'Weekly contacts', enabled: true };
    const created = exportSaves({ answer: answerOf(200, { schedule: STORED_NEW }) });
    assert.equal(await created.h.saveSchedule({ id: null, name: 'Weekly contacts' }), '');
    assert.equal(created.did.sent[0][2].id, 'sch_u1', 'a new schedule\'s id');
    assert.deepEqual(created.schedules.value, [STORED_NEW, SCH_A]);
    assert.deepEqual([created.did.closed, created.did.editing], [[false], [null]]);
    const STORED_EDIT = { ...SCH_A, name: 'Weekly accounts (renamed)' };
    const edited = exportSaves({ answer: answerOf(200, { schedule: STORED_EDIT }) });
    assert.equal(await edited.h.saveSchedule({ id: 'sch_1', name: 'Weekly accounts (renamed)' }), '');
    assert.deepEqual(edited.schedules.value, [STORED_EDIT]);
    const dsr = exportSaves({ answer: answerOf(200, { dsr: { id: 'dsr_u1', status: 'open' } }) });
    assert.equal(await dsr.h.saveDsr({ subject: 'a@x.test', type: 'access', notes: null }), '');
    assert.deepEqual(dsr.dsr.value.map((d) => d.id), ['dsr_u1', 'dsr_1']);
    assert.deepEqual(dsr.did.dsrClosed, [false]);
});

// Each window's Save: the words cleared at each attempt, drawn when its onSave answers them, kept until a save lands.
const windowSaves = () => {
    const ex = exportSrc();
    const end = '\n    };';
    const exportSave = between(between(ex, 'const NewExportModal = ', 'export const ExportDetail = '), '    const handleSave = async () => {', end) + end;
    const dsrSave = between(ex.slice(ex.indexOf('const NewDsrModal = ')), '    const handleSave = async () => {', end) + end;
    const run = (fnText, params, args) => async (onSave) => {
        const did = { saving: [], said: [], payloads: [] };
        const handleSave = new Function(...params, 'setSaving', 'setSaveError', 'onSave', `${fnText}\nreturn handleSave;`)(
            ...args, (v) => did.saving.push(v), (v) => did.said.push(v), async (p) => { did.payloads.push(p); return onSave(p); });
        await handleSave();
        return did;
    };
    return {
        schedule: run(exportSave, ['nameRef', 'existing', 'scope', 'fmt', 'cadence', 'dest'], [{ current: { value: ' Weekly contacts ' } }, null, 'contacts', 'CSV', 'Daily · 02:00 UTC', 'download']),
        dsr: run(dsrSave, ['subject', 'type', 'notes'], [' a@x.test ', 'erasure', '']),
    };
};

test('Part 4b: each window says its save\'s words above its buttons, cleared at each attempt — a refusal through the real save — RUN', async () => {
    const w = windowSaves();
    for (const [answer, why] of SAVE_REFUSALS()) {
        const s = exportSaves({ answer });
        const one = await w.schedule(s.h.saveSchedule);
        assert.deepEqual(one.said, ['', `The schedule was not saved — ${why}`], `REGRESSION: the schedule window said nothing (${why})`);
        assert.deepEqual(one.saving, [true, false], 'the window lets go of its wait');
        const two = await w.dsr(s.h.saveDsr);
        assert.deepEqual(two.said, ['', `The request was not saved — ${why}`], `REGRESSION: the request window said nothing (${why})`);
        assert.deepEqual(two.payloads.map((p) => [p.subject, p.type, p.notes]), [['a@x.test', 'erasure', null]]);
    }
    const landed = await w.schedule(async () => '');
    assert.deepEqual(landed.said, [''], 'REGRESSION: a landed retry left the last refusal\'s words in the window');
    assert.deepEqual(landed.saving, [true, false]);
    const dsrLanded = await w.dsr(async () => '');
    assert.deepEqual(dsrLanded.said, [''], 'REGRESSION: a landed retry left the last refusal\'s words in the window');
});

test('Part 4a/4b: WIRING — no window.alert; each window draws its words above its buttons; the Delete hands its row; the load\'s error is the load\'s alone', () => {
    const raw = read(EXPORT);
    assert.ok(!/\balert\(/.test(raw), 'REGRESSION: window.alert — "Save failed: Failed to fetch" popped over whatever screen was open');
    const ex = exportSrc();
    const exportModal = between(ex, 'const NewExportModal = ', 'export const ExportDetail = ');
    const dsrModal = ex.slice(ex.indexOf('const NewDsrModal = '));
    for (const m of [exportModal, dsrModal]) {
        order(m, "const [saveError, setSaveError] = React.useState('');", "setSaveError('');", 'setSaving(true);', 'const why = await onSave(',
            'if (why) setSaveError(why);', '{saveError && <div role="alert"', '✕ {saveError}</div>}', '<DataModalFoot>');
        assert.equal(count(m, 'setSaveError('), 2, 'cleared at each attempt, set from the answer — none else');
        assert.ok(!/setTimeout\([^;]*setSaveError/.test(m), 'REGRESSION: the words closed on a timer');
    }
    assert.ok(ex.includes('existing={editingSched} onSave={saveSchedule}/>}'), 'the schedule window answered by saveSchedule');
    assert.ok(ex.includes('<NewDsrModal onClose={() => setShowDsrModal(false)} onSave={saveDsr}/>}'), 'the request window answered by saveDsr');
    assert.ok(ex.includes('<span onClick={() => handleDeleteSched(s)} style='), 'REGRESSION: the Delete hands an id — its row cannot be put back or named');
    assert.equal(count(ex, 'setError('), 1, 'REGRESSION: the load\'s error set by something other than the load — the whole page replaced');
    order(between(ex, '        const load = async () => {', '\n        };'), '} catch (e) {', 'if (!cancelled) setError(e.message);');
});
