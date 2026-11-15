// tests/test-waits.test.mjs
//
// A test waits by turns of the event loop, never by the clock (state §0.251, guide §18b126). On Windows a timer waits
// for the system tick — setTimeout(r, 0) is ~15 ms, not 1 — so tests/refusal-sweep.test.mjs's settle() (six zero
// timers) and its upload stub's timer cost 1,746 timers, about 27 s of the suite's 32.6 s, idle; every mutant of the
// harness reruns all of SUITES, and that one suite set its wall (35.4 s; a full run of 6,104 entries ~70 h, 15 Nov).
// The three suites that waited so (refusal-sweep, settings-saves, late-answers) wait by setImmediate turns since
// §0.251, as tests/merge-undo.test.mjs's tick already did: a turn runs after every promise already settled, as a zero
// timer did, without the clock. A "still pending?" check races the promise against 50 turns, never a 60 ms timer.
//
// THE GUARD: a parse of every test module under tests/ (tests/**/*.mjs but fixtures/) refuses every use of the clock,
// whatever its delay — a wait helper that passes its delay through, a timer built before the race it ends, a 2 ms
// "short" wait (the same ~15 ms tick):
//   - the global setTimeout or setInterval — called (optionally too), through .call / .apply, read by a computed key,
//     taken into a name, or destructured out of globalThis / window / global / self;
//   - the timers modules (node:timers, node:timers/promises) — setTimeout, setInterval, scheduler.wait and promises,
//     under any local name, imported, destructured, or reached through import() or require();
//   - AbortSignal.timeout and Atomics.wait.
// A use that needs the clock is NAMED below with its reason (one today: auth-gated-loads' token staged 150 ms after
// the load). Not the clock, and standing: a fake handed to code under test — a property, a parameter, a local declared
// at a function's top level or by var, a binding imported from another module — a fake installed over the global
// (`globalThis.setTimeout = fake`, `delete`, `typeof`), setImmediate, and text. A local declared only inside an inner
// block does not shadow (fail closed: rename it, or name the use). A test that fakes the global with node:test's
// mock.timers and calls it directly names the call, saying so.
// (Two reviews of §0.251, 15 Nov: the first form of this guard — a delay of 1 ms or less, a timer inside a
// Promise.race's own arguments — missed four classes of shape; the second form missed destructuring, import(),
// optional chains and block-scoped locals. Each shape is an example below.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const SELF = 'tests/test-waits.test.mjs';
const testFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const n of readdirSync(new URL(dir, ROOT))) {
            const p = `${dir}${n}`;
            if (statSync(new URL(p, ROOT)).isDirectory()) { if (n !== 'fixtures' && !n.startsWith('.')) walk(`${p}/`); }
            else if (n.endsWith('.mjs') && p !== SELF) out.push(p);
        }
    };
    walk('tests/');
    return out.sort();
};
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

// Each use of the clock a test needs, by file and the use's exact source text, with its reason.
const NAMED = [
    { file: 'tests/auth-gated-loads.test.mjs',
      text: "setTimeout(() => { globalThis.window.__getClerkToken = () => Promise.resolve('t'); }, 150)",
      why: 'the token is staged to arrive 150 ms after the load begins, while the load polls for it on its own 100 ms clock (storage.js waitForToken) — the time must pass, a turn would not' },
];

const CLOCK = new Set(['setTimeout', 'setInterval']);
const GLOBALS = new Set(['globalThis', 'window', 'global', 'self']);
const TIMER_MODULES = new Set(['timers', 'node:timers', 'timers/promises', 'node:timers/promises']);
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const kids = (n) => Object.keys(n).filter((k) => !SKIP.has(k))
    .flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((v) => v && typeof v === 'object' && typeof v.type === 'string');
const FUNCS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);
const isMember = (n) => n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression');
const isCall = (n) => n && (n.type === 'CallExpression' || n.type === 'OptionalCallExpression');
const keyOf = (m) => {
    const p = m.property;
    if (!m.computed) return p.type === 'Identifier' ? p.name : null;
    if (p.type === 'StringLiteral') return p.value;
    if (p.type === 'TemplateLiteral' && p.expressions.length === 0) return p.quasis[0].value.cooked;
    return null;
};
const timerModule = (a) => a && ((a.type === 'StringLiteral' && TIMER_MODULES.has(a.value))
    || (a.type === 'TemplateLiteral' && a.expressions.length === 0 && TIMER_MODULES.has(a.quasis[0].value.cooked)));

