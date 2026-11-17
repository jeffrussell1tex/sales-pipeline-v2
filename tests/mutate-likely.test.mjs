// tests/mutate-likely.test.mjs
//
// The harness grades a mutant by its likely tests first (OPEN_ITEMS §6; Jeff, 16 Nov: "Do option 1 harness
// improvements"): scripts/_likely.mjs's parts and verdict, run on made-up suites, and both runners pinned where they
// grade — scripts/mutate-import.mjs (every entry) and scripts/mutate-scope.mjs (a batch's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readersOf, partsOf, gradeParts, runSuites, runSuitesOut, runEnv, soloBaseline, repoIsFile, SLOW_MS, PARTS } from '../scripts/_likely.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Each needle a whole line of the code, comments left out, in order — a line commented out is no line (the review).
const inOrder = (lines, needles, msg) => {
    let at = -1;
    for (const n of needles) {
        const i = lines.indexOf(n, at + 1);
        assert.ok(i > at, `${msg}: "${n}" missing or out of order`);
        at = i;
    }
};
// The needles as one run of lines, nothing between them.
const together = (lines, run, msg) => {
    const i = lines.indexOf(run[0]);
    assert.ok(i >= 0, `${msg}: "${run[0]}" missing`);
    assert.deepEqual(lines.slice(i, i + run.length), run, `${msg}: these lines one after another`);
};

const SUITES = ['tests/a.test.mjs', 'tests/b.test.mjs', 'tests/c.test.mjs', 'tests/d.test.mjs', 'tests/e.test.mjs'];
const READERS = new Map([
    ['src/x.js', new Set(['tests/d.test.mjs', 'tests/b.test.mjs'])],
    ['src/y.js', new Set(['tests/e.test.mjs'])],
]);
const SOLO = new Map([['tests/a.test.mjs', 100], ['tests/b.test.mjs', 3000], ['tests/c.test.mjs', 50], ['tests/d.test.mjs', 200], ['tests/e.test.mjs', SLOW_MS]]);

test('a mutant\'s parts split SUITES: every test in exactly one, in SUITES\' order — its fast likely tests, its slow likely tests, the rest', () => {
    const parts = partsOf('src/x.js', { suites: SUITES, readers: READERS, soloMs: SOLO });
    assert.deepEqual(parts, [
        { name: PARTS[0], tests: ['tests/d.test.mjs'] },
        { name: PARTS[1], tests: ['tests/b.test.mjs'] },
        { name: PARTS[2], tests: ['tests/a.test.mjs', 'tests/c.test.mjs', 'tests/e.test.mjs'] },
    ]);
    for (const file of ['src/x.js', 'src/y.js', 'src/none.js', 'tests/c.test.mjs']) {
        const all = partsOf(file, { suites: SUITES, readers: READERS, soloMs: SOLO }).flatMap((p) => p.tests);
        assert.deepEqual([...all].sort(), [...SUITES].sort(), `${file}: every test once — REGRESSION: a part drops a test, or runs one twice`);
    }
    assert.deepEqual(partsOf('src/y.js', { suites: SUITES, readers: READERS, soloMs: SOLO }).map((p) => p.name), [PARTS[1], PARTS[2]],
        'a test as slow as SLOW_MS is slow; an empty part is left out');
    assert.deepEqual(partsOf('src/none.js', { suites: SUITES, readers: READERS, soloMs: SOLO }), [{ name: PARTS[2], tests: SUITES }],
        'a file no test reads runs the whole of SUITES, as before');
    assert.deepEqual(partsOf('tests/c.test.mjs', { suites: SUITES, readers: READERS, soloMs: SOLO })[0], { name: PARTS[0], tests: ['tests/c.test.mjs'] },
        'a mutant in a test is run by that test first');
    assert.deepEqual(partsOf('src/x.js', { suites: SUITES, readers: READERS }), [
        { name: PARTS[0], tests: ['tests/b.test.mjs', 'tests/d.test.mjs'] },
        { name: PARTS[2], tests: ['tests/a.test.mjs', 'tests/c.test.mjs', 'tests/e.test.mjs'] },
    ], 'a test with no time alone counts as fast; a part keeps SUITES\' order, never its readers\' (d before b)');
    assert.ok(SLOW_MS >= 500 && SLOW_MS <= 3000, 'slow is a second or so alone');
});

test('the verdict: caught by the first part that fails, the parts after it never run; a survivor has run every part once', () => {
    const parts = partsOf('src/x.js', { suites: SUITES, readers: READERS, soloMs: SOLO });
    const ran = [];
    const failsOn = (t) => (tests) => { ran.push(tests); return tests.includes(t); };
    assert.deepEqual(gradeParts(parts, failsOn('tests/d.test.mjs')), { caught: true, by: PARTS[0] });
    assert.equal(ran.length, 1, 'REGRESSION: a part after the one that failed still runs');
    ran.length = 0;
    assert.deepEqual(gradeParts(parts, failsOn('tests/e.test.mjs')), { caught: true, by: PARTS[2] }, 'a test only the rest holds still catches it');
    assert.equal(ran.length, 3);
    ran.length = 0;
    assert.deepEqual(gradeParts(parts, failsOn('tests/none.test.mjs')), { caught: false, by: null });
    assert.deepEqual(ran.flat().sort(), [...SUITES].sort(), 'REGRESSION: a survivor is graded on part of SUITES');
});

