// Post-build guard: prove the emitted bundle CONTAINS THE APPLICATION.
//
// The failure this exists for:
//   `vite build` without VITE_CLERK_PUBLISHABLE_KEY exits 0 and emits a complete,
//   valid-looking dist/ that contains no application. Vite statically replaces
//   import.meta.env.VITE_CLERK_PUBLISHABLE_KEY with `undefined`, so src/main.jsx
//   folds to `if (!undefined) throw ...`. Rollup proves everything after the throw
//   is unreachable and tree-shakes App and its entire module graph away.
//
//   Measured on this repo (dev @ 63058cb):
//       with the key   : 2,505,905 B of JS, 223+ modules, exit 0
//       without it     :   212,639 B of JS, exit 0, ZERO application code
//
// Why nothing else catches it:
//   - exit code is 0 on both
//   - index.html is byte-identical apart from the entry chunk's content hash
//   - the CSS asset is BYTE-IDENTICAL (same content hash, dd3f4e9b...) because
//     `import './index.css'` sits above the throw and survives. So "assets were
//     emitted" and "CSS is present" both pass on a hollow build. They prove nothing.
//   - index.html ships static crawler-readable marketing copy inside #root, so a
//     hollow deploy renders a plausible landing page rather than a white screen.
//     Nobody glancing at the site would notice.
//
// Design: markers first, size last.
//   Size alone is weak — it only says "big", and it churns the moment anyone adds
//   code-splitting (the build already warns about the 500 kB chunk limit). The load
//   -bearing checks are STRING MARKERS: string literals survive minification, so a
//   needle from deep in the app graph is present iff that graph was bundled.
//   Size is the backstop for a hollow build produced by some mechanism not yet seen.
//
// Usage:
//   node scripts/check-bundle.mjs              check ./dist
//   node scripts/check-bundle.mjs dist-hollow  check a known-bad artifact (see --help)
//
// Exit 0 = the bundle contains the app. Exit 1 = do not deploy this.

import fs from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

// Strings that must NOT appear. Each is the fingerprint of a bootstrap that
// aborted before mounting: if the abort is still in the bundle, rollup kept the
// throw and dropped the app.
//
// If main.jsx is ever changed to render a friendly error page instead of
// throwing, this string will legitimately survive into a good build and this
// check will fail. That is a FALSE POSITIVE and the fix is to edit this list —
// not to delete the check. Failing closed on the auth bootstrap is correct.
const ABORT_MARKERS = [
    {
        needle: 'Missing VITE_CLERK_PUBLISHABLE_KEY',
        source: 'src/main.jsx',
        means: 'VITE_CLERK_PUBLISHABLE_KEY was not set at BUILD time.',
    },
];

// Strings that MUST appear, with a floor on how many times. Counts are set well
// below what a healthy build produces so ordinary refactoring never trips them;
// the point is presence, not exact quantity. Observed counts at 63058cb are in
// the comments.
//
// Chosen for architectural durability — each disappears only if a whole layer of
// the app is rewritten, at which point failing loudly is the right outcome.
const APP_MARKERS = [
    {
        needle: '/.netlify/functions/',
        min: 20,                 // observed 259
        proves: 'the data layer — every dbFetch call site builds this URL',
    },
    {
        needle: 'Bearer ',
        min: 1,                  // observed 5
        proves: 'the auth layer — the Clerk JWT Authorization header',
    },
];

// The Clerk publishable key is inlined into the bundle by Vite's static env
// replacement, so its presence is DIRECT evidence the env var existed at build
// time — the root cause, not a downstream symptom.
// Deliberately NOT a format validation. The question is only "did the env var
// reach the bundle" — unset, empty, or renamed. An earlier version required 8+
// trailing characters and failed the documented gate command, which uses
// `pk_test_dummy`; validating Clerk's key shape is a different job and this is
// the wrong place to do it.
const CLERK_KEY_RE = /pk_(test|live)_[A-Za-z0-9$_-]{3,}/;

// Backstop only. Deliberately generous: 3.8x above a measured hollow build
// (212,639 B) and 3.1x below a real one (2,505,905 B). Summed across ALL chunks
// so introducing manualChunks does not trip it — splitting moves bytes between
// chunks, it does not remove them.
const MIN_TOTAL_JS_BYTES = 800_000;

// The production site. Used only to decide whether a pk_test_ key is a mistake.
// Both Netlify sites build their own default branch, so Netlify's CONTEXT is
// "production" for the dev site too — CONTEXT alone cannot distinguish them.
const PROD_HOSTS = ['salespipelinetracker.com'];

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const positional = argv.filter(a => !a.startsWith('--'));
const distDir = positional[0] || 'dist';
const verbose = flags.has('--verbose');

