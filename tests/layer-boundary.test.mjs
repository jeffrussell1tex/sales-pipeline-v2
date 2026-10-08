// tests/layer-boundary.test.mjs
//
// A crash in a layer keeps the page; a crash nothing else catches shows a page and a
// Reload (state §0.184 — §0.183's found (a); Jeff: "Add the boundary"). Every layer App
// renders sits inside a boundary, and a crash keeps what the reminders remember (state
// §0.185 — §0.184's found (a) and (b); Jeff: "fix both a and b").
//
// Before §0.184: ModalLayer — the rails, modals and app dialogs it holds — and the quick
// log sat outside every ErrorBoundary (each tab has its own), and nothing wrapped the
// root: a render error there reached the root and React unmounted the whole app, a blank
// page (§0.183: a stale module's "useState is not defined" in the document rail ran
// DocumentRail → ModalLayer → App with no boundary between).
//
// Before §0.185: the header with its panels, the leave guard and the meeting prep panel
// sat outside a LayerBoundary — the meeting prep panel worked out and drawn in App's own
// render, where a boundary around it could not catch what throws — so a crash there
// reached the root's Reload. And ModalLayer's boundary closed the layers with the org
// switch's reset, which put back what the reminders remember: every reminder dismissed
// or snoozed came back, with its chime.
//
// THE GUARD finds the layers, not a list of them: a parse of App's render reads every
// element outside the tabs' ErrorBoundaries and the LayerBoundaries. A component there
// is the frame (the context provider, a fragment, a boundary) or a layer outside its
// boundary; an element drawn position: 'fixed' there is a layer App draws itself; and a
// function App's render calls inside a LayerBoundary works markup out in App's render,
// where the boundary cannot catch what throws. A boundary is a class component React
// drives (react-dom/server does not run one), so its parts are pinned here and the crash
// itself is proved in the pane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useModalState } from '../src/hooks/useModalState.js';
import { undeclaredIn } from '../scripts/fnscope.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
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
const nameOf = (el) => {
    const n = el.openingElement.name;
    return n.type === 'JSXMemberExpression' ? `${n.object.name}.${n.property.name}` : n.name;
};
const isComponent = (name) => /^[A-Z]/.test(name);
const BOUNDARIES = ['ErrorBoundary', 'LayerBoundary'];
// What App renders outside a boundary that is not a layer: the app's context and a
// fragment. The header bar's own elements, the nav and the banner are App's elements; a
// crash in them reaches the root's Reload (RootBoundary).
const FRAME = ['AppProvider', 'React.Fragment', ...BOUNDARIES];
const attr = (el, name) => el.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name);
const drawnFixed = (el) => {
    const style = attr(el, 'style');
    const obj = style && style.value && style.value.type === 'JSXExpressionContainer' && style.value.expression;
    return !!obj && obj.type === 'ObjectExpression' && obj.properties.some((p) => p.type === 'ObjectProperty'
        && (p.key.name || p.key.value) === 'position' && p.value.type === 'StringLiteral' && p.value.value === 'fixed');
};

// Every way App's render can take the page with it — what THE GUARD refuses.
const layersOutside = (src) => {
    const renders = [];
    walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n, anc) => {
        if (n.type === 'ReturnStatement' && n.argument && n.argument.type === 'JSXElement' && nameOf(n.argument) === 'AppProvider'
            && anc.some((a) => a.type === 'FunctionDeclaration' && a.id && a.id.name === 'App')) renders.push(n.argument);
    });
    assert.equal(renders.length, 1, 'App renders its page once');
    const out = [];
    walk(renders[0], (n, anc) => {
        const inside = (names) => anc.some((a) => a.type === 'JSXElement' && names.includes(nameOf(a)));
        // A function App's render calls runs in App's render, above every boundary — one a
        // LayerBoundary seems to hold, it cannot catch. (The TASKS badge's count, in the
        // nav, is the frame's: a crash there is the root's.)
        if (n.type === 'CallExpression' && (n.callee.type === 'ArrowFunctionExpression' || n.callee.type === 'FunctionExpression')
            && inside(['LayerBoundary'])) {
            out.push('markup worked out in a function App\'s render calls, inside a LayerBoundary that cannot catch it');
        }
        if (n.type !== 'JSXElement') return;
        const name = nameOf(n);
        if (name === 'LayerBoundary' && !attr(n, 'onCrash')) out.push('a LayerBoundary that closes nothing');
        if (inside(BOUNDARIES)) return;
        if (isComponent(name) && !FRAME.includes(name)) out.push(`${name} outside a boundary`);
        if (!isComponent(name) && drawnFixed(n)) out.push(`a fixed <${name}> App draws itself`);
    });
    return out;
};

