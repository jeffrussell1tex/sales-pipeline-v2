// tests/escape-order.test.mjs
//
// Every app layer closes on Escape, the one on top and only that one (state §0.186 —
// §0.185's found (a), and the class it belongs to; Jeff: "fix the escape one too", then
// "App-level 12 now").
//
// Before: twelve layers had no Escape at all — the meeting prep panel, the three import
// windows, the two merge reviews, the SPIFF claim, the blocked-delete notice, both task
// reminders, the quick log and its follow-up, and the leave guard — though the shortcuts
// list says "Esc — Close modal or popover". Each now takes its own Escape (useEscapeLayer:
// document, capture phase, before every rail's listener and App's) and passes it on while
// a layer above it is open: ESCAPE_ORDER, the app's layers top first by the z-index each
// draws, and App's openLayers say which are open.
//
// THE GUARD: every layer ModalLayer, the quick log and App render has a place in the order
// and an Escape — App's handler names it, or its own listener takes it, or it takes it
// through useEscapeLayer with its own place — and every place in the order is a layer that
// exists. The order is z order, and each z is the one its file draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { ESCAPE_ORDER, layersAbove } from '../src/utils/escapeOrder.js';
import { takeEscape } from '../src/utils/escapeLayer.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const NAMES = ESCAPE_ORDER.map(([n]) => n);
const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here));
        else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};

// ── the decision, run ───────────────────────────────────────────────────────

test('layersAbove: a layer passes the Escape on while one above it is open, and only then', () => {
    for (const name of NAMES) assert.equal(layersAbove(name, {}), false, `${name}: nothing open, the Escape is its own`);
    assert.equal(layersAbove('meetingPrep', { quickLog: true }), true, 'the quick log sits above the meeting prep panel');
    assert.equal(layersAbove('meetingPrep', { merge: true, search: true }), false, 'the merge review and the search sit below it');
    assert.equal(layersAbove('duePopup', { contactRail: true }), true, 'a rail sits above the reminders');
    assert.equal(layersAbove('duePopup', { draggable: true, shortcuts: true }), false, 'the deal modal and the shortcuts sit below them');
    assert.equal(layersAbove('draggable', { reminderPopup: true }), true, 'a reminder is drawn over the import windows');
    assert.equal(layersAbove('leaveGuard', { confirm: true }), true, 'the app\'s dialogs sit above every layer (§18b70.4)');
    assert.equal(layersAbove('leaveGuard', { documentRail: true, taskRail: true }), false, 'the leave guard sits above the rails');
    assert.equal(layersAbove('coachingNote', { confirm: true, blockedDelete: true }), false, 'nothing sits above the top');
    assert.throws(() => layersAbove('nope', {}), /no layer named nope/);
});

test('one Escape, one layer: the meeting prep panel under the quick log stays; the next Escape closes it', () => {
    const open = { quickLog: true, meetingPrep: true };
    const closed = [];
    const press = () => {
        const e = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        // Both listen on document in the capture phase, in the order they mounted — the
        // meeting prep panel's first, as it opened first.
        takeEscape(e, layersAbove('meetingPrep', open), () => { closed.push('meetingPrep'); open.meetingPrep = false; });
        takeEscape(e, layersAbove('quickLog', open), () => { closed.push('quickLog'); open.quickLog = false; });
    };
    press();
    assert.deepEqual(closed, ['quickLog'], 'the quick log, on top, alone — the panel under it passed the Escape on');
    press();
    assert.deepEqual(closed, ['quickLog', 'meetingPrep']);
});

// ── the order ───────────────────────────────────────────────────────────────

test('the order is z order, highest first, each name once', () => {
    assert.equal(new Set(NAMES).size, NAMES.length);
    for (let i = 1; i < ESCAPE_ORDER.length; i++) {
        assert.ok(ESCAPE_ORDER[i - 1][1] >= ESCAPE_ORDER[i][1], `${ESCAPE_ORDER[i - 1][0]} (${ESCAPE_ORDER[i - 1][1]}) above ${ESCAPE_ORDER[i][0]} (${ESCAPE_ORDER[i][1]})`);
    }
});

