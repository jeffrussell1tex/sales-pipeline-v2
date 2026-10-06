// tests/hook-deps.test.mjs
//
// The data hooks read App's helpers when they run (state §0.176). App hands
// useOpportunities, useAccounts, useContacts, useTasks and useActivities a deps
// object whose getters read refs App fills in its render — AFTER the hooks have
// run in that render. A value a hook copied at its top was therefore the render
// before's, and null on a mount's first render:
//   - the deals load ran with getQuarter null on a remount with Clerk already
//     loaded (Vite's Fast Refresh): "getQuarter is not a function" and no deals
//     until the next load (observed in §0.174's red checks; state §9);
//   - the contact delete check read the deals of the render before — a deal saved
//     in the last render did not block it;
//   - softDelete read the toast of the render before, so a second delete within
//     five seconds left the first one's timer running, and it cleared the second
//     toast — and its Undo — early (read from code).
// A hook may copy at its top only a helper whose effect does not depend on the
// render it came from; anything else is read from deps when it is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod|ClassMethod)$/.test(n.type);

// What a hook may copy from deps at its top, and why it is the same from any render.
const RENDER_SAFE = {
    addAudit: 'the server names the caller from the token and ignores the body\'s names (audit-log.mjs)',
    showConfirm: 'sets the confirm dialog\'s state — a setter call, the same every render',
    showBlockedDelete: 'sets the blocked-delete dialog\'s state — a setter call',
    setUndoToast: 'a state setter',
    softDelete: 'its timer clears only the toast it put up (App.jsx, below)',
};

// The deps names each hook reads while it renders: a destructure of deps, or a
// deps.X read, outside any function the hook defines.
const renderReads = (file) => {
    const src = read(file);
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const out = [];
    for (const st of ast.program.body) {
        const fn = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
        if (!fn || fn.type !== 'FunctionDeclaration' || !/^use[A-Z]/.test(fn.id?.name || '')) continue;
        const param = fn.params[0];
        if (!param || param.type !== 'Identifier' || param.name !== 'deps') continue;
        const visit = (node) => {
            if (!node || typeof node.type !== 'string' || isFn(node)) return;   // a function the hook defines runs later
            if (node.type === 'VariableDeclarator' && node.init?.type === 'Identifier' && node.init.name === 'deps' && node.id.type === 'ObjectPattern') {
                for (const p of node.id.properties) out.push({ hook: fn.id.name, name: p.key?.name ?? '...rest', line: node.loc.start.line });
            }
            if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === 'deps') {
                out.push({ hook: fn.id.name, name: node.computed ? '[computed]' : node.property.name, line: node.loc.start.line });
            }
            for (const k of Object.keys(node)) {
                if (k === 'loc') continue;
                const v = node[k];
                if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
            }
        };
        fn.body.body.forEach(visit);
    }
    return out;
};

const HOOK_FILES = readdirSync(new URL('src/hooks/', ROOT)).filter((f) => f.endsWith('.js')).map((f) => `src/hooks/${f}`);

test('the five data hooks take deps — the scan below reaches them', () => {
    for (const h of ['useOpportunities', 'useAccounts', 'useContacts', 'useTasks', 'useActivities']) {
        assert.ok(read(`src/hooks/${h}.js`).includes(`export function ${h}(deps) {`), h);
    }
});

test('THE GUARD — a hook copies from deps at its top only a helper that is the same from any render', () => {
    const bad = HOOK_FILES.flatMap(renderReads).filter((r) => !(r.name in RENDER_SAFE));
    assert.deepEqual(bad.map((r) => `${r.hook}:${r.line} ${r.name}`), []);
});

test('the deals load reads getQuarter when its answer lands', () => {
    const src = read('src/hooks/useOpportunities.js');
    assert.ok(src.includes('    const { addAudit, showConfirm, softDelete, setUndoToast } = deps;'), 'the hook\'s top copies no quarter helper');
    const load = src.slice(src.indexOf('const loadOpportunities = (setDbOffline) => {'), src.indexOf(".catch(err => console.error('Failed to load opportunities:'"));
    assert.ok(load.includes('if (!data || !stillOrg(askedOrg)) return;'));
    assert.ok(load.indexOf('const { getQuarter, getQuarterLabel } = deps;') > load.indexOf('.then(data => {'), 'read in the answer, not before the request');
});

test('the contact delete check reads the deals as they are now', () => {
    const src = read('src/hooks/useContacts.js');
    assert.ok(src.includes('const linkedActiveOpp = activeDealsOf(contact, deps.opportunities)[0];'));
});

test('softDelete: a timer clears only the toast it put up', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes('const timerId = setTimeout(() => { if (stillOrg(askedOrg)) setUndoToast(t => (t && t.timerId === timerId ? null : t)); }, 5000);'));
    assert.ok(!app.includes('setUndoToast(null); }, 5000);'), 'a timer that clears whatever toast is up');
});

test('the updater: the toast it put up goes; a later one stays; none stays none', () => {
    // The updater softDelete's timer hands setUndoToast, run as written there.
    const app = read('src/App.jsx');
    const m = app.match(/setUndoToast\((t => \(t && t\.timerId === timerId \? null : t\))\)/);
    assert.ok(m, 'the updater');
    const updaterFor = new Function('timerId', `return ${m[1]};`);
    const mine = { label: 'Contact "A"', timerId: 7 };
    const later = { label: 'Contact "B"', timerId: 8 };
    assert.equal(updaterFor(7)(mine), null);
    assert.equal(updaterFor(7)(later), later, 'the first delete\'s timer leaves the second toast');
    assert.equal(updaterFor(7)(null), null);
    const err = { error: 'Not saved' };
    assert.equal(updaterFor(7)(err), err, 'an error toast is not this timer\'s');
});