test('THE GUARD: App renders no layer outside a LayerBoundary — every component outside a boundary is the frame, nothing outside one is drawn fixed, and no boundary holds markup worked out in a function App\'s render calls', () => {
    assert.deepEqual(layersOutside(read('src/App.jsx')), []);
});

test('the guard finds the shapes as they were — §0.184\'s and §0.183\'s', () => {
    const was184 = `function App() { return (
        <AppProvider value={v}>
        <div className="app-container">
            <AppHeader globalSearch={s} />
            {dbOffline && (<div style={{ background: 'red' }}>offline</div>)}
            <nav className="nav-tabs"><button style={{ position: 'relative' }}>TASKS</button></nav>
            <React.Fragment key={k}>{tab === 'home' && (<ErrorBoundary tabName="Home"><HomeTab /></ErrorBoundary>)}</React.Fragment>
            {open && ev && (() => { const e = ev; return (<><div onClick={close} style={{ position: 'fixed', inset: 0 }} /><div style={{ position: 'fixed', top: 0 }}>{e.summary}</div></>); })()}
        </div>
        <LayerBoundary key={k} onCrash={reset}><ModalLayer key={k} /></LayerBoundary>
        <LayerBoundary onCrash={() => setQuickLogOpen(false)}><QuickLogFab /></LayerBoundary>
        {showNavGuard && (<LeaveGuardModal onStay={stay} />)}
        </AppProvider>); }`;
    assert.deepEqual(layersOutside(was184).sort(), [
        'AppHeader outside a boundary',
        'LeaveGuardModal outside a boundary',
        'a fixed <div> App draws itself',
        'a fixed <div> App draws itself',
    ].sort());
    // The fix that only looks like one: the panel's function, as it was, inside a boundary.
    const wrappedAsItWas = `function App() { return (
        <AppProvider value={v}>
            <LayerBoundary onCrash={close}>{open && ev && (() => { const e = ev; return (<div style={{ position: 'fixed', top: 0 }}>{e.end.dateTime}</div>); })()}</LayerBoundary>
        </AppProvider>); }`;
    assert.deepEqual(layersOutside(wrappedAsItWas), ['markup worked out in a function App\'s render calls, inside a LayerBoundary that cannot catch it']);
    const was183 = 'function App() { return (<AppProvider value={v}><div><ErrorBoundary tabName="Home"><HomeTab /></ErrorBoundary></div><ModalLayer key={k} /><QuickLogFab /><LayerBoundary><Other /></LayerBoundary></AppProvider>); }';
    assert.deepEqual(layersOutside(was183).sort(),
        ['ModalLayer outside a boundary', 'QuickLogFab outside a boundary', 'a LayerBoundary that closes nothing'].sort());
});

test('each boundary closes what it holds — every layer, the reminders\' memory kept; the header\'s panels; the meeting prep panel; the quick log; the leave guard (Stay)', () => {
    const app = read('src/App.jsx');
    for (const [block, what] of [
        ["<LayerBoundary key={activeOrgId || 'no-org'} onCrash={closeLayersAfterCrash}>\n        <ModalLayer key={activeOrgId || 'no-org'} />\n        </LayerBoundary>",
            'the rails and modals: every one closed, so the state that crashed is not rendered again — and a switch starts the boundary afresh'],
        ["<LayerBoundary onCrash={() => { setGlobalSearch(''); setShowSearchResults(false); setShowNotifications(false); setShowProfilePanel(false); }}>\n            <AppHeader\n",
            'the header: its panels closed, the search emptied'],
        ['<LayerBoundary onCrash={() => { setMeetingPrepOpen(false); setMeetingPrepOppId(null); }}>\n        <MeetingPrepPanel />\n        </LayerBoundary>',
            'the meeting prep panel: closed, its deal let go'],
        ['<LayerBoundary onCrash={() => setQuickLogOpen(false)}>\n        <QuickLogFab />\n        </LayerBoundary>',
            'the quick log: its panel closed'],
        ['<LayerBoundary onCrash={navGuardCancel}>\n            {showNavGuard && (',
            'the leave guard: Stay — the page and its unsaved changes kept, the guard closed'],
    ]) assert.ok(app.includes(block), what);
});

test('a crash keeps what the reminders remember: the boundary closes the layers alone, and the due-task reminder open at the crash counts as seen', () => {
    const fn = between(read('src/App.jsx'), '    const closeLayersAfterCrash = () => {', '\n    };');
    assert.ok(fn.includes('if (taskDuePopup) setDismissedDueTodayAlerts(prev => prev.includes(taskDuePopup.id) ? prev : [...prev, taskDuePopup.id]);'),
        'the reminder open at the crash may be what crashed — the checker would open it again');
    assert.ok(fn.includes('modalState.closeLayers();'), 'the layers alone');
    assert.ok(!fn.includes('resetOnOrgSwitch'), 'not the switch\'s reset — it puts back the alerts dismissed and snoozed, and the checker brings every one back');
});