test('a run reads only the exit code, with no shell and no output kept; the baseline\'s output is read whole', () => {
    const calls = [];
    const exec = (cmd, args, opts) => { calls.push({ cmd, args, opts }); if (args.at(-1) === 'tests/red.test.mjs') throw Object.assign(new Error('exit 1'), { stdout: 'not ok 1 - red\n', stderr: '' }); return 'ok\n'; };
    assert.equal(runSuites(['tests/a.test.mjs', 'tests/b.test.mjs'], { exec }), false);
    assert.equal(runSuites(['tests/red.test.mjs'], { exec }), true);
    assert.equal(calls[0].cmd, process.execPath, 'node itself — REGRESSION: a shell, whose command line stops at 8,191 characters on Windows');
    assert.deepEqual(calls[0].args, ['--test', 'tests/a.test.mjs', 'tests/b.test.mjs']);
    assert.equal(calls[0].opts.stdio, 'ignore', 'REGRESSION: output kept in a buffer that, overrun, reads as CAUGHT');
    assert.ok(!('maxBuffer' in calls[0].opts) && !('shell' in calls[0].opts));
    assert.ok(calls.every((c) => c.opts.env && !('NODE_TEST_CONTEXT' in c.opts.env)), 'REGRESSION: a run under a test runner\'s context exits 0 over a failure');
    assert.deepEqual(runEnv({ A: '1', NODE_TEST_CONTEXT: 'child-v8' }), { A: '1' });
    assert.deepEqual(runSuitesOut(['tests/a.test.mjs'], { exec }), { red: false, out: 'ok\n' });
    assert.deepEqual(runSuitesOut(['tests/red.test.mjs'], { exec }), { red: true, out: 'not ok 1 - red\n' });
    assert.equal(calls.at(-1).opts.stdio, 'pipe');
    assert.ok(calls.at(-1).opts.maxBuffer >= 64 * 1024 * 1024, 'the baseline keeps its whole output (execSync\'s default is 1 MB)');
});

test('the baseline alone: each suite run by itself, timed, the red ones named', () => {
    let clock = 0;
    const calls = [];
    const run = (tests) => { calls.push(tests); clock += tests[0] === 'tests/b.test.mjs' ? 1500 : 10; return tests[0] === 'tests/c.test.mjs'; };
    const { soloMs, red } = soloBaseline(SUITES, { run, now: () => clock });
    assert.deepEqual(calls, SUITES.map((t) => [t]), 'REGRESSION: a suite proven green in company, not alone');
    assert.deepEqual(red, ['tests/c.test.mjs']);
    assert.equal(soloMs.size, SUITES.length);
    assert.equal(soloMs.get('tests/b.test.mjs'), 1500);
    assert.equal(soloMs.get('tests/a.test.mjs'), 10);
});

test('a file\'s readers: the SUITES tests that read, import or run it (scripts/_scope.mjs filesOf); a repo file by its exact name', () => {
    const tree = {
        'tests/a.test.mjs': "import { f } from '../src/x.js';\n",
        'tests/b.test.mjs': "const s = read('src/y.js');\n",
        'src/x.js': "import { g } from './y.js';\n",
        'src/y.js': 'export const g = 1;\n',
    };
    const readers = readersOf(['tests/a.test.mjs', 'tests/b.test.mjs'], { isFile: (p) => p in tree, read: (p) => tree[p] });
    assert.deepEqual([...readers.get('src/x.js')], ['tests/a.test.mjs']);
    assert.deepEqual([...readers.get('src/y.js')].sort(), ['tests/a.test.mjs', 'tests/b.test.mjs'], 'what the import imports, and what a test reads');
    assert.equal(repoIsFile('scripts/_likely.mjs'), true);
    assert.equal(repoIsFile('scripts/_LIKELY.mjs'), false, 'REGRESSION: Windows\' case-blind disk names a file by another case');
    assert.equal(repoIsFile('scripts'), false, 'a folder is no file');
});