// The names a pattern binds.
const patternNames = (p, out = []) => {
    if (!p) return out;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') for (const q of p.properties) patternNames(q.type === 'RestElement' ? q.argument : q.value, out);
    else if (p.type === 'ArrayPattern') for (const q of p.elements) patternNames(q, out);
    else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
    else if (p.type === 'RestElement') patternNames(p.argument, out);
    return out;
};
// The names a function (or the program) declares for all of its body: its parameters, its own name, every var in it
// (but a nested function's), and the let / const / class / function declared among its body's top-level statements.
// A name declared only inside an inner block (a loop, an if, a catch) is not counted — failing closed: a real clock
// use beside it is still refused.
const declaredIn = (fn) => {
    const names = new Set(fn.params ? fn.params.flatMap((p) => patternNames(p)) : []);
    if (fn.type === 'FunctionExpression' && fn.id) names.add(fn.id.name);
    const body = fn.type === 'Program' ? fn : fn.body;
    const top = body.type === 'Program' || body.type === 'BlockStatement' ? body.body : [];
    for (const st of top) {
        const d = st.type === 'ExportNamedDeclaration' && st.declaration ? st.declaration : st;
        if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) names.add(d.id.name);
        if (d.type === 'VariableDeclaration') for (const v of d.declarations) patternNames(v.id).forEach((x) => names.add(x));
    }
    const walk = (n) => {
        if (n !== fn && FUNCS.has(n.type)) return;
        if (n.type === 'VariableDeclaration' && n.kind === 'var') for (const v of n.declarations) patternNames(v.id).forEach((x) => names.add(x));
        for (const k of kids(n)) walk(k);
    };
    if (body.type !== 'Program' && body.type !== 'BlockStatement') return names;
    walk(body);
    return names;
};

// Every use of the clock in one source: [{ line, text }] — `text` the call it makes when it is a call's callee (or
// the object of its .call / .apply), else the use itself.
const clockUsesIn = (src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
    const imports = new Map();   // local name -> 'clock' | 'ns' | 'scheduler' | 'local'
    for (const d of ast.program.body) {
        if (d.type !== 'ImportDeclaration') continue;
        for (const s of d.specifiers) {
            if (!TIMER_MODULES.has(d.source.value)) { imports.set(s.local.name, 'local'); continue; }   // a fake module's
            if (s.type === 'ImportSpecifier') {
                const name = s.imported.type === 'Identifier' ? s.imported.name : s.imported.value;
                imports.set(s.local.name, CLOCK.has(name) ? 'clock' : name === 'scheduler' ? 'scheduler' : name === 'promises' ? 'ns' : 'local');
            } else imports.set(s.local.name, 'ns');   // a namespace or a default import
        }
    }
    const found = [];
    const textOf = (n) => src.slice(n.start, n.end);
    const walk = (n, scopes, parent, parentKey) => {
        if (FUNCS.has(n.type)) scopes = [...scopes, declaredIn(n)];
        const kindOf = (name) => {
            if (imports.has(name)) return imports.get(name) === 'local' ? 'local' : imports.get(name);
            return scopes.some((s) => s.has(name)) ? 'local' : 'global';
        };
        // What an expression is: 'clock' (a timer function), 'ns' (a timers module), 'scheduler', 'globals' (the
        // global object), or null.
        const sourceOf = (e) => {
            if (!e) return null;
            if (e.type === 'Identifier') {
                const k = kindOf(e.name);
                if (k === 'clock' || k === 'ns' || k === 'scheduler') return k;
                if (k === 'global') return CLOCK.has(e.name) ? 'clock' : GLOBALS.has(e.name) ? 'globals' : null;
                return null;
            }
            if (isCall(e) && e.callee.type === 'Identifier' && e.callee.name === 'require' && timerModule(e.arguments[0])) return 'ns';
            if (e.type === 'ImportExpression' && timerModule(e.source)) return 'ns';
            if (isCall(e) && e.callee.type === 'Import' && timerModule(e.arguments[0])) return 'ns';
            if (e.type === 'AwaitExpression') return sourceOf(e.argument) === 'ns' ? 'ns' : null;
            if (!isMember(e)) return null;
            const key = keyOf(e), o = sourceOf(e.object);
            if (CLOCK.has(key) && (o === 'ns' || o === 'globals')) return 'clock';
            if ((key === 'promises' || key === 'default') && o === 'ns') return 'ns';
            if (key === 'scheduler' && o === 'ns') return 'scheduler';
            if (key === 'wait' && o === 'scheduler') return 'clock';
            if (e.object.type === 'Identifier' && kindOf(e.object.name) === 'global'
                && ((e.object.name === 'AbortSignal' && key === 'timeout') || (e.object.name === 'Atomics' && key === 'wait'))) return 'clock';
            if (key === 'globalThis' && o === 'globals') return 'globals';
            return null;
        };
        const use = (node, line = node.loc.start.line) => found.push({ line, text: textOf(node) });

        // Installing a fake over the global, or asking whether it is there, is not a use.
        // Only the slot assigned is skipped: the object it sits on, and a computed key, are read as any other.
        if (n.type === 'AssignmentExpression' && n.left.type !== 'ObjectPattern') {
            if (isMember(n.left)) { walk(n.left.object, scopes, n.left, 'object'); if (n.left.computed) walk(n.left.property, scopes, n.left, 'property'); }
            walk(n.right, scopes, n, 'right');
            return;
        }
        if (n.type === 'UnaryExpression' && (n.operator === 'typeof' || n.operator === 'delete')) return;
        // A timers module reached by import() or require() is a use, whatever is done with it.
        if ((isCall(n) && ((n.callee.type === 'Identifier' && n.callee.name === 'require' && timerModule(n.arguments[0]))
                || (n.callee.type === 'Import' && timerModule(n.arguments[0]))))
            || (n.type === 'ImportExpression' && timerModule(n.source))) { use(n); return; }
        // Destructured out of the global object, a timers module or the scheduler.
        const pattern = n.type === 'VariableDeclarator' ? [n.id, n.init] : n.type === 'AssignmentExpression' ? [n.left, n.right] : null;
        if (pattern && pattern[0].type === 'ObjectPattern') {
            const from = sourceOf(pattern[1]);
            const takes = from === 'globals' ? CLOCK : from === 'ns' ? new Set([...CLOCK, 'scheduler', 'promises']) : from === 'scheduler' ? new Set(['wait']) : null;
            if (takes && pattern[0].properties.some((q) => q.type === 'ObjectProperty' && takes.has(q.key.type === 'Identifier' ? q.key.name : q.key.value))) { use(n); return; }
        }
        if (sourceOf(n) === 'clock') {
            const callee = isCall(parent) && parentKey === 'callee';
            use(callee ? parent : n);
            return;
        }
        // x.call(...) / x.apply(...) on the clock: the call is the use.
        if (isCall(n) && isMember(n.callee) && ['call', 'apply'].includes(keyOf(n.callee)) && sourceOf(n.callee.object) === 'clock') { use(n); return; }
        if (n.type === 'ImportDeclaration') return;
        for (const k of Object.keys(n)) {
            if (SKIP.has(k)) continue;
            // A property's name is not a use: a non-computed member's property, an object key, a class member's key.
            if (k === 'property' && isMember(n) && !n.computed) continue;
            if (k === 'key' && !n.computed && /Property|Method/.test(n.type)) continue;
            // A name being bound is not a use: a declarator's pattern, a catch's parameter, a function's or class's name.
            if ((k === 'id' && (n.type === 'VariableDeclarator' || FUNCS.has(n.type) || /^Class/.test(n.type))) || (k === 'param' && n.type === 'CatchClause')) continue;
            const v = n[k];
            for (const c of (Array.isArray(v) ? v : [v])) if (c && typeof c === 'object' && typeof c.type === 'string') walk(c, scopes, n, k);
        }
    };
    walk(ast.program, [declaredIn(ast.program)], null, null);
    return found;
};

