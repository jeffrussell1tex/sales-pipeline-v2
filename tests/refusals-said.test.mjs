// tests/refusals-said.test.mjs — THE GUARD: a refusal reaches the member, in the server's words or in fallback words
// (state §0.243, guide §18b125 rule 5, §18b123 rule 4; docs/design/save-cleanup Part 5).
//
// Two shapes said nothing. Twelve throws in four screens were `new Error(data.error)` — an undefined message when the server sent
// no words, an empty banner — after a bare `res.json()`, so a body that was not JSON said "Unexpected token '<'"
// (ExportDetail, ApiKeysDetail, AutomationsDetail, WebhooksDetail); and error states were set that nothing drew (the
// Documents library's `docsError`: a failed read showed "No documents yet"; the Price Book's `productModalError`,
// §0.242). This guard parses every source under src/ (.js, .jsx) and asks:
//   (i)  every useState whose name matches /error|refus/i is READ somewhere in the function that holds it, other than
//        inside its own setter's call; a hook's state that is only handed out (a `use…` function's returned object)
//        is read by its name in some other file under src/, handed on in a shorthand property (App.jsx's context
//        value) being no read — or it is NAMED below with its reason;
//        A hook's state handed out under another key (`settingsLoadError: loadError`) is read by that KEY elsewhere,
//        and a use under a node that binds the name again (a catch param, a function or arrow param, a nested
//        declaration) is not a read of the state; a read in a condition or a hook's dependency list is. A read in
//        another file counts for a handed-out key only where that file TOOK it — the read's nearest binding an object
//        pattern's property of that key (`const { loadError } = useHook()`, `{ loadError: le }`, a component's props) —
//        never a name the file binds itself (a useState, a const or let, a parameter, a catch param, an import);
//   (ii) no `throw new Error(<expr>.error)` without fallback words (`x.error || '…'`), unless NAMED below;
//   (iii) in the files the sweep owns (SWEPT: the four Settings panels, BackupDetail, the Documents library and its
//        hook, Dispatch's Vehicles & equipment), no body read (`res.json()`) before that response's ok check, unless
//        NAMED below. Outside them the shape is the filed rest of the sweep, not scanned here.
// A named one that is gone fails until its name goes (no stale names). Self-tests show each scan catches its shape.
// KNOWN LIMITS (filed, not chased — §0.243's second fix round):
//   - scan (i): a state handed out through an expression (`{ k: x || null }`, `{ k: x ? x : '' }`) is no handout — the
//     read counts as an own read in the hook, and nothing elsewhere is asked;
//   - scan (i): a useMemo'd return (`return useMemo(() => ({ loadError }), [loadError])`) — the dependency list reads the
//     state in its own function, so the state passes whether any screen reads it or not;
//   - scan (i): scopes — `var` hoisted out of a nested block, and a class's name inside its own body, are not bound
//     where the language binds them; a read in another file through a member (`hook.loadError`) is no read of the key;
//   - scan (iii): okReadBefore takes ANY earlier `.ok` mention of the response in the function as its check (a
//     `console.log(res.ok)`, or a check in a branch the body read is not under).
// RUN: the words (src/utils/refusalWords.js: refusalWords, readRefusal, failureWords), BackupDetail's saveSnapshotFile,
// handleRunBackup, handleSaveSchedule and the download banner's clear (5b), the create paths' ok-first lines (5a),
// ExportDetail's Pause / Enable and Mark complete refusals; WIRING for 5c and 5d.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parse } from '@babel/parser';
import { refusalWords, readRefusal, failureWords } from '../src/utils/refusalWords.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

const srcFiles = () => {
    const out = [];
    const walk = (rel) => {
        for (const name of readdirSync(new URL(rel, ROOT))) {
            const p = `${rel}${name}`;
            const st = statSync(new URL(p, ROOT));
            if (st.isDirectory()) walk(`${p}/`);
            else if (/\.(js|jsx)$/.test(name)) out.push(p);
        }
    };
    walk('src/');
    return out.sort();
};
const ast = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const kids = (n) => Object.keys(n).filter((k) => !SKIP.has(k))
    .flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((v) => v && typeof v === 'object' && typeof v.type === 'string');
const FUNCS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);

// The bindings a pattern makes (a parameter, a declarator's id, a catch param): { name, by, key } — `by` is
// 'destructure' for an object pattern's property whose value is a plain name (`{ loadError }`, `{ loadError: le }`,
// `{ loadError = '' }`): the value was TAKEN from something else under `key` (a hook's answer, the context, props);
// 'own' for every other binding (a name, an array pattern's element — a useState —, a parameter, a catch param).
const keyName = (q) => (!q.computed && q.key.type === 'Identifier' ? q.key.name : !q.computed && q.key.type === 'StringLiteral' ? q.key.value : null);
const OWN = (name) => ({ name, by: 'own', key: null });
const patternBindings = (p) => {
    if (!p) return [];
    switch (p.type) {
        case 'Identifier': return [OWN(p.name)];
        case 'AssignmentPattern': return patternBindings(p.left);
        case 'RestElement': return patternBindings(p.argument);
        case 'ArrayPattern': return p.elements.flatMap(patternBindings);
        case 'ObjectPattern': return p.properties.flatMap((q) => {
            if (q.type === 'RestElement') return patternBindings(q.argument);
            const v = q.value.type === 'AssignmentPattern' ? q.value.left : q.value;
            const k = keyName(q);
            return v.type === 'Identifier' && k ? [{ name: v.name, by: 'destructure', key: k }] : patternBindings(q.value);
        });
        default: return [];
    }
};
const patternNames = (p) => patternBindings(p).map((b) => b.name);
// The bindings a statement list declares directly (let, const, var, a function or class declaration, an import).
const declaredBindingsIn = (stmts) => stmts.flatMap((s) => {
    if (s.type === 'VariableDeclaration') return s.declarations.flatMap((d) => patternBindings(d.id));
    if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) return [OWN(s.id.name)];
    if ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') && s.declaration) return declaredBindingsIn([s.declaration]);
    if (s.type === 'ImportDeclaration') return s.specifiers.map((sp) => OWN(sp.local.name));
    return [];
});
// The bindings a node makes for its own subtree: a function's params (and a function expression's own name), a catch
// param, a program's, a block's or a switch's declarations, a for loop's declared names. A read under a node that binds
// its name is not a read of the outer binding (scan (i) is scope-aware: a `catch (error)` or `(error) => …` reads its
// own `error`); the nearest binding of a read says where its value came from (keysReadIn).
const scopeBindings = (n) => {
    if (FUNCS.has(n.type)) return [...n.params.flatMap(patternBindings), ...(n.type === 'FunctionExpression' && n.id ? [OWN(n.id.name)] : [])];
    switch (n.type) {
        case 'Program': return declaredBindingsIn(n.body);
        case 'CatchClause': return patternBindings(n.param);
        case 'BlockStatement': case 'StaticBlock': return declaredBindingsIn(n.body);
        case 'SwitchStatement': return declaredBindingsIn(n.cases.flatMap((c) => c.consequent));
        case 'ForStatement': return n.init && n.init.type === 'VariableDeclaration' ? declaredBindingsIn([n.init]) : [];
        case 'ForInStatement': case 'ForOfStatement': return n.left.type === 'VariableDeclaration' ? declaredBindingsIn([n.left]) : [];
        default: return [];
    }
};

