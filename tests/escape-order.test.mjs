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
//
// And the order is what the page shows (state §0.187): .app-container is a stacking context
// at z-index 1, so a layer drawn inside it sits under every layer drawn outside it, whatever
// its own z — the meeting prep panel, drawn there, opened under the rail its Prep was
// pressed in. A parse of App's render says which layers are drawn inside: the header's
// panels, last in the order, and no other.
//
// And every layer decides by the order (state §0.189): App's handler closes the layer on
// top (topLayer) when it is App's and leaves the Escape to it when it is not; a layer's own
// listener asks escapeBlocked('<its name>') and marks the Escape it takes. Before, App closed
// from a list of its own, and the rails, the lead and lost-reason windows and the document
// layers each kept a list of what sat above them: one Escape could close the lower of two
// layers, or both. THE GUARD runs every pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { ESCAPE_ORDER, layersAbove, topLayer } from '../src/utils/escapeOrder.js';
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
    assert.equal(layersAbove('meetingPrep', { contactRail: true, accountRail: true, draggable: true, quickLog: true }), false,
        'the meeting prep panel opens over the rails and the deal window its Prep is pressed in (§0.187)');
    assert.equal(layersAbove('meetingPrep', { documentRail: true }), true, 'a document opened over it');
    assert.equal(layersAbove('contactRail', { meetingPrep: true }), true, 'the rail under it waits');
    assert.equal(layersAbove('duePopup', { contactRail: true }), true, 'a rail sits above the reminders');
    assert.equal(layersAbove('duePopup', { draggable: true, shortcuts: true }), false, 'the deal modal and the shortcuts sit below them');
    assert.equal(layersAbove('draggable', { reminderPopup: true }), true, 'a reminder is drawn over the import windows');
    assert.equal(layersAbove('leaveGuard', { confirm: true }), true, 'the app\'s dialogs sit above every layer (§18b70.4)');
    assert.equal(layersAbove('leaveGuard', { documentRail: true, taskRail: true }), false, 'the leave guard sits above the rails');
    assert.equal(layersAbove('coachingNote', { confirm: true, blockedDelete: true }), false, 'nothing sits above the top');
    assert.equal(layersAbove('search', { notes: true }), true, 'the notes popover draws over the header\'s panels, whatever their z (§0.187)');
    assert.throws(() => layersAbove('nope', {}), /no layer named nope/);
});

test('topLayer: the first open layer, top first — null when nothing is drawn over the page (state §0.189)', () => {
    assert.equal(topLayer({}), null);
    for (const name of NAMES) assert.equal(topLayer({ [name]: true }), name);
    assert.equal(topLayer({ notifications: true, search: true }), 'search', 'the search results draw over the notifications');
    assert.equal(topLayer({ profile: true, notes: true, coachingNote: true }), 'coachingNote', 'the coaching note over the notes popover, over the profile');
    assert.equal(topLayer({ shortcuts: true, taskRail: true, draggable: true }), 'taskRail', 'a rail over the deal window, over the shortcuts');
    assert.equal(topLayer({ notes: false, search: 0, profile: true }), 'profile', 'a closed layer is not on top');
});

test('one Escape, one layer: the meeting prep panel over the rail its Prep was pressed in closes alone; the next Escape closes the rail', () => {
    const open = { contactRail: true, meetingPrep: true };
    const closed = [];
    const press = () => {
        const e = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        // The panel listens on document in the capture phase while it is open; the rail on
        // document in the bubble phase, leaving a marked Escape alone (§18b74).
        if (open.meetingPrep) takeEscape(e, layersAbove('meetingPrep', open), () => { closed.push('meetingPrep'); open.meetingPrep = false; });
        if (open.contactRail && e.key === 'Escape' && !e.defaultPrevented) { closed.push('contactRail'); open.contactRail = false; }
    };
    press();
    assert.deepEqual(closed, ['meetingPrep'], 'the panel, on top, alone — the rail under it left the marked Escape');
    press();
    assert.deepEqual(closed, ['meetingPrep', 'contactRail']);
});

