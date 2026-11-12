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
//
// Part 5 (5a-5b; state §0.246, Jeff, 11 Nov: "proceed" — Parts 5-7): errors that left on a timer. Reports' saves said
// "Failed to save. Check your connection" whatever the cause, or "Error — retry" with no reason, and cleared after 4 s
// or 3 s; a success's timer reset a later refusal. They say the server's words beside the control pressed, kept until
// a Close (Q9); a success's timer clears only that success (Q10). The holiday Sync read its body before the ok check
// ("Failed to sync — Unexpected token '<'") and cleared after 6 s; it says the house words on its red line, kept until
// a Close or the next Sync (Q11) — its RUN cases are tests/settings-saves.test.mjs S10's.
//
// Part 6 (6a-6b; state §0.246): Dispatch time off. Saving time off over booked work sends one PUT per job to return it
// to the queue; a refused or unsent PUT was counted only in the audit row — both dialogs closed and the view jumped to
// the Queue, so the dispatcher took every job as freed. A banner across the top of Dispatch names each job still
// assigned and why, kept until its Close (Q12). The block save read its body before the ok check ("HTTP 500", the ref
// dropped) and the Delete said "HTTP N"; they say the server's words (a 403 the role's sentence, Q13), and ScheduleView
// says failureWords, never a raw e.message.
//
// Part 7 (7a-7c; state §0.246): three more silent ones. The quote PDF threw 'PDF generation failed' on a refusal and
// opened a print copy in a new tab on ANY failure, with no word — that hid every PDF a 500 until §0.234 — and the copy's
// lines were whole dollars beside totals to the cent. A PDF not made is said under Download PDF in the house words
// (quotePdfOf), kept until its Close, with "Print a copy instead" a button (Q14); the copy's lines to the cent (Q15).
// Coaching notes' writes rejected offline — the dialog stayed "Saving…" for good — Home's "Mark read" ignored its
// answer, a failed load read as no notes, and TeamTab's delete banner had no Close: no write rejects now, Mark read says
// a refusal in a press notice (Q1), a failed load is said on both screens (Q17), and the banner has a Close. Quick
// Log's "Add to Google Calendar" box made no event and said nothing: it is gone, with the save-time adds and the task
// button nothing reached (Q16).
//
// Part 8 (8a-8d; state §0.247, Jeff, 12 Nov: "lets proceed in that order" — Parts 8-9): the raw words in the swept files.
// A catch said its e.message — "Failed to fetch", "Unexpected token '<'" — and Dispatch's fleet Delete and the shared Settings
// sender (putSettings) said "HTTP N", the ref dropped. Every site says failureWords(e) (refusals-said scan (iv)), the fleet
// Delete the server's words (a 403 the role's sentence, Q13), putSettings refusalWords' with a stale refusal still stale.
// Automations' Pause / Resume and Delete put back their own row by id, one request per rule, instead of reloading the
// list (a failed reload said its own words over the refusal's); Export's ad-hoc export and Run backup save no file
// after an org switch; the integrations panels' banners close by their Close.
//
// Part 9 (9a-9e; state §0.247): a read that failed was shown as none or zero. The Settings overview read each count's
// body with no ok check — a refusal read "No endpoints" and raised the Health score — and its Recently changed feed
// stayed empty, nothing said; Approval tiers' "Last 90 days" showed every tier 0; the corporate calendars read "No
// corporate calendar connected."; Job templates migrated every equipment requirement against no categories (saved for
// good); Property types offered every Remove over unread usage; Crews' pickers were silently empty; and the integrations
// panels counted 0 beside a failed load. Each reads ok-first and says the read that failed (Q18, Q19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parse } from '@babel/parser';
import { quotePdfOf } from '../src/utils/quotePdfAnswer.js';
import { quoteTotals } from '../src/utils/quoteTotals.js';
import { quoteMoneyRows } from '../src/utils/quoteMoneyRows.js';
import { fmtMoney } from '../src/utils/invoices.js';
import { esc } from '../src/utils/customerNotifications.js';
import { T } from '../src/tokens.js';
import { readRefusal, failureWords, refusalWords } from '../src/utils/refusalWords.js';
import { withIfRevs, staleOf, STALE_ERROR } from '../src/utils/settingsRevs.js';
import { refusalOf, NETWORK_ERROR } from '../src/utils/storage.js';
import { pressNoticeOf } from '../src/utils/pressNotice.js';
import { taskWriteAnswer } from '../src/utils/taskWrite.js';
import { sentBody, shownRow } from '../src/utils/leaveOut.js';
import { dealBody } from '../src/utils/dealNotes.js';
import { contactNamesText } from '../src/utils/oppText.js';
import { notFreedWords } from '../src/utils/dispatchUnassign.js';
import { answerOf as settledBody, liveCountsOf, healthChecksOf, cardStateOf, healthSummaryOf, unreadChecksOf, unreadSentenceOf, allClearOf } from '../src/utils/settingsCards.js';

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
    // Its end: the hook's return (handleAddTaskToCalendar, which followed it, is gone since §0.246 — Part 7c).
    const fn = between(code(read('src/hooks/useTasks.js')), '    const handleCompleteTask = async (taskId, newStatus) => {', '\n    };\n\n    return {\n        tasks,') + '\n    };';
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
// Moved (§0.247 review fix): the Delete holds its schedule while out (busyScheds, drawn by setBusyIds) and names the
// schedule the banner speaks of (errorSched) — `bannerSched` is the schedule id a standing banner is about.
const deleteSched = async ({ sched = SCH_B, list = [SCH_A, SCH_B, SCH_C], answer, meanwhile, banner = '', bannerSched = null, busy = [] }) => {
    const ex = exportSrc();
    const fn = between(ex, '    const handleDeleteSched = async (sched) => {', '\n    };') + '\n    };';
    const schedules = stateOf(list), actionError = stateOf(banner);
    const busyScheds = { current: new Set(busy) }, errorSched = { current: bannerSched };
    const did = { sent: [], errorSet: [], said: [], drawn: [] };
    const handleDeleteSched = new Function('schedules', 'setSchedules', 'dbWrite', 'setActionError', 'setError', 'busyScheds', 'setBusyIds', 'errorSched',
        `${fn}\nreturn handleDeleteSched;`)(
        list, schedules.set,
        async (url, opts) => { did.sent.push([url, opts.method]); if (meanwhile) meanwhile(schedules.set); return answer; },
        // A clear ('') is no words said (moved: the landed Delete clears by setting '', no longer by an updater).
        (v) => { actionError.set(v); if (typeof v !== 'function' && v !== '') did.said.push(v); },
        (v) => did.errorSet.push(v), busyScheds, (v) => did.drawn.push(v), errorSched);
    await handleDeleteSched(sched);
    return { ...did, list: schedules.value, banner: actionError.value, busy: [...busyScheds.current], bannerSched: errorSched.current };
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
    // Moved pin (§0.247 review fix): the banner is this schedule's by id (bannerSched), never by its name.
    const landed = await deleteSched({ answer: LANDED, banner: '"Nightly deals" was not deleted — The server returned 502.', bannerSched: 'sch_2' });
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
    // Moved pin (§0.247 Part 8): `setError(e.message)` → failureWords(e) — never "Failed to fetch" or a parse error's words.
    order(between(ex, '        const load = async () => {', '\n        };'), '} catch (e) {', 'if (!cancelled) setError(failureWords(e));');
});

// ── Part 5 ──────────────────────────────────────────────────────────────────────────────────────────────────────

// Reports' saves (5a): the builder, the six templates and Duplicate (handleSaveReport), and Activity history's three
// "Save as report" buttons (handleSaveAsReport), extracted with their useCallback wrapper stripped and run over stubs —
// every timer queued (st.timers) and run by flush(). A refusal said "Failed to save. Check your connection" whatever the
// cause, or "Error — retry" with no reason, and left after 4 s or 3 s; a success's timer reset a later refusal to idle.
const callbackOf = (src, name, deps) => {
    const head = `    const ${name} = React.useCallback(`;
    const whole = between(src, head, `\n    }, ${deps});`);
    return `const ${name} = ${whole.slice(head.length)}\n    };`;
};
const SHARED_403 = 'Forbidden: you can only modify your own saved reports';   // saved-reports.mjs forbiddenOwner
const REPORT_REFUSALS = () => [
    [answerOf(403, { error: SHARED_403 }), SHARED_403],
    [answerOf(400, { error: 'name is required', requestId: 'r2' }), 'name is required (ref r2)'],
    [PAGE_502(), 'The server returned 502.'],
    [new TypeError('Failed to fetch'), 'The server could not be reached.'],
    [answerOf(200, new SyntaxError("Unexpected token '<'")), 'Its answer could not be read.'],
];
const LIB_A = Object.freeze({ id: 'rpt_a', name: 'Pipeline by rep' });
const reportSaves = (which) => {
    const r = reportsSrc();
    const st = { state: stateOf('idle'), words: stateOf(which === 'library' ? null : ''), list: stateOf([LIB_A]), said: [], timers: [], sent: [],
        closed: [], modes: [], handed: [], answers: [], org: 'org_a', switchAt: -1 };
    const dbFetch = async (url, opts) => {
        st.sent.push([url, opts.method, JSON.parse(opts.body)]);
        if (st.onSend) st.onSend();   // the member moves on while the request is out
        const a = st.answers.shift();
        if (st.sent.length - 1 === st.switchAt) st.org = 'org_b';
        if (a instanceof Error) throw a;
        return a;
    };
    const setWords = (v) => { st.words.set(v); if (typeof v !== 'function' && v) st.said.push(v); };
    const common = [() => 'org_a', (o) => o === st.org, dbFetch, readRefusal, failureWords, (f, ms) => { st.timers.push([f, ms]); },
        { randomUUID: () => 'u' + st.sent.length }, 'Karen Rep'];
    const names = ['requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setTimeout', 'crypto', 'currentUser'];
    if (which === 'library') {
        const fn = callbackOf(r, 'handleSaveReport', '[currentUser]');
        st.at = stateOf(null);
        st.place = { current: 't3' };   // savePlaceRef: the screen shown — the Rep scorecard template unless a case moves it
        st.call = new Function(...names, 'setSaveState', 'setSaveError', 'setSavedReportsList', 'setShowCreateReport', 'setCreateMode',
            'setSaveErrorAt', 'savePlaceRef',
            `${fn}\nreturn handleSaveReport;`)(...common, st.state.set, setWords, st.list.set, (v) => st.closed.push(v), (v) => st.modes.push(v),
            st.at.set, st.place);
    } else {
        const fn = callbackOf(r, 'handleSaveAsReport', '[currentUser, onSaveReport]');
        st.call = new Function(...names, 'setSaveReportState', 'setSaveReportError', 'onSaveReport',
            `${fn}\nreturn handleSaveAsReport;`)(...common, st.state.set, setWords, (rep) => st.handed.push(rep));
    }
    st.flush = () => { while (st.timers.length) st.timers.shift()[0](); };
    return st;
};
const TEMPLATE_SAVE = { name: 'Rep scorecard', source: 'Performance', dims: [], metrics: [], chartType: 'template', description: 'Saved from the Rep scorecard template', config: { templateId: 't3' } };

test('Part 5a: a refused or unsent report save says why — the house words — and keeps "error" after every timer; nothing added, the builder left open — RUN', async () => {
    for (const [answer, why] of REPORT_REFUSALS()) {
        const st = reportSaves('library');
        st.answers.push(answer);
        await st.call(TEMPLATE_SAVE);
        assert.deepEqual(st.sent.map(([url, m]) => [url, m]), [['/.netlify/functions/saved-reports', 'POST']]);
        assert.equal(st.state.value, 'error');
        assert.deepEqual(st.said, [`The report was not saved — ${why}`], `REGRESSION: "Failed to save. Check your connection" whatever the cause, or no reason at all (${why})`);
        assert.deepEqual(st.timers, [], `REGRESSION (Q9): the refusal closed on a timer (${why})`);
        st.flush();
        assert.equal(st.state.value, 'error', 'kept until its Close');
        assert.equal(st.words.value, `The report was not saved — ${why}`);
        assert.deepEqual([st.list.value, st.closed, st.modes], [[LIB_A], [], []], 'nothing added; the builder stays open');
        assert.equal(st.at.value, 't3', 'REGRESSION (Q9): the refusal not tied to the screen whose Save was pressed');
    }
    // Answered after the member moved to another screen: the refusal stays with the screen it was pressed from — never
    // said beside a Save on the screen the member is on now (review, 11 Nov).
    for (const moveTo of ['library', 't1', 'create:blank', 'create:duplicate']) {
        const late = reportSaves('library');
        late.onSend = () => { late.place.current = moveTo; };
        late.answers.push(PAGE_502());
        await late.call(TEMPLATE_SAVE);
        assert.equal(late.state.value, 'error');
        assert.equal(late.at.value, 't3', `REGRESSION (Q9): a refusal pressed on Rep scorecard said on ${moveTo}`);
    }
    // A teammate's shared report opened and saved back is a PUT to its row — the 403 the member meets (saved-reports.mjs:97).
    const st = reportSaves('library');
    st.answers.push(answerOf(403, { error: SHARED_403 }));
    await st.call({ ...TEMPLATE_SAVE, id: 'rpt_a', name: 'Pipeline by rep' });
    assert.deepEqual([st.sent[0][1], st.sent[0][2].id], ['PUT', 'rpt_a']);
    assert.deepEqual(st.said, [`The report was not saved — ${SHARED_403}`]);
});

test('Part 5a: a landed report save shows "saved", takes the stored row, closes the builder, and its timer clears only that success (Q10) — RUN', async () => {
    const STORED = { id: 'u0', name: 'Rep scorecard', source: 'Performance', stored: true };
    const st = reportSaves('library');
    st.answers.push(answerOf(200, { report: STORED }));
    await st.call(TEMPLATE_SAVE);
    assert.equal(st.sent[0][2].id, 'rpt_u0', 'a new report\'s id');
    assert.deepEqual([st.state.value, st.list.value, st.closed, st.modes, st.said], ['saved', [STORED, LIB_A], [false], ['picker'], []]);
    assert.deepEqual(st.timers.map(([, ms]) => ms), [3000], 'a success keeps its short timer');
    st.flush();
    assert.equal(st.state.value, 'idle', 'a success alone clears');
    // A success, then a refusal before the first timer runs: the timer leaves the refusal standing.
    const race = reportSaves('library');
    race.answers.push(answerOf(200, { report: STORED }), PAGE_502());
    await race.call(TEMPLATE_SAVE);
    await race.call(TEMPLATE_SAVE);
    assert.equal(race.state.value, 'error');
    race.flush();
    assert.equal(race.state.value, 'error', 'REGRESSION (Q10): a success\'s timer reset a later refusal to idle');
    assert.equal(race.words.value, 'The report was not saved — The server returned 502.');
    // A save again after a refusal clears its words as it starts.
    const retry = reportSaves('library');
    retry.answers.push(PAGE_502(), answerOf(200, { report: STORED }));
    await retry.call(TEMPLATE_SAVE);
    await retry.call(TEMPLATE_SAVE);
    assert.deepEqual([retry.state.value, retry.words.value], ['saved', null]);
});

test('Part 5a: a report save answered after an org switch — refused or landed — writes and says nothing — RUN', async () => {
    for (const answer of [answerOf(403, { error: SHARED_403 }), new TypeError('Failed to fetch'), answerOf(200, { report: { id: 'u0' } })]) {
        const st = reportSaves('library');
        st.answers.push(answer);
        st.switchAt = 0;
        await st.call(TEMPLATE_SAVE);
        assert.deepEqual([st.state.value, st.said, st.list.value, st.closed, st.timers], ['saving', [], [LIB_A], [], []],
            'REGRESSION (state §0.175): an answer after an org switch said or written on the new org\'s screen');
    }
});

test('Part 5a: Activity history\'s "Save as report" — a refusal says why, kept after every timer; a landed save hands its row, its timer clearing only that success — RUN', async () => {
    for (const [answer, why] of REPORT_REFUSALS()) {
        const st = reportSaves('history');
        st.answers.push(answer);
        await st.call('Acme', 'Account');
        assert.deepEqual(st.said, [`The history report was not saved — ${why}`], `REGRESSION: "Error — retry" for 3 s, never a reason (${why})`);
        assert.equal(st.state.value, 'error');
        assert.deepEqual(st.timers, [], `REGRESSION (Q9): the refusal closed on a timer (${why})`);
        st.flush();
        assert.deepEqual([st.state.value, st.words.value, st.handed], ['error', `The history report was not saved — ${why}`, []]);
    }
    const STORED = { id: 'u0', name: 'Account history — Acme', stored: true };
    const st = reportSaves('history');
    st.answers.push(answerOf(200, { report: STORED }));
    await st.call('Acme', 'Account');
    assert.deepEqual(st.sent[0][2].name, 'Account history — Acme');
    assert.deepEqual([st.state.value, st.handed, st.said], ['saved', [STORED], []]);
    st.flush();
    assert.equal(st.state.value, 'idle', 'a success alone clears');
    const race = reportSaves('history');
    race.answers.push(answerOf(200, { report: STORED }), answerOf(403, { error: SHARED_403 }));
    await race.call('Acme', 'Account');
    await race.call('Beta', 'Contact');
    race.flush();
    assert.deepEqual([race.state.value, race.words.value], ['error', `The history report was not saved — ${SHARED_403}`],
        'REGRESSION (Q10): a success\'s timer reset a later refusal');
    const retry = reportSaves('history');
    retry.answers.push(PAGE_502(), answerOf(200, { report: STORED }));
    await retry.call('Acme', 'Account');
    await retry.call('Acme', 'Account');
    assert.deepEqual([retry.state.value, retry.words.value], ['saved', ''], 'a save again clears the banner as it starts');
    for (const answer of [answerOf(403, { error: SHARED_403 }), answerOf(200, { report: STORED })]) {
        const sw = reportSaves('history');
        sw.answers.push(answer);
        sw.switchAt = 0;
        await sw.call('Acme', 'Account');
        assert.deepEqual([sw.state.value, sw.said, sw.handed], ['saving', [], []], 'REGRESSION (state §0.175): an answer after an org switch said or handed on');
    }
});