// Every identifier READ in a node: not a binding (a declared name, a parameter, a destructured name), not a member's
// or an object key's name. `inSetter`: the names of setters whose call the walk is inside. A read is
// { name, node, inSetters, handout, passed, shadowed } — `handout`: the KEY a returned object's property hands the
// value out under in the function `fn` (`return { settingsLoadError: loadError }` hands loadError out as
// settingsLoadError; a shorthand keeps the name); `passed`: a shorthand property's value (`{ docsError }`), which hands
// the name on and draws nothing — App.jsx's context value passed the Price Book's productModalError to every screen,
// and none read it (§0.242); `shadowed`: read under a node (not `root`) that binds the name again; `boundBy`: the
// nearest binding of the name the walk is inside, `root`'s own included ({ name, by, key }, or null when none).
function readsIn(root, fn = null) {
    const out = [];
    const bound = new Map();   // a name bound again by a node the walk is inside → how many such nodes
    const nearest = new Map(); // a name → the bindings of it the walk is inside, innermost last
    const push = (r) => out.push({ ...r, shadowed: (bound.get(r.name) || 0) > 0, boundBy: (nearest.get(r.name) || []).at(-1) || null });
    const keyOf = (p) => (!p.computed && p.key.type === 'Identifier' ? p.key.name : !p.computed && p.key.type === 'StringLiteral' ? p.key.value : null);
    const walk = (n, inSetters, handout) => {
        if (!n || typeof n.type !== 'string') return;
        const binds = scopeBindings(n);
        const names = n === root ? [] : binds.map((b) => b.name);
        for (const x of names) bound.set(x, (bound.get(x) || 0) + 1);
        for (const b of binds) { if (!nearest.has(b.name)) nearest.set(b.name, []); nearest.get(b.name).push(b); }
        try { visit(n, inSetters, handout); } finally {
            for (const x of names) bound.set(x, bound.get(x) - 1);
            for (const b of binds) nearest.get(b.name).pop();
        }
    };
    const visit = (n, inSetters, handout) => {
        switch (n.type) {
            case 'Identifier': push({ name: n.name, node: n, inSetters, handout: typeof handout === 'string' ? handout : false }); return;
            case 'MemberExpression': case 'OptionalMemberExpression':
                walk(n.object, inSetters, false); if (n.computed) walk(n.property, inSetters, false); return;
            case 'ObjectProperty':
                if (n.computed) walk(n.key, inSetters, false);
                if (n.shorthand && n.value.type === 'Identifier') { push({ name: n.value.name, node: n.value, inSetters, handout: handout ? n.value.name : false, passed: true }); return; }
                walk(n.value, inSetters, handout ? (keyOf(n) || false) : false); return;
            case 'ObjectMethod': case 'ClassMethod':
                if (n.computed) walk(n.key, inSetters, false);
                for (const p of n.params) walkPattern(p, inSetters);
                walk(n.body, inSetters, false); return;
            case 'VariableDeclarator': walkPattern(n.id, inSetters); walk(n.init, inSetters, false); return;
            case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
                for (const p of n.params) walkPattern(p, inSetters);
                walk(n.body, inSetters, false); return;
            case 'CatchClause': walk(n.body, inSetters, false); return;
            case 'ImportDeclaration': case 'ExportNamedDeclaration':
                if (n.declaration) walk(n.declaration, inSetters, false); return;
            case 'LabeledStatement': case 'BreakStatement': case 'ContinueStatement': if (n.body) walk(n.body, inSetters, false); return;
            case 'JSXAttribute': walk(n.value, inSetters, false); return;
            case 'CallExpression': case 'OptionalCallExpression': {
                const setter = n.callee.type === 'Identifier' ? n.callee.name : null;
                walk(n.callee, inSetters, false);
                const inner = setter ? [...inSetters, setter] : inSetters;
                for (const a of n.arguments) walk(a, inner, false);
                return;
            }
            case 'ReturnStatement':
                walk(n.argument, inSetters, !!(fn && n.argument && n.argument.type === 'ObjectExpression' && returnsOf(fn).includes(n))); return;
            case 'ObjectExpression': for (const p of n.properties) walk(p, inSetters, handout); return;
            default: for (const k of kids(n)) walk(k, inSetters, false);
        }
    };
    // A pattern binds its names; only its defaults and computed keys are read.
    const walkPattern = (p, inSetters) => {
        if (!p) return;
        if (p.type === 'AssignmentPattern') { walkPattern(p.left, inSetters); walk(p.right, inSetters, false); return; }
        if (p.type === 'ObjectPattern') { for (const q of p.properties) { if (q.type === 'RestElement') walkPattern(q.argument, inSetters); else { if (q.computed) walk(q.key, inSetters, false); walkPattern(q.value, inSetters); } } return; }
        if (p.type === 'ArrayPattern') { for (const q of p.elements) walkPattern(q, inSetters); return; }
        if (p.type === 'RestElement') { walkPattern(p.argument, inSetters); return; }
        if (p.type === 'Identifier') return;
        walk(p, inSetters, false);   // a member as an assignment target
    };
    walk(root, [], false);
    return out;
}
// The return statements of a function itself (not of the functions inside it).
function returnsOf(fn) {
    const out = [];
    const walk = (n) => { if (n.type === 'ReturnStatement') out.push(n); for (const k of kids(n)) if (!FUNCS.has(k.type)) walk(k); };
    if (fn.body.type === 'BlockStatement') walk(fn.body);
    return out;
}
const fnName = (fn, parent) => (fn.id && fn.id.name) || (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : '');
const isUseState = (init) => init && init.type === 'CallExpression' && (
    (init.callee.type === 'Identifier' && init.callee.name === 'useState')
    || (init.callee.type === 'MemberExpression' && !init.callee.computed && init.callee.object.type === 'Identifier' && init.callee.object.name === 'React' && init.callee.property.name === 'useState'));

// (i) Every error state of a source: { name, setter, line, fn, hook, reads, handedOut, keys } — `reads`: reads in the
// function that holds it, outside its own setter's call and outside any node that binds its name again; `handedOut`:
// every such read is a hook's returned property; `keys`: the keys it is handed out under.
function errorStatesOf(src) {
    const out = [];
    const walk = (n, fnStack) => {
        let stack = fnStack;
        if (FUNCS.has(n.type)) stack = [...fnStack, n];
        if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && isUseState(n.init)) {
            const [v, s] = n.id.elements;
            if (v && v.type === 'Identifier' && /error|refus/i.test(v.name)) {
                const fn = stack[stack.length - 1];
                const setter = s && s.type === 'Identifier' ? s.name : null;
                const reads = (fn ? readsIn(fn.body, fn) : readsIn(n))
                    .filter((r) => r.name === v.name && r.node !== v && !r.shadowed && !(setter && r.inSetters.includes(setter)));
                const hook = !!fn && /^use[A-Z]/.test(fn.__name || '');
                const handedOut = hook && reads.length > 0 && reads.every((r) => r.handout);
                out.push({ name: v.name, setter, line: n.loc.start.line, hook, reads: reads.length, handedOut,
                    keys: handedOut ? [...new Set(reads.map((r) => r.handout))] : [] });
            }
        }
        for (const k of kids(n)) {
            if (FUNCS.has(k.type)) k.__name = fnName(k, n);
            walk(k, stack);
        }
    };
    walk(ast(src).program, []);
    return out;
}
// Every name read anywhere in a source — handed on in a shorthand property is no read.
const namesReadIn = (src) => new Set(readsIn(ast(src).program).filter((r) => !r.passed).map((r) => r.name));
// Every KEY a source reads a value under that it TOOK from somewhere else (for a hook's handed-out state): a read (not
// handed on) whose nearest binding is an object pattern's property — `const { loadError } = useHook()`, `{ loadError:
// le }`, a component's `({ loadError })` — reads that property's key. A read of a name the file binds itself — a
// useState, a const or let, a parameter, a catch param, an import — reads no key (§0.243's second fix round: a hook's
// shorthand `{ loadError }` was "read" by any other file's own loadError).
const keysReadIn = (src) => new Set(readsIn(ast(src).program)
    .filter((r) => !r.passed && r.boundBy && r.boundBy.by === 'destructure').map((r) => r.boundBy.key));
// (i) over a set of sources ({ file: src }): the states nothing reads — { file, name, line, handedOut, keys } — and how
// many states were seen. A hook's handed-out state is read when another file reads, as taken from elsewhere, one of the
// KEYS it is handed out under (useSettings' loadError is handed out as settingsLoadError: App.jsx's settingsLoadError,
// destructured from the hook, reads it; another file's own `loadError` — or its own `settingsLoadError` — does not).
function unreadStatesIn(sources) {
    const files = Object.keys(sources);
    const readByFile = Object.fromEntries(files.map((f) => [f, keysReadIn(sources[f])]));
    const found = [];
    let states = 0;
    for (const f of files) {
        for (const st of errorStatesOf(sources[f])) {
            states++;
            const readElsewhere = st.handedOut && files.some((g) => g !== f && st.keys.some((k) => readByFile[g].has(k)));
            if (st.reads === 0 || (st.handedOut && !readElsewhere)) found.push({ file: f, name: st.name, line: st.line, handedOut: st.handedOut, keys: st.keys });
        }
    }
    return { found, states };
}

// (iii) Every body read (`<res>.json()`) with no ok check of that response before it in the function that reads it:
// { line, text, name }. An ok check is a read of `<res>.ok` earlier in that function (an `if (!res.ok)`, a
// `res.ok ? … : …`); a body read off no named response cannot be checked and counts.
function bodyReadsBeforeOkOf(src) {
    const out = [];
    const lines = src.split('\n');
    const program = ast(src).program;
    const isMember = (n) => n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') && !n.computed && n.property.type === 'Identifier';
    const okReadBefore = (scope, name, at) => {
        let seen = false;
        const look = (n) => {
            if (seen) return;
            if (isMember(n) && n.property.name === 'ok' && n.object.type === 'Identifier' && n.object.name === name && n.start < at) { seen = true; return; }
            for (const k of kids(n)) look(k);
        };
        look(scope);
        return seen;
    };
    let reads = 0;
    const walk = (n, fnStack) => {
        const stack = FUNCS.has(n.type) ? [...fnStack, n] : fnStack;
        if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && isMember(n.callee) && n.callee.property.name === 'json' && n.arguments.length === 0) {
            reads++;
            const obj = n.callee.object;
            const scope = stack.length ? stack[stack.length - 1] : program;
            if (!(obj.type === 'Identifier' && okReadBefore(scope, obj.name, n.start))) {
                out.push({ line: n.loc.start.line, text: lines[n.loc.start.line - 1].trim(), name: obj.type === 'Identifier' ? obj.name : '' });
            }
        }
        for (const k of kids(n)) walk(k, stack);
    };
    walk(program, []);
    return { reads, found: out };
}

