// fnscope.mjs — the pure half of check-fnscope: every identifier a file READS
// must be bound somewhere it can see (state §0.107, guide §18b33).
//
// WHY THIS EXISTS
// ---------------
// bf4a3c5 (7 Apr 2026) renamed the parameter of two module-scope helpers from
// `profile` to `resolvedProfile` and left both bodies reading `profile`. The
// name still existed in the file — a `const profile` inside a loop in ANOTHER
// function — so the eye found it, esbuild bundled it, the import graph loaded
// it, and Netlify ran it: a ReferenceError on the first deal, a 500 every hour,
// for five months (§0.95). The same commit had done the same to digest.mjs,
// found a day later (§0.101). check-tdz's undefined pass inspects Capitalised
// components under src/ and JSX; a lowercase helper in a Netlify function was
// outside every scanner. This is the scanner.
//
// WHAT IT CHECKS
// --------------
// A proper lexical-scope walk: module scope (imports and every top-level
// declaration), function scope (params, the function's own name, `arguments`,
// `var` and function declarations hoisted from anywhere in the body), block
// scope (let/const/class in that block, a catch parameter, a for-loop's own
// declarations), class scope (the class name). An Identifier that is a REFERENCE
// — not a property key, not a member property, not a label, not an import's
// remote name — and is bound in no enclosing scope is reported, unless it is a
// standard global. Order does not matter (that is check-tdz's job); presence does.
//
// Pure: parse text in, findings out. The CLI is scripts/check-fnscope.mjs.
import { parse } from '@babel/parser';

export const GLOBALS = new Set([
    // ECMAScript
    'globalThis', 'undefined', 'NaN', 'Infinity', 'Object', 'Function', 'Array', 'String', 'Number', 'Boolean', 'Symbol',
    'BigInt', 'Math', 'JSON', 'Date', 'RegExp', 'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError',
    'SyntaxError', 'TypeError', 'URIError', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry',
    'Proxy', 'Reflect', 'Intl', 'Atomics', 'SharedArrayBuffer', 'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array',
    'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
    'BigInt64Array', 'BigUint64Array', 'Iterator', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI',
    'encodeURIComponent', 'decodeURI', 'decodeURIComponent', 'escape', 'unescape', 'eval',
    // Node and the web platform in Node 22 / Netlify's runtime
    'console', 'process', 'Buffer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
    'clearImmediate', 'queueMicrotask', 'structuredClone', 'fetch', 'Request', 'Response', 'Headers', 'FormData',
    'Blob', 'File', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal',
    'atob', 'btoa', 'crypto', 'performance', 'navigator', 'WebSocket', 'Event', 'EventTarget', 'DOMException',
    'ReadableStream', 'WritableStream', 'TransformStream', 'MessageChannel', 'MessagePort', 'BroadcastChannel',
    'require', 'module', 'exports', '__dirname', '__filename',
]);

// ── Binding names out of patterns ────────────────────────────────────────────
function patternNames(node, out) {
    if (!node) return out;
    switch (node.type) {
        case 'Identifier': out.add(node.name); break;
        case 'ObjectPattern': for (const p of node.properties) patternNames(p.type === 'RestElement' ? p.argument : p.value, out); break;
        case 'ArrayPattern': for (const el of node.elements) patternNames(el, out); break;
        case 'AssignmentPattern': patternNames(node.left, out); break;
        case 'RestElement': patternNames(node.argument, out); break;
        default: break;
    }
    return out;
}

const isFunction = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression'
    || n.type === 'ObjectMethod' || n.type === 'ClassMethod' || n.type === 'ClassPrivateMethod');

// `var` and function declarations hoist to the nearest FUNCTION scope: collect
// them from the whole body without descending into nested functions.
function hoisted(node, out) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { for (const n of node) hoisted(n, out); return out; }
    if (node.type === 'FunctionDeclaration') { if (node.id) out.add(node.id.name); return out; }
    if (isFunction(node)) return out;
    if (node.type === 'VariableDeclaration' && node.kind === 'var') for (const d of node.declarations) patternNames(d.id, out);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
        const v = node[key];
        if (v && typeof v === 'object') hoisted(v, out);
    }
    return out;
}