test('useModalState, run: a crash\'s closeLayers closes every layer and keeps what the reminders remember; a switch puts back both', () => {
    const seen = [];
    let step = 0;
    function Probe() {
        const m = useModalState();
        seen.push({
            rail: m.contactRailId, due: m.taskDuePopup && m.taskDuePopup.id, queued: m.taskDueQueue.length,
            dismissed: m.dismissedDueTodayAlerts, snoozed: Object.keys(m.snoozedDueAlerts), fired: m.dismissedReminders,
        });
        if (step === 0) {
            step = 1;   // a rail open, a due-task reminder up with one queued; one dismissed, one snoozed, one fired
            m.setContactRailId('ctc_qa_1'); m.setTaskDuePopup({ id: 'tsk_due' }); m.setTaskDueQueue([{ id: 'tsk_next' }]);
            m.setDismissedDueTodayAlerts(['tsk_dismissed']); m.setSnoozedDueAlerts({ tsk_snoozed: 1 }); m.setDismissedReminders(['tsk_fired']);
        } else if (step === 1) { step = 2; m.closeLayers(); }          // a crash in a layer
        else if (step === 2) { step = 3; m.resetOnOrgSwitch(); }       // an org switch
        return null;
    }
    renderToString(createElement(Probe));
    const remembered = { dismissed: ['tsk_dismissed'], snoozed: ['tsk_snoozed'], fired: ['tsk_fired'] };
    const nothing = { dismissed: [], snoozed: [], fired: [] };
    assert.deepEqual(seen, [
        { rail: null, due: null, queued: 0, ...nothing },
        { rail: 'ctc_qa_1', due: 'tsk_due', queued: 1, ...remembered },
        { rail: null, due: null, queued: 0, ...remembered },
        { rail: null, due: null, queued: 0, ...nothing },
    ], 'the crash closes the rail and the reminder and keeps what was dismissed, snoozed and fired; the switch puts back both');
});

test('the meeting prep panel is a component of its own — it reads only what it binds, draws nothing when closed, and takes what it shows from the app\'s context', () => {
    const src = read('src/components/layout/MeetingPrepPanel.jsx');
    assert.deepEqual(undeclaredIn(src, { file: 'MeetingPrepPanel.jsx' }).map((f) => `${f.name}:${f.line}`), [],
        'every name it reads is bound — the context, a local, an import or a standard global (it was cut out of App)');
    assert.ok(src.includes('    if (!meetingPrepOpen || !meetingPrepEvent) return null;'), 'nothing drawn when closed');
    assert.ok(src.includes('    } = useApp();'), 'what it shows, from the app\'s context');
    assert.ok(read('src/App.jsx').includes("import MeetingPrepPanel from './components/layout/MeetingPrepPanel';"));
});

test('the boundary: what crashed is replaced by what happened, every layer closed, and Dismiss brings the layers back', () => {
    const b = read('src/components/LayerBoundary.jsx');
    assert.ok(b.includes('static getDerivedStateFromError(error) {\n        return { error };'));
    const caught = between(b, 'componentDidCatch(error, info) {', '\n    }');
    assert.ok(caught.includes('if (this.props.onCrash) this.props.onCrash();'), 'the layers closed');
    assert.ok(b.includes('if (!this.state.error) return this.props.children;'));
    assert.ok(b.includes("That panel hit an error and was closed."));
    assert.ok(b.includes('<button onClick={() => this.setState({ error: null })}'), 'Dismiss');
});

test('the root: a crash nothing else catches shows a page and a Reload, outside Clerk\'s provider', () => {
    const main = read('src/main.jsx');
    let around = null;
    walk(parse(main, { sourceType: 'module', plugins: ['jsx'] }), (n, anc) => {
        if (n.type === 'JSXElement' && nameOf(n) === 'App') around = anc.filter((a) => a.type === 'JSXElement').map(nameOf);
    });
    assert.ok(around, 'App is mounted');
    assert.deepEqual(around.slice(around.indexOf('RootBoundary')), ['RootBoundary', 'ClerkProvider'], 'the root boundary holds Clerk\'s provider, which holds App');
    const r = read('src/components/RootBoundary.jsx');
    assert.ok(r.includes('static getDerivedStateFromError(error) {\n        return { error };'));
    assert.ok(r.includes('if (!this.state.error) return this.props.children;'));
    assert.ok(r.includes('<button onClick={() => window.location.reload()}'), 'Reload');
});
