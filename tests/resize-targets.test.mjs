// tests/resize-targets.test.mjs
//
// A handler a window event reaches asks for a node before it reads the event's target (state §0.212).
//
// A popover's close is one handler for the outside click, the scroll and the resize (guide §16,
// the menu rule), and it leaves an event inside the menu alone: `menuRef.current.contains(e.target)`.
// A resize's target is the window, not a node, and `contains` refuses it ("Failed to execute
// 'contains' on 'Node': parameter 1 is not of type 'Node'.") — so the handler threw before it closed
// anything, and the list stayed open where the field had been. Found by §0.212's browser check
// (28 Oct, UTC): the Manager box's list; the Users list's and Settings → Industries' row menus,
// shipped, were the same shape.
//
// THE GUARD: a parse of every file under src. Every listener for an event whose target is not always
// a node (every name but NODE_EVENTS — a custom one, and a name the parse cannot read, too), added by
// addEventListener or as `window.on<event>`, has its handler found in the file (declared in the
// nearest scope that names it, or written in place), and the handler reads its event's target, or
// hands the event on, only where `<its event>.target instanceof Node` holds — earlier in the same &&
// chain, or in an if or ?: test over it. It fails closed: an alias of the target, a helper the event
// is handed to, a method or a property of the target, each counts as a read. A check written another
// way (an early return) is reported, to be written in one of these. A handler the parse cannot find
// (a prop, a hook's) is named below with why it is safe, and the reason is pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');

// Events whose target is a node — the element the pointer, the key, the focus or the edit is on, or the document a
// page's scroll is aimed at — on whatever object the listener sits. Every other name is checked: the window's own
// (resize, focus and blur, popstate, hashchange, storage, message, online, offline, unhandledrejection …), the
// page's life-cycle events (load, pageshow, beforeunload — aimed at the document, checked so a handler moved between
// them stays checked), a custom one, and a name the parse cannot read.
const NODE_EVENTS = new Set(['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'mousemove', 'mouseover',
    'mouseout', 'mouseenter', 'mouseleave', 'wheel', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'pointerover',
    'pointerout', 'pointerenter', 'pointerleave', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'keydown', 'keyup',
    'keypress', 'scroll', 'focusin', 'focusout', 'input', 'change', 'submit', 'reset', 'dragstart', 'drag', 'dragend',
    'dragenter', 'dragleave', 'dragover', 'drop', 'copy', 'cut', 'paste', 'selectionchange', 'visibilitychange']);
const WINDOWS = new Set(['window', 'self', 'globalThis']);

const srcFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walk(p + '/');
            else if (/\.jsx?$/.test(e.name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(n.type);
const kids = (n) => Object.keys(n).filter((k) => k !== 'loc').flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((v) => v && typeof v.type === 'string');
const isMember = (n) => n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression');
const isCall = (n) => n && (n.type === 'CallExpression' || n.type === 'OptionalCallExpression');
// `<p>.target`, `<p>?.target` or `<p>['target']`: the event's target.
const isTarget = (n, p) => isMember(n) && n.object.type === 'Identifier' && n.object.name === p
    && (n.computed ? n.property.type === 'StringLiteral' && n.property.value === 'target' : n.property.name === 'target');
// `<p>.target instanceof Node`, and an && that holds one.
const isCheck = (n, p) => n?.type === 'BinaryExpression' && n.operator === 'instanceof' && isTarget(n.left, p) && n.right.type === 'Identifier' && n.right.name === 'Node';
const asserts = (n, p) => !!n && (isCheck(n, p) || (n.type === 'LogicalExpression' && n.operator === '&&' && (asserts(n.left, p) || asserts(n.right, p))));
// Where the event itself stands without handing its target on: tested (`e &&`, `!e`, `if (e)`, `e === x`), or read
// for another member (`e.type`, `e.preventDefault()`) — the target is read only as `isTarget` finds it.
const standsAlone = (parent, n) => !!parent && ((isMember(parent) && parent.object === n && !parent.computed)
    || parent.type === 'LogicalExpression' || parent.type === 'UnaryExpression'
    || (parent.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator))
    || ((parent.type === 'IfStatement' || parent.type === 'ConditionalExpression') && parent.test === n));
// A name that is not a reference: a member's property, an object's key.
const isLabel = (parent, n) => !!parent && ((isMember(parent) && parent.property === n && !parent.computed)
    || (parent.type === 'ObjectProperty' && parent.key === n && !parent.computed && !parent.shorthand));

// Every line a handler reads its event's target on, or hands the event on, with no node check over it.
const unchecked = (fn) => {
    const p = fn.params[0];
    if (!p) return [];                                                         // it never reads the event
    if (p.type !== 'Identifier') return [fn.loc.start.line];                   // a pattern or a default: read it by hand
    const out = [];
    const visit = (n, held, parent) => {
        if (held || isCheck(n, p.name)) return;                                // under a check, or the check itself
        if (isTarget(n, p.name)) { out.push(n.loc.start.line); return; }
        if (n.type === 'Identifier' && n.name === p.name && !isLabel(parent, n) && !standsAlone(parent, n)) { out.push(n.loc.start.line); return; }
        if (n.type === 'LogicalExpression' && n.operator === '&&') { visit(n.left, false, n); visit(n.right, asserts(n.left, p.name), n); return; }
        if (n.type === 'IfStatement' || n.type === 'ConditionalExpression') {
            visit(n.test, false, n); visit(n.consequent, asserts(n.test, p.name), n); if (n.alternate) visit(n.alternate, false, n); return;
        }
        for (const c of kids(n)) visit(c, false, n);
    };
    visit(fn.body, false, fn);
    return out;
};

// Whether a declaration's name, or a pattern, binds `name`.
const binds = (q, name) => !!q && (q.type === 'Identifier' ? q.name === name
    : q.type === 'ObjectPattern' ? q.properties.some((x) => binds(x.type === 'RestElement' ? x.argument : x.value, name))
    : q.type === 'ArrayPattern' ? q.elements.some((x) => binds(x, name))
    : q.type === 'AssignmentPattern' ? binds(q.left, name)
    : q.type === 'RestElement' ? binds(q.argument, name) : false);
// The function a name stands for where it is used: its binding in the nearest scope that binds it, if that binding is
// a function declared or written there — else null (a parameter or a prop, an import, a hook's result, a value).
const resolve = (name, up) => {
    for (const a of [...up].reverse()) {
        if (isFn(a) && a.params.some((x) => binds(x, name))) return null;
        if (!Array.isArray(a.body)) continue;
        for (const s0 of a.body) {
            const s = /^Export(Named|Default)Declaration$/.test(s0.type) && s0.declaration ? s0.declaration : s0;
            if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id?.name === name) return s.type === 'FunctionDeclaration' ? s : null;
            if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (binds(d.id, name)) return d.id.type === 'Identifier' && isFn(d.init) ? d.init : null;
            if (s.type === 'ImportDeclaration' && s.specifiers.some((x) => x.local.name === name)) return null;
        }
    }
    return null;
};
// An event's name as written: a string, a template with nothing in it, else '?' — read at run time, so checked.
const eventOf = (a) => (a?.type === 'StringLiteral' ? a.value : a?.type === 'TemplateLiteral' && !a.expressions.length ? a.quasis[0].value.cooked : '?');

// Every listener in a file for an event whose target is not always a node: where, its event, its handler's name and
// node (null when the parse cannot find it), and the lines it reads its event's target on unchecked.
const listeners = (file, src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const out = [];
    const add = (node, event, h, up) => {
        if (NODE_EVENTS.has(event)) return;
        const fn = isFn(h) ? h : h?.type === 'Identifier' ? resolve(h.name, up) : null;
        out.push({ file, line: node.loc.start.line, event, name: h?.type === 'Identifier' ? h.name : isFn(h) ? 'in place' : '?', fn, src,
            lines: fn ? unchecked(fn) : [] });
    };
    const visit = (node, up) => {
        if (isCall(node) && isMember(node.callee) && !node.callee.computed && node.callee.property.name === 'addEventListener') {
            add(node, eventOf(node.arguments[0]), node.arguments[1], up);
        }
        if (node.type === 'AssignmentExpression' && isMember(node.left) && !node.left.computed && node.left.object.type === 'Identifier'
            && WINDOWS.has(node.left.object.name) && /^on[a-z]/.test(node.left.property.name)) {
            add(node, node.left.property.name.slice(2), node.right, up);
        }
        const inner = [...up, node];
        for (const c of kids(node)) visit(c, inner);
    };
    visit(ast.program, []);
    return out;
};
const report = (ls) => ls.flatMap((l) => l.lines.map((n) => `${l.file}:${n} ${l.event} ${l.name}`));
const unfound = (ls) => ls.filter((l) => !l.fn).map((l) => `${l.file} ${l.event} ${l.name}`);