test('a real run: node over the files named, its exit code read — a passing file green, a failing one red, the baseline\'s words kept', () => {
    const dir = mkdtempSync(join(tmpdir(), 'likely-'));
    try {
        const pass = join(dir, 'pass.test.mjs'), fail = join(dir, 'fail.test.mjs');
        writeFileSync(pass, "import { test } from 'node:test';\ntest('passes', () => {});\n");
        writeFileSync(fail, "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fails on purpose', () => { assert.equal(1, 2); });\n");
        assert.equal(runSuites([pass]), false);
        assert.equal(runSuites([fail]), true);
        assert.equal(runSuites([pass, fail]), true, 'REGRESSION: a file named is not run');
        const out = runSuitesOut([fail]);
        assert.equal(out.red, true);
        assert.match(out.out, /fails on purpose/, 'the red baseline\'s words, to name the failing test');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A runner's code as lines, trimmed, comments left out (scripts/mutate-import.mjs: the runner after its entries, which
// quote runner lines; its imports from its head).
const runnerOf = (p) => {
    const s = read(p);
    const tail = p === 'scripts/mutate-import.mjs' ? s.slice(s.indexOf('\n];\n')) : s;
    const head = p === 'scripts/mutate-import.mjs' ? s.slice(0, s.indexOf('const mutations = [')) : s;
    const lines = (t) => t.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
    return { head: lines(head), code: lines(tail) };
};
const GRADE = (call) => [
    'const failed = withMutant(file, original.replace(re, () => toFileEol(to, original)), () => {',
    `const verdict = gradeParts(partsOf(${call}), runSuites);`,
    'if (verdict.caught) caughtBy[verdict.by]++;',
    'return verdict.caught;',
    '});',
];

test('mutate-import.mjs (every entry): the baseline together, then alone, then "green", then the readers, before the first mutant; each mutant graded by its parts alone', () => {
    const { head, code } = runnerOf('scripts/mutate-import.mjs');
    assert.ok(head.includes("import { readersOf, partsOf, gradeParts, runSuites, runSuitesOut, soloBaseline, repoIsFile, PARTS } from './_likely.mjs';"));
    inOrder(code, [
        "const SUITE_LIST = SUITES.split(' ');",
        'const baseline = runSuitesOut(SUITE_LIST);',
        'if (baseline.red) {',
        'process.exit(1);',
        'const solo = soloBaseline(SUITE_LIST);',
        'if (solo.red.length) {',
        'process.exit(1);',
        "console.log('Baseline: green.');",
        "const READERS = readersOf(SUITE_LIST, { isFile: repoIsFile, read: (p) => readFileSync(p, 'utf8') });",
        'armRestoreOnExit();   // no exit path leaves a mutant on disk (§0.102)',
        'const caughtBy = Object.fromEntries(PARTS.map((p) => [p, 0]));',
        'for (const [name, file, from, to] of mutations) {',
        ...GRADE('file, { suites: SUITE_LIST, readers: READERS, soloMs: solo.soloMs }'),
        "console.log(`${failed ? 'CAUGHT' : 'SURVIVED'}  ${name}`);",
        "console.log(`Caught by: ${PARTS.map((p) => `${caughtBy[p]} the ${p}`).join(' · ')}.`);",
        'process.exit(survived ? 1 : 0);',
    ], 'mutate-import.mjs');
    together(code, GRADE('file, { suites: SUITE_LIST, readers: READERS, soloMs: solo.soloMs }'), 'mutate-import.mjs: the mutant\'s verdict is its parts\' — REGRESSION: graded again on SUITES whole');
    assert.equal(code.filter((l) => l === "console.log('Baseline: green.');").length, 1, '"Baseline: green." once, after both baselines');
    assert.ok(!code.some((l) => /\bexecSync\b/.test(l)), 'REGRESSION: a mutant run through a shell, its output kept');
});

test('mutate-scope.mjs (a batch\'s): the same order — the baseline together and alone, "green", the readers, then each mutant by its parts alone', () => {
    const { code } = runnerOf('scripts/mutate-scope.mjs');
    assert.ok(code.includes("import { readersOf, partsOf, gradeParts, runSuites, runSuitesOut, soloBaseline, PARTS } from './_likely.mjs';"));
    inOrder(code, [
        'const baseline = runSuitesOut(suites);',
        'if (baseline.red) {',
        'process.exit(1);',
        'const solo = soloBaseline(suites);',
        'if (solo.red.length) {',
        'process.exit(1);',
        "console.log('Baseline: green.');",
        'const readers = readersOf(suites, { isFile, read });',
        'armRestoreOnExit();',
        'const caughtBy = Object.fromEntries(PARTS.map((p) => [p, 0]));',
        'for (const [name, file, from, to] of scope.entries) {',
        ...GRADE('file, { suites, readers, soloMs: solo.soloMs }'),
        "console.log(`${failed ? 'CAUGHT' : 'SURVIVED'}  ${name}`);",
        "console.log(`Caught by: ${PARTS.map((p) => `${caughtBy[p]} the ${p}`).join(' · ')}.`);",
        'process.exit(survived ? 1 : 0);',
    ], 'mutate-scope.mjs');
    together(code, GRADE('file, { suites, readers, soloMs: solo.soloMs }'), 'mutate-scope.mjs: the mutant\'s verdict is its parts\'');
    assert.equal(code.filter((l) => l === "console.log('Baseline: green.');").length, 1, '"Baseline: green." once, after both baselines');
    assert.ok(!code.some((l) => /\bexecSync\b/.test(l)), 'REGRESSION: a mutant run through a shell, its output kept');
    const likely = runnerOf('scripts/_likely.mjs').code;
    assert.ok(!likely.some((l) => /\bexecSync\b/.test(l)), 'REGRESSION: _likely.mjs runs node through a shell');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/mutate-likely.test.mjs'), 'SUITES runs this file');
});
