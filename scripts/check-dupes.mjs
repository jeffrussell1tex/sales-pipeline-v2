#!/usr/bin/env node
//
// check-dupes.mjs — find declarations that are silently discarded:
//   (a) a key written twice in one object literal   → the LAST one wins
//   (b) an attribute written twice on one JSX tag   → the LAST one wins,
//       and for `style` the whole first OBJECT is thrown away, not merged
//
//   node scripts/check-dupes.mjs src/Tabs/DispatchTab.jsx
//   node scripts/check-dupes.mjs                # every .jsx/.js/.mjs under src/
//
// WHY THIS EXISTS
// ---------------
// This is the §18b-class failure again: code that LOOKS finished. The
// declaration is right there in the source, reviewable, apparently doing
// something — and it renders as nothing at all. Found on this repo:
//
//   DispatchTab.jsx:5080   fontWeight: 700 … fontWeight: 300
//                          the dispatch heading is declared bold and renders light
//   TasksTab.jsx:1295      padding: '10px 0' … padding: '10px 32px'
//   DispatchSkillsDetail   color: T.ink … color: T.inkMid   (x3)
//   CsvImportModal.jsx     duplicate `style` attribute      (x4)
//
// esbuild already warns about every one of these on every build. Nobody sees
// them: they scroll past above a 2,500 kB build summary, the build exits 0, and
// the page renders — just not the way the source says it does. Making it a gate
// is the difference between a warning and a fact.
//
// WHY IT IS SAFE TO GATE ON
// -------------------------
// Unlike the dbFetch triage, this class has no judgement call in it. A key
// written twice in one literal is either a bug or dead code; there is no third
// reading, and no legitimate pattern it collides with. Conditional styling is
// spread (`...(x && {c:1})`) or ternary — neither produces a duplicate literal
// key, and both are ignored here.
//
// Exit code 1 when anything is found.
import { parse } from '@babel/parser';
import fs from 'fs';
import path from 'path';

// A key is only a duplicate if it is STATICALLY the same name. Computed keys
// (`{ [k]: v }`) are excluded — two computed keys may or may not collide at
// runtime and that is not knowable here. Spread elements are excluded for the
// same reason: `{ padding: 1, ...rest }` deliberately lets `rest` win, which is
// the documented way to do conditional style overrides in this codebase.
const staticKeyName = (prop) => {
    if (prop.type !== 'ObjectProperty' && prop.type !== 'ObjectMethod') return null;
    if (prop.computed) return null;
    if (prop.key.type === 'Identifier') return prop.key.name;
    if (prop.key.type === 'StringLiteral') return prop.key.value;
    return null;
};

// Rendering an expression back to something a human recognises in the terminal.
// Full source slices would wrap the line; this stays short enough to scan.
const brief = (node, src) => {
    if (!node) return '?';
    const raw = src.slice(node.start, node.end).replace(/\s+/g, ' ');
    return raw.length > 34 ? raw.slice(0, 31) + '…' : raw;
};

const checkFile = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const findings = [];

    let ast;
    try {
        ast = parse(src, {
            sourceType: 'module',
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
            errorRecovery: false,
        });
    } catch (err) {
        findings.push({ file, line: err.loc?.line ?? 0, kind: 'PARSE', name: '', detail: err.message });
        return findings;
    }

    const walkNode = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walkNode);

        // (a) duplicate keys in an object literal
        if (node.type === 'ObjectExpression') {
            const seen = new Map();
            for (const prop of node.properties) {
                const name = staticKeyName(prop);
                if (name === null) continue;
                if (seen.has(name)) {
                    const first = seen.get(name);
                    findings.push({
                        file,
                        line: prop.loc.start.line,
                        kind: 'DUP-KEY',
                        name,
                        detail: `dead: ${brief(first.value, src)} (line ${first.loc.start.line})  ->  wins: ${brief(prop.value, src)}`,
                    });
                }
                seen.set(name, prop);
            }
        }

        // (b) duplicate attributes on a JSX element
        if (node.type === 'JSXOpeningElement') {
            const seen = new Map();
            for (const attr of node.attributes) {
                if (attr.type !== 'JSXAttribute') continue;      // skip {...spread}
                if (attr.name.type !== 'JSXIdentifier') continue; // skip namespaced
                const name = attr.name.name;
                if (seen.has(name)) {
                    const first = seen.get(name);
                    const tag = node.name?.name || 'element';
                    findings.push({
                        file,
                        line: attr.loc.start.line,
                        kind: 'DUP-ATTR',
                        name,
                        detail: `<${tag}> declares ${name} twice (first at line ${first.loc.start.line}). ` +
                                (name === 'style'
                                    ? 'React does NOT merge style objects — the first is discarded entirely.'
                                    : 'The first value is discarded.'),
                    });
                }
                seen.set(name, attr);
            }
        }

        for (const k of Object.keys(node)) {
            if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments') continue;
            walkNode(node[k]);
        }
    };

    walkNode(ast.program.body);
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

if (process.argv.includes('--help')) {
    console.log(`
check-dupes — find duplicate object keys and duplicate JSX attributes, both of
which silently discard the earlier value.

  npm run check:dupes                      every .jsx/.js/.mjs under src/
  node scripts/check-dupes.mjs FILE...      specific files

DUP-KEY   a key written twice in one object literal; the last wins
DUP-ATTR  an attribute written twice on one JSX tag; the last wins. For \`style\`
          React discards the entire first object rather than merging.

Exit 1 on any finding. No false-positive class: computed keys, spreads and
ternaries are all excluded, so anything reported is dead code or a bug.
`.trim());
    process.exit(0);
}

const targets = process.argv.slice(2).filter(a => !a.startsWith('--')).length
    ? process.argv.slice(2).filter(a => !a.startsWith('--'))
    : walk('src');

let total = 0;
let lastFile = null;
for (const file of targets) {
    for (const f of checkFile(file)) {
        total++;
        if (f.file !== lastFile) { console.log(`\n${f.file}`); lastFile = f.file; }
        console.log(`  ${f.kind.padEnd(9)} line ${String(f.line).padStart(5)}  ${f.name ? `"${f.name}"  ` : ''}${f.detail}`);
    }
}

console.log(
    total
        ? `\n${total} duplicate declaration(s) across ${targets.length} file(s). Each one is code that renders as nothing.`
        : `\nNo duplicate keys or attributes in ${targets.length} file(s).`
);

process.exit(total ? 1 : 0);