// ── the order ───────────────────────────────────────────────────────────────

// The layers drawn inside .app-container: the header's (THE GUARD below reads it from App's
// render). They sit in its stacking context, under every layer outside it (§0.187).
const IN_APP_CONTAINER = ['search', 'profile', 'notifications'];

test('the order is z order, highest first, each name once — the layers inside .app-container last, under every layer outside it', () => {
    assert.equal(new Set(NAMES).size, NAMES.length);
    const rank = ([n, z]) => [IN_APP_CONTAINER.includes(n) ? 0 : 1, z];
    for (let i = 1; i < ESCAPE_ORDER.length; i++) {
        const [a, b] = [rank(ESCAPE_ORDER[i - 1]), rank(ESCAPE_ORDER[i])];
        assert.ok(a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]), `${ESCAPE_ORDER[i - 1][0]} (${ESCAPE_ORDER[i - 1][1]}) above ${ESCAPE_ORDER[i][0]} (${ESCAPE_ORDER[i][1]})`);
    }
});

// The component that draws each layer; ModalLayer draws the rest.
const DRAWN_BY = {
    search: 'AppHeader', profile: 'AppHeader', notifications: 'AppHeader',
    quickLog: 'QuickLogFab', followUp: 'QuickLogFab', meetingPrep: 'MeetingPrepPanel', leaveGuard: 'LeaveGuardModal',
};
const drawnBy = (name) => DRAWN_BY[name] || 'ModalLayer';

// Each component App's render draws a layer with, and whether it is drawn inside .app-container.
const DRAWERS = new Set(NAMES.map(drawnBy));
const appComponents = (src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const app = ast.program.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'App');
    assert.ok(app, 'App');
    const where = new Map();
    walk(app, (n, anc) => {
        if (n.type !== 'JSXElement' || n.openingElement.name.type !== 'JSXIdentifier' || !DRAWERS.has(n.openingElement.name.name)) return;
        const inside = anc.some((a) => a.type === 'JSXElement' && a.openingElement.attributes.some((at) =>
            at.type === 'JSXAttribute' && at.name.name === 'className' && at.value && at.value.type === 'StringLiteral' && at.value.value.split(/\s+/).includes('app-container')));
        const name = n.openingElement.name.name;
        assert.ok(!where.has(name) || where.get(name) === inside, `${name} drawn both inside .app-container and outside it`);
        where.set(name, inside);
    });
    return where;
};
const insideNames = (src) => {
    const where = appComponents(src);
    for (const c of DRAWERS) assert.ok(where.has(c), `App draws ${c}`);
    return NAMES.filter((n) => where.get(drawnBy(n)));
};

test('THE GUARD: the layers drawn inside .app-container — a stacking context at z-index 1 — are the header\'s panels, and the order puts them under every other (§0.187)', () => {
    assert.ok(/\n\s*\.app-container \{[^}]*position: relative;[^}]*z-index: 1;/.test(read('src/index.css')), 'the container is a stacking context at 1');
    assert.deepEqual(insideNames(read('src/App.jsx')), IN_APP_CONTAINER, 'a layer that must sit over a rail is drawn outside .app-container');
    assert.deepEqual(NAMES.slice(-IN_APP_CONTAINER.length), IN_APP_CONTAINER, 'last in the order');
});

