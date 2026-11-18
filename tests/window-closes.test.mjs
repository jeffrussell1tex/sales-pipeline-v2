// tests/window-closes.test.mjs
//
// The app's windows close as one rule (state §0.252; OPEN_ITEMS §4.1; guide §18b80 rules 3-5; Jeff, 16 Nov: "Deal +
// lead", "Fix all in this batch"):
//   - nothing mid-save closes — by its ×, its Cancel, its backdrop or Escape (rule 4). The deal window closed on
//     Escape while its save was out (App's handler never read the save), and on its × and its detail tabs' Cancels;
//     the user window and the coaching note on Escape (App's, which could not see the coaching note's save); the two
//     imports and the two merge reviews on their ×; the SPIFF claim on its backdrop and ×; the lead window and the
//     activity rail by every close.
//   - the deal and lead windows ask "Discard changes?" (Discard / Keep editing) before dropping typed work: the deal
//     window closed over a filled form at once; the lead window asked "Discard this lead?" under a red Delete on
//     Escape and its backdrop only, its × and Cancel closing at once.
//   - among the draggable windows an Escape is the one drawn on top's (rule 5): with "+ New Rep" open over a deal,
//     one Escape closed the DEAL window, its typed form with it, and left the user window on top open.
//   RULE    src/utils/draggableOrder.js topWindow — run, the "+ New Rep" case included
//   GUARD   every app window's close paths, each holding the save; every draggable window's Escape asks which is on top
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { topWindow } from '../src/utils/draggableOrder.js';
import { closeDecision, DISCARD_MESSAGE, DISCARD_LABELS } from '../src/utils/tabLayers.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const count = (s, t) => s.split(t).length - 1;
// a before b, each present (an indexOf of -1 passes an order alone).
const inOrder = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b); return i >= 0 && j >= 0 && i < j; };
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };

// ── RULE ─────────────────────────────────────────────────────────────────────

// Elements as the page holds them: `at` is the place in the page.
const el = (name, at) => ({ name, at });
const follows = (a, b) => a.at > b.at;

test('RULE: the window drawn on top — the highest z; at one z, the later in the page', () => {
    const deal = el('deal', 1), user = el('user', 2);
    assert.equal(topWindow([], follows), null);
    assert.equal(topWindow([{ el: deal, z: 10000 }], follows), deal);
    assert.equal(topWindow([{ el: deal, z: 10000 }, { el: user, z: 10000 }], follows), user, 'one z: the later in the page');
    assert.equal(topWindow([{ el: user, z: 10000 }, { el: deal, z: 10000 }], follows), user, 'whatever order they are listed in');
    assert.equal(topWindow([{ el: deal, z: 10003 }, { el: user, z: 10001 }], follows), deal, 'raised by a press on its header');
    assert.equal(topWindow([null, { el: null, z: 1 }, { el: deal, z: 10000 }], follows), deal, 'a window not drawn is none');
});

test('RULE: "+ New Rep" — the user window opens over the deal; Escape is the user window\'s, then the deal\'s; a press on the deal\'s header makes it the deal\'s', () => {
    // Both start at one z (useDraggable's 10000); ModalLayer draws the user window after the deal window.
    const deal = el('deal', 1), user = el('user', 2);
    let open = [{ el: deal, z: 10000 }, { el: user, z: 10000 }];
    assert.equal(topWindow(open, follows), user, 'REGRESSION (OPEN_ITEMS §4.1): App\'s Escape closed the deal window first');
    open = [{ el: deal, z: 10001 }, { el: user, z: 10000 }];   // the deal window's header pressed (nextZ)
    assert.equal(topWindow(open, follows), deal, 'the order clicked (guide §18b80 rule 5)');
    open = [{ el: deal, z: 10000 }];   // the user window closed
    assert.equal(topWindow(open, follows), deal);
});

test('RULE: the close decision the windows share with the tabs — nothing mid-save; typed work asks "Discard changes?"', () => {
    assert.equal(closeDecision({ busy: true, dirty: true }), 'none');
    assert.equal(closeDecision({ busy: true, dirty: false }), 'none');
    assert.equal(closeDecision({ busy: false, dirty: true }), 'ask');
    assert.equal(closeDecision({ busy: false, dirty: false }), 'close');
    assert.equal(DISCARD_MESSAGE, 'Discard changes?');
    assert.deepEqual(DISCARD_LABELS, { confirm: 'Discard', cancel: 'Keep editing' });
});