// (ii) Every `throw new Error(<expr>.error)` with no fallback words: { line, text }.
function bareThrowsOf(src) {
    const out = [];
    const lines = src.split('\n');
    const walk = (n) => {
        if (n.type === 'ThrowStatement' && n.argument && ['NewExpression', 'CallExpression'].includes(n.argument.type)
            && n.argument.callee.type === 'Identifier' && n.argument.callee.name === 'Error') {
            const a = n.argument.arguments[0];
            if (a && ['MemberExpression', 'OptionalMemberExpression'].includes(a.type) && !a.computed && a.property.type === 'Identifier' && a.property.name === 'error') {
                out.push({ line: n.loc.start.line, text: lines[n.loc.start.line - 1].trim() });
            }
        }
        for (const k of kids(n)) walk(k);
    };
    walk(ast(src).program);
    return out;
}

// ── The named ones, each with its reason ────────────────────────────────────────────────────────────────────────
// (i) error states read nowhere but their setter — none today. A name here is { file, name, why }.
const UNREAD_STATES = [];
// (ii) a throw of `<expr>.error` that holds words: { file, text (the trimmed line), why }.
const BARE_THROWS = [
    { file: 'src/components/layout/ModalLayer.jsx', text: 'if (res.error) throw new Error(res.error);',
        why: 'a hook\'s answer ({ ok, error }), thrown only when its own `if` found words' },
    { file: 'src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx', text: 'if (typedRate.error) { setSaveError(typedRate.error); throw new Error(typedRate.error); }',
        why: 'the typed rate\'s own refusal words (taxRateFromInput), thrown only when its `if` found them, and drawn first' },
];

// ── (i) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test('(i) every error state under src/ is read — in its own function, outside its setter; a hook\'s, by a screen — or named', () => {
    const files = srcFiles();
    const { found, states } = unreadStatesIn(Object.fromEntries(files.map((f) => [f, read(f)])));
    assert.ok(states >= 100, `the scan sees the error states (${states}) — fewer means it lost its shape`);
    const named = (x) => UNREAD_STATES.some((u) => u.file === x.file && u.name === x.name);
    const unnamed = found.filter((x) => !named(x));
    assert.deepEqual(unnamed, [], `an error state nothing draws — draw it, or name it in UNREAD_STATES with its reason:\n${unnamed.map((x) => `  ${x.file}:${x.line} ${x.name}${x.handedOut ? ` (handed out by its hook as ${x.keys.join(', ')}, read by no other file)` : ''}`).join('\n')}`);
    const stale = UNREAD_STATES.filter((u) => !found.some((x) => x.file === u.file && x.name === u.name));
    assert.deepEqual(stale, [], 'a named state that is now read, or gone — take its name out');
    for (const u of UNREAD_STATES) assert.ok(u.why && u.why.length > 10, `${u.file} ${u.name}: a reason`);
});

test('(i) self-test: the scan catches a state read nowhere, one read only inside its setter, and a hook\'s state no screen reads', () => {
    const never = errorStatesOf(`function A() { const [saveError, setSaveError] = useState(''); const go = () => setSaveError('x'); return <div/>; }`);
    assert.deepEqual(never.map((s) => [s.name, s.reads]), [['saveError', 0]], 'set, never read');
    const ownSetter = errorStatesOf(`function A() { const [loadError, setLoadError] = React.useState(''); const go = () => setLoadError(loadError ? loadError + '!' : 'x'); return <div/>; }`);
    assert.deepEqual(ownSetter.map((s) => [s.name, s.reads]), [['loadError', 0]], 'read only inside its own setter');
    const keyOnly = errorStatesOf(`function A() { const [error, setError] = useState(''); return <X error="a" style={{ error: 1 }} onClick={() => obj.error}/>; }`);
    assert.deepEqual(keyOnly.map((s) => [s.name, s.reads]), [['error', 0]], 'a key, an attribute name or a member named the same is not a read');
    const shadow = errorStatesOf(`function A() { const [error, setError] = useState(''); return <div/>; }\nfunction B() { const error = 1; return error; }`);
    assert.deepEqual(shadow.map((s) => [s.name, s.reads]), [['error', 0]], 'a read in another function of the file is not this state\'s');
    const drawn = errorStatesOf(`function A() { const [refusal, setRefusal] = useState(''); return <div>{refusal && <p>{refusal}</p>}</div>; }`);
    assert.deepEqual(drawn.map((s) => [s.name, s.reads]), [['refusal', 2]], 'drawn: read');
    // The Documents library's shape before §0.243: the hook hands docsError out, and no screen reads it.
    const hook = errorStatesOf(`export function useDocuments() { const [docsError, setDocsError] = useState(null); const load = () => setDocsError('x'); return { docsError, load }; }`);
    assert.deepEqual(hook.map((s) => [s.name, s.hook, s.handedOut]), [['docsError', true, true]], 'a hook\'s state only handed out');
    const tabBefore = namesReadIn(`export default function DocumentsTab() { const { documents = [], docsLoading } = useApp(); return <div>{docsLoading}</div>; }`);
    assert.ok(!tabBefore.has('docsError'), 'no screen reads it: caught');
    const destructuredOnly = namesReadIn(`export default function T() { const { docsError } = useApp(); return <div/>; }`);
    assert.ok(!destructuredOnly.has('docsError'), 'taken from the context but never drawn is no read');
    const tabAfter = namesReadIn(`export default function DocumentsTab() { const { docsError } = useApp(); return <div>{docsError && <p>{docsError}</p>}</div>; }`);
    assert.ok(tabAfter.has('docsError'), 'drawn by a screen: read');
    // The Price Book's shape before §0.242 (bb0c88e): App.jsx wires the hook's state into the context value, and no
    // screen reads it — handed on is no read.
    const wired = namesReadIn(`function App() { const quotesHook = useQuotes(); const { productModalError, setProductModalError } = quotesHook; const appContextValue = { productModalError, setProductModalError }; return <Ctx value={appContextValue}/>; }`);
    assert.ok(!wired.has('productModalError'), 'handed on in the context value, never drawn: caught');
    const drawnOn = namesReadIn(`function T() { const { quoteModalError } = useApp(); return <p>{error || quoteModalError}</p>; }`);
    assert.ok(drawnOn.has('quoteModalError'), 'drawn: read');
});

test('(i) self-test: a hook\'s state handed out under another key is read by that KEY elsewhere, never by its local name', () => {
    // useSettings' shape: loadError handed out as settingsLoadError. It passed only because other files have a
    // loadError of their own — the probe: nothing reads settingsLoadError → caught.
    const hook = `export function useS() { const [loadError, setLoadError] = useState(''); const load = () => setLoadError('x'); return { settingsLoadError: loadError, load }; }`;
    const [st] = errorStatesOf(hook);
    assert.deepEqual([st.name, st.handedOut, st.keys], ['loadError', true, ['settingsLoadError']], 'handed out under its key');
    const probe = unreadStatesIn({
        'src/hooks/useS.js': hook,
        'src/Other.jsx': `export default function Other() { const [loadError, setLoadError] = useState(''); return <p>{loadError}</p>; }`,
    });
    assert.deepEqual(probe.found.map((x) => [x.file, x.name, x.keys]), [['src/hooks/useS.js', 'loadError', ['settingsLoadError']]],
        'REGRESSION: another file\'s own loadError counted as a read of the key settingsLoadError');
    const readByKey = unreadStatesIn({
        'src/hooks/useS.js': hook,
        'src/App.jsx': `function App() { const { settingsLoadError } = useS(); return <p>{settingsLoadError}</p>; }`,
    });
    assert.deepEqual(readByKey.found, [], 'read elsewhere under its key: read');
    // A shorthand keeps the name: read elsewhere by that name.
    const shorthand = `export function useD() { const [docsError, setDocsError] = useState(null); const l = () => setDocsError('x'); return { docsError, l }; }`;
    assert.deepEqual(errorStatesOf(shorthand)[0].keys, ['docsError']);
    assert.deepEqual(unreadStatesIn({ 'src/hooks/useD.js': shorthand, 'src/T.jsx': `function T() { const { docsError } = useApp(); return <p>{docsError}</p>; }` }).found, []);
    assert.equal(unreadStatesIn({ 'src/hooks/useD.js': shorthand, 'src/T.jsx': `function T() { const { docsError } = useApp(); return <p/>; }` }).found.length, 1, 'taken, never drawn: caught');
    // Handed out under two keys: a read of either is a read.
    const twoKeys = `export function useB() { const [saveError, setSaveError] = useState(''); const s = () => setSaveError('x'); return { saveError, lastError: saveError, s }; }`;
    assert.deepEqual(errorStatesOf(twoKeys)[0].keys.sort(), ['lastError', 'saveError']);
    assert.deepEqual(unreadStatesIn({ 'src/hooks/useB.js': twoKeys, 'src/T.jsx': `function T() { const { lastError } = useB(); return <p>{lastError}</p>; }` }).found, []);
});

