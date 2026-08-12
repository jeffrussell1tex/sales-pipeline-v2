#!/usr/bin/env node
//
// check-tdz.mjs — find identifier bugs that only fail in production:
//   (a) temporal-dead-zone reads   — declared, but read too early
//   (b) undefined references       — never declared in any enclosing scope
//
//   node scripts/check-tdz.mjs src/Tabs/DispatchTab.jsx
//   node scripts/check-tdz.mjs src/Tabs/*.jsx
//   node scripts/check-tdz.mjs            # every .jsx/.js under src/
//
// WHY THIS EXISTS
// ---------------
// Babel-validating a file proves it PARSES. `vite build` succeeding proves it
// BUNDLES. Neither proves it RUNS: a temporal-dead-zone read is legal syntax and
// a runtime error, so both gates pass and the minified production bundle throws
//
//     ReferenceError: Cannot access 'Ve' before initialization
//
// where 'Ve' is a minified state variable, and the component never mounts. Vite's
// dev bundle does not reproduce it, so the tab works locally and dies on deploy.
// This has been hit twice; hence a script rather than a written rule.
//
// WHAT IT CHECKS
// --------------
// An initializer that EVALUATES DURING RENDER must not read a binding declared
// later in the same scope. Evaluating now:
//   • a useMemo / useCallback DEPENDENCY ARRAY  (the callback body is deferred)
//   • any plain expression initializer          (object, call, member access…)
// Deferred, and therefore ignored:
//   • arrow / function expression bodies
//
// Module scope is checked the same way, which also catches ordering problems
// between top-level consts.
//
// KNOWN NON-ISSUE: `Cannot access 'X' before initialization` is equally often a
// CIRCULAR IMPORT. If this comes back clean, check the import graph next.
//
// Exit code 1 when anything is found, so it can gate a commit.
import { parse } from '@babel/parser';
import fs from 'fs';
import path from 'path';

// ── Identifier collection ────────────────────────────────────────────────────
// Property keys and JSX attribute names are NOT references. An early version of
// this script counted them and reported `{ equipCategories: [] }` as a use of a
// variable called equipCategories, pointing at innocent code. A checker that
// cries wolf is worse than none.
// `shadowed` carries names bound inside nested scopes we have descended into, so
// an inner `const now = new Date()` is not mistaken for a read of an outer `now`
// declared further down. Without this, every IIFE that declares a common name
// produced a false hit.
const collect = (node, names = new Set(), shadowed = new Set()) => {
    if (!node || typeof node !== 'object') return names;
    if (Array.isArray(node)) { node.forEach(n => collect(n, names, shadowed)); return names; }

    switch (node.type) {
        case 'Identifier':
            if (!shadowed.has(node.name)) names.add(node.name);
            return names;

        // Property keys are not references. `settings?.industries` names a field,
        // not a variable — and the OPTIONAL forms are separate node types, which
        // an earlier version missed, reporting `industries` and `ssoConfig` as
        // reads of same-named state declared a line later.
        case 'MemberExpression':
        case 'OptionalMemberExpression':
            collect(node.object, names, shadowed);
            if (node.computed) collect(node.property, names, shadowed);
            return names;
        case 'JSXMemberExpression':
            collect(node.object, names, shadowed);
            return names;

        case 'ObjectProperty':
        case 'ObjectMethod':
            if (node.computed) collect(node.key, names, shadowed);
            collect(node.value, names, shadowed);
            return names;
        case 'JSXAttribute':
            collect(node.value, names, shadowed);
            return names;

        // An IIFE body runs immediately, so it is still in scope for this check —
        // but its own declarations and parameters shadow the outer ones.
        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
        case 'FunctionDeclaration': {
            const inner = new Set(shadowed);
            (node.params || []).forEach(p => bindingNames(p).forEach(n => inner.add(n)));
            if (node.body && node.body.type === 'BlockStatement') {
                for (const st of node.body.body) {
                    if (st.type === 'VariableDeclaration')
                        st.declarations.forEach(d => bindingNames(d.id).forEach(n => inner.add(n)));
                    if (st.type === 'FunctionDeclaration' && st.id) inner.add(st.id.name);
                }
            }
            collect(node.body, names, inner);
            return names;
        }
        default:
            break;
    }
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end') continue;
        collect(node[k], names, shadowed);
    }
    return names;
};

const bindingNames = (id, out = []) => {
    if (!id) return out;
    if (id.type === 'Identifier') out.push(id.name);
    else if (id.type === 'ArrayPattern') id.elements.forEach(e => bindingNames(e, out));
    else if (id.type === 'ObjectPattern') id.properties.forEach(p => bindingNames(p.value || p.argument, out));
    else if (id.type === 'AssignmentPattern') bindingNames(id.left, out);
    else if (id.type === 'RestElement') bindingNames(id.argument, out);
    return out;
};

