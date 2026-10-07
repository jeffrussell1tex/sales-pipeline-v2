// tests/layer-boundary.test.mjs
//
// A crash in ModalLayer's rails and modals or in the quick log keeps the page; a crash
// nothing else catches shows a page and a Reload (state §0.184 — §0.183's found (a);
// Jeff: "Add the boundary").
//
// Before: ModalLayer — the rails, modals and app dialogs it holds — and the quick log sat
// outside every ErrorBoundary (each tab has its own), and nothing wrapped the root: a
// render error there reached the root and React unmounted the whole app, a blank page
// (§0.183: a stale module's "useState is not defined" in the document rail ran
// DocumentRail → ModalLayer → App with no boundary between).
//
// THE GUARD: wherever App mounts a host named in LAYER_HOSTS, it sits inside a
// LayerBoundary, and the root inside a RootBoundary outside Clerk's provider. The list
// is named, not found: the layers App renders itself — the meeting prep panel, the leave
// guard, the header's panels — are not in it (state §9, §0.184's found (b)). A boundary
// is a class component React drives (react-dom/server does not run them), so its parts
// are pinned here and the crash itself is proved in the pane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

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
const nameOf = (el) => el.openingElement.name.name;
// Each JSX element of the given names in a file, with the names of the elements around it.
const mounts = (src, names) => {
    const out = [];
    walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n, anc) => {
        if (n.type === 'JSXElement' && names.includes(nameOf(n))) {
            out.push({ name: nameOf(n), around: anc.filter((a) => a.type === 'JSXElement').map(nameOf) });
        }
    });
    return out;
};

// The layer hosts the guard names: ModalLayer, which holds the rails, modals and app
// dialogs, and the quick log's button and panel.
const LAYER_HOSTS = ['ModalLayer', 'QuickLogFab'];

test('THE GUARD: each named layer host App mounts sits inside a LayerBoundary', () => {
    const found = mounts(read('src/App.jsx'), LAYER_HOSTS);
    assert.deepEqual(found.map((m) => m.name).sort(), [...LAYER_HOSTS].sort(), 'each host, once');
    for (const m of found) assert.ok(m.around.includes('LayerBoundary'), `${m.name} is outside every LayerBoundary: a crash in it takes the page`);
});

test('the guard finds the shape as it was', () => {
    const was = 'function App() { return (<div><ErrorBoundary tabName="Home"><HomeTab /></ErrorBoundary><ModalLayer key={a} /><QuickLogFab /></div>); }';
    assert.deepEqual(mounts(was, LAYER_HOSTS).filter((m) => !m.around.includes('LayerBoundary')).map((m) => m.name), ['ModalLayer', 'QuickLogFab']);
});

test('a crash in a layer closes every layer — the modal state put back, as on an org switch — and the quick log\'s its panel', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes("<LayerBoundary key={activeOrgId || 'no-org'} onCrash={modalState.resetOnOrgSwitch}>\n        <ModalLayer key={activeOrgId || 'no-org'} />\n        </LayerBoundary>"),
        'the rails and modals: every one closed, so the state that crashed is not rendered again — and a switch starts the boundary afresh');
    assert.ok(app.includes('<LayerBoundary onCrash={() => setQuickLogOpen(false)}>\n        <QuickLogFab />\n        </LayerBoundary>'));
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
    const [app] = mounts(main, ['App']);
    assert.ok(app, 'App is mounted');
    assert.deepEqual(app.around.slice(app.around.indexOf('RootBoundary')), ['RootBoundary', 'ClerkProvider'], 'the root boundary holds Clerk\'s provider, which holds App');
    const r = read('src/components/RootBoundary.jsx');
    assert.ok(r.includes('static getDerivedStateFromError(error) {\n        return { error };'));
    assert.ok(r.includes('if (!this.state.error) return this.props.children;'));
    assert.ok(r.includes('<button onClick={() => window.location.reload()}'), 'Reload');
});
