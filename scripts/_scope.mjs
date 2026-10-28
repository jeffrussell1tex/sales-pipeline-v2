// _scope.mjs — which harness entries a batch must run (Jeff, 27 Oct 2026: "each batch gets the stale check, its own
// entries, every older entry on the files it changed and every entry caught by a test file it edited; the full run
// before each prod ship"). Pure — the runner, scripts/mutate-scope.mjs, hands in git's answers and the file reader —
// so tests/mutate-scope.test.mjs runs the rules on made-up trees.
//
// An entry is [name, file, from, to] (scripts/mutate-import.mjs). A batch's scope is the union of:
//   own      entries not at the base exactly — new, or with their name, file, anchor or mutant changed (a rename, a
//            re-anchor or a new mutant)
//   changed  entries on a file the batch changed
//   tested   entries on a file a SUITES test the batch edited reads, imports or runs: a test can only catch a mutant in a
//            file it reads as text or runs — what it imports, and what that imports, on down; a script it runs as a
//            subprocess, and that script's imports
// The full run (scripts/mutate-import.mjs, every entry) runs before each prod ship.

// The harness's own matching (scripts/mutate-import.mjs): an anchor matches whatever line endings the file uses.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const anchorRe = (from, flags = '') => new RegExp(escapeRe(from).replace(/\r?\n/g, '\\r?\\n'), flags);
export const matchesOf = (src, from) => (src.match(anchorRe(from, 'g')) || []).length;

// The SUITES string and the mutations array, read from the harness's text — never by running it (it runs on import).
export function parseHarness(text) {
    const h = String(text).replace(/\r\n/g, '\n');
    const suites = h.match(/^const SUITES = '([^'\n]*)';$/m);
    const s = h.indexOf('const mutations = ['), e = h.indexOf('\n];\n', s);
    if (!suites || s < 0 || e < 0) throw new Error('not the harness: no SUITES or no mutations array');
    const mutations = (0, eval)(h.slice(s + 'const mutations = '.length, e + 3));
    return { suites: suites[1].split(' ').filter(Boolean), mutations };
}

export const entryKey = (m) => JSON.stringify(m);

// The string literals of a source: every run quoted with ', " or ` on one line (a template up to its first ${), read
// from EVERY quote — so a stray quote (an apostrophe inside a "…" string, a template's ${…}) cannot pair the wrong
// quotes and hide a path, as one regex pass did (tests/mutate-scope.test.mjs lost scripts/mutate-scope.mjs so, 27 Oct);
// the runs between two literals come too, and name no file. Each literal counts whole and by its words: a command line
// ('node scripts/x.mjs') names its script. Comments are not skipped: what a comment or a stray run names only widens
// the scope, never narrows it.
export function literalsOf(src) {
    const s = String(src);
    const out = [];
    for (let i = 0; i < s.length; i++) {
        const q = s[i];
        if (q !== "'" && q !== '"' && q !== '`') continue;
        let j = i + 1;
        while (j < s.length && s[j] !== q && s[j] !== '\n' && !(q === '`' && s[j] === '$' && s[j + 1] === '{')) j += s[j] === '\\' ? 2 : 1;
        if (s[j] !== q) continue;
        const lit = s.slice(i + 1, j);
        out.push(lit);
        const words = lit.split(/\s+/).filter(Boolean);
        if (words.length > 1) out.push(...words);
    }
    return out;
}