// ── the shared close ─────────────────────────────────────────────────────────

test('useCloseRequest: one close — nothing while busy, Discard asked for typed work and re-checked, an `after` run only once closed', () => {
    const h = read('src/hooks/useCloseRequest.js');
    assert.ok(h.includes("import { closeDecision, DISCARD_MESSAGE, DISCARD_LABELS } from '../utils/tabLayers';"), 'the tabs\' rule and words');
    assert.ok(h.includes('live.current = { onClose, dirty, busy, showConfirm: ctx ? ctx.showConfirm : null };'), 'read as it stands when asked');
    assert.ok(h.includes("const typed = typeof now.dirty === 'function' ? !!now.dirty() : !!now.dirty;"));
    assert.ok(h.includes("const busyOf = (w) => (typeof w.busy === 'function' ? !!w.busy() : !!w.busy);"), 'busy, too, read when asked');
    assert.ok(h.includes('const decided = closeDecision({ busy: busyOf(now), dirty: typed });'));
    assert.ok(h.includes("if (decided === 'none') return;"), 'nothing while a save is out');
    assert.ok(h.includes('now.showConfirm(DISCARD_MESSAGE, () => {') && h.includes('}, true, DISCARD_LABELS);'));
    assert.ok(h.includes('if (busyOf(then) || !then.onClose) return;'), 'Discard closes nothing while a save is out');
    assert.ok(h.includes("const next = typeof after === 'function' ? after : null;"), 'a click\'s event is no `after`');
    assert.ok(between(h, "if (decided === 'ask'", 'return;\n        }').includes('document.activeElement.blur()'), 'the form lets go of the focus first');
});

// ── THE GUARD: each window's closes ─────────────────────────────────────────

