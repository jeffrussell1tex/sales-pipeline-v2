// Find components DECLARED INSIDE another component and USED as a JSX element.
// Only that combination causes the remount: React sees a new type each render,
// unmounts the old tree and mounts a new one — losing focus, scroll and state.
// A capitalised helper that is merely CALLED, e.g. `Row(item)`, is harmless.
import { parse } from '@babel/parser';
import fs from 'fs';

const jsxNames = (node, out = new Set()) => {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach(n => jsxNames(n, out)); return out; }
    if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier') out.add(node.name.name);
    for (const k of Object.keys(node)) if (!['loc','start','end'].includes(k)) jsxNames(node[k], out);
    return out;
};

// Severity. A remount is only USER-VISIBLE if the component owns something that
// is lost when React unmounts it: focus in a form control, its own hook state, or
// a DOM ref (scroll position, measurement). A stateless presentational wrapper
// remounts too, but nothing observable changes — that is churn, not a bug.
// A wrapper that renders {children} remounts WHATEVER IS PASSED IN, so it can lose
// focus for a control it does not itself contain.
const rendersChildren = (node) => {
    let found = false;
    const w = (x) => {
        if (found || !x || typeof x !== 'object') return;
        if (Array.isArray(x)) return x.forEach(w);
        if (x.type === 'JSXExpressionContainer') {
            const e = x.expression;
            if (e?.type === 'Identifier' && e.name === 'children') { found = true; return; }
            if (e?.type === 'MemberExpression' && e.property?.name === 'children') { found = true; return; }
        }
        for (const k of Object.keys(x)) if (!['loc','start','end'].includes(k)) w(x[k]);
    };
    w(node.body);
    return found;
};

// Does any CALL SITE in this file pass a form control into <name>...</name>?
//
// riskOf() only inspects a component's own body, which is why `FL` in AuditDetail's
// AddDestinationModal scored harmless and shipped: a label/hint wrapper whose
// <input> lived in the parent and was passed in as children. Every keystroke gave
// FL a new identity, React remounted the subtree, the field lost focus after one
// character, and the next keystroke escaped to App.jsx's global hotkey handler --
// whose isTyping guard had gone false along with the focus -- opening the New Task
// rail mid-typing.
//
// Flagging every children-wrapper would be noise: ReportsTab has 12 presentational
// <Panel>s that wrap only charts and tables. So resolve it the one way it can
// actually be answered -- look at what the call sites pass.
const CONTROLS = ['input', 'textarea', 'select'];
const passesControlAsChild = (root, name) => {
    let found = false;
    const walk = (n) => {
        if (found || !n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n.type === 'JSXElement' && n.openingElement?.name?.name === name) {
            const inner = (c) => {
                if (found || !c || typeof c !== 'object') return;
                if (Array.isArray(c)) return c.forEach(inner);
                if (c.type === 'JSXOpeningElement' && CONTROLS.includes(c.name?.name)) { found = true; return; }
                for (const k of Object.keys(c)) if (!['loc','start','end'].includes(k)) inner(c[k]);
            };
            n.children?.forEach(inner);
        }
        for (const k of Object.keys(n)) if (!['loc','start','end'].includes(k)) walk(n[k]);
    };
    walk(root);
    return found;
};

const riskOf = (node) => {
    const hits = new Set();
    const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n.type === 'JSXOpeningElement' && ['input','textarea','select'].includes(n.name?.name)) hits.add('form control');
        if (n.type === 'CallExpression' && /^use[A-Z]/.test(n.callee?.name || '')) hits.add(n.callee.name);
        for (const k of Object.keys(n)) if (!['loc','start','end'].includes(k)) walk(n[k]);
    };
    walk(node.body);
    return hits;
};

const returnsJsx = (node) => {
    let found = false;
    const walk = (n) => {
        if (found || !n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n.type === 'JSXElement' || n.type === 'JSXFragment') { found = true; return; }
        for (const k of Object.keys(n)) if (!['loc','start','end'].includes(k)) walk(n[k]);
    };
    walk(node.body);
    return found;
};

// Flags are separated from paths BEFORE the file list is built — every argument
// used to be treated as a path, so `--all` was opened as a filename and the script
// died with ENOENT.
const argv    = process.argv.slice(2);
const flags   = new Set(argv.filter(a => a.startsWith('--')));
const paths   = argv.filter(a => !a.startsWith('--'));
const showAll   = flags.has('--all');      // include clean files
const showChurn = flags.has('--churn') || showAll;   // include stateless wrappers