test('(i) self-test: a SHORTHAND handout is read only where a file TOOK it — another file\'s own binding of the name is no read', () => {
    // §0.243's second fix round: `return { loadError, l }` keeps the name, and any other file's own loadError passed it.
    const hook = `export function useL() { const [loadError, setLoadError] = useState(''); const l = () => setLoadError('x'); return { loadError, l }; }`;
    const ofHook = (others) => unreadStatesIn({ 'src/hooks/useL.js': hook, ...others }).found
        .filter((x) => x.file === 'src/hooks/useL.js').map((x) => [x.name, x.keys]);
    // The probe: nothing takes it from the hook, and another file reads a loadError of its own → caught, each shape.
    const own = {
        'a useState': `export default function O() { const [loadError, setLoadError] = useState(''); return <p>{loadError}</p>; }`,
        'a const': `export default function O() { const loadError = compute(); return <p>{loadError}</p>; }`,
        'a let at module scope': `let loadError = ''; export const O = () => <p>{loadError}</p>;`,
        'a parameter': `export default function O(loadError) { return <p>{loadError}</p>; }`,
        'a catch param': `export async function o() { try { await x(); } catch (loadError) { show(loadError); } }`,
        'an import': `import { loadError } from './x.js'; export const O = () => <p>{loadError}</p>;`,
        'an array destructure': `export default function O() { const [loadError] = pair(); return <p>{loadError}</p>; }`,
    };
    for (const [what, other] of Object.entries(own)) {
        assert.deepEqual(ofHook({ 'src/O.jsx': other }), [['loadError', ['loadError']]],
            `REGRESSION (${what}): another file's own loadError counted as a read of the hook's handed-out loadError`);
    }
    // Taken, then shadowed where it is read: the read is the inner binding's → caught.
    assert.deepEqual(ofHook({ 'src/T.jsx': `function T() { const { loadError } = useL(); return list.map((loadError) => <p>{loadError}</p>); }` }),
        [['loadError', ['loadError']]], 'a read of an inner binding of the name');
    // One function takes it and never draws it, another draws its own → caught.
    assert.deepEqual(ofHook({ 'src/T.jsx': `function A() { const [loadError, s] = useState(''); return <p>{loadError}</p>; }\nfunction B() { const { loadError } = useL(); return <p/>; }` }),
        [['loadError', ['loadError']]], 'taken in one function, never drawn; an own state drawn in another');
    // Taken from the hook (or the context, or props) and drawn → read.
    const taken = {
        'a destructure of the hook': `export default function T() { const { loadError } = useL(); return <p>{loadError}</p>; }`,
        'a destructure of the context': `export default function T() { const { loadError } = useApp(); return <p>{loadError}</p>; }`,
        'a renamed destructure': `export default function T() { const { loadError: le } = useL(); return <p>{le}</p>; }`,
        'a destructure with a default': `export default function T() { const { loadError = '' } = useL(); return <p>{loadError}</p>; }`,
        'props': `export default function T({ loadError }) { return <p>{loadError}</p>; }`,
        'in a condition': `export default function T() { const { loadError } = useL(); if (loadError) return null; return <p/>; }`,
    };
    for (const [what, reader] of Object.entries(taken)) {
        assert.deepEqual(ofHook({ 'src/T.jsx': reader, 'src/O.jsx': own['a useState'] }), [], `${what}: read`);
    }
    // A key's binding by another name reads nothing under the hook's key: `{ other: loadError }` took `other`.
    assert.deepEqual(ofHook({ 'src/T.jsx': `export default function T() { const { other: loadError } = useX(); return <p>{loadError}</p>; }` }),
        [['loadError', ['loadError']]], 'a value taken under another key');
});

test('(i) self-test: scope-aware — a catch param, a function or arrow param, or a nested declaration of the same name is not the state', () => {
    const reads = (body) => errorStatesOf(`function A() { const [error, setError] = useState(''); ${body} return <div/>; }`)[0].reads;
    assert.equal(reads(`const go = async () => { try { await x(); } catch (error) { console.log(error); setError(String(error)); } };`), 0,
        'REGRESSION: a catch param\'s uses counted as reads of the state');
    assert.equal(reads(`const f = (error) => error.message;`), 0, 'REGRESSION: an arrow param\'s use counted as a read');
    assert.equal(reads(`const f = ({ error }) => error;`), 0, 'a destructured param');
    assert.equal(reads(`function g(error = null) { return error; }`), 0, 'a function param with a default');
    assert.equal(reads(`const g = function error() { return error; };`), 0, 'a function expression\'s own name');
    assert.equal(reads(`if (x) { const error = 2; use(error); }`), 0, 'a nested block\'s declaration');
    assert.equal(reads(`for (const error of list) use(error);`), 0, 'a loop\'s declared name');
    assert.equal(reads(`items.forEach((it) => { const { error } = it; log(error); });`), 0, 'a declaration inside a nested function');
    // ...and outside the rebinding node it is the state.
    assert.equal(reads(`const go = async () => { try { await x(); } catch (e) { log(error); } };`), 1, 'a catch with its own name: the state read');
    assert.equal(reads(`const f = (e) => error || e;`), 1, 'an arrow with other params: the state read');
    assert.equal(reads(`try { x(); } catch (error) { log(error); } log(error);`), 1, 'only the read outside the catch counts');
    // The guard's written rule stands: a read in a condition or a hook's dependency list is a read.
    assert.equal(reads(`if (error) return null;`), 1, 'a condition-only read still counts');
    assert.equal(reads(`useEffect(() => { ping(); }, [error]);`), 1, 'a useEffect dependency still counts');
});

// ── (ii) ────────────────────────────────────────────────────────────────────────────────────────────────────────
test('(ii) no `throw new Error(<expr>.error)` under src/ without fallback words, unless named', () => {
    const found = [];
    for (const f of srcFiles()) for (const t of bareThrowsOf(read(f))) found.push({ file: f, ...t });
    const named = (x) => BARE_THROWS.some((b) => b.file === x.file && b.text === x.text);
    const unnamed = found.filter((x) => !named(x));
    assert.deepEqual(unnamed, [], `a throw whose words can be undefined — \`throw new Error(await readRefusal(res))\` (src/utils/refusalWords.js), or \`x.error || 'words'\`, or name it in BARE_THROWS:\n${unnamed.map((x) => `  ${x.file}:${x.line} ${x.text}`).join('\n')}`);
    const stale = BARE_THROWS.filter((b) => !found.some((x) => x.file === b.file && x.text === b.text));
    assert.deepEqual(stale, [], 'a named throw that is gone or now has fallback words — take its name out');
});

test('(ii) self-test: the scan catches every bare shape the sweep fixed, and passes a fallback', () => {
    const shapes = (s) => bareThrowsOf(s).map((t) => t.text);
    assert.deepEqual(shapes(`async function a(res) { const data = await res.json(); if (!res.ok) throw new Error(data.error); }`), ['async function a(res) { const data = await res.json(); if (!res.ok) throw new Error(data.error); }']);
    assert.equal(bareThrowsOf(`async function a(res) {\n  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }\n}`).length, 1, 'the DELETE shape');
    assert.equal(bareThrowsOf(`async function a(res) { throw new Error((await res.json()).error); }`).length, 1, 'read and thrown in one');
    assert.equal(bareThrowsOf(`function a(r) { throw new Error(r?.error); }`).length, 1, 'optional member');
    assert.equal(bareThrowsOf(`function a(r) { throw Error(r.error); }`).length, 1, 'Error called without new');
    assert.equal(bareThrowsOf(`function a(r, res) { throw new Error(r.error || \`The server returned \${res.status}.\`); }`).length, 0, 'fallback words');
    assert.equal(bareThrowsOf(`async function a(res) { throw new Error(await readRefusal(res)); }`).length, 0, 'the helper');
    assert.equal(bareThrowsOf(`function a(r) { throw new Error(r['error']); }`).length, 0, 'a computed member is not the shape (none in src)');
});

// ── (iii) ───────────────────────────────────────────────────────────────────────────────────────────────────────
// The files the sweep owns (state §0.243, save-cleanup Part 5): a body is read only after its response's ok check.
// Outside these files the shape is the filed rest of the sweep (OPEN_ITEMS) — not scanned here, not named one by one.
const SWEPT = [
    'src/Tabs/settings/data/ExportDetail.jsx', 'src/Tabs/settings/integrations/ApiKeysDetail.jsx',
    'src/Tabs/settings/integrations/AutomationsDetail.jsx', 'src/Tabs/settings/integrations/WebhooksDetail.jsx',
    'src/Tabs/settings/data/BackupDetail.jsx', 'src/Tabs/DocumentsTab.jsx', 'src/hooks/useDocuments.js',
    'src/Tabs/settings/dispatch/DispatchVehiclesDetail.jsx',
];
// A body read before its ok check by design: { file, text (the trimmed line), why }.
const BODY_FIRST = [
    { file: 'src/Tabs/settings/data/BackupDetail.jsx', text: 'data = await res.json().catch(() => null);   // an answer that is no JSON is no answer (state §0.205)',
        why: 'the restore\'s answer is read at any status: a refused restore\'s errors and counts are its words, read before res.ok is (§0.205)' },
];

test('(iii) in the files the sweep owns, no body is read before its response\'s ok check, unless named', () => {
    const found = [];
    let reads = 0;
    for (const f of SWEPT) { const r = bodyReadsBeforeOkOf(read(f)); reads += r.reads; for (const x of r.found) found.push({ file: f, ...x }); }
    assert.ok(reads >= 20, `the scan sees the body reads (${reads}) — fewer means it lost its shape`);
    const named = (x) => BODY_FIRST.some((b) => b.file === x.file && b.text === x.text);
    const unnamed = found.filter((x) => !named(x));
    assert.deepEqual(unnamed, [], `a body read before its ok check — a refusal's words undefined, or a page that was not JSON said as "Unexpected token '<'" — check \`res.ok\` first and \`throw new Error(await readRefusal(res))\`, or name it in BODY_FIRST:\n${unnamed.map((x) => `  ${x.file}:${x.line} ${x.text}`).join('\n')}`);
    const stale = BODY_FIRST.filter((b) => !found.some((x) => x.file === b.file && x.text === b.text));
    assert.deepEqual(stale, [], 'a named body read that is gone or now checked — take its name out');
    for (const b of BODY_FIRST) assert.ok(SWEPT.includes(b.file) && b.why.length > 10, `${b.file}: a swept file, with a reason`);
});

