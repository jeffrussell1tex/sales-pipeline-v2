// tests/tab-layers.test.mjs
//
// Every layer drawn inside a tab — and every popover portaled out of one — closes on Escape,
// the one on top only, and no shortcut fires under one (state §0.230; Jeff, 4 Nov: "Escape in
// the tabs", ten answers — docs/design/escape-tabs/).
//
// Before: of about 73 layers in the tabs, most had no Escape; the few that had one left it
// unmarked, so App closed a layer of its own, or the undo toast, on the same keypress; and App's
// letter and number shortcuts fired over every one — typing "837" in the Reports delivery
// dialog's time picker sent "3" to Tasks, and the dialog and its draft were gone.
//
// Now each takes its Escape through useLocalLayer: App holds a stack of them (a ref, in the order
// they opened, each under its place in ESCAPE_ORDER — 'tabLayer' drawn in a tab, 'tabPopover'
// portaled at 12000); the layer listens on document in the capture phase, and takes an Escape
// while it is the top of its place and nothing above the place is open — worked out at key time —
// and marks it. Escape, ×, Cancel and the backdrop are one close: nothing while a save is out,
// "Discard changes?" while it holds typed work, else its own close. App's shortcuts hold while any
// layer is open, and on a key a control already took.
//
// THE GUARD: every fixed, portaled or floating layer under src/Tabs — and in every component the
// tabs import — belongs to a component that calls useLocalLayer, or is named: KNOWN (a later
// batch of this work, each by its file and its line's text), SERVES (a listener whose layer
// registers elsewhere) or NOT_A_LAYER (with its reason). A name that no longer matches fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { pushLayer, removeLayer, onTopOfPlace, placesOpen, samePlaces, closeDecision, DISCARD_MESSAGE, DISCARD_LABELS } from '../src/utils/tabLayers.js';
import { ESCAPE_ORDER, layersAbove, topLayer } from '../src/utils/escapeOrder.js';
import { takeEscape } from '../src/utils/escapeLayer.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const count = (s, sub) => s.split(sub).length - 1;
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const esc = () => ({ key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });

// ── the stack, run ──────────────────────────────────────────────────────────

test('the stack: in the order opened, out by id wherever it stood, the last of a place its top', () => {
    let s = [];
    s = pushLayer(s, { id: 'a', place: 'tabLayer' });
    s = pushLayer(s, { id: 'b', place: 'tabLayer' });
    s = pushLayer(s, { id: 'p', place: 'tabPopover' });
    assert.deepEqual(s.map((e) => e.id), ['a', 'b', 'p']);
    assert.equal(pushLayer(s, { id: 'a', place: 'tabLayer' }), s, 'opened again under its id (StrictMode runs an effect twice): it stays where it was');
    assert.equal(onTopOfPlace(s, 'b'), true, 'b opened after a: the top of tabLayer');
    assert.equal(onTopOfPlace(s, 'a'), false, 'a, under b, waits');
    assert.equal(onTopOfPlace(s, 'p'), true, 'a popover is the top of its own place, whatever opened after it in another');
    assert.equal(onTopOfPlace(s, 'nope'), false, 'not on the stack: never on top');
    s = removeLayer(s, 'b');
    assert.equal(onTopOfPlace(s, 'a'), true, 'b closed: a is the top again');
    assert.equal(removeLayer(s, 'zz'), s, 'an id not on the stack changes nothing');
    s = removeLayer(s, 'a');
    assert.deepEqual(placesOpen(s), { tabPopover: true });
    assert.deepEqual(placesOpen([]), {});
});

test('App re-renders only when a place goes empty or not empty', () => {
    assert.equal(samePlaces({}, {}), true);
    assert.equal(samePlaces({ tabLayer: true }, { tabLayer: true }), true, 'a second tab layer opening changes nothing App draws');
    assert.equal(samePlaces({ tabLayer: true }, {}), false);
    assert.equal(samePlaces({}, { tabPopover: true }), false);
    assert.equal(samePlaces({ tabLayer: true, tabPopover: true }, { tabLayer: true }), false);
});

test('one close for Escape, ×, Cancel and the backdrop: nothing while a save is out, ask over typed work, else close', () => {
    assert.equal(closeDecision({ busy: true, dirty: true }), 'none', 'a save out: nothing — typed or not');
    assert.equal(closeDecision({ busy: true, dirty: false }), 'none');
    assert.equal(closeDecision({ busy: false, dirty: true }), 'ask');
    assert.equal(closeDecision({ busy: false, dirty: false }), 'close');
    assert.equal(DISCARD_MESSAGE, 'Discard changes?');
    assert.deepEqual(DISCARD_LABELS, { confirm: 'Discard', cancel: 'Keep editing' }, 'Jeff, 4 Nov: "Ask "Discard?"" — Keep editing / Discard');
});

// A keypress as the page meets it, with the tabs' layers: each tab layer's listener (document,
// capture, in the order registered) decides at key time by App's rule; then App on window.
const pressWith = (stack, appOpen, appKinds = {}) => {
    const closed = [];
    const e = esc();
    const now = () => ({ ...appOpen, ...placesOpen(stack) });
    for (const { id, place } of [...stack]) {
        if (e.key !== 'Escape' || e.defaultPrevented) continue;
        if (layersAbove(place, now()) || !onTopOfPlace(stack, id)) continue;
        e.preventDefault();
        closed.push(id);
        stack = removeLayer(stack, id);   // React has re-rendered before the next listener runs
    }
    if (!e.defaultPrevented) { const top = topLayer(now()); if (top && appKinds[top] === 'app') closed.push(top); }
    return { closed, stack };
};

test('one Escape, one layer: a picker inside a dialog closes first, then the dialog — whichever listener was added first', () => {
    const run = (order) => {
        let stack = order.reduce((s, e) => pushLayer(s, e), []);
        const first = pressWith(stack, {});
        assert.deepEqual(first.closed, ['picker'], 'the picker, opened after the dialog, alone');
        const second = pressWith(first.stack, {});
        assert.deepEqual(second.closed, ['dialog']);
    };
    run([{ id: 'dialog', place: 'tabLayer' }, { id: 'picker', place: 'tabLayer' }]);
    // A popover (its own place, above) inside a tab dialog: the popover, whatever opened first.
    let stack = [{ id: 'popover', place: 'tabPopover' }, { id: 'dialog', place: 'tabLayer' }];
    assert.deepEqual(pressWith(stack, {}).closed, ['popover']);
    stack = [{ id: 'dialog', place: 'tabLayer' }, { id: 'popover', place: 'tabPopover' }];
    assert.deepEqual(pressWith(stack, {}).closed, ['popover']);
});

test('the tabs\' layers and the app\'s: a rail or the confirm over a tab\'s dialog takes the Escape; a tab\'s dialog over the header\'s panel takes it', () => {
    const stack = [{ id: 'dialog', place: 'tabLayer' }];
    assert.deepEqual(pressWith(stack, { confirm: true }, { confirm: 'app' }).closed, ['confirm'], '"Discard changes?" over the dialog: Escape is Keep editing');
    assert.deepEqual(pressWith(stack, { contactRail: true }, { contactRail: 'own' }).closed, [], 'a rail over it: the rail\'s own listener takes it (not modelled here) — the dialog waits');
    assert.deepEqual(pressWith(stack, { profile: true }, { profile: 'app' }).closed, ['dialog'], 'over the profile panel, the dialog alone — the panel under it stays');
    const pop = [{ id: 'time', place: 'tabPopover' }];
    assert.deepEqual(pressWith(pop, { taskRail: true }, { taskRail: 'own' }).closed, ['time'], 'the time picker in the task rail: its list first, marked — the rail and its draft stay');
});