test('THE GUARD: the deal window — its ×, its Cancels, its quotes move and Escape are one close, held mid-save, asking before typed work goes', () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    const main = m.slice(m.indexOf('export default function OpportunityModal('));
    assert.ok(main.includes('        dirty: () => typedNow() !== openedWith.current || historyDraft.current.typed,'), 'typed work: the form, or an activity typed in the History tab');
    assert.ok(main.includes('        busy: () => saving || noteState.saving || activitiesOut > 0 || docsOut > 0,'), 'every save the window shows the answer to (the reviews, 16 Nov)');
    assert.ok(main.includes('<RecordDocuments onBusy={onDocsBusy} recordType="opportunity"'), 'its documents counted');
    assert.ok(main.includes('    const pickTab = (t) => { if (activitiesOut > 0 || docsOut > 0) return; setDetailTab(t); };') && count(main, 'onClick={() => pickTab(') === 2, 'the header\'s tabs stay while a log or a batch is out');
    assert.ok(between(m, 'const saveDeal = () => {', 'const errors = {};').includes('        if (noteState.saving || activitiesOut > 0 || docsOut > 0) return;'), 'the deal\'s own save waits for the window\'s other saves');
    // ... and is drawn waiting — the form's Save while a note is out, the History tab's while its log is (round 4's review).
    assert.ok(main.includes('<PrimaryBtn saving={saving} disabled={noteState.saving}>'));
    assert.ok(between(m, 'function DealHistoryTab(', 'function ContactEngagementTab(').includes('<PrimaryBtn type="button" disabled={logState.saving} onClick={() => onUpdate && onUpdate()}>Save</PrimaryBtn>'));
    assert.ok(main.includes("        if (!(opportunity?.comments || []).some((c) => c.id === editingCommentId)) return '';"), 'an Edit whose note is gone holds nothing');
    // The History tab's logs, counted by the window: the tab may close before an answer lands.
    assert.ok(main.includes('        try { return await onSaveActivity(data); } finally { setActivitiesOut((n) => n - 1); }'));
    assert.ok(main.includes('        setActivitiesOut((n) => n + 1);'));
    assert.ok(main.includes('onSaveActivity={saveActivityHeld}') && !main.includes('onSaveActivity={onSaveActivity}'));
    assert.ok(main.includes("const typedNow = () => JSON.stringify([formData, accountSearch, siteSearch, repSearch, selectedContacts, selectedContactIds, commentDraft, editedNote()]);"), 'the form, the three fields\' text, the contacts, a note being written');
    // A note's Edit opened and unchanged is no typed work — against the text it opened with.
    assert.ok(main.includes("        return editingCommentText === editBaseRef.current ? '' : editingCommentText;"));
    assert.ok(main.includes('setEditingCommentId(c.id); setEditingCommentText(c.text); editBaseRef.current = c.text;'), 'taken when the Edit opens');
    assert.ok(main.includes('if (openedWith.current === null) openedWith.current = typedNow();'), 'what it opened with, taken once');
    assert.ok(main.includes('const onHistoryDraft = React.useCallback((d) => { historyDraft.current = d; }, []);') && main.includes('saving={saving} onDraft={onHistoryDraft}'), 'the History tab reports to it');
    const tab = between(m, 'function DealHistoryTab(', 'const activityTypes =');
    assert.ok(tab.includes("onDraft({ typed: showLogActivity && (newActivity.notes.trim() !== '' || logWith.length > 0) });"), 'an activity typed');
    assert.ok(tab.includes('return () => onDraft({ typed: false });'), 'gone with the tab');
    // A note's Delete holds the window once it is out (confirmed), never for a cancelled one.
    const del = between(main, 'const deleteNote = async (commentId) => {', '\n    };');
    assert.ok(del.includes('const r = await onDeleteComment(opportunity.id, commentId, () => { sent = true; setNoteState({ saving: true, error: null }); });'));
    assert.ok(del.includes('else if (sent) setNoteState({ saving: false, error: null });'), 'and lets go when it lands');
    assert.ok(read('src/components/layout/ModalLayer.jsx').includes("showConfirm('Delete this note? It cannot be undone.', () => { if (sending) sending(); saveNotes(oppId, { op: 'delete', id: commentId }).then(answer); });"), 'told once confirmed');
    assert.equal(count(main, 'onClick={onClose}') + count(main, 'onClose={onClose}'), 0, 'no close past the one close');
    assert.equal(count(main, 'onClick={closeDeal}'), 2, 'the × and the form\'s Cancel');
    assert.equal(count(main, 'onClose={closeDeal}'), 4, 'the History, Contacts and AI Score tabs\' Cancels, and the quotes move');
    assert.ok(main.includes('<GhostBtn type="button" onClick={closeDeal} disabled={saving}>Cancel</GhostBtn>'));
    const esc = between(main, "    const escapeHeld = escapeBlocked('draggable');", 'document.addEventListener');
    assert.ok(inOrder(esc, 'if (!onTop()) return;', 'e.preventDefault();'), 'a window drawn over it takes the Escape, unmarked');
    assert.ok(esc.includes('closeDeal();'));
    // A second press while the save is out sends nothing (the detail tabs' Saves are not disabled).
    assert.ok(between(m, 'const saveDeal = () => {', 'const errors = {};').includes('if (saving) return;'));
    // The quotes move goes once the window has closed.
    assert.ok(m.includes('        if (onClose) onClose(go); else go();'));
});

test('THE GUARD: the lead window — its ×, Cancel, backdrop and Escape are one close, held mid-save, asking in the house words', () => {
    const l = read('src/components/modals/LeadModal.jsx');
    assert.ok(l.includes("const closeLead = useCloseRequest({ onClose, dirty: () => Object.values(form).some(v => v !== '') || manualAssignee !== null, busy: saving });"), 'typed work: a field filled, or an owner picked');
    assert.equal(count(l, 'onClick={closeLead}'), 2, 'the × and Cancel');
    assert.ok(l.includes('if (e.target === e.currentTarget) closeLead();'), 'the backdrop');
    assert.ok(between(l, "const escapeHeld = escapeBlocked('leadModal');", 'document.addEventListener').includes('closeLead();'), 'Escape');
    assert.equal(count(l, 'onClick={onClose}'), 0);
    const code = l.split('\n').filter((x) => !x.trim().startsWith('//')).join('\n');
    assert.ok(!code.includes('Discard this lead?') && !code.includes('showConfirm('), 'the house words, never a red Delete — asked through the one close');
});