// --expect=live | --expect=test forces the key-environment assertion. Without it
// the check is advisory, because the correct answer depends on which Netlify site
// is building and that is not reliably knowable from inside the build.
const expectFlag = argv.find(a => a.startsWith('--expect='))?.split('=')[1];

if (flags.has('--help')) {
    console.log(`
check-bundle — assert that dist/ contains the application, not just a shell.

  npm run build                          build, then check (this is the gate)
  npm run check:bundle                   check an existing ./dist
  node scripts/check-bundle.mjs DIR      check some other directory
  node scripts/check-bundle.mjs --verbose        show every marker count
  node scripts/check-bundle.mjs --expect=live    also require a pk_live_ key

WHY THIS EXISTS
  \`vite build\` with no VITE_CLERK_PUBLISHABLE_KEY exits 0 and emits a 212 kB
  bundle containing no application: main.jsx folds to an unconditional throw and
  rollup tree-shakes App away. index.html and the CSS asset are unchanged, and
  index.html's static marketing copy still renders — so the deploy looks fine.

PROVING IT WORKS
  A guard that has never failed is not evidence. To see it fail on demand:

      npx vite build && mv dist dist-hollow          # no env var -> hollow
      node scripts/check-bundle.mjs dist-hollow      # must exit 1
      VITE_CLERK_PUBLISHABLE_KEY=pk_test_x npm run build   # must exit 0

FALSE POSITIVES
  Every failure names the exact assertion and the constant to edit. If a marker
  goes stale because a layer was legitimately rewritten, update the constant at
  the top of this file. Do not delete the check.
`.trim());
    process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Collect findings, report once at the end. Running every assertion instead of
// bailing on the first means one run tells you everything that is wrong.
// ─────────────────────────────────────────────────────────────────────────────

const failures = [];
const warnings = [];
const notes = [];

const fail = (what, detail, fix) => failures.push({ what, detail, fix });
const warn = (what, detail) => warnings.push({ what, detail });

// ── 1. The artifact exists at all ────────────────────────────────────────────
// A missing dist/ usually means the build command never ran, or ran in a
// different working directory. Distinguish that from a bad build.

if (!fs.existsSync(distDir)) {
    console.error(`\n  BUILD GUARD FAILED\n\n  ${path.resolve(distDir)} does not exist.\n  The build did not run, or ran somewhere else.\n`);
    process.exit(1);
}

const htmlPath = path.join(distDir, 'index.html');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(htmlPath)) {
    fail('index.html missing', `${htmlPath} was not emitted.`, 'Check vite.config.js build.outDir and the Netlify publish directory.');
}

const jsFiles = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter(f => f.endsWith('.js')).map(f => path.join(assetsDir, f))
    : [];

if (!jsFiles.length) {
    fail('no JS emitted', `No .js files in ${assetsDir}.`, 'The build produced no application code at all.');
}