test('THE GUARD (§0.251): no test uses the clock — setTimeout, setInterval, the timers modules, AbortSignal.timeout, by any name or delay — but where it is named with its reason', () => {
    const files = testFiles();
    assert.ok(files.length >= 230, `every test module read (${files.length})`);
    assert.ok(files.some((f) => f.startsWith('tests/integration/')), 'the integration suites read');
    const uses = files.flatMap((f) => clockUsesIn(read(f)).map((u) => ({ file: f, ...u })));
    const named = (u) => NAMED.some((x) => x.file === u.file && x.text === u.text);
    for (const x of NAMED) {
        assert.equal(uses.filter((u) => u.file === x.file && u.text === x.text).length, 1, `the named use stands, once — or its entry goes: ${x.file}: ${x.text}`);
        assert.ok(x.why.length > 40, 'a named use says why');
    }
    const refused = uses.filter((u) => !named(u)).map((u) => `${u.file}:${u.line} ${u.text.slice(0, 120)}`);
    assert.deepEqual(refused, [], `a test uses the clock — a timer waits ~15 ms on Windows; wait by setImmediate turns, or name the use with its reason:\n${refused.join('\n')}`);
});

test('THE GUARD catches each shape — the old waits and every shape the two reviews found refused; turns, fakes and text stand', () => {
    const refused = [
        // the old waits
        'const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };',
        'const tick = () => new Promise((r) => setTimeout(r));',
        'const tick = () => new Promise((r) => globalThis.setTimeout(r, 1));',
        'class X { send() { setTimeout(() => { this.onload(); }, 0); } }',
        'const outcome = (pr) => Promise.race([pr, new Promise((r) => setTimeout(() => r(PENDING), 60))]);',
        // the first review's
        'const wait = (ms) => new Promise((r) => setTimeout(r, ms)); await wait(0);',
        'const timeout = new Promise((r) => setTimeout(() => r(P), 60)); await Promise.race([pr, timeout]);',
        'await new Promise((r) => setTimeout(r, 2));',
        "import { setTimeout as sleep } from 'node:timers/promises'; await sleep(0);",
        "import * as tp from 'node:timers/promises'; await tp.setTimeout(0);",
        "import timers from 'node:timers'; timers.setTimeout(r, 0);",
        'setTimeout.call(null, r, 0);',
        "globalThis['setTimeout'](r, 0);",
        'const t = setTimeout; t(r, 0);',
        'setInterval(poll, 0);',
        "import { scheduler } from 'node:timers/promises'; await scheduler.wait(0);",
        "import { setTimeout } from 'node:timers'; setTimeout(r, 0);",
        "setTimeout(r, '0');",
        // the second review's
        'const { setTimeout } = globalThis; setTimeout(r, 0);',
        'const { setTimeout: st } = globalThis;',
        "import timers from 'node:timers'; const { setTimeout } = timers;",
        "import { scheduler } from 'node:timers/promises'; const { wait } = scheduler;",
        "const tp = await import('node:timers/promises');",
        "const t = require('node:timers');",
        "import { promises } from 'node:timers'; await promises.setTimeout(0);",
        "import timers from 'node:timers'; await timers.promises.setTimeout(0);",
        'test("a", async () => { for (const setTimeout of []) {} await new Promise((r) => setTimeout(r, 5)); });',
        'function f() { if (x) { const setTimeout = 1; } setTimeout(r, 0); }',
        '{ const setTimeout = 1; } setTimeout(r, 0);',
        'globalThis?.setTimeout(r, 0);',
        'globalThis?.["setTimeout"](r, 0);',
        'globalThis[`setTimeout`](r, 0);',
        'await new Promise((r, j) => { AbortSignal.timeout(5).onabort = r; });',
        'Atomics.wait(view, 0, 0, 5);',
        'const orig = globalThis.setTimeout;',
    ];
    for (const src of refused) assert.equal(clockUsesIn(src).length, 1, `refused: ${src}`);
    const stands = [
        'const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };',
        'const outcome = (pr) => Promise.race([pr, (async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); return PENDING; })()]);',
        'const fake = { setTimeout: (f, ms) => { timers.push([f, ms]); } };',
        'const run = (setTimeout) => { setTimeout(f, 0); };',
        'function build() { const setTimeout = (f) => f(); setTimeout(g, 0); }',
        "const run = new Function('setTimeout', 'return 1;');",
        'st.setTimeout(f, 0);',
        'win?.setTimeout(f, 0);',
        'const t = opts?.setTimeout;',
        "assert.ok(!src.includes('setTimeout(r, 0)'));",
        "import { setImmediate } from 'node:timers'; await new Promise((r) => setImmediate(r));",
        'class Y { setTimeout() {} }',
        'globalThis.setTimeout = fake;',
        'delete globalThis.setTimeout;',
        "if (typeof setTimeout === 'function') x();",
        "import { setTimeout } from './fake-clock.mjs'; setTimeout(r, 0);",
        'const { setTimeout } = deps; setTimeout(f, 0);',
    ];
    for (const src of stands) assert.deepEqual(clockUsesIn(src), [], `stands: ${src}`);
});

