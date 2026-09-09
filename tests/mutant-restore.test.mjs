// tests/mutant-restore.test.mjs
//
// State §0.102, handoff item 35. Twice the mutation harness died mid-mutant and
// left a mutated source file on disk (§0.96; §0.100 — a transient Windows file
// lock on the mutant write). scripts/_mutant.mjs now registers the original
// before the write, restores in a finally, and restores again from a process
// exit hook. Every path is exercised here against a temp file: a run that
// returns, a run that throws, a run that is (wrongly) async, and — the crash
// class itself — a child process that calls process.exit() from inside the run,
// skipping every finally, whose file must still come back. The source scan pins
// that the harness goes through the sidecar and never writes a mutant itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { withMutant, armRestoreOnExit, pendingMutants } from '../scripts/_mutant.mjs';

const SIDE_CAR = new URL('../scripts/_mutant.mjs', import.meta.url).href;
const ORIGINAL = 'const answer = 42;\n';
const MUTANT   = 'const answer = 41;\n';

const tempFile = () => {
    const dir = mkdtempSync(join(tmpdir(), 'accelerep-mutant-'));
    const file = join(dir, 'target.js');
    writeFileSync(file, ORIGINAL);
    return { dir, file };
};

test('a run that returns: the mutant is on disk during the run, the original after, the result passed through', () => {
    const { dir, file } = tempFile();
    try {
        let seen = null;
        const out = withMutant(file, MUTANT, () => { seen = readFileSync(file, 'utf8'); return 'graded'; });
        assert.equal(seen, MUTANT, 'the run sees the mutant');
        assert.equal(out, 'graded', 'the return value is the run\'s');
        assert.equal(readFileSync(file, 'utf8'), ORIGINAL, 'the original is back');
        assert.deepEqual(pendingMutants(), [], 'nothing left registered');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('REGRESSION: a run that throws still restores the file, and the throw is the caller\'s', () => {
    const { dir, file } = tempFile();
    try {
        assert.throws(() => withMutant(file, MUTANT, () => { throw new Error('suite exploded'); }), /suite exploded/);
        assert.equal(readFileSync(file, 'utf8'), ORIGINAL, 'restored despite the throw');
        assert.deepEqual(pendingMutants(), []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an async run is refused — it would be graded after the restore — and the file is restored', () => {
    const { dir, file } = tempFile();
    try {
        assert.throws(() => withMutant(file, MUTANT, async () => 'never graded'), /must be synchronous/);
        assert.equal(readFileSync(file, 'utf8'), ORIGINAL);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bad arguments are refused before anything is written', () => {
    const { dir, file } = tempFile();
    try {
        assert.throws(() => withMutant('', MUTANT, () => {}), /file path/);
        assert.throws(() => withMutant(file, undefined, () => {}), /mutated text/);
        assert.throws(() => withMutant(file, MUTANT, 'not a function'), /run must be a function/);
        assert.equal(readFileSync(file, 'utf8'), ORIGINAL);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('REGRESSION (the crash class): process.exit() inside the run skips every finally — the exit hook restores the file', () => {
    const { dir, file } = tempFile();
    try {
        const script = [
            `const { withMutant, armRestoreOnExit } = await import(${JSON.stringify(SIDE_CAR)});`,
            'armRestoreOnExit();',
            `withMutant(${JSON.stringify(file)}, ${JSON.stringify(MUTANT)}, () => { process.exit(7); });`,
        ].join('\n');
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
        assert.equal(child.status, 7, `the child exited the way the run asked (stderr: ${child.stderr})`);
        assert.match(child.stderr, /mutant: restored .*target\.js \(process exit\)/, 'the hook said what it did');
        assert.equal(readFileSync(file, 'utf8'), ORIGINAL, 'the file came back although no finally ran');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an uncaught throw from the run kills the child process — the finally has restored before it dies, and the armed hook does no harm on a clean file', () => {
    const { dir, file } = tempFile();
    try {
        const script = [
            `const { withMutant, armRestoreOnExit } = await import(${JSON.stringify(SIDE_CAR)});`,
            'armRestoreOnExit();',
            `withMutant(${JSON.stringify(file)}, ${JSON.stringify(MUTANT)}, () => { throw new Error('boom inside the run'); });`,
        ].join('\n');
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
        assert.notEqual(child.status, 0, 'the child died on the uncaught throw');
        assert.match(child.stderr, /boom inside the run/);
        assert.equal(readFileSync(file, 'utf8'), ORIGINAL, 'restored by the finally before the process died');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('armRestoreOnExit is idempotent in-process', () => {
    const before = process.listenerCount('exit');
    armRestoreOnExit();
    armRestoreOnExit();
    assert.ok(process.listenerCount('exit') <= before + 1, 'one exit listener however many times it is armed');
});

test('the harness goes through the sidecar and never writes a mutant itself', () => {
    const src = readFileSync(new URL('../scripts/mutate-import.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.match(code, /import \{ armRestoreOnExit, withMutant \} from '\.\/_mutant\.mjs';/, 'the harness imports the sidecar');
    assert.match(code, /^armRestoreOnExit\(\);/m, 'the exit hook is armed at top level, before the first mutant');
    assert.match(code, /withMutant\(file, original\.replace\(re, \(\) => toFileEol\(to, original\)\), \(\) => \{/, 'each mutant is applied through withMutant');
    // The word appears inside the sidecar's own mutant entries (strings); what is
    // forbidden is the harness importing or CALLING it.
    assert.doesNotMatch(code, /import \{[^}]*\bwriteFileSync\b/, 'REGRESSION: the harness no longer imports writeFileSync');
    assert.doesNotMatch(code, /^\s*writeFileSync\(/m, 'REGRESSION: no bare write of a mutant or a restore in the harness');
});
