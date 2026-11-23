// THE GUARD (state §0.287): an order pin holds only while both of its lines are there.
//
// The scoped run before the push of §0.284-§0.286 (23 Nov) found one survivor: "§0.279 lead-requests PUT: a deny that
// wrote nothing answered as denied" — the mutant deletes `if (!denied) return await missedRequest(orgId, data.id, 'deny');`.
// tests/owner-writes.test.mjs pinned that line as
//     assert.ok(deny.indexOf(LINE) < deny.indexOf('await writeAudit('), ...)
// and a line that is gone has index -1, which is before everything: the pin passed with its own line deleted. The full
// run on a05e7f1 caught the mutant only through the missed-writes floor (`seen >= 15`), and §0.286's missedOfficeJob
// made the count 16 — one to spare, so the deleted deny passed both.
//
// THE CLASS: a comparison of two positions — `a.indexOf(x) < b.indexOf(y)` (or lastIndexOf, findIndex, search; `<`, `<=`,
// `>`, `>=`), either side a call or a `const` holding one — passes when its EARLIER side is missing: the left of `<`, the
// right of `>`. The review of this batch found the held-in-a-variable form hiding worse: `const clear =
// del.indexOf(...); assert.ok(clear > del.indexOf("const forbidden = requireRole(auth, ['Admin'], headers);"))` was the
// one unit pin on the contacts wipe's Admin gate — the gate deleted, every unit test passed.
//
// A pin is such a comparison standing in what an assert holds true — `assert.ok(x)`, `assert(x)`, `assert.equal(x, true)`
// — through `&&` / `||` only; a side is a position call, or a name whose binding (the nearest block, function, loop head
// or catch around it that declares it) is declared with one (const, let or var) and never assigned again. Each must hold its
// earlier side present, by one of:
//   1. the same `&&` chain naming it present — `o.includes(x)` (a position with no start index), its position
//      `>= 0`, `> k` (k >= -1), `!== -1`, or as the later side of a STRICT comparison (`<` / `>`) with another position
//      (later than something is at least 0);
//   2. an assert holding one of those true (never one that can say it is absent: `assert.equal(x, false)`), or
//      `assert.notEqual(v, -1)`, standing BEFORE the pin as a statement of a block the pin stands in — so it ran
//      whenever the pin runs (one after it can be skipped by a return or continue between);
//   3. a loop's previous entry — `o.indexOf(arr[i - 1])` inside `arr.forEach((l, i) => ...)` whose body asserts
//      `o.includes(l)` as a statement of its own before the pin, only declarations and expressions before it (no `if`
//      or `return` to pass entry 0 by): each entry was asserted present when it was the current one.
// Out of reach: a position reached through a helper's return, an object's field or a destructured name; a comparison
// under `!` or in a branch of `?:`; an assert under another name (`t.assert`, an imported `ok`). A presence check is
// matched to the pin by its spelling, not its binding: one about another binding of the same name (a shadowing param,
// catch or loop name), or taken before the string or needle is assigned again, holds it. A `var` declared twice in a
// scope reads as its last. None of these is a pin in the tests today — the third review instrumented every one of the
// 368 pins judged (every presence check names the same bindings as its pin; no hold has an assignment between); filed
// (OPEN_ITEMS §6). The made-up cases below fix what the scan reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const PINS_MEASURED = 368;   // the pins judged over tests/ and tests/integration/, 23 Nov (§0.287)
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

const POSITION = new Set(['indexOf', 'lastIndexOf', 'findIndex', 'search']);
const isCall = (n) => n && (n.type === 'CallExpression' || n.type === 'OptionalCallExpression');
const isMember = (n) => n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression');
const propName = (m) => (!m.computed && m.property.type === 'Identifier' ? m.property.name
    : m.computed && m.property.type === 'StringLiteral' ? m.property.value : null);
const isPositionCall = (n) => isCall(n) && isMember(n.callee) && POSITION.has(propName(n.callee)) && n.arguments.length >= 1;
const isFunction = (n) => /Function|Method/.test(n.type);   // functions, arrows, object and class methods
const ORDERS = new Set(['<', '<=', '>', '>=']);
// A node that opens a scope for the names declared in it (a block's lets and consts, a function's params, a loop's head,
// a catch's param).
const isScope = (n) => n.type === 'Program' || n.type === 'BlockStatement' || isFunction(n) || n.type === 'CatchClause'
    || n.type === 'ForStatement' || n.type === 'ForInStatement' || n.type === 'ForOfStatement';