// The modules a source imports, by the text its statements name: a static import or a re-export (`export … from`) that
// begins a line — so an import written inside a string (a harness anchor, a made-up tree) is none; the harness's
// anchors, followed as imports, once pulled in half the repo — a bare import (side effects) that begins a line, and a
// dynamic import with a plain string anywhere (a stray one in a string only widens the scope).
export function importsOf(src) {
    const out = [];
    const s = String(src);
    for (const re of [/^[ \t]*(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/gm, /^[ \t]*import\s*['"]([^'"]+)['"]/gm, /\bimport\(\s*['"`]([^'"`$]+)['"`]\s*\)/g]) {
        for (let m; (m = re.exec(s));) out.push(m[1]);
    }
    return out;
}

// A path as the repo names it: forward slashes, no leading ./, `..` and `.` folded. null if it leaves the repo.
export function normal(p) {
    const parts = [];
    for (const seg of String(p).replace(/\\/g, '/').split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { if (!parts.length) return null; parts.pop(); continue; }
        parts.push(seg);
    }
    return parts.join('/');
}
const dirOf = (p) => p.split('/').slice(0, -1).join('/');
const JS = /\.(m?js|jsx|cjs)$/;

// The repo files a test reads or runs. `isFile(path)` says whether a repo path is a file; `read(path)` its text. A
// literal is a path from the repo root or, beginning with a dot, from its file's folder — or, bare, a function's name (a helper reads
// netlify/functions/<name>.mjs). What the test imports is followed down its imports, and a helper it imports from
// tests/ is read for the paths it names too. What it only reads as text is not followed — unless the test or a helper
// runs a subprocess (child_process): a script it names may be what it runs, and that runs the script's imports.
export function filesOf(test, { isFile, read }) {
    const seen = new Set();
    const ok = (p) => p && !p.startsWith('node_modules/') && isFile(p);
    const resolveImport = (from, spec) => {
        if (!spec.startsWith('.')) return null;   // a package, never a repo file
        const base = normal(`${dirOf(from)}/${spec}`);
        if (!base) return null;
        for (const p of [base, `${base}.js`, `${base}.mjs`, `${base}.jsx`, `${base}/index.js`]) if (ok(p)) return p;
        return null;
    };
    const follow = (file) => {
        if (seen.has(file)) return;
        seen.add(file);
        if (!JS.test(file)) return;
        for (const spec of importsOf(read(file))) { const p = resolveImport(file, spec); if (p) follow(p); }
    };
    const src = read(test);
    for (const spec of importsOf(src)) { const p = resolveImport(test, spec); if (p) follow(p); }
    const helpers = [...seen].filter((f) => f.startsWith('tests/') && JS.test(f));
    const runs = [test, ...helpers].some((f) => importsOf(read(f)).some((m) => m === 'child_process' || m === 'node:child_process'));
    const named = (from) => {
        for (const lit of literalsOf(read(from))) {
            if (!lit || lit.length > 200 || /\s/.test(lit)) continue;
            const rel = lit.startsWith('.') ? normal(`${dirOf(from)}/${lit}`) : null;
            for (const p of [rel, normal(lit), normal(`netlify/functions/${lit}.mjs`), normal(`netlify/functions/${lit}`)]) {
                if (ok(p)) { if (runs) follow(p); else seen.add(p); }
            }
        }
    };
    named(test);
    for (const h of helpers) named(h);
    seen.delete(test);
    return seen;
}

// The scope: { own, changed, tested, entries } — `entries` the union in the harness's order, each once. base: the
// harness's mutations at the base; changedFiles: the repo paths the batch changed; editedTests: the SUITES tests among
// them; testFiles(test): filesOf for one.
export function scopeOf({ mutations, base, changedFiles, editedTests, testFiles }) {
    const baseKeys = new Set((base || []).map(entryKey));
    const changed = new Set(changedFiles || []);
    const tested = new Set();
    for (const t of editedTests || []) for (const f of testFiles(t)) tested.add(f);
    const why = new Map();
    for (const m of mutations) {
        const tags = [];
        if (!baseKeys.has(entryKey(m))) tags.push('own');
        if (changed.has(m[1])) tags.push('changed');
        if (tested.has(m[1])) tags.push('tested');
        if (tags.length) why.set(m, tags);
    }
    const entries = mutations.filter((m) => why.has(m));
    const count = (tag) => entries.filter((m) => why.get(m).includes(tag)).length;
    return { entries, why, own: count('own'), changed: count('changed'), tested: count('tested'), testedFiles: tested };
}