test('the three suites wait by turns (§0.251) — six for a settle, one for a tick, fifty for "still pending" — and merge-undo as before', () => {
    const count = (s, needle) => s.split(needle).length - 1;
    const sweep = read('tests/refusal-sweep.test.mjs').replace(/\r\n/g, '\n');
    assert.equal(count(sweep, 'const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };'), 1, 'refusal-sweep: settle is six turns');
    assert.equal(count(sweep, '(async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); return P12C_PENDING; })()'), 1, 'refusal-sweep: pending after 50 turns');
    assert.equal(count(sweep, '        puts.push(this.url);\n        setImmediate(() => {'), 1, "refusal-sweep: R2's stub answers on a turn");
    for (const [f, outcomes] of [['tests/settings-saves.test.mjs', 1], ['tests/late-answers.test.mjs', 2]]) {
        const s = read(f).replace(/\r\n/g, '\n');
        assert.equal(count(s, 'const tick = () => new Promise((r) => setImmediate(r));'), 1, `${f}: tick is a turn`);
        assert.equal(count(s, '(async () => { for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r)); return PENDING; })()'), outcomes, `${f}: every outcome() pending after 50 turns`);
    }
    assert.ok(read('tests/merge-undo.test.mjs').includes('const tick = () => new Promise((r) => setImmediate(r));'), 'merge-undo: tick is a turn');
});