test('the guard finds the shape as it was: the meeting prep panel drawn inside .app-container', () => {
    const src = 'function App() { return (<AppProvider><div className="app-container"><AppHeader /><MeetingPrepPanel /></div>'
        + '<ModalLayer /><QuickLogFab /><LeaveGuardModal /></AppProvider>); }';
    assert.deepEqual(insideNames(src), ['meetingPrep', 'search', 'profile', 'notifications']);
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
//   app: the flag App's Escape handler closes, when the layer is on top; own: the file whose
//   listener (document, bubble) takes it; layer: the file that takes it through
//   useEscapeLayer (document, capture). Each decides by the order (state §0.189).
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
    lostReasonModal: { name: 'draggable', layer: 'src/components/modals/LostReasonModal.jsx' },
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
    DocumentRail: { name: 'documentRail', layer: 'src/components/documents/DocumentRail.jsx' },
    DocumentUploadRail: { name: 'uploadRail', layer: 'src/components/documents/DocumentUploadRail.jsx' },
    DocumentLinkPicker: { name: 'linkPicker', layer: 'src/components/documents/DocumentLinkPicker.jsx' },
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

// What holds each useEscapeLayer in a file — its third argument, as written.
const escapeLayerHolds = (src) => {
    const out = [];
    walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n) => {
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'useEscapeLayer') {
            out.push(n.arguments[2] ? src.slice(n.arguments[2].start, n.arguments[2].end) : '(none)');
        }
    });
    return out;
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
        if (how.app) {
            // A layer of its own place is closed by its case; the deal and user windows share
            // the draggable case; the undo toast is not a layer (§0.189).
            const closes = how.name && how.name !== 'draggable' ? `case '${how.name}': ` : `if (${how.app})`;
            assert.ok(appEscape.includes(closes), `${key}: App's Escape closes it — ${closes}`);
        }
        if (how.own) assert.ok(/'Escape'|useEscapeLayer\(/.test(read(how.own)), `${key}: its own listener takes the Escape`);
        if (how.layer) {
            assert.ok(read(how.layer).includes(`escapeBlocked('${how.name}')`), `${key}: it takes the Escape, passing it on while a layer above ${how.name} is open`);
            for (const held of escapeLayerHolds(read(how.layer))) assert.ok(held.includes('escapeBlocked('), `${key}: every useEscapeLayer in ${how.layer} is held by the order, not a list — ${held}`);
        }
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
    assert.deepEqual(escapeLayerHolds("function L() { useEscapeLayer(open, close, !!(confirmModal || promptModal)); useEscapeLayer(open, close); }"),
        ['!!(confirmModal || promptModal)', '(none)'], 'a hold the guard refuses: a list, or nothing');
});

// ── every layer decides by the order (state §0.189) ─────────────────────────

test('App\'s Escape closes the layer on top when it is App\'s, and leaves the Escape to it when it is not', () => {
    const app = read('src/App.jsx');
    const appEscape = between(app, "            if (e.key === 'Escape') {", '\n                return;\n            }');
    const marked = appEscape.indexOf('                if (e.defaultPrevented) return;');
    const decided = appEscape.indexOf('                switch (topLayer(openLayersRef.current || {})) {');
    assert.ok(marked > 0 && decided > marked, 'a marked Escape is left alone; then the layer on top, by the order');
    const cases = [...between(appEscape, 'switch (topLayer(', '\n                }').matchAll(/case '(\w+)':/g)].map((m) => m[1]);
    const appNames = [...new Set(Object.values(LAYERS).filter((h) => h.app && h.name).map((h) => h.name))];
    assert.deepEqual([...cases].sort(), [...appNames].sort(), 'a case for each of App\'s layers, and for no other');
    assert.ok(appEscape.includes('                    case null: break;   // nothing is drawn over the page'), 'nothing on top: the toast and the stray flags');
    assert.ok(appEscape.includes('                    default: return;    // the layer on top takes its own Escape'), 'a layer that takes its own: App leaves it');
    assert.ok(appEscape.includes('                        if (showUserModal) { setShowUserModal(false); setEditingUser(null); return; }\n                        return;'), 'a draggable that takes its own — an import, the lost reason: App leaves it, the toast too');
    assert.ok(appEscape.indexOf('if (undoToast)') > appEscape.indexOf('default: return;'), 'the undo toast once nothing is drawn over the page');
    for (const flag of ['showAccountModal', 'showContactModal', 'showTaskModal', 'showActivityModal', 'taskRailId']) {
        assert.ok(!between(appEscape, 'switch (topLayer(', '\n                }').includes(flag), `${flag}: not a layer App closes`);
    }
    assert.ok(!appEscape.includes('if (taskRailId)') && !appEscape.includes('if (showActivityModal)'), 'the task and activity rails take their own: App closed them too — the task rail while it kept its draft');
    assert.ok(app.includes('    const openLayersRef = useRef(null);'));
    const assigned = app.indexOf('    openLayersRef.current = openLayers;');
    assert.ok(assigned > app.indexOf('    const openLayers = {') && assigned < app.indexOf('    if (!clerkLoaded || !orgLoaded) {'), 'the open layers handed over every render, before the early returns');
});