// Handlers the parse cannot find, each safe for its reason (pinned in the test below).
const NAMED = new Map([
    ['src/Tabs/DocumentsTab.jsx resize onClose', "the row menu's close is the tab's `() => setMenu(null)`, which reads no event"],
]);

test('THE GUARD — every handler a window event reaches under src asks for a node before it reads its event\'s target', () => {
    const files = srcFiles();
    assert.ok(files.length > 150, 'the walk sees the tree');
    const all = files.flatMap((f) => listeners(f, read(f)));
    assert.ok(all.length >= 10, `the walk finds the listeners (${all.length}; ten, every one a resize, when §0.212 was written)`);
    assert.deepEqual(report(all), [], 'a resize hands the window to a node-only read — it throws, and the menu stays open');
    assert.deepEqual(unfound(all), [...NAMED.keys()], 'a handler the parse cannot find is named with its reason');
});

test('the named handlers are as their reasons say', () => {
    const d = read('src/Tabs/DocumentsTab.jsx');
    assert.equal(d.split('<RowMenu ').length - 1, 1, 'one row menu');
    assert.ok(d.includes('<RowMenu anchor={menu.anchor} onClose={() => setMenu(null)}'), NAMED.get('src/Tabs/DocumentsTab.jsx resize onClose'));
});