test('the guard finds the shape as it was: an unmarked Escape of a tab\'s layer, and App\'s close under it on the same keypress', () => {
    // Before §0.230: the drawer's listener closed on any unmarked Escape and left it unmarked;
    // App, on window after it, then closed the layer on top of its own — the profile under it.
    const closed = [];
    const e = esc();
    if (e.key === 'Escape' && !e.defaultPrevented) closed.push('drawer');
    if (!e.defaultPrevented) closed.push(topLayer({ profile: true }));
    assert.deepEqual(closed, ['drawer', 'profile'], 'two layers on one Escape');
    // And now: the hook marks it.
    const f = esc();
    takeEscape(f, false, () => {});
    assert.equal(f.defaultPrevented, true);
});

// ── the hook and App, read ──────────────────────────────────────────────────

test('useLocalLayer: registered before paint and only when it opens, on document in the capture phase, deciding at key time and marking what it takes', () => {
    const h = read('src/hooks/useLocalLayer.js');
    assert.ok(h.includes("export function useLocalLayer(open, { onClose, dirty = false, busy = false, place = 'tabLayer' } = {}) {"));
    assert.ok(h.includes('    useLayoutEffect(() => {'), 'a layout effect: before any key can arrive (a passive effect left a gap where a new child was not on the stack and its parent was)');
    assert.ok(h.includes('    }, [open]);'), 'only when open changes: a layer that stays open keeps its place');
    assert.ok(h.includes('        a.registerLayer(id, place);') && h.includes('            if (later && later.unregisterLayer) later.unregisterLayer(id);'), 'on the stack while open; off it on close or unmount, by its id');
    assert.ok(h.includes("        document.addEventListener('keydown', onKey, true);") && h.includes("            document.removeEventListener('keydown', onKey, true);"), 'document, capture: before every rail, every React onKeyDown and App');
    const onKey = between(h, '        const onKey = (e) => {', '\n        };');
    assert.ok(onKey.includes("if (e.key !== 'Escape' || e.defaultPrevented) return;"), 'a marked Escape is left alone');
    assert.ok(onKey.includes('if (now && now.localLayerBlocked && now.localLayerBlocked(id, place)) return;'), 'held at key time: a layer above its place, or not the top of its place');
    assert.ok(onKey.indexOf('e.preventDefault();') > onKey.indexOf('localLayerBlocked(id, place)') && onKey.includes('requestClose();'), 'marked, then the one close');
    const rc = between(h, '    const requestClose = useCallback(() => {', '\n    }, []);');
    assert.ok(rc.includes("if (decided === 'none') return;"), 'nothing while a save is out');
    assert.ok(rc.includes('a.showConfirm(DISCARD_MESSAGE, () => {') && rc.includes('}, true, DISCARD_LABELS);'), 'typed work: App\'s confirm, Discard / Keep editing');
    assert.ok(rc.includes('const now = live.current;') && rc.includes('if (!now.busy && now.onClose) now.onClose();'), 'Discard runs the close as it stands then, and never while a save is out');
    const blur = rc.indexOf('if (typeof document !== \'undefined\' && document.activeElement && document.activeElement.blur) document.activeElement.blur();');
    assert.ok(blur > 0 && blur < rc.indexOf('a.showConfirm('), 'the form lets go of the focus first: the confirm takes none, and Enter would submit under it');
    assert.ok(rc.includes("        if (decided === 'ask') {\n"), 'typed work asks — the confirm is reached by the ask, and only by it');
    assert.ok(h.includes('    live.current = { onClose, dirty, busy };'), 'the latest close, typed state and save, every render');
});

test('App: the stack in a ref, stable to register, re-rendering only when a place changes; the order handed the places; held at key time', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes("import { pushLayer, removeLayer, onTopOfPlace, placesOpen, samePlaces } from './utils/tabLayers.js';"));
    assert.ok(app.includes('    const tabStackRef = useRef([]);'));
    assert.ok(app.includes('        setTabPlaces(prev => (samePlaces(prev, next) ? prev : next));'), 'a render only when a place goes empty or not');
    assert.ok(app.includes('    const registerLayer = React.useCallback((id, place) => { tabStackRef.current = pushLayer(tabStackRef.current, { id, place }); syncTabPlaces(); }, [syncTabPlaces]);'));
    assert.ok(app.includes('    const unregisterLayer = React.useCallback((id) => { tabStackRef.current = removeLayer(tabStackRef.current, id); syncTabPlaces(); }, [syncTabPlaces]);'));
    assert.ok(app.includes('    const layersNow = React.useCallback(() => ({ ...(openLayersRef.current || {}), ...placesOpen(tabStackRef.current) }), []);'), 'every layer open now, read at key time');
    assert.ok(app.includes('    const localLayerBlocked = React.useCallback((id, place) => layersAbove(place, layersNow()) || !onTopOfPlace(tabStackRef.current, id), [layersNow]);'));
    assert.ok(app.includes('    const anyLayerOpen = React.useCallback(() => topLayer(layersNow()) !== null, [layersNow]);'));
    assert.ok(app.includes('        tabPopover: !!tabPlaces.tabPopover, tabLayer: !!tabPlaces.tabLayer,'), 'the order sees the places');
    assert.ok(between(app, '    const appContextValue = {', '\n    };').includes('        registerLayer, unregisterLayer, localLayerBlocked, anyLayerOpen,'), 'handed to every layer');
    // Defined before the key handler that reads them, and before the early returns.
    const defined = app.indexOf('    const anyLayerOpen = React.useCallback(');
    assert.ok(defined > 0 && defined < app.indexOf('    // ── Global keyboard shortcuts') && defined < app.indexOf('    if (!clerkLoaded || !orgLoaded) {'));
});

test('App\'s shortcuts: none on a key a control took, none while any layer is open — App\'s, a tab\'s, a popover — and "?" still toggles the list', () => {
    const app = read('src/App.jsx');
    const handler = between(app, '        const handler = (e) => {', "        window.addEventListener('keydown', handler);");
    const afterEsc = handler.slice(handler.indexOf("            if (e.key === 'Escape') {"));
    const marked = afterEsc.indexOf('\n            if (e.defaultPrevented) return;');
    const typing = afterEsc.indexOf('\n            if (isTyping) return;');
    const help = afterEsc.indexOf("            if (e.key === '?' || (e.key === '/' && e.shiftKey)) {");
    const held = afterEsc.indexOf('            if (anyModalOpen) return;');
    assert.ok(marked > 0 && marked < typing && typing < help && help < held, 'a marked key, then typing, then "?", then every layer');
    assert.ok(afterEsc.includes('            const anyModalOpen = anyLayerOpen();'), 'every layer open now, not a list of App\'s');
    // Run: the rule the gate reads.
    const open = (o) => topLayer(o) !== null;
    assert.equal(open({}), false, 'nothing open: the shortcuts fire');
    for (const [name] of ESCAPE_ORDER) assert.equal(open({ [name]: true }), true, `${name} open: they hold`);
    // Ctrl-K, the header's own, holds too; and the search box leaves a marked Escape alone.
    const hdr = read('src/components/layout/AppHeader.jsx');
    assert.ok(hdr.includes('                e.preventDefault();\n                if (anyLayerOpen && anyLayerOpen()) return;\n                setShowSearchResults(true);'), 'Ctrl-K: never over a layer');
});

