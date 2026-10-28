// tests/mutate-scope.test.mjs
//
// The harness, scoped to a batch (Jeff, 27 Oct 2026: "each batch gets the stale check, its own entries, every older
// entry on the files it changed and every entry caught by a test file it edited; the full run before each prod ship"):
// scripts/_scope.mjs's rules, run on made-up trees, and scripts/mutate-scope.mjs pinned where it grades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHarness, literalsOf, importsOf, normal, filesOf, scopeOf, matchesOf, entryKey } from '../scripts/_scope.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the harness is read from its text, never run: SUITES and the mutations array — the real one too', () => {
    const made = "const SUITES = 'tests/a.test.mjs tests/b.test.mjs';\nconst mutations = [\n    [\"one\", \"src/a.js\", \"x\", \"y\"],\n];\n";
    assert.deepEqual(parseHarness(made), { suites: ['tests/a.test.mjs', 'tests/b.test.mjs'], mutations: [['one', 'src/a.js', 'x', 'y']] });
    assert.deepEqual(parseHarness(made.replace(/\n/g, '\r\n')).mutations.length, 1, 'CRLF as checked out');
    assert.throws(() => parseHarness('const x = 1;'), /not the harness/);
    const real = parseHarness(read('scripts/mutate-import.mjs'));
    assert.ok(real.suites.length > 100 && real.suites.every((t) => t.startsWith('tests/') && t.endsWith('.test.mjs')), 'the SUITES value, split on spaces');
    assert.ok(real.mutations.length > 3000 && real.mutations.every((m) => m.length === 4));
});

test('a source\'s literals and imports, and a path as the repo names it', () => {
    const lits = literalsOf("read('src/a.js'); x = \"b\"; y = `c`; z = `d${e}`;");
    for (const want of ['src/a.js', 'b', 'c']) assert.ok(lits.includes(want), want);
    assert.ok(!lits.some((l) => l.startsWith('d')), 'a template ends at its first ${ — a path built at run time names nothing');
    // REGRESSION (27 Oct): one regex pass paired a stray quote with the next and swallowed the paths between — this
    // file's own read of scripts/mutate-scope.mjs went unseen so.
    const stray = literalsOf("t(\"the batch's own\"); u = `${x}`; read('scripts/a.mjs'); v = `y`; read('scripts/b.mjs');");
    assert.ok(stray.includes('scripts/a.mjs') && stray.includes('scripts/b.mjs'), 'REGRESSION: a stray quote hides the paths after it');
    assert.ok(literalsOf("execSync('node scripts/c.mjs --flag')").includes('scripts/c.mjs'), 'a command line names its script');
    assert.deepEqual(importsOf("import a from './a.js';\nimport { b } from \"../b.mjs\";\nimport './c.js';\nconst d = await import('./d.mjs');\nimport e from 'pkg';\nexport { f } from './f.js';\nconst t = \"import g from './g.js'\";"),
        ['./a.js', '../b.mjs', 'pkg', './f.js', './c.js', './d.mjs'], 'a re-export is an import; an import written inside a string is none (the harness\'s anchors)');
    assert.equal(normal('tests/../src/a.js'), 'src/a.js');
    assert.equal(normal('./src//a.js'), 'src/a.js');
    assert.equal(normal('../outside.js'), null, 'a path that leaves the repo names no repo file');
});

test('a test\'s files: what it imports, down their imports; what it reads as text, not their imports; a bare function name; never a package', () => {
    const tree = {
        'tests/t.test.mjs': "import { a } from '../src/a.js';\nimport pkg from 'pkg';\nconst s = read('netlify/functions/c.mjs');\nconst u = fn('users');\nconst no = 'not a file';\nconst q = \"import { x } from 'node:child_process'\";",
        'src/a.js': "import { b } from './b.js';\nexport const a = 1;",
        'src/b.js': 'export const b = 2;',
        'netlify/functions/c.mjs': "import { d } from './d.mjs';",
        'netlify/functions/d.mjs': '',
        'netlify/functions/users.mjs': '',
    };
    const files = filesOf('tests/t.test.mjs', { isFile: (p) => p in tree, read: (p) => tree[p] });
    assert.deepEqual([...files].sort(), ['netlify/functions/c.mjs', 'netlify/functions/users.mjs', 'src/a.js', 'src/b.js'],
        'REGRESSION: a mutant in a file the edited test runs goes unrun — or a file it only reads as text pulls in its imports');
    // A test that runs a subprocess: what it names may be what it runs, down that script's imports; a helper it imports
    // from tests/ names paths for it too.
    const runTree = {
        'tests/r.test.mjs': "import { execFileSync } from 'node:child_process';\nimport { h } from './helpers/h.mjs';\nexecFileSync('node', ['scripts/x.mjs']);",
        'tests/helpers/h.mjs': "export const h = read('src/h.js');",
        'scripts/x.mjs': "import { y } from './y.mjs';",
        'scripts/y.mjs': '',
        'src/h.js': "import { z } from './z.js';",
        'src/z.js': '',
    };
    const ran = filesOf('tests/r.test.mjs', { isFile: (p) => p in runTree, read: (p) => runTree[p] });
    assert.deepEqual([...ran].sort(), ['scripts/x.mjs', 'scripts/y.mjs', 'src/h.js', 'src/z.js', 'tests/helpers/h.mjs'],
        'REGRESSION: a script the test runs as a subprocess, or its imports, or a path its helper reads, goes unrun');
});