test('THE GUARD: a layer\'s own listener decides by the order — escapeBlocked(its name), never a list of its own — and marks the Escape it takes', () => {
    const own = Object.entries(LAYERS).filter(([, h]) => h.own);
    assert.deepEqual(own.map(([k]) => k).sort(), ['AccountRail', 'ActivityRail', 'ContactRail', 'TaskRail', 'showLeadModal']);
    for (const [key, how] of own) {
        const src = read(how.own);
        const held = `    const escapeHeld = escapeBlocked('${how.name}');`;
        assert.equal(src.split(held).length - 1, 1, `${key}: held while a layer above ${how.name} is open`);
        const at = src.indexOf("if (e.key !== 'Escape' || e.defaultPrevented || escapeHeld) return;", src.indexOf(held));
        assert.ok(at > 0, `${key}: its listener leaves a marked or held Escape`);
        const body = src.slice(at, src.indexOf('addEventListener', at));
        assert.ok(/\n\s*e\.preventDefault\(\);/.test(body), `${key}: it marks the Escape it takes`);
        assert.ok(!/\b(confirmModal|promptModal|viewingActivity|showDocLinkPicker|showUploadRail)\b/.test(body), `${key}: no list of its own`);
        const deps = src.slice(at).match(/\}, \[([^\]]*)\]\);/);
        assert.ok(deps && /\bescapeHeld\b/.test(deps[1]), `${key}: its listener reads the hold of the render it was made in`);
    }
    // The rails keep a draft: editing, the Escape is the rail's and the rail stays.
    for (const f of ['ContactRail', 'AccountRail', 'TaskRail']) {
        assert.ok(read(`src/components/rails/${f}.jsx`).includes('            e.preventDefault();\n            if (!isEditing) closeRail();'), `${f}: marked, editing or not`);
    }
    // The header's search box closes the results itself — while nothing is open above them.
    assert.ok(read('src/components/layout/AppHeader.jsx').includes("onKeyDown={e => { if (e.key === 'Escape' && !escapeBlocked('search')) { e.preventDefault(); setShowSearchResults(false); setGlobalSearch(''); } }}"));
});

// A keypress, as the page meets it: each open layer's listener by how it takes its Escape —
// layer: document, capture; own: document, bubble; App: window, last — in the order given.
const press = (open, kinds, order = Object.keys(open)) => {
    const closed = [];
    const e = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    const names = order.filter((n) => open[n]);
    for (const n of names.filter((x) => kinds[x] === 'layer')) takeEscape(e, layersAbove(n, open), () => closed.push(n));
    for (const n of names.filter((x) => kinds[x] === 'own')) {
        if (e.key !== 'Escape' || e.defaultPrevented || layersAbove(n, open)) continue;
        e.preventDefault();
        closed.push(n);
    }
    if (!e.defaultPrevented) {
        const top = topLayer(open);
        if (top && kinds[top] === 'app') closed.push(top);
    }
    return closed;
};
// How each place's layers take their Escape, from THE GUARD's table.
const KINDS = {};
for (const how of Object.values(LAYERS)) {
    if (how.name) (KINDS[how.name] ||= new Set()).add(how.app ? 'app' : how.own ? 'own' : 'layer');
}