test('the confirm says what it does: Discard / Keep editing when asked so, Delete or Confirm and Cancel when not', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes('    const showConfirm = (message, onConfirm, danger = true, labels = null) => {\n        setConfirmModal({ message, onConfirm, danger, labels });'));
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.ok(ml.includes("{confirmModal.labels?.cancel || 'Cancel'}</button>"));
    assert.ok(ml.includes(">{confirmModal.labels?.confirm || (confirmModal.danger !== false ? 'Delete' : 'Confirm')}</button>"));
});

test('the two layers that never closed by themselves close on a click outside them (Jeff, 4 Nov: "Close on outside click")', () => {
    const hdr = read('src/components/layout/AppHeader.jsx');
    assert.ok(hdr.includes("        const onDown = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowNotifications(false); };"), 'the notifications list — not on the bell, which toggles it');
    assert.ok(hdr.includes('                <div ref={bellRef} style={{ position: \'relative\' }}>'));
    const ql = read('src/components/layout/QuickLogFab.jsx');
    assert.ok(ql.includes("        const onDown = (e) => { if (followUpRef.current && !followUpRef.current.contains(e.target)) setFollowUpPrompt(null); };"), 'the follow-up — as its Skip');
    assert.ok(ql.includes('                <div ref={followUpRef} style={{'));
});

test('the header is its own stacking context at 150: its panels draw there, under a tab\'s layer with a backdrop (the order puts tabLayer above them)', () => {
    assert.ok(read('src/components/layout/AppHeader.jsx').includes("fontFamily: T.sans, position: 'sticky', top: 0, zIndex: 150,"));
    const names = ESCAPE_ORDER.map(([n]) => n);
    assert.deepEqual(names.slice(-4), ['tabLayer', 'search', 'profile', 'notifications']);
    assert.ok(names.indexOf('tabPopover') < names.indexOf('linkPicker') && names.indexOf('tabPopover') > names.indexOf('leaveGuard'), 'the popovers: over every rail and window, under the leave guard and the app\'s dialogs');
});

// ── each layer of batch 1, read ─────────────────────────────────────────────

const decl = (src, name) => {
    const tree = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    for (const top of tree.program.body) {
        const d = top.type === 'ExportNamedDeclaration' || top.type === 'ExportDefaultDeclaration' ? top.declaration : top;
        if (!d) continue;
        const n = d.type === 'FunctionDeclaration' ? (d.id && d.id.name) : d.type === 'VariableDeclaration' ? d.declarations[0].id.name : null;
        if (n === name) return src.slice(top.start, top.end);
    }
    assert.fail(`no top-level ${name}`);
};

test('the CRM tabs\' layers each take their Escape, and do what their own close does', () => {
    const acc = read('src/Tabs/AccountsTab.jsx');
    assert.ok(decl(acc, 'SubAccountDrawer').includes('    useLocalLayer(true, { onClose });'), 'the Sub-accounts drawer');
    assert.ok(!decl(acc, 'SubAccountDrawer').includes("addEventListener('keydown'"), 'its own unmarked listener gone');
    assert.ok(decl(acc, 'FilterPanel').includes('    useLocalLayer(open, { onClose });'), 'the Accounts Filter panel — a filter draft, not typed work');
    const con = read('src/Tabs/ContactsTab.jsx');
    assert.ok(decl(con, 'RowActionMenu').includes("    useLocalLayer(!!rect, { onClose, place: 'tabPopover' });"), 'the Contacts row menu, both views');
    const leads = read('src/Tabs/LeadsTab.jsx');
    assert.ok(decl(leads, 'LeadScore').includes("    useLocalLayer(!!(open && canExplain), { onClose: () => setOpen(false), place: 'tabPopover' });"));
    for (const p of ['StatusPickerPopover', 'RepPickerPopover']) {
        const d = decl(leads, p);
        assert.ok(d.includes('    useLocalLayer(!!anchor, { onClose });'), p);
        assert.ok(!d.includes("addEventListener('keydown'"), `${p}: its own unmarked listener gone`);
    }
    const pipe = read('src/Tabs/PipelineTab.jsx');
    assert.ok(decl(pipe, 'FilterPanel').includes('    useLocalLayer(open, { onClose });'));
    const sv = decl(pipe, 'SaveViewDialog');
    assert.ok(sv.includes('    const requestClose = useLocalLayer(open, { onClose, dirty: !!name.trim() });'), 'a name typed is typed work');
    assert.equal(count(sv, 'onClick={requestClose}'), 2, 'the backdrop and Cancel ask as Escape does');
    assert.ok(!sv.includes("e.key === 'Escape'"), 'the input\'s own Escape — after the dialog\'s, on the same keypress — gone');
    const docs = read('src/Tabs/DocumentsTab.jsx');
    assert.ok(decl(docs, 'RowMenu').includes("    useLocalLayer(!!anchor, { onClose, place: 'tabPopover' });"));
    const tasks = read('src/Tabs/TasksTab.jsx');
    assert.ok(decl(tasks, 'SnoozePicker').includes('    useLocalLayer(true, { onClose });'));
    assert.ok(decl(read('src/Tabs/QuotesTab.jsx'), 'TemplatePickerModal').includes('    useLocalLayer(true, { onClose });'));
    const rep = read('src/Tabs/ReportsTab.jsx');
    const dd = decl(rep, 'DeliveryDialog');
    assert.ok(dd.includes('    const requestClose = useLocalLayer(true, { onClose, dirty: deliveryKey(draft) !== baseRef.current, busy });'), 'a schedule changed is typed work; nothing while a save is out');
    assert.equal(count(dd, 'onClick={requestClose}'), 2, 'the backdrop and Close ask as Escape does');
    assert.ok(dd.includes('    React.useEffect(() => { const stored = cleanDelivery(report?.config?.delivery); if (stored) baseRef.current = deliveryKey(stored); }, [report]);'), 'measured against what is stored once a save answers');
    assert.ok(decl(rep, 'ContactRowKebab').includes('    useLocalLayer(open, { onClose: close });'));
    const ah = decl(rep, 'ActivityHistoryTab');
    for (const k of ['acc', 'con', 'opp']) {
        const up = k[0].toUpperCase() + k.slice(1);
        assert.ok(ah.includes(`    useLocalLayer(${k}Open, { onClose: () => set${up}Open(false) });`), `the ${k} picker`);
    }
    const td = read('src/components/ui/TimeDropdown.jsx');
    assert.ok(td.includes("    useLocalLayer(open, { onClose: closeMenu, place: 'tabPopover' });"), 'the time picker, in every host');
    assert.ok(!td.includes("if (e.key === 'Escape')"), 'its trigger\'s Escape — only while it had focus, never after a mouse open — gone');
});

test('deliveryKey: the schedule\'s own fields, recipients in any order the same', async () => {
    const rep = read('src/Tabs/ReportsTab.jsx');
    const line = rep.split('\n').find((l) => l.startsWith('const deliveryKey = (d) => '));
    const deliveryKey = new Function(`${line}; return deliveryKey;`)();
    const a = { enabled: true, cadence: 'weekly', hour: 8, minute: 0, weekday: 1, dayOfMonth: 1, timezone: 'UTC', emailTo: ['u1', 'u2'], slack: false, lastSentAt: 'x' };
    assert.equal(deliveryKey(a), deliveryKey({ ...a, emailTo: ['u2', 'u1'], lastSentAt: 'y', lastError: 'z' }), 'recipients\' order and the send stamps are not typed work');
    for (const [k, v] of [['enabled', false], ['cadence', 'daily'], ['hour', 9], ['minute', 30], ['weekday', 2], ['dayOfMonth', 3], ['timezone', 'America/Chicago'], ['emailTo', ['u1']], ['slack', true]]) {
        assert.notEqual(deliveryKey(a), deliveryKey({ ...a, [k]: v }), `${k} changed is typed work`);
    }
    assert.equal(deliveryKey(null), 'null');
});