const parseOf = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });

// Every node with its parent chain, depth first.
function walk(node, visit, parents = []) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parents);
    const next = [...parents, node];
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end' || /Comments$/.test(key)) continue;
        const v = node[key];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, next));
        else if (v && typeof v.type === 'string') walk(v, visit, next);
    }
}

// The conjuncts of an `&&` chain (parentheses are not nodes).
const conjuncts = (n) => (n.type === 'LogicalExpression' && n.operator === '&&' ? [...conjuncts(n.left), ...conjuncts(n.right)] : [n]);

const isAssertCall = (c, names) => isCall(c) && isMember(c.callee) && c.callee.object.type === 'Identifier' && c.callee.object.name === 'assert'
    && names.includes(propName(c.callee));
// The argument an assert holds true: `assert.ok(x)`, `assert(x)`, `assert.equal(x, true)` / strictEqual — else null.
const truthyArg = (c) => {
    if (!isCall(c) || !c.arguments.length) return null;
    if ((c.callee.type === 'Identifier' && c.callee.name === 'assert') || isAssertCall(c, ['ok'])) return c.arguments[0];
    if (isAssertCall(c, ['equal', 'strictEqual']) && c.arguments[1]?.type === 'BooleanLiteral' && c.arguments[1].value === true) return c.arguments[0];
    return null;
};

