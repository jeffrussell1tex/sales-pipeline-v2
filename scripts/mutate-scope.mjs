// The harness, scoped to a batch (Jeff, 27 Oct 2026: "each batch gets the stale check, its own entries, every older
// entry on the files it changed and every entry caught by a test file it edited; the full run before each prod ship").
// The rules are scripts/_scope.mjs's (tests/mutate-scope.test.mjs runs them); each mutant goes on and comes off as the
// full harness's do (scripts/mutate-import.mjs, through scripts/_mutant.mjs), against the full SUITES, after a green
// baseline.
//
// 1. The stale check: every entry's anchor parsed against this tree — none may be missing; the batch's own must each be
//    their file's only match (the harness mutates the first).
// 2. The scope: the batch's own entries (any not at the base exactly — new, renamed, re-anchored or a new mutant),
//    every entry on a file the batch changed, and every entry on a file a SUITES test it edited reads, imports or runs.
// 3. The baseline, then each entry in scope: CAUGHT / SURVIVED, and the count.
//
// Run from a COPY of the repo when `netlify dev` is up in the repo (its HMR chases the rewrites); a copy has no .git, so
// name the repo for git's answers:
//   node scripts/mutate-scope.mjs [--base <rev>] [--git <repo dir>] [--list]
// --base: what the batch is measured from (default HEAD — an uncommitted batch); --list: print the scope, run nothing.
import { readFileSync, statSync, realpathSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import { armRestoreOnExit, withMutant } from './_mutant.mjs';
import { parseHarness, matchesOf, anchorRe, filesOf, scopeOf, normal } from './_scope.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'HEAD');
const GIT = arg('--git', '.');
const LIST = process.argv.includes('--list');
const git = (...a) => execFileSync('git', ['-C', GIT, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const H = 'scripts/mutate-import.mjs';
const { suites, mutations } = parseHarness(readFileSync(H, 'utf8'));
const base = parseHarness(git('show', `${BASE}:${H}`)).mutations;
const changedFiles = [...new Set([
    ...git('diff', '--name-only', BASE).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].map((p) => normal(p.trim())).filter(Boolean))];
// A repo file by its exact name: Windows' disk is blind to case, so a word ('Users') would name users.mjs twice.
const isFile = (p) => { try { return statSync(p).isFile() && realpathSync.native(p).replace(/\\/g, '/').endsWith(`/${p}`); } catch { return false; } };
const read = (p) => readFileSync(p, 'utf8');
const editedTests = changedFiles.filter((f) => suites.includes(f));
const scope = scopeOf({ mutations, base, changedFiles, editedTests, testFiles: (t) => filesOf(t, { isFile, read }) });

// 1. The stale check, over every entry.
const text = new Map();
const src = (f) => { if (!text.has(f)) text.set(f, isFile(f) ? read(f) : null); return text.get(f); };
const stale = mutations.filter(([, f, from]) => src(f) === null || matchesOf(src(f), from) === 0);
const own = scope.entries.filter((m) => scope.why.get(m).includes('own'));
const notUnique = own.filter(([, f, from]) => src(f) !== null && matchesOf(src(f), from) > 1);
console.log(`Base ${BASE}; ${changedFiles.length} files changed; ${editedTests.length} SUITES test(s) edited: ${editedTests.join(', ') || 'none'}`);
console.log(`Stale check: ${mutations.length} entries; ${stale.length} stale; ${notUnique.length} of the batch's own not their file's only match`);
for (const [n, f] of stale) console.log(`STALE  ${n}\n       anchor not found in ${f}`);
for (const [n, f] of notUnique) console.log(`NOT UNIQUE  ${n}\n       its anchor matches more than once in ${f}`);
console.log(`Scope: ${scope.entries.length} entries — ${scope.own} the batch's own, ${scope.changed} on files it changed, ${scope.tested} on the ${scope.testedFiles.size} files its edited tests read, import or run`);
if (LIST) {
    for (const m of scope.entries) console.log(`  [${scope.why.get(m).join(',')}]  ${m[0]}  (${m[1]})`);
    process.exit(stale.length || notUnique.length ? 1 : 0);
}
if (stale.length || notUnique.length) { console.log('Repoint those before grading anything.'); process.exit(1); }

// 2–3. The baseline, then the scope.
console.log(`Baseline: running the ${suites.length} suites unmutated...`);
try {
    execSync(`node --test ${suites.join(' ')}`, { stdio: 'pipe' });
    console.log('Baseline: green.\n');
} catch (e) {
    console.error('\nBASELINE IS RED — refusing to run mutations.\n');
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const fails = out.split(/\r?\n/).filter((l) => /^(not ok|✖|# fail)/.test(l.trim()));
    console.error(fails.length ? fails.join('\n') : out.slice(-2000));
    process.exit(1);
}
armRestoreOnExit();
const toFileEol = (t, s) => (s.includes('\r\n') ? t.replace(/\r?\n/g, '\r\n') : t.replace(/\r\n/g, '\n'));
let survived = 0;
for (const [name, file, from, to] of scope.entries) {
    const original = readFileSync(file, 'utf8');
    const re = anchorRe(from);
    const failed = withMutant(file, original.replace(re, () => toFileEol(to, original)), () => {
        try { execSync(`node --test ${suites.join(' ')}`, { stdio: 'pipe' }); return false; }
        catch { return true; }
    });
    console.log(`${failed ? 'CAUGHT' : 'SURVIVED'}  ${name}`);
    if (!failed) survived++;
}
console.log(`\n${scope.entries.length - survived}/${scope.entries.length} mutations caught (scoped: ${scope.own} own, ${scope.changed} changed-file, ${scope.tested} edited-test; 0 stale of ${mutations.length}).`);
process.exit(survived ? 1 : 0);