test('the guard finds the shapes as they were and the ones the review named, and passes a checked one and a handler that reads no event', () => {
    const at = (src) => report(listeners('x.jsx', src));
    const lost = (src) => unfound(listeners('x.jsx', src));
    // The Manager box's list before the fix (§0.212's build).
    assert.deepEqual(at("const close = (e) => { if (listRef.current && e && e.target && listRef.current.contains(e.target)) return; setOpen(false); };\nwindow.addEventListener('resize', close);"),
        ['x.jsx:1 resize close', 'x.jsx:1 resize close'], 'REGRESSION: the shape the browser check found');
    assert.deepEqual(at("const f = (e) => { if (menuRef.current?.contains(e.target)) return; shut(); };\nwindow.addEventListener('resize', f);"), ['x.jsx:1 resize f'], 'an optional call');
    assert.deepEqual(at("window.addEventListener('resize', (ev) => { if (!box.contains(ev.target)) shut(); });"), ['x.jsx:1 resize in place'], 'in place, any name');
    assert.deepEqual(at("function M() { function h(e) { if (m.contains(e.target)) return; shut(); }\n window.addEventListener('blur', h); }"), ['x.jsx:1 blur h'], 'a declared function, another window event');
    assert.deepEqual(at("const h = (e) => { if (m.contains(e.target) && e.target instanceof Node) return; shut(); };\nwindow.addEventListener('resize', h);"), ['x.jsx:1 resize h'], 'a check after the read is no check');
    assert.deepEqual(at("const h = (e) => { if (!(e.target instanceof Node) && m.contains(e.target)) return; shut(); };\nwindow.addEventListener('resize', h);"), ['x.jsx:1 resize h'], 'a negated check is no check');
    assert.deepEqual(at("const h = (e) => { if (x instanceof Node && m.contains(e.target)) return; shut(); };\nwindow.addEventListener('resize', h);"), ['x.jsx:1 resize h'], "another value's check is no check");
    // Fails closed (the review, 28 Oct): each of these threw on a real resize in a browser.
    const h = (body) => at(`const h = (e) => { ${body} };\nwindow.addEventListener('resize', h);`);
    assert.deepEqual(h('const t = e.target; if (m.contains(t)) return; shut();'), ['x.jsx:1 resize h'], 'REGRESSION (review): an alias of the target');
    assert.deepEqual(h('const { target } = e; if (m.contains(target)) return; shut();'), ['x.jsx:1 resize h'], 'REGRESSION (review): the target destructured');
    assert.deepEqual(h('if (inside(m, e)) return; shut();'), ['x.jsx:1 resize h'], 'REGRESSION (review): the event handed to a helper');
    assert.deepEqual(h("if (e.target.classList.contains('menu')) return; shut();"), ['x.jsx:1 resize h'], 'REGRESSION (review): a property of the target');
    assert.deepEqual(h('if (m.compareDocumentPosition(e.target)) return; shut();'), ['x.jsx:1 resize h'], 'REGRESSION (review): another node-only method');
    assert.deepEqual(h("if (m['contains'](e['target'])) return; shut();"), ['x.jsx:1 resize h'], 'REGRESSION (review): read by a string');
    const close = "const close = (e) => { if (m.contains(e.target)) return; shut(); };\n";
    assert.deepEqual(at(`${close}const ev = 'resize'; window.addEventListener(ev, close);`), ['x.jsx:1 ? close'], 'REGRESSION (review): a name read at run time');
    assert.deepEqual(at(`${close}['scroll', 'resize'].forEach((ev) => window.addEventListener(ev, close));`), ['x.jsx:1 ? close'], 'REGRESSION (review): one close for the scroll and the resize, by a loop');
    assert.deepEqual(at(`${close}window.addEventListener(\`resize\`, close);`), ['x.jsx:1 resize close'], 'a template with nothing in it');
    assert.deepEqual(at(`${close}window.onresize = close;`), ['x.jsx:1 resize close'], 'REGRESSION (review): window.onresize');
    assert.deepEqual(at(`${close}window.addEventListener('unhandledrejection', close); window.addEventListener('accelerep:refresh', close);`),
        ['x.jsx:1 unhandledrejection close', 'x.jsx:1 accelerep:refresh close'], 'REGRESSION (review): a window event off the old list, and a custom one');
    assert.deepEqual(lost("const onClose = () => {};\nfunction Menu({ onClose }) { window.addEventListener('resize', onClose); }"), ['x.jsx resize onClose'],
        'REGRESSION (review): a prop is not the outer function of its name');
    assert.deepEqual(lost("const close = () => {};\nfunction Menu() { const close = React.useCallback((e) => m.contains(e.target), []); window.addEventListener('resize', close); }"),
        ['x.jsx resize close'], 'REGRESSION (review): a hook\'s result is not the outer function of its name');
    // As fixed, and the shapes that cannot throw.
    assert.deepEqual(at("const close = (e) => { if (e && e.target instanceof Node && (e.target === fieldRef.current || (listRef.current && listRef.current.contains(e.target)))) return; setOpen(false); };\nwindow.addEventListener('resize', close);"), [], 'checked first');
    assert.deepEqual(h('if (e.target instanceof Node) { if (m.contains(e.target)) return; } shut();'), [], 'held by an if');
    assert.deepEqual(at("const h = (e) => (e.target instanceof Node && m.contains(e.target) ? null : shut());\nwindow.addEventListener('resize', h);"), [], 'held by a ?: test');
    assert.deepEqual(h("if (e.type === 'resize' && !e.defaultPrevented) shut();"), [], 'the event read for another member');
    assert.deepEqual(at("const onResize = () => setMobile(window.innerWidth < 640);\nwindow.addEventListener('resize', onResize);"), [], 'a handler that reads no event');
    assert.deepEqual(at("document.addEventListener('mousedown', (e) => { if (!m.contains(e.target)) shut(); });"), [], 'a press targets a node');
    assert.deepEqual(lost("function Menu({ onClose }) { window.addEventListener('resize', onClose); }"), ['x.jsx resize onClose'], 'a prop: named, or it fails');
    // Written another way, reported: the check must sit in an && chain or an if or ?: test.
    assert.deepEqual(h('if (!(e.target instanceof Node)) return; if (m.contains(e.target)) return; shut();'), ['x.jsx:1 resize h'], 'an early return is read by hand');
});