test('THE GUARD: of any two layers open, one Escape closes the upper and only it — however each takes its Escape, whichever listener was added first', () => {
    assert.deepEqual(Object.keys(KINDS).sort(), [...NAMES].sort(), 'every place, its kinds');
    let runs = 0;
    for (let i = 0; i < NAMES.length; i++) {
        for (let j = i + 1; j < NAMES.length; j++) {
            const [upper, lower] = [NAMES[i], NAMES[j]];
            for (const ku of KINDS[upper]) {
                for (const kl of KINDS[lower]) {
                    const open = { [upper]: true, [lower]: true };
                    const kinds = { [upper]: ku, [lower]: kl };
                    for (const order of [[upper, lower], [lower, upper]]) {
                        assert.deepEqual(press(open, kinds, order), [upper], `${upper} (${ku}) over ${lower} (${kl})`);
                        runs += 1;
                    }
                }
            }
        }
    }
    assert.ok(runs >= NAMES.length * (NAMES.length - 1), `every pair, both orders (${runs})`);
    // The next Escape closes the lower.
    assert.deepEqual(press({ contactRail: false, shortcuts: true }, { contactRail: 'own', shortcuts: 'app' }), ['shortcuts']);
});

test('a rail that keeps its draft keeps the Escape: nothing under it closes', () => {
    const e = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    const open = { taskRail: true, shortcuts: true };
    // The rail's listener, editing: the Escape is its own — marked — and the rail stays.
    if (!(e.defaultPrevented || layersAbove('taskRail', open))) e.preventDefault();
    assert.equal(e.defaultPrevented, true);
    assert.equal(topLayer(open), 'taskRail', 'and were it unmarked, App would leave it to the rail on top');
});

test('the guard finds the shape as it was (HEAD before §0.189): App\'s own list, and a rail\'s unmarked Escape', () => {
    // App closed the first of its own list that was open; a rail closed on any Escape the
    // viewer and the app's dialogs did not hold, and left it unmarked.
    const OLD_APP = ['confirm', 'prompt', 'activityDetail', 'shortcuts', 'activityRail', 'draggable', 'taskRail', 'profile', 'coachingNote', 'notes', 'notifications', 'search'];
    const pressAsItWas = (open) => {
        const closed = [];
        if (open.contactRail && !open.activityDetail && !open.confirm && !open.prompt) closed.push('contactRail');
        const first = OLD_APP.find((n) => open[n]);
        if (first) closed.push(first);
        return closed;
    };
    assert.deepEqual(pressAsItWas({ contactRail: true, shortcuts: true }), ['contactRail', 'shortcuts'], 'two layers, one Escape');
    assert.deepEqual(pressAsItWas({ search: true, notifications: true }), ['notifications'], 'the lower of two');
    assert.deepEqual(pressAsItWas({ coachingNote: true, profile: true }), ['profile'], 'the profile under the coaching note');
    assert.deepEqual(pressAsItWas({ coachingNote: true, contactRail: true }), ['contactRail', 'coachingNote'], 'a rail under the coaching note');
    assert.deepEqual(press({ contactRail: true, shortcuts: true }, { contactRail: 'own', shortcuts: 'app' }), ['contactRail']);
    assert.deepEqual(press({ search: true, notifications: true }, { search: 'app', notifications: 'app' }), ['search']);
    assert.deepEqual(press({ coachingNote: true, profile: true }, { coachingNote: 'app', profile: 'app' }), ['coachingNote']);
    assert.deepEqual(press({ coachingNote: true, contactRail: true }, { coachingNote: 'app', contactRail: 'own' }), ['coachingNote']);
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