const bindingsOf = (declaration, into, line) => {
    for (const d of declaration.declarations) {
        const id = d.id;
        if (id.type === 'Identifier') into.set(id.name, line);
        else if (id.type === 'ArrayPattern')
            id.elements.forEach(e => { if (e && e.type === 'Identifier') into.set(e.name, line); });
        else if (id.type === 'ObjectPattern')
            id.properties.forEach(p => { if (p.value && p.value.type === 'Identifier') into.set(p.value.name, line); });
    }
};

// Which parts of an initializer run at render time.
const eagerParts = (init) => {
    if (!init) return [];
    if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return [];
    if (init.type === 'CallExpression' && init.callee.type === 'Identifier'
        && ['useMemo', 'useCallback'].includes(init.callee.name)) {
        return init.arguments.slice(1);        // deps evaluate now, callback does not
    }
    return [init];
};

const scanBody = (body, file, findings, label) => {
    const declared = new Map();
    for (const st of body) if (st.type === 'VariableDeclaration') bindingsOf(st, declared, st.loc.start.line);

    for (const st of body) {
        if (st.type !== 'VariableDeclaration') continue;
        const line = st.loc.start.line;
        for (const d of st.declarations) {
            const target = d.id.type === 'Identifier' ? d.id.name : '(destructured)';
            for (const part of eagerParts(d.init)) {
                for (const ref of collect(part)) {
                    const at = declared.get(ref);
                    if (at !== undefined && at > line) {
                        findings.push({ file, line, target, ref, at, label });
                    }
                }
            }
        }
    }
};

const findFunctionBodies = (node, out = []) => {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach(n => findFunctionBodies(n, out)); return out; }
    const isFn = node.type === 'ArrowFunctionExpression'
        || node.type === 'FunctionDeclaration'
        || node.type === 'FunctionExpression';
    if (isFn && node.body && node.body.type === 'BlockStatement') out.push(node);
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end') continue;
        findFunctionBodies(node[k], out);
    }
    return out;
};

// ── (b) Undefined references ─────────────────────────────────────────────────
// A component hoisted out of its parent keeps reading the parent's closure. The
// file still parses, the build still succeeds, and the component throws
// "X is not defined" the moment it renders. That is how `linkedAccount` and
// `copyFromAccount` reached production inside CustomerEditForm.
//
// This is a deliberately CONSERVATIVE check: it only inspects top-level arrow
// components (Capitalised, module scope) and only flags identifiers that appear
// nowhere as a param, local binding, import, or known global. Anything uncertain
// is skipped rather than reported — a checker that cries wolf gets ignored.
const GLOBALS = new Set([
    'window','document','console','Math','JSON','Object','Array','String','Number','Boolean',
    'Date','Promise','Set','Map','WeakMap','RegExp','Error','parseInt','parseFloat','isNaN',
    'setTimeout','clearTimeout','setInterval','clearInterval','fetch','localStorage','crypto',
    'React','undefined','null','true','false','NaN','Infinity','encodeURIComponent',
    'decodeURIComponent','Intl','navigator','location','alert','confirm','structuredClone',
    'Blob','File','FileReader','FormData','URL','URLSearchParams','AbortController',
    'Image','Audio','Event','CustomEvent','IntersectionObserver','ResizeObserver',
    'requestAnimationFrame','cancelAnimationFrame','queueMicrotask','TextEncoder','TextDecoder',
    'Symbol','BigInt','Proxy','Reflect','WeakSet','Int8Array','Uint8Array','Float32Array',
    'performance','history','screen','process','globalThis','atob','btoa',
]);

const declaredNames = (node, out = new Set()) => {
    if (!node) return out;
    if (node.type === 'Identifier') out.add(node.name);
    else if (node.type === 'ArrayPattern') node.elements.forEach(e => declaredNames(e, out));
    else if (node.type === 'ObjectPattern') node.properties.forEach(p => declaredNames(p.value || p.argument, out));
    else if (node.type === 'AssignmentPattern') declaredNames(node.left, out);
    else if (node.type === 'RestElement') declaredNames(node.argument, out);
    return out;
};

