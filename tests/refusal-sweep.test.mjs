// tests/refusal-sweep.test.mjs — the rest of the refusal sweep: every refusal and every failed request is said, kept until
// closed, in the house words (state §0.245, guide §18b125 rule 5, §18b123 rule 4; docs/design/refusal-sweep, Jeff's answers
// of 11 Nov: "Parts 1-4 now (Recommended)", Q1-Q20 "All Recommended").
//
// tests/refusals-said.test.mjs stays THE GUARD (its three scans; each Part added the files it cleaned to its list — since
// §0.249, Part 12, scan (iii) reads every source under src/ and the list, CLEANED, is scan (iv)'s alone). This suite
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
//
// Part 10 (state §0.248; Jeff, 12 Nov: "Start Parts 10-11"): the record hooks and their windows. The account, contact,
// task, activity, member and quote saves, the product save, the lead window, the account picker's Create and the deal's
// AI score read their body before the ok check — a 502's page said "Failed to save X. Please check your connection and
// try again." though the server answered (Q3), "Unexpected token '<'" in the lead window and the merge scans, "HTTP N" in
// the account picker. Each reads the ok check first and says the house words: the server's with their ref, else "The
// server returned N.", or "The server could not be reached."; the duplicate scans and Past merges say failureWords.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parse } from '@babel/parser';
import { quotePdfOf } from '../src/utils/quotePdfAnswer.js';
import { quoteTotals } from '../src/utils/quoteTotals.js';
import { quoteMoneyRows } from '../src/utils/quoteMoneyRows.js';
import { fmtMoney, isLiveInvoice } from '../src/utils/invoices.js';
import { esc } from '../src/utils/customerNotifications.js';
import { T } from '../src/tokens.js';
import { readRefusal, failureWords, refusalWords } from '../src/utils/refusalWords.js';
import { withIfRevs, staleOf, STALE_ERROR } from '../src/utils/settingsRevs.js';
import { refusalOf, NETWORK_ERROR } from '../src/utils/storage.js';
import { pressNoticeOf } from '../src/utils/pressNotice.js';
import { taskWriteAnswer } from '../src/utils/taskWrite.js';
import { sentBody, shownRow } from '../src/utils/leaveOut.js';
import { withTiers } from '../src/utils/accountParent.js';
import { dealBody } from '../src/utils/dealNotes.js';
import { contactNamesText } from '../src/utils/oppText.js';
import { notFreedWords } from '../src/utils/dispatchUnassign.js';
import { saveDroppingRefused } from '../src/utils/linkIds.js';
import { legacyPlansToCreate } from '../src/utils/planLinks.js';
import { answerOf as settledBody, liveCountsOf, healthChecksOf, cardStateOf, healthSummaryOf, unreadChecksOf, unreadSentenceOf, allClearOf, mfaAnswerRead } from '../src/utils/settingsCards.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };   // six turns of the loop, not six timers (a timer waits ~15 ms on Windows — §0.251)
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
        { randomUUID: () => 'u' + st.sent.length }, 'Karen Rep', 'clerk_karen'];
    const names = ['requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setTimeout', 'crypto', 'currentUser', 'clerkUserId'];   // clerkUserId since §0.250
    if (which === 'library') {
        const fn = callbackOf(r, 'handleSaveReport', '[currentUser, clerkUserId]');
        st.at = stateOf(null);
        st.place = { current: 't3' };   // savePlaceRef: the screen shown — the Rep scorecard template unless a case moves it
        st.call = new Function(...names, 'setSaveState', 'setSaveError', 'setSavedReportsList', 'setShowCreateReport', 'setCreateMode',
            'setSaveErrorAt', 'savePlaceRef',
            `${fn}\nreturn handleSaveReport;`)(...common, st.state.set, setWords, st.list.set, (v) => st.closed.push(v), (v) => st.modes.push(v),
            st.at.set, st.place);
    } else {
        const fn = callbackOf(r, 'handleSaveAsReport', '[currentUser, clerkUserId, onSaveReport]');
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
    // Moved in §0.249 (Part 12b): refusalWords joins, for the pin's words.
    assert.ok(r.includes("import { readRefusal, refusalWords, failureWords } from '../utils/refusalWords.js';"));
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
    // Moved pin (§0.248, Part 11): New Job's saves read a refusal's body once, for its words and its field (refusalWords).
    assert.ok(d.includes("import { readRefusal, failureWords, refusalWords } from '../utils/refusalWords.js';"));
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
// Moved in §0.249 (review fixes, last pass, F4): a refusal answers its status beside its words (the Sales Manager tells the server's own refusal by
// it, noteNotDeleted); a request that never left has none.
const COACH_REFUSALS = () => [
    [answerOf(403, { error: 'Forbidden: only the author or an Admin may change this note' }), 'Forbidden: only the author or an Admin may change this note', 403],
    [answerOf(500, { error: 'Database error', requestId: 'r9' }), 'Database error (ref r9)', 500],
    [PAGE_502(), 'The server returned 502.', 502],
    [UNSENT(), 'The server could not be reached.', null],
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
        for (const [answer, words, status] of COACH_REFUSALS()) {
            const st = await coaching({ answers: [LOAD_OK(), answer] });
            let r, threw = null;
            try { r = await run(st.hook); } catch (e) { threw = e; }
            assert.equal(threw, null, `REGRESSION: ${what} rejected — the dialog stayed "Saving…" for good (${words})`);
            assert.deepEqual(r, status === null ? { ok: false, error: words } : { ok: false, status, error: words }, `${what}: ${words}`);
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
    // Moved in §0.249 (review fixes, last pass, F4): the refusal's status beside its words.
    order(answered, 'const res = await send();', 'if (!res.ok) return { ok: false, status: res.status, error: await readRefusal(res) };', 'await res.json()', '} catch (e) { return { ok: false, error: failureWords(e) }; }');
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
    // Moved in §0.249 (review fixes, last pass, F4): the delete's words are noteNotDeleted's — "Not deleted" and the hook's words for the server's own
    // refusal or a request that never left, else "may have been deleted" (run in the F4 section at the end).
    assert.ok(sm.includes('if (!r.ok) setSaveState({ status: \'error\', msg: noteNotDeleted(r) });'), 'the delete\'s refusal on that banner');
    assert.ok(sm.includes('\n    ? `Not deleted — ${r.error}`\n'), 'its words: the hook\'s, after "Not deleted"');
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
    // Moved (§0.249, review fixes round 2 — M2): the server's whole answer (clerk-mfa-status.mjs), its two lists too —
    // the tile reads the MFA page's rule (settingsCards.js mfaAnswerRead), and an answer of the numbers alone is unread.
    answerOf(200, { enrolled: 2, total: 3, notEnrolled: [{ userId: 'u3', email: 'c@x.co', name: 'C', role: 'User' }],
        enrolledUsers: [], byRole: [{ role: 'Admin', enrolled: 2, total: 2 }, { role: 'User', enrolled: 0, total: 1 }] }),
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

// ── Part 10 ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The record hooks and their windows (state §0.248, docs/design/refusal-sweep Part 10; Jeff's Q3): each save reads the ok
// check first and says the house words — the server's with their ref, else "The server returned N.", or "The server could
// not be reached." — the list unchanged; a landed answer that cannot be read is saved, the copy sent shown; an answer
// after an org switch writes and says nothing.

// The five answers a member meets, and the words each window says.
const P10_REFUSED = () => [
    [answerOf(403, { error: 'Only the owner or a manager can change this record' }), 'Only the owner or a manager can change this record'],
    [answerOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
    [answerOf(400, {}), 'The server returned 400.'],
    [PAGE_502(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];
// A hook's handler, extracted from the source and built over stubs.
const p10Built = new Map();
const p10Fn = (file, start, end, params, name, tail = end) => {
    const key = `${file}|${start}`;
    if (!p10Built.has(key)) {
        const fn = between(code(read(file)), start, end) + tail;
        p10Built.set(key, new Function(...params, `${fn}\nreturn ${name};`));
    }
    return p10Built.get(key);
};
// A dbFetch that answers `answer` (a thrown Error throws), switching the org first when asked.
const p10Fetch = (did, answer, org, switchOrg) => async (url, opts = {}) => {
    did.sent.push(opts.method || 'GET');
    if (switchOrg) org.now = 'org_b';
    if (answer instanceof Error) throw answer;
    return answer;
};

const ACME = Object.freeze({ id: 'a1', name: 'Acme', industry: 'Steel', accountTier: 'account' });
const saveAccount = async ({ answer, create = false, switchOrg = false }) => {
    const list = [ACME];
    const accts = stateOf(list);
    const did = { errors: [], saving: [], audits: [], closed: [], sent: [] };
    const org = { now: 'org_a' };
    const handleSaveAccount = p10Fn('src/hooks/useAccounts.js', '    const handleSaveAccount = async (', '\n    };\n',
        ['accounts', 'setAccounts', 'setAccountModalError', 'setAccountModalSaving', 'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords',
            'addAudit', 'branchTiers', 'parentRefusal', 'tierUnder', 'byIdOf', 'withTiers', 'console'], 'handleSaveAccount', '\n    };')(
        list, accts.set, (v) => did.errors.push(v), (v) => did.saving.push(v), () => 'org_a', (o) => o === org.now, p10Fetch(did, answer, org, switchOrg),
        readRefusal, failureWords, (...a) => did.audits.push(a), () => ({ tiers: new Map() }), () => 'refused', () => 'account',
        (l) => new Map(l.map((a) => [a.id, a])), withTiers, quiet);
    await handleSaveAccount({ name: 'Acme', industry: 'Glass' }, { editingAccount: create ? null : ACME, editingSubAccount: null, parentAccountForSub: null,
        setShowAccountModal: (v) => did.closed.push(v), setOpportunities: () => {}, setContacts: () => {} });
    return { ...did, list: accts.value, same: accts.value === list, said: did.errors[did.errors.length - 1] };
};

test('Part 10: handleSaveAccount — the five answers: each refusal in the house words, the list unchanged, the window open — RUN', async () => {
    for (const create of [false, true]) {
        for (const [answer, words] of P10_REFUSED()) {
            const r = await saveAccount({ answer, create });
            assert.deepEqual(r.sent, [create ? 'POST' : 'PUT']);
            assert.equal(r.said, words, `${create ? 'create' : 'edit'}: REGRESSION — ${words}`);
            assert.ok(r.same, 'the list unchanged');
            assert.deepEqual([r.audits, r.closed], [[], []], 'no audit; the window stays open');
            assert.equal(r.saving[r.saving.length - 1], false, 'the Save button back');
            assert.ok(!/check your connection|Unexpected token|HTTP \d/.test(r.said), 'never the old words');
        }
    }
});

test('Part 10: handleSaveAccount — landed, the account as stored; a landed answer that cannot be read, the copy sent — RUN', async () => {
    const landed = await saveAccount({ answer: answerOf(200, { account: { ...ACME, industry: 'Glass', updatedAt: 'x' } }) });
    assert.deepEqual(landed.list, [{ ...ACME, industry: 'Glass', updatedAt: 'x' }], 'the account as stored');
    assert.deepEqual([landed.said, landed.closed, landed.audits.length], [null, [false], 1]);
    const unread = await saveAccount({ answer: answerOf(200, new SyntaxError('Unexpected end of JSON input')) });
    assert.deepEqual(unread.list, [{ name: 'Acme', industry: 'Glass', id: 'a1' }], 'saved: the copy sent shown, never a parse error');
    assert.deepEqual([unread.said, unread.closed], [null, [false]]);
    const made = await saveAccount({ answer: answerOf(201, { account: { id: 'a9', name: 'Acme' } }), create: true });
    assert.deepEqual(made.list.map((a) => a.id), ['a1', 'a9']);
});

test('Part 10: handleSaveAccount — an answer after an org switch, refused, landed or unsent, writes and says nothing — RUN', async () => {
    for (const create of [false, true]) {
        for (const answer of [answerOf(403, { error: 'Forbidden' }), PAGE_502(), UNSENT(), answerOf(200, { account: { ...ACME, industry: 'Elsewhere' } })]) {
            const r = await saveAccount({ answer, create, switchOrg: true });
            assert.deepEqual(r.errors, [null], 'REGRESSION: the last org\'s answer said on the window of the org switched to');
            assert.ok(r.same, 'REGRESSION: the last org\'s account written into the list on screen');
            assert.deepEqual([r.audits, r.closed], [[], []]);
        }
    }
});

// The other record windows: contacts, tasks and activities — the pattern held per hook.
const P10_HOOKS = {
    contact: {
        file: 'src/hooks/useContacts.js', start: '    const handleSaveContact = async (', name: 'handleSaveContact',
        call: (h, did, create) => h({ firstName: 'Lee', lastName: 'Ng' }, { editingContact: create ? null : { id: 'c1' }, setShowContactModal: (v) => did.closed.push(v) }),
        landed: { contact: { id: 'c1', firstName: 'Lee', lastName: 'Ng', stored: true } },
    },
    task: {
        file: 'src/hooks/useTasks.js', start: '    const handleSaveTask = async (', name: 'handleSaveTask',
        call: (h, did, create) => h({ title: 'Call back' }, { editingTask: create ? null : { id: 'c1' }, setShowTaskModal: (v) => did.closed.push(v) }),
        landed: { task: { id: 'c1', title: 'Call back', stored: true } },
    },
    activity: {
        file: 'src/hooks/useActivities.js', start: '    const saveActivity = async (', name: 'saveActivity',
        call: (h, did, create, sayer) => h({ type: 'Call', notes: 'n' }, { editingActivity: create ? null : { id: 'c1' }, currentUser: 'Karen Rep', opportunities: [],
            setShowActivityModal: (v) => did.closed.push(v), setFollowUpPrompt: () => {}, setQuickLogOpen: () => {}, setQuickLogForm: () => {}, setQuickLogContactResults: () => {} }, sayer),
        landed: { activity: { id: 'c1', type: 'Call', stored: true } },
    },
};
const P10_HOOK_PARAMS = ['setRows', 'setContactModalError', 'setContactModalSaving', 'setTaskModalError', 'setTaskModalSaving', 'requestOrg', 'stillOrg', 'dbFetch',
    'sentBody', 'shownRow', 'readRefusal', 'refusalWords', 'failureWords', 'addAudit', 'console', 'fireMentionSms',
    // The activity save hands its answer's deal scores to the app's deals (AI scoring batch 2A) — the hook's own helper.
    'adoptScores'];
const ROW_C1 = Object.freeze({ id: 'c1', name: 'as loaded' });
const saveRecord = async (kind, { answer, create = false, switchOrg = false }) => {
    const k = P10_HOOKS[kind];
    const list = [ROW_C1];
    const rows = stateOf(list);
    const did = { errors: [], saving: [], audits: [], closed: [], sent: [] };
    const org = { now: 'org_a' };
    const setError = (v) => did.errors.push(v), setSaving = (v) => did.saving.push(v);
    const setter = { contact: 'setContacts', task: 'setTasks', activity: 'setActivities' }[kind];
    const params = P10_HOOK_PARAMS.map((p) => (p === 'setRows' ? setter : p));
    const h = p10Fn(k.file, k.start, '\n    };\n', params, k.name, '\n    };')(rows.set, setError, setSaving, setError, setSaving, () => 'org_a', (o) => o === org.now,
        p10Fetch(did, answer, org, switchOrg), sentBody, shownRow, readRefusal, refusalWords, failureWords, (...a) => did.audits.push(a), quiet, () => {}, () => {});
    const answered = await k.call(h, did, create, { setActivityModalError: setError, setActivityModalSaving: setSaving });
    return { ...did, answered, list: rows.value, same: rows.value === list, said: did.errors[did.errors.length - 1] };
};

test('Part 10: the contact, task and activity windows — each refusal in the house words, the list unchanged; landed, the row as stored — RUN', async () => {
    for (const kind of Object.keys(P10_HOOKS)) {
        for (const create of [false, true]) {
            for (const [answer, words] of P10_REFUSED()) {
                const r = await saveRecord(kind, { answer, create });
                assert.equal(r.said, words, `${kind} ${create ? 'create' : 'edit'}: REGRESSION — ${words}`);
                assert.ok(r.same, `${kind}: the list unchanged`);
                assert.deepEqual([r.audits, r.closed], [[], []], `${kind}: no audit; the window stays open`);
                assert.equal(r.saving[r.saving.length - 1], false, `${kind}: the Save button back`);
            }
            const landed = await saveRecord(kind, { answer: answerOf(200, P10_HOOKS[kind].landed), create });
            assert.deepEqual([landed.said, landed.closed], [null, [false]], `${kind}: landed`);
            assert.ok(landed.list.some((x) => x.stored), `${kind}: the row as stored`);
            const unread = await saveRecord(kind, { answer: answerOf(200, new SyntaxError('Unexpected end of JSON input')), create });
            assert.deepEqual([unread.said, unread.closed], [null, [false]], `${kind}: a landed answer that cannot be read is saved, never a parse error`);
            assert.ok(!unread.same, `${kind}: the copy sent shown`);
        }
    }
});

test('Part 10: the contact, task and activity windows — an answer after an org switch writes and says nothing — RUN', async () => {
    for (const kind of Object.keys(P10_HOOKS)) {
        for (const create of [false, true]) {
            for (const answer of [answerOf(403, { error: 'Forbidden' }), PAGE_502(), UNSENT(), answerOf(200, P10_HOOKS[kind].landed)]) {
                const r = await saveRecord(kind, { answer, create, switchOrg: true });
                assert.deepEqual(r.errors, [null], `${kind}: REGRESSION — the last org's answer said on the window of the org switched to`);
                assert.ok(r.same, `${kind}: REGRESSION — the last org's row written into the list on screen`);
                assert.deepEqual(r.closed, []);
            }
        }
    }
});

test('Part 10: the activity save answers a refusal with its words and the field it names — the task rail\'s notes drop a refused link (saveDroppingRefused) — RUN', async () => {
    for (const create of [false, true]) {
        const r = await saveRecord('activity', { answer: answerOf(404, { error: 'That contact no longer exists', field: 'contactId', requestId: 'r4' }), create });
        assert.deepEqual(r.answered, { ok: false, status: 404, error: 'That contact no longer exists (ref r4)', field: 'contactId' },
            `${create ? 'create' : 'edit'}: REGRESSION — the refusal's field lost, or its words`);
        const page = await saveRecord('activity', { answer: PAGE_502(), create });
        assert.deepEqual(page.answered, { ok: false, status: 502, error: 'The server returned 502.', field: undefined });
        assert.equal((await saveRecord('activity', { answer: UNSENT(), create })).answered, undefined, 'unsent: no answer, the error shown');
        assert.deepEqual((await saveRecord('activity', { answer: answerOf(200, P10_HOOKS.activity.landed), create })).answered, { ok: true });
    }
});

// The member window (Settings → Users' Add / Edit): the server mints a new member's id.
const saveMember = async ({ answer, create = false, switchOrg = false }) => {
    const settings = stateOf({ users: [{ id: 'usr_1', name: 'Karen Rep' }] });
    const before = settings.value;
    const did = { errors: [], saving: [], closed: [], sent: [], created: [] };
    const org = { now: 'org_a' };
    const h = p10Fn('src/hooks/useUserHandlers.js', '    const handleSaveUser = async (userData) => {', '\n    };\n',
        ['editingUser', 'setUserModalError', 'setUserModalSaving', 'setSettings', 'setShowUserModal', 'setEditingUser', 'showModal', 'setLastCreatedRepName',
            'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'console'], 'handleSaveUser', '\n    };')(
        create ? null : { id: 'usr_1', email: 'k@x.test' }, (v) => did.errors.push(v), (v) => did.saving.push(v), settings.set, (v) => did.closed.push(v), () => {},
        true, (n) => did.created.push(n), () => 'org_a', (o) => o === org.now, p10Fetch(did, answer, org, switchOrg), readRefusal, failureWords, quiet);
    await h({ name: 'Karen Rep', email: 'k@x.test', role: 'User' });
    return { ...did, same: settings.value === before, users: settings.value.users, said: did.errors[did.errors.length - 1] };
};

test('Part 10: the member window — each refusal in the house words, nothing listed; landed, the member as stored; after a switch nothing — RUN', async () => {
    for (const create of [false, true]) {
        for (const [answer, words] of P10_REFUSED()) {
            const r = await saveMember({ answer, create });
            assert.equal(r.said, words, `${create ? 'create' : 'edit'}: REGRESSION — ${words}`);
            assert.ok(r.same, 'nothing listed');
            assert.deepEqual(r.closed, [], 'the window stays open');
            assert.equal(r.saving[r.saving.length - 1], false);
        }
        const landed = await saveMember({ answer: answerOf(create ? 201 : 200, { user: { id: create ? 'usr_9' : 'usr_1', name: 'Karen Rep', stored: true } }), create });
        assert.deepEqual([landed.said, landed.closed], [null, [false]]);
        assert.ok(landed.users.some((u) => u.stored), 'the member as stored');
        for (const answer of [answerOf(403, { error: 'Forbidden' }), PAGE_502(), UNSENT(), answerOf(200, { user: { id: 'usr_1', name: 'Elsewhere' } })]) {
            const r = await saveMember({ answer, create, switchOrg: true });
            assert.deepEqual([r.errors, r.closed], [[null], []], 'an answer after an org switch says nothing');
            assert.ok(r.same, 'and writes nothing');
        }
    }
    // A new member whose landed answer cannot be read: the server minted the id — said, never "not saved", nothing listed.
    const unread = await saveMember({ answer: answerOf(201, new SyntaxError("Unexpected token '<'")), create: true });
    assert.equal(unread.said, 'Its answer could not be read.');
    assert.ok(unread.same);
    // An edit's: saved, the window closed, the list as it was.
    const edited = await saveMember({ answer: answerOf(200, new SyntaxError("Unexpected token '<'")) });
    assert.deepEqual([edited.said, edited.closed], [null, [false]]);
});

// The quote window's save and the Price Book's product save (useQuotes: useCallback-wrapped).
const quotesFn = (start, name) => p10Fn('src/hooks/useQuotes.js', start, '\n    }, []);', ['useCallback', 'setQuotes', 'setProducts', 'setQuoteModalError', 'setQuoteModalSaving',
    'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords'], name);
const saveQuoteOrProduct = async (which, { answer, create = false, switchOrg = false }) => {
    const quotes = stateOf([{ id: 'qt_1', title: 'as loaded' }]);
    const products = stateOf([{ id: 'prod_1', name: 'as loaded' }]);
    const before = [quotes.value, products.value];
    const did = { errors: [], saving: [], sent: [] };
    const org = { now: 'org_a' };
    const h = (which === 'quote'
        ? quotesFn('    const handleSaveQuote = useCallback(', 'handleSaveQuote')
        : quotesFn('    const handleSaveProduct = useCallback(', 'handleSaveProduct'))(
        (f) => f, quotes.set, products.set, (v) => did.errors.push(v), (v) => did.saving.push(v), () => 'org_a', (o) => o === org.now,
        p10Fetch(did, answer, org, switchOrg), readRefusal, failureWords);
    const answered = await h({ title: 'T', name: 'P' }, create ? null : (which === 'quote' ? { id: 'qt_1' } : { id: 'prod_1' }));
    return { ...did, answered, same: quotes.value === before[0] && products.value === before[1], quotes: quotes.value, products: products.value,
        said: which === 'quote' ? did.errors[did.errors.length - 1] : answered?.error };
};

test('Part 10: the quote window and the Price Book — each refusal in the house words, never "check your connection"; landed, as stored; after a switch nothing — RUN', async () => {
    for (const which of ['quote', 'product']) {
        for (const create of [false, true]) {
            for (const [answer, words] of P10_REFUSED()) {
                const r = await saveQuoteOrProduct(which, { answer, create });
                assert.equal(r.said, words, `${which} ${create ? 'create' : 'edit'}: REGRESSION — ${words}`);
                assert.ok(r.same, `${which}: nothing listed`);
                if (which === 'quote') assert.equal(r.answered, null, 'the quote save answers null');
                else assert.deepEqual(r.answered, { ok: false, error: words }, 'the product save answers { ok: false, error }');
            }
            const stored = which === 'quote' ? { quote: { id: 'qt_1', title: 'T', stored: true } } : { product: { id: 'prod_1', name: 'P', stored: true } };
            const landed = await saveQuoteOrProduct(which, { answer: answerOf(200, stored), create });
            assert.ok((which === 'quote' ? landed.quotes : landed.products).some((x) => x.stored), `${which}: as stored`);
            for (const answer of [answerOf(403, { error: 'Forbidden' }), PAGE_502(), UNSENT(), answerOf(200, stored)]) {
                const r = await saveQuoteOrProduct(which, { answer, create, switchOrg: true });
                assert.ok(r.same, `${which}: REGRESSION — the last org's answer written after a switch`);
                if (which === 'quote') assert.deepEqual([r.errors, r.answered], [[null], null], 'the quote window says nothing');
                else assert.deepEqual(r.answered, { ok: false, quiet: true }, 'the product save answers quiet');
            }
        }
    }
});

// The lead window's save (LeadModal doSave): its words on the form's server line.
const saveLead = async ({ answer }) => {
    const did = { errors: [], saving: [], sent: [] };
    const doSave = p10Fn('src/components/modals/LeadModal.jsx', '    const doSave = async () => {', '\n    };', ['validate', 'setSaving', 'buildPayload', 'dbFetch',
        'readRefusal', 'failureWords', 'setErrors'], 'doSave')(() => true, (v) => did.saving.push(v), () => ({ id: 'id_l1', name: 'Lee Ng' }),
        p10Fetch(did, answer, { now: 'org_a' }, false), readRefusal, failureWords, (v) => did.errors.push(v));
    return { ...did, saved: await doSave() };
};

test('Part 10: the lead window — a refusal in the house words, never "Unexpected token \'<\'"; landed, the lead as stored — RUN', async () => {
    for (const [answer, words] of P10_REFUSED()) {
        const r = await saveLead({ answer });
        assert.equal(r.saved, null, 'nothing saved');
        assert.deepEqual(r.errors, [{ _server: words }], `REGRESSION: ${words}`);
        assert.equal(r.saving[r.saving.length - 1], false);
    }
    assert.deepEqual((await saveLead({ answer: answerOf(201, { lead: { id: 'id_l1', stored: true } }) })).saved, { id: 'id_l1', stored: true });
    const unread = await saveLead({ answer: answerOf(201, new SyntaxError("Unexpected token '<'")) });
    assert.deepEqual([unread.saved, unread.errors], [{ id: 'id_l1', name: 'Lee Ng' }, []], 'a landed answer that cannot be read: saved, the copy sent');
});

// The account picker's Create (a deal's, a contact's Company): its words on the screen's onError, the name named.
const createPicked = async ({ answer, switchOrg = false }) => {
    const accounts = stateOf([ACME]);
    const did = { said: [], sent: [], picked: [], creating: [] };
    const org = { now: 'org_a' };
    const createAccount = p10Fn('src/components/rails/AccountPicker.jsx', '    const createAccount = async () => {', '\n    };', ['value', 'creating', 'setCreating',
        'onError', 'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setAccounts', 'pick'], 'createAccount')(
        'Beta Corp', false, (v) => did.creating.push(v), (v) => did.said.push(v), () => 'org_a', (o) => o === org.now, p10Fetch(did, answer, org, switchOrg),
        readRefusal, failureWords, accounts.set, (a) => did.picked.push(a));
    await createAccount();
    return { ...did, list: accounts.value };
};

test('Part 10: the account picker\'s Create — a refusal in the house words, never "HTTP N"; landed, picked; after a switch nothing — RUN', async () => {
    for (const [answer, words] of P10_REFUSED()) {
        const r = await createPicked({ answer });
        assert.deepEqual(r.said, [null, `Couldn't create account "Beta Corp". ${words}`], `REGRESSION: ${words}`);
        assert.deepEqual([r.picked, r.list.length], [[], 1], 'nothing made, nothing picked');
        assert.equal(r.creating[r.creating.length - 1], false);
    }
    const landed = await createPicked({ answer: answerOf(201, { account: { id: 'a9', name: 'Beta Corp', stored: true } }) });
    assert.deepEqual([landed.said, landed.picked.map((a) => a.id), landed.list.length], [[null], ['a9'], 2]);
    for (const answer of [answerOf(403, { error: 'Forbidden' }), PAGE_502(), UNSENT(), answerOf(201, { account: { id: 'a9', name: 'Beta Corp' } })]) {
        const r = await createPicked({ answer, switchOrg: true });
        assert.deepEqual([r.said, r.picked, r.list.length], [[null], [], 1], 'REGRESSION: the last org\'s answer said, picked or listed after a switch');
    }
});

// The deal window's AI score (AiScoreTab fetchScore).
const scoreDeal = async ({ answer, switchOrg = false }) => {
    const opps = stateOf([{ id: 'd1', opportunityName: 'Acme renewal' }]);
    const before = opps.value;
    const did = { errors: [], sent: [], scored: [], off: [], loading: [] };
    const org = { now: 'org_a' };
    const fetchScore = p10Fn('src/components/modals/OpportunityModal.jsx', '    const fetchScore = async (forceRefresh = false) => {', '\n    };', ['opportunity', 'requestOrg',
        'stillOrg', 'setLoading', 'setError', 'dbFetch', 'readRefusal', 'failureWords', 'setOff', 'storedScore', 'setOpportunities', 'onScored'], 'fetchScore')(
        { id: 'd1' }, () => 'org_a', (o) => o === org.now, (v) => did.loading.push(v), (v) => did.errors.push(v), p10Fetch(did, answer, org, switchOrg),
        readRefusal, failureWords, (v) => did.off.push(v), (d) => (d && d.score && typeof d.score === 'object' ? d.score : null), opps.set, (s) => did.scored.push(s));
    await fetchScore(false);
    return { ...did, same: opps.value === before, said: did.errors[did.errors.length - 1] };
};

test('Part 10: the deal\'s AI score — a refusal in the house words, never "Scoring failed" or a raw message; landed, the score; after a switch nothing — RUN', async () => {
    for (const [answer, words] of P10_REFUSED()) {
        const r = await scoreDeal({ answer });
        assert.equal(r.said, words, `REGRESSION: ${words}`);
        assert.deepEqual([r.scored, r.same], [[], true]);
        assert.equal(r.loading[r.loading.length - 1], false);
    }
    const landed = await scoreDeal({ answer: answerOf(200, { score: { score: 72, verdict: 'On Track' } }) });
    assert.deepEqual([landed.said, landed.scored], [null, [{ score: 72, verdict: 'On Track' }]]);
    assert.deepEqual((await scoreDeal({ answer: answerOf(200, { disabled: true }) })).off, [true], 'the org\'s switch off: said as off');
    assert.equal((await scoreDeal({ answer: answerOf(200, new SyntaxError("Unexpected token '<'")) })).said, 'The answer carried no score.', 'a landed answer that cannot be read carries no score');
    for (const answer of [answerOf(403, { error: 'Forbidden' }), PAGE_502(), UNSENT(), answerOf(200, { score: { score: 72 } })]) {
        const r = await scoreDeal({ answer, switchOrg: true });
        assert.deepEqual([r.errors, r.scored, r.same], [[null], [], true], 'REGRESSION: the last org\'s answer said or written after a switch');
    }
});

// The duplicate scans and Past merges (useMerge): a refusal thrown in the server's words, said by failureWords.
const mergeReader = (start, name, answer) => p10Fn('src/hooks/useMerge.js', start, '\n    };', ['dbFetch', 'readRefusal'], name)(
    () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)), readRefusal);
const thrownWords = async (run) => { try { await run(); return null; } catch (e) { return failureWords(e); } };

test('Part 10: the duplicate scans and Past merges — a refusal in the server\'s words, a page or a lost answer in plain words, never "Unexpected token \'<\'" — RUN', async () => {
    const readers = [
        ["    const findDuplicates = async (tier = 'duplicate') => {", 'findDuplicates'],
        ["    const findContactDuplicates = async (tier = 'duplicate') => {", 'findContactDuplicates'],
        ['    const findMerges = async (entityType) => {', 'findMerges'],
    ];
    for (const [start, name] of readers) {
        const expected = [
            [answerOf(403, { error: 'Only admins and managers can merge records.' }), 'Only admins and managers can merge records.'],
            [answerOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
            [PAGE_502(), 'The server returned 502.'],
            [UNSENT(), name === 'findMerges' ? 'No answer from the server.' : 'The server could not be reached.'],
            [answerOf(200, new SyntaxError("Unexpected token '<'")), name === 'findMerges' ? 'No answer from the server.' : 'Its answer could not be read.'],
        ];
        for (const [answer, words] of expected) {
            assert.equal(await thrownWords(() => mergeReader(start, name, answer)('account')), words, `${name}: REGRESSION — ${words}`);
        }
        const landed = name === 'findMerges' ? { merges: [], more: false } : { tier: 'duplicate', pairs: [] };
        assert.deepEqual(await mergeReader(start, name, answerOf(200, landed))('account'), landed, `${name}: landed`);
    }
});

// The scan views' runScan and Past merges' load, extracted and run: each says failureWords; an overtaken answer nothing.
const scanRun = (file) => async ({ fail, overtaken = false }) => {
    const did = { errors: [], data: [], loading: [] };
    const scanGen = { current: 0 };
    const fdRef = { current: async () => { if (overtaken) scanGen.current++; if (fail) throw fail; return { pairs: [] }; } };
    const runScan = p10Fn(file, '    const runScan = useCallback(async (t) => {', '\n    }, []);', ['useCallback', 'scanGen', 'fdRef', 'setLoading', 'setError', 'setData', 'failureWords'], 'runScan')(
        (f) => f, scanGen, fdRef, (v) => did.loading.push(v), (v) => did.errors.push(v), (v) => did.data.push(v), failureWords);
    await runScan('duplicate');
    return did;
};
const pastMergesLoad = async ({ fail }) => {
    const did = { errors: [], data: [] };
    const load = p10Fn('src/Tabs/PastMerges.jsx', '    const load = useCallback(async () => {', '\n    }, [entityType]);', ['useCallback', 'loadGen', 'fmRef', 'entityType', 'setError', 'setData', 'failureWords', 'setLastSaid'], 'load')(
        (f) => f, { current: 0 }, { current: async () => { if (fail) throw fail; return { merges: [] }; } }, 'account', (v) => did.errors.push(v), (v) => did.data.push(v), failureWords, () => {});
    await load();
    return did;
};

test('Part 10: the duplicate scan views and Past merges say failureWords — the server\'s words pass, never "Failed to fetch"; an overtaken scan says nothing — RUN', async () => {
    for (const file of ['src/Tabs/DuplicateScanView.jsx', 'src/Tabs/ContactDuplicateScanView.jsx']) {
        const run = scanRun(file);
        assert.deepEqual((await run({ fail: new Error('Only admins and managers can merge records.') })).errors, [null, 'Only admins and managers can merge records.'], file);
        assert.deepEqual((await run({ fail: UNSENT() })).errors, [null, 'The server could not be reached.'], `${file}: REGRESSION — "Failed to fetch"`);
        assert.deepEqual((await run({ fail: new SyntaxError("Unexpected token '<'") })).errors, [null, 'Its answer could not be read.'], `${file}: REGRESSION — a parse error's words`);
        assert.deepEqual((await run({ fail: UNSENT(), overtaken: true })).errors, [null], `${file}: an overtaken scan says nothing`);
        assert.deepEqual((await run({})).data, [{ pairs: [] }]);
    }
    assert.deepEqual((await pastMergesLoad({ fail: new Error('No answer from the server.') })).errors, [null, 'Past merges did not load — No answer from the server.']);
    assert.deepEqual((await pastMergesLoad({ fail: new SyntaxError("Unexpected token '<'") })).errors, [null, 'Past merges did not load — Its answer could not be read.'],
        'REGRESSION: a runtime error\'s own words');
    assert.deepEqual((await pastMergesLoad({})).data, [{ merges: [] }]);
});

test('Part 10: WIRING — every window reads the ok check first and says the house words; no old sentence left; the loads\' "HTTP N" reaches the console alone', () => {
    const FILES = ['src/hooks/useAccounts.js', 'src/hooks/useActivities.js', 'src/hooks/useContacts.js', 'src/hooks/useTasks.js', 'src/hooks/useQuotes.js',
        'src/hooks/useUserHandlers.js', 'src/hooks/useMerge.js', 'src/components/modals/LeadModal.jsx', 'src/components/rails/AccountPicker.jsx',
        'src/components/modals/OpportunityModal.jsx', 'src/Tabs/DuplicateScanView.jsx', 'src/Tabs/ContactDuplicateScanView.jsx', 'src/Tabs/PastMerges.jsx'];
    for (const f of FILES) {
        const s = code(read(f));
        assert.ok(!/check your connection/i.test(s), `${f}: REGRESSION — "check your connection" when the server answered`);
        assert.ok(!/Failed to save (account|contact|task|activity|user|quote)\. Please try again/.test(s), `${f}: REGRESSION — a refusal with no words said as a fallback`);
        assert.ok(!s.includes("'Scan failed. Please try again.'") && !s.includes("'Scoring failed'") && !s.includes("'Failed to save lead'"), `${f}: an old fallback`);
        assert.ok(/import \{[^}]*\b(readRefusal|refusalWords|failureWords)\b[^}]*\} from '(\.\.\/)+utils\/refusalWords\.js';/.test(s), `${f}: the house words imported`);
    }
    // The hooks' loads throw 'HTTP ' + status into a catch that only logs — no member sees those words (the banner is
    // dbStatusOf's); none other is left.
    for (const [f, list] of [['src/hooks/useAccounts.js', 'accounts'], ['src/hooks/useActivities.js', 'activities'], ['src/hooks/useContacts.js', 'contacts'], ['src/hooks/useTasks.js', 'tasks']]) {
        const s = code(read(f));
        assert.equal(count(s, "'HTTP '"), 1, `${f}: only the load's`);
        order(s, "if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })", `.catch(err => console.error('Failed to load ${list}:', err));`);
    }
    for (const f of FILES.slice(4)) assert.ok(!code(read(f)).includes("'HTTP '"), `${f}: REGRESSION — "HTTP N" said`);
    assert.ok(code(read('src/components/rails/AccountPicker.jsx')).includes('onError && onError(`Couldn\'t create account "${name}". ${failureWords(e)}`);'));
    assert.ok(code(read('src/Tabs/PastMerges.jsx')).includes('setError(`Past merges did not load — ${failureWords(e)}`)'));
});

// The review of Part 10 (§0.248): a read that failed is never a count or "none". A scan view draws only a landed scan of
// the tier showing — a failed one, or one still out after a toggle, shows no pairs, no count ("—") and no "none"; a failed
// re-scan clears the last; Past merges' failed read leaves no list.
const SCAN_VIEW_FILES = [['src/Tabs/DuplicateScanView.jsx', 'accounts'], ['src/Tabs/ContactDuplicateScanView.jsx', 'contacts']];
// The view's shown / counts / pairs lines, extracted and run over a held scan and the tier showing.
const scanShownOf = (file) => new Function('data', 'tier',
    `${between(code(read(file)), '    const shown  = ', '\n\n    const openMerge')}\nreturn { shown, counts, pairs };`);
// runScan run twice on one generation counter: the first answer, then the second (an Error throws; overtaken when asked).
const scanTwice = (file) => async (first, second, { overtaken = false } = {}) => {
    const did = { errors: [], data: [] };
    const scanGen = { current: 0 };
    const answers = [first, second];
    const fdRef = { current: async () => { const a = answers.shift(); if (overtaken && !answers.length) scanGen.current++; if (a instanceof Error) throw a; return a; } };
    const runScan = p10Fn(file, '    const runScan = useCallback(async (t) => {', '\n    }, []);', ['useCallback', 'scanGen', 'fdRef', 'setLoading', 'setError', 'setData', 'failureWords'], 'runScan')(
        (f) => f, scanGen, fdRef, () => {}, (v) => did.errors.push(v), (v) => did.data.push(v), failureWords);
    await runScan('duplicate');
    await runScan('duplicate');
    return did;
};
// Past merges' load run over a sequence of answers on one generation counter.
const pastMergesReload = async (answers, { overtakenAt = -1 } = {}) => {
    const did = { errors: [], data: [], lastSaid: [] };
    const loadGen = { current: 0 };
    let i = 0;
    const fmRef = { current: async () => { const at = i++; const a = answers[at]; if (at === overtakenAt) loadGen.current++; if (a instanceof Error) throw a; return a; } };
    const load = p10Fn('src/Tabs/PastMerges.jsx', '    const load = useCallback(async () => {', '\n    }, [entityType]);', ['useCallback', 'loadGen', 'fmRef', 'entityType', 'setError', 'setData', 'failureWords', 'setLastSaid'], 'load')(
        (f) => f, loadGen, fmRef, 'account', (v) => did.errors.push(v), (v) => did.data.push(v), failureWords, (v) => did.lastSaid.push(v));
    for (let n = 0; n < answers.length; n++) await load();
    return did;
};

test('Part 10 review fix: a scan view draws only a landed scan of the tier showing — no other tier\'s pairs, no count for a scan never read — RUN', () => {
    const PAIR = { a: { id: 'a1' }, b: { id: 'a2' } };
    const DUP = { tier: 'duplicate', pairs: [PAIR], counts: { duplicate: 1, related: 4 }, scanned: 9, truncated: false };
    for (const [file] of SCAN_VIEW_FILES) {
        const of = scanShownOf(file);
        assert.deepEqual(of(null, 'duplicate'), { shown: null, counts: undefined, pairs: [] }, `${file}: REGRESSION — a scan never read counted as 0`);
        assert.deepEqual(of(DUP, 'related'), { shown: null, counts: undefined, pairs: [] },
            `${file}: REGRESSION — the duplicate tier's pairs or counts drawn under "Possibly related" while its own scan is out or failed`);
        assert.deepEqual(of(DUP, 'duplicate'), { shown: DUP, counts: DUP.counts, pairs: [PAIR] }, `${file}: a landed scan of the tier showing`);
        assert.deepEqual(of({ ...DUP, pairs: undefined }, 'duplicate').pairs, []);
    }
});

test('Part 10 review fix: a failed re-scan clears the last scan\'s pairs and counts beside its error; one a later scan overtook clears nothing — RUN', async () => {
    const LANDED = { tier: 'duplicate', pairs: [{ a: { id: 'a1' }, b: { id: 'a2' } }], counts: { duplicate: 1, related: 0 }, scanned: 2 };
    for (const [file] of SCAN_VIEW_FILES) {
        const run = scanTwice(file);
        for (const [fail, words] of [[new Error('Internal server error (ref r1)'), 'Internal server error (ref r1)'], [UNSENT(), 'The server could not be reached.'],
            [new SyntaxError("Unexpected token '<'"), 'Its answer could not be read.']]) {
            const r = await run(LANDED, fail);
            assert.deepEqual(r.data, [LANDED, null], `${file}: REGRESSION — the last scan's pairs and counts kept beside "${words}"`);
            assert.deepEqual(r.errors, [null, null, words]);
        }
        const overtaken = await run(LANDED, UNSENT(), { overtaken: true });
        assert.deepEqual([overtaken.data, overtaken.errors], [[LANDED], [null, null]], `${file}: REGRESSION — an overtaken failure cleared the latest scan`);
        assert.deepEqual((await run(LANDED, LANDED)).data, [LANDED, LANDED]);
    }
});

test('Part 10 review fix: WIRING — the scan views\' pills, "N scanned", truncated line, Scanning… and empty state read the scan of the tier showing; "—" for a count never read', () => {
    for (const [file, noun] of SCAN_VIEW_FILES) {
        const s = code(read(file));
        for (const pin of ["{count ?? '—'}", "pill('duplicate', 'Likely duplicates', counts?.duplicate)", "pill('related', 'Possibly related', counts?.related)",
            `{shown ? \`\${shown.scanned} ${noun} scanned\` : ''}`, '{shown?.truncated && (', '{loading && !shown && (', '{!loading && shown && pairs.length === 0 && (']) {
            assert.equal(count(s, pin), 1, `${file}: REGRESSION — ${pin}`);
        }
        assert.ok(!s.includes('{ duplicate: 0, related: 0 }'), `${file}: REGRESSION — a scan that failed counted as 0`);
        assert.ok(!/\bdata(\?\.|\.)(pairs|counts|scanned|truncated)\b/.test(s), `${file}: REGRESSION — a field read off a scan of either tier`);
        assert.ok(!/[{(]\s*!?loading && !?data\b/.test(s), `${file}: REGRESSION — Scanning… or "none" read off a scan of either tier`);
        order(s, '        } catch (e) {', '            if (gen === scanGen.current) setData(null);', '            if (gen === scanGen.current) setError(failureWords(e));');
    }
});

test('Part 10 review fix: Past merges — a failing load after a landed one leaves no list (never "No merges yet." or a stale Undo beside the error); an overtaken one clears nothing — RUN', async () => {
    const LIST = { merges: [{ id: 'mg_1', status: 'merged' }], more: false };
    for (const [fail, words] of [[new Error('Internal server error (ref r1)'), 'Internal server error (ref r1)'], [new SyntaxError("Unexpected token '<'"), 'Its answer could not be read.']]) {
        const r = await pastMergesReload([LIST, fail]);
        assert.deepEqual(r.data, [LIST, null], `REGRESSION: the last list kept beside "Past merges did not load — ${words}"`);
        assert.deepEqual(r.errors, [null, null, `Past merges did not load — ${words}`]);
        assert.deepEqual(r.lastSaid, [null], 'REGRESSION: a landed list kept an old Undo\'s words for the banner (the review\'s verify)');
    }
    const overtaken = await pastMergesReload([LIST, new Error('x')], { overtakenAt: 1 });
    assert.deepEqual([overtaken.data, overtaken.errors], [[LIST], [null, null]], 'an overtaken failure clears nothing and says nothing');
    assert.ok(code(read('src/Tabs/PastMerges.jsx')).includes('catch (e) { if (gen === loadGen.current) { setData(null); setError(`Past merges did not load — ${failureWords(e)}`); } }'));
});

test('Part 10 review\'s verify: Past merges — an Undo whose re-read failed is said in the banner, where no row holds it — WIRING', () => {
    const s = code(read('src/Tabs/PastMerges.jsx'));
    assert.equal(count(s, 'if (r?.words) { setSaid((s) => ({ ...s, [m.id]: r.words })); setLastSaid(r.words); }'), 1, 'REGRESSION: the Undo\'s words never reach the banner');
    assert.equal(count(s, '{!data && lastSaid && <div style={{ marginTop: 6, color: T.inkMid }}>{lastSaid}</div>}'), 1, 'REGRESSION: an Undo whose re-read failed is said nowhere');
    order(s, '{error && (', '{error}', '{!data && lastSaid && <div', '{data && merges.length === 0 && (');
});

// ── Part 11 ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Dispatch's remaining reads and words (state §0.248, docs/design/refusal-sweep Part 11; Jeff, 12 Nov: "Start Parts
// 10-11" — Q13, Q20 "Recommended"). The sites above recordVisit: the schedule and held-crew saves, the customer and
// technician saves, the job's invoice panel (its read and its writes), the Invoices list, the job record's address read
// and its save, the shift pattern's Save and a technician's job card. Each read its body before the ok check and said
// "HTTP N" (the ref dropped), "check your connection" though the server answered, or a raw e.message ("Failed to
// fetch", "Unexpected token '<'"). Each reads the ok check first and says the house words — a 403 the role's sentence
// (Q13) — each catch failureWords; an answer after an org switch says nothing. A landed invoice answer that cannot be
// read is said ("… — Its answer could not be read. Reload to see it."), never adopted as {} nor shown as no invoices
// and $0.00; an address that could not be read is said in its panel's place (Q20), never shown as a job with none.

// An answer whose body reads once, as a real Response's does: a body read before the ok check leaves readRefusal
// nothing to read, and the server's words are lost.
const onceOf = (status, body) => {
    let used = false;
    return { ok: status >= 200 && status < 300, status, json: async () => {
        if (used) throw new TypeError('Body is unusable: Body has already been read');
        used = true;
        if (body instanceof Error) throw body;
        return body;
    } };
};
const P11_PAGE = () => onceOf(502, new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"));
const P11_UNREADABLE = () => onceOf(200, new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"));
// The refusals a save meets, and its words: a 403 is the role's sentence where the screen has one (Q13).
const p11Refusals = (role = 'Forbidden: dispatch role required') => [
    [onceOf(403, { error: 'Forbidden: dispatch role required' }), role],
    [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
    [onceOf(409, {}), 'The server returned 409.'],
    [P11_PAGE(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];
// A dbFetch over stubs: each request recorded; the org switched as request `switchAt` goes out; `answers` one answer
// or a function of the URL; a thrown Error throws; `gate` holds the answer until released.
const p11Fetch = (did, answers, org, { switchAt = -1, gate = null } = {}) => async (url, opts = {}) => {
    did.sent.push([url, opts.method || 'GET', opts.body ? JSON.parse(opts.body) : undefined]);
    if (did.sent.length - 1 === switchAt) org.now = 'org_b';
    if (gate) await gate.held;
    const a = typeof answers === 'function' ? answers(url) : answers;
    if (a instanceof Error) throw a;
    return a;
};
const p11Gate = () => { const g = {}; g.held = new Promise((r) => { g.release = r; }); return g; };
// A useEffect's callback, extracted from DispatchTab.jsx and built over stubs: returns the effect (which returns its cleanup).
const p11Effects = new Map();
const p11Effect = (start, end, params) => {
    if (!p11Effects.has(start)) p11Effects.set(start, new Function(...params, `return ${between(dispatchSrc(), start, end)}\n    };`));
    return p11Effects.get(start);
};

// handleSchedule and writeHeldCrew (CrewBuilderView), extracted and run.
const SJOB = Object.freeze({ id: 'job_1', title: 'Boiler service', customer: 'Acme', durationHrs: 2, scheduledDate: '2026-11-16', equipCategories: [] });
const STORED_JOB = Object.freeze({ id: 'job_1', title: 'Boiler service', status: 'scheduled', scheduledStart: '09:00' });
const crewSave = async ({ answer, held = null, switchAt = -1 }) => {
    const did = { sent: [], errors: [], notices: [], saving: [], scheduled: [], heldSaid: [], added: [] };
    const org = { now: 'org_a' };
    const fetch = p11Fetch(did, answer, org, { switchAt });
    const stillOrg = (o) => o === org.now;
    const techs = [{ id: 'tech_1', name: 'Ann Lee' }];
    if (held) {
        const writeHeldCrew = p10Fn(DISPATCH, '    const writeHeldCrew = async (ids) => {', '\n    };',
            ['selectedJob', 'setScheduleError', 'setScheduleNotice', 'setSaving', 'requestOrg', 'dbFetch', 'stillOrg', 'readRefusal', 'techs', 'onHeld',
                'setAddedTechs', 'showNotice', 'failureWords'], 'writeHeldCrew')(
            SJOB, (v) => did.errors.push(v), () => {}, (v) => did.saving.push(v), () => 'org_a', fetch, stillOrg, readRefusal, techs,
            (h) => did.heldSaid.push(h), (v) => did.added.push(v), (v) => did.notices.push(v), failureWords);
        await writeHeldCrew(held);
    } else {
        const handleSchedule = p10Fn(DISPATCH, '    const handleSchedule = async () => {', '\n    };',
            ['addedTechs', 'selectedJob', 'scheduleDate', 'scheduleTime', 'setScheduleError', 'techs', 'shiftForDate', 'hhToNum', 'blocksOnDate', 'blocks',
                'blockTypes', 'equipmentConflicts', 'jobs', 'equipUnits', 'describeConflict', 'pickEquipmentFor', 'overlappingRivals', 'setScheduleNotice',
                'setSaving', 'requestOrg', 'dbFetch', 'stillOrg', 'readRefusal', 'candidates', 'onScheduled', 'showNotice', 'to12h', 'unitLabel',
                'setAddedTechs', 'setScheduleTime', 'setScheduleDate', 'failureWords'], 'handleSchedule')(
            { tech_1: true }, SJOB, '2026-11-16', '09:00', (v) => did.errors.push(v), techs, () => null, (s) => Number(String(s).split(':')[0]), () => [], [],
            [], () => [], [SJOB], [], String, () => ({ picked: [] }), () => [], () => {},
            (v) => did.saving.push(v), () => 'org_a', fetch, stillOrg, readRefusal, [{ tech: techs[0], blockers: [] }], (s) => did.scheduled.push(s),
            (v) => did.notices.push(v), (t) => t, (id) => id, (v) => did.added.push(v), () => {}, () => {}, failureWords);
        await handleSchedule();
    }
    return did;
};

test('Part 11: the schedule and the held crew — each refusal in the house words, a 403 the role\'s sentence; nothing scheduled — RUN', async () => {
    for (const held of [null, ['tech_1']]) {
        for (const [answer, words] of p11Refusals('Your role cannot schedule jobs.')) {
            const did = await crewSave({ answer, held });
            assert.deepEqual(did.errors, ['', words], `${held ? 'held' : 'schedule'}: REGRESSION — "HTTP N", the ref dropped, or "Failed to fetch": ${words}`);
            assert.deepEqual([did.scheduled, did.heldSaid, did.notices, did.added], [[], [], [], []], 'nothing scheduled, held or said as done');
            assert.equal(did.sent.length, 1);
            assert.equal(did.saving[did.saving.length - 1], false, 'the Save is free again');
        }
    }
    // The schedule's PUT as before: the job, the crew and the time.
    const did = await crewSave({ answer: onceOf(500, { error: 'x' }) });
    assert.deepEqual([did.sent[0][0], did.sent[0][1]], ['/.netlify/functions/dispatch-jobs?id=job_1', 'PUT']);
    assert.equal(did.sent[0][2].status, 'scheduled');
});

test('Part 11: the schedule and the held crew — landed, as before; a landed answer that cannot be read keeps the job as sent — RUN', async () => {
    const landed = await crewSave({ answer: onceOf(200, { job: STORED_JOB }) });
    assert.deepEqual(landed.errors, ['']);
    assert.equal(landed.scheduled.length, 1);
    assert.equal(landed.scheduled[0].serverJob, STORED_JOB, 'the job as stored');
    assert.match(landed.notices[0], /^Scheduled — Ann Lee on 2026-11-16 at 09:00\./);
    const unreadable = await crewSave({ answer: P11_UNREADABLE() });
    assert.deepEqual(unreadable.errors, ['']);
    assert.equal(unreadable.scheduled[0].serverJob, null, 'landed: the board keeps the job as sent, as before');
    const held = await crewSave({ answer: onceOf(200, { job: STORED_JOB }), held: ['tech_1'] });
    assert.deepEqual([held.errors, held.heldSaid.map((h) => h.crewNames)], [[''], [['Ann Lee']]]);
    assert.match(held.notices[0], /^Crew held — Ann Lee\./);
});

test('Part 11: the schedule and the held crew — an answer after an org switch, refused, landed or unsent, says and writes nothing — RUN', async () => {
    for (const held of [null, ['tech_1']]) {
        for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'Internal server error', requestId: 'r1' }), P11_PAGE(), onceOf(200, { job: STORED_JOB })]) {
            const did = await crewSave({ answer, held, switchAt: 0 });
            assert.deepEqual([did.errors, did.scheduled, did.heldSaid, did.notices], [[''], [], [], []], `${held ? 'held' : 'schedule'}: REGRESSION — an answer from the org left said or written`);
        }
    }
});

// The customer and technician saves (CustomersView, TechniciansView), extracted and run.
const custSave = async ({ answer, switchAt = -1, isNew = false }) => {
    const did = { sent: [], statuses: [], saving: [], saved: [], drafts: [], selected: [], editing: [] };
    const org = { now: 'org_a' };
    const draft = { ...(isNew ? { _isNew: true } : {}), id: 'cust_1', name: ' Acme ', accountId: '', preferredTechId: '', servicePlanId: '', planStartDate: '' };
    const save = p10Fn(DISPATCH, "    const save = async () => {\n        if (!draft || !(draft.name || '').trim())", '\n    };',
        ['draft', 'setStatus', 'setSaving', 'requestOrg', 'dbFetch', 'stillOrg', 'readRefusal', 'onSaved', 'setDraft', 'setSelectedId', 'setEditing', 'failureWords'], 'save')(
        draft, (v) => did.statuses.push(v), (v) => did.saving.push(v), () => 'org_a', p11Fetch(did, answer, org, { switchAt }), (o) => o === org.now, readRefusal,
        (c) => did.saved.push(c), (v) => did.drafts.push(v), (v) => did.selected.push(v), (v) => did.editing.push(v), failureWords);
    await save();
    return did;
};
const techSave = async ({ answer, switchAt = -1 }) => {
    const did = { sent: [], statuses: [], saving: [], saved: [], drafts: [], selected: [] };
    const org = { now: 'org_a' };
    const savingRef = { current: false };
    const draft = { id: 'dtech_1', firstName: 'Ann ', lastName: 'Lee', userId: '', assignedVehicleId: '', laborRate: '', overtimeRate: '' };
    const save = p10Fn(DISPATCH, "    const save = async () => {\n        if (!draft || !(draft.firstName || '').trim()", '\n    };',
        ['draft', 'setStatus', 'setSaving', 'savingRef', 'requestOrg', 'dbFetch', 'stillOrg', 'readRefusal', 'onSaved', 'setDraft', 'setSelectedId', 'failureWords'], 'save')(
        draft, (v) => did.statuses.push(v), (v) => did.saving.push(v), savingRef, () => 'org_a', p11Fetch(did, answer, org, { switchAt }), (o) => o === org.now, readRefusal,
        (t) => did.saved.push(t), (v) => did.drafts.push(v), (v) => did.selected.push(v), failureWords);
    await save();
    return { ...did, held: savingRef.current };
};

test('Part 11: the customer and technician saves — each refusal in the house words, a 403 the role\'s sentence; nothing saved — RUN', async () => {
    for (const isNew of [false, true]) {
        for (const [answer, words] of p11Refusals('Your role cannot change customers.')) {
            const did = await custSave({ answer, isNew });
            assert.deepEqual(did.statuses, [null, { kind: 'err', msg: words }], `customer: REGRESSION — ${words}`);
            assert.deepEqual([did.saved, did.editing], [[], []], 'the form stays open, nothing listed');
            assert.equal(did.sent[0][1], isNew ? 'POST' : 'PUT');
        }
    }
    for (const [answer, words] of p11Refusals('Your role cannot change technicians.')) {
        const did = await techSave({ answer });
        assert.deepEqual(did.statuses, [null, { kind: 'err', msg: words }], `technician: REGRESSION — ${words}`);
        assert.deepEqual([did.saved, did.drafts, did.held], [[], [], false]);
    }
});

test('Part 11: the customer and technician saves — landed, as stored; an unreadable landed answer as before; after an org switch nothing — RUN', async () => {
    const stored = { id: 'cust_1', name: 'Acme', accountId: null };
    const c = await custSave({ answer: onceOf(200, { customer: stored }) });
    assert.deepEqual([c.saved, c.selected, c.editing, c.statuses], [[stored], ['cust_1'], [false], [null, { kind: 'ok', msg: 'Saved.' }]]);
    const cu = await custSave({ answer: P11_UNREADABLE() });
    assert.equal(cu.saved[0].name, 'Acme', 'landed: the copy sent, as before');
    assert.deepEqual(cu.statuses[1], { kind: 'ok', msg: 'Saved.' });
    const t = await techSave({ answer: onceOf(201, { technician: { id: 'dtech_1', firstName: 'Ann', lastName: 'Lee', memberId: 'usr_1' } }) });
    assert.deepEqual([t.saved.length, t.selected, t.statuses[1]], [1, ['dtech_1'], { kind: 'ok', msg: 'Saved' }]);
    const tu = await techSave({ answer: P11_UNREADABLE() });
    assert.deepEqual([tu.saved, tu.statuses[1]], [[], { kind: 'ok', msg: 'Saved' }], 'landed with no technician read: as before');
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'Internal server error', requestId: 'r1' }), P11_PAGE(), onceOf(200, { customer: stored })]) {
        const cs = await custSave({ answer, switchAt: 0 });
        assert.deepEqual([cs.statuses, cs.saved], [[null], []], 'customer: REGRESSION — an answer from the org left said or written');
    }
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'Internal server error', requestId: 'r1' }), P11_PAGE(),
        onceOf(200, { technician: { id: 'dtech_1', firstName: 'Ann', lastName: 'Lee' } })]) {
        const ts = await techSave({ answer, switchAt: 0 });
        assert.deepEqual([ts.statuses, ts.saved, ts.drafts], [[null], [], []], 'technician: REGRESSION — an answer from the org left said or written');
    }
});

// The job's invoice panel (JobInvoicePanel): its read of the job's invoices (the effect) and its writes (write).
const INV_LIVE = Object.freeze({ id: 'inv_2', invoiceNumber: 'INV-0002', status: 'issued' });
const INV_VOID = Object.freeze({ id: 'inv_1', invoiceNumber: 'INV-0001', status: 'void' });
const invoiceRead = async ({ answer, cancelFirst = false }) => {
    const did = { sent: [], errs: [], unread: [], history: [], invoice: [], loading: [] };
    const gate = p11Gate();
    const effect = p11Effect("() => {\n        let cancelled = false;\n        setInvoice(null);", '\n    }, [job?.id]);',
        ['job', 'setInvoice', 'setHistory', 'setDraft', 'setPaying', 'setErr', 'setUnread', 'setLoading', 'dbFetch', 'readRefusal', 'failureWords', 'isLiveInvoice'])(
        { id: 'job_1' }, (v) => did.invoice.push(v), (v) => did.history.push(v), () => {}, () => {}, (v) => did.errs.push(v), (v) => did.unread.push(v),
        (v) => did.loading.push(v), p11Fetch(did, answer, { now: 'org_a' }, { gate }), readRefusal, failureWords, isLiveInvoice);
    const cleanup = effect();
    if (cancelFirst) cleanup();
    gate.release();
    await settle();
    return did;
};

test('Part 11: the invoice panel\'s read — a refusal in the house words, the panel never "No invoice on this job yet" over it — RUN', async () => {
    for (const [answer, words] of [...p11Refusals(), [P11_UNREADABLE(), 'Its answer could not be read. Reload to see it.'],
        [onceOf(200, {}), 'Its answer could not be read. Reload to see it.'], [onceOf(200, null), 'Its answer could not be read. Reload to see it.']]) {
        const did = await invoiceRead({ answer });
        assert.deepEqual(did.errs, ['', `Invoices did not load — ${words}`], `REGRESSION — "HTTP N", "check your connection", or {} taken as no invoices: ${words}`);
        assert.deepEqual(did.unread, [false, true], 'marked unread: the panel offers no "Create invoice" over a read that failed');
        assert.deepEqual([did.history, did.invoice], [[[]], [null]], 'nothing adopted');
        assert.deepEqual(did.loading, [true, false]);
        assert.deepEqual(did.sent.map(([u]) => u), ['/.netlify/functions/invoices?jobId=job_1']);
    }
});

test('Part 11: the invoice panel\'s read — landed, the invoices and the live one; a job switched away from says nothing — RUN', async () => {
    const did = await invoiceRead({ answer: onceOf(200, { invoices: [INV_VOID, INV_LIVE] }) });
    assert.deepEqual([did.errs, did.unread], [[''], [false]]);
    assert.deepEqual(did.history, [[], [INV_VOID, INV_LIVE]]);
    assert.equal(did.invoice[1], INV_LIVE, 'the live invoice leads');
    assert.deepEqual(did.sent.map(([u]) => u), ['/.netlify/functions/invoices?jobId=job_1']);
    const none = await invoiceRead({ answer: onceOf(200, { invoices: [] }) });
    assert.deepEqual([none.errs, none.unread, none.invoice], [[''], [false], [null, null]], 'a job with none: "No invoice on this job yet", as before');
    for (const answer of [onceOf(500, { error: 'Internal server error' }), P11_PAGE(), UNSENT(), P11_UNREADABLE()]) {
        const late = await invoiceRead({ answer, cancelFirst: true });
        assert.deepEqual([late.errs, late.unread, late.history], [[''], [false], [[]]], 'REGRESSION: a job switched away from said its words on the next');
    }
});

const invoiceWrite = async ({ answer, done = 'created' }) => {
    const did = { sent: [], errs: [], busy: [], adopted: [], unread: [] };
    const write = p10Fn(DISPATCH, '    const write = async (url, options, done) => {', '\n    };',
        ['setBusy', 'setErr', 'setUnread', 'dbFetch', 'readRefusal', 'failureWords', 'adopt'], 'write')(
        (v) => did.busy.push(v), (v) => did.errs.push(v), (v) => did.unread.push(v), p11Fetch(did, answer, { now: 'org_a' }), readRefusal, failureWords,
        (d) => did.adopted.push(d));
    const r = await write('/.netlify/functions/invoices', { method: 'POST', body: '{"jobId":"job_1"}' }, done);
    return { ...did, r };
};

test('Part 11: the invoice panel\'s writes — a refusal says what was not done and why; a landed answer that cannot be read is said, never adopted — RUN', async () => {
    for (const done of ['created', 'issued', 'voided', 'marked paid', 'saved']) {
        for (const [answer, words] of p11Refusals()) {
            const did = await invoiceWrite({ answer, done });
            assert.deepEqual(did.errs, ['', `The invoice was not ${done} — ${words}`], `REGRESSION — "(HTTP N)" or "check your connection": ${words}`);
            assert.deepEqual([did.r, did.adopted, did.busy], [null, [], [true, false]]);
        }
        for (const answer of [P11_UNREADABLE(), onceOf(200, null)]) {
            const did = await invoiceWrite({ answer, done });
            assert.deepEqual(did.errs, ['', `The invoice was ${done} — Its answer could not be read. Reload to see it.`], 'REGRESSION: a landed answer that cannot be read adopted as {}');
            assert.equal(did.r, true, 'landed: an editor it closes still closes — a second press re-sends the write');
            assert.deepEqual(did.adopted, [], 'nothing adopted');
        }
    }
    const stored = { invoice: { id: 'inv_3', invoiceNumber: 'INV-0003', status: 'draft' }, job: { id: 'job_1' } };
    const landed = await invoiceWrite({ answer: onceOf(201, stored) });
    assert.deepEqual([landed.errs, landed.adopted, landed.r], [[''], [stored], stored], 'landed: the invoice and the job as stored');
});

test('Part 11 review fix: the invoice panel\'s writes — landed with an answer that cannot be read, or one naming no invoice, the panel is marked unread: never "No invoice on this job yet" and its Create under "The invoice was created" — RUN', async () => {
    for (const done of ['created', 'issued', 'voided', 'marked paid', 'saved']) {
        for (const answer of [P11_UNREADABLE(), onceOf(200, null), onceOf(200, 'ok'), onceOf(201, {}), onceOf(201, { job: { id: 'job_1' } })]) {
            const did = await invoiceWrite({ answer, done });
            assert.deepEqual(did.errs, ['', `The invoice was ${done} — Its answer could not be read. Reload to see it.`], `REGRESSION: a landed ${done} whose answer names no invoice said nothing`);
            assert.deepEqual(did.unread, [true], `REGRESSION: a landed ${done} unread not marked — "No invoice on this job yet" and Create drawn under its words`);
            assert.deepEqual([did.adopted, did.r], [[], true], 'nothing adopted; landed, its editor closes');
        }
        for (const [answer] of p11Refusals()) {
            const did = await invoiceWrite({ answer, done });
            assert.deepEqual(did.unread, [], 'a refusal: nothing written, the panel as it was');
        }
    }
    const stored = { invoice: { id: 'inv_4', invoiceNumber: 'INV-0004', status: 'draft' }, job: { id: 'job_1' } };
    const landed = await invoiceWrite({ answer: onceOf(201, stored) });
    assert.deepEqual([landed.errs, landed.unread, landed.adopted], [[''], [], [stored]], 'landed and read: adopted, nothing marked');
});

// The Invoices list (InvoicesView): its read.
const invoicesList = async ({ answer, cancelFirst = false }) => {
    const did = { sent: [], errs: [], lists: [], loading: [] };
    const gate = p11Gate();
    const effect = p11Effect("() => {\n        let cancelled = false;\n        (async () => {\n            try {\n                const res  = await dbFetch('/.netlify/functions/invoices');",
        '\n    }, []);', ['setErr', 'setList', 'setLoading', 'dbFetch', 'readRefusal', 'failureWords'])(
        (v) => did.errs.push(v), (v) => did.lists.push(v), (v) => did.loading.push(v), p11Fetch(did, answer, { now: 'org_a' }, { gate }), readRefusal, failureWords);
    const cleanup = effect();
    if (cancelFirst) cleanup();
    gate.release();
    await settle();
    return did;
};

test('Part 11: the Invoices list — a refusal or an unreadable answer is said, never "No invoices yet" and $0.00; landed, the list — RUN', async () => {
    for (const [answer, words] of [...p11Refusals(), [P11_UNREADABLE(), 'Its answer could not be read. Reload to see it.'], [onceOf(200, { invoices: 'x' }), 'Its answer could not be read. Reload to see it.']]) {
        const did = await invoicesList({ answer });
        assert.deepEqual([did.errs, did.lists], [[`Invoices did not load — ${words}`], []], `REGRESSION — ${words}`);
        assert.deepEqual(did.loading, [false]);
    }
    const landed = await invoicesList({ answer: onceOf(200, { invoices: [INV_LIVE, INV_VOID] }) });
    assert.deepEqual([landed.errs, landed.lists], [[], [[INV_LIVE, INV_VOID]]]);
    const late = await invoicesList({ answer: onceOf(500, { error: 'Internal server error' }), cancelFirst: true });
    assert.deepEqual([late.errs, late.lists, late.loading], [[], [], []], 'a view left says nothing');
});

// The job record (JobsView): the address read (the effect) and the save.
const SEL = Object.freeze({ id: 'job_1', title: 'Boiler service', customerId: 'cust_1', locationId: 'dloc_1' });
const LOC = Object.freeze({ id: 'dloc_1', address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' });
const addressRead = async ({ answer, selected = SEL, cancelFirst = false }) => {
    const did = { sent: [], drafts: [], statuses: [], locs: [], unread: [] };
    const gate = p11Gate();
    const effect = p11Effect("() => {\n        setDraft(selected ? { ...selected } : null);", '\n    }, [selectedId]);',
        ['selected', 'setDraft', 'setStatus', 'setLoc', 'setLocUnread', 'dbFetch'])(
        selected, (v) => did.drafts.push(v), (v) => did.statuses.push(v), (v) => did.locs.push(v), (v) => did.unread.push(v),
        p11Fetch(did, answer, { now: 'org_a' }, { gate }));
    const cleanup = effect();
    if (cancelFirst && cleanup) cleanup();
    gate.release();
    await settle();
    return did;
};

test('Part 11 (Q20): the job\'s address — a read that failed says so in the panel\'s place, never a job with no address — RUN', async () => {
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'Internal server error' }), P11_PAGE(), UNSENT(), P11_UNREADABLE(), onceOf(200, null)]) {
        const did = await addressRead({ answer });
        assert.deepEqual(did.unread, [false, true], 'REGRESSION: a failed read looked exactly like a job with no address');
        assert.deepEqual(did.locs, [null], 'no address panel to fill in over a read that failed');
        assert.deepEqual(did.sent.map(([u]) => u), ['/.netlify/functions/dispatch-customers?resource=locations&customerId=cust_1']);
    }
    // Landed: the job's location, or an empty panel where the customer has none — as before.
    const landed = await addressRead({ answer: onceOf(200, { locations: [{ id: 'dloc_0', address: 'x' }, LOC] }) });
    assert.deepEqual([landed.unread, landed.locs], [[false], [null, { ...LOC }]]);
    const none = await addressRead({ answer: onceOf(200, { locations: [] }) });
    assert.deepEqual([none.unread, none.locs], [[false], [null, { id: null, address: '', city: '', state: '', zip: '' }]]);
    // A job with no customer reads nothing and shows nothing; no job, nothing.
    const noCust = await addressRead({ answer: onceOf(500, {}), selected: { ...SEL, customerId: null } });
    assert.deepEqual([noCust.sent, noCust.unread, noCust.locs], [[], [false], [null]]);
    const noJob = await addressRead({ answer: onceOf(500, {}), selected: null });
    assert.deepEqual([noJob.sent, noJob.unread, noJob.drafts], [[], [false], [null]]);
    // Another job picked before the answer: nothing said on it.
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT()]) {
        const late = await addressRead({ answer, cancelFirst: true });
        assert.deepEqual([late.unread, late.locs], [[false], [null]], 'REGRESSION: a job switched away from said its address unread on the next');
    }
});

const jobSave = async ({ jobAnswer = onceOf(200, { job: STORED_JOB }), locAnswer = onceOf(200, { location: LOC }), loc = null, switchAt = -1 }) => {
    const did = { sent: [], statuses: [], saving: [], saved: [], selected: [] };
    const org = { now: 'org_a' };
    const draft = { ...SEL, durationHrs: 2, crewSize: 1, status: 'unscheduled' };
    const save = p10Fn(DISPATCH, "    const save = async () => {\n        if (!draft) return;\n        if (!(draft.title || '').trim())", '\n    };',
        ['draft', 'loc', 'setStatus', 'setSaving', 'requestOrg', 'dbFetch', 'readRefusal', 'stillOrg', 'addHoursHHMM', 'onSaved', 'setSelectedId', 'failureWords'], 'save')(
        draft, loc, (v) => did.statuses.push(v), (v) => did.saving.push(v), () => 'org_a',
        p11Fetch(did, (url) => (url.includes('resource=locations') ? locAnswer : jobAnswer), org, { switchAt }), readRefusal, (o) => o === org.now,
        (h) => h, (j) => did.saved.push(j), (v) => did.selected.push(v), failureWords);
    await save();
    return did;
};

test('Part 11: the job record\'s save — the job\'s refusal in the house words (a 403 the role\'s), the address\'s named; nothing saved — RUN', async () => {
    for (const [answer, words] of p11Refusals('Your role cannot edit jobs.')) {
        const did = await jobSave({ jobAnswer: answer });
        assert.deepEqual(did.statuses, [null, { kind: 'err', msg: words }], `the job: REGRESSION — ${words}`);
        assert.deepEqual([did.saved, did.sent.map(([, m]) => m)], [[], ['PUT']]);
    }
    for (const [answer, words] of p11Refusals()) {
        const did = await jobSave({ loc: LOC, locAnswer: answer });
        const said = answer instanceof Error ? words : `The address was not saved — ${words}`;
        assert.deepEqual(did.statuses, [null, { kind: 'err', msg: said }], `the address: REGRESSION — ${said}`);
        assert.deepEqual([did.saved, did.sent.length], [[], 1], 'the job is not sent after a refused address');
    }
});

test('Part 11: the job record\'s save — landed, as stored and the address\'s id; after an org switch nothing said, no job sent — RUN', async () => {
    const landed = await jobSave({ loc: LOC });
    assert.deepEqual(landed.sent.map(([u, m]) => [u, m]), [['/.netlify/functions/dispatch-customers?resource=locations&id=dloc_1', 'PUT'], ['/.netlify/functions/dispatch-jobs?id=job_1', 'PUT']]);
    assert.equal(landed.sent[1][2].locationId, 'dloc_1');
    assert.deepEqual([landed.saved, landed.selected, landed.statuses], [[STORED_JOB], ['job_1'], [null, { kind: 'ok', msg: 'Saved' }]]);
    const unreadable = await jobSave({ jobAnswer: P11_UNREADABLE() });
    assert.deepEqual([unreadable.saved, unreadable.statuses[1]], [[], { kind: 'ok', msg: 'Saved' }], 'landed with no job read: as before');
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'Internal server error' }), P11_PAGE(), onceOf(200, { job: STORED_JOB })]) {
        const did = await jobSave({ jobAnswer: answer, switchAt: 0 });
        assert.deepEqual([did.statuses, did.saved], [[null], []], 'the job: REGRESSION — an answer from the org left said or written');
    }
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'Internal server error' }), onceOf(200, { location: LOC })]) {
        const did = await jobSave({ loc: LOC, locAnswer: answer, switchAt: 0 });
        assert.deepEqual([did.statuses, did.sent.length], [[null], 1], 'the address: REGRESSION — said in the new org, or the job sent with its token');
    }
});

// The shift pattern's Save and a technician's job card: a failure in the house words, never a raw e.message.
test('Part 11: the shift pattern\'s Save and a technician\'s job card say failureWords — the server\'s words pass, never "Failed to fetch" — RUN', async () => {
    const src = dispatchSrc();
    const press = new Function('setBusy', 'setErr', 'onSave', 'wh', 'failureWords',
        `return ${between(src, "async () => { setBusy(true); setErr(''); try { await onSave(wh); }", ' finally { setBusy(false); } }')} finally { setBusy(false); } };`);
    const run = p10Fn(DISPATCH, "    const run = async (patch) => {\n        setErr('');\n        try { await onUpdate(job.id, patch); }", '\n    };',
        ['setErr', 'onUpdate', 'job', 'failureWords'], 'run');
    const cases = [[new Error('Forbidden: read-only role'), 'Forbidden: read-only role'], [UNSENT(), 'The server could not be reached.'],
        [new SyntaxError("Unexpected token '<'"), 'Its answer could not be read.'], [null, null]];
    for (const [fail, words] of cases) {
        const errs = [], busy = [];
        await press((v) => busy.push(v), (v) => errs.push(v), async () => { if (fail) throw fail; }, { mon: null }, failureWords)();
        assert.deepEqual(errs, words ? ['', `Not saved — ${words}`] : [''], `the shift pattern: REGRESSION — ${words}`);
        assert.deepEqual(busy, [true, false]);
        const cardErrs = [];
        await run((v) => cardErrs.push(v), async () => { if (fail) throw fail; }, { id: 'job_1' }, failureWords)({ status: 'en_route' });
        assert.deepEqual(cardErrs, words ? ['', words] : [''], `the job card: REGRESSION — ${words}`);
    }
});

test('Part 11: WIRING — above recordVisit no "HTTP N", "check your connection" or raw .message; the unread drawn, never none', () => {
    const src = dispatchSrc();
    const above = src.slice(0, src.indexOf('    const recordVisit = async ('));
    assert.ok(above.length > 100000, 'recordVisit found');
    assert.ok(!/'HTTP '|HTTP \$\{/.test(above), 'REGRESSION: "HTTP N" said above recordVisit');
    assert.ok(!/check your connection/i.test(above), 'REGRESSION: "check your connection" when the server answered');
    assert.ok(!/\b(e|err)\??\.message\b/.test(above), 'REGRESSION: a raw e.message said above recordVisit');
    // The invoice panel offers no "Create invoice" over a read that failed; the list draws no totals over one.
    const panel = between(src, 'const JobInvoicePanel = (', 'const InvoicesView = (');
    assert.ok(panel.includes('{!loading && !invoice && !unread && ('), 'REGRESSION: "No invoice on this job yet" over a read that failed');
    assert.ok(panel.includes("setInvoice(null); setHistory([]); setDraft(null); setPaying(null); setErr(''); setUnread(false);"), 'a new job clears the mark');
    assert.ok(panel.includes('{err && <div role="alert"'), 'the words drawn');
    // A void invoice's "Raise a new invoice" waits too (the review's verify): a create landed unread raised one.
    assert.equal(count(panel, '{!unread && <button onClick={create} disabled={busy} style={btn(true)}>Raise a new invoice</button>}'), 1,
        'REGRESSION: "Raise a new invoice" under "The invoice was created — …"');
    // One panel per job: a write landing after the job changed speaks on its own panel, gone — never on the next job's.
    assert.equal(count(src, '{selected && <JobInvoicePanel key={selected.id} job={selected} showConfirm={showConfirm} onJobMirror={onSaved}/>}'), 1,
        'REGRESSION: the invoice panel not keyed by job');
    // Each write names what it does, for "The invoice was not <done> — why".
    for (const call of ["const create = () => write(url(), post({ jobId: job.id, issueDate: invoiceToday() }), 'created');",
        "const issue  = () => write(url(invoice.id), put({ status: 'issued' }), 'issued');",
        "const go = () => write(url(invoice.id), put({ status: 'void' }), 'voided');",
        "amountPaid: paying?.amountPaid === '' ? undefined : paying?.amountPaid }), 'marked paid');",
        "paymentTerms: draft.paymentTerms, customerPoNumber: draft.customerPoNumber, notes: draft.notes,\n        }), 'saved');"]) {
        assert.ok(panel.includes(call), call);
    }
    const list = between(src, 'const InvoicesView = (', 'const JobsView = (');
    assert.ok(list.includes("{!err && <span style={{ fontSize: 12, color: T.inkMid, fontFamily: T.sans }}>"), 'REGRESSION: $0.00 outstanding over a read that failed');
    assert.ok(list.includes('{!loading && !err && rows.length === 0 && ('), '"No invoices yet" only over a landed read');
    // Q20: the address's words in its panel's place; the panel itself only over a landed read.
    const jobs = between(src, 'const JobsView = (', 'const planWeek = (');
    order(jobs, '{!loc && locUnread && (', '<div role="alert"', "The address couldn't be read.</div>", '{loc && (');
});

// ── Part 11 (second half): recordVisit to the end of DispatchTab.jsx, and the service plans panel ─────────────────────
// The skip, defer and renew on Service due: no catch (offline an unhandled rejection, the skip/defer editor left open,
// nothing said) and "(HTTP N)" words; now the ok check first, the server's words with their ref, a failure said on the
// banner (kept until its Close), and recordVisit answers false so the editor stays open under it. The main load says each
// list's refusal in the server's words and a page that was no JSON in plain words — it drew "Unexpected token '<'" as
// the whole tab; New Job's three creates read a refusal's body once, for its words and the link it names; the mass
// schedule, the shift pattern's save, a technician's job card and the week board's move say the house words (a 403 the
// role's sentence, Q13). The service plans panel likewise (its 403 sentences kept). An answer after an org switch says
// and writes nothing.

const PV_ROW = Object.freeze({ customer: { id: 'cust_1', name: 'Acme' }, plan: { id: 'plan_1' }, occurrence: '2026-11-20', due: '2026-11-20' });
const PV_OLD = Object.freeze({ id: 'pv_0', customerId: 'cust_1', planId: 'plan_1', dueDate: '2026-11-20', action: 'deferred' });
const PV_OTHER = Object.freeze({ id: 'pv_9', customerId: 'cust_2', planId: 'plan_1', dueDate: '2026-11-20', action: 'skipped' });
const PV_NEW = Object.freeze({ id: 'pv_1', customerId: 'cust_1', planId: 'plan_1', dueDate: '2026-11-20', action: 'skipped' });
const p11bRecordVisit = (did, answer, org, switchAt, visits) => p10Fn(DISPATCH, '    const recordVisit = async (', '\n    };',
    ['setVisitActionError', 'requestOrg', 'dbFetch', 'readRefusal', 'stillOrg', 'failureWords', 'setPlanVisits'], 'recordVisit')(
    (v) => did.errors.push(v), () => 'org_a', p11Fetch(did, answer, org, { switchAt }), readRefusal, (o) => o === org.now, failureWords, visits.set);
const visitAct = async ({ answer, action = 'skipped', switchAt = -1 }) => {
    const did = { sent: [], errors: [] };
    const org = { now: 'org_a' };
    const start = [PV_OLD, PV_OTHER];
    const visits = stateOf(start);
    const r = await p11bRecordVisit(did, answer, org, switchAt, visits)(PV_ROW, action, { reason: 'Declined' });
    return { ...did, r, visits: visits.value, same: visits.value === start };
};

test('Part 11: Service due\'s skip and defer — each refusal and a failure said on the banner in the house words; false, nothing adopted — RUN', async () => {
    for (const action of ['skipped', 'deferred']) {
        for (const [answer, words] of p11Refusals()) {
            const did = await visitAct({ answer, action });
            assert.deepEqual(did.errors, ['', `The visit was not ${action} — ${words}`], `REGRESSION — "(HTTP N)", the ref dropped, or offline an unhandled rejection said nowhere: ${words}`);
            assert.deepEqual([did.r, did.same], [false, true], 'false — the editor stays open; the exceptions as they were');
            assert.deepEqual(did.sent.map(([u, m]) => [u, m]), [['/.netlify/functions/dispatch-plan-visits', 'POST']]);
            assert.deepEqual(did.sent[0][2], { customerId: 'cust_1', planId: 'plan_1', dueDate: '2026-11-20', action, reason: 'Declined' });
        }
        // A landed answer that cannot be read is said — it was "(HTTP 200)" — and nothing is adopted.
        for (const answer of [P11_UNREADABLE(), onceOf(201, {}), onceOf(201, null)]) {
            const did = await visitAct({ answer, action });
            assert.deepEqual(did.errors, ['', `The visit was ${action} — Its answer could not be read. Reload to see it.`], 'REGRESSION: a landed answer said as "(HTTP 200)"');
            assert.deepEqual([did.r, did.same], [false, true]);
        }
    }
    // Landed: the server's row replaces the one for the same occurrence, as before.
    const landed = await visitAct({ answer: onceOf(201, { visit: PV_NEW }) });
    assert.deepEqual([landed.errors, landed.r, landed.visits], [[''], true, [PV_OTHER, PV_NEW]]);
});

test('Part 11: Service due\'s skip and defer — an answer after an org switch says and adopts nothing — RUN', async () => {
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'Internal server error', requestId: 'r1' }), P11_PAGE(), UNSENT(),
        P11_UNREADABLE(), onceOf(201, { visit: PV_NEW })]) {
        const did = await visitAct({ answer, switchAt: 0 });
        assert.deepEqual([did.errors, did.r, did.same], [[''], false, true], 'REGRESSION: an answer from the org left said or adopted');
    }
});

test('Part 11: submitPending keeps the skip/defer editor open under the banner\'s words when the visit was not recorded — RUN', async () => {
    const press = async (answer, mode) => {
        const did = { sent: [], errors: [], pending: [] };
        const visits = stateOf([]);
        const recordVisit = p11bRecordVisit(did, answer, { now: 'org_a' }, -1, visits);
        const rowKey = (r) => `${r.customer.id}:${r.plan.id}:${r.occurrence || r.due}`;
        const submitPending = p10Fn(DISPATCH, '    const submitPending = async () => {', '\n    };', ['pending', 'rows', 'rowKey', 'setPending', 'onSkip', 'onDefer'], 'submitPending')(
            { key: rowKey(PV_ROW), mode, date: '2026-12-01', reason: 'Away' }, [PV_ROW], rowKey, (v) => did.pending.push(v),
            (row, opts) => recordVisit(row, 'skipped', opts), (row, opts) => recordVisit(row, 'deferred', opts));
        await submitPending();
        return did;
    };
    for (const mode of ['skip', 'defer']) {
        const action = mode === 'skip' ? 'skipped' : 'deferred';
        for (const [answer, words] of [[UNSENT(), 'The server could not be reached.'], [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)']]) {
            const did = await press(answer, mode);
            assert.deepEqual(did.pending, [], `${mode}: REGRESSION — the editor closed over a visit not recorded`);
            assert.deepEqual(did.errors, ['', `The visit was not ${action} — ${words}`]);
        }
        const landed = await press(onceOf(201, { visit: { ...PV_NEW, action } }), mode);
        assert.deepEqual([landed.pending, landed.errors], [[null], ['']], 'landed: the editor closes, as before');
    }
});

const PV_CUST = Object.freeze({ id: 'cust_1', name: 'Acme', agreementExpiry: '2026-12-01' });
const PV_CUST_2 = Object.freeze({ id: 'cust_2', name: 'Beta Co' });
const renewIt = async ({ answer, switchAt = -1 }) => {
    const did = { sent: [], errors: [], asked: [] };
    const org = { now: 'org_a' };
    const start = [PV_CUST, PV_CUST_2];
    const custs = stateOf(start);
    let go = null;
    const renewAgreement = p10Fn(DISPATCH, '    const renewAgreement = (row) => {', '\n    };',
        ['renewedExpiry', 'todayYmd', 'setVisitActionError', 'requestOrg', 'dbFetch', 'readRefusal', 'stillOrg', 'failureWords', 'setCustomers', 'showConfirm'], 'renewAgreement')(
        () => '2027-12-01', '2026-11-12', (v) => did.errors.push(v), () => 'org_a', p11Fetch(did, answer, org, { switchAt }), readRefusal, (o) => o === org.now, failureWords,
        custs.set, (msg, g) => { did.asked.push(msg); go = g; });
    renewAgreement({ customer: PV_CUST });
    await go();
    return { ...did, custs: custs.value, same: custs.value === start };
};

test('Part 11: Renew — each refusal and a failure said in the house words on the banner, nothing adopted; landed as before; after an org switch nothing — RUN', async () => {
    for (const [answer, words] of p11Refusals()) {
        const did = await renewIt({ answer });
        assert.deepEqual(did.errors, ['', `The agreement was not renewed — ${words}`], `REGRESSION — "(HTTP N)" or offline silent: ${words}`);
        assert.equal(did.same, true);
        assert.deepEqual(did.sent.map(([u, m, b]) => [u, m, b]), [['/.netlify/functions/dispatch-customers?id=cust_1', 'PUT', { agreementExpiry: '2027-12-01' }]]);
    }
    for (const answer of [P11_UNREADABLE(), onceOf(200, {})]) {
        const did = await renewIt({ answer });
        assert.deepEqual([did.errors, did.same], [['', 'The agreement was renewed — Its answer could not be read. Reload to see it.'], true], 'REGRESSION: a landed answer said as "(HTTP 200)"');
    }
    const stored = { ...PV_CUST, agreementExpiry: '2027-12-01' };
    const landed = await renewIt({ answer: onceOf(200, { customer: stored }) });
    assert.deepEqual([landed.errors, landed.custs], [[''], [stored, PV_CUST_2]]);
    assert.deepEqual(landed.asked, ['Renew the maintenance agreement for Acme through 2027-12-01?']);
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'x' }), P11_PAGE(), UNSENT(), onceOf(200, { customer: stored })]) {
        const did = await renewIt({ answer, switchAt: 0 });
        assert.deepEqual([did.errors, did.same], [[''], true], 'REGRESSION: an answer from the org left said or adopted');
    }
});

// The main load (the effect on mount), extracted and run over eight answers by URL.
const LOAD_LANDED = () => ({
    'dispatch-technicians': { technicians: [{ id: 'dtech_1', firstName: 'Ann' }] }, 'dispatch-vehicles': { vehicles: [{ id: 'veh_1' }] },
    'dispatch-equipment': { equipment: [{ id: 'eq_1' }] }, 'dispatch-customers': { customers: [{ id: 'cust_1', name: 'Acme' }] },
    'dispatch-jobs': { jobs: [{ id: 'job_1', title: 'Boiler service', customerId: 'cust_1', status: 'unscheduled' }] }, 'dispatch-schedule-blocks': { blocks: [{ id: 'blk_1' }] },
    'dispatch-service-plans': { plans: [{ id: 'plan_1' }] }, 'dispatch-plan-visits': { visits: [{ id: 'pv_1' }] },
});
const loadAll = async ({ answers = {}, cancelFirst = false } = {}) => {
    const did = { sent: [], loading: [], errors: [], set: {} };
    const gate = p11Gate();
    const landed = LOAD_LANDED();
    const answerFor = (url) => { const k = url.split('/').pop(); return k in answers ? answers[k]() : onceOf(200, landed[k]); };
    const setter = (k) => (v) => { did.set[k] = v; };
    const effect = p11Effect("() => {\n        let cancelled = false;\n        (async () => {\n            setLoading(true);\n            setLoadError('');", '\n    }, []);',
        ['setLoading', 'setLoadError', 'waitForToken', 'dbFetch', 'readRefusal', 'failureWords', 'normaliseTech', 'fromYmd', 'normalisePriority', 'queueWindow',
            'setTechs', 'setTechsRaw', 'setVehicles', 'setEquipment', 'setServicePlans', 'setPlanVisits', 'setCustomers', 'setJobs', 'setJobsRaw', 'setBlocks', 'console'])(
        (v) => did.loading.push(v), (v) => did.errors.push(v), async () => {}, p11Fetch(did, answerFor, { now: 'org_a' }, { gate }), readRefusal, failureWords,
        (t) => ({ ...t }), (s) => new Date(`${s}T00:00:00`), (p) => p, () => 'TBD',
        setter('techs'), setter('techsRaw'), setter('vehicles'), setter('equipment'), setter('plans'), setter('visits'), setter('customers'), setter('jobs'), setter('jobsRaw'), setter('blocks'), quiet);
    const cleanup = effect();
    if (cancelFirst) cleanup();
    gate.release();
    await settle();
    await settle();
    return did;
};
const TAIL = ' Reload the page to try again.';

test('Part 11: the main load — each list\'s refusal in the server\'s words, a page that was no JSON in plain words; nothing shown as none — RUN', async () => {
    const cases = [
        [{ 'dispatch-jobs': () => onceOf(403, { error: 'Forbidden: dispatch role required', requestId: 'r1' }) }, 'jobs: Forbidden: dispatch role required (ref r1).'],
        [{ 'dispatch-jobs': () => onceOf(500, {}), 'dispatch-customers': () => P11_PAGE() }, 'customers: The server returned 502; jobs: The server returned 500.'],
        [{ 'dispatch-plan-visits': () => onceOf(409, { error: 'Dispatch is not enabled for this workspace.' }) }, 'plan visits: Dispatch is not enabled for this workspace.'],
        [{ 'dispatch-service-plans': () => P11_UNREADABLE() }, 'Its answer could not be read.'],
        [{ 'dispatch-vehicles': () => UNSENT() }, 'The server could not be reached.'],
    ];
    for (const [answers, words] of cases) {
        const did = await loadAll({ answers });
        assert.deepEqual(did.errors, ['', `Dispatch data failed to load — ${words}${TAIL}`], `REGRESSION — the status alone, or "Unexpected token '<'" drawn as the tab: ${words}`);
        assert.deepEqual(did.set, {}, 'nothing adopted — a failed read is never an empty list');
        assert.deepEqual(did.loading, [true, false]);
        assert.equal(did.sent.length, 8, 'the eight lists asked');
    }
    // Each of the eight refused alone (the review of §0.248): its own name said, nothing adopted — a list left out of the
    // check reads its refusal's body as an empty list.
    for (const [key, name] of [['dispatch-technicians', 'technicians'], ['dispatch-vehicles', 'vehicles'], ['dispatch-equipment', 'equipment'],
        ['dispatch-customers', 'customers'], ['dispatch-jobs', 'jobs'], ['dispatch-schedule-blocks', 'schedule'],
        ['dispatch-service-plans', 'service plans'], ['dispatch-plan-visits', 'plan visits']]) {
        const did = await loadAll({ answers: { [key]: () => onceOf(500, { error: 'x' }) } });
        assert.deepEqual(did.errors, ['', `Dispatch data failed to load — ${name}: x.${TAIL}`], `REGRESSION: ${name}'s refusal read as an empty list`);
        assert.deepEqual(did.set, {}, `${name}: nothing adopted`);
        assert.deepEqual(did.loading, [true, false]);
    }
});

test('Part 11: the main load — landed, every list as before; a tab left before the answer says nothing — RUN', async () => {
    const did = await loadAll();
    assert.deepEqual(did.errors, ['']);
    assert.deepEqual(Object.keys(did.set).sort(), ['blocks', 'customers', 'equipment', 'jobs', 'jobsRaw', 'plans', 'techs', 'techsRaw', 'vehicles', 'visits']);
    const landed = LOAD_LANDED();
    assert.deepEqual([did.set.vehicles, did.set.plans, did.set.visits, did.set.blocks, did.set.customers], [landed['dispatch-vehicles'].vehicles,
        landed['dispatch-service-plans'].plans, landed['dispatch-plan-visits'].visits, landed['dispatch-schedule-blocks'].blocks, landed['dispatch-customers'].customers]);
    assert.deepEqual([did.set.jobs.length, did.set.jobs[0].id, did.set.jobs[0].customer, did.set.techs[0].hoursThisWeek], [1, 'job_1', 'Acme', 0]);
    for (const answers of [{ 'dispatch-jobs': () => onceOf(500, { error: 'x' }) }, { 'dispatch-vehicles': () => UNSENT() }, {}]) {
        const late = await loadAll({ answers, cancelFirst: true });
        assert.deepEqual([late.errors, late.set, late.loading], [[''], {}, [true]], 'REGRESSION: a tab left said or set its answer');
    }
});

// New Job's Save (handleSaveNewJob): the customer, the job address and the job — each create's refusal read once.
const NJ_FORM = Object.freeze({ customer: 'Acme', customerId: 'cust_1', accountId: '', title: 'Boiler service', trade: '', jobType: '', address: '', city: '', state: '',
    zip: '', window: '', priority: 'normal', crewSize: 1, durationHrs: 2, minLicense: 'Journeyman', opportunityId: '', opportunityCopied: false, needSkills: [],
    equipCategories: [], requiredVehicleType: '', servicePlanId: '', planDueDate: '', customerRefusal: '', customerRefusalLeads: null, madeCustomerId: '',
    madeLocation: null, refusedDeal: '' });
const NJ_JOB0 = Object.freeze({ id: 'job_0' });
const NJ_CUST = Object.freeze({ id: 'cust_1', name: 'Acme' });
const newJob = async ({ form = {}, answers, switchAt = -1 }) => {
    const did = { sent: [], errors: [], saving: [], shown: [], selected: [], forms: [] };
    const org = { now: 'org_a' };
    const queue = [...answers];
    const jobsStart = [NJ_JOB0], custsStart = [NJ_CUST];
    const jobs = stateOf(jobsStart), custs = stateOf(custsStart);
    const f = { ...NJ_FORM, ...form };
    const handle = p10Fn(DISPATCH, '    const handleSaveNewJob = async () => {', '\n    };',
        ['newJobForm', 'setNewJobError', 'placeholderOn', 'customerForText', 'customers', 'accounts', 'dealHolds', 'DEAL_NEEDS_PICK', 'typedCustomerRefusal',
            'setNewJobSaving', 'requestOrg', 'saveDroppingRefused', 'stillOrg', 'dbFetch', 'refusalWords', 'readRefusal', 'failureWords', 'setCustomers', 'setNewJobForm',
            'setJobs', 'setSelectedJobId', 'EMPTY_JOB', 'setAppliedTemplate', 'setShowNewJobForm'], 'handleSaveNewJob')(
        f, (v) => did.errors.push(v), () => false, () => ({}), custsStart, [], () => false, 'Pick a customer.', () => 'refused',
        (v) => did.saving.push(v), () => 'org_a', saveDroppingRefused, (o) => o === org.now, p11Fetch(did, () => queue.shift(), org, { switchAt }),
        refusalWords, readRefusal, failureWords, custs.set, (u) => did.forms.push(typeof u === 'function' ? u(f) : u), jobs.set, (v) => did.selected.push(v),
        NJ_FORM, () => {}, (v) => did.shown.push(v));
    await handle();
    return { ...did, jobs: jobs.value, jobsSame: jobs.value === jobsStart, custs: custs.value, custsSame: custs.value === custsStart };
};

test('Part 11: New Job — the job\'s refusal in the server\'s words with their ref, the form open, nothing listed; a refused copied link still dropped — RUN', async () => {
    for (const [answer, words] of p11Refusals()) {
        const did = await newJob({ answers: [answer] });
        assert.deepEqual(did.errors, ['', words], `REGRESSION — "Save failed", the ref dropped, or "Failed to fetch": ${words}`);
        assert.deepEqual([did.jobsSame, did.shown, did.sent.length], [true, [], 1], 'the form stays open, nothing listed');
        assert.deepEqual(did.saving, [true, false]);
    }
    // The drop still reads the refusal's field from its body: a copied account that names nothing is left off, once.
    const dropped = await newJob({ form: { accountId: 'acc_gone' }, answers: [onceOf(404, { error: 'That account is not in this organization.', field: 'accountId' }), onceOf(201, { job: { id: 'djob_s' } })] });
    assert.deepEqual([dropped.sent.length, dropped.sent[0][2].accountId, dropped.sent[1][2].accountId, dropped.errors], [2, 'acc_gone', null, ['']], 'REGRESSION: the refused link\'s field lost — the job not saved without it');
    assert.equal(dropped.jobs[0].id, 'djob_s');
    // Landed, as before.
    const landed = await newJob({ answers: [onceOf(201, { job: { id: 'djob_1' } })] });
    assert.deepEqual([landed.errors, landed.jobs.map((j) => j.id), landed.selected, landed.shown], [[''], ['djob_1', 'job_0'], ['djob_1'], [false]]);
    const unreadable = await newJob({ answers: [P11_UNREADABLE()] });
    assert.deepEqual([unreadable.errors, unreadable.jobs[0].id, unreadable.shown], [[''], unreadable.sent[0][2].id, [false]], 'landed with no job read: listed under the id sent');
});

test('Part 11: New Job — the customer\'s and the job address\'s refusals named, the job not sent after them; landed unreadable keeps the ids sent — RUN', async () => {
    const typed = { customerId: '', customer: 'New Co' };
    for (const [answer, words] of p11Refusals()) {
        const did = await newJob({ form: typed, answers: [answer] });
        const said = answer instanceof Error ? words : `The customer was not created — ${words}`;
        assert.deepEqual(did.errors, ['', said], `the customer: REGRESSION — ${said}`);
        assert.deepEqual([did.sent.length, did.sent[0][0], did.custsSame, did.jobsSame], [1, '/.netlify/functions/dispatch-customers', true, true]);
    }
    const madeUnread = await newJob({ form: typed, answers: [P11_UNREADABLE(), onceOf(201, { job: { id: 'djob_2' } })] });
    // The review of §0.248: the customer made is listed as sent — it was never listed till a reload, so the next New Job
    // typing its name made a second.
    assert.deepEqual([madeUnread.errors, madeUnread.custs], [[''], [NJ_CUST, { id: madeUnread.sent[0][2].id, name: 'New Co', accountId: null }]],
        'REGRESSION: the customer made under an unread answer not listed — the next New Job makes a second of its name');
    assert.equal(madeUnread.sent[1][2].customerId, madeUnread.sent[0][2].id, 'the job is the customer\'s, under the id sent');
    assert.ok(madeUnread.forms.some((x) => x.madeCustomerId === madeUnread.sent[0][2].id), 'a retry reuses the customer made');
    // A won deal's account the server says names nothing is left off the customer, once (state §0.214): the field read
    // from the refusal's body, after the ok check.
    const dropC = await newJob({ form: { ...typed, accountId: 'acc_gone', opportunityCopied: true },
        answers: [onceOf(404, { error: 'That account is not in this organization.', field: 'accountId' }), onceOf(201, { customer: { id: 'dcust_k', name: 'New Co' } }), onceOf(201, { job: { id: 'djob_k' } })] });
    assert.deepEqual([dropC.errors, dropC.sent.length, dropC.sent[0][2].accountId, dropC.sent[1][2].accountId, dropC.sent[2][2].customerId], [[''], 3, 'acc_gone', null, 'dcust_k'],
        'REGRESSION: the refused account\'s field lost — the customer not made without it');
    const addressed = { address: '1 Main St', city: 'Austin' };
    for (const [answer, words] of p11Refusals()) {
        const did = await newJob({ form: addressed, answers: [answer] });
        const said = answer instanceof Error ? words : `The job address was not saved — ${words}`;
        assert.deepEqual(did.errors, ['', said], `the address: REGRESSION — ${said}`);
        assert.deepEqual([did.sent.length, did.sent[0][0], did.jobsSame], [1, '/.netlify/functions/dispatch-customers?resource=locations', true]);
    }
    const locUnread = await newJob({ form: addressed, answers: [P11_UNREADABLE(), onceOf(201, { job: { id: 'djob_3' } })] });
    assert.deepEqual([locUnread.errors, locUnread.sent[1][2].locationId], [[''], locUnread.sent[0][2].id], 'the job at the address made, under the id sent');
});

test('Part 11 review fix: New Job — a customer made under an answer that cannot be read is kept as sent: listed, its first address its default, its dropped account off — RUN', async () => {
    const typed = { customerId: '', customer: 'New Co', address: '1 Main St', city: 'Austin' };
    const made = await newJob({ form: typed, answers: [P11_UNREADABLE(), onceOf(201, { location: LOC }), onceOf(201, { job: { id: 'djob_5' } })] });
    const custId = made.sent[0][2].id;
    assert.deepEqual(made.errors, ['']);
    assert.deepEqual(made.sent.map(([u]) => u), ['/.netlify/functions/dispatch-customers', '/.netlify/functions/dispatch-customers?resource=locations', '/.netlify/functions/dispatch-jobs']);
    assert.deepEqual(made.custs, [NJ_CUST, { id: custId, name: 'New Co', accountId: null }], 'REGRESSION: the customer made not listed — no row kept from what was sent');
    assert.deepEqual([made.sent[1][2].customerId, made.sent[1][2].isDefault], [custId, true], 'REGRESSION: the made customer\'s first address stored as no default');
    assert.deepEqual([made.sent[2][2].customerId, made.jobs[0].id], [custId, 'djob_5']);
    // Linked: the account sent is the row's and the job's.
    const linked = await newJob({ form: { ...typed, accountId: 'acc_1' }, answers: [P11_UNREADABLE(), onceOf(201, { location: LOC }), onceOf(201, { job: { id: 'djob_6' } })] });
    assert.deepEqual([linked.custs[1].accountId, linked.sent[2][2].accountId], ['acc_1', 'acc_1'], 'the account sent kept on the row and the job');
    // A won deal's account the server said names nothing, dropped (state §0.214): the row as it was last sent — no account —
    // and the job saved without it.
    const dropped = await newJob({ form: { ...typed, accountId: 'acc_gone', opportunityCopied: true },
        answers: [onceOf(404, { error: 'That account is not in this organization.', field: 'accountId' }), P11_UNREADABLE(), onceOf(201, { location: LOC }), onceOf(201, { job: { id: 'djob_7' } })] });
    assert.deepEqual([dropped.errors, dropped.sent[0][2].accountId, dropped.sent[1][2].accountId], [[''], 'acc_gone', null]);
    assert.deepEqual([dropped.custs[1], dropped.sent[2][2].isDefault], [{ id: dropped.sent[1][2].id, name: 'New Co', accountId: null }, true],
        'REGRESSION: the dropped account put back on the row kept — the customer listed as linked to an account the server refused');
    assert.equal(dropped.sent[3][2].accountId, null, 'REGRESSION: the job sent with the account the customer\'s create dropped');
});

test('Part 11: New Job — an answer after an org switch says and lists nothing — RUN', async () => {
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'x', requestId: 'r1' }), P11_PAGE(), UNSENT(), onceOf(201, { job: { id: 'djob_1' } })]) {
        const did = await newJob({ answers: [answer], switchAt: 0 });
        assert.deepEqual([did.errors, did.jobsSame, did.shown], [[''], true, []], 'REGRESSION: an answer from the org left said or listed');
    }
    const loc = await newJob({ form: { address: '1 Main St', city: 'Austin' }, answers: [UNSENT()], switchAt: 0 });
    assert.deepEqual([loc.errors, loc.sent.length], [[''], 1]);
});

// The mass schedule: the first refusal's words, with the job they are about.
const MJ_1 = Object.freeze({ id: 'job_1', title: 'Boiler service', customer: 'Acme', durationHrs: 2, equipCategories: [], status: 'unscheduled' });
const MJ_2 = Object.freeze({ id: 'job_2', title: '', customer: 'Beta Co', durationHrs: 1, equipCategories: [], status: 'unscheduled' });
const massRun = async (answers) => {
    const did = { sent: [], prog: [], saving: [], plans: [], audits: [] };
    const queue = [...answers];
    const jobs = stateOf([MJ_1, MJ_2]);
    const plan = { proposals: [MJ_1, MJ_2].map((job) => ({ job, tech: { id: 'tech_1' }, crew: [{ id: 'tech_1' }], dateStr: '2026-11-16', startHr: 9 })),
        skipped: [], fromStr: '2026-11-16', toStr: '2026-11-22' };
    const confirm = p10Fn(DISPATCH, '    const confirmMassSchedule = async () => {', '\n    };',
        ['massPlan', 'setMassSaving', 'setMassProg', 'requestOrg', 'stillOrg', 'pickEquipmentFor', 'equipment', 'overlappingRivals', 'jobs', 'hhmm', 'dbFetch',
            'readRefusal', 'failureWords', 'setJobs', 'addAudit', 'setMassPlan'], 'confirmMassSchedule')(
        plan, (v) => did.saving.push(v), (v) => did.prog.push(v), () => 'org_a', () => true, () => ({ picked: [] }), [], () => [], jobs.value,
        (h) => `${String(h).padStart(2, '0')}:00`, p11Fetch(did, () => queue.shift(), { now: 'org_a' }), readRefusal, failureWords, jobs.set,
        (...a) => did.audits.push(a), (u) => did.plans.push(typeof u === 'function' ? u(plan) : u));
    await confirm();
    return { ...did, last: did.prog[did.prog.length - 1], jobs: jobs.value };
};

test('Part 11: the mass schedule — the first refusal or failure said with its job, in the house words; what landed leaves the panel — RUN', async () => {
    for (const [answer, words] of p11Refusals()) {
        const did = await massRun([answer, onceOf(200, { job: {} })]);
        assert.deepEqual(did.last, { done: 1, total: 2, failed: 1, error: `Boiler service: ${words}` }, `REGRESSION — "HTTP N" or "Failed to fetch": ${words}`);
        assert.deepEqual(did.jobs.map((j) => j.status), ['unscheduled', 'scheduled'], 'only the job that landed moves');
        assert.deepEqual(did.plans[did.plans.length - 1].proposals.map((p) => p.job.id), ['job_1'], 'a second press sends only the job refused');
    }
    const second = await massRun([onceOf(200, {}), onceOf(409, { error: 'The job was changed since.' })]);
    assert.equal(second.last.error, 'Beta Co: The job was changed since.', 'a job with no title named by its customer');
    const both = await massRun([onceOf(500, { error: 'first' }), onceOf(500, { error: 'second' })]);
    assert.deepEqual([both.last.failed, both.last.error], [2, 'Boiler service: first'], 'the first refusal\'s words kept');
    const landed = await massRun([onceOf(200, {}), onceOf(200, {})]);
    assert.deepEqual([landed.last, landed.plans], [{ done: 2, total: 2, failed: 0, error: '' }, [null]]);
});

// The shift pattern's save (saveWorkingHours) and a technician's job card (updateMyJob): their throws are the house words.
test('Part 11: the shift pattern\'s save and the job card\'s update throw the house words — said by their callers\' failureWords; landed as before — RUN', async () => {
    const hours = async (answer) => {
        const did = { sent: [] };
        const start = [{ id: 'dtech_1', workingHours: null }, { id: 'dtech_2' }];
        const raw = stateOf(start);
        const fn = p10Fn(DISPATCH, '    const saveWorkingHours = async (techId, workingHours) => {', '\n    };', ['dbFetch', 'readRefusal', 'setTechsRaw'], 'saveWorkingHours')(
            p11Fetch(did, answer, { now: 'org_a' }), readRefusal, raw.set);
        let thrown = null;
        try { await fn('dtech_1', { mon: null }); } catch (e) { thrown = e; }
        return { ...did, said: thrown ? failureWords(thrown) : null, raw: raw.value, same: raw.value === start };
    };
    const card = async (answer) => {
        const did = { sent: [], busy: [] };
        const start = [{ id: 'job_1', status: 'scheduled' }, { id: 'job_2' }];
        const raw = stateOf(start);
        const fn = p10Fn(DISPATCH, '    const updateMyJob = async (jobId, patch) => {', '\n    };', ['setTechBusyId', 'dbFetch', 'readRefusal', 'setJobsRaw'], 'updateMyJob')(
            (v) => did.busy.push(v), p11Fetch(did, answer, { now: 'org_a' }), readRefusal, raw.set);
        let thrown = null;
        try { await fn('job_1', { status: 'en_route' }); } catch (e) { thrown = e; }
        return { ...did, said: thrown ? failureWords(thrown) : null, raw: raw.value, same: raw.value === start };
    };
    for (const [answer, words] of p11Refusals()) {
        const h = await hours(answer);
        assert.deepEqual([h.said, h.same], [words, true], `the shift pattern: REGRESSION — "HTTP N", the ref dropped: ${words}`);
    }
    for (const [answer, words] of p11Refusals()) {
        const c = await card(answer);
        assert.deepEqual([c.said, c.same, c.busy], [words, true, ['job_1', null]], `the job card: REGRESSION — ${words}`);
    }
    const hl = await hours(onceOf(200, { technician: { id: 'dtech_1', workingHours: { mon: null } } }));
    assert.deepEqual([hl.said, hl.raw[0].workingHours, hl.sent[0][2]], [null, { mon: null }, { id: 'dtech_1', workingHours: { mon: null } }]);
    const hu = await hours(P11_UNREADABLE());
    assert.deepEqual([hu.said, hu.same], [null, true], 'landed with no answer read: nothing changes, as before');
    const cl = await card(onceOf(200, { job: { id: 'job_1', status: 'en_route' } }));
    assert.deepEqual([cl.said, cl.raw[0].status], [null, 'en_route']);
    const cu = await card(P11_UNREADABLE());
    assert.deepEqual([cu.said, cu.same], [null, true]);
});

// The week board's move (handleWeekMove's commit).
const WM_JOB = Object.freeze({ id: 'job_1', title: 'Boiler service', scheduledDate: '2026-11-16', assignedTechIds: ['tech_1'], window: '09:00', assignedEquipment: [] });
const weekCommit = async ({ answer, switchAt = -1 }) => {
    const did = { sent: [], states: [], audits: [], raw: [] };
    const org = { now: 'org_a' };
    const start = [WM_JOB, { id: 'job_2' }];
    const jobs = stateOf(start);
    const commit = p10Fn(DISPATCH, '        const commit = async (overridden) => {', '\n        };',
        ['setWeekMove', 'requestOrg', 'dbFetch', 'job', 'payload', 'stillOrg', 'readRefusal', 'failureWords', 'setJobs', 'plan', 'toDate', 'reserved', 'queueWindow',
            'setJobsRaw', 'addAudit', 'name', 'fromTech', 'where', 'unitLabel', 'equipment', 'weekMoveTimer', 'clearTimeout', 'setTimeout'], 'commit')(
        (v) => did.states.push(v), () => 'org_a', p11Fetch(did, answer, org, { switchAt }), WM_JOB, { scheduledDate: '2026-11-17' }, (o) => o === org.now, readRefusal,
        failureWords, jobs.set, { crew: ['tech_1'] }, '2026-11-17', null, () => '10:00', (u) => did.raw.push(u), (...a) => did.audits.push(a), 'Boiler service', null,
        '2026-11-17', (id) => id, [], { current: null }, () => {}, () => 1);
    await commit([]);
    return { ...did, jobs: jobs.value, same: jobs.value === start };
};

test('Part 11: the week board\'s move — a refusal in the house words, a 403 the role\'s sentence; nothing moved; after an org switch nothing said — RUN', async () => {
    const BUSY = { busy: true, error: '', notice: '' };
    for (const [answer, words] of p11Refusals('Your role cannot reschedule jobs.')) {
        const did = await weekCommit({ answer });
        assert.deepEqual(did.states, [BUSY, { busy: false, error: words, notice: '' }], `REGRESSION — "HTTP N" or "Failed to fetch": ${words}`);
        assert.deepEqual([did.same, did.audits, did.raw], [true, [], []]);
    }
    const landed = await weekCommit({ answer: onceOf(200, { job: { id: 'job_1', scheduledDate: '2026-11-17', status: 'scheduled' } }) });
    assert.deepEqual([landed.states[1].error, landed.states[1].notice, landed.jobs[0].scheduledDate, landed.jobs[0].window, landed.audits.length], ['', 'Moved Boiler service to 2026-11-17.', '2026-11-17', '10:00', 1]);
    const unreadable = await weekCommit({ answer: P11_UNREADABLE() });
    assert.deepEqual([unreadable.states[1].notice, unreadable.jobs[0].scheduledDate, unreadable.raw], ['Moved Boiler service to 2026-11-17.', '2026-11-17', []], 'landed: the row moves as sent, as before');
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'x' }), P11_PAGE(), UNSENT(), onceOf(200, { job: { id: 'job_1' } })]) {
        const did = await weekCommit({ answer, switchAt: 0 });
        assert.deepEqual([did.states, did.same, did.audits], [[BUSY], true, []], 'REGRESSION: an answer from the org left said or written');
    }
});

test('Part 11: WIRING — recordVisit to the end of DispatchTab: no "HTTP N", "check your connection" or raw .message; the visit banner has its Close', () => {
    const src = dispatchSrc();
    const below = src.slice(src.indexOf('    const recordVisit = async ('));
    assert.ok(below.length > 20000, 'recordVisit found');
    assert.ok(!/'HTTP '|HTTP \$\{/.test(below), 'REGRESSION: "HTTP N" said below recordVisit');
    assert.ok(!/check your connection/i.test(below), 'REGRESSION: "check your connection" when the server answered');
    assert.ok(!/\b(e|err)\??\.message\b/.test(below), 'REGRESSION: a raw e.message said below recordVisit');
    // The banner over Service due: kept until its Close, cleared by the next action.
    const due = between(src, 'const ServiceDueView = (', 'const submitPending = async () => {');
    assert.ok(due.includes('actionError, onCloseActionError }) => {'));
    const banner = between(src, '{actionError && (', '            )}');
    order(banner, 'role="alert"', '{actionError}', '<button onClick={onCloseActionError}', 'Close');
    assert.ok(src.includes("actionError={visitActionError} onCloseActionError={() => setVisitActionError('')}"), 'REGRESSION: the banner\'s Close wired to nothing');
    // The main load: the whole-tab words stay, the eight lists read only after their check.
    const load = between(src, "        (async () => {\n            setLoading(true);", '\n    }, []);');
    order(load, '].filter(([, r]) => !r.ok);', 'if (failed.length) {', 'await readRefusal(r)', 'throw new Error(', 'techsRes.json(),', 'setLoadError(`Dispatch data failed to load — ${failureWords(err)} Reload the page to try again.`);');
});

// The service plans panel (DispatchServicePlansDetail.jsx): its load, save, delete and the legacy seed.
const SP = 'src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx';
const spSrc = () => code(read(SP));
const spLoad = async (answers = {}) => {
    const did = { sent: [], errors: [], loading: [], plans: [], custs: [] };
    const landed = { 'dispatch-service-plans': { plans: [{ id: 'plan_1', name: 'Gold' }] }, 'dispatch-customers': { customers: [{ id: 'cust_1' }] } };
    const load = new Function('setLoading', 'setLoadError', 'dbFetch', 'readRefusal', 'failureWords', 'setPlans', 'setCustomers',
        `const load = ${between(spSrc(), "async () => {\n        setLoading(true); setLoadError('');", '\n    }, []);')}\n    };\nreturn load;`)(
        (v) => did.loading.push(v), (v) => did.errors.push(v),
        p11Fetch(did, (url) => { const k = url.split('/').pop(); return k in answers ? answers[k]() : onceOf(200, landed[k]); }, { now: 'org_a' }), readRefusal, failureWords,
        (v) => did.plans.push(v), (v) => did.custs.push(v));
    await load();
    return { ...did, landed };
};

test('Part 11: the service plans load — each refusal in the server\'s words, a page that was no JSON in plain words; never "No service plans yet" over it — RUN', async () => {
    const cases = [
        [{ 'dispatch-service-plans': () => onceOf(403, { error: 'Forbidden: dispatch role required' }) }, 'plans: Forbidden: dispatch role required.'],
        [{ 'dispatch-customers': () => onceOf(500, { error: 'Internal server error', requestId: 'r1' }) }, 'customers: Internal server error (ref r1).'],
        [{ 'dispatch-service-plans': () => P11_PAGE(), 'dispatch-customers': () => onceOf(409, {}) }, 'plans: The server returned 502; customers: The server returned 409.'],
        [{ 'dispatch-customers': () => P11_UNREADABLE() }, 'Its answer could not be read.'],
        [{ 'dispatch-service-plans': () => UNSENT() }, 'The server could not be reached.'],
    ];
    for (const [answers, words] of cases) {
        const did = await spLoad(answers);
        assert.deepEqual(did.errors, ['', `Service plans did not load — ${words}`], `REGRESSION — the status alone or "Unexpected token '<'": ${words}`);
        assert.deepEqual([did.plans, did.custs, did.loading], [[], [], [true, false]], 'nothing adopted');
    }
    const ok = await spLoad();
    assert.deepEqual([ok.errors, ok.plans, ok.custs], [[''], [ok.landed['dispatch-service-plans'].plans], [ok.landed['dispatch-customers'].customers]]);
});

const spPress = async (name, answer, draft = { id: 'plan_1', name: ' Gold ', cadence: 'annual' }) => {
    const did = { sent: [], errors: [], busy: [], loads: 0, drafts: [] };
    const fn = p10Fn(SP, `    const ${name} = async () => {`, '\n    };', ['draft', 'setError', 'setBusy', 'dbFetch', 'readRefusal', 'failureWords', 'load', 'setDraft'], name)(
        draft, (v) => did.errors.push(v), (v) => did.busy.push(v), p11Fetch(did, answer, { now: 'org_a' }), readRefusal, failureWords,
        async () => { did.loads++; }, (v) => did.drafts.push(v));
    await fn();
    return did;
};

test('Part 11: the service plans save and delete — a refusal in the house words, a 403 the role\'s sentence (Q13); the draft open; landed as before — RUN', async () => {
    for (const [name, role, method] of [['save', 'Your role cannot change service plans.', 'PUT'], ['remove', 'Your role cannot delete service plans.', 'DELETE']]) {
        for (const [answer, words] of [...p11Refusals(role), [onceOf(409, { error: 'Customers are still on this plan.' }), 'Customers are still on this plan.']]) {
            const did = await spPress(name, answer);
            assert.deepEqual(did.errors, ['', words], `${name}: REGRESSION — "HTTP N", the ref dropped or "Failed to fetch": ${words}`);
            assert.deepEqual([did.loads, did.drafts, did.busy], [0, [], [true, false]], 'nothing read again, the draft open');
            assert.equal(did.sent[0][1], method);
        }
        const landed = await spPress(name, onceOf(200, { plan: { id: 'plan_1' } }));
        assert.deepEqual([landed.errors, landed.loads, landed.drafts], [[''], 1, [null]]);
        const unreadable = await spPress(name, P11_UNREADABLE());
        assert.deepEqual([unreadable.errors, unreadable.loads, unreadable.drafts], [[''], 1, [null]], 'landed: no body read, as before');
    }
});

const spSeed = async ({ answers, switchAt = -1, tiers = ['gold'] }) => {
    const did = { sent: [], msgs: [], seeding: [], loads: 0 };
    const org = { now: 'org_a' };
    const queue = [...answers];
    const seed = p10Fn(SP, '    const seedFromLegacy = async () => {', '\n    };',
        ['setSeeding', 'setSeedMsg', 'requestOrg', 'dbFetch', 'readRefusal', 'stillOrg', 'legacyPlansToCreate', 'legacyTiers', 'failureWords', 'load'], 'seedFromLegacy')(
        (v) => did.seeding.push(v), (v) => did.msgs.push(v), () => 'org_a', p11Fetch(did, () => queue.shift(), org, { switchAt }), readRefusal, (o) => o === org.now,
        legacyPlansToCreate, tiers, failureWords, async () => { did.loads++; });
    await seed();
    return did;
};

test('Part 11: the legacy seed — the read\'s and each create\'s refusal in the house words; nothing created over a read that failed — RUN', async () => {
    for (const [answer, words] of p11Refusals()) {
        const did = await spSeed({ answers: [answer] });
        assert.deepEqual(did.msgs, ['', `Nothing created — the plans could not be read: ${words}`], `the read: REGRESSION — "HTTP N" or "Failed to fetch": ${words}`);
        assert.deepEqual([did.sent.length, did.seeding, did.loads], [1, [true, false], 0], 'no plan made');
    }
    for (const answer of [P11_UNREADABLE(), onceOf(200, {}), onceOf(200, { plans: 'x' })]) {
        const did = await spSeed({ answers: [answer] });
        assert.deepEqual([did.msgs, did.sent.length], [['', 'Nothing created — the plans could not be read: the answer held no list of plans'], 1], 'REGRESSION: an answer with no list read as none — every label made again');
    }
    for (const [answer, words] of p11Refusals()) {
        const did = await spSeed({ answers: [onceOf(200, { plans: [] }), answer] });
        assert.deepEqual(did.msgs, ['', `Created 0. 1 failed — gold: ${words}`], `a create: REGRESSION — ${words}`);
        assert.deepEqual([did.sent[1][1], did.loads], ['POST', 1]);
    }
    const landed = await spSeed({ answers: [onceOf(200, { plans: [] }), onceOf(201, { plan: {} })] });
    assert.deepEqual(landed.msgs, ['', 'Created 1 plan. Assign customers to them from Dispatch → Customers.']);
    for (const answer of [onceOf(403, { error: 'Forbidden' }), onceOf(500, { error: 'x' }), P11_PAGE(), UNSENT(), onceOf(200, { plans: [] })]) {
        const did = await spSeed({ answers: [answer], switchAt: 0 });
        assert.deepEqual([did.msgs, did.sent.length, did.loads], [[''], 1, 0], 'REGRESSION: a read from the org left said, or plans made in the new one');
    }
});

test('Part 11: WIRING — the service plans panel: no "HTTP N" or raw .message; its 403 sentences kept (Q13)', () => {
    const s = spSrc();
    assert.ok(!/'HTTP '|HTTP \$\{/.test(s), 'REGRESSION: "HTTP N" said');
    assert.ok(!/\b(e|err)\??\.message\b/.test(s), 'REGRESSION: a raw err.message said');
    assert.ok(s.includes("import { readRefusal, failureWords } from '../../../utils/refusalWords.js';"));
    assert.ok(s.includes("if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot change service plans.' : await readRefusal(res));"));
    assert.ok(s.includes("if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot delete service plans.' : await readRefusal(res));"));
    assert.equal(count(s, 'failureWords(err)'), 5, 'the load, save, delete, seed read and each create say failureWords');
});

test('Part 11 pane check: Service plans says "No service plans yet." only over a read that landed — never under "Service plans did not load" — WIRING', () => {
    const s = code(read('src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx'));
    assert.equal(count(s, '{plans.length === 0 && !loading && !loadError && ('), 1, 'REGRESSION: "No service plans yet." under a load that failed');
    assert.equal(count(s, 'No service plans yet.'), 1);
    order(s, '{plans.length === 0 && !loading && !loadError && (', 'No service plans yet.');
});

// ── Part 12 ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The rest of src/ (state §0.249, docs/design/refusal-sweep Part 12; Jeff, 13 Nov: "Start Part 12" — Q4 "Recommended").
//
// Part 12a — Settings: Users (the invite, Resend, Revoke, Deactivate / Reactivate / Delete, the member save and the
// Clerk sync), Connected apps, the Audit log, MFA and Lead scoring. Each read its body before the ok check — a refusal's
// words lost their ref, said "HTTP N", or a 502's page said "Unexpected token '<'" — and a catch said its raw e.message
// ("Failed to fetch"). Each reads the ok check first and says the house words: the server's with their ref, else "The
// server returned N.", or "The server could not be reached."; a landed answer that cannot be read is taken as landed,
// and said where the server made what the screen cannot show; an answer after an org switch says nothing where the
// screen tracks the org; a read that failed draws no count and no "none". Connected apps' calendar Disconnect clears
// its busy mark in a finally; the Audit log's Send test event says a failure (it had no catch).

// The answers a Settings screen meets, and the words for each (a 403 keeps the server's words: no role sentence here).
const P12A_REFUSED = () => [
    [onceOf(403, { error: 'Forbidden' }), 'Forbidden'],
    [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
    [onceOf(409, {}), 'The server returned 409.'],
    [P11_PAGE(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];
const P12A_OLD = /HTTP \d|check your connection|Unexpected token|Failed to fetch|Body is unusable/;
// A piece of a file, built over stubs: `pre` before it (a `let cancelled` its handle can flip), `ret` what it hands back.
const p12aBuilt = new Map();
const p12aFn = (file, start, end, tail, params, ret, pre = '') => {
    const key = `${file}|${start}|${ret}`;
    if (!p12aBuilt.has(key)) p12aBuilt.set(key, new Function(...params, `${pre}\n${between(code(read(file)), start, end)}${tail}\nreturn ${ret};`));
    return p12aBuilt.get(key);
};
const P12A_CANCEL = '{ cancel: () => { cancelled = true; } }';

// ── MFA ──
const P12A_MFA = 'src/Tabs/settings/security/MfaDetail.jsx';
const mfaLoad = async ({ answer, cancel = false }) => {
    const did = { data: [], errors: [], loading: [] };
    let h = null;
    const fetch = async () => { if (cancel) h.cancel(); if (answer instanceof Error) throw answer; return answer; };
    // Moved (§0.249, review fixes round 2 — M2): the load reads the shared rule, settingsCards.js mfaAnswerRead — the real one.
    h = p12aFn(P12A_MFA, '        const load = async () => {', '\n        };', '\n        };',
        ['dbFetch', 'readRefusal', 'failureWords', 'mfaAnswerRead', 'setMfaData', 'setError', 'setLoading'], `{ load, ...${P12A_CANCEL} }`, 'let cancelled = false;')(
        fetch, readRefusal, failureWords, mfaAnswerRead, (v) => did.data.push(v), (v) => did.errors.push(v), (v) => did.loading.push(v));
    await h.load();
    return did;
};

test('Part 12a: MFA — a refused or failed read in the house words, nothing drawn as read; landed, the enrollment; unmounted, nothing — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await mfaLoad({ answer });
        assert.deepEqual(did.errors, [`MFA enrollment could not be read — ${words}`], `REGRESSION: ${words}`);
        assert.deepEqual([did.data, did.loading], [[], [false]], 'no enrollment set over a refusal');
    }
    assert.deepEqual((await mfaLoad({ answer: P11_UNREADABLE() })).errors, ['MFA enrollment could not be read — Its answer could not be read.']);
    // Moved (§0.249, review fixes round 3 — U3): the server's whole entry and its enrolledUsers list, as the one rule reads them.
    const ENROLLED = { enrolled: 2, total: 3, notEnrolled: [{ userId: 'u3', email: 'c@x.co', name: 'C', role: 'User' }], enrolledUsers: [], byRole: [] };
    const landed = await mfaLoad({ answer: onceOf(200, ENROLLED) });
    assert.deepEqual([landed.data, landed.errors, landed.loading], [[ENROLLED], [], [false]]);
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(200, ENROLLED)]) {
        const gone = await mfaLoad({ answer, cancel: true });
        assert.deepEqual([gone.data, gone.errors, gone.loading], [[], [], []], 'unmounted: nothing set');
    }
});

test('Part 12a: WIRING — MFA draws no count, no "No users found" and no "All users have MFA enrolled" over a read that failed', () => {
    const s = code(read(P12A_MFA));
    assert.ok(s.includes("badge={loading ? 'Loading…' : error ? undefined : `${enrolled}/${total} enrolled · ${enrollPct}%`}"), 'REGRESSION: "0/0 enrolled · 0%" over a read that failed');
    assert.ok(s.includes("<SecCard title={loading || error ? 'Enrollment by role' : `Enrollment by role (${enrolled}/${total} · ${enrollPct}%)`}>"));
    assert.ok(s.includes(') : error ? null : byRole.length === 0 ? ('), 'REGRESSION: "No users found in this organization." under the error');
    assert.ok(s.includes("<SecCard title={error ? 'Not yet enrolled' : `Not yet enrolled (${notEnrolledCount})`}"), 'REGRESSION: "Not yet enrolled (0)" over a read that failed');
    assert.ok(s.includes(') : error ? null : notEnrolled.length === 0 ? ('), 'REGRESSION: "All users have MFA enrolled." under the error');
    assert.ok(s.includes("import { readRefusal, failureWords } from '../../../utils/refusalWords.js';"));
    assert.ok(!/\b(e|err)\??\.message\b/.test(s) && !P12A_OLD.test(s), 'REGRESSION: a raw e.message or the old words');
});

// ── Lead scoring: Train now ──
const P12A_LEAD = 'src/Tabs/settings/salesProcess/LeadScoringDetail.jsx';
const trainNow = async ({ answer, switchAt = -1 }) => {
    const { revsAfter } = await import('../src/utils/settingsRevs.js');
    const { trainNowMessage } = await import('../src/utils/leadScoringDefaults.js');
    const did = { sent: [], training: [], msgs: [], sets: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12A_LEAD, '    const handleTrainNow = async () => {', '\n    };', '\n    };',
        ['setTraining', 'setTrainMsg', 'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setSettings', 'revsAfter', 'trainNowMessage'], 'handleTrainNow')(
        (v) => did.training.push(v), (v) => did.msgs.push(v), () => 'org_a', (o) => o === org.now, p11Fetch(did, answer, org, { switchAt }),
        readRefusal, failureWords, (f) => did.sets.push(f({ revs: { leadScoring: 'L1', teams: 'T1' } })), revsAfter, trainNowMessage);
    await h();
    return { ...did, said: did.msgs[did.msgs.length - 1] };
};

test('Part 12a: Lead scoring\'s Train now — a refusal in the server\'s words, never "Training refused (N)"; landed, the model adopted; unread, said; after a switch nothing — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await trainNow({ answer });
        assert.deepEqual(did.said, { ok: false, text: `Not trained — ${words}` }, `REGRESSION: ${words}`);
        assert.deepEqual([did.sets, did.training], [[], [true, false]], 'nothing adopted; the button back');
        assert.ok(!P12A_OLD.test(did.said.text) && !/Training refused/.test(did.said.text));
    }
    const MODEL = { predictive: { model: { n: 40, accuracy: 81 } } };
    const landed = await trainNow({ answer: onceOf(200, { ok: true, decided: 40, leadScoring: MODEL, revs: { leadScoring: 'L2' } }) });
    assert.deepEqual(landed.sets, [{ revs: { leadScoring: 'L2', teams: 'T1' }, leadScoring: MODEL }], 'the server\'s config and its token adopted, the other tokens kept');
    assert.deepEqual(landed.said, { ok: true, text: 'Model trained on 40 decided leads · 81% training accuracy.' });
    const notYet = await trainNow({ answer: onceOf(200, { ok: false, reason: 'predictive-off' }) });
    assert.deepEqual([notYet.sets, notYet.said.text], [[], 'Turn predictive scoring on and save, then train.']);
    const unread = await trainNow({ answer: P11_UNREADABLE() });
    assert.deepEqual([unread.sets, unread.said], [[], { ok: false, text: 'Its answer could not be read. Reload the page to see whether a model was trained.' }],
        'REGRESSION: a landed answer that cannot be read said as a refusal, or a parse error');
    for (const answer of [onceOf(403, { error: 'Forbidden' }), P11_PAGE(), UNSENT(), onceOf(200, { ok: true, leadScoring: MODEL })]) {
        const late = await trainNow({ answer, switchAt: 0 });
        assert.deepEqual([late.msgs, late.sets, late.training], [[null], [], [true, false]], 'REGRESSION: an answer after an org switch said or adopted in the org switched to');
    }
});

test('Part 12a: WIRING — Lead scoring\'s save says failureWords; no raw e.message', () => {
    const s = code(read(P12A_LEAD));
    assert.ok(s.includes('setSaveError(`Lead scoring not saved — ${failureWords(e)}`);'));
    assert.ok(!/\b(e|err)\??\.message\b/.test(s), 'REGRESSION: a raw e.message');
});

// ── The Audit log ──
const P12A_AUDIT = 'src/Tabs/settings/audit/AuditDetail.jsx';
const P12A_DEST = Object.freeze({ id: 'dst_1', name: 'Datadog', status: 'Active' });
const auditActions = (did, answer) => {
    const fetch = async (url, opts = {}) => { did.sent.push([url, opts.method || 'GET']); if (answer instanceof Error) throw answer; return answer; };
    const dests = stateOf([P12A_DEST]);
    did.dests = dests;
    // Moved pin (§0.249, the review's fixes): errorOf is gone (its ref dropped) — every destination refusal reads readRefusal;
    // a create whose answer cannot be read marks the list unread (setDestsRead, setDestsUnread).
    const unread = stateOf(did.unreadBefore ?? '');
    did.unread = unread;
    // Moved pin (§0.249, the review's fixes, round 2): a Pause / Resume or Send test that lands unread marks its row's status
    // unknown (setStatusUnread); a readable answer marks it known again.
    const statusUnread = stateOf(did.statusBefore ?? []);
    did.statusUnread = statusUnread;
    // Moved pin (§0.249, the review's fixes, round 3): a PUT's or a test's refusal is read once (refusalWords) and judged by
    // the module's destRefusedOwn — the server's own 4xx says "not saved", any other answer "may have been".
    const params = ['setDestError', 'setBusyId', 'setTestResult', 'dbFetch', 'STREAM_URL', 'readRefusal', 'failureWords', 'setDestsRead', 'setDestsUnread', 'setDests', 'setShowAddDest', 'setReveal', 'setStatusUnread',
        'refusalWords', 'destRefusedOwn'];
    const destRefusedOwn = new Function(`return ${between(code(read(P12A_AUDIT)), 'const destRefusedOwn = ', ';\n').slice('const destRefusedOwn = '.length)};`)();
    const args = [(v) => did.errors.push(v), (v) => did.busy.push(v), (v) => did.tests.push(v), fetch, '/.netlify/functions/audit-stream', readRefusal, failureWords,
        (v) => did.read.push(v), unread.set, dests.set, (v) => did.modal.push(v), (v) => did.reveal.push(v), statusUnread.set, refusalWords, destRefusedOwn];
    const fn = (start, name) => p12aFn(P12A_AUDIT, start, '\n    };', '\n    };', params, name)(...args);
    return {
        sendTest: fn('    const sendTest = async (dest) => {', 'sendTest'),
        putDest: fn('    const putDest = async (body, label) => {', 'putDest'),
        createDest: fn('    const createDest = async (input) => {', 'createDest'),
    };
};
const auditPress = async (which, answer, ...args) => {
    const did = { sent: [], errors: [], busy: [], tests: [], modal: [], reveal: [], read: [] };
    did.answered = await auditActions(did, answer)[which](...args);
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12a: the Audit log\'s Send test event — the ok check first, "Test not sent — <the house words>", a failure said (it had no catch); landed, the result; unread, said as sent — RUN', async () => {
    // Moved pin (§0.249, the review's fixes, round 3): only the server's own refusal (the 403) says "not sent"; a 5xx, a
    // 4xx without its words, a gateway's page or a request that threw says the test may have been sent — the words kept.
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await auditPress('sendTest', answer, P12A_DEST);
        const own = !(answer instanceof Error) && answer.status === 403;
        assert.deepEqual(did.said, [own ? `Test not sent — ${words}` : `The test may have been sent — reload the page to see whether it was: ${words}`], `REGRESSION: ${words} — the ref dropped, or offline nothing said`);
        assert.deepEqual([did.tests, did.busy], [[null], ['dst_1', null]], 'no result; the row freed');
    }
    const landed = await auditPress('sendTest', onceOf(200, { ok: false, status: 502, error: 'Bad gateway at the receiver', destination: { ...P12A_DEST, status: 'Failing' } }), P12A_DEST);
    assert.deepEqual([landed.said, landed.tests.at(-1)], [[], { id: 'dst_1', ok: false, status: 502, error: 'Bad gateway at the receiver' }]);
    assert.equal(landed.dests.value[0].status, 'Failing', 'the row as the server answered it');
    const unread = await auditPress('sendTest', P11_UNREADABLE(), P12A_DEST);
    assert.deepEqual(unread.said, ['Test sent — Its answer could not be read, so whether it was delivered is not known.'], 'REGRESSION: a test that went out said as not sent');
    assert.deepEqual(unread.busy, ['dst_1', null]);
});

test('Part 12a: the Audit log\'s Pause / Rotate and Add — offline said in plain words (each rejected unsaid); landed, the server\'s row; unread, said as saved — RUN', async () => {
    const off = await auditPress('putDest', UNSENT(), { id: 'dst_1', paused: true }, 'Pause');
    // Moved pin (§0.249, the review's fixes, round 3): a request that threw may have reached the server — maybe saved.
    assert.deepEqual([off.said, off.answered, off.busy], [['Pause may have been saved — reload the page to see whether it was: The server could not be reached.'], null, ['dst_1', null]], 'REGRESSION: offline, the row busy and nothing said');
    const landed = await auditPress('putDest', onceOf(200, { destination: { ...P12A_DEST, status: 'Paused' } }), { id: 'dst_1', paused: true }, 'Pause');
    assert.deepEqual([landed.said, landed.dests.value[0].status], [[], 'Paused']);
    const rotated = await auditPress('putDest', P11_UNREADABLE(), { id: 'dst_1', rotateSecret: true }, 'Rotate secret');
    assert.deepEqual([rotated.said, rotated.answered], [['Rotate secret saved — Its answer could not be read, so the new secret cannot be shown; rotate again to see one. Reload the page to see the destination.'], null]);
    const paused = await auditPress('putDest', P11_UNREADABLE(), { id: 'dst_1', paused: true }, 'Pause');
    assert.deepEqual(paused.said, ['Pause saved — Its answer could not be read. Reload the page to see the destination.']);

    const addOff = await auditPress('createDest', UNSENT(), { name: 'X', url: 'https://x.test', fmt: 'JSON' });
    // Moved pin (§0.249, the review's fixes, round 4): a request that threw may have reached the server — the destination may
    // have been added: the window closes (a second press could make a second one) and the banner says so.
    assert.deepEqual([addOff.answered, addOff.modal, addOff.said],
        [{ ok: true }, [false], ['The destination may have been added — reload the page to see whether it was: The server could not be reached.']],
        'REGRESSION: offline, the Add window stays "Adding…" — nothing said');
    const added = await auditPress('createDest', onceOf(201, { destination: { id: 'dst_2', name: 'X' }, secret: 's3cret' }), { name: 'X' });
    assert.deepEqual([added.answered, added.modal, added.reveal, added.dests.value.map((d) => d.id)],
        [{ ok: true }, [false], [{ dest: { id: 'dst_2', name: 'X' }, secret: 's3cret', rotated: false }], ['dst_1', 'dst_2']]);
    const addUnread = await auditPress('createDest', P11_UNREADABLE(), { name: 'X' });
    assert.deepEqual([addUnread.answered, addUnread.modal, addUnread.reveal],
        [{ ok: true }, [false], []], 'landed: the window closes — never "not saved" over a destination the server made');
    assert.deepEqual(addUnread.said, ['Destination added — Its answer could not be read, so its secret cannot be shown. Reload the page, then rotate its secret to see a new one.']);
});

// The page's reads: the audit log (in the effect) and the destinations (loadDests).
const auditLoad = async ({ answer, dests = async () => {} }) => {
    const did = { events: [], errors: [], loading: [], destErrors: [], destsLoading: [], loads: 0 };
    const h = p12aFn(P12A_AUDIT, "        (async () => {\n            try {\n                const auditRes", '\n        })();', '\n        });',
        ['dbFetch', 'readRefusal', 'failureWords', 'setEvents', 'setEventsError', 'setEventsLoading', 'loadDests', 'setDestsUnread', 'setDestsLoading',
            'fmtEventAge', 'mapEntityTypeToCat', 'mapActionToSev'], `{ run, ...${P12A_CANCEL} }`, 'let cancelled = false;\nconst run =')(
        async () => { if (answer instanceof Error) throw answer; return answer; }, readRefusal, failureWords, (v) => did.events.push(v), (v) => did.errors.push(v),
        (v) => did.loading.push(v), async () => { did.loads++; await dests(); }, (v) => did.destErrors.push(v), (v) => did.destsLoading.push(v),
        () => 'now', () => 'admin', () => 'info');
    await h.run();
    return did;
};

test('Part 12a: the Audit log\'s read — a refusal or failure in the house words, never "No audit events yet"; the destinations still read; their failure said — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await auditLoad({ answer });
        assert.deepEqual([did.errors, did.events, did.loading], [[words], [], [false]], `REGRESSION: ${words}`);
        // Moved pin (§0.249, the review's fixes, round 3): the destinations are read in their own effect, at once — the
        // log's read, failed or not, reads none (p12fxA3DestsLoad runs theirs).
        assert.deepEqual([did.loads, did.destsLoading], [0, []], 'the log\'s read waits on no destinations read');
    }
    for (const answer of [P11_UNREADABLE(), onceOf(200, {}), onceOf(200, { entries: 'x' })]) {
        assert.deepEqual((await auditLoad({ answer })).errors, ['Its answer could not be read.'], 'REGRESSION: a landed answer with no list drawn as no events');
    }
    const landed = await auditLoad({ answer: onceOf(200, { entries: [{ id: 'e1', action: 'user.invited', userName: 'Ann' }] }) });
    assert.deepEqual([landed.errors, landed.events.length, landed.events[0][0].actor], [[], 1, 'Ann']);
    // Moved pin (§0.249, the review's fixes, round 3): the destinations' own effect says their failure.
    const offline = await p12fxA3DestsLoad(async () => { throw UNSENT(); });
    assert.deepEqual([offline.destErrors, offline.destsLoading], [['Destinations did not load — The server could not be reached.'], [false]], 'REGRESSION: the destinations\' failure said as "Failed to fetch"');
    const read = await p12fxA3DestsLoad(async () => {});
    assert.deepEqual([read.loads, read.destErrors, read.destsLoading], [1, [], [false]], 'the destinations are read still');
});
// The destinations' own effect (§0.249, the review's fixes, round 3): read at once, beside the log's read.
const p12fxA3DestsLoad = async (dests, cancelAt = null) => {
    const did = { destErrors: [], destsLoading: [], loads: 0 };
    let h = null;
    h = p12aFn(P12A_AUDIT, "        (async () => {\n            try { await loadDests(); }", '\n        })();', '\n        });',
        ['loadDests', 'setDestsUnread', 'setDestsLoading', 'failureWords'], `{ run, ...${P12A_CANCEL} }`, 'let cancelled = false;\nconst run =')(
        async () => { did.loads++; if (cancelAt === 'load') h.cancel(); await dests(); }, (v) => did.destErrors.push(v), (v) => did.destsLoading.push(v), failureWords);
    await h.run();
    return did;
};

const loadDestsRun = async (answer) => {
    const did = { errors: [], dests: [], read: [] };
    const h = p12aFn(P12A_AUDIT, '    const loadDests = React.useCallback(async () => {', '\n    }, []);', '\n    }, []);',
        ['React', 'dbFetch', 'STREAM_URL', 'setDestsUnread', 'readRefusal', 'setDests', 'setDestsRead'], 'loadDests')(
        { useCallback: (f) => f }, async () => answer, '/x', (v) => did.errors.push(v), readRefusal, (v) => did.dests.push(v), (v) => did.read.push(v));
    did.thrown = await thrownWords(h);
    return did;
};

test('Part 12a: the Audit log\'s destinations — "No destinations." only over a list that was read; an answer with no list is no answer — RUN, and WIRING', async () => {
    const landed = await loadDestsRun(onceOf(200, { destinations: [P12A_DEST] }));
    assert.deepEqual([landed.dests, landed.read, landed.thrown], [[[P12A_DEST]], [true], null]);
    for (const answer of [onceOf(200, {}), P11_UNREADABLE()]) {
        const r = await loadDestsRun(answer);
        assert.deepEqual([r.dests, r.read, r.thrown], [[], [], 'Its answer could not be read.'], 'REGRESSION: a landed answer with no list read as none');
    }
    const refused = await loadDestsRun(onceOf(500, { error: 'Internal server error', requestId: 'r1' }));
    // Moved pin (§0.249, the review's fixes): the refusal in readRefusal's words, its ref kept (errorOf dropped it), on the
    // unread line no action clears.
    assert.deepEqual([refused.dests, refused.read, refused.errors], [[], [], ['Destinations did not load — Internal server error (ref r1)']], 'a refusal said with its ref, the list never read');
    const s = code(read(P12A_AUDIT));
    assert.ok(s.includes('{!destsLoading && destsRead && dests.length === 0 && ('), 'REGRESSION: "No destinations." under a load that failed');
    // Moved pin (§0.249, the review's fixes, round 2): the loading words sit between the error and the count.
    assert.ok(s.includes("sub={eventsError ? 'The audit log did not load' : eventsLoading ? 'The audit log is still loading…' : `${visible.length} of ${events.length} events"), 'REGRESSION: "0 of 0 events" over a read that failed');
    // Moved pin (§0.249, the review's fixes, round 3): no count while the log loads — "Loading…", never "Showing 0 of 0".
    assert.ok(s.includes("{eventsError ? 'Not loaded' : eventsLoading ? 'Loading…' : <>Showing {visible.length} of {events.length}</>}"));
    // Moved pin (§0.249, the review's fixes, round 4): a Remove that threw may have reached the server — said as maybe.
    assert.ok(between(s, '    const remove = (dest) => showConfirm(', '\n    }, true);').includes('        } catch (e) {\n            maybeRemoved(failureWords(e));\n        } finally'),
        'REGRESSION: Remove offline rejects unsaid');
    assert.ok(!/\b(e|err)\??\.message\b/.test(s) && !P12A_OLD.test(s), 'REGRESSION: a raw e.message or the old words');
});

// ── Connected apps ──
const P12A_CA = 'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx';
const slackTest = async (answer) => {
    const did = { testing: [], msgs: [] };
    const h = p12aFn(P12A_CA, '    const handleTest = async () => {', '\n    };', '\n    };', ['webhookUrl', 'setTesting', 'setMsg', 'dbFetch', 'readRefusal', 'failureWords'], 'handleTest')(
        'https://hooks.slack.com/services/T/B/x', (v) => did.testing.push(v), (v) => did.msgs.push(v), async () => { if (answer instanceof Error) throw answer; return answer; },
        readRefusal, failureWords);
    await h();
    return { ...did, said: did.msgs.at(-1) };
};

test('Part 12a: Connected apps\' Slack test — a refusal in the server\'s words, never "Unexpected token \'<\'"; landed, sent, no body read — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await slackTest(answer);
        assert.deepEqual(did.said, { ok: false, text: `Test not sent — ${words}` }, `REGRESSION: ${words}`);
        assert.deepEqual(did.testing, [true, false]);
    }
    for (const answer of [onceOf(200, { success: true }), P11_UNREADABLE()]) {
        assert.deepEqual((await slackTest(answer)).said, { ok: true, text: 'Message sent — check your Slack channel.' }, 'REGRESSION: a sent test said as failed over its answer');
    }
});

const caLoads = async ({ answer, cancel = false }) => {
    const { jobHealth } = await import('../src/utils/jobHealth.js');
    const did = { cal: [], bcc: [], jobs: [] };
    let h = null;
    const fetch = async () => { if (cancel) h.cancel(); if (answer instanceof Error) throw answer; return answer; };
    h = p12aFn(P12A_CA, '        const loadCal = async () => {', '        loadCal(); loadBcc(); loadJobs();', '',
        ['dbFetch', 'readRefusal', 'failureWords', 'setCal', 'setBcc', 'setJobs', 'jobHealth'], `{ loadCal, loadBcc, loadJobs, ...${P12A_CANCEL} }`, 'let cancelled = false;')(
        fetch, readRefusal, failureWords, (v) => did.cal.push(v), (v) => did.bcc.push(v), (v) => did.jobs.push(v), jobHealth);
    return { h, did };
};

test('Part 12a: Connected apps\' reads — the calendars and the BCC address say a refused or failed read in the house words on their cards; the job line stays silent — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const cal = await caLoads({ answer });
        await cal.h.loadCal();
        assert.deepEqual(cal.did.cal, [{ userConnections: [], orgConnections: [], providers: null, error: words }], `calendars: REGRESSION — ${words}`);
    }
    for (const [answer, words] of P12A_REFUSED()) {
        const bcc = await caLoads({ answer });
        await bcc.h.loadBcc();
        assert.deepEqual(bcc.did.bcc, [{ address: null, configured: false, error: words }], `BCC: REGRESSION — ${words}`);
    }
    const cal = await caLoads({ answer: onceOf(200, { userConnections: [{ id: 'c1', provider: 'google' }], providers: { google: true } }) });
    await cal.h.loadCal();
    assert.deepEqual(cal.did.cal, [{ userConnections: [{ id: 'c1', provider: 'google' }], orgConnections: [], providers: { google: true } }]);
    const unread = await caLoads({ answer: P11_UNREADABLE() });
    await unread.h.loadBcc();
    assert.deepEqual(unread.did.bcc, [{ address: null, configured: false, error: 'Its answer could not be read.' }]);
    const bcc = await caLoads({ answer: onceOf(200, { address: 'org@in.example.test', configured: true }) });
    await bcc.h.loadBcc();
    assert.deepEqual(bcc.did.bcc, [{ address: 'org@in.example.test', configured: true }]);
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(200, { userConnections: [] })]) {
        const gone = await caLoads({ answer, cancel: true });
        await gone.h.loadCal(); await gone.h.loadBcc();
        assert.deepEqual([gone.did.cal, gone.did.bcc], [[], []], 'unmounted: nothing set');
    }
    for (const [answer] of P12A_REFUSED()) {
        const jobs = await caLoads({ answer });
        await jobs.h.loadJobs();
        assert.deepEqual(jobs.did.jobs, [], 'the job line claims nothing it could not read');
    }
});

const calDisconnect = async ({ write, reload }) => {
    const did = { cal: [], busy: [], notes: [] };
    const reloadCal = p12aFn(P12A_CA, '    const reloadCal = async () => {', '\n    };', '\n    };', ['dbFetch', 'readRefusal', 'setCal'], 'reloadCal')(
        async () => { if (reload instanceof Error) throw reload; return reload; }, readRefusal, (v) => did.cal.push(v));
    const disconnect = p12aFn(P12A_CA, '    const disconnectCalendar = async (id, scope, provider) => {', '\n    };', '\n    };',
        ['setBusy', 'note', 'dbWrite', 'reloadCal', 'failureWords'], 'disconnectCalendar')(
        (v) => did.busy.push(v), (k, t) => did.notes.push([k, t]), async () => write, reloadCal, failureWords);
    did.thrown = await thrownWords(() => disconnect('cc_1', 'user', 'google'));
    return { ...did, said: did.notes.filter(([, t]) => t) };
};

test('Part 12a: Connected apps\' calendar Disconnect — busy cleared in a finally (it stayed busy for good offline); a read again that fails after a landed Disconnect is said — RUN', async () => {
    const CONNS = onceOf(200, { userConnections: [], orgConnections: [], providers: { google: true } });
    const ok = await calDisconnect({ write: { ok: true, status: 200 }, reload: CONNS });
    assert.deepEqual([ok.said, ok.busy, ok.cal.length, ok.thrown], [[], ['cal', null], 1, null]);
    for (const [reload, words] of P12A_REFUSED()) {
        const r = await calDisconnect({ write: { ok: true, status: 200 }, reload });
        assert.deepEqual(r.said, [['cal:google', `Disconnected — the connections could not be read again: ${words} Reload the page to see them.`]], `REGRESSION: ${words}`);
        assert.deepEqual([r.busy, r.cal, r.thrown], [['cal', null], [], null], 'REGRESSION: the row left busy, or the failure thrown unsaid');
    }
    const refused = await calDisconnect({ write: { ok: false, status: 403, error: 'You do not have permission to make this change.' }, reload: UNSENT() });
    assert.deepEqual([refused.said, refused.busy], [[['cal:google', 'Not disconnected — You do not have permission to make this change.']], ['cal', null]], 'the refusal\'s words stand');
});

const caRequest = async ({ answer, switchAt = -1 }) => {
    const did = { sent: [], busy: [], notes: [], sets: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12A_CA, '    const requestApp = async (app) => {', '\n    };', '\n    };',
        ['setBusy', 'note', 'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setSettings'], 'requestApp')(
        (v) => did.busy.push(v), (k, t) => did.notes.push([k, t]), () => 'org_a', (o) => o === org.now, p11Fetch(did, answer, org, { switchAt }),
        readRefusal, failureWords, (f) => did.sets.push(f({ integrationRequests: {} })));
    await h({ id: 'hubspot' });
    return { ...did, said: did.notes.filter(([, t]) => t) };
};

test('Part 12a: Connected apps\' Request — a refusal in the house words; landed unread, said as requested; after a switch nothing — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await caRequest({ answer });
        assert.deepEqual([did.said, did.sets], [[['hubspot', `Not requested — ${words}`]], []], `REGRESSION: ${words}`);
    }
    const unread = await caRequest({ answer: P11_UNREADABLE() });
    assert.deepEqual([unread.said, unread.sets], [[['hubspot', 'Requested — Its answer could not be read. Reload the page to see the request.']], []],
        'REGRESSION: a request the server recorded said as refused, or a parse error');
    const landed = await caRequest({ answer: onceOf(200, { request: { requestedAt: 'R' } }) });
    assert.deepEqual([landed.said, landed.sets], [[], [{ integrationRequests: { hubspot: { requestedAt: 'R' } } }]]);
    for (const answer of [onceOf(403, { error: 'Forbidden' }), P11_PAGE(), UNSENT(), P11_UNREADABLE()]) {
        const late = await caRequest({ answer, switchAt: 0 });
        assert.deepEqual([late.said, late.sets], [[], []], 'after a switch: nothing said, nothing set');
    }
});

test('Part 12a: WIRING — Connected apps: no raw e.message, no old words; the count yields to a failed read; the job read is the one body read before its check', () => {
    const s = code(read(P12A_CA));
    assert.ok(!/\b(e|err)\??\.message\b/.test(s) && !P12A_OLD.test(s), 'REGRESSION: a raw e.message or the old words');
    assert.ok(s.includes("sub={`${cal?.error || bcc?.error ? 'Some connections could not be read — the cards say which' : `${liveCount} live`}"), 'REGRESSION: "0 live" over a read that failed');
    assert.ok(s.includes("note('slack', `Not disconnected — ${failureWords(e)}`);") && s.includes("note('webform', `Not saved — ${failureWords(e)}`);"));
    // The job line's read stays silent by design (Part 12): named for the guard by its own text, which no other read shares.
    assert.equal(count(s, 'const data = await res.json();'), 1);
});

// ── Users ──
const P12A_USERS = 'src/Tabs/settings/people/UsersDetail.jsx';
const usersHelper = (start, name) => p12aFn(P12A_USERS, start, '\n};', '\n};', ['dbFetch', 'readRefusal', 'refusalWords'], name);
const usersCall = async (start, name, answer, ...args) => {
    const sent = [];
    const h = usersHelper(start, name)(async (url, opts) => { sent.push([url, opts.method, JSON.parse(opts.body)]); if (answer instanceof Error) throw answer; return answer; }, readRefusal, refusalWords);
    let value, thrown = null;
    try { value = await h(...args); } catch (e) { thrown = failureWords(e); }
    return { sent, value, thrown };
};

test('Part 12a: Users\' Deactivate / Reactivate, Revoke and Resend helpers — each refusal thrown in the house words, never "HTTP N"; landed unread, landed — RUN', async () => {
    const ACTIVE = ['const setMemberActive = async (id, active) => {', 'setMemberActive'];
    const REVOKE = ['const revokeInvite = async (email) => {', 'revokeInvite'];
    const RESEND = ['const resendInvite = async (row) => {', 'resendInvite'];
    for (const [which, args] of [[ACTIVE, ['usr_1', false]], [REVOKE, ['a@x.test']], [RESEND, [{ email: 'a@x.test', role: 'User' }]]]) {
        for (const [answer, words] of P12A_REFUSED()) {   // a fresh answer each: a body reads once
            const r = await usersCall(...which, answer, ...args);
            assert.equal(r.thrown, words, `${which[1]}: REGRESSION — ${words}`);
        }
    }
    const stored = await usersCall(...ACTIVE, onceOf(200, { user: { id: 'usr_1', active: false, status: 'Deactivated' } }), 'usr_1', false);
    assert.deepEqual([stored.value, stored.sent[0][2]], [{ id: 'usr_1', active: false, status: 'Deactivated' }, { id: 'usr_1', active: false }]);
    const unread = await usersCall(...ACTIVE, P11_UNREADABLE(), 'usr_1', true);
    assert.deepEqual([unread.value, unread.thrown], [{ id: 'usr_1', active: true }, null], 'landed: the row as sent, never "not saved"');
    const revoked = await usersCall(...REVOKE, onceOf(200, { revoked: 1, removedRowId: 'usr_9', lists: {} }), 'a@x.test');
    assert.deepEqual(revoked.value, { revoked: 1, removedRowId: 'usr_9', lists: {} });
    assert.deepEqual((await usersCall(...REVOKE, P11_UNREADABLE(), 'a@x.test')).value, null, 'landed, its answer unread: null — the caller says so');
    const perInvite = await usersCall(...RESEND, onceOf(400, { invited: [], errors: [{ email: 'a@x.test', error: 'Clerk refused it' }] }), { email: 'a@x.test' });
    assert.equal(perInvite.thrown, 'Clerk refused it', 'the per-invite refusal\'s words');
    assert.deepEqual((await usersCall(...RESEND, onceOf(201, { invited: [{ id: 'usr_9' }], errors: [] }), { email: 'a@x.test' })).thrown, null);
});

const P12A_SETTINGS = () => ({ users: [{ id: 'usr_1', name: 'Ann', email: 'ann@x.test' }, { id: 'usr_2', name: 'Bo' }], teams: [], revs: { teams: 'T1' } });
// `answer` one answer, or (since the §0.249 review's fixes, U) a list taken in order — the invite, then the roster read again.
const inviteSend = async ({ answer, switchAt = -1, team = '' }) => {
    const { teamsWithMembers } = await import('../src/utils/teamMembership.js');
    const did = { sent: [], errors: [], saving: [], saved: [], added: [], timers: [], rows: [], notices: [], warn: [] };
    const org = { now: 'org_a' };
    const settings = stateOf(P12A_SETTINGS());
    const queue = Array.isArray(answer) ? [...answer] : null;
    // Moved (§0.249, review fixes round 3 — U3): the notice's tint is set beside its words (setNoticeWarn), recorded in `warn`.
    const h = p12aFn(P12A_USERS, '    const handleSend = async () => {', '\n    };', '\n    };',
        ['validateRows', 'setRows', 'setError', 'setSaving', 'requestOrg', 'stillOrg', 'defaultRole', 'settings', 'expiry', 'teamIdNamed', 'dbFetch', 'setSettings',
            'addToSettingsList', 'teamsWithMembers', 'TEAMS_CHANGED_TWICE', 'refusalWords', 'failureWords', 'setSaved', 'setTimeout', 'onUsers', 'setNotice', 'readRefusal',
            'setNoticeWarn'], 'handleSend')(
        () => [{ id: 1, email: 'new@x.test', role: 'User', team, valid: true }], (v) => did.rows.push(v), (v) => did.errors.push(v), (v) => did.saving.push(v),
        () => 'org_a', (o) => o === org.now, 'User', settings.value, 7, () => null, p11Fetch(did, queue ? () => queue.shift() : answer, org, { switchAt }), settings.set,
        async (key, apply) => { did.added.push(key); return { ok: true }; }, teamsWithMembers, 'twice', refusalWords, failureWords, (v) => did.saved.push(v),
        (f, ms) => did.timers.push(ms), () => {}, (v) => did.notices.push(v), readRefusal, (v) => did.warn.push(v));
    await h();
    return { ...did, users: settings.value.users, said: did.errors.filter(Boolean), told: did.notices.filter(Boolean) };
};

test('Part 12a: Users\' invite — a refusal in the server\'s words with its ref, never "Invite failed"; per-invite refusals kept; landed unread, said as sent; after a switch nothing — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await inviteSend({ answer });
        assert.deepEqual(did.said, [words], `REGRESSION: ${words}`);
        assert.deepEqual([did.saved, did.users.length, did.saving.at(-1)], [[], 2, false], 'nothing sent said; the roster unchanged; the button back');
    }
    const some = await inviteSend({ answer: onceOf(201, { invited: [{ id: 'usr_9', name: 'New', email: 'new@x.test' }], errors: [{ email: 'b@x.test', error: 'Already a member' }] }) });
    assert.deepEqual(some.said, ['1 sent; not sent — b@x.test: Already a member.'], 'the per-invite refusals, read at any status by design');
    assert.deepEqual(some.users.map((u) => u.id), ['usr_1', 'usr_2', 'usr_9']);
    const allRefused = await inviteSend({ answer: onceOf(400, { invited: [], errors: [{ email: 'new@x.test', error: 'Not a valid role' }] }) });
    assert.deepEqual(allRefused.said, ['0 sent; not sent — new@x.test: Not a valid role.']);
    const landed = await inviteSend({ answer: onceOf(201, { invited: [{ id: 'usr_9', name: 'New' }], errors: [] }) });
    assert.deepEqual([landed.said, landed.saved, landed.added], [[], [true], ['teams']]);
    // Moved in the §0.249 review's fixes (U): said as a notice, never the red box of a failure (the roster read again refused here).
    // Moved again in round 2 (U2): the roster's refusal said in the house words, with the ref — never dropped for a bare "reload".
    const unread = await inviteSend({ answer: [P11_UNREADABLE(), onceOf(500, { error: 'x', requestId: 'r1' })] });
    assert.deepEqual([unread.said, unread.told, unread.saved, unread.added], [[], ['The invitations were sent. Its answer could not be read. The roster could not be read again — reload the page to see it: x (ref r1)'], [], []],
        'REGRESSION: a landed invite whose answer cannot be read said "Sent!" with nobody on screen, or as a refusal');
    for (const answer of [onceOf(403, { error: 'Forbidden' }), P11_PAGE(), UNSENT(), onceOf(201, { invited: [{ id: 'usr_9' }], errors: [] })]) {
        const late = await inviteSend({ answer, switchAt: 0 });
        assert.deepEqual([late.said, late.saved, late.users.length], [[], [], 2], 'REGRESSION: an answer after an org switch said on the new org\'s screen');
    }
});

const pendingLoad = async (answer) => {
    const did = { errors: [], invites: [] };
    const h = p12aFn(P12A_USERS, '    const loadInvites = React.useCallback(async () => {', '\n    }, []);', '\n    }, []);',
        ['React', 'setLoadError', 'dbFetch', 'readRefusal', 'failureWords', 'setClerkInvites'], 'loadInvites')(
        { useCallback: (f) => f }, (v) => did.errors.push(v), async () => { if (answer instanceof Error) throw answer; return answer; }, readRefusal, failureWords, (v) => did.invites.push(v));
    await h();
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12a: Users\' Pending invites read — a refusal in the house words, never "HTTP N"; an answer with no list is no answer; the count says the links were not read — RUN, and WIRING', async () => {
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await pendingLoad(answer);
        assert.deepEqual(did.said, [`Clerk's invitations could not be read, so the dates are missing — ${words}`], `REGRESSION: ${words}`);
        assert.deepEqual(did.invites, [false], 'unread, never "read, and empty" (moved in the §0.249 review\'s fixes, U: it was [])');
    }
    for (const answer of [onceOf(200, {}), P11_UNREADABLE()]) {
        assert.deepEqual((await pendingLoad(answer)).said, ["Clerk's invitations could not be read, so the dates are missing — Its answer could not be read."]);
    }
    const INV = [{ id: 'inv_1', email: 'a@x.test', expiresAt: 1 }];
    const landed = await pendingLoad(onceOf(200, { invitations: INV }));
    assert.deepEqual([landed.said, landed.invites], [[], [INV]]);
    const s = code(read(P12A_USERS));
    // Moved in the §0.249 review's fixes (U): the unread list is its own state (clerkInvites false), the count the roster's.
    assert.ok(s.includes("statusDetail={clerkInvites === null ? 'Reading invitations…' : invitesUnread ? `${entries.length} invited in the roster · Clerk's list not read` : `${entries.length} pending · ${liveCount} with a live link`}"),
        'REGRESSION: "0 with a live link" over a read that failed');
});

// The profile page's Delete and Revoke: each inside its confirm.
const profileRemoval = async (which, { answer, switchAt = -1 }) => {
    const { settingsAfterRemoval, removalNote } = await import('../src/utils/teamMembership.js');
    const src = code(read(P12A_USERS));
    const REMOVED_UNREAD = between(src, "const REMOVED_UNREAD = '", "';").slice("const REMOVED_UNREAD = '".length);
    const REVOKED_UNREAD = between(src, "const REVOKED_UNREAD = '", "';").slice("const REVOKED_UNREAD = '".length);
    const did = { sent: [], errors: [], removed: [] };
    const org = { now: 'org_a' };
    const settings = stateOf(P12A_SETTINGS());
    const fetch = p11Fetch(did, answer, org, { switchAt });
    const revokeInvite = usersHelper('const revokeInvite = async (email) => {', 'revokeInvite')(fetch, readRefusal, refusalWords);
    const start = which === 'delete'
        ? 'Permanently delete ${user.name}? This cannot be undone. Their record is removed from Accelerep; the Clerk account is unaffected.`, '
        : 'Revoke the invitation to ${user.email || user.name}? Its link stops working and their row is removed. You can invite them again later.`, ';
    // The confirm's callback: the source after the confirm's words, to the confirm's close.
    const callback = between(src, start, which === 'delete' ? '\n        });' : '\n        }, false);').slice(start.length);
    const h = new Function('requestOrg', 'stillOrg', 'dbFetch', 'revokeInvite', 'user', 'readRefusal', 'failureWords', 'setSettings', 'settingsAfterRemoval', 'removalNote',
        'onRemoved', 'setError', 'REMOVED_UNREAD', 'REVOKED_UNREAD', `return (${callback}\n        });`)(
        () => 'org_a', (o) => o === org.now, fetch, revokeInvite, { id: 'usr_2', name: 'Bo', email: 'bo@x.test' }, readRefusal, failureWords, settings.set,
        settingsAfterRemoval, removalNote, (n) => did.removed.push(n), (v) => did.errors.push(v), REMOVED_UNREAD, REVOKED_UNREAD);
    await h();
    return { ...did, users: settings.value.users.map((u) => u.id), REMOVED_UNREAD, REVOKED_UNREAD };
};

test('Part 12a: Users\' profile Delete and Revoke — a refusal in the house words, never "HTTP N"; landed unread, back to the list saying so; after a switch nothing — RUN', async () => {
    for (const which of ['delete', 'revoke']) {
        const label = which === 'delete' ? 'Could not delete: ' : 'Could not revoke the invitation: ';
        for (const [answer, words] of P12A_REFUSED()) {
            const r = await profileRemoval(which, { answer });
            assert.deepEqual(r.errors, [label + words], `${which}: REGRESSION — ${words}`);
            assert.deepEqual([r.removed, r.users], [[], ['usr_1', 'usr_2']], `${which}: nothing removed`);
        }
        const landed = await profileRemoval(which, { answer: onceOf(200, which === 'delete' ? { success: true, lists: {} } : { revoked: 1, removedRowId: 'usr_2', lists: {} }) });
        assert.deepEqual([landed.errors, landed.removed, landed.users], [[], [null], ['usr_1']], `${which}: landed, the row off the roster`);
        const unread = await profileRemoval(which, { answer: P11_UNREADABLE() });
        assert.deepEqual(unread.errors, [], `${which}: REGRESSION — a landed removal said as refused`);
        assert.deepEqual(unread.removed, [which === 'delete' ? unread.REMOVED_UNREAD : unread.REVOKED_UNREAD], `${which}: said, back on the list`);
        assert.deepEqual(unread.users, which === 'delete' ? ['usr_1'] : ['usr_1', 'usr_2'], 'a delete takes its own row off; a revoke whose row is unknown takes none');
        for (const answer of [onceOf(403, { error: 'Forbidden' }), P11_PAGE(), UNSENT(), onceOf(200, { lists: {}, removedRowId: 'usr_2' })]) {
            const late = await profileRemoval(which, { answer, switchAt: 0 });
            assert.deepEqual([late.errors, late.removed, late.users], [[], [], ['usr_1', 'usr_2']], `${which}: after a switch nothing said or removed`);
        }
    }
});

// The org switched as request `switchAt` goes out (since the §0.249 review's fixes, U: the sync takes requestOrg / stillOrg).
const clerkSync = async (answers, { switchAt = -1 } = {}) => {
    const did = { sent: [], syncing: [], msgs: [], drift: [], roster: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12A_USERS, '    const runClerkSync = async () => {', '\n    };', '\n    };',
        ['syncing', 'setSyncing', 'setSyncMsg', 'dbFetch', 'readRefusal', 'failureWords', 'setDrift', '_setSettings', 'requestOrg', 'stillOrg'], 'runClerkSync')(
        false, (v) => did.syncing.push(v), (v) => did.msgs.push(v), p11Fetch(did, (url) => (url.includes('users-sync') ? answers.sync : answers.roster), org, { switchAt }),
        readRefusal, failureWords, (v) => did.drift.push(v), (f) => did.roster.push(f({ users: [] })), () => 'org_a', (o) => o === org.now);
    await h();
    return { ...did, said: did.msgs.at(-1) };
};

test('Part 12a: Users\' Clerk sync — a refusal in the house words; landed unread, said as synced; a roster read again that fails never says "Sync failed" — RUN', async () => {
    const ROSTER = () => onceOf(200, { users: [{ id: 'usr_1' }] });
    for (const [sync, words] of P12A_REFUSED()) {
        const did = await clerkSync({ sync, roster: ROSTER() });
        assert.equal(did.said, `Sync failed: ${words}`, `REGRESSION: ${words}`);
        assert.deepEqual([did.sent.length, did.drift, did.syncing], [1, [], [true, false]], 'no roster read over a refusal');
    }
    const landed = await clerkSync({ sync: onceOf(200, { counts: { created: 1, updated: 0, unchanged: 3, dbOnly: 0 } }), roster: ROSTER() });
    assert.deepEqual([landed.said, landed.roster, landed.drift], ['Synced: 1 added, 0 updated, 3 unchanged', [{ users: [{ id: 'usr_1' }] }], [null]]);
    const unread = await clerkSync({ sync: P11_UNREADABLE(), roster: ROSTER() });
    assert.deepEqual([unread.said, unread.roster.length], ['Synced. Its answer could not be read, so the counts are not shown', 1], 'REGRESSION: a sync that ran said as failed');
    for (const [roster, words] of P12A_REFUSED()) {
        const r = await clerkSync({ sync: onceOf(200, { counts: { created: 0, updated: 0, unchanged: 2 } }), roster });
        assert.equal(r.said, `Synced: 0 added, 0 updated, 2 unchanged. The roster could not be read again — reload the page to see it: ${words}`, `REGRESSION: ${words}`);
        assert.ok(!/Sync failed/.test(r.said));
    }
});

test('Part 12a: WIRING — Users: no "HTTP N", no raw e.message; each removal and save says the house words; the Security page says a failed audit read', () => {
    const s = code(read(P12A_USERS));
    assert.ok(!/'HTTP '|HTTP \$\{/.test(s), 'REGRESSION: "HTTP N" said');
    assert.ok(!/\b(e|err)\??\.message\b/.test(s), 'REGRESSION: a raw e.message said');
    assert.ok(s.includes("import { readRefusal, refusalWords, failureWords } from '../../../utils/refusalWords.js';"));
    // The two per-invite reads stay before the ok check by design (named for the guard): their refusal words through refusalWords.
    assert.equal(count(s, 'const d = await resp.json().catch(() => ({}));'), 1);
    assert.equal(count(s, 'const d = await res.json().catch(() => ({}));'), 1);
    assert.ok(s.includes('if (!resp.ok) throw new Error(refusalWords(resp, d));') && s.includes('if (!res.ok) throw new Error(refusalWords(res, d));'));
    // The member save: the ok check first, the role refusal read once after its check, every catch failureWords.
    const save = between(s, 'const UserProfilePage = ', '    const handleDeactivate = ');
    order(save, 'body:JSON.stringify(toSave) });', 'if (!resp.ok) { const why = await readRefusal(resp); if (!stillOrg(askedOrg)) return; throw new Error(why); }',
        'const stored = await resp.json().catch(() => null);', 'row = stored?.user || { ...user, ...toSave };');
    order(save, 'if (rr.ok) {', '} else {', 'const why = await readRefusal(rr);', 'if (!row && !teamsNow) throw new Error(why);');
    assert.ok(save.includes('${clause(failureWords(err))}') && save.includes(': failureWords(err));'), 'REGRESSION: the save\'s catch says a raw e.message');
    // The row menu: each action's org checked, its words the house words.
    for (const words of ['`Could not deactivate ${u.name}: ${failureWords(err)}`', '`Could not reactivate ${u.name}: ${failureWords(err)}`',
        '`Could not revoke the invitation to ${u.email || u.name}: ${failureWords(err)}`', '`Could not delete ${u.name}: ${failureWords(err)}`']) {
        assert.ok(s.includes(`} catch(err) { if (stillOrg(askedOrg)) setUserActionError(${words}); }`), words);
    }
    assert.ok(s.includes('const left = gone ? removalNote(gone) : REMOVED_UNREAD;') && s.includes('if (!r) { setUserActionError(REVOKED_UNREAD); return; }'));
    // The Pending page: its Revoke's failure after an org switch says nothing; its Resend says failureWords.
    assert.ok(s.includes('            } catch (err) {\n                if (!stillOrg(askedOrg)) return;\n                setActionError(`Could not revoke the invitation to ${e.email}: ${failureWords(err)}`);'),
        'REGRESSION: a revoke that failed after an org switch said on the new org\'s screen');
    assert.ok(s.includes('catch (err) { setActionError(`Could not resend to ${e.email}: ${failureWords(err)}`); }'));
    assert.ok(s.includes("{events === null ? (eventsError ? `The audit log could not be read — ${eventsError}` : 'Loading…') :"), 'REGRESSION: "Loading…" for good over a failed read');
});

// ── Part 12b — the tabs and layout ──
// Part 12b (state §0.249, docs/design/refusal-sweep Part 12; Jeff, 13 Nov: "Start Part 12" — Q4 "Recommended"): the Quotes
// tab (the job lookup, the approval record, a quote's history, Create dispatch job, and the catches that said a raw
// e.message), Reports (the prompt's fallback, the library's Share, Pin, schedule and Send now, the Actions report), the
// Sales Manager (a claim's Approve / Reject and Delete, the quota board's save), Score all deals, the profile panel (its
// save, the email-logging address, the calendar Disconnect), the invitation import's words and the SPIFF claim, and App's
// two calendar reads. Each read its body before the ok check — a refusal's ref lost, a 502's page said "Scoring failed."
// or "check your connection", "HTTP N" — or said a raw e.message. Each reads the ok check first and says the house words;
// a read that failed draws no "none": the job card offers no Create and says no "No job yet" over a lookup that failed.

// The refusals a tab meets, and their words: `role` what a 403 says where the screen has its own sentence.
const p12bRefused = (role = 'Forbidden') => [
    [onceOf(403, { error: 'Forbidden' }), role],
    [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
    [onceOf(409, {}), 'The server returned 409.'],
    [P11_PAGE(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];
// An answer whose body read switches the org first — an answer that lands while the member switches.
const p12bSwitchOnRead = (org, status, body) => {
    const a = onceOf(status, body);
    const json = a.json;
    a.json = async () => { org.now = 'org_b'; return json(); };
    return a;
};
// A piece of a file run as an async function: `pre` before it, `ret` what it hands back.
const p12bBuilt = new Map();
const p12bAsync = (file, start, end, params, pre, ret) => {
    const key = `${file}|${start}`;
    if (!p12bBuilt.has(key)) p12bBuilt.set(key, new Function(...params, `return (async () => {\n${pre}\n${between(code(read(file)), start, end)}\nreturn ${ret};\n})();`));
    return p12bBuilt.get(key);
};
const P12B_NO_RAW = /\b(e|err)\??\.message\b/;

// ── Quotes ──
const P12B_QUOTES = 'src/Tabs/QuotesTab.jsx';
const P12B_JOB = Object.freeze({ id: 'job_1', jobNumber: 'J-0001', status: 'unscheduled', invoice: null });
// The job lookup (an effect): its read awaited, `cancelFirst` its cleanup run before the answer lands.
const p12bJobLookup = async ({ answer, cancelFirst = false }) => {
    const did = { job: [], errors: [], unread: [], loading: [] };
    let cleanup = null;
    const fetch = async () => { await null; if (cancelFirst) cleanup(); if (answer instanceof Error) throw answer; return answer; };
    cleanup = p12aFn(P12B_QUOTES, '        let cancelled = false;\n        setLinkedJob(null);', '\n    }, [activeQuote?.id, activeQuote?.status, settings?.dispatchEnabled]);', '',
        ['activeQuote', 'quoteCanBecomeJob', 'settings', 'dbFetch', 'readRefusal', 'failureWords', 'setLinkedJob', 'setJobError', 'setJobUnread', 'setJobLoading'], 'undefined')(
        { id: 'q_1', status: 'Accepted' }, () => true, { dispatchEnabled: true }, fetch, readRefusal, failureWords,
        (v) => did.job.push(v), (v) => did.errors.push(v), (v) => did.unread.push(v), (v) => did.loading.push(v));
    await settle();
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12b: Quotes\' job lookup — a refusal in the house words, never "HTTP N" or "check your connection"; a read that failed is no "none" (Create not offered); landed, the job or none; cleaned up, nothing — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bJobLookup({ answer });
        assert.deepEqual(r.said, [`Could not look up the job — ${words}`], `REGRESSION: ${words}`);
        assert.deepEqual([r.job, r.unread, r.loading], [[null], [false, true], [true, false]], 'no job, and the card told the read failed');
    }
    for (const answer of [P11_UNREADABLE(), onceOf(200, {}), onceOf(200, null)]) {
        const r = await p12bJobLookup({ answer });
        assert.deepEqual([r.said, r.job, r.unread], [['Could not look up the job — Its answer could not be read.'], [null], [false, true]], 'REGRESSION: an answer with no `job` read as none — Create offered over it');
    }
    const found = await p12bJobLookup({ answer: onceOf(200, { job: P12B_JOB }) });
    assert.deepEqual([found.said, found.job, found.unread], [[], [null, P12B_JOB], [false]]);
    const none = await p12bJobLookup({ answer: onceOf(200, { job: null }) });
    assert.deepEqual([none.said, none.job, none.unread], [[], [null, null], [false]], 'none, as the server said');
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(200, { job: P12B_JOB })]) {
        const gone = await p12bJobLookup({ answer, cancelFirst: true });
        assert.deepEqual([gone.said, gone.job, gone.unread, gone.loading], [[], [null], [false], [true]], 'another quote shown since: nothing set');
    }
});

const p12bApprovalRead = async ({ answer, cancelFirst = false }) => {
    const did = { events: [], errors: [] };
    let cleanup = null;
    const fetch = async () => { await null; if (cancelFirst) cleanup(); if (answer instanceof Error) throw answer; return answer; };
    cleanup = p12aFn(P12B_QUOTES, '        let cancelled = false;\n        setApprovalEvents(null);', '\n    }, [subTab, quotes]);', '',
        ['subTab', 'dbFetch', 'readRefusal', 'failureWords', 'setApprovalEvents', 'setApprovalEventsError'], 'undefined')(
        'approvals', fetch, readRefusal, failureWords, (v) => did.events.push(v), (v) => did.errors.push(v));
    await settle();
    return { ...did, said: did.errors.filter(Boolean) };
};
const p12bHistoryRead = async ({ answer, cancelFirst = false }) => {
    const did = { history: [] };
    let cleanup = null;
    const fetch = async () => { await null; if (cancelFirst) cleanup(); if (answer instanceof Error) throw answer; return answer; };
    cleanup = p12aFn(P12B_QUOTES, '        let cancelled = false;\n        setQuoteHistory(', '\n    }, [activeQuote?.id, activeQuote?.updatedAt, subTab]);', '',
        ['activeQuote', 'subTab', 'dbFetch', 'readRefusal', 'failureWords', 'setQuoteHistory'], 'undefined')(
        { id: 'q_1' }, 'configurator', fetch, readRefusal, failureWords, (v) => did.history.push(v));
    await settle();
    return did;
};

test('Part 12b: Quotes\' approval record and a quote\'s history — a refusal in the house words; an answer with no list is no answer, never "No decisions" or "No recorded activity yet"; cleaned up, nothing — RUN', async () => {
    const EV = { id: 'ev_1', action: 'quote.submitted', quoteId: 'q_1' };
    const CLEARED = { events: null, error: '' };
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bApprovalRead({ answer });
        assert.deepEqual([r.said, r.events], [[`Could not read the approval record — ${words}`], [null]], `REGRESSION: ${words}`);
    }
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bHistoryRead({ answer });
        assert.deepEqual(r.history, [CLEARED, { events: null, error: `Could not read this quote's history — ${words}` }], `REGRESSION: ${words}`);
    }
    for (const make of [() => P11_UNREADABLE(), () => onceOf(200, {}), () => onceOf(200, { events: 'x' })]) {
        assert.deepEqual((await p12bApprovalRead({ answer: make() })).said, ['Could not read the approval record — Its answer could not be read.'], 'REGRESSION: an answer with no list drawn as no decisions');
        assert.deepEqual((await p12bHistoryRead({ answer: make() })).history.at(-1), { events: null, error: 'Could not read this quote\'s history — Its answer could not be read.' },
            'REGRESSION: an answer with no list drawn as no activity');
    }
    assert.deepEqual((await p12bApprovalRead({ answer: onceOf(200, { events: [EV], days: 30 }) })).events, [null, [EV]]);
    assert.deepEqual((await p12bHistoryRead({ answer: onceOf(200, { events: [EV] }) })).history, [CLEARED, { events: [EV], error: '' }]);
    for (const make of [() => onceOf(500, { error: 'x' }), () => UNSENT(), () => onceOf(200, { events: [EV] })]) {
        assert.deepEqual((await p12bApprovalRead({ answer: make(), cancelFirst: true })).events, [null], 'cleaned up: nothing set');
        assert.deepEqual((await p12bHistoryRead({ answer: make(), cancelFirst: true })).history, [CLEARED], 'cleaned up: nothing set');
    }
});

const p12bCreateJob = async ({ answer, switchOrg = false }) => {
    const did = { sent: [], job: [], errors: [], unread: [], busy: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12B_QUOTES, '    const handleCreateJob = async () => {', '\n    };', '\n    };',
        ['activeQuote', 'requestOrg', 'stillOrg', 'setJobBusy', 'setJobError', 'dbFetch', 'setLinkedJob', 'setJobUnread', 'refusalWords', 'failureWords'], 'handleCreateJob')(
        { id: 'q_1' }, () => 'org_a', (o) => o === org.now, (v) => did.busy.push(v), (v) => did.errors.push(v), p10Fetch(did, answer, org, switchOrg),
        (v) => did.job.push(v), (v) => did.unread.push(v), refusalWords, failureWords);
    await h();
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12b: Quotes\' Create dispatch job — a refusal read once, in the house words with its ref; a 409 naming the job adopts it; a job made whose answer cannot be read is said as made, Create not offered again; after an org switch nothing — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bCreateJob({ answer });
        assert.deepEqual([r.said, r.job, r.unread, r.busy, r.sent], [[`The job was not created — ${words}`], [], [], [true, false], ['POST']], `REGRESSION: ${words}`);
    }
    const twoCustomers = await p12bCreateJob({ answer: onceOf(409, { error: 'Two customers stand for this deal: Acme and Acme Co.', requestId: 'r9' }) });
    assert.deepEqual(twoCustomers.said, ['The job was not created — Two customers stand for this deal: Acme and Acme Co. (ref r9)']);
    const exists = await p12bCreateJob({ answer: onceOf(409, { error: 'J-0001 already exists for this quote.', job: P12B_JOB }) });
    assert.deepEqual([exists.said, exists.job, exists.unread], [[], [P12B_JOB], [false]], 'the job that exists is adopted');
    const made = await p12bCreateJob({ answer: onceOf(201, { job: P12B_JOB, customerCreated: false }) });
    assert.deepEqual([made.said, made.job, made.unread], [[], [P12B_JOB], [false]]);
    for (const answer of [P11_UNREADABLE(), onceOf(201, {})]) {
        const r = await p12bCreateJob({ answer });
        assert.deepEqual([r.said, r.job, r.unread], [['The job was created. Its answer could not be read — reload the page to see it.'], [], [true]],
            'REGRESSION: a job made said as not made, and Create offered again');
    }
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(201, { job: P12B_JOB }), onceOf(409, { error: 'exists', job: P12B_JOB }), P11_UNREADABLE()]) {
        const r = await p12bCreateJob({ answer, switchOrg: true });
        assert.deepEqual([r.said, r.job, r.unread, r.busy], [[], [], [], [true, false]], 'REGRESSION: the last org\'s answer said or adopted after a switch');
    }
});

test('Part 12b: WIRING — Quotes: the job card draws neither "No job yet" nor Create over a lookup that failed; every catch in the house words; no "HTTP N", no "check your connection", no raw e.message', () => {
    const s = code(read(P12B_QUOTES));
    assert.ok(s.includes("import { readRefusal, refusalWords, failureWords } from '../utils/refusalWords.js';"));
    const card = between(s, '{quoteCanBecomeJob(quote) && (', '{jobError && <div role="alert"');
    order(card, ') : jobLoading ? (', ') : job ? (', ') : jobUnread ? null : onCreateJob ? (', 'No job yet — whoever runs Dispatch creates it from here.');
    assert.ok(s.includes('jobError={jobError} jobUnread={jobUnread} onCreateJob={canCreateJob ? handleCreateJob : null} />}'), 'REGRESSION: the card never told the lookup failed');
    assert.ok(s.includes('onAccept, dispatchEnabled, job, jobLoading, jobBusy, jobError, jobUnread, onCreateJob,'));
    assert.ok(s.includes("setLinkedJob(null); setJobError(''); setJobUnread(false);"), 'cleared with the job, on any other quote');
    for (const w of ["} catch (err) { setError(`The quote was not created — ${failureWords(err)}`); }", "} catch (err) { setError(`The version was not created — ${failureWords(err)}`); }",
        'catch (err) { setError(failureWords(err)); return null; }']) assert.ok(s.includes(w), w);
    assert.equal(count(s, 'catch (err) { setError(failureWords(err)); }'), 3, 'the line editor, the Price Book and Save draft');
    assert.ok(!/HTTP \$\{|'HTTP '|check your connection/.test(s), 'REGRESSION: "HTTP N" or "check your connection" said');
    assert.ok(!P12B_NO_RAW.test(s), 'REGRESSION: a raw e.message said');
});

// ── Reports ──
const P12B_REPORTS = 'src/Tabs/ReportsTab.jsx';
const p12bPrompt = async (answer) => {
    const did = { busy: [] };
    const out = await p12bAsync(P12B_REPORTS, '            setPromptBusy(true);\n            try {', '            finally { setPromptBusy(false); }',
        ['prompt', 'dbFetch', 'readRefusal', 'isoLocal', 'aiAccessWords', 'settings', 'PROMPT_AI_AVAILABLE_NOTE', 'setPromptBusy'],
        "let reading = null, readBy = 'local';\nconst extraNotes = [];", '{ reading, readBy, extraNotes }')(
        'deals in Proposal', async () => { if (answer instanceof Error) throw answer; return answer; }, readRefusal, () => '2026-11-13', () => 'Ask AI is for Admins.', {}, 'AI is available.',
        (v) => did.busy.push(v));
    return { ...out, busy: did.busy };
};

test('Part 12b: Reports\' prompt — a refusal says why in the server\'s words, then the built-in reader; Claude\'s reading only from a landed answer — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bPrompt(answer);
        const said = answer instanceof Error ? 'Claude could not be reached — read by the built-in interpreter instead.' : `Claude could not read this one (${words}) — read by the built-in interpreter instead.`;
        assert.deepEqual([r.readBy, r.reading, r.extraNotes], ['local', null, [said]], `REGRESSION: ${words}`);
    }
    const DEF = { source: 'Opportunities', dims: [], metrics: [] };
    const read1 = await p12bPrompt(onceOf(200, { readBy: 'claude', definition: DEF, name: 'Proposal deals', notes: ['n1'] }));
    assert.deepEqual([read1.readBy, read1.reading, read1.extraNotes], ['claude', { name: 'Proposal deals', definition: DEF, notes: ['n1'] }, []]);
    assert.ok((await p12bPrompt(onceOf(200, { unavailable: true, reason: 'no_key' }))).extraNotes[0].includes('no Anthropic key is installed'));
    for (const answer of [onceOf(200, { unavailable: true, reason: 'refused' }), P11_UNREADABLE()]) {
        assert.deepEqual((await p12bPrompt(answer)).extraNotes, ['Claude could not read this one — read by the built-in interpreter instead.']);
    }
});

const P12B_R1 = Object.freeze({ id: 'rpt_1', name: 'Pipeline by rep', isShared: false });
const P12B_R2 = Object.freeze({ id: 'rpt_2', name: 'Won deals', isShared: true });
const P12B_OWNER = 'Only the report’s owner or an Admin can change it.';
// The library's writes: patchReport, toggleShare, saveDelivery and sendNow, as written. `answers`: { put, deliver }.
const p12bLibrary = (answers, { switchAt = -1 } = {}) => {
    const s = code(read(P12B_REPORTS));
    const list = stateOf([P12B_R1, P12B_R2]);
    const did = { sent: [], lib: [], notes: [], busy: [], deliveryFor: [] };
    const org = { now: 'org_a' };
    const h = new Function('setLibError', 'dbFetch', 'readRefusal', 'refusalWords', 'failureWords', 'setSavedReportsList', 'setDeliveryBusy', 'setDeliveryNote', 'deliveryFor',
        'setDeliveryFor', 'deliverySummary', 'requestOrg', 'stillOrg',
        `${between(s, '    const patchReport = async (id, patch) => {', '    const pinnedIds = ')}\n${between(s, '    const saveDelivery = async (delivery) => {', '    const openCard = ')}\nreturn { toggleShare, saveDelivery, sendNow };`)(
        (v) => did.lib.push(v), p11Fetch(did, (url) => (url.includes('action=deliver') ? answers.deliver : answers.put), org, { switchAt }), readRefusal, refusalWords, failureWords,
        list.set, (v) => did.busy.push(v), (v) => did.notes.push(v), P12B_R1, (v) => did.deliveryFor.push(v), (d) => `summary of ${d.cadence}`, () => 'org_a', (o) => o === org.now);
    return { ...h, did, list };
};

test('Part 12b: Reports\' library — Share and the schedule say a refusal in the house words (a 403 the owner\'s sentence), never "HTTP N" or a raw message; landed with an answer that cannot be read, said as landed — RUN', async () => {
    for (const [answer, words] of p12bRefused(P12B_OWNER)) {
        const lib = p12bLibrary({ put: answer });
        await lib.toggleShare(P12B_R1);
        assert.deepEqual([lib.did.lib.filter(Boolean), lib.list.value], [[`Sharing not changed — ${words}`], [P12B_R1, P12B_R2]], `REGRESSION: ${words}`);
    }
    const shared = p12bLibrary({ put: onceOf(200, { report: { ...P12B_R1, isShared: true } }) });
    await shared.toggleShare(P12B_R1);
    assert.deepEqual([shared.did.lib.filter(Boolean), shared.list.value[0].isShared, shared.did.sent[0][2]], [[], true, { id: 'rpt_1', isShared: true }]);
    const unread = p12bLibrary({ put: P11_UNREADABLE() });
    await unread.toggleShare(P12B_R1);
    assert.deepEqual(unread.did.lib.filter(Boolean), ['Shared — Its answer could not be read. Reload the page to see the report as stored.'], 'REGRESSION: a share that landed said nothing, the card unshared');
    for (const [answer, words] of p12bRefused(P12B_OWNER)) {
        const lib = p12bLibrary({ put: answer });
        assert.equal(await lib.saveDelivery({ enabled: false }), null);
        assert.deepEqual(lib.did.notes, [null, { ok: false, text: `Schedule not saved — ${words}` }], `REGRESSION: ${words}`);
        assert.deepEqual(lib.did.busy, [true, false]);
    }
    const saved = p12bLibrary({ put: onceOf(200, { report: { ...P12B_R1, config: { delivery: { enabled: false } } } }) });
    await saved.saveDelivery({ enabled: false });
    assert.deepEqual(saved.did.notes.at(-1), { ok: true, text: 'Schedule saved, delivery off.' });
    const savedUnread = p12bLibrary({ put: P11_UNREADABLE() });
    await savedUnread.saveDelivery({ enabled: true, cadence: 'weekly' });
    assert.deepEqual(savedUnread.did.notes.at(-1), { ok: true, text: 'Schedule saved — summary of weekly. Its answer could not be read — reload the page to see the schedule as stored.' });
});

test('Part 12b: Reports\' Send now — the ok check first: a run that reached no channel says its own errors, any other refusal the server\'s words with their ref; sent with an answer that cannot be read, said; after an org switch nothing — RUN', async () => {
    const PUT_OK = () => onceOf(200, { report: { ...P12B_R1, config: { delivery: { enabled: true } } } });
    for (const [answer, words] of p12bRefused('Forbidden')) {
        const lib = p12bLibrary({ put: PUT_OK(), deliver: answer });
        await lib.sendNow({ enabled: true, cadence: 'weekly' });
        assert.deepEqual(lib.did.notes.at(-1), { ok: false, text: `Not sent — ${words}` }, `REGRESSION: ${words}`);
        assert.deepEqual(lib.did.busy, [true, false]);
    }
    const noChannel = p12bLibrary({ put: PUT_OK(), deliver: onceOf(400, { ok: false, sent: { email: [], slack: false }, errors: ['The schedule has no recipients.'], rows: 0 }) });
    await noChannel.sendNow({ enabled: true });
    assert.deepEqual(noChannel.did.notes.at(-1), { ok: false, text: 'Nothing was sent. The schedule has no recipients.' }, 'a run\'s own errors, as before');
    const sent = p12bLibrary({ put: PUT_OK(), deliver: onceOf(200, { ok: true, sent: { email: ['ann@x.test'], slack: true }, errors: [], rows: 3, delivery: { lastSentAt: 't1' } }) });
    await sent.sendNow({ enabled: true });
    assert.deepEqual(sent.did.notes.at(-1), { ok: true, text: 'Sent to ann@x.test, Slack — 3 rows in the period.' });
    assert.equal(sent.list.value[0].config.delivery.lastSentAt, 't1', 'the run\'s stamp adopted');
    const sentUnread = p12bLibrary({ put: PUT_OK(), deliver: P11_UNREADABLE() });
    await sentUnread.sendNow({ enabled: true });
    assert.deepEqual(sentUnread.did.notes.at(-1), { ok: true, text: 'Sent — Its answer could not be read, so where it went is not shown.' }, 'REGRESSION: a run that landed said "Nothing was sent."');
    const putRefused = p12bLibrary({ put: onceOf(403, { error: 'Forbidden' }) });
    await putRefused.sendNow({ enabled: true });
    assert.deepEqual([putRefused.did.notes.at(-1), putRefused.did.sent.length], [{ ok: false, text: `Not sent — ${P12B_OWNER}` }, 1], 'the schedule refused: nothing run');
    for (const deliver of [onceOf(500, { error: 'x' }), UNSENT(), P11_UNREADABLE(), onceOf(200, { ok: true, sent: { email: ['a@x.test'] }, errors: [], rows: 1, delivery: { lastSentAt: 't2' } })]) {
        const late = p12bLibrary({ put: PUT_OK(), deliver }, { switchAt: 1 });
        await late.sendNow({ enabled: true });
        assert.deepEqual([late.did.notes, late.list.value[0].config.delivery, late.did.deliveryFor.length], [[null], { enabled: true }, 0],
            'REGRESSION: the last org\'s run said or stamped after a switch');
    }
});

const p12bActions = async (answer) => {
    const did = { data: [], errors: [], loading: [] };
    const h = p12aFn(P12B_REPORTS, '    const fetchData = React.useCallback(async () => {', '\n    }, [selectedRep, days, currentUser, canSeeAll]);', '\n    }, []);',
        ['React', 'setLoading', 'setError', 'canSeeAll', 'selectedRep', 'currentUser', 'days', 'dbFetch', 'readRefusal', 'failureWords', 'setData'], 'fetchData')(
        { useCallback: (f) => f }, (v) => did.loading.push(v), (v) => did.errors.push(v), true, '', 'Jeff', 30, async () => { if (answer instanceof Error) throw answer; return answer; },
        readRefusal, failureWords, (v) => did.data.push(v));
    await h();
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12b: Reports\' Actions report — a refusal in the house words, never "HTTP N"; an answer with no summary is no answer, never "No actions logged yet" — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bActions(answer);
        assert.deepEqual([r.said, r.data, r.loading], [[words], [], [true, false]], `REGRESSION: ${words}`);
    }
    for (const answer of [P11_UNREADABLE(), onceOf(200, {}), onceOf(200, { logs: [] })]) {
        assert.deepEqual((await p12bActions(answer)).said, ['Its answer could not be read.'], 'REGRESSION: an answer with no summary drawn as no actions');
    }
    const BODY = { logs: [], summary: { total: 0, resolved: 0, byType: {} } };
    assert.deepEqual((await p12bActions(onceOf(200, BODY))).data, [BODY]);
});

test('Part 12b: WIRING — Reports: the pin keeps its first read (it reads `field`) and says a refusal in refusalWords\' words; no "HTTP N", no raw e.message in the library, the prompt or the Actions report', () => {
    const s = code(read(P12B_REPORTS));
    const pin = between(s, '    const togglePin = async (r) => {', '\n    };');
    order(pin, 'let data = await res.json().catch(() => ({}));', "if (!res.ok && data.field === 'pinnedReports' && stillOrg(askedOrg)) {", 'if (!stillOrg(askedOrg)) return;',
        'if (!res.ok) { setLibError(`Pin not saved — ${refusalWords(res, data)}`); return; }');
    const lib = between(s, '    const patchReport = async (id, patch) => {', '    const openCard = ');
    const actions = between(s, '    const fetchData = React.useCallback(async () => {', '\n    }, [selectedRep, days, currentUser, canSeeAll]);');
    const prompt = between(s, '    const applyPrompt = async (text) => {', '\n    };');
    for (const [name, part] of [['the library', lib], ['the Actions report', actions], ['the prompt', prompt]]) {
        assert.ok(!/HTTP \$\{|'HTTP '/.test(part), `REGRESSION: "HTTP N" in ${name}`);
        assert.ok(!P12B_NO_RAW.test(part), `REGRESSION: a raw e.message in ${name}`);
    }
    order(prompt, 'if (!res.ok) extraNotes.push(`Claude could not read this one (${await readRefusal(res)}) — read by the built-in interpreter instead.`);', 'else {',
        'const data = await res.json().catch(() => ({}));', "if (data.readBy === 'claude' && data.definition) {");
});

// ── Sales Manager ──
const P12B_SMT = 'src/Tabs/SalesManagerTab.jsx';
const P12B_CLAIM = Object.freeze({ id: 'claim_1', repName: 'Karen', spiffName: 'Q4 push', status: 'pending' });
const P12B_CLAIM_2 = Object.freeze({ id: 'claim_2', repName: 'Ben', spiffName: 'Q4 push', status: 'pending' });
const p12bClaimWords = () => {
    const s = code(read(P12B_SMT));
    // Moved in §0.249 (review fixes, round 3, S3): claimRefused says refusalWords' words, handed in as the module imports it.
    // Moved in §0.249 (review fixes, last pass, F4): claimRefused reads the tab's one ownRefusal; saidOf and noteNotDeleted (the coaching note's
    // Delete) beside it, each as written.
    const line = (start) => s.split('\n').find((l) => l.startsWith(start));
    return new Function('refusalWords', 'NETWORK_ERROR', `${line('const ownRefusal = ')}\n${line('const saidOf = ')}\n${between(s, 'const claimRefused = (done, d, status) => (', '\nconst claimUnanswered')}\n${line('const claimUnanswered = ')}\n${between(s, 'const noteNotDeleted = (r) => (', ');\n')});\nreturn { claimRefused, claimUnanswered, ownRefusal, saidOf, noteNotDeleted };`)(refusalWords, NETWORK_ERROR);
};
const p12bClaimPress = async (which, { answer, switchOrg = false }) => {
    const { claimRefused, claimUnanswered, ownRefusal } = p12bClaimWords();
    const claims = stateOf([P12B_CLAIM, P12B_CLAIM_2]);
    const did = { sent: [], states: [] };
    const org = { now: 'org_a' };
    const fetch = p10Fetch(did, answer, org, switchOrg);
    if (which === 'status') {
        const h = p12aFn(P12B_SMT, '    const updateClaimStatus = async (claim, status) => {', '\n    };', '\n    };',
            ['currentUser', 'requestOrg', 'stillOrg', 'dbFetch', 'setSpiffClaims', 'setSaveState', 'claimRefused', 'claimUnanswered', 'console', 'ownRefusal'], 'updateClaimStatus')(
            'Jeff', () => 'org_a', (o) => o === org.now, fetch, claims.set, (v) => did.states.push(v), claimRefused, claimUnanswered, quiet, ownRefusal);
        await h(P12B_CLAIM, 'approved');
    } else {
        let ids = new Set();
        const h = p12aFn(P12B_SMT, '    const deleteClaim = (claim) => showConfirm(', '\n    }, true);', '\n    }, true);',
            ['showConfirm', 'requestOrg', 'setDeletingIds', 'dbFetch', 'stillOrg', 'setSaveState', 'claimRefused', 'setSpiffClaims', 'claimUnanswered', 'console'], 'deleteClaim')(
            async (msg, run) => run(), () => 'org_a', (f) => { ids = f(ids); }, fetch, (o) => o === org.now, (v) => did.states.push(v), claimRefused, claims.set, claimUnanswered, quiet);
        await h(P12B_CLAIM);
        assert.equal(ids.size, 0, 'the row released however the Delete ends');
    }
    return { ...did, claims: claims.value, words: { claimRefused, claimUnanswered } };
};

test('Part 12b: Sales Manager\'s claim Approve and Delete — the ok check first, a refusal\'s body read only for its words (its ref kept); a landed change reads no body; after an org switch nothing — RUN', async () => {
    for (const [which, done] of [['status', 'saved'], ['delete', 'deleted']]) {
        const { claimRefused } = p12bClaimWords();
        // Moved in §0.249 (review fixes, round 3, S3): the literal sentences, never claimRefused's own echo — a pin built
        // from the words it checks held "Not saved — the server returned 409" as well as the house words.
        const cases = [
            [onceOf(403, { error: 'Forbidden' }), `Not ${done} — Forbidden`],
            // Moved in §0.249 (review fixes, round 4, S4): only a 4xx with the server's words is "Not saved"; a 5xx, a
            // gateway's page and a wordless 4xx say the claim may have been, in refusalWords' words.
            [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), `The claim may have been ${done} — reload the page to see whether it was: Internal server error (ref r1)`],
            [onceOf(409, {}), `The claim may have been ${done} — reload the page to see whether it was: The server returned 409.`],
            [P11_PAGE(), `The claim may have been ${done} — reload the page to see whether it was: The server returned 502.`],
            [UNSENT(), `No answer from the server — reload the page to see whether the claim was ${done}.`],
        ];
        for (const [answer, msg] of cases) {
            const r = await p12bClaimPress(which, { answer });
            assert.deepEqual([r.states, r.claims], [[{ status: 'error', msg }], [P12B_CLAIM, P12B_CLAIM_2]], `REGRESSION (${which}): ${msg}`);
        }
        assert.ok(claimRefused(done, { error: 'Internal server error', requestId: 'r1' }, 500).includes('(ref r1)'), 'the ref kept');
        for (const answer of [onceOf(200, { claim: { id: 'claim_1' } }), P11_UNREADABLE()]) {
            const r = await p12bClaimPress(which, { answer });
            assert.deepEqual(r.states, [{ status: 'saved', msg: '' }], `${which}: landed`);
            assert.deepEqual(r.claims.map((c) => [c.id, c.status]), which === 'status' ? [['claim_1', 'approved'], ['claim_2', 'pending']] : [['claim_2', 'pending']]);
        }
        for (const answer of [onceOf(403, { error: 'Forbidden' }), UNSENT(), onceOf(200, {})]) {
            const r = await p12bClaimPress(which, { answer, switchOrg: true });
            assert.deepEqual([r.states, r.claims], [[], [P12B_CLAIM, P12B_CLAIM_2]], `REGRESSION (${which}): the last org's answer said or applied after a switch`);
        }
    }
    const gone = await p12bClaimPress('status', { answer: onceOf(404, { error: 'Not found' }) });
    assert.deepEqual(gone.claims, [P12B_CLAIM_2], 'a claim deleted since: its row goes');
});

// The quota board's save, as written, over one drafted rep. `onRead`: the org switches while the answer's body is read.
const p12bQuotaSave = async ({ answer, onRead = null, switchOrg = false }) => {
    const did = { sent: [], states: [], drafts: [], thrown: null };
    const settings = stateOf({ users: [{ id: 'usr_1', name: 'Ann' }, { id: 'usr_2', name: 'Bo' }] });
    const org = { now: 'org_a' };
    const s = code(read(P12B_SMT));
    const line = (start) => s.split('\n').find((l) => l.startsWith(start));
    const h = new Function('settingsLoaded', 'quotaDrafts', 'settings', 'quotaDraftRow', 'planYear', 'quotaBreakdown', 'checkQuotaSave', 'quotaRefusal', 'setQuotaDrafts',
        'setSaveState', 'requestOrg', 'stillOrg', 'dbFetch', 'console', 'setSettings', 'refusalWords', 'ownRefusal',
        `${line('    const refuse = (msg) => ')}\n${line('    const unsure = (msg) => ')}\n${between(s, '    const sendQuotas = async () => {', '\n    };')}\n    };\nreturn sendQuotas;`)(
        true, { usr_1: { annual: 400 } }, settings.value, () => ({ annual: 400, periods: [100, 100, 100, 100] }), 2026, 'quarters', () => null, () => '',
        (v) => did.drafts.push(v), (v) => did.states.push(v), () => 'org_a', (o) => o === org.now,
        p10Fetch(did, onRead ? p12bSwitchOnRead(org, ...onRead) : answer, org, switchOrg), quiet, settings.set, refusalWords, p12bClaimWords().ownRefusal);
    try { await h(); } catch (e) { did.thrown = e.message; }
    return { ...did, users: settings.value.users, said: did.states.slice(1) };
};

test('Part 12b: the quota board\'s save — the ok check first: the server\'s own refusal in its words with its ref ("Not saved"), any other answer "reload and see"; saved with an answer that cannot be read, said and never shown as stored; after an org switch nothing — RUN', async () => {
    const SAVING = { status: 'saving', msg: '' };
    // Moved in §0.249 (review fixes, last pass, F4): any answer but the server's own refusal says the quotas may have been saved, in refusalWords'
    // words with their ref — a 5xx's words kept (it said "The server returned 500 —" and dropped them).
    const UNSURE = (words) => `The quotas may have been saved — reload the page to see whether they were: ${words}`;
    const cases = [
        [onceOf(403, { error: 'Forbidden' }), 'Forbidden', 'Not saved — Forbidden'],
        [onceOf(400, { error: 'Name the fiscal year these quotas are for.', requestId: 'r2' }), 'Name the fiscal year these quotas are for. (ref r2)', 'Not saved — Name the fiscal year these quotas are for. (ref r2)'],
        [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), UNSURE('Internal server error (ref r1)'), UNSURE('Internal server error (ref r1)')],
        [onceOf(409, {}), UNSURE('The server returned 409.'), UNSURE('The server returned 409.')],
        [P11_PAGE(), UNSURE('The server returned 502.'), UNSURE('The server returned 502.')],
        [UNSENT(), 'No answer from the server — reload the page to see whether the quotas were saved.', 'No answer from the server — reload the page to see whether the quotas were saved.'],
    ];
    for (const [answer, thrown, msg] of cases) {
        const r = await p12bQuotaSave({ answer });
        assert.deepEqual([r.thrown, r.states, r.drafts], [thrown, [SAVING, { status: 'error', msg }], []], `REGRESSION: ${msg}`);
    }
    const STORED = { id: 'usr_1', name: 'Ann', quotaPlans: { 2026: { annual: 400, quarters: [100, 100, 100, 100], months: null } } };
    const landed = await p12bQuotaSave({ answer: onceOf(200, { users: [STORED], removed: [] }) });
    assert.deepEqual([landed.thrown, landed.states, landed.drafts, landed.users[0]], [null, [SAVING, { status: 'saved', msg: '' }], [{}], STORED]);
    for (const answer of [P11_UNREADABLE(), onceOf(200, {})]) {
        const r = await p12bQuotaSave({ answer });
        assert.deepEqual([r.thrown, r.said, r.drafts, r.users[0]], [null, [{ status: 'error', msg: 'Saved — Its answer could not be read. Reload the page to see the quotas as stored.' }], [{}], { id: 'usr_1', name: 'Ann' }],
            'REGRESSION: a save whose answer could not be read said "saved" over the old figures');
    }
    for (const onRead of [[403, { error: 'Forbidden' }], [500, { error: 'x' }], [200, { users: [STORED], removed: [] }]]) {
        const r = await p12bQuotaSave({ onRead });
        assert.deepEqual([r.thrown, r.said, r.drafts, r.users[0]], [null, [], [], { id: 'usr_1', name: 'Ann' }], `REGRESSION: an answer read after a switch said or applied (${onRead[0]})`);
    }
    for (const answer of [onceOf(403, { error: 'Forbidden' }), UNSENT()]) {
        const r = await p12bQuotaSave({ answer, switchOrg: true });
        assert.deepEqual([r.thrown, r.said], [null, []], 'switched during the request: nothing');
    }
});

test('Part 12b: WIRING — Sales Manager: each claim write and the quota save read a body only under the ok check', () => {
    const s = code(read(P12B_SMT));
    // Moved in §0.249 (review fixes, S): failureWords joined the import for saveUser's catch.
    assert.ok(s.includes("import { refusalWords, failureWords } from '../utils/refusalWords.js';"));
    assert.equal(count(s, 'answer = await res.json().catch(() => ({}));'), 0, 'REGRESSION: the quota answer read before its ok check');
    order(between(s, '    const sendQuotas = async () => {', '\n    };'), 'if (!res.ok) {', 'const refused = await res.json().catch(() => ({}));', 'const answer = await res.json().catch(() => null);');
    for (const start of ['    const updateClaimStatus = async (claim, status) => {', '    const deleteClaim = (claim) => showConfirm(']) {
        order(between(s, start, '} catch (err) {'), 'if (!res.ok) {', 'const d = await res.json().catch(() => ({}));', 'if (!stillOrg(askedOrg)) return;', 'msg: claimRefused(',
            '                return;\n            }\n            if (!stillOrg(askedOrg)) return;\n            setSpiffClaims(');
    }
});

// ── The profile panel (AppHeader) ──
const P12B_HEADER = 'src/components/layout/AppHeader.jsx';
const p12bProfileSave = async ({ answer, switchOrg = false }) => {
    const me = stateOf({ id: 'usr_1', name: 'Karen', timezone: 'America/Chicago' });
    const settings = stateOf({ users: [{ id: 'usr_1', name: 'Karen' }] });
    const did = { sent: [], errors: [], saving: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12B_HEADER, '    const saveProfile = async (updates) => {', '\n    };', '\n    };',
        ['myProfile', 'setProfileError', 'requestOrg', 'setProfileSaving', 'setMyProfile', 'dbFetch', 'readRefusal', 'failureWords', 'stillOrg', 'setSettings'], 'saveProfile')(
        me.value, (v) => did.errors.push(v), () => 'org_a', (v) => did.saving.push(v), me.set, p10Fetch(did, answer, org, switchOrg), readRefusal, failureWords, (o) => o === org.now, settings.set);
    await h({ timezone: 'Europe/London' });
    return { ...did, said: did.errors.filter(Boolean), tz: me.value.timezone, roster: settings.value.users.map((u) => u.name) };
};

test('Part 12b: the profile panel\'s save — a refusal in the house words, the change put back; landed, the stored row; an answer that cannot be read keeps the change; after an org switch nothing — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bProfileSave({ answer });
        assert.deepEqual([r.said, r.tz, r.saving], [[`Not saved — ${words}`], 'America/Chicago', [true, false]], `REGRESSION: ${words}`);
    }
    const landed = await p12bProfileSave({ answer: onceOf(200, { user: { id: 'usr_1', name: 'Karen Lee', timezone: 'Europe/London' } }) });
    assert.deepEqual([landed.said, landed.tz, landed.roster], [[], 'Europe/London', ['Karen Lee']]);
    const unread = await p12bProfileSave({ answer: P11_UNREADABLE() });
    assert.deepEqual([unread.said, unread.tz], [[], 'Europe/London'], 'saved: the change as sent');
    for (const answer of [onceOf(403, { error: 'Forbidden' }), UNSENT(), onceOf(200, { user: { id: 'usr_1', name: 'Other org row' } })]) {
        const r = await p12bProfileSave({ answer, switchOrg: true });
        assert.deepEqual([r.said, r.tz, r.roster], [[], 'Europe/London', ['Karen']], 'REGRESSION: the last org\'s answer said or applied after a switch');
    }
});

const p12bBcc = async ({ answer, switchOrg = false }) => {
    const did = { sent: [], bcc: [], loaded: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12B_HEADER, '    const loadMyBcc = React.useCallback(async () => {', '\n    }, []);', '\n    }, []);',
        ['React', 'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setMyBcc', 'setMyBccLoaded'], 'loadMyBcc')(
        { useCallback: (f) => f }, () => 'org_a', (o) => o === org.now, p10Fetch(did, answer, org, switchOrg), readRefusal, failureWords, (v) => did.bcc.push(v), (v) => did.loaded.push(v));
    await h();
    return did;
};
// Moved in §0.249 (review fixes, round 2): a landed Disconnect also sets calendarConnected, the events and calDisconnected
// before its re-read — the helper hands those setters in and logs each step in `steps`; every assertion below is unchanged.
// Moved in §0.249 (review fixes, round 3): the handler also reads dropCalendarReads (each call logged in `dropAt`, the
// steps taken before it) and calendarLoading (`loading`, false unless named) — every assertion below is unchanged.
const p12bHeaderDisconnect = async ({ answer, switchOrg = false, refetch = null, loading = false }) => {
    const did = { sent: [], errors: [], busy: [], conn: [], refetched: 0, connected: [], events: [], disconnected: [], steps: [], dropAt: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12B_HEADER, '    const disconnectCalendar = async () => {', '\n    };', '\n    };',
        ['calConn', 'requestOrg', 'stillOrg', 'setDisconnecting', 'setCalActionError', 'dbFetch', 'readRefusal', 'failureWords', 'setCalConn', 'fetchCalendarEvents',
            'setCalendarConnected', 'setCalendarEvents', 'setCalDisconnected', 'dropCalendarReads', 'calendarLoading'], 'disconnectCalendar')(
        { id: 'cc_1' }, () => 'org_a', (o) => o === org.now, (v) => did.busy.push(v), (v) => did.errors.push(v), p10Fetch(did, answer, org, switchOrg), readRefusal, failureWords,
        (v) => did.conn.push(v), async () => { did.refetched++; did.steps.push('refetch'); if (refetch) await refetch(); },
        (v) => { did.connected.push(v); did.steps.push(`connected:${v}`); }, (v) => { did.events.push(v); did.steps.push('events'); },
        (v) => { did.disconnected.push(v); did.steps.push(`disconnected:${v}`); }, () => { did.dropAt.push(did.steps.length); }, loading);
    await h();
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12b: the profile panel\'s email-logging address and calendar Disconnect — a refusal in the house words, never "HTTP N" or a raw message; an answer that cannot be read is said, never "not available on this site"; the busy mark cleared however it ends — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        assert.deepEqual((await p12bBcc({ answer })).bcc, [{ configured: false, myAddress: null, error: words }], `REGRESSION: ${words}`);
    }
    for (const answer of [P11_UNREADABLE(), onceOf(200, null)]) {
        assert.deepEqual((await p12bBcc({ answer })).bcc, [{ configured: false, myAddress: null, error: 'Its answer could not be read.' }], 'REGRESSION: an answer that cannot be read drawn as "not available on this site"');
    }
    const ADDR = { configured: true, myAddress: 'u_1@in.example.test', address: 'in@example.test' };
    assert.deepEqual((await p12bBcc({ answer: onceOf(200, ADDR) })).bcc, [ADDR]);
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(200, ADDR)]) {
        const r = await p12bBcc({ answer, switchOrg: true });
        assert.deepEqual([r.bcc, r.loaded], [[], []], 'REGRESSION: the last org\'s address shown after a switch');
    }
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bHeaderDisconnect({ answer });
        assert.deepEqual([r.said, r.conn, r.refetched, r.busy], [[`Not disconnected — ${words}`], [], 0, [true, false]], `REGRESSION: ${words}`);
    }
    for (const answer of [onceOf(200, { ok: true }), P11_UNREADABLE()]) {
        const r = await p12bHeaderDisconnect({ answer });
        assert.deepEqual([r.said, r.conn, r.refetched, r.busy], [[], [null], 1, [true, false]], 'disconnected: the calendar read again');
    }
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(200, {})]) {
        const r = await p12bHeaderDisconnect({ answer, switchOrg: true });
        assert.deepEqual([r.said, r.conn, r.refetched, r.busy], [[], [], 0, [true, false]], 'REGRESSION: after a switch something said or cleared, or the row left busy');
    }
});

// ── The invitation import and the SPIFF claim (ModalLayer) ──
const P12B_LAYER = 'src/components/layout/ModalLayer.jsx';
const p12bInvite = async (answer) => {
    const { emptyReceipt } = await import('../src/utils/importReceipt.js');
    const s = code(read(P12B_LAYER));
    const START = '                    onImportUsers={async (invites) => {';
    const fn = between(s, START, '\n                    }}\n                />').slice(START.length);
    const did = { sent: [] };
    const run = new Function('requestOrg', 'stillOrg', 'stopped', 'emptyReceipt', 'dbFetch', 'failureWords', 'refusalWords', 'setSettings', 'onProgress', 'addToSettingsList',
        'teamsWithMembers', 'settings', 'TEAMS_CHANGED_TWICE', `return async (invites) => {${fn}\n};`)(
        () => 'org_a', () => true, () => 'stopped', emptyReceipt, p10Fetch(did, answer, { now: 'org_a' }, false), failureWords, refusalWords, () => {}, () => {},
        async () => ({ ok: true }), (l) => l, { teams: [], revs: {} }, 'twice');
    return run([{ email: 'a@x.test' }, { email: 'b@x.test' }]);
};

test('Part 12b: the invitation import — a request that stops the run is said in the house words (its ref kept), never "HTTP N" or a raw message; the per-invite refusals still read — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const { receipt } = await p12bInvite(answer);
        assert.deepEqual([receipt.error, receipt.failed, receipt.created], [`Sending stopped: ${words}`, 2, 0], `REGRESSION: ${words}`);
    }
    const part = await p12bInvite(onceOf(201, { invited: [{ id: 'usr_9', email: 'a@x.test' }], errors: [{ email: 'b@x.test', error: 'Already a member.' }] }));
    assert.deepEqual([part.receipt.error, part.receipt.created, part.receipt.failed, part.refusals], [null, 1, 1, [{ email: 'b@x.test', error: 'Already a member.' }]]);
    const none = await p12bInvite(onceOf(400, { invited: [], errors: [{ email: 'a@x.test', error: 'x' }, { email: 'b@x.test', error: 'y' }] }));
    assert.deepEqual([none.receipt.error, none.receipt.failed], [null, 2], 'every address refused: the receipt names them, the run not stopped');
});

const P12B_NEW_CLAIM = Object.freeze({ id: 'claim_new', spiffId: 'sp_1', status: 'pending' });
const p12bClaimSubmit = async ({ answer, switchOrg = false }) => {
    const s = code(read(P12B_LAYER));
    const body = between(s, '                                                    setSpiffClaimBusy(spiff.id);\n', '\n                                                }}');
    const claims = stateOf([]);
    const did = { sent: [], errors: [], busy: [] };
    const org = { now: 'org_a' };
    const run = new Function('setSpiffClaimBusy', 'spiff', 'requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'setSpiffClaimError', 'setSpiffClaims', 'newClaim', 'console',
        `return async () => {\n${body}\n};`)(
        (v) => did.busy.push(v), { id: 'sp_1' }, () => 'org_a', (o) => o === org.now, p10Fetch(did, answer, org, switchOrg), readRefusal, failureWords,
        (v) => did.errors.push(v), claims.set, P12B_NEW_CLAIM, quiet);
    await run();
    return { ...did, said: did.errors.filter(Boolean), claims: claims.value };
};

test('Part 12b: the SPIFF claim — a refusal in the house words with its ref, never "network error. Nothing was saved."; filed with an answer that cannot be read, the claim as sent; after an org switch nothing — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bClaimSubmit({ answer });
        assert.deepEqual([r.said, r.claims, r.busy], [[`Claim not submitted — ${words}`], [], ['sp_1', null]], `REGRESSION: ${words}`);
    }
    const FILED = { ...P12B_NEW_CLAIM, id: 'claim_srv' };
    assert.deepEqual((await p12bClaimSubmit({ answer: onceOf(201, { spiffClaim: FILED }) })).claims, [FILED]);
    assert.deepEqual((await p12bClaimSubmit({ answer: P11_UNREADABLE() })).claims, [P12B_NEW_CLAIM], 'filed: the claim as sent');
    for (const answer of [onceOf(403, { error: 'Forbidden' }), UNSENT(), onceOf(201, { spiffClaim: FILED })]) {
        const r = await p12bClaimSubmit({ answer, switchOrg: true });
        assert.deepEqual([r.said, r.claims], [[], []], 'REGRESSION: the last org\'s answer said or filed after a switch');
    }
});

test('Part 12b: WIRING — the profile panel and the layer: no "HTTP N", no raw e.message; the per-invite read kept (named for the guard), its stop in refusalWords\' words', () => {
    const h = code(read(P12B_HEADER));
    assert.ok(h.includes("import { readRefusal, failureWords } from '../../utils/refusalWords.js';"));
    assert.ok(!/HTTP \$\{|'HTTP '/.test(h) && !P12B_NO_RAW.test(h), 'REGRESSION: "HTTP N" or a raw e.message in the profile panel');
    assert.ok(!h.includes('the change did not reach the server'), 'the old offline words');
    const m = code(read(P12B_LAYER));
    assert.ok(m.includes("import { readRefusal, refusalWords, failureWords } from '../../utils/refusalWords.js';"));
    assert.equal(count(m, 'd = await res.json().catch(() => ({}));'), 1, 'the per-invite read, by design (each address\'s refusal)');
    assert.ok(m.includes('receipt.error = `Sending stopped: ${res ? refusalWords(res, d) : d.error}`;') && m.includes('d = { error: failureWords(e) };'));
    assert.ok(!/HTTP \$\{|'HTTP '/.test(m) && !P12B_NO_RAW.test(m), 'REGRESSION: "HTTP N" or a raw e.message in the layer');
    assert.ok(!m.includes('network error. Nothing was saved.'));
});

// ── App's calendar reads ──
const p12bCalendar = async ({ answer, switchOrg = false }) => {
    const did = { sent: [], errors: [], connected: [], events: [], loading: [], read: [] };
    const org = { now: 'org_a' };
    const h = p12aFn('src/App.jsx', '    const fetchCalendarEvents = async () => {', '\n    };', '\n    };',
        ['requestOrg', 'stillOrg', 'setCalendarLoading', 'setCalendarError', 'waitForToken', 'dbFetch', 'readRefusal', 'failureWords', 'setCalendarConnected', 'setCalendarEvents',
            'calendarReadGen', 'setCalendarRead'], 'fetchCalendarEvents')(   // moved in §0.249 (review fixes, round 3): its sequence and the read flag
        () => 'org_a', (o) => o === org.now, (v) => did.loading.push(v), (v) => did.errors.push(v), async () => {}, p10Fetch(did, answer, org, switchOrg), readRefusal, failureWords,
        (v) => did.connected.push(v), (v) => did.events.push(v), { current: 0 }, (v) => did.read.push(v));
    await h();
    return { ...did, said: did.errors.filter(Boolean) };
};
const p12bLogFromCal = async ({ answer, switchOrg = false }) => {
    const did = { sent: [], errors: [], events: [], open: [] };
    const org = { now: 'org_a' };
    const h = p12aFn('src/App.jsx', '    const fetchLogFromCalEvents = async () => {', '\n    };', '\n    };',
        ['requestOrg', 'stillOrg', 'setLogFromCalLoading', 'setLogFromCalError', 'dbFetch', 'logFromCalDateFrom', 'logFromCalDateTo', 'readRefusal', 'failureWords',
            'setLogFromCalEvents', 'setLogFromCalOpen'], 'fetchLogFromCalEvents')(
        () => 'org_a', (o) => o === org.now, () => {}, (v) => did.errors.push(v), p10Fetch(did, answer, org, switchOrg), '2026-11-01', '2026-11-13', readRefusal, failureWords,
        (v) => did.events.push(v), (v) => did.open.push(v));
    await h();
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12b: App\'s calendar reads — a refusal in the house words, never "Failed to load calendar", "Failed to fetch" or "Unexpected token \'<\'"; landed, the events; after an org switch nothing — RUN', async () => {
    const EV = { id: 'ev_1', summary: 'Acme call' };
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bCalendar({ answer });
        assert.deepEqual([r.said, r.connected, r.events, r.loading], [[`The calendar could not be read — ${words}`], [], [], [true, false]], `REGRESSION: ${words}`);   // moved in §0.249 (review fixes): a failed read leaves calendarConnected as last read
    }
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bLogFromCal({ answer });
        assert.deepEqual([r.said, r.events, r.open], [[`The calendar could not be read — ${words}`], [], []], `REGRESSION: ${words}`);
    }
    assert.deepEqual((await p12bCalendar({ answer: P11_UNREADABLE() })).said, ['The calendar could not be read — Its answer could not be read.']);
    const off = await p12bCalendar({ answer: onceOf(200, { connected: false }) });
    assert.deepEqual([off.said, off.connected, off.events], [[], [false], [[]]]);
    const on = await p12bCalendar({ answer: onceOf(200, { connected: true, events: [EV] }) });
    assert.deepEqual([on.said, on.connected, on.events], [[], [true], [[EV]]]);
    const log = await p12bLogFromCal({ answer: onceOf(200, { events: [EV] }) });
    assert.deepEqual([log.said, log.events, log.open], [[], [[EV]], [true]]);
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(200, { connected: true, events: [EV] })]) {
        const r = await p12bCalendar({ answer, switchOrg: true });
        assert.deepEqual([r.said, r.connected, r.events, r.loading], [[], [], [], [true]], 'REGRESSION: the last org\'s calendar said or shown after a switch');
    }
});

// ── Part 12c — the utils, Q4 and THE GUARD ──
// Part 12c (state §0.249, docs/design/refusal-sweep Part 12; Jeff, 13 Nov: "Start Part 12" — Q4 "Recommended"): the
// documents uploads and links (src/utils/documentsStorage.js) read their bodies with no ok check through asJson — a
// refusal's words were whatever `error` the body held, a 502's page threw "Unexpected token '<'", the R2 upload said
// "Upload failed (HTTP N)" or "check your connection", and a record made whose answer could not be read said "File
// uploaded but the record failed to save". Each request now checks res.ok first and throws the house words; asJson is
// gone (dbFetch always answers a Response). The bulk importer (bulkClient.js) let a chunk whose request threw out of its
// loop — the earlier chunks' rows, written, never reached the screen (18b15) — and now ends the run in the house words.
// Q4: NETWORK_ERROR (storage.js) is "The server could not be reached." — one sentence for a request that never left —
// and the task rail's fallback says it too. THE GUARD (tests/refusals-said.test.mjs) reads every source under src/.

const p12cDocs = await import('../src/utils/documentsStorage.js');
const { setRequestOrg: p12cSetOrg, dbWrite: p12cDbWrite } = await import('../src/utils/storage.js');
const { makeBulkClient: p12cBulk } = await import('../src/utils/bulkClient.js');
const P12C_PENDING = Symbol('pending');
const p12cOutcome = (pr) => Promise.race([pr.then((v) => ({ v }), (e) => ({ e: e.message })), (async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); return P12C_PENDING; })()]);   // pending after 50 turns of the loop (§0.251)
const P12C_FILE = { name: 'contract.pdf', size: 2048, type: 'application/pdf' };
// An answer whose body read switches the request org first (storage.js setRequestOrg — the uploads ask stillOrg).
const p12cSwitchOnRead = (status, body) => {
    const a = onceOf(status, body);
    const json = a.json;
    a.json = async () => { p12cSetOrg('org_b'); return json(); };
    return a;
};
// R2's side: a fake XMLHttpRequest — `r2` says how the PUT ends: { status, responseText } or { offline: true }; `switch`
// switches the org while it is out.
const p12cXhr = (r2, puts) => class {
    constructor() { this.upload = {}; this.status = 0; this.responseText = ''; }
    open(method, url) { this.url = url; }
    setRequestHeader() {}
    send() {
        puts.push(this.url);
        setImmediate(() => {
            if (r2.switch) p12cSetOrg('org_b');
            if (r2.offline) { this.onerror(); return; }
            this.status = r2.status; this.responseText = r2.responseText || '';
            this.onload();
        });
    }
};
// One upload over stubs: `presign`, `record` the documents function's answers (an Error throws); `r2` the PUT's end;
// `switchOn` the request during which the org switches ('presign' or 'record').
const p12cUpload = async ({ kind = 'new', presign = onceOf(200, { storageKey: 'org_a/doc_x/v1/contract.pdf', uploadUrl: 'https://r2.test/put', version: kind === 'new' ? 1 : 3 }),
    record, r2 = { status: 200 }, switchOn = '', seen = {} }) => {
    const sent = [], puts = [];
    Object.assign(seen, { sent, puts });   // what went out, for an upload that never settles
    const had = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = p12cXhr(r2, puts);
    p12cSetOrg('org_a');
    const dbFetch = async (url, opts = {}) => {
        const step = url.includes('action=upload-url') ? 'presign' : 'record';
        sent.push([step, opts.method]);
        if (switchOn === step) p12cSetOrg('org_b');
        const a = step === 'presign' ? presign : record;
        if (a instanceof Error) throw a;
        return a;
    };
    try {
        const run = kind === 'new'
            ? p12cDocs.uploadNewDocument(dbFetch, { file: P12C_FILE, name: 'Contract' })
            : p12cDocs.uploadNewVersion(dbFetch, { file: P12C_FILE, documentId: 'doc_1' });
        const out = await p12cOutcome(run);
        return out === P12C_PENDING ? out : { ...out, sent, puts };
    } finally {
        if (had === undefined) delete globalThis.XMLHttpRequest; else globalThis.XMLHttpRequest = had;
        p12cSetOrg(null);
    }
};

test('Part 12c: a document upload\'s presign and record — a refusal in the house words, the body read only after the ok check; nothing sent past a refusal — RUN', async () => {
    for (const kind of ['new', 'version']) {
        // The presign refused: its words, nothing put to R2, no record asked. Moved in §0.249 (review fixes, D): the step
        // named before the words — a bare "The server returned 403." read the same as R2's.
        for (const [answer, words] of p12bRefused()) {
            const r = await p12cUpload({ kind, presign: answer });
            assert.deepEqual([r.e, r.puts.length, r.sent.length], [`The upload could not start — ${words}`, 0, 1], `${kind}: REGRESSION — the presign's refusal said as "${r.e}"`);
        }
        // A presign that landed with no link to put the file to: said, nothing sent.
        for (const body of [{}, null, { error: 'x' }]) {
            const r = await p12cUpload({ kind, presign: onceOf(200, body) });
            assert.deepEqual([r.e, r.puts.length], ['The upload could not start — Its answer could not be read.', 0], `${kind}: ${JSON.stringify(body)}`);
        }
        assert.equal((await p12cUpload({ kind, presign: P11_UNREADABLE() })).e, 'The upload could not start — Its answer could not be read.', 'REGRESSION: "Unexpected token \'<\'"');
        // The record refused, after the bytes went up: its words. Moved in §0.249 (review fixes, D): a file put to R2 with
        // no record is no document — said as the document (or the new version) not saved. Moved in §0.249 (review fixes,
        // round 2, D2): "not saved" only for the server's own refusal (a 4xx with its words, here the 403); a 5xx, a page,
        // a 4xx without words or a request that threw may have come after a write — "may have been saved".
        for (const [answer, words] of p12bRefused()) {
            const r = await p12cUpload({ kind, record: answer });
            const step = kind === 'new' ? 'The document was not saved' : 'The new version was not saved';
            const maybe = kind === 'new' ? 'The document may have been saved' : 'The new version may have been saved';
            const said = answer.status === 403 ? `${step} — ${words}` : `${maybe} — reload the page to see whether it was: ${words}`;
            assert.deepEqual([r.e, r.puts.length, r.sent.length], [said, 1, 2], `${kind}: REGRESSION — the record's refusal said as "${r.e}"`);
        }
        // A refusal that lands after an org switch, or a request that threw: never settles, never said under the new
        // org's name (§0.175) — the presign's as the record's.
        for (const [answer] of p12bRefused()) {
            assert.equal(await p12cUpload({ kind, record: answer, switchOn: 'record' }), P12C_PENDING, `${kind}: a refusal for an org switched away from`);
            assert.equal(await p12cUpload({ kind, presign: answer, switchOn: 'presign' }), P12C_PENDING, `${kind}: a presign refused for an org switched away from`);
        }
        // ...and one whose refusal's words are read while the org switches: never said.
        for (const step of ['presign', 'record']) {
            const answer = p12cSwitchOnRead(500, { error: 'Internal server error', requestId: 'r1' });
            assert.equal(await p12cUpload({ kind, [step]: answer }), P12C_PENDING, `${kind}: REGRESSION — the ${step}'s refusal, read during a switch, said under the new org's name`);
        }
        // A presign that landed while the org switched: the bytes are never put, the record never asked.
        {
            const seen = {};
            const presign = p12cSwitchOnRead(200, { storageKey: 'org_a/doc_x/v1/contract.pdf', uploadUrl: 'https://r2.test/put', version: 3 });
            assert.equal(await p12cUpload({ kind, presign, seen }), P12C_PENDING);
            assert.deepEqual([seen.puts.length, seen.sent.length], [0, 1], `${kind}: REGRESSION — the last org's file put to R2 after a switch`);
        }
        // The R2 PUT failing while the org switched: never said.
        for (const r2 of [{ offline: true, switch: true }, { status: 403, switch: true }]) {
            assert.equal(await p12cUpload({ kind, r2 }), P12C_PENDING, `${kind}: REGRESSION — R2's failure said after a switch`);
        }
    }
});

test('Part 12c: a document made whose answer cannot be read is said as made, a new version taken as landed — never "failed to save" — RUN', async () => {
    const DOC = { id: 'doc_x', name: 'Contract', links: [{ id: 'dlk_1', type: 'account', recordId: 'acc_1' }] };
    assert.deepEqual((await p12cUpload({ record: onceOf(201, { document: DOC }) })).v, DOC, 'landed: the server\'s row');
    for (const record of [P11_UNREADABLE(), onceOf(201, {}), onceOf(201, null), onceOf(201, { document: 'x' })]) {
        assert.equal((await p12cUpload({ record })).e, 'The file was uploaded. Its answer could not be read — reload the page to see it.',
            'REGRESSION: a record made said "File uploaded but the record failed to save"');
    }
    // A new version: the server's number, else the one presigned (stored only under the key presigned for it).
    assert.equal((await p12cUpload({ kind: 'version', record: onceOf(200, { ok: true, version: 4 }) })).v, 4, 'the server\'s number first');
    for (const record of [P11_UNREADABLE(), onceOf(200, {}), onceOf(200, { ok: true, version: '3' })]) {
        assert.equal((await p12cUpload({ kind: 'version', record })).v, 3, 'REGRESSION: a version that landed said "New version failed to save"');
    }
    assert.equal((await p12cUpload({ kind: 'version', presign: onceOf(200, { storageKey: 'k', uploadUrl: 'https://r2.test/put' }), record: P11_UNREADABLE() })).e,
        'The new version was uploaded. Its answer could not be read — reload the page to see it.', 'no number presigned: said as made');
    // After an org switch, nothing — a landed answer as a refused one, at the send or at the body read.
    assert.equal(await p12cUpload({ record: onceOf(201, { document: DOC }), switchOn: 'record' }), P12C_PENDING);
    assert.equal(await p12cUpload({ record: p12cSwitchOnRead(201, { document: DOC }) }), P12C_PENDING, 'REGRESSION: the last org\'s document handed to the new org\'s screen');
    assert.equal(await p12cUpload({ kind: 'version', record: p12cSwitchOnRead(200, { ok: true, version: 3 }) }), P12C_PENDING);
});

test('Part 12c: the R2 upload says the house words — the server\'s words where its body holds them, else "The server returned N.", offline "The server could not be reached." — never "HTTP N" — RUN', async () => {
    const xml = '<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code></Error>';
    for (const kind of ['new', 'version']) {
        for (const [r2, words] of [
            [{ status: 403, responseText: xml }, 'The server returned 403.'],
            [{ status: 500, responseText: JSON.stringify({ error: 'Bucket unavailable', requestId: 'r9' }) }, 'Bucket unavailable (ref r9)'],
            [{ status: 413, responseText: '' }, 'The server returned 413.'],
            [{ offline: true }, 'The server could not be reached.'],
        ]) {
            const r = await p12cUpload({ kind, r2 });
            // Moved in §0.249 (review fixes, D): R2's step named before its words.
            assert.deepEqual([r.e, r.sent.length], [`The file was not stored — ${words}`, 1], `${kind}: REGRESSION — "Upload failed (HTTP N)" or "check your connection": ${r.e}`);
        }
    }
});

test('Part 12c: a download or preview link — the ok check first, a refusal in the house words; a link that cannot be read is said — RUN', async () => {
    const link = async (answer) => {
        const dbFetch = async () => { if (answer instanceof Error) throw answer; return answer; };
        try { return { v: await p12cDocs.getSignedUrlFor(dbFetch, { id: 'doc_1', inline: true }) }; } catch (e) { return { e: e.message }; }
    };
    for (const [answer, words] of p12bRefused()) assert.deepEqual(await link(answer), { e: words }, `REGRESSION: ${words}`);
    assert.deepEqual(await link(onceOf(200, { url: 'https://files.test/doc_1' })), { v: 'https://files.test/doc_1' });
    for (const answer of [P11_UNREADABLE(), onceOf(200, {}), onceOf(200, { error: 'x' }), onceOf(200, { url: 42 })]) {
        assert.deepEqual(await link(answer), { e: 'Its answer could not be read.' }, 'REGRESSION: a link that could not be read, said in its parse error or a 200\'s words');
    }
});

test('Part 12c: WIRING — documentsStorage: no asJson, every request ok-first through `reached`; no "HTTP N", "check your connection" or old words', () => {
    const s = code(read('src/utils/documentsStorage.js'));
    assert.ok(!/asJson/.test(s), 'REGRESSION: a read that takes a refusal\'s body as the answer');
    assert.equal(count(s, 'await reached(dbFetch('), 4, 'the presign, the record, the new version, the link');
    assert.equal(count(s, 'if (!res.ok) throw new Error(await readRefusal(res));'), 1, 'the link (its screen checks the org: useDocuments openFile)');
    // Moved in §0.249 (review fixes, round 2, D2): the record and the new version read their refusal's body in the ok
    // check and say it through recordRefusal — the three still checking the org before it is said.
    assert.equal(count(s, 'const why = await readRefusal(res);'), 1, 'the presign, the org checked before it is said');
    assert.equal(count(s, 'const body = await res.json().catch(() => null);\n    if (!stillOrg(askedOrg)) return stopped();\n    throw recordRefusal(res, body, '), 2,
        'the record and the new version, the org checked before it is said');
    // Moved in §0.249 (review fixes, D): each of the three names its step too. Moved in §0.249 (review fixes, round 2,
    // D2): the record's two name their "may have been saved" words instead.
    assert.equal(count(s, '}), askedOrg, STEP_') + count(s, '}), askedOrg, MAYBE_'), 3, 'an upload\'s three requests name the org that asked: one that threw after a switch never settles');
    assert.equal(count(s, ".catch((e) => { if (!stillOrg(askedOrg)) return stopped(); throw e; });"), 2, 'the R2 PUT likewise');
    // Moved in §0.249 (review fixes, round 2, D2): 4 -> 6, the two refusal bodies read in their ok checks.
    assert.equal(count(s, 'await res.json().catch(() => null);'), 6);
    assert.ok(!/HTTP \$\{|'HTTP '|check your connection|failed to save|Could not start the upload|Could not get a download link/.test(s), 'REGRESSION: the old words');
    order(s, 'xhr.onload = ', ': reject(new Error(stepped(STEP_STORE, r2Refusal(xhr))));', "xhr.onerror = () => reject(new Error(stepped(STEP_STORE, 'The server could not be reached.')));");
});

test('Part 12c: the bulk importer — a chunk whose request threw ends the run in the house words and keeps what landed before it; it never throws — RUN', async () => {
    const rows = Array.from({ length: 900 }, (_, i) => ({ id: `r${i}` }));
    for (const thrown of [new TypeError('Failed to fetch'), new TypeError('NetworkError when attempting to fetch resource.')]) {
        let n = 0;
        const fetchFn = async (url, opts) => {
            n++;
            if (n === 2) throw thrown;
            const chunk = JSON.parse(opts.body);
            return onceOf(200, opts.method === 'POST' ? { insertedIds: chunk.map((r) => r.id) } : { updated: chunk.length, notFound: [], forbidden: [] });
        };
        const posted = await p12cBulk(fetchFn).postNew('/x', rows);
        assert.deepEqual([posted.landed.length, posted.error, posted.attempted], [400, 'The server could not be reached.', 900],
            'REGRESSION: the throw left the loop — chunk 1\'s rows, written, never reached the screen');
        n = 0;
        const put = await p12cBulk(fetchFn).putBulk('/x', rows);
        assert.deepEqual([put.appliedIds.length, put.updated, put.error], [400, 400, 'The server could not be reached.']);
    }
    // A refused chunk keeps its words (errorFrom), the ref with them.
    const refused = await p12cBulk(async () => onceOf(500, { error: 'Internal server error', requestId: 'r1' })).postNew('/x', rows.slice(0, 3));
    assert.deepEqual([refused.landed.length, refused.error], [0, 'Internal server error (ref r1)']);
});

test('Part 12c: Q4 — one sentence for a request that never left: NETWORK_ERROR is failureWords\' own, dbWrite says it, the task rail\'s fallback says it — RUN', async () => {
    assert.equal(NETWORK_ERROR, 'The server could not be reached.', 'REGRESSION: "Network error — the change was not saved."');
    assert.equal(NETWORK_ERROR, failureWords(new TypeError('Failed to fetch')), 'one sentence, the thrown fetch\'s too');
    assert.equal(failureWords(new Error(NETWORK_ERROR)), NETWORK_ERROR, 'thrown in its words (putSettings), it passes as said');
    const hadFetch = globalThis.fetch, hadWindow = globalThis.window;
    globalThis.window = {};
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    try {
        assert.deepEqual(await p12cDbWrite('/x', { method: 'PUT' }), { ok: false, status: 0, error: 'The server could not be reached.' });
    } finally {
        globalThis.fetch = hadFetch;
        if (hadWindow === undefined) delete globalThis.window; else globalThis.window = hadWindow;
    }
    // Wrapped in a sentence it still reads as one (the Kanban's press notice, a document edit's toast).
    assert.equal(`Not moved to Proposal: ${NETWORK_ERROR}`, 'Not moved to Proposal: The server could not be reached.');
    // The task rail: nothing answered (the activity save's catch, quiet) ends a sentence in the house words.
    const t = code(read('src/components/rails/TaskRail.jsx'));
    const said = new Function(`${t.split('\n').find((l) => l.startsWith('const said = '))}\nreturn said;`)();
    assert.equal(`The task is completed — its notes were not saved: ${said(undefined)}.`, 'The task is completed — its notes were not saved: The server could not be reached.',
        'REGRESSION: "check your connection and try again"');
    assert.equal(said(''), 'The server could not be reached');
    assert.equal(said('Internal server error (ref r1)'), 'Internal server error (ref r1)');
    assert.equal(said('The server returned 502.'), 'The server returned 502', 'the full stop the sentence\'s');
});

test('Part 12c: WIRING — no source under src/ says "check your connection" or "Network error — the change was not saved."', () => {
    const files = [];
    const walk = (rel) => {
        for (const name of readdirSync(new URL(rel, ROOT))) {
            const p = `${rel}${name}`;
            if (statSync(new URL(p, ROOT)).isDirectory()) walk(`${p}/`); else if (/\.(js|jsx)$/.test(name)) files.push(p);
        }
    };
    walk('src/');
    // Moved floor (§0.249, the review's fixes, round 4: G4): 242, the .js and .jsx sources measured under src/ (it was 240
    // — two sources could drop out of the walk and go unsearched with nothing said). Fewer: say the new count, and why.
    assert.ok(files.length >= 242, `every .js and .jsx source (${files.length})`);
    // No file named since the review's fixes L (§0.249): the app's outage banner (fetchStatus.js bannerCopyOf) said
    // "Check your connection and refresh." over a server that answered — it says the server's failure now.
    const said = files.filter((f) => /check your connection|Network error — the change was not saved/i.test(code(read(f))));
    assert.deepEqual(said, [], 'REGRESSION: the old words for a request that never left');
});

// ── Part 12 — the review's fixes (A — Audit log) ──
// The review of §0.249 (findings 0, 10, 14, 3 and 13): the Audit log's export offered "CSV · 0 events" and saved a file
// of none over a read that failed or had not landed; an Add that landed with an answer that could not be read left "No
// destinations." under "Destination added"; a failed destinations load was wiped by the next Add, and "Streaming to 1
// destination" counted a list never read; errorOf (the load, Add, Pause / Rotate, Remove) dropped the ref. The export is
// off, saying why, until the log is read; the list's unknown state is its own line, kept until a read lands; the badge
// counts only a list that was read; every destination refusal says readRefusal's words, the ref kept.
const p12fxAPress = async (which, answer, args, unreadBefore = '') => {
    const did = { sent: [], errors: [], busy: [], tests: [], modal: [], reveal: [], read: [], unreadBefore };
    did.answered = await auditActions(did, answer)[which](...args);
    return { ...did, said: did.errors.filter(Boolean) };
};
const P12FXA_LOAD = 'Destinations did not load — Internal server error (ref r1)';

test('Part 12 fixes (A): the Audit log\'s Add — a refusal in readRefusal\'s words, the ref kept; landed unread, the list unknown and a load\'s failure kept; landed, nothing of the list marked read — RUN', async () => {
    // Moved pin (§0.249, the review's fixes, round 4): only the server's own refusal (the 403) leaves the window open with
    // its words; any other answer may have made the destination — the window closes, the list not known, the words kept.
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await p12fxAPress('createDest', answer, [{ name: 'X' }]);
        const own = !(answer instanceof Error) && answer.status === 403;
        assert.deepEqual([did.answered, did.modal, did.read, did.unread.value, did.said], own
            ? [{ ok: false, error: words }, [], [], '', []]
            : [{ ok: true }, [false], [false], 'A destination may be missing from the list — reload the page to see every destination.',
                [`The destination may have been added — reload the page to see whether it was: ${words}`]], `REGRESSION: ${words} — the ref dropped (errorOf)`);
    }
    const unread = await p12fxAPress('createDest', P11_UNREADABLE(), [{ name: 'X' }]);
    assert.deepEqual([unread.answered, unread.modal, unread.read, unread.dests.value.map((d) => d.id)], [{ ok: true }, [false], [false], ['dst_1']],
        'REGRESSION: "No destinations." drawn under "Destination added" — the list still read as known');
    assert.equal(unread.unread.value, 'The list may be missing the destination just added — reload the page to see every destination.');
    const kept = await p12fxAPress('createDest', P11_UNREADABLE(), [{ name: 'X' }], P12FXA_LOAD);
    assert.equal(kept.unread.value, P12FXA_LOAD, 'REGRESSION: the load\'s failure replaced by the Add');
    const landed = await p12fxAPress('createDest', onceOf(201, { destination: { id: 'dst_2', name: 'X' }, secret: 's3cret' }), [{ name: 'X' }], P12FXA_LOAD);
    assert.deepEqual([landed.read, landed.unread.value, landed.dests.value.map((d) => d.id)], [[], P12FXA_LOAD, ['dst_1', 'dst_2']],
        'REGRESSION: an Add over a list that did not load wipes its failure, or takes the list as read');
});

test('Part 12 fixes (A): the Audit log\'s Pause / Rotate — a refusal in readRefusal\'s words, the ref kept, never "the server returned N" — RUN', async () => {
    // Moved pin (§0.249, the review's fixes, round 3): only the server's own refusal (the 403) says "not saved"; any other
    // answer says the Pause may have been saved, the words and ref kept.
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await p12fxAPress('putDest', answer, [{ id: 'dst_1', paused: true }, 'Pause']);
        const own = !(answer instanceof Error) && answer.status === 403;
        assert.deepEqual([did.said, did.answered, did.busy, did.dests.value[0].status],
            [[own ? `Pause not saved — ${words}` : `Pause may have been saved — reload the page to see whether it was: ${words}`], null, ['dst_1', null], 'Active'], `REGRESSION: ${words}`);
    }
    const rot = await p12fxAPress('putDest', onceOf(500, { error: 'Internal server error', requestId: 'r9' }), [{ id: 'dst_1', rotateSecret: true }, 'Rotate secret']);
    assert.deepEqual(rot.said, ['The secret may have been rotated — reload the page to see whether it was, and rotate again to see a new one: Internal server error (ref r9)']);
    const rotOwn = await p12fxAPress('putDest', onceOf(404, { error: 'Destination not found.' }), [{ id: 'dst_1', rotateSecret: true }, 'Rotate secret']);
    assert.deepEqual(rotOwn.said, ['Rotate secret not saved — Destination not found.']);
});

// Moved pin (§0.249, the review's fixes, round 4): a Remove's refusal is read once (refusalWords) and judged by the
// module's destRefusedOwn; an answer that proves nothing marks the row's status not known (setStatusUnread).
const p12fxARemove = async (answer, statusBefore = []) => {
    const did = { errors: [], busy: [], sent: [] };
    const dests = stateOf([P12A_DEST, { id: 'dst_2', name: 'Splunk', status: 'Active' }]);
    const statusUnread = stateOf(statusBefore);
    const destRefusedOwn = new Function(`return ${between(code(read(P12A_AUDIT)), 'const destRefusedOwn = ', ';\n').slice('const destRefusedOwn = '.length)};`)();
    // Moved pin (§0.249, the review's fixes, last pass — F1): a delete's 404 in the server's words is judged by the
    // module's destGone, built from the source line over the real destRefusedOwn.
    const destGone = new Function('destRefusedOwn', `return ${between(code(read(P12A_AUDIT)), 'const destGone = ', ';\n').slice('const destGone = '.length)};`)(destRefusedOwn);
    let confirmed = null;
    const remove = p12aFn(P12A_AUDIT, '    const remove = (dest) => showConfirm(', '\n    }, true);', '\n    }, true);',
        ['showConfirm', 'setDestError', 'setBusyId', 'dbFetch', 'STREAM_URL', 'readRefusal', 'failureWords', 'setDests', 'setStatusUnread', 'refusalWords', 'destRefusedOwn', 'destGone'], 'remove')(
        (msg, run) => { confirmed = run; }, (v) => did.errors.push(v), (v) => did.busy.push(v),
        async (url, opts = {}) => { did.sent.push([url, opts.method]); if (answer instanceof Error) throw answer; return answer; },
        '/.netlify/functions/audit-stream', readRefusal, failureWords, dests.set, statusUnread.set, refusalWords, destRefusedOwn, destGone);
    remove(P12A_DEST);
    await confirmed();
    return { ...did, said: did.errors.filter(Boolean), ids: dests.value.map((d) => d.id), dests: dests.value, statusUnread: statusUnread.value };
};

test('Part 12 fixes (A): the Audit log\'s Remove — a refusal in readRefusal\'s words, the ref kept, the row kept; landed, only its row gone — RUN', async () => {
    // Moved pin (§0.249, the review's fixes, round 4): only the server's own refusal (the 403) says "failed", the row known;
    // any other answer says the destination may have been removed, the row kept, its status not known.
    for (const [answer, words] of P12A_REFUSED()) {
        const did = await p12fxARemove(answer);
        const own = !(answer instanceof Error) && answer.status === 403;
        assert.deepEqual([did.said, did.ids, did.busy, did.statusUnread],
            [[own ? `Remove destination failed — ${words}` : `The destination may have been removed — reload the page to see whether it was: ${words}`],
                ['dst_1', 'dst_2'], ['dst_1', null], own ? [] : ['dst_1']], `REGRESSION: ${words}`);
    }
    const landed = await p12fxARemove(onceOf(200, { ok: true }));
    assert.deepEqual([landed.said, landed.ids, landed.sent], [[], ['dst_2'], [['/.netlify/functions/audit-stream?id=dst_1', 'DELETE']]]);
});

test('Part 12 fixes (A): the Audit log\'s destinations load — a refusal in readRefusal\'s words on the unread line; a read that lands clears it — RUN', async () => {
    for (const [answer, words] of P12A_REFUSED().filter(([a]) => !(a instanceof Error))) {
        const r = await loadDestsRun(answer);
        assert.deepEqual([r.errors, r.read, r.dests, r.thrown], [[`Destinations did not load — ${words}`], [], [], null], `REGRESSION: ${words} — the ref dropped, or the old "(N)"`);
    }
    const landed = await loadDestsRun(onceOf(200, { destinations: [] }));
    assert.deepEqual([landed.read, landed.dests, landed.errors], [[true], [[]], ['']], 'REGRESSION: a read that landed keeps the unread line');
    // Offline the load throws; the effect says it on the same line (the moved pin in Part 12a's read test runs it).
    // Moved pin (§0.249, the review's fixes, round 3): the destinations' own effect.
    const offline = await p12fxA3DestsLoad(async () => { throw UNSENT(); });
    assert.deepEqual(offline.destErrors, ['Destinations did not load — The server could not be reached.']);
});

// Moved pin (§0.249, the review's fixes, round 2): the badge's piece starts at unknownCount and reads statusUnread.
const p12fxABadge = (dests, destsRead, statusUnread = []) => new Function('dests', 'destsRead', 'statusUnread',
    `${between(code(read(P12A_AUDIT)), '    const unknownCount = ', '\n    const catStyle')}\nreturn streamingBadge;`)(dests, destsRead, statusUnread);

test('Part 12 fixes (A): the Audit log\'s "Streaming to N destinations" — drawn only over a list that was read — RUN', () => {
    assert.equal(p12fxABadge([P12A_DEST], false), undefined, 'REGRESSION: "Streaming to 1 destination" over a list never read');
    assert.equal(p12fxABadge([P12A_DEST], true), 'Streaming to 1 destination');
    assert.equal(p12fxABadge([P12A_DEST, { id: 'dst_2', status: 'Paused' }], true), 'Streaming to 2 destinations · 1 not delivering');
    assert.equal(p12fxABadge([], true), undefined);
});

const p12fxAExport = (eventsLoading, eventsError) => new Function('eventsLoading', 'eventsError',
    `${between(code(read(P12A_AUDIT)), '    const eventsRead = ', '\n\n')}\nreturn { eventsRead, exportWhy };`)(eventsLoading, eventsError);

test('Part 12 fixes (A): the Audit log\'s export — off, saying why, while the log loads or after its read failed; never "0 events" or a file of none — RUN, and WIRING', () => {
    assert.deepEqual(p12fxAExport(true, null), { eventsRead: false, exportWhy: 'The audit log is still loading' }, 'REGRESSION: an export of none before the read lands');
    assert.deepEqual(p12fxAExport(false, 'Internal server error (ref r1)'), { eventsRead: false, exportWhy: 'The audit log did not load — there is nothing to export' },
        'REGRESSION: an export of none over a read that failed');
    assert.deepEqual(p12fxAExport(false, null), { eventsRead: true, exportWhy: undefined });
    const s = code(read(P12A_AUDIT));
    assert.ok(s.includes("<button disabled={!eventsRead} title={exportWhy} onClick={() => { if (eventsRead) downloadEvents(visible, 'CSV'); }}"),
        'REGRESSION: Export CSV saves a file of none over a read that failed');
    assert.ok(s.includes('<button ref={exportBtnRef} disabled={!eventsRead} title={exportWhy} onClick={() => { if (eventsRead) setExportOpen(o => !o); }}'),
        'REGRESSION: ▾ opens "CSV · 0 events" over a read that failed');
    assert.ok(between(s, '{exportOpen && eventsRead && (', '\n                        )}').includes('<AuditExportDropdown events={visible}'),
        'REGRESSION: the export menu drawn over a log that was not read');
    assert.equal(count(s, '<AuditExportDropdown '), 1, 'one export menu');
    assert.equal(count(s, 'downloadEvents(visible,'), 1, 'one press outside the menu saves the view — behind the gate');
});

test('Part 12 fixes (A): WIRING — the Audit log\'s unknown destinations list is its own line, kept until a read lands; errorOf gone', () => {
    const s = code(read(P12A_AUDIT));
    const line = between(s, '{!destsLoading && !destsRead && (', '{destError && (');
    assert.ok(line.includes("{destsUnread || 'The destinations could not be read — reload the page to see every destination.'}"),
        'REGRESSION: a failed load said only on the banner an action clears');
    assert.equal(count(s, "setDestsUnread('')"), 1, 'cleared only by a read that lands');
    order(between(s, '    const loadDests = ', '\n    }, []);'), 'setDests(listed.destinations);', 'setDestsRead(true);', "setDestsUnread('');");
    assert.ok(!/setDestError\(`Destinations did not load/.test(s), 'REGRESSION: the load\'s failure on the banner an Add clears');
    assert.equal(count(s, 'errorOf'), 0, 'REGRESSION: errorOf — the ref dropped');
    // Moved pin (§0.249, the review's fixes, round 3): Pause / Rotate and Send test read the refusal once, judge it
    // (destRefusedOwn), and say refusalWords' words — "not saved" / "not sent" or "may have been".
    // Moved pin (§0.249, the review's fixes, round 4): the Add and Remove read the refusal once too, judged by destRefusedOwn.
    assert.equal(count(s, 'await readRefusal(res)'), 1, 'the load says readRefusal\'s words');
    assert.equal(count(s, 'refusalWords(res, refused)'), 8, 'the Add, Pause / Rotate, Send test and Remove say refusalWords\' words, either way');
});

// ── Part 12 — the review's fixes (U — Users) ──
// The review of §0.249 (findings 6, 9, 12 and 19): the Clerk sync took no org — a roster read again that landed after an
// org switch put the org switched away from's members into the new org's settings (useApp's setSettings outlives the
// switch); the Pending invites page drew a failed Clerk read as none — every invited row "No live link" in warning
// colour, "No invitations pending." over an unread list — since its failure set the list to [], "read, and empty"; and
// an invite that landed with an answer that could not be read said so in the red box of a failure and left Send armed
// over the same rows, a second press emailing each person again. The sync checks its org after each answer and in both
// catches; the unread list is its own state (false), its rows "Link not read" in muted colour, its empty state and count
// line the roster's; the landed-unread invite empties the batch, reads the roster again and says it as a notice.
const p12fxUSync = (answers, switchAt = -1) => clerkSync(answers, { switchAt });

test('Part 12 fixes (U): the Clerk sync after an org switch — no word, no roster read, and no other org\'s roster in this org\'s settings — RUN', async () => {
    const ROSTER = () => onceOf(200, { users: [{ id: 'usr_b' }] });
    // The switch while the sync is out: whatever it answers, nothing said, nothing read again, nothing written.
    for (const sync of [onceOf(200, { counts: { created: 1, updated: 0, unchanged: 3 } }), P11_UNREADABLE(), onceOf(403, { error: 'Forbidden' }), P11_PAGE(), UNSENT()]) {
        const did = await p12fxUSync({ sync, roster: ROSTER() }, 0);
        assert.deepEqual([did.msgs.filter(Boolean), did.sent.length, did.roster, did.drift, did.syncing], [[], 1, [], [], [true, false]],
            'REGRESSION: a sync answered after an org switch said on the new org\'s screen, or read the roster there');
    }
    // The switch while the roster read is out: the sync's own words stand (said before the switch); the roster never lands.
    const leak = await p12fxUSync({ sync: onceOf(200, { counts: { created: 1, updated: 0, unchanged: 3 } }), roster: ROSTER() }, 1);
    assert.deepEqual(leak.roster, [], 'REGRESSION: the org switched away from\'s roster written into the new org\'s settings');
    assert.equal(leak.said, 'Synced: 1 added, 0 updated, 3 unchanged');
    for (const roster of [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), P11_PAGE(), UNSENT(), P11_UNREADABLE()]) {
        const late = await p12fxUSync({ sync: onceOf(200, { counts: { created: 0, updated: 0, unchanged: 2 } }), roster }, 1);
        assert.deepEqual([late.said, late.roster], ['Synced: 0 added, 0 updated, 2 unchanged', []], 'REGRESSION: a roster read that failed after a switch said there');
    }
    // In the org that asked, it lands as before.
    const landed = await p12fxUSync({ sync: onceOf(200, { counts: { created: 1, updated: 0, unchanged: 3 } }), roster: ROSTER() });
    assert.deepEqual(landed.roster, [{ users: [{ id: 'usr_b' }] }]);
});

test('Part 12 fixes (U): WIRING — the Clerk sync takes its org first and checks it before each word and the roster write', () => {
    const sync = between(code(read(P12A_USERS)), '    const runClerkSync = async () => {', '\n    };');
    order(sync, 'const askedOrg = requestOrg();', "await dbFetch('/.netlify/functions/users-sync'", 'const synced = await res.json().catch(() => null);',
        'if (!stillOrg(askedOrg)) return;', 'setSyncMsg(msg);', "await dbFetch('/.netlify/functions/users')", 'const ud = await r.json();',
        'if (!stillOrg(askedOrg)) return;', '_setSettings(prev => ({ ...prev, users: ud.users }))');
    assert.equal(count(sync, 'if (!stillOrg(askedOrg)) return;'), 4, 'after the sync\'s answer, after the roster\'s, and in both catches');
    assert.equal(count(sync, '_setSettings('), 1, 'one write of the roster, behind the check');
});

// The Pending page's revoke updater, extracted and run: only a list that was read loses the row.
const p12fxUDrop = (prev, email) => new Function('e',
    `return ${between(code(read(P12A_USERS)), 'setClerkInvites(prev => ', ');\n').slice('setClerkInvites('.length)};`)({ email })(prev);

test('Part 12 fixes (U): Pending invites over a failed Clerk read — unread is its own state, never "read, and empty"; a revoke keeps it unread — RUN', async () => {
    for (const [answer] of P12A_REFUSED()) assert.deepEqual((await pendingLoad(answer)).invites, [false], 'REGRESSION: a failed read set as [] — "read, and empty"');
    assert.deepEqual((await pendingLoad(P11_UNREADABLE())).invites, [false]);
    const INV = [{ email: 'a@x.test' }, { email: 'b@x.test' }];
    assert.equal(p12fxUDrop(false, 'a@x.test'), false, 'REGRESSION: a revoke turned an unread list into "read, and empty"');
    assert.equal(p12fxUDrop(null, 'a@x.test'), null, 'a list still reading stays reading');
    assert.deepEqual(p12fxUDrop(INV, 'a@x.test'), [{ email: 'b@x.test' }]);
});

test('Part 12 fixes (U): WIRING — Pending invites over a failed Clerk read: "Link not read" in muted colour, never "No live link" nor "No invitations pending."', () => {
    const page = between(code(read(P12A_USERS)), 'const UsersPendingPage = ', '\nconst UsersSeatPage = ');
    assert.ok(page.includes('const invitesUnread = clerkInvites === false;'));
    assert.ok(page.includes('            setClerkInvites(false);   // unread'), 'REGRESSION: a failed read set as [] — every row "No live link"');
    assert.equal(count(page, 'setClerkInvites([])'), 0);
    assert.ok(page.includes("{!e.invite ? (clerkInvites === null ? '…' : invitesUnread ? 'Link not read' : 'No live link') :"),
        'REGRESSION: "No live link" on a row whose link was never read');
    assert.ok(page.includes('color: !e.invite && invitesUnread ? T.inkMuted : !e.invite || expired ? T.warn : T.inkMid'),
        'REGRESSION: an unread link coloured as a dead one');
    assert.ok(page.includes(`{clerkInvites === null ? 'Reading invitations…' : invitesUnread ? "No invited member in the roster. Clerk's invitations could not be read, so any made there are not listed." : 'No invitations pending.'}`),
        'REGRESSION: "No invitations pending." over a Clerk list never read');
    assert.equal(count(page, 'loadError ?'), 0, 'the unread state is the list\'s own, not the banner\'s words (cleared as a read again starts)');
});

const p12fxUInvite = (answer, team = '', switchAt = -1) => inviteSend({ answer, team, switchAt });

test('Part 12 fixes (U): the invite that landed with an answer that cannot be read — the batch emptied, the roster read again, said as a notice, never the red box; after a switch nothing — RUN', async () => {
    const REREAD = 'The invitations were sent. Its answer could not be read — the list of users was read again to show them.';
    // Moved in round 2 (U2): a roster not read again says why, in the house words — never a bare "reload".
    const RELOAD = (words) => `The invitations were sent. Its answer could not be read. The roster could not be read again — reload the page to see it: ${words}`;
    const ROSTER = () => onceOf(200, { users: [...P12A_SETTINGS().users, { id: 'usr_9', name: 'New', email: 'new@x.test', status: 'Invited' }] });
    const landed = await p12fxUInvite([P11_UNREADABLE(), ROSTER()]);
    assert.deepEqual([landed.said, landed.told, landed.saved, landed.added], [[], [REREAD], [], []], 'REGRESSION: said in the red box of a failure');
    assert.deepEqual(landed.users.map((u) => u.id), ['usr_1', 'usr_2', 'usr_9'], 'the roster read again');
    assert.deepEqual(landed.sent.map(([url, method]) => [url, method]), [['/.netlify/functions/users', 'POST'], ['/.netlify/functions/users', 'GET']], 'one invite, one read, nothing more');
    assert.equal(landed.notices[0], '', 'the last notice cleared as Send is pressed');
    const { id, ...blank } = landed.rows.at(-1)[0];
    assert.deepEqual([landed.rows.at(-1).length, blank], [1, { email: '', role: 'User', team: '', manager: '', territory: '', valid: true, error: '' }],
        'REGRESSION: Send left armed over the same rows — a second press emails each person again');
    for (const [roster, words] of [[onceOf(500, { error: 'x' }), 'x'], [P11_PAGE(), 'The server returned 502.'], [UNSENT(), 'The server could not be reached.'],
        [P11_UNREADABLE(), 'Its answer could not be read.'], [onceOf(200, {}), 'Its answer could not be read.']]) {
        const did = await p12fxUInvite([P11_UNREADABLE(), roster]);
        assert.deepEqual([did.said, did.told, did.users.length, did.rows.at(-1)[0].email], [[], [RELOAD(words)], 2, ''], 'a roster not read again: said to reload, saying why');
    }
    const teamed = await p12fxUInvite([P11_UNREADABLE(), ROSTER()], 'East');
    assert.deepEqual(teamed.told, [`${REREAD} They were not added to their teams' lists — add them on the Teams page.`], 'a team named: its list was not updated, said');
    // The org switched while the roster read was out: no other org's roster in this org's settings, and nothing said.
    for (const roster of [ROSTER(), UNSENT(), onceOf(500, { error: 'x' })]) {
        const late = await p12fxUInvite([P11_UNREADABLE(), roster], '', 1);
        assert.deepEqual([late.said, late.told, late.users.length], [[], [], 2], 'REGRESSION: the roster read after an org switch written or said in the new org');
    }
});

test('Part 12 fixes (U): WIRING — the invite page draws its notice apart from its error, not in the red box', () => {
    const page = between(code(read(P12A_USERS)), 'const UsersInvitePage = ', '\nconst UsersExportPage = ');
    assert.ok(page.includes("const [notice, setNotice] = useState('');"));
    // Moved (§0.249, review fixes round 3 — U3): the tint is the warning one over a failed roster read (noticeWarn), else green.
    assert.ok(page.includes("{notice && <div style={{ marginBottom:14, padding:'10px 14px', background:`${noticeWarn ? T.warn : T.ok}12`, border:`1px solid ${noticeWarn ? T.warn : T.ok}55`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans }}>{notice}</div>}"),
        'REGRESSION: the notice not drawn, or drawn as an error');
    // Moved in round 2 (U2): the notice's two branches (read again, or not and why) — both inside the one setNotice.
    assert.equal(count(page, 'The invitations were sent.'), 2);
    assert.equal(count(between(page, '                setNotice(reread\n', '                return;\n'), 'The invitations were sent.'), 2);
    assert.ok(!/throw new Error\('The invitations were sent/.test(page), 'REGRESSION: a landed invite thrown as a failure');
});

// ── Part 12 — the review's fixes (M: MFA) ──
// A landed answer without the shape the cards draw from (total and enrolled numbers, byRole and notEnrolled lists) is a
// read that failed, as the overview's MFA tile reads it (settingsCards.js liveCountsOf): never "0/0 enrolled", "No users
// found in this organization." or "✓ All users have MFA enrolled." over it.
const P12FXM_UNREAD = 'MFA enrollment could not be read — Its answer could not be read.';
// Moved (§0.249, review fixes round 3 — U3): the rule reads enrolledUsers too (Settings → Users draws it), so each case
// below that held the other lists holds `enrolledUsers: []` as well — each still short of exactly what it was short of.
const P12FXM_SHORT = () => [
    null, {}, { total: 3 }, { enrolled: 2 }, { total: '3', enrolled: 2 }, { total: 3, enrolled: '2' },
    { total: 3, enrolled: 2 }, { total: 3, enrolled: 2, notEnrolled: [], enrolledUsers: [] }, { total: 3, enrolled: 2, byRole: [], enrolledUsers: [] },
    { total: 3, enrolled: 2, byRole: {}, notEnrolled: [], enrolledUsers: [] }, { total: 3, enrolled: 2, byRole: [], notEnrolled: null, enrolledUsers: [] },
    // Each list there, one number short: the tile's own rule, one clause at a time.
    { enrolled: 2, byRole: [], notEnrolled: [], enrolledUsers: [] }, { total: '3', enrolled: 2, byRole: [], notEnrolled: [], enrolledUsers: [] },
    { total: 3, byRole: [], notEnrolled: [], enrolledUsers: [] }, { total: 3, enrolled: null, byRole: [], notEnrolled: [], enrolledUsers: [] },
    [], 'enrolled',
];
const p12fxmTile = async (body) => {
    const answers = SEVEN_LANDED();
    answers[HEALTH_READS.mfa] = answerOf(200, body);
    return liveCountsOf(answers.map(settledOf));
};

test('Part 12 fixes (M): MFA — a landed answer short of its shape is "Its answer could not be read.", nothing drawn as read; the full shape still drawn — RUN', async () => {
    for (const body of P12FXM_SHORT()) {
        const did = await mfaLoad({ answer: onceOf(200, body) });
        assert.deepEqual([did.errors, did.data, did.loading], [[P12FXM_UNREAD], [], [false]],
            `REGRESSION: ${JSON.stringify(body)} drawn as an enrollment (0/0, "No users found", "All users have MFA enrolled")`);
    }
    // Moved (§0.249, review fixes round 3 — U3): the whole shape the one rule reads — enrolledUsers, and each entry's fields.
    const FULL = { enrolled: 0, total: 0, byRole: [], notEnrolled: [], enrolledUsers: [] };   // an org with no members: read, and said as none
    const empty = await mfaLoad({ answer: onceOf(200, FULL) });
    assert.deepEqual([empty.data, empty.errors, empty.loading], [[FULL], [], [false]], 'a full answer, even of none, is read');
    const ENROLLED = { enrolled: 2, total: 3, notEnrolled: [{ userId: 'u3', email: 'c@x.co', name: 'C', role: 'User' }], enrolledUsers: [], byRole: [{ role: 'Admin', enrolled: 2, total: 3 }] };
    const landed = await mfaLoad({ answer: onceOf(200, ENROLLED) });
    assert.deepEqual([landed.data, landed.errors], [[ENROLLED], []]);
    const gone = await mfaLoad({ answer: onceOf(200, {}), cancel: true });
    assert.deepEqual([gone.data, gone.errors, gone.loading], [[], [], []], 'unmounted: nothing set');
});

test('Part 12 fixes (M): MFA — the page and the overview tile agree: every answer the tile names unread, the page says unread — RUN', async () => {
    for (const body of P12FXM_SHORT()) {
        const page = await mfaLoad({ answer: onceOf(200, body) });
        const tile = await p12fxmTile(body);
        assert.deepEqual(page.errors, [P12FXM_UNREAD], `${JSON.stringify(body)}: the page`);
        // Moved (§0.249, review fixes round 2 — M2; residual M1): the tile reads the page's one rule (mfaAnswerRead), so
        // every short answer — the numbers alone too, which it once scored as 2/3 — is unread on the tile as on the page.
        assert.equal(tile.unread.includes('mfa'), true, `REGRESSION: ${JSON.stringify(body)} scored on the tile while the page says it could not be read`);
        assert.equal(tile.mfa, undefined, `${JSON.stringify(body)}: no MFA count on the card`);
    }
    const full = { enrolled: 2, total: 3, byRole: [], notEnrolled: [], enrolledUsers: [] };   // Moved (§0.249, round 3 — U3): enrolledUsers too
    assert.deepEqual([(await mfaLoad({ answer: onceOf(200, full) })).errors, (await p12fxmTile(full)).unread.includes('mfa')], [[], false]);
});

test('Part 12 fixes (M): WIRING — MFA checks the answer\'s shape after its body and before it is kept', () => {
    const load = between(code(read(P12A_MFA)), '        const load = async () => {', '\n        };');
    // Moved (§0.249, review fixes round 2 — M2): the shape check is the shared rule, settingsCards.js mfaAnswerRead.
    order(load, 'if (!res.ok) throw new Error(await readRefusal(res));', 'const enrollment = await res.json();',
        "if (!mfaAnswerRead(enrollment)) throw new Error('Its answer could not be read.');",
        'setMfaData(enrollment);');
    assert.equal(count(load, 'setMfaData('), 1, 'one place the enrollment is kept');
});

// ── Part 12 — the review's fixes (D — Document uploads) ──
// The review of §0.249 (findings 4 and 20, and 12c's left-open item 4): a new document whose record landed with an
// answer that could not be read was said in the red box of a failure, and the upload rail left the file chosen with
// Upload armed — a second press minted a new doc id and wrote the file twice (a record's dropped files likewise: the
// batch stopped there and asked for the drop again). The util marks that throw `landed`; the rail says it as a notice and
// lets the file go, and a record's Documents goes on to the next file and says it as made. And an upload's refusal was a
// bare "The server returned 403." — a presign refused and R2's PUT refused read the same: each now names its step
// ("The upload could not start — …", "The file was not stored — …", "The document was not saved — …", "The new version
// was not saved — …"). Both screens say a thrown failure through failureWords, never a raw e.message.
const P12FXD_RAIL = 'src/components/documents/DocumentUploadRail.jsx';
const P12FXD_RECORD = 'src/components/documents/RecordDocuments.jsx';
const P12FXD_MADE = 'The file was uploaded. Its answer could not be read — reload the page to see it.';
const P12FXD_VERSION_MADE = 'The new version was uploaded. Its answer could not be read — reload the page to see it.';
const p12fxdPresign = (version) => onceOf(200, { storageKey: 'org_a/doc_x/v1/contract.pdf', uploadUrl: 'https://r2.test/put', ...(version ? { version } : {}) });
// One upload over stubs, as p12cUpload — handing back the thrown error itself, its `landed` mark with its words.
const p12fxdThrown = async ({ kind = 'new', presign = p12fxdPresign(kind === 'new' ? 1 : 3), record = onceOf(201, { document: { id: 'doc_x' } }), r2 = { status: 200 } }) => {
    const had = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = p12cXhr(r2, []);
    p12cSetOrg('org_a');
    const dbFetch = async (url) => {
        const a = url.includes('action=upload-url') ? presign : record;
        if (a instanceof Error) throw a;
        return a;
    };
    try {
        const run = kind === 'new'
            ? p12cDocs.uploadNewDocument(dbFetch, { file: P12C_FILE, name: 'Contract' })
            : p12cDocs.uploadNewVersion(dbFetch, { file: P12C_FILE, documentId: 'doc_1' });
        try { return { v: await run }; } catch (e) { return { e }; }
    } finally {
        if (had === undefined) delete globalThis.XMLHttpRequest; else globalThis.XMLHttpRequest = had;
        p12cSetOrg(null);
    }
};

test('Part 12 fixes (D): a record that landed with an answer that cannot be read is thrown marked `landed`, in words failureWords passes; no failure is — RUN', async () => {
    for (const record of [P11_UNREADABLE(), onceOf(201, {}), onceOf(201, null), onceOf(201, { document: 'x' })]) {
        const { e } = await p12fxdThrown({ record });
        assert.deepEqual([e.message, e.landed, failureWords(e)], [P12FXD_MADE, true, P12FXD_MADE],
            'REGRESSION: a document made, thrown as a failure — the rail kept Upload armed and a second press wrote the file twice');
    }
    // A new version with no number presigned, landed unread: marked too (a second press would add a version again).
    const v = await p12fxdThrown({ kind: 'version', presign: p12fxdPresign(), record: P11_UNREADABLE() });
    assert.deepEqual([v.e.message, v.e.landed, failureWords(v.e)], [P12FXD_VERSION_MADE, true, P12FXD_VERSION_MADE]);
    // Nothing that failed is marked: a refusal or a failure at any step, and a presign that cannot be read.
    for (const kind of ['new', 'version']) {
        for (const [answer] of p12bRefused()) assert.equal((await p12fxdThrown({ kind, presign: answer })).e.landed, undefined, `${kind}: the presign's refusal`);
        // Moved in §0.249 (review fixes, round 2, D2): the record's own refusal (the 403 with its words) unmarked; the rest
        // may have come after a write — marked landed.
        for (const [answer] of p12bRefused()) assert.equal((await p12fxdThrown({ kind, record: answer })).e.landed, answer.status === 403 ? undefined : true, `${kind}: the record's refusal`);
        for (const r2 of [{ status: 403 }, { offline: true }]) assert.equal((await p12fxdThrown({ kind, r2 })).e.landed, undefined, `${kind}: R2`);
        assert.equal((await p12fxdThrown({ kind, presign: P11_UNREADABLE() })).e.landed, undefined, `${kind}: a presign stores nothing`);
    }
    // What landed and was read is handed back, as before.
    assert.deepEqual((await p12fxdThrown({})).v, { id: 'doc_x' });
    assert.equal((await p12fxdThrown({ kind: 'version', record: P11_UNREADABLE() })).v, 3, 'the number presigned');
});

test('Part 12 fixes (D): each step of an upload names itself — a presign, R2 and the record refused alike read apart — RUN', async () => {
    const said = async (kind, step) => {
        const forbidden = onceOf(403, {});
        // Moved in §0.249 (review fixes, round 2, D2): the record refused in the server's own words ("not saved" is said
        // only over those); a 403 with none may have come after a write.
        const r = await p12fxdThrown(step === 'presign' ? { kind, presign: forbidden } : step === 'r2' ? { kind, r2: { status: 403 } } : { kind, record: onceOf(403, { error: 'Forbidden' }) });
        return r.e.message;
    };
    assert.deepEqual([await said('new', 'presign'), await said('new', 'r2'), await said('new', 'record'), await said('version', 'record')], [
        'The upload could not start — The server returned 403.',
        'The file was not stored — The server returned 403.',
        'The document was not saved — Forbidden',
        'The new version was not saved — Forbidden',
    ], 'REGRESSION: a bare "The server returned 403." — the step that refused not named');
    // A request that never left names its step too (Q4's sentence after it).
    assert.equal((await p12fxdThrown({ presign: UNSENT() })).e.message, 'The upload could not start — The server could not be reached.');
    // Moved in §0.249 (review fixes, round 2, D2): a record's request that threw may have reached the server first.
    assert.equal((await p12fxdThrown({ record: UNSENT() })).e.message, 'The document may have been saved — reload the page to see whether it was: The server could not be reached.');
    assert.equal((await p12fxdThrown({ kind: 'version', record: UNSENT() })).e.message, 'The new version may have been saved — reload the page to see whether it was: The server could not be reached.');
    assert.equal((await p12fxdThrown({ r2: { offline: true } })).e.message, 'The file was not stored — The server could not be reached.');
});

// The upload rail's submit, extracted and run: `create` / `version` are what the hook's createDocument and
// addDocumentVersion do (throw the util's error, or resolve).
// Moved in §0.249 (review fixes, round 2, D2): the rail's `opened` (its fields back to the rail as it opened) runs with
// the submit — its setters recorded in `fields`; `ctx` the rail's context.
const p12fxdRail = async ({ create = async () => ({ id: 'doc_x' }), version = async () => 3, isVersion = false, ctx = { documentId: 'doc_1' } }) => {
    const did = { errors: [], notices: [], files: [], uploading: [], progress: [], closed: 0, sent: 0, fields: [] };
    const field = (k) => (v) => did.fields.push([k, v]);
    const submit = p12aFn(P12FXD_RAIL, '    const submit = async () => {', '\n    };', '\n    };',
        ['blocked', 'isVersion', 'ctx', 'file', 'note', 'name', 'category', 'visibility', 'sharedWith', 'links', 'baseName',
            'addDocumentVersion', 'createDocument', 'setUploading', 'setError', 'setNotice', 'setProgress', 'setFile', 'close', 'failureWords',
            'setName', 'setNote', 'setVisibility', 'setSharedWith', 'setLinks', 'setCategory'],
        'submit', `${between(code(read(P12FXD_RAIL)), '    const opened = () => {', '\n    };')}\n    };`)(false, isVersion, ctx, P12C_FILE, '', 'Contract', 'Contract', 'team', [], [], (n) => n.replace(/\.[^.]+$/, ''),
        async (...a) => { did.sent++; return version(...a); }, async (...a) => { did.sent++; return create(...a); },
        (v) => did.uploading.push(v), (v) => did.errors.push(v), (v) => did.notices.push(v), (v) => did.progress.push(v),
        (v) => did.files.push(v), () => { did.closed++; }, failureWords,
        field('name'), field('note'), field('visibility'), field('sharedWith'), field('links'), field('category'));
    await submit();
    return did;
};

test('Part 12 fixes (D): the upload rail — a document made whose answer cannot be read is a notice and the file let go (Upload not offered over it again); a failure keeps the file, in the house words — RUN', async () => {
    const made = (await p12fxdThrown({ record: P11_UNREADABLE() })).e;
    const landed = await p12fxdRail({ create: async () => { throw made; } });
    assert.deepEqual([landed.notices, landed.errors, landed.files, landed.closed, landed.sent], [[null, P12FXD_MADE], [null], [null], 0, 1],
        'REGRESSION: said in the red box of a failure with the file still chosen — a second press wrote the file twice');
    assert.deepEqual([landed.uploading, landed.progress], [[true, false], [0, null]]);
    // A new version made unread: likewise.
    const vMade = (await p12fxdThrown({ kind: 'version', presign: p12fxdPresign(), record: P11_UNREADABLE() })).e;
    const vLanded = await p12fxdRail({ isVersion: true, version: async () => { throw vMade; } });
    assert.deepEqual([vLanded.notices, vLanded.errors, vLanded.files, vLanded.closed], [[null, P12FXD_VERSION_MADE], [null], [null], 0]);
    // A failure: the red box, the file kept for another press — each step's words, a thrown runtime error never raw.
    const refused = (await p12fxdThrown({ record: onceOf(403, { error: 'Forbidden' }) })).e;
    for (const [thrown, words] of [
        [refused, 'The document was not saved — Forbidden'],
        [(await p12fxdThrown({ r2: { status: 403 } })).e, 'The file was not stored — The server returned 403.'],
        [new TypeError('Failed to fetch'), 'The server could not be reached.'],
        [new TypeError("Cannot read properties of undefined (reading 'id')"), 'Its answer could not be read.'],
    ]) {
        const did = await p12fxdRail({ create: async () => { throw thrown; } });
        assert.deepEqual([did.errors, did.notices, did.files, did.closed], [[null, words], [null], [], 0], `REGRESSION: ${words} said as "${did.errors[1]}"`);
    }
    // Landed and read: the rail closes, nothing said.
    const ok = await p12fxdRail({});
    assert.deepEqual([ok.closed, ok.errors, ok.notices, ok.files], [1, [null], [null], []]);
});

// A record's attach (a drop or Attach file), extracted and run: `answers` each file's outcome by name.
const p12fxdAttach = async (answers) => {
    const did = { errors: [], notices: [], busy: [], sent: [] };
    const attach = p12aFn(P12FXD_RECORD, '    const attachFiles = async (fileList) => {', '\n    };', '\n    };',
        ['validateFile', 'setError', 'setNotice', 'setBusy', 'createDocument', 'baseName', 'recordLink', 'failureWords', 'sending', 'setHeld', 'onBusy'], 'attachFiles')(
        // Moved in §0.249 (review fixes, round 2, D2): setError applies an updater to the last error, as React's does.
        () => null, (v) => did.errors.push(typeof v === 'function' ? v(did.errors.at(-1) ?? null) : v), (v) => did.notices.push(v), (v) => did.busy.push(v),
        async (f) => { did.sent.push(f.name); const a = answers[f.name]; if (a instanceof Error) throw a; return a; },
        // Moved in §0.249 (review fixes, round 4, D4): the batch's sending mark and the held drop's names.
        (n) => n.replace(/\.[^.]+$/, ''), { type: 'account', recordId: 'acc_1' }, failureWords, { current: false }, () => {});
    await attach(Object.keys(answers).map((name) => ({ name, size: 10, type: 'application/pdf' })));
    return did;
};

test('Part 12 fixes (D): a record\'s Documents — a file made whose answer cannot be read goes on to the next file and is said as made; a failure stops the batch in the house words — RUN', async () => {
    const made = (await p12fxdThrown({ record: P11_UNREADABLE() })).e;
    const DOC = { id: 'doc_y' };
    const one = await p12fxdAttach({ 'a.pdf': made, 'b.pdf': DOC });
    assert.deepEqual([one.sent, one.errors, one.notices, one.busy], [['a.pdf', 'b.pdf'], [null], [null, `a.pdf: ${P12FXD_MADE}`], [true, false]],
        'REGRESSION: the batch stopped at a file that was made, or said it as a failure — the drop asked again wrote it twice');
    const two = await p12fxdAttach({ 'a.pdf': made, 'b.pdf': made, 'c.pdf': DOC });
    assert.deepEqual([two.sent.length, two.errors, two.notices.at(-1)], [3, [null],
        'a.pdf, b.pdf: The files were uploaded. Their answers could not be read — reload the page to see them.']);
    // A failure stops the batch, in the house words; a file made before it is still said as made.
    // Moved in §0.249 (review fixes, round 2, D2): the server's own refusal (a 4xx with its words, ref kept) stops the
    // batch; a 500 may have come after a write — round 2's own test.
    const refused = (await p12fxdThrown({ record: onceOf(400, { error: 'id and name required', requestId: 'r1' }) })).e;
    const stop = await p12fxdAttach({ 'a.pdf': refused, 'b.pdf': DOC });
    // Moved in §0.249 (review fixes, round 3, D3): the stop names the file it stopped at, and the files never sent.
    assert.deepEqual([stop.sent, stop.errors, stop.notices], [['a.pdf'], [null, 'a.pdf: The document was not saved — id and name required (ref r1)\nNot sent: b.pdf — drop them again'], [null]]);
    const both = await p12fxdAttach({ 'a.pdf': made, 'b.pdf': new TypeError('Failed to fetch'), 'c.pdf': DOC });
    assert.deepEqual([both.sent, both.errors, both.notices], [['a.pdf', 'b.pdf'], [null, 'b.pdf: The server could not be reached.\nNot sent: c.pdf — drop them again'], [null, `a.pdf: ${P12FXD_MADE}`]],
        'REGRESSION: "Failed to fetch" said raw');
    assert.deepEqual((await p12fxdAttach({ 'a.pdf': new TypeError('x is not a function') })).errors, [null, 'a.pdf: Its answer could not be read.']);
    // All landed and read: nothing said.
    const ok = await p12fxdAttach({ 'a.pdf': DOC, 'b.pdf': DOC });
    assert.deepEqual([ok.sent.length, ok.errors, ok.notices], [2, [null], [null]]);
});

test('Part 12 fixes (D): WIRING — the rail and a record\'s Documents draw the notice apart from the red box; the rail clears it on close and on each Upload', () => {
    const rail = code(read(P12FXD_RAIL));
    assert.ok(rail.includes('    const [notice, setNotice] = useState(null);'));
    const close = between(rail, '    const close = () => {', '\n    };');
    assert.ok(close.includes('setError(null); setNotice(null);'), 'REGRESSION: a notice kept over the next opening of the rail');
    order(between(rail, '    const submit = async () => {', '\n    };'), 'setUploading(true); setError(null); setNotice(null);', 'close();',
        // Moved in §0.249 (review fixes, round 2, D2): one that may have been made in the red box; the rail back as it opened.
        'if (e && e.landed) { (e.maybe ? setError : setNotice)(failureWords(e)); opened(); }', 'else setError(failureWords(e));');
    assert.ok(rail.includes("{notice && (\n                        <div style={{ background: `${T.ok}12`, border: `1px solid ${T.ok}55`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.ink }}>{notice}</div>"),
        'REGRESSION: the notice not drawn, or drawn as an error');
    assert.ok(rail.includes("const blocked = !file || uploading"), 'the file let go blocks Upload');
    assert.ok(!/e\.message/.test(rail), 'REGRESSION: a raw e.message');
    const record = code(read(P12FXD_RECORD));
    assert.ok(record.includes('    const [notice, setNotice] = useState(null);'));
    assert.ok(record.includes("{notice && (\n                <div style={{ background: `${T.ok}12`, border: `1px solid ${T.ok}55`, borderRadius: T.r, padding: '7px 10px', marginBottom: 8, fontSize: 12, color: T.ink }}>{notice}</div>"),
        'REGRESSION: the notice not drawn, or drawn as an error');
    assert.ok(!/e\.message/.test(record), 'REGRESSION: a raw e.message');
});

// ── Part 12 — the review's fixes (I — Invitation import) ──
// Review finding #5: a 201 whose answer cannot be read was counted as "not sent" — every person of that request a
// failure though users.mjs invited them and Clerk sent the emails, so a re-run sent each a second email. They are
// now counted apart (`unread`): sent, never failed, never clean; the receipt says so and names the team lists they
// are not on; the run goes on.
const P12FXI_LAYER = 'src/components/layout/ModalLayer.jsx';
const P12FXI_MODAL = 'src/components/modals/CsvImportModal.jsx';
const P12FXI_TEAMS = Object.freeze([{ id: 't1', name: 'East', repIds: [] }]);
const p12fxIUnreadable = (status = 201) => onceOf(status, new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"));
// The handler from source, run over one answer per request (each request a chunk of ten), the teams save stubbed.
// A GET (the roster read again after a request answered unread — round 2, I2) answers `roster`.
// Moved in round 3 (I3): the roster read again holds every one sent by default — a roster that lands says who was invited.
const p12fxIImport = async ({ invites, answers, teamsSave = { ok: true },
    roster = onceOf(200, { users: [{ id: 'usr_srv', email: 'srv@x.test' }, ...invites.map((v, i) => ({ id: `usr_r${i}`, email: v.email }))] }) }) => {
    const { emptyReceipt, unreadOnRoster } = await import('../src/utils/importReceipt.js');
    const { teamsWithMembers } = await import('../src/utils/teamMembership.js');
    const s = code(read(P12FXI_LAYER));
    const START = '                    onImportUsers={async (invites) => {';
    const fn = between(s, START, '\n                    }}\n                />').slice(START.length);
    const did = { sent: [], progress: [], teams: null, reads: [] };
    const settingsState = stateOf({ users: [] });
    let n = 0;
    const dbFetch = async (url, opts = {}) => {
        if (!opts.method) { did.reads.push(url); if (roster instanceof Error) throw roster; return roster; }
        did.sent.push(JSON.parse(opts.body).invites.map(v => v.email));
        const a = answers[n++];
        if (a instanceof Error) throw a;
        return a;
    };
    const addToSettingsList = async (key, update) => { did.teams = update(P12FXI_TEAMS).teams; return teamsSave; };
    const run = new Function('requestOrg', 'stillOrg', 'stopped', 'emptyReceipt', 'dbFetch', 'failureWords', 'refusalWords', 'readRefusal', 'setSettings', 'onProgress', 'addToSettingsList',
        'teamsWithMembers', 'settings', 'TEAMS_CHANGED_TWICE', 'unreadOnRoster', `return async (invites) => {${fn}\n};`)(
        () => 'org_a', () => true, () => 'stopped', emptyReceipt, dbFetch, failureWords, refusalWords, readRefusal, settingsState.set, (a, b) => did.progress.push([a, b]),
        addToSettingsList, teamsWithMembers, { teams: P12FXI_TEAMS, revs: {} }, 'twice', unreadOnRoster);
    const out = await run(invites);
    return { ...out, ...did, users: settingsState.value.users };
};
const p12fxIPeople = (n, teamEvery = 0) => Array.from({ length: n }, (_, i) => ({ email: `p${i}@x.test`, ...(teamEvery && i % teamEvery === 0 ? { team: 'East', teamId: 't1' } : {}) }));
const p12fxIInvariant = (r) => assert.equal(r.attempted, r.created + r.updated + r.failed + r.unread, 'attempted === created + updated + failed + unread');

test('Part 12 fix I: the invitation import — a 201 whose answer cannot be read is counted as sent unread, never as not sent; the run goes on; the next request still counted — RUN', async () => {
    const people = p12fxIPeople(12, 4);   // p0, p4, p8 name East (the first request)
    const r = await p12fxIImport({ invites: people, answers: [
        p12fxIUnreadable(),
        onceOf(201, { invited: [{ id: 'usr_10', email: 'p10@x.test', teamId: 't1' }], errors: [{ email: 'p11@x.test', error: 'Already a member.' }] }),
    ] });
    // Moved in round 3 (I3): the roster read again shows the ten, so they are counted sent — exact, none left unread.
    // Moved in round 4 (I4): the ten are on the roster read again, which proves no who or when — invited by this import or
    // before it (onRoster, still unread) — never not sent.
    assert.deepEqual([r.receipt.unread, r.receipt.onRoster, r.receipt.created, r.receipt.failed, r.receipt.error], [10, 10, 1, 1, null],
        'REGRESSION: the ten the server invited counted as not sent (failed 10)');
    p12fxIInvariant(r.receipt);
    assert.equal(r.sent.length, 2, 'the run goes on to the next request');
    assert.deepEqual(r.progress, [[10, 12], [12, 12]]);
    assert.deepEqual(r.refusals, [{ email: 'p11@x.test', error: 'Already a member.' }]);
    assert.deepEqual(r.users.map(u => u.id), ['usr_srv', ...people.map((_, i) => `usr_r${i}`)], 'the roster as the server reads it again (round 2, I2) — never a row the client made up');
    assert.deepEqual(r.reads, ['/.netlify/functions/users'], 'the roster read again once, after the last request');
    assert.deepEqual(r.teams, [{ id: 't1', name: 'East', repIds: ['usr_10'] }], 'only the named rows join the team list');
    // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
    assert.equal(r.warning, "3 whose answers could not be read named a team — check on the Teams page that they are on their teams' lists.",
        'REGRESSION: the unread ones that named a team left off its list in silence');
    // A 201 whose body reads but names no list is the same: landed, unread.
    const empty = await p12fxIImport({ invites: p12fxIPeople(2, 2), answers: [onceOf(201, {})] });
    // Moved in round 4 (I4): both of the one request on the roster read again — on it, not proven sent by this import.
    assert.deepEqual([empty.receipt.unread, empty.receipt.onRoster, empty.receipt.failed, empty.receipt.created, empty.receipt.error], [2, 2, 0, 0, null]);
    // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
    assert.equal(empty.warning, "1 whose answer could not be read named a team — check on the Teams page that they are on its list.");
    // None named a team: no team sentence. A failed teams save keeps its words, the team sentence after it.
    assert.equal((await p12fxIImport({ invites: p12fxIPeople(3), answers: [p12fxIUnreadable()] })).warning, null);
    const both = await p12fxIImport({ invites: p12fxIPeople(2, 1), answers: [p12fxIUnreadable()], teamsSave: { ok: false, error: 'Forbidden' } });
    assert.equal(both.warning, 'The invitations went out, but the team list was not updated — Forbidden '
        // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
        + "2 whose answers could not be read named a team — check on the Teams page that they are on their teams' lists.");
    // A request that never landed still stops the run, the rest counted as not sent — never as unread.
    for (const [answer, words] of p12bRefused()) {
        const stop = await p12fxIImport({ invites: p12fxIPeople(2), answers: [answer] });
        assert.deepEqual([stop.receipt.failed, stop.receipt.unread, stop.receipt.error], [2, 0, `Sending stopped: ${words}`], `REGRESSION: ${words}`);
    }
});

test('Part 12 fix I: the receipt — sent unread is never failed, never clean, something that landed; the Results say it in the invitation words — RUN', async () => {
    const { emptyReceipt, mergeReceipts, receiptFromPreflight, isClean, isPartial, describeReceipt } = await import('../src/utils/importReceipt.js');
    assert.equal(emptyReceipt().unread, 0);
    const m = code(read(P12FXI_MODAL));
    const lit = m.match(/describeReceipt\(r, 'invitation', (\{[^}]*\})\)/);
    assert.ok(lit, 'the Results\' invitation words');
    const words = new Function(`return ${lit[1]};`)();
    const all = mergeReceipts(receiptFromPreflight({ skipped: 1 }), { ...emptyReceipt(), attempted: 10, unread: 10 });
    p12fxIInvariant(all);
    assert.deepEqual([all.unread, isClean(all), isPartial(all)], [10, false, true], 'REGRESSION: an import sent unread drawn as clean, or as nothing sent');
    assert.equal(describeReceipt(all, 'invitation', words), 'Up to 10 invitations sent — the answer could not be read; some may have been refused. 1 skipped.');
    const some = { ...emptyReceipt(), attempted: 12, created: 1, failed: 1, unread: 10 };
    assert.equal(describeReceipt(some, 'invitation', words), '1 invitation sent, up to 10 more sent — the answer could not be read; some may have been refused. 1 not sent.');
    assert.equal(describeReceipt({ ...emptyReceipt(), attempted: 1, unread: 1 }, 'invitation', words), '1 invitation sent — the answer could not be read.');
    // The Results' heading reads isClean / isPartial: "Some Invitations Sent", never "No Invitations Sent" over ones sent.
    assert.ok(m.includes("(clean ? 'Invitations Sent' : partial ? 'Some Invitations Sent' : 'No Invitations Sent')"));
    assert.ok(m.includes('const partial = isPartial(r);') && m.includes('const clean = isClean(r);'));
});

test('Part 12 fix I: WIRING — the unread branch stands after the stop and before the count, and goes on to the next request', () => {
    const h = between(code(read(P12FXI_LAYER)), 'onImportUsers={async (invites) => {', 'return { receipt, refusals, warning };');
    order(h, 'if (!answered) {', 'if (res.status === 201 && !Array.isArray(d.invited)) {', 'receipt.unread += chunk.length;', 'continue;',
        'const sent = Array.isArray(d.invited) ? d.invited : [];', 'receipt.failed += chunk.length - sent.length;');
    assert.equal(count(h, 'receipt.unread += '), 1);
    assert.ok(!/receipt\.failed \+= chunk\.length;/.test(h), 'REGRESSION: a landed request counted whole as not sent');
});

// ── Part 12 — the review's fixes (C — Calendar) ──
// Review findings #7 and #15 (state §0.249). A failed calendar read set calendarConnected(false): the profile panel's
// Calendar tab said "Not connected", OFF and "Connect Google Calendar" under "The calendar could not be read — …", Home
// offered "Connect your calendar…" and Tasks said "Calendar not connected" — a failed read drawn as none. It now leaves
// calendarConnected as last read (a 200 { connected: false } still says not connected and offers Connect); while
// calendarError stands, Home and Tasks say it and the panel says "Could not be read", "—" and offers Refresh, no count.
// And the header's Disconnect refusal (calActionError) is cleared on an org switch, as profileError is: one org's
// words never stand on another's Calendar tab nor hide its calendarError.
const P12FXC_HOME = 'src/Tabs/HomeTab.jsx';
const P12FXC_TASKS = 'src/Tabs/TasksTab.jsx';

test('Part 12 fix C: App\'s calendar read — a refusal, a failure or an unreadable answer leaves calendarConnected as last read; a 200 { connected: false } still says not connected — RUN', async () => {
    for (const [answer, words] of [...p12bRefused(), [P11_UNREADABLE(), 'Its answer could not be read.']]) {
        const r = await p12bCalendar({ answer });
        assert.deepEqual([r.said, r.connected, r.events], [[`The calendar could not be read — ${words}`], [], []],
            `REGRESSION: a failed read drawn as "not connected" — ${words}`);
    }
    const off = await p12bCalendar({ answer: onceOf(200, { events: [], connected: false }) });
    assert.deepEqual([off.said, off.connected], [[], [false]], 'a calendar not connected still offers Connect');
});

// The profile panel's Calendar tab, run from its own expressions: the status line, the pill, and which of Connect,
// Refresh and the events count it draws. Moved in §0.249 (review fixes, round 2): the tab reads calDisconnected too, handed
// in as `disconnected` — every state below unchanged but the known connection's failed read (round 2's fix, C2).
const p12fxCPanel = (() => {
    let built = null;
    return (state) => {
        if (!built) {
            const s = code(read(P12B_HEADER));
            const unread = between(s, '    const calUnread = ', ';\n').slice('    const calUnread = '.length);
            const status = between(s, '{calendarLoading\n', '}\n').slice(1);
            const pill = between(s, "{calendarConnected ? 'ON'", '}\n').slice(1);
            const gate = (re, what) => { const m = s.match(re); assert.ok(m, what); return m[1]; };
            const connect = gate(/\{([^{}]*) && \(\s*<button onClick=\{connectCalendar\}/, 'the Connect gate');
            const refresh = gate(/\{([^{}]*) && \(\s*<button onClick=\{\(\) => fetchCalendarEvents && fetchCalendarEvents\(\)\}/, 'the Refresh gate');
            const countGate = gate(/\{([^{}]*) && \(\s*<div[^>]*>\s*\{\(calendarEvents \|\| \[\]\)\.length > 0/, 'the count gate');
            built = new Function('calendarLoading', 'calendarError', 'calendarConnected', 'calConn', 'calDisconnected', 'calendarRead',
                `const calUnread = ${unread};\nreturn { status: ${status}, pill: ${pill}, connect: !!(${connect}), refresh: !!(${refresh}), count: !!(${countGate}) };`);
        }
        // Moved in §0.249 (review fixes, round 3): the tab reads calendarRead too — every state above is one a read landed in
        // (`read` true unless named), so each assertion stands as it was; round 3's tests name `read: false`.
        return built(state.loading || false, state.error || null, state.connected || false, state.conn || null, state.disconnected || false, state.read ?? true);
    };
})();

test('Part 12 fix C: the profile panel\'s Calendar tab — a failed read with no connection known says "Could not be read", never "Not connected", OFF or Connect; a known connection keeps Reconnect, no count — RUN', () => {
    const ERR = 'The calendar could not be read — The server returned 500.';
    assert.deepEqual(p12fxCPanel({ error: ERR, connected: false }),
        { status: 'Could not be read', pill: '—', connect: false, refresh: true, count: false },
        'REGRESSION: a failed read drawn as "Not connected", OFF and "Connect Google Calendar"');
    assert.deepEqual(p12fxCPanel({ error: ERR, connected: true }),
        { status: 'Connected — the latest read failed', pill: 'ON', connect: true, refresh: true, count: false },   // moved in §0.249 (review fixes, round 2): never "syncing" over a read that failed
        'REGRESSION: a count drawn over a read that failed');
    assert.deepEqual(p12fxCPanel({ connected: false }),
        { status: 'Not connected', pill: 'OFF', connect: true, refresh: false, count: false }, 'a calendar not connected offers Connect');
    assert.deepEqual(p12fxCPanel({ connected: true, conn: { calendarEmail: 'karen@x.test' } }),
        { status: 'karen@x.test', pill: 'ON', connect: true, refresh: true, count: true });
    assert.equal(p12fxCPanel({ loading: true, connected: false }).status, 'Checking…');
});

test('Part 12 fix C: the header clears the Disconnect refusal on an org switch and with its panel, as profileError — RUN', () => {
    const s = code(read(P12B_HEADER));
    const line = between(s, "    useEffect(() => { setCalActionError(''); }", ';\n') + ';';
    const ran = [];
    let deps = null;
    new Function('useEffect', 'setCalActionError', 'showProfilePanel', 'activeOrgId', line)(
        (fn, d) => { deps = d; fn(); }, (v) => ran.push(v), true, 'org_b');
    assert.deepEqual([ran, deps], [[''], [true, 'org_b']], 'REGRESSION: org A\'s "Not disconnected — …" stands on org B\'s Calendar tab');
    // Its words go out only through this tab's one line, which this reset now clears.
    assert.ok(s.includes('{calActionError || calendarError}'));
});

test('Part 12 fix C: WIRING — Home and Tasks say a failed calendar read, never "Connect your calendar…" or "Calendar not connected", while calendarError stands', () => {
    const home = code(read(P12FXC_HOME));
    assert.ok(home.includes('calendarEvents, calendarConnected, calendarLoading, calendarError, fetchCalendarEvents,'), 'Home reads calendarError');
    // Moved in §0.249 (review fixes, round 2): the error branch now ends at the checking branch that follows it.
    // Moved in §0.249 (review fixes, round 3): that branch's condition reads calendarRead too.
    const failed = between(home, '{calendarError ? (', ') : !calendarConnected && (calendarLoading || !calendarRead) ? (');
    assert.ok(failed.includes('{calendarError}') && failed.includes('Try again'), 'Home says the read that failed');
    assert.ok(failed.includes('onClick={() => fetchCalendarEvents()}'), 'REGRESSION: Home\'s Try again reads nothing again');
    assert.ok(!/Connect|connectMyCalendar|meeting/.test(failed), 'REGRESSION: Home offers Connect or a count over a read that failed');
    order(home, '{calendarError ? (', ') : !calendarConnected ? (', 'Connect your calendar to see your meetings on Home.');

    const tasks = code(read(P12FXC_TASKS));
    assert.ok(/function CalendarView\(\{[^}]*\bcalendarError\b[^}]*\}\)/.test(tasks), 'CalendarView takes calendarError (module scope)');
    assert.ok(tasks.includes('calendarEvents, calendarConnected, calendarLoading, calendarError,'), 'Tasks reads calendarError');
    assert.ok(tasks.includes('calendarError={calendarError}'), 'REGRESSION: CalendarView never told the read failed');
    order(tasks, '{calendarError\n', '{calendarError}</div>)', ': calendarConnected\n', 'Synced', 'Calendar not connected');
    assert.ok(tasks.includes("background: calendarError ? T.danger : calendarConnected ? T.ok : T.inkMuted"));
});

// ── Part 12 — the review's fixes (S — Sales Manager Q4 words) ──
// Review findings #8 and #17 (state §0.249). Q4 (Jeff: "All Recommended") is one sentence for a request that never left,
// "The server could not be reached.", everywhere. The Sales Manager kept a second wording: saveExtra's status-0 branch
// (the commission tiers, the SPIFF board) and saveUser's catch (a forecast call) said "Not saved — network error while
// saving <label>." They say "Not saved — " and NETWORK_ERROR (saveExtra) or failureWords (saveUser). And the 12c scan
// looked only for the old constant's text: a WIRING scan now holds that no source under src/ draws "network error" to
// a member — only refusalWords.js's NETWORK_WORDS (it reads a thrown fetch's message) and console lines say it.
const P12FXS_SMT = 'src/Tabs/SalesManagerTab.jsx';
// Moved in §0.249 (review fixes, round 2 — S2): saveUser takes its org (requestOrg / stillOrg) and says refusalWords'
// words, so it is built over them too; `switchOrg` switches the org as the PUT goes out.
const p12fxSSaveUser = async (answer, switchOrg = false) => {
    const did = { sent: [], states: [] };
    const org = { now: 'org_a' };
    const h = p12aFn(P12FXS_SMT, '    const saveUser = async (user, label, who = user.name) => {', '\n    };', '\n    };',
        ['requestOrg', 'stillOrg', 'dbFetch', 'setSaveState', 'refusalWords', 'failureWords', 'console', 'ownRefusal'], 'saveUser')(
        () => org.now, (o) => o === org.now, p10Fetch(did, answer, org, switchOrg), (v) => did.states.push(v), refusalWords, failureWords, quiet, p12bClaimWords().ownRefusal);
    did.out = await h({ id: 'usr_1', forecastCalls: {} }, 'forecast call', 'Ann');
    return did;
};
const p12fxSSaveExtra = async (answer) => {
    const did = { sends: [], states: [], drafts: [] };
    const h = p12aFn(P12FXS_SMT, '    const saveExtra = async (patch, label) => {', '\n    };', '\n    };',
        ['settingsLoaded', 'setSaveState', 'writeSettings', 'opened', 'setSettings', 'revsAfter', 'takeLatestSettings', 'setTiersDraft', 'setSpiffsDraft',
            'listChanged', 'NETWORK_ERROR', 'ownRefusal', 'saidOf', 'refusalWords'], 'saveExtra')(
        true, (v) => did.states.push(v), async (...a) => { did.sends.push(a); return answer; }, {}, () => {}, () => ({}), async () => null,
        (v) => did.drafts.push(v), (v) => did.drafts.push(v), () => 'changed', NETWORK_ERROR, p12bClaimWords().ownRefusal, p12bClaimWords().saidOf, refusalWords);
    did.out = await h({ spiffs: [] }, 'SPIFFs');
    return did;
};

test('Part 12 fixes (S): the Sales Manager\'s forecast-call save — a request that never left says Q4\'s one sentence, in every browser\'s words for it; never "network error while saving" — RUN', async () => {
    for (const thrown of [UNSENT(), new TypeError('NetworkError when attempting to fetch resource.'), new TypeError('Load failed')]) {
        const r = await p12fxSSaveUser(thrown);
        assert.deepEqual([r.out, r.states], [false, [{ status: 'error', msg: 'Not saved — The server could not be reached.' }]],
            `REGRESSION: a second wording for a request that never left (${thrown.message})`);
    }
    const landed = await p12fxSSaveUser(onceOf(200, {}));
    assert.deepEqual([landed.out, landed.states], [true, []], 'a landed save says nothing here');
    // Moved in §0.249 (review fixes, last pass, F4): a 5xx may have saved; its words still name the member.
    const refused = await p12fxSSaveUser(onceOf(500, { error: 'Internal server error' }));
    assert.deepEqual([refused.out, refused.states], [false, [{ status: 'error', msg: 'Ann\'s forecast call may have been saved — reload the page to see whether it was: Internal server error' }]], 'a refusal still names the member');
});

test('Part 12 fixes (S): the Sales Manager\'s commission tiers and SPIFF board — a save that never left says "Not saved — The server could not be reached.", whatever the answer\'s error holds; a 403 and a refusal keep their words — RUN', async () => {
    for (const error of [NETWORK_ERROR, 'x']) {
        const r = await p12fxSSaveExtra({ ok: false, status: 0, error });
        assert.deepEqual([r.out, r.states.at(-1), r.drafts], [false, { status: 'error', msg: 'Not saved — The server could not be reached.' }, []],
            'REGRESSION: "Not saved — network error while saving SPIFFs."');
    }
    assert.deepEqual((await p12fxSSaveExtra({ ok: false, status: 403, error: 'x' })).states.at(-1), { status: 'error', msg: 'Not saved — only Admins can change SPIFFs.' });
    // Moved in §0.249 (review fixes, last pass, F4): a 5xx may have saved — its words with their ref; a 4xx in the server's words is "Not saved".
    assert.deepEqual((await p12fxSSaveExtra({ ok: false, status: 500, error: 'Internal server error (ref r1)' })).states.at(-1),
        { status: 'error', msg: 'The SPIFFs may have been saved — reload the page to see whether they were: Internal server error (ref r1)' }, 'the server\'s words with their ref');
    assert.deepEqual((await p12fxSSaveExtra({ ok: false, status: 400, error: 'Quota periods are quarters or months. (ref r2)' })).states.at(-1),
        { status: 'error', msg: 'Not saved — Quota periods are quarters or months. (ref r2)' }, 'the server\'s own refusal with its ref');
});

test('Part 12 fixes (S): WIRING — the Sales Manager takes NETWORK_ERROR and failureWords; saveUser\'s catch and saveExtra\'s status-0 branch say them', () => {
    const s = code(read(P12FXS_SMT));
    assert.ok(s.includes("import { dbFetch, requestOrg, stillOrg, NETWORK_ERROR } from '../utils/storage';"));
    assert.ok(s.includes("import { refusalWords, failureWords } from '../utils/refusalWords.js';"));
    order(between(s, '    const saveUser = async (user, label, who = user.name) => {', '\n    };'), '} catch (err) {',
        "console.error('[SalesManagerTab] save ' + label, err);", "setSaveState({ status: 'error', msg: `Not saved — ${failureWords(err)}` });", 'return false;');
    assert.ok(between(s, '    const saveExtra = async (patch, label) => {', '\n    };').includes(': w.status === 0\n            ? `Not saved — ${NETWORK_ERROR}`\n'),
        'REGRESSION: the status-0 branch says its own words');
    assert.ok(!/network error/i.test(s), 'REGRESSION: the Sales Manager says "network error"');
});

test('Part 12 fixes (S): WIRING — no source under src/ draws "network error" to a member; only NETWORK_WORDS and console lines say it, named', () => {
    const files = [];
    const walk = (rel) => {
        for (const name of readdirSync(new URL(rel, ROOT))) {
            const p = `${rel}${name}`;
            if (statSync(new URL(p, ROOT)).isDirectory()) walk(`${p}/`); else if (/\.(js|jsx|mjs)$/.test(name)) files.push(p);
        }
    };
    walk('src/');
    // Moved floor (§0.249, the review's fixes, round 4: G4): 242, the .js, .jsx and .mjs sources measured under src/ (none
    // is .mjs; it was 240 — two sources could drop out of the walk and go unsearched). Fewer: say the new count, and why.
    assert.ok(files.length >= 242, `every .js, .jsx and .mjs source (${files.length})`);
    // Named: failureWords reads a thrown fetch's own message with this regex (it is never drawn); a console line is a
    // developer's, never a member's.
    const NAMED_LINE = 'const NETWORK_WORDS = /failed to fetch|networkerror|network error|load failed/i;';
    const CONSOLE = /\bconsole\.(error|warn|log|info|debug)\(/;
    const hits = [];
    for (const f of files) {
        for (const line of code(read(f)).split('\n')) if (/network error/i.test(line)) hits.push([f, line.trim()]);
    }
    const named = hits.filter(([f, l]) => (f === 'src/utils/refusalWords.js' && l === NAMED_LINE) || CONSOLE.test(l));
    assert.deepEqual(hits.filter((h) => !named.includes(h)), [], 'REGRESSION: a member is told "network error" — Q4 says "The server could not be reached."');
    assert.ok(named.some(([f, l]) => f === 'src/utils/refusalWords.js' && l === NAMED_LINE), 'NETWORK_WORDS read (named): take it out of the list if it moved');
    assert.ok(named.some(([f, l]) => f === 'src/utils/storage.js' && CONSOLE.test(l)), 'dbFetch\'s console line read (named)');
});

// ── Part 12 — the review's fixes (L — Left-open class items) ──
// The class items Part 12's builders left open (state §0.249): the app's outage banner said "Database connection lost —
// … Check your connection and refresh." when the server ANSWERED with an error (dbStatusOf's `true` is reached only by a
// non-ok answer — a load that never left throws first); the Settings load said "HTTP 500" or "Failed to fetch" through
// setLoadError; the bulk importer said "Bulk import failed (502)."; Leads' claim-requests read drew a failed read as
// nothing pending (the panel hidden), and its refusals said the server's words without the ref, "Request not sent." over
// a refusal with none, and nothing for a request that never left or a landed answer that could not be read — on the
// one-slot toast a later toast replaces. The banner says the server's failure; the load, the importer and the claim
// requests say the house words; the panel says a failed read; the claim requests' refusals are press notices (Q1).
const { bannerCopyOf: p12fxLBanner, dbStatusOf: p12fxLStatus } = await import('../src/utils/fetchStatus.js');
const P12FXL_SETTINGS = 'src/hooks/useSettings.js';
const P12FXL_BULK = 'src/utils/bulkClient.js';
const P12FXL_LEADS = 'src/Tabs/LeadsTab.jsx';
const P12FXL_OUTAGE = 'The server returned an error loading your data — changes may not be saving. Refresh the page to try again.';

test('Part 12 fixes (L): the outage banner — a load the server answered with an error says the server\'s failure, never "Check your connection"; the sign-in banner unchanged — RUN', () => {
    for (const status of [500, 502, 503, 404]) {
        const state = p12fxLStatus({ ok: false, status });
        assert.equal(state, true, `${status}: the outage state`);
        assert.deepEqual(p12fxLBanner(state), { tone: 'outage', text: P12FXL_OUTAGE },
            'REGRESSION: "Database connection lost — … Check your connection and refresh." over a server that answered');
    }
    assert.doesNotMatch(p12fxLBanner(true).text, /check your connection|Database connection lost/i);
    assert.deepEqual(p12fxLBanner(p12fxLStatus({ ok: false, status: 401 })), {
        tone: 'auth', text: 'Your sign-in is no longer valid — refresh the page and sign in again. Changes are not being saved.' });
    assert.equal(p12fxLStatus({ ok: true, status: 200 }), false, 'no banner over a load that landed');
});

// useSettings' load chain, extracted and run: the first load of an org, a reload of the org in state, a newer load.
const p12fxLSettingsLoad = (() => {
    let built = null;
    return async ({ answer, held = false, newer = false }) => {
        if (!built) {
            const s = code(read(P12FXL_SETTINGS));
            const chain = between(s, "        dbFetch('/.netlify/functions/settings')", '\n\n        waitForToken()');
            built = new Function('dbFetch', 'readRefusal', 'failureWords', 'loadGenRef', 'gen', 'settingsAsLoaded', 'setSettings', 'settingsOrgRef',
                'orgId', 'setSettingsOrgId', 'setLoadError', 'console', `return ${chain.trim()}`);
        }
        const did = { errors: [], orgIds: [], settings: [] };
        const loadGenRef = { current: 1 };
        const settingsOrgRef = { current: held ? 'org_a' : null };
        const fetch = async () => { if (newer) loadGenRef.current = 2; if (answer instanceof Error) throw answer; return answer; };
        await built(fetch, readRefusal, failureWords, loadGenRef, 1, (prev, stored) => ({ ...prev, ...stored }), (u) => did.settings.push(u({})),
            settingsOrgRef, 'org_a', (v) => did.orgIds.push(v), (v) => did.errors.push(v), quiet);
        return did;
    };
})();

test('Part 12 fixes (L): the Settings load — a refusal in readRefusal\'s words, a failure in failureWords\', never "HTTP N" or "Failed to fetch"; the generation and the org in state kept — RUN', async () => {
    for (const [answer, words] of [...P12A_REFUSED(), [P11_UNREADABLE(), 'Its answer could not be read.'], [onceOf(200, null), 'Its answer could not be read.']]) {
        const did = await p12fxLSettingsLoad({ answer });
        assert.deepEqual([did.errors, did.orgIds, did.settings], [[words], [], []], `REGRESSION: ${words} — said "HTTP N" or a raw message`);
        assert.doesNotMatch(did.errors[0], P12A_OLD);
    }
    // A reload of the org already in state keeps that copy and says nothing (§0.162); a newer load owns the state.
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT()]) assert.deepEqual((await p12fxLSettingsLoad({ answer, held: true })).errors, []);
    assert.deepEqual((await p12fxLSettingsLoad({ answer: onceOf(500, { error: 'x' }), newer: true })).errors, [], 'a newer load owns the state');
    const landed = await p12fxLSettingsLoad({ answer: onceOf(200, { settings: { pipelines: [] } }) });
    assert.deepEqual([landed.errors, landed.orgIds, landed.settings], [[''], ['org_a'], [{ pipelines: [] }]]);
});

test('Part 12 fixes (L): the bulk importer — a refused chunk says refusalWords\' words, the ref kept, else "The server returned N."; never "Bulk import failed (N)." — RUN', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}` }));
    for (const [answer, words] of [
        [() => onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
        [() => onceOf(403, { error: 'Forbidden' }), 'Forbidden'],
        [() => onceOf(409, {}), 'The server returned 409.'],
        [() => P11_PAGE(), 'The server returned 502.'],
    ]) {
        const posted = await p12cBulk(async () => answer()).postNew('/x', rows);
        assert.deepEqual([posted.landed.length, posted.error], [0, words], 'REGRESSION: "Bulk import failed (N)." — the status alone, in the importer\'s words');
        const put = await p12cBulk(async () => answer()).putBulk('/x', rows);
        assert.deepEqual([put.appliedIds.length, put.error], [0, words], 'REGRESSION: "Bulk update failed (N)."');
    }
});

test('Part 12 fixes (L): WIRING — the Settings load and the bulk importer say the house words', () => {
    const st = code(read(P12FXL_SETTINGS));
    assert.ok(st.includes("import { readRefusal, failureWords } from '../utils/refusalWords.js';"));
    assert.ok(st.includes('.then(async r => { if (!r.ok) throw new Error(await readRefusal(r)); return r.json(); })'), 'ok first, the refusal\'s words');
    assert.ok(st.includes('if (settingsOrgRef.current !== orgId) setLoadError(failureWords(err));'));
    assert.ok(!/'HTTP '|err\?\.message|the request failed/.test(st), 'REGRESSION: "HTTP N" or a raw message');
    const bk = code(read(P12FXL_BULK));
    assert.ok(bk.includes("import { failureWords, refusalWords } from './refusalWords.js';"));
    assert.equal(count(bk, 'if (!r.ok) { error = refusalWords(r, body); break; }'), 2, 'the POST and the PUT');
    assert.ok(!/errorFrom|Bulk (import|update) failed/.test(bk), 'REGRESSION: the importer\'s own words');
});

// Leads' claim requests: the load's effect, and each press, extracted and run.
let p12fxLLeadsSrc = null;
const p12fxLLeads = () => (p12fxLLeadsSrc ??= code(read(P12FXL_LEADS)));
const p12fxLLoad = async ({ answer, switchAt = false, cancel = false }) => {
    // `landed`: setRequestsLanded's calls (the review's round 3 — moved here when the load gained it; asserted in L3).
    const did = { lists: [], errors: [], landed: [] };
    const org = { now: 'org_a' };
    let cleanup = null;
    const fetch = async () => { await null; if (switchAt) org.now = 'org_b'; if (cancel) cleanup(); const a = typeof answer === 'function' ? answer(org) : answer; if (a instanceof Error) throw a; return a; };
    const body = between(p12fxLLeads(), '        let cancelled = false;\n        const askedOrg = requestOrg();', '\n    }, []);');
    cleanup = new Function('dbFetch', 'requestOrg', 'stillOrg', 'readRefusal', 'failureWords', 'setLeadRequests', 'setRequestsError', 'setRequestsLanded', body)(
        fetch, () => org.now, (o) => o === org.now, readRefusal, failureWords, (v) => did.lists.push(v), (v) => did.errors.push(v), (v) => did.landed.push(v));
    await settle();
    return { ...did, org };
};

test('Part 12 fixes (L): Leads\' claim-requests read — a failed read is said, never drawn as nothing pending; landed, the list; after a switch or an unmount, nothing — RUN', async () => {
    for (const [answer, words] of [...p12bRefused(), [P11_UNREADABLE(), 'Its answer could not be read.'], [onceOf(200, { other: 1 }), 'Its answer could not be read.']]) {
        const did = await p12fxLLoad({ answer });
        assert.deepEqual([did.errors, did.lists], [[words], []], `REGRESSION: a failed read left as an empty panel — ${words}`);
    }
    const LIST = [{ id: 'lcr_1', leadId: 'l1', status: 'pending' }];
    const landed = await p12fxLLoad({ answer: onceOf(200, { leadRequests: LIST }) });
    assert.deepEqual([landed.lists, landed.errors], [[LIST], ['']]);
    for (const answer of [onceOf(200, { leadRequests: LIST }), onceOf(500, { error: 'x' }), UNSENT()]) {
        const switched = await p12fxLLoad({ answer, switchAt: true });
        assert.deepEqual([switched.lists, switched.errors], [[], []], 'REGRESSION: an answer after an org switch landed in the new org');
        const gone = await p12fxLLoad({ answer, cancel: true });
        assert.deepEqual([gone.lists, gone.errors], [[], []], 'unmounted: nothing');
    }
    const midRead = await p12fxLLoad({ answer: (org) => p12bSwitchOnRead(org, 500, { error: 'x' }) });
    assert.deepEqual(midRead.errors, [], 'REGRESSION: a refusal read while the org switched is said in the new org');
});

// requestLead, cancelRequest and resolveRequest, extracted: `said` is each press notice's [leadId, words].
const p12fxLPress = async (name, deps, args, { answer, switchAt = false, leadRequests = [] }) => {
    const s = p12fxLLeads();
    const head = `    const ${name} = useCallback(`;
    const fnSrc = `${between(s, head, `\n    }, [${deps}]);`).slice(head.length)}\n    }`;
    const did = { sent: [], said: [], lists: stateOf(leadRequests), leads: stateOf([{ id: 'l1', ownerId: null, assignedTo: '' }]) };
    const org = { now: 'org_a' };
    const fetch = async (url, opts = {}) => {
        did.sent.push([url, opts.method || 'GET']);
        if (switchAt) org.now = 'org_b';
        if (answer instanceof Error) throw answer;
        return answer;
    };
    const fn = new Function('requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'sayClaim', 'setLeadRequests', 'leadRequests', 'reps', 'setLeads',
        `return ${fnSrc};`)(() => org.now, (o) => o === org.now, fetch, readRefusal, failureWords, (id, w) => did.said.push([id, w]),
        did.lists.set, leadRequests, [{ id: 'usr_2', name: 'Karen' }], did.leads.set);
    await fn(...args);
    return did;
};
const P12FXL_REQ = [{ id: 'lcr_1', leadId: 'l1', requesterId: 'usr_2', status: 'pending' }];

test('Part 12 fixes (L): Leads\' Request — a refusal and a failure in a press notice, the server\'s words with their ref; landed unread, said as requested; after a switch, nothing — RUN', async () => {
    for (const [answer, words] of p12bRefused()) {
        const did = await p12fxLPress('requestLead', 'sayClaim', ['l1'], { answer });
        assert.deepEqual([did.said, did.lists.value], [[['l1', `Request not sent: ${words}`]], []], `REGRESSION: ${words} — the ref dropped, or nothing said`);
    }
    const unread = await p12fxLPress('requestLead', 'sayClaim', ['l1'], { answer: P11_UNREADABLE() });
    assert.deepEqual(unread.said, [['l1', 'Requested — Its answer could not be read. Reload the page to see the request.']],
        'REGRESSION: a request filed, its answer unread, said as nothing (or thrown)');
    const made = { id: 'lcr_9', leadId: 'l1', status: 'pending' };
    const landed = await p12fxLPress('requestLead', 'sayClaim', ['l1'], { answer: onceOf(201, { leadRequest: made }) });
    assert.deepEqual([landed.said, landed.lists.value], [[], [made]]);
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT(), onceOf(201, { leadRequest: made })]) {
        const switched = await p12fxLPress('requestLead', 'sayClaim', ['l1'], { answer, switchAt: true });
        assert.deepEqual([switched.said, switched.lists.value], [[], []], 'REGRESSION: said or listed in the org switched to');
    }
    const org = { now: 'org_a' };
    const s = p12fxLLeads();
    const head = '    const requestLead = useCallback(';
    const mid = await new Function('requestOrg', 'stillOrg', 'dbFetch', 'readRefusal', 'failureWords', 'sayClaim', 'setLeadRequests',
        `return ${between(s, head, '\n    }, [sayClaim]);').slice(head.length)}\n    };`)(() => org.now, (o) => o === org.now,
        async () => p12bSwitchOnRead(org, 500, { error: 'x' }), readRefusal, failureWords, (...a) => { throw new Error(`said after a switch: ${a}`); }, () => {});
    await mid('l1');
});

test('Part 12 fixes (L): Leads\' Cancel request and Approve / Deny — refusals and failures in a press notice titled by the lead; a landed Approve unread, said as landed — RUN', async () => {
    // A fresh answer per press: an answer's body is read once.
    for (let i = 0; i < p12bRefused().length; i++) {
        const words = p12bRefused()[i][1];
        const c = await p12fxLPress('cancelRequest', 'leadRequests, sayClaim', ['lcr_1'], { answer: p12bRefused()[i][0], leadRequests: P12FXL_REQ });
        assert.deepEqual([c.said, c.lists.value], [[['l1', `Request not cancelled: ${words}`]], P12FXL_REQ], `REGRESSION: ${words}`);
        for (const [action, verb] of [['approve', 'approved'], ['deny', 'denied']]) {
            const r = await p12fxLPress('resolveRequest', 'reps, setLeads, leadRequests, sayClaim', ['lcr_1', action], { answer: p12bRefused()[i][0], leadRequests: P12FXL_REQ });
            assert.deepEqual([r.said, r.lists.value, r.leads.value[0].ownerId], [[['l1', `Request not ${verb}: ${words}`]], P12FXL_REQ, null], `REGRESSION: ${verb} — ${words}`);
        }
    }
    const cancelled = await p12fxLPress('cancelRequest', 'leadRequests, sayClaim', ['lcr_1'], { answer: onceOf(200, {}), leadRequests: P12FXL_REQ });
    assert.deepEqual([cancelled.said, cancelled.lists.value], [[], []]);
    const unread = await p12fxLPress('resolveRequest', 'reps, setLeads, leadRequests, sayClaim', ['lcr_1', 'approve'], { answer: P11_UNREADABLE(), leadRequests: P12FXL_REQ });
    assert.deepEqual(unread.said, [['l1', 'Request approved — Its answer could not be read. Reload the page to see the lead and its requests.']],
        'REGRESSION: a landed Approve, its answer unread, said as nothing (or thrown)');
    const approved = await p12fxLPress('resolveRequest', 'reps, setLeads, leadRequests, sayClaim', ['lcr_1', 'approve'],
        { answer: onceOf(200, { leadRequest: { ...P12FXL_REQ[0], status: 'approved' } }), leadRequests: P12FXL_REQ });
    assert.deepEqual([approved.said, approved.leads.value[0].ownerId, approved.leads.value[0].assignedTo, approved.lists.value[0].status], [[], 'usr_2', 'Karen', 'approved']);
    for (const answer of [onceOf(500, { error: 'x' }), UNSENT()]) {
        assert.deepEqual((await p12fxLPress('cancelRequest', 'leadRequests, sayClaim', ['lcr_1'], { answer, switchAt: true, leadRequests: P12FXL_REQ })).said, []);
        assert.deepEqual((await p12fxLPress('resolveRequest', 'reps, setLeads, leadRequests, sayClaim', ['lcr_1', 'deny'], { answer, switchAt: true, leadRequests: P12FXL_REQ })).said, []);
    }
    // The press notice's title: the lead as the panel names it.
    const titleOf = new Function(`${between(p12fxLLeads(), 'const claimTitleOf = ', '\n};')}\n}; return claimTitleOf;`)();
    assert.equal(titleOf([{ id: 'l1', first: 'Ann', last: 'Lee', company: 'Acme' }], 'l1'), 'Ann Lee');
    assert.equal(titleOf([{ id: 'l1', first: '', last: '', company: 'Acme' }], 'l1'), 'Acme', 'REGRESSION: a company-only lead titled "A lead"');
    assert.equal(titleOf([], 'l1'), 'A lead');
});

test('Part 12 fixes (L): WIRING — Leads\' claim requests: the panel says a failed read; every refusal a press notice, never the one-slot toast', () => {
    const s = p12fxLLeads();
    assert.ok(s.includes("import { readRefusal, failureWords } from '../utils/refusalWords.js';"));
    assert.ok(s.includes("import { pressNoticeOf } from '../utils/pressNotice.js';"));
    const panel = between(s, 'const RequestsPanel = (', '\nconst LeadSourcesPanel');
    assert.ok(panel.includes('const RequestsPanel = ({ requests, leads, reps, onResolve, onReview, readError }) => {'));
    assert.ok(panel.includes('if (pending.length === 0 && !readError) return null;'), 'REGRESSION: a failed read hides the panel — read as nothing pending');
    assert.ok(panel.includes("{readError ? '—' : `${pending.length} pending`}"), 'REGRESSION: "0 pending" over a read that failed');
    assert.ok(panel.includes('{readError && <div style={{ fontSize:11, color:T.danger, fontFamily:T.sans, overflowWrap:\'anywhere\' }}>The requests could not be read — {readError}</div>}'));
    assert.ok(s.includes('onReview={onOpenLead} readError={requestsError}/>}'), 'the Triage view hands the panel the read\'s failure');
    assert.ok(s.includes('                        leadRequests={leadRequests}\n                        requestsError={requestsError}\n'), 'LeadsTab hands it to the Triage view');
    assert.ok(between(s, 'const TriageView = (', '=> {').includes('leadRequests, requestsError, requestLead'));
    assert.ok(s.includes("    const [requestsError, setRequestsError] = useState('');"));
    assert.ok(s.includes('        setPressNotices(list => [...list, pressNoticeOf(claimTitleOf(allLeads, leadId), words)]);'), 'a press notice, titled by the lead');
    const presses = between(s, '    const sayClaim = useCallback(', '    const convertLead = useCallback(');
    assert.ok(!presses.includes('setUndoToast'), 'REGRESSION: a claim refusal on the one-slot toast a later toast replaces');
    assert.ok(!/Request not (sent|cancelled|resolved)\.'|b\?\.error|\.message\b/.test(presses), 'REGRESSION: the old words, or a raw message');
    assert.equal(count(presses, 'await readRefusal(res);'), 3, 'each refusal in readRefusal\'s words');
    assert.equal(count(presses, '${failureWords(e)}'), 3, 'each failure in failureWords\'');
});

// ── Part 12 — the review's fixes (G — THE GUARD floors) ──
// The review of §0.249 (finding 11): scan (iv)'s floor stayed "catches >= 35" when Part 12 added 16 files to the list it
// reads — the scan could lose four-fifths of its catch clauses (the catches inside JSX handlers, an exported function's)
// and stay green — and nothing held the list's length. Its WIRING (the floors, the list's length, CLEANED named once)
// is merged into the one floors test at the end of this file (round 4, G4; round 3's G3 before it), at the counts
// measured after round 4, so no test keeps a floor looser than the measured one.

// ── Part 12 — the review's fixes, round 2 (A2 — Audit log) ──
// The review of the first fixes (residuals A0-A2): while the audit-log read loaded, the subtitle drew "0 of 0 events";
// "+ Add destination" was live while the destinations list loaded, so a landed Add could race its first read (an unread
// Add marked read again, "No destinations." under "Destination added"; a read Add's row overwritten); and a Pause /
// Resume or Send test that landed unread left the row's old status drawn, counted in "· N not delivering" and offered as
// its old Pause / Resume. The subtitle says the log is loading; both Adds are off, saying why, while the list loads; a row
// whose status a landed answer could not show is "Not known", counted as such, its Pause / Resume off until a reload.
const p12fxA2Press = async (which, answer, args, statusBefore = []) => {
    const did = { sent: [], errors: [], busy: [], tests: [], modal: [], reveal: [], read: [], statusBefore };
    did.answered = await auditActions(did, answer)[which](...args);
    return { ...did, said: did.errors.filter(Boolean) };
};

test('Part 12 fixes (A2): the Audit log\'s Pause / Resume — landed unread, its row\'s status not known; a Rotate unread leaves it known; landed, known again — RUN', async () => {
    const paused = await p12fxA2Press('putDest', P11_UNREADABLE(), [{ id: 'dst_1', paused: true }, 'Pause']);
    assert.deepEqual([paused.statusUnread.value, paused.dests.value[0].status], [['dst_1'], 'Active'], 'REGRESSION: a Pause that landed unread left the row drawn as its old status');
    assert.deepEqual(paused.said, ['Pause saved — Its answer could not be read. Reload the page to see the destination.']);
    const resumed = await p12fxA2Press('putDest', P11_UNREADABLE(), [{ id: 'dst_1', paused: false }, 'Resume']);
    assert.deepEqual(resumed.statusUnread.value, ['dst_1'], 'REGRESSION: a Resume that landed unread left the row drawn as its old status');
    const rotated = await p12fxA2Press('putDest', P11_UNREADABLE(), [{ id: 'dst_1', rotateSecret: true }, 'Rotate secret']);
    assert.deepEqual(rotated.statusUnread.value, [], 'a Rotate moves no status: the row stays known');
    // Moved pin (§0.249, the review's fixes, round 3): only the server's own refusal (the 403) leaves the row known; an
    // answer that proves nothing may have paused it — its status not known.
    for (const [answer] of P12A_REFUSED()) {
        const did = await p12fxA2Press('putDest', answer, [{ id: 'dst_1', paused: true }, 'Pause']);
        const own = !(answer instanceof Error) && answer.status === 403;
        assert.deepEqual(did.statusUnread.value, own ? [] : ['dst_1'], 'a refusal changed nothing: the row stays known; a maybe, not known');
    }
    const landed = await p12fxA2Press('putDest', onceOf(200, { destination: { ...P12A_DEST, status: 'Paused', paused: true } }), [{ id: 'dst_1', paused: true }, 'Pause'], ['dst_1', 'dst_2']);
    assert.deepEqual([landed.statusUnread.value, landed.dests.value[0].status], [['dst_2'], 'Paused'], 'REGRESSION: a readable answer leaves its row "Not known"');
    const rotLanded = await p12fxA2Press('putDest', onceOf(200, { destination: { ...P12A_DEST }, newSecret: 'n' }), [{ id: 'dst_1', rotateSecret: true }, 'Rotate secret'], ['dst_1']);
    assert.deepEqual(rotLanded.statusUnread.value, [], 'a readable Rotate shows the row as the server answered it');
});

test('Part 12 fixes (A2): the Audit log\'s Send test event — landed unread, its row\'s status not known; landed with the row, known again — RUN', async () => {
    const unread = await p12fxA2Press('sendTest', P11_UNREADABLE(), [P12A_DEST]);
    assert.deepEqual([unread.statusUnread.value, unread.said], [['dst_1'], ['Test sent — Its answer could not be read, so whether it was delivered is not known.']],
        'REGRESSION: a test that landed unread left the row drawn as its old status');
    // Moved pin (§0.249, the review's fixes, round 3): only the server's own refusal (the 403) leaves the row known.
    for (const [answer] of P12A_REFUSED()) {
        const own = !(answer instanceof Error) && answer.status === 403;
        assert.deepEqual((await p12fxA2Press('sendTest', answer, [P12A_DEST])).statusUnread.value, own ? [] : ['dst_1'], 'a refusal changed nothing; a maybe, not known');
    }
    const landed = await p12fxA2Press('sendTest', onceOf(200, { ok: true, status: 202, destination: { ...P12A_DEST, status: 'Active' } }), [P12A_DEST], ['dst_1']);
    assert.deepEqual([landed.statusUnread.value, landed.tests.at(-1)], [[], { id: 'dst_1', ok: true, status: 202, error: undefined }], 'REGRESSION: a readable test leaves its row "Not known"');
});

test('Part 12 fixes (A2): the Audit log\'s "Streaming to N destinations" — a row whose status is not known is counted as such, never as delivering or not — RUN', () => {
    const PAUSED = { id: 'dst_2', status: 'Paused' };
    assert.equal(p12fxABadge([P12A_DEST], true, ['dst_1']), 'Streaming to 1 destination · 1 status not known', 'REGRESSION: an Active row whose Pause landed unread counted as delivering');
    assert.equal(p12fxABadge([{ ...PAUSED, id: 'dst_1' }], true, ['dst_1']), 'Streaming to 1 destination · 1 status not known', 'REGRESSION: a Paused row whose Resume landed unread counted as not delivering');
    assert.equal(p12fxABadge([P12A_DEST, PAUSED], true, ['dst_1']), 'Streaming to 2 destinations · 1 not delivering · 1 status not known');
    assert.equal(p12fxABadge([P12A_DEST, PAUSED], true, ['dst_9']), 'Streaming to 2 destinations · 1 not delivering', 'an id no row holds (a removed row) counts nothing');
    assert.equal(p12fxABadge([P12A_DEST], false, ['dst_1']), undefined, 'a list never read: no badge');
});

test('Part 12 fixes (A2): the Audit log\'s subtitle — "still loading" while the read is out, never "0 of 0 events" — RUN', () => {
    const piece = between(code(read(P12A_AUDIT)), 'sub={eventsError', '\n                badge=');
    const sub = (eventsError, eventsLoading, visible = [], events = []) =>
        new Function('eventsError', 'eventsLoading', 'visible', 'events', 'timeFilter', `return (${piece.slice(5, -1)});`)(eventsError, eventsLoading, visible, events, 'Last 7 days');
    assert.equal(sub(null, true), 'The audit log is still loading…', 'REGRESSION: "0 of 0 events" over a read that has not landed');
    assert.equal(sub('Internal server error (ref r1)', false), 'The audit log did not load', 'REGRESSION: a count over a read that failed');
    assert.equal(sub(null, false, [1], [1, 2]), '1 of 2 events · Last 7 days · the last 500 events are loaded');
});

test('Part 12 fixes (A2): the Audit log\'s "+ Add destination" — off, saying why, while the destinations load: no Add can race the list\'s first read — RUN, and WIRING', () => {
    const s = code(read(P12A_AUDIT));
    const why = (destsLoading) => new Function('destsLoading', `${between(s, '    const addWhy = ', '\n')}\nreturn addWhy;`)(destsLoading);
    assert.equal(why(true), 'The destinations are still loading', 'REGRESSION: an Add offered over a list still loading says nothing');
    assert.equal(why(false), undefined);
    assert.ok(s.includes(`<span key="add" title={addWhy} style={{ display:'inline-flex' }}><SecBtn label="+ Add destination" primary disabled={destsLoading} onClick={() => { if (!destsLoading) setShowAddDest(true); }}/></span>,`),
        'REGRESSION: the header\'s Add offered while the list loads');
    assert.ok(s.includes(`<span title={addWhy} style={{ display:'inline-flex' }}><SecBtn label="+ Add destination" disabled={destsLoading} onClick={() => { if (!destsLoading) setShowAddDest(true); }}/></span>`),
        'REGRESSION: the section\'s Add offered while the list loads');
    assert.equal(count(s, 'setShowAddDest(true)'), 2, 'two Adds, each behind the gate');
    assert.equal(count(s, 'if (!destsLoading) setShowAddDest(true);'), 2);
});

test('Part 12 fixes (A2): WIRING — a row whose status is not known says so: "Not known", reload to see it, no old error, no Pause / Resume', () => {
    const s = code(read(P12A_AUDIT));
    const row = between(s, '                            const unknown = statusUnread.includes(s.id);', '</tr>');
    assert.ok(row.includes('const st = destStatusStyle(unknown ? null : s.status);'), 'REGRESSION: the old status\'s colour on a row whose status is not known');
    assert.ok(row.includes("{unknown ? 'Not known' : s.status}</span>"), 'REGRESSION: the old status drawn after a landed answer that could not be read');
    assert.ok(row.includes('{unknown && <div style={{ fontSize:10.5, color:T.danger, marginTop:4, maxWidth:220, lineHeight:1.4 }}>Its status could not be read — reload the page to see it.</div>}'),
        'REGRESSION: a status not known, not said');
    assert.ok(row.includes('{!unknown && s.lastError && '), 'REGRESSION: the old error drawn on a row whose status is not known');
    assert.ok(row.includes("<SecBtn label={unknown ? 'Pause / Resume' : s.paused ? 'Resume' : 'Pause'} disabled={busy || unknown} "),
        'REGRESSION: the old Pause / Resume offered on a row whose status is not known');
    assert.equal(count(s, 'statusUnread.includes('), 3, 'the badge\'s two counts and the row read it');
});

// ── Part 12 — the review's fixes, round 2 (U2 — Users) ──
// The review of the first fixes (residuals U0-U1): the landed-unreadable invite's roster read again threw its refusal
// away — `rosterRes.ok ? … : null` and an empty catch — so its notice said only "reload the page to see them", the
// server's words and their ref nowhere (runClerkSync's read again says them); and PeoplePageHeader drew its green ✓
// before every status — "Clerk's list not read", "MFA unknown — could not read Clerk", "Unknown — could not read
// Clerk" each beside a passing check (§0.247). The read again says its refusal or failure in the house words, as
// runClerkSync does; the header's ✓ stands only over a status its caller read ('read'), a failed read or one with no
// count a warning mark ('unread'), one still loading no mark.
const P12FXU2_REREAD = 'The invitations were sent. Its answer could not be read — the list of users was read again to show them.';
const p12fxU2Reload = (words, teamed = '') => `The invitations were sent. Its answer could not be read.${teamed} The roster could not be read again — reload the page to see it: ${words}`;
const P12FXU2_TEAMED = " They were not added to their teams' lists — add them on the Teams page.";

test('Part 12 fixes (U2): the landed-unread invite\'s roster read again — its refusal or failure said in the house words with the ref, never a bare "reload" — RUN', async () => {
    for (const [roster, words] of P12A_REFUSED()) {
        const did = await p12fxUInvite([P11_UNREADABLE(), roster]);
        assert.deepEqual([did.said, did.told, did.users.length], [[], [p12fxU2Reload(words)], 2], `REGRESSION: the roster's refusal dropped — ${words}`);
    }
    const ref = await p12fxUInvite([P11_UNREADABLE(), onceOf(500, { error: 'Internal server error', requestId: 'r7' })]);
    assert.ok(ref.told[0].endsWith('reload the page to see it: Internal server error (ref r7)'), 'REGRESSION: the ref support traces lost');
    for (const roster of [P11_UNREADABLE(), onceOf(200, {}), onceOf(200, { users: 'x' })]) {
        const did = await p12fxUInvite([P11_UNREADABLE(), roster]);
        assert.deepEqual([did.told, did.users.length], [[p12fxU2Reload('Its answer could not be read.')], 2], 'a landed roster with no list: said, never written');
    }
    const teamed = await p12fxUInvite([P11_UNREADABLE(), P11_PAGE()], 'East');
    assert.deepEqual(teamed.told, [p12fxU2Reload('The server returned 502.', P12FXU2_TEAMED)], 'the team lists said too, the roster\'s words last');
    const landed = await p12fxUInvite([P11_UNREADABLE(), onceOf(200, { users: [{ id: 'usr_1' }, { id: 'usr_9' }] })]);
    assert.deepEqual([landed.told, landed.users.map((u) => u.id)], [[P12FXU2_REREAD], ['usr_1', 'usr_9']], 'read again: no words of a failure');
    // Two requests only: the invite, then one read — no second invite over a failed read.
    assert.deepEqual(ref.sent.map(([, method]) => method), ['POST', 'GET']);
});

test('Part 12 fixes (U2): WIRING — the invite\'s roster read again reads its ok first and says why it was not read; no empty catch', () => {
    const page = between(code(read(P12A_USERS)), 'const UsersInvitePage = ', '\nconst UsersExportPage = ');
    const piece = between(page, 'if (resp.ok && !Array.isArray(d.invited)) {', '                return;\n');
    order(piece, "const rosterRes = await dbFetch('/.netlify/functions/users');", 'if (!rosterRes.ok) throw new Error(await readRefusal(rosterRes));',
        'const ud = await rosterRes.json();', 'if (!stillOrg(askedOrg)) return;', "if (!Array.isArray(ud?.users)) throw new Error('Its answer could not be read.');",
        'setSettings(prev => ({ ...prev, users: ud.users })); reread = true;', '} catch (e) { why = failureWords(e); }', 'if (!stillOrg(askedOrg)) return;',
        'reload the page to see it: ${why}`');
    assert.equal(count(piece, '.catch(() => null)'), 0, 'REGRESSION: the roster\'s unreadable answer swallowed');
    assert.ok(!/catch \(e\) \{\s*(\/\*[^*]*\*\/\s*)?\}/.test(piece), 'REGRESSION: an empty catch drops the roster read\'s failure');
});

// The header's mark, decided by each caller: the expressions, extracted and run.
const p12fxU2Attr = (start) => {
    const line = between(code(read(P12A_USERS)), start, '\n');
    return line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
};
const p12fxU2Run = (expr, params, ...args) => new Function(...params, `return (${expr});`)(...args);

test('Part 12 fixes (U2): the people pages\' header marks — "read" only over a status that was read; a failed read or no count "unread"; loading none — RUN', () => {
    const pending = p12fxU2Attr('                statusState={clerkInvites === null');
    const P = ['clerkInvites', 'invitesUnread'];
    assert.equal(p12fxU2Run(pending, P, null, false), 'loading', 'REGRESSION: a ✓ beside "Reading invitations…"');
    assert.equal(p12fxU2Run(pending, P, false, true), 'unread', 'REGRESSION: a ✓ beside "Clerk\'s list not read"');
    assert.equal(p12fxU2Run(pending, P, [], false), 'read');
    const seat = between(code(read(P12A_USERS)), '    const statusState = ', ';\n').slice('    const statusState = '.length);
    const S = ['seats', 'seatsFailed', 'inClerk'];
    assert.equal(p12fxU2Run(seat, S, null, true, null), 'unread', 'REGRESSION: a ✓ beside "Unknown — could not read Clerk"');
    assert.equal(p12fxU2Run(seat, S, null, false, null), 'loading', 'REGRESSION: a ✓ beside "Loading…"');
    assert.equal(p12fxU2Run(seat, S, {}, false, null), 'unread', 'REGRESSION: a ✓ beside "Unknown — Clerk sent no count"');
    assert.equal(p12fxU2Run(seat, S, { members: 3 }, false, 3), 'read');
    const mfa = p12fxU2Attr("                statusState={loading ? 'loading'");
    const M = ['loading', 'failed'];
    assert.equal(p12fxU2Run(mfa, M, true, false), 'loading');
    assert.equal(p12fxU2Run(mfa, M, false, true), 'unread', 'REGRESSION: a ✓ beside "MFA unknown — could not read Clerk"');
    assert.equal(p12fxU2Run(mfa, M, false, false), 'read');
});

test('Part 12 fixes (U2): WIRING — PeoplePageHeader draws its ✓ only over "read", a warning mark over "unread"; every caller names its state', () => {
    const s = code(read(P12A_USERS));
    const header = between(s, 'const PeoplePageHeader = ', '\nconst PeopleSecBtn = ');
    assert.ok(header.includes('({ title, subtitle, statusDetail, statusState, rightActions })'));
    assert.ok(header.includes(`{statusDetail && <><span style={{ color:T.inkMuted }}>•</span>{statusState === 'read' ? <span style={{ color:T.ok, fontWeight:600 }}>✓</span> : statusState === 'unread' ? <span title="Not read" style={{ color:T.warn, fontWeight:700 }}>!</span> : null}<span>{statusDetail}</span></>}`),
        'REGRESSION: a green ✓ beside a status that was not read');
    assert.equal(count(header, '✓'), 1, 'REGRESSION: a second ✓ drawn');
    assert.equal(count(header, 'T.ok'), 1, 'one green mark, the read one\'s');
    // Each of the five headers names its state; the Invite and Export pages' counts are their own (read by construction).
    assert.equal(count(s, '<PeoplePageHeader'), 5);
    assert.equal(count(s, 'statusState='), 5, 'REGRESSION: a header drawn with no state');
    assert.ok(s.includes('                statusDetail={readyCount > 0 ? `${readyCount} ready to send` : null}\n                statusState="read"\n'));
    assert.ok(s.includes('                statusDetail={`${filteredUsers.length} rows · ${checkedFields.length} fields`}\n                statusState="read"\n'));
    assert.ok(s.includes('                statusDetail={status}\n                statusState={statusState}\n'), 'REGRESSION: the Seat usage header drawn with no state');
    assert.ok(s.includes("statusDetail={clerkInvites === null ? 'Reading invitations…'") && s.includes("                statusState={loading ? 'loading' : failed ? 'unread' : 'read'}\n"));
});

// ── Part 12 — the review's fixes, round 2 (M2 — MFA) ──
// The review of the first fixes (residuals M0-M1): the MFA page's shape check stopped at the top level — a byRole or
// notEnrolled entry that is not a record (null, a string) passed, and the render read r.total / u.userId on it and
// crashed with no error said; and the page and the overview's tile were two rules that agreed one way only — an answer
// of the numbers alone scored 2/3 on the tile and counted MFA as read in Health while the page said "Its answer could not
// be read.". One rule now, settingsCards.js mfaAnswerRead: the two numbers, the two lists, each entry a record; the page
// (MfaDetail.jsx) and the tile (liveCountsOf) both read it, so an answer one cannot read the other cannot either.
const P12FXM2_ENTRY = { role: 'Admin', enrolled: 1, total: 1 };
const P12FXM2_USER = { userId: 'u3', email: 'c@x.co', name: 'C', role: 'User' };
// Both numbers and both lists, an entry that is not a record: each a read that failed.
// Moved (§0.249, review fixes round 3 — U3): each holds `enrolledUsers: []`, which the rule now reads — bad only by its entry.
const P12FXM2_BAD_ENTRIES = () => [
    { total: 1, enrolled: 0, byRole: [null], notEnrolled: [], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: [P12FXM2_ENTRY, null], notEnrolled: [P12FXM2_USER], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: ['Admin'], notEnrolled: [], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: [3], notEnrolled: [], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: [true], notEnrolled: [], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: [P12FXM2_ENTRY], notEnrolled: [null], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: [P12FXM2_ENTRY], notEnrolled: [P12FXM2_USER, null], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: [P12FXM2_ENTRY], notEnrolled: ['c@x.co'], enrolledUsers: [] },
    { total: 1, enrolled: 0, byRole: [P12FXM2_ENTRY], notEnrolled: [7], enrolledUsers: [] },
];
// Whole answers, each read on the page and the tile alike.
const P12FXM2_READ = () => [
    // Moved (§0.249, review fixes round 3 — U3): enrolledUsers on each, the second's member in it.
    { total: 0, enrolled: 0, byRole: [], notEnrolled: [], enrolledUsers: [] },
    { total: 1, enrolled: 1, byRole: [P12FXM2_ENTRY], notEnrolled: [], enrolledUsers: [{ ...P12FXM2_USER, userId: 'u1', email: 'a@x.co' }] },
    { total: 3, enrolled: 2, byRole: [P12FXM2_ENTRY, { role: 'User', enrolled: 1, total: 2 }], notEnrolled: [P12FXM2_USER], enrolledUsers: [] },
];

test('Part 12 fixes (M2): MFA — a byRole or notEnrolled entry that is not a record is "Its answer could not be read." on the page and unread on the tile, never drawn — RUN', async () => {
    for (const body of P12FXM2_BAD_ENTRIES()) {
        const page = await mfaLoad({ answer: onceOf(200, body) });
        assert.deepEqual([page.errors, page.data, page.loading], [[P12FXM_UNREAD], [], [false]],
            `REGRESSION: ${JSON.stringify(body)} kept as the enrollment — the render reads r.total / u.userId on it`);
        const tile = await p12fxmTile(body);
        assert.deepEqual([tile.mfa, tile.unread.includes('mfa')], [undefined, true], `REGRESSION: ${JSON.stringify(body)} counted on the tile`);
        assert.equal(mfaAnswerRead(body), false, JSON.stringify(body));
    }
    for (const body of P12FXM2_READ()) {
        const page = await mfaLoad({ answer: onceOf(200, body) });
        assert.deepEqual([page.data, page.errors, page.loading], [[body], [], [false]], `${JSON.stringify(body)}: read on the page`);
        const tile = await p12fxmTile(body);
        assert.deepEqual([tile.mfa, tile.unread.includes('mfa')], [{ enrolled: body.enrolled, total: body.total }, false], `${JSON.stringify(body)}: read on the tile`);
        assert.equal(mfaAnswerRead(body), true, JSON.stringify(body));
    }
});

test('Part 12 fixes (M2): MFA — the page and the overview tile are one rule (mfaAnswerRead): each answer read on both or unread on both; the tile never throws on a body that is not an object — RUN', async () => {
    const bodies = [...P12FXM_SHORT(), ...P12FXM2_BAD_ENTRIES(), ...P12FXM2_READ(), undefined, 0, 3, true];
    for (const body of bodies) {
        const rule = mfaAnswerRead(body);
        const page = await mfaLoad({ answer: onceOf(200, body) });
        const tile = await p12fxmTile(body);   // rejects (and fails here) if the rule reads a field of a null body
        const pageRead = page.errors.length === 0 && page.data.length === 1;
        const tileRead = tile.mfa !== undefined && !tile.unread.includes('mfa');
        assert.deepEqual([pageRead, tileRead], [rule, rule], `REGRESSION: ${JSON.stringify(body)} — the page and the tile read it apart`);
        if (!rule) assert.deepEqual(page.errors, [P12FXM_UNREAD], `${JSON.stringify(body)}: said as unread`);
        // Health scores the MFA check only over an answer the page can read.
        const scored = healthChecksOf({ pipelines: [{}], users: [] }, tile).some((c) => c.id === 'mfa');
        assert.equal(scored, rule, `REGRESSION: ${JSON.stringify(body)} scored in Health apart from the page`);
    }
    // The answer's two numbers and three lists, one at a time, each needed by the rule. Moved (§0.249, review fixes
    // round 3 — U3): enrolledUsers joins them (Settings → Users draws it).
    const whole = { total: 3, enrolled: 2, byRole: [P12FXM2_ENTRY], notEnrolled: [P12FXM2_USER], enrolledUsers: [{ ...P12FXM2_USER, userId: 'u1' }] };
    for (const key of ['total', 'enrolled', 'byRole', 'notEnrolled', 'enrolledUsers']) {
        const { [key]: _gone, ...short } = whole;
        assert.equal(mfaAnswerRead(short), false, `${key} left out`);
    }
    assert.equal(mfaAnswerRead(whole), true);
    assert.equal(mfaAnswerRead(null), false);
});

test('Part 12 fixes (M2): WIRING — the MFA page and the overview tile read one rule, settingsCards.js mfaAnswerRead, and neither keeps a copy of its own', () => {
    const cards = code(read('src/utils/settingsCards.js'));
    // Moved (§0.249, review fixes round 3 — U3): each entry's fields typed, and enrolledUsers read (pinned at the same
    // strength or stronger in round 3's own WIRING test, below).
    const rule = between(cards, 'const isMfaRole = ', '\n\n');
    assert.ok(rule.includes("const isMfaRole = (v) => !!v && typeof v.role === 'string'"), 'REGRESSION: an entry that is not a record read');
    assert.ok(rule.includes("export const mfaAnswerRead = (d) => !!d && typeof d.total === 'number' && typeof d.enrolled === 'number'"));
    assert.ok(rule.includes('&& Array.isArray(d.byRole) && d.byRole.every(isMfaRole)'), 'REGRESSION: byRole\'s entries not checked');
    assert.ok(rule.includes('&& Array.isArray(d.notEnrolled) && d.notEnrolled.every(isMfaMember)'), 'REGRESSION: notEnrolled\'s entries not checked');
    const live = between(cards, 'export async function liveCountsOf(', '\n}\n');
    assert.ok(live.includes('    if (mfaAnswerRead(d)) counts.mfa = { enrolled: d.enrolled, total: d.total };'), 'REGRESSION: the tile reads an MFA answer by a rule of its own');
    assert.equal(count(live, 'counts.mfa = '), 1, 'one place the tile keeps the MFA count');
    assert.equal(count(live, 'd.total'), 1, 'REGRESSION: a second rule on the MFA answer in the tile');
    const page = code(read(P12A_MFA));
    assert.ok(page.includes("import { mfaAnswerRead } from '../../../utils/settingsCards.js';"));
    const load = between(page, '        const load = async () => {', '\n        };');
    assert.equal(count(load, 'mfaAnswerRead(enrollment)'), 1);
    assert.ok(!/typeof enrollment\.|Array\.isArray\(enrollment/.test(load), 'REGRESSION: the page keeps a copy of the rule beside the shared one');
});

// ── Part 12 — the review's fixes, round 2 (D2 — Document uploads) ──
// The review of round 1 (residuals D0 and D1): the record step said "The document was not saved — …" over every answer
// that was not ok and every request that threw — but the create writes the document, its first version and its links one
// after another with no transaction (documents.mjs), so a 500 after the first insert, a gateway's page after the commit,
// or a connection dropped after the request reached the server proves nothing: Upload stayed armed and a second press
// minted a new id and wrote a second document. As the quota board's save says it (SalesManagerTab sendQuotas, Part 12b):
// "not saved" only for the server's own refusal — a 4xx with its words, every one of which documents.mjs returns before
// it writes — and any other answer "may have been saved — reload the page to see whether it was: <words>", marked landed
// (and `maybe`: said in the red box) so the rail and a record's Documents let the file go. A presign's or R2's failure
// wrote no document and stays a retry. And a document made unread left the rail holding its name, links, category,
// visibility and note — the next file picked took them (pickFile fills the name only when there is none) under the old
// notice: the rail now goes back to its opening seed, and picking a file clears the notice.
const P12FXD2_MAYBE = 'The document may have been saved — reload the page to see whether it was';
const P12FXD2_VMAYBE = 'The new version may have been saved — reload the page to see whether it was';
const P12FXD2_LINK = { type: 'account', recordId: 'acc_1', name: 'Acme' };

test('Part 12 fixes, round 2 (D2): the record step — "not saved" only over the server\'s own refusal (a 4xx with its words); a 5xx, a page, a 4xx with none or a request that threw "may have been saved", marked landed — RUN', async () => {
    for (const [kind, step, maybe] of [['new', 'The document was not saved', P12FXD2_MAYBE], ['version', 'The new version was not saved', P12FXD2_VMAYBE]]) {
        // The server's own refusals — every 4xx documents.mjs sends with its words returns before it writes anything.
        for (const [answer, words] of [
            [onceOf(403, { error: 'Forbidden' }), 'Forbidden'],
            [onceOf(400, { error: 'storageKey/org mismatch', requestId: 'r2' }), 'storageKey/org mismatch (ref r2)'],
            [onceOf(404, { error: 'Not found' }), 'Not found'],
            [onceOf(409, { error: 'That document id is already in use.' }), 'That document id is already in use.'],
            [onceOf(415, { error: 'Unsupported file type' }), 'Unsupported file type'],
        ]) {
            const { e } = await p12fxdThrown({ kind, record: answer });
            assert.deepEqual([e.message, e.landed, e.maybe, failureWords(e)], [`${step} — ${words}`, undefined, undefined, `${step} — ${words}`],
                `${kind}: REGRESSION — the server's own refusal said as "${e.message}"`);
        }
        // Any other answer may have come after a write: said so, with its words (the ref kept), marked landed and maybe.
        for (const [answer, words] of [
            [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
            [onceOf(503, { error: 'Service unavailable' }), 'Service unavailable'],
            [P11_PAGE(), 'The server returned 502.'],
            [onceOf(504, new SyntaxError('Unexpected end of JSON input')), 'The server returned 504.'],
            [onceOf(409, {}), 'The server returned 409.'],
            [onceOf(400, { error: '   ' }), 'The server returned 400.'],
            [UNSENT(), 'The server could not be reached.'],
            [new TypeError('NetworkError when attempting to fetch resource.'), 'The server could not be reached.'],
        ]) {
            const { e } = await p12fxdThrown({ kind, record: answer });
            assert.deepEqual([e.message, e.landed, e.maybe, failureWords(e)], [`${maybe}: ${words}`, true, true, `${maybe}: ${words}`],
                `${kind}: REGRESSION — "not saved" said over an answer that may have come after a write ("${e.message}"): Upload armed again, a second document written`);
        }
        // A presign's and R2's failures wrote no document: unmarked, a retry.
        for (const answer of [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), P11_PAGE(), UNSENT()]) {
            const { e } = await p12fxdThrown({ kind, presign: answer });
            assert.deepEqual([e.landed, e.maybe], [undefined, undefined], `${kind}: a presign stores nothing`);
        }
        for (const r2 of [{ status: 500 }, { offline: true }]) assert.equal((await p12fxdThrown({ kind, r2 })).e.landed, undefined, `${kind}: R2 makes no document`);
    }
    // The unread case is landed and not maybe — a notice, not the red box.
    const made = (await p12fxdThrown({ record: P11_UNREADABLE() })).e;
    assert.deepEqual([made.landed, made.maybe], [true, undefined]);
    // After an org switch, the maybe answers never settle (§0.175): at the send and at the body read.
    for (const kind of ['new', 'version']) {
        for (const record of [onceOf(500, { error: 'x' }), UNSENT()]) assert.equal(await p12cUpload({ kind, record, switchOn: 'record' }), P12C_PENDING, `${kind}: said after a switch`);
        assert.equal(await p12cUpload({ kind, record: p12cSwitchOnRead(502, {}) }), P12C_PENDING, `${kind}: REGRESSION — read during a switch, said under the new org's name`);
    }
});

test('Part 12 fixes, round 2 (D2): the upload rail — a document that may have been made is said in the red box and the file let go; a document made goes back to the rail as it opened (its own name, links, category, visibility and note cleared) — RUN', async () => {
    const OPENED = (links, category) => [['name', ''], ['note', ''], ['visibility', 'team'], ['sharedWith', []], ['links', links], ['category', category]];
    const maybe = (await p12fxdThrown({ record: onceOf(500, { error: 'Internal server error', requestId: 'r1' }) })).e;
    const r = await p12fxdRail({ create: async () => { throw maybe; } });
    assert.deepEqual([r.errors, r.notices, r.files, r.closed, r.sent], [[null, `${P12FXD2_MAYBE}: Internal server error (ref r1)`], [null], [null], 0, 1],
        'REGRESSION: "may have been saved" said as a notice, or the file kept with Upload armed — a second press wrote a second document');
    assert.deepEqual(r.fields, OPENED([], 'Contract'), 'REGRESSION: the made document\'s fields kept for the next file');
    // A thrown request likewise (it may have reached the server).
    const thrown = (await p12fxdThrown({ record: UNSENT() })).e;
    const t = await p12fxdRail({ create: async () => { throw thrown; } });
    assert.deepEqual([t.errors, t.notices, t.files], [[null, `${P12FXD2_MAYBE}: The server could not be reached.`], [null], [null]]);
    // Opened from a record's Documents (its link and category the seed): back to that seed, not empty.
    const seeded = await p12fxdRail({ create: async () => { throw maybe; }, ctx: { links: [P12FXD2_LINK], category: 'Proposal' } });
    assert.deepEqual(seeded.fields, OPENED([P12FXD2_LINK], 'Proposal'), 'REGRESSION: the rail\'s own seed lost — the next file goes unlinked');
    // Made, read unreadable: a notice, and the fields back too (residual D1: the next file took the last one's name and links).
    const made = (await p12fxdThrown({ record: P11_UNREADABLE() })).e;
    const m = await p12fxdRail({ create: async () => { throw made; }, ctx: { links: [P12FXD2_LINK] } });
    assert.deepEqual([m.notices, m.errors, m.files, m.fields], [[null, P12FXD_MADE], [null], [null], OPENED([P12FXD2_LINK], 'Contract')],
        'REGRESSION: a document made unread left its name and links for the next file');
    // A new version that may have been made: the red box, the file and note let go.
    const vMaybe = (await p12fxdThrown({ kind: 'version', record: P11_PAGE() })).e;
    const v = await p12fxdRail({ isVersion: true, version: async () => { throw vMaybe; }, ctx: { mode: 'version', documentId: 'doc_1', links: [P12FXD2_LINK], category: 'Proposal' } });
    assert.deepEqual([v.errors, v.notices, v.files, v.fields], [[null, `${P12FXD2_VMAYBE}: The server returned 502.`], [null], [null], OPENED([], 'Contract')]);
    // The server's own refusal: the red box, the file and every field kept for another press.
    const own = (await p12fxdThrown({ record: onceOf(403, { error: 'Forbidden' }) })).e;
    const o = await p12fxdRail({ create: async () => { throw own; } });
    assert.deepEqual([o.errors, o.files, o.fields], [[null, 'The document was not saved — Forbidden'], [], []]);
});

// The rail's pickFile, extracted and run.
const p12fxd2Pick = (picked, { name = '', invalid = null } = {}) => {
    const did = { errors: [], notices: [], files: [], names: [] };
    p12aFn(P12FXD_RAIL, '    const pickFile = (f) => {', '\n    };', '\n    };',
        ['validateFile', 'setError', 'setNotice', 'setFile', 'isVersion', 'name', 'setName', 'baseName'], 'pickFile')(
        () => invalid, (v) => did.errors.push(v), (v) => did.notices.push(v), (v) => did.files.push(v), false, name, (v) => did.names.push(v),
        (n) => n.replace(/\.[^.]+$/, ''))(picked);
    return did;
};

test('Part 12 fixes, round 2 (D2): the upload rail — picking a file clears the last notice; the name the rail went back to is filled from the new file — RUN', () => {
    const FILE = { name: 'Invoice 17.pdf', size: 10 };
    const p = p12fxd2Pick(FILE);
    assert.deepEqual([p.errors, p.notices, p.files, p.names], [[null], [null], [FILE], ['Invoice 17']],
        'REGRESSION: the last upload\'s notice kept above the next file');
    // An invalid file: its words, nothing chosen.
    const bad = p12fxd2Pick({ name: 'x.exe', size: 10 }, { invalid: 'Unsupported file type: .exe' });
    assert.deepEqual([bad.errors, bad.files], [['Unsupported file type: .exe'], []]);
});

test('Part 12 fixes, round 2 (D2): a record\'s Documents — a file that may have been made goes on to the next and is said in the red box by its name, before a failure that stopped the batch; the made notice names only the files made — RUN', async () => {
    const DOC = { id: 'doc_y' };
    const maybe = (await p12fxdThrown({ record: onceOf(500, { error: 'Internal server error', requestId: 'r1' }) })).e;
    const page = (await p12fxdThrown({ record: P11_PAGE() })).e;
    const made = (await p12fxdThrown({ record: P11_UNREADABLE() })).e;
    const own = (await p12fxdThrown({ record: onceOf(403, { error: 'Forbidden' }) })).e;
    const one = await p12fxdAttach({ 'a.pdf': maybe, 'b.pdf': DOC });
    assert.deepEqual([one.sent, one.errors.at(-1), one.notices], [['a.pdf', 'b.pdf'], `a.pdf: ${P12FXD2_MAYBE}: Internal server error (ref r1)`, [null]],
        'REGRESSION: the batch stopped at a file that may have been made, or said it "not saved" — the drop asked again wrote it twice');
    // Two that may have been made: each on its own line.
    const two = await p12fxdAttach({ 'a.pdf': maybe, 'b.pdf': page, 'c.pdf': DOC });
    assert.deepEqual([two.sent.length, two.errors.at(-1)], [3, `a.pdf: ${P12FXD2_MAYBE}: Internal server error (ref r1)\nb.pdf: ${P12FXD2_MAYBE}: The server returned 502.`]);
    // Made, maybe and a stop: the made notice names only the file made; the maybe line before the stop's words.
    const mixed = await p12fxdAttach({ 'a.pdf': maybe, 'b.pdf': made, 'c.pdf': own, 'd.pdf': DOC });
    // Moved in §0.249 (review fixes, round 3, D3): the stop names the file it stopped at, and the files never sent.
    assert.deepEqual([mixed.sent, mixed.notices.at(-1), mixed.errors.at(-1)], [['a.pdf', 'b.pdf', 'c.pdf'], `b.pdf: ${P12FXD_MADE}`,
        `a.pdf: ${P12FXD2_MAYBE}: Internal server error (ref r1)\nc.pdf: The document was not saved — Forbidden\nNot sent: d.pdf — drop them again`],
        'REGRESSION: the stop\'s words lost under the maybe line, or a file that may have been made said as made');
    const many = await p12fxdAttach({ 'a.pdf': made, 'b.pdf': maybe, 'c.pdf': made });
    assert.equal(many.notices.at(-1), 'a.pdf, c.pdf: The files were uploaded. Their answers could not be read — reload the page to see them.');
    // None that may have been made: the red box untouched past its clear.
    const ok = await p12fxdAttach({ 'a.pdf': made, 'b.pdf': DOC });
    assert.deepEqual(ok.errors, [null]);
});

test('Part 12 fixes, round 2 (D2): WIRING — the record\'s refusal read in its ok check and judged by recordRefusal; the rail goes back to its seed; the red box keeps its lines', () => {
    const s = code(read('src/utils/documentsStorage.js'));
    assert.ok(s.includes("const own = res.status >= 400 && res.status < 500 && !!body && typeof body.error === 'string' && !!body.error.trim();"));
    assert.ok(s.includes('return own ? new Error(stepped(step, why)) : landedMaybe(maybe, why);'));
    assert.equal(count(s, 'throw recordRefusal(res, body, STEP_RECORD, MAYBE_RECORD);') + count(s, 'throw recordRefusal(res, body, STEP_VERSION, MAYBE_VERSION);'), 2);
    assert.ok(s.includes('  }), askedOrg, MAYBE_RECORD, true);') && s.includes('  }), askedOrg, MAYBE_VERSION, true);'), 'REGRESSION: a record\'s request that threw said "not saved"');
    const rail = code(read(P12FXD_RAIL));
    const opened = between(rail, '    const opened = () => {', '\n    };');
    order(opened, "setFile(null); setName(''); setNote(''); setVisibility('team'); setSharedWith([]);",
        'setLinks(!isVersion && Array.isArray(ctx.links) ? ctx.links : []);', "setCategory(!isVersion && ctx.category ? ctx.category : 'Contract');");
    // The seed it goes back to is the one the rail opens with.
    order(between(rail, '    useEffect(() => {', '}, [showUploadRail]);'), 'setLinks(Array.isArray(ctx.links) ? ctx.links : []);', 'if (ctx.category) setCategory(ctx.category);');
    assert.ok(between(rail, '    const pickFile = (f) => {', '\n    };').includes('setError(null); setNotice(null);'), 'REGRESSION: a pick keeps the last notice');
    const record = code(read(P12FXD_RECORD));
    assert.ok(record.includes("fontSize: 12, color: T.danger, whiteSpace: 'pre-line' }}>{error}</div>"), 'REGRESSION: the maybe lines run together');
});

// ── Part 12 — the review's fixes, round 2 (I2 — Invitation import) ──
// Residuals I0-I4. A request answered 201 with an answer that cannot be read left the import's own duplicate check
// (CsvImportModal's userConflicts over settings.users) blind to who was sent — a second import of the same file sent each
// a second email. The roster is now read again after the last request (ok-first, org-checked after each await) and set,
// as the Invite page's send does; only a read that fails says to reload, in the house words with the server's ref. The
// receipt claims only what a 201 says (users.mjs answers 201 when any address was invited): "up to N … some may have
// been refused", one alone sent; the Results draw a tile for them, so the tiles add up to everyone attempted; the
// `attempted` field's comment holds the invariant.
const P12FXI2_ROSTER = Object.freeze([{ id: 'usr_a', email: 'p0@x.test', name: 'p0' }, { id: 'usr_b', email: 'p1@x.test', name: 'p1' }]);
const P12FXI2_HELD = Object.freeze([{ id: 'usr_old', email: 'old@x.test', name: 'old' }]);
// The handler from source: `posts` one answer per request, `roster` the GET's answer (a thrown Error throws); `switchAt`
// 'get' switches the org as the roster read goes out, 'json' as its body is read.
const p12fxI2Import = async ({ invites, posts, roster, switchAt = null, teamsSave = { ok: true } }) => {
    const { emptyReceipt, unreadOnRoster } = await import('../src/utils/importReceipt.js');
    const { teamsWithMembers } = await import('../src/utils/teamMembership.js');
    const s = code(read(P12FXI_LAYER));
    const START = '                    onImportUsers={async (invites) => {';
    const fn = between(s, START, '\n                    }}\n                />').slice(START.length);
    const org = { now: 'org_a' };
    const did = { posts: 0, reads: [], teams: null };
    const settingsState = stateOf({ users: P12FXI2_HELD });
    let n = 0;
    const dbFetch = async (url, opts = {}) => {
        if (opts.method === 'POST') { did.posts++; const a = posts[n++]; if (a instanceof Error) throw a; return a; }
        did.reads.push([url, opts.method || 'GET']);
        if (switchAt === 'get') org.now = 'org_b';
        if (roster instanceof Error) throw roster;
        if (switchAt === 'json') { const json = roster.json; roster.json = async () => { org.now = 'org_b'; return json(); }; }
        return roster;
    };
    const addToSettingsList = async (key, update) => { did.teams = update(P12FXI_TEAMS).teams; return teamsSave; };
    const run = new Function('requestOrg', 'stillOrg', 'stopped', 'emptyReceipt', 'dbFetch', 'failureWords', 'refusalWords', 'readRefusal', 'setSettings', 'onProgress',
        'addToSettingsList', 'teamsWithMembers', 'settings', 'TEAMS_CHANGED_TWICE', 'unreadOnRoster', `return async (invites) => {${fn}\n};`)(
        () => 'org_a', (o) => o === org.now, () => 'stopped', emptyReceipt, dbFetch, failureWords, refusalWords, readRefusal, settingsState.set, () => {},
        addToSettingsList, teamsWithMembers, { teams: P12FXI_TEAMS, revs: {} }, 'twice', unreadOnRoster);
    const out = await run(invites);
    return { out, ...did, users: settingsState.value.users };
};
// Moved in round 3 (I3): of the three that named a team, only p0 is on the roster read again — one person, "they".
// Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
const P12FXI2_TEAM_READ = "1 whose answer could not be read named a team — check on the Teams page that they are on its list.";

test('Part 12 fix I2: the invitation import — after a request answered unread the roster is read again and set, so the import\'s duplicate check knows who was sent; no "reload" — RUN', async () => {
    const { userConflicts } = await import('../src/utils/userImport.js');
    const r = await p12fxI2Import({ invites: p12fxIPeople(12, 4), roster: onceOf(200, { users: P12FXI2_ROSTER }), posts: [
        p12fxIUnreadable(), onceOf(201, { invited: [{ id: 'usr_10', email: 'p10@x.test', teamId: 't1' }], errors: [{ email: 'p11@x.test', error: 'x' }] }),
    ] });
    assert.deepEqual(r.reads, [['/.netlify/functions/users', 'GET']], 'REGRESSION: the roster not read again after a request answered unread');
    assert.deepEqual(r.users, P12FXI2_ROSTER, 'REGRESSION: the duplicate check left blind to who was sent');
    // Moved in round 3 (I3): p0 and p1 on the roster read again are sent, p2-p9 not on it not sent — exact counts.
    // Moved in round 4 (I4): p0 and p1 are on the roster — invited by this import or before it (two of one request: not
    // proven); p2-p9 not on it, not sent.
    assert.deepEqual([r.out.receipt.unread, r.out.receipt.onRoster, r.out.receipt.created, r.out.receipt.failed, r.out.receipt.error], [2, 2, 1, 9, null]);
    assert.equal(r.out.warning, P12FXI2_TEAM_READ, 'REGRESSION: "reload" said over a roster read again');
    // The import's own duplicate check, over the roster set here: the same file a second time skips the ones sent.
    const again = [{ email: 'p0@x.test' }, { email: 'p1@x.test' }, { email: 'p2@x.test' }];
    assert.deepEqual(userConflicts(again, { roster: r.users }).map(c => c.incomingIndex), [0, 1], 'a second import sends them no second email');
    assert.deepEqual(userConflicts(again, { roster: P12FXI2_HELD }), [], 'over the roster as held, every one would be sent again');
    // A run stopped by a later request still reads the roster again for the ones sent unread before it.
    const stop = await p12fxI2Import({ invites: p12fxIPeople(12), roster: onceOf(200, { users: P12FXI2_ROSTER }),
        posts: [p12fxIUnreadable(), onceOf(500, { error: 'Internal server error', requestId: 'r2' })] });
    // Moved in round 3 (I3): the roster read again counts the first request exactly — 2 sent, 8 not, then the 2 never sent.
    // Moved in round 4 (I4): the 2 on the roster are on it — invited by this import or before it — not proven sent.
    assert.deepEqual([stop.out.receipt.unread, stop.out.receipt.onRoster, stop.out.receipt.created, stop.out.receipt.failed, stop.out.receipt.error, stop.reads.length, stop.users],
        [2, 2, 0, 10, 'Sending stopped: Internal server error (ref r2)', 1, P12FXI2_ROSTER]);
    // No request answered unread: no roster read; the rows the server named join the roster as before.
    const read2 = await p12fxI2Import({ invites: p12fxIPeople(2), roster: onceOf(200, { users: [] }),
        posts: [onceOf(201, { invited: [{ id: 'usr_x', email: 'p0@x.test' }, { id: 'usr_y', email: 'p1@x.test' }], errors: [] })] });
    assert.deepEqual([read2.reads, read2.users.map(u => u.id), read2.out.warning], [[], ['usr_old', 'usr_x', 'usr_y'], null]);
});

test('Part 12 fix I2: a roster read again that fails says to reload, in the house words with the server\'s ref — the roster as held, the ones sent never failed — RUN', async () => {
    const cases = [...p12bRefused(), [P11_UNREADABLE(), 'Its answer could not be read.'], [onceOf(200, {}), 'Its answer could not be read.'],
        [onceOf(200, { users: 'x' }), 'Its answer could not be read.']];
    for (const [roster, words] of cases) {
        const r = await p12fxI2Import({ invites: p12fxIPeople(10, 4), posts: [p12fxIUnreadable()], roster });
        assert.equal(r.out.warning, `The roster could not be read again — reload the page to see the invitations sent: ${words} `
            // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
            + "3 whose answers could not be read named a team — reload the page, then check on the Teams page that they are on their teams' lists.", `REGRESSION: ${words}`);
        assert.deepEqual(r.users, P12FXI2_HELD, 'REGRESSION: a failed read drawn as the roster');
        assert.deepEqual([r.out.receipt.unread, r.out.receipt.failed, r.out.receipt.error], [10, 0, null], 'a failed roster read fails no invitation');
    }
    // One alone, its team save refused too: each sentence said, in the singular, after the save's own.
    const one = await p12fxI2Import({ invites: p12fxIPeople(1, 1), posts: [p12fxIUnreadable()],
        roster: onceOf(500, { error: 'Internal server error', requestId: 'r1' }), teamsSave: { ok: false, error: 'Forbidden' } });
    assert.equal(one.out.warning, 'The invitations went out, but the team list was not updated — Forbidden '
        + 'The roster could not be read again — reload the page to see the invitation sent: Internal server error (ref r1) '
        // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
        + "1 whose answer could not be read named a team — reload the page, then check on the Teams page that they are on its list.");
    // None named a team: the roster sentence alone.
    const none = await p12fxI2Import({ invites: p12fxIPeople(3), posts: [p12fxIUnreadable()], roster: UNSENT() });
    assert.equal(none.out.warning, 'The roster could not be read again — reload the page to see the invitations sent: The server could not be reached.');
});

test('Part 12 fix I2: the roster read again after an org switch — nothing set, no team list saved, the run stopped — RUN', async () => {
    for (const [switchAt, roster] of [['get', onceOf(200, { users: P12FXI2_ROSTER })], ['get', onceOf(500, { error: 'x', requestId: 'r1' })], ['get', UNSENT()],
        ['json', onceOf(200, { users: P12FXI2_ROSTER })]]) {
        const r = await p12fxI2Import({ invites: p12fxIPeople(10, 4), posts: [p12fxIUnreadable()], roster, switchAt });
        assert.deepEqual([r.out, r.users, r.teams], ['stopped', P12FXI2_HELD, null], `REGRESSION: the last org's roster set, or a team list saved, after a switch (${switchAt})`);
    }
});

test('Part 12 fix I2: the receipt claims only what a 201 says — "up to N … some may have been refused", one alone sent; never "reload" — RUN', async () => {
    const { emptyReceipt, describeReceipt } = await import('../src/utils/importReceipt.js');
    const lit = code(read(P12FXI_MODAL)).match(/describeReceipt\(r, 'invitation', (\{[^}]*\})\)/);
    assert.ok(lit, 'the Results\' invitation words');
    const words = new Function(`return ${lit[1]};`)();
    const say = (o) => describeReceipt({ ...emptyReceipt(), ...o }, 'invitation', words);
    assert.equal(say({ attempted: 10, unread: 10 }), 'Up to 10 invitations sent — the answer could not be read; some may have been refused.',
        'REGRESSION: every one of an unread request claimed as sent');
    assert.equal(say({ attempted: 12, created: 1, failed: 1, unread: 10 }), '1 invitation sent, up to 10 more sent — the answer could not be read; some may have been refused. 1 not sent.');
    assert.equal(say({ attempted: 1, unread: 1 }), '1 invitation sent — the answer could not be read.', 'one alone: a 201 says it was sent');
    assert.equal(say({ attempted: 2, created: 1, unread: 1 }), '1 invitation sent, 1 more sent — the answer could not be read.');
    assert.equal(describeReceipt({ ...emptyReceipt(), attempted: 3, unread: 3 }, 'record'), 'Up to 3 records sent — the answer could not be read; some may have been refused.');
    for (const o of [{ unread: 1 }, { unread: 10 }, { created: 1, unread: 10 }]) assert.ok(!/reload|them\b/.test(say(o)), 'the import reads the roster again itself');
});

// The Results' tiles, taken from CsvImportModal.jsx and built over a receipt.
const p12fxI2Tiles = async (r) => {
    const { isClean } = await import('../src/utils/importReceipt.js');
    const START = '                    const tiles = [';
    const body = between(code(read(P12FXI_MODAL)), START, '].filter(t => t.show);').slice(START.length);
    return new Function('r', 'isUsers', 'clean', 'T', `return [${body}].filter(t => t.show);`)(r, true, isClean(r), T);
};

test('Part 12 fix I2: the Results draw a tile for the ones sent unread — the tiles account for everyone attempted — RUN', async () => {
    const { emptyReceipt } = await import('../src/utils/importReceipt.js');
    const r = { ...emptyReceipt(), attempted: 12, created: 1, failed: 1, unread: 10 };
    const tiles = await p12fxI2Tiles(r);
    // Moved in round 3 (I3): the tile says what a 201 proves — sent or refused, "up to" (its upTo flag).
    assert.deepEqual(tiles.map(t => [t.label, t.n]), [['invited', 1], ['failed', 1], ['sent or refused — answer unread', 10]], 'REGRESSION: 2 of 12 accounted for');
    assert.equal(tiles.reduce((a, t) => a + t.n, 0), r.attempted);
    assert.equal(tiles[2].color, T.warn);
    assert.deepEqual((await p12fxI2Tiles({ ...emptyReceipt(), attempted: 3, unread: 3 })).map(t => [t.label, t.n]), [['sent or refused — answer unread', 3]]);
    assert.ok(!(await p12fxI2Tiles({ ...emptyReceipt(), attempted: 2, created: 2 })).some(t => t.label.includes('answer unread')), 'no tile with none unread');
});

test('Part 12 fix I2: WIRING — the roster read again after the last request, ok-first, org-checked after each await, before the team save; the duplicate check reads settings.users; the field comment holds unread', () => {
    const l = code(read(P12FXI_LAYER));
    const h = between(l, 'onImportUsers={async (invites) => {', 'return { receipt, refusals, warning };');
    order(h, 'for (let i = 0; i < invites.length; i += INVITES_PER_REQUEST) {', 'if (receipt.unread) {', "const rosterRes = await dbFetch('/.netlify/functions/users');",
        'if (!rosterRes.ok) throw new Error(await readRefusal(rosterRes));', 'const ud = await rosterRes.json();', 'if (!stillOrg(askedOrg)) return stopped();',
        "if (!Array.isArray(ud?.users)) throw new Error('Its answer could not be read.');", 'setSettings(prev => ({ ...prev, users: ud.users }));',
        '} catch (e) { rosterWhy = failureWords(e); }', 'if (!stillOrg(askedOrg)) return stopped();', "const added = await addToSettingsList('teams'");
    assert.equal(count(h, "dbFetch('/.netlify/functions/users')"), 1, 'one roster read');
    assert.ok(l.includes('users={settings.users || []}'), 'the duplicate check reads the roster set here');
    const rc = read('src/utils/importReceipt.js');
    assert.ok(rc.includes('    attempted:   0,      // created + updated + failed + unread\n'), 'REGRESSION: the field comment leaves out unread');
    assert.ok(rc.includes('//     attempted === created + updated + failed + unread'));
});

// ── Part 12 — the review's fixes, round 2 (C2 — Calendar) ──
// The review's residuals C0-C2 (state §0.249). C0: a Disconnect that landed and whose re-read then failed was drawn
// "Connected · syncing", ON and Reconnect — the failed read no longer writes calendarConnected, so the connection just
// deleted stood. A landed Disconnect now sets calendarConnected false, clears its events and marks calDisconnected
// before the re-read: the tab says "Disconnected" and the read's words. C1: a read in flight with no connection known —
// the first, or a Try again after one that failed — drew "Connect your calendar…", "Calendar not connected", OFF and
// Connect; Home, Tasks and the panel now say they are checking. C2: a known connection whose latest read failed said
// "Connected · syncing" in green; it says "Connected — the latest read failed", not in green.
const p12fxC2Ev = { id: 'ev_1', summary: 'Acme call' };
// The whole Disconnect, run from the source: the header's disconnectCalendar over App's own fetchCalendarEvents, one
// shared state, then the panel drawn from it — the same builds (and parameter lists) as Part 12b's helpers.
const p12fxC2Flow = async ({ deleteAnswer, readAnswer, switchOrg = false }) => {
    // Moved in §0.249 (review fixes, round 3): App's read takes its sequence and the read flag, the header's handler
    // dropCalendarReads and calendarLoading — one sequence shared, as App's is; every assertion below is unchanged.
    const st = { connected: true, events: [p12fxC2Ev], error: null, loading: false, disconnected: false, conn: { id: 'cc_1' }, said: [], sent: [], read: true };
    const org = { now: 'org_a' };
    const gen = { current: 0 };
    const fetchCal = p12aFn('src/App.jsx', '    const fetchCalendarEvents = async () => {', '\n    };', '\n    };',
        ['requestOrg', 'stillOrg', 'setCalendarLoading', 'setCalendarError', 'waitForToken', 'dbFetch', 'readRefusal', 'failureWords', 'setCalendarConnected', 'setCalendarEvents',
            'calendarReadGen', 'setCalendarRead'], 'fetchCalendarEvents')(
        () => 'org_a', (o) => o === org.now, (v) => { st.loading = v; }, (v) => { st.error = v; }, async () => {}, p10Fetch(st, readAnswer, org, false), readRefusal, failureWords,
        (v) => { st.connected = v; }, (v) => { st.events = v; }, gen, (v) => { st.read = v; });
    const disconnect = p12aFn(P12B_HEADER, '    const disconnectCalendar = async () => {', '\n    };', '\n    };',
        ['calConn', 'requestOrg', 'stillOrg', 'setDisconnecting', 'setCalActionError', 'dbFetch', 'readRefusal', 'failureWords', 'setCalConn', 'fetchCalendarEvents',
            'setCalendarConnected', 'setCalendarEvents', 'setCalDisconnected', 'dropCalendarReads', 'calendarLoading'], 'disconnectCalendar')(
        st.conn, () => 'org_a', (o) => o === org.now, () => {}, (v) => { if (v) st.said.push(v); }, p10Fetch(st, deleteAnswer, org, switchOrg), readRefusal, failureWords,
        (v) => { st.conn = v; }, fetchCal, (v) => { st.connected = v; }, (v) => { st.events = v; }, (v) => { st.disconnected = v; }, () => { gen.current += 1; }, false);
    await disconnect();
    const panel = p12fxCPanel({ loading: st.loading, error: st.error, connected: st.connected, conn: st.conn, disconnected: st.disconnected, read: st.read });
    return { ...st, panel };
};

test('Part 12 fix C2: a Disconnect that landed sets calendarConnected false, its events and calDisconnected before the re-read; refused or after an org switch, none of them — RUN', async () => {
    const landed = await p12bHeaderDisconnect({ answer: onceOf(200, { ok: true }) });
    assert.deepEqual([landed.connected, landed.events, landed.disconnected], [[false], [[]], [true]],
        'REGRESSION: a landed Disconnect left calendarConnected to the re-read — a failed one kept "Connected · syncing"');
    assert.deepEqual(landed.steps, ['connected:false', 'events', 'disconnected:true', 'refetch'], 'known at once, before the re-read');
    for (const [answer, words] of p12bRefused()) {
        const r = await p12bHeaderDisconnect({ answer });
        assert.deepEqual([r.said, r.connected, r.events, r.disconnected], [[`Not disconnected — ${words}`], [], [], []], `REGRESSION: a refused Disconnect taken as landed — ${words}`);
    }
    for (const answer of [onceOf(200, { ok: true }), UNSENT()]) {
        const r = await p12bHeaderDisconnect({ answer, switchOrg: true });
        assert.deepEqual([r.connected, r.events, r.disconnected], [[], [], []], 'REGRESSION: the last org\'s Disconnect written over the new org\'s calendar');
    }
});

test('Part 12 fix C2: a landed Disconnect whose re-read fails says "Disconnected" and the read\'s words — never "Connected · syncing", ON or Reconnect — RUN', async () => {
    for (const [readAnswer, words] of [...p12bRefused(), [P11_UNREADABLE(), 'Its answer could not be read.']]) {
        const r = await p12fxC2Flow({ deleteAnswer: onceOf(200, { ok: true }), readAnswer });
        assert.deepEqual([r.said, r.connected, r.events, r.disconnected, r.error], [[], false, [], true, `The calendar could not be read — ${words}`], `REGRESSION: ${words}`);
        assert.deepEqual(r.panel, { status: 'Disconnected', pill: 'OFF', connect: true, refresh: false, count: false },
            `REGRESSION: the connection just deleted drawn as connected, or as "Could not be read" — ${words}`);
    }
    const reread = await p12fxC2Flow({ deleteAnswer: onceOf(200, { ok: true }), readAnswer: onceOf(200, { events: [], connected: false }) });
    assert.deepEqual([reread.connected, reread.error, reread.panel.status, reread.panel.pill], [false, null, 'Disconnected', 'OFF']);
    for (const [deleteAnswer, words] of p12bRefused()) {
        const r = await p12fxC2Flow({ deleteAnswer, readAnswer: onceOf(200, { events: [p12fxC2Ev], connected: true }) });
        assert.deepEqual([r.said, r.connected, r.events, r.disconnected, r.sent], [[`Not disconnected — ${words}`], true, [p12fxC2Ev], false, ['DELETE']], `REGRESSION: ${words}`);
    }
});

test('Part 12 fix C2: the profile panel — a read in flight with no connection known is "Checking…", "—", no Connect; a known connection whose read failed is never "syncing" nor green; "Disconnected" once one landed — RUN', () => {
    const ERR = 'The calendar could not be read — The server returned 502.';
    assert.deepEqual(p12fxCPanel({ loading: true, connected: false }),
        { status: 'Checking…', pill: '—', connect: false, refresh: true, count: false },
        'REGRESSION: OFF and "Connect Google Calendar" over a read in flight with no connection known');
    assert.deepEqual(p12fxCPanel({ loading: true, connected: true }),
        { status: 'Checking…', pill: 'ON', connect: true, refresh: true, count: true });
    const failed = p12fxCPanel({ error: ERR, connected: true, conn: { calendarEmail: 'karen@x.test' } });
    assert.deepEqual(failed, { status: 'Connected — the latest read failed', pill: 'ON', connect: true, refresh: true, count: false },
        'REGRESSION: a sync claimed over a read that just failed');
    assert.deepEqual(p12fxCPanel({ connected: false, disconnected: true }),
        { status: 'Disconnected', pill: 'OFF', connect: true, refresh: false, count: false });
    assert.deepEqual(p12fxCPanel({ loading: true, connected: false, disconnected: true }),
        { status: 'Checking…', pill: 'OFF', connect: true, refresh: false, count: false }, 'a known disconnection is not unknown');
    assert.equal(p12fxCPanel({ connected: true, disconnected: true }).status, 'Connected · syncing', 'a read that found a connection wins');

    const s = code(read(P12B_HEADER));
    const colour = new Function('calendarLoading', 'calendarError', 'calendarConnected', 'T',
        `return ${between(s, 'color: calendarLoading ? ', ' }}>').slice('color: '.length)};`);
    const TT = { inkMid: 'mid', ok: 'green', inkMuted: 'muted' };
    assert.equal(colour(false, ERR, true, TT), 'muted', 'REGRESSION: the status line green over a read that failed');
    assert.equal(colour(false, null, true, TT), 'green');
    assert.equal(colour(true, null, false, TT), 'mid');
});

test('Part 12 fix C2: the header forgets a landed Disconnect on an org switch, never with its panel — RUN', () => {
    const s = code(read(P12B_HEADER));
    const line = between(s, '    useEffect(() => { setCalDisconnected(false); }', ';\n') + ';';
    const ran = [];
    let deps = null;
    new Function('useEffect', 'setCalDisconnected', 'activeOrgId', line)((fn, d) => { deps = d; fn(); }, (v) => ran.push(v), 'org_b');
    assert.deepEqual([ran, deps], [[false], ['org_b']], 'REGRESSION: org A\'s "Disconnected" stands on org B\'s Calendar tab');
    assert.equal(count(s, 'setCalDisconnected('), 2, 'the landed Disconnect and the switch — nothing else writes it');
    // Moved in §0.249 (review fixes, round 4): the state is kept as calDisconnectedKept, drawn only for the org it was kept for.
    assert.ok(s.includes('const [calDisconnectedKept, setCalDisconnected] = useState(false);'));
    assert.ok(s.includes('const calDisconnected = calTabHere && calDisconnectedKept;'));
    assert.ok(/calendarError, fetchCalendarEvents,\s*setCalendarConnected, setCalendarEvents,/.test(s), 'the header takes App\'s setters');
});

// A strip's chain of conditions, run from the source: each branch named by its words, the first true condition wins.
const p12fxC2Chain = (region, re, labels, params) => {
    const heads = [...region.matchAll(re)];
    const named = heads.map((m, i) => {
        const text = region.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : region.length);
        const hit = Object.entries(labels).find(([, words]) => text.includes(words));
        assert.ok(hit, `a branch with none of the known words: ${text.slice(0, 80)}`);
        return [m[1] || 'true', hit[0]];
    });
    const f = new Function(...params, `return [${named.map(([c]) => `!!(${c})`).join(', ')}];`);
    return (state) => named[f(...params.map((k) => state[k])).indexOf(true)]?.[1];
};

test('Part 12 fix C2: Home\'s calendar strip — a read in flight with no connection known is "Checking your calendar…", never "Connect your calendar…" — RUN', () => {
    const home = code(read(P12FXC_HOME));
    // Moved in §0.249 (review fixes, round 3): the chain reads calendarRead too — each state below is one a read landed in
    // (calendarRead: true), so each answer stands as it was; the checking branch's text reads it.
    const strip = p12fxC2Chain(between(home, '{calendarError ? (', 'Refreshing…</span>'), /(?:^\{|\n\s*\) : )(?:([^\n?]+?) \? )?\(\n/g,
        { error: '{calendarError}', checking: 'Checking your calendar…', connect: 'Connect your calendar to see', connected: 'Calendar connected — no meetings today' },
        ['calendarError', 'calendarLoading', 'calendarConnected', 'calendarRead']);
    const E = 'The calendar could not be read — The server returned 500.';
    assert.equal(strip({ calendarLoading: true, calendarConnected: false, calendarRead: true }), 'checking', 'REGRESSION: "Connect your calendar…" over a read not yet answered');
    assert.equal(strip({ calendarLoading: true, calendarConnected: true, calendarRead: true }), 'connected', 'a refresh of a known connection keeps its strip');
    assert.equal(strip({ calendarError: E, calendarConnected: false, calendarRead: true }), 'error');
    assert.equal(strip({ calendarError: E, calendarConnected: true, calendarRead: true }), 'error');
    assert.equal(strip({ calendarConnected: false, calendarRead: true }), 'connect');
    assert.equal(strip({ calendarConnected: true, calendarRead: true }), 'connected');
    const checking = between(home, ') : !calendarConnected && (calendarLoading || !calendarRead) ? (', ') : !calendarConnected ? (');
    assert.ok(!/connectMyCalendar|Connect calendar|meeting/.test(checking), 'REGRESSION: the checking strip offers Connect or a count');
});

test('Part 12 fix C2: Tasks\' calendar rail — a read in flight with no connection known says it is checking, never "Calendar not connected" — RUN and WIRING', () => {
    const tasks = code(read(P12FXC_TASKS));
    assert.ok(/function CalendarView\(\{[^}]*\bcalendarLoading\b[^}]*\}\)/.test(tasks), 'REGRESSION: CalendarView never takes calendarLoading (module scope)');
    assert.ok(tasks.includes('calendarLoading={calendarLoading}'), 'REGRESSION: CalendarView never told a read is in flight');
    // Moved in §0.249 (review fixes, round 3): a branch's condition may be an expression (the checking one reads
    // calendarRead too), and the chain takes calendarRead — each state below one a read landed in, its answer as it was.
    const rail = p12fxC2Chain(between(tasks, '{calendarError\n', 'Calendar not connected</div>)') + 'Calendar not connected', /(?:^\{|\n\s*: )(?:([^\n?]+?)\n\s*\? )?\(/g,
        { error: '{calendarError}', synced: 'Synced', checking: 'Checking the calendar…', notConnected: 'Calendar not connected' },
        ['calendarError', 'calendarLoading', 'calendarConnected', 'calendarRead']);
    assert.equal(rail({ calendarLoading: true, calendarConnected: false, calendarRead: true }), 'checking', 'REGRESSION: "Calendar not connected" over a read not yet answered');
    assert.equal(rail({ calendarLoading: true, calendarConnected: true, calendarRead: true }), 'synced');
    assert.equal(rail({ calendarError: 'x', calendarLoading: false, calendarRead: true }), 'error');
    assert.equal(rail({ calendarConnected: false, calendarRead: true }), 'notConnected');
});

// ── Part 12 — the review's fixes, round 2 (S2 — Sales Manager) ──
// The residual the first S round left open (state §0.249): saveUser's refusal (a forecast call) said the server's words
// without their ref ("Not saved — Ann: Internal server error") and, over a page or a body with no words, its own
// lowercase "Not saved — the server returned 502. Your forecast call changes are not stored." It says the house words —
// "Not saved — <who>: " and refusalWords(res, d), the ref kept, "The server returned N." over a page — the body read
// only under the ok check, once; a 403 with no words keeps its role sentence; and an answer after an org switch says
// nothing (requestOrg before the PUT, stillOrg after the refusal's read and in the catch).
const P12FXS2_SAVE_USER = '    const saveUser = async (user, label, who = user.name) => {';
const P12FXS2_ROLE = 'Not saved — only Admins can change forecast call.';

test('Part 12 fixes, round 2 (S2): the Sales Manager\'s forecast-call save — a refusal in the house words with its ref, "The server returned N." over a page, naming the member; a 403 with no words its role sentence — RUN', async () => {
    for (const [answer, msg] of [
        // Moved in §0.249 (review fixes, last pass, F4): only the server's own refusal (a 4xx in its words) is "Not saved"; a 5xx, a page or a wordless
        // 4xx says the rep's call may have been saved, in refusalWords' words with their ref.
        [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Ann\'s forecast call may have been saved — reload the page to see whether it was: Internal server error (ref r1)'],
        [onceOf(404, { error: 'User not found' }), 'Not saved — Ann: User not found'],
        [onceOf(403, { error: 'Only an Admin can change a member who is not a Sales Rep.', requestId: 'r2' }),
            'Not saved — Ann: Only an Admin can change a member who is not a Sales Rep. (ref r2)'],
        [onceOf(409, {}), 'Ann\'s forecast call may have been saved — reload the page to see whether it was: The server returned 409.'],
        [P11_PAGE(), 'Ann\'s forecast call may have been saved — reload the page to see whether it was: The server returned 502.'],
        [onceOf(500, { error: '   ' }), 'Ann\'s forecast call may have been saved — reload the page to see whether it was: The server returned 500.'],
        [onceOf(403, {}), P12FXS2_ROLE],
        [onceOf(403, { error: ' ' }), P12FXS2_ROLE],
        [onceOf(403, new SyntaxError("Unexpected token '<'")), P12FXS2_ROLE],
    ]) {
        const r = await p12fxSSaveUser(answer);
        assert.deepEqual([r.out, r.sent, r.states], [false, ['PUT'], [{ status: 'error', msg }]],
            `REGRESSION: ${msg} — the ref dropped, or "the server returned N. Your forecast call changes are not stored."`);
        assert.doesNotMatch(r.states[0].msg, /changes are not stored|Body is unusable|Unexpected token|undefined/);
    }
    // Landed is landed: the body is never read, an unreadable one included — never a failure that invites a second save.
    for (const answer of [onceOf(200, {}), P11_UNREADABLE()]) {
        const r = await p12fxSSaveUser(answer);
        assert.deepEqual([r.out, r.states], [true, []], 'a landed save says nothing here');
    }
});

test('Part 12 fixes, round 2 (S2): the Sales Manager\'s forecast-call save — an answer after an org switch says nothing, a refusal and a request that never left alike — RUN', async () => {
    for (const answer of [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), P11_PAGE(), onceOf(403, {}), UNSENT()]) {
        const r = await p12fxSSaveUser(answer, true);
        assert.deepEqual([r.out, r.sent, r.states], [false, ['PUT'], []], 'REGRESSION: the other org\'s refusal said on this org\'s screen');
    }
    // A landed save hands true back: updateRepField's own org check stops the copy (pinned in member-links T6).
    const landed = await p12fxSSaveUser(onceOf(200, {}), true);
    assert.deepEqual([landed.out, landed.states], [true, []]);
});

test('Part 12 fixes, round 2 (S2): WIRING — saveUser takes its org, reads a refusal\'s body once under the ok check, says refusalWords\' words; no escaped dash, no "changes are not stored"', () => {
    const fn = between(code(read(P12FXS_SMT)), P12FXS2_SAVE_USER, '\n    };');
    order(fn, 'const askedOrg = requestOrg();', "await dbFetch('/.netlify/functions/users', {", 'if (!res.ok) {',
        'const d = await res.json().catch(() => null);', 'if (!stillOrg(askedOrg)) return false;',
        // Moved in §0.249 (review fixes, last pass, F4): the 403's role sentence, the server's own refusal, then the maybe.
        "setSaveState({ status: 'error', msg: res.status === 403 && !ownRefusal(res.status, d)",
        '? `Not saved — only Admins can change ${label}.`', ': ownRefusal(res.status, d)', "? `Not saved — ${who || 'a member'}: ${refusalWords(res, d)}`",
        ": `${who || 'A member'}'s ${label} may have been saved — reload the page to see whether it was: ${refusalWords(res, d)}` });",
        'return false;', 'return true;', '} catch (err) {', "console.error('[SalesManagerTab] save ' + label, err);",
        'if (!stillOrg(askedOrg)) return false;', "setSaveState({ status: 'error', msg: `Not saved — ${failureWords(err)}` });");
    assert.equal(count(fn, 'res.json('), 1, 'one read of the body, the refusal\'s');
    assert.equal(count(fn, 'if (!stillOrg(askedOrg)) return false;'), 2, 'after the refusal\'s read and in the catch');
    assert.ok(!/changes are not stored|the server returned \$\{res\.status\}|d\.error\}/.test(fn), 'REGRESSION: saveUser\'s own words for a refusal');
    // The dash is the character, never its escape (a backslash and "u2014" \u2014 built here so no escape is typed).
    assert.ok(!fn.includes(`${String.fromCharCode(92)}u2014`), 'an escaped dash in saveUser');
});

// ── Part 12 — the review's fixes, round 2 (L2 — Leads and Settings load) ──
// The residuals the first L round left open (state §0.249). [L0] A failed claim-requests read was still drawn as "no
// request" on a Sales Rep's path: requestsError reached only the managers' Assignment Requests panel, so Triage's row
// and the Cockpit read the empty list as none — "Request", "Request this lead", "Not yet assigned", "Request assignment"
// — over a request already filed, nothing said. myRequestOf reads the list with its failure: over an unread list a rep is
// offered neither Request nor Cancel, and Triage's rail and the Cockpit say the read's words. [L2] The Settings load's
// words reached the member only through the one-slot toast ("Settings did not load (Internal server error (ref r1)) —
// …"); the Settings screen said "did not load" alone. It says the words, kept until a load lands, and the toast says
// "Settings did not load — <words>." [L3] The lead import threw the words alone after earlier chunks landed: the modal
// said "Import failed: …", stayed on Preview, and a second Import re-sent the leads that had landed. It ends on the
// receipt the other three importers do: the Results say how many were saved, in describeReceipt's words, with no Import.
const P12FXL2_LEADS = 'src/Tabs/LeadsTab.jsx';
const P12FXL2_LAYER = 'src/components/layout/ModalLayer.jsx';
const P12FXL2_MODAL = 'src/components/modals/LeadImportModal.jsx';
const { receiptFromInsert: p12fxL2Insert, isClean: p12fxL2Clean, ImportError: P12FXL2_IMPORT_ERROR, receiptFromError: p12fxL2FromError,
    describeReceipt: p12fxL2Describe, describeOwners: p12fxL2Owners } = await import('../src/utils/importReceipt.js');
const P12FXL2_PENDING_REQ = Object.freeze([{ id: 'lcr_1', leadId: 'l1', status: 'pending' }]);
const P12FXL2_UNREAD_NEXT = 'Your requests could not be read — reload the page to request this lead';
const p12fxL2MyRequestOf = () => new Function(`${between(code(read(P12FXL2_LEADS)), 'const myRequestOf = ', '\n\n')}\nreturn myRequestOf;`)();
// CockpitDetail's request state and next action, extracted and run over a rep's, a manager's and a reader's views.
const p12fxL2Cockpit = ({ lead = { id: 'l1', status: 'New', assignee: null }, canAssign = false, canEdit = true, leadRequests = [], requestsError = '', requestsLanded = true } = {}) => {
    const block = between(between(code(read(P12FXL2_LEADS)), 'const CockpitDetail = (', 'const CockpitView'), '    const mine = canAssign ? ', '\n\n    const timeline');
    return new Function('lead', 'canAssign', 'canEdit', 'leadRequests', 'requestsError', 'requestsLanded', 'myRequestOf',
        `${block}\nreturn { mine, myPending, requestsUnread, requestsChecking, nextAction };`)(lead, canAssign, canEdit, leadRequests, requestsError, requestsLanded, p12fxL2MyRequestOf());
};

test('Part 12 fixes, round 2 (L2): a rep\'s request on a lead — over a list that did not load it is unread, never "no request", whatever the empty list holds; read, the pending request or none — RUN', () => {
    const myRequestOf = p12fxL2MyRequestOf();
    for (const words of ['Internal server error (ref r1)', 'The server returned 502.', 'The server could not be reached.', 'Its answer could not be read.']) {
        for (const landed of [false, true]) {   // moved in round 3 (L3): the landed flag; a failed read is unread either way
            assert.deepEqual(myRequestOf([], words, landed, 'l1'), { unread: true, loading: false, pending: null }, `REGRESSION: ${words} — a failed read drawn as no request`);
            assert.deepEqual(myRequestOf(P12FXL2_PENDING_REQ, words, landed, 'l1'), { unread: true, loading: false, pending: null }, 'a list held from before is not read as this one');
        }
    }
    assert.deepEqual(myRequestOf(P12FXL2_PENDING_REQ, '', true, 'l1'), { unread: false, loading: false, pending: P12FXL2_PENDING_REQ[0] });
    assert.deepEqual(myRequestOf(P12FXL2_PENDING_REQ, '', true, 'l2'), { unread: false, loading: false, pending: null });
    assert.deepEqual(myRequestOf([{ id: 'lcr_2', leadId: 'l1', status: 'denied' }], '', true, 'l1'), { unread: false, loading: false, pending: null });
    assert.deepEqual(myRequestOf(null, '', true, 'l1'), { unread: false, loading: false, pending: null });
});

test('Part 12 fixes, round 2 (L2): the Cockpit over a requests list that did not load — a rep is told, offered neither Request nor Cancel; a manager and a reader as before — RUN', () => {
    const err = 'Internal server error (ref r1)';
    const rep = p12fxL2Cockpit({ requestsError: err, leadRequests: P12FXL2_PENDING_REQ });
    assert.deepEqual([rep.requestsUnread, rep.myPending, rep.nextAction], [true, null, P12FXL2_UNREAD_NEXT],
        'REGRESSION: "Request this lead" (or "Requested") over a list that did not load');
    const repRead = p12fxL2Cockpit({ leadRequests: P12FXL2_PENDING_REQ });
    assert.deepEqual([repRead.requestsUnread, repRead.myPending, repRead.nextAction], [false, P12FXL2_PENDING_REQ[0], 'Requested — awaiting approval']);
    assert.equal(p12fxL2Cockpit().nextAction, 'Request this lead', 'read and empty: no request');
    const mgr = p12fxL2Cockpit({ canAssign: true, requestsError: err });
    assert.deepEqual([mgr.requestsUnread, mgr.myPending, mgr.nextAction], [false, null, 'Assign to a rep'], 'a manager assigns; the panel says the read');
    const reader = p12fxL2Cockpit({ canEdit: false, requestsError: err });
    assert.deepEqual([reader.requestsUnread, reader.nextAction], [false, 'Waiting to be assigned'], 'a reader is offered no request either way');
    const owned = p12fxL2Cockpit({ lead: { id: 'l1', status: 'Working', assignee: 'Karen' }, requestsError: err });
    assert.equal(owned.nextAction, 'Check in — keep the ball moving', 'an owned lead\'s next action is not a request');
});

test('Part 12 fixes, round 2 (L2): WIRING — a rep\'s Triage and Cockpit say a failed requests read and offer no Request or Cancel over it', () => {
    const s = code(read(P12FXL2_LEADS));
    const unread = between(s, 'const RequestsUnread = ({ words }) => (', '\n);');
    assert.ok(unread.includes('Your requests could not be read — {words}</div>'), 'REGRESSION: the rail drops the read\'s words');
    assert.ok(unread.includes('Request and Cancel are off until they load. Reload the page to try again.'));
    const triage = between(s, 'const TriageView = (', 'const CockpitListRow');
    assert.ok(triage.includes('{!canDistribute && canEdit && requestsError && <RequestsUnread words={requestsError}/>}'),
        'REGRESSION: a rep\'s rail never says the read failed (the panel is the managers\')');
    const row = between(triage, ') : (() => {\n                                            const mine = ', '})()}');
    order(row, 'myRequestOf(leadRequests, requestsError, requestsLanded, l.id);', 'if (mine.unread) return l.assignee ? <LeadAssignee name={l.assignee}/>',
        ': <span title={`Your requests could not be read — ${requestsError}`}', 'Requests not read</span>;', 'const myPending = mine.pending;',
        "label={myPending ? '✓ Requested' : 'Request'}");
    const detail = between(s, 'const CockpitDetail = (', 'const CockpitView');
    assert.ok(detail.includes('canEdit, canAssign, leadRequests, requestsError, requestLead, cancelRequest }) => {'));
    assert.ok(detail.includes("{canEdit && !((requestsUnread || requestsChecking) && lead.status === 'New' && !lead.assignee) && <button onClick={e => {"),
        'REGRESSION: the next action\'s Request / Cancel offered over a list that did not load');
    assert.ok(detail.includes("color: requestsUnread ? T.danger : T.inkMid, fontFamily:T.sans, overflowWrap:'anywhere' }}>"));
    assert.ok(detail.includes("{canAssign ? 'Not yet assigned' : requestsUnread ? `Your requests could not be read — ${requestsError}` : requestsChecking ? 'Checking requests…' : myPending ?"),
        'REGRESSION: "Not yet assigned" over a list that did not load, the read\'s words unsaid');
    order(detail, ') : !canEdit ? null : myPending ? (', 'Cancel request</button>', ') : (requestsUnread || requestsChecking) ? null : (', 'Request assignment</button>');
    assert.ok(between(s, 'const CockpitView = (', '=> {').includes('leadRequests, requestsError, requestLead'));
    assert.ok(s.includes('leadRequests={leadRequests} requestsError={requestsError} requestLead={requestLead} cancelRequest={cancelRequest}/>'), 'CockpitView hands it on');
    const main = between(s, 'export default function LeadsTab() {', '\n}\n');
    assert.equal(count(main, 'requestsError={requestsError}'), 2, 'LeadsTab hands the read\'s failure to both views');
    assert.ok(between(main, '<CockpitView', '/>').includes('requestsError={requestsError}'), 'REGRESSION: the Cockpit never told the read failed');
});

test('Part 12 fixes, round 2 (L2): the Settings load\'s words — the toast says "Settings did not load — <words>." with no nested parentheses; the Settings screen says them too, kept until a load lands — RUN', () => {
    const effect = new Function('settingsLoadError', 'setUndoToast',
        between(code(read('src/App.jsx')), '        if (!settingsLoadError) return;', '\n    }, [settingsLoadError]);'));
    const toastOf = (words) => { const out = []; effect(words, (t) => out.push(t)); return out; };
    const tail = ' Nothing in Settings can be saved until they do. Reload the page to try again.';
    assert.deepEqual(toastOf('Internal server error (ref r1)'), [{ error: `Settings did not load — Internal server error (ref r1).${tail}` }],
        'REGRESSION: "Settings did not load (Internal server error (ref r1)) — …"');
    assert.deepEqual(toastOf('The server returned 500.'), [{ error: `Settings did not load — The server returned 500.${tail}` }], 'one full stop');
    assert.deepEqual(toastOf('The server could not be reached.'), [{ error: `Settings did not load — The server could not be reached.${tail}` }]);
    assert.deepEqual(toastOf(''), [], 'a load that landed says nothing');
    assert.doesNotMatch(toastOf('Internal server error (ref r1)')[0].error, /did not load \(|\)\)/);
    // The screen: the load's words in its title, from the error it is handed.
    const t = code(read('src/Tabs/SettingsTab.jsx'));
    const tpl = between(t, '                {error ? ', ' : "Loading this').slice('                {error ? '.length);
    const title = new Function('error', `return ${tpl};`);
    assert.equal(title('Internal server error (ref r1)'), "This organization's settings did not load — Internal server error (ref r1)",
        'REGRESSION: "did not load" alone, the words and their ref lost with the toast');
    assert.equal(title('The server could not be reached.'), "This organization's settings did not load — The server could not be reached.");
    assert.ok(t.includes('function SettingsNotLoaded({ error }) {'));
    assert.ok(t.includes(': <SettingsNotLoaded error={settingsLoadError}/>}'), 'REGRESSION: the screen handed a flag, not the words');
    assert.ok(t.includes('            {error && (\n                <div style={{ fontSize:12, color:T.inkMuted, marginTop:4 }}>\n                    Nothing here can be changed until they load.'));
});

// The lead import: ModalLayer's handler and settle, and the modal's doImport, extracted and run over the real bulk client.
const p12fxL2Settle = () => new Function('isClean', 'ImportError',
    `${between(code(read(P12FXL2_LAYER)), 'const settle = (receipt, noun) => {', '\n};')}\n};\nreturn settle;`)(p12fxL2Clean, P12FXL2_IMPORT_ERROR);
const p12fxL2Leads = (n) => Array.from({ length: n }, (_, i) => ({ id: `lead_${i}`, firstName: `F${i}`, lastName: 'L' }));
// `answers[i]` answers request i: 'ok' lands the chunk, else the answer itself (or a thrown Error). `switchAt`: the org
// switches as request `switchAt` goes out.
const p12fxL2Handler = ({ answers, switchAt = -1 }) => {
    const head = '                    onImport={async (newLeads) => {';
    const body = between(code(read(P12FXL2_LAYER)), head, '\n                    }}\n                />').slice(head.length);
    const did = { sent: [], leads: stateOf([]) };
    const org = { now: 'org_a' };
    const fetch = async (url, opts) => {
        const rows = JSON.parse(opts.body);
        did.sent.push([url, opts.method, rows.length]);
        const i = did.sent.length - 1;
        if (i === switchAt) org.now = 'org_b';
        const a = answers[i];
        if (a instanceof Error) throw a;
        return a === 'ok' ? onceOf(200, { insertedIds: rows.map((r) => r.id) }) : a;
    };
    const onImport = new Function('requestOrg', 'stillOrg', 'stopped', 'bulk', 'setLeads', 'settle', 'receiptFromInsert',
        `return async (newLeads) => {${body}\n};`)(() => org.now, (o) => o === org.now, () => new Promise(() => {}), p12cBulk(fetch),
        did.leads.set, p12fxL2Settle(), p12fxL2Insert);
    return { onImport, did };
};
const p12fxL2DoImport = async (onImport, leads = p12fxL2Leads(3)) => {
    const did = { errors: [], importing: [], stats: [], steps: [] };
    const preview = { leads, added: leads.length, skipped: 1, errors: ['Row 5: missing first and last name'] };
    const doImport = new Function('preview', 'setParseError', 'setImporting', 'onImport', 'setImportStats', 'setStep', 'receiptFromError',
        'describeReceipt', 'failureWords', 'describeOwners', `${between(code(read(P12FXL2_MODAL)), '    const doImport = async () => {', '\n    };')}\n    };\nreturn doImport;`)(
        preview, (v) => did.errors.push(v), (v) => did.importing.push(v), onImport, (v) => did.stats.push(v), (v) => did.steps.push(v),
        p12fxL2FromError, p12fxL2Describe, failureWords, p12fxL2Owners);
    await doImport();
    return did;
};
const P12FXL2_PARTIAL = '400 leads created. 500 did not save. The server returned 502.';

test('Part 12 fixes, round 2 (L2): the lead import — a chunk refused after earlier ones landed ends on the receipt: the landed leads listed, how many saved in the house words; clean, the receipt — RUN', async () => {
    const partial = p12fxL2Handler({ answers: ['ok', P11_PAGE()] });
    const thrown = await partial.onImport(p12fxL2Leads(900)).then(() => null, (e) => e);
    assert.ok(thrown instanceof P12FXL2_IMPORT_ERROR, 'REGRESSION: the words alone thrown — no count of the leads that landed');
    assert.deepEqual([thrown.receipt.created, thrown.receipt.failed, thrown.receipt.attempted, thrown.receipt.error], [400, 500, 900, 'The server returned 502.']);
    assert.equal(p12fxL2Describe(thrown.receipt, 'lead'), P12FXL2_PARTIAL);
    assert.deepEqual(partial.did.sent.map((x) => x[2]), [400, 400], 'the third chunk is never sent');
    assert.equal(partial.did.leads.value.length, 400, 'the leads that landed reach the list before the failure is said');
    for (const [answer, words] of [[onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'], [UNSENT(), 'The server could not be reached.']]) {
        const e = await p12fxL2Handler({ answers: ['ok', answer] }).onImport(p12fxL2Leads(900)).then(() => null, (x) => x);
        assert.deepEqual([e?.receipt?.created, e?.receipt?.error], [400, words]);
    }
    const first = await p12fxL2Handler({ answers: [onceOf(500, { error: 'Internal server error', requestId: 'r1' })] }).onImport(p12fxL2Leads(3)).then(() => null, (x) => x);
    assert.deepEqual([first?.receipt?.created, first?.receipt?.failed], [0, 3], 'nothing landed: a receipt of none');
    const clean = p12fxL2Handler({ answers: ['ok', 'ok', 'ok'] });
    const receipt = await clean.onImport(p12fxL2Leads(900));
    assert.deepEqual([receipt.created, receipt.failed, receipt.error, clean.did.leads.value.length], [900, 0, null, 900], 'clean: the receipt is the answer');
    // An answer after an org switch: nothing listed, nothing said (stopped).
    const switched = p12fxL2Handler({ answers: ['ok'], switchAt: 0 });
    assert.equal(await p12cOutcome(switched.onImport(p12fxL2Leads(3))), P12C_PENDING);
    assert.deepEqual(switched.did.leads.value, []);
});

test('Part 12 fixes, round 2 (L2): the lead import modal — once any lead landed the Results say how many, and no second Import re-sends them; nothing landed, Preview says why; a failure in plain words — RUN', async () => {
    const run = await p12fxL2DoImport(p12fxL2Handler({ answers: ['ok', P11_PAGE()] }).onImport, p12fxL2Leads(900));
    assert.deepEqual(run.steps, ['results'], 'REGRESSION: stayed on Preview — its Import re-sends the 400 leads that landed');
    assert.deepEqual(run.stats, [{ added: 400, failed: 500, said: P12FXL2_PARTIAL, skipped: 1, errors: ['Row 5: missing first and last name'], owners: null }]);
    assert.deepEqual([run.errors, run.importing], [[''], [true, false]]);
    const none = await p12fxL2DoImport(p12fxL2Handler({ answers: [P11_PAGE()] }).onImport);
    assert.deepEqual([none.steps, none.stats, none.errors], [[], [], ['', 'Import failed — Nothing was saved. 3 did not save. The server returned 502.']],
        'nothing landed: Preview says it, and Import may try again');
    for (const [thrown, words] of [[UNSENT(), 'The server could not be reached.'], [new SyntaxError("Unexpected token '<'"), 'Its answer could not be read.'],
        [new Error('Internal server error (ref r1)'), 'Internal server error (ref r1)']]) {
        const r = await p12fxL2DoImport(async () => { throw thrown; });
        assert.deepEqual([r.steps, r.errors], [[], ['', `Import failed — ${words}`]], `REGRESSION: a raw message — ${thrown.message}`);
    }
    const clean = await p12fxL2DoImport(async () => ({ created: 3, failed: 0 }));
    assert.deepEqual([clean.steps, clean.stats], [['results'], [{ added: 3, skipped: 1, errors: ['Row 5: missing first and last name'], owners: null }]]);
});

test('Part 12 fixes, round 2 (L2): WIRING — the lead import ends on its receipt; the Results say a partial import and offer no Import', () => {
    const layer = code(read(P12FXL2_LAYER));
    const handler = between(layer, '                    onImport={async (newLeads) => {', '\n                    }}\n                />');
    order(handler, 'if (!stillOrg(askedOrg)) return stopped();', 'if (res.landed.length > 0) setLeads(prev => [...(prev || []), ...res.landed]);',
        "return settle(receiptFromInsert(res), 'lead');");
    assert.ok(!handler.includes('throw new Error'), 'REGRESSION: the words thrown alone');
    const m = code(read(P12FXL2_MODAL));
    assert.ok(m.includes("import { receiptFromError, describeReceipt, describeOwners } from '../../utils/importReceipt';"));
    assert.ok(m.includes("import { failureWords } from '../../utils/refusalWords.js';"));
    assert.ok(!/err\.message|'Import failed: '/.test(m), 'REGRESSION: "Import failed: " and a raw message');
    const results = between(m, "{step === 'results' && importStats && (", '<ResizeHandles');
    assert.ok(!results.includes('doImport'), 'REGRESSION: an Import on the Results');
    assert.ok(results.includes("{importStats.said ? 'Partially Imported' : 'Import Complete'}"));
    assert.ok(results.includes("{importStats.said && <p style={{ color:T.inkMid, fontSize:'0.8125rem', margin:'0 auto', maxWidth:480, overflowWrap:'anywhere' }}>{importStats.said}</p>}"),
        'REGRESSION: the Results never say how many leads were saved');
    order(results, '{importStats.failed > 0 && (', '{importStats.failed}</div>', 'Did Not Save</div>');
});

// ── Part 12 — the review's fixes, round 2 (G2 — THE GUARD floors) ──
// Re-measured after every round 2 fix (§0.249): (iii) 188 body reads over the 242 sources under src/ (the D2 record and
// new version's refusal bodies read in their ok checks, the I2 roster read again — three checked reads), (iv) 188 catch
// clauses over its 54 files (the I2 roster read's catch), (i) 126 error states (it was 100 since §0.243). Its WIRING is
// merged, with the first round's (G), into the one floors test at the end of this file (round 4, G4; round 3's G3 before
// it).

// ── Part 12 — the review's fixes, round 3 (A3 — Audit log) ──
// The review of round 2 (residuals A2's four): the Filters line drew "Showing 0 of 0 (loading…)" — a count over a read
// that had not landed; " · 1 status not known" sat in SecTitle's badge beside its green ✓, a passing check over a status
// not known; a Pause / Resume, Rotate or Send test answered by a 5xx, a gateway's page or nothing said "not saved" / "not
// sent" and kept the row's old status, though audit-stream.mjs answers a 5xx after its update or its delivery (the audit
// write, the caller's name, the row read again) and a request that threw may have reached it; and the destinations' read
// waited for the log's, so a slow log held both Adds off, "still loading", with no request out. The Filters line says
// "Loading…"; SecTitle takes a badgeTone ('ok', the default — every other caller as before — or 'warn', a "!" in the
// warning colour) and the badge is 'warn' while any row's status is not known; only the server's own refusal (a 4xx with
// its words: 400, 403, 404) says "not saved" / "not sent", any other answer says it may have been — a Pause / Resume and a
// Send test marking the row's status not known, a Rotate saying its secret may have been rotated; the destinations are
// read in their own effect, at once.
const p12fxA3Press = async (which, answer, args, statusBefore = []) => {
    const did = { sent: [], errors: [], busy: [], tests: [], modal: [], reveal: [], read: [], statusBefore };
    did.answered = await auditActions(did, answer)[which](...args);
    return { ...did, said: did.errors.filter(Boolean) };
};
const p12fxA3Own = () => [
    [onceOf(400, { error: 'id is required.' }), 'id is required.'],
    [onceOf(403, { error: 'Forbidden: insufficient role' }), 'Forbidden: insufficient role'],
    [onceOf(404, { error: 'Destination not found.', requestId: 'r4' }), 'Destination not found. (ref r4)'],
];
const p12fxA3Maybe = () => [
    [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'],
    [onceOf(503, { error: 'Key encryption is not available. Contact your administrator.' }), 'Key encryption is not available. Contact your administrator.'],
    [onceOf(409, {}), 'The server returned 409.'],
    [onceOf(404, new SyntaxError("Unexpected token '<'")), 'The server returned 404.'],
    [onceOf(429, { error: '   ' }), 'The server returned 429.'],
    [P11_PAGE(), 'The server returned 502.'],
    [UNSENT(), 'The server could not be reached.'],
];
const P12FXA3_MAYBE_PUT = (label, words) => `${label} may have been saved — reload the page to see whether it was: ${words}`;
const P12FXA3_MAYBE_ROTATE = (words) => `The secret may have been rotated — reload the page to see whether it was, and rotate again to see a new one: ${words}`;
const P12FXA3_MAYBE_TEST = (words) => `The test may have been sent — reload the page to see whether it was: ${words}`;

test('Part 12 fixes (A3): destRefusedOwn — only a 4xx with the server\'s words proves nothing was written — RUN', () => {
    const own = new Function(`return ${between(code(read(P12A_AUDIT)), 'const destRefusedOwn = ', ';\n').slice('const destRefusedOwn = '.length)};`)();
    assert.equal(own({ status: 400 }, { error: 'id is required.' }), true);
    assert.equal(own({ status: 403 }, { error: 'Forbidden: insufficient role' }), true);
    assert.equal(own({ status: 404 }, { error: 'Destination not found.' }), true);
    assert.equal(own({ status: 499 }, { error: 'x' }), true);
    assert.equal(own({ status: 500 }, { error: 'Internal server error', requestId: 'r1' }), false, 'REGRESSION: a 5xx (it may come after the update) said as not saved');
    assert.equal(own({ status: 503 }, { error: 'Key encryption is not available.' }), false);
    assert.equal(own({ status: 409 }, {}), false, 'REGRESSION: a 4xx without the server\'s words said as not saved');
    assert.equal(own({ status: 404 }, null), false, 'REGRESSION: a gateway\'s 404 page said as not saved');
    assert.equal(own({ status: 400 }, { error: '  ' }), false);
    assert.equal(own({ status: 400 }, { error: 7 }), false);
    assert.equal(own({ status: 399 }, { error: 'x' }), false);
});

test('Part 12 fixes (A3): the Audit log\'s Pause / Resume — the server\'s own refusal "not saved", the row known; any other answer "may have been saved", its status not known — RUN', async () => {
    for (const [answer, words] of p12fxA3Own()) {
        const did = await p12fxA3Press('putDest', answer, [{ id: 'dst_1', paused: true }, 'Pause']);
        assert.deepEqual([did.said, did.answered, did.statusUnread.value, did.dests.value[0].status, did.busy], [[`Pause not saved — ${words}`], null, [], 'Active', ['dst_1', null]], `the server's own refusal: ${words}`);
    }
    for (const [answer, words] of p12fxA3Maybe()) {
        const did = await p12fxA3Press('putDest', answer, [{ id: 'dst_1', paused: true }, 'Pause']);
        assert.deepEqual([did.said, did.answered, did.statusUnread.value, did.busy], [[P12FXA3_MAYBE_PUT('Pause', words)], null, ['dst_1'], ['dst_1', null]],
            `REGRESSION: "Pause not saved" and the old status over an answer that proves nothing — ${words}`);
        assert.ok(!did.said[0].includes('not saved'), 'never "not saved" over a Pause the server may have made');
        const [again] = p12fxA3Maybe().find(([, w]) => w === words);   // a fresh answer: a body is read once
        const resumed = await p12fxA3Press('putDest', again, [{ id: 'dst_1', paused: false }, 'Resume']);
        assert.deepEqual([resumed.said, resumed.statusUnread.value], [[P12FXA3_MAYBE_PUT('Resume', words)], ['dst_1']], `a Resume likewise — ${words}`);
    }
});

test('Part 12 fixes (A3): the Audit log\'s Rotate secret — the server\'s own refusal "not saved"; any other answer says the secret may have been rotated, no status moved — RUN', async () => {
    for (const [answer, words] of p12fxA3Own()) {
        const did = await p12fxA3Press('putDest', answer, [{ id: 'dst_1', rotateSecret: true }, 'Rotate secret']);
        assert.deepEqual([did.said, did.answered, did.statusUnread.value], [[`Rotate secret not saved — ${words}`], null, []], `the server's own refusal: ${words}`);
    }
    for (const [answer, words] of p12fxA3Maybe()) {
        const did = await p12fxA3Press('putDest', answer, [{ id: 'dst_1', rotateSecret: true }, 'Rotate secret']);
        assert.deepEqual([did.said, did.answered], [[P12FXA3_MAYBE_ROTATE(words)], null], `REGRESSION: "Rotate secret not saved" over a secret the server may have rotated — ${words}`);
        assert.deepEqual(did.statusUnread.value, [], 'a Rotate moves no status: the row stays known');
    }
});

test('Part 12 fixes (A3): the Audit log\'s Send test event — the server\'s own refusal "not sent", the row known; any other answer "may have been sent", its status not known — RUN', async () => {
    for (const [answer, words] of p12fxA3Own()) {
        const did = await p12fxA3Press('sendTest', answer, [P12A_DEST]);
        assert.deepEqual([did.said, did.statusUnread.value, did.tests, did.busy], [[`Test not sent — ${words}`], [], [null], ['dst_1', null]], `the server's own refusal: ${words}`);
    }
    for (const [answer, words] of p12fxA3Maybe()) {
        const did = await p12fxA3Press('sendTest', answer, [P12A_DEST]);
        assert.deepEqual([did.said, did.statusUnread.value, did.tests, did.busy], [[P12FXA3_MAYBE_TEST(words)], ['dst_1'], [null], ['dst_1', null]],
            `REGRESSION: "Test not sent" and the old status over a test that may have gone out — ${words}`);
    }
});

test('Part 12 fixes (A3): the Audit log\'s Filters line — "Loading…" while the read is out, never "Showing 0 of 0"; "Not loaded" over a failed read — RUN', () => {
    const piece = between(code(read(P12A_AUDIT)), "whiteSpace:'nowrap', marginLeft:'auto' }}>{", '}</span>').slice("whiteSpace:'nowrap', marginLeft:'auto' }}>{".length);
    const asText = piece.replace(/<>([\s\S]*?)<\/>/, (m, inner) => '`' + inner.replace(/\{/g, '${') + '`');
    const line = (eventsError, eventsLoading, visible = [], events = []) =>
        new Function('eventsError', 'eventsLoading', 'visible', 'events', `return (${asText});`)(eventsError, eventsLoading, visible, events);
    assert.equal(line(null, true), 'Loading…', 'REGRESSION: "Showing 0 of 0 (loading…)" — a count over a read that has not landed');
    assert.equal(line('Internal server error (ref r1)', false), 'Not loaded');
    assert.equal(line(null, false, [1], [1, 2]), 'Showing 1 of 2');
    assert.ok(!piece.includes('(loading…)'), 'REGRESSION: the count drawn beside "(loading…)"');
});

test('Part 12 fixes (A3): the Audit log\'s badge tone — a warning mark while any row\'s status is not known, never the green ✓ — RUN, and WIRING', () => {
    const tone = (dests, statusUnread) => new Function('dests', 'destsRead', 'statusUnread',
        `${between(code(read(P12A_AUDIT)), '    const unknownCount = ', '\n    const catStyle')}\nreturn streamingTone;`)(dests, true, statusUnread);
    assert.equal(tone([P12A_DEST], ['dst_1']), 'warn', 'REGRESSION: the green ✓ beside "1 status not known"');
    assert.equal(tone([P12A_DEST, { id: 'dst_2', status: 'Paused' }], ['dst_2']), 'warn');
    assert.equal(tone([P12A_DEST], []), 'ok');
    assert.equal(tone([P12A_DEST], ['dst_9']), 'ok', 'an id no row holds (a removed row) is no status not known');
    const s = code(read(P12A_AUDIT));
    assert.ok(between(s, '            <SecTitle\n', '                actions={[').includes('                badgeTone={streamingTone}\n'), 'REGRESSION: the badge drawn with SecTitle\'s ✓ whatever its tone');
});

const p12fxA3Walk = (dir) => readdirSync(new URL(dir, ROOT)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(new URL(p, ROOT)).isDirectory() ? p12fxA3Walk(p) : /\.(jsx?|mjs)$/.test(n) ? [p] : [];
});

test('Part 12 fixes (A3): SecTitle\'s badge — a green ✓ only for the \'ok\' tone (the default); \'warn\' a "!" in the warning colour; every other caller unchanged — WIRING', () => {
    const decl = between(code(read('src/Tabs/settings/security/shared.jsx')), 'export const SecTitle = ', '\n);');
    assert.ok(decl.startsWith("export const SecTitle = ({ title, sub, badge, badgeTone = 'ok', updatedAt, actions, dirty }) => ("), 'REGRESSION: the tone\'s default is not the ✓ every caller drew');
    assert.ok(decl.includes("<span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12.5, color: badgeTone === 'warn' ? T.warn : T.ok, fontWeight:600 }}>"),
        'REGRESSION: a badge naming something not known drawn in the passing colour');
    assert.ok(decl.includes(`{badgeTone === 'warn' ? <span title="Not known" style={{ fontWeight:700 }}>!</span> : <span>✓</span>}<span>{badge}</span>`),
        'REGRESSION: the ✓ drawn beside a badge whose tone is a warning');
    assert.equal(count(decl, '✓'), 1, 'one ✓, the \'ok\' branch\'s');
    const callers = p12fxA3Walk('src').filter((f) => code(read(f)).includes('<SecTitle'));
    assert.ok(callers.length >= 6, `the callers: ${callers.join(', ')}`);
    const toned = callers.filter((f) => code(read(f)).includes('badgeTone='));
    assert.deepEqual(toned, [P12A_AUDIT], 'only the Audit log names a tone: every other SecTitle draws as it did');
    assert.equal(count(code(read(P12A_AUDIT)), 'badgeTone='), 1);
});

test('Part 12 fixes (A3): the Audit log\'s destinations are read at once, in their own effect — never held behind the log\'s read — RUN, and WIRING', async () => {
    const read1 = await p12fxA3DestsLoad(async () => {});
    assert.deepEqual([read1.loads, read1.destErrors, read1.destsLoading], [1, [], [false]], 'the destinations read with no log answer at all');
    const gone = await p12fxA3DestsLoad(async () => { throw UNSENT(); }, 'load');
    assert.deepEqual([gone.loads, gone.destErrors, gone.destsLoading], [1, [], []], 'an answer after the page closed sets nothing');
    const s = code(read(P12A_AUDIT));
    const logRead = between(s, "        (async () => {\n            try {\n                const auditRes", '\n    }, [');
    assert.ok(!logRead.includes('loadDests'), 'REGRESSION: the destinations read only after the log\'s read settles — both Adds held off with no request out');
    assert.ok(s.includes('\n        })();\n        return () => { cancelled = true; };\n    }, []);\n'), 'the log\'s read depends on nothing');
    const destsRead = between(s, "        (async () => {\n            try { await loadDests(); }", '\n    }, [loadDests]);');
    assert.ok(!destsRead.includes('auditRes'), 'the destinations\' read waits on no log answer');
    assert.equal(count(s, 'await loadDests()'), 1, 'one read of the destinations');
    assert.equal(count(between(s, 'export const AuditDetail = ', '\n};\n'), 'React.useEffect(() => {'), 2, 'the log\'s read and the destinations\', each its own effect');
});

// ── Part 12 — the review's fixes, round 3 (U3 — Users + MFA) ──
// The review of round 2 (residuals U2 and M2): Settings → Users read clerk-mfa-status's answer by no rule — any 200 body
// was kept as mfaData, so `{}` drew "✓ MFA 0/0 enrolled" on the Security page's header, the rail's "MFA on" read "0/N"
// and "no Clerk-linked members", a notEnrolled entry that was null threw in mfaByEmail during render (no error said), and
// a 200 `null` left the Security page on "Loading…" for good. It keeps an answer only through the one rule the MFA page
// and the overview's tile read (settingsCards.js mfaAnswerRead) — and that rule now reads each entry's fields as
// clerk-mfa-status.mjs always sends them (a role's name and two counts; a member's userId, email, name and role, each a
// string) and the enrolledUsers list Settings → Users draws: an object as a React child or an email that is not a
// string is a read that failed, never a render crash. runClerkSync's roster read again says a 200 with no list, as the
// invite's does; and the invite page's notice is drawn in the warning tint when its words hold a roster read that failed.
const P12FXU3_UNKNOWN = 'MFA unknown — could not read Clerk';
// The server's whole answer (clerk-mfa-status.mjs): two numbers, three lists, every field it always sends.
const P12FXU3_WHOLE = () => ({
    enrolled: 1, total: 2,
    notEnrolled: [{ userId: 'user_c', email: 'c@x.co', name: 'C', role: 'User' }],
    enrolledUsers: [{ userId: 'user_a', email: 'A@x.co', name: 'A', role: 'Admin' }],
    byRole: [{ role: 'Admin', enrolled: 1, total: 1 }, { role: 'User', enrolled: 0, total: 1 }],
});
// One entry of one list changed (`patch` returns the new entry), the rest whole.
const p12fxU3With = (key, patch) => { const w = P12FXU3_WHOLE(); w[key] = [patch(w[key][0]), ...w[key].slice(1)]; return w; };
const p12fxU3Without = (key, field) => p12fxU3With(key, (e) => { const { [field]: _gone, ...rest } = e; return rest; });
// Each a field the server always sends, missing or not of its type, or a list missing: every one a read that failed.
const P12FXU3_BAD_FIELDS = () => [
    p12fxU3With('byRole', (e) => ({ ...e, role: {} })), p12fxU3With('byRole', (e) => ({ ...e, role: 3 })), p12fxU3Without('byRole', 'role'),
    p12fxU3With('byRole', (e) => ({ ...e, enrolled: '1' })), p12fxU3Without('byRole', 'enrolled'),
    p12fxU3With('byRole', (e) => ({ ...e, total: null })), p12fxU3Without('byRole', 'total'), p12fxU3With('byRole', () => []),
    ...['notEnrolled', 'enrolledUsers'].flatMap((key) => [
        p12fxU3Without(key, 'userId'), p12fxU3With(key, (e) => ({ ...e, userId: 3 })),
        p12fxU3Without(key, 'email'), p12fxU3With(key, (e) => ({ ...e, email: {} })), p12fxU3With(key, (e) => ({ ...e, email: null })),
        p12fxU3Without(key, 'name'), p12fxU3With(key, (e) => ({ ...e, name: {} })),
        p12fxU3Without(key, 'role'), p12fxU3With(key, (e) => ({ ...e, role: {} })),
        p12fxU3With(key, () => []), p12fxU3With(key, () => null), p12fxU3With(key, () => 'c@x.co'),
    ]),
    ...[undefined, null, {}, 'x'].map((v) => ({ ...P12FXU3_WHOLE(), enrolledUsers: v })),
];
// Read: the whole answer, one of none, and an email the server sent as '' (it sends '' for a member with none).
const P12FXU3_READ = () => [
    P12FXU3_WHOLE(),
    { enrolled: 0, total: 0, notEnrolled: [], enrolledUsers: [], byRole: [] },
    p12fxU3With('notEnrolled', (e) => ({ ...e, email: '', name: '' })),
];

// Settings → Users' MFA load (the effect's body), extracted and run over stubs.
const p12fxU3Load = async (answer, { cancel = false } = {}) => {
    const did = { data: [], failed: [] };
    const piece = between(code(read(P12A_USERS)), "        (async () => {\n            try {\n                const res = await dbFetch('/.netlify/functions/clerk-mfa-status');", '\n        })();');
    let h = null;
    const fetch = async () => { if (cancel) h.cancel(); if (answer instanceof Error) throw answer; return answer; };
    // Moved (§0.249, review fixes round 4 — U4): the load says the failure's words (readRefusal, failureWords) into mfaFailed.
    h = new Function('dbFetch', 'mfaAnswerRead', 'setMfaData', 'setMfaFailed', 'readRefusal', 'failureWords',
        `let cancelled = false;\nconst run = ${piece.trim()}\n        });\nreturn { run, cancel: () => { cancelled = true; } };`)(
        fetch, mfaAnswerRead, (v) => did.data.push(v), (v) => did.failed.push(v), readRefusal, failureWords);
    await h.run();
    return did;
};
// What Settings → Users draws from (mfaData, mfaFailed): the Security page's header, ring and tile, mfaByEmail, and the
// rail's "MFA on" card over a roster of two active members — each expression extracted from the source and run.
const p12fxU3Drawn = (mfaData, mfaFailed) => {
    const s = code(read(P12A_USERS));
    const lines = between(s, '    const loading     = mfaData === null && !mfaFailed;', '\n\n');
    const detail = p12fxU2Attr("                statusDetail={loading ? 'Loading…'");
    const state = p12fxU2Attr("                statusState={loading ? 'loading'");
    const ring = between(s, "{score === null ? (loading ? ", '}</span>').slice(1);
    const tile = between(s, "{ label:'MFA enrolled',     value: ", ', sub: failed ?').slice("{ label:'MFA enrolled',     value: ".length);
    const page = new Function('mfaData', 'mfaFailed', 'T',
        `${lines}\nreturn { statusDetail: (${detail}), statusState: (${state}), ring: (${ring}), tile: (${tile}), sections: !loading && (notEnrolled.length > 0 || total > 0) };`)(mfaData, mfaFailed, T);
    const memo = between(s, '    const mfaByEmail = React.useMemo(() => {', '    }, [mfaData]);');
    const mfaByEmail = new Function('React', 'mfaData', `${memo}    }, [mfaData]);\nreturn mfaByEmail;`)({ useMemo: (f) => f() }, mfaData);
    const roster = [{ email: 'a@x.co', status: 'Active' }, { email: 'c@x.co', status: 'Active' }]
        .map((u) => ({ ...u, mfa: mfaByEmail ? (mfaByEmail.get((u.email || '').toLowerCase()) ?? null) : null }));
    const mfaOn = roster.filter((u) => u.mfa === true).length;
    const mfaOff = roster.filter((u) => u.mfa === false).length;
    const rail = between(s, "                                        label: 'MFA on',\n", "\n                                    },\n                                    {\n                                        label: 'SSO',");
    const card = new Function('mfaByEmail', 'mfaOn', 'activeCount', 'mfaOff', 'mfaFailed', 'T', `return ({ ${rail} });`)(mfaByEmail, mfaOn, roster.length, mfaOff, mfaFailed, T);
    return { ...page, mfaByEmail, card };
};
// The state the load leaves: the data it kept (or null) and whether it said the read failed.
// Moved (§0.249, review fixes round 4 — U4): mfaFailed holds the failure's words, '' while none failed.
const p12fxU3After = (did) => [did.data.at(-1) ?? null, did.failed.at(-1) ?? ''];

test('Part 12 fixes (U3): Settings → Users keeps an MFA answer only through the one rule — one it refuses is unknown: no ✓ and no "0/0" on Security health, the ring UNKNOWN, no count and no "no Clerk-linked members" on the rail, never a render crash — RUN', async () => {
    // Moved (§0.249, review fixes round 4 — U4): each answer with the words mfaFailed now holds (was `[true]`) — stronger.
    const refused = [
        ...[null, {}, { total: 0, enrolled: 0 }, { total: 2, enrolled: 1, byRole: [], notEnrolled: [null], enrolledUsers: [] }].map((b) => [onceOf(200, b), 'Its answer could not be read.']),
        ...P12FXU3_BAD_FIELDS().map((b) => [onceOf(200, b), 'Its answer could not be read.']),
        ...P12A_REFUSED(), [P11_UNREADABLE(), 'Its answer could not be read.'],
    ];
    for (const [answer, words] of refused) {
        const did = await p12fxU3Load(answer);
        assert.deepEqual([did.data, did.failed], [[], [words]], 'REGRESSION: an answer the rule refuses kept as mfaData, or left "Loading…" for good');
        const drawn = p12fxU3Drawn(...p12fxU3After(did));
        assert.deepEqual([drawn.statusState, drawn.statusDetail, drawn.ring, drawn.tile, drawn.sections], ['unread', P12FXU3_UNKNOWN, 'UNKNOWN', '—', false],
            'REGRESSION: a ✓ or "MFA 0/0 enrolled" over a read that failed');
        assert.equal(drawn.mfaByEmail, null, 'no member drawn on or off');
        assert.deepEqual([drawn.card.value, drawn.card.sub, drawn.card.color], ['—', 'unknown — could not read Clerk', T.inkMuted],
            'REGRESSION: the rail\'s "MFA on" counted, or "no Clerk-linked members", over a read that failed');
    }
    // A 200 `null` once left the page on "Loading…" for good: it is said as unknown now.
    const nul = await p12fxU3Load(onceOf(200, null));
    assert.notEqual(p12fxU3Drawn(...p12fxU3After(nul)).statusDetail, 'Loading…', 'REGRESSION: a 200 null left Security health loading for good');
    // The server's whole answer: kept, drawn as read.
    const whole = await p12fxU3Load(onceOf(200, P12FXU3_WHOLE()));
    assert.deepEqual([whole.data, whole.failed], [[P12FXU3_WHOLE()], []]);
    const drawn = p12fxU3Drawn(...p12fxU3After(whole));
    assert.deepEqual([drawn.statusState, drawn.statusDetail, drawn.ring, drawn.tile], ['read', 'MFA 1/2 enrolled · 50%', 'ENROLLED', '1/2']);
    assert.deepEqual([...drawn.mfaByEmail], [['a@x.co', true], ['c@x.co', false]], 'each email lower-cased, on or off');
    assert.deepEqual([drawn.card.value, drawn.card.sub], ['1/2', '1 off']);
    // One with an email of '' (the server's for a member with none): read, the member left unknown.
    const blank = await p12fxU3Load(onceOf(200, P12FXU3_READ()[2]));
    assert.deepEqual([...p12fxU3Drawn(...p12fxU3After(blank)).mfaByEmail], [['a@x.co', true]]);
    // Still loading: no mark, no count.
    const loading = p12fxU3Drawn(null, false);
    assert.deepEqual([loading.statusState, loading.statusDetail, loading.ring, loading.card.sub], ['loading', 'Loading…', 'LOADING', 'loading…']);
    // An answer after the page closed sets nothing — kept or refused.
    for (const answer of [onceOf(200, P12FXU3_WHOLE()), onceOf(200, {}), onceOf(500, { error: 'x' }), UNSENT()]) {
        const gone = await p12fxU3Load(answer, { cancel: true });
        assert.deepEqual([gone.data, gone.failed], [[], []], 'REGRESSION: an answer after the page closed set its state');
    }
});

test('Part 12 fixes (U3): the one rule reads every field clerk-mfa-status sends — a field missing or not of its type, or enrolledUsers missing, is unread on the MFA page, the overview tile and Settings → Users alike — RUN', async () => {
    const bodies = [...P12FXU3_BAD_FIELDS(), ...P12FXU3_READ(), ...P12FXM_SHORT(), ...P12FXM2_BAD_ENTRIES(), ...P12FXM2_READ()];
    for (const body of P12FXU3_BAD_FIELDS()) assert.equal(mfaAnswerRead(body), false, `REGRESSION: ${JSON.stringify(body)} read — an object drawn as a React child, an email lower-cased that is not a string`);
    for (const body of P12FXU3_READ()) assert.equal(mfaAnswerRead(body), true, JSON.stringify(body));
    for (const body of bodies) {
        const rule = mfaAnswerRead(body);
        const page = await mfaLoad({ answer: onceOf(200, body) });
        const tile = await p12fxmTile(body);
        const users = await p12fxU3Load(onceOf(200, body));
        const reads = [page.errors.length === 0 && page.data.length === 1, tile.mfa !== undefined && !tile.unread.includes('mfa'), users.data.length === 1 && users.failed.length === 0];
        assert.deepEqual(reads, [rule, rule, rule], `REGRESSION: ${JSON.stringify(body)} — the MFA page, the tile and Settings → Users read it apart`);
        if (!rule) assert.deepEqual(page.errors, [P12FXM_UNREAD], `${JSON.stringify(body)}: "Its answer could not be read." on the MFA page`);
    }
});

test('Part 12 fixes (U3): WIRING — Settings → Users reads clerk-mfa-status through mfaAnswerRead, after its ok and its body, before mfaData is kept; the rule reads each field the server always sends', () => {
    const s = code(read(P12A_USERS));
    assert.ok(s.includes("import { mfaAnswerRead } from '../../../utils/settingsCards.js';"));
    const load = between(s, "                const res = await dbFetch('/.netlify/functions/clerk-mfa-status');", '\n        })();');
    // Moved (§0.249, review fixes round 4 — U4): each failure sets its words, not `true`.
    order(load, 'if (!res.ok) { const why = await readRefusal(res); if (!cancelled) setMfaFailed(why); return; }', 'const d = await res.json();', 'if (cancelled) return;',
        "if (!mfaAnswerRead(d)) { setMfaFailed('Its answer could not be read.'); return; }", 'setMfaData(d);');
    assert.equal(count(s, 'setMfaData('), 1, 'one place mfaData is kept, behind the rule');
    assert.ok(!/typeof d\.|Array\.isArray\(d\./.test(load), 'REGRESSION: a copy of the rule beside the shared one');
    const rule = between(code(read('src/utils/settingsCards.js')), 'const isMfaRole = ', '\n\n');
    assert.ok(rule.includes("const isMfaRole = (v) => !!v && typeof v.role === 'string' && typeof v.enrolled === 'number' && typeof v.total === 'number';"),
        'REGRESSION: a byRole entry\'s role or counts not read');
    assert.ok(rule.includes("const isMfaMember = (v) => !!v && typeof v.userId === 'string' && typeof v.email === 'string' && typeof v.name === 'string' && typeof v.role === 'string';"),
        'REGRESSION: a member entry\'s fields not read');
    order(rule, "export const mfaAnswerRead = (d) => !!d && typeof d.total === 'number' && typeof d.enrolled === 'number'",
        '&& Array.isArray(d.byRole) && d.byRole.every(isMfaRole)', '&& Array.isArray(d.notEnrolled) && d.notEnrolled.every(isMfaMember)',
        '&& Array.isArray(d.enrolledUsers) && d.enrolledUsers.every(isMfaMember);');
    // The server: every field the rule asks for, always sent, each a string or a number (a parity pin on the function file).
    const fn = code(read('netlify/functions/clerk-mfa-status.mjs'));
    for (const line of ["const email   = user.emailAddresses?.[0]?.emailAddress || '';", "const role    = roleIn.get(user.id) || 'User';",
        'const userId  = user.id;', "const name    = [user.firstName, user.lastName].filter(Boolean).join(' ') || email;",
        'if (!roleMap[u.role]) roleMap[u.role] = { role: u.role, enrolled: 0, total: 0 };',
        'enrolled:     enrolledCount,', 'notEnrolled:  notEnrolled.map(u => ({ userId: u.userId, email: u.email, name: u.name, role: u.role })),',
        'enrolledUsers: enrolled.map(u => ({ userId: u.userId, email: u.email, name: u.name, role: u.role })),', 'byRole,']) {
        assert.ok(fn.includes(line), `REGRESSION: the server's answer changed shape — the rule reads what it no longer sends: ${line}`);
    }
});

test('Part 12 fixes (U3): Sync from Clerk\'s roster read again — a 200 with no users list said in the banner, never a stale roster passed over in silence — RUN, and WIRING', async () => {
    const SYNCED = 'Synced: 0 added, 0 updated, 2 unchanged';
    for (const roster of [onceOf(200, {}), onceOf(200, { users: 'x' }), onceOf(200, null), onceOf(200, { users: { id: 'usr_1' } }), P11_UNREADABLE()]) {
        const r = await clerkSync({ sync: onceOf(200, { counts: { created: 0, updated: 0, unchanged: 2 } }), roster });
        assert.equal(r.said, `${SYNCED}. The roster could not be read again — reload the page to see it: Its answer could not be read.`,
            'REGRESSION: a roster answer with no list passed over in silence');
        assert.deepEqual(r.roster, [], 'REGRESSION: a roster answer with no list written');
    }
    const late = await clerkSync({ sync: onceOf(200, { counts: { created: 0, updated: 0, unchanged: 2 } }), roster: onceOf(200, {}) }, { switchAt: 1 });
    assert.deepEqual([late.said, late.roster], [SYNCED, []], 'after an org switch nothing more said');
    const landed = await clerkSync({ sync: onceOf(200, { counts: { created: 0, updated: 0, unchanged: 2 } }), roster: onceOf(200, { users: [{ id: 'usr_1' }] }) });
    assert.deepEqual([landed.said, landed.roster], [SYNCED, [{ users: [{ id: 'usr_1' }] }]]);
    const sync = between(code(read(P12A_USERS)), '    const runClerkSync = async () => {', '\n    };');
    order(sync, "await dbFetch('/.netlify/functions/users')", 'if (!r.ok) throw new Error(await readRefusal(r));', 'const ud = await r.json();', 'if (!stillOrg(askedOrg)) return;',
        "if (!Array.isArray(ud?.users)) throw new Error('Its answer could not be read.');", '_setSettings(prev => ({ ...prev, users: ud.users }));');
    assert.ok(!sync.includes('ud && ud.users'), 'REGRESSION: the looser read again is back');
});

test('Part 12 fixes (U3): the invite page\'s notice — the warning tint when its words hold a roster read that failed; green for a clean landed-unread notice — RUN, and WIRING', async () => {
    const ROSTER = () => onceOf(200, { users: [...P12A_SETTINGS().users, { id: 'usr_9', name: 'New', email: 'new@x.test' }] });
    const clean = await inviteSend({ answer: [P11_UNREADABLE(), ROSTER()] });
    assert.deepEqual([clean.warn, clean.told.length], [[false], 1], 'REGRESSION: a clean landed-unread notice drawn as a warning');
    for (const roster of [...P12A_REFUSED().map(([a]) => a), P11_UNREADABLE(), onceOf(200, {})]) {
        const did = await inviteSend({ answer: [P11_UNREADABLE(), roster] });
        assert.deepEqual([did.warn, did.told.length], [[true], 1], 'REGRESSION: a roster read that failed said in the success green');
        assert.ok(did.told[0].includes('The roster could not be read again'));
    }
    const sent = await inviteSend({ answer: onceOf(201, { invited: [{ id: 'usr_9', name: 'New' }], errors: [] }) });
    assert.deepEqual([sent.warn, sent.told], [[], []], 'a send that was read sets no notice');
    const late = await inviteSend({ answer: [P11_UNREADABLE(), UNSENT()], switchAt: 1 });
    assert.deepEqual([late.warn, late.told], [[], []], 'after an org switch nothing said');
    // The box's tint, extracted and run.
    const page = between(code(read(P12A_USERS)), 'const UsersInvitePage = ', '\nconst UsersExportPage = ');
    const style = between(page, '{notice && <div style={{', '}}>{notice}</div>}').slice('{notice && <div style={{'.length);
    const tint = (noticeWarn) => { const st = new Function('noticeWarn', 'T', `return ({${style}});`)(noticeWarn, T); return [st.background, st.border]; };
    assert.deepEqual(tint(true), [`${T.warn}12`, `1px solid ${T.warn}55`], 'REGRESSION: a failed roster read drawn in the success tint');
    assert.deepEqual(tint(false), [`${T.ok}12`, `1px solid ${T.ok}55`]);
    assert.ok(page.includes('const [noticeWarn, setNoticeWarn] = useState(false);'));
    assert.equal(count(page, 'setNoticeWarn('), 1, 'set once, with its words');
    order(page, 'if (!stillOrg(askedOrg)) return;   // a roster read that failed after an org switch says nothing here', 'setNoticeWarn(!reread);', 'setNotice(reread');
});

// ── Part 12 — the review's fixes, round 3 (D3 — Document batch stop) ──
// The review of round 2 (residual D2-1): a record's dropped batch that stopped said only the stop's words — "The
// document was not saved — Forbidden" — naming neither the file refused nor the files after it, never sent. A member who
// dropped the whole batch again wrote every file made before the stop a second time (and a file that may have been made
// too). The stop now says the file it stopped at by its name and its words, and "Not sent: <names> — drop them again";
// a file made, or one that may have been, is never among them (they are said by name above it). A file refused before
// anything is sent (validateFile) is said the same way: nothing was sent, every other file named. The upload rail takes
// one file at a time (a drop's first file, an input without `multiple`) and lets it go once made or maybe made (D2).
// A record's attach with its own validateFile: `invalid` maps a file's name to its words.
const p12fxd3Attach = async (answers, invalid = {}) => {
    const did = { errors: [], notices: [], busy: [], sent: [] };
    const attach = p12aFn(P12FXD_RECORD, '    const attachFiles = async (fileList) => {', '\n    };', '\n    };',
        ['validateFile', 'setError', 'setNotice', 'setBusy', 'createDocument', 'baseName', 'recordLink', 'failureWords', 'sending', 'setHeld', 'onBusy'], 'attachFiles')(
        (f) => invalid[f.name] || null, (v) => did.errors.push(typeof v === 'function' ? v(did.errors.at(-1) ?? null) : v), (v) => did.notices.push(v), (v) => did.busy.push(v),
        async (f) => { did.sent.push(f.name); const a = answers[f.name]; if (a instanceof Error) throw a; return a; },
        // Moved in §0.249 (review fixes, round 4, D4): the batch's sending mark and the held drop's names.
        (n) => n.replace(/\.[^.]+$/, ''), { type: 'account', recordId: 'acc_1' }, failureWords, { current: false }, () => {});
    await attach(Object.keys(answers).map((name) => ({ name, size: 10, type: 'application/pdf' })));
    return did;
};
// The names a red box's "Not sent:" line gives, or [] when it has none.
const p12fxd3Unsent = (words) => {
    const line = String(words || '').split('\n').find((l) => l.startsWith('Not sent: '));
    return line ? line.slice('Not sent: '.length, -' — drop them again'.length).split(', ') : [];
};

test('Part 12 fixes, round 3 (D3): a record\'s Documents — a batch that stops names the file it stopped at with its words, and the files never sent by theirs; no file made, or that may have been, is among them — RUN', async () => {
    const DOC = { id: 'doc_y' };
    const made = (await p12fxdThrown({ record: P11_UNREADABLE() })).e;
    const maybe = (await p12fxdThrown({ record: onceOf(500, { error: 'Internal server error', requestId: 'r1' }) })).e;
    const own = (await p12fxdThrown({ record: onceOf(403, { error: 'Forbidden' }) })).e;
    const presign = (await p12fxdThrown({ presign: onceOf(500, { error: 'Internal server error', requestId: 'r2' }) })).e;
    const r2 = (await p12fxdThrown({ r2: { status: 403 } })).e;
    // Made, maybe, then the refusal, then two never sent: each said by its name and its outcome.
    const mid = await p12fxd3Attach({ 'a.pdf': made, 'b.pdf': maybe, 'c.pdf': own, 'd.pdf': DOC, 'e.pdf': DOC });
    assert.deepEqual([mid.sent, mid.notices.at(-1), mid.errors.at(-1)], [['a.pdf', 'b.pdf', 'c.pdf'], `a.pdf: ${P12FXD_MADE}`,
        `b.pdf: ${P12FXD2_MAYBE}: Internal server error (ref r1)\nc.pdf: The document was not saved — Forbidden\nNot sent: d.pdf, e.pdf — drop them again`],
        'REGRESSION: the stop names neither the file refused nor the files never sent — the batch dropped again writes the made files twice');
    assert.deepEqual(p12fxd3Unsent(mid.errors.at(-1)), ['d.pdf', 'e.pdf'], 'REGRESSION: a file made, maybe made or refused named as never sent');
    // Saved before the stop (read): not named as never sent either — it is in the list.
    const saved = await p12fxd3Attach({ 'a.pdf': DOC, 'b.pdf': r2, 'c.pdf': DOC });
    assert.deepEqual([saved.sent, saved.errors, saved.notices], [['a.pdf', 'b.pdf'], [null, 'b.pdf: The file was not stored — The server returned 403.\nNot sent: c.pdf — drop them again'], [null]]);
    // Stopped at the first file: every other file never sent, in the order dropped.
    const first = await p12fxd3Attach({ 'a.pdf': presign, 'b.pdf': DOC, 'c.pdf': DOC });
    assert.deepEqual([first.sent, first.errors], [['a.pdf'], [null, 'a.pdf: The upload could not start — Internal server error (ref r2)\nNot sent: b.pdf, c.pdf — drop them again']]);
    // Stopped at the last file: nothing never sent, no "Not sent" line.
    const last = await p12fxd3Attach({ 'a.pdf': DOC, 'b.pdf': made, 'c.pdf': own });
    assert.deepEqual([last.sent, last.errors, last.notices], [['a.pdf', 'b.pdf', 'c.pdf'], [null, 'c.pdf: The document was not saved — Forbidden'], [null, `b.pdf: ${P12FXD_MADE}`]],
        'REGRESSION: an empty "Not sent" line');
    // A thrown runtime failure: its plain words, still by name.
    const thrown = await p12fxd3Attach({ 'a.pdf': new TypeError('Failed to fetch'), 'b.pdf': DOC });
    assert.deepEqual(thrown.errors, [null, 'a.pdf: The server could not be reached.\nNot sent: b.pdf — drop them again']);
    // No stop: no file named as refused or never sent.
    const ok = await p12fxd3Attach({ 'a.pdf': DOC, 'b.pdf': made });
    assert.deepEqual([ok.errors, ok.notices.at(-1)], [[null], `b.pdf: ${P12FXD_MADE}`]);
});

test('Part 12 fixes, round 3 (D3): a record\'s Documents — a file refused before anything is sent is named, and every other file named as never sent — RUN', async () => {
    const DOC = { id: 'doc_y' };
    const bad = await p12fxd3Attach({ 'a.pdf': DOC, 'x.exe': DOC, 'b.pdf': DOC }, { 'x.exe': 'Unsupported file type: .exe' });
    // Moved in §0.249 (review fixes, round 4, D4): a refused drop clears the last batch's notice, as a batch that sends does.
    assert.deepEqual([bad.sent, bad.errors, bad.busy, bad.notices], [[], ['x.exe: Unsupported file type: .exe\nNot sent: a.pdf, b.pdf — drop them again'], [], [null]],
        'REGRESSION: the refused file not named, or the files never sent not said — the member thinks the others went');
    const one = await p12fxd3Attach({ 'big.pdf': DOC }, { 'big.pdf': 'File exceeds the 50 MB limit' });
    assert.deepEqual([one.sent, one.errors], [[], ['big.pdf: File exceeds the 50 MB limit']]);
});

test('Part 12 fixes, round 3 (D3): WIRING — the stop names its file and the files after it; the upload rail takes one file at a time', () => {
    const record = code(read(P12FXD_RECORD));
    const attach = between(record, '    const attachFiles = async (fileList) => {', '\n    };');
    order(attach, "const stopWords = (f, words, unsent) => [`${f.name}: ${words}`, ...(unsent.length ? [`Not sent: ${unsent.map((u) => u.name).join(', ')} — drop them again`] : [])].join('\\n');",
        // Moved in §0.249 (review fixes, round 4, D4): every file checked, each refused by its name, only the fine named unsent.
        'const said = refused.map(([f, words], i) => stopWords(f, words, i === refused.length - 1 ? fine : [])).join(\'\\n\');',
        'setNotice(null); setHeld(null); setError(said);',
        'let at = 0;', 'for (; at < files.length; at += 1) {', 'const f = files[at];',
        'setError(stopWords(files[at], failureWords(e), files.slice(at + 1)));', '} finally {');
    assert.equal(count(attach, 'setError('), 4, 'the stop, the refusal before sending, the clear and the maybe lines');
    // The rail: a drop's first file and an input without `multiple` — no batch to stop.
    const rail = code(read(P12FXD_RAIL));
    assert.ok(rail.includes('pickFile(e.dataTransfer.files?.[0]);') && rail.includes('onChange={(e) => pickFile(e.target.files?.[0])}'));
    assert.ok(!/\bmultiple\b/.test(rail), 'REGRESSION: the rail takes many files — a batch with no stop words');
});

// ── Part 12 — the review's fixes, round 3 (I3 — Invitation import) ──
// The verifier's three residuals of I2. (1) A roster read again that LANDS says who of a request answered unread was
// invited: each address of it on the roster (trimmed, any case — as userConflicts compares) is counted sent, each not
// on it a "Not invited" row — "The answer could not be read, and they are not on the roster — not invited." — so the
// receipt says exact counts, never "up to"; only a roster read that fails leaves them unread ("up to N … some may have
// been refused", with the reload words). The rule is importReceipt.js unreadOnRoster, pure. (2) The Results' tile for
// the ones left unread says what a 201 proves: "up to N" over "sent or refused — answer unread" (one alone was sent:
// "sent — answer unread"), never a bare N "sent". (3) A person is "they" / "them", never "it".
const P12FXI3_ROSTER = Object.freeze([{ id: 'usr_a', email: ' P0@X.Test ', name: 'p0' }, { id: 'usr_b', email: 'p1@x.test', name: 'p1' }]);

test('Part 12 fix I3: unreadOnRoster — each sent unread on the roster read again (by address, trimmed, any case) was invited; each not on it a "Not invited" row in plain words — RUN', async () => {
    const { unreadOnRoster, NOT_ON_ROSTER } = await import('../src/utils/importReceipt.js');
    assert.equal(NOT_ON_ROSTER, 'The answer could not be read, and they are not on the roster — not invited.');
    assert.ok(!/\bit\b/.test(NOT_ON_ROSTER), 'a person is "they", never "it"');
    const sent = [{ email: 'p0@x.test', teamId: 't1' }, { email: 'p1@x.test' }, { email: 'p2@x.test' }];
    const roster = [...P12FXI3_ROSTER, { id: 'usr_old', email: 'old@x.test' }, { id: 'usr_z' }];
    // Moved in round 4 (I4): the rule takes each request apart; two of one request on the roster are onRoster (not proven).
    const out = unreadOnRoster([sent], roster);
    assert.deepEqual(out.onRoster, [sent[0], sent[1]], 'REGRESSION: an address on the roster in another case or spacing read as not invited');
    assert.deepEqual(out.notInvited, [{ email: 'p2@x.test', error: NOT_ON_ROSTER }], 'REGRESSION: one not on the roster counted as invited');
    assert.equal(out.invited.length + out.onRoster.length + out.notInvited.length, sent.length, 'each sent unread counted once');
    // A roster row with no address is no invitation's match, nor one with none.
    assert.deepEqual(unreadOnRoster([[{ email: '' }]], [{ id: 'usr_z' }]), { invited: [], onRoster: [], notInvited: [{ email: '', error: NOT_ON_ROSTER }] },
        'REGRESSION: a roster row with no address taken as an invitation sent');
    // Nothing read: none invited, never a throw.
    assert.deepEqual(unreadOnRoster([[{ email: 'a@x.test' }]], null), { invited: [], onRoster: [], notInvited: [{ email: 'a@x.test', error: NOT_ON_ROSTER }] });
    assert.deepEqual(unreadOnRoster(null, roster), { invited: [], onRoster: [], notInvited: [] });
});

test('Part 12 fix I3: the invitation import — a roster read again that lands counts the ones sent unread exactly: on it sent, not on it a "Not invited" row; the receipt says no "up to" — RUN', async () => {
    const { describeReceipt, isClean, isPartial, NOT_ON_ROSTER } = await import('../src/utils/importReceipt.js');
    const lit = code(read(P12FXI_MODAL)).match(/describeReceipt\(r, 'invitation', (\{[^}]*\})\)/);
    const words = new Function(`return ${lit[1]};`)();
    // p0..p9 the first request (answered unread; p0, p4, p8 name East), p10 sent and p11 refused by the second.
    const r = await p12fxI2Import({ invites: p12fxIPeople(12, 4), roster: onceOf(200, { users: P12FXI3_ROSTER }), posts: [
        p12fxIUnreadable(), onceOf(201, { invited: [{ id: 'usr_10', email: 'p10@x.test', teamId: 't1' }], errors: [{ email: 'p11@x.test', error: 'x' }] }),
    ] });
    const rc = r.out.receipt;
    // Moved in round 4 (I4): p0 and p1 (two of one request) are on the roster — invited by this import or before it.
    assert.deepEqual([rc.unread, rc.onRoster, rc.created, rc.failed, rc.error, rc.attempted], [2, 2, 1, 9, null, 12],
        'REGRESSION: a roster that landed left the ones sent unread at "up to" — or counted the ones not on it as sent');
    p12fxIInvariant(rc);
    assert.deepEqual(r.out.refusals, [{ email: 'p11@x.test', error: 'x' },
        ...['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].map(p => ({ email: `${p}@x.test`, error: NOT_ON_ROSTER }))],
        'REGRESSION: the ones not on the roster named nowhere — the Admin cannot tell which to fix');
    assert.equal(describeReceipt(rc, 'invitation', words), '1 invitation sent, 2 on the roster — invited by this import or before it. 9 not sent.');
    assert.ok(!/up to|some may have been refused|reload/.test(describeReceipt(rc, 'invitation', words) + (r.out.warning || '')), 'exact counts, nothing to reload');
    assert.deepEqual([isClean(rc), isPartial(rc)], [false, true]);
    // Of the three that named a team only p0 was invited: one person on no team's list, "they".
    // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
    assert.equal(r.out.warning, "1 whose answer could not be read named a team — check on the Teams page that they are on its list.",
        'REGRESSION: the ones not invited counted as on no team\'s list');
    assert.deepEqual(r.teams, [{ id: 't1', name: 'East', repIds: ['usr_10'] }], 'only the rows the server named join the team list');
    // Every one on the roster: all sent, none unread, nothing not invited by this rule.
    const all = await p12fxI2Import({ invites: p12fxIPeople(3), posts: [p12fxIUnreadable()],
        roster: onceOf(200, { users: p12fxIPeople(3).map((v, i) => ({ id: `usr_${i}`, email: v.email.toUpperCase() })) }) });
    // Moved in round 4 (I4): every one on the roster, three of one request — on it, invited by this import or before it;
    // the 201 proves one was, so some sent, never clean.
    assert.deepEqual([all.out.receipt.unread, all.out.receipt.onRoster, all.out.receipt.created, all.out.receipt.failed, all.out.refusals, all.out.warning], [3, 3, 0, 0, [], null]);
    assert.deepEqual([isClean(all.out.receipt), isPartial(all.out.receipt)], [false, true], 'on the roster, not proven: Some Invitations Sent');
    // None on the roster: none sent, each named.
    const none = await p12fxI2Import({ invites: p12fxIPeople(2), posts: [p12fxIUnreadable()], roster: onceOf(200, { users: P12FXI2_HELD }) });
    assert.deepEqual([none.out.receipt.unread, none.out.receipt.created, none.out.receipt.failed, none.out.refusals.map(f => f.email)], [0, 0, 2, ['p0@x.test', 'p1@x.test']]);
    // The roster read fails: they stay unread — "up to", some may have been refused — and none is named "Not invited".
    for (const [roster, why] of [[onceOf(500, { error: 'Internal server error', requestId: 'r1' }), 'Internal server error (ref r1)'], [UNSENT(), 'The server could not be reached.'],
        [P11_UNREADABLE(), 'Its answer could not be read.']]) {
        const f = await p12fxI2Import({ invites: p12fxIPeople(10), posts: [p12fxIUnreadable()], roster });
        assert.deepEqual([f.out.receipt.unread, f.out.receipt.created, f.out.receipt.failed, f.out.refusals], [10, 0, 0, []], `REGRESSION: ${why}`);
        assert.equal(describeReceipt(f.out.receipt, 'invitation', words), 'Up to 10 invitations sent — the answer could not be read; some may have been refused.');
        assert.equal(f.out.warning, `The roster could not be read again — reload the page to see the invitations sent: ${why}`);
    }
});

test('Part 12 fix I3: the team sentence names a person "they" / "them", never "it" — over a roster that landed and one that failed — RUN', async () => {
    const landed = await p12fxI2Import({ invites: p12fxIPeople(1, 1), posts: [p12fxIUnreadable()], roster: onceOf(200, { users: P12FXI3_ROSTER }) });
    // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
    assert.equal(landed.out.warning, "1 whose answer could not be read named a team — check on the Teams page that they are on its list.");
    const failed = await p12fxI2Import({ invites: p12fxIPeople(1, 1), posts: [p12fxIUnreadable()], roster: UNSENT() });
    assert.equal(failed.out.warning, 'The roster could not be read again — reload the page to see the invitation sent: The server could not be reached. '
        // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
        + "1 whose answer could not be read named a team — reload the page, then check on the Teams page that they are on its list.");
    const many = await p12fxI2Import({ invites: p12fxIPeople(10, 4), posts: [p12fxIUnreadable()], roster: UNSENT() });
    // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
    assert.ok(many.out.warning.endsWith("3 whose answers could not be read named a team — reload the page, then check on the Teams page that they are on their teams' lists."));
    for (const w of [landed.out.warning, failed.out.warning, many.out.warning]) assert.ok(!/\bit\b/.test(w), `REGRESSION: a person named "it" — ${w}`);
});

test('Part 12 fix I3: the Results\' tile for the ones left unread says "up to N" over "sent or refused — answer unread"; one alone sent; none over a roster that landed — RUN', async () => {
    const { emptyReceipt } = await import('../src/utils/importReceipt.js');
    const ten = (await p12fxI2Tiles({ ...emptyReceipt(), attempted: 12, created: 1, failed: 1, unread: 10 })).find(t => t.label.includes('answer unread'));
    assert.deepEqual([ten.n, ten.upTo, ten.label, ten.color], [10, true, 'sent or refused — answer unread', T.warn], 'REGRESSION: a bare 10 "sent" beside "up to 10 … some may have been refused"');
    const one = (await p12fxI2Tiles({ ...emptyReceipt(), attempted: 1, unread: 1 })).find(t => t.label.includes('answer unread'));
    assert.deepEqual([one.n, one.upTo, one.label], [1, false, 'sent — answer unread'], 'one alone: a 201 says it was sent');
    // The tiles still add up to everyone attempted, by their counts.
    const tiles = await p12fxI2Tiles({ ...emptyReceipt(), attempted: 12, created: 1, failed: 1, unread: 10 });
    assert.equal(tiles.reduce((a, t) => a + t.n, 0), 12);
    assert.equal(new Set(tiles.map(t => t.label)).size, tiles.length, 'each tile its own key');
    // A roster that landed leaves none unread: no such tile.
    assert.ok(!(await p12fxI2Tiles({ ...emptyReceipt(), attempted: 12, created: 3, failed: 9 })).some(t => t.label.includes('answer unread')));
    // The count drawn: "up to N" where the tile says so, else the count.
    const m = code(read(P12FXI_MODAL));
    const DRAW = "<div style={{ fontSize: '22px', fontWeight: '700', color: t.color }}>{t.upTo ? `up to ${t.n}` : t.n}</div>";
    assert.ok(m.includes(DRAW), 'REGRESSION: the tile draws a bare N');
    const shown = (t) => new Function('t', 'return t.upTo ? `up to ${t.n}` : t.n;')(t);
    assert.deepEqual([shown(ten), shown(one)], ['up to 10', 1]);
});

test('Part 12 fix I3: WIRING — the roster taken only once its shape is read; its count after the org check and before the team save; the rule imported', () => {
    const l = code(read(P12FXI_LAYER));
    assert.ok(/emptyReceipt, unreadOnRoster,\n\} from '\.\.\/\.\.\/utils\/importReceipt';/.test(l), 'REGRESSION: the rule not imported — the import throws once a roster lands');
    const h = between(l, 'onImportUsers={async (invites) => {', 'return { receipt, refusals, warning };');
    // Moved in round 4 (I4): each request apart (push(chunk)), flattened for the team count; the ones on the roster
    // left unread as onRoster, and counted with the invited for the team sentence.
    order(h, 'receipt.unread += chunk.length;', 'sentUnread.push(chunk);', 'continue;', "if (!Array.isArray(ud?.users)) throw new Error('Its answer could not be read.');",
        'setSettings(prev => ({ ...prev, users: ud.users }));', 'roster = ud.users;', '} catch (e) { rosterWhy = failureWords(e); }', 'if (!stillOrg(askedOrg)) return stopped();',
        'let teamless = sentUnread.flat();', 'if (roster) {', 'const { invited, onRoster, notInvited } = unreadOnRoster(sentUnread, roster);', 'receipt.created += invited.length;',
        'receipt.failed += notInvited.length;', 'receipt.unread = onRoster.length;', 'receipt.onRoster = onRoster.length;', 'refusals.push(...notInvited);', 'teamless = [...invited, ...onRoster];',
        'const unreadTeams = teamless.filter(v => v && v.teamId).length;', "const added = await addToSettingsList('teams'");
    assert.equal(count(h, 'unreadOnRoster('), 1, 'one count by the roster');
    assert.ok(!/\bit\b/.test(between(h, 'if (unreadTeams) warning', '\n')), 'REGRESSION: a person named "it"');
});

// ── Part 12 — the review's fixes, round 3 (C3 — Calendar) ──
// The verifier's two residuals of round 2 (state §0.249). (1) App's calendar read kept every answer: a Refresh sent
// before a Disconnect's DELETE could answer after it and write connected:true and the deleted connection's events back,
// and an older read's finally cleared a newer read's flag. App keeps only its latest read now (calendarReadGen, as the
// list hooks' loadGen); a landed Disconnect moves it on (dropCalendarReads); Disconnect is not offered while a read is in
// flight, and its title says why. (2) A calendar never read in this org was drawn "not connected": calendarConnected's
// false is only its starting value. calendarRead (org-bound, set when a read lands) now stands before every "not
// connected": the profile panel's Calendar tab and Tasks' calendar view start a read when none has landed and none is in
// flight, and Home, Tasks and the panel say they are checking until one lands — Home's first frame too.
const P12FXC3_APP = 'src/App.jsx';
const p12fxC3Ev = { id: 'ev_9', summary: 'Old connection meeting' };
const P12FXC3_FETCH_PARAMS = ['requestOrg', 'stillOrg', 'setCalendarLoading', 'setCalendarError', 'waitForToken', 'dbFetch', 'readRefusal', 'failureWords',
    'setCalendarConnected', 'setCalendarEvents', 'calendarReadGen', 'setCalendarRead'];
const P12FXC3_DISCONNECT_PARAMS = ['calConn', 'requestOrg', 'stillOrg', 'setDisconnecting', 'setCalActionError', 'dbFetch', 'readRefusal', 'failureWords', 'setCalConn',
    'fetchCalendarEvents', 'setCalendarConnected', 'setCalendarEvents', 'setCalDisconnected', 'dropCalendarReads', 'calendarLoading'];
// App's dropCalendarReads, built from its own source over the sequence handed in.
const p12fxC3Drop = (gen) => new Function('calendarReadGen',
    `${between(code(read(P12FXC3_APP)), '    const dropCalendarReads = ', ';\n')};\nreturn dropCalendarReads;`)(gen);
// One shared state and App's own calendar read over it: each GET takes the next of `reads` ({ answer, gate }), a DELETE
// `del` ({ answer, gate }); a gate holds the answer until released.
const p12fxC3Build = (st, { reads = [], del = null } = {}) => {
    const org = { now: 'org_a' };
    const gen = { current: 0 };
    const queue = [...reads];
    const dbFetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        st.sent.push(method);
        const step = method === 'DELETE' ? del : queue.shift();
        if (step.gate) await step.gate.held;
        if (step.answer instanceof Error) throw step.answer;
        return step.answer;
    };
    const fetchCal = p12aFn(P12FXC3_APP, '    const fetchCalendarEvents = async () => {', '\n    };', '\n    };', P12FXC3_FETCH_PARAMS, 'fetchCalendarEvents')(
        () => 'org_a', (o) => o === org.now, (v) => { st.loading = v; }, (v) => { st.error = v; }, async () => {}, dbFetch, readRefusal, failureWords,
        (v) => { st.connected = v; }, (v) => { st.events = v; }, gen, (v) => { st.read = v; });
    return { org, gen, dbFetch, fetchCal };
};
const p12fxC3State = (over = {}) => ({ connected: true, events: [p12fxC3Ev], error: null, loading: false, disconnected: false, conn: { id: 'cc_1' },
    said: [], sent: [], read: true, ...over });
const p12fxC3Now = (st) => [st.connected, st.events, st.error, st.loading, st.read];

test('Part 12 fix C3: App keeps only its latest calendar read — an older answer, landed, refused or unsent, is dropped, and its finally never clears the newer read\'s flag — RUN', async () => {
    for (const [older, what] of [[onceOf(200, { connected: true, events: [p12fxC3Ev] }), 'landed'], [onceOf(500, { error: 'x', requestId: 'r1' }), 'refused'],
        [UNSENT(), 'unsent'], [P11_UNREADABLE(), 'unreadable']]) {
        // The older answers while the newer is in flight: nothing it says is kept, and the flag stays the newer's.
        const st = p12fxC3State({ connected: false, events: [], read: false });
        const g1 = p11Gate(), g2 = p11Gate();
        const { fetchCal } = p12fxC3Build(st, { reads: [{ gate: g1, answer: older }, { gate: g2, answer: onceOf(200, { connected: false, events: [] }) }] });
        const r1 = fetchCal();
        const r2 = fetchCal();
        g1.release();
        await r1;
        assert.deepEqual(p12fxC3Now(st), [false, [], null, true, false],
            `REGRESSION: an older read's answer kept, or its finally cleared the newer read's flag — ${what}`);
        g2.release();
        await r2;
        assert.deepEqual(p12fxC3Now(st), [false, [], null, false, true], `the newer read's answer — ${what}`);
    }
    // The newer answers first: the older, answering after it, is dropped.
    const st = p12fxC3State({ connected: false, events: [], read: false });
    const g1 = p11Gate(), g2 = p11Gate();
    const { fetchCal } = p12fxC3Build(st, { reads: [{ gate: g1, answer: onceOf(200, { connected: true, events: [p12fxC3Ev] }) },
        { gate: g2, answer: onceOf(200, { connected: false, events: [] }) }] });
    const r1 = fetchCal();
    const r2 = fetchCal();
    g2.release();
    await r2;
    g1.release();
    await r1;
    assert.deepEqual(p12fxC3Now(st), [false, [], null, false, true], 'REGRESSION: an older read written over the latest');
    // One read alone is kept, as before.
    const one = p12fxC3State({ connected: false, events: [], read: false });
    await p12fxC3Build(one, { reads: [{ answer: onceOf(200, { connected: true, events: [p12fxC3Ev] }) }] }).fetchCal();
    assert.deepEqual(p12fxC3Now(one), [true, [p12fxC3Ev], null, false, true]);
});

test('Part 12 fix C3: a calendar read that lands marks the org\'s calendar read — connected or not; a refusal, a failure, an unreadable answer or an org switch never does — RUN', async () => {
    assert.deepEqual((await p12bCalendar({ answer: onceOf(200, { events: [], connected: false }) })).read, [true], 'REGRESSION: a landed "not connected" never marked read');
    assert.deepEqual((await p12bCalendar({ answer: onceOf(200, { events: [p12fxC3Ev] }) })).read, [true], 'REGRESSION: a landed connection never marked read');
    for (const [answer, words] of [...p12bRefused(), [P11_UNREADABLE(), 'Its answer could not be read.']]) {
        const r = await p12bCalendar({ answer });
        assert.deepEqual([r.read, r.said], [[], [`The calendar could not be read — ${words}`]], `REGRESSION: a read that failed taken as read — ${words}`);
    }
    for (const answer of [onceOf(200, { events: [p12fxC3Ev] }), onceOf(200, { connected: false }), onceOf(500, { error: 'x' })]) {
        assert.deepEqual((await p12bCalendar({ answer, switchOrg: true })).read, [], 'REGRESSION: the last org\'s read marked the new org\'s calendar read');
    }
});

test('Part 12 fix C3: a landed Disconnect moves App\'s read sequence on — a read sent before the DELETE never writes the deleted connection or its events back, however the answers fall — RUN', async () => {
    // App's own dropCalendarReads moves the sequence on.
    const g = { current: 4 };
    p12fxC3Drop(g)();
    assert.equal(g.current, 5, 'REGRESSION: dropCalendarReads leaves the sequence where it was');
    const run = async ({ reread, staleFirst, refetch = true }) => {
        const st = p12fxC3State();
        const gDel = p11Gate(), gStale = p11Gate(), gRe = p11Gate();
        const { gen, dbFetch, fetchCal } = p12fxC3Build(st, {
            reads: [{ gate: gStale, answer: onceOf(200, { connected: true, events: [p12fxC3Ev] }) }, { gate: gRe, answer: reread }],
            del: { gate: gDel, answer: onceOf(200, { ok: true }) } });
        const disconnect = p12aFn(P12B_HEADER, '    const disconnectCalendar = async () => {', '\n    };', '\n    };', P12FXC3_DISCONNECT_PARAMS, 'disconnectCalendar')(
            st.conn, () => 'org_a', () => true, () => {}, (v) => { if (v) st.said.push(v); }, dbFetch, readRefusal, failureWords,
            (v) => { st.conn = v; }, refetch ? fetchCal : null, (v) => { st.connected = v; }, (v) => { st.events = v; }, (v) => { st.disconnected = v; },
            p12fxC3Drop(gen), false);
        const pressed = disconnect();        // pressed with no read in flight
        await settle();
        const stale = fetchCal();            // a Refresh while the DELETE is out
        await settle();
        gDel.release();
        await settle();
        if (staleFirst) { gStale.release(); await stale; await settle(); gRe.release(); }
        else { gRe.release(); await settle(); gStale.release(); }
        await pressed;
        await stale;
        await settle();
        return { st, panel: p12fxCPanel({ loading: st.loading, error: st.error, connected: st.connected, conn: st.conn, disconnected: st.disconnected, read: st.read }) };
    };
    for (const staleFirst of [false, true]) {
        for (const [reread, words] of [[onceOf(502, { error: 'Bad gateway', requestId: 'r7' }), 'Bad gateway (ref r7)'], [P11_PAGE(), 'The server returned 502.'], [UNSENT(), 'The server could not be reached.']]) {
            const { st, panel } = await run({ reread, staleFirst });
            assert.deepEqual([st.connected, st.events, st.disconnected, st.loading, st.error], [false, [], true, false, `The calendar could not be read — ${words}`],
                `REGRESSION: a read sent before the DELETE wrote the deleted connection back — ${staleFirst ? 'it answered first' : 'it answered last'}, ${words}`);
            assert.deepEqual(panel, { status: 'Disconnected', pill: 'OFF', connect: true, refresh: false, count: false });
        }
        const { st } = await run({ reread: onceOf(200, { connected: false, events: [] }), staleFirst });
        assert.deepEqual([st.connected, st.events, st.error, st.loading], [false, [], null, false],
            'REGRESSION: the deleted connection\'s meetings back on Home with no error at all');
    }
    // No re-read to overtake it: the drop alone keeps the stale Refresh out.
    const { st } = await run({ reread: null, staleFirst: true, refetch: false });
    assert.deepEqual([st.connected, st.events, st.disconnected], [false, [], true], 'REGRESSION: the DELETE moved nothing on — the stale read wrote the connection back');
    // The drop comes before the re-read, landed only.
    const landed = await p12bHeaderDisconnect({ answer: onceOf(200, { ok: true }) });
    assert.equal(landed.dropAt.length, 1, 'REGRESSION: a landed Disconnect never moves the read sequence on');
    assert.ok(landed.dropAt[0] <= landed.steps.indexOf('refetch'), 'dropped before the re-read is sent');
    for (const [answer] of p12bRefused()) assert.deepEqual((await p12bHeaderDisconnect({ answer })).dropAt, [], 'a refused Disconnect drops nothing');
    assert.deepEqual((await p12bHeaderDisconnect({ answer: onceOf(200, { ok: true }), switchOrg: true })).dropAt, [], 'nor one answered after a switch');
});

test('Part 12 fix C3: Disconnect is not offered while a calendar read is in flight — the press does nothing, the button is disabled and its title says why — RUN', async () => {
    const r = await p12bHeaderDisconnect({ answer: onceOf(200, { ok: true }), loading: true });
    assert.deepEqual([r.sent, r.busy, r.conn, r.connected, r.dropAt, r.refetched], [[], [], [], [], [], 0],
        'REGRESSION: a Disconnect sent while a read was in flight');
    const s = code(read(P12B_HEADER));
    const btn = between(s, '<button onClick={disconnectCalendar}', 'style={{');
    const disabled = btn.match(/disabled=\{([^}]*)\}/);
    const title = btn.match(/title=\{([\s\S]*)\}\s*$/);
    assert.ok(disabled && title, 'the Disconnect button\'s disabled and title');
    const style = between(s, '<button onClick={disconnectCalendar}', "{disconnecting ? 'Disconnecting…'");
    const cursor = style.match(/cursor: \(([^)]*)\) \? 'default'/);
    const opacity = style.match(/opacity: \(([^)]*)\) \? 0\.5/);
    assert.ok(cursor && opacity, 'its cursor and opacity');
    const button = new Function('disconnecting', 'calConn', 'calendarLoading', 'calConnLoaded',
        `return { disabled: !!(${disabled[1]}), title: ${title[1]}, cursorOff: !!(${cursor[1]}), dim: !!(${opacity[1]}) };`);
    const C = { id: 'cc_1' };
    assert.deepEqual(button(false, C, true, true),
        { disabled: true, title: 'The calendar is being read — Disconnect is offered once that read answers.', cursorOff: true, dim: true },
        'REGRESSION: Disconnect offered while a calendar read is in flight, or its title silent on why');
    assert.deepEqual(button(false, C, false, true), { disabled: false, title: undefined, cursorOff: false, dim: false });
    assert.deepEqual(button(true, C, true, true), { disabled: true, title: undefined, cursorOff: true, dim: true }, 'its own re-read: "Disconnecting…" says it');
    assert.equal(button(false, null, false, true).title, 'No stored connection found to disconnect');
    assert.equal(button(false, null, true, false).title, 'Loading connection…');
});

test('Part 12 fix C3: the profile panel — a calendar never read in this org is "Checking…", "—", no Connect; never "Not connected" or OFF before a read lands — RUN', () => {
    const ERR = 'The calendar could not be read — The server returned 502.';
    assert.deepEqual(p12fxCPanel({ connected: false, read: false }),
        { status: 'Checking…', pill: '—', connect: false, refresh: true, count: false },
        'REGRESSION: "Not connected", OFF and "Connect Google Calendar" over a calendar never read');
    assert.deepEqual(p12fxCPanel({ loading: true, connected: false, read: false }),
        { status: 'Checking…', pill: '—', connect: false, refresh: true, count: false });
    assert.deepEqual(p12fxCPanel({ error: ERR, connected: false, read: false }),
        { status: 'Could not be read', pill: '—', connect: false, refresh: true, count: false }, 'a failed first read keeps round 2\'s words');
    assert.deepEqual(p12fxCPanel({ connected: false, disconnected: true, read: false }),
        { status: 'Disconnected', pill: 'OFF', connect: true, refresh: false, count: false }, 'a landed Disconnect is known');
    assert.deepEqual(p12fxCPanel({ connected: false, read: true }),
        { status: 'Not connected', pill: 'OFF', connect: true, refresh: false, count: false }, 'a read that found none offers Connect');
});

test('Part 12 fix C3: the profile panel\'s Calendar tab starts a read when none has landed and none is in flight — never over a landed one, one in flight or a failure, nor while closed or on another tab — RUN', () => {
    const s = code(read(P12B_HEADER));
    const eff = between(s, '    }, [showProfilePanel, profilePanelTab, calConnLoaded, loadCalConnection]);\n', ']);\n').slice(
        '    }, [showProfilePanel, profilePanelTab, calConnLoaded, loadCalConnection]);\n'.length) + ']);';
    const run = (open, tab, read, loading, error) => {
        let fetched = 0, deps = null;
        new Function('useEffect', 'showProfilePanel', 'profilePanelTab', 'calendarRead', 'calendarLoading', 'calendarError', 'fetchCalendarEvents', eff)(
            (fn, d) => { deps = d; fn(); }, open, tab, read, loading, error, () => { fetched++; });
        return { fetched, deps };
    };
    assert.deepEqual(run(true, 'calendar', false, false, null), { fetched: 1, deps: [true, 'calendar', false, false, null] },
        'REGRESSION: a calendar never read in this org left unread on the Calendar tab — or the effect not re-run when a switch puts its read back');
    assert.equal(run(true, 'calendar', true, false, null).fetched, 0, 'a read landed: none started');
    assert.equal(run(true, 'calendar', false, true, null).fetched, 0, 'REGRESSION: a second read over one in flight');
    assert.equal(run(true, 'calendar', false, false, 'The calendar could not be read — x').fetched, 0, 'REGRESSION: a failed read retried on its own, without end');
    assert.equal(run(false, 'calendar', false, false, null).fetched, 0, 'the panel closed');
    assert.equal(run(true, 'email', false, false, null).fetched, 0, 'another tab');
});

test('Part 12 fix C3: Home\'s calendar strip — a calendar never read in this org is "Checking your calendar…" from the first frame, never "Connect your calendar…" — RUN', () => {
    const home = code(read(P12FXC_HOME));
    assert.ok(home.includes('calendarEvents, calendarConnected, calendarLoading, calendarError, fetchCalendarEvents, calendarRead,'), 'REGRESSION: Home never reads calendarRead');
    const strip = p12fxC2Chain(between(home, '{calendarError ? (', 'Refreshing…</span>'), /(?:^\{|\n\s*\) : )(?:([^\n?]+?) \? )?\(\n/g,
        { error: '{calendarError}', checking: 'Checking your calendar…', connect: 'Connect your calendar to see', connected: 'Calendar connected — no meetings today' },
        ['calendarError', 'calendarLoading', 'calendarConnected', 'calendarRead']);
    assert.equal(strip({ calendarConnected: false, calendarRead: false }), 'checking',
        'REGRESSION: "Connect your calendar…" painted before the first read is sent, or over a calendar never read');
    assert.equal(strip({ calendarLoading: true, calendarConnected: false, calendarRead: false }), 'checking');
    assert.equal(strip({ calendarError: 'The calendar could not be read — x', calendarConnected: false, calendarRead: false }), 'error', 'a failed read keeps its words');
    assert.equal(strip({ calendarConnected: false, calendarRead: true }), 'connect', 'a read that found none offers Connect');
    assert.equal(strip({ calendarConnected: true, calendarRead: true }), 'connected');
    // App's Home effect starts the read on Home (auth-gated-loads pins it): Home draws checking until it lands.
    const app = code(read(P12FXC3_APP));
    assert.ok(app.includes("if (activeTab === 'home' && !calendarFetchAttempted.current && (switched || !calendarLoading)) {"));
});

test('Part 12 fix C3: Tasks\' calendar view — a calendar never read in this org is checking, never "Calendar not connected"; the view starts a read when none has landed and none is in flight — RUN and WIRING', () => {
    const tasks = code(read(P12FXC_TASKS));
    assert.ok(/function CalendarView\(\{[^}]*\bcalendarRead\b[^}]*\}\)/.test(tasks), 'REGRESSION: CalendarView never takes calendarRead (module scope)');
    assert.ok(tasks.includes('calendarRead={calendarRead}'), 'REGRESSION: CalendarView never told whether a read landed');
    assert.ok(/calendarEvents, calendarConnected, calendarLoading, calendarError,\s*calendarRead, fetchCalendarEvents,/.test(tasks), 'Tasks reads calendarRead and the read');
    const rail = p12fxC2Chain(between(tasks, '{calendarError\n', 'Calendar not connected</div>)') + 'Calendar not connected', /(?:^\{|\n\s*: )(?:([^\n?]+?)\n\s*\? )?\(/g,
        { error: '{calendarError}', synced: 'Synced', checking: 'Checking the calendar…', notConnected: 'Calendar not connected' },
        ['calendarError', 'calendarLoading', 'calendarConnected', 'calendarRead']);
    assert.equal(rail({ calendarConnected: false, calendarRead: false }), 'checking', 'REGRESSION: "Calendar not connected" over a calendar never read');
    assert.equal(rail({ calendarError: 'x', calendarRead: false }), 'error');
    assert.equal(rail({ calendarConnected: false, calendarRead: true }), 'notConnected');
    const eff = between(tasks, '    const [calDayOffset, setCalDayOffset] = useState(0);\n', ']);\n').slice(
        '    const [calDayOffset, setCalDayOffset] = useState(0);\n'.length) + ']);';
    const run = (view, read, loading, error) => {
        let fetched = 0, deps = null;
        new Function('useEffect', 'view', 'calendarRead', 'calendarLoading', 'calendarError', 'fetchCalendarEvents', eff)(
            (fn, d) => { deps = d; fn(); }, view, read, loading, error, () => { fetched++; });
        return { fetched, deps };
    };
    assert.deepEqual(run('calendar', false, false, null), { fetched: 1, deps: ['calendar', false, false, null] },
        'REGRESSION: the calendar view leaves a calendar never read unread — "Calendar not connected" until Home is visited');
    assert.equal(run('calendar', true, false, null).fetched, 0, 'a read landed');
    assert.equal(run('calendar', false, true, null).fetched, 0, 'REGRESSION: a second read over one in flight');
    assert.equal(run('calendar', false, false, 'x').fetched, 0, 'REGRESSION: a failed read retried on its own');
    assert.equal(run('list', false, false, null).fetched, 0, 'another view');
});

test('Part 12 fix C3: WIRING — calendarRead is the org\'s (reset on a switch), App hands it and dropCalendarReads to the screens, the header takes both', () => {
    const hook = code(read('src/hooks/useCalendarState.js'));
    assert.ok(hook.includes('const [calendarRead, setCalendarRead] = useOrgBoundState(resets, false);'), 'REGRESSION: calendarRead outlives an org switch');
    assert.ok(hook.includes('        calendarRead: calendarHere && calendarRead, setCalendarRead,\n'), 'the hook returns it');   // moved in §0.249 (review fixes, round 4): for the org it was read in
    const app = code(read(P12FXC3_APP));
    assert.ok(between(app, '    const {\n        calendarEvents, setCalendarEvents, calendarLoading', '} = calState;').includes('calendarRead, setCalendarRead,'), 'App takes it from the hook');
    assert.ok(between(app, '    const appContextValue = {', '\n    };').includes('        calendarRead, dropCalendarReads,\n'), 'REGRESSION: the screens never get calendarRead or dropCalendarReads');
    assert.equal(count(app, 'setCalendarRead('), 1, 'set by a landed read alone');
    order(app, 'const calendarReadGen = useRef(0);', 'const dropCalendarReads = ', 'const fetchCalendarEvents = async () => {', 'const gen = ++calendarReadGen.current;',
        'if (gen !== calendarReadGen.current) return;', 'setCalendarRead(true);', 'if (gen !== calendarReadGen.current) return;', 'if (gen === calendarReadGen.current) {');
    const h = code(read(P12B_HEADER));
    assert.ok(/setCalendarConnected, setCalendarEvents,\s*calendarRead, dropCalendarReads,/.test(h), 'REGRESSION: the header never takes calendarRead or dropCalendarReads');
});

// ── Part 12 — the review's fixes, round 3 (S3 — Sales Manager claims) ──
// The residual the S2 round left open (state §0.249): a SPIFF claim's Approve, Reject or Delete refused with no words of
// its own — a 4xx with an empty body, a blank error, a body that is not JSON — said claimRefused's own lowercase "Not
// saved — the server returned 409", no period, and a ref with no words beside it. It says the house words: "Not saved —"
// / "Not deleted —" and refusalWords — the server's words with their ref, else "The server returned N.". A 5xx is still
// "reload and see" (the write may have landed, §0.204), and a lost answer still claimUnanswered's.
const P12FXS3_SMT = 'src/Tabs/SalesManagerTab.jsx';
const P12FXS3_LINE = '    ? `Not ${done} — ${refusalWords({ status }, d)}`';

test('Part 12 fixes, round 3 (S3): a SPIFF claim\'s Approve and Delete refused say refusalWords\' words — the server\'s with their ref, else "The server returned N."; a wordless 4xx or a 5xx says the claim may have been (round 4) — RUN', async () => {
    const { claimRefused } = p12bClaimWords();
    for (const [d, status, done, msg] of [
        // Moved in §0.249 (review fixes, round 4, S4): a 4xx with no words of its own says the claim may have been.
        [{}, 409, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 409.'],
        [{}, 403, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 403.'],
        [{ error: '   ' }, 400, 'deleted', 'The claim may have been deleted — reload the page to see whether it was: The server returned 400.'],
        [{ error: 42 }, 400, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 400.'],
        [{ requestId: 'r9' }, 404, 'deleted', 'The claim may have been deleted — reload the page to see whether it was: The server returned 404.'],
        [null, 409, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 409.'],
        [{ error: 'id required', requestId: 'req_4' }, 400, 'deleted', 'Not deleted — id required (ref req_4)'],
        [{ error: ' Claim not found in your organization ', requestId: '  ' }, 404, 'saved', 'Not saved — Claim not found in your organization'],
        [{ error: 'Only managers and admins can approve or reject claims' }, 403, 'saved', 'Not saved — Only managers and admins can approve or reject claims'],
        [{}, 502, 'deleted', 'The claim may have been deleted — reload the page to see whether it was: The server returned 502.'],
    ]) assert.equal(claimRefused(done, d, status), msg, `REGRESSION: ${status} ${JSON.stringify(d)} — claimRefused's own "the server returned N"`);
    // Pressed, end to end: Approve and Delete over a 4xx with no words, a blank error and one with words and a ref.
    for (const [which, done] of [['status', 'saved'], ['delete', 'deleted']]) {
        for (const [answer, msg] of [
            // Moved in §0.249 (review fixes, round 4, S4): the wordless 4xx say the claim may have been.
            [onceOf(409, {}), `The claim may have been ${done} — reload the page to see whether it was: The server returned 409.`],
            [onceOf(400, { error: ' ', requestId: 'r3' }), `The claim may have been ${done} — reload the page to see whether it was: The server returned 400.`],
            [onceOf(400, new SyntaxError("Unexpected token '<'")), `The claim may have been ${done} — reload the page to see whether it was: The server returned 400.`],
            [onceOf(403, { error: 'Only managers and admins can approve or reject claims', requestId: 'r4' }), `Not ${done} — Only managers and admins can approve or reject claims (ref r4)`],
        ]) {
            const r = await p12bClaimPress(which, { answer });
            assert.deepEqual([r.states, r.claims], [[{ status: 'error', msg }], [P12B_CLAIM, P12B_CLAIM_2]], `REGRESSION (${which}): ${msg}`);
            assert.doesNotMatch(r.states[0].msg, /the server returned|Unexpected token|undefined|HTTP/);
        }
    }
});

test('Part 12 fixes, round 3 (S3): WIRING — claimRefused\'s refusal says refusalWords\' words, once; no own-worded "the server returned" anywhere in the tab', () => {
    const s = code(read(P12FXS3_SMT));
    // Moved in §0.249 (review fixes, round 4, S4): the head names the server's own refusal; the maybe line says refusalWords too.
    // Moved in §0.249 (review fixes, last pass, F4): the head reads the tab's one ownRefusal (pinned whole in S4's WIRING).
    const words = between(s, 'const claimRefused = (done, d, status) => (ownRefusal(status, d)\n', '\nconst claimUnanswered');
    order(words, 'const claimRefused = (done, d, status) => (ownRefusal(status, d)', P12FXS3_LINE, '    : `The claim may have been ${done}');
    assert.equal(s.split('\n').filter((l) => l === P12FXS3_LINE).length, 1, 'the refusal\'s line, whole');
    assert.equal(count(words, 'refusalWords('), 2, 'the house words: the refusal\'s and the maybe sentence\'s');
    assert.ok(!/d\?\.error \|\||the server returned \$\{status\}/.test(words), 'REGRESSION: claimRefused\'s own words for a refusal');
    // Lowercase: the tab's own "the server returned" — the house words capitalise it, and say it through refusalWords.
    assert.ok(!s.includes('the server returned'), 'REGRESSION: an own-worded "the server returned" in SalesManagerTab');
    // The dash is the character, never its escape (a backslash and "u2014" built here so no escape is typed).
    assert.ok(!P12FXS3_LINE.includes(`${String.fromCharCode(92)}u2014`) && P12FXS3_LINE.includes('—'));
});

// ── Part 12 — the review's fixes, round 3 (L3 — Leads requests and lead import owners) ──
// The two residuals round 2 left open (state §0.249). [1] A rep's claim-requests list that had not landed yet was still
// drawn as "no request": while GET /lead-requests was in flight, leadRequests was [] and requestsError '', so Triage's row
// offered "Request" and the Cockpit said "Request this lead" / "Not yet assigned" with Request assignment — over a request
// Karen had already filed (a press: the server's 409), and no Cancel for it. A landed flag (requestsLanded, false on each
// mount — an org switch remounts the tab) makes myRequestOf `loading` until the read lands: neither Request nor Cancel is
// offered, and Triage and the Cockpit say "Checking requests…". [2] The lead import's Results never said the owner names
// the server reported (leads.mjs ambiguousOwners / unmatchedOwners, carried by receiptFromInsert): they say describeOwners'
// lines, as the account, contact and deal imports do — never a failure (isClean's rule, state §0.216), so a clean run
// stays "Import Complete" with the lines beneath it.
const P12FXL3_LEADS = 'src/Tabs/LeadsTab.jsx';
const P12FXL3_MODAL = 'src/components/modals/LeadImportModal.jsx';
const P12FXL3_CHECKING = 'Checking requests…';
const P12FXL3_PENDING = Object.freeze([{ id: 'lcr_1', leadId: 'l1', status: 'pending' }]);
// The Cockpit's "Assigned to" words and its next-action button's gate, extracted as the expressions they are and run.
const p12fxL3Detail = () => between(code(read(P12FXL3_LEADS)), 'const CockpitDetail = (', 'const CockpitView');
const p12fxL3AssignedWords = (st) => {
    const expr = between(p12fxL3Detail(), "{canAssign ? 'Not yet assigned' : ", '\n').trim().slice(1, -1);
    return new Function('canAssign', 'requestsUnread', 'requestsError', 'requestsChecking', 'myPending', `return (${expr});`)(
        st.canAssign, st.requestsUnread, st.requestsError, st.requestsChecking, st.myPending);
};
const p12fxL3NextButton = (st, lead) => {
    const expr = between(p12fxL3Detail(), '{canEdit && !(', ' && <button onClick={e => {\n                        if (!lead) return;').slice(1);
    return new Function('canEdit', 'requestsUnread', 'requestsChecking', 'lead', `return !!(${expr});`)(st.canEdit, st.requestsUnread, st.requestsChecking, lead);
};
const p12fxL3Cockpit = (o = {}) => {
    const lead = o.lead || { id: 'l1', status: 'New', assignee: null };
    const st = p12fxL2Cockpit({ ...o, lead });
    const canEdit = o.canEdit ?? true;
    return { ...st, assigned: p12fxL3AssignedWords({ ...st, canAssign: !!o.canAssign, requestsError: o.requestsError || '' }),
        button: p12fxL3NextButton({ ...st, canEdit }, lead) };
};

test('Part 12 fixes, round 3 (L3): a rep\'s request on a lead — before the list lands it is loading, never "no request", whatever the list it starts as holds; a failed read is unread; landed, as before — RUN', () => {
    const myRequestOf = p12fxL2MyRequestOf();
    for (const list of [[], P12FXL3_PENDING, null]) {
        assert.deepEqual(myRequestOf(list, '', false, 'l1'), { unread: false, loading: true, pending: null },
            'REGRESSION: a list that has not landed read as no request (or as a request it may not hold)');
    }
    assert.deepEqual(myRequestOf([], 'The server returned 502.', false, 'l1'), { unread: true, loading: false, pending: null }, 'a read that failed is unread, not loading');
    assert.deepEqual(myRequestOf([], '', true, 'l1'), { unread: false, loading: false, pending: null }, 'landed and empty: no request');
    assert.deepEqual(myRequestOf(P12FXL3_PENDING, '', true, 'l1'), { unread: false, loading: false, pending: P12FXL3_PENDING[0] });
});

test('Part 12 fixes, round 3 (L3): the requests read marks the list landed only when it lands — never on a refusal, a failure, an unreadable answer, an org switch or an unmount — RUN', async () => {
    const LIST = [{ id: 'lcr_1', leadId: 'l1', status: 'pending' }];
    const landed = await p12fxLLoad({ answer: onceOf(200, { leadRequests: LIST }) });
    assert.deepEqual([landed.lists, landed.errors, landed.landed], [[LIST], [''], [true]], 'REGRESSION: a list that landed is never marked landed');
    for (const [answer, words] of [...p12bRefused(), [P11_UNREADABLE(), 'Its answer could not be read.'], [onceOf(200, { other: 1 }), 'Its answer could not be read.']]) {
        const did = await p12fxLLoad({ answer });
        assert.deepEqual([did.errors, did.landed], [[words], []], `REGRESSION: ${words} — a read that failed marked landed`);
    }
    for (const answer of [onceOf(200, { leadRequests: LIST }), UNSENT()]) {
        assert.deepEqual((await p12fxLLoad({ answer, switchAt: true })).landed, [], 'REGRESSION: landed in the org switched to');
        assert.deepEqual((await p12fxLLoad({ answer, cancel: true })).landed, [], 'unmounted: nothing');
    }
});

test('Part 12 fixes, round 3 (L3): the Cockpit before the requests list lands — a rep is told "Checking requests…", offered neither Request nor Cancel, never "Not yet assigned"; a manager, a reader and an owned lead as before — RUN', () => {
    for (const leadRequests of [[], P12FXL3_PENDING]) {
        const rep = p12fxL3Cockpit({ requestsLanded: false, leadRequests });
        assert.deepEqual([rep.requestsChecking, rep.requestsUnread, rep.myPending, rep.nextAction], [true, false, null, P12FXL3_CHECKING],
            'REGRESSION: "Request this lead" (or "Requested") over a list that has not landed');
        assert.equal(rep.assigned, P12FXL3_CHECKING, 'REGRESSION: "Not yet assigned" drawn from a list that has not landed');
        assert.equal(rep.button, false, 'REGRESSION: the next action\'s Request / Cancel offered over a list that has not landed');
    }
    const landedRead = p12fxL3Cockpit({ leadRequests: P12FXL3_PENDING });
    assert.deepEqual([landedRead.requestsChecking, landedRead.nextAction, landedRead.assigned, landedRead.button],
        [false, 'Requested — awaiting approval', 'Requested — awaiting a manager\'s approval', true], 'landed: the request, and its Cancel');
    const empty = p12fxL3Cockpit();
    assert.deepEqual([empty.nextAction, empty.assigned, empty.button], ['Request this lead', 'Not yet assigned', true], 'landed and empty: Request');
    const failed = p12fxL3Cockpit({ requestsLanded: false, requestsError: 'Internal server error (ref r1)' });
    assert.deepEqual([failed.requestsUnread, failed.requestsChecking, failed.assigned, failed.button],
        [true, false, 'Your requests could not be read — Internal server error (ref r1)', false], 'a read that failed says so, not "Checking"');
    const mgr = p12fxL3Cockpit({ canAssign: true, requestsLanded: false });
    assert.deepEqual([mgr.requestsChecking, mgr.nextAction, mgr.assigned, mgr.button], [false, 'Assign to a rep', 'Not yet assigned', true], 'a manager assigns');
    const reader = p12fxL3Cockpit({ canEdit: false, requestsLanded: false });
    assert.deepEqual([reader.requestsChecking, reader.nextAction, reader.button], [false, 'Waiting to be assigned', false], 'a reader is offered nothing');
    const owned = p12fxL3Cockpit({ lead: { id: 'l1', status: 'Working', assignee: 'Karen' }, requestsLanded: false });
    assert.deepEqual([owned.nextAction, owned.button], ['Check in — keep the ball moving', true], 'an owned lead\'s next action is not a request');
});

test('Part 12 fixes, round 3 (L3): WIRING — LeadsTab holds the landed flag and hands it to both views; Triage\'s row says "Checking requests…" and offers no Request or Cancel until it lands; the Cockpit\'s Request assignment waits too', () => {
    const s = code(read(P12FXL3_LEADS));
    const main = between(s, 'export default function LeadsTab() {', '\n}\n');
    order(main, "    const [requestsError, setRequestsError] = useState('');", '    const [requestsLanded, setRequestsLanded] = useState(false);',
        '                setLeadRequests(data.leadRequests);\n                setRequestsError(\'\');\n                setRequestsLanded(true);\n            } catch (e) {');
    assert.equal(count(main, 'setRequestsLanded('), 1, 'set once, where the list lands — never on a failure');
    assert.equal(count(main, 'requestsLanded={requestsLanded}'), 2, 'REGRESSION: a view never told whether the list landed');
    assert.ok(between(main, '<TriageView', '/>').includes('requestsLanded={requestsLanded}'));
    assert.ok(between(main, '<CockpitView', '/>').includes('requestsLanded={requestsLanded}'));
    const triage = between(s, 'const TriageView = (', 'const CockpitListRow');
    assert.ok(between(triage, 'const TriageView = (', '=> {').includes('requestsLanded, leadRequests, requestsError'));
    const row = between(triage, ') : (() => {\n                                            const mine = ', '})()}');
    order(row, 'myRequestOf(leadRequests, requestsError, requestsLanded, l.id);', 'if (mine.unread) return l.assignee ? <LeadAssignee name={l.assignee}/>',
        'if (mine.loading) return l.assignee ? <LeadAssignee name={l.assignee}/>',
        `: <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>${P12FXL3_CHECKING}</span>;`, 'const myPending = mine.pending;',
        "label={myPending ? '✓ Requested' : 'Request'}");
    const view = between(s, 'const CockpitView = (', 'export default function LeadsTab');
    assert.ok(between(s, 'const CockpitView = (', '=> {').includes('requestsLanded, leadRequests'));
    assert.ok(view.includes('canAssign={canAssign} requestsLanded={requestsLanded} leadRequests={leadRequests}'), 'REGRESSION: the detail never told whether the list landed');
    const detail = p12fxL3Detail();
    assert.ok(between(s, 'const CockpitDetail = (', '=> {').includes('requestsLanded, canEdit'));
    assert.ok(detail.includes('myRequestOf(leadRequests, requestsError, requestsLanded, lead.id)'));
    assert.ok(detail.includes('    const requestsChecking = canEdit && mine.loading;'));
    order(detail, ') : !canEdit ? null : myPending ? (', 'Cancel request</button>', ') : (requestsUnread || requestsChecking) ? null : (', 'Request assignment</button>');
});

// The lead import's owner names: the handler's receipt over the real bulk client, then the modal's doImport.
const p12fxL3Answer = (ids, owners) => onceOf(201, { insertedIds: ids, ...owners });
const p12fxL3Ids = (from, to) => Array.from({ length: to - from }, (_, i) => `lead_${from + i}`);
const P12FXL3_NO_MEMBER = 'No member is named “Jon Smith” — those rows were saved with no owner. Set the owner on each record\'s page.';
const P12FXL3_TWO_MEMBERS = 'More than one member is named “Pat Lee” — those rows were saved with no owner (an overwrite kept the owner it had). Set the owner on each record\'s page.';

test('Part 12 fixes, round 3 (L3): the lead import\'s Results say the owner names the server matched to no member or to more than one — a clean run still "Import Complete", a partial one too; none, no lines — RUN', async () => {
    const owners = { unmatchedOwners: ['Jon Smith'], ambiguousOwners: ['Pat Lee'] };
    const clean = await p12fxL2DoImport(p12fxL2Handler({ answers: [p12fxL3Answer(p12fxL3Ids(0, 3), owners)] }).onImport);
    assert.deepEqual(clean.steps, ['results']);
    assert.deepEqual(clean.stats, [{ added: 3, skipped: 1, errors: ['Row 5: missing first and last name'], owners: [P12FXL3_NO_MEMBER, P12FXL3_TWO_MEMBERS] }],
        'REGRESSION: the owner names the server reported never said');
    assert.equal(clean.stats[0].said, undefined, 'never a failure: a clean run with owner lines is still "Import Complete" (isClean)');
    // Owner names kept across the chunks, each once, then a later chunk refused: partial, with its lines.
    const partial = await p12fxL2DoImport(p12fxL2Handler({ answers: [p12fxL3Answer(p12fxL3Ids(0, 400), { unmatchedOwners: ['Jon Smith'] }), P11_PAGE()] }).onImport,
        p12fxL2Leads(900));
    assert.deepEqual(partial.stats, [{ added: 400, failed: 500, said: P12FXL2_PARTIAL, skipped: 1, errors: ['Row 5: missing first and last name'], owners: [P12FXL3_NO_MEMBER] }],
        'REGRESSION: a partial import drops the owner names of the leads that landed');
    const none = await p12fxL2DoImport(p12fxL2Handler({ answers: ['ok'] }).onImport);
    assert.equal(none.stats[0].owners, null, 'no owner names: no lines');
});

test('Part 12 fixes, round 3 (L3): WIRING — the lead import\'s Results draw the owner lines, as the other importers do; both Results paths carry them', () => {
    const m = code(read(P12FXL3_MODAL));
    assert.ok(m.includes("import { receiptFromError, describeReceipt, describeOwners } from '../../utils/importReceipt';"));
    const doImport = between(m, '    const doImport = async () => {', '\n    };');
    assert.equal(count(doImport, 'owners: describeOwners(receipt) });'), 2, 'REGRESSION: a Results path without the owner names');
    const results = between(m, "{step === 'results' && importStats && (", '<ResizeHandles');
    order(results, "{importStats.said ? 'Partially Imported' : 'Import Complete'}", 'Leads Imported</div>',
        '{(importStats.owners || []).map(line => (',
        "<p key={line} style={{ color:T.warn, fontSize:'0.8125rem', margin:'0 auto 0.75rem', maxWidth:480, overflowWrap:'anywhere' }}>{line}</p>",
        '{importStats.errors.length > 0 && (');
    // The account, contact and deal imports say the same lines (CsvImportModal), from the same helper.
    assert.ok(read('src/components/modals/CsvImportModal.jsx').includes('{(describeOwners(r) || []).map(line => ('));
});

// ── Part 12 — the review's fixes, round 3 (G3 — THE GUARD floors) ──
// Re-measured after every round 3 fix (§0.249): (iii) 190 body reads over the 242 sources under src/ (A3's Pause /
// Resume / Rotate and Send test refusal bodies, read in their ok checks), (iv) 188 catch clauses over its 54 files,
// (i) 126 error states. Its WIRING test, which held the first round's (G) and round 2's (G2), is merged into the one floors
// test at the end of this file (round 4, G4), so no floor is left looser beside it.

// ── Part 12 — the review's fixes, round 4 (A4 — Audit log Add and Remove) ──
// The review of round 3 (its two residuals): the Add and the Remove said every answer that was not ok as a refusal —
// "Internal server error (ref r1)" in the Add window, left open for a retry, and "Remove destination failed", the row kept
// as live — though audit-stream.mjs inserts or deletes the row before its audit write and the caller's name, either of
// which can answer 500 after the write, and a gateway's page or a request that threw may have reached it. A second press
// made a second destination with a second secret; a removed row was drawn live, with a Pause. They follow round 3's
// destRefusedOwn rule: only the server's own refusal (a 4xx with its words) says "not saved" / "failed" and leaves the
// screen as it was, the Add window open for a retry; any other answer says the destination may have been added — the
// window closed, the list not known — or removed — the row kept, its status not known.
const p12fxA4Own = () => [
    [onceOf(400, { error: 'A name is required.', requestId: 'r5' }), 'A name is required. (ref r5)'],
    [onceOf(401, { error: 'Unauthorized' }), 'Unauthorized'],
    [onceOf(403, { error: 'Forbidden: insufficient role' }), 'Forbidden: insufficient role'],
];
const P12FXA4_MAYBE_ADD = (words) => `The destination may have been added — reload the page to see whether it was: ${words}`;
const P12FXA4_MAYBE_REMOVE = (words) => `The destination may have been removed — reload the page to see whether it was: ${words}`;
const P12FXA4_LIST = 'A destination may be missing from the list — reload the page to see every destination.';

test('Part 12 fixes (A4): the Audit log\'s Add — the server\'s own refusal in the window, left open for a retry; any other answer "may have been added", the window closed, the list not known — RUN', async () => {
    for (const [answer, words] of p12fxA4Own()) {
        const did = await p12fxAPress('createDest', answer, [{ name: 'X' }]);
        assert.deepEqual([did.answered, did.modal, did.read, did.unread.value, did.said, did.reveal, did.dests.value.map((d) => d.id), did.sent.length],
            [{ ok: false, error: words }, [], [], '', [], [], ['dst_1'], 1], `the server's own refusal: ${words}`);
    }
    for (const [answer, words] of p12fxA3Maybe()) {
        const did = await p12fxAPress('createDest', answer, [{ name: 'X' }]);
        assert.deepEqual([did.answered, did.modal, did.read, did.unread.value, did.said, did.reveal, did.dests.value.map((d) => d.id), did.sent.length],
            [{ ok: true }, [false], [false], P12FXA4_LIST, [P12FXA4_MAYBE_ADD(words)], [], ['dst_1'], 1],
            `REGRESSION: "${words}" in a window left open over a destination the server may have made — a second press makes a second one`);
        assert.ok(!did.said[0].includes('not saved'), 'never "not saved" over a destination the server may have made');
        const [again] = p12fxA3Maybe().find(([, w]) => w === words);   // a fresh answer: a body is read once
        const kept = await p12fxAPress('createDest', again, [{ name: 'X' }], P12FXA_LOAD);
        assert.equal(kept.unread.value, P12FXA_LOAD, `REGRESSION: the load's failure replaced by an Add that may have landed — ${words}`);
    }
});

test('Part 12 fixes (A4): the Audit log\'s Remove — the server\'s own refusal "failed", the row known; any other answer "may have been removed", the row kept, its status not known — RUN', async () => {
    // Moved pin (§0.249, the review's fixes, last pass — F1): the 404 in the server's words proves the row gone — it leaves
    // the list, said "already removed" (the last pass's own test); the 400 and 403 are as they were.
    for (const [answer, words] of p12fxA3Own().filter(([a]) => a.status !== 404)) {
        const did = await p12fxARemove(answer);
        assert.deepEqual([did.said, did.ids, did.statusUnread, did.busy], [[`Remove destination failed — ${words}`], ['dst_1', 'dst_2'], [], ['dst_1', null]],
            `the server's own refusal: ${words}`);
    }
    const gone404 = await p12fxARemove(p12fxA3Own().find(([a]) => a.status === 404)[0]);
    assert.deepEqual([gone404.said, gone404.ids, gone404.statusUnread], [['The destination was already removed.'], ['dst_2'], []]);
    for (const [answer, words] of p12fxA3Maybe()) {
        const did = await p12fxARemove(answer);
        assert.deepEqual([did.said, did.ids, did.statusUnread, did.busy], [[P12FXA4_MAYBE_REMOVE(words)], ['dst_1', 'dst_2'], ['dst_1'], ['dst_1', null]],
            `REGRESSION: "Remove destination failed" and a live row over a destination the server may have removed — ${words}`);
        assert.ok(!did.said[0].includes('failed'), 'never "failed" over a destination the server may have removed');
        // The row kept is counted as not known (round 2's badge, over this answer) — never as delivering.
        assert.equal(p12fxABadge(did.dests, true, did.statusUnread), 'Streaming to 2 destinations · 1 status not known');
    }
    const landed = await p12fxARemove(onceOf(200, { success: true }), ['dst_1']);
    assert.deepEqual([landed.said, landed.ids, landed.busy], [[], ['dst_2'], ['dst_1', null]]);
    assert.equal(p12fxABadge(landed.dests, true, landed.statusUnread), 'Streaming to 1 destination', 'a removed row\'s id counts nothing');
});

test('Part 12 fixes (A4): WIRING — the Audit log\'s Add and Remove read a refusal once and judge it by destRefusedOwn; a maybe Add closes its window', () => {
    const s = code(read(P12A_AUDIT));
    const add = between(s, '    const createDest = async (input) => {', '\n    const putDest = ');
    order(add, 'const maybeAdded = (words) => {', 'setShowAddDest(false);', 'if (!res.ok) {', 'const refused = await res.json().catch(() => null);',
        'if (destRefusedOwn(res, refused)) return { ok: false, error: refusalWords(res, refused) };', 'return maybeAdded(refusalWords(res, refused));',
        '} catch (e) {', 'return maybeAdded(failureWords(e));');
    assert.ok(!add.includes('readRefusal('), 'REGRESSION: the Add says every answer as a refusal again');
    const rm = between(s, '    const remove = (dest) => showConfirm(', '\n    }, true);');
    order(rm, 'const maybeRemoved = (words) => {', 'setStatusUnread(ids => [...ids, dest.id]);', 'if (!res.ok) {', 'const refused = await res.json().catch(() => null);',
        'if (destRefusedOwn(res, refused)) setDestError(`Remove destination failed — ${refusalWords(res, refused)}`);', 'else maybeRemoved(refusalWords(res, refused));',
        'setDests(prev => prev.filter(d => d.id !== dest.id));', '} catch (e) {', 'maybeRemoved(failureWords(e));');
    assert.ok(!rm.includes('readRefusal('), 'REGRESSION: the Remove says every answer as a refusal again');
    assert.equal(count(s, 'destRefusedOwn(res, refused)'), 4, 'the Add, Pause / Rotate, Send test and Remove judge a refusal by one rule');
    assert.ok(s.includes('{showAddDest && <AddDestinationModal onClose={() => setShowAddDest(false)} onSave={createDest}/>}'),
        'the window is drawn only while showAddDest — a maybe Add closes it');
});

// ── Part 12 — the review's fixes, round 4 (U4 — Users MFA chip and words) ──
// The review of round 3 (residuals U3): Settings → Users' list drew "MFA off · 0" while the MFA read was still out and
// after it failed or was refused — a count over a read that failed — and its MFA off filter listed the pending invites
// (their mfa:false no answer of Clerk's) the chip did not count. The profile's Security card read "Not linked in Clerk,
// or still loading" and the list's dot "Unknown — loading, or not linked in Clerk" for good over a read that failed. The
// load now keeps the failure's words in mfaFailed ('' while none failed): the refusal's (readRefusal), a thrown
// failure's (failureWords), or "Its answer could not be read." for an answer the rule refuses; one module-scope rule
// (mfaUnreadWords) says "The MFA status could not be read — <words>" over a failed read and "still loading" only while
// it is out, on the chip's title (its label "MFA off · —"), the dot's title, the profile's card (handed mfaFailed as a
// prop) and the MFA off list's empty line. The filter lists what the chip counts: an active member Clerk says is off.
const p12fxU4Src = () => code(read(P12A_USERS));
// The one rule, extracted and run.
const p12fxU4Rule = () => new Function(`return (${between(p12fxU4Src(), 'const mfaUnreadWords = ', ';\n').slice('const mfaUnreadWords = '.length)});`)();
// A roster as UsersDetail builds it: three active members (one Clerk does not name), one deactivated whom Clerk says is
// off, and a pending invite (mfa:false, as pendingRows builds it); `mfa` from mfaByEmail as realUsers maps it.
const p12fxU4Roster = (mfaByEmail) => [
    ...[['A', 'A@x.co', 'Active'], ['C', 'c@x.co', 'Active'], ['D', 'd@x.co', 'Deactivated'], ['N', 'n@x.co', 'Active']]
        .map(([name, email, status]) => ({ id: name, name, email, team: null, status,
            mfa: mfaByEmail ? (mfaByEmail.get((email || '').toLowerCase()) ?? null) : null })),
    { id: 'pending_p', name: 'P', email: 'p@x.co', team: null, status: 'Invited', mfa: false },
];
// The server's whole answer with the deactivated member off too (n@x.co Clerk does not name: not linked).
const P12FXU4_WHOLE = () => {
    const w = P12FXU3_WHOLE();
    w.notEnrolled.push({ userId: 'user_d', email: 'd@x.co', name: 'D', role: 'User' });
    return w;
};
// The load's state after an answer (mfaData kept, mfaFailed's words) — p12fxU3Load's run over the source.
const p12fxU4LoadAfter = async (answer) => p12fxU3After(await p12fxU3Load(answer));
// Everything the list and the profile draw from (mfaData, mfaFailed) — each expression extracted from the source and run.
// Moved (§0.249, the review's fixes, last pass — F1): the filter and the empty line take the search box's text; the
// empty line is the module's usersEmptyWords (its table and rule extracted from the source and run).
const p12fxU4Drawn = (mfaData, mfaFailed, filter = 'MFA off', search = '') => {
    const s = p12fxU4Src();
    const mfaUnreadWords = p12fxU4Rule();
    const { mfaByEmail } = p12fxU3Drawn(mfaData, mfaFailed);
    const displayUsers = p12fxU4Roster(mfaByEmail);
    const chipSrc = between(s, "        { key:'MFA off',", '\n    ];').trim().replace(/,$/, '');
    const chip = new Function('displayUsers', 'mfaByEmail', 'mfaFailed', 'mfaUnreadWords', `return (${chipSrc});`)(displayUsers, mfaByEmail, mfaFailed, mfaUnreadWords);
    const filterSrc = between(s, '    const visible = displayUsers.filter(u => {', '\n    });');
    const visible = new Function('displayUsers', 'filter', 'search', `${filterSrc}\n    });\nreturn visible;`)(displayUsers, filter, search);
    const usersEmptyWords = new Function(`${between(s, 'const USERS_EMPTY = ', '\n};')}\n};\n${between(s, 'const usersEmptyWords = ', '\n};')}\n};\nreturn usersEmptyWords;`)();
    const emptyLine = between(s, '{usersEmptyWords(', '\n');
    const empty = new Function('filter', 'search', 'mfaByEmail', 'mfaFailed', 'mfaUnreadWords', 'usersEmptyWords', `return (${emptyLine.slice(1, emptyLine.lastIndexOf('}'))});`)(
        filter, search, mfaByEmail, mfaFailed, mfaUnreadWords, usersEmptyWords);
    const dotAttr = between(s, '<span title={mfaUnreadWords(', ' style=');
    const dotTitle = new Function('mfaByEmail', 'mfaFailed', 'mfaUnreadWords', `return (${dotAttr.slice('<span title={'.length, -1)});`)(mfaByEmail, mfaFailed, mfaUnreadWords);
    const cardSrc = between(s, "{v !== null ? 'Second factor' : ", '}</div>').slice(1);
    const card = (v) => new Function('v', 'mfaByEmail', 'mfaFailed', 'mfaUnreadWords', `return (${cardSrc});`)(v, mfaByEmail, mfaFailed, mfaUnreadWords);
    return { chip, visible: visible.map((u) => u.id), empty, dotTitle, card, mfaByEmail };
};

test('Part 12 fixes (U4): Settings → Users\' MFA off chip draws no count while the MFA read is out or after it failed — "MFA off · —", titled with why; the filter lists only what the chip counts — RUN', async () => {
    const rule = p12fxU4Rule();
    // A read that failed, by each way it fails: the load's words reach the chip's title, its label no count.
    const failed = [
        ...P12A_REFUSED(), [P11_UNREADABLE(), 'Its answer could not be read.'],
        [onceOf(200, {}), 'Its answer could not be read.'], [onceOf(200, null), 'Its answer could not be read.'],
        [onceOf(200, P12FXU3_BAD_FIELDS()[0]), 'Its answer could not be read.'],
    ];
    for (const [answer, words] of failed) {
        const did = await p12fxU4LoadAfter(answer);
        assert.deepEqual(did, [null, words], 'the load keeps the failure\'s words');
        const d = p12fxU4Drawn(...did);
        assert.equal(d.chip.label, 'MFA off · —', `REGRESSION: "MFA off · 0" over a read that failed (${words})`);
        assert.equal(d.chip.title, `The MFA status could not be read — ${words}`, 'REGRESSION: the chip says nothing of why it has no count');
        assert.deepEqual(d.visible, [], 'REGRESSION: the MFA off list draws a member over a read that failed — an invite\'s mfa:false taken as Clerk\'s');
        assert.equal(d.empty, `The MFA status could not be read — ${words}`, 'REGRESSION: "No users yet" over a read that failed');
    }
    // Still loading: no count, titled loading.
    const loading = p12fxU4Drawn(null, '');
    assert.deepEqual([loading.chip.label, loading.chip.title, loading.empty, loading.visible],
        ['MFA off · —', 'The MFA status is still loading…', 'The MFA status is still loading…', []], 'REGRESSION: "MFA off · 0" while the read is out');
    // Read: the count of active members Clerk says are off — not the deactivated one, not the invite; no title.
    const read = p12fxU4Drawn(P12FXU4_WHOLE(), '');
    assert.deepEqual([read.chip.key, read.chip.label, read.chip.title], ['MFA off', 'MFA off · 1', undefined], 'REGRESSION: the chip\'s count over a read');
    assert.deepEqual(read.visible, ['C'], 'REGRESSION: the MFA off list draws what the chip does not count (an invite, a deactivated member)');
    // A read where no active member is off: none, said in the filter's words — never "No users yet".
    const none = p12fxU4Drawn({ ...P12FXU4_WHOLE(), notEnrolled: [] }, '');
    assert.deepEqual([none.chip.label, none.visible, none.empty], ['MFA off · 0', [], 'No active member has MFA off.']);
    // Moved pin (§0.249, the review's fixes, last pass — F1): another filter's empty line names that filter — "No users
    // yet" only for a roster with no one in it (the last pass's own test runs each filter, with and without a search).
    assert.equal(p12fxU4Drawn(null, 'x', 'Deactivated').empty, 'No deactivated members.');
    // The rule itself: '' once read, the words over a failure, loading only while out.
    assert.deepEqual([rule(new Map(), 'x'), rule(null, 'Forbidden'), rule(null, '')],
        ['', 'The MFA status could not be read — Forbidden', 'The MFA status is still loading…']);
});

test('Part 12 fixes (U4): the profile\'s Security card and the list\'s MFA dot name a read that failed, in its words — "still loading" only while it is out, "Not linked in Clerk" only over a read — RUN', async () => {
    for (const [answer, words] of [...P12A_REFUSED(), [P11_UNREADABLE(), 'Its answer could not be read.'], [onceOf(200, {}), 'Its answer could not be read.']]) {
        const d = p12fxU4Drawn(...(await p12fxU4LoadAfter(answer)));
        const want = `The MFA status could not be read — ${words}`;
        assert.equal(d.card(null), want, 'REGRESSION: the profile reads "Not linked in Clerk, or still loading" over a read that failed');
        assert.equal(d.dotTitle, want, 'REGRESSION: the dot reads "Unknown — loading, or not linked in Clerk" over a read that failed');
        assert.ok(!P12A_OLD.test(d.card(null)) && !P12A_OLD.test(d.chip.title), `the house's words: ${d.card(null)}`);
    }
    const loading = p12fxU4Drawn(null, '');
    assert.deepEqual([loading.card(null), loading.dotTitle], ['The MFA status is still loading…', 'The MFA status is still loading…']);
    const read = p12fxU4Drawn(P12FXU4_WHOLE(), '');
    assert.deepEqual([read.card(null), read.card(true), read.card(false), read.dotTitle],
        ['Not linked in Clerk', 'Second factor', 'Second factor', 'Not linked in Clerk'], 'a member Clerk does not name, over a read: not linked');
});

test('Part 12 fixes (U4): WIRING — one module-scope rule for an unknown MFA mark\'s words; the profile is handed mfaFailed as a prop; the chip draws its title; the load keeps the failure\'s words', () => {
    const s = p12fxU4Src();
    // Module scope: defined at column 0, before UserProfilePage — never inside a component.
    order(s, '\nconst mfaUnreadWords = (mfaByEmail, mfaFailed) => mfaByEmail ? ', '\nconst UserProfilePage = ({ user: opened, settings, onBack, onUsers, onRemoved, mfaByEmail, mfaFailed }) => {');
    assert.equal(count(s, 'const mfaUnreadWords = '), 1);
    assert.equal(count(s, 'mfaUnreadWords(mfaByEmail, mfaFailed)'), 4, 'the chip\'s title, the empty line, the dot and the profile read the one rule');
    const profile = between(s, 'const UserProfilePage = ', 'export const UsersDetail = ');
    assert.ok(profile.includes("{v !== null ? 'Second factor' : mfaUnreadWords(mfaByEmail, mfaFailed) || 'Not linked in Clerk'}"),
        'REGRESSION: the profile\'s card does not read the failure');
    assert.ok(s.includes(' mfaByEmail={mfaByEmail} mfaFailed={mfaFailed}/>;'), 'REGRESSION: the profile is not handed mfaFailed');
    assert.ok(s.includes('<button key={ft.key} title={ft.title} onClick={() => setFilter(ft.key)}'), 'REGRESSION: the chip\'s title is never drawn');
    assert.ok(s.includes("const [mfaFailed, setMfaFailed] = useState('');"), 'mfaFailed holds words, none while none failed');
    const load = between(s, "                const res = await dbFetch('/.netlify/functions/clerk-mfa-status');", '\n        })();');
    order(load, 'const why = await readRefusal(res); if (!cancelled) setMfaFailed(why);', "setMfaFailed('Its answer could not be read.')",
        '} catch (e) { if (!cancelled) setMfaFailed(failureWords(e)); }');
    assert.ok(!load.includes('setMfaFailed(true)'), 'REGRESSION: a failed read kept without its words');
    assert.ok(!s.includes('Not linked in Clerk, or still loading') && !s.includes('Unknown — loading, or not linked in Clerk'),
        'REGRESSION: "still loading" said for good over a read that failed');
});

// ── Part 12 — the review's fixes, round 4 (D4 — Document drops) ──
// The verifier's three residuals of D3, all in a record's Documents (RecordDocuments.jsx attachFiles). (1) A drop while a
// batch was sending ran a second batch beside it: each cleared and overwrote the other's words and busy mark, and the first
// one's "Not sent" names were lost. A drop while one sends is now refused — two batches never run at once (a ref, read at
// once, not the render's `busy`) — its files named in their own red box, "Not sent: <names> — wait for the current upload
// to finish, then drop them again.", until the next drop that is taken; the batch's own words are left as they are. (2) A
// drop refused by validateFile kept the last batch's notice above its red box; it now clears it, as a batch that sends
// does. (3) The check stopped at the first refused file and named every other file, refused or not, "drop them again";
// every file is now checked before any is sent, each refused said by its name and its own words, and only the files that
// would pass named "Not sent". Nothing is sent while any is refused — the file's rule before round 3 (and since). The
// upload rail is not on this path: it takes one file, and while it uploads its drop zone and file input are not drawn.
// A record's Documents with one sending mark across drops: `drop(named)` drops the files named, each answered by its
// value — a promise is awaited first, an Error thrown; `invalid` maps a file's name to validateFile's words.
const p12fxD4Make = (invalid = {}) => {
    const did = { errors: [], notices: [], busy: [], sent: [], held: [] };
    const sending = { current: false };
    const answers = {};
    const attach = p12aFn(P12FXD_RECORD, '    const attachFiles = async (fileList) => {', '\n    };', '\n    };',
        ['validateFile', 'setError', 'setNotice', 'setBusy', 'createDocument', 'baseName', 'recordLink', 'failureWords', 'sending', 'setHeld', 'onBusy'], 'attachFiles')(
        (f) => invalid[f.name] || null, (v) => did.errors.push(typeof v === 'function' ? v(did.errors.at(-1) ?? null) : v), (v) => did.notices.push(v), (v) => did.busy.push(v),
        async (f) => { did.sent.push(f.name); const a = await answers[f.name]; if (a instanceof Error) throw a; return a; },
        (n) => n.replace(/\.[^.]+$/, ''), { type: 'account', recordId: 'acc_1' }, failureWords,
        sending, (v) => did.held.push(typeof v === 'function' ? v(did.held.at(-1) ?? null) : v));
    const drop = (named) => { Object.assign(answers, named); return attach(Object.keys(named).map((name) => ({ name, size: 10, type: 'application/pdf' }))); };
    return { did, drop, sending };
};
const p12fxD4Gate = () => { let open; const gate = new Promise((r) => { open = r; }); return { gate, open }; };

test('Part 12 fixes, round 4 (D4): a record\'s Documents — a drop while a batch is sending is refused, its files named apart; the batch\'s words, notice and busy mark untouched; two batches never run at once — RUN', async () => {
    // Moved in §0.249 (review fixes, last pass, F2): a held file is held as [name, validateFile's words].
    const DOC = { id: 'doc_y' };
    const own = (await p12fxdThrown({ record: onceOf(403, { error: 'Forbidden' }) })).e;
    const { did, drop, sending } = p12fxD4Make();
    const { gate, open } = p12fxD4Gate();
    const first = drop({ 'a.pdf': gate, 'b.pdf': own, 'c.pdf': DOC });
    await settle();
    assert.deepEqual([did.sent, did.busy, did.errors, did.held, sending.current], [['a.pdf'], [true], [null], [null], true]);
    // Dropped while a.pdf sends: not sent, named; nothing of the batch's touched.
    await drop({ 'd.pdf': DOC });
    assert.deepEqual([did.sent, did.busy, did.errors, did.notices, did.held.at(-1)], [['a.pdf'], [true], [null], [null], [['d.pdf', null]]],
        'REGRESSION: a drop while a batch sends ran a second batch beside it — each overwrote the other\'s words');
    // A second drop while it still sends: added, each name once.
    await drop({ 'e.pdf': DOC, 'd.pdf': DOC });
    assert.deepEqual([did.sent, did.held.at(-1)], [['a.pdf'], [['d.pdf', null], ['e.pdf', null]]], 'REGRESSION: the first drop\'s names lost, or a name said twice');
    open(DOC);
    await first;
    // The batch's stop keeps its own words, "Not sent: c.pdf" among them; the held drop's names are still said apart.
    assert.deepEqual([did.sent, did.busy, did.errors.at(-1), did.held.at(-1), sending.current],
        [['a.pdf', 'b.pdf'], [true, false], 'b.pdf: The document was not saved — Forbidden\nNot sent: c.pdf — drop them again', [['d.pdf', null], ['e.pdf', null]], false],
        'REGRESSION: the batch left the sending mark set — every drop after it refused');
    // The batch over, the next drop is taken: sent, the held names and the last words cleared.
    await drop({ 'd.pdf': DOC });
    assert.deepEqual([did.sent, did.busy, did.errors.at(-1), did.held.at(-1), sending.current], [['a.pdf', 'b.pdf', 'd.pdf'], [true, false, true, false], null, null, false],
        'REGRESSION: the held names kept over a drop that was taken');
});

test('Part 12 fixes, round 4 (D4): a record\'s Documents — every dropped file is checked before any is sent: each refused named with its own words, only the files that would pass named "Not sent", nothing sent; the last notice and held names cleared — RUN', async () => {
    // Moved in §0.249 (review fixes, last pass, F2): a held file is held as [name, validateFile's words].
    const DOC = { id: 'doc_y' };
    const EXE = 'Unsupported file type: .exe';
    const BIG = 'File exceeds the 50 MB limit';
    const invalid = { 'a.exe': EXE, 'b.exe': EXE, 'x.exe': EXE, 'big.pdf': BIG };
    // Two refused, one fine: each refused on its own line, the fine one alone "Not sent".
    const two = p12fxD4Make(invalid);
    await two.drop({ 'a.exe': DOC, 'b.exe': DOC, 'c.pdf': DOC });
    assert.deepEqual([two.did.sent, two.did.busy, two.did.errors], [[], [], ['a.exe: Unsupported file type: .exe\nb.exe: Unsupported file type: .exe\nNot sent: c.pdf — drop them again']],
        'REGRESSION: a refused file named "drop them again" — dropped again it is refused again — or a refused file not named');
    assert.deepEqual(p12fxd3Unsent(two.did.errors.at(-1)), ['c.pdf']);
    // Fine files on both sides of two refused, each with its own words: the fine ones named in the order dropped.
    const mixed = p12fxD4Make(invalid);
    await mixed.drop({ 'a.pdf': DOC, 'x.exe': DOC, 'big.pdf': DOC, 'b.pdf': DOC });
    assert.deepEqual([mixed.did.sent, mixed.did.errors],
        [[], ['x.exe: Unsupported file type: .exe\nbig.pdf: File exceeds the 50 MB limit\nNot sent: a.pdf, b.pdf — drop them again']]);
    // Every file refused: no "Not sent" line.
    const all = p12fxD4Make(invalid);
    await all.drop({ 'a.exe': DOC, 'big.pdf': DOC });
    assert.deepEqual([all.did.sent, all.did.errors], [[], ['a.exe: Unsupported file type: .exe\nbig.pdf: File exceeds the 50 MB limit']]);
    // A refused drop after a batch that made a file unread, and a drop held while it sent: the notice and the names cleared.
    const made = (await p12fxdThrown({ record: P11_UNREADABLE() })).e;
    const after = p12fxD4Make(invalid);
    const { gate, open } = p12fxD4Gate();
    const batch = after.drop({ 'a.pdf': gate, 'b.pdf': made });
    await settle();
    await after.drop({ 'c.pdf': DOC });
    open(DOC);
    await batch;
    assert.deepEqual([after.did.notices.at(-1), after.did.held.at(-1)], [`b.pdf: ${P12FXD_MADE}`, [['c.pdf', null]]]);
    await after.drop({ 'x.exe': DOC });
    assert.deepEqual([after.did.sent, after.did.errors.at(-1), after.did.notices.at(-1), after.did.held.at(-1)],
        [['a.pdf', 'b.pdf'], 'x.exe: Unsupported file type: .exe', null, null],
        'REGRESSION: the last batch\'s notice kept above a refused drop, as if this drop had made a file — or the held names kept over it');
});

test('Part 12 fixes, round 4 (D4): a record\'s Documents — the held drop\'s words name its files and say to wait while a batch sends, then to drop them again — RUN', () => {
    // Moved in §0.249 (review fixes, last pass, F2): a held file is held as [name, validateFile's words].
    const src = code(read(P12FXD_RECORD));
    const heldWords = new Function(`return ${between(src, 'const heldWords = ', ';\n').slice('const heldWords = '.length)};`)();
    assert.equal(heldWords([['d.pdf', null]], true), 'Not sent: d.pdf — wait for the current upload to finish, then drop them again.');
    assert.equal(heldWords([['d.pdf', null], ['e.pdf', null]], true), 'Not sent: d.pdf, e.pdf — wait for the current upload to finish, then drop them again.',
        'REGRESSION: the held names run together');
    assert.equal(heldWords([['d.pdf', null], ['e.pdf', null]], false), 'Not sent: d.pdf, e.pdf — drop them again.', 'REGRESSION: "wait" said with nothing sending');
});

test('Part 12 fixes, round 4 (D4): WIRING — one batch at a time by a ref; every file checked before any is sent; the held names drawn in their own red box; heldWords at module scope', () => {
    const record = code(read(P12FXD_RECORD));
    // Module scope, before the component — never inside it.
    // Moved in §0.249 (review fixes, last pass, F2): a held file is held as [name, validateFile's words].
    order(record, '\nconst heldWords = (held, busy) => ', '\nexport default function RecordDocuments(');
    assert.equal(count(record, 'const heldWords = '), 1);
    assert.ok(record.includes('    const [held, setHeld] = useState(null);') && record.includes('    const sending = useRef(false);'));
    const attach = between(record, '    const attachFiles = async (fileList) => {', '\n    };');
    order(attach, 'if (!files.length) return;',
        'if (sending.current) { setHeld((h) => [...new Map([...(h || []), ...files.map((f) => [f.name, validateFile(f)])])]); return; }',
        'const refused = files.map((f) => [f, validateFile(f)]).filter((r) => r[1]);', 'if (refused.length) {',
        'const fine = files.filter((f) => !refused.some((r) => r[0] === f));',
        'setNotice(null); setHeld(null); setError(said);', 'return;',
        'sending.current = true;', 'setBusy(true); setError(null); setNotice(null);', 'setHeld(null);', 'try {',
        '} finally {', 'setBusy(false);', 'sending.current = false;');
    assert.equal(count(attach, 'sending.current'), 3, 'read once, set once, cleared once');
    // Moved in §0.249 (review fixes, last pass, F2): a held file is checked as it is held — the one check, twice.
    assert.equal(count(attach, 'validateFile('), 2, 'every file through the one check — held or taken');
    assert.ok(!attach.includes('if (invalid)'), 'REGRESSION: the check stops at the first refused file');
    assert.ok(record.includes("            {held && (\n                <div style={{ background: `${T.danger}14`, border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '7px 10px', marginBottom: 8, fontSize: 12, color: T.danger, whiteSpace: 'pre-line' }}>{heldWords(held, busy)}</div>\n            )}"),
        'REGRESSION: the held drop\'s names never drawn, or drawn apart from the red');
});

// ── Part 12 — the review's fixes, round 4 (I4 — Invitation import roster match) ──
// The verifier's residual of I3: unreadOnRoster counted an address found on the roster read again as invited by this
// import. It may have been on the server's roster before the import (the screen's settings.users stale, its invitation
// refused this time — users.mjs: Clerk refuses a member, a Manager's held address), and the Results said "10 invitations
// sent." with a ✅. A roster row (users.mjs flatten) carries no created or invited time and no inviter, so it proves
// nothing of who invited them: each found is now `onRoster` — "on the roster — invited by this import or before it" —
// still unread (the invariant holds; onRoster is a breakdown of unread, as notFound is of failed), never "sent". Counted
// sent only where the answer proves it: a 201 says one of ITS request was invited, so the one of a request on the roster
// while the rest of it are not is it. Each not found is still "not invited" (the server refused it).
const P12FXI4_REQ = (from, n) => Array.from({ length: n }, (_, i) => ({ email: `p${from + i}@x.test`, ...((from + i) % 4 === 0 ? { team: 'East', teamId: 't1' } : {}) }));
const p12fxI4Roster = (...emails) => onceOf(200, { users: [{ id: 'usr_old', email: 'old@x.test' }, ...emails.map((e, i) => ({ id: `usr_${i}`, email: e, status: 'Invited' }))] });
const p12fxI4Words = async () => {
    const lit = code(read(P12FXI_MODAL)).match(/describeReceipt\(r, 'invitation', (\{[^}]*\})\)/);
    assert.ok(lit, 'the Results\' invitation words');
    return new Function(`return ${lit[1]};`)();
};

test('Part 12 fix I4: unreadOnRoster — an address on the roster read again is on it (invited by this import or before it), never proven sent; the one of a request on it while the rest are not is proven sent; each request apart — RUN', async () => {
    const { unreadOnRoster, NOT_ON_ROSTER } = await import('../src/utils/importReceipt.js');
    // The residual: pat held before the import (the screen's roster stale), refused this time; the nine invited. All ten
    // are on the roster read again — none proven: pat must never be counted as invited by this import.
    const pat = { email: 'pat@x.test' };
    const nine = P12FXI4_REQ(1, 9);
    const all = unreadOnRoster([[pat, ...nine]], [{ email: 'pat@x.test', status: 'Active' }, ...nine.map(v => ({ email: v.email, status: 'Invited' }))]);
    assert.deepEqual([all.invited, all.onRoster, all.notInvited], [[], [pat, ...nine], []],
        'REGRESSION: an address on the roster before the import counted as invited by it');
    // Proven: one of the request on the roster, the rest not — the 201 says one was invited, so it is that one.
    const req = P12FXI4_REQ(0, 3);
    const one = unreadOnRoster([req], [{ email: ' P1@X.TEST ' }]);
    assert.deepEqual([one.invited, one.onRoster, one.notInvited.map(f => f.email)], [[req[1]], [], ['p0@x.test', 'p2@x.test']],
        'REGRESSION: the one the answer proves sent left unproven');
    assert.ok(one.notInvited.every(f => f.error === NOT_ON_ROSTER));
    // A request of one, on the roster: proven (its 201 names it alone).
    assert.deepEqual(unreadOnRoster([[pat]], [{ email: 'pat@x.test' }]), { invited: [pat], onRoster: [], notInvited: [] });
    // Each request apart: the proof is per request — two of the first on the roster are not, the one of the second is.
    const a = P12FXI4_REQ(0, 2), b = P12FXI4_REQ(10, 2);
    const two = unreadOnRoster([a, b], [{ email: 'p0@x.test' }, { email: 'p1@x.test' }, { email: 'p10@x.test' }]);
    assert.deepEqual([two.invited, two.onRoster, two.notInvited.map(f => f.email)], [[b[0]], [a[0], a[1]], ['p11@x.test']],
        'REGRESSION: the requests read as one — a 201 proves one of ITS request, not one of all');
    assert.equal(two.invited.length + two.onRoster.length + two.notInvited.length, 4, 'each sent unread counted once');
});

test('Part 12 fix I4: the invitation import — the ones found on the roster read again said "on the roster — invited by this import or before it", never "sent" with a ✅; sent only where proven — RUN', async () => {
    const { describeReceipt, isClean, isPartial, NOT_ON_ROSTER, mergeReceipts, receiptFromPreflight } = await import('../src/utils/importReceipt.js');
    const words = await p12fxI4Words();
    // The residual's scenario: ten in one request, answered unread; all ten on the roster (pat before the import).
    const pat = [{ email: 'pat@x.test' }, ...P12FXI4_REQ(1, 9)];
    const r = await p12fxI2Import({ invites: pat, posts: [p12fxIUnreadable()], roster: p12fxI4Roster(...pat.map(v => v.email)) });
    const rc = r.out.receipt;
    assert.deepEqual([rc.unread, rc.onRoster, rc.created, rc.failed, rc.attempted], [10, 10, 0, 0, 10],
        'REGRESSION: the ones found counted as invited by this import — "10 invitations sent." over pat refused');
    p12fxIInvariant(rc);
    assert.equal(describeReceipt(rc, 'invitation', words), '10 on the roster — invited by this import or before it.');
    assert.deepEqual([isClean(rc), isPartial(rc)], [false, true], 'REGRESSION: drawn as clean — "Invitations Sent" and a ✅');
    assert.deepEqual(r.out.refusals, []);
    assert.ok(!/invitations? sent|up to|some may have been refused|reload/.test(describeReceipt(rc, 'invitation', words)), 'never "sent", never "up to"');
    // Proven: one of the request on the roster, the rest not.
    const p = await p12fxI2Import({ invites: P12FXI4_REQ(0, 10), posts: [p12fxIUnreadable()], roster: p12fxI4Roster('p3@x.test') });
    assert.deepEqual([p.out.receipt.unread, p.out.receipt.onRoster, p.out.receipt.created, p.out.receipt.failed], [0, 0, 1, 9],
        'REGRESSION: the one the 201 proves sent left unread');
    assert.equal(describeReceipt(p.out.receipt, 'invitation', words), '1 invitation sent. 9 not sent.');
    assert.equal(p.out.refusals.length, 9);
    assert.ok(p.out.refusals.every(f => f.error === NOT_ON_ROSTER));
    // A request of one on the roster: sent, clean.
    const solo = await p12fxI2Import({ invites: P12FXI4_REQ(1, 1), posts: [p12fxIUnreadable()], roster: p12fxI4Roster('p1@x.test') });
    assert.deepEqual([solo.out.receipt.unread, solo.out.receipt.onRoster, solo.out.receipt.created, isClean(solo.out.receipt)], [0, 0, 1, true]);
    // Two requests answered unread: each read apart — p0, p1 of the first on the roster (not proven), p10 of the second (proven).
    const two = await p12fxI2Import({ invites: P12FXI4_REQ(0, 12), posts: [p12fxIUnreadable(), p12fxIUnreadable()],
        roster: p12fxI4Roster('p0@x.test', 'p1@x.test', 'p10@x.test') });
    const t = two.out.receipt;
    assert.deepEqual([t.unread, t.onRoster, t.created, t.failed, t.attempted], [2, 2, 1, 9, 12], 'REGRESSION: the two requests read as one');
    p12fxIInvariant(t);
    assert.equal(describeReceipt(t, 'invitation', words), '1 invitation sent, 2 on the roster — invited by this import or before it. 9 not sent.');
    // Of the ones that named a team (p0, p4, p8), only p0 is on the roster — the on-roster ones still said, "they".
    // Moved in §0.249 (review fixes, last pass, F2): the team sentence asks the Admin to check the Teams page — no roster row proves who is on no list.
    assert.equal(two.out.warning, "1 whose answer could not be read named a team — check on the Teams page that they are on its list.");
    // A roster read that failed: no onRoster, the "up to" words, as before.
    const f = await p12fxI2Import({ invites: P12FXI4_REQ(0, 10), posts: [p12fxIUnreadable()], roster: UNSENT() });
    assert.deepEqual([f.out.receipt.unread, f.out.receipt.onRoster, f.out.receipt.failed], [10, 0, 0]);
    assert.equal(describeReceipt(f.out.receipt, 'invitation', words), 'Up to 10 invitations sent — the answer could not be read; some may have been refused.');
    // The Results merge the handler's receipt with the preflight's (CsvImportModal mergeReceipts): onRoster survives it.
    const merged = mergeReceipts(receiptFromPreflight({ skipped: 1 }), rc);
    assert.equal(merged.onRoster, 10, 'REGRESSION: the merge drops onRoster — the Results say "Up to 10 … sent"');
    assert.equal(describeReceipt(merged, 'invitation', words), '10 on the roster — invited by this import or before it. 1 skipped.');
});

test('Part 12 fix I4: describeReceipt — the ones on the roster said apart from the ones unread, in their own words, never twice — RUN', async () => {
    const { emptyReceipt, describeReceipt } = await import('../src/utils/importReceipt.js');
    const words = await p12fxI4Words();
    const say = (o) => describeReceipt({ ...emptyReceipt(), ...o }, 'invitation', words);
    assert.equal(emptyReceipt().onRoster, 0, 'REGRESSION: the empty receipt holds no onRoster — the merge drops it');
    assert.equal(say({ attempted: 2, unread: 2, onRoster: 2 }), '2 on the roster — invited by this import or before it.');
    assert.equal(say({ attempted: 4, created: 1, failed: 1, unread: 2, onRoster: 2 }), '1 invitation sent, 2 on the roster — invited by this import or before it. 1 not sent.');
    // Some unread (a failed read) and some on the roster (never one path, but a merge may hold both): each said once.
    assert.equal(say({ attempted: 5, unread: 5, onRoster: 2 }), 'Up to 3 invitations sent — the answer could not be read; some may have been refused, 2 on the roster — invited by this import or before it.',
        'REGRESSION: the ones on the roster said twice — once as "up to"');
    assert.equal(say({ attempted: 3, unread: 3, onRoster: 2 }), '1 invitation sent — the answer could not be read, 2 on the roster — invited by this import or before it.');
    // onRoster never more than unread.
    assert.equal(say({ attempted: 1, unread: 1, onRoster: 3 }), '1 on the roster — invited by this import or before it.');
    // None on the roster: the words of rounds 2-3, unchanged.
    assert.equal(say({ attempted: 10, unread: 10 }), 'Up to 10 invitations sent — the answer could not be read; some may have been refused.');
});

test('Part 12 fix I4: the Results\' tiles — the ones on the roster a tile of their own, "on the roster — invited by this import or before it", never in the unread tile; the tiles add up to everyone attempted — RUN', async () => {
    const { emptyReceipt } = await import('../src/utils/importReceipt.js');
    const r = { ...emptyReceipt(), attempted: 12, created: 1, failed: 9, unread: 2, onRoster: 2 };
    const tiles = await p12fxI2Tiles(r);
    assert.deepEqual(tiles.map(t => [t.label, t.n]), [['invited', 1], ['failed', 9], ['on the roster — invited by this import or before it', 2]],
        'REGRESSION: the ones on the roster drawn as "sent or refused", or twice');
    assert.equal(tiles.reduce((a, t) => a + t.n, 0), r.attempted);
    assert.equal(tiles[2].color, T.warn);
    assert.ok(!tiles[2].upTo, 'a count of rows on the roster, not "up to"');
    // A merge holding both: each its own tile, the unread one less the ones on the roster.
    const mixed = await p12fxI2Tiles({ ...emptyReceipt(), attempted: 3, unread: 3, onRoster: 2 });
    assert.deepEqual(mixed.map(t => [t.label, t.n, !!t.upTo]), [['sent — answer unread', 1, false], ['on the roster — invited by this import or before it', 2, false]]);
    const mixed2 = await p12fxI2Tiles({ ...emptyReceipt(), attempted: 5, unread: 5, onRoster: 2 });
    assert.deepEqual(mixed2.map(t => [t.label, t.n, !!t.upTo]), [['sent or refused — answer unread', 3, true], ['on the roster — invited by this import or before it', 2, false]]);
    assert.equal(new Set(mixed2.map(t => t.label)).size, mixed2.length, 'each tile its own key');
    // No onRoster: the tiles of round 3, unchanged.
    assert.ok(!(await p12fxI2Tiles({ ...emptyReceipt(), attempted: 3, unread: 3 })).some(t => t.label.startsWith('on the roster')));
});

test('Part 12 fix I4: WIRING — each request answered unread kept apart; the ones on the roster stay unread as onRoster; the team count reads every one sent unread', () => {
    const l = code(read(P12FXI_LAYER));
    const h = between(l, 'onImportUsers={async (invites) => {', 'return { receipt, refusals, warning };');
    assert.equal(count(h, 'sentUnread.push('), 1);
    assert.ok(h.includes('sentUnread.push(chunk);') && !h.includes('sentUnread.push(...chunk)'), 'REGRESSION: the requests read as one');
    order(h, 'let teamless = sentUnread.flat();', 'receipt.unread = onRoster.length;', 'receipt.onRoster = onRoster.length;', 'teamless = [...invited, ...onRoster];');
    assert.ok(!h.includes('receipt.unread = 0;'), 'REGRESSION: the ones on the roster dropped from the receipt');
    const rc = read('src/utils/importReceipt.js');
    assert.ok(rc.includes("onRoster: 'on the roster — invited by this import or before it'"));
});

// ── Part 12 — the review's fixes, round 4 (C4 — Calendar after an org switch) ──
// The verifier's residual of round 3 (state §0.249). App's switch effect puts the calendar strip back (useOrgBoundState,
// §0.174) only after the switch's own render has painted, and the tabs remount in that render: Home's first frame in
// the new org drew the last org's read — "Connect your calendar to see your meetings on Home." and its Connect button
// over a calendar connected in the new org — and the profile panel "Not connected", OFF and Connect, Tasks "Calendar not
// connected". The calendar hook now takes the org on screen and holds the org its strip was put back for
// (calendarStripOrg, moved in its own effect in the reset's commit): until the two match, every screen gets a calendar
// not read in it — no events, no error, not loading, not connected, not read — so Home, Tasks and the panel say they are
// checking. The header's own Disconnect state ("Disconnected", "Not disconnected — …") is tied to its org the same way
// (calTabOrg). Run here: the REAL hook, from its source, through React's own renderer (react-dom/server, whose
// render-phase updates stand in for an answer and a switch; it runs no effect, so the switch's commit is run by hand —
// the hook's effect, then App's reset).
const P12FXC4_HOOK = 'src/hooks/useCalendarState.js';
const p12fxC4EvA = { id: 'ev_a', summary: 'Org A meeting' };
const p12fxC4EvB = { id: 'ev_b', summary: 'Org B meeting' };
// The hook built from its own source over React's useState and a useEffect that keeps each render's effects for the
// commit, which runs those whose dependencies changed since the last commit (the mount's runs in the first render);
// `steps[i]` runs in render i with the hook's answer and { org, commit }; each render's strip is kept.
const p12fxC4Run = async (org0, steps) => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { useOrgBoundState, resetAllOf } = await import('../src/hooks/useOrgBoundState.js');
    const { isoLocal, todayLocal } = await import('../src/utils/dateLocal.js');
    const src = code(read(P12FXC4_HOOK));
    const effects = [];
    let committed = null;
    const runEffects = () => {
        effects.forEach((e, k) => {
            const was = committed?.[k];
            if (!was || !e.deps || e.deps.some((d, j) => !Object.is(d, was[j]))) e.fn();
        });
        committed = effects.map((e) => e.deps);
    };
    const useCalendarState = new Function('useState', 'useEffect', 'useOrgBoundState', 'resetAllOf', 'isoLocal', 'todayLocal',
        `${between(src, 'const NO_EVENTS = ', ';\n')};\n${src.slice(src.indexOf('function useCalendarState(activeOrgId) {'))}\nreturn useCalendarState;`)(
        React.useState, (fn, deps) => { effects.push({ fn, deps }); }, useOrgBoundState, resetAllOf, isoLocal, todayLocal);
    const org = { now: org0 };
    const seen = [];
    let i = 0;
    function Probe() {
        effects.length = 0;
        const cal = useCalendarState(org.now);
        seen.push({ org: org.now, events: cal.calendarEvents, loading: cal.calendarLoading, error: cal.calendarError,
            connected: cal.calendarConnected, read: cal.calendarRead });
        if (committed === null) runEffects();   // the mount's commit
        const step = steps[i++];
        // The switch's commit, as App runs it: the hook's effect, then App's reset (declared after the hooks).
        if (step) step(cal, { org, commit: () => { runEffects(); cal.resetOnOrgSwitch(); } });
        return null;
    }
    renderToString(React.createElement(Probe));
    return seen;
};
const p12fxC4Strip = (s) => [s.events, s.loading, s.error, s.connected, s.read];
const P12FXC4_NOT_READ = [[], false, null, false, false];
// What each screen draws from a strip: Home's strip, Tasks' rail and the profile panel's Calendar tab, from their source.
const p12fxC4Screens = (() => {
    let built = null;
    return (s, { disconnected = false } = {}) => {
        if (!built) {
            const home = code(read(P12FXC_HOME));
            const tasks = code(read(P12FXC_TASKS));
            built = {
                home: p12fxC2Chain(between(home, '{calendarError ? (', 'Refreshing…</span>'), /(?:^\{|\n\s*\) : )(?:([^\n?]+?) \? )?\(\n/g,
                    { error: '{calendarError}', checking: 'Checking your calendar…', connect: 'Connect your calendar to see', connected: 'Calendar connected — no meetings today' },
                    ['calendarError', 'calendarLoading', 'calendarConnected', 'calendarRead']),
                tasks: p12fxC2Chain(between(tasks, '{calendarError\n', 'Calendar not connected</div>)') + 'Calendar not connected', /(?:^\{|\n\s*: )(?:([^\n?]+?)\n\s*\? )?\(/g,
                    { error: '{calendarError}', synced: 'Synced', checking: 'Checking the calendar…', notConnected: 'Calendar not connected' },
                    ['calendarError', 'calendarLoading', 'calendarConnected', 'calendarRead']),
            };
        }
        const st = { calendarError: s.error, calendarLoading: s.loading, calendarConnected: s.connected, calendarRead: s.read };
        return { home: built.home(st), tasks: built.tasks(st),
            panel: p12fxCPanel({ loading: s.loading, error: s.error, connected: s.connected, read: s.read, disconnected }) };
    };
})();
const P12FXC4_CHECKING = { home: 'checking', tasks: 'checking', panel: { status: 'Checking…', pill: '—', connect: false, refresh: true, count: false } };

test('Part 12 fix C4: the switch\'s own render never draws the last org\'s calendar — a read that found none, no "Connect your calendar…", "Calendar not connected" or "Not connected"; the new org\'s read drawn once it lands — RUN', async () => {
    const seen = await p12fxC4Run('org_a', [
        (cal) => { cal.setCalendarRead(true); cal.setCalendarConnected(false); },               // org A's read lands: none
        (cal, { org }) => { org.now = 'org_b'; cal.setCalView('day'); },                          // the switch's own render
        (cal, { commit }) => { commit(); cal.setCalendarLoading(true); },                         // its commit; App's Home effect reads
        (cal) => { cal.setCalendarConnected(true); cal.setCalendarEvents([p12fxC4EvB]); cal.setCalendarRead(true); cal.setCalendarLoading(false); },
    ]);
    assert.equal(seen.length, 5);
    assert.deepEqual(p12fxC4Strip(seen[1]), [[], false, null, false, true], 'org A: a read that found none');
    assert.deepEqual(p12fxC4Screens(seen[1]).home, 'connect', 'org A offers Connect — its own read said none');
    assert.equal(seen[2].org, 'org_b');
    assert.deepEqual(p12fxC4Strip(seen[2]), P12FXC4_NOT_READ,
        'REGRESSION: the switch\'s own render handed the new org the last org\'s read');
    assert.deepEqual(p12fxC4Screens(seen[2]), P12FXC4_CHECKING,
        'REGRESSION: org B\'s first frame drew org A\'s "Connect your calendar…", "Calendar not connected" or "Not connected", OFF and Connect');
    assert.deepEqual(p12fxC4Strip(seen[3]), [[], true, null, false, false], 'after the commit: org B\'s read in flight');
    assert.deepEqual(p12fxC4Screens(seen[3]), P12FXC4_CHECKING);
    assert.deepEqual(p12fxC4Strip(seen[4]), [[p12fxC4EvB], false, null, true, true],
        'REGRESSION: org B\'s own read never drawn — the strip left masked after the switch\'s commit');
    assert.deepEqual([p12fxC4Screens(seen[4]).home, p12fxC4Screens(seen[4]).tasks], ['connected', 'synced']);
});

test('Part 12 fix C4: the switch\'s own render hands the new org none of the last org\'s strip — no events, no error, no read in flight, not connected, not read; one empty list every masked render — RUN', async () => {
    const ERR = 'The calendar could not be read — The server returned 502.';
    const seen = await p12fxC4Run('org_a', [
        (cal) => { cal.setCalendarRead(true); cal.setCalendarConnected(true); cal.setCalendarEvents([p12fxC4EvA]); cal.setCalendarError(ERR); cal.setCalendarLoading(true); },
        (cal, { org }) => { org.now = 'org_b'; cal.setCalView('day'); },
        (cal) => { cal.setCalOffset(1); },                                                        // a second render before the commit
        (cal, { commit }) => { commit(); },
    ]);
    assert.deepEqual(p12fxC4Strip(seen[1]), [[p12fxC4EvA], true, ERR, true, true], 'org A: its own strip');
    for (const at of [2, 3]) {
        assert.deepEqual(p12fxC4Strip(seen[at]), P12FXC4_NOT_READ,
            'REGRESSION: org A\'s events, error, read in flight, connection or read handed to org B\'s first frame');
        assert.deepEqual(p12fxC4Screens(seen[at]), P12FXC4_CHECKING, 'REGRESSION: org A\'s meetings, error or "Connected" drawn under org B');
    }
    assert.equal(seen[2].events, seen[3].events, 'REGRESSION: a new empty list each masked render — what depends on the events runs again for nothing');
    assert.deepEqual(p12fxC4Strip(seen[4]), P12FXC4_NOT_READ, 'after the commit: the reset\'s, org B\'s own');
});

test('Part 12 fix C4: no org on screen, no calendar — a strip never handed out while no org is active, the switch to none included — RUN', async () => {
    const none = await p12fxC4Run(null, [
        (cal) => { cal.setCalendarRead(true); cal.setCalendarConnected(true); cal.setCalendarEvents([p12fxC4EvA]); },
    ]);
    assert.deepEqual(p12fxC4Strip(none[1]), P12FXC4_NOT_READ, 'REGRESSION: a calendar handed out with no org active');
    const toNone = await p12fxC4Run('org_a', [
        (cal) => { cal.setCalendarRead(true); cal.setCalendarConnected(true); cal.setCalendarEvents([p12fxC4EvA]); },
        (cal, { org }) => { org.now = null; cal.setCalView('day'); },
        (cal, { commit }) => { commit(); },
        (cal) => { cal.setCalendarRead(true); cal.setCalendarConnected(true); },
    ]);
    assert.deepEqual(p12fxC4Strip(toNone[2]), P12FXC4_NOT_READ, 'the switch to none');
    assert.deepEqual(p12fxC4Strip(toNone[4]), P12FXC4_NOT_READ, 'REGRESSION: with no org active, a strip handed out once the commit ran');
});

test('Part 12 fix C4: the profile panel\'s own Disconnect state is its org\'s — the switch\'s own render draws no "Disconnected" and no "Not disconnected — …" of the last org; the tag moves in the resets\' commit — RUN', () => {
    const h = code(read(P12B_HEADER));
    const derive = new Function('activeOrgId', 'calTabOrg', 'calActionErrorKept', 'calDisconnectedKept',
        `${between(h, '    const calTabHere = ', '\n    const calUnread = ')}\nreturn { calActionError, calDisconnected };`);
    const WORDS = 'Not disconnected — The server returned 500.';
    assert.deepEqual(derive('org_b', 'org_a', WORDS, true), { calActionError: '', calDisconnected: false },
        'REGRESSION: org A\'s "Disconnected" or "Not disconnected — …" drawn in org B\'s first frame');
    assert.deepEqual(derive('org_a', 'org_a', WORDS, true), { calActionError: WORDS, calDisconnected: true }, 'its own org: both stand');
    assert.deepEqual(derive('org_a', 'org_a', '', false), { calActionError: '', calDisconnected: false });
    assert.deepEqual(derive(null, null, WORDS, true), { calActionError: '', calDisconnected: false }, 'REGRESSION: drawn with no org active');
    // The residual's frame whole: org A's read found none and its Disconnect landed; org B's first frame is checking.
    const first = derive('org_b', 'org_a', WORDS, true);
    assert.deepEqual(p12fxC4Screens({ events: [], loading: false, error: null, connected: false, read: false }, { disconnected: first.calDisconnected }).panel,
        P12FXC4_CHECKING.panel, 'REGRESSION: "Disconnected", OFF and "Connect Google Calendar" of org A in org B\'s first frame');
    // The tag moves with the org, in the same commit as the two resets.
    const line = between(h, '    useEffect(() => { setCalTabOrg(activeOrgId); }', ']);') + ']);';
    const ran = [];
    let deps = null;
    new Function('useEffect', 'setCalTabOrg', 'activeOrgId', line)((fn, d) => { deps = d; fn(); }, (v) => ran.push(v), 'org_b');
    assert.deepEqual([ran, deps], [['org_b'], ['org_b']], 'REGRESSION: the tab\'s tag never moves — its own org\'s Disconnect never drawn again');
    order(h, '    useEffect(() => { setCalActionError(\'\'); }, [showProfilePanel, activeOrgId]);', '    useEffect(() => { setCalDisconnected(false); }, [activeOrgId]);',
        '    useEffect(() => { setCalTabOrg(activeOrgId); }, [activeOrgId]);');
    assert.ok(h.includes('const [calTabOrg, setCalTabOrg] = useState(activeOrgId);'));
    assert.ok(h.includes('const [calActionErrorKept, setCalActionError] = useState(\'\');'));
    assert.equal(count(h, 'calActionErrorKept'), 2, 'kept, and read through the tag alone');
    assert.equal(count(h, 'calDisconnectedKept'), 2, 'kept, and read through the tag alone');
});

test('Part 12 fix C4: WIRING — App hands the calendar hook the org on screen; the hook alone holds the strip, and every screen reads it through App', () => {
    const app = code(read(P12FXC3_APP));
    assert.ok(app.includes('    const calState = useCalendarState(activeOrgId);'), 'REGRESSION: the hook never told the org on screen');
    order(app, 'const activeOrgId = ', 'const calState = useCalendarState(activeOrgId);');
    const hook = code(read(P12FXC4_HOOK));
    assert.ok(hook.includes('export function useCalendarState(activeOrgId) {'));
    assert.ok(hook.includes("import { useState, useEffect } from 'react';"));
    assert.ok(hook.includes('    const [calendarStripOrg, setCalendarStripOrg] = useState(activeOrgId);'), 'plain state: the reset never puts it back');
    assert.equal(count(hook, 'setCalendarStripOrg('), 1, 'moved by its effect alone');
    const callers = srcFiles().filter((f) => f !== P12FXC4_HOOK && read(f).includes('useCalendarState('));
    assert.deepEqual(callers, [P12FXC3_APP], 'one caller: App, which hands the strip to every screen');
});

// ── Part 12 — the review's fixes, round 4 (S4 — Sales Manager claim words) ──
// The verifier's residuals on round 3 (state §0.249) and the main session's decision: the batch's rule holds (the quota
// board's, §0.203; round 3's Audit destRefusedOwn; the document record step's) — only a 4xx carrying the server's own
// words proves nothing was written. claimRefused (a SPIFF claim's Approve, Reject and Delete) says "Not saved —" / "Not
// deleted —" and refusalWords for that answer alone; anything else — a 5xx, a gateway's page, a wordless 4xx — says "The
// claim may have been saved — reload the page to see whether it was: " and refusalWords' words, typed and trimmed. Its 5xx
// line said a raw d.error ("The server returned 500 —    .", "— [object Object]"), and round 3 said a wordless 4xx was
// "Not saved — The server returned 409.". sendQuotas is unchanged.
const P12FXS4_SMT = 'src/Tabs/SalesManagerTab.jsx';
// Moved in §0.249 (review fixes, last pass, F4): the test is the tab's one, ownRefusal — a 4xx, its error a string, trimmed — and claimRefused reads it.
const P12FXS4_OWN = "const ownRefusal = (status, d) => status >= 400 && status < 500 && typeof d?.error === 'string' && !!d.error.trim();";
const P12FXS4_HEAD = "const claimRefused = (done, d, status) => (ownRefusal(status, d)";
const P12FXS4_MAYBE = '    : `The claim may have been ${done} — reload the page to see whether it was: ${refusalWords({ status }, d)}`);';
const P12FXS4_NEVER = /\[object Object\]|undefined|the server returned|Unexpected token|HTTP|:\s*$|—\s+\.|\(ref\s*\)/;

test('Part 12 fixes, round 4 (S4): a SPIFF claim\'s words — "Not saved" only for a 4xx in the server\'s own words (typed and trimmed); a 5xx, a gateway\'s page or a wordless 4xx says the claim may have been, in refusalWords\' words, never a raw d.error — RUN', () => {
    const { claimRefused } = p12bClaimWords();
    for (const [d, status, done, msg] of [
        // The server's own refusal: it wrote nothing.
        [{ error: 'id required', requestId: 'req_4' }, 400, 'deleted', 'Not deleted — id required (ref req_4)'],
        [{ error: ' Forbidden ', requestId: '  ' }, 403, 'saved', 'Not saved — Forbidden'],
        [{ error: 'Claim already approved', requestId: ' r5 ' }, 409, 'saved', 'Not saved — Claim already approved (ref r5)'],
        // A 4xx with no words of its own: nothing proves it wrote nothing.
        [{}, 409, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 409.'],
        [null, 400, 'deleted', 'The claim may have been deleted — reload the page to see whether it was: The server returned 400.'],
        [{ error: '   ', requestId: 'r6' }, 400, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 400.'],
        [{ error: 42 }, 422, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 422.'],
        [{ error: { message: 'x' } }, 409, 'deleted', 'The claim may have been deleted — reload the page to see whether it was: The server returned 409.'],
        // A 5xx: the write may have landed — its words, typed and trimmed, with their ref (the verifier's residual 1).
        [{ error: 'Internal server error', requestId: 'r1' }, 500, 'saved', 'The claim may have been saved — reload the page to see whether it was: Internal server error (ref r1)'],
        [{ error: '  Boom  ', requestId: ' r2 ' }, 500, 'deleted', 'The claim may have been deleted — reload the page to see whether it was: Boom (ref r2)'],
        [{ error: '   ' }, 500, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 500.'],
        [{ error: { message: 'x' } }, 503, 'saved', 'The claim may have been saved — reload the page to see whether it was: The server returned 503.'],
        [null, 502, 'deleted', 'The claim may have been deleted — reload the page to see whether it was: The server returned 502.'],
    ]) {
        const said = claimRefused(done, d, status);
        assert.equal(said, msg, `REGRESSION: ${status} ${JSON.stringify(d)}`);
        assert.doesNotMatch(said, P12FXS4_NEVER, `REGRESSION: ${status} ${JSON.stringify(d)} — own or raw words`);
    }
});

test('Part 12 fixes, round 4 (S4): Approve and Delete pressed — a 5xx with a blank or non-string error, a 4xx with a non-string error, say the claim may have been; a 4xx in the server\'s words says "Not"; the list unchanged — RUN', async () => {
    for (const [which, done] of [['status', 'saved'], ['delete', 'deleted']]) {
        for (const [answer, msg] of [
            [onceOf(500, { error: '   ' }), `The claim may have been ${done} — reload the page to see whether it was: The server returned 500.`],
            [onceOf(503, { error: { message: 'x' } }), `The claim may have been ${done} — reload the page to see whether it was: The server returned 503.`],
            [onceOf(422, { error: 42, requestId: 'r7' }), `The claim may have been ${done} — reload the page to see whether it was: The server returned 422.`],
            [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), `The claim may have been ${done} — reload the page to see whether it was: Internal server error (ref r1)`],
            [onceOf(409, { error: 'Claim already approved', requestId: 'r5' }), `Not ${done} — Claim already approved (ref r5)`],
        ]) {
            const r = await p12bClaimPress(which, { answer });
            assert.deepEqual([r.states, r.claims], [[{ status: 'error', msg }], [P12B_CLAIM, P12B_CLAIM_2]], `REGRESSION (${which}): ${msg}`);
            assert.doesNotMatch(r.states[0].msg, P12FXS4_NEVER);
        }
    }
});

test('Part 12 fixes, round 4 (S4): WIRING — claimRefused reads the server\'s own refusal as the batch does (a 4xx, its error a string, trimmed) and says every other answer in the maybe sentence, refusalWords\' words; no raw d.error, no old 5xx sentence', () => {
    const s = code(read(P12FXS4_SMT));
    const lines = s.split('\n');
    assert.equal(lines.filter((l) => l === P12FXS4_OWN).length, 1, 'the test, whole: only a 4xx with words, typed and trimmed, is the server\'s own refusal');
    assert.equal(lines.filter((l) => l === P12FXS4_HEAD).length, 1, 'the head, whole: claimRefused reads that test');
    order(s, P12FXS4_OWN, P12FXS4_HEAD);
    assert.equal(lines.filter((l) => l === P12FXS4_MAYBE).length, 1, 'the maybe sentence, whole');
    order(s, P12FXS4_HEAD, '    ? `Not ${done} — ${refusalWords({ status }, d)}`', P12FXS4_MAYBE, '\nconst claimUnanswered = ');
    const words = between(s, 'const claimRefused = (', '\nconst claimUnanswered');
    assert.equal(count(words, 'refusalWords({ status }, d)'), 2, 'the refusal\'s words and the maybe sentence\'s, both refusalWords\'');
    assert.ok(!/\$\{d\??\.error|d\??\.error \?|d\??\.requestId/.test(words), 'REGRESSION: a raw d.error or ref in claimRefused\'s words');
    assert.ok(!words.includes('Reload the page') && !words.includes('The server returned'), 'REGRESSION: the old 5xx sentence, its own words');
    assert.ok(!words.includes(`${String.fromCharCode(92)}u2014`), 'the dash is the character, never its escape');
});

// ── Part 12 — the review's fixes, round 4 (G4 — THE GUARD floors) ──
// Re-measured after every round 4 fix (§0.249), with the guard's own functions in memory (node:test stubbed, the module
// piped through stdin): (iii) 192 body reads over the 242 sources under src/ — the Audit log's Add and Remove read a
// refusal's body inside their ok checks too, judged by destRefusedOwn (A4), two checked reads where readRefusal read them
// before; (iv) 188 catch clauses over its 54 files, CLEANED naming each once; (i) 126 error states. BODY_FIRST's 24 names
// all remain (its stale check), 10 with a check, App's one `outer`. The verifier's residuals on round 3: this file's own
// source walks — Part 12c's "check your connection" scan and S's "network error" scan — held at 240 where 242 sources
// are measured (two could drop out of the walk and go unsearched); both are 242 now, and Part 7c's srcFiles (read by
// 7c's scans, 9g's and C4's callers) is held at the same 242. G3's WIRING (with G and G2 before it) is merged here: one
// test holds every floor at the measured count, so none is left looser beside it. A floor lowered without its reason
// fails here: say the new count, and why, in both places.
const P12FXG4_SOURCES = 242;
const p12fxG4Floor = (s, needle) => {
    const i = s.indexOf(needle);
    assert.ok(i >= 0, needle);
    assert.equal(s.split(needle).length, 2, `one floor: ${needle}`);
    return Number(/^\d+/.exec(s.slice(i + needle.length))[0]);
};

test('Part 12 fixes, round 4 (G4): WIRING — THE GUARD\'s floors are the counts measured after round 4: (iii) 192 body reads over 242 sources, (iv) 188 catch clauses over 54 files, the list held, (i) 126 error states', () => {
    const s = read('tests/refusals-said.test.mjs');
    const iii = between(s, "test('(iii) under src/,", "test('(iii) self-test (§0.248)");
    assert.ok(p12fxG4Floor(iii, 'assert.ok(reads >= ') >= 192, 'REGRESSION: scan (iii)\'s floor below the 192 body reads measured after round 4');
    assert.ok(p12fxG4Floor(iii, 'assert.ok(SWEPT.length >= ') >= P12FXG4_SOURCES, 'REGRESSION: scan (iii) no longer held at the 242 sources under src/');
    order(iii, 'for (const f of SWEPT) {', 'assert.ok(SWEPT.length >= ', 'assert.ok(reads >= ');
    const iv = between(s, "test('(iv) in the files the sweep owns", "test('(iv) self-test");
    // 187 since AI scoring batch 2B took "Score all deals" and its catch out (PipelineTab.jsx; Jeff, 17 Nov, Q4).
    assert.ok(p12fxG4Floor(iv, 'assert.ok(catches >= ') >= 187, 'REGRESSION: scan (iv)\'s floor below the 187 catch clauses measured after AI scoring batch 2B');
    assert.ok(p12fxG4Floor(iv, 'assert.ok(MESSAGE_SCANNED.length >= ') >= 54, 'REGRESSION: scan (iv)\'s list no longer held at its 54 files');
    assert.ok(iv.includes("assert.equal(new Set(CLEANED).size, CLEANED.length, 'CLEANED names each file once');"), 'REGRESSION: a file named twice pads the list');
    order(iv, 'assert.ok(MESSAGE_SCANNED.length >= ', 'for (const f of MESSAGE_SCANNED) {', 'assert.ok(catches >= ');
    const i = between(s, "test('(i) every error state under src/ is read", "test('(i) self-test");
    assert.ok(p12fxG4Floor(i, 'assert.ok(states >= ') >= 126, 'REGRESSION: scan (i)\'s floor below the 126 error states measured after round 4');
    order(i, 'unreadStatesIn(', 'assert.ok(states >= ');
});

test('Part 12 fixes, round 4 (G4): WIRING — this file\'s source walks are held at the 242 sources measured under src/: 12c\'s "check your connection" scan, S\'s "network error" scan, and 7c\'s srcFiles — RUN, and WIRING', () => {
    // RUN: the shared walk sees every source (a walk that lost a folder or an extension would pass 7c's deepEqual([]) scans).
    assert.ok(srcFiles().length >= P12FXG4_SOURCES, `REGRESSION: 7c's srcFiles reads ${srcFiles().length} of the 242 sources under src/`);
    assert.ok(srcFiles().includes('src/App.jsx') && srcFiles().includes('src/utils/storage.js'), 'the walk reads .jsx and .js');
    const s = read('tests/refusal-sweep.test.mjs');
    const c12 = between(s, "test('Part 12c: WIRING — no source under src/ says", '\n});');
    assert.ok(p12fxG4Floor(c12, 'assert.ok(files.length >= ') >= P12FXG4_SOURCES, 'REGRESSION: 12c\'s "check your connection" walk held below the 242 sources');
    order(c12, "walk('src/');", 'assert.ok(files.length >= ', 'const said = files.filter(');
    const sNet = between(s, "test('Part 12 fixes (S): WIRING — no source under src/ draws \"network error\"", '\n});');
    assert.ok(p12fxG4Floor(sNet, 'assert.ok(files.length >= ') >= P12FXG4_SOURCES, 'REGRESSION: S\'s "network error" walk held below the 242 sources');
    order(sNet, "walk('src/');", 'assert.ok(files.length >= ', 'for (const f of files) {');
    const helper = between(s, 'const srcFiles = () => {', '\n};');
    order(helper, "walk('src/');", 'return out;');
    assert.ok(helper.includes('else if (/\\.(js|jsx)$/.test(name)) out.push(p);'), '7c\'s walk reads both extensions');
});

// ── Part 12 — the review's fixes, last pass (F1 — Audit Remove 404 and Users MFA filter) ──
// The review of round 4 (A4's first residual, U4). (1) The Audit log's Remove said a delete answered 404 "Destination not
// found." as "Remove destination failed — Destination not found.", the row kept (and, after a Remove that may have
// landed, still counted "status not known") — though audit-stream.mjs answers that 404 only when it finds no such row in
// this org, before its delete: the destination is gone. The module's destGone (a 404 in the server's words) now takes the
// row out of the list and out of statusUnread and says "The destination was already removed.", on a first press or after
// a maybe-Remove; a 404 page without the server's words still proves nothing, and the 400 and 403 are as they were.
// (2) Settings → Users' MFA off filter said "No active member has MFA off." over a list the search box alone emptied, the
// chip beside it counting one; every other filter said "No users yet" over a search, or over a roster with members but
// none in that filter. The module's usersEmptyWords names what emptied the list: a read still out or one that failed
// under MFA off, else the search ("No <who> matches the search."), else the filter's own none.
// The Audit Remove, run over an answer with the rows' status marks before it (p12fxARemove, moved for destGone).
const p12fxF1Gone = () => onceOf(404, { error: 'Destination not found.', requestId: 'r4' });

test('Part 12 fixes (F1): the Audit log\'s Remove — a 404 in the server\'s words takes the row out, said "already removed", on a first press or after a maybe-Remove; a 404 page still a maybe — RUN', async () => {
    // A first press: the row leaves the list, never "failed".
    const first = await p12fxARemove(p12fxF1Gone());
    assert.deepEqual([first.said, first.ids, first.statusUnread, first.busy, first.sent],
        [['The destination was already removed.'], ['dst_2'], [], ['dst_1', null], [['/.netlify/functions/audit-stream?id=dst_1', 'DELETE']]],
        'REGRESSION: "Remove destination failed — Destination not found." over a destination the server proves gone');
    assert.ok(!first.said[0].includes('failed'));
    assert.equal(p12fxABadge(first.dests, true, first.statusUnread), 'Streaming to 1 destination');
    // After a Remove that may have landed (a 500 after the delete): the row kept, not known — then the second press's 404
    // takes it out and out of statusUnread, another row's mark kept.
    const maybe = await p12fxARemove(onceOf(500, { error: 'Internal server error', requestId: 'r1' }), ['dst_2']);
    assert.deepEqual([maybe.ids, maybe.statusUnread], [['dst_1', 'dst_2'], ['dst_2', 'dst_1']]);
    const again = await p12fxARemove(p12fxF1Gone(), maybe.statusUnread);
    assert.deepEqual([again.said, again.ids, again.statusUnread], [['The destination was already removed.'], ['dst_2'], ['dst_2']],
        'REGRESSION: the gone row kept, or its "status not known" mark left behind');
    assert.equal(p12fxABadge(again.dests, true, again.statusUnread), 'Streaming to 1 destination · 1 status not known');
    // A 404 without the server's words proves nothing: still a maybe, the row kept, not known.
    for (const [answer, words] of [[onceOf(404, new SyntaxError("Unexpected token '<'")), 'The server returned 404.'], [onceOf(404, { error: '  ' }), 'The server returned 404.'], [onceOf(404, {}), 'The server returned 404.']]) {
        const did = await p12fxARemove(answer);
        assert.deepEqual([did.said, did.ids, did.statusUnread], [[P12FXA4_MAYBE_REMOVE(words)], ['dst_1', 'dst_2'], ['dst_1']], `REGRESSION: a 404 page taken as gone — ${words}`);
    }
    // The server's other own refusals are as they were: "failed", the row known.
    for (const [answer, words] of [[onceOf(400, { error: 'id is required.' }), 'id is required.'], [onceOf(403, { error: 'Forbidden: insufficient role' }), 'Forbidden: insufficient role']]) {
        const did = await p12fxARemove(answer, ['dst_1']);
        assert.deepEqual([did.said, did.ids, did.statusUnread], [[`Remove destination failed — ${words}`], ['dst_1', 'dst_2'], ['dst_1']], `REGRESSION: ${words} taken as gone`);
    }
    // A landed Remove is as it was.
    const landed = await p12fxARemove(onceOf(200, { success: true }));
    assert.deepEqual([landed.said, landed.ids], [[], ['dst_2']]);
});

test('Part 12 fixes (F1): WIRING — the Audit log\'s Remove judges a 404 by the module\'s destGone before the server\'s other refusals; the server answers it only before its delete', () => {
    const s = code(read(P12A_AUDIT));
    order(s, '\nconst destRefusedOwn = (res, body) => ', '\nconst destGone = (res, body) => res.status === 404 && destRefusedOwn(res, body);', '\nexport const AuditDetail = ');
    assert.equal(count(s, 'const destGone = '), 1);
    const rm = between(s, '    const remove = (dest) => showConfirm(', '\n    }, true);');
    order(rm, 'const refused = await res.json().catch(() => null);', 'if (destGone(res, refused)) {', 'setDests(rows => rows.filter(row => row.id !== dest.id));',
        'setStatusUnread(ids => ids.filter(id => id !== dest.id));', "setDestError('The destination was already removed.');",
        'else if (destRefusedOwn(res, refused)) setDestError(`Remove destination failed — ${refusalWords(res, refused)}`);', 'else maybeRemoved(refusalWords(res, refused));');
    assert.equal(count(s, 'destGone(res, refused)'), 1, 'only the Remove reads a 404 as gone');
    // The server: the DELETE's 404 is its "no such row in this org", answered before the delete.
    const del = between(code(read('netlify/functions/audit-stream.mjs')), "if (event.httpMethod === 'DELETE') {", "return json(200, { success: true });");
    order(del, 'const existing = await rowOf(id);', "if (!existing) return json(404, { error: 'Destination not found.' });", 'await db.delete(auditStreamDestinations)');
    assert.equal(count(del, 'json(404'), 1);
});

// Settings → Users' roster, filtered and searched — the filter, the empty line and the chip extracted from the source and
// run (p12fxU4Drawn, moved to take the search).
const p12fxF1Lines = (mfaData, mfaFailed, search) => ['All', 'Active', 'Invited', 'Deactivated', 'MFA off'].map((f) => {
    const d = p12fxU4Drawn(mfaData, mfaFailed, f, search);
    return [f, d.visible, d.empty];
});

test('Part 12 fixes (F1): Settings → Users\' empty line names a search that emptied the list — never "No active member has MFA off." beside a chip counting one, never "No users yet" over members — RUN', async () => {
    // The MFA read landed, one active member off (C): the chip counts 1; a search for another name empties the list.
    const read = p12fxU4Drawn(P12FXU4_WHOLE(), '', 'MFA off', 'zzz');
    assert.deepEqual([read.chip.label, read.visible, read.empty], ['MFA off · 1', [], 'No active member with MFA off matches the search.'],
        'REGRESSION: "No active member has MFA off." over a list the search alone emptied, the chip counting one');
    assert.deepEqual(p12fxU4Drawn(P12FXU4_WHOLE(), '', 'MFA off', 'c@x').visible, ['C'], 'the search narrows the MFA off list');
    // Every filter, a search that empties it: the search named, the filter's who — never the filter's none.
    assert.deepEqual(p12fxF1Lines(P12FXU4_WHOLE(), '', 'zzz'), [
        ['All', [], 'No member matches the search.'],
        ['Active', [], 'No active member matches the search.'],
        ['Invited', [], 'No pending invitation matches the search.'],
        ['Deactivated', [], 'No deactivated member matches the search.'],
        ['MFA off', [], 'No active member with MFA off matches the search.'],
    ], 'REGRESSION: a search that emptied the list said as none');
    // No search: each filter's own none — "No users yet" only under All (a roster with no one in it).
    const rule = new Function(`${between(p12fxU4Src(), 'const USERS_EMPTY = ', '\n};')}\n};\n${between(p12fxU4Src(), 'const usersEmptyWords = ', '\n};')}\n};\nreturn usersEmptyWords;`)();
    assert.deepEqual(['All', 'Active', 'Invited', 'Deactivated', 'MFA off'].map((f) => rule(f, '', '')),
        ['No users yet — use "Invite users" to add your team.', 'No active members.', 'No invited member in the roster.', 'No deactivated members.', 'No active member has MFA off.'],
        'REGRESSION: "No users yet" under a filter that only has none of its own');
    // The roster's Pending list is its pending_ rows alone — it never reads Clerk, so its none names the roster, never
    // "No invitations pending." (an invitation made only in Clerk is listed on the Pending invitations page, which says
    // that only over Clerk's list read and empty; the main session, last pass).
    assert.ok(!p12fxU4Src().includes("['pending invitation', 'No invitations pending.']"),
        'REGRESSION: the roster\'s Pending filter says "No invitations pending." from a list that never read Clerk');
    // A read still out or one that failed: under MFA off its words, a search or not — the read is why it is empty; the
    // other filters, which do not read MFA, name the search.
    for (const [answer, words] of [...P12A_REFUSED(), [P11_UNREADABLE(), 'Its answer could not be read.']]) {
        const [mfaData, mfaFailed] = await p12fxU4LoadAfter(answer);
        const lines = p12fxF1Lines(mfaData, mfaFailed, 'zzz');
        assert.deepEqual(lines.at(-1), ['MFA off', [], `The MFA status could not be read — ${words}`], `REGRESSION: a failed read under a search said as no match — ${words}`);
        assert.deepEqual(lines[1], ['Active', [], 'No active member matches the search.']);
    }
    assert.deepEqual(p12fxF1Lines(null, '', 'zzz').at(-1), ['MFA off', [], 'The MFA status is still loading…']);
    // An unknown filter reads as All.
    assert.equal(rule('Other', 'q', ''), 'No member matches the search.');
});

test('Part 12 fixes (F1): WIRING — one module-scope rule for the roster\'s empty line, handed the search box the filter reads and the MFA rule\'s words', () => {
    const s = p12fxU4Src();
    order(s, '\nconst mfaUnreadWords = ', '\nconst USERS_EMPTY = {', '\nconst usersEmptyWords = (filter, search, mfaUnread) => {',
        "if (filter === 'MFA off' && mfaUnread) return mfaUnread;", 'const [who, none] = USERS_EMPTY[filter] || USERS_EMPTY.All;',
        'return search ? `No ${who} matches the search.` : none;', '\nconst UserProfilePage = ');
    assert.equal(count(s, 'const usersEmptyWords = '), 1);
    assert.equal(count(s, 'usersEmptyWords('), 1, 'the roster draws one empty line');
    const empty = between(s, '{visible.length === 0 && (', '\n                        )}');
    assert.ok(empty.includes('{usersEmptyWords(filter, search, mfaUnreadWords(mfaByEmail, mfaFailed))}'), 'REGRESSION: the empty line is not handed the search');
    assert.ok(!s.includes("{filter === 'MFA off' ? (mfaUnreadWords("), 'REGRESSION: the MFA off line says none over a search again');
    // The search the line names is the one the filter narrows by.
    assert.ok(s.includes("const [search, setSearch]   = useState('');"));
    order(between(s, '    const visible = displayUsers.filter(u => {', '\n    });'), 'const q = search.toLowerCase();', 'return !q || ');
});

// ── Part 12 — the review's fixes, last pass (F2 — Document held drops, import team words and import thrown failure) ──
// The verifiers' residuals of D4 and I4 (the first and third). (1) A record's Documents held a drop made while a batch
// sent by its files' names alone, and named every one "wait … then drop them again" — a file validateFile refuses was
// invited back and refused when dropped again. Each held file is now checked as it is held ([name, words]): a refused one
// is said by its name and its words, and only the files that would pass are named "Not sent". (2) The invitation import's
// team sentence said "they are on no team's list" of people found on the roster read again — one may have been a member
// before the import, already on its team's list, and a re-invited held row keeps its own team; no row says which. It now
// claims only that they named a team and asks the Admin to check their lists on the Teams page. (3) The CSV import's
// Results drew a thrown failure with no receipt as the raw err.message; it is said through failureWords now.

// A record's Documents with one batch held open: a.pdf sends until `open` is called; `invalid` is validateFile's words.
const p12fxF2Held = async (invalid) => {
    const DOC = { id: 'doc_y' };
    const mk = p12fxD4Make(invalid);
    const { gate, open } = p12fxD4Gate();
    const batch = mk.drop({ 'a.pdf': gate });
    await settle();
    return { ...mk, DOC, finish: async () => { open(DOC); await batch; } };
};
const p12fxF2HeldWords = () => {
    const src = code(read(P12FXD_RECORD));
    return new Function(`return ${between(src, 'const heldWords = ', ';\n').slice('const heldWords = '.length)};`)();
};
const P12FXF2_EXE = 'Unsupported file type: .exe';
const P12FXF2_BIG = 'File exceeds the 50 MB limit';

test('Part 12 fixes, last pass (F2): a record\'s Documents — a drop held while a batch sends is checked as it is held: a refused file said by its words, only the files that would pass named "Not sent" — RUN', async () => {
    const heldWords = p12fxF2HeldWords();
    const h = await p12fxF2Held({ 'x.exe': P12FXF2_EXE, 'big.pdf': P12FXF2_BIG });
    await h.drop({ 'x.exe': h.DOC, 'c.pdf': h.DOC });
    assert.deepEqual(h.did.held.at(-1), [['x.exe', P12FXF2_EXE], ['c.pdf', null]],
        'REGRESSION: a held file never checked — one the check refuses invited back');
    assert.deepEqual(h.did.sent, ['a.pdf'], 'nothing held is sent');
    assert.equal(heldWords(h.did.held.at(-1), true),
        'x.exe: Unsupported file type: .exe\nNot sent: c.pdf — wait for the current upload to finish, then drop them again.',
        'REGRESSION: a refused file named "drop them again" — dropped again it is refused again');
    // A second drop while it still sends: each name once, in the order first held, a refused one with its words.
    await h.drop({ 'big.pdf': h.DOC, 'c.pdf': h.DOC });
    assert.deepEqual(h.did.held.at(-1), [['x.exe', P12FXF2_EXE], ['c.pdf', null], ['big.pdf', P12FXF2_BIG]]);
    await h.finish();
    assert.equal(heldWords(h.did.held.at(-1), false),
        'x.exe: Unsupported file type: .exe\nbig.pdf: File exceeds the 50 MB limit\nNot sent: c.pdf — drop them again.');
    // Dropped again as the words ask, the one named is sent.
    await h.drop({ 'c.pdf': h.DOC });
    assert.deepEqual([h.did.sent, h.did.held.at(-1)], [['a.pdf', 'c.pdf'], null]);
});

test('Part 12 fixes, last pass (F2): a record\'s Documents — the held words: each refused file on its own line with its words, the files that would pass named once "Not sent", none named when every one is refused — RUN', () => {
    const heldWords = p12fxF2HeldWords();
    assert.equal(heldWords([['x.exe', P12FXF2_EXE]], true), 'x.exe: Unsupported file type: .exe',
        'REGRESSION: a "Not sent" line naming no file, or the refused one named "drop them again"');
    assert.equal(heldWords([['a.pdf', null], ['x.exe', P12FXF2_EXE], ['b.pdf', null], ['big.pdf', P12FXF2_BIG]], false),
        'x.exe: Unsupported file type: .exe\nbig.pdf: File exceeds the 50 MB limit\nNot sent: a.pdf, b.pdf — drop them again.',
        'REGRESSION: a refused file left unsaid, or named among the files to drop again');
    assert.equal(heldWords([['a.pdf', null], ['b.pdf', null]], true), 'Not sent: a.pdf, b.pdf — wait for the current upload to finish, then drop them again.');
});

test('Part 12 fixes, last pass (F2): WIRING — a held drop checked by validateFile as it is held, each name once; the held box keeps its lines; heldWords at module scope', () => {
    const record = code(read(P12FXD_RECORD));
    order(record, '\nconst heldWords = (held, busy) => [', '\nexport default function RecordDocuments(');
    const attach = between(record, '    const attachFiles = async (fileList) => {', '\n    };');
    order(attach, 'if (!files.length) return;',
        'if (sending.current) { setHeld((h) => [...new Map([...(h || []), ...files.map((f) => [f.name, validateFile(f)])])]); return; }',
        'const refused = files.map((f) => [f, validateFile(f)]).filter((r) => r[1]);');
    assert.equal(count(attach, 'validateFile('), 2, 'a held drop and a taken drop, each through the one check');
    assert.ok(record.includes("color: T.danger, whiteSpace: 'pre-line' }}>{heldWords(held, busy)}</div>"),
        'REGRESSION: the held box runs its lines together');
});

test('Part 12 fixes, last pass (F2): the invitation import\'s team sentence — the ones found on the roster read again who named a team are never said to be on no team\'s list; the Admin is asked to check — RUN', async () => {
    const CHECK1 = '1 whose answer could not be read named a team — check on the Teams page that they are on its list.';
    // p0..p9 one request answered unread; p0 and p1 on the roster read again (on it, not proven) — p0 named East.
    const one = await p12fxI2Import({ invites: P12FXI4_REQ(0, 10), posts: [p12fxIUnreadable()], roster: p12fxI4Roster('p0@x.test', 'p1@x.test') });
    assert.equal(one.out.receipt.onRoster, 2);
    assert.equal(one.out.warning, CHECK1, 'REGRESSION: one on the roster said to be on no team\'s list — they may have been on it before the import');
    // p0 alone on the roster: proven sent by this import's 201 — still a check, never "on no team's list".
    const proven = await p12fxI2Import({ invites: P12FXI4_REQ(0, 10), posts: [p12fxIUnreadable()], roster: p12fxI4Roster('p0@x.test') });
    assert.deepEqual([proven.out.receipt.created, proven.out.warning], [1, CHECK1]);
    // The residual's scenario: all ten on the roster, three of them named East.
    const all = await p12fxI2Import({ invites: P12FXI4_REQ(0, 10), posts: [p12fxIUnreadable()],
        roster: p12fxI4Roster(...P12FXI4_REQ(0, 10).map((v) => v.email)) });
    assert.equal(all.out.warning, "3 whose answers could not be read named a team — check on the Teams page that they are on their teams' lists.",
        'REGRESSION: the many said as one');
    // A roster read that failed: reload first, then the same check.
    const failed = await p12fxI2Import({ invites: P12FXI4_REQ(0, 10), posts: [p12fxIUnreadable()], roster: UNSENT() });
    assert.ok(failed.out.warning.endsWith("3 whose answers could not be read named a team — reload the page, then check on the Teams page that they are on their teams' lists."));
    for (const w of [one.out.warning, proven.out.warning, all.out.warning, failed.out.warning]) {
        assert.ok(!/no team's list|none is on/.test(w), `REGRESSION: a claim no roster row proves — ${w}`);
        assert.ok(!/\bit\b/.test(w), `REGRESSION: a person named "it" — ${w}`);
    }
});

// The CSV import's runImport, run on a contacts import whose handler throws `thrown`; the Results' receipt it sets.
const p12fxF2Run = async (thrown) => {
    const R = await import('../src/utils/importReceipt.js');
    const did = { called: 0, stats: [], steps: [] };
    const noop = () => {};
    const runImport = p12aFn(P12FXI_MODAL, '    const runImport = async (data, resolvedConflicts, droppedCount = 0, refused = []) => {', '\n    };', '\n    };',
        ['setImporting', 'setImportProgress', 'setRefusals', 'setImportWarning', 'setRefusedRows', 'setParentsIgnored', 'importType', 'window', 'filledCells',
            'receiptFromPreflight', 'onImportContacts', 'onImportOpportunities', 'onImportAccounts', 'onImportUsers', 'inviteFrom', 'teams', 'territories',
            'mergeReceipts', 'emptyReceipt', 'receiptFromError', 'failureWords', 'setImportStats', 'setStep'], 'runImport')(
        noop, noop, noop, noop, noop, noop, 'contacts', {}, (x) => x,
        R.receiptFromPreflight, async () => { did.called++; throw thrown; }, noop, noop, noop, (x) => x, [], [],
        R.mergeReceipts, R.emptyReceipt, R.receiptFromError, failureWords, (v) => did.stats.push(v), (v) => did.steps.push(v));
    await runImport([{ firstName: 'Ann' }], []);
    assert.equal(did.called, 1, 'the handler ran — the failure is the one it threw');
    return { stats: did.stats.at(-1), steps: did.steps };
};

test('Part 12 fixes, last pass (F2): the CSV import — a thrown failure with no receipt said in plain words (failureWords), never its raw message; a receipt still read as fields — RUN', async () => {
    const R = await import('../src/utils/importReceipt.js');
    const off = await p12fxF2Run(UNSENT());
    assert.equal(off.stats.error, 'The server could not be reached.', 'REGRESSION: "Failed to fetch" drawn raw');
    assert.deepEqual(off.steps, ['results']);
    const bug = await p12fxF2Run(new TypeError("Cannot read properties of undefined (reading 'id')"));
    assert.equal(bug.stats.error, 'Its answer could not be read.', 'REGRESSION: a handler\'s TypeError drawn raw');
    const plain = await p12fxF2Run(new Error('The import was refused.'));
    assert.equal(plain.stats.error, 'The import was refused.', 'a plain Error\'s own words');
    const blank = await p12fxF2Run(new Error(''));
    assert.equal(blank.stats.error, 'Its answer could not be read.');
    // An ImportError carries its receipt: its fields, never words.
    const receipt = { ...R.emptyReceipt(), attempted: 1, failed: 1, error: 'The server returned 502.' };
    const counted = await p12fxF2Run(new R.ImportError(receipt, 'contact'));
    assert.deepEqual([counted.stats.attempted, counted.stats.failed, counted.stats.error], [1, 1, 'The server returned 502.']);
});

test('Part 12 fixes, last pass (F2): WIRING — the CSV import says a thrown failure through failureWords, imported from the house rule; no raw message', () => {
    const m = code(read(P12FXI_MODAL));
    assert.ok(m.includes("import { failureWords } from '../../utils/refusalWords.js';"));
    const run = between(m, '    const runImport = async (data, resolvedConflicts, droppedCount = 0, refused = []) => {', '\n    };');
    assert.ok(run.includes('fromHandler || { ...emptyReceipt(), error: failureWords(err) },'), 'REGRESSION: a thrown failure drawn as its raw message');
    assert.ok(!run.includes('err.message'), 'REGRESSION: a raw message');
});

// ── Part 12 — the review's fixes, last pass (F3 — Calendar connect-return after an org switch) ──
// The verifier's residual of round 4 (state §0.249). calConnectResult — the outcome of a calendar Connect the app landed
// back from — is org-bound calendar state, but the hook handed it out unmasked, and App's switch effect puts it back only
// after the switch's own render has painted: in that frame the profile panel's Calendar tab drew the last org's "Google
// Calendar connected — your calendar is live." under the new org's "Checking…", and Company calendar and Connected apps
// (remounted under the new org's key) the last org's line. The hook now hands it out under the strip's tag (calendarHere),
// as round 4 did the strip: none until the strip's org names the org on screen. Run here: the REAL hook, from its source,
// through React's own renderer, as round 4's C4 runner does; each reader's line from its own source.
const P12FXF3_COMPANY = 'src/Tabs/settings/company/CompanyCalendarDetail.jsx';
const P12FXF3_APPS = 'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx';
const P12FXF3_A = { status: 'success', provider: 'google', scope: 'user', from: 'profile', reason: null };
const P12FXF3_A_APPS = { status: 'success', provider: 'google', scope: 'org', from: 'apps', reason: null };
const P12FXF3_B = { status: 'error', provider: 'google', scope: 'org', from: 'company', reason: 'server_error' };
// The hook built from its own source (as p12fxC4Run builds it); `steps[i]` runs in render i with the hook's answer and
// { org, effects, commit } — effects runs the hook's effects whose dependencies changed (the first load's commit, which
// App's reset skips); commit runs them and then App's reset (a switch's). Each render's connect-return is kept.
const p12fxF3Run = async (org0, steps) => {
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { useOrgBoundState, resetAllOf } = await import('../src/hooks/useOrgBoundState.js');
    const { isoLocal, todayLocal } = await import('../src/utils/dateLocal.js');
    const src = code(read(P12FXC4_HOOK));
    const effects = [];
    let committed = null;
    const runEffects = () => {
        effects.forEach((e, k) => {
            const was = committed?.[k];
            if (!was || !e.deps || e.deps.some((d, j) => !Object.is(d, was[j]))) e.fn();
        });
        committed = effects.map((e) => e.deps);
    };
    const useCalendarState = new Function('useState', 'useEffect', 'useOrgBoundState', 'resetAllOf', 'isoLocal', 'todayLocal',
        `${between(src, 'const NO_EVENTS = ', ';\n')};\n${src.slice(src.indexOf('function useCalendarState(activeOrgId) {'))}\nreturn useCalendarState;`)(
        React.useState, (fn, deps) => { effects.push({ fn, deps }); }, useOrgBoundState, resetAllOf, isoLocal, todayLocal);
    const org = { now: org0 };
    const seen = [];
    let i = 0;
    function Probe() {
        effects.length = 0;
        const cal = useCalendarState(org.now);
        seen.push({ org: org.now, result: cal.calConnectResult });
        if (committed === null) runEffects();   // the mount's commit
        const step = steps[i++];
        if (step) step(cal, { org, effects: runEffects, commit: () => { runEffects(); cal.resetOnOrgSwitch(); } });
        return null;
    }
    renderToString(React.createElement(Probe));
    return seen;
};
// What each reader draws from the connect-return it is handed, from its own source: the profile panel's line
// (returnedHere, then calendarReturnMessage), Company calendar's banner and Connected apps' Google card note.
const p12fxF3Lines = (() => {
    let built = null;
    return async (result) => {
        if (!built) {
            const { calendarReturnMessage } = await import('../src/utils/calendarReturn.js');
            const h = code(read(P12B_HEADER));
            const cc = code(read(P12FXF3_COMPANY));
            const ca = code(read(P12FXF3_APPS));
            const returnedHere = new Function('calConnectResult', `${between(h, '    const returnedHere = ', ';\n')};\nreturn returnedHere;`);
            const company = new Function('calConnectResult', `return ${between(cc, "{calConnectResult && calConnectResult.from === 'company'", ' && (\n').slice(1)};`);
            const note = new Function('returned', 'cal', 'calendarReturnMessage', `${between(ca, '    const returnNote = ', ';\n')};\nreturn returnNote;`);
            assert.ok(h.includes('{calendarReturnMessage(calConnectResult)}'));
            assert.ok(cc.includes('{calendarReturnMessage(calConnectResult)}'));
            assert.ok(ca.includes('returned={calConnectResult}'));
            built = (r) => ({
                panel: returnedHere(r) ? calendarReturnMessage(r) : '',
                company: company(r) ? calendarReturnMessage(r) : '',
                apps: note(r, { provider: 'google' }, calendarReturnMessage),
            });
        }
        return built(result);
    };
})();
const P12FXF3_NONE = { panel: '', company: '', apps: '' };

test('Part 12 fixes, last pass (F3): the switch\'s own render never says the last org\'s calendar Connect — no "Google Calendar connected — …" in the panel, Company calendar or Connected apps; the new org\'s own drawn once its tag moves — RUN', async () => {
    const seen = await p12fxF3Run('org_a', [
        (cal) => { cal.setCalConnectResult(P12FXF3_A); },                                        // org A lands back from its Connect
        (cal, { org }) => { org.now = 'org_b'; cal.setCalView('day'); },                          // the switch's own render
        (cal) => { cal.setCalOffset(1); },                                                        // a second render before the commit
        (cal, { commit }) => { commit(); },                                                       // its commit: the tag, then App's reset
        (cal) => { cal.setCalConnectResult(P12FXF3_B); },                                         // org B's own Connect returns
    ]);
    assert.equal(seen.length, 6);
    assert.equal(seen[1].result, P12FXF3_A, 'org A: its own outcome');
    assert.deepEqual(await p12fxF3Lines(seen[1].result), { panel: 'Google Calendar connected — your calendar is live.', company: '', apps: 'Google Calendar connected — your calendar is live.' },
        'org A: the panel and the Google card say its own outcome');
    for (const at of [2, 3]) {
        assert.equal(seen[at].org, 'org_b');
        assert.equal(seen[at].result, null, 'REGRESSION: the switch\'s own render handed org B the last org\'s connect-return');
        assert.deepEqual(await p12fxF3Lines(seen[at].result), P12FXF3_NONE,
            'REGRESSION: org B\'s first frame said org A\'s "Google Calendar connected — your calendar is live."');
    }
    assert.equal(seen[4].result, null, 'after the commit: the reset\'s, org B\'s own');
    assert.equal(seen[5].result, P12FXF3_B, 'REGRESSION: org B\'s own connect-return never drawn — left masked after the switch\'s commit');
    const b = await p12fxF3Lines(seen[5].result);
    assert.equal(b.panel, '', 'a Connect begun in Company calendar is not the panel\'s');
    assert.match(b.company, /^Google Calendar was not connected — /, 'org B\'s Company calendar says its own outcome');
    assert.equal(b.apps, b.company);
});

test('Part 12 fixes, last pass (F3): Connected apps and Company calendar remount in the switch\'s render with none of the last org\'s outcome; no org on screen, none; the first load\'s return (the OAuth landing) still drawn — RUN', async () => {
    const apps = await p12fxF3Run('org_a', [
        (cal) => { cal.setCalConnectResult(P12FXF3_A_APPS); },
        (cal, { org }) => { org.now = 'org_b'; cal.setCalView('day'); },
    ]);
    assert.deepEqual(await p12fxF3Lines(apps[1].result), { panel: '', company: '', apps: 'Google Calendar connected — your company calendar is live.' },
        'org A: Connected apps says its own outcome');
    assert.deepEqual(await p12fxF3Lines(apps[2].result), P12FXF3_NONE,
        'REGRESSION: Connected apps, remounted for org B, said org A\'s "Google Calendar connected — …"');
    const none = await p12fxF3Run(null, [(cal) => { cal.setCalConnectResult(P12FXF3_A); }]);
    assert.equal(none[1].result, null, 'REGRESSION: a connect-return handed out with no org active');
    const toNone = await p12fxF3Run('org_a', [
        (cal) => { cal.setCalConnectResult(P12FXF3_A); },
        (cal, { org }) => { org.now = null; cal.setCalView('day'); },
        (cal, { commit }) => { commit(); cal.setCalConnectResult(P12FXF3_A); },
    ]);
    assert.deepEqual([toNone[2].result, toNone[3].result], [null, null], 'REGRESSION: with no org active, a connect-return handed out');
    // The first load: the hook mounts before the org is known; App's landing effect waits for the role in the org
    // (roleKnown), after the tag has moved in the first load's commit, which App's reset skips.
    const first = await p12fxF3Run(null, [
        (cal, { org }) => { org.now = 'org_a'; cal.setCalView('day'); },
        (cal, { effects }) => { effects(); cal.setCalConnectResult(P12FXF3_A); },
    ]);
    assert.equal(first[2].result, P12FXF3_A, 'REGRESSION: the OAuth landing\'s outcome never drawn in the org it came back to');
});

test('Part 12 fixes, last pass (F3): WIRING — the hook hands the connect-return out under the strip\'s tag; every reader takes it through App', () => {
    const hook = code(read(P12FXC4_HOOK));
    assert.ok(hook.includes('        calConnectResult: calendarHere ? calConnectResult : null, setCalConnectResult,\n'),
        'REGRESSION: the last org\'s connect-return handed out in the new org\'s first frame');
    assert.equal(count(hook, 'calConnectResult'), 3, 'declared, and handed out through the tag alone');
    assert.ok(hook.includes('    const [calConnectResult, setCalConnectResult] = useOrgBoundState(resets, null);'), 'still the org\'s: the reset puts it back');
    const app = code(read(P12FXC3_APP));
    assert.ok(between(app, '        calendarRead, setCalendarRead,\n', '} = calState;').includes('        calConnectResult, setCalConnectResult,\n'), 'App takes it from the hook');
    assert.ok(app.includes('calConnectResult, setCalConnectResult, settingsOpenPanel, setSettingsOpenPanel,'), 'and hands it on in its context');
    const readers = srcFiles().filter((f) => f !== P12FXC4_HOOK && read(f).includes('calConnectResult')).sort();
    assert.deepEqual(readers, [P12FXC3_APP, P12B_HEADER, P12FXF3_COMPANY, P12FXF3_APPS].sort(), 'a new reader: take it through App, masked');
    for (const f of [P12B_HEADER, P12FXF3_COMPANY, P12FXF3_APPS]) {
        const s = code(read(f));
        const own = s.indexOf('calConnectResult');
        assert.ok(own >= 0 && s.indexOf('= useApp();', own) > own, `${f}: read through useApp, never another copy`);
    }
});

// ── Part 12 — the review's fixes, last pass (F4 — Sales Manager saves follow the one rule) ──
// The verifier's residuals on S4 (state §0.249): the batch's rule — only a 4xx carrying the server's own words (a
// non-blank string error) proves nothing was written — held for a SPIFF claim's words alone. The quota board read any
// truthy error below 500 as the server's refusal (a blank or a number said "Not saved"; a JSON null body threw out of the
// save, the banner left at "saving") and said a 5xx in its own words, the server's and their ref dropped; a forecast call
// (saveUser), the commission tiers and SPIFFs (saveExtra, on writeSettings' words) and a coaching note's Delete said "Not
// saved" / "Not deleted" over a 5xx and a gateway's page — each server answers a 500 after it writes (the audit, the
// caller's name); and Approve dropped a claim's row on any 404, a wordless one too. One test now, ownRefusal, at module
// scope in SalesManagerTab.jsx (saidOf reads words already said as the body they came from); the server's own refusal
// says "Not saved — <words>", any other answer "… may have been saved — reload the page to see whether …: <words>".
const P12FXF4_SMT = 'src/Tabs/SalesManagerTab.jsx';
const P12FXF4_OWN = "const ownRefusal = (status, d) => status >= 400 && status < 500 && typeof d?.error === 'string' && !!d.error.trim();";
const P12FXF4_NEVER = /\[object Object\]|undefined|null|the server returned|Unexpected token|HTTP|:\s*$|—\s+\.|\(ref\s*\)|\s{2,}/;
// writeSettings' refusal as saveSettings.js builds it: refusalOf's words over the body as read.
const p12fxF4Written = async (status, body, stale = null) => ({ ok: false, status, error: await refusalOf({ status, json: async () => body }), ...(stale ? { stale } : {}) });

test('Part 12 fixes, last pass (F4): ownRefusal — the server\'s own refusal is a 4xx whose error is words (a string, trimmed), nothing else; saidOf reads words already said as their body, none for the status\'s own — RUN', () => {
    const { ownRefusal, saidOf } = p12bClaimWords();
    for (const [status, d, own] of [
        [400, { error: 'id required' }, true], [403, { error: ' Forbidden ' }, true], [404, { error: 'Claim not found in your organization', requestId: 'r1' }, true], [499, { error: 'x' }, true],
        [500, { error: 'Internal server error', requestId: 'r1' }, false], [502, { error: 'Bad gateway' }, false], [399, { error: 'x' }, false],
        [400, {}, false], [400, null, false], [400, undefined, false], [400, { error: '   ' }, false], [422, { error: 42 }, false],
        [409, { error: { message: 'x' } }, false], [404, { requestId: 'r9' }, false],
    ]) assert.equal(ownRefusal(status, d), own, `REGRESSION: ${status} ${JSON.stringify(d)}`);
    for (const [status, words, body] of [
        [400, 'Quota periods are quarters or months.', { error: 'Quota periods are quarters or months.' }],
        [500, 'Internal server error (ref r1)', { error: 'Internal server error (ref r1)' }],
        [400, 'The server returned 400.', null], [502, 'The server returned 502.', null],
        [400, 'The server returned 500.', { error: 'The server returned 500.' }],
        [422, 42, null], [400, undefined, null], [400, null, null],
    ]) assert.deepEqual(saidOf(status, words), body, `REGRESSION: ${status} ${JSON.stringify(words)}`);
});

test('Part 12 fixes, last pass (F4): the quota board\'s save — "Not saved" only for the server\'s own refusal; a blank, numbered or missing error, a JSON null body, a 5xx or a page say the quotas may have been saved, in refusalWords\' words with their ref — never a throw out of the save — RUN', async () => {
    const SAVING = { status: 'saving', msg: '' };
    const MAYBE = (words) => `The quotas may have been saved — reload the page to see whether they were: ${words}`;
    for (const [answer, msg, refused = false] of [
        [onceOf(400, { error: ' FY2031 is outside the years quotas can be set for (FY2024–FY2028). ', requestId: 'r3' }), 'Not saved — FY2031 is outside the years quotas can be set for (FY2024–FY2028). (ref r3)', true],
        [onceOf(409, { error: 'This company now sets quotas by month. Reload the page to see its board.' }), 'Not saved — This company now sets quotas by month. Reload the page to see its board.', true],
        [onceOf(400, { error: '   ' }), MAYBE('The server returned 400.')],
        [onceOf(422, { error: 42 }), MAYBE('The server returned 422.')],
        [onceOf(409, { error: { message: 'x' } }), MAYBE('The server returned 409.')],
        [onceOf(400, null), MAYBE('The server returned 400.')],
        [onceOf(404, new SyntaxError("Unexpected token '<'")), MAYBE('The server returned 404.')],
        [onceOf(500, null), MAYBE('The server returned 500.')],
        [onceOf(500, { error: '  Internal server error ', requestId: ' r1 ' }), MAYBE('Internal server error (ref r1)')],
        [onceOf(503, { error: { message: 'x' } }), MAYBE('The server returned 503.')],
        [P11_PAGE(), MAYBE('The server returned 502.')],
    ]) {
        const r = await p12bQuotaSave({ answer });
        assert.deepEqual([r.thrown, r.states, r.drafts], [refused ? msg.slice('Not saved — '.length) : msg, [SAVING, { status: 'error', msg }], []],
            `REGRESSION: ${msg} — a truthy error read as the server's own, a null body thrown out of the save, or a 5xx's words dropped`);
        assert.doesNotMatch(msg, P12FXF4_NEVER);
    }
});

test('Part 12 fixes, last pass (F4): a forecast call\'s save — "Not saved" naming the rep only for the server\'s own refusal; a 5xx, a page, a wordless or numbered 4xx, a null body say the rep\'s call may have been saved, in refusalWords\' words with their ref; a 403 with no words keeps its role sentence — RUN', async () => {
    const MAYBE = (words) => `Ann's forecast call may have been saved — reload the page to see whether it was: ${words}`;
    for (const [answer, msg] of [
        [onceOf(404, { error: 'That member is not in your organization — they may have been removed. Reload and try again.', requestId: 'r4' }),
            'Not saved — Ann: That member is not in your organization — they may have been removed. Reload and try again. (ref r4)'],
        [onceOf(409, { error: ' Someone in this organization already has that name. ' }), 'Not saved — Ann: Someone in this organization already has that name.'],
        [onceOf(500, { error: 'Internal server error', requestId: 'r1' }), MAYBE('Internal server error (ref r1)')],
        [onceOf(503, { error: { message: 'x' } }), MAYBE('The server returned 503.')],
        [onceOf(404, new SyntaxError("Unexpected token '<'")), MAYBE('The server returned 404.')],
        [onceOf(422, { error: 42 }), MAYBE('The server returned 422.')],
        [onceOf(400, null), MAYBE('The server returned 400.')],
        [P11_PAGE(), MAYBE('The server returned 502.')],
        [onceOf(403, {}), 'Not saved — only Admins can change forecast call.'],
    ]) {
        const r = await p12fxSSaveUser(answer);
        assert.deepEqual([r.out, r.sent, r.states], [false, ['PUT'], [{ status: 'error', msg }]], `REGRESSION: ${msg}`);
        assert.doesNotMatch(msg, P12FXF4_NEVER);
    }
});

test('Part 12 fixes, last pass (F4): the commission tiers and SPIFFs — on writeSettings\' words, "Not saved" only for the server\'s own refusal; a 5xx, a page, a wordless, blank or numbered 4xx say they may have been saved, in refusalWords\' words — RUN', async () => {
    const MAYBE = (words) => `The SPIFFs may have been saved — reload the page to see whether they were: ${words}`;
    for (const [w, msg] of [
        [await p12fxF4Written(400, { error: 'Choose who approves: by role or by person.' }), 'Not saved — Choose who approves: by role or by person.'],
        [await p12fxF4Written(404, { error: '  A SPIFF names a deal that is not in this organization.  ', field: 'spiffs' }), 'Not saved — A SPIFF names a deal that is not in this organization.'],
        [await p12fxF4Written(400, { error: 'Bad', requestId: 'r2' }), 'Not saved — Bad (ref r2)'],
        [await p12fxF4Written(409, { error: STALE_ERROR, code: 'stale', stale: ['spiffs'] }, ['spiffs']), `Not saved — ${STALE_ERROR}`],
        [await p12fxF4Written(500, { error: 'Internal server error', requestId: 'r1' }), MAYBE('Internal server error (ref r1)')],
        [await p12fxF4Written(503, { error: 'Key encryption is not available. Contact your administrator.' }), MAYBE('Key encryption is not available. Contact your administrator.')],
        [await p12fxF4Written(502, null), MAYBE('The server returned 502.')],
        [await p12fxF4Written(400, {}), MAYBE('The server returned 400.')],
        [await p12fxF4Written(400, { error: '   ' }), MAYBE('The server returned 400.')],
        [await p12fxF4Written(422, { error: 42 }), MAYBE('The server returned 422.')],
        [await p12fxF4Written(409, { error: { message: 'x' } }), MAYBE('The server returned 409.')],
    ]) {
        const r = await p12fxSSaveExtra(w);
        assert.deepEqual([r.out, r.states.at(-1), r.drafts], [false, { status: 'error', msg }, []], `REGRESSION: ${JSON.stringify(w)} — ${msg}`);
        assert.doesNotMatch(msg, P12FXF4_NEVER);
    }
    // The 403 keeps its role sentence; a request that never left says Q4's.
    assert.deepEqual((await p12fxSSaveExtra(await p12fxF4Written(403, { error: 'Forbidden: insufficient role' }))).states.at(-1), { status: 'error', msg: 'Not saved — only Admins can change SPIFFs.' });
    assert.deepEqual((await p12fxSSaveExtra({ ok: false, status: 0, error: NETWORK_ERROR })).states.at(-1), { status: 'error', msg: 'Not saved — The server could not be reached.' });
});

test('Part 12 fixes, last pass (F4): a claim\'s Approve answered 404 drops its row only in the server\'s words — a wordless 404 (a gateway\'s page, no body, a blank error) keeps it and says the claim may have been saved — RUN', async () => {
    const gone = await p12bClaimPress('status', { answer: onceOf(404, { error: 'Claim not found in your organization', requestId: 'r8' }) });
    assert.deepEqual([gone.claims, gone.states], [[P12B_CLAIM_2], [{ status: 'error', msg: 'Not saved — Claim not found in your organization (ref r8)' }]], 'a claim deleted since: its row goes');
    for (const answer of [onceOf(404, new SyntaxError("Unexpected token '<'")), onceOf(404, {}), onceOf(404, { error: '  ' }), onceOf(404, null)]) {
        const r = await p12bClaimPress('status', { answer });
        assert.deepEqual([r.claims, r.states], [[P12B_CLAIM, P12B_CLAIM_2], [{ status: 'error', msg: 'The claim may have been saved — reload the page to see whether it was: The server returned 404.' }]],
            'REGRESSION: a wordless 404 dropped the claim\'s row — the claim may still be stored');
    }
    const after = await p12bClaimPress('status', { answer: onceOf(404, { error: 'Claim not found in your organization' }), switchOrg: true });
    assert.deepEqual([after.claims, after.states], [[P12B_CLAIM, P12B_CLAIM_2], []], 'after an org switch nothing');
});

test('Part 12 fixes, last pass (F4): a coaching note\'s Delete — through the hook as written, "Not deleted" only for the server\'s own refusal or a request that never left; a 5xx (the audit after the delete), a page, a wordless 4xx, a failure after it left say it may have been deleted; the list unchanged — RUN', async () => {
    const { noteNotDeleted } = p12bClaimWords();
    const MAYBE = (words) => `The coaching note may have been deleted — reload the page to see whether it was: ${words}`;
    for (const [answer, msg] of [
        [answerOf(403, { error: 'Only the note\'s author or an Admin can delete it.' }), 'Not deleted — Only the note\'s author or an Admin can delete it.'],
        [answerOf(404, { error: 'Not found', requestId: 'r5' }), 'Not deleted — Not found (ref r5)'],
        [UNSENT(), 'Not deleted — The server could not be reached.'],
        [answerOf(500, { error: 'Internal server error', requestId: 'r1' }), MAYBE('Internal server error (ref r1)')],
        [PAGE_502(), MAYBE('The server returned 502.')],
        [answerOf(400, {}), MAYBE('The server returned 400.')],
        [answerOf(400, { error: '   ' }), MAYBE('The server returned 400.')],
        [answerOf(422, { error: 42 }), MAYBE('The server returned 422.')],
        [new RangeError('x'), MAYBE('Its answer could not be read.')],
    ]) {
        const st = await coaching({ answers: [LOAD_OK(), answer] });
        const r = await st.hook.deleteCoachingNote('cn_1');
        assert.equal(r.ok, false);
        assert.equal(noteNotDeleted(r), msg, `REGRESSION: ${msg}`);
        assert.deepEqual(st.notes.value, [NOTE], 'the list unchanged');
        assert.doesNotMatch(msg, P12FXF4_NEVER);
    }
});

test('Part 12 fixes, last pass (F4): WIRING — one test of the server\'s own refusal, ownRefusal, at module scope; every Sales Manager save reads it; no other copy, no truthy-error test, no 404 that drops a row without words', () => {
    const s = code(read(P12FXF4_SMT));
    const lines = s.split('\n');
    assert.equal(lines.filter((l) => l === P12FXF4_OWN).length, 1, 'the test, whole, at column 0');
    assert.ok(s.indexOf(`\n${P12FXF4_OWN}\n`) < s.indexOf('\nfunction AdminTab({'), 'module scope, above the tabs');
    assert.equal(count(s, "typeof d?.error === 'string'"), 1, 'REGRESSION: a second copy of the test');
    assert.equal(count(s, 'ownRefusal('), 7, 'claimRefused, the 404, saveUser (twice), saveExtra, sendQuotas, noteNotDeleted');
    assert.equal(lines.filter((l) => l === "const saidOf = (status, words) => (typeof words === 'string' && words !== `The server returned ${status}.` ? { error: words } : null);").length, 1, 'saidOf, whole');
    const quotas = between(s, '    const sendQuotas = async () => {', '\n    };');
    order(quotas, 'if (!res.ok) {', 'const refused = await res.json().catch(() => ({}));', 'if (!stillOrg(askedOrg)) return;',
        'throw ownRefusal(res.status, refused) ? refuse(refusalWords(res, refused)) : unsure(`The quotas may have been saved — reload the page to see whether they were: ${refusalWords(res, refused)}`);');
    assert.ok(!/refused\.error|res\.status < 500|The server returned \$\{res\.status\}/.test(quotas), 'REGRESSION: the truthy-error test, or the 5xx\'s own words');
    const upd = between(s, '    const updateClaimStatus = async (claim, status) => {', '\n    };');
    assert.equal(count(upd, 'setSpiffClaims(prev => prev.filter('), 1);
    assert.ok(upd.includes('if (res.status === 404 && ownRefusal(res.status, d)) setSpiffClaims(prev => prev.filter(c => c.id !== claim.id));'), 'REGRESSION: a wordless 404 drops the claim\'s row');
    const user = between(s, '    const saveUser = async (user, label, who = user.name) => {', '\n    };');
    order(user, "setSaveState({ status: 'error', msg: res.status === 403 && !ownRefusal(res.status, d)", '? `Not saved — only Admins can change ${label}.`',
        ': ownRefusal(res.status, d)', "? `Not saved — ${who || 'a member'}: ${refusalWords(res, d)}`",
        ": `${who || 'A member'}'s ${label} may have been saved — reload the page to see whether it was: ${refusalWords(res, d)}` });");
    const extra = between(s, '    const saveExtra = async (patch, label) => {', '\n    };');
    order(extra, ': w.status === 0', '? `Not saved — ${NETWORK_ERROR}`', ': ownRefusal(w.status, saidOf(w.status, w.error))',
        '? `Not saved — ${refusalWords(w, saidOf(w.status, w.error))}`',
        ': `The ${label} may have been saved — reload the page to see whether they were: ${refusalWords(w, saidOf(w.status, w.error))}` });');
    assert.ok(!extra.includes('${w.error}'), 'REGRESSION: writeSettings\' raw words — a number, a blank, "[object Object]"');
    const note = between(s, 'const noteNotDeleted = (r) => (', ');\n');
    order(note, 'r.error === NETWORK_ERROR || ownRefusal(r.status, saidOf(r.status, r.error))', '? `Not deleted — ${r.error}`',
        ': `The coaching note may have been deleted — reload the page to see whether it was: ${r.error}`');
    assert.equal(count(s, 'noteNotDeleted(r)'), 1, 'the Delete\'s banner says it');
    assert.ok(!s.includes('`Not deleted — ${r.error}` }'), 'REGRESSION: the Delete\'s own "Not deleted" over every refusal');
    const hook = code(read('src/hooks/useCoachingNotes.js'));
    assert.ok(hook.includes('if (!res.ok) return { ok: false, status: res.status, error: await readRefusal(res) };'), 'the hook hands the status beside the words');
    // The dash is the character, never its escape (a backslash and "u2014" built here so no escape is typed).
    const added = [between(s, P12FXF4_OWN, '\nconst claimUnanswered'), note, quotas, upd, user, extra].join('\n');
    assert.ok(!added.includes(`${String.fromCharCode(92)}u2014`), 'an escaped dash in the lines this pass wrote');
});

// ── Part 12 — the review's fixes, last pass (G5 — source-walk floors across tests) ──
// The verifier's residual on G4: the floors on a source walk outside refusals-said and this file were left below their
// counts — single-token-file's T readers held at 60 where 113 are measured, the itest guard's suites at 19 of 65, the
// Settings save slots at 18 of 26 — so a walk that lost half its folder stayed green and left the files it skipped
// unchecked. Each floor was measured with its own suite's walk, in memory (the file piped through stdin, the floor's
// operand logged; nothing written), and set to the count: only the number moved. A floor written `>` holds one under
// the count (`files.length > 241` holds the 242 sources under src/; `> 347` the 348 under src/ and netlify/functions/);
// a floor inside a loop holds the least of its rounds (app-links' templates 11 of 21/11/12; audit-close's tables, the
// schema 21 columns, the shaper 14 reads). refusals-said's five (126, 242, 192, 54, 188) and this file's (242, 242, 6)
// were re-measured after this pass and already stood at their counts (G4 holds them). This test holds every floor this
// pass raised: lowered, it fails here — say the new count, and why, in both places.
const P12FXG5_FLOORS = [
    // [suite, the floor up to its number, the number at each occurrence in order, what the walk counts]
    ['tests/ai-models.test.mjs', 'assert.ok(files.length > ', [347], 'the 348 sources under src/ and netlify/functions/'],
    ['tests/ai-score.test.mjs', 'assert.ok(files.length > ', [105], 'the 106 function files'],
    ['tests/app-links.test.mjs', 'assert.ok(all.length >= ', [11], 'the templates of each sender (21, 11, 12)'],
    ['tests/app-links.test.mjs', 'assert.ok(calls.length >= ', [19], 'the alerts\' 19 deal calls'],
    ['tests/audit-close.test.mjs', 'assert.ok(cols.size > ', [20], 'each table\'s schema columns (21 the least)'],
    ['tests/audit-close.test.mjs', 'assert.ok(reads.length > ', [13], 'each shaper\'s reads (14 the least)'],
    ['tests/border-sides.test.mjs', 'assert.ok(files.length > ', [241], 'the 242 sources under src/'],
    ['tests/deal-engagement.test.mjs', 'assert.ok(files.length > ', [347], 'the 348 sources under src/ and netlify/functions/'],
    ['tests/deal-fields.test.mjs', 'assert.ok(files.length > ', [347], 'the 348 sources under src/ and netlify/functions/'],
    ['tests/forecast-call.test.mjs', 'assert.ok(tags.length >= ', [24], 'the Sales Manager tab\'s 24 buttons'],
    ['tests/invoices.test.mjs', 'assert.ok((f.match(/eq\\(invoices\\.orgId, orgId\\)/g) || []).length >= ', [9], 'the 9 invoice statements by org'],
    ['tests/itest-targets-test-db.test.mjs', 'assert.ok(suites.length >= ', [65], 'the 65 integration suites'],
    ['tests/job-roster.test.mjs', 'assert.ok(SCHEDULED_JOBS.length >= ', [6], 'the 6 scheduled jobs'],
    ['tests/merge-undo.test.mjs', 'assert.ok(at.length >= ', [26], 'the Undo\'s and Past merges\' 26 statements'],
    ['tests/merge-undo.test.mjs', 'assert.ok(files.length > ', [241], 'the 242 sources under src/'],
    ['tests/merged-away-lists.test.mjs', 'assert.ok(g.files.length >= ', [58], 'the 58 files that import useApp'],
    ['tests/merged-away-lists.test.mjs', 'assert.ok(Object.keys(found).length >= ', [16], 'the 16 functions that read accounts or contacts'],
    ['tests/open-states.test.mjs', 'assert.ok(states.length >= ', [26], 'the 26 open-states'],
    ['tests/open-states.test.mjs', 'assert.ok(files.length > ', [241, 241], 'the 242 sources under src/, both walks'],
    ['tests/org-roles.test.mjs', 'assert.ok(files.length > ', [347], 'the 348 sources under netlify/functions/ and src/'],
    ['tests/quota-plan.test.mjs', 'assert.ok(seen >= ', [14, 10], 'the 14 quota reads, then the 10 members writes'],
    ['tests/quote-templates.test.mjs', 'assert.ok(money.length >= ', [19], 'the Quotes tab\'s 19 money lines'],
    ['tests/quote-templates.test.mjs', 'assert.ok(money.filter(([, ctx]) => ctx.includes(\'fontFamily: T.sans\')).length >= ', [17], 'the 17 that name the app face'],
    ['tests/resize-targets.test.mjs', 'assert.ok(files.length > ', [241], 'the 242 sources under src/'],
    ['tests/resize-targets.test.mjs', 'assert.ok(all.length >= ', [12], 'the 12 window listeners'],   // 12 since AI scoring batch 2B took the bulkScore listener out
    ['tests/rounded-scrollers.test.mjs', 'assert.ok(files.length > ', [241], 'the 242 sources under src/'],
    ['tests/sales-links.test.mjs', 'assert.ok(pins.length >= ', [32], 'the suites\' 32 "graded by the harness" pins'],
    ['tests/search-match.test.mjs', 'assert.ok(SRC.length > ', [241], 'the 242 sources under src/'],
    ['tests/self-profile.test.mjs', 'assert.ok(keys.size >= ', [11], 'the profile panel\'s 11 saved keys'],
    ['tests/settings-hygiene.test.mjs', 'assert.ok(resolved.length >= ', [7], 'users.mjs\'s 7 caller-name reads'],
    ['tests/settings-leave-guard.test.mjs', 'assert.ok(panels.length >= ', [26], 'the 26 Settings panels with a save slot'],
    ['tests/single-token-file.test.mjs', 'assert.ok(readers.length >= ', [113], 'the 113 files that read T'],
    ['tests/tab-layers.test.mjs', 'assert.ok(files.length > ', [85], 'the 86 files under the tabs'],
    // The main session, last pass: the two function-file walks the fixer left at `> 0` (the verifier's G5 residuals).
    ['tests/org-scoping.test.mjs', 'assert.ok(files.length > ', [97], 'the 98 function files the org-scoping guard scans (106, less its 8 skipped)'],
    ['tests/function-imports.test.mjs', 'assert.ok(files.length > ', [105], 'the 106 function files whose imports must resolve'],
];
const p12fxG5Floors = (s, needle) => s.split(needle).slice(1).map((after) => Number(/^\d+/.exec(after)?.[0]));

test('Part 12 fixes, last pass (G5): WIRING — every source walk\'s floor across tests/ is held at the count its own walk measured after the last pass (single-token-file 113 T readers, the itest guard 65 suites, the Settings save slots 26, the src/ walks 242, the src/ and functions walks 348, and the rest), so a walk that lost files fails its own suite', () => {
    assert.equal(P12FXG5_FLOORS.length, 35, 'the floors this pass raised, each listed once');
    for (const [file, needle, floors, what] of P12FXG5_FLOORS) {
        const got = p12fxG5Floors(read(file), needle);
        assert.equal(got.length, floors.length, `${file}: ${needle.trim()} — ${floors.length} floor(s), found ${got.length}`);
        got.forEach((n, k) => assert.ok(Number.isInteger(n) && n >= floors[k], `REGRESSION: ${file}'s floor on ${what} is ${n}, below the ${floors[k]} measured (§0.249, G5) — say the new count, and why, in both places`));
    }
});