test('(iii) self-test: the scan catches a body read before the ok check, in each shape the sweep fixed, and passes the checked ones', () => {
    const at = (s) => bodyReadsBeforeOkOf(s).found.map((x) => x.name);
    // The four create paths before the fix: read, org check, then ok.
    assert.deepEqual(at(`async function c(askedOrg) { const res = await dbFetch('/x', { method: 'POST' }); const data = await res.json(); if (!stillOrg(askedOrg)) return; if (!res.ok) throw new Error(data.error || 'Failed'); }`), ['res']);
    assert.deepEqual(at(`async function c() { const res = await f(); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error); }`), ['res'], 'a .catch read');
    assert.deepEqual(at(`async function l() { const [a, b] = await Promise.all([f(), g()]); const [x, y] = await Promise.all([a.json(), b.json()]); if (!a.ok) throw 1; if (!b.ok) throw 2; }`), ['a', 'b'], 'ExportDetail\'s load: both bodies before both checks');
    assert.deepEqual(at(`async function l() { const r = await f(); const data = await r.json(); setRows(data.rows || []); }`), ['r'], 'no ok check at all (the backups\' load)');
    assert.deepEqual(at(`async function l() { const data = await (await f()).json(); }`), [''], 'a body read off no named response');
    assert.deepEqual(at(`async function l(other) { if (!other.ok) return; const r = await f(); return r.json(); }`), ['r'], 'another response\'s check is not this one\'s');
    assert.deepEqual(at(`function a(res) { if (!res.ok) return; }\nasync function b(res) { return res.json(); }`), ['res'], 'a check in another function is not this one\'s');
    // Checked first: passes.
    assert.deepEqual(at(`async function c() { const res = await f(); if (!res.ok) throw new Error(await readRefusal(res)); const data = await res.json(); }`), []);
    assert.deepEqual(at(`async function c(askedOrg) { const res = await f(); const why = res.ok ? '' : await readRefusal(res); const data = res.ok ? await res.json() : null; if (!stillOrg(askedOrg)) return; if (why) throw new Error(why); }`), [], 'the create paths\' shape');
    assert.deepEqual(at(`async function l() { const [a, b] = await Promise.all([f(), g()]); if (!a.ok) throw 1; if (!b.ok) throw 2; const [x, y] = await Promise.all([a.json(), b.json()]); }`), []);
    assert.deepEqual(at(`async function t(tRes) { if (!tRes.ok) { say(); } else { const j = await tRes.json().catch(() => null); } }`), [], 'the technicians\' read');
    assert.equal(bodyReadsBeforeOkOf('const s = `const data = await res.json();`;').reads, 0, 'code in a string is no read (ApiKeysDetail\'s sample)');
});

// ── The words (src/utils/refusalWords.js) — RUN ─────────────────────────────────────────────────────────────────
test('refusalWords: the server\'s words with its ref, else "The server returned N." — never undefined', () => {
    const res = (status) => ({ status });
    assert.equal(refusalWords(res(400), { error: 'listPrice is required', field: 'listPrice' }), 'listPrice is required');
    assert.equal(refusalWords(res(500), { error: 'Internal error', requestId: 'req_9' }), 'Internal error (ref req_9)');
    assert.equal(refusalWords(res(403), { error: 'Admin only' }), 'Admin only', 'a 403 keeps the server\'s words (refusalOf, the write paths\', does not)');
    assert.equal(refusalWords(res(404), {}), 'The server returned 404.');
    assert.equal(refusalWords(res(502), null), 'The server returned 502.', 'a body that was not JSON');
    assert.equal(refusalWords(res(500), { error: '   ' }), 'The server returned 500.', 'blank words are no words');
    assert.equal(refusalWords(res(500), { error: { message: 'x' } }), 'The server returned 500.', 'words that are not a string');
    assert.equal(refusalWords(res(500), 'Bad Gateway'), 'The server returned 500.', 'a body that is not an object');
    assert.equal(refusalWords(res(409), { error: ' In use ', requestId: '' }), 'In use', 'trimmed; an empty ref is none');
    assert.equal(refusalWords(undefined, undefined), 'The server returned no answer.');
});

test('readRefusal: reads the body once, as JSON when it is; never throws', async () => {
    const answer = (status, body) => ({ status, json: async () => { if (body instanceof Error) throw body; return body; } });
    assert.equal(await readRefusal(answer(400, { error: 'name is required' })), 'name is required');
    assert.equal(await readRefusal(answer(502, new SyntaxError("Unexpected token '<'"))), 'The server returned 502.', 'an HTML page');
    assert.equal(await readRefusal(answer(500, new TypeError('body used already'))), 'The server returned 500.');
    assert.equal(await readRefusal(answer(404, null)), 'The server returned 404.', 'an empty body');
});