test('the layer bugs in these files (Jeff, 4 Nov: "Fix in its batch")', () => {
    const acc = read('src/Tabs/AccountsTab.jsx');
    assert.equal(count(acc, '<FilterPanel'), 1, 'the Accounts Filter panel drawn once — it was drawn twice, on one flag at one spot');
    assert.ok(!acc.includes('const Toolbar = () =>') && acc.includes('    const toolbarJSX = (') && acc.includes('            {toolbarJSX}'), 'the toolbar inline JSX, as the header — a component defined inside the tab remounted the panel and lost its draft');
    const docs = read('src/Tabs/DocumentsTab.jsx');
    assert.ok(docs.includes("!(e.target.closest && e.target.closest('[data-doc-menu-trigger]'))") && docs.includes('<button data-doc-menu-trigger'), 'the ⋯ button\'s mousedown does not close its menu');
    assert.ok(docs.includes('onMenu={(d, anchor) => setMenu(m => (m && m.doc.id === d.id ? null : { doc: d, anchor }))}'), 'its click closes the open one — it reopened it');
    const tasks = read('src/Tabs/TasksTab.jsx');
    const sp = decl(tasks, 'SnoozePicker');
    assert.ok(sp.includes('!(anchorRef && anchorRef.current && anchorRef.current.contains(e.target))'), 'the Snooze button\'s mousedown does not close its picker');
    assert.ok(sp.includes('<div ref={ref} onClick={e => e.stopPropagation()} style={{ position: \'fixed\''), 'a pick is the picker\'s alone — it opened the task too');
    assert.ok(tasks.includes('anchorRect={snoozeRect} anchorRef={snoozeRef}/>'));
    const kb = decl(read('src/Tabs/ReportsTab.jsx'), 'ContactRowKebab');
    assert.ok(kb.includes("        document.addEventListener('mousedown', onDown);") && !kb.includes("addEventListener('click'"), 'a mousedown closes it — a click listener never heard another row\'s ⋮, so two stayed open');
    assert.ok(kb.includes("        window.addEventListener('scroll', close, true);"), 'a scroll closes it — drawn fixed, it was left behind');
});

// ── batch 2: Dispatch (state §0.231), read ──────────────────────────────────

test('Dispatch\'s layers each take their Escape, and do what their own close does (batch 2, §0.231)', () => {
    const d = read('src/Tabs/DispatchTab.jsx');
    const ct = decl(d, 'CustomerTypeahead');
    assert.ok(ct.includes('    const listShown = open && (custMatches.length > 0 || acctMatches.length > 0 || showCreate);')
        && ct.includes('    useLocalLayer(listShown, { onClose: () => setOpen(false) });') && ct.includes('            {listShown && ('), 'New Job\'s customer results — nested in New Job, the list alone, the query kept');
    const cb = decl(d, 'CrewBuilderView');
    assert.ok(cb.includes('    useLocalLayer(!!overridePrompt, { onClose: () => setOverridePrompt(null) });'), '"Assign anyway?"');
    assert.equal(count(cb, '} disabled={saving}\n'), 3, 'Added, Add and Override held while a schedule saves — its success wiped them');
    assert.ok(decl(d, 'MassSchedulePanel').includes('    useLocalLayer(true, { onClose: onCancel, busy: saving });'), 'the Proposed schedule — never while the schedules go out');
    const sv = decl(d, 'ScheduleView');
    assert.ok(sv.includes('    const requestEditClose = useLocalLayer(!!editing, { onClose: () => setEditing(null), dirty: !!editing && JSON.stringify(editing) !== editBaseRef.current, busy });'), 'the time-off dialog — typed work asks, nothing mid-save');
    assert.ok(sv.includes('    else if (editBaseRef.current === null) editBaseRef.current = JSON.stringify(editing);') && sv.includes('    if (!editing) editBaseRef.current = null;'), 'measured against the block as it opened');
    assert.ok(sv.includes('    const requestConflictClose = useLocalLayer(!!conflict, { onClose: () => setConflict(null), busy });'), '"Already scheduled", over it');
    assert.ok(sv.indexOf('const requestEditClose') < sv.indexOf('const requestConflictClose'), 'declared in the order they open');
    assert.equal(count(sv, 'onClick={requestEditClose}'), 2, 'the time-off dialog\'s backdrop and Cancel ask as Escape does');
    assert.equal(count(sv, 'onClick={requestConflictClose}'), 2, 'the conflict\'s backdrop and Reject');
    const sp = decl(d, 'ShiftPatternDialog');
    assert.ok(sp.includes('    const requestClose = useLocalLayer(true, { onClose: onCancel, dirty: weekKey(wh) !== base, busy });'), 'the shift pattern — a changed week asks');
    assert.equal(count(sp, 'onClick={requestClose}'), 2, 'its backdrop and Cancel');
    assert.ok(sp.includes("catch (e) { setErr(`Not saved — ${e?.message || 'the server did not answer'}`); }") && sp.includes('<div role="alert"'), 'a refused save is said — a try with no catch left it silent');
    const tab = decl(d, 'DispatchTab');
    assert.ok(tab.includes("    useLocalLayer(!!openFilter && !!filterRect && view === 'board', { onClose: closeFilter });"), 'the board\'s filter menu, while it is drawn');
    assert.ok(tab.includes('    const requestCloseNewJob = useLocalLayer(showNewJobForm, { onClose: closeNewJob, dirty: showNewJobForm && JSON.stringify(newJobForm) !== newJobBaseRef.current, busy: newJobSaving });'), 'New Job — typed work asks, nothing while its Save runs');
    assert.ok(tab.includes('    else if (newJobBaseRef.current === null) newJobBaseRef.current = JSON.stringify(newJobForm);') && tab.includes('    if (!showNewJobForm) newJobBaseRef.current = null;'), 'measured against the form it opened with — a won deal\'s, a plan\'s visit, or blank');
    assert.equal(count(tab, 'onClick={requestCloseNewJob}'), 3, 'New Job\'s backdrop, × and Cancel ask as Escape does');
    assert.ok(tab.includes('        if (showConfirm) showConfirm(msg, action, true, DISCARD_LABELS);'), 'the discard prompt says Discard / Keep editing — it read "Delete"');
});

test('weekKey: a week by its days, in any key order', () => {
    const line = read('src/Tabs/DispatchTab.jsx').split('\n').find((l) => l.startsWith('const weekKey = (o) => '));
    const weekKey = new Function(`${line}; return weekKey;`)();
    const a = { mon: { start: '08:00', end: '17:00' }, tue: { start: '08:00', end: '17:00' } };
    assert.equal(weekKey(a), weekKey({ tue: { start: '08:00', end: '17:00' }, mon: { start: '08:00', end: '17:00' } }), 'a day off and on again: the same week');
    assert.notEqual(weekKey(a), weekKey({ ...a, tue: { start: '09:00', end: '17:00' } }), 'a start changed');
    assert.notEqual(weekKey(a), weekKey({ ...a, tue: { start: '08:00', end: '16:00' } }), 'an end changed');
    assert.notEqual(weekKey(a), weekKey({ mon: a.mon }), 'a day off');
    assert.equal(weekKey(undefined), weekKey({}), 'no pattern');
});

// ── batch 3: Settings (state §0.232), read ──────────────────────────────────

