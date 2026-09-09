// _mutant.mjs — put a mutant on disk, run something, and take the mutant OFF
// again no matter how the run ends (handoff item 35, state §0.102).
//
// Origin: twice (§0.96, §0.100) scripts/mutate-import.mjs died mid-mutant — the
// second time writeFileSync threw `UNKNOWN errno -4094`, a transient Windows
// file lock — and left a mutated source file on disk for `git status` to
// catch. The loop wrote the mutant, ran the suites, wrote the original back:
// three statements with nothing between a throw and a dirty tree. Now the
// original is registered BEFORE the mutant write, restored in a finally, and
// restored again by a process-level hook on exit, on a signal, or on an
// uncaught exception, so no exit path leaves a mutant behind. A restore that
// fails is left registered for the exit hook and rethrown, because a harness
// that carries on grading with a mutant on disk misgrades every mutant after.
//
// Runs must be SYNCHRONOUS (the harness uses execSync): an async run would
// return a promise and the finally would restore before it settled — that is
// refused with an error rather than silently graded.
import { readFileSync, writeFileSync } from 'fs';

const pending = new Map();   // file → original text, for every mutant currently on disk

function restoreAll(why) {
    for (const [file, original] of pending) {
        try {
            writeFileSync(file, original);
            console.error(`mutant: restored ${file} (${why})`);
            pending.delete(file);
        } catch (e) {
            console.error(`mutant: COULD NOT restore ${file} (${why}): ${e.message} — run git status and restore it from HEAD`);
        }
    }
}

let armed = false;

/** Register the process-level restore: exit, SIGINT/SIGTERM/SIGHUP, uncaught exception. Idempotent. */
export function armRestoreOnExit() {
    if (armed) return;
    armed = true;
    process.on('exit', () => restoreAll('process exit'));
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(sig, () => { restoreAll(sig); process.exit(130); });
    }
    process.on('uncaughtException', (err) => {
        restoreAll('uncaught exception');
        console.error(err);
        process.exit(1);
    });
}

/**
 * Write `mutated` over `file`, call `run()`, and restore the file's original
 * text whether `run` returns or throws. Returns what `run` returned; rethrows
 * what it threw. `run` must be synchronous.
 */
export function withMutant(file, mutated, run) {
    if (typeof file !== 'string' || !file) throw new Error('withMutant: a file path is required');
    if (typeof mutated !== 'string') throw new Error('withMutant: the mutated text must be a string');
    if (typeof run !== 'function') throw new Error('withMutant: run must be a function');
    const original = readFileSync(file, 'utf8');
    pending.set(file, original);   // BEFORE the write: a write that throws half-way is still restored
    try {
        writeFileSync(file, mutated);
        const result = run();
        if (result && typeof result.then === 'function') {
            throw new Error('withMutant: run must be synchronous — an async run would be graded after the file was restored');
        }
        return result;
    } finally {
        try {
            writeFileSync(file, original);
            pending.delete(file);
        } catch (e) {
            // Left in `pending` for the exit hook's second attempt; and thrown, so
            // the caller stops rather than grading the next mutant over this one.
            console.error(`mutant: restore of ${file} failed: ${e.message} — the exit hook will retry`);
            throw e;
        }
    }
}

/** The files that currently carry a mutant (for tests and for a caller's own reporting). */
export const pendingMutants = () => [...pending.keys()];
