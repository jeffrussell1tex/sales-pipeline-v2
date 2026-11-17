// _likely.mjs — a mutant graded by its likely tests first (OPEN_ITEMS §6, recommended 4 Nov — Jeff: "apply your
// recommendation to the project rules"; built 16 Nov, Jeff: "Do option 1 harness improvements").
//
// Every mutant ran all of SUITES, about 10 s. Nearly every one is caught by a test that reads, imports or runs the
// file it changes (a sample of 100, 16 Nov: 99). So a mutant's SUITES run in parts, stopping at the first that fails:
//   1. its likely tests under SLOW_MS alone — the SUITES tests that read, import or run its file (scripts/_scope.mjs
//      filesOf), and the file itself when it is one of SUITES;
//   2. the rest of its likely tests;
//   3. the rest of SUITES.
// The parts split SUITES, each test in exactly one, in SUITES' order: a mutant no part catches has run every test once,
// as before, and is SURVIVED; one a part catches is CAUGHT, as the full run would say it — node --test runs each file in
// its own process, and the baseline proves every suite green alone as well as together (soloBaseline). A wrong guess
// costs time, never a grade. Two samples graded both ways, 16 Nov: 200 entries, every verdict the same.
//
// A run reads only the exit code: its output is not kept (stdio 'ignore'). Kept, it was held to execSync's 1 MB
// buffer, and a run that printed past it threw — read as CAUGHT. And node is started without a shell: cmd.exe stops a
// command at 8,191 characters, and the SUITES line was 5,464 (16 Nov).
import { statSync, realpathSync } from 'fs';
import { execFileSync } from 'child_process';
import { filesOf } from './_scope.mjs';

// A repo file by its exact name, from the repo root (scripts/mutate-scope.mjs's own test): Windows' disk is blind to
// case, so a word ('Users') would name users.mjs twice.
export const repoIsFile = (p) => { try { return statSync(p).isFile() && realpathSync.native(p).replace(/\\/g, '/').endsWith(`/${p}`); } catch { return false; } };

// A suite slower than this alone runs in the second part.
export const SLOW_MS = 1000;

// file → the SUITES tests that read, import or run it.
export function readersOf(suites, { isFile, read }) {
    const readers = new Map();
    for (const t of suites) {
        for (const f of filesOf(t, { isFile, read })) {
            if (!readers.has(f)) readers.set(f, new Set());
            readers.get(f).add(t);
        }
    }
    return readers;
}

export const PARTS = ['fast likely tests', 'slow likely tests', 'rest of SUITES'];

// A mutant's SUITES in their parts, [{ name, tests }] in PARTS' order, each part's tests in SUITES' order, an empty part
// left out. soloMs: test → its time alone (soloBaseline); a test with no time counts as fast.
export function partsOf(file, { suites, readers, soloMs = new Map(), slowMs = SLOW_MS }) {
    const isLikely = (t) => t === file || !!readers.get(file)?.has(t);
    const slow = (t) => (soloMs.get(t) ?? 0) >= slowMs;
    return [
        { name: PARTS[0], tests: suites.filter((t) => isLikely(t) && !slow(t)) },
        { name: PARTS[1], tests: suites.filter((t) => isLikely(t) && slow(t)) },
        { name: PARTS[2], tests: suites.filter((t) => !isLikely(t)) },
    ].filter((p) => p.tests.length);
}

// The verdict: { caught, by } — by the name of the part that failed, null when none did. run(tests) → true when a test
// failed (node --test exited non-zero).
export function gradeParts(parts, run) {
    for (const p of parts) if (run(p.tests)) return { caught: true, by: p.name };
    return { caught: false, by: null };
}

// The environment a run gets: this process's, less NODE_TEST_CONTEXT — set, as under a node --test of its own, it makes
// the run report to a parent that is not there and exit 0 over a failing test (tests/mutate-likely.test.mjs's real run).
export function runEnv(env = process.env) {
    const out = { ...env };
    delete out.NODE_TEST_CONTEXT;
    return out;
}

// node --test over the tests; true when it exits non-zero. Only the exit code is read.
export function runSuites(tests, { exec = execFileSync } = {}) {
    try { exec(process.execPath, ['--test', ...tests], { stdio: 'ignore', env: runEnv() }); return false; }
    catch { return true; }
}

// The baseline's output, for its red report: the whole of it, however long (64 MB).
export function runSuitesOut(tests, { exec = execFileSync } = {}) {
    try { return { red: false, out: String(exec(process.execPath, ['--test', ...tests], { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, env: runEnv() })) }; }
    catch (e) { return { red: true, out: `${e.stdout || ''}${e.stderr || ''}${e.code === 'ENOBUFS' ? '\n(output past 64 MB)' : ''}` }; }
}

// Each suite alone, timed: { soloMs, red } — red the suites that fail alone. A suite red alone would grade its part
// CAUGHT whatever the mutant; the runners refuse to grade then, as on a red baseline.
export function soloBaseline(suites, { run = runSuites, now = Date.now } = {}) {
    const soloMs = new Map();
    const red = [];
    for (const t of suites) {
        const at = now();
        if (run([t])) red.push(t);
        soloMs.set(t, now() - at);
    }
    return { soloMs, red };
}