// failureWords (§0.243's second fix round): the BackupDetail load banner and the Documents library said `e.message` — a
// 200 whose body was not JSON said "Unexpected token '<'", a request that never reached the server "Failed to fetch".
test('failureWords: a refusal\'s words pass through; a network or parse failure says plain words — never a parse error\'s', async () => {
    assert.equal(failureWords(new Error('Admin only')), 'Admin only', 'readRefusal\'s words, as thrown');
    assert.equal(failureWords(new Error('Internal error (ref req_9)')), 'Internal error (ref req_9)');
    assert.equal(failureWords(new Error('The server returned 502.')), 'The server returned 502.');
    for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
        assert.equal(failureWords(new TypeError(m)), 'The server could not be reached.', m);
    }
    assert.equal(failureWords(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")), 'Its answer could not be read.', 'REGRESSION: a parse error\'s words');
    assert.equal(failureWords(new TypeError("Cannot read properties of null (reading 'snapshots')")), 'Its answer could not be read.', 'a body of null read as an object');
    assert.equal(failureWords(new RangeError('Invalid time value')), 'Its answer could not be read.', 'a runtime error\'s words are not said');
    assert.equal(failureWords(new Error('   ')), 'Its answer could not be read.', 'blank words are no words');
    for (const v of [undefined, null, 'Failed to fetch', { message: 'x' }]) assert.equal(failureWords(v), 'Its answer could not be read.', String(v));
    // As the screens use it: the ok check first, readRefusal's words thrown, failureWords in the catch.
    const said = async (res) => { try { if (!res.ok) throw new Error(await readRefusal(res)); await res.json(); return ''; } catch (e) { return failureWords(e); } };
    const html = async () => { throw new SyntaxError("Unexpected token '<'"); };
    assert.equal(await said({ ok: false, status: 403, json: async () => ({ error: 'Admin only' }) }), 'Admin only');
    assert.equal(await said({ ok: false, status: 502, json: html }), 'The server returned 502.');
    assert.equal(await said({ ok: true, status: 200, json: html }), 'Its answer could not be read.', 'a 200 whose body is not JSON');
    assert.equal(await said({ ok: true, status: 200, json: async () => ({}) }), '');
});

test('the four settings panels throw the words, reading the body only after the ok check (5a)', () => {
    const S = 'src/Tabs/settings/';
    // ExportDetail 4 → 5: the ad-hoc export's refusal joined (§0.243's re-check). Moved pin (§0.243's second fix round):
    // ExportDetail's import names failureWords too — its Pause / Enable and Mark complete say their refusals.
    const ONE_HELPER = "import { readRefusal } from '../../../utils/refusalWords.js';";
    for (const [file, n, helper] of [[S + 'data/ExportDetail.jsx', 5, "import { readRefusal, failureWords } from '../../../utils/refusalWords.js';"], [S + 'integrations/ApiKeysDetail.jsx', 2, ONE_HELPER], [S + 'integrations/AutomationsDetail.jsx', 4, ONE_HELPER], [S + 'integrations/WebhooksDetail.jsx', 3, ONE_HELPER]]) {
        const s = code(read(file));
        assert.ok(s.includes(helper), `${file}: the one helper`);
        assert.equal(s.split('throw new Error(await readRefusal(res));').length - 1, n, `${file}: ${n} refusals said in the server's words`);
        assert.ok(!/const (d|data)\s*= await res\.json\(\);\s*if \(!res\.ok\) throw new Error\(\1\.error\)/.test(s), `${file}: REGRESSION — the body read before the ok check, its words undefined`);
    }
    // A refused run history is not "No runs yet" (the same file, same shape): it says it couldn't be opened.
    const a = code(read(S + 'integrations/AutomationsDetail.jsx'));
    order(between(a, '    const handleViewRuns = async (rule) => {', '\n    };'),
        "const res  = await dbFetch(`/.netlify/functions/automations?runs=${rule.id}`);",
        'if (!res.ok) throw new Error(await readRefusal(res));',
        'const data = await res.json();',
        "} catch(e) { setRunsFor({ rule, runs: [], error: e.message || 'No answer from the server.' }); }");
    order(a, ') : runsFor.error ? (', "The run history couldn't be opened", ') : runsFor.runs.length === 0 ? (');
    // The ad-hoc export and the panel's load: the ok checks first, each list's refusal named.
    const ex = code(read(S + 'data/ExportDetail.jsx'));
    order(between(ex, '    const handleAdHoc = async () => {', '\n    };'),
        'if (!res.ok) throw new Error(await readRefusal(res));', 'const data = await res.json();', 'const dl  = data.download;');
    order(between(ex, '        const load = async () => {', '\n        };'),
        "if (!schRes.ok)  throw new Error(`Failed to load schedules: ${await readRefusal(schRes)}`);",
        "if (!runRes.ok)  throw new Error(`Failed to load runs: ${await readRefusal(runRes)}`);",
        "if (!dsrRes.ok)  throw new Error(`Failed to load DSR queue: ${await readRefusal(dsrRes)}`);",
        'schRes.json(), runRes.json(), dsrRes.json(),');
});

// ExportDetail's Pause / Enable and Mark complete (§0.243's second fix round): they threw readRefusal's words, and the
// catch only put the row back — nothing said why. RUN: both extracted and run; WIRING: the banner kept until closed.
test('Export: a refused Pause / Enable or Mark complete puts the row back AND says why, kept until closed — RUN', async () => {
    const ex = code(read('src/Tabs/settings/data/ExportDetail.jsx'));
    const fns = between(ex, '    const handleToggle = async (sched) => {', '\n    };') + '\n    };\n'
        + between(ex, '    const handleDsrStatus = async (dsr, newStatus) => {', '\n    };') + '\n    };';
    // The banner as React holds it: a string set, or an updater over it (a landed retry clears its own row's words).
    const bannerSetter = (state) => (v) => { if (typeof v === 'function') state.banner = v(state.banner); else { state.banner = v; state.said.push(v); } };
    const run = async (answer) => {
        const state = { schedules: [{ id: 'sch_1', name: 'Weekly accounts', enabled: true }, { id: 'sch_2', name: 'Paused one', enabled: false }],
            dsr: [{ id: 'dsr_1', subject: 'a@x.test', status: 'open' }], said: [], banner: '' };
        const make = new Function('setSchedules', 'setDsrItems', 'dbFetch', 'readRefusal', 'failureWords', 'setActionError',
            `${fns}\nreturn { handleToggle, handleDsrStatus };`);
        const h = make((f) => { state.schedules = f(state.schedules); }, (f) => { state.dsr = f(state.dsr); },
            async () => { if (answer instanceof Error) throw answer; return answer; }, readRefusal, failureWords, bannerSetter(state));
        await h.handleToggle(state.schedules[0]);
        await h.handleToggle(state.schedules[1]);
        await h.handleDsrStatus(state.dsr[0], 'completed');
        return state;
    };
    const refused = await run({ ok: false, status: 403, json: async () => ({ error: 'Admin only' }) });
    assert.deepEqual(refused.schedules.map((s) => s.enabled), [true, false], 'put back');
    assert.equal(refused.dsr[0].status, 'open', 'put back');
    assert.deepEqual(refused.said, ['"Weekly accounts" was not paused — Admin only', '"Paused one" was not enabled — Admin only',
        'Request dsr_1 was not marked complete — Admin only'], 'REGRESSION: a refusal put the row back and said nothing');
    const html = await run({ ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token '<'"); } });
    assert.equal(html.said[0], '"Weekly accounts" was not paused — The server returned 502.');
    const offline = await run(new TypeError('Failed to fetch'));
    assert.deepEqual(offline.said, ['"Weekly accounts" was not paused — The server could not be reached.', '"Paused one" was not enabled — The server could not be reached.',
        'Request dsr_1 was not marked complete — The server could not be reached.'], 'REGRESSION: "Failed to fetch" said');
    const landed = await run({ ok: true, status: 200, json: async () => ({ schedule: { id: 'sch_1', name: 'Weekly accounts', enabled: false }, dsr: { id: 'dsr_1', status: 'completed' } }) });
    assert.deepEqual(landed.said, [], 'landed: nothing said');
    assert.equal(landed.dsr[0].status, 'completed');
    // A refusal, then its retry landing: the banner about that row goes; one about another row stands (the re-check).
    {
        const state = { schedules: [{ id: 'sch_1', name: 'Weekly accounts', enabled: true }], dsr: [{ id: 'dsr_1', status: 'open' }], said: [], banner: '' };
        const answers = [new TypeError('Failed to fetch'), { ok: true, status: 200, json: async () => ({ schedule: { id: 'sch_1', name: 'Weekly accounts', enabled: false } }) }];
        const h = new Function('setSchedules', 'setDsrItems', 'dbFetch', 'readRefusal', 'failureWords', 'setActionError', `${fns}\nreturn { handleToggle, handleDsrStatus };`)(
            (f) => { state.schedules = f(state.schedules); }, (f) => { state.dsr = f(state.dsr); },
            async () => { const a = answers.shift(); if (a instanceof Error) throw a; return a; }, readRefusal, failureWords, bannerSetter(state));
        await h.handleToggle(state.schedules[0]);
        assert.equal(state.banner, '"Weekly accounts" was not paused — The server could not be reached.');
        await h.handleToggle(state.schedules[0]);
        assert.equal(state.banner, '', 'REGRESSION: the banner still says "not paused" beside a schedule that paused');
        state.banner = 'Request dsr_9 was not marked complete — Admin only';
        answers.push({ ok: true, status: 200, json: async () => ({ schedule: { id: 'sch_1', name: 'Weekly accounts', enabled: true } }) });
        await h.handleToggle(state.schedules[0]);
        assert.equal(state.banner, 'Request dsr_9 was not marked complete — Admin only', 'another row\'s words stand until closed');
    }
    // Kept until closed (§18b123 rule 4): its own Close, never a timer; drawn on the panel.
    order(between(ex, '{actionError && (', '\n            )}'), '<div role="alert"', '✕ {actionError}', "<button onClick={() => setActionError('')}", 'Close');
    assert.ok(!/setTimeout\([^)]*setActionError/.test(ex), 'REGRESSION: the words closed on a timer');
});

// The three create paths (an API key, a webhook, an automation): the ok check first, the org checked after every read
// and before anything is done (each file's stillOrg in its place) — RUN, the lines extracted from each file.
const CREATE_LINES = [
    "const why  = res.ok ? '' : await readRefusal(res);",
    'const data = res.ok ? await res.json() : null;',
    'if (!stillOrg(askedOrg)) return;',
    'if (why) throw new Error(why);',
];
test('5a: a create refused says the server\'s words and parses no body; an org switched away from does nothing — RUN', async () => {
    const S = 'src/Tabs/settings/integrations/';
    for (const [file, from, to] of [
        [S + 'ApiKeysDetail.jsx', '    const handleCreate = async () => {', 'setResult(data);'],
        [S + 'WebhooksDetail.jsx', '    const handleCreate = async () => {', "setSecret(data.secret || '');"],
        [S + 'AutomationsDetail.jsx', '    const handleSave = async () => {', 'if (onSaved) onSaved(data.automation);'],
    ]) {
        const fnText = between(code(read(file)), from, to);
        order(fnText, 'const res  = await dbFetch(', ...CREATE_LINES);
        assert.ok(!/const data = await res\.json\(\);\s*if \(!stillOrg/.test(fnText), `${file}: REGRESSION — the body read before the ok check`);
        const lines = fnText.split('\n').map((l) => l.trim()).filter((l) => CREATE_LINES.includes(l));
        assert.deepEqual(lines, CREATE_LINES, `${file}: the four lines, together, in order`);
        const run = new Function('readRefusal', 'stillOrg', `return async (res, askedOrg) => { ${lines.join('\n')}\nreturn data; };`)(readRefusal, (o) => o === 'org_a');
        let parsed = 0;
        const answer = (status, body, json = true) => ({ ok: status < 300, status, json: async () => { parsed++; if (!json) throw new SyntaxError("Unexpected token '<'"); return body; } });
        await assert.rejects(run(answer(502, null, false), 'org_a'), (e) => e.message === 'The server returned 502.', `${file}: a page that was not JSON`);
        await assert.rejects(run(answer(400, { error: 'name is required' }), 'org_a'), (e) => e.message === 'name is required');
        parsed = 0;
        assert.deepEqual(await run(answer(200, { key: { id: 'k1' } }), 'org_a'), { key: { id: 'k1' } }, 'accepted: its answer');
        assert.equal(parsed, 1, 'the body read once');
        assert.equal(await run(answer(200, { key: { id: 'k1' } }), 'org_b'), undefined, 'an org switched away from: nothing done');
        assert.equal(await run(answer(403, { error: 'Admin only' }), 'org_b'), undefined, 'a refusal for an org switched away from: not said');
    }
});

// ── 5b BackupDetail's downloads — RUN ───────────────────────────────────────────────────────────────────────────
test('5b: a snapshot\'s file is saved only when the server sent it; a refusal saves nothing and says why', async () => {
    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    const fnText = between(bd, 'const saveSnapshotFile = async (id) => {', '\n};') + '\n};';
    const unstoppedText = bd.split('\n').find((l) => l.startsWith('const unstopped = '));
    assert.ok(unstoppedText, 'the words helper');
    const run = async (got) => {
        const did = [];
        const dbFetch = async (url) => { did.push(['fetch', url]); if (got instanceof Error) throw got; return got; };
        const document = {
            createElement: () => { const a = { click: () => did.push(['saved', a.download]) }; return a; },
            body: { appendChild: () => {}, removeChild: () => {} },
        };
        const URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
        class Blob { constructor(parts) { did.push(['blob', parts.join('')]); } }
        const save = new Function('dbFetch', 'readRefusal', 'document', 'URL', 'Blob', `${fnText}\nreturn saveSnapshotFile;`)(dbFetch, readRefusal, document, URL, Blob);
        const why = await save('bk_1');
        return { why, did };
    };
    const ok = await run({ ok: true, status: 200, text: async () => '{"entities":{}}' });
    assert.equal(ok.why, '');
    assert.deepEqual(ok.did, [['fetch', '/.netlify/functions/backup?id=bk_1&download=1'], ['blob', '{"entities":{}}'], ['saved', 'bk_1.json']]);
    const refused = await run({ ok: false, status: 403, json: async () => ({ error: 'Admin only' }), text: async () => '{"error":"Admin only"}' });
    assert.equal(refused.why, 'Admin only');
    assert.ok(!refused.did.some(([k]) => k === 'saved' || k === 'blob'), 'REGRESSION: the refusal\'s body saved to disk as bk_1.json — it reads as a backup');
    const crashed = await run({ ok: false, status: 502, json: async () => { throw new SyntaxError('<html>'); } });
    assert.equal(crashed.why, 'The server returned 502.');
    const offline = await run(new TypeError('Failed to fetch'));
    assert.equal(offline.why, 'The server could not be reached.');
    assert.ok(!offline.did.some(([k]) => k === 'saved'));
    const unstopped = new Function(`${unstoppedText}\nreturn unstopped;`)();
    assert.equal(unstopped('The server returned 502.'), 'The server returned 502');
    assert.equal(unstopped('Admin only'), 'Admin only');

    // Every download goes through it, and each refusal is said — the run's, the table's, the restore window's.
    assert.ok(!bd.includes('dlRes'), 'REGRESSION: a download of its own that saves whatever came back');
    assert.equal(bd.split('await saveSnapshotFile(').length - 1, 3, 'the restore window, the run, the table');
    assert.ok(bd.includes("if (why) { setError(`The snapshot was not downloaded (${unstopped(why)}). Please try again.`); return; }"), 'the restore window stays open saying why');
    // Moved pins (§0.243's re-check): the two download refusals are said in their own banner, naming the file —
    // setBackupError(`The backup was made, …`) and setBackupError(`Backup ${s.id} …`) became setDownloadError({ id, words }).
    assert.ok(bd.includes('if (why) setDownloadError({ id: data.id, words: `The backup was made, but its file was not downloaded (${unstopped(why)}). Download it from the table below.` });'), 'the run: the backup stands, its file not saved, said');
    assert.ok(bd.includes('if (why) setDownloadError({ id: s.id, words: `Backup ${s.id} was not downloaded (${unstopped(why)}). Please try again.` });\n                                                    else fileSaved(s.id);'), 'the table\'s Download: said, or its banner cleared');
    assert.ok(!bd.includes('/* silent */'), 'REGRESSION: the table\'s Download silent on a refusal');
    // Kept until closed (§18b123 rule 4): each banner closes by its own Close, never on a timer.
    order(between(bd, '{backupError && (', '\n            )}'), '✕ {backupError}', "<button onClick={() => setBackupError('')}", 'Close');
    order(between(bd, '{downloadError && (', '\n            )}'), '<div ref={downloadBannerRef} role="alert"', '✕ {downloadError.words}', '<button onClick={() => setDownloadError(null)}', 'Close');
    assert.ok(!/setTimeout\([^)]*set(Backup|Download)Error/.test(bd), 'REGRESSION: a refusal banner closed on a timer');
});

// The download banner clears once the file it names is saved — not on another file's save, and never a refused run's
// banner (§0.243's re-check: it stayed after the table's Download of the same file succeeded) — RUN and WIRING.
test('5b: the download banner clears when the file it names is saved; an unrelated error stays', () => {
    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    const clearedBy = new Function(`${bd.split('\n').find((l) => l.startsWith('const clearedBy = '))}\nreturn clearedBy;`)();
    const banner = { id: 'bk_1', words: 'Backup bk_1 was not downloaded (Admin only). Please try again.' };
    assert.equal(clearedBy(banner, 'bk_1'), null, 'its file saved: cleared');
    assert.equal(clearedBy(banner, 'bk_2'), banner, 'another file saved: the banner still true, kept');
    assert.equal(clearedBy(null, 'bk_1'), null);
    // Each save of a file clears through it: the table's Download and the restore window (the run saves a new file).
    assert.ok(bd.includes('const fileSaved = (id) => setDownloadError((banner) => clearedBy(banner, id));'));
    assert.ok(!between(bd, 'const fileSaved = ', '\n').includes('setBackupError'), 'REGRESSION: a file saved clears a refused run\'s banner');
    // ...checked for the org first (§0.175, tests/late-answers.test.mjs): an answer after a switch clears nothing.
    order(between(bd, '    const handleDownload = async () => {', '\n    };'), 'const askedOrg = requestOrg();', 'const why = await saveSnapshotFile(snap.id);',
        'if (!stillOrg(askedOrg)) return;', 'return; }', 'if (onSaved) onSaved(snap.id);', 'onClose();');
    assert.ok(bd.includes('<RestoreModal snap={restoreSnap} onSaved={fileSaved} onClose={()=>setRestoreSnap(null)}/>'));
    assert.ok(bd.includes('const RestoreModal = ({ snap, onClose, onSaved }) => {'));
    // Brought into view when said (the table's Download sits far below the banner): the smaller honest change, a ref
    // and scrollIntoView({ block: 'nearest' }) — the words stay in the one banner.
    order(bd, 'const downloadBannerRef = useRef(null);', 'useEffect(() => {', 'const el = downloadBannerRef.current;',
        "if (downloadError && el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });", '}, [downloadError]);');
});

// handleRunBackup, extracted and run (§0.243's re-check): the ok check first — a refusal's words, never the parse
// error of a page that was not JSON; nothing listed and no download tried for a refused run.
test('5b: Run backup now — a refusal says the server\'s words, lists nothing, downloads nothing — RUN', async () => {
    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    const fnText = between(bd, '    const handleRunBackup = async () => {', '\n    };') + '\n    };';
    const unstopped = new Function(`${bd.split('\n').find((l) => l.startsWith('const unstopped = '))}\nreturn unstopped;`)();
    const run = async (posted, saved = '') => {
        const did = { backupError: [], downloadError: [], listed: 0, saves: [] };
        const make = new Function('runningBackup', 'setRunningBackup', 'setBackupError', 'setBackupSuccess', 'setSnapshots', 'setDownloadError',
            'dbFetch', 'readRefusal', 'saveSnapshotFile', 'unstopped', `${fnText}\nreturn handleRunBackup;`);
        const go = make(false, () => {}, (v) => did.backupError.push(v), () => {}, () => { did.listed++; }, (v) => did.downloadError.push(v),
            async () => posted, readRefusal, async (id) => { did.saves.push(id); return saved; }, unstopped);
        await go();
        return did;
    };
    const html = { ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token '<'"); } };
    const r1 = await run(html);
    assert.deepEqual(r1.backupError, ['', 'The server returned 502.'], 'REGRESSION: the parse error said, not the status');
    assert.equal(r1.listed, 0); assert.deepEqual(r1.saves, []);
    const r2 = await run({ ok: false, status: 403, json: async () => ({ error: 'Admin only' }) });
    assert.deepEqual(r2.backupError, ['', 'Admin only']);
    const made = { ok: true, status: 200, json: async () => ({ id: 'bk_9', recordCount: 3, sizeLabel: '1 KB' }) };
    const r3 = await run(made);
    assert.deepEqual([r3.backupError, r3.listed, r3.saves, r3.downloadError], [[''], 1, ['bk_9'], []], 'made and saved: nothing said');
    const r4 = await run(made, 'Admin only');
    assert.deepEqual(r4.backupError, [''], 'its download refused is not a refused run');
    assert.deepEqual(r4.downloadError, [{ id: 'bk_9', words: 'The backup was made, but its file was not downloaded (Admin only). Download it from the table below.' }]);
});

// The backups' load and the schedule's save (§0.243's re-check; scan (iii) holds the order): a failed read is no count.
test('5b: a backups read that failed says so — never "No backups yet", "Never" or 0', () => {
    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    order(between(bd, "const res  = await dbFetch('/.netlify/functions/backup');", 'setSnapshots(data.snapshots || []);'),
        'if (!res.ok) throw new Error(await readRefusal(res));', 'const data = await res.json();');
    // Moved pin (§0.243's second fix round): `e.message` → failureWords(e) — never a parse error's or "Failed to fetch".
    assert.ok(bd.includes('setLoadError(`Failed to load backup data (${unstopped(failureWords(e))}). Please refresh.`);'), 'why it failed, in plain words');
    assert.ok(!/setLoadError\([^\n]*e\.message/.test(bd), 'REGRESSION: a parse error\'s words in the load banner');
    order(bd, ') : snapshots.length === 0 && loadError ? (', 'Nothing to show until the backups can be loaded.', ') : snapshots.length === 0 ? (', 'No backups yet.');
    assert.equal(bd.split("value={loading ? '…' : loadError ? '—' : ").length - 1, 3, 'the three counts say no number');
    // Moved pin (§0.243's second fix round): the save sends `changes`, and the schedule saved is the read one with them
    // (was `setSchedule(editSched)`).
    order(between(bd, '    const handleSaveSchedule = async () => {', '\n    };'), "method: 'PUT',", 'body: JSON.stringify(changes),',
        'if (!res.ok) throw new Error(await readRefusal(res));', 'const saved = { ...schedule, ...changes };', 'setSchedule(saved);');
});

// The schedule (§0.243's second fix round): until it was READ nothing shows it as stored and nothing saves it — a failed
// read drew the client's defaults as the stored schedule ("30 days") and Save PUT them over the real one (backup.mjs takes
// every field a body names) — and a save sends only the fields the Admin changed. RUN: handleSaveSchedule and
// scheduleChanges extracted and run; WIRING: the card, the form and its Save.
test('5b: the backup schedule is never saved from defaults never read; a save sends only what changed — RUN', async () => {
    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    const helpers = between(bd, 'const SCHEDULE_FIELDS = ', '\n};') + '\n};';
    const scheduleChanges = new Function(`${helpers}\nreturn scheduleChanges;`)();
    const stored = { id: 'sched_org_a', orgId: 'org_a', frequency: 'Weekly', timeUtc: '05:00', retentionDays: 14, notifyOnFailure: 'ops@x.test', updatedAt: '2026-11-01' };
    assert.deepEqual(scheduleChanges(stored, { ...stored }), {}, 'nothing changed');
    assert.deepEqual(scheduleChanges(stored, { ...stored, retentionDays: 30 }), { retentionDays: 30 }, 'only the field changed');
    assert.deepEqual(scheduleChanges(stored, { ...stored, id: 'x', orgId: 'org_b', updatedAt: 'y' }), {}, 'never a field the schedule form does not own');
    assert.deepEqual(scheduleChanges({ ...stored, notifyOnFailure: null }, { ...stored, notifyOnFailure: '' }), { notifyOnFailure: '' }, 'a cleared address is a change');

    const fnText = between(bd, '    const handleSaveSchedule = async () => {', '\n    };') + '\n    };';
    const run = async ({ read: wasRead, edited, answer }) => {
        const did = { sent: [], schedError: [], schedule: [], editSched: [], dirty: [] };
        const make = new Function('schedSaving', 'scheduleRead', 'schedule', 'editSched', 'setSchedSaving', 'setSchedError', 'setSchedSaved',
            'setSchedule', 'setEditSched', 'setSchedDirty', 'dbFetch', 'readRefusal', 'failureWords', 'scheduleChanges', 'setTimeout',
            `${fnText}\nreturn handleSaveSchedule;`);
        const defaults = { frequency: 'Daily', timeUtc: '03:00', retentionDays: 30, notifyOnFailure: '' };
        const go = make(false, wasRead, wasRead ? stored : defaults, edited, () => {}, (v) => did.schedError.push(v), () => {},
            (v) => did.schedule.push(v), (v) => did.editSched.push(v), (v) => did.dirty.push(v),
            async (url, opts) => { did.sent.push([url, opts.method, opts.body]); if (answer instanceof Error) throw answer; return answer; },
            readRefusal, failureWords, scheduleChanges, () => {});
        await go();
        return did;
    };
    const ok = { ok: true, status: 200, json: async () => ({ ok: true }) };
    // A failed read: the client's defaults, even "edited", are never sent.
    const unread = await run({ read: false, edited: { frequency: 'Daily', timeUtc: '03:00', retentionDays: 7, notifyOnFailure: '' }, answer: ok });
    assert.deepEqual(unread.sent, [], 'REGRESSION: a schedule never read was saved over the stored one');
    assert.deepEqual(unread.schedError, ['The schedule could not be read, so nothing was saved. Reload the page to try again.']);
    assert.deepEqual(unread.schedule, []);
    // Read, one field changed: only it is sent; the schedule saved is the read one with it.
    const one = await run({ read: true, edited: { ...stored, retentionDays: 30 }, answer: ok });
    assert.deepEqual(one.sent, [['/.netlify/functions/backup', 'PUT', '{"retentionDays":30}']], 'REGRESSION: the whole working copy sent');
    assert.deepEqual(one.schedule, [{ ...stored, retentionDays: 30 }]);
    assert.deepEqual(one.dirty, [false]);
    // Nothing changed: nothing sent, the form clean.
    const none = await run({ read: true, edited: { ...stored }, answer: ok });
    assert.deepEqual([none.sent, none.dirty, none.schedule], [[], [false], []]);
    // Refused or unreached: said, nothing kept as saved.
    const refused = await run({ read: true, edited: { ...stored, timeUtc: '06:00' }, answer: { ok: false, status: 403, json: async () => ({ error: 'Admin only' }) } });
    assert.deepEqual([refused.schedError, refused.schedule], [['', 'Admin only'], []]);
    const offline = await run({ read: true, edited: { ...stored, timeUtc: '06:00' }, answer: new TypeError('Failed to fetch') });
    assert.deepEqual(offline.schedError, ['', 'The server could not be reached.']);

    // WIRING: read only from an answer that had one; the card and the form wait for it; Save offered only then.
    assert.ok(bd.includes('const [scheduleRead, setScheduleRead] = useState(false);'));
    order(between(bd, "const res  = await dbFetch('/.netlify/functions/backup');", '} catch (e) {'),
        "if (data.schedule && typeof data.schedule === 'object') {", 'setSchedule(data.schedule);', 'setEditSched(data.schedule);', 'setScheduleRead(true);');
    assert.equal(bd.split('setScheduleRead(').length - 1, 1, 'set once, by the read');
    assert.ok(bd.includes("value={loading ? '…' : !scheduleRead ? '—' : `${schedule.retentionDays} days`}/>"), 'REGRESSION: the Retention card reads the client\'s default');
    order(between(bd, '<DataCard title="Schedule"', '</DataCard>'), 'scheduleRead && schedDirty ? (', "label={schedSaving ? 'Saving…' : 'Save schedule'}",
        '{loading ? (', ') : !scheduleRead ? (', "The schedule couldn't be read, so it can't be changed here.", ') : (', "onChange={e => updateSched('frequency', e.target.value)}");
});

// ── 5c a new quote that was refused opens no builder ────────────────────────────────────────────────────────────
test('5c: New quote stops when the create was refused (the banner says why), and opens the quote the hook saved', () => {
    const q = code(read('src/Tabs/QuotesTab.jsx'));
    const nq = between(q, '    const handleNewQuoteForOpp = async (oppId, template = null) => {', '\n    };');
    order(nq, 'const saved = await handleSaveQuote(payload, null);', 'if (saved) openConfigurator(oppId, saved.id || payload.id);');
    assert.equal(nq.split('openConfigurator(').length - 1, 1, 'REGRESSION: the builder opens on a quote that was never made');
    // The words: handleSaveQuote keeps them in quoteModalError, drawn on the tab's banner.
    assert.ok(q.includes('{(error || quoteModalError) && <div'), 'the banner draws the hook\'s words');
});

// ── 5d the Documents library says a read that failed ────────────────────────────────────────────────────────────
test('5d: the Documents library says it couldn\'t be opened, and why — never "No documents yet" over a failed read', () => {
    const hook = code(read('src/hooks/useDocuments.js'));
    const load = between(hook, 'const loadDocuments = useCallback(async (setDbOffline) => {', '}, []);');
    // Moved pin (§0.243's second fix round): `e.message || 'Failed to load documents'` → failureWords(e).
    order(load, 'if (!r.ok) throw new Error(await readRefusal(r));', 'const data = await r.json();', 'setDocsError(failureWords(e));');
    assert.ok(!/setDocsError\([^\n]*e\.message/.test(load), 'REGRESSION: a parse error\'s words in the library\'s banner');
    const tab = code(read('src/Tabs/DocumentsTab.jsx'));
    assert.ok(/documents = \[\], docsLoading, docsError,/.test(tab), 'the tab takes it');
    order(tab, '{docsError && (', "⚠ The documents couldn't be opened ({String(docsError).replace(/[.\\s]+$/, '')}). Reload the page to try again.", '{/* Table */}');
    assert.ok(tab.includes("{documents.length === 0 ? (docsError ? 'Nothing to show until the documents can be opened.' : canEdit ?"), 'REGRESSION: a failed read reads "No documents yet"');
    // No counts over a failed read (§0.243's re-check; §18b123 rule 4): the caption read "0 files · 0 B", the toolbar
    // "0 shown".
    order(tab, '{docsError ? (', "The library couldn't be read", ') : (', '{documents.length}</span>', '{fmtSize(totalSize)}</span>');
    assert.ok(tab.includes("{docsError ? \"Couldn't be read\" : `${filtered.length} shown`}"), 'the toolbar');
    assert.ok(!tab.includes('{filtered.length} shown</span>'), 'REGRESSION: "0 shown" over a failed read');
});
