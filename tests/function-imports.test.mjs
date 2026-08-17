// Static guard: every named import between netlify/functions/*.mjs must resolve
// to an actual export of the file it names.
//
// WHY THIS EXISTS
// ---------------
// All five gates passed on a tree whose deploy failed at once:
//
//   ✘ No matching export in "netlify/functions/_lib.mjs" for import "bulkUpsert"
//   ✘ No matching export in "netlify/functions/_lib.mjs" for import "bulkInsert"
//
// `npm run build` runs vite, and vite bundles `src/`. The Netlify functions are
// bundled separately by esbuild AT DEPLOY TIME, so nothing in the gates job ever
// resolves an import edge between two function files. Moving bulkUpsert out of
// _lib.mjs removed the `export const bulkInsert` line that sat between the two
// anchors, every unit test still passed — because the tests import from
// _bulk.mjs directly — and the break surfaced in a Netlify build log.
//
// A whole class of error was invisible to CI and visible only in production
// deploys. That is the definition of a gate gap (18b11).
//
// This is a source check, not a behavioural one: it catches "that export does not
// exist", not "that export does the wrong thing". It costs milliseconds and would
// have caught the deploy failure outright.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parse } from '@babel/parser';

const FN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'functions');

const parseFile = (src, file) => parse(src, {
    sourceType: 'module',
    plugins: ['jsx', 'optionalChaining', 'nullishCoalescingOperator', 'topLevelAwait'],
    errorRecovery: false,
    sourceFilename: file,
});

// Everything a module makes available by name, plus whether it re-exports
// wholesale (`export * from './x'`), which this check does not follow.
function exportsOf(ast) {
    const names = new Set();
    let hasStar = false;
    let hasDefault = false;

    for (const node of ast.program.body) {
        if (node.type === 'ExportNamedDeclaration') {
            if (node.declaration) {
                const d = node.declaration;
                if (d.type === 'VariableDeclaration') {
                    for (const decl of d.declarations) {
                        if (decl.id.type === 'Identifier') names.add(decl.id.name);
                        // export const { a, b } = …
                        if (decl.id.type === 'ObjectPattern') {
                            for (const p of decl.id.properties) {
                                if (p.type === 'ObjectProperty' && p.value.type === 'Identifier') names.add(p.value.name);
                            }
                        }
                    }
                } else if (d.id?.name) {
                    names.add(d.id.name);   // function / class
                }
            }
            for (const spec of node.specifiers || []) {
                const exported = spec.exported?.name || spec.exported?.value;
                if (exported === 'default') hasDefault = true;
                else if (exported) names.add(exported);
            }
        } else if (node.type === 'ExportDefaultDeclaration') {
            hasDefault = true;
        } else if (node.type === 'ExportAllDeclaration') {
            hasStar = true;
        }
    }
    return { names, hasStar, hasDefault };
}

// Relative imports only. Bare specifiers are npm packages and belong to the
// install step, not here.
function localImportsOf(ast) {
    const out = [];
    for (const node of ast.program.body) {
        const isImport = node.type === 'ImportDeclaration';
        const isReExport = node.type === 'ExportNamedDeclaration' && node.source;
        if (!isImport && !isReExport) continue;

        const spec = node.source.value;
        if (!spec.startsWith('.')) continue;

        const named = [];
        let wantsDefault = false;
        let wantsNamespace = false;
        for (const s of node.specifiers || []) {
            if (s.type === 'ImportDefaultSpecifier') wantsDefault = true;
            else if (s.type === 'ImportNamespaceSpecifier') wantsNamespace = true;
            else if (s.type === 'ImportSpecifier') named.push(s.imported.name || s.imported.value);
            else if (s.type === 'ExportSpecifier') named.push(s.local.name);
        }
        out.push({ spec, named, wantsDefault, wantsNamespace, line: node.loc.start.line });
    }
    return out;
}

test('every local import in netlify/functions resolves to a real export', () => {
    const files = readdirSync(FN_DIR).filter(f => f.endsWith('.mjs'));
    assert.ok(files.length > 0, 'expected to find function files to scan');

    // Parse once. A file that will not parse is its own failure — esbuild would
    // reject it too, and reporting "no violations" on an unreadable file is the
    // 18b6 failure mode.
    const asts = new Map();
    for (const f of files) {
        const full = join(FN_DIR, f);
        try {
            asts.set(f, parseFile(readFileSync(full, 'utf8'), f));
        } catch (e) {
            assert.fail(`${f} does not parse: ${e.message}`);
        }
    }

    const violations = [];
    for (const [file, ast] of asts) {
        for (const imp of localImportsOf(ast)) {
            const target = resolve(FN_DIR, imp.spec);

            // Only .mjs targets are checked here. ../../db/index.js is TypeScript
            // resolved by a different toolchain and is out of scope.
            if (!imp.spec.endsWith('.mjs')) continue;
            if (!existsSync(target)) {
                violations.push(`${file}:${imp.line} — imports '${imp.spec}', which does not exist`);
                continue;
            }

            const targetName = target.slice(FN_DIR.length + 1);
            const targetAst = asts.get(targetName);
            if (!targetAst) continue;   // outside the scanned directory

            const { names, hasStar, hasDefault } = exportsOf(targetAst);
            if (hasStar) continue;      // re-exports wholesale; not followed

            for (const name of imp.named) {
                if (!names.has(name)) {
                    violations.push(`${file}:${imp.line} — no matching export in '${imp.spec}' for import '${name}'`);
                }
            }
            if (imp.wantsDefault && !hasDefault) {
                violations.push(`${file}:${imp.line} — no default export in '${imp.spec}'`);
            }
        }
    }

    assert.deepEqual(violations, [],
        `\n${violations.length} unresolved import(s) — these fail the Netlify deploy, not the gates:\n  ${violations.join('\n  ')}\n`);
});

test('REGRESSION: _lib.mjs still re-exports both bulk helpers', () => {
    // The exact deploy failure. bulkUpsert was moved to _bulk.mjs by deleting the
    // span between two anchors, and `export const bulkInsert` sat between them.
    // Every unit test still passed, because the tests import from _bulk.mjs.
    const ast = parseFile(readFileSync(join(FN_DIR, '_lib.mjs'), 'utf8'), '_lib.mjs');
    const { names } = exportsOf(ast);
    assert.ok(names.has('bulkInsert'), '_lib.mjs must still export bulkInsert');
    assert.ok(names.has('bulkUpsert'), '_lib.mjs must still export bulkUpsert');
});