test('Part 5a: WIRING — no refusal on a timer; SaveRefusalNote at module scope, by each template\'s Save and above the Duplicate list; the builder\'s line and Activity history\'s banner each with a Close', () => {
    const raw = read('src/Tabs/ReportsTab.jsx');
    const r = reportsSrc();
    assert.ok(!/setTimeout\([^)]*set(SaveError|SaveReportError)/.test(r), 'REGRESSION: a refusal\'s words closed on a timer');
    assert.ok(!r.includes("setSaveState('idle'), 4000"), 'REGRESSION: the refusal reset after 4 s');
    assert.ok(!/setTimeout\(\(\) => set(SaveState|SaveReportState)\('idle'\)/.test(r), 'REGRESSION (Q10): a success\'s timer resets whatever is shown');
    assert.ok(!r.includes('Failed to save. Check your connection and try again.'), 'the old sentence, whatever the cause');
    assert.ok(!r.includes("throw new Error('HTTP ' + res.status)"), 'REGRESSION: "HTTP N" — the server\'s words dropped');
    assert.ok(r.includes("import { readRefusal, failureWords } from '../utils/refusalWords.js';"));
    // Module scope: declared at column 0, never inside a component (guide §16).
    assert.ok(raw.includes('\nfunction SaveRefusalNote({ words, onClose }) {'), 'SaveRefusalNote at module scope');
    const note = between(r, 'function SaveRefusalNote({ words, onClose }) {', '\n}\n');
    order(note, '<div role="alert"', '✕ {words}', '<button onClick={onClose}', '>Close</button>');
    assert.equal(count(r, '<SaveRefusalNote '), 7, 'six templates and the Duplicate list');
    assert.equal(count(r, "{refusalHere && <SaveRefusalNote words={saveError} onClose={closeSaveRefusal}/>}"), 6, 'by each template\'s Save');
    // Said only on the screen whose Save was pressed (Q9; review, 11 Nov): the screen is read at the press, the refusal
    // tied to it, and every place that draws a refusal or "Error — retry" asks refusalHere — never the shared state alone.
    order(r, "const [saveErrorAt, setSaveErrorAt] = React.useState(null);",
        "const savePlace = showCreateReport ? `create:${createMode}` : (activeTemplate || 'library');",
        'const savePlaceRef = React.useRef(savePlace);', 'savePlaceRef.current = savePlace;',
        "const refusalHere = saveState === 'error' && saveErrorAt === savePlace;",
        'const handleSaveReport = React.useCallback(', 'const at = savePlaceRef.current;', "setSaveState('saving');",
        "setSaveError(`The report was not saved — ${failureWords(err)}`);", 'setSaveErrorAt(at);');
    assert.equal(count(r, "saveState==='error'"), 0, 'REGRESSION (Q9): a refusal drawn beside a Save on another screen');
    assert.equal(count(r, "saveState === 'error' &&"), 1, 'refusalHere alone');
    assert.equal(count(r, "refusalHere?'Error — retry'"), 6, 'each template\'s Save reads "Error — retry" only for its own refusal');
    assert.equal(count(r, 'setSaveErrorAt('), 1);
    for (const t of ['t1', 't2', 't3', 't4', 't5', 't6']) {
        const at = r.indexOf(`config:{ templateId:'${t}' } })} disabled={saveState==='saving'}`);
        assert.ok(at > 0, t);
        const head = r.lastIndexOf("<div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginLeft:24 }}>", at);
        assert.ok(r.slice(head, at).includes('<SaveRefusalNote words={saveError} onClose={closeSaveRefusal}/>'), `REGRESSION: template ${t}'s Save says no reason`);
    }
    const dupes = between(r, "if (createMode === 'duplicate') {", "if (createMode === 'blank') {");
    order(dupes, "{refusalHere && <div style={{ marginBottom:10 }}><SaveRefusalNote words={saveError} onClose={closeSaveRefusal}/></div>}", '{DUPES.map(', "disabled={saveState==='saving'}");
    const header = between(r, 'const BuilderHeader = ({title, breadcrumb, onSave}) => (', '\n        );');
    order(header, "{refusalHere && <span role=\"alert\"", '✕ {saveError}', '<button onClick={closeSaveRefusal}', '>Close</button></span>}');
    assert.ok(r.includes("const closeSaveRefusal = () => { setSaveError(null); setSaveState(s => (s === 'error' ? 'idle' : s)); };"));
    const history = r.slice(r.indexOf('function ActivityHistoryTab('));
    order(history, "const [saveReportError, setSaveReportError] = React.useState('');",
        "const closeSaveReportRefusal = () => { setSaveReportError(''); setSaveReportState(s => (s === 'error' ? 'idle' : s)); };",
        "<div style={{ padding:'1rem 1.25rem 1.5rem', display:'flex', flexDirection:'column', gap:0 }}>",
        '{saveReportError && (', '<div role="alert"', '✕ {saveReportError}', '<button onClick={closeSaveReportRefusal}', 'Close', '{/* Sub-tab strip */}');
    assert.equal(count(history, 'handleSaveAsReport('), 2, 'the three buttons — ActionButtons (drawn twice) and the Opportunity tab\'s — share the one banner');
});

// The holiday Sync (5b): its RUN cases are S10's (tests/settings-saves.test.mjs); this holds the line it is said on.
test('Part 5b: WIRING — the Sync reads the ok check first; its failure is kept on the red line with a Close; no failure on a timer', () => {
    const cal = code(read('src/Tabs/settings/company/CompanyCalendarDetail.jsx'));
    const sync = between(cal, '    const handleSync = async () => {', '\n    };');
    order(sync, "const why  = res.ok ? '' : await readRefusal(res);", 'const data = res.ok ? await res.json() : null;',
        'if (!stillOrg(askedOrg)) { inFlight.current = false; return; }', 'if (why) throw new Error(why);');
    order(sync, '} catch (err) {', 'inFlight.current = false;', 'if (!stillOrg(askedOrg)) return;', 'setSyncMsg(`Failed to sync — ${failureWords(err)}`);');
    assert.ok(!sync.includes('err.message') && !sync.includes('Server error'), 'REGRESSION: raw words — "Unexpected token \'<\'", "Failed to fetch"');
    assert.ok(!/setTimeout\(\(\) => setSyncMsg\(''\)/.test(sync), 'REGRESSION (Q10, Q11): a timer that clears whatever is shown');
    assert.equal(count(sync, 'setTimeout('), 1, 'the success\'s alone');
    order(sync, 'const done = `✓ Synced', 'setSyncMsg(done);', 'setTimeout(() => setSyncMsg(m => (m === done ? \'\' : m)), 4000);');
    const line = between(cal, '{syncMsg && <div', '</div>}');
    order(line, "role={syncMsg.startsWith('✓') ? undefined : 'alert'}", "{!syncMsg.startsWith('✓') && <button onClick={() => setSyncMsg('')}", '>Close</button>}');
});

// ── Part 6 ──────────────────────────────────────────────────────────────────────────────────────────────────────

// Dispatch time off (6a, 6b): saveBlock and deleteBlock, extracted from DispatchTab.jsx and run over stubs — dbFetch
// answers per URL (the block, then each job's PUT by its id). DispatchTab remounts on an org switch (App.jsx's keyed
// Fragment), and saveBlock checks stillOrg before each PUT and before anything it says.
const DISPATCH = 'src/Tabs/DispatchTab.jsx';
const dispatchSrc = () => code(read(DISPATCH));
const BLOCK = Object.freeze({ id: 'dblk_1', techId: 'tech_1', blockType: 'pto', startDate: '2026-11-16', endDate: '2026-11-17', allDay: true, _isNew: true });
const STORED_BLOCK = Object.freeze({ id: 'dblk_1', techId: 'tech_1', blockType: 'pto', startDate: '2026-11-16', endDate: '2026-11-17', allDay: true, notes: 'stored' });
const TJ1 = Object.freeze({ id: 'job_1', title: 'Boiler service', customer: 'Acme', assignedTechIds: ['tech_1'], status: 'scheduled', start: 9 });
const TJ2 = Object.freeze({ id: 'job_2', title: '', customer: 'Gutter clean', assignedTechIds: ['tech_1'], status: 'scheduled', start: 11 });
const TJ3 = Object.freeze({ id: 'job_3', title: 'Filter swap', customer: 'Beta', assignedTechIds: ['tech_1'], status: 'scheduled', start: 14 });
const TECHS = [{ id: 'tech_1', firstName: 'Ann', lastName: 'Lee' }];
const timeOff = async ({ blk = BLOCK, unassign = [], blockAnswer = answerOf(200, { block: STORED_BLOCK }), jobAnswers = {}, switchAt = -1,
    blocks = [], jobs = [TJ1, TJ2, TJ3], banner = 'An earlier save\'s words', onPut } = {}) => {
    const fn = between(dispatchSrc(), '    const saveBlock = async (blk, unassignJobIds = []) => {', '\n    };') + '\n    };';
    const st = { sent: [], bannerSets: [], blockSets: [], audit: [], views: [], selected: [], org: 'org_a',
        banner: stateOf(banner), blocks: stateOf(blocks), jobs: stateOf(jobs) };
    const dbFetch = async (url, opts) => {
        st.sent.push([url, opts.method, opts.body ? JSON.parse(opts.body) : undefined]);
        if (st.sent.length - 1 === switchAt) st.org = 'org_b';
        const id = new URL(url, 'http://x.test').searchParams.get('id');
        const a = url.includes('dispatch-schedule-blocks') ? blockAnswer : (jobAnswers[id] || answerOf(200, { job: { id } }));
        if (onPut && !url.includes('dispatch-schedule-blocks')) onPut(st.banner);
        if (a instanceof Error) throw a;
        return a;
    };
    const saveBlock = new Function('requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'notFreedWords', 'setUnassignError',
        'setBlocks', 'setJobs', 'techsRaw', 'jobsWithBridge', 'addAudit', 'setSelectedJobId', 'setView', `${fn}\nreturn saveBlock;`)(
        () => 'org_a', (o) => o === st.org, dbFetch, readRefusal, failureWords, notFreedWords,
        (v) => { st.banner.set(v); st.bannerSets.push(st.banner.value); },
        (u) => { st.blockSets.push(u); st.blocks.set(u); }, st.jobs.set, TECHS, jobs,
        (...a) => st.audit.push(a), (v) => st.selected.push(v), (v) => st.views.push(v));
    st.threw = null;
    try { await saveBlock(blk, unassign); } catch (e) { st.threw = e; }
    return st;
};
const UNSENT = () => new TypeError('Failed to fetch');

test('Part 6a: notFreedWords — each job by name and why, the technician named, singular and plural; none, no words — RUN', () => {
    const jobs = [TJ1, TJ2, TJ3];
    assert.equal(notFreedWords([{ id: 'job_1', words: 'Forbidden: read-only role' }, { id: 'job_2', words: 'The server could not be reached.' }], jobs, 'Ann Lee', 3),
        'The time off was saved, but 2 of 3 jobs were not returned to the queue and are still assigned to Ann Lee — '
        + 'Boiler service: Forbidden: read-only role; Gutter clean: The server could not be reached. Unassign them from the Job Board.');
    assert.equal(notFreedWords([{ id: 'job_3', words: 'Forbidden: read-only role' }], jobs, 'Ann Lee', 2),
        'The time off was saved, but 1 of 2 jobs was not returned to the queue and is still assigned to Ann Lee — '
        + 'Filter swap: Forbidden: read-only role. Unassign it from the Job Board.', 'a sentence ends once: a period added where the words have none');
    assert.equal(notFreedWords([{ id: 'job_9', words: 'Job not found' }], jobs, '', 1),
        'The time off was saved, but 1 of 1 job was not returned to the queue and is still assigned to the technician — '
        + 'job_9: Job not found. Unassign it from the Job Board.', 'a job the screen no longer holds named by its id; no name, "the technician"');
    // A reason with its own full stop before another job's: "; " between them, never ".;" (review, 11 Nov).
    assert.equal(notFreedWords([{ id: 'job_2', words: 'The server could not be reached.' }, { id: 'job_1', words: 'The server returned 502.' }], jobs, 'Ann Lee', 3),
        'The time off was saved, but 2 of 3 jobs were not returned to the queue and are still assigned to Ann Lee — '
        + 'Gutter clean: The server could not be reached; Boiler service: The server returned 502. Unassign them from the Job Board.',
        'REGRESSION: ".;" between two jobs\' reasons');
    assert.equal(notFreedWords([], jobs, 'Ann Lee', 3), '');
    assert.equal(notFreedWords(undefined, jobs, 'Ann Lee', 3), '');
});

test('Part 6a: every unassign refused — the banner names each job and the server\'s words; no jump to the Queue, nothing freed — RUN', async () => {
    const st = await timeOff({ unassign: ['job_1', 'job_2', 'job_3'], jobAnswers: {
        job_1: answerOf(403, { error: 'Forbidden: read-only role' }), job_2: answerOf(500, { error: 'Database error', requestId: 'r9' }), job_3: PAGE_502() } });
    assert.equal(st.threw, null, 'REGRESSION: a throw keeps the dialog open — a second press re-saves the block and re-sends every unassign');
    assert.deepEqual(st.sent.map(([url, m]) => [url, m]), [['/.netlify/functions/dispatch-schedule-blocks', 'POST'],
        ['/.netlify/functions/dispatch-jobs?id=job_1', 'PUT'], ['/.netlify/functions/dispatch-jobs?id=job_2', 'PUT'], ['/.netlify/functions/dispatch-jobs?id=job_3', 'PUT']]);
    assert.deepEqual(st.sent[0][2], { id: 'dblk_1', techId: 'tech_1', blockType: 'pto', startDate: '2026-11-16', endDate: '2026-11-17', allDay: true }, 'the block sent without _isNew');
    assert.deepEqual(st.bannerSets, ['',
        'The time off was saved, but 3 of 3 jobs were not returned to the queue and are still assigned to Ann Lee — Boiler service: '
        + 'Forbidden: read-only role; Gutter clean: Database error (ref r9); Filter swap: The server returned 502. Unassign them from the Job Board.'],
        'REGRESSION: a refused unassign said nothing — only the audit row\'s "— 3 failed"');
    assert.deepEqual([st.views, st.selected], [[], []], 'nothing freed, no jump to the Queue');
    assert.deepEqual(st.jobs.value, [TJ1, TJ2, TJ3]);
    assert.equal(st.jobs.value[0], TJ1, 'the same rows');
    assert.deepEqual(st.blocks.value, [STORED_BLOCK], 'the block as stored');
    assert.match(st.audit[0][4], /— 0 job\(s\) returned to the queue — 3 failed$/);
});

test('Part 6a: one unsent and one freed — the banner says the one, the Queue shows the freed job; all freed, no words — RUN', async () => {
    const st = await timeOff({ unassign: ['job_1', 'job_2'], jobAnswers: { job_1: UNSENT() } });
    assert.equal(st.threw, null);
    assert.deepEqual(st.bannerSets, ['',
        'The time off was saved, but 1 of 2 jobs was not returned to the queue and is still assigned to Ann Lee — Boiler service: '
        + 'The server could not be reached. Unassign it from the Job Board.'], 'REGRESSION: an unsent unassign "counted below by omission"');
    assert.deepEqual([st.views, st.selected], [['queue'], ['job_2']], 'the dispatcher still goes to the Queue with the freed job (Q12)');
    assert.equal(st.jobs.value[0], TJ1, 'the job not freed left as it was');
    assert.equal(st.jobs.value[1].status, 'unscheduled');
    assert.deepEqual(st.jobs.value[1].assignedTechIds, []);
    assert.equal(st.jobs.value[2], TJ3);
    const all = await timeOff({ unassign: ['job_1', 'job_3'] });
    assert.deepEqual(all.bannerSets, [''], 'all freed: an earlier save\'s words cleared as this one began, none said');
    assert.equal(all.banner.value, '');
    assert.deepEqual([all.views, all.selected], [['queue'], ['job_1']]);
    // Another save's words landed while this one was out (the dialog left and opened again): this save's are added, never over them.
    const FIRST = 'The time off was saved, but 1 of 1 job was not returned to the queue and is still assigned to Bo Ray — Roof check: Forbidden. Unassign it from the Job Board.';
    const raced = await timeOff({ unassign: ['job_1', 'job_2'], jobAnswers: { job_1: UNSENT() }, onPut: (b) => { if (!b.value) b.set(FIRST); } });
    assert.equal(raced.banner.value, `${FIRST} The time off was saved, but 1 of 2 jobs was not returned to the queue and is still assigned to Ann Lee — `
        + 'Boiler service: The server could not be reached. Unassign it from the Job Board.', 'REGRESSION: a save\'s words written over another save\'s');
    // A save with no jobs to return leaves the banner as it stands: it is about jobs another save left.
    const none = await timeOff({});
    assert.deepEqual([none.bannerSets, none.banner.value, none.views, none.audit], [[], 'An earlier save\'s words', [], []]);
    assert.deepEqual(none.sent.length, 1);
});

test('Part 6a: an org switch during the unassigns — nothing more sent, nothing said, no audit row, no jump — RUN', async () => {
    const after1 = await timeOff({ unassign: ['job_1', 'job_2'], jobAnswers: { job_1: answerOf(403, { error: 'Forbidden: read-only role' }) }, switchAt: 1 });
    assert.equal(after1.sent.length, 2, 'the next PUT would carry the new org\'s token');
    assert.deepEqual([after1.bannerSets, after1.audit, after1.views, after1.selected], [[''], [], [], []],
        'REGRESSION (state §0.175): a refusal from the old org said on the new org\'s Dispatch');
    assert.deepEqual(after1.jobs.value, [TJ1, TJ2, TJ3]);
    const afterBlock = await timeOff({ unassign: ['job_1'], switchAt: 0 });
    assert.equal(afterBlock.sent.length, 1, 'no PUT after a switch');
    assert.deepEqual([afterBlock.bannerSets, afterBlock.audit, afterBlock.views], [[''], [], []]);
    // The switch during the last PUT: the loop is done; the check after it says and files nothing, freed or refused.
    for (const answer of [answerOf(403, { error: 'Forbidden: read-only role' }), answerOf(200, { job: { id: 'job_2' } })]) {
        const last = await timeOff({ unassign: ['job_1', 'job_2'], jobAnswers: { job_2: answer }, switchAt: 2 });
        assert.equal(last.sent.length, 3);
        assert.deepEqual([last.bannerSets, last.audit, last.views, last.selected], [[''], [], [], []],
            'REGRESSION (state §0.175): the last answer after a switch said, filed or jumped on the new org\'s Dispatch');
        assert.deepEqual(last.jobs.value, [TJ1, TJ2, TJ3]);
    }
});

test('Part 6b: a refused block save throws the server\'s words — a 403 the role\'s sentence — before any unassign; nothing set — RUN', async () => {
    const cases = [
        [answerOf(403, { error: 'Forbidden' }), 'Your role cannot change availability.'],
        [answerOf(500, { error: 'Database error', requestId: 'r1' }), 'Database error (ref r1)'],
        [answerOf(400, {}), 'The server returned 400.'],
        [PAGE_502(), 'The server returned 502.'],
        [UNSENT(), 'The server could not be reached.'],
    ];
    for (const [blockAnswer, why] of cases) {
        const st = await timeOff({ unassign: ['job_1'], blockAnswer });
        assert.ok(st.threw, why);
        assert.equal(failureWords(st.threw), why, `REGRESSION: "HTTP N", the ref dropped, or a parse error's words (${why})`);
        assert.equal(st.sent.length, 1, 'no unassign sent for a block not saved');
        assert.deepEqual([st.blockSets, st.views, st.audit], [[], [], []]);
    }
    // A real answer's body reads once: the ok check before the body, or the refusal's words are lost to "already read".
    let reads = 0;
    const once = { ok: false, status: 500, json: async () => { if (reads++) throw new TypeError('Body is unusable: Body has already been read'); return { error: 'Database error', requestId: 'r2' }; } };
    const read1 = await timeOff({ unassign: ['job_1'], blockAnswer: once });
    assert.equal(failureWords(read1.threw), 'Database error (ref r2)', 'REGRESSION: the body read before the ok check — the server\'s words lost');
    const edit = await timeOff({ blk: { ...STORED_BLOCK }, blockAnswer: answerOf(409, { error: 'That block belongs to another workspace' }) });
    assert.deepEqual([edit.sent[0][0], edit.sent[0][1]], ['/.netlify/functions/dispatch-schedule-blocks?id=dblk_1', 'PUT']);
    assert.equal(failureWords(edit.threw), 'That block belongs to another workspace');
});

test('Part 6b: a landed block whose answer cannot be read says so — setBlocks never handed undefined; its jobs still go back to the queue, any left named after it — RUN', async () => {
    const UNREAD = "The time off was saved, but its answer couldn't be read. Refresh to see it.";
    for (const blockAnswer of [answerOf(200, new SyntaxError("Unexpected token '<'")), answerOf(200, {}), answerOf(200, null)]) {
        // No jobs to return: the dialog says it (a throw), nothing else sent.
        const none = await timeOff({ blockAnswer, blocks: [STORED_BLOCK] });
        assert.equal(failureWords(none.threw), UNREAD, 'REGRESSION: the unchecked saved.id — a TypeError, or undefined put in the list');
        assert.deepEqual([none.blockSets, none.sent.length, none.blocks.value], [[], 1, [STORED_BLOCK]]);
        // Jobs to return: the block landed, so they still go back — a throw sent none and named none (review, 11 Nov).
        const st = await timeOff({ unassign: ['job_1'], blockAnswer, blocks: [STORED_BLOCK] });
        assert.equal(st.threw, null, 'REGRESSION: a landed block\'s unreadable answer stopped its jobs going back to the queue');
        assert.deepEqual([st.blockSets, st.blocks.value], [[], [STORED_BLOCK]], 'nothing put in the list');
        assert.deepEqual(st.sent.map(([url, m]) => [url, m]).slice(1), [['/.netlify/functions/dispatch-jobs?id=job_1', 'PUT']]);
        assert.equal(st.banner.value, UNREAD, 'the banner says the time off shows after a refresh');
        // One refused: named after it.
        const left = await timeOff({ unassign: ['job_1', 'job_2'], blockAnswer, jobAnswers: { job_2: PAGE_502() } });
        assert.equal(left.threw, null);
        assert.equal(left.banner.value, `${UNREAD} The time off was saved, but 1 of 2 jobs was not returned to the queue and is still assigned to Ann Lee — `
            + 'Gutter clean: The server returned 502. Unassign it from the Job Board.');
    }
    // After an org switch while the block was out: nothing said (the loop's own check then stops before any PUT).
    const moved = await timeOff({ unassign: ['job_1'], blockAnswer: answerOf(200, {}), switchAt: 0 });
    assert.deepEqual([moved.threw, moved.sent.length, moved.bannerSets.filter((v) => v === UNREAD)], [null, 1, []]);
    const landed = await timeOff({ blocks: [{ ...STORED_BLOCK, notes: 'old' }, { id: 'dblk_2' }] });
    assert.equal(landed.threw, null);
    assert.deepEqual(landed.blocks.value, [STORED_BLOCK, { id: 'dblk_2' }], 'the block as stored, in its place');
});

test('Part 6b: a refused Delete throws the server\'s words, else the status; a landed Delete takes the block out — RUN', async () => {
    const fn = between(dispatchSrc(), '    const deleteBlock = async (id) => {', '\n    };') + '\n    };';
    const run = async (answer) => {
        const blocks = stateOf([STORED_BLOCK, { id: 'dblk_2' }]);
        const sent = [];
        const deleteBlock = new Function('dbFetch', 'readRefusal', 'setBlocks', `${fn}\nreturn deleteBlock;`)(
            async (url, opts) => { sent.push([url, opts.method]); if (answer instanceof Error) throw answer; return answer; }, readRefusal, blocks.set);
        let threw = null;
        try { await deleteBlock('dblk_1'); } catch (e) { threw = e; }
        return { threw, sent, blocks: blocks.value };
    };
    for (const [answer, why] of [[answerOf(500, { error: 'Database error', requestId: 'r4' }), 'Database error (ref r4)'],
        [PAGE_502(), 'The server returned 502.'], [answerOf(403, { error: 'Forbidden' }), 'Forbidden'], [UNSENT(), 'The server could not be reached.']]) {
        const r = await run(answer);
        assert.equal(failureWords(r.threw), why, `REGRESSION: "HTTP N" (${why})`);
        assert.deepEqual(r.blocks, [STORED_BLOCK, { id: 'dblk_2' }], 'the block left in place');
    }
    const ok = await run(answerOf(200, { ok: true }));
    assert.deepEqual([ok.threw, ok.sent, ok.blocks], [null, [['/.netlify/functions/dispatch-schedule-blocks?id=dblk_1', 'DELETE']], [{ id: 'dblk_2' }]]);
});

test('Part 6a/6b: WIRING — the banner above every view, kept until its Close; no omission; ScheduleView says failureWords', () => {
    const raw = read(DISPATCH);
    const d = dispatchSrc();
    assert.ok(!raw.includes('/* counted below by omission */'), 'REGRESSION: a failed unassign counted only by omission');
    assert.ok(d.includes("import { readRefusal, failureWords } from '../utils/refusalWords.js';"));
    assert.ok(d.includes("import { notFreedWords } from '../utils/dispatchUnassign.js';"));
    const save = between(d, '    const saveBlock = async (blk, unassignJobIds = []) => {', '\n    };');
    order(save, "if (unassignJobIds.length) setUnassignError('');", 'await dbFetch(', 'if (!res.ok) throw new Error(', 'const data = await res.json()',
        'if (!saved && !unassignJobIds.length) throw new Error(unread);', 'if (!saved) { if (stillOrg(askedOrg)) setUnassignError(unread); }',
        'else setBlocks(', 'if (r.ok) freed.push(jobId);', 'else notFreed.push({ id: jobId, words: await readRefusal(r) });',
        'notFreed.push({ id: jobId, words: failureWords(e) });', '// and no audit row', 'const notFreedSaid = notFreed.length ? notFreedWords(notFreed, jobsWithBridge, techLabel, unassignJobIds.length)',
        'if (notFreed.length) setUnassignError(prev => (prev ? `${prev} ${notFreedSaid}` : notFreedSaid));', "setView('queue');");
    assert.ok(!save.includes("'HTTP '"), 'REGRESSION: "HTTP N"');
    assert.ok(d.includes("const [unassignError, setUnassignError] = useState('');"));
    assert.equal(count(d, 'setUnassignError('), 4,'cleared as a save with jobs to return begins, an unreadable landed answer, set from the answer, the Close — none else');
    assert.ok(!/setTimeout\([^;]*setUnassignError/.test(d), 'REGRESSION: the banner closed on a timer');
    // The banner: above {/* Main content */}, outside every view's branch, so it shows in every view.
    const banner = between(d, '{unassignError && (', '{/* Main content */}');
    order(banner, '<div role="alert"', '✕ {unassignError}', "<button onClick={() => setUnassignError('')}", 'Close', '</button>');
    order(d, '{/* Sub-tabs', '{unassignError && (', '{/* Main content */}', "{view === 'board' ? (");
    assert.equal(count(d, '{unassignError && ('), 1);
    // ScheduleView's three catches say failureWords — never a raw e.message ("Failed to fetch", "Unexpected token").
    const sv = between(d, 'const ScheduleView = ', 'const ShiftPatternDialog = ');
    assert.equal(count(sv, 'setErr(failureWords(e))'), 3, 'Save, Accept & re-crew, Delete');
    assert.ok(!sv.includes('setErr(e.message)'), 'REGRESSION: a raw e.message in the time off dialogs');
    order(between(sv, '    const submit = async () => {', '\n    };'), 'try { await onSaveBlock(editing); setEditing(null); }', 'catch (e) { setErr(failureWords(e)); }');
    // The conflict step shares the dialog's error line: opening it clears the last attempt's words (pane, 11 Nov — a
    // refused Save's words stood in "Already scheduled" before anything there was pressed).
    assert.ok(between(sv, '    const submit = async () => {', '\n    };').includes("if (clashing.length > 0) { setErr(''); setConflict({ block: editing, jobs: clashing }); return; }"),
        'REGRESSION: the conflict step opens with the last refusal\'s words');
    order(between(sv, '    const confirmWithUnassign = async () => {', '\n    };'), 'await onSaveBlock(conflict.block, conflict.jobs.map(j => j.id));', '} catch (e) { setErr(failureWords(e)); }');
    assert.ok(sv.includes('try { await onDeleteBlock(editing.id); setEditing(null); } catch (e) { setErr(failureWords(e)); }'));
});

// ── Part 7 ──────────────────────────────────────────────────────────────────────────────────────────────────────

const QUOTES = 'src/Tabs/QuotesTab.jsx';
const quotesSrc = () => code(read(QUOTES));
const pdfAnswer = (status, body) => ({ ok: status < 400, status, json: async () => { if (body instanceof Error) throw body; return body; },
    blob: async () => { if (body instanceof Error) throw body; return body; } });
const PDF_REFUSALS = () => [
    [pdfAnswer(404, { error: 'Quote not found' }), 'Quote not found'],
    [pdfAnswer(403, { error: 'Forbidden: you can only read your own deals' }), 'Forbidden: you can only read your own deals'],
    [pdfAnswer(500, { error: 'The PDF could not be made', requestId: 'r7' }), 'The PDF could not be made (ref r7)'],
    [PAGE_502(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];

// quotePdfOf (7a): the ok check first, then the file; { blob } or { error } in the house words, never a throw.
test('Part 7a: quotePdfOf — a refusal in the server\'s words with their ref, else the status; unsent, the plain words; a file that cannot be read says so; never throws — RUN', async () => {
    const BLOB = { size: 4, type: 'application/pdf' };
    assert.deepEqual(await quotePdfOf(async () => pdfAnswer(200, BLOB)), { blob: BLOB });
    for (const [answer, words] of PDF_REFUSALS()) {
        const r = await quotePdfOf(async () => { if (answer instanceof Error) throw answer; return answer; });
        assert.deepEqual(r, { error: words }, `REGRESSION: 'PDF generation failed' — the server's words dropped (${words})`);
    }
    const unreadable = await quotePdfOf(async () => pdfAnswer(200, new TypeError('Body is unusable: Body has already been read')));
    assert.deepEqual(unreadable, { error: 'Its answer could not be read.' }, 'a 200 whose file cannot be read is no PDF, said plainly');
    const raw = await quotePdfOf(async () => { throw new SyntaxError("Unexpected token '<'"); });
    assert.deepEqual(raw, { error: 'Its answer could not be read.' }, 'REGRESSION: a parse error\'s own words');
});

// handleExportPDF (7a), extracted and run over the real quotePdfOf and stubs: a PDF not made is said for its quote,
// nothing opened; a landed one downloads; an answer after an org switch downloads and says nothing; one at a time.
let builtExport;
const exportPdf = () => builtExport || (builtExport = (() => {
    const fn = between(quotesSrc(), '    const handleExportPDF = async () => {', '\n    };') + '\n    };';
    return new Function('activeQuote', 'pdfBusy', 'setPdfError', 'setPdfBusy', 'quotePdfOf', 'dbFetch', 'requestOrg', 'stillOrg', 'URL', 'document', 'window',
        `${fn}\nreturn handleExportPDF;`);
})());
const Q7 = Object.freeze({ id: 'q_7', quoteNumber: 'Q-2026-013', version: 2, lineItems: [] });
const pressPdf = async ({ answer, busy = false, switchOrg = false, quote = Q7 }) => {
    const did = { sent: [], errors: [], busy: [], clicks: [], opened: 0, revoked: [] };
    let org = 'org_a';
    const doc = { createElement: (tag) => { const el = { tag }; el.click = () => did.clicks.push({ href: el.href, download: el.download }); return el; } };
    const url = { createObjectURL: (b) => `blob:${b.size}`, revokeObjectURL: (u) => did.revoked.push(u) };
    const win = { open: () => { did.opened++; return null; } };
    const run = exportPdf()(quote, busy, (e) => did.errors.push(e), (b) => did.busy.push(b), quotePdfOf,
        async (u, opts) => { did.sent.push([u, opts.method, JSON.parse(opts.body)]); if (switchOrg) org = 'org_b'; if (answer instanceof Error) throw answer; return answer; },
        () => 'org_a', (o) => o === org, url, doc, win);
    await run();
    return did;
};

test('Part 7a: a PDF not made is said for its quote in the house words — nothing downloaded, no copy opened on its own — RUN', async () => {
    for (const [answer, words] of PDF_REFUSALS()) {
        const d = await pressPdf({ answer });
        assert.deepEqual(d.sent, [['/.netlify/functions/quote-pdf', 'POST', { quoteId: 'q_7' }]], 'the stored quote by its id');
        assert.deepEqual(d.errors, [null, { quoteId: 'q_7', words: `The PDF was not made — ${words}` }], `REGRESSION: a PDF not made said nothing (${words})`);
        assert.deepEqual(d.busy, [true, false], 'one request at a time, let go once answered');
        assert.deepEqual([d.clicks, d.opened], [[], 0], 'REGRESSION: the print copy opened on its own, with no word');
    }
});

test('Part 7a: a landed PDF downloads under its name and says nothing; a press while one is out sends nothing — RUN', async () => {
    const d = await pressPdf({ answer: pdfAnswer(200, { size: 9 }) });
    assert.deepEqual(d.errors, [null], 'the words cleared at the press, none set');
    assert.deepEqual(d.busy, [true, false]);
    assert.deepEqual(d.clicks, [{ href: 'blob:9', download: 'Q-2026-013-v2.pdf' }]);
    assert.deepEqual([d.revoked, d.opened], [['blob:9'], 0]);
    const busy = await pressPdf({ answer: pdfAnswer(200, { size: 9 }), busy: true });
    assert.deepEqual([busy.sent, busy.errors, busy.busy, busy.clicks], [[], [], [], []], 'REGRESSION: a second press while the first is out');
    const none = await pressPdf({ answer: pdfAnswer(200, { size: 9 }), quote: null });
    assert.deepEqual(none.sent, []);
});

test('Part 7a: an answer after an org switch — refused or landed — downloads nothing and says nothing — RUN', async () => {
    for (const answer of [pdfAnswer(500, { error: 'Database error' }), UNSENT(), pdfAnswer(200, { size: 9 })]) {
        const d = await pressPdf({ answer, switchOrg: true });
        assert.deepEqual([d.errors, d.busy, d.clicks, d.opened], [[null], [true], [], 0], 'REGRESSION: the org check after the answer is gone');
    }
});

// printQuoteCopy (7a, Q15), extracted with calcLineTotals and run over the real quoteTotals and quoteMoneyRows: opened
// only when called, its lines to the cent and adding up to its own Subtotal.
let builtPrint;
const printCopy = () => builtPrint || (builtPrint = (() => {
    const s = quotesSrc();
    const calc = between(s, 'function calcLineTotals(', '\n}\n') + '\n}';
    const fn = between(s, 'const printQuoteCopy = (', '\n};') + '\n};';
    return new Function('quoteTotals', 'quoteMoneyRows', 'esc', 'fmtMoney', 'T', 'window', 'setTimeout', `${calc}\n${fn}\nreturn printQuoteCopy;`);
})());
const printed = (quote, { blocked = false } = {}) => {
    const did = { html: '', closed: 0, printed: 0, timers: [] };
    const w = { document: { write: (h) => { did.html += h; }, close: () => { did.closed++; } }, print: () => { did.printed++; } };
    printCopy()(quoteTotals, quoteMoneyRows, esc, fmtMoney, T, { open: () => (blocked ? null : w) }, (f, ms) => did.timers.push([f, ms]))(
        { activeQuote: quote, products: [], orgIdentity: { name: 'Acme & Sons' }, configuratorOpp: { account: 'Beta <Co>' } });
    for (const [f] of did.timers) f();
    return did;
};

test('Part 7a: the print copy\'s lines are to the cent and add up to its own Subtotal; it names the org, escaped — RUN', () => {
    const quote = { id: 'q_7', quoteNumber: 'Q-2026-013', name: 'Renewal', lineItems: [
        { productName: 'Seats', listPrice: 19.99, quantity: 3 }, { productName: 'Setup', listPrice: 0.5, quantity: 1 }], paymentTerms: 'Net 30' };
    const d = printed(quote);
    assert.ok(d.html.includes('<td>$59.97</td>') && d.html.includes('<td>$0.50</td>'), 'REGRESSION (Q15): the lines in whole dollars ($60, $1) beside a Subtotal of $60.47');
    assert.ok(d.html.includes('<p>Subtotal: $60.47</p>') && d.html.includes('<p><strong>Total: $60.47</strong></p>'));
    assert.ok(d.html.includes('Acme &amp; Sons') && d.html.includes('Beta &lt;Co&gt;'), 'the org\'s name and the account, escaped');
    assert.deepEqual([d.closed, d.printed], [1, 1]);
    const blocked = printed(quote, { blocked: true });
    assert.deepEqual([blocked.html, blocked.printed], ['', 0], 'a tab the browser blocked writes nothing');
});

test('Part 7a: WIRING — the PDF\'s words under Download PDF with a Close; the copy only by "Print a copy instead"; the request by id', () => {
    const s = quotesSrc();
    assert.ok(s.includes("import { dbFetch, requestOrg, stillOrg } from '../utils/storage';"));
    assert.ok(s.includes("import { quotePdfOf } from '../utils/quotePdfAnswer.js';"));
    const fn = between(s, '    const handleExportPDF = async () => {', '\n    };');
    order(fn, 'if (!activeQuote || pdfBusy) return;', 'const askedOrg = requestOrg();', 'setPdfError(null); setPdfBusy(true);',
        "quotePdfOf(() => dbFetch('/.netlify/functions/quote-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: activeQuote.id }) }));",
        'if (!stillOrg(askedOrg)) return;', 'if (answer.error) { setPdfError({ quoteId, words: `The PDF was not made — ${answer.error}` }); setPdfBusy(false); return; }',
        'setPdfBusy(false);', 'URL.createObjectURL(answer.blob)');
    // The org check is the first thing after the answer — before any setter.
    const after = fn.slice(fn.indexOf('quotePdfOf('));
    assert.ok(after.indexOf('if (!stillOrg(askedOrg)) return;') < after.indexOf('setPdf'), 'REGRESSION: a setter before the org check');
    assert.ok(!fn.includes('window.open') && !fn.includes('printQuoteCopy') && !fn.includes('catch'), 'REGRESSION: the print copy opened on a failure, with no word');
    assert.ok(!s.includes("'PDF generation failed'"), 'REGRESSION: the server\'s words dropped');
    assert.equal(count(s, 'window.open('), 1, 'one tab opened, by the print copy');
    assert.equal(count(between(s, 'const printQuoteCopy = (', '\n};'), 'window.open('), 1);
    assert.ok(s.includes('const [pdfBusy,            setPdfBusy]          = useState(false);') && s.includes('const [pdfError,           setPdfError]         = useState(null);'));
    assert.equal(count(s, 'setPdfError('), 3, 'cleared at a press, set on a refusal, the Close — none else');
    assert.ok(!/setTimeout\([^;]*setPdfError/.test(s), 'REGRESSION: the words leave on a timer');
    // Drawn under Download PDF, only for its quote, kept until its Close; the copy a button there — its one call.
    const drawn = between(s, '{pdfError && pdfError.quoteId === activeQuote.id && (', '\n                                            )}');
    order(s, '<button onClick={handleExportPDF} disabled={pdfBusy}', '{pdfError && pdfError.quoteId === activeQuote.id && (');
    order(drawn, '<div role="alert"', '⚠ {pdfError.words}', '<button onClick={() => setPdfError(null)}', 'Close</button>',
        '<button onClick={() => printQuoteCopy({ activeQuote, products, orgIdentity, configuratorOpp })}', 'Print a copy instead</button>');
    assert.equal(count(s, 'printQuoteCopy({'), 1, 'the copy opened only by the button');
});

// The coaching hook (7b), extracted whole and run over a stand-in React (each useState a recorded cell, an effect run
// as it is declared, a callback itself) and a stubbed dbFetch: no write rejects; a failed load is said.
let builtCoaching;
const coachingHook = () => builtCoaching || (builtCoaching = (() => {
    const s = code(read('src/hooks/useCoachingNotes.js'));
    const body = s.slice(s.indexOf("const URL = '/.netlify/functions/coaching-notes';")).replace('export function useCoachingNotes', 'function useCoachingNotes');
    return new Function('useState', 'useEffect', 'useCallback', 'dbFetch', 'requestOrg', 'stillOrg', 'readRefusal', 'failureWords', 'console',
        `${body}\nreturn useCoachingNotes;`);
})());
const NOTE = Object.freeze({ id: 'cn_1', text: 'Strong call', readBy: [] });
const coaching = async ({ answers = [], orgId = 'org_a', switchOrg = null, initial = [NOTE] } = {}) => {
    const cells = [];
    const sent = [];
    let org = 'org_a';
    const queue = [...answers];
    const hook = coachingHook()(
        (init) => { const c = stateOf(init); cells.push(c); return [c.value, c.set]; },
        (fn) => { fn(); },
        (fn) => fn,
        async (u, opts = {}) => {
            sent.push([u, opts.method || 'GET']);
            if (switchOrg === sent.length) org = 'org_b';
            const a = queue.shift();
            if (a instanceof Error) throw a;
            return a;
        },
        () => org, (o) => o === org, readRefusal, failureWords, quiet)({ orgId, waitForToken: async () => {} });
    await settle();
    const [notes, , error] = cells;
    if (initial && !switchOrg) notes.set(initial);
    return { hook, notes, error, sent, setOrg: (o) => { org = o; } };
};
const COACH_REFUSALS = () => [
    [answerOf(403, { error: 'Forbidden: only the author or an Admin may change this note' }), 'Forbidden: only the author or an Admin may change this note'],
    [answerOf(500, { error: 'Database error', requestId: 'r9' }), 'Database error (ref r9)'],
    [PAGE_502(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];
const LOAD_OK = () => answerOf(200, { coachingNotes: [NOTE] });

test('Part 7b: the coaching notes\' load — landed, the notes; refused, unsent or unreadable, coachingNotesError in the house words, never "no notes" — RUN', async () => {
    const ok = await coaching({ answers: [LOAD_OK()], initial: null });
    assert.deepEqual([ok.notes.value, ok.error.value, ok.sent], [[NOTE], '', [['/.netlify/functions/coaching-notes', 'GET']]]);
    for (const [answer, words] of [...COACH_REFUSALS(), [answerOf(200, new SyntaxError("Unexpected token '<'")), 'Its answer could not be read.']]) {
        const st = await coaching({ answers: [answer], initial: null });
        assert.equal(st.error.value, words, `REGRESSION: a failed load read as no notes (${words})`);
        assert.deepEqual(st.notes.value, []);
    }
    const noOrg = await coaching({ answers: [LOAD_OK()], orgId: null, initial: null });
    assert.deepEqual([noOrg.sent, noOrg.error.value], [[], '']);
});

test('Part 7b: a load answered after an org switch — refused or landed — sets nothing and says nothing — RUN', async () => {
    for (const answer of [answerOf(500, { error: 'Database error' }), UNSENT(), LOAD_OK()]) {
        const st = await coaching({ answers: [answer], switchOrg: 1, initial: null });
        assert.deepEqual([st.notes.value, st.error.value], [[], ''], 'REGRESSION: another org\'s answer said on this org\'s screen');
    }
});

test('Part 7b: add, mark read and delete never reject — each refusal answers { ok: false, error } in the house words, the list unchanged — RUN', async () => {
    const WRITES = [
        ['add', (h) => h.addCoachingNote({ text: 'x' }), 'POST'],
        ['mark read', (h) => h.markCoachingNoteRead('cn_1'), 'PUT'],
        ['delete', (h) => h.deleteCoachingNote('cn_1'), 'DELETE'],
    ];
    for (const [what, run, method] of WRITES) {
        for (const [answer, words] of COACH_REFUSALS()) {
            const st = await coaching({ answers: [LOAD_OK(), answer] });
            let r, threw = null;
            try { r = await run(st.hook); } catch (e) { threw = e; }
            assert.equal(threw, null, `REGRESSION: ${what} rejected — the dialog stayed "Saving…" for good (${words})`);
            assert.deepEqual(r, { ok: false, error: words }, `${what}: ${words}`);
            assert.equal(st.sent[1][1], method);
            assert.deepEqual(st.notes.value, [NOTE], `${what}: the list unchanged`);
        }
    }
    // A landed add or mark read whose answer cannot be read says so; a delete reads no body, so it landed.
    for (const [what, run] of WRITES.slice(0, 2)) {
        const st = await coaching({ answers: [LOAD_OK(), answerOf(200, new SyntaxError("Unexpected token '<'"))] });
        assert.deepEqual(await run(st.hook), { ok: false, error: 'Its answer could not be read.' }, `${what}: never a parse error's words`);
    }
    const del = await coaching({ answers: [LOAD_OK(), answerOf(200, new SyntaxError("Unexpected token '<'"))] });
    assert.deepEqual(await del.hook.deleteCoachingNote('cn_1'), { ok: true });
    assert.deepEqual(del.notes.value, []);
    assert.equal(del.sent[1][0], '/.netlify/functions/coaching-notes?id=cn_1');
});

test('Part 7b: a landed write takes the note as stored; after an org switch it answers but changes nothing on screen — RUN', async () => {
    const READ = { ...NOTE, readBy: ['usr_1'] };
    const NEW = { id: 'cn_2', text: 'New', readBy: [] };
    const add = await coaching({ answers: [LOAD_OK(), answerOf(201, { coachingNote: NEW })] });
    assert.deepEqual(await add.hook.addCoachingNote({ text: 'New' }), { ok: true, note: NEW, created: true });
    assert.deepEqual(add.notes.value, [NEW, NOTE]);
    const read1 = await coaching({ answers: [LOAD_OK(), answerOf(200, { coachingNote: READ })] });
    assert.deepEqual(await read1.hook.markCoachingNoteRead('cn_1'), { ok: true, note: READ });
    assert.deepEqual(read1.notes.value, [READ]);
    for (const [run, answer] of [[(h) => h.addCoachingNote({}), answerOf(201, { coachingNote: NEW })], [(h) => h.markCoachingNoteRead('cn_1'), answerOf(200, { coachingNote: READ })],
        [(h) => h.deleteCoachingNote('cn_1'), answerOf(200, {})]]) {
        const st = await coaching({ answers: [LOAD_OK(), answer] });
        const out = run(st.hook);
        st.setOrg('org_b');
        assert.equal((await out).ok, true, 'the caller still gets its result');
        assert.deepEqual(st.notes.value, [NOTE], 'REGRESSION: another org\'s screen changed');
    }
});

// Home's "Mark read" (7b), extracted and run over stubs: a refusal said in a press notice, only for the org that asked.
let builtMarkRead;
const markRead = () => builtMarkRead || (builtMarkRead = (() => {
    const fn = between(code(read('src/Tabs/HomeTab.jsx')), '    const markNoteRead = async (n) => {', '\n    };') + '\n    };';
    return new Function('markCoachingNoteRead', 'setPressNotices', 'pressNoticeOf', 'requestOrg', 'stillOrg', `${fn}\nreturn markNoteRead;`);
})());
const pressMarkRead = async ({ answer, switchOrg = false }) => {
    const notices = stateOf([]);
    const asked = [];
    let org = 'org_a';
    await markRead()(async (id) => { asked.push(id); if (switchOrg) org = 'org_b'; return answer; }, notices.set, pressNoticeOf, () => 'org_a', (o) => o === org)(NOTE);
    return { notices: notices.value, asked };
};

test('Part 7b: Home\'s "Mark read" says a refusal in a press notice — "Not marked read: <why>" — and nothing when it landed or the org switched — RUN', async () => {
    for (const [, words] of COACH_REFUSALS()) {
        const st = await pressMarkRead({ answer: { ok: false, error: words } });
        assert.deepEqual(st.asked, ['cn_1']);
        assert.equal(st.notices.length, 1, `REGRESSION: a refused Mark read said nothing (${words})`);
        assert.deepEqual([st.notices[0].title, st.notices[0].words, st.notices[0].refused], ['Coaching note', `Not marked read: ${words}`, null]);
    }
    assert.deepEqual((await pressMarkRead({ answer: { ok: true, note: NOTE } })).notices, []);
    assert.deepEqual((await pressMarkRead({ answer: { ok: false, error: 'Database error' }, switchOrg: true })).notices, [], 'REGRESSION: said on another org\'s screen');
});

test('Part 7b: WIRING — the hook reads ok first and never rejects; App hands out coachingNotesError; Home and Sales Manager say a failed load; TeamTab\'s banner has a Close', () => {
    const hook = code(read('src/hooks/useCoachingNotes.js'));
    assert.ok(hook.includes("import { dbFetch, requestOrg, stillOrg } from '../utils/storage.js';"));
    assert.ok(hook.includes("import { readRefusal, failureWords } from '../utils/refusalWords.js';"));
    assert.ok(!hook.includes('errorOf'), 'REGRESSION: the old reader — the ref dropped, the body read before the ok check');
    const answered = between(hook, 'const answered = async (send, { body = true } = {}) => {', '\n};');
    order(answered, 'const res = await send();', 'if (!res.ok) return { ok: false, error: await readRefusal(res) };', 'await res.json()', '} catch (e) { return { ok: false, error: failureWords(e) }; }');
    assert.equal(count(hook, 'await answered('), 3, 'each write through the one reader');
    assert.equal(count(hook, 'await dbFetch('), 1, 'the load alone sends by itself');
    const effect = between(hook, '    useEffect(() => {', '    }, [enabled, orgId, waitForToken, reload]);');
    order(effect, "setCoachingNotesError('');", 'const askedOrg = requestOrg();', 'await reload();', '} catch (err) {',
        'if (!cancelled && stillOrg(askedOrg)) setCoachingNotesError(failureWords(err));');
    assert.ok(!effect.includes('console.warn'), 'REGRESSION: a failed load said only to the console');
    assert.ok(hook.includes('return { coachingNotes, coachingNotesLoaded, coachingNotesError, reloadCoachingNotes: reload, addCoachingNote, markCoachingNoteRead, deleteCoachingNote };'));
    const app = read('src/App.jsx');
    assert.ok(app.includes('const { coachingNotes, coachingNotesError, addCoachingNote, markCoachingNoteRead, deleteCoachingNote } = useCoachingNotes({ waitForToken, orgId: activeOrgId });'));
    assert.ok(between(app, 'const appContextValue = {', '\n    };').includes('coachingNotes, coachingNotesError, addCoachingNote, markCoachingNoteRead, deleteCoachingNote,'), 'handed to the screens');
    const said = "Coaching notes couldn't be loaded ({coachingNotesError}). Reload the page to try again.";
    const home = code(read('src/Tabs/HomeTab.jsx'));
    assert.ok(home.includes('coachingNotes, coachingNotesError, markCoachingNoteRead, currentUserId, setPressNotices,'));
    assert.ok(home.includes('<button onClick={() => markNoteRead(n)}') && !home.includes('onClick={() => markCoachingNoteRead(n.id)}'), 'REGRESSION: Mark read ignores its answer');
    order(home, '{coachingNotesError && (', 'Notes from your manager', said, '{!coachingNotesError && myCoachingNotes.length > 0 && (');
    const sm = code(read('src/Tabs/SalesManagerTab.jsx'));
    order(sm, '{coachingNotesError && (', 'Recent coaching', said, '{!coachingNotesError && recentNotes.length > 0 && (');
    const banner = between(sm, "{saveState.status === 'error' && (\n                <div role=\"alert\"", '{coachingNotesError && (');
    order(banner, '{saveState.msg}', "<button onClick={() => setSaveState({ status:'idle', msg:'' })}", '×</button>');
    assert.ok(sm.includes('if (!r.ok) setSaveState({ status: \'error\', msg: `Not deleted — ${r.error}` });'), 'the delete\'s refusal on that banner');
});

// 7c: Quick Log's calendar box and the adds nothing reached are gone (Q16).
const strip = (s) => code(s).replace(/\/\*[\s\S]*?\*\//g, '');
const srcFiles = () => {
    const out = [];
    const walk = (rel) => {
        for (const name of readdirSync(new URL(rel, ROOT))) {
            const p = `${rel}${name}`;
            if (statSync(new URL(p, ROOT)).isDirectory()) walk(`${p}/`);
            else if (/\.(js|jsx)$/.test(name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};
// A function that names calendar-add-event and has a catch that only logs (console.warn / console.error alone): an
// event that was not added, said to the console only. { line } per such catch.
const silentCalendarCatches = (src) => {
    const program = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }).program;
    const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);
    const kids = (n) => Object.keys(n).filter((k) => !['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(k))
        .flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((c) => c && typeof c.type === 'string');
    const names = (n) => { let hit = false; const look = (x) => { if (hit) return; if ((x.type === 'StringLiteral' && x.value.includes('calendar-add-event')) || (x.type === 'TemplateElement' && x.value.raw.includes('calendar-add-event'))) { hit = true; return; } kids(x).forEach(look); }; look(n); return hit; };
    const logsOnly = (block) => block.body.length > 0 && block.body.every((st) => st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression'
        && st.expression.callee.type === 'MemberExpression' && st.expression.callee.object.name === 'console' && ['warn', 'error', 'log'].includes(st.expression.callee.property.name));
    const out = [];
    const walk = (n, fn) => {
        const here = FN.has(n.type) ? n : fn;
        if (n.type === 'CatchClause' && here && names(here) && logsOnly(n.body)) out.push({ line: n.loc.start.line });
        kids(n).forEach((k) => walk(k, here));
    };
    walk(program, null);
    return out;
};

test('Part 7c: no src file reads addToCalendar; Quick Log draws no calendar box; the task button, its state and the save-time adds are gone', () => {
    const readers = srcFiles().filter((f) => strip(read(f)).includes('addToCalendar'));
    assert.deepEqual(readers, [], 'REGRESSION: a calendar flag no submit sends — a box that promises an event and makes none');
    const fab = strip(read('src/components/layout/QuickLogFab.jsx'));
    assert.ok(!fab.includes('Add to Google Calendar') && !fab.includes('quickLogCal'), 'REGRESSION: the box is back');
    for (const f of ['src/App.jsx', 'src/hooks/useTasks.js', 'src/hooks/useActivities.js']) {
        const s = strip(read(f));
        for (const name of ['handleAddTaskToCalendar', 'calendarAddingTaskId', 'calendarAddFeedback', 'fireCalendarEvent', 'fireActivityCalendarEvent'])
            assert.ok(!s.includes(name), `${f}: ${name} is gone`);
    }
    assert.ok(read('src/hooks/useUIState.js').includes("useOrgBoundState(resets, { type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '' });"));
});

test('Part 7c: no caller of calendar-add-event has a catch that only logs — scanned over src/ — and the scan catches one', () => {
    const found = srcFiles().flatMap((f) => silentCalendarCatches(read(f)).map((x) => `${f}:${x.line}`));
    assert.deepEqual(found, [], 'a calendar event not added, said to the console only — say it, or name the place');
    // Self-test: the shape that was in useTasks.js and useActivities.js, and the shapes that pass.
    const was = "async function fire(t) { try { const res = await dbFetch('/.netlify/functions/calendar-add-event', { method: 'POST' }); } catch (err) { console.warn('Calendar event creation failed (non-blocking):', err); } }";
    assert.equal(silentCalendarCatches(was).length, 1, 'the console-only catch');
    assert.equal(silentCalendarCatches("const f = async () => { try { await dbFetch(`/.netlify/functions/calendar-add-event`); } catch { console.error('x'); } };").length, 1, 'a template literal, an arrow');
    assert.equal(silentCalendarCatches("async function f() { try { await dbFetch('/.netlify/functions/calendar-add-event'); } catch (e) { setErr(failureWords(e)); } }").length, 0, 'said');
    assert.equal(silentCalendarCatches("async function f() { try { await dbFetch('/.netlify/functions/other'); } catch (e) { console.warn(e); } }").length, 0, 'another request');
});

// ── Part 8 ──────────────────────────────────────────────────────────────────────────────────────────────────────

// The raw words in the swept files (§0.247; docs/design/refusal-sweep Part 8 — Jeff, 12 Nov: "lets proceed in that
// order", Parts 8-9; Q13 the role's sentence). Every catch in them says failureWords(e) — THE GUARD is refusals-said's
// scan (iv); the RUN cases here are the sites where more than the words changed. The Settings view remounts on an org
// switch (App.jsx's keyed Fragment), so a set after one is a no-op: only what leaves the page — a file saved — asks the
// org (the ad-hoc export here; Run backup in refusals-said 5b).
const P8_REFUSALS = () => [
    [answerOf(403, { error: 'Admin only' }), 'Admin only'],
    [answerOf(500, { error: 'Database error', requestId: 'r7' }), 'Database error (ref r7)'],
    [answerOf(404, {}), 'The server returned 404.'],
    [PAGE_502(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];

// 8a Automations' Pause / Resume and Delete, extracted from AutomationsDetail.jsx and run over stubs: a refusal put the
// list right by reloading it — a reload that failed said its own words over the refusal's and left the flipped or
// removed row standing. It puts back only its own row, by id, and says why, kept until its Close.
const AUTOMATIONS = 'src/Tabs/settings/integrations/AutomationsDetail.jsx';
const RULE_A = Object.freeze({ id: 'aut_1', name: 'Stage alert', active: true });
const RULE_B = Object.freeze({ id: 'aut_2', name: 'Won deal to Slack', active: true });
const RULE_C = Object.freeze({ id: 'aut_3', name: 'Lost follow-up', active: false });
// Moved (§0.247 review fix): the handlers also draw the busy ids (setBusyIds) and name the rule the banner speaks of
// (errorRule) — `bannerRule` is the rule id a standing banner is about; `drawn` every busy list drawn.
const automationPress = async ({ press, rule, list = [RULE_A, RULE_B, RULE_C], answer, meanwhile, banner = null, bannerRule = null, busy = [] }) => {
    const src = code(read(AUTOMATIONS));
    const end = '\n    };';
    const fns = between(src, '    const handleToggle = async (rule) => {', end) + end + '\n'
        + between(src, '    const handleDelete = async (rule) => {', end) + end;
    const rows = stateOf(list), error = stateOf(banner);
    const busyRules = { current: new Set(busy) };
    const errorRule = { current: bannerRule };
    const did = { sent: [], said: [], loads: 0, menu: [], drawn: [] };
    const h = new Function('automationList', 'setAutomationList', 'setActiveMenu', 'dbFetch', 'readRefusal', 'failureWords', 'setError', 'load', 'busyRules',
        'setBusyIds', 'errorRule', `${fns}\nreturn { handleToggle, handleDelete };`)(
        list, rows.set, (v) => did.menu.push(v),
        async (url, opts) => {
            did.sent.push([url, opts.method, opts.body ? JSON.parse(opts.body) : undefined]);
            if (meanwhile) meanwhile(rows.set);
            if (answer instanceof Error) throw answer;
            return answer;
        },
        readRefusal, failureWords,
        (v) => { error.set(v); if (typeof v !== 'function' && v !== null) did.said.push(v); },
        () => { did.loads++; }, busyRules, (v) => did.drawn.push(v), errorRule);
    await h[press](rule);
    return { ...did, list: rows.value, banner: error.value, busy: [...busyRules.current], bannerRule: errorRule.current };
};

test('Part 8a: a refused or unsent Pause / Resume puts its row back and says why — never reloads, never "Failed to fetch" — RUN', async () => {
    for (const [answer, why] of P8_REFUSALS()) {
        const r = await automationPress({ press: 'handleToggle', rule: RULE_A, answer });
        assert.deepEqual(r.sent, [['/.netlify/functions/automations', 'PUT', { id: 'aut_1', active: false }]]);
        assert.deepEqual(r.list, [RULE_A, RULE_B, RULE_C], `REGRESSION: a refused Pause left the rule shown as paused (${why})`);
        // Moved pin (§0.247 review fix): the row as it is now with its flag put back — no longer the press's copy itself.
        assert.deepEqual(r.list[0], RULE_A, 'the row as it was');
        assert.deepEqual(r.said, [`"Stage alert" was not paused — ${why}`], `REGRESSION: the refusal's words not said, or raw (${why})`);
        assert.equal(r.loads, 0, 'REGRESSION: a reload — one that fails says its own words over the refusal\'s');
        assert.deepEqual(r.busy, [], 'the rule let go');
    }
    const resumed = await automationPress({ press: 'handleToggle', rule: RULE_C, answer: UNSENT() });
    assert.deepEqual(resumed.said, ['"Lost follow-up" was not resumed — The server could not be reached.'], 'a paused rule: "resumed", as its menu says');
    assert.deepEqual(resumed.list[2], RULE_C);
});

test('Part 8a: a Pause\'s put-back is its own row alone — another rule changed meanwhile stands — RUN', async () => {
    const B2 = { ...RULE_B, active: false };
    const r = await automationPress({ press: 'handleToggle', rule: RULE_A, answer: answerOf(403, { error: 'Admin only' }),
        meanwhile: (set) => set((prev) => prev.map((x) => (x.id === 'aut_2' ? B2 : x))) });
    assert.deepEqual(r.list, [RULE_A, B2, RULE_C], 'REGRESSION: the whole list as at the press put back — a change meanwhile undone');
    assert.equal(r.list[1], B2);
});

test('Part 8a: a landed Pause shows the rule as stored and clears only its own words; an answer without the rule leaves it flipped — RUN', async () => {
    const STORED = { ...RULE_A, active: false, updatedAt: 'now' };
    const landed = await automationPress({ press: 'handleToggle', rule: RULE_A, answer: answerOf(200, { automation: STORED }),
        banner: '"Stage alert" was not paused — The server could not be reached.', bannerRule: 'aut_1' });
    assert.deepEqual([landed.list[0], landed.banner, landed.said, landed.loads, landed.bannerRule], [STORED, null, [], 0, null],
        'REGRESSION: the banner still says "not paused" beside a rule that paused');
    const other = await automationPress({ press: 'handleToggle', rule: RULE_A, answer: answerOf(200, { automation: STORED }),
        banner: '"Won deal to Slack" was not deleted — Admin only', bannerRule: 'aut_2' });
    assert.equal(other.banner, '"Won deal to Slack" was not deleted — Admin only', 'another rule\'s words stand until closed');
    const bare = await automationPress({ press: 'handleToggle', rule: RULE_A, answer: answerOf(200, {}) });
    assert.deepEqual(bare.list[0], { ...RULE_A, active: false }, 'never undefined in the list');
});

test('Part 8a: a refused or unsent Delete puts its row back where it stood and says why — never reloads — RUN', async () => {
    for (const [answer, why] of P8_REFUSALS()) {
        const r = await automationPress({ press: 'handleDelete', rule: RULE_B, answer });
        assert.deepEqual(r.sent, [['/.netlify/functions/automations?id=aut_2', 'DELETE', undefined]]);
        assert.deepEqual(r.list, [RULE_A, RULE_B, RULE_C], `REGRESSION: a refused Delete left the rule gone (${why})`);
        assert.equal(r.list[1], RULE_B);
        assert.deepEqual(r.said, [`"Won deal to Slack" was not deleted — ${why}`]);
        assert.equal(r.loads, 0, 'REGRESSION: a reload');
        assert.deepEqual(r.busy, []);
    }
    // A list read again with the row in it is not doubled; a rule added meanwhile stands.
    const reread = await automationPress({ press: 'handleDelete', rule: RULE_B, answer: UNSENT(), meanwhile: (set) => set(() => [RULE_A, RULE_B, RULE_C]) });
    assert.deepEqual(reread.list, [RULE_A, RULE_B, RULE_C], 'REGRESSION: the row put back twice');
    const NEW = { id: 'aut_9', name: 'New', active: true };
    const added = await automationPress({ press: 'handleDelete', rule: RULE_B, answer: UNSENT(), meanwhile: (set) => set((prev) => [NEW, ...prev]) });
    assert.deepEqual(added.list.map((x) => x.id), ['aut_9', 'aut_2', 'aut_1', 'aut_3'], 'back at its index; the new rule stands');
    const landed = await automationPress({ press: 'handleDelete', rule: RULE_B, answer: answerOf(200, { ok: true }), banner: '"Won deal to Slack" was not deleted — Admin only', bannerRule: 'aut_2' });
    assert.deepEqual([landed.list, landed.banner, landed.said], [[RULE_A, RULE_C], null, []], 'landed: gone, its words cleared');
});

test('Part 8a: one request per rule at a time — a press while one is out sends nothing and changes nothing — RUN', async () => {
    for (const press of ['handleToggle', 'handleDelete']) {
        const r = await automationPress({ press, rule: RULE_A, answer: answerOf(200, { automation: { ...RULE_A, active: false } }), busy: ['aut_1'] });
        assert.deepEqual([r.sent, r.said, r.list], [[], [], [RULE_A, RULE_B, RULE_C]], `REGRESSION (${press}): a second press while the first is out — its put-back undoes the other`);
        assert.deepEqual(r.busy, ['aut_1'], 'the first press still holds it');
        const other = await automationPress({ press, rule: RULE_B, answer: UNSENT(), busy: ['aut_1'] });
        assert.equal(other.sent.length, 1, 'another rule is its own');
        assert.deepEqual(other.busy, ['aut_1']);
    }
});

// Review fixes (§0.247's five-lens review, 12 Nov): the put-back is the flag alone on the row as it is now (1a), a
// landed answer without the rule keeps the row as it is now (1b), a landed 200 whose body is not JSON is landed (1c),
// every press closes the menu and the busy rule is drawn (8), and a landed retry clears only a banner about THAT rule,
// by id (9).
const EDITED_A = Object.freeze({ ...RULE_A, name: 'Stage alert (renamed)', actions: [{ type: 'send_slack', params: { message: 'x' } }] });
const editMeanwhile = (set) => set((prev) => prev.map((x) => (x.id === 'aut_1' ? { ...EDITED_A, active: x.active } : x)));

test('Part 8a review fix: a refused Pause puts back only the flag — an Edit saved while it was out stands — RUN', async () => {
    for (const [answer, why] of P8_REFUSALS()) {
        const r = await automationPress({ press: 'handleToggle', rule: RULE_A, answer, meanwhile: editMeanwhile });
        assert.deepEqual(r.list[0], EDITED_A, `REGRESSION: the press's copy put back over an Edit saved meanwhile (${why})`);
        assert.deepEqual(r.said, [`"Stage alert" was not paused — ${why}`]);
    }
    const resumed = await automationPress({ press: 'handleToggle', rule: RULE_C, answer: UNSENT(),
        meanwhile: (set) => set((prev) => prev.map((x) => (x.id === 'aut_3' ? { ...x, name: 'Lost follow-up v2' } : x))) });
    assert.deepEqual(resumed.list[2], { ...RULE_C, name: 'Lost follow-up v2' }, 'paused again, the new name kept');
});

test('Part 8a review fix: a landed Pause whose answer names no rule keeps the row as it is now, flipped — RUN', async () => {
    for (const answer of [answerOf(200, {}), answerOf(200, { automation: null })]) {
        const r = await automationPress({ press: 'handleToggle', rule: RULE_A, answer, meanwhile: editMeanwhile });
        assert.deepEqual(r.list[0], { ...EDITED_A, active: false }, 'REGRESSION: the press\'s copy written over an Edit saved meanwhile');
        assert.deepEqual(r.said, []);
    }
});

test('Part 8a review fix: a landed 200 whose body is not JSON is landed — the flag kept, nothing said, the banner as it was — RUN', async () => {
    const r = await automationPress({ press: 'handleToggle', rule: RULE_A, answer: answerOf(200, new SyntaxError("Unexpected token '<'")),
        banner: '"Won deal to Slack" was not deleted — Admin only', bannerRule: 'aut_2' });
    assert.deepEqual(r.list, [{ ...RULE_A, active: false }, RULE_B, RULE_C], 'REGRESSION: a landed Pause put back because its body was not JSON');
    assert.deepEqual([r.said, r.banner, r.bannerRule, r.busy], [[], '"Won deal to Slack" was not deleted — Admin only', 'aut_2', []],
        'REGRESSION: "was not paused" said for a Pause the server took');
});

test('Part 8a review fix: every Pause / Resume and Delete press closes the menu, a busy one too; the busy rule is drawn while out — RUN', async () => {
    for (const press of ['handleToggle', 'handleDelete']) {
        const busy = await automationPress({ press, rule: RULE_A, answer: UNSENT(), busy: ['aut_1'] });
        assert.deepEqual([busy.menu, busy.sent, busy.drawn], [[null], [], []], `REGRESSION (${press}): a press while out left the menu open`);
        const sent = await automationPress({ press, rule: RULE_A, answer: UNSENT() });
        assert.deepEqual(sent.menu, [null]);
        assert.deepEqual(sent.drawn, [['aut_1'], []], `${press}: drawn busy while out, let go after`);
        const twoOut = await automationPress({ press, rule: RULE_B, answer: UNSENT(), busy: ['aut_1'] });
        assert.deepEqual(twoOut.drawn, [['aut_1', 'aut_2'], ['aut_1']], `${press}: another rule's request stays drawn`);
    }
});

test('Part 8a review fix: a landed retry clears only a banner about THAT rule, by id — two rules of one name never clear each other\'s words — RUN', async () => {
    const TWIN = Object.freeze({ id: 'aut_4', name: 'Stage alert', active: true });
    const WORDS = '"Stage alert" was not paused — Admin only';
    for (const press of ['handleToggle', 'handleDelete']) {
        const landed = await automationPress({ press, rule: RULE_A, list: [RULE_A, TWIN], answer: answerOf(200, { automation: { ...RULE_A, active: false } }),
            banner: WORDS, bannerRule: 'aut_4' });
        assert.deepEqual([landed.banner, landed.bannerRule], [WORDS, 'aut_4'], `REGRESSION (${press}): another rule's banner cleared because it shares the name`);
        const own = await automationPress({ press, rule: TWIN, list: [RULE_A, TWIN], answer: answerOf(200, { automation: { ...TWIN, active: false } }),
            banner: WORDS, bannerRule: 'aut_4' });
        assert.deepEqual([own.banner, own.bannerRule], [null, null], `${press}: its own banner cleared`);
        const refused = await automationPress({ press, rule: TWIN, list: [RULE_A, TWIN], answer: UNSENT(), bannerRule: 'aut_1' });
        assert.equal(refused.bannerRule, 'aut_4', `${press}: a refusal names its rule`);
    }
    // A load's words and the banner's Close speak of no rule.
    const s = code(read(AUTOMATIONS));
    assert.ok(s.includes('} catch(e) { errorRule.current = null; setError(failureWords(e)); setLoadFailed(true); }'));
    order(between(s, '            {error && (', '\n            )}'), '<span style={{ flex:1, minWidth:0 }}>{error}</span>',
        '<button onClick={() => { errorRule.current = null; setError(null); }}', 'Close');
    assert.ok(!/startsWith\(`"\$\{rule\.name\}" was not `\)/.test(s), 'REGRESSION: the banner compared by name');
});

test('Part 8a review fix: WIRING — the toggle and the menu\'s Pause / Resume and Delete drawn busy, titled "Saving…", while out', () => {
    const s = code(read(AUTOMATIONS));
    order(s, 'const busyRules = React.useRef(new Set());', 'const [busyIds, setBusyIds] = React.useState([]);',
        'const isBusy = busyIds.includes(rule.id);', "<div onClick={() => handleToggle(rule)} aria-disabled={isBusy} title={isBusy ? 'Saving…' : undefined}",
        "cursor:isBusy?'not-allowed':'pointer'", "fn:() => handleToggle(rule), busy:isBusy }", "fn:() => handleDelete(rule), danger:true, busy:isBusy }",
        "<div key={idx} onClick={item.fn} aria-disabled={!!item.busy} title={item.busy ? 'Saving…' : undefined}");
    for (const fn of ['    const handleToggle = async (rule) => {', '    const handleDelete = async (rule) => {']) {
        order(between(s, fn, '\n    };'), 'setActiveMenu(null);', 'if (busyRules.current.has(rule.id)) return;', 'busyRules.current.add(rule.id);',
            'setBusyIds([...busyRules.current]);', '} finally { busyRules.current.delete(rule.id); setBusyIds([...busyRules.current]); }');
    }
});

// Export's Pause / Enable (review fix 1c): a landed 200 whose body is not JSON was put back and said "was not paused".
test('Part 8 review fix: Export — a landed Pause whose body is not JSON keeps the change and says nothing — RUN', async () => {
    const fn = between(code(read('src/Tabs/settings/data/ExportDetail.jsx')), '    const handleToggle = async (sched) => {', '\n    };') + '\n    };';
    const run = async (answer) => {
        const rows = stateOf([{ id: 'sch_1', name: 'Weekly accounts', enabled: true }]), banner = stateOf('');
        const said = [];
        // Moved (§0.247 review fix): the toggle also holds its schedule (busyScheds, setBusyIds) and names its banner's
        // schedule (errorSched).
        const toggle = new Function('setSchedules', 'dbFetch', 'readRefusal', 'failureWords', 'setActionError', 'busyScheds', 'setBusyIds', 'errorSched',
            `${fn}\nreturn handleToggle;`)(
            rows.set, async () => { if (answer instanceof Error) throw answer; return answer; }, readRefusal, failureWords,
            (v) => { banner.set(v); if (typeof v !== 'function') said.push(v); }, { current: new Set() }, () => {}, { current: null });
        await toggle(rows.value[0]);
        return { rows: rows.value, said };
    };
    const page = await run(answerOf(200, new SyntaxError("Unexpected token '<'")));
    assert.deepEqual([page.rows, page.said], [[{ id: 'sch_1', name: 'Weekly accounts', enabled: false }], []],
        'REGRESSION: a Pause the server took put back and said "was not paused"');
    const stored = await run(answerOf(200, { schedule: { id: 'sch_1', name: 'Weekly accounts', enabled: false, status: 'ok' } }));
    assert.deepEqual(stored.rows, [{ id: 'sch_1', name: 'Weekly accounts', enabled: false, status: 'ok' }], 'the schedule as stored');
    const refused = await run(answerOf(403, { error: 'Admin only' }));
    assert.deepEqual([refused.rows[0].enabled, refused.said], [true, ['"Weekly accounts" was not paused — Admin only']]);
});

// Export's Pause / Enable, the class Automations' review fix 1 closed (§0.247 review fix): it PUT the whole screen copy
// — export-schedules.mjs merges what a save names over the stored row (§0.242), so an Edit saved while the toggle was
// out was written back over; a refusal put back the press's copy; a landed press cleared another schedule's banner by a
// shared name; and nothing held a second press. `bannerSched` is the schedule id a standing banner is about.
const EXP_A = Object.freeze({ id: 'sch_1', name: 'Weekly accounts', enabled: true, scope: 'accounts', cadence: 'Daily · 02:00 UTC' });
const EXP_B = Object.freeze({ id: 'sch_2', name: 'Nightly deals', enabled: false, scope: 'opportunities', cadence: 'On request' });
const EXP_EDITED = Object.freeze({ ...EXP_A, name: 'Weekly accounts (renamed)', scope: 'contacts', cadence: 'On request' });
const exportEditMeanwhile = (set) => set((prev) => prev.map((s) => (s.id === 'sch_1' ? { ...EXP_EDITED, enabled: s.enabled } : s)));
const exportToggle = async ({ sched = EXP_A, list = [EXP_A, EXP_B], answer, meanwhile, banner = '', bannerSched = null, busy = [] }) => {
    const fn = between(code(read(EXPORT)), '    const handleToggle = async (sched) => {', '\n    };') + '\n    };';
    const rows = stateOf(list), error = stateOf(banner);
    const busyScheds = { current: new Set(busy) }, errorSched = { current: bannerSched };
    const did = { sent: [], said: [], drawn: [] };
    const toggle = new Function('setSchedules', 'dbFetch', 'readRefusal', 'failureWords', 'setActionError', 'busyScheds', 'setBusyIds', 'errorSched',
        `${fn}\nreturn handleToggle;`)(
        rows.set,
        async (url, opts) => {
            did.sent.push([url, opts.method, JSON.parse(opts.body)]);
            if (meanwhile) meanwhile(rows.set);
            if (answer instanceof Error) throw answer;
            return answer;
        },
        readRefusal, failureWords,
        (v) => { error.set(v); if (typeof v !== 'function' && v !== '') did.said.push(v); },
        busyScheds, (v) => did.drawn.push(v), errorSched);
    await toggle(sched);
    return { ...did, list: rows.value, banner: error.value, busy: [...busyScheds.current], bannerSched: errorSched.current };
};
const EXPORT_ANSWERS = () => [...P8_REFUSALS(), [answerOf(200, { schedule: { ...EXP_A, enabled: false } }), ''], [answerOf(200, {}), ''],
    [answerOf(200, new SyntaxError("Unexpected token '<'")), '']];

test('Part 8 review fix: Export toggle — the body sent is { id, enabled } only, never the screen\'s copy — RUN', async () => {
    for (const [answer, why] of EXPORT_ANSWERS()) {
        const r = await exportToggle({ answer, meanwhile: exportEditMeanwhile });
        assert.deepEqual(r.sent, [['/.netlify/functions/export-schedules', 'PUT', { id: 'sch_1', enabled: false }]],
            `REGRESSION: the whole row sent — written back over an Edit saved while the toggle was out (${why || 'landed'})`);
    }
    const enable = await exportToggle({ sched: EXP_B, answer: answerOf(200, {}) });
    assert.deepEqual(enable.sent[0][2], { id: 'sch_2', enabled: true }, 'an Enable sends the flag it sets');
    assert.deepEqual(enable.list[1], { ...EXP_B, enabled: true });
});

test('Part 8 review fix: Export toggle — an Edit saved meanwhile survives a refusal and a landed answer with no schedule — RUN', async () => {
    for (const [answer, why] of P8_REFUSALS()) {
        const r = await exportToggle({ answer, meanwhile: exportEditMeanwhile });
        assert.deepEqual(r.list, [EXP_EDITED, EXP_B], `REGRESSION: the press's copy put back over an Edit saved meanwhile (${why})`);
        assert.deepEqual(r.said, [`"Weekly accounts" was not paused — ${why}`], 'the words as they were');
        assert.deepEqual([r.busy, r.bannerSched], [[], 'sch_1'], 'let go; the banner names its schedule');
    }
    for (const answer of [answerOf(200, {}), answerOf(200, { schedule: null }), answerOf(200, new SyntaxError("Unexpected token '<'"))]) {
        const r = await exportToggle({ answer, meanwhile: exportEditMeanwhile });
        assert.deepEqual(r.list, [{ ...EXP_EDITED, enabled: false }, EXP_B], 'REGRESSION: the press\'s copy written over an Edit saved meanwhile');
        assert.deepEqual(r.said, []);
    }
    const STORED = { ...EXP_EDITED, enabled: false, status: 'ok' };
    const stored = await exportToggle({ answer: answerOf(200, { schedule: STORED }), meanwhile: exportEditMeanwhile });
    assert.equal(stored.list[0], STORED, 'the schedule as stored');
    // The optimistic flip stands while out: the row reads paused before the answer.
    const seen = [];
    await exportToggle({ answer: UNSENT(), meanwhile: (set) => set((prev) => { seen.push(prev[0].enabled); return prev; }) });
    assert.deepEqual(seen, [false], 'flipped at the press');
});

test('Part 8 review fix: Export — a landed press clears only a banner about THAT schedule, by id; another schedule\'s stands — RUN', async () => {
    const TWIN = Object.freeze({ id: 'sch_4', name: 'Weekly accounts', enabled: true });
    const WORDS = '"Weekly accounts" was not paused — Admin only';
    const twin = await exportToggle({ list: [EXP_A, TWIN], answer: answerOf(200, {}), banner: WORDS, bannerSched: 'sch_4' });
    assert.deepEqual([twin.banner, twin.bannerSched], [WORDS, 'sch_4'], 'REGRESSION: another schedule\'s banner cleared because it shares the name');
    const own = await exportToggle({ list: [EXP_A, TWIN], answer: answerOf(200, {}), banner: WORDS, bannerSched: 'sch_1' });
    assert.deepEqual([own.banner, own.bannerSched], ['', null], 'its own banner cleared');
    const dsr = await exportToggle({ answer: answerOf(200, {}), banner: 'Request dsr_9 was not marked complete — Admin only' });
    assert.equal(dsr.banner, 'Request dsr_9 was not marked complete — Admin only', 'a request\'s words stand until closed');
    const otherDelete = await deleteSched({ list: [SCH_A, SCH_B, { ...SCH_C, name: 'Nightly deals' }], answer: LANDED,
        banner: '"Nightly deals" was not deleted — Admin only', bannerSched: 'sch_3' });
    assert.deepEqual([otherDelete.banner, otherDelete.bannerSched], ['"Nightly deals" was not deleted — Admin only', 'sch_3'],
        'REGRESSION: a landed Delete cleared another schedule\'s banner of the same name');
    const refusedDelete = await deleteSched({ answer: (await writeRefusals())[0][0], bannerSched: 'sch_1' });
    assert.equal(refusedDelete.bannerSched, 'sch_2', 'a refused Delete names its schedule');
    // A request's words speak of no schedule: a Mark complete refused after a schedule's refusal lets the schedule go, so
    // that schedule's landed retry leaves the request's words standing.
    const dsrFn = between(code(read(EXPORT)), '    const handleDsrStatus = async (dsr, newStatus) => {', '\n    };') + '\n    };';
    const held = { current: 'sch_1' }, words = stateOf('"Weekly accounts" was not paused — Admin only');
    const markComplete = new Function('setDsrItems', 'dbFetch', 'readRefusal', 'failureWords', 'setActionError', 'errorSched', `${dsrFn}\nreturn handleDsrStatus;`)(
        () => {}, async () => answerOf(403, { error: 'Admin only' }), readRefusal, failureWords, words.set, held);
    await markComplete({ id: 'dsr_1', status: 'open' }, 'completed');
    assert.deepEqual([words.value, held.current], ['Request dsr_1 was not marked complete — Admin only', null],
        'REGRESSION: a request\'s words still name the schedule — its landed retry clears them');
    const after = await exportToggle({ answer: answerOf(200, {}), banner: words.value, bannerSched: held.current });
    assert.equal(after.banner, 'Request dsr_1 was not marked complete — Admin only');
});

test('Part 8 review fix: Export — one request per schedule: a second Pause / Enable or Delete while one is out sends nothing — RUN', async () => {
    const r = await exportToggle({ answer: answerOf(200, {}), busy: ['sch_1'] });
    assert.deepEqual([r.sent, r.said, r.list, r.drawn, r.busy], [[], [], [EXP_A, EXP_B], [], ['sch_1']],
        'REGRESSION: a second press while the first is out — its put-back undoes the other');
    const d = await deleteSched({ answer: LANDED, busy: ['sch_2'] });
    assert.deepEqual([d.sent, d.said, d.list, d.drawn, d.busy], [[], [], [SCH_A, SCH_B, SCH_C], [], ['sch_2']],
        'REGRESSION: a Delete while the schedule\'s request is out');
    const other = await exportToggle({ sched: EXP_B, answer: UNSENT(), busy: ['sch_1'] });
    assert.equal(other.sent.length, 1, 'another schedule is its own');
    assert.deepEqual([other.drawn, other.busy], [[['sch_1', 'sch_2'], ['sch_1']], ['sch_1']]);
    for (const answer of [answerOf(200, {}), UNSENT()]) {
        const t = await exportToggle({ answer });
        assert.deepEqual([t.drawn, t.busy], [[['sch_1'], []], []], 'drawn busy while out, let go after');
    }
    for (const answer of [LANDED, (await writeRefusals())[3][0]]) {
        const t = await deleteSched({ answer });
        assert.deepEqual([t.drawn, t.busy], [[['sch_2'], []], []], 'the Delete drawn busy while out, let go after');
    }
});

test('Part 8 review fix: Export — WIRING: Pause / Enable and Delete drawn busy, titled "Saving…"; the Close and a request\'s words name no schedule', () => {
    const ex = code(read(EXPORT));
    order(ex, 'const errorSched = React.useRef(null);', 'const busyScheds = React.useRef(new Set());', 'const [busyIds, setBusyIds] = React.useState([]);',
        'const isBusy = busyIds.includes(s.id);',
        "<span onClick={() => handleToggle(s)} style={{ fontSize:11, color:T.info, cursor:isBusy?'not-allowed':'pointer', opacity:isBusy?0.5:1, fontWeight:600 }} aria-disabled={isBusy} title={isBusy ? 'Saving…' : undefined}>",
        "<span onClick={() => handleDeleteSched(s)} style={{ fontSize:11, color:T.danger, cursor:isBusy?'not-allowed':'pointer', opacity:isBusy?0.5:1, fontWeight:600 }} aria-disabled={isBusy} title={isBusy ? 'Saving…' : undefined}>");
    assert.ok(!/startsWith\(`"\$\{sched\.name\}" was not `\)/.test(ex), 'REGRESSION: the banner compared by name');
    order(between(ex, '{actionError && (', '\n            )}'), "<button onClick={() => { errorSched.current = null; setActionError(''); }}", 'Close');
    order(between(ex, '    const handleDsrStatus = async (dsr, newStatus) => {', '\n    };'), '} catch (e) {', 'errorSched.current = null;', 'setActionError(`Request ${dsr.id} was not ');
});

// Webhooks' Pause / Resume and Delete (§0.247 review fix): the PUT answers { success } with no subscription
// (webhooks.mjs), so a landed toggle set its row to undefined and the next draw threw; a second Delete said "Webhook not
// found." beside an endpoint the first had deleted; and the menu closed when an answer landed, never at the press.
const WEBHOOKS = 'src/Tabs/settings/integrations/WebhooksDetail.jsx';
const WH_A = Object.freeze({ id: 'wh_1', name: 'Pipeline to Zapier', targetUrl: 'https://hooks.example.test/a', active: true });
const WH_B = Object.freeze({ id: 'wh_2', name: 'Won deals', targetUrl: 'https://hooks.example.test/b', active: false });
const webhookPress = async ({ press, wh = WH_A, list = [WH_A, WH_B], answer, meanwhile, busy = [] }) => {
    const src = code(read(WEBHOOKS));
    const end = '\n    };';
    const fns = between(src, '    const handleToggle = async (wh) => {', end) + end + '\n' + between(src, '    const handleDelete = async (wh) => {', end) + end;
    const rows = stateOf(list);
    const busyHooks = { current: new Set(busy) };
    const did = { sent: [], said: [], menu: [], drawn: [], deleting: [] };
    const h = new Function('setWebhooks', 'setActiveMenu', 'dbFetch', 'readRefusal', 'failureWords', 'setError', 'busyHooks', 'setBusyIds', 'setDeleting',
        `${fns}\nreturn { handleToggle, handleDelete };`)(
        rows.set, (v) => did.menu.push(v),
        async (url, opts) => {
            did.sent.push([url, opts.method, opts.body ? JSON.parse(opts.body) : undefined]);
            if (meanwhile) meanwhile(rows.set);
            if (answer instanceof Error) throw answer;
            return answer;
        },
        readRefusal, failureWords, (v) => did.said.push(v), busyHooks, (v) => did.drawn.push(v), (v) => did.deleting.push(v));
    await h[press](wh);
    return { ...did, list: rows.value, busy: [...busyHooks.current] };
};

test('Part 8 review fix: Webhooks — a landed Pause / Resume keeps its row, flipped: the PUT answers no subscription — RUN', async () => {
    // The server's own answer (webhooks.mjs PUT): { success: true }, no row.
    const fnSrc = read('netlify/functions/webhooks.mjs');
    assert.ok(!/subscription:/.test(between(fnSrc, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {")), 'the PUT answers no row');
    for (const answer of [answerOf(200, { success: true }), answerOf(200, new SyntaxError("Unexpected token '<'"))]) {
        const r = await webhookPress({ press: 'handleToggle', answer });
        assert.deepEqual(r.sent, [['/.netlify/functions/webhooks', 'PUT', { id: 'wh_1', active: false }]]);
        assert.deepEqual(r.list, [{ ...WH_A, active: false }, WH_B], 'REGRESSION: the row set to undefined — the next draw threw');
        assert.deepEqual([r.said, r.busy], [[], []], 'landed: nothing said');
    }
    const resumed = await webhookPress({ press: 'handleToggle', wh: WH_B, answer: answerOf(200, { success: true }),
        meanwhile: (set) => set((prev) => prev.map((w) => (w.id === 'wh_2' ? { ...w, name: 'Won deals v2' } : w))) });
    assert.deepEqual(resumed.list[1], { ...WH_B, name: 'Won deals v2', active: true }, 'the row as it is now, flipped');
    // Moved pin (§0.247, Jeff 12 Nov: "Fix in this batch (Recommended)"): the PUT never answers a row, so its body is not
    // read — a `subscription` (the key the screen looked for, never the server's) changes nothing: the row as it is, flipped.
    const STORED = { ...WH_A, active: false, updatedAt: 'now' };
    const stored = await webhookPress({ press: 'handleToggle', answer: answerOf(200, { subscription: STORED }) });
    assert.deepEqual(stored.list, [{ ...WH_A, active: false }, WH_B], 'REGRESSION: a key the server never sends read as the row');
    assert.equal(count(between(code(read(WEBHOOKS)), '    const handleToggle = async (wh) => {', '\n    };'), '.json('), 0, 'the PUT\'s body is not read');
    for (const [answer, why] of P8_REFUSALS()) {
        const r = await webhookPress({ press: 'handleToggle', answer });
        assert.deepEqual([r.list, r.said, r.busy], [[WH_A, WH_B], [why], []], `a refusal changes nothing and says why (${why})`);
    }
});

test('Part 8 review fix: Webhooks — one request per endpoint: a second Pause / Resume or Delete while one is out sends nothing; the menu closes at the press — RUN', async () => {
    for (const press of ['handleToggle', 'handleDelete']) {
        const r = await webhookPress({ press, answer: answerOf(200, { success: true }), busy: ['wh_1'] });
        assert.deepEqual([r.sent, r.said, r.list, r.drawn, r.busy], [[], [], [WH_A, WH_B], [], ['wh_1']],
            `REGRESSION (${press}): a second press while the first is out — a second Delete says "Webhook not found."`);
        assert.deepEqual(r.menu, [null], `${press}: the menu closed at the press, a busy one too`);
        const sent = await webhookPress({ press, answer: UNSENT() });
        assert.deepEqual([sent.sent.length, sent.drawn, sent.busy, sent.menu], [1, [['wh_1'], []], [], [null]], `${press}: drawn busy while out, let go after`);
        const other = await webhookPress({ press, wh: WH_B, answer: UNSENT(), busy: ['wh_1'] });
        assert.deepEqual([other.sent.length, other.drawn, other.busy], [1, [['wh_1', 'wh_2'], ['wh_1']], ['wh_1']], `${press}: another endpoint is its own`);
    }
    const deleted = await webhookPress({ press: 'handleDelete', answer: answerOf(200, { success: true }) });
    assert.deepEqual([deleted.list, deleted.sent], [[WH_B], [['/.netlify/functions/webhooks?id=wh_1', 'DELETE', undefined]]]);
    // The menu is closed at the press, before the request — never by an answer landing after another row's menu opened.
    const src = code(read(WEBHOOKS));
    for (const fn of ['    const handleToggle = async (wh) => {', '    const handleDelete = async (wh) => {']) {
        const body = between(src, fn, '\n    };');
        order(body, 'setActiveMenu(null);', 'if (busyHooks.current.has(wh.id)) return;', 'busyHooks.current.add(wh.id);', 'setBusyIds([...busyHooks.current]);',
            'await dbFetch(', 'finally { busyHooks.current.delete(wh.id); setBusyIds([...busyHooks.current]);');
        assert.equal(count(body, 'setActiveMenu('), 1, `${fn.trim()}: the menu closed once, at the press`);
    }
});

test('Part 8 review fix: Webhooks — WIRING: the toggle drawn busy, titled "Saving…", while out', () => {
    const s = code(read(WEBHOOKS));
    order(s, 'const busyHooks = React.useRef(new Set());', 'const [busyIds, setBusyIds] = React.useState([]);', 'const isBusy = busyIds.includes(wh.id);',
        "<div onClick={() => handleToggle(wh)} aria-disabled={isBusy} title={isBusy ? 'Saving…' : undefined}",
        "cursor:isBusy?'not-allowed':'pointer', opacity:isBusy?0.5:1,");
});

// 8b Dispatch's vehicle and equipment Delete, extracted from DispatchVehiclesDetail.jsx: a refusal said "HTTP N". A 403
// keeps the role's sentence (Q13); any other refusal says the server's words with their ref, else the status.
const VEHICLES = 'src/Tabs/settings/dispatch/DispatchVehiclesDetail.jsx';
const fleetDelete = async (kind, answer) => {
    const v = kind === 'vehicle';
    const name = v ? 'deleteVehicle' : 'deleteEquipment';
    const fn = between(code(read(VEHICLES)), `    const ${name} = async () => {`, '\n    };') + '\n    };';
    const draft = v ? { id: 'veh_1', name: 'Van 1' } : { id: 'eq 1', name: 'Tester', category: 'Testers' };
    const did = { sent: [], said: [], loads: 0, drafts: [], busy: [] };
    const del = new Function(v ? 'vDraft' : 'eDraft', v ? 'setVError' : 'setEError', v ? 'setVDraft' : 'setEDraft', 'setBusy', 'dbFetch',
        'readRefusal', 'failureWords', 'load', `${fn}\nreturn ${name};`)(
        draft, (x) => did.said.push(x), (x) => did.drafts.push(x), (x) => did.busy.push(x),
        async (url, opts) => { did.sent.push([url, opts.method]); if (answer instanceof Error) throw answer; return answer; },
        readRefusal, failureWords, async () => { did.loads++; });
    await del();
    return did;
};

test('Part 8b: a refused vehicle or equipment Delete says the server\'s words, a 403 the role\'s sentence — never "HTTP N"; the window stays open — RUN', async () => {
    for (const kind of ['vehicle', 'equipment']) {
        const role = kind === 'vehicle' ? 'Your role cannot delete vehicles.' : 'Your role cannot delete equipment.';
        for (const [answer, why] of [
            [answerOf(500, { error: 'Database error', requestId: 'r3' }), 'Database error (ref r3)'],
            [answerOf(409, { error: 'Still assigned to a job' }), 'Still assigned to a job'],
            [PAGE_502(), 'The server returned 502.'],
            [answerOf(403, { error: 'Dispatch is turned off for this workspace.' }), role],
            [UNSENT(), 'The server could not be reached.'],
        ]) {
            const r = await fleetDelete(kind, answer);
            assert.deepEqual(r.said, ['', why], `REGRESSION (${kind}): "HTTP N", or a raw "Failed to fetch" (${why})`);
            assert.deepEqual([r.loads, r.drafts, r.busy], [0, [], [true, false]], `${kind}: nothing reloaded, the window left open`);
        }
        const landed = await fleetDelete(kind, answerOf(200, { ok: true }));
        assert.deepEqual([landed.said, landed.loads, landed.drafts], [[''], 1, [null]], `${kind}: landed — read again, the window closed`);
        assert.deepEqual(landed.sent, [[kind === 'vehicle' ? '/.netlify/functions/dispatch-vehicles?id=veh_1' : '/.netlify/functions/dispatch-equipment?id=eq%201', 'DELETE']]);
    }
});

// 8c putSettings (the shared Settings sender), extracted from saveSettings.js: a refusal said 'HTTP N' when the body had
// no words and dropped the ref. It says refusalWords' — the ref kept, else "The server returned N." — and a stale 409
// still throws its keys (.stale); the 403 keeps the Admin sentence.
const putSettingsRun = async (answer, { switchOrg = false } = {}) => {
    const src = read('src/Tabs/settings/shared/saveSettings.js');
    const fn = between(src, 'export async function putSettings(payload, revs) {', '\n}\n').replace('export ', '') + '\n}';
    let org = 'org_a';
    const putSettings = new Function('requestOrg', 'stillOrg', 'stopped', 'dbFetch', 'withIfRevs', 'staleOf', 'refusalWords', 'NETWORK_ERROR', 'SETTINGS_URL',
        `${fn}\nreturn putSettings;`)(
        () => 'org_a', (o) => o === org, () => 'STOPPED',
        async () => { if (switchOrg) org = 'org_b'; if (answer instanceof Error) throw answer; return answer; },
        withIfRevs, staleOf, refusalWords, NETWORK_ERROR, '/.netlify/functions/settings');
    try { return { v: await putSettings({ teams: [] }, { teams: 'T0' }) }; } catch (e) { return { e }; }
};

test('Part 8c: putSettings says the server\'s words with their ref, else "The server returned N." — never "HTTP N"; a stale refusal is still stale — RUN', async () => {
    const ref = await putSettingsRun(answerOf(500, { error: 'Database error', requestId: 'r5' }));
    assert.equal(ref.e?.message, 'Database error (ref r5)', 'REGRESSION: the ref dropped');
    assert.equal(ref.e?.stale, undefined);
    const page = await putSettingsRun(PAGE_502());
    assert.equal(page.e?.message, 'The server returned 502.', 'REGRESSION: "HTTP 502"');
    const bare = await putSettingsRun(answerOf(400, {}));
    assert.equal(bare.e?.message, 'The server returned 400.');
    const stale = await putSettingsRun(answerOf(409, { error: STALE_ERROR, code: 'stale', stale: ['teams'] }));
    assert.equal(stale.e?.message, STALE_ERROR, 'the server\'s words');
    assert.deepEqual(stale.e?.stale, ['teams'], 'REGRESSION: a stale refusal lost the keys that moved');
    const staleRef = await putSettingsRun(answerOf(409, { error: STALE_ERROR, code: 'stale', stale: [], requestId: 'r6' }));
    assert.deepEqual([staleRef.e?.message, staleRef.e?.stale], [`${STALE_ERROR} (ref r6)`, []]);
    const pageConflict = await putSettingsRun(answerOf(409, new SyntaxError('Unexpected token')));
    assert.deepEqual([pageConflict.e?.message, pageConflict.e?.stale], ['The server returned 409.', undefined], 'a 409 with no body is no stale refusal');
    const admin = await putSettingsRun(answerOf(403, { error: 'Admin only' }));
    assert.equal(admin.e?.message, 'You need the Admin role to change these settings.', 'the 403\'s sentence stands');
    const unsent = await putSettingsRun(UNSENT());
    assert.equal(unsent.e?.message, NETWORK_ERROR);
    const landed = await putSettingsRun(answerOf(200, { success: true, revs: { teams: 'T1' } }));
    assert.deepEqual(landed.v, { success: true, revs: { teams: 'T1' } });
    const switched = await putSettingsRun(answerOf(500, { error: 'Database error', requestId: 'r5' }), { switchOrg: true });
    assert.deepEqual(switched, { v: 'STOPPED' }, 'after an org switch: nothing thrown into the new org\'s screen');
});

// 8d Export's "Download now" (the ad-hoc export), extracted from ExportDetail.jsx: after an org switch the old org's
// export was saved to disk on the new org's screen. The org is checked after the answer is read, before the file.
const adHocExport = async ({ answer, switchOrg = false }) => {
    const fn = between(code(read('src/Tabs/settings/data/ExportDetail.jsx')), '    const handleAdHoc = async () => {', '\n    };') + '\n    };';
    let org = 'org_a';
    const did = { sent: [], saved: [], said: [], loading: [] };
    const runs = stateOf([]);
    const document = {
        createElement: () => { const a = { click: () => did.saved.push(a.download) }; return a; },
        body: { appendChild: () => {}, removeChild: () => {} },
    };
    const URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    class Blob { constructor(parts, o) { this.type = o && o.type; } }
    const go = new Function('requestOrg', 'stillOrg', 'setAdhocLoading', 'setAdhocError', 'dbFetch', 'readRefusal', 'failureWords', 'adHocScope',
        'adHocFmt', 'setRuns', 'crypto', 'atob', 'document', 'URL', 'Blob', `${fn}\nreturn handleAdHoc;`)(
        () => 'org_a', (o) => o === org, (v) => did.loading.push(v), (v) => did.said.push(v),
        async (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); if (switchOrg) org = 'org_b'; if (answer instanceof Error) throw answer; return answer; },
        readRefusal, failureWords, 'accounts', 'CSV', runs.set, { randomUUID: () => 'u1' },
        (b64) => Buffer.from(b64, 'base64').toString('binary'), document, URL, Blob);
    await go();
    return { ...did, runs: runs.value };
};
const EXPORTED = () => answerOf(200, { download: { data: Buffer.from('name\nAcme\n').toString('base64'), contentType: 'text/csv', filename: 'accounts.csv' }, run: { id: 'run_u1' } });

test('Part 8d: an ad-hoc export answered after an org switch saves no file and says nothing; in the org that asked, the file — RUN', async () => {
    const landed = await adHocExport({ answer: EXPORTED() });
    assert.deepEqual(landed.sent, [['/.netlify/functions/export-runs', 'POST', { id: 'run_u1', scope: 'accounts', format: 'CSV' }]]);
    assert.deepEqual([landed.saved, landed.runs, landed.said, landed.loading], [['accounts.csv'], [{ id: 'run_u1' }], [null], [true, false]]);
    const switched = await adHocExport({ answer: EXPORTED(), switchOrg: true });
    assert.deepEqual(switched.saved, [], 'REGRESSION (state §0.175): the old org\'s export saved to disk on the new org\'s screen');
    assert.deepEqual([switched.runs, switched.said, switched.loading], [[], [null], [true, false]], 'nothing listed or said; the button let go');
    const refusedAfter = await adHocExport({ answer: answerOf(403, { error: 'Admin only' }), switchOrg: true });
    assert.deepEqual([refusedAfter.saved, refusedAfter.said], [[], [null]], 'a refusal for an org switched away from: not said');
});

test('Part 8d: a refused, unsent or unreadable ad-hoc export says the house words — never "Failed to fetch" or a runtime error\'s — RUN', async () => {
    for (const [answer, why] of [...P8_REFUSALS(), [answerOf(200, {}), 'Its answer could not be read.']]) {
        const r = await adHocExport({ answer });
        assert.deepEqual([r.saved, r.runs], [[], []]);
        assert.deepEqual(r.said, [null, why], `REGRESSION: raw words said (${why})`);
    }
});

// Review fix 2 (§0.247's review): a snapshot's file asked for in one org was saved to disk after a switch to another —
// the table's Download asked no org at all, and Run backup's and the restore window's checks came before the file's own
// request. saveSnapshotFile(id, askedOrg), extracted from BackupDetail.jsx: after a switch it saves nothing and says
// nothing (null); the table's Download takes the org at its press and says its refusal only while that org is on screen.
const BACKUP = 'src/Tabs/settings/data/BackupDetail.jsx';
const snapshotSave = async ({ answer, text = '{"entities":{}}', switchAt = null, noOrg = false }) => {
    const askedOrg = noOrg ? undefined : 'org_a';
    const fn = between(code(read(BACKUP)), 'const saveSnapshotFile = async (id, askedOrg) => {', '\n};') + '\n};';
    let org = 'org_a';
    const did = { saved: [], blobs: 0 };
    const document = {
        createElement: () => { const a = { click: () => did.saved.push(a.download) }; return a; },
        body: { appendChild: () => {}, removeChild: () => {} },
    };
    const URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    class Blob { constructor() { did.blobs++; } }
    const save = new Function('dbFetch', 'readRefusal', 'stillOrg', 'document', 'URL', 'Blob', `${fn}\nreturn saveSnapshotFile;`)(
        async () => {
            if (switchAt === 'fetch') org = 'org_b';
            if (answer instanceof Error) throw answer;
            return { ...answer, text: async () => { if (switchAt === 'text') org = 'org_b'; if (text instanceof Error) throw text; return text; } };
        },
        readRefusal, (o) => !!o && o === org, document, URL, Blob);
    const why = await save('bk_1', askedOrg);
    return { why, ...did };
};

test('Part 8 review fix: a snapshot\'s file answered after an org switch saves nothing and says nothing; in the org that asked, the file — RUN', async () => {
    const landed = await snapshotSave({ answer: answerOf(200, {}) });
    assert.deepEqual([landed.why, landed.saved], ['', ['bk_1.json']]);
    for (const switchAt of ['fetch', 'text']) {
        const r = await snapshotSave({ answer: answerOf(200, {}), switchAt });
        assert.deepEqual([r.why, r.saved, r.blobs], [null, [], 0], `REGRESSION (state §0.175): the old org's snapshot saved on the new org's screen (switch at ${switchAt})`);
    }
    for (const [answer, text, why] of [
        [answerOf(403, { error: 'Admin only' }), undefined, 'Admin only'],
        [PAGE_502(), undefined, 'The server returned 502.'],
        [UNSENT(), undefined, 'The server could not be reached.'],
        [answerOf(200, {}), new TypeError('network error'), 'Its file could not be read.'],
    ]) {
        const here = await snapshotSave({ answer, text });
        assert.deepEqual([here.why, here.saved], [why, []], `in the org that asked: said (${why})`);
        const gone = await snapshotSave({ answer, text, switchAt: 'fetch' });
        assert.deepEqual([gone.why, gone.saved], [null, []], `REGRESSION: words for an org switched away from (${why})`);
    }
    const unasked = await snapshotSave({ answer: answerOf(200, {}), switchAt: 'fetch', noOrg: true });
    assert.deepEqual([unasked.why, unasked.saved], ['', ['bk_1.json']], 'no org named: saved as before');
});

test('Part 8 review fix: the table\'s Download asks the org at its press — after a switch nothing said, nothing cleared — RUN and WIRING', async () => {
    const bd = code(read(BACKUP));
    const body = between(bd, '<button onClick={async () => {', '}} style=').slice('<button onClick={async () => {'.length);
    const run = async (why, switched) => {
        let org = 'org_a';
        const did = { asked: [], said: [], cleared: [] };
        const press = new Function('requestOrg', 'stillOrg', 'saveSnapshotFile', 'setDownloadError', 'fileSaved', 'unstopped', 's', `return async () => {${body}};`)(
            () => org, (o) => o === org, async (id, asked) => { did.asked.push([id, asked]); if (switched) org = 'org_b'; return why; },
            (v) => did.said.push(v), (id) => did.cleared.push(id), (w) => String(w).replace(/[.\s]+$/, ''), { id: 'bk_7' });
        await press();
        return did;
    };
    const refused = await run('Admin only', false);
    assert.deepEqual([refused.asked, refused.said, refused.cleared], [[['bk_7', 'org_a']], [{ id: 'bk_7', words: 'Backup bk_7 was not downloaded (Admin only). Please try again.' }], []]);
    const saved = await run('', false);
    assert.deepEqual([saved.said, saved.cleared], [[], ['bk_7']]);
    for (const why of ['Admin only', '', null]) {
        const gone = await run(why, true);
        assert.deepEqual([gone.said, gone.cleared], [[], []], `REGRESSION: the table's Download said or cleared on the new org's screen (${why})`);
    }
    for (const call of ['await saveSnapshotFile(snap.id, askedOrg);', 'await saveSnapshotFile(data.id, askedOrg);', 'await saveSnapshotFile(s.id, askedOrg);']) {
        assert.equal(count(bd, call), 1, `every save names its org: ${call}`);
    }
    assert.equal(count(bd, 'await saveSnapshotFile('), 3);
});

test('Part 8: WIRING — every listed site says failureWords; Export\'s load in its own words; the page banners kept until their Close; no "HTTP N"', () => {
    const S = 'src/Tabs/settings/';
    // Export's load (§18b123 rule 4, a read said apart) and its ad-hoc export's org check.
    const ex = code(read(S + 'data/ExportDetail.jsx'));
    assert.ok(ex.includes("import { dbFetch, dbWrite, requestOrg, stillOrg } from '../../../utils/storage';"));
    assert.ok(ex.includes("⚠ Export couldn't be opened ({String(error).replace(/[.\\s]+$/, '')}). Reload the page to try again.</div>"), 'REGRESSION: the load\'s words bare');
    order(between(ex, '    const handleAdHoc = async () => {', '\n    };'), 'const askedOrg = requestOrg();', 'const data = await res.json();',
        'if (!stillOrg(askedOrg)) return;', 'const dl  = data.download;', 'a.click();', '} catch (e) {', 'if (stillOrg(askedOrg)) setAdhocError(failureWords(e));');
    // The three integrations panels' banners: kept until their Close, never on a timer.
    for (const f of ['integrations/ApiKeysDetail.jsx', 'integrations/AutomationsDetail.jsx', 'integrations/WebhooksDetail.jsx']) {
        const s = code(read(S + f));
        // Moved pin (§0.247 review fix 9): Automations' Close also lets go of the rule its banner spoke of.
        const close = f.includes('Automations') ? '<button onClick={() => { errorRule.current = null; setError(null); }}' : '<button onClick={() => setError(null)}';
        order(between(s, '            {error && (', '\n            )}'), '<div role="alert"', '<span style={{ flex:1, minWidth:0 }}>{error}</span>',
            close, 'Close', '</button>');
        assert.ok(!/setTimeout\([^;]*setError/.test(s), `${f}: REGRESSION — the banner closed on a timer`);
        assert.ok(!/setError\(e\.message\)/.test(s), `${f}: REGRESSION — a raw e.message`);
    }
    // Automations' Pause / Resume and Delete reload nothing.
    const a = code(read(S + 'integrations/AutomationsDetail.jsx'));
    for (const fn of ['    const handleToggle = async (rule) => {', '    const handleDelete = async (rule) => {']) {
        const body = between(a, fn, '\n    };');
        assert.ok(!/\bload\(\)/.test(body), `${fn.trim()}: REGRESSION — a reload replaces the refusal's words`);
        // Moved pin (§0.247 review fix 8): the finally also draws the busy ids again.
        order(body, 'if (busyRules.current.has(rule.id)) return;', 'busyRules.current.add(rule.id);', '} finally { busyRules.current.delete(rule.id); setBusyIds([...busyRules.current]); }');
    }
    assert.ok(a.includes('const busyRules = React.useRef(new Set());'));
    // Backup's Run backup: the org asked before the file (moved pin, review fix 2: the file's save asks it again).
    const bd = code(read(S + 'data/BackupDetail.jsx'));
    order(between(bd, '    const handleRunBackup = async () => {', '\n    };'), 'const askedOrg = requestOrg();', 'const data = await res.json();',
        'if (!stillOrg(askedOrg)) return;', 'const why = await saveSnapshotFile(data.id, askedOrg);', '} catch (e) {', 'setBackupError(failureWords(e));');
    // Dispatch's fleet: a 403 the role's sentence (Q13), else the server's words; never "HTTP N".
    const veh = code(read(VEHICLES));
    assert.equal(count(veh, "'HTTP '"), 0, 'REGRESSION: "HTTP N" said');
    for (const what of ['vehicles', 'equipment']) {
        assert.ok(veh.includes(`if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot delete ${what}.' : await readRefusal(res));`));
    }
    assert.ok(veh.includes('setLoadError(failureWords(err));'));
    assert.ok(veh.includes("setImportError(`The import didn't run: ${unstopped(failureWords(err))}. Refresh, then try again.`);"));
    // The Documents hook's download and preview, and the calendar's holiday saves.
    assert.ok(code(read('src/hooks/useDocuments.js')).includes('const error = failureWords(e);'));
    assert.ok(code(read(S + 'company/CompanyCalendarDetail.jsx')).includes('setCalError(`${label} not saved — ${failureWords(e)}`);'));
    // putSettings: refusalWords' words, the body read once, staleOf over what was read.
    const ss = code(read(S + 'shared/saveSettings.js'));
    assert.ok(ss.includes("import { refusalWords } from '../../../utils/refusalWords.js';"));
    order(between(ss, 'export async function putSettings(payload, revs) {', '\n}\n'), 'if (!res.ok) {',
        "if (res.status === 403) throw new Error('You need the Admin role to change these settings.');",
        'let d = null;', 'try { d = await res.json(); } catch (_) {}', 'const msg = refusalWords(res, d);', 'const stale = staleOf(res.status, d);',
        'if (stale && stillOrg(askedOrg)) throw Object.assign(new Error(msg), { stale });');
    assert.equal(count(ss, "'HTTP '"), 0, 'REGRESSION: "HTTP N" said');
});

// ── Part 9 ──────────────────────────────────────────────────────────────────────────────────────────────────────

// A read that failed is shown as none or zero (§0.247; docs/design/refusal-sweep Part 9 — Jeff, 12 Nov: "lets proceed in
// that order", Parts 8-9; Q18 the Settings overview, Q19 Approval tiers). Every read below checks ok before its body and
// says the read that failed; a count it could not read is left out ("—", or the card blank), never 0 or "No … yet".
// The panels remount on an org switch (AdminView is keyed by the org); their effects' own `cancelled` is run here too.
const settledOf = (answer) => (answer instanceof Error ? { status: 'rejected', reason: answer } : { status: 'fulfilled', value: answer });
// The seven answers AdminView settles, in its order (keys, webhooks, automations, audit, backup, MFA, jobs).
const SEVEN_LANDED = () => [
    answerOf(200, { keys: [{ id: 'k1' }, { id: 'k2', revokedAt: '2026-01-01' }] }),
    // Moved (§0.247, Jeff 12 Nov: "Fix in this batch (Recommended)"): the server's key, `webhooks` (webhooks.mjs GET).
    answerOf(200, { webhooks: [{ active: true, lastStatus: 500 }, { active: true, lastStatus: 200 }] }),
    answerOf(200, { automations: [{ active: true }, { active: false }] }),
    answerOf(200, { entries: [{}, {}, {}] }),
    answerOf(200, { snapshots: [{ createdAt: new Date(Date.now() - 3 * 3600000).toISOString() }], schedule: { frequency: 'Weekly' } }),
    answerOf(200, { enrolled: 2, total: 3 }),
    answerOf(200, { jobs: [], now: new Date().toISOString(), enabled: true }),
];

test('Part 9a: answerOf — a refused, unsent or unreadable answer is null; a landed one its body — RUN', async () => {
    assert.equal(await settledBody(settledOf(answerOf(500, { error: 'Database error', requestId: 'r1' }))), null, 'REGRESSION: a refusal\'s body read as the answer');
    assert.equal(await settledBody(settledOf(answerOf(403, { error: 'Admin only' }))), null);
    assert.equal(await settledBody(settledOf(PAGE_502())), null);
    assert.equal(await settledBody(settledOf(UNSENT())), null, 'a rejected settle');
    assert.equal(await settledBody(settledOf(answerOf(200, new SyntaxError("Unexpected token '<'")))), null, 'a 200 whose body is not JSON');
    assert.equal(await settledBody(undefined), null);
    assert.deepEqual(await settledBody(settledOf(answerOf(200, { keys: [] }))), { keys: [] });
});

test('Part 9a: liveCountsOf — a read that failed leaves its count out: no "No endpoints", no Health check; a backup answer with no snapshots still checks — RUN', async () => {
    const landed = await liveCountsOf(SEVEN_LANDED().map(settledOf));
    assert.deepEqual([landed.apiKeysActive, landed.apiKeysTotal, landed.webhooksTotal, landed.webhooksActive, landed.webhooksFailing, landed.autosTotal, landed.autosActive, landed.auditEvents],
        [1, 2, 2, 2, 1, 2, 1, 3]);
    assert.deepEqual([landed.backupChecked, landed.backupFreq, landed.backupLastHours, landed.backupLastLabel], [true, 'Weekly', 3, '3h ago']);
    assert.deepEqual(landed.mfa, { enrolled: 2, total: 3 });
    assert.ok(landed.jobs, 'the jobs\' verdict');
    for (const failed of [answerOf(500, { error: 'Database error', requestId: 'r1' }), answerOf(403, { error: 'Admin only' }), PAGE_502(), UNSENT(),
        answerOf(200, new SyntaxError("Unexpected token '<'"))]) {
        const counts = await liveCountsOf(Array.from({ length: 7 }, () => settledOf(failed)));
        // Moved pin (§0.247, Jeff 12 Nov: "Name the unread (Recommended)"): no count, and the four checks named unread.
        assert.deepEqual(counts, { unread: ['mfa', 'webhooks', 'backup', 'jobs'] }, `REGRESSION: a count over a read that failed (${failed instanceof Error ? 'unsent' : failed.status})`);
        const checks = healthChecksOf({ pipelines: [{}], users: [] }, counts).map((c) => c.id);
        assert.deepEqual(checks.filter((id) => ['webhooks', 'mfa', 'backup', 'jobs'].includes(id)), [], 'REGRESSION: "Webhooks all healthy" counted over a read that failed');
        for (const id of ['api-keys', 'webhooks', 'automations', 'audit-log', 'backup']) {
            assert.equal(cardStateOf({ id, status: 'none', statusDetail: null }, {}, counts).statusDetail, null, `${id}: the card blank, never "No …"`);
        }
    }
    // One read failed among landed ones: only its count is out.
    const mixed = SEVEN_LANDED();
    mixed[1] = answerOf(500, { error: 'Database error' });
    mixed[4] = answerOf(403, { error: 'Admin only' });
    const some = await liveCountsOf(mixed.map(settledOf));
    assert.deepEqual([some.apiKeysTotal, some.webhooksTotal, some.backupChecked, some.autosTotal], [2, undefined, undefined, 2]);
    // A backup answer with no snapshots is an answer: the check is in, and it fails honestly.
    const none = SEVEN_LANDED();
    none[4] = answerOf(200, { snapshots: [] });
    const noSnaps = await liveCountsOf(none.map(settledOf));
    assert.equal(noSnaps.backupChecked, true, 'an answer, even "no snapshots"');
    assert.equal(noSnaps.backupLastHours, undefined);
    assert.deepEqual(healthChecksOf({}, noSnaps).find((c) => c.id === 'backup'), { id: 'backup', label: 'Backups running', ok: false });
    assert.deepEqual(await liveCountsOf(), { unread: ['mfa', 'webhooks', 'backup', 'jobs'] }, 'no answers: no counts (moved pin, §0.247: each check named unread)');
});

// The Recently changed feed's load, extracted from AdminView.jsx (Q18): it read `r.json()` with no ok check and its catch
// was empty — the card stayed empty, as though nothing changed.
const recentFeed = async (answer, { switchOrg = false } = {}) => {
    const av = code(read('src/Tabs/AdminView.jsx'));
    const chain = between(av, "        dbFetch('/.netlify/functions/audit-log')\n            .then(", '\n        return () => { cancelled = true; };');
    const unread = between(av, "const RECENT_UNREAD = '", "';").slice("const RECENT_UNREAD = '".length);
    const feed = stateOf([]), err = stateOf('');
    const h = new Function('dbFetch', 'setRecentFeed', 'setRecentError', 'RECENT_UNREAD',
        `let cancelled = false; return { cancel: () => { cancelled = true; }, go: () => ${chain.trim().replace(/;$/, '')} };`)(
        async () => { if (switchOrg) h.cancel(); if (answer instanceof Error) throw answer; return answer; }, feed.set, err.set, unread);
    await h.go();
    await settle();
    return { feed: feed.value, error: err.value, unread };
};

test('Part 9a: Recently changed — a read that failed says "The recent changes could not be read."; landed, the rows; after an org switch nothing — RUN', async () => {
    for (const answer of [answerOf(500, { error: 'Database error', requestId: 'r1' }), answerOf(403, { error: 'Admin only' }), PAGE_502(), UNSENT(),
        answerOf(200, new SyntaxError("Unexpected token '<'"))]) {
        const r = await recentFeed(answer);
        assert.equal(r.unread, 'The recent changes could not be read.');
        assert.deepEqual([r.feed, r.error], [[], 'The recent changes could not be read.'], 'REGRESSION: an empty card over a read that failed');
    }
    const landed = await recentFeed(answerOf(200, { entries: [{ userName: 'Jeff Ruiz', userId: 'usr_1', action: 'settings.saved', timestamp: new Date().toISOString() }] }));
    assert.deepEqual([landed.error, landed.feed.length, landed.feed[0].who, landed.feed[0].what], ['', 1, 'Jeff Ruiz', 'settings saved']);
    for (const answer of [answerOf(500, { error: 'x' }), UNSENT()]) {
        const switched = await recentFeed(answer, { switchOrg: true });
        assert.deepEqual([switched.feed, switched.error], [[], ''], 'an answer for an org switched away from says nothing');
    }
});

test('Part 9a: WIRING — AdminView counts through liveCountsOf, its only body read the feed\'s ok-first one; the feed\'s words drawn in its card', () => {
    const av = code(read('src/Tabs/AdminView.jsx'));
    // Moved pin (§0.247, Jeff 12 Nov: "Name the unread (Recommended)"): the import also names the unread checks' three.
    assert.ok(av.includes("import { cardStateOf, healthChecksOf, healthSummaryOf, liveCountsOf, unreadChecksOf, unreadSentenceOf, allClearOf } from '../utils/settingsCards';"));
    order(between(av, '        const fetchCounts = async () => {', '\n        };'), 'const results = await Promise.allSettled([', 'if (cancelled) return;',
        'const counts = await liveCountsOf(results);', 'if (cancelled) return;', 'setLiveCounts(counts);');
    assert.equal(count(av, '.json()'), 1, 'REGRESSION: a count read in AdminView again, outside the one reader');
    assert.ok(av.includes('.then(r => (r.ok ? r.json() : null))'));
    order(av, 'setRecentFeed([]);', "setRecentError('');", ".then(r => (r.ok ? r.json() : null))", 'if (!data) { setRecentError(RECENT_UNREAD); return; }',
        '.catch(() => { if (!cancelled) setRecentError(RECENT_UNREAD); });');
    order(between(av, '<span>RECENTLY CHANGED</span>', '{recentFeed.slice(0,4).map('), '{recentError && (', '<div role="alert"', '{recentError}</div>');
});

// 9b Approval tiers' "Last 90 days", extracted from ApprovalTiersDetail.jsx (Q19): no ok check, so every tier showed 0.
const effectOf = (src, marker) => {
    const at = src.indexOf(marker);
    assert.ok(at >= 0, marker);
    const from = src.lastIndexOf('(async () => {', at);
    const to = src.indexOf('\n        })();', at);
    assert.ok(from >= 0 && to > at, `the effect around ${marker}`);
    return src.slice(from, to) + '\n        })()';
};
const runEffect = async (iife, names, values, { answer, switchOrg = false }) => {
    const h = new Function('dbFetch', ...names, `let cancelled = false; return { cancel: () => { cancelled = true; }, go: () => ${iife} };`)(
        async () => { if (switchOrg) h.cancel(); if (answer instanceof Error) throw answer; return answer; }, ...values);
    await h.go();
};
const P9_READ_FAILS = () => [
    [answerOf(500, { error: 'Database error', requestId: 'r2' }), 'Database error (ref r2)'],
    [answerOf(403, { error: 'Admin only' }), 'Admin only'],
    [PAGE_502(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
    [answerOf(200, new SyntaxError("Unexpected token '<'")), 'Its answer could not be read.'],
];
const TIERS = 'src/Tabs/settings/quoting/ApprovalTiersDetail.jsx';
const approvalStatsRead = async (opts) => {
    const iife = effectOf(code(read(TIERS)), "dbFetch('/.netlify/functions/quotes?approvalStats=true')");
    const did = { loading: [], stats: [], said: [] };
    await runEffect(iife, ['readRefusal', 'failureWords', 'setStatsLoading', 'setApprovalStats', 'setStatsError', 'console'],
        [readRefusal, failureWords, (v) => did.loading.push(v), (v) => did.stats.push(v), (v) => did.said.push(v), quiet], opts);
    return did;
};

test('Part 9b: Approval tiers — a record that could not be read is said in the tiers\' place, never every tier 0 — RUN', async () => {
    for (const [answer, why] of P9_READ_FAILS()) {
        const r = await approvalStatsRead({ answer });
        assert.deepEqual(r.said, [`The approval record could not be read — ${why}`], `REGRESSION: a failed read shown as zeros (${why})`);
        assert.deepEqual([r.stats, r.loading], [[], [true, false]]);
    }
    const STATS = [{ tier: 'Rep', quotes: 3, approved: 2, sentBack: 1, pending: 0, avgHours: 4 }];
    const landed = await approvalStatsRead({ answer: answerOf(200, { approvalStats: STATS }) });
    assert.deepEqual([landed.stats, landed.said, landed.loading], [[STATS], [], [true, false]]);
    const switched = await approvalStatsRead({ answer: answerOf(500, { error: 'x' }), switchOrg: true });
    assert.deepEqual([switched.stats, switched.said, switched.loading], [[], [], [true]], 'closed meanwhile: nothing set');
});

test('Part 9b: WIRING — the tier rows and their zero fallback only with no statsError; the words drawn in their place', () => {
    const s = code(read(TIERS));
    assert.ok(s.includes("import { readRefusal, failureWords } from '../../../utils/refusalWords.js';"));
    order(s, '{!statsLoading && statsError && (', '<div role="alert"', '{statsError}</div>',
        '{!statsLoading && !statsError && tiers.map((t,i) => {', '{ quotes:0, approved:0, sentBack:0, pending:0, avgHours:0 }',
        '{!statsLoading && !statsError && approvalStats && approvalStats.every(s => s.quotes === 0) && (');
    assert.equal(count(s, '{ quotes:0, approved:0'), 1, 'one zero fallback, under the check');
    assert.ok(s.includes('setSaveError(failureWords(e));'), 'the save\'s catch: plain words, never a raw e.message');
});

// 9c the corporate calendars, extracted from CompanyCalendarDetail.jsx: a refusal or a 502's page read as "No corporate
// calendar connected.". Its own words (never calError, which the holiday saves and the disconnect clear), with a Close;
// the empty words stay away until a read lands, after the Close too.
const CALENDAR = 'src/Tabs/settings/company/CompanyCalendarDetail.jsx';
const orgCalsLoad = async (answers) => {
    const fn = between(code(read(CALENDAR)), '    const loadOrgCals = async () => {', '\n    };') + '\n    };';
    const cals = stateOf([]), unread = stateOf(false), err = stateOf('');
    const did = { loading: [] };
    let next = 0;
    const load = new Function('dbFetch', 'readRefusal', 'failureWords', 'setOcl', 'setOrgCals', 'setOrgCalsUnread', 'setOrgCalsError', 'console',
        `${fn}\nreturn loadOrgCals;`)(
        async () => { const a = answers[next++]; if (a instanceof Error) throw a; return a; },
        readRefusal, failureWords, (v) => did.loading.push(v), cals.set, unread.set, err.set, quiet);
    const after = [];
    for (let i = 0; i < answers.length; i++) { await load(); after.push({ cals: cals.value, unread: unread.value, error: err.value }); }
    return { after, loading: did.loading };
};

test('Part 9c: the corporate calendars — a read that failed says so, the list left as it was; a good read clears the words — RUN', async () => {
    const CAL = { id: 'cal_1', calendarEmail: 'ops@acme.test' };
    for (const [answer, why] of P9_READ_FAILS()) {
        const r = await orgCalsLoad([answer]);
        assert.deepEqual(r.after[0], { cals: [], unread: true, error: `Corporate calendars could not be read — ${why}` }, `REGRESSION: a failed read shown as none (${why})`);
        assert.deepEqual(r.loading, [true, false]);
    }
    const again = await orgCalsLoad([UNSENT(), answerOf(200, { orgConnections: [CAL] })]);
    assert.deepEqual(again.after[1], { cals: [CAL], unread: false, error: '' }, 'a good reload clears the words and the unread mark');
    const kept = await orgCalsLoad([answerOf(200, { orgConnections: [CAL] }), answerOf(500, { error: 'Database error' })]);
    assert.deepEqual(kept.after[1], { cals: [CAL], unread: true, error: 'Corporate calendars could not be read — Database error' }, 'a failed reload never empties the list it had');
});

test('Part 9c: WIRING — the empty words only after a read landed; the read\'s words with a Close; no holiday save or disconnect clears them', () => {
    const s = code(read(CALENDAR));
    order(s, ') : !orgCalsUnread && (', "{orgCalsLoading ? 'Loading…' : 'No corporate calendar connected.", '{orgCalsError && (', '<div role="alert"',
        '{orgCalsError}</span>', "<button onClick={() => setOrgCalsError('')}", 'Close</button>');
    assert.equal(count(s, 'No corporate calendar connected.'), 1);
    for (const fn of ['    const persistHolidays = async (patch, label) => {', '    const disconnectCorporateCalendar = async (id) => {', '    const handleSync = async () => {']) {
        const body = between(s, fn, '\n    };');
        assert.ok(!/setOrgCals(Error|Unread)/.test(body), `${fn.trim()}: REGRESSION — the calendar read's words cleared by another write`);
    }
    order(between(s, '    const loadOrgCals = async () => {', '\n    };'), "const res = await dbFetch('/.netlify/functions/calendar-connections');",
        'if (!res.ok) throw new Error(await readRefusal(res));', 'const data = await res.json();', 'setOrgCalsUnread(false);', "setOrgCalsError('');",
        '} catch (e) {', 'setOrgCalsUnread(true);', 'setOrgCalsError(`Corporate calendars could not be read — ${failureWords(e)}`);');
});

// 9d Dispatch Settings: Job templates' equipment, Property types' usage, Crews' pickers.
const JOB_TEMPLATES = 'src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx';
const equipRead = async (opts) => {
    const s = code(read(JOB_TEMPLATES));
    const words = between(s, 'const equipUnreadWords = ', ';\n');
    const iife = effectOf(s, "dbFetch('/.netlify/functions/dispatch-equipment')");
    const did = { units: [], loaded: [], said: [] };
    await runEffect(`(() => { ${words}; return ${iife}; })()`,
        ['readRefusal', 'failureWords', 'setEquipUnits', 'setEquipLoaded', 'setEquipError'],
        [readRefusal, failureWords, (v) => did.units.push(v), (v) => did.loaded.push(v), (v) => did.said.push(v)], opts);
    return did;
};

test('Part 9d: Job templates — an equipment list that could not be read migrates nothing and says so; landed, it loads — RUN', async () => {
    for (const [answer, why] of P9_READ_FAILS()) {
        const r = await equipRead({ answer });
        assert.deepEqual(r.loaded, [], `REGRESSION (state §0.247): equipLoaded set over a read that failed — every requirement filed unmatched (${why})`);
        assert.deepEqual(r.units, []);
        assert.deepEqual(r.said, [`The equipment list couldn't be read (${why.replace(/[.\s]+$/, '')}) — requirements are left as they are. Reload the page to try again.`]);
    }
    const UNITS = [{ id: 'eq_1', category: 'Testers' }];
    const landed = await equipRead({ answer: answerOf(200, { equipment: UNITS }) });
    assert.deepEqual([landed.units, landed.loaded, landed.said], [[UNITS], [true], []]);
    const switched = await equipRead({ answer: answerOf(500, { error: 'x' }), switchOrg: true });
    assert.deepEqual([switched.loaded, switched.said], [[], []], 'closed meanwhile: nothing set');
});

test('Part 9d: Job templates — Save is refused while the equipment list is unread: thrown, said, nothing sent — RUN', async () => {
    const s = code(read(JOB_TEMPLATES));
    const fn = between(s, '    const handleSave = once(async () => {', '\n    });') + '\n    });';
    // Moved (§0.247 review fix 10): the refused Save says its own words, EQUIP_SAVE_REFUSED — never the read's again.
    const refusedWords = new Function(`${between(s, 'const EQUIP_SAVE_REFUSED = ', ';\n')};\nreturn EQUIP_SAVE_REFUSED;`)();
    const run = async (equipError) => {
        const did = { sent: [], said: [], saving: [] };
        const save = new Function('once', 'equipError', 'EQUIP_SAVE_REFUSED', 'setSaveError', 'setSaving', 'templates', 'commitNumber', 'CREW_BOUNDS', 'HRS_BOUNDS', 'setTemplates',
            'putSettings', 'opened', 'setSettings', 'landed', 'setDirty', 'panelStale', 'failureWords', `${fn}\nreturn handleSave;`)(
            (f) => f, equipError, refusedWords, (v) => did.said.push(v), (v) => did.saving.push(v), [{ id: 't1', crew: 2, hrs: 3 }], (v) => v, {}, {}, () => {},
            async (body) => { did.sent.push(body); return { revs: {} }; }, {}, () => {}, () => {}, () => {}, async () => false, failureWords);
        try { await save(); did.threw = null; } catch (e) { did.threw = e.message; }
        return did;
    };
    const WORDS = "The equipment list couldn't be read (The server returned 502) — requirements are left as they are. Reload the page to try again.";
    const SAVE_WORDS = "Not saved — the equipment list couldn't be read, so these templates can't be saved. Reload the page to try again.";
    assert.equal(refusedWords, SAVE_WORDS);
    const refused = await run(WORDS);
    assert.deepEqual([refused.sent, refused.said, refused.threw, refused.saving], [[], [SAVE_WORDS], SAVE_WORDS, []],
        'REGRESSION: a save sent while the equipment list is unread — the leave guard\'s "Save and continue" moved on');
    assert.notEqual(refused.said[0], WORDS, 'review fix: the Save\'s refusal in its own words, never the banner\'s read words again');
    const sent = await run('');
    assert.deepEqual([sent.sent.length, sent.threw, sent.saving], [1, null, [true, false]]);
});

test('Part 9d: WIRING — equipLoaded only after a landed read; the words drawn; Cancel migrates only what was migrated', () => {
    const s = code(read(JOB_TEMPLATES));
    const effect = effectOf(s, "dbFetch('/.netlify/functions/dispatch-equipment')");
    assert.equal(count(effect, 'setEquipLoaded(true)'), 1, 'one place sets it');
    order(effect, 'if (!res.ok) { if (!cancelled) setEquipError(equipUnreadWords(await readRefusal(res))); return; }', 'const data = await res.json();',
        'setEquipUnits(data.equipment || []);', 'setEquipLoaded(true);', '} catch (e) {', 'if (!cancelled) setEquipError(equipUnreadWords(failureWords(e)));');
    assert.ok(s.includes('if (!equipLoaded || equipMigrated) return;'), 'the migration waits for a landed read');
    assert.ok(s.includes('.map(t => (equipMigrated ? migrateEquipment(t, equipCategories, legacyEquipBlob) : t))'), 'Cancel never migrates against an unread list');
    order(s, '{equipError ? (', '<div role="alert"', '{equipError}</div>', ') : !equipLoaded ? (', 'Loading equipment&hellip;');
    assert.ok(s.includes('<CategoryDetailChrome error={saveError || equipError}'));
    assert.ok(s.includes('ok: !equipError && (selected.equipCategories||[]).every('), 'the sanity check: no "0 units" over an unread list');
    assert.ok(s.includes('setSaveError(failureWords(e));'));
});

// Review fix 4 (§0.247's review): the fleet read (dispatch-vehicles) returned on a refusal and swallowed a failure — the
// picker empty, the readiness row "Bucket truck — 0 in fleet", the select "Not in fleet (bucket_truck)". It follows
// Crews' vehicles read: the ok check, the words under the select; the row never ok over it.
const fleetRead = async (opts) => {
    const iife = effectOf(code(read(JOB_TEMPLATES)), "dbFetch('/.netlify/functions/dispatch-vehicles')");
    const did = { fleet: [], said: [] };
    await runEffect(iife, ['readRefusal', 'failureWords', 'setFleet', 'setFleetError'],
        [readRefusal, failureWords, (v) => did.fleet.push(v), (v) => did.said.push(v)], opts);
    return did;
};

test('Part 9d review fix: Job templates — a fleet that could not be read says so; landed, the fleet; after a close nothing — RUN', async () => {
    for (const [answer, why] of P9_READ_FAILS()) {
        const r = await fleetRead({ answer });
        assert.deepEqual([r.fleet, r.said], [[], [`The vehicles could not be read — ${why}`]], `REGRESSION: the fleet read failed and nothing said (${why})`);
    }
    const landed = await fleetRead({ answer: answerOf(200, { vehicles: [{ id: 'veh_1', type: 'Van' }] }) });
    assert.deepEqual([landed.fleet, landed.said], [[[{ id: 'veh_1', type: 'Van' }]], []]);
    const switched = await fleetRead({ answer: answerOf(500, { error: 'x' }), switchOrg: true });
    assert.deepEqual([switched.fleet, switched.said], [[], []], 'closed meanwhile: nothing set');
});

test('Part 9d review fix: Job templates — the Required vehicle row is never ok, "0 in fleet" or "Not in fleet" over a fleet not read — RUN and WIRING', () => {
    const s = code(read(JOB_TEMPLATES));
    const labelise = new Function(`${between(s, 'const labelise = ', ';\n')};\nreturn labelise;`)();
    const checkOf = new Function('labelise', `${between(s, 'const vehicleCheckOf = ', '});\n')}});\nreturn vehicleCheckOf;`)(labelise);
    const heldOf = new Function('labelise', `${between(s, 'const heldClassLabel = ', ';\n')};\nreturn heldClassLabel;`)(labelise);
    const FLEET = [{ type: 'bucket_truck' }, { type: 'Bucket_Truck' }, { type: 'van' }];
    const TYPES = ['bucket_truck', 'van'];
    const WORDS = 'The vehicles could not be read — The server returned 502.';
    assert.deepEqual(checkOf('', [], [], WORDS), { ok: true, label: 'Required vehicle in fleet', detail: 'Any vehicle' }, 'no vehicle required: ok over anything');
    assert.deepEqual(checkOf('bucket_truck', [], [], WORDS), { ok: false, label: 'Required vehicle in fleet', detail: "The vehicle list couldn't be read." },
        'REGRESSION: "Bucket Truck — 0 in fleet" over a fleet that could not be read');
    assert.deepEqual(checkOf('bucket_truck', FLEET, TYPES, ''), { ok: true, label: 'Required vehicle in fleet', detail: 'Bucket Truck — 2 in fleet' });
    assert.deepEqual(checkOf('crane', FLEET, TYPES, ''), { ok: false, label: 'Required vehicle in fleet', detail: 'Crane — 0 in fleet' }, 'read, and none: honestly none');
    assert.equal(heldOf('bucket_truck', WORDS), 'Bucket Truck', 'REGRESSION: "Not in fleet" over a fleet not read');
    assert.equal(heldOf('crane', ''), 'Not in fleet (crane)');
    order(s, 'const [fleetError, setFleetError] = useState(\'\');', "const res = await dbFetch('/.netlify/functions/dispatch-vehicles');",
        'if (!res.ok) throw new Error(await readRefusal(res));', 'const data = await res.json();', 'if (cancelled) return;', 'setFleet(data.vehicles || []);',
        '} catch (e) {', 'if (!cancelled) setFleetError(`The vehicles could not be read — ${failureWords(e)}`);');
    assert.ok(s.includes('vehicleCheckOf(selected.vehicleType, fleet, vehicleTypes, fleetError),'), 'the readiness row through the one rule');
    order(s, '<option value={selected.vehicleType}>{heldClassLabel(selected.vehicleType, fleetError)}</option>', '</select>',
        '{fleetError && <div role="alert"', '>{fleetError}</div>}');
    assert.ok(!s.includes('/* picker stays empty */'), 'REGRESSION: the fleet read\'s failure swallowed');
});

const PROPERTY_TYPES = 'src/Tabs/settings/dispatch/DispatchPropertyTypesDetail.jsx';
const usageRead = async (opts) => {
    const s = code(read(PROPERTY_TYPES));
    const words = between(s, 'const usageUnreadWords = ', ';\n');
    const iife = effectOf(s, "dbFetch('/.netlify/functions/dispatch-customers')");
    const did = { customers: [], read: [], said: [] };
    await runEffect(`(() => { ${words}; return ${iife}; })()`,
        ['readRefusal', 'failureWords', 'setCustomers', 'setCustomersRead', 'setUsageError'],
        [readRefusal, failureWords, (v) => did.customers.push(v), (v) => did.read.push(v), (v) => did.said.push(v)], opts);
    return did;
};

test('Part 9d: Property types — usage that could not be read offers no Remove and says so; landed, the counts — RUN', async () => {
    for (const [answer, why] of P9_READ_FAILS()) {
        const r = await usageRead({ answer });
        assert.deepEqual([r.read, r.customers], [[], []], `REGRESSION: usage taken as read — every count 0, every Remove offered (${why})`);
        assert.deepEqual(r.said, [`Usage couldn't be read (${why.replace(/[.\s]+$/, '')}) — reload before removing a type.`]);
    }
    const CUSTOMERS = [{ id: 'c1', customerType: 'residential' }];
    const landed = await usageRead({ answer: answerOf(200, { customers: CUSTOMERS }) });
    assert.deepEqual([landed.customers, landed.read, landed.said], [[CUSTOMERS], [true], []]);
    const switched = await usageRead({ answer: answerOf(200, { customers: CUSTOMERS }), switchOrg: true });
    assert.deepEqual([switched.read, switched.said], [[], []], 'closed meanwhile: nothing set');
});

test('Part 9d: WIRING — Property types\' Remove names customersRead; no count claimed while unread; the words drawn', () => {
    const s = code(read(PROPERTY_TYPES));
    // Moved pins (§0.247 review fix 3): Remove through typeRemovable — a stored type still needs customersRead and none in
    // use; a draft-only type is removable whatever the read did (RUN below) — and the title through removeTitleOf.
    assert.ok(s.includes('canRemove={typeRemovable(t.id, storedIds, customersRead, countOf, types.length)}/>'), 'REGRESSION: Remove offered over unread usage');
    assert.ok(s.includes('count={customersRead ? countOf(t.id) : null}'));
    assert.ok(s.includes("unread={storedIds.has(t.id) && !customersRead ? (usageError ? 'failed' : 'loading') : null}"));
    assert.ok(s.includes('const storedIds = new Set(seeded.map(t => t.id));'), 'the stored types are the ones the settings prop seeded');
    assert.ok(s.includes('title={removeTitleOf(canRemove, unread)}'));
    assert.ok(s.includes("{count == null ? '—' : count} in use"), 'never "0 in use" over an unread read');
    order(s, '{usageError && (', '<div role="alert"', '{usageError}</div>', '{types.map((t, i) => (');
    assert.ok(s.includes("const [customersRead, setCustomersRead] = useState(false);"), 'no Remove until usage is read');
    assert.ok(s.includes('setError(failureWords(err));'));
});

// Review fix 3 (§0.247's review): a type added in this draft could not be removed again while usage was unread or out —
// the draft was stuck with it. typeRemovable and removeTitleOf, extracted from DispatchPropertyTypesDetail.jsx and run.
test('Part 9d review fix: Property types — a draft-only type stays removable whatever the usage read did; a stored one needs usage read and none in use — RUN', () => {
    const s = code(read(PROPERTY_TYPES));
    const removable = new Function(`${between(s, 'const typeRemovable = ', ';\n')};\nreturn typeRemovable;`)();
    const titleOf = new Function(`${between(s, 'const removeTitleOf = ', ';\n')};\nreturn removeTitleOf;`)();
    const stored = new Set(['commercial', 'residential']);
    const countOf = (id) => ({ commercial: 2, residential: 0, retail: 3 }[id] || 0);
    for (const read of [false, true]) {
        assert.equal(removable('retail', stored, read, countOf, 3), true, `REGRESSION: a type only in this draft stuck while usage is ${read ? 'read' : 'unread'}`);
        assert.equal(removable('kiosk', stored, read, countOf, 3), true);
    }
    assert.equal(removable('residential', stored, false, countOf, 3), false, 'REGRESSION: a stored type removable over unread usage');
    assert.equal(removable('residential', stored, true, countOf, 3), true, 'stored, read, none in use');
    assert.equal(removable('commercial', stored, true, countOf, 3), false, 'stored and in use');
    assert.equal(removable('kiosk', stored, true, countOf, 1), false, 'never the last type');
    assert.equal(titleOf(true, 'failed'), 'Remove');
    assert.equal(titleOf(false, 'loading'), 'Usage is still loading', 'REGRESSION: the reload words while the first read is out');
    assert.equal(titleOf(false, 'failed'), 'Usage not read — reload before removing a type');
    assert.equal(titleOf(false, null), 'In use by customers — reassign them first', 'a draft row never shows the usage words');
});

const CREWS = 'src/Tabs/settings/dispatch/DispatchCrewsDetail.jsx';
// Moved (§0.247 review fix 7): a third setter, the vehicles read landing (setVehiclesRead) — `read` holds what it set.
const crewsRead = async (marker, setters, opts) => {
    const iife = effectOf(code(read(CREWS)), marker);
    const did = { list: [], said: [], read: [] };
    await runEffect(iife, ['readRefusal', 'failureWords', ...setters],
        [readRefusal, failureWords, (v) => did.list.push(v), (v) => did.said.push(v), (v) => did.read.push(v)], opts);
    return did;
};
const VEHICLE_SETTERS = ['setVehicles', 'setVehiclesError', 'setVehiclesRead'];

test('Part 9d: Crews — a picker whose list could not be read says so; landed, the list — RUN', async () => {
    for (const [answer, why] of P9_READ_FAILS()) {
        const v = await crewsRead("dbFetch('/.netlify/functions/dispatch-vehicles')", VEHICLE_SETTERS, { answer });
        assert.deepEqual([v.list, v.said], [[], [`The vehicles could not be read — ${why}`]], `REGRESSION: the vehicle picker silently empty (${why})`);
        assert.deepEqual(v.read, [], 'review fix: a read that failed is never marked read');
        const t = await crewsRead("dbFetch('/.netlify/functions/dispatch-technicians')", ['setUsers', 'setTechsError'], { answer });
        assert.deepEqual([t.list, t.said], [[], [`The technicians could not be read — ${why}`]], `REGRESSION: the members drawn as "No members yet." (${why})`);
    }
    const v = await crewsRead("dbFetch('/.netlify/functions/dispatch-vehicles')", VEHICLE_SETTERS, { answer: answerOf(200, { vehicles: [{ id: 'veh_1' }] }) });
    assert.deepEqual([v.list, v.said, v.read], [[[{ id: 'veh_1' }]], [], [true]]);
    const closed = await crewsRead("dbFetch('/.netlify/functions/dispatch-vehicles')", VEHICLE_SETTERS, { answer: answerOf(200, { vehicles: [] }), switchOrg: true });
    assert.deepEqual([closed.list, closed.read], [[], []], 'closed meanwhile: nothing set');
    const t = await crewsRead("dbFetch('/.netlify/functions/dispatch-technicians')", ['setUsers', 'setTechsError'],
        { answer: answerOf(200, { technicians: [{ id: 'tech_1', firstName: 'Ann', lastName: 'Lee' }, { id: 'tech_2', status: 'inactive' }] }) });
    assert.deepEqual(t.list.map((l) => l.map((u) => [u.id, u.name])), [[['tech_1', 'Ann Lee']]]);
    const switched = await crewsRead("dbFetch('/.netlify/functions/dispatch-technicians')", ['setUsers', 'setTechsError'], { answer: UNSENT(), switchOrg: true });
    assert.deepEqual([switched.list, switched.said], [[], []]);
});

test('Part 9d: WIRING — Crews says each failed read where its picker is; no "No members yet." over unread technicians', () => {
    const s = code(read(CREWS));
    assert.ok(s.includes("{vehiclesError && <div role=\"alert\""));
    order(s, '{techsError ? (', '<div role="alert"', '{techsError}', ') : memberUsers.length === 0 ? (', 'No members yet.');
    assert.ok(s.includes('{showAddMember && !techsError && ('), 'no "All dispatch-enabled techs are already in this crew." over an unread list');
    assert.ok(s.includes('setSaveError(failureWords(e));'));
});

// Review fix 7 (§0.247's review): a crew's stored default vehicle read "Unknown vehicle (veh_9)" over a vehicle list that
// could not be read — and while it was still out. heldVehicleLabel, extracted from DispatchCrewsDetail.jsx and run.
test('Part 9d review fix: Crews — "Unknown vehicle" only once the vehicles were read; over a failed read "not checked" — RUN and WIRING', () => {
    const s = code(read(CREWS));
    const labelOf = new Function(`${between(s, 'const heldVehicleLabel = ', ';\n')};\nreturn heldVehicleLabel;`)();
    assert.equal(labelOf('veh_9', true, ''), 'Unknown vehicle (veh_9)', 'read, and not among them: unknown');
    assert.equal(labelOf('veh_9', false, 'The vehicles could not be read — Admin only'), 'Saved vehicle (veh_9) — not checked',
        'REGRESSION: "Unknown vehicle" over a vehicle list that could not be read');
    assert.equal(labelOf('veh_9', false, ''), 'Saved vehicle (veh_9)', 'while the read is out: the saved one, nothing claimed');
    order(s, "const [vehiclesRead, setVehiclesRead] = useState(false);", 'setVehicles(data.vehicles || []);', 'setVehiclesRead(true);', '} catch (e) {');
    // The stored id stays selected and saved as is: the option's value is the id.
    assert.ok(s.includes('<option value={selectedCrew.defaultVehicle}>{heldVehicleLabel(selectedCrew.defaultVehicle, vehiclesRead, vehiclesError)}</option>'));
    assert.ok(s.includes("<select value={selectedCrew.defaultVehicle || ''} onChange={e => updateCrew('defaultVehicle', e.target.value)}"));
});

// Review fix 5 (§0.247's review): the API docs popover said "No active keys — create one" over keys that could not be read.
test('Part 9e review fix: API keys — the docs popover says the keys could not be read, never "No active keys", after a failed load — WIRING', () => {
    const s = code(read('src/Tabs/settings/integrations/ApiKeysDetail.jsx'));
    assert.ok(s.includes('const DocsPopoverB = ({ keys = [], loadFailed = false, onClose, btnRef }) => {'));
    order(between(s, 'const DocsPopoverB = ', '\nexport '), '{activeKeys.length === 0 && loadFailed ? (', '<span>The keys could not be read. Reload the page to try again.</span>',
        ') : activeKeys.length === 0 ? (', '<span>No active keys — ');
    assert.ok(s.includes('{showDocs && <DocsPopoverB keys={keys} loadFailed={loadFailed} onClose={() => setShowDocs(false)} btnRef={docsBtnRef}/>}'),
        'REGRESSION: the popover not told the keys could not be read');
});

// 9e the integrations panels' loads, extracted from ApiKeys, Automations and Webhooks: a failed load left "0 active keys",
// "0 rules · 0 active", "0 endpoints" and "No … yet" beside its banner — and after the banner's Close, alone.
const INTEGRATIONS = [
    ['src/Tabs/settings/integrations/ApiKeysDetail.jsx', 'setKeys', { keys: [{ id: 'k1' }] }, "loadFailed ? '— active keys · workspace REST API credentials'",
        '({loadFailed ? \'—\' : keys.length})', ') : visible.length === 0 && loadFailed ? (', 'The keys could not be read.', "{filter === 'Active' ? 'No active keys'"],
    ['src/Tabs/settings/integrations/AutomationsDetail.jsx', 'setAutomationList', { automations: [{ id: 'a1' }] }, "loadFailed ? '— rules · — active'",
        null, ') : visible.length === 0 && loadFailed ? (', 'The automations could not be read.', "'No automations yet'"],
    // Moved (§0.247, Jeff 12 Nov: "Fix in this batch (Recommended)"): the server's key, `webhooks` (webhooks.mjs GET).
    ['src/Tabs/settings/integrations/WebhooksDetail.jsx', 'setWebhooks', { webhooks: [{ id: 'w1' }] }, "loadFailed ? '— endpoints · — active · receive real-time CRM events'",
        null, ') : webhooks.length === 0 && loadFailed ? (', 'The endpoints could not be read.', 'No webhook endpoints yet'],
];
const panelLoad = async (file, setList, answer) => {
    const fn = between(code(read(file)), '    const load = React.useCallback(', ', []);').slice('    const load = React.useCallback('.length);
    // Moved (§0.247 review fix 9): Automations' load lets go of the rule its banner spoke of — `errorRule` starts on one.
    const did = { list: [], said: [], failed: [], loading: [], errorRule: { current: 'aut_1' } };
    const load = new Function('dbFetch', 'readRefusal', 'failureWords', setList, 'setError', 'setLoadFailed', 'setLoading', 'errorRule', `return ${fn};`)(
        async () => { if (answer instanceof Error) throw answer; return answer; }, readRefusal, failureWords,
        (v) => did.list.push(v), (v) => did.said.push(v), (v) => did.failed.push(v), (v) => did.loading.push(v), did.errorRule);
    await load();
    return did;
};

test('Part 9e: ApiKeys, Automations, Webhooks — a failed load marks the list unread (its counts "—"); a landed one clears the mark — RUN', async () => {
    for (const [file, setList, body] of INTEGRATIONS) {
        for (const [answer, why] of P9_READ_FAILS()) {
            const r = await panelLoad(file, setList, answer);
            assert.deepEqual([r.list, r.said, r.failed, r.loading], [[], [why], [true], [false]], `${file}: REGRESSION — a failed load not marked unread (${why})`);
            if (file.includes('Automations')) assert.equal(r.errorRule.current, null, 'review fix 9: a load\'s words speak of no rule');
        }
        const landed = await panelLoad(file, setList, answerOf(200, body));
        assert.deepEqual([landed.list.length, landed.said, landed.failed], [1, [], [false]], `${file}: a landed load clears the mark`);
    }
});

test('Part 9e: WIRING — after a failed load the counts read "—" and the list says it could not be read, never "No … yet"', () => {
    for (const [file, , , sub, countText, emptyGate, words, noneYet] of INTEGRATIONS) {
        const s = code(read(file));
        assert.ok(s.includes("const [loadFailed, setLoadFailed] = React.useState(false);"), file);
        assert.ok(s.includes(`sub={loading ? 'Loading…' : ${sub}`), `${file}: REGRESSION — "0" counted beside a failed load`);
        if (countText) assert.ok(s.includes(countText), `${file}: the list's count`);
        order(s, emptyGate, words, noneYet);
    }
});

// ── Part 9: Jeff's two answers from the browser check (12 Nov) ─────────────────────────────────────────────────────

// 9f "Name the unread (Recommended)": a read that failed left its check out of the score, so the score went UP (Accelerep
// QA: 43% "3 of 7 checks passing" to 67% "2 of 3") and Needs attention said "All checks passing ✓". The score still
// counts only what was read; the tile names what could not be, and never says every check passes while one is unread.
const HEALTH_SETTINGS = { users: [{ name: 'Karen' }, { name: 'Jeff', team: 'West' }], pipelines: [{ id: 'p' }], quoteBrand: null };
const HEALTH_READS = { mfa: 5, webhooks: 1, backup: 4, jobs: 6 };   // each check's read, by its place in AdminView's seven
const tileOf = async (answers, { isHidden = () => false, hiddenCount = 0 } = {}) => {
    const counts = await liveCountsOf(answers.map(settledOf));
    const checks = healthChecksOf(HEALTH_SETTINGS, counts, isHidden);
    const health = healthSummaryOf(checks);
    const unread = unreadChecksOf(counts, isHidden);
    return { counts, checks, unread, headline: `${health.ok} of ${checks.length} checks passing`, pct: health.pct, sentence: health.sentence,
        unreadSentence: unreadSentenceOf(unread), clear: allClearOf(hiddenCount, unread.length) };
};

test('Part 9f: every read landed — the tile word for word as before: nothing unread, "All checks passing ✓" — RUN', async () => {
    const t = await tileOf(SEVEN_LANDED());
    assert.deepEqual(t.counts.unread, [], 'every read landed: none unread');
    const { unread: _u, ...before } = t.counts;
    const old = healthSummaryOf(healthChecksOf(HEALTH_SETTINGS, before));
    assert.deepEqual([t.headline, t.pct, t.sentence], [`${old.ok} of ${old.total} checks passing`, old.pct, old.sentence], 'the score and sentence as before');
    assert.equal(t.checks.length, 7, 'all seven checks read');
    assert.deepEqual([t.unread, t.unreadSentence], [[], ''], 'no unread line');
    assert.deepEqual(t.clear, { ok: true, words: 'All checks passing ✓' });
    assert.deepEqual(allClearOf(2, 0), { ok: false, words: 'All visible checks passing — 2 hidden.' }, 'today\'s hidden words');
    // While the reads are out there is no list: nothing is said unread, as before.
    assert.deepEqual(unreadChecksOf({}), []);
    assert.deepEqual(unreadChecksOf({ webhooksTotal: 0 }), [], 'a list only liveCountsOf sets');
});

test('Part 9f: some reads failed (403, 500, a 502 page) — the score counts what was read; the tile names the three; never "All checks passing" — RUN', async () => {
    const answers = SEVEN_LANDED();
    answers[HEALTH_READS.mfa] = answerOf(403, { error: 'Admin role required' });
    answers[HEALTH_READS.backup] = answerOf(500, { error: 'Database error', requestId: 'r1' });
    answers[HEALTH_READS.jobs] = PAGE_502();
    const t = await tileOf(answers);
    assert.deepEqual(t.checks.map((c) => c.id), ['webhooks', 'pipelines', 'teams', 'quote-brand'], 'the score counts only the checks read');
    assert.deepEqual(t.unread.map((c) => c.id), ['mfa', 'backup', 'jobs']);
    assert.equal(t.unreadSentence, '3 checks could not be read: MFA fully enrolled, Backups running, Scheduled jobs.');
    assert.deepEqual(t.clear, { ok: false, words: 'No check that was read needs attention — 3 checks could not be read.' }, 'REGRESSION: "All checks passing ✓" over unread checks');
    assert.deepEqual(allClearOf(2, 3), { ok: false, words: 'No visible check that was read needs attention — 2 hidden, 3 checks could not be read.' });
    // One: singular.
    const one = SEVEN_LANDED();
    one[HEALTH_READS.backup] = UNSENT();
    const o = await tileOf(one);
    assert.equal(o.unreadSentence, '1 check could not be read: Backups running.');
    assert.equal(o.clear.words, 'No check that was read needs attention — 1 check could not be read.');
});

test('Part 9f: every read failed — each of the five answers names all four; the score is the settings\' three — RUN', async () => {
    for (const failed of [answerOf(500, { error: 'Database error', requestId: 'r1' }), answerOf(403, { error: 'Admin only' }), PAGE_502(), UNSENT(),
        answerOf(200, new SyntaxError("Unexpected token '<'"))]) {
        const t = await tileOf(Array.from({ length: 7 }, () => failed));
        const kind = failed instanceof Error ? 'unsent' : failed.status;
        assert.deepEqual(t.checks.map((c) => c.id), ['pipelines', 'teams', 'quote-brand'], `${kind}: only the settings' checks scored`);
        assert.equal(t.headline, '1 of 3 checks passing');
        assert.equal(t.unreadSentence, '4 checks could not be read: MFA fully enrolled, Webhooks all healthy, Backups running, Scheduled jobs.', `${kind}`);
        assert.deepEqual(t.clear, { ok: false, words: 'No check that was read needs attention — 4 checks could not be read.' }, `${kind}`);
    }
});

test('Part 9f: an unread check is one whose read failed — never one that does not apply (hidden), never a 200 short of its count — RUN', async () => {
    // Every mix of the four reads, landed or failed: each check is read (scored) or unread (named), never both, never
    // neither; a hidden check is neither (it does not apply) — the backup check is never hidden, as healthChecksOf has it.
    const failed = answerOf(500, { error: 'Database error' });
    for (let mask = 0; mask < 16; mask++) {
        for (const hidden of [[], ['mfa', 'webhooks', 'jobs', 'backup']]) {
            const answers = SEVEN_LANDED();
            ['mfa', 'webhooks', 'backup', 'jobs'].forEach((id, i) => { if (mask & (1 << i)) answers[HEALTH_READS[id]] = failed; });
            const isHidden = (id) => hidden.includes(id);
            const t = await tileOf(answers, { isHidden });
            const scored = t.checks.map((c) => c.id).filter((id) => id in HEALTH_READS);
            const named = t.unread.map((c) => c.id);
            for (const id of Object.keys(HEALTH_READS)) {
                const applies = id === 'backup' || !isHidden(id);
                assert.equal(scored.includes(id) + named.includes(id), applies ? 1 : 0, `mask ${mask}, hidden [${hidden}]: ${id} scored or named once`);
                if (applies) assert.equal(named.includes(id), !!(mask & (1 << Object.keys(HEALTH_READS).indexOf(id))), `mask ${mask}: ${id} named only when its read failed`);
            }
        }
    }
    // A landed answer short of what the check needs is a read that failed: a webhooks answer with no list (the old key, or
    // none), an MFA answer with no enrolment, a jobs answer with no rows.
    const short = SEVEN_LANDED();
    short[HEALTH_READS.webhooks] = answerOf(200, { subscriptions: [{ active: true, lastStatus: 500 }] });
    short[HEALTH_READS.mfa] = answerOf(200, { total: 3 });
    short[HEALTH_READS.jobs] = answerOf(200, {});
    const s = await tileOf(short);
    assert.deepEqual(s.unread.map((c) => c.id), ['mfa', 'webhooks', 'jobs']);
    assert.equal(s.counts.webhooksTotal, undefined, 'REGRESSION: "No endpoints" over an answer without the list');
    assert.equal(cardStateOf({ id: 'webhooks', status: 'none', statusDetail: null }, {}, s.counts).statusDetail, null);
    // The names are the checks' own: each unread label is the label its check carries when read.
    const landed = await tileOf(SEVEN_LANDED());
    const all = await tileOf(Array.from({ length: 7 }, () => failed));
    for (const { id, label } of all.unread) {
        const check = landed.checks.find((c) => c.id === id);
        if (id === 'jobs') assert.ok(check.label.startsWith(label), `${id}: "${check.label}" begins "${label}"`);
        else assert.equal(label, check.label, id);
    }
});

test('Part 9f: WIRING — AdminView names the unread under the score with the checks\' isHidden; Needs attention draws allClearOf\'s words alone', () => {
    const av = code(read('src/Tabs/AdminView.jsx'));
    order(av, 'const activeHealthChecks = healthChecksOf(settings, liveCounts, isHidden);', 'const unreadChecks   = unreadChecksOf(liveCounts, isHidden);',
        'const unreadSentence = unreadSentenceOf(unreadChecks);', 'const allClear       = allClearOf(hiddenCount, unreadChecks.length);');
    order(between(av, 'WORKSPACE HEALTH</div>', '{/* Needs attention */}'), '{healthOk} of {activeHealthChecks.length} checks passing</div>', '{health.sentence}</div>',
        '{unreadSentence && (', '>{unreadSentence}</div>');
    const clear = between(av, '{/* All clear states', '{/* Info strip');
    order(clear, '{visibleAttention.length === 0 && (',
        "<div style={allClear.ok ? { fontSize:12, color:T.ok, fontFamily:T.sans } : { fontSize:12, color:T.inkMuted, fontFamily:T.sans, fontStyle:'italic' }}>{allClear.words}</div>");
    assert.ok(!av.includes('>All checks passing') && !av.includes('All visible checks passing —'), 'REGRESSION: an all-clear drawn by hand, blind to the unread');
});

// 9g "Fix in this batch (Recommended)": the Webhooks screen and its server disagreed on every answer since 11 May 2026
// (5772f63; the overview 0940a34) — the list read `subscriptions` (no endpoint ever listed), the create `subscription` (undefined in the list,
// the next draw threw), the overview `subscriptions` (always "No endpoints", "Webhooks all healthy" passed). Each key is
// read here FROM webhooks.mjs, so a change on either side fails.
const WH_SERVER = 'netlify/functions/webhooks.mjs';
const webhookShapes = () => {
    const fn = read(WH_SERVER);
    const get = between(fn, "if (event.httpMethod === 'GET') {", "if (event.httpMethod === 'POST') {");
    const post = between(fn, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    const put = between(fn, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    const list = get.match(/statusCode: 200, headers, body: JSON\.stringify\(\{ (\w+): subs, supportedEvents: WEBHOOK_EVENTS \}\)/);
    const made = post.match(/statusCode: 201,\s*headers,\s*body: JSON\.stringify\(\{\s*(\w+): \{ id, name: data\.name\.trim\(\), targetUrl: data\.targetUrl\.trim\(\), eventTypes: data\.eventTypes, active: true \},\s*(\w+), \/\/ shown once only\s*\}\),/);
    const saved = put.match(/statusCode: 200,\s*headers,\s*body: JSON\.stringify\(\{\s*success: true,\s*\.\.\.\(newSecret \? \{ newSecret \} : \{\}\), \/\/ return new secret if rotated\s*\}\),/);
    assert.ok(list && made && saved, 'webhooks.mjs answers as this test reads it — a change there is a change every reader must follow');
    return { list: list[1], row: made[1], secret: made[2] };
};
const WH_ROW = Object.freeze({ id: 'wh_9', name: 'Won deals to ERP', targetUrl: 'https://erp.example.test/hook', eventTypes: ['opportunity.won'], active: true });

test('Part 9g: every reader of the webhooks function reads the server\'s keys — the list, the made endpoint and its secret; the PUT\'s body unread', () => {
    const { list, row, secret } = webhookShapes();
    assert.deepEqual([list, row, secret], ['webhooks', 'webhook', 'secret'], 'the shapes as of §0.247');
    const wh = code(read(WEBHOOKS));
    assert.ok(wh.includes(`if (!Array.isArray(data?.${list})) throw new Error('');`) && wh.includes(`setWebhooks(data.${list});`), 'the list');
    const create = between(wh, '    const handleCreate = async () => {', '\n    };');
    assert.ok(create.includes(`setSecret(typeof data?.${secret} === 'string' ? data.${secret} : '');`), 'the secret');
    assert.ok(create.includes(`if (onCreated) onCreated(data && data.${row} && data.${row}.id ? data.${row} : null);`), 'the made endpoint');
    assert.equal(count(between(wh, '    const handleToggle = async (wh) => {', '\n    };'), '.json('), 0, 'the PUT answers no row: its body is not read');
    assert.ok(code(read('src/utils/settingsCards.js')).includes(`if (d && Array.isArray(d.${list})) {\n        const subs = d.${list};`), 'the overview\'s counts');
    // The API page customers read documents the same keys (it said "subscriptions" / "subscription" — §0.247).
    const docs = read('public/api-docs.html');
    const docGet = between(docs, '<div class="endpoint" id="wh-get">', '<div class="endpoint" id="wh-post">');
    const docPost = between(docs, '<div class="endpoint" id="wh-post">', '<div class="endpoint" id="wh-put">');
    const docPut = between(docs, '<div class="endpoint" id="wh-put">', '<div class="endpoint" id="wh-delete">');
    assert.ok(docGet.includes(`<span class="key">"${list}"</span>: [`), 'the API page: the list key');
    assert.ok(docPost.includes(`<span class="key">"${row}"</span>: {`) && docPost.includes(`<span class="key">"${secret}"</span>:`), 'the API page: the made endpoint and its secret');
    assert.ok(docPut.includes('<span class="key">"success"</span>: <span class="kw">true</span>'), 'the API page: the PUT answers success');
    assert.ok(!/<span class="key">"subscriptions?"<\/span>/.test(docs), 'the API page names no key the server never sends');
    // Every src file that calls the webhooks function, and the overview's reader: no key the server never sends.
    const callers = srcFiles().filter((f) => strip(read(f)).includes('/.netlify/functions/webhooks'));
    assert.deepEqual(callers.sort(), ['src/Tabs/AdminView.jsx', WEBHOOKS], 'the callers (AdminView reads through settingsCards.js liveCountsOf)');
    for (const f of [...callers, 'src/utils/settingsCards.js']) {
        assert.ok(!/\.subscriptions?\b/.test(strip(read(f))), `${f}: REGRESSION — a webhooks answer read by a key the server never sends`);
    }
});

test('Part 9g: the list\'s load over the server\'s answers — landed, the endpoints; an answer without the list, refused, unsent or unreadable, never "No webhook endpoints yet" — RUN', async () => {
    const { list } = webhookShapes();
    const landed = await panelLoad(WEBHOOKS, 'setWebhooks', answerOf(200, { [list]: [WH_ROW], supportedEvents: ['opportunity.won'] }));
    assert.deepEqual([landed.list, landed.said, landed.failed, landed.loading], [[[WH_ROW]], [], [false], [false]], 'REGRESSION: the endpoints never listed');
    const none = await panelLoad(WEBHOOKS, 'setWebhooks', answerOf(200, { [list]: [], supportedEvents: [] }));
    assert.deepEqual([none.list, none.failed], [[[]], [false]], 'none, read: "No webhook endpoints yet" is true');
    for (const body of [{ subscriptions: [WH_ROW] }, {}, null]) {
        const r = await panelLoad(WEBHOOKS, 'setWebhooks', answerOf(200, body));
        assert.deepEqual([r.list, r.said, r.failed], [[], ['Its answer could not be read.'], [true]], `REGRESSION: ${JSON.stringify(body)} read as no endpoints`);
    }
    for (const [answer, why] of P9_READ_FAILS()) {
        const r = await panelLoad(WEBHOOKS, 'setWebhooks', answer);
        assert.deepEqual([r.list, r.said, r.failed], [[], [why], [true]], why);
    }
    // The overview over the same answer: its counts, from the server's key.
    const counts = await liveCountsOf([undefined, answerOf(200, { [list]: [WH_ROW, { ...WH_ROW, id: 'wh_8', lastStatus: 500 }] })].map((a) => (a ? settledOf(a) : a)));
    assert.deepEqual([counts.webhooksTotal, counts.webhooksActive, counts.webhooksFailing], [2, 2, 1]);
    assert.equal(cardStateOf({ id: 'webhooks', status: 'none', statusDetail: null }, {}, counts).statusDetail, '2 endpoints · 1 failing', 'REGRESSION: always "No endpoints"');
});

// handleCreate, extracted from WebhooksDetail.jsx, over the server's 201 — with the screen's own onCreated.
const webhookCreate = async ({ answer, switchOrg = false, list = [WH_A], loadFailed = false }) => {
    const src = code(read(WEBHOOKS));
    const fn = between(src, '    const handleCreate = async () => {', '\n    };') + '\n    };';
    const cb = between(src, ' onCreated={', '}/>}').slice(' onCreated={'.length);
    const rows = stateOf(list);
    const did = { sent: [], saving: [], error: [], secret: [], created: [], step: [], loads: 0 };
    const onCreated = new Function('setWebhooks', 'load', 'loadFailed', `return ${cb};`)(rows.set, () => { did.loads++; }, loadFailed);
    const create = new Function('name', 'url', 'checked', 'setSaving', 'setError', 'setSecret', 'onCreated', 'setStep', 'dbFetch', 'requestOrg', 'stillOrg',
        'readRefusal', 'failureWords', `${fn}\nreturn handleCreate;`)(
        ' Won deals to ERP ', 'https://erp.example.test/hook', new Set(['opportunity.won']), (v) => did.saving.push(v), (v) => did.error.push(v),
        (v) => did.secret.push(v), (v) => { did.created.push(v); onCreated(v); }, (v) => did.step.push(v),
        async (url, opts) => { did.sent.push([url, opts.method, JSON.parse(opts.body)]); if (answer instanceof Error) throw answer; return answer; },
        () => 'org_a', (o) => !switchOrg && o === 'org_a', readRefusal, failureWords);
    await create();
    return { ...did, list: rows.value };
};

test('Part 9g: a create over the server\'s 201 — the endpoint listed and its secret shown; never undefined in the list — RUN', async () => {
    const { row, secret } = webhookShapes();
    const r = await webhookCreate({ answer: answerOf(201, { [row]: WH_ROW, [secret]: 'whsec_abc123' }) });
    assert.deepEqual(r.sent, [['/.netlify/functions/webhooks', 'POST', { name: 'Won deals to ERP', targetUrl: 'https://erp.example.test/hook', eventTypes: ['opportunity.won'] }]]);
    assert.deepEqual([r.list, r.secret, r.step, r.error, r.saving, r.loads], [[WH_ROW, WH_A], ['whsec_abc123'], ['created'], [''], [true, false], 0],
        'REGRESSION: undefined put in the list — the next draw threw');
    // Made, but the answer names no endpoint, or cannot be read: still made — never Create again; the list read again.
    for (const answer of [answerOf(201, { [secret]: 'whsec_abc123' }), answerOf(201, { [row]: {}, [secret]: 'whsec_abc123' }), answerOf(201, new SyntaxError("Unexpected token '<'")), answerOf(201, null)]) {
        const m = await webhookCreate({ answer });
        assert.deepEqual([m.created, m.list, m.loads, m.step, m.error], [[null], [WH_A], 1, ['created'], ['']], 'made: the list read again, nothing undefined, nothing said as failed');
        assert.ok(!m.list.includes(undefined));
    }
    const unread = await webhookCreate({ answer: answerOf(201, new SyntaxError("Unexpected token '<'")) });
    assert.deepEqual(unread.secret, [''], 'a secret not read is none — the step says so, never a placeholder to save');
});

test('Part 9g: a create refused, unsent or a 502 page says why, makes nothing; an answer after an org switch does nothing — RUN', async () => {
    const { row, secret } = webhookShapes();
    for (const [answer, why] of [...P9_READ_FAILS().filter(([a]) => !(a.ok)), [answerOf(400, { error: 'Target URL must use HTTPS.' }), 'Target URL must use HTTPS.']]) {
        const r = await webhookCreate({ answer });
        assert.deepEqual([r.error, r.created, r.step, r.secret, r.list, r.saving], [['', why], [], [], [], [WH_A], [true, false]], why);
    }
    for (const answer of [answerOf(201, { [row]: WH_ROW, [secret]: 'whsec_abc123' }), answerOf(201, new SyntaxError("Unexpected token '<'")), answerOf(403, { error: 'Admin only' })]) {
        const r = await webhookCreate({ answer, switchOrg: true });
        assert.deepEqual([r.error, r.created, r.step, r.secret, r.list], [[''], [], [], [], [WH_A]], 'an answer for an org switched away from: nothing written, nothing said');
    }
});

test('Part 9g review fix: a create that lands over a list never read reads the list again — never one endpoint drawn as the whole list — RUN', async () => {
    const { row, secret } = webhookShapes();
    const r = await webhookCreate({ answer: answerOf(201, { [row]: WH_ROW, [secret]: 'whsec_abc123' }), list: [], loadFailed: true });
    assert.deepEqual([r.list, r.loads, r.secret, r.step], [[], 1, ['whsec_abc123'], ['created']],
        'REGRESSION: the made endpoint prepended to a list that was never read — drawn as the whole list, the "could not be read" words gone');
    const read = await webhookCreate({ answer: answerOf(201, { [row]: WH_ROW, [secret]: 'whsec_abc123' }), list: [WH_A], loadFailed: false });
    assert.deepEqual([read.list, read.loads], [[WH_ROW, WH_A], 0], 'a list that was read takes the made endpoint, no second read');
});

test('Part 9g: WIRING — a secret not read is said, never a placeholder to save; the screen hands its onCreated the endpoint or nothing', () => {
    const wh = code(read(WEBHOOKS));
    assert.ok(wh.includes("title={step==='form' ? 'New webhook endpoint' : secret ? 'Endpoint created — save your secret' : 'Endpoint created'}"));
    order(between(wh, '                ) : (\n                    <>', '            <IntModalFooter>'),
        `{secret ? "Save your signing secret now — it won't be shown again." : 'Its signing secret could not be read.'}`, '{!secret ? (', '<div role="alert"',
        'The endpoint was created, but its signing secret could not be read, and it is not shown again. Delete this endpoint and create it again to get a new secret.',
        ') : (', '>{secret}</code>');
    assert.ok(!wh.includes('whsec_••'), 'REGRESSION: a placeholder secret offered to save');
    assert.ok(wh.includes(`<IntBtn label={secret ? "I've saved it — close" : 'Close'} primary onClick={onClose}/>`));
    assert.ok(wh.includes('onCreated={wh => { if (wh && !loadFailed) setWebhooks(prev => [wh, ...prev]); else load(); }}'), 'the list read again for an endpoint the answer did not name, or over a list never read');
});