// Every order pin in `src` that stands in an assert, and those of them whose earlier side nothing holds present:
// { pins, unheld: [{ line, text, start, end, held, bare }] } — `held` the presence to write beside it, `bare` whether it
// goes straight in (an `&&` chain or the assert's argument) or in parentheses with the pin.
export function readPins(src) {
    const ast = parseOf(src);
    const text = (x) => src.slice(x.start, x.end);
    const num = (x) => (x.type === 'NumericLiteral' ? x.value
        : x.type === 'UnaryExpression' && x.operator === '-' && x.argument.type === 'NumericLiteral' ? -x.argument.value : null);

    // Each scope's own names: its params, lets, consts, vars (as their block's), function and class names and catch param, each a binding
    // { init } — `init` the position call a const or let is declared with, else null. A binding assigned anywhere after its
    // declaration (an `=`, `+=`, `++`) is no position: its value is not the call's.
    const scopes = new Map();
    const bind = (owner, name, init) => { if (!scopes.has(owner)) scopes.set(owner, new Map()); scopes.get(owner).set(name, { init, assigned: false }); };
    const ownerOf = (parents, fn) => [...parents].reverse().find(fn) || ast.program;
    const patternNames = (p) => (!p ? [] : p.type === 'Identifier' ? [p.name] : p.type === 'AssignmentPattern' ? patternNames(p.left)
        : p.type === 'RestElement' ? patternNames(p.argument) : p.type === 'ObjectPattern' ? p.properties.flatMap((q) => patternNames(q.value || q.argument))
        : p.type === 'ArrayPattern' ? p.elements.flatMap(patternNames) : []);
    walk(ast.program, (n, parents) => {
        if (isFunction(n)) {
            for (const name of n.params.flatMap(patternNames)) bind(n, name, null);
            if (n.id && n.type === 'FunctionDeclaration') bind(ownerOf(parents, (x) => isScope(x)), n.id.name, null);
        }
        if (n.type === 'ClassDeclaration' && n.id) bind(ownerOf(parents, (x) => isScope(x)), n.id.name, null);
        if (n.type === 'CatchClause' && n.param) for (const name of patternNames(n.param)) bind(n, name, null);
        if (n.type === 'VariableDeclarator') {
            const owner = ownerOf(parents, (x) => isScope(x));
            for (const name of patternNames(n.id)) bind(owner, name, n.id.type === 'Identifier' && isPositionCall(n.init) ? n.init : null);
        }
    });
    // The binding a name means where it is read: the nearest scope around it that declares it.
    const bindingOf = (name, parents) => {
        for (const owner of [...parents].reverse().filter(isScope)) {
            const m = scopes.get(owner);
            if (m && m.has(name)) return m.get(name);
        }
        return null;
    };
    walk(ast.program, (n, parents) => {
        // An `=` / `+=` / `++` onto a name, a destructuring assignment onto it, or a for-of / for-in head naming it.
        const target = n.type === 'AssignmentExpression' ? n.left : n.type === 'UpdateExpression' ? n.argument
            : (n.type === 'ForOfStatement' || n.type === 'ForInStatement') && n.left.type !== 'VariableDeclaration' ? n.left : null;
        for (const name of patternNames(target)) { const b = bindingOf(name, parents); if (b) b.assigned = true; }
    });
    // A side of a comparison as the position call it is, or the one its name holds.
    const callOf = (side, parents) => {
        if (isPositionCall(side)) return side;
        if (side.type !== 'Identifier') return null;
        const b = bindingOf(side.name, parents);
        return b && b.init && !b.assigned ? b.init : null;
    };
    const pinSides = (n, parents) => {
        if (n.type !== 'BinaryExpression' || !ORDERS.has(n.operator)) return null;
        const l = callOf(n.left, parents), r = callOf(n.right, parents);
        if (!l || !r) return null;
        const before = n.operator === '<' || n.operator === '<=';
        return { earlier: before ? n.left : n.right, earlierCall: before ? l : r, later: before ? n.right : n.left, strict: n.operator === '<' || n.operator === '>' };
    };

    // Does `c` (a conjunct) say the earlier side — `e` as written, `p` the call it is — is present?
    const names = (e, p) => new Set([text(e), text(p)]);
    const saysPresent = (c, e, p, parents) => {
        const ns = names(e, p);
        if (isCall(c) && isMember(c.callee) && propName(c.callee) === 'includes' && c.arguments.length >= 1
            && p.arguments.length === 1 && /^(indexOf|lastIndexOf)$/.test(propName(p.callee))
            && text(c.callee.object) === text(p.callee.object) && text(c.arguments[0]) === text(p.arguments[0])) return true;
        if (c.type === 'BinaryExpression') {
            const l = ns.has(text(c.left)), r = ns.has(text(c.right));
            const nr = num(c.right), nl = num(c.left);
            if (l && nr !== null && ((c.operator === '>=' && nr >= 0) || (c.operator === '>' && nr >= -1) || ((c.operator === '!==' || c.operator === '!=') && nr === -1))) return true;
            if (r && nl !== null && ((c.operator === '<=' && nl >= 0) || (c.operator === '<' && nl >= -1) || ((c.operator === '!==' || c.operator === '!=') && nl === -1))) return true;
            const other = pinSides(c, parents);
            if (other && other.strict && ns.has(text(other.later))) return true;
        }
        return false;
    };
    const assertSays = (stmt, e, p, parents, pin) => {
        if (stmt.type !== 'ExpressionStatement') return false;
        const c = stmt.expression;
        const arg = truthyArg(c);
        if (arg) return conjuncts(arg).some((x) => x !== pin && saysPresent(x, e, p, parents));
        if (isAssertCall(c, ['notEqual', 'notStrictEqual']) && c.arguments.length >= 2) return names(e, p).has(text(c.arguments[0])) && num(c.arguments[1]) === -1;
        return false;
    };

    const unheld = [];
    let pins = 0;
    walk(ast.program, (n, parents) => {
        const sides = pinSides(n, parents);
        if (!sides) return;
        // A pin stands in the argument an assert holds true, reached through `&&` / `||` only.
        let k = parents.length - 1, top = n;
        while (k >= 0 && parents[k].type === 'LogicalExpression') { top = parents[k]; k--; }
        if (k < 0 || truthyArg(parents[k]) !== top) return;
        pins += 1;
        const { earlier: e, earlierCall: p } = sides;
        // 1. The `&&` chain it stands in.
        let chainTop = n, j = parents.length - 1;
        while (j >= 0 && parents[j].type === 'LogicalExpression' && parents[j].operator === '&&') { chainTop = parents[j]; j--; }
        if (conjuncts(chainTop).some((c) => c !== n && saysPresent(c, e, p, parents))) return;
        // 2. An assert standing BEFORE the pin in a block the pin stands in, up to its function: it ran whenever the pin runs.
        const fnAt = parents.map((x, i) => [x, i]).reverse().find(([x]) => isFunction(x));
        for (let b = fnAt ? fnAt[1] : 0; b < parents.length; b++) {
            const block = parents[b];
            if (block.type !== 'BlockStatement' && block.type !== 'Program') continue;
            const holder = parents[b + 1] || n;   // the statement of this block the pin stands in
            const at = block.body.indexOf(holder);
            if (at > 0 && block.body.slice(0, at).some((stmt) => assertSays(stmt, e, p, parents, n))) return;
        }
        // 3. A loop's previous entry: o.indexOf(arr[i - 1]) inside arr.forEach((l, i) => { assert.ok(o.includes(l)); ... }),
        //    the includes a statement of the body before the pin's, nothing before it that can leave the entry unchecked.
        const arg = p.arguments[0];
        if (fnAt && p === e && p.arguments.length === 1 && /^(indexOf|lastIndexOf)$/.test(propName(p.callee))   // includes stands only for these
            && isMember(arg) && arg.computed && arg.property.type === 'BinaryExpression' && arg.property.operator === '-'
            && num(arg.property.right) === 1) {
            const fn = fnAt[0], loop = parents[fnAt[1] - 1];
            const [entry, index] = fn.params;
            if (loop && isCall(loop) && loop.arguments[0] === fn && isMember(loop.callee) && propName(loop.callee) === 'forEach'
                && text(loop.callee.object) === text(arg.object) && entry?.type === 'Identifier' && index?.type === 'Identifier'
                && text(arg.property.left) === index.name && fn.body.type === 'BlockStatement') {
                const body = fn.body.body;
                const pinAt = body.indexOf(parents[fnAt[1] + 2] || n);
                const incAt = body.findIndex((stmt) => stmt.type === 'ExpressionStatement' && truthyArg(stmt.expression)
                    && conjuncts(truthyArg(stmt.expression)).some((c) => isCall(c) && isMember(c.callee) && propName(c.callee) === 'includes'
                        && text(c.callee.object) === text(p.callee.object) && c.arguments[0]?.type === 'Identifier' && c.arguments[0].name === entry.name));
                // Only declarations and expressions before it: no `if`, `return` or loop that could pass entry 0 by.
                if (incAt >= 0 && pinAt > incAt && body.slice(0, incAt).every((stmt) => stmt.type === 'VariableDeclaration' || stmt.type === 'ExpressionStatement')) return;
            }
        }
        const presence = e === p && p.arguments.length === 1 && /^(indexOf|lastIndexOf)$/.test(propName(p.callee)) && !p.callee.optional && p.callee.type === 'MemberExpression'
            ? `${text(p.callee.object)}.includes(${text(p.arguments[0])})` : `${text(e)} >= 0`;
        const parent = parents[parents.length - 1];
        const bare = truthyArg(parent) === n || (parent.type === 'LogicalExpression' && parent.operator === '&&');
        unheld.push({ line: n.loc.start.line, text: text(n).replace(/\s+/g, ' ').slice(0, 140), start: n.start, end: n.end, held: presence, bare });
    });
    return { pins, unheld };
}
export const unheldPins = (src) => readPins(src).unheld;