// The browser's contains, as far as these handlers meet it: it refuses anything but a node.
class FakeNode {}
const menu = (inside) => Object.assign(new FakeNode(), { contains(x) {
    if (!(x instanceof FakeNode)) throw new TypeError("Failed to execute 'contains' on 'Node': parameter 1 is not of type 'Node'.");
    return x === inside;
} });
// A handler as written in its file, run with the stand-in Node.
const handlerOf = (file, line, names) => {
    const l = listeners(file, read(file)).find((x) => x.line === line);
    assert.ok(l && l.fn, `${file}:${line} a resize listener with its handler`);
    return (...deps) => new Function(...names, 'Node', `return (${l.src.slice(l.fn.start, l.fn.end)});`)(...deps, FakeNode);
};
const lineOf = (file, text) => { const i = read(file).split('\n').findIndex((s) => s.trim() === text); assert.ok(i >= 0, text); return i + 1; };

test('the three handlers, run: a resize closes, an event in the menu does not, one outside does — and the Manager list leaves its own field\'s scroll alone', () => {
    const UD = 'src/Tabs/settings/people/UsersDetail.jsx', IND = 'src/Tabs/settings/salesProcess/IndustriesDetail.jsx';
    const typeahead = handlerOf(UD, lineOf(UD, "window.addEventListener('resize', close);"), ['listRef', 'fieldRef', 'setOpen']);
    const usersKebab = handlerOf(UD, lineOf(UD, "window.addEventListener('resize', handler);"), ['kebabMenuRef', 'setOpenUserKebab']);
    const indKebab = handlerOf(IND, lineOf(IND, "window.addEventListener('resize', handler);"), ['kebabMenuRef', 'setOpenIndKebab']);
    const field = new FakeNode();
    for (const [name, make, shut] of [
        ['the Manager box', (ref, set) => typeahead(ref, { current: field }, set), false],
        ['the Users row menu', usersKebab, null],
        ['the Industries row menu', indKebab, null],
    ]) {
        const inside = new FakeNode();
        const set = [];
        const h = make({ current: menu(inside) }, (v) => set.push(v));
        h({ type: 'resize', target: {} });                                 // the window: not a node
        assert.deepEqual(set, [shut], `REGRESSION: ${name} — a resize threw and left it open`);
        h({ type: 'scroll', target: inside });
        assert.deepEqual(set, [shut], `${name} — its own scrollbar keeps it open`);
        h({ type: 'click', target: new FakeNode() });
        assert.deepEqual(set, [shut, shut], `${name} — an event outside it closes it`);
    }
    // A text box scrolls its own text as a query outgrows it, and says so (seen in the pane, 28 Oct): not the page moving.
    const set = [];
    const h = typeahead({ current: menu(null) }, { current: field }, (v) => set.push(v));
    h({ type: 'scroll', target: field });
    assert.deepEqual(set, [], "REGRESSION (review): the field's own scroll, as the query outgrows it, closed the list while it was typed");
    // The stand-in throws as the browser did, on the shape before the fix.
    const was = new Function('listRef', 'setOpen', 'return (e) => { if (listRef.current && e && e.target && listRef.current.contains(e.target)) return; setOpen(false); };');
    assert.throws(() => was({ current: menu(null) }, () => {})({ type: 'resize', target: {} }), /parameter 1 is not of type 'Node'/);
});

test('the three places hold the check', () => {
    const ud = read('src/Tabs/settings/people/UsersDetail.jsx');
    const once = (s, t, m) => assert.equal(s.split(t).length - 1, 1, m || t);
    once(ud, '        const close = (e) => { if (e && e.target instanceof Node && (e.target === fieldRef.current || (listRef.current && listRef.current.contains(e.target)))) return; setOpen(false); };', 'the Manager box');
    once(ud, '            if (kebabMenuRef.current && e && e.target instanceof Node && kebabMenuRef.current.contains(e.target)) return;', 'the Users row menu');
    once(read('src/Tabs/settings/salesProcess/IndustriesDetail.jsx'), '            if (kebabMenuRef.current && e && e.target instanceof Node && kebabMenuRef.current.contains(e.target)) return;', 'the Industries row menu');
});

test('the TDZ gate knows the node check\'s global', () => {
    const s = read('scripts/check-tdz.mjs');
    const start = s.indexOf('const GLOBALS = new Set([');
    assert.ok(start >= 0, 'check-tdz keeps its list of known globals');
    const list = s.slice(start, s.indexOf(']);', start));
    assert.ok(/^\s*'Node',/m.test(list), 'REGRESSION: check:tdz read `Node` as undefined in each of the three handlers, and the gate failed the batch');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/resize-targets.test.mjs'), 'SUITES runs this file');
});