test('THE GUARD: the user window and the coaching note — nothing mid-save, by any close', () => {
    const u = read('src/components/modals/UserModal.jsx');
    const esc = between(u, "    const escapeHeld = escapeBlocked('draggable');", 'document.addEventListener');
    assert.ok(inOrder(esc, 'if (!onTop()) return;', 'e.preventDefault();'));
    assert.ok(inOrder(esc, 'e.preventDefault();', 'if (saving) return;') && inOrder(esc, 'if (saving) return;', 'onClose();'), 'marked, and nothing while saving');
    assert.ok(inOrder(esc, 'if (errorMessage) { onDismissError(); return; }', 'onClose();'), 'a refused save: back to the form');
    assert.equal(count(u, 'onClick={onClose}'), 1, 'its Cancel alone');
    assert.ok(u.includes('onClick={onClose} disabled={saving}>Cancel</button>'));
    const c = read('src/components/modals/CoachingNoteDialog.jsx');
    assert.ok(c.includes('<div className="modal-overlay" onClick={saving ? undefined : onClose}>'), 'the backdrop');
    assert.ok(c.includes('<button type="button" onClick={onClose} disabled={saving}'), 'Cancel');
    assert.ok(c.includes("useEscapeLayer(true, () => { if (!saving) onClose(); },"), 'Escape');
});

test('THE GUARD: the imports, the merge reviews, the SPIFF claim and the activity rail — nothing mid-save, by any close', () => {
    for (const f of ['src/components/modals/CsvImportModal.jsx', 'src/components/modals/LeadImportModal.jsx']) {
        const s = read(f);
        assert.ok(s.includes('onClick={() => { if (!importing) onClose(); }} disabled={importing}'), `${f}: its ×`);
        // A plain close only where no import runs: the upload step's Cancel and the results' Done — an import runs on
        // the preview (and the conflicts) and ends before the results show.
        const plain = [...s.matchAll(/onClick=\{onClose\}/g)].map((m) => m.index);
        assert.equal(plain.length, 2, `${f}: the upload's Cancel and the results' Done`);
        const upload = s.indexOf("{step === 'upload' && ("), mapping = s.indexOf("{step === 'mapping' && ("), results = s.indexOf("{step === 'results' && ");
        assert.ok(upload > 0 && plain[0] > upload && plain[0] < mapping, `${f}: the first on the upload step`);
        assert.ok(results > 0 && plain[1] > results, `${f}: the second on the results`);
    }
    for (const f of ['src/components/modals/MergeReviewModal.jsx', 'src/components/modals/ContactMergeReviewModal.jsx']) {
        const s = read(f);
        assert.equal(count(s, '<button onClick={close} disabled={mergeSaving}'), 2, `${f}: its × and Cancel`);
        assert.equal(count(s, 'onClick={close}'), 2, `${f}: no other close`);
    }
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.equal(count(ml, 'onClick={() => { if (!spiffClaimBusy) closeClaimModal(); }}'), 2, 'the claim\'s backdrop and ×');
    assert.equal(count(ml, 'onClick={closeClaimModal}'), 0);
    const r = read('src/components/rails/ActivityRail.jsx');
    assert.ok(r.includes('const leaveRail = () => { if (!activityModalSaving) closeRail(); };'));
    assert.equal(count(r, 'onClick={leaveRail}'), 3, 'its backdrop, × and Cancel');
    assert.equal(count(r, 'onClick={closeRail}'), 0);
    assert.ok(between(r, "const escapeHeld = escapeBlocked('activityRail');", 'document.addEventListener').includes('leaveRail();'), 'Escape');
    assert.ok(r.includes('}, [isOpen, escapeHeld, activityModalSaving]);'), 'its listener reads the save of its render');
});