// let/const/class in ONE block's own statements (not nested blocks).
function blockScoped(statements, out) {
    for (const s of statements || []) {
        const n = s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration' ? s.declaration : s;
        if (!n) continue;
        if (n.type === 'VariableDeclaration' && n.kind !== 'var') for (const d of n.declarations) patternNames(d.id, out);
        if (n.type === 'ClassDeclaration' && n.id) out.add(n.id.name);
    }
    return out;
}

/**
 * Every identifier the source reads without a binding in reach.
 * → [{ name, line, column, enclosing }]  — `enclosing` names the innermost function (or 'module scope')
 */
export function undeclaredIn(source, { file = '<source>', plugins = [] } = {}) {
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx', ...plugins], errorRecovery: false });
    const findings = [];

    const moduleScope = new Set();
    for (const s of ast.program.body) {
        if (s.type === 'ImportDeclaration') for (const sp of s.specifiers) moduleScope.add(sp.local.name);
    }
    hoisted(ast.program.body, moduleScope);
    blockScoped(ast.program.body, moduleScope);

    const visible = (scopes, name) => scopes.some(s => s.has(name)) || GLOBALS.has(name);

    const report = (id, scopes, enclosing) => {
        if (visible(scopes, id.name)) return;
        findings.push({ name: id.name, line: id.loc?.start.line ?? 0, column: id.loc?.start.column ?? 0, enclosing, file });
    };

    // Walk with an explicit scope stack. `parent`/`key` say whether an Identifier is a reference.
    function walk(node, scopes, enclosing, parent = null, key = null) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { for (const n of node) walk(n, scopes, enclosing, parent, key); return; }
        // `export { a, b } from './m'` re-exports names that are never local bindings — nothing here is a read.
        if (node.type === 'ExportNamedDeclaration' && node.source) return;
        switch (node.type) {
            case 'Identifier': {
                if (!parent) return;
                const pt = parent.type;
                if ((pt === 'MemberExpression' || pt === 'OptionalMemberExpression') && key === 'property' && !parent.computed) return;
                if ((pt === 'ObjectProperty' || pt === 'ObjectMethod' || pt === 'ClassMethod' || pt === 'ClassProperty' || pt === 'ClassPrivateMethod') && key === 'key' && !parent.computed) return;
                if (pt === 'LabeledStatement' || pt === 'BreakStatement' || pt === 'ContinueStatement') return;
                if (pt === 'ImportSpecifier' || pt === 'ImportDefaultSpecifier' || pt === 'ImportNamespaceSpecifier') return;
                if (pt === 'ExportSpecifier' && key === 'exported') return;
                if (pt === 'MetaProperty') return;
                if (pt === 'VariableDeclarator' && key === 'id') return;
                if (pt === 'FunctionDeclaration' || pt === 'FunctionExpression' || pt === 'ClassDeclaration' || pt === 'ClassExpression') { if (key === 'id') return; }
                if ((pt === 'CatchClause') && key === 'param') return;
                if (pt === 'AssignmentPattern' && key === 'left') return;
                if (pt === 'RestElement' || pt === 'ArrayPattern' || pt === 'ObjectPattern') return;   // binding positions (params/declarations) are collected, not read
                report(node, scopes, enclosing);
                return;
            }
            case 'ImportDeclaration': return;
            case 'ExportAllDeclaration': return;
            case 'MetaProperty': return;
            case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ObjectMethod': case 'ClassMethod': case 'ClassPrivateMethod': {
                const fnScope = new Set(['arguments']);
                if (node.id) fnScope.add(node.id.name);
                for (const p of node.params) patternNames(p, fnScope);
                const bodyStatements = node.body && node.body.type === 'BlockStatement' ? node.body.body : null;
                if (bodyStatements) { hoisted(bodyStatements, fnScope); blockScoped(bodyStatements, fnScope); }
                const name = node.id ? node.id.name : (node.key && node.key.type === 'Identifier' ? node.key.name : (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : (parent && (parent.type === 'ObjectProperty' || parent.type === 'ClassProperty') && parent.key.type === 'Identifier' ? parent.key.name : '(anonymous)')));
                const inner = [...scopes, fnScope];
                if (node.computed && node.key) walk(node.key, scopes, enclosing, node, 'key');
                for (const p of node.params) walkPatternDefaults(p, inner, name);
                if (bodyStatements) walk(bodyStatements, inner, name, node.body, 'body');
                else walk(node.body, inner, name, node, 'body');
                return;
            }
            case 'ClassDeclaration': case 'ClassExpression': {
                const cs = new Set(); if (node.id) cs.add(node.id.name);
                const inner = [...scopes, cs];
                if (node.superClass) walk(node.superClass, inner, enclosing, node, 'superClass');
                walk(node.body, inner, enclosing, node, 'body');
                return;
            }
            case 'BlockStatement': {
                const bs = blockScoped(node.body, new Set());
                walk(node.body, [...scopes, bs], enclosing, node, 'body');
                return;
            }
            case 'SwitchStatement': {
                walk(node.discriminant, scopes, enclosing, node, 'discriminant');
                const bs = new Set();
                for (const c of node.cases) blockScoped(c.consequent, bs);
                walk(node.cases, [...scopes, bs], enclosing, node, 'cases');
                return;
            }
            case 'CatchClause': {
                const cs = node.param ? patternNames(node.param, new Set()) : new Set();
                const inner = [...scopes, cs];
                if (node.param) walkPatternDefaults(node.param, inner, enclosing);
                walk(node.body, inner, enclosing, node, 'body');
                return;
            }
            case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
                const fs = new Set();
                const head = node.type === 'ForStatement' ? node.init : node.left;
                if (head && head.type === 'VariableDeclaration') for (const d of head.declarations) patternNames(d.id, fs);
                const inner = [...scopes, fs];
                for (const k of Object.keys(node)) {
                    if (k === 'type' || k === 'loc' || k === 'start' || k === 'end') continue;
                    walk(node[k], inner, enclosing, node, k);
                }
                return;
            }
            case 'VariableDeclarator': {
                walkPatternDefaults(node.id, scopes, enclosing);
                if (node.init) walk(node.init, scopes, enclosing, node, 'init');
                return;
            }
            case 'ObjectProperty': {
                if (node.computed) walk(node.key, scopes, enclosing, node, 'key');
                // shorthand `{ a }` reads `a`; `{ a: b }` reads only `b`
                walk(node.value, scopes, enclosing, node.shorthand ? { type: 'ShorthandValue' } : node, 'value');
                return;
            }
            case 'TemplateLiteral': walk(node.expressions, scopes, enclosing, node, 'expressions'); return;
            default: {
                for (const k of Object.keys(node)) {
                    if (k === 'type' || k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'extra') continue;
                    const v = node[k];
                    if (v && typeof v === 'object') walk(v, scopes, enclosing, node, k);
                }
            }
        }
    }

    // A destructuring pattern's DEFAULT values and computed keys are reads; its names are bindings.
    function walkPatternDefaults(p, scopes, enclosing) {
        if (!p) return;
        switch (p.type) {
            case 'AssignmentPattern': walkPatternDefaults(p.left, scopes, enclosing); walk(p.right, scopes, enclosing, p, 'right'); break;
            case 'ObjectPattern': for (const prop of p.properties) { if (prop.type === 'RestElement') walkPatternDefaults(prop.argument, scopes, enclosing); else { if (prop.computed) walk(prop.key, scopes, enclosing, prop, 'key'); walkPatternDefaults(prop.value, scopes, enclosing); } } break;
            case 'ArrayPattern': for (const el of p.elements) walkPatternDefaults(el, scopes, enclosing); break;
            case 'RestElement': walkPatternDefaults(p.argument, scopes, enclosing); break;
            default: break;
        }
    }

    walk(ast.program.body, [moduleScope], 'module scope', ast.program, 'body');
    return findings;
}
