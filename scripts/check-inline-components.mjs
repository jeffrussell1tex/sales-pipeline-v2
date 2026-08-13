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

const targets = process.argv.slice(2).length ? process.argv.slice(2) : (function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory()){if(e.name!=='node_modules')walk(p,o);}else if(p.endsWith('.jsx'))o.push(p);}return o;})('src');
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
                                usedAsElement: used.has(dec.id.name), risk: riskOf(dec.init) });
            });
        }
        if (n.type === 'FunctionDeclaration' && n.id && /^[A-Z]/.test(n.id.name) && returnsJsx(n)) {
            findings.push({ name: n.id.name, line: n.loc.start.line, parent: parentName, usedAsElement: used.has(n.id.name), risk: riskOf(n) });
        }
        for (const k of Object.keys(n)) if (!['loc','start','end'].includes(k)) scan(n[k], parentName, depth + 1);
    };

    topLevel.forEach(c => scan(c.node.body, c.name));

    console.log(`\n=== ${file.split('/').pop()} — ${topLevel.length} top-level component(s) ===`);
    if (!findings.length) { console.log('  no inline components'); continue; }
    findings.sort((a,b) => a.line - b.line).forEach(f => {
        if (!f.usedAsElement) return;
        const risk = [...(f.risk || [])];
        const tag = risk.length ? 'USER-VISIBLE' : 'churn only  ';
        console.log(`  ${tag}  line ${String(f.line).padStart(4)}  <${f.name}>  inside ${f.parent}${risk.length ? '  [' + risk.join(', ') + ']' : ''}`);
    });
}