test('THE GUARD: the task, contact and account rails, Quick Log and the document link picker — nothing mid-save, by any close (the review, 16 Nov)', () => {
    for (const [f, flag] of [['TaskRail', 'taskModalSaving'], ['ContactRail', 'contactModalSaving'], ['AccountRail', 'accountModalSaving']]) {
        const s = read(`src/components/rails/${f}.jsx`);
        // The contact rail holds, too, through its duplicate check — part of a new contact's save; the contact and
        // account rails while a documents batch sends from their Documents tab (the reviews, 16 Nov).
        const busy = f === 'ContactRail' ? `${flag} || checkingDupRef.current` : flag;
        const drawn = f === 'ContactRail' ? `${flag} || checkingDup` : flag;
        const docs = f !== 'TaskRail';
        if (docs) {
            assert.ok(s.includes(`    const railHeld = () => ${busy} || docsOut > 0;`), `${f}: held by its save and its documents`);
            assert.ok(s.includes('    const onDocsBusy = useCallback((b) => setDocsOut((n) => n + (b ? 1 : -1)), []);') && s.includes('<RecordDocuments onBusy={onDocsBusy}'), `${f}: its documents counted`);
            assert.ok(s.includes('    const leaveRail = () => { if (!railHeld()) closeRail(); };'), `${f}: its held close`);
            assert.ok(s.includes('    const handleBack = () => {\n        if (railHeld()) return;'), `${f}: Back, held`);
            assert.ok(s.includes('            if (!isEditing) leaveRail();') && s.includes('onClick={!isEditing ? leaveRail : undefined}'), `${f}: Escape and the backdrop, held`);
            assert.ok(s.includes('onClick={() => { if (docsOut > 0) return; setActiveTab(id); }}'), `${f}: its tabs stay while a batch is out`);
            const mode = f === 'AccountRail' ? 'setAccountRailMode' : 'setContactRailMode';
            assert.ok(s.includes(`onClick={() => { if (docsOut > 0) return; ${mode}('edit'); }} disabled={docsOut > 0}`), `${f}: and its Edit, which leaves the Documents tab`);
            assert.equal(count(s, '        if (railHeld()) return;'), f === 'AccountRail' ? 3 : 2, `${f}: Back and each move to another record`);
        } else {
            assert.ok(s.includes(`    const leaveRail = () => { if (!${flag}) closeRail(); };`), `${f}: its held close`);
        }
        assert.equal(count(s, 'onClick={closeRail}'), 0, `${f}: no close past it`);
        assert.ok(s.includes('<button onClick={leaveRail} style={{ background: \'none\''), `${f}: its ×`);
        assert.ok(s.includes(`    const handleDiscard = () => {\n        if (${busy}) return;`), `${f}: Discard, held`);
        assert.ok(s.includes(`<button onClick={handleDiscard} disabled={${drawn}}`), `${f}: and drawn so`);
    }
    const rd = read('src/components/documents/RecordDocuments.jsx');
    assert.ok(rd.includes('        sending.current = true;\n        if (onBusy) onBusy(true);') && rd.includes('            sending.current = false;\n            if (onBusy) onBusy(false);'), 'a batch tells its host as it starts and as it ends — from the batch itself');
    assert.ok(read('src/components/layout/ModalLayer.jsx').includes('                                                    if (spiffClaimBusy) return;\n') && read('src/components/layout/ModalLayer.jsx').includes('disabled={!!spiffClaimBusy}'), 'one SPIFF claim at a time');
    const c = read('src/components/rails/ContactRail.jsx');
    assert.ok(c.includes('    const handleSave = async () => {\n        if (contactModalSaving || checkingDupRef.current) return;'), 'a second Create during the check sends nothing');
    assert.ok(c.includes('            checkingDupRef.current = true; setCheckingDup(true);\n            let dups;\n            try { dups = await checkDuplicate(saveData); } finally { checkingDupRef.current = false; setCheckingDup(false); }'), 'held through the check');
    assert.ok(c.includes('<button onClick={handleSave} disabled={contactModalSaving || checkingDup}'));
    const q = read('src/components/layout/QuickLogFab.jsx');
    assert.ok(q.includes('    const [logging, setLogging] = React.useState(false);\n    const loggingRef = React.useRef(false);'));
    assert.ok(q.includes("useEscapeLayer(quickLogOpen, () => { if (!loggingRef.current) setQuickLogOpen(false); },"), 'Escape');
    assert.ok(q.includes('onClick={() => { if (!loggingRef.current) setQuickLogOpen(false); }} />'), 'the backdrop');
    assert.ok(q.includes('<button disabled={logging} onClick={() => { if (loggingRef.current) return; draftIdRef.current = null; setQuickLogOpen(false);'), 'Cancel');   // its draft's id let go (§0.261)
    const log = between(q, '<button disabled={logging} onClick={async () => {', "{logging ? 'Logging…' : 'Log Activity'}");
    // Each one present, in order (an indexOf of -1 passed the order alone — the harness found it, 16 Nov).
    const [g1, g2, g3] = ['if (loggingRef.current) return;', 'loggingRef.current = true; setLogging(true);', 'crypto.randomUUID()'].map((t) => log.indexOf(t));
    assert.ok(g1 >= 0 && g1 < g2 && g2 < g3, 'a second press sends nothing — before an id is minted');
    assert.ok(log.includes('} finally { loggingRef.current = false; setLogging(false); }'), 'let go however it ends');
    const p = read('src/components/documents/DocumentLinkPicker.jsx');
    assert.ok(p.includes('const close = () => { if (busyRef.current) return; setShowDocLinkPicker(false);'), 'its one close — Escape, backdrop and ×');
    assert.ok(between(p, 'const done = async () => {', 'const chosen').includes('if (busyRef.current) return;'), 'a second Done sends nothing');
    assert.ok(p.includes('<button onClick={done} disabled={busy}'));
    // The document rail while the people chosen are being saved (round 3's review).
    const dr = read('src/components/documents/DocumentRail.jsx');
    assert.ok(dr.includes('const close = useCallback(() => { if (peopleOut.current) return; if (setDocumentRailId) setDocumentRailId(null); }, [setDocumentRailId]);'), 'its one close — Escape, backdrop and ×');
    assert.ok(dr.includes('    const savePeople = async () => {\n        if (peopleOut.current) return;\n        peopleOut.current = true;'), 'a second Share sends nothing');
    assert.ok(dr.includes('        } finally { peopleOut.current = false; }'), 'let go however it ends');
});