test('Settings\' layers each take their Escape, and do what their own close does (batch 3, §0.232)', () => {
    const S = 'src/Tabs/settings/';
    const has = (file, decl0, line, why) => assert.ok(decl(read(file), decl0).includes(line), `${file} [${decl0}]: ${why || line.trim()}`);
    has('src/Tabs/AdminView.jsx', 'AdminView', '    useLocalLayer(!!naMenuOpen && !activeItem, { onClose: () => setNaMenuOpen(null) });', 'the needs-attention menu, while the card list draws it');
    assert.equal(count(read('src/Tabs/AdminView.jsx'), '<LeaveGuardModal inTab '), 2, 'Settings\' own guard, both its places, portaled above the rails (Q5)');
    has(S + 'integrations/shared.jsx', 'useRowMenu', '    useLocalLayer(!!activeMenu, { onClose: () => setActiveMenu(null) });', 'every panel\'s row menu — API keys, Webhooks, Automations');
    has(S + 'security/shared.jsx', 'PolicySelect', '    useLocalLayer(open, { onClose: () => setOpen(false) });');
    has(S + 'audit/AuditDetail.jsx', 'AuditAnchoredMenu', '    useLocalLayer(true, { onClose });');
    has(S + 'audit/AuditDetail.jsx', 'AddDestinationModal', "    const requestClose = useLocalLayer(true, { onClose, dirty: !!(dest.trim() || url.trim()) || fmt !== 'JSON', busy: saving });", 'typed work asks; its × held mid-save, as its backdrop and Cancel were');
    has(S + 'data/BackupDetail.jsx', 'RestoreModal', "                <DataBtn label=\"Cancel\" onClick={requestClose} disabled={loading}/>", 'the restore\'s Cancel held while the snapshot downloads');
    has(S + 'data/ExportDetail.jsx', 'NewExportModal', '    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([nameNow, scope, fmt, cadence, dest]) !== opened, busy: saving });');
    has(S + 'data/ExportDetail.jsx', 'NewDsrModal', "    const requestClose = useLocalLayer(true, { onClose, dirty: !!(subject.trim() || notes.trim()) || type !== 'access', busy: saving });");
    has(S + 'data/FeaturesDetail.jsx', 'ResetAiModal', '    useLocalLayer(true, { onClose });');
    has(S + 'integrations/ApiKeysDetail.jsx', 'RevokeKeyModal', '    const requestClose = useLocalLayer(true, { onClose, busy: confirming });');
    has(S + 'integrations/ApiKeysDetail.jsx', 'DocsPopoverB', '    useLocalLayer(showKeyPicker, { onClose: () => setShowKeyPicker(false) });', 'its key picker, nested');
    has(S + 'integrations/AutomationsDetail.jsx', 'AutomationModal', '    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([name, trigger, conditions, actions]) !== opened, busy: saving });');
    has(S + 'integrations/AutomationsDetail.jsx', 'AutomationsDetail', '    useLocalLayer(!!runsFor, { onClose: () => setRunsFor(null) });', 'the run history');
    has(S + 'integrations/ConnectedAppsDetail.jsx', 'SlackConfigModal', '    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([webhookUrl, channel, alerts]) !== opened, busy: saving || testing });');
    has(S + 'people/TeamsDetail.jsx', 'TeamModal', '    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([name, territory, vertical, managerId, repIds, color]) !== opened, busy: saving });');
    const teams = decl(read(S + 'people/TeamsDetail.jsx'), 'TeamsDetail');
    assert.ok(teams.includes("    const requestAssignClose = useLocalLayer(!!assigningUser, { onClose: () => { setAssigningUser(null); setAssignErr(''); }, busy: assigning });"), 'Assign to team: held while an assignment is out, and its error cleared on close — a reopened window showed the last one\'s');
    assert.equal(count(teams, 'onClick={requestAssignClose}'), 3, 'its backdrop, × and Cancel');
    has(S + 'people/TerritoriesDetail.jsx', 'TerritoryModal', '    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([name, parent, rule, ownerId, repIds]) !== opened, busy: saving });');
    has(S + 'people/TerritoriesDetail.jsx', 'TerritoriesDetail', '    useLocalLayer(openTerrKebab !== null, { onClose: () => setOpenTerrKebab(null) });');
    has(S + 'people/UsersDetail.jsx', 'UsersDetail', "    useLocalLayer(openUserKebab !== null && !!kebabPos, { onClose: () => setOpenUserKebab(null), place: 'tabPopover' });");
    has(S + 'quoting/EditBrandModal.jsx', 'EditBrandModal', '  const close = useLocalLayer(true, { onClose, dirty, busy: saving });');
    assert.equal(count(decl(read(S + 'quoting/EditBrandModal.jsx'), 'EditBrandModal'), 'onClick={close}'), 3, 'Edit brand\'s scrim, × and Cancel through the one close — none closes mid-save');
    has(S + 'data/ExportDetail.jsx', 'NewExportModal', ' onChange={e => setNameNow(e.target.value)} ', 'the uncontrolled name field feeds the close\'s question');
    has(S + 'quoting/QuoteTemplatesDetail.jsx', 'NewTemplateModal', '    const requestClose = useLocalLayer(true, { onClose, dirty: JSON.stringify([mode, blankVariant, optionalBlocks, pageSetup, useCase, selectedTpl ? selectedTpl.id || selectedTpl : null, newName, visibleTo, setAsDefault]) !== opened });');
    assert.equal(count(decl(read(S + 'quoting/QuoteTemplatesDetail.jsx'), 'NewTemplateModal'), 'onClick={requestClose}'), 3);
    has(S + 'salesProcess/BuyerPersonasDetail.jsx', 'BuyerPersonasDetail', '    const requestPersonaClose = useLocalLayer(!!editModal, { onClose: () => setEditModal(null), dirty: !!editModal && JSON.stringify(editModal.data) !== personaBaseRef.current });');
    has(S + 'salesProcess/IndustriesDetail.jsx', 'IndustriesDetail', "    useLocalLayer(openIndKebab !== null && !!kebabPos, { onClose: () => setOpenIndKebab(null), place: 'tabPopover' });");
    has(S + 'dispatch/DispatchSkillsDetail.jsx', 'DispatchSkillsDetail', '    useLocalLayer(!!(licMenu && licMenu.rect), { onClose: () => setLicMenu(null) });');
    has(S + 'dispatch/DispatchJobTemplatesDetail.jsx', 'DispatchJobTemplatesDetail', '    useLocalLayer(!!(tmplMenu && tmplMenu.rect), { onClose: () => setTmplMenu(null) });');
});

test('the secrets shown once close only by "I\'ve stored it" (Q2, §0.232): Escape, the backdrop and × do nothing at the reveal, nor while the secret is made', () => {
    const S = 'src/Tabs/settings/';
    const key = decl(read(S + 'integrations/ApiKeysDetail.jsx'), 'NewApiKeyModal');
    assert.ok(key.includes("    const requestClose = useLocalLayer(true, { onClose, dirty: step === 'form' && (!!name.trim() || scopes.size > 1), busy: step !== 'form' });"), 'the API key: held while it is created and once it shows');
    assert.ok(key.includes('        <IntModal width={580} onClose={requestClose}>\n            <IntModalHeader onClose={requestClose}'), 'its backdrop and × through the held close');
    assert.ok(key.includes('<IntBtn label="I\'ve stored it — close" primary onClick={onClose}/>'), 'and only its "I\'ve stored it" closes');
    const hook = decl(read(S + 'integrations/WebhooksDetail.jsx'), 'NewWebhookModal');
    assert.ok(hook.includes("busy: saving || step !== 'form' });"), 'the webhook\'s signing secret: held while it is made and once it shows');
    assert.equal(count(hook, ' onClose={requestClose}'), 2, 'its backdrop and ×');
    assert.ok(hook.includes('<IntBtn label="I\'ve saved it — close" primary onClick={onClose}/>'));
    const audit = decl(read(S + 'audit/AuditDetail.jsx'), 'SecretRevealModal');
    assert.ok(audit.includes('    useLocalLayer(true, { onClose, busy: true });') && audit.includes('<SecBtn label="I have stored it" primary onClick={onClose}/>'), 'the audit stream\'s: Escape taken, nothing closes it but "I have stored it"');
});