const collectScopeBindings = (node, into) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => collectScopeBindings(n, into)); return; }
    if (node.type === 'VariableDeclaration')
        node.declarations.forEach(d => declaredNames(d.id).forEach(n => into.add(n)));
    if (node.type === 'FunctionDeclaration' && node.id) into.add(node.id.name);
    if (node.type === 'ClassDeclaration' && node.id) into.add(node.id.name);
    // `catch (err)` binds err for the handler block.
    if (node.type === 'CatchClause' && node.param) declaredNames(node.param).forEach(n => into.add(n));
    // Any nested function introduces its own params and body bindings.
    if (['ArrowFunctionExpression','FunctionExpression','FunctionDeclaration'].includes(node.type)) {
        (node.params || []).forEach(p => declaredNames(p).forEach(n => into.add(n)));
        if (Array.isArray(node.body?.body)) node.body.body.forEach(st => collectScopeBindings(st, into));
        // catch clauses, for-loop heads
    }
    for (const k of Object.keys(node)) {
        if (['loc','start','end'].includes(k)) continue;
        collectScopeBindings(node[k], into);
    }
};

const usedIdentifiers = (node, out = new Map()) => {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach(n => usedIdentifiers(n, out)); return out; }
    switch (node.type) {
        case 'Identifier':
            if (!out.has(node.name)) out.set(node.name, node.loc?.start.line);
            return out;
        case 'MemberExpression':
        case 'OptionalMemberExpression':
            usedIdentifiers(node.object, out);
            if (node.computed) usedIdentifiers(node.property, out);
            return out;
        case 'JSXMemberExpression':
            usedIdentifiers(node.object, out); return out;
        case 'ObjectProperty':
        case 'ObjectMethod':
            if (node.computed) usedIdentifiers(node.key, out);
            usedIdentifiers(node.value, out); return out;
        case 'JSXAttribute':
            usedIdentifiers(node.value, out); return out;
        default: break;
    }
    for (const k of Object.keys(node)) {
        if (['loc','start','end'].includes(k)) continue;
        usedIdentifiers(node[k], out);
    }
    return out;
};

const checkUndefined = (ast, file, findings) => {
    const moduleScope = new Set();
    for (const st of ast.program.body) {
        if (st.type === 'VariableDeclaration')
            st.declarations.forEach(d => declaredNames(d.id).forEach(n => moduleScope.add(n)));
        if (st.type === 'FunctionDeclaration' && st.id) moduleScope.add(st.id.name);
        if (st.type === 'ImportDeclaration')
            st.specifiers.forEach(sp => sp.local && moduleScope.add(sp.local.name));
        if (st.type === 'ExportNamedDeclaration' && st.declaration) {
            const d = st.declaration;
            if (d.type === 'VariableDeclaration')
                d.declarations.forEach(x => declaredNames(x.id).forEach(n => moduleScope.add(n)));
            if (d.type === 'FunctionDeclaration' && d.id) moduleScope.add(d.id.name);
        }
    }

    const components = [];
    const visit = (st) => {
        const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
        if (d?.type !== 'VariableDeclaration') return;
        d.declarations.forEach(dec => {
            if (dec.id.type !== 'Identifier') return;
            if (!/^[A-Z]/.test(dec.id.name)) return;
            if (dec.init?.type !== 'ArrowFunctionExpression') return;
            components.push({ name: dec.id.name, node: dec.init, line: st.loc.start.line });
        });
    };
    ast.program.body.forEach(visit);

    for (const c of components) {
        const local = new Set();
        (c.node.params || []).forEach(p => declaredNames(p).forEach(n => local.add(n)));
        collectScopeBindings(c.node.body, local);
        for (const [name, line] of usedIdentifiers(c.node.body)) {
            if (local.has(name) || moduleScope.has(name) || GLOBALS.has(name)) continue;
            if (/^[A-Z_]+$/.test(name)) continue;          // shouty constants are usually imported
            findings.push({ file, line: line || c.line, target: c.name, ref: name, at: null, label: 'not defined in any enclosing scope' });
        }
    }
};

const checkFile = (file) => {
    const findings = [];
    let ast;
    try {
        ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    } catch (err) {
        console.error(`PARSE FAIL  ${file}\n  ${err.message}`);
        return [{ parseError: true }];
    }
    scanBody(ast.program.body, file, findings, 'module scope');
    for (const fn of findFunctionBodies(ast.program.body)) scanBody(fn.body.body, file, findings, 'function scope');
    checkUndefined(ast, file, findings);
    return findings;
};

const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
        else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : walk('src');
let total = 0;
for (const file of targets) {
    for (const f of checkFile(file)) {
        total++;
        if (f.parseError) continue;
        if (f.at === null) {
            console.log(`UNDEF  ${f.file}:${f.line}  <${f.target}> reads "${f.ref}" — ${f.label}`);
        } else {
            console.log(`TDZ    ${f.file}:${f.line}  "${f.target}" reads "${f.ref}" declared at line ${f.at}  (${f.label})`);
        }
    }
}

if (total) {
    console.log(`\n${total} issue(s). These pass Babel and vite build, and throw only in the minified production bundle.`);
    process.exit(1);
}
console.log(`No render-time TDZ issues in ${targets.length} file(s).`);