test("the scope: the batch's own (not at the base exactly: new, renamed, re-anchored or a new mutant), every entry on a file it changed, every entry on a file its edited tests read, import or run — in the harness's order, each once", () => {
    const base = [['kept', 'src/x.js', 'a', 'b'], ['moved', 'src/y.js', 'old', 'z'], ['far', 'src/far.js', 'q', 'r'], ['read', 'src/read.js', 'q', 'r']];
    const now = [['kept', 'src/x.js', 'a', 'b'], ['moved', 'src/y.js', 'new', 'z'], ['far', 'src/far.js', 'q', 'r'], ['read', 'src/read.js', 'q', 'r'], ['fresh', 'src/z.js', 'c', 'd']];
    const s = scopeOf({ mutations: now, base, changedFiles: ['src/x.js', 'tests/t.test.mjs'], editedTests: ['tests/t.test.mjs'], testFiles: () => new Set(['src/read.js']) });
    assert.deepEqual(s.entries.map((m) => m[0]), ['kept', 'moved', 'read', 'fresh']);
    assert.deepEqual(s.entries.map((m) => s.why.get(m)), [['changed'], ['own'], ['tested'], ['own']], 'REGRESSION: a re-anchored entry is not the batch\'s own');
    assert.deepEqual([s.own, s.changed, s.tested], [2, 1, 1]);
    assert.ok(!s.entries.some((m) => m[0] === 'far'), 'an entry on a file the batch neither changed nor tests waits for the full run');
    assert.equal(entryKey(['a', 'b', 'c', 'd']), '["a","b","c","d"]');
    assert.equal(matchesOf('one\r\ntwo one\ntwo', 'one\ntwo'), 2, "the harness's matching: any line ending");
});

test('mutate-scope.mjs: the stale check over every entry first, a green baseline before grading, each mutant through the sidecar, a red exit on any survivor', () => {
    const s = read('scripts/mutate-scope.mjs');
    for (const line of [
        "import { armRestoreOnExit, withMutant } from './_mutant.mjs';",
        "const editedTests = changedFiles.filter((f) => suites.includes(f));",
        "const isFile = (p) => { try { return statSync(p).isFile() && realpathSync.native(p).replace(/\\\\/g, '/').endsWith(`/${p}`); } catch { return false; } };",
        "const stale = mutations.filter(([, f, from]) => src(f) === null || matchesOf(src(f), from) === 0);",
        "const notUnique = own.filter(([, f, from]) => src(f) !== null && matchesOf(src(f), from) > 1);",
        "if (stale.length || notUnique.length) { console.log('Repoint those before grading anything.'); process.exit(1); }",
        "    execSync(`node --test ${suites.join(' ')}`, { stdio: 'pipe' });",
        'armRestoreOnExit();',
        'process.exit(survived ? 1 : 0);',
    ]) assert.equal(s.split('\n').filter((l) => l === line).length, 1, line);
    assert.ok(s.indexOf("console.log('Baseline: green.\\n');") < s.indexOf('for (const [name, file, from, to] of scope.entries) {'), 'the baseline before any mutant');
    assert.ok(s.includes("    ...git('ls-files', '--others', '--exclude-standard').split("), 'a file the batch added, untracked, is a file it changed');
    // As the full harness (tests/mutant-restore.test.mjs): every mutant goes on and comes off through the sidecar alone.
    const code = s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /\bwriteFileSync\b/, 'REGRESSION: the scoped run writes a mutant or a restore itself');
});

test('the suites: this file is graded by the harness', () => {
    // The SUITES value itself, never the whole harness (§0.204 review P1).
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/mutate-scope.test.mjs'), 'SUITES runs this file');
});