test('Pipelines\' and KPI thresholds\' ⋯ menus close on a click outside them (Q7, §0.232) — they closed only by their own button or an item', () => {
    const S = 'src/Tabs/settings/salesProcess/';
    const p = decl(read(S + 'PipelinesDetail.jsx'), 'PipelinesDetail');
    assert.ok(p.includes("        const key = openPipelineKebab !== null ? 'pl-' + openPipelineKebab : openKebab !== null ? 'st-' + openKebab : null;"));
    assert.ok(p.includes("const root = e.target && e.target.closest ? e.target.closest('[data-menu-root]') : null; if (root && root.getAttribute('data-menu-root') === key) return; setOpenPipelineKebab(null); setOpenKebab(null); setConfirmDelete(null);"), 'a mousedown outside the open menu closes both');
    assert.ok(p.includes("data-menu-root={'pl-' + p.id}") && p.includes("data-menu-root={'st-' + s}"), 'each menu\'s own root');
    for (const line of ['    useLocalLayer(openPipelineKebab !== null, { onClose: () => setOpenPipelineKebab(null) });', '    useLocalLayer(!!blockedDeletePipeline, { onClose: () => setBlockedDeletePipeline(null) });', '    useLocalLayer(!!confirmDeletePipeline, { onClose: () => setConfirmDeletePipeline(null) });']) assert.ok(p.includes(line), line.trim());
    const k = decl(read(S + 'KPIThresholdsDetail.jsx'), 'KPIThresholdsDetail');
    assert.ok(k.includes("if (root && root.getAttribute('data-menu-root') === 'kpi-' + openKPI) return; setOpenKPI(null);") && k.includes("data-menu-root={'kpi-' + i}"));
    assert.ok(k.includes('    useLocalLayer(openKPI !== null, { onClose: () => setOpenKPI(null) });'));
    // The close is attached, and taken off (each component holds one such listener).
    for (const [name, src] of [['Pipelines', p], ['KPI thresholds', k]]) {
        assert.equal(count(src, "        document.addEventListener('mousedown', onDown);\n"), 1, `${name}: the outside close is listened for`);
        assert.equal(count(src, "        return () => document.removeEventListener('mousedown', onDown);\n"), 1, `${name}: and taken off`);
    }
});

test('every inline Escape in Settings leaves a marked one alone and marks the one it takes (§0.232)', () => {
    const files = walkDir('src/Tabs/settings').filter((f) => f.endsWith('.jsx'));
    let n = 0;
    for (const f of files) {
        const src = read(f);
        assert.ok(!/if\s*\(\s*e\.key\s*===\s*'Escape'\s*\)/.test(src), `${f}: an inline Escape that does not check the mark`);
        n += count(src, "if (e.key === 'Escape' && !e.defaultPrevented && (e.preventDefault(), true)) ");
    }
    assert.ok(n >= 19, `the inline Escapes (${n}; 19 when §0.232 was written)`);
    // Run: the transform's condition — a marked Escape skipped, an unmarked one marked and taken.
    const run = (e) => { let took = false; if (e.key === 'Escape' && !e.defaultPrevented && (e.preventDefault(), true)) took = true; return took; };
    const fresh = esc();
    assert.equal(run(fresh), true); assert.equal(fresh.defaultPrevented, true);
    const marked = { ...esc(), defaultPrevented: true };
    assert.equal(run(marked), false);
    assert.equal(run({ key: 'Enter', defaultPrevented: false, preventDefault() {} }), false);
});

// ── THE GUARD ───────────────────────────────────────────────────────────────