test('RUN — the scan on made-up code: an order pin whose earlier side can go missing is reported; each way of holding it present is taken; nothing else is', () => {
    const one = (body) => unheldPins(`import assert from 'node:assert/strict';\nconst s = 'ab', o = 'ab', other = [];\n${body}\n`);
    // The survivor's shape, and its mirror.
    assert.equal(one("assert.ok(s.indexOf('x') < s.indexOf('b'), 'x before b');").length, 1, 'REGRESSION: a pin passing with its first line gone is not reported');
    assert.equal(one("assert.ok(s.indexOf('b') > s.indexOf('x'));").length, 1, 'REGRESSION: the mirror (the right of >) is not reported');
    assert.equal(one("assert.ok(s.lastIndexOf('x') <= s.lastIndexOf('b'));").length, 1, 'lastIndexOf and <= read too');
    assert.equal(one("assert.ok(s.search(/x/) < s.search(/b/));").length, 1, 'search read too');
    assert.equal(one("assert.ok(s?.indexOf('x') < s['indexOf']('b'));").length, 1, 'an optional call and a computed name read too');
    assert.equal(one("assert(s.indexOf('x') < s.indexOf('b'));").length, 1, 'a bare assert read too');
    assert.equal(one("const t = () => { assert.ok(s.indexOf('x') < s.indexOf('b')); };").length, 1, 'inside a function');
    assert.equal(one("assert.ok(s.includes('q') || s.indexOf('x') < s.indexOf('b'));").length, 1, 'through an `||`');
    assert.match(one("assert.ok(s.indexOf('a') < s.indexOf('x'));")[0].text, /indexOf\('a'\) < /, 'the pin reported, for its earlier side');
    // The variable form (the review: the contacts wipe's Admin gate).
    assert.equal(one("const clear = s.indexOf('wipe');\nassert.ok(clear > s.indexOf('gate'));").length, 1, 'REGRESSION: a position held in a const, its earlier side a call, not reported');
    assert.equal(one("const at = s.indexOf('x'), end = s.indexOf('b');\nassert.ok(at < end);").length, 1, 'REGRESSION: both sides held in consts not reported');
    assert.equal(one("const t = () => { const top = s.indexOf('b'); assert.ok(top > s.indexOf('x') && top < s.indexOf('z')); };").length, 1, 'a const in a function');
    assert.deepEqual(one("const at = s.indexOf('x');\nassert.ok(at >= 0);\nassert.ok(at < s.indexOf('b'));"), [], 'a const asserted present by name');
    assert.deepEqual(one("const at = s.indexOf('x');\nassert.notEqual(at, -1);\nassert.ok(at < s.indexOf('b'));"), [], 'assert.notEqual(at, -1)');
    assert.deepEqual(one("const at = s.indexOf('x');\nassert.ok(s.includes('x'));\nassert.ok(at < s.indexOf('b'));"), [], 'a const whose call is asserted by includes');
    assert.equal(one("let at = s.indexOf('x');\nat = 0;\nassert.ok(at < s.indexOf('b'));").length, 0, 'a name assigned again is no position (out of reach)');
    // Held: 1. the same chain.
    assert.deepEqual(one("assert.ok(s.includes('x') && s.indexOf('x') < s.indexOf('b'));"), []);
    assert.deepEqual(one("assert.ok(s.indexOf('x') >= 0 && s.indexOf('x') < s.indexOf('b'));"), []);
    assert.deepEqual(one("assert.ok(s.indexOf('x') > -1 && s.indexOf('x') < s.indexOf('b'));"), []);
    assert.deepEqual(one("assert.ok(s.indexOf('x') > 0 && s.indexOf('x') < s.indexOf('b'));"), []);
    assert.deepEqual(one("assert.ok(s.indexOf('x') !== -1 && s.indexOf('x') < s.indexOf('b'));"), []);
    assert.deepEqual(one("assert.ok(s.includes('a') && s.indexOf('x') < s.indexOf('b') && s.indexOf('x') > s.indexOf('a'));"), [], 'x held as later than a; a held by its includes');
    assert.equal(one("assert.ok(s.indexOf('x') < s.indexOf('b') && s.indexOf('x') > s.indexOf('a'));").length, 1, 'x held as later than a — but a itself can go missing');
    // ...not by a later side of a non-strict comparison: two -1s pass `>=`.
    assert.equal(one("assert.ok(s.includes('a') && s.indexOf('x') >= s.indexOf('a') && s.indexOf('x') < s.indexOf('b'));").length, 1,
        'REGRESSION: the later side of a `>=` taken as present (both missing: -1 >= -1)');
    // ...not an includes standing for a position from a start index.
    assert.equal(one("assert.ok(s.includes('x') && s.indexOf('x', 5) < s.indexOf('b'));").length, 1, 'REGRESSION: includes taken for indexOf(x, from)');
    assert.deepEqual(one("assert.ok(s.indexOf('x', 5) >= 0 && s.indexOf('x', 5) < s.indexOf('b'));"), [], 'its own position >= 0 holds it');
    // 2. An assert in a block the pin stands in.
    assert.deepEqual(one("assert.ok(s.includes('x'), 'x');\nassert.ok(s.indexOf('x') < s.indexOf('b'));"), []);
    assert.deepEqual(one("const t = () => { assert.ok(s.includes('x')); assert.ok(s.indexOf('x') < s.indexOf('b')); };"), []);
    assert.deepEqual(one("const t = () => { assert.ok(s.includes('x')); for (const f of other) { assert.ok(s.indexOf('x') < s.indexOf('b')); } };"), [], 'an enclosing block\'s');
    // ...not about another string or text, in another function, under a branch, or one that can say it is absent.
    assert.equal(one("assert.ok(s.includes('y'));\nassert.ok(s.indexOf('x') < s.indexOf('b'));").length, 1, 'REGRESSION: another line\'s presence taken for this one\'s');
    assert.equal(one("assert.ok(o.includes('x'));\nassert.ok(s.indexOf('x') < s.indexOf('b'));").length, 1, 'REGRESSION: another text\'s presence taken for this one\'s');
    assert.equal(one("const u = () => assert.ok(s.includes('x'));\nconst t = () => { assert.ok(s.indexOf('x') < s.indexOf('b')); };").length, 1, 'REGRESSION: another function\'s assert taken');
    assert.equal(one("const t = () => { const u = () => assert.ok(s.includes('x')); assert.ok(s.indexOf('x') < s.indexOf('b')); };").length, 1, 'REGRESSION: a nested closure\'s assert taken');
    assert.equal(one("const t = () => { if (other.length) assert.ok(s.includes('x')); assert.ok(s.indexOf('x') < s.indexOf('b')); };").length, 1, 'REGRESSION: an assert under a branch taken');
    assert.equal(one("const t = () => { for (const f of other) { assert.ok(s.includes('x')); } assert.ok(s.indexOf('x') < s.indexOf('b')); };").length, 1, 'REGRESSION: a loop body\'s assert taken (it may never run)');
    assert.equal(one("assert.equal(s.includes('x'), false);\nassert.ok(s.indexOf('x') < s.indexOf('b'));").length, 1, 'REGRESSION: assert.equal (absent!) taken as present');
    // 3. A loop's previous entry, each entry asserted present in the loop, as a statement of its own.
    assert.deepEqual(one("const order = (t, ...lines) => lines.forEach((l, i) => { assert.ok(t.includes(l)); if (i) assert.ok(t.indexOf(l) > t.indexOf(lines[i - 1])); });"), []);
    assert.equal(one("const order = (t, ...lines) => lines.forEach((l, i) => { if (i) assert.ok(t.indexOf(l) > t.indexOf(lines[i - 1])); });").length, 1,
        'REGRESSION: a loop that never asserts its entries present taken as holding the previous one');
    assert.equal(one("const order = (t, ...lines) => lines.forEach((l, i) => { if (i) { assert.ok(t.includes(l)); assert.ok(t.indexOf(l) > t.indexOf(lines[i - 1])); } });").length, 1,
        'REGRESSION: entry 0 never asserted (the includes under `if (i)`) taken as holding it');
    assert.equal(one("const order = (t, ...lines) => lines.forEach((l, i) => { assert.ok(t.includes(l)); if (i) assert.ok(t.indexOf(l) > t.indexOf(other[i - 1])); });").length, 1,
        'REGRESSION: another list\'s previous entry taken');
    // Not a pin: outside an assert, or under a `!`.
    assert.deepEqual(one("if (s.indexOf('x') < s.indexOf('b')) other.push(1);"), []);
    assert.deepEqual(one("const sorted = other.filter((a) => s.indexOf(a) < s.indexOf('b'));"), []);
    // What to write beside each: an includes for a plain indexOf, else the position >= 0.
    assert.equal(one("assert.ok(s.indexOf('x') < s.indexOf('b'));")[0].held, "s.includes('x')");
    assert.equal(one("const clear = s.indexOf('w');\nassert.ok(clear > s.indexOf('gate'));")[0].held, "s.includes('gate')");
    assert.equal(one("const at = s.indexOf('x');\nassert.ok(at < s.indexOf('b'));")[0].held, 'at >= 0');
    assert.equal(one("assert.ok(s.search(/x/) < s.search(/b/));")[0].held, 's.search(/x/) >= 0');
    // The second review's (each made-up case red with the scan as the first review left it).
    assert.equal(one("const t1 = () => { const at = s.indexOf('x'); assert.ok(at < s.indexOf('b')); };\nconst t2 = () => { let at = 0; at = 1; };").length, 1,
        'REGRESSION: another function\'s `at` assigned hid this one\'s pin (one name set for the file)');
    assert.equal(one("const t = () => { assert.ok(s.indexOf('x') < s.indexOf('b')); if (other.length === 0) return; assert.ok(s.includes('x')); };").length, 1,
        'REGRESSION: an assert AFTER the pin taken — a return between skips it');
    assert.equal(one("assert.ok(s.includes('x'));\nconst o2 = { m() { assert.ok(s.indexOf('x') < s.indexOf('b')); } };").length, 1, 'REGRESSION: a method read as no function — the program\'s assert taken');
    assert.equal(one("{ const at = s.indexOf('x'); assert.ok(at < s.indexOf('b')); }\n{ const at = s.indexOf('q'); assert.ok(at >= 0); }").length, 1,
        'REGRESSION: two blocks\' `at` read as one — the second block\'s call and assert taken for the first');
    assert.deepEqual(one("const at = s.indexOf('x');\nconst t = (at) => { assert.ok(at < s.indexOf('b')); };"), [], 'a parameter shadowing a position is no position');
    assert.equal(one("assert.equal(s.indexOf('x') < s.indexOf('b'), true);").length, 1, 'REGRESSION: assert.equal(pin, true) not read');
    assert.deepEqual(one("assert.equal(s.includes('x'), true);\nassert.ok(s.indexOf('x') < s.indexOf('b'));"), [], 'assert.equal(includes, true) holds it');
    assert.equal(one("const order = (t, ...lines) => lines.forEach((l, i) => { if (!i) return; assert.ok(t.includes(l)); assert.ok(t.indexOf(l) > t.indexOf(lines[i - 1])); });").length, 1,
        'REGRESSION: entry 0 passed by an early return before the loop\'s includes, taken as asserted');
    // The third review's (each red with the scan as the second review left it).
    assert.equal(one("let at = s.indexOf('x');\n[at] = [0];\nassert.ok(at < s.indexOf('b'));").length, 0, 'a destructuring assignment onto a position name: no position (out of reach)');
    assert.equal(one("let at = s.indexOf('x');\nfor (at of [0]) {}\nassert.ok(at < s.indexOf('b'));").length, 0, 'a for-of head naming it: no position');
    assert.equal(one("const order = (t, ...lines) => lines.forEach((l, i) => { assert.ok(t.includes(l)); if (i) assert.ok(t.indexOf(l) > t.indexOf(lines[i - 1], 50)); });").length, 1,
        'REGRESSION: the loop rule taking includes(l) for indexOf(prev, from)');
    assert.equal(readPins("import assert from 'node:assert/strict';\nconst s = '';\nif (s.indexOf('a') < s.indexOf('b')) {}\nassert.ok(s.includes('a') && s.indexOf('a') < s.indexOf('b'));").pins, 1,
        'the pins judged: those in an assert, one reader for the count and the judgement');
});

test('THE GUARD — every order pin in the tests holds its earlier side present (the deny survivor\'s class)', () => {
    const files = [
        ...readdirSync(new URL('tests/', ROOT)).filter((f) => f.endsWith('.test.mjs')).map((f) => `tests/${f}`),
        ...readdirSync(new URL('tests/integration/', ROOT)).filter((f) => f.endsWith('.mjs')).map((f) => `tests/integration/${f}`),
    ];
    assert.ok(files.length >= 200, `the files scanned (${files.length})`);
    const bad = [];
    let pins = 0;
    for (const f of files) {
        const read1 = readPins(read(f));
        pins += read1.pins;   // the pins THIS reader judged — a reader that stops reaching them fails the floor
        for (const u of read1.unheld) bad.push(`${f}:${u.line}  ${u.text}  — write \`${u.held} && \` before it`);
    }
    assert.ok(pins >= PINS_MEASURED, `the order pins judged (${pins}, ${PINS_MEASURED} measured 23 Nov) — a scan that stops reaching them fails here`);
    assert.deepEqual(bad, [], 'REGRESSION: an order pin that passes when its earlier line is gone (-1 is before everything) — hold it present in the same assert');
});