// Read every chunk once. Concatenating is fine at this size (~2.5 MB) and makes
// the marker checks indifferent to how rollup split the graph.
const jsSources = jsFiles.map(f => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
const allJs = jsSources.map(s => s.text).join('\n');
const totalJsBytes = jsFiles.reduce((n, f) => n + fs.statSync(f).size, 0);

// ── 2. index.html actually points at a chunk that exists ─────────────────────
// Catches a stale or partially-written dist where the HTML references a hash
// that is no longer on disk — the browser 404s the entry and mounts nothing.

if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const refs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m => m[1]);

    if (!refs.length) {
        fail('index.html loads no script', 'No <script src="*.js"> in the emitted HTML.',
            'Without an entry script the page renders only the static #root fallback — which looks like a working landing page.');
    }
    for (const ref of refs) {
        const onDisk = path.join(distDir, ref.replace(/^\//, ''));
        if (!fs.existsSync(onDisk)) {
            fail('entry chunk missing', `index.html references ${ref}, which is not in ${distDir}.`,
                'Stale or partial dist/. Remove it and rebuild from clean.');
        }
    }
}

// ── 3. Bootstrap-abort markers — the precise fingerprint ─────────────────────
// This is the most specific check, so it runs before the general ones: when it
// fires it names the root cause exactly instead of reporting "bundle too small".

for (const m of ABORT_MARKERS) {
    if (allJs.includes(m.needle)) {
        fail('bootstrap abort is still in the bundle',
            `Found "${m.needle}" (from ${m.source}) in the emitted JS.\n     ` +
            `In a healthy build rollup folds that branch away and the string is absent.\n     ` +
            `${m.means}`,
            'Set VITE_CLERK_PUBLISHABLE_KEY in the Netlify site\'s environment variables (Site configuration -> Environment variables), or export it locally, then rebuild.\n     ' +
            'If main.jsx was intentionally changed to render an error page instead of throwing, update ABORT_MARKERS in this file.');
    }
}

// ── 4. The env var reached the bundle ────────────────────────────────────────

const keyMatch = allJs.match(CLERK_KEY_RE);
if (!keyMatch) {
    fail('no Clerk publishable key in the bundle',
        'Vite inlines import.meta.env.VITE_CLERK_PUBLISHABLE_KEY at build time, so a healthy bundle always contains a pk_test_/pk_live_ literal. This one does not.',
        'The variable was unset, empty, or renamed at build time. Confirm the exact name VITE_CLERK_PUBLISHABLE_KEY — Vite only exposes VITE_-prefixed vars.');
} else {
    const keyEnv = keyMatch[1];                       // 'test' | 'live'
    notes.push(`Clerk key: pk_${keyEnv}_… inlined`);

    // Advisory unless --expect is passed or the build is clearly the prod site.
    // A pk_test_ key on salespipelinetracker.com points production at the dev
    // Clerk instance, where the org IDs are different — every user lands in an
    // org that does not exist. Silent, total, and it looks like a data problem.
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
    const looksProd = PROD_HOSTS.some(h => siteUrl.includes(h));
    const expected = expectFlag || (looksProd ? 'live' : null);

    if (expected && keyEnv !== expected) {
        fail('wrong Clerk instance for this deploy',
            `Bundle carries a pk_${keyEnv}_ key but this build expects pk_${expected}_.` +
            (siteUrl ? ` (URL=${siteUrl})` : ''),
            'Clerk org IDs differ between instances, so the wrong key silently puts every user in a nonexistent org. Fix the env var on this Netlify site.');
    } else if (!expected && keyEnv === 'test') {
        warnings.push({
            what: 'test-mode Clerk key',
            detail: 'Correct for accelerep.netlify.app and for local builds. Wrong for production. Pass --expect=live on the production site to make this an error.',
        });
    }
}

// ── 5. App-graph markers ─────────────────────────────────────────────────────
// String literals survive minification; identifiers do not. So a needle from
// deep in the graph is present iff that part of the graph was bundled.

const countOf = (needle) => allJs.split(needle).length - 1;

for (const m of APP_MARKERS) {
    const n = countOf(m.needle);
    if (verbose) notes.push(`marker "${m.needle}" x${n} (min ${m.min})`);
    if (n < m.min) {
        fail('application code is missing from the bundle',
            `"${m.needle}" appears ${n} time(s); at least ${m.min} expected.\n     ` +
            `This marker proves ${m.proves}.`,
            'The module graph was tree-shaken or never included. If this layer was legitimately rewritten, update APP_MARKERS in this file.');
    }
}

// ── 6. Size floor — backstop ─────────────────────────────────────────────────

if (totalJsBytes < MIN_TOTAL_JS_BYTES) {
    fail('bundle far too small',
        `${totalJsBytes.toLocaleString()} B of JS across ${jsFiles.length} chunk(s); floor is ${MIN_TOTAL_JS_BYTES.toLocaleString()} B.\n     ` +
        'A hollow build measures ~212 kB, a real one ~2.5 MB.',
        'If the app was genuinely made this much smaller, lower MIN_TOTAL_JS_BYTES deliberately and say so in the commit.');
}

// ── 7. CSS emitted ───────────────────────────────────────────────────────────
// Weak by construction and labelled as such: the CSS asset is byte-identical in
// a hollow build, so this can only catch a total emit failure. It is here so the
// absence of a CSS check is a decision rather than an oversight.

const cssFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter(f => f.endsWith('.css')) : [];
if (!cssFiles.length) warn('no CSS emitted', 'Expected at least one .css asset. Does not by itself indicate a hollow bundle.');

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

if (failures.length) {
    console.error(`\n  BUILD GUARD FAILED — ${failures.length} problem(s) in ${path.resolve(distDir)}\n`);
    failures.forEach((f, i) => {
        console.error(`  ${i + 1}. ${f.what.toUpperCase()}`);
        console.error(`     ${f.detail}`);
        console.error(`     -> ${f.fix}\n`);
    });
    console.error(`  ${jsFiles.length} JS chunk(s), ${kb(totalJsBytes)} total.`);
    console.error('  This artifact must not be deployed. Exiting 1.\n');
    process.exit(1);
}

console.log(`  build guard OK — ${jsFiles.length} chunk(s), ${kb(totalJsBytes)} JS, ${cssFiles.length} CSS`);
notes.forEach(n => console.log(`    ${n}`));
warnings.forEach(w => console.log(`    warning: ${w.what} — ${w.detail}`));
process.exit(0);