const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here)); else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};
const ast = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });
const walkDir = (d) => readdirSync(join(ROOT, d)).flatMap((n) => { const p = `${d}/${n}`; return statSync(join(ROOT, p)).isDirectory() ? walkDir(p) : (/\.(jsx?|mjs)$/.test(n) ? [p] : []); });
const resolveImport = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const base = resolve(ROOT, dirname(from), spec);
    for (const c of [base, `${base}.jsx`, `${base}.js`, `${base}/index.jsx`, `${base}/index.js`]) if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c).replace(/\\/g, '/');
    return null;
};
// The tabs, and every component under src/components they import, transitively.
const scanned = () => {
    const tabs = walkDir('src/Tabs');
    const seen = new Set(tabs);
    const queue = [...tabs];
    while (queue.length) {
        const f = queue.shift();
        for (const n of ast(read(f)).program.body) if (n.type === 'ImportDeclaration') {
            const r = resolveImport(f, n.source.value);
            if (r && r.startsWith('src/components/') && !seen.has(r)) { seen.add(r); queue.push(r); }
        }
    }
    return [...seen];
};
const fixedClasses = () => {
    const out = new Set();
    for (const m of read('src/index.css').matchAll(/([^{}]+)\{([^}]*)\}/g)) if (/position:\s*fixed/.test(m[2])) for (const c of m[1].matchAll(/\.([a-zA-Z0-9_-]+)/g)) out.add(c[1]);
    return out;
};
const strs = (n) => {
    if (!n) return [];
    if (n.type === 'StringLiteral') return [n.value];
    if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return [n.quasis[0].value.cooked];
    if (n.type === 'ConditionalExpression') return [...strs(n.consequent), ...strs(n.alternate)];
    if (n.type === 'LogicalExpression') return [...strs(n.left), ...strs(n.right)];
    return [];
};
const keyOf = (p) => p.key && (p.key.name || p.key.value);
const OUTSIDE = ['mousedown', 'click', 'pointerdown', 'touchstart'];
const isOutsideListener = (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'addEventListener'
    && n.callee.object.type === 'Identifier' && ['document', 'window'].includes(n.callee.object.name) && n.arguments[0] && OUTSIDE.includes(n.arguments[0].value);
const topName = (top) => {
    const d = top.type === 'ExportNamedDeclaration' || top.type === 'ExportDefaultDeclaration' ? top.declaration : top;
    if (!d) return null;
    if (d.type === 'FunctionDeclaration') return d.id ? d.id.name : '(default)';
    if (d.type === 'VariableDeclaration') return d.declarations.map((x) => x.id.name).join(',');
    return null;
};

// Every layer-shaped hit in one file's source: a fixed position (a literal, a ternary, a computed
// style object), a portal, a class index.css draws fixed, a floating absolute box (a position, a
// z and a shadow), an outside-click listener — or a call to a hook that installs one.
export const layerHits = (file, src, classes, hooks = new Set()) => {
    const tree = ast(src);
    const lines = src.split('\n');
    const out = [];
    for (const top of tree.program.body) {
        const name = topName(top);
        walk(top, (n) => {
            let kind = null;
            if (n.type === 'ObjectExpression') {
                const props = n.properties.filter((p) => p.type === 'ObjectProperty');
                const pos = props.find((p) => keyOf(p) === 'position');
                const v = pos ? strs(pos.value) : [];
                if (v.includes('fixed')) kind = 'fixed';
                else if (v.includes('absolute') && props.some((p) => keyOf(p) === 'zIndex') && props.some((p) => keyOf(p) === 'boxShadow')) kind = 'absolute';
            } else if (n.type === 'CallExpression') {
                const c = n.callee;
                const callee = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.property ? c.property.name : null;
                if (callee === 'createPortal') kind = 'portal';
                else if (isOutsideListener(n)) kind = 'outside';
                else if (c.type === 'Identifier' && hooks.has(callee)) kind = 'hook';
            } else if (n.type === 'JSXAttribute' && n.name.name === 'className') {
                const v = strs(n.value && n.value.type === 'JSXExpressionContainer' ? n.value.expression : n.value);
                if (v.some((s) => s.split(/\s+/).some((cl) => classes.has(cl)))) kind = 'class';
            }
            if (kind) {
                const ln = src.slice(0, n.start).split('\n').length;
                // A line that only opens a block ("<div style={{") is told apart by the line after it.
                let text = lines[ln - 1].trim();
                if (/[({]$/.test(text) && lines[ln] !== undefined) text += ` ${lines[ln].trim()}`;
                out.push({ file, decl: name || '(module)', kind, text });
            }
        });
    }
    return out;
};
// The top-level hooks that install an outside-click listener (useRowMenu): a call to one is a hit.
const outsideHooks = (files) => {
    const out = new Set();
    for (const f of files) for (const top of ast(read(f)).program.body) {
        const name = topName(top);
        if (!name || !/^use[A-Z]/.test(name)) continue;
        let has = false;
        walk(top, (n) => { if (isOutsideListener(n)) has = true; });
        if (has) out.add(name);
    }
    return out;
};
// Whether a top-level declaration takes its Escape in the order: useLocalLayer, a hook that calls it (useRowMenu —
// §0.232), or an app layer's useEscapeLayer held by the order (tests/escape-order.test.mjs owns those).
const registers = (src, layerHooks = new Set()) => {
    const out = new Map();
    const viaHook = layerHooks.size ? new RegExp(`\\b(${[...layerHooks].join('|')})\\(`) : null;
    for (const top of ast(src).program.body) {
        const name = topName(top);
        if (!name) continue;
        const body = src.slice(top.start, top.end);
        out.set(name, /useLocalLayer\(/.test(body) || (!!viaHook && viaHook.test(body)) || (/useEscapeLayer\(/.test(body) && /escapeBlocked\('/.test(body)));
    }
    return out;
};
// The top-level hooks that register a layer themselves — a call to one registers (useRowMenu).
const layerHooksIn = (files) => {
    const out = new Set();
    for (const f of files) {
        const src = read(f);
        for (const top of ast(src).program.body) {
            const name = topName(top);
            if (name && /^use[A-Z]/.test(name) && name !== 'useLocalLayer' && /useLocalLayer\(/.test(src.slice(top.start, top.end))) out.add(name);
        }
    }
    return out;
};
// Frames, not layers (§0.232): each window drawn in one registers and hands it its close — so the frame's own fixed
// box passes, and every component that renders the frame must register.
const FRAMES = [
    { file: 'src/Tabs/settings/integrations/shared.jsx', decl: 'IntModal' },
    { file: 'src/Tabs/settings/data/shared.jsx', decl: 'DataModal' },
];

// A listener whose layer registers in another component of the file.
const SERVES = [
    { file: 'src/Tabs/ContactsTab.jsx', decl: 'ContactsTab', text: "document.addEventListener('mousedown', close);", layer: 'RowActionMenu (the list view\'s row menu): the close on an outside click lives with the list' },
    { file: 'src/Tabs/ContactsTab.jsx', decl: 'CompanyTwoPane', text: "document.addEventListener('mousedown', close);", layer: 'RowActionMenu (the Company view\'s row menu)' },
    { file: 'src/Tabs/ReportsTab.jsx', decl: 'EntitySelector', text: "<div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:3, zIndex:200, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, boxShadow:'0 8px 24px rgba(42,38,34,0.12)', overflow:'hidden', maxHeight:260, display:'flex', flexDirection:'column' }}>", layer: 'ActivityHistoryTab registers the account and contact pickers it draws (accOpen, conOpen)' },
];
// Hits that are not a layer over the page.
const NOT_A_LAYER = [
    { file: 'src/Tabs/DispatchTab.jsx', decl: 'TimelineBlock', text: "<div onClick={onClick} style={{ position: 'absolute', left, top, width, height,", why: 'a job\'s block on the dispatch timeline — placed absolute in its lane, a shadow on hover' },
    { file: 'src/Tabs/DispatchTab.jsx', decl: 'DispatchTab', text: "<div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',", why: 'the "No techs configured" notice — no control, nothing to close' },
    { file: 'src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx', decl: 'TplLibCard', text: "style={{ position:'absolute', top:8, right:8,", why: 'the card\'s hover Edit button, placed in its corner' },
    { file: 'src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx', decl: 'TplLibCard', text: "<div style={{ position:'absolute', top:28, right:0, zIndex:10,", why: 'the lock icon\'s tooltip — pointerEvents none, shown on hover' },
];
// Later batches of this work (docs/design/escape-tabs/DESIGN.md §4): each hit by its file, its
// component and its line's text, and the batch that registers it. Each batch strikes its own.
const KNOWN = [
    { batch: 4, file: "src/components/documents/atoms.jsx", decl: "PeopleChooser", text: "<div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 3, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, maxHeight: 200, overflowY: 'auto', zIndex: 5, boxShadow: '0 4px 12px rgba(42,38,34,0.12)' }}>" },
];

const matches = (h, e) => h.file === e.file && h.decl === e.decl && h.text === e.text;
// The components that draw a window in a frame and take no Escape (§0.232).
const unframed = (files, reg, readFile = read) => {
    const out = [];
    for (const f of files) {
        const src = readFile(f);
        for (const top of ast(src).program.body) {
            const name = topName(top);
            const body = src.slice(top.start, top.end);
            for (const fr of FRAMES) if (new RegExp(`<${fr.decl}[\\s>]`).test(body) && !reg.get(f).get(name)) out.push(`${f} [${name}] draws <${fr.decl}> and takes no Escape`);
        }
    }
    return out;
};
// Each name, checked against the hits: it matches exactly its count (n, else one). A layer added
// beside a named one — the same text in the same component — is a second hit, and fails it.
// The KNOWN entries whose component now registers — struck in the batch that registers it (§0.231).
const toStrike = (known, reg) => known.filter((e) => reg.get(e.file) && reg.get(e.file).get(e.decl)).map((e) => `${e.file} [${e.decl}] ${e.text}`);
const namedMismatches = (hits, named) => named
    .map((e) => ({ e, got: hits.filter((h) => matches(h, e)).length }))
    .filter(({ e, got }) => got !== (e.n || 1))
    .map(({ e, got }) => `${e.file} [${e.decl}] ${e.text} — ${got} hit(s), named for ${e.n || 1}`);

test('THE GUARD: every layer under the tabs takes its Escape in the order, or is named — a later batch, a listener serving one, or not a layer', () => {
    const files = scanned();
    assert.ok(files.length > 60, `the walk sees the tabs (${files.length})`);
    assert.ok(files.includes('src/components/ui/TimeDropdown.jsx'), 'and follows their imports (the time picker)');
    const classes = fixedClasses();
    assert.ok(classes.has('modal-overlay') && classes.has('lead-form-modal'), 'the classes index.css draws fixed, media queries too');
    const hooks = outsideHooks(files);
    assert.ok(hooks.has('useRowMenu'), 'a hook that installs an outside-click listener');
    const hits = files.flatMap((f) => layerHits(f, read(f), classes, hooks));
    const layerHooks = layerHooksIn(files);
    assert.ok(layerHooks.has('useRowMenu'), 'a hook that registers its menu (§0.232)');
    const reg = new Map(files.map((f) => [f, registers(read(f), layerHooks)]));
    const named = [...SERVES, ...NOT_A_LAYER, ...KNOWN];
    const frame = (h) => FRAMES.some((fr) => fr.file === h.file && fr.decl === h.decl);
    const loose = hits.filter((h) => !named.some((e) => matches(h, e)) && !frame(h) && !reg.get(h.file).get(h.decl));
    assert.deepEqual(loose.map((h) => `${h.file} [${h.decl}] ${h.kind}: ${h.text}`), [], 'a layer with no Escape in the order: give it useLocalLayer, or name it with its reason');
    assert.deepEqual(namedMismatches(hits, named), [], 'a name that no longer matches its layers, or one that now matches more');
    for (const e of KNOWN) assert.ok([4].includes(e.batch), `${e.file}: its batch (batch 2, Dispatch, landed in §0.231; batch 3, Settings, in §0.232)`);
    // Every component that draws a window in a frame registers it (§0.232).
    for (const fr of FRAMES) assert.ok(hits.some((h) => frame(h) && h.decl === fr.decl), `${fr.decl}: still a frame with a fixed box`);
    assert.deepEqual(unframed(files, reg), [], 'a window in a frame registers itself');
    // A later batch's layer that now registers is struck from KNOWN in that batch (§0.231): left, it would hide the next
    // layer added beside it under its name.
    assert.deepEqual(toStrike(KNOWN, reg), [], 'a KNOWN layer whose component registers: strike it');
    for (const e of SERVES) assert.ok(reg.get(e.file).get(e.layer.split(' ')[0]) || /registers/.test(e.layer), `${e.file}: the layer it serves registers`);
});

test('THE GUARD: a popover draws at its place\'s z and outside the tabs; a tab\'s layer is drawn in the tab; useLocalLayer only at a component\'s top level', () => {
    const files = scanned();
    for (const f of files) {
        const src = read(f);
        const tree = ast(src);
        for (const top of tree.program.body) {
            const body = src.slice(top.start, top.end);
            const name = topName(top);
            if (!/useLocalLayer\(/.test(body)) continue;
            const popover = /useLocalLayer\([^;]*place: 'tabPopover'/.test(body);
            // A layer standing at an app place (Settings' own leave guard, §0.232) is portaled to where that place draws.
            const appPlace = /useLocalLayer\([^;]*place: '(?!tabPopover|tabLayer)\w+'/.test(body);
            if (appPlace) {
                assert.ok(/createPortal\(/.test(body), `${f} [${name}]: a layer at an app place is portaled out of the tab`);
            } else if (popover) {
                assert.ok(/createPortal\(/.test(body), `${f} [${name}]: a popover is portaled out of the tab`);
                assert.ok(/zIndex: ?12000\b/.test(body), `${f} [${name}]: at its place's 12000`);
            } else {
                assert.ok(!/createPortal\(/.test(body), `${f} [${name}]: a tab's layer is drawn in the tab, where its place puts it`);
            }
        }
        // Every call at the top level of a module-scope component: one defined inside another is a
        // new type each render, and would register again on every App render.
        walk(tree, (n, anc) => {
            if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'useLocalLayer') return;
            const fns = anc.filter((a) => /Function/.test(a.type));
            assert.equal(fns.length, 1, `${f}: useLocalLayer called inside a component defined in another, or in a nested function`);
        });
    }
});

test('THE GUARD: inside a layer that takes its Escape in the order, no control acts on an Escape the layer already took', () => {
    for (const f of scanned()) {
        const src = read(f);
        for (const top of ast(src).program.body) {
            const body = src.slice(top.start, top.end);
            if (!/useLocalLayer\(/.test(body)) continue;
            walk(top, (n) => {
                if (n.type !== 'JSXAttribute' || n.name.name !== 'onKeyDown' || !n.value) return;
                const code = src.slice(n.value.start, n.value.end);
                if (code.includes("'Escape'")) assert.ok(code.includes('defaultPrevented'), `${f} [${topName(top)}]: an onKeyDown Escape that does not leave a marked one — the layer took it, and this ran after: two closes on one keypress`);
            });
        }
    }
});

test('the guard finds the shapes as they were: a fixed layer, a ternary, a computed style, a CSS class, a floating box, a listener and a hook — and a layer unregistered', () => {
    const classes = new Set(['modal-overlay']);
    const src = [
        "function A() { return <div style={{ position: 'fixed', inset: 0 }} />; }",
        "function B() { return <div style={{ position: isMobile ? 'fixed' : 'absolute' }} />; }",
        "function C() { const s = rect ? { position: 'fixed', top: 1 } : null; return <div style={s} />; }",
        'function D() { return <div className="modal-overlay" />; }',
        "function E() { return <div style={{ position: 'absolute', zIndex: 300, boxShadow: '0 1px 2px #000' }} />; }",
        "function F() { useEffect(() => { document.addEventListener('mousedown', h); }, []); return null; }",
        'function G() { useRowMenu(); return null; }',
        "function H() { return createPortal(<div />, document.body); }",
        "function I() { return <div style={{ position: 'absolute', top: 0 }} />; }",
    ].join('\n');
    const hits = layerHits('x.jsx', src, classes, new Set(['useRowMenu']));
    assert.deepEqual(hits.map((h) => `${h.decl}:${h.kind}`), ['A:fixed', 'B:fixed', 'C:fixed', 'D:class', 'E:absolute', 'F:outside', 'G:hook', 'H:portal'], 'I — a plain absolute box — is not a layer');
    const reg = registers(src + "\nfunction J() { useLocalLayer(open, { onClose }); return <div style={{ position: 'fixed' }} />; }");
    assert.equal(reg.get('A'), false, 'A has no Escape in the order');
    assert.equal(reg.get('J'), true);
    // And the tree as it was: the Sub-accounts drawer's own listener, no useLocalLayer.
    const before = "function SubAccountDrawer({ onClose }) { React.useEffect(() => { const handler = e => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); }; window.addEventListener('keydown', handler); }, [onClose]); return <div style={{ position: 'fixed', inset: 0, zIndex: 290 }} />; }";
    assert.equal(registers(before).get('SubAccountDrawer'), false);
    // A named entry holds its count both ways: a second layer of the same text beside it, or one gone.
    const one = { file: 'x.jsx', decl: 'A', text: 't' };
    const hit = { file: 'x.jsx', decl: 'A', kind: 'fixed', text: 't' };
    assert.deepEqual(namedMismatches([hit], [one]), []);
    assert.equal(namedMismatches([hit, hit], [one]).length, 1, 'a layer added beside a named one fails');
    assert.equal(namedMismatches([], [one]).length, 1, 'a named layer gone fails');
    assert.deepEqual(namedMismatches([hit, hit], [{ ...one, n: 2 }]), [], 'n: 2 names both');
    // A window in a frame registers, or is named (§0.232); a hook that registers counts as registering.
    const framed = 'function Good() { const c = useLocalLayer(true, { onClose }); return <IntModal onClose={c} />; }\nfunction Bad() { return <DataModal onClose={onClose} />; }';
    assert.deepEqual(unframed(['y.jsx'], new Map([['y.jsx', registers(framed)]]), () => framed), ['y.jsx [Bad] draws <DataModal> and takes no Escape']);
    assert.equal(registers('function P() { useRowMenu(); return null; }', new Set(['useRowMenu'])).get('P'), true);
    assert.equal(registers('function P() { useRowMenu(); return null; }').get('P'), false);
    // A KNOWN entry whose component registers is struck; one whose component does not stays.
    const reg2 = new Map([['x.jsx', new Map([['A', true], ['B', false]])]]);
    assert.deepEqual(toStrike([{ ...one, batch: 3 }, { file: 'x.jsx', decl: 'B', text: 'u', batch: 3 }], reg2), ['x.jsx [A] t']);
});