test('THE GUARD: a draggable window opened while another is open starts above it (the review, 16 Nov)', () => {
    const d = read('src/hooks/useDraggable.js');
    const reg = between(d, '    useEffect(() => {\n        // A window opened while another is open starts above it', '}, []);');
    const raise = reg.indexOf('if (OPEN_WINDOWS.size > 0) setZIndex(nextZ());');
    assert.ok(raise >= 0 && raise < reg.indexOf('OPEN_WINDOWS.add(containerRef);'), 'above every window already open — counted before this one (present: an indexOf of -1 passed the order alone)');
    // "+ New Rep" after the deal window's header was pressed: the deal at 10002, the user window raised over it.
    const deal = el('deal', 1), user = el('user', 2);
    assert.equal(topWindow([{ el: deal, z: 10002 }, { el: user, z: 10003 }], follows), user);
    assert.equal(topWindow([{ el: deal, z: 10002 }, { el: user, z: 10000 }], follows), deal, 'REGRESSION: at 10000 it drew under the deal window');
});

test('THE GUARD: every draggable window\'s Escape asks whether it is the one drawn on top — read when the Escape comes', () => {
    const dir = new URL('src/components/modals/', ROOT);
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsx')).map((f) => `src/components/modals/${f}`)
        .filter((f) => read(f).includes('useDraggable('));
    assert.deepEqual(files.sort(), ['CsvImportModal', 'LeadImportModal', 'LostReasonModal', 'OpportunityModal', 'UserModal'].map((n) => `src/components/modals/${n}.jsx`), 'the draggable windows');
    for (const f of files) {
        const s = read(f);
        assert.ok(/const \{[^}]*\bonTop\b[^}]*\} = useDraggable\(\);/.test(s), `${f}: takes onTop from useDraggable`);
        const asks = s.includes('if (!onTop()) return;') || s.includes("() => escapeBlocked('draggable') || !onTop()");
        assert.ok(asks, `${f}: its Escape is held while another window is drawn over it`);
    }
    const d = read('src/hooks/useDraggable.js');
    assert.ok(d.includes('        OPEN_WINDOWS.add(containerRef);\n        return () => { OPEN_WINDOWS.delete(containerRef); };'), 'each window counted while mounted');
    assert.ok(d.includes('const onTop = useCallback(() => windowOnTop(containerRef), []);') && d.includes('        onTop,\n    };'));
    assert.ok(d.includes('return topWindow(open, follows) === el;'));
    assert.ok(d.includes('const zOf = (el) => {') && d.includes('const follows = (a, b) => !!(b.compareDocumentPosition(a) & 4);'), 'the z it draws at, then its place in the page');
});