// Where each layer draws its z — the order's number must be the file's.
const zOf = {
    coachingNote: () => /\.modal-overlay \{[^}]*z-index: (\d+);/.exec(read('src/index.css'))[1],
    blockedDelete: () => /blockedDeleteModal && \(\s*<div style=\{\{[^}]*?zIndex: (\d+)/.exec(read('src/components/layout/ModalLayer.jsx'))[1],
    prompt: () => /\.modal-overlay \{[^}]*z-index: (\d+);/.exec(read('src/index.css'))[1],
    confirm: () => /\.modal-overlay \{[^}]*z-index: (\d+);/.exec(read('src/index.css'))[1],
    followUp: () => /followUpPrompt && \(\s*<div style=\{\{[^}]*?zIndex: (\d+)/.exec(read('src/components/layout/QuickLogFab.jsx'))[1],
    leaveGuard: () => /zIndex:(\d+)/.exec(read('src/Tabs/settings/shared/LeaveGuardModal.jsx'))[1],
    linkPicker: () => maxZ('src/components/documents/DocumentLinkPicker.jsx'),
    uploadRail: () => maxZ('src/components/documents/DocumentUploadRail.jsx'),
    documentRail: () => maxZ('src/components/documents/DocumentRail.jsx'),
    activityDetail: () => maxZ('src/components/modals/ActivityDetailDialog.jsx'),
    taskRail: () => maxZ('src/components/rails/TaskRail.jsx'),
    activityRail: () => maxZ('src/components/rails/ActivityRail.jsx'),
    accountRail: () => maxZ('src/components/rails/AccountRail.jsx'),
    contactRail: () => maxZ('src/components/rails/ContactRail.jsx'),
    spiffClaim: () => /showSpiffClaimModal && spiffClaimContext && \(\(\) => \{[\s\S]*?zIndex: ?(\d+)/.exec(read('src/components/layout/ModalLayer.jsx'))[1],
    duePopup: () => /taskDuePopup && \(\s*<div style=\{\{[^}]*?zIndex: (\d+)/.exec(read('src/components/layout/ModalLayer.jsx'))[1],
    reminderPopup: () => /taskReminderPopup && \(\s*<div style=\{\{[^}]*?zIndex: (\d+)/.exec(read('src/components/layout/ModalLayer.jsx'))[1],
    draggable: () => /const \[zIndex, setZIndex\]\s+= useState\((\d+)\);/.exec(read('src/hooks/useDraggable.js'))[1],
    shortcuts: () => /showShortcuts && \(\s*<div onClick=\{\(\) => setShowShortcuts\(false\)\} style=\{\{[^}]*?zIndex: (\d+)/.exec(read('src/components/layout/ModalLayer.jsx'))[1],
    quickLog: () => /quickLogOpen && \(\s*<div style=\{\{ position: 'fixed', top: '4\.5rem'[^}]*?zIndex: (\d+)/.exec(read('src/components/layout/QuickLogFab.jsx'))[1],
    meetingPrep: () => maxZ('src/components/layout/MeetingPrepPanel.jsx'),
    leadModal: () => /zIndex:(\d+)/.exec(read('src/components/modals/LeadModal.jsx'))[1],
    merge: () => maxZ('src/components/modals/MergeReviewModal.jsx'),
    search: () => /showSearchResults && \([\s\S]*?zIndex: (\d+)/.exec(read('src/components/layout/AppHeader.jsx'))[1],
    profile: () => /showProfilePanel && \([\s\S]*?zIndex: (\d+)/.exec(read('src/components/layout/AppHeader.jsx'))[1],
    notifications: () => /showNotifications && \([\s\S]*?zIndex: (\d+)/.exec(read('src/components/layout/AppHeader.jsx'))[1],
    notes: () => /notesPopover && \(\(\) => \{[\s\S]*?zIndex: (\d+)/.exec(read('src/components/layout/ModalLayer.jsx'))[1],
};
function maxZ(file) { return String(Math.max(...[...read(file).matchAll(/zIndex: ?(\d+)/g)].map((m) => Number(m[1])))); }

test('each layer\'s z in the order is the one its file draws', () => {
    assert.deepEqual(Object.keys(zOf).sort(), [...NAMES].sort(), 'every name read from its file');
    for (const [name, z] of ESCAPE_ORDER) assert.equal(Number(zOf[name]()), z, `${name} draws at ${zOf[name]()}`);
    assert.ok(read('src/components/modals/CoachingNoteDialog.jsx').includes('<div className="modal-overlay"'), 'the coaching note draws on .modal-overlay');
    assert.equal(maxZ('src/components/modals/ContactMergeReviewModal.jsx'), maxZ('src/components/modals/MergeReviewModal.jsx'), 'both merge reviews at one z');
});

// What App reads for each layer being open — the flag it is drawn on.
const OPEN_AS = {
    coachingNote: '!!coachingNoteModal', blockedDelete: '!!blockedDeleteModal', prompt: '!!promptModal', confirm: '!!confirmModal',
    followUp: '!!followUpPrompt', leaveGuard: 'showNavGuard',
    linkPicker: 'showDocLinkPicker', uploadRail: 'showUploadRail', documentRail: '!!documentRailId',
    activityDetail: '!!viewingActivity', taskRail: '!!taskRailId', activityRail: '!!showActivityModal',
    accountRail: '!!accountRailId', contactRail: '!!contactRailId',
    spiffClaim: '!!(showSpiffClaimModal && spiffClaimContext)', duePopup: '!!taskDuePopup', reminderPopup: '!!taskReminderPopup',
    draggable: '!!(showModal || showUserModal || lostReasonModal || showCsvImportModal || showOutlookImportModal || showLeadImportModal)',
    shortcuts: 'showShortcuts', quickLog: 'quickLogOpen', meetingPrep: '!!(meetingPrepOpen && meetingPrepEvent)',
    leadModal: 'showLeadModal', merge: '!!(mergeModal || contactMergeModal)',
    search: 'showSearchResults', profile: 'showProfilePanel', notifications: 'showNotifications', notes: '!!notesPopover',
};

test('App says which layers are open, by every name in the order and no other, each by the flag it is drawn on', () => {
    const app = read('src/App.jsx');
    const block = between(app, '    const openLayers = {', '\n    };');
    const keys = [...block.matchAll(/(\w+): /g)].map((m) => m[1]);
    assert.deepEqual([...keys].sort(), [...NAMES].sort());
    assert.deepEqual(Object.keys(OPEN_AS).sort(), [...NAMES].sort());
    for (const [name, flag] of Object.entries(OPEN_AS)) {
        assert.ok(new RegExp(`\\b${name}: ${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\n]`).test(block + '\n'), `${name} is open when ${flag}`);
    }
    assert.ok(app.includes('    const escapeBlocked = (name) => layersAbove(name, openLayers);'));
    assert.ok(between(app, '    const appContextValue = {', '\n    };').includes('        escapeBlocked,'), 'handed to every layer');
});

// ── THE GUARD ───────────────────────────────────────────────────────────────

// Each layer the app renders: its place in the order, and how its Escape is taken.
//   app: the flag App's Escape handler closes; own: the file whose listener takes it;
//   layer: the file that takes it through useEscapeLayer with its own place.
const LAYERS = {
    // ModalLayer
    showModal: { name: 'draggable', app: 'showModal' },
    showUserModal: { name: 'draggable', app: 'showUserModal' },
    showShortcuts: { name: 'shortcuts', app: 'showShortcuts' },
    undoToast: { name: null, app: 'undoToast' },   // a toast, not a layer over the page: App closes it last
    notesPopover: { name: 'notes', app: 'notesPopover' },
    showCsvImportModal: { name: 'draggable', layer: 'src/components/modals/CsvImportModal.jsx' },
    showOutlookImportModal: { name: 'draggable', layer: 'src/components/modals/OutlookImportModal.jsx' },
    showLeadModal: { name: 'leadModal', own: 'src/components/modals/LeadModal.jsx' },
    showLeadImportModal: { name: 'draggable', layer: 'src/components/modals/LeadImportModal.jsx' },
    lostReasonModal: { name: 'draggable', own: 'src/components/modals/LostReasonModal.jsx' },
    confirmModal: { name: 'confirm', app: 'confirmModal' },
    promptModal: { name: 'prompt', app: 'promptModal' },
    blockedDeleteModal: { name: 'blockedDelete', layer: 'src/components/layout/ModalLayer.jsx' },
    taskReminderPopup: { name: 'reminderPopup', layer: 'src/components/layout/ModalLayer.jsx' },
    taskDuePopup: { name: 'duePopup', layer: 'src/components/layout/ModalLayer.jsx' },
    showSpiffClaimModal: { name: 'spiffClaim', layer: 'src/components/layout/ModalLayer.jsx' },
    ActivityRail: { name: 'activityRail', own: 'src/components/rails/ActivityRail.jsx' },
    TaskRail: { name: 'taskRail', own: 'src/components/rails/TaskRail.jsx' },
    ContactRail: { name: 'contactRail', own: 'src/components/rails/ContactRail.jsx' },
    AccountRail: { name: 'accountRail', own: 'src/components/rails/AccountRail.jsx' },
    DocumentRail: { name: 'documentRail', own: 'src/components/documents/DocumentRail.jsx' },
    DocumentUploadRail: { name: 'uploadRail', own: 'src/components/documents/DocumentUploadRail.jsx' },
    DocumentLinkPicker: { name: 'linkPicker', own: 'src/components/documents/DocumentLinkPicker.jsx' },
    MergeReviewModal: { name: 'merge', layer: 'src/components/modals/MergeReviewModal.jsx' },
    ContactMergeReviewModal: { name: 'merge', layer: 'src/components/modals/ContactMergeReviewModal.jsx' },
    CoachingNoteDialogHost: { name: 'coachingNote', app: 'coachingNoteModal' },
    ActivityDetailDialogHost: { name: 'activityDetail', app: 'viewingActivity' },
    // the quick log
    quickLogOpen: { name: 'quickLog', layer: 'src/components/layout/QuickLogFab.jsx' },
    followUpPrompt: { name: 'followUp', layer: 'src/components/layout/QuickLogFab.jsx' },
    // App — the header's panels, the meeting prep panel, the leave guard
    showSearchResults: { name: 'search', app: 'showSearchResults' },
    showProfilePanel: { name: 'profile', app: 'showProfilePanel' },
    showNotifications: { name: 'notifications', app: 'showNotifications' },
    MeetingPrepPanel: { name: 'meetingPrep', layer: 'src/components/layout/MeetingPrepPanel.jsx' },
    LeaveGuardModal: { name: 'leaveGuard', layer: 'src/Tabs/settings/shared/LeaveGuardModal.jsx' },
};

// The layers a component renders at the top of what it returns: a condition's first
// name, or an element always rendered.
const layersIn = (file, component) => {
    const src = read(file);
    let ret = null;
    walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n, anc) => {
        if (!ret && n.type === 'ReturnStatement' && n.argument && (n.argument.type === 'JSXFragment' || n.argument.type === 'JSXElement')
            && anc.some((a) => (a.type === 'FunctionDeclaration' && a.id && a.id.name === component))) ret = n.argument;
    });
    assert.ok(ret, `${component} returns markup`);
    const first = (e) => (e.type === 'LogicalExpression' ? first(e.left) : e.type === 'Identifier' ? e.name : null);
    const out = [];
    for (const c of ret.children) {
        if (c.type === 'JSXElement') out.push(c.openingElement.name.name);
        else if (c.type === 'JSXExpressionContainer' && c.expression.type === 'LogicalExpression') out.push(first(c.expression));
    }
    return out;
};

test('THE GUARD: every layer the app renders has a place in the order and an Escape; every place is a layer that exists', () => {
    const rendered = [
        ...layersIn('src/components/layout/ModalLayer.jsx', 'ModalLayer'),
        ...layersIn('src/components/layout/QuickLogFab.jsx', 'QuickLogFab'),
        'showSearchResults', 'showProfilePanel', 'showNotifications',   // the header's panels (AppHeader; App's Escape)
        'MeetingPrepPanel', 'LeaveGuardModal',
    ];
    const unknown = rendered.filter((k) => !(k in LAYERS));
    assert.deepEqual(unknown, [], 'a new layer: give it an Escape and a place in ESCAPE_ORDER, then a row here');
    assert.deepEqual([...new Set(Object.keys(LAYERS))].filter((k) => !rendered.includes(k)), [], 'a row for a layer no longer rendered');
    const app = read('src/App.jsx');
    const appEscape = between(app, "            if (e.key === 'Escape') {", '\n                return;\n            }');
    for (const [key, how] of Object.entries(LAYERS)) {
        if (how.name) assert.ok(NAMES.includes(how.name), `${key}: ${how.name} is in the order`);
        if (how.app) assert.ok(appEscape.includes(`if (${how.app})`), `${key}: App's Escape closes it`);
        if (how.own) assert.ok(/'Escape'|useEscapeLayer\(/.test(read(how.own)), `${key}: its own listener takes the Escape`);
        if (how.layer) assert.ok(read(how.layer).includes(`escapeBlocked('${how.name}')`), `${key}: it takes the Escape, passing it on while a layer above ${how.name} is open`);
    }
    const named = new Set(Object.values(LAYERS).map((h) => h.name).filter(Boolean));
    assert.deepEqual(NAMES.filter((n) => !named.has(n)), [], 'a place in the order no layer holds');
});

test('the guard finds the shape as it was: a layer with no Escape and no place', () => {
    const src = 'export default function QuickLogFab() { return (<>{quickLogOpen && (<div />)}{somethingNew && (<div />)}<Fresh /></>); }';
    let ret = null;
    walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n) => { if (!ret && n.type === 'ReturnStatement') ret = n.argument; });
    const keys = ret.children.map((c) => (c.type === 'JSXElement' ? c.openingElement.name.name : c.expression.left.name));
    assert.deepEqual(keys.filter((k) => !(k in LAYERS)), ['somethingNew', 'Fresh']);
});

// ── what each new Escape does ───────────────────────────────────────────────

test('each new Escape does what the layer\'s own close does, and nothing mid-save', () => {
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.ok(ml.includes("    useEscapeLayer(!!blockedDeleteModal, () => setBlockedDeleteModal(null), escapeBlocked('blockedDelete'));"), 'the notice closes');
    assert.ok(ml.includes("    useEscapeLayer(!!(showSpiffClaimModal && spiffClaimContext), () => { if (!spiffClaimBusy) closeClaimModal(); }, escapeBlocked('spiffClaim'));"), 'a claim being submitted stays');
    assert.ok(ml.includes("    useEscapeLayer(!!taskDuePopup, dismissDueAlert, escapeBlocked('duePopup'));"), 'the due reminder is dismissed, the next one shows');
    assert.ok(ml.includes("    useEscapeLayer(!!taskReminderPopup, () => setTaskReminderPopup(null), escapeBlocked('reminderPopup'));"));
    assert.equal(ml.split('onClick={dismissDueAlert}').length - 1, 2, 'the backdrop and Dismiss: one dismissal, the Escape\'s');
    assert.equal(ml.split('const closeClaimModal = () =>').length - 1, 1, 'one close for the claim, the Escape\'s and the buttons\'');
    const ql = read('src/components/layout/QuickLogFab.jsx');
    assert.ok(ql.includes("    useEscapeLayer(quickLogOpen, () => setQuickLogOpen(false), escapeBlocked('quickLog'));"), 'the panel closes as its backdrop does, the draft kept');
    assert.ok(ql.includes("    useEscapeLayer(!!followUpPrompt, () => setFollowUpPrompt(null), escapeBlocked('followUp'));"));
    assert.ok(read('src/components/layout/MeetingPrepPanel.jsx').includes("    useEscapeLayer(!!(meetingPrepOpen && meetingPrepEvent), () => { setMeetingPrepOpen(false); setMeetingPrepOppId(null); }, escapeBlocked('meetingPrep'));"));
    const lg = read('src/Tabs/settings/shared/LeaveGuardModal.jsx');
    assert.ok(lg.includes("    useEscapeLayer(true, () => { if (!saving) onStay(); }, app && app.escapeBlocked ? app.escapeBlocked('leaveGuard') : false);"), 'Stay — never while a save is out');
    for (const f of ['src/components/modals/CsvImportModal.jsx', 'src/components/modals/LeadImportModal.jsx']) {
        assert.ok(read(f).includes("    useEscapeLayer(true, () => { if (!importing) onClose(); }, escapeBlocked('draggable'));"), `${f}: never mid-import`);
    }
    assert.ok(read('src/components/modals/OutlookImportModal.jsx').includes("    useEscapeLayer(true, onClose, escapeBlocked('draggable'));"), 'its import is one call');
    assert.ok(read('src/components/modals/MergeReviewModal.jsx').includes("    useEscapeLayer(!!mergeModal, () => { if (!mergeSaving) { setMergeError?.(null); setMergeModal(null); } }, escapeBlocked('merge'));"), 'never mid-merge');
    assert.ok(read('src/components/modals/ContactMergeReviewModal.jsx').includes("    useEscapeLayer(!!contactMergeModal, () => { if (!mergeSaving) { setMergeError?.(null); setContactMergeModal(null); } }, escapeBlocked('merge'));"));
});