if (flags.has('--help')) {
    console.log(`
check-inline-components — find components declared inside another component and
used as a JSX element type. React sees a new type on every render, so it unmounts
and remounts the subtree: focus, scroll position and local state are lost.

  npm run check:inline                     user-visible findings only
  npm run check:inline -- --churn          also list stateless wrappers
  npm run check:inline -- --all            everything, including clean files
  npm run check:inline -- src/Tabs/X.jsx   specific files

USER-VISIBLE  the component owns a form control, hook state or a ref — remounting
              is observable, and this is a real bug.
churn only    stateless presentational wrapper. It remounts, but nothing the user
              can see changes. Worth hoisting eventually; not urgent.
`.trim());
    process.exit(0);
}

const walk = (d, o = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = d + '/' + e.name;
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, o); }
        else if (p.endsWith('.jsx')) o.push(p);
    }
    return o;
};

const targets = paths.length ? paths : walk('src');
let totalVisible = 0, totalChurn = 0;

for (const file of targets) {
    const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    const used = jsxNames(ast.program.body);
    const findings = [];

    // Top-level components only — nested declarations inside THEM are the target.
    const topLevel = [];
    for (const st of ast.program.body) {
        const d = (st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration') ? st.declaration : st;
        if (d?.type === 'FunctionDeclaration' && d.id && /^[A-Z]/.test(d.id.name)) topLevel.push({ name: d.id.name, node: d });
        if (d?.type === 'VariableDeclaration') d.declarations.forEach(dec => {
            if (dec.id.type === 'Identifier' && /^[A-Z]/.test(dec.id.name)
                && ['ArrowFunctionExpression','FunctionExpression'].includes(dec.init?.type))
                topLevel.push({ name: dec.id.name, node: dec.init });
        });
    }

    const scan = (n, parentName, depth = 0) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(x => scan(x, parentName, depth));
        if (n.type === 'VariableDeclaration') {
            n.declarations.forEach(dec => {
                if (dec.id.type !== 'Identifier') return;
                if (!/^[A-Z]/.test(dec.id.name)) return;
                if (!['ArrowFunctionExpression','FunctionExpression'].includes(dec.init?.type)) return;
                if (!returnsJsx(dec.init)) return;
                findings.push({ name: dec.id.name, line: n.loc.start.line, parent: parentName,
                                usedAsElement: used.has(dec.id.name), risk: riskOf(dec.init),
                                childControl: rendersChildren(dec.init) && passesControlAsChild(ast, dec.id.name) });
            });
        }
        if (n.type === 'FunctionDeclaration' && n.id && /^[A-Z]/.test(n.id.name) && returnsJsx(n)) {
            findings.push({ name: n.id.name, line: n.loc.start.line, parent: parentName, usedAsElement: used.has(n.id.name), risk: riskOf(n),
                            childControl: rendersChildren(n) && passesControlAsChild(ast, n.id.name) });
        }
        for (const k of Object.keys(n)) if (!['loc','start','end'].includes(k)) scan(n[k], parentName, depth + 1);
    };

    topLevel.forEach(c => scan(c.node.body, c.name));

    const reportable = findings.filter(f => f.usedAsElement);
    const isVisible = f => (f.risk || []).size > 0 || f.childControl;
    reportable.forEach(f => isVisible(f) ? totalVisible++ : totalChurn++);

    // Quiet by default. Printing a line for every clean file buried two real
    // findings under several hundred lines of "no inline components", and a
    // checker whose signal is hard to find stops being run.
    const visible = reportable.filter(isVisible);
    const toPrint = showChurn ? reportable : visible;
    if (!toPrint.length && !showAll) continue;

    console.log(`\n=== ${file.split('/').pop()} — ${topLevel.length} top-level component(s) ===`);
    if (!findings.length) { console.log('  no inline components'); continue; }
    toPrint.sort((a,b) => a.line - b.line).forEach(f => {
        const risk = [...(f.risk || [])];
        if (f.childControl) risk.push('a call site passes a form control as children');
        const tag = isVisible(f) ? 'USER-VISIBLE' : 'churn only  ';
        console.log(`  ${tag}  line ${String(f.line).padStart(4)}  <${f.name}>  inside ${f.parent}${risk.length ? '  [' + risk.join(', ') + ']' : ''}`);
    });
}

console.log(
    `\n${totalVisible} user-visible, ${totalChurn} churn-only across ${targets.length} file(s).` +
    (totalVisible ? '' : ' Nothing that loses focus or state.') +
    (showChurn ? '' : '  Run with --churn to list the stateless wrappers.'));

// Non-zero only for the user-visible class: churn is worth fixing eventually but
// must not fail a check that might one day gate a commit.
process.exit(totalVisible ? 1 : 0);
