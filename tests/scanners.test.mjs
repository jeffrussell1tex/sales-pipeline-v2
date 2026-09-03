// Scanner regression suite.
//
// WHY THIS EXISTS
// ---------------
// The gates are treated as trusted infrastructure. They are ordinary code with
// ordinary bugs, and a green result from a scanner with a blind spot is worse than
// no scanner: it converts "unknown" into "verified". In one session, three of the
// four had a false-negative class, and every one was found by a bug reaching
// production first — never by reviewing the scanner:
//
//   check-tdz     skipped `T` entirely. /^[A-Z_]+$/ matched the single capital and
//                 treated the design-token object — the identifier most likely to
//                 be stranded by a hoist — as an imported SCREAMING_CASE constant.
//                 Reported "No render-time TDZ issues in 135 file(s)" over a hard
//                 crash of the Reports tab.
//   check-inline  scored children-rendering wrappers harmless, because riskOf()
//                 only inspects a component's own body. `FL` shipped a focus bug
//                 while the gate reported 0 user-visible.
//   scan-dbfetch  59% false positives in the hooks (10 of 17), well above the 17%
//                 already documented in the guide.
//
// Each fixture below is a real bug that shipped. If a scanner stops catching its
// fixture, the gate has regressed and these fail — which is the only way any of
// the above would have been caught early.
//
// Fixtures live in tests/fixtures/scanners/ and are named <scanner>-<case>.jsx.
// A "-safe" fixture is the false-POSITIVE guard: the scanner must stay quiet on it.
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIX = 'tests/fixtures/scanners';

// Scanners exit non-zero on a finding, so a throw IS the signal. Capture both.
const run = (script, args = []) => {
    try {
        const stdout = execFileSync('node', [script, ...args], { encoding: 'utf8' });
        return { code: 0, stdout };
    } catch (err) {
        return { code: err.status ?? 1, stdout: (err.stdout || '') + (err.stderr || '') };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// check-tdz
// ─────────────────────────────────────────────────────────────────────────────

test('check-tdz catches a token object stranded by a hoist', () => {
    // The ReportsTab crash. The point is the NAME: `T` must not be waved through
    // as a shouty constant when it is bound elsewhere in the same file.
    const r = run('scripts/check-tdz.mjs', [`${FIX}/tdz-stranded-token.jsx`]);
    assert.notEqual(r.code, 0, 'stranded T was not reported');
    assert.match(r.stdout, /UNDEF/);
    assert.match(r.stdout, /\bT\b/);
});

test('check-tdz catches a read before declaration', () => {
    const r = run('scripts/check-tdz.mjs', [`${FIX}/tdz-read-before-declaration.jsx`]);
    assert.notEqual(r.code, 0, 'TDZ read was not reported');
    assert.match(r.stdout, /TDZ|servicePlans/);
});

test('check-tdz stays quiet on correct code and genuine imports', () => {
    // The shouty-constant escape must still apply to a name bound nowhere in the
    // file, or every imported constant becomes a false positive.
    const r = run('scripts/check-tdz.mjs', [`${FIX}/tdz-clean.jsx`]);
    assert.equal(r.code, 0, `false positive:\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /IMPORTED_CONST/);
});

test('check-tdz catches a JSX element whose name is bound nowhere in the file', () => {
    // The Connected Apps crash (state §0.89). Both sites: inside a top-level
    // component, and in a module-level expression no component loop visits.
    const r = run('scripts/check-tdz.mjs', [`${FIX}/tdz-undefined-jsx.jsx`]);
    assert.notEqual(r.code, 0, 'an unbound JSX element name was not reported');
    assert.match(r.stdout, /UNDEF/);
    assert.match(r.stdout, /<Panel> reads "SlackConfigModal"/, 'inside a component: the scope walk names the component');
    assert.match(r.stdout, /<file> reads "RowFromNowhere"/, 'outside any component: the whole-file pass');
    assert.doesNotMatch(r.stdout, /"div"|"button"/, 'intrinsic elements are not references');
});

test('check-tdz is clean on the whole tree — no JSX element is bound nowhere', () => {
    // The gate's own scan of src/. A finding here is a component that will throw
    // on first render in production with every other gate green.
    const r = run('scripts/check-tdz.mjs');
    assert.equal(r.code, 0, r.stdout);
});

// ─────────────────────────────────────────────────────────────────────────────
// check-inline-components
// ─────────────────────────────────────────────────────────────────────────────

test('check-inline catches a wrapper that remounts a caller\'s form control', () => {
    // The FL bug. The wrapper owns no control; the <input> is passed as children.
    const r = run('scripts/check-inline-components.mjs', [`${FIX}/inline-children-wrapper.jsx`]);
    assert.notEqual(r.code, 0, 'children-wrapper was not reported');
    assert.match(r.stdout, /USER-VISIBLE/);
});

test('check-inline catches an inline component that owns a control', () => {
    const r = run('scripts/check-inline-components.mjs', [`${FIX}/inline-owns-control.jsx`]);
    assert.notEqual(r.code, 0);
    assert.match(r.stdout, /USER-VISIBLE/);
});

test('check-inline does not flag a presentational wrapper as user-visible', () => {
    // ReportsTab has 12 of these. Flagging them would fail CI over nothing, which
    // is how a gate stops being trusted.
    const r = run('scripts/check-inline-components.mjs', [`${FIX}/inline-safe.jsx`, '--churn']);
    assert.equal(r.code, 0, `false positive:\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /USER-VISIBLE/);
});

// ─────────────────────────────────────────────────────────────────────────────
// check-dupes
// ─────────────────────────────────────────────────────────────────────────────

test('check-dupes catches a duplicate object key', () => {
    const r = run('scripts/check-dupes.mjs', [`${FIX}/dupes-object-key.jsx`]);
    assert.notEqual(r.code, 0);
    assert.match(r.stdout, /DUP-KEY/);
    assert.match(r.stdout, /fontWeight/);
});

test('check-dupes catches a duplicate JSX attribute', () => {
    const r = run('scripts/check-dupes.mjs', [`${FIX}/dupes-jsx-attribute.jsx`]);
    assert.notEqual(r.code, 0);
    assert.match(r.stdout, /DUP-ATTR/);
});

test('check-dupes ignores computed keys and spreads', () => {
    const r = run('scripts/check-dupes.mjs', [`${FIX}/dupes-safe.jsx`]);
    assert.equal(r.code, 0, `false positive:\n${r.stdout}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// check-bundle
// ─────────────────────────────────────────────────────────────────────────────
//
// Built at run time rather than committed: a realistic "good" bundle is ~2.5 MB
// and does not belong in git. What matters is the SHAPE — the hollow build emits a
// complete, valid-looking dist, so the fixtures reproduce that.

const makeDist = (dir, { hollow }) => {
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'),
        '<!doctype html><script type="module" crossorigin src="/assets/index-abc.js"></script>');
    // The CSS asset is BYTE-IDENTICAL between a hollow and a real build, because
    // `import './index.css'` sits above the throw in main.jsx. Both fixtures carry
    // it so "assets were emitted" cannot be mistaken for evidence.
    fs.writeFileSync(path.join(dir, 'assets', 'index-abc.css'), 'body{margin:0}');

    const js = hollow
        ? 'throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");' + 'x'.repeat(200_000)
        : 'const k="pk_test_fixture123";fetch("/.netlify/functions/x",{headers:{Authorization:"Bearer "+t}});'
          + '"/.netlify/functions/y";'.repeat(60) + 'y'.repeat(900_000);
    fs.writeFileSync(path.join(dir, 'assets', 'index-abc.js'), js);
    return dir;
};

test('check-bundle rejects a hollow bundle and names the cause', () => {
    const dir = makeDist(fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-')), { hollow: true });
    const r = run('scripts/check-bundle.mjs', [dir]);
    assert.notEqual(r.code, 0, 'hollow bundle passed the guard');
    // The abort marker must be reported FIRST — it is the root cause, not a symptom.
    assert.match(r.stdout, /BOOTSTRAP ABORT/);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('check-bundle accepts a real bundle', () => {
    const dir = makeDist(fs.mkdtempSync(path.join(os.tmpdir(), 'real-')), { hollow: false });
    const r = run('scripts/check-bundle.mjs', [dir]);
    assert.equal(r.code, 0, `false positive:\n${r.stdout}`);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('check-bundle rejects a dist whose entry chunk is missing', () => {
    const dir = makeDist(fs.mkdtempSync(path.join(os.tmpdir(), 'stale-')), { hollow: false });
    fs.renameSync(path.join(dir, 'assets', 'index-abc.js'), path.join(dir, 'assets', 'renamed.js'));
    const r = run('scripts/check-bundle.mjs', [dir]);
    assert.notEqual(r.code, 0, 'dangling entry reference passed');
    assert.match(r.stdout, /ENTRY CHUNK MISSING/i);
    fs.rmSync(dir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// scan-dbfetch — a diagnostic, not a gate, but it drives the remediation work so
// its accuracy matters. It ran at a 59% false-positive rate on the hooks (10 of
// 17) because it unwrapped .then() chains without ever reading the callbacks.
// ─────────────────────────────────────────────────────────────────────────────

test('scan-dbfetch catches a Response that goes nowhere', () => {
    const r = run('scripts/scan-dbfetch.mjs', [`${FIX}/dbfetch-discarded.jsx`]);
    assert.match(r.stdout, /1 discarded-Response/);
});

test('scan-dbfetch catches a Response read as if it were JSON', () => {
    // Guide 18b3. Live in ReportsTab: `data?.reports` on a Response with no
    // .json() in the chain — the saved-reports list never loaded. Optional
    // chaining, which an earlier version of the check missed entirely.
    const r = run('scripts/scan-dbfetch.mjs', [`${FIX}/dbfetch-response-as-json.jsx`]);
    assert.match(r.stdout, /reads \.reports on a Response/);
});

test('scan-dbfetch resolves aliases and concise arrow bodies', () => {
    // The fourth false-negative class, and the one that proves the point: the gate
    // reported 0 across the whole tree while AppHeader.jsx:444 discarded a Response
    // into an empty catch. Two blind spots on one line — dbFetch aliased to `df`
    // through a destructured dynamic import, and a concise arrow body with no
    // ExpressionStatement for findStatements to find.
    //
    // Mutation-tested both ways: disabling alias resolution drops this to 0,
    // disabling concise bodies drops it to 2.
    const r = run('scripts/scan-dbfetch.mjs', [`${FIX}/dbfetch-aliased.jsx`]);
    assert.match(r.stdout, /3 discarded-Response/);
    assert.match(r.stdout, /lines 11, 18, 24/);
});

test('scan-dbfetch catches a Response captured in a variable and read as JSON', () => {
    // The third class. Live in TasksTab (four sites) and ReportsTab (two): a
    // VariableDeclarator is not an ExpressionStatement and not a .then()
    // callback, so both earlier classes walked past `const data = await
    // dbFetch(...)` followed by `data?.task` — and the complete/snooze
    // handlers reverted their optimistic update on every SUCCESSFUL save.
    const r = run('scripts/scan-dbfetch.mjs', [`${FIX}/dbfetch-var-response-as-json.jsx`]);
    assert.match(r.stdout, /reads \.task on a Response/);
    assert.match(r.stdout, /reads \.report on a Response/);
    assert.match(r.stdout, /2 site\(s\)/);
    assert.notEqual(r.code, 0, 'the variable-captured Response class must fail the gate');
});

test('scan-dbfetch does not flag a checked Response', () => {
    // THE false-positive class. `.then(r => { if (!r.ok) throw })` fully checks the
    // Response; the scanner used to unwrap straight past it to the dbFetch beneath.
    const r = run('scripts/scan-dbfetch.mjs', [`${FIX}/dbfetch-safe.jsx`]);
    assert.match(r.stdout, /0 discarded-Response/);
    assert.doesNotMatch(r.stdout, /on a Response/);
});

// ─────────────────────────────────────────────────────────────────────────────
// check-handoff — not a code scanner but a repo-state gate: the root and docs/
// copies of SESSION_HANDOFF.md must be byte-identical (the pair drifted twice
// on 31 Aug alone). Fixture mode passes the two paths explicitly so committed
// fixtures stand in for the real pair.
// ─────────────────────────────────────────────────────────────────────────────

test('check-handoff catches diverging copies and names the first differing line', () => {
    const r = run('scripts/check-handoff.mjs', [`${FIX}/handoff-differs-root.md`, `${FIX}/handoff-differs-docs.md`]);
    assert.notEqual(r.code, 0, 'diverging handoff copies passed the gate');
    assert.match(r.stdout, /DIFFER/);
    assert.match(r.stdout, /First difference at line/);
});

test('check-handoff stays quiet on identical copies', () => {
    const r = run('scripts/check-handoff.mjs', [`${FIX}/handoff-safe-a.md`, `${FIX}/handoff-safe-b.md`]);
    assert.equal(r.code, 0, `false positive:\n${r.stdout}`);
    assert.match(r.stdout, /identical/);
});

test('check-handoff fails when a copy is missing', () => {
    const r = run('scripts/check-handoff.mjs', [`${FIX}/handoff-safe-a.md`, `${FIX}/handoff-missing-copy.md`]);
    assert.notEqual(r.code, 0, 'a missing copy passed the gate');
    assert.match(r.stdout, /MISSING/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage
// ─────────────────────────────────────────────────────────────────────────────

test('every gate script has at least one catch fixture and one safe fixture', () => {
    // A new scanner added without fixtures is a gate nobody has proven. This fails
    // the moment one appears in package.json without a case here.
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const gates = Object.keys(pkg.scripts).filter(k => k.startsWith('check:'));
    const fixtures = fs.readdirSync(FIX);
    const prefixOf = { 'check:tdz': 'tdz', 'check:inline': 'inline', 'check:dupes': 'dupes', 'check:dbfetch': 'dbfetch', 'check:handoff': 'handoff' };

    for (const gate of gates) {
        if (gate === 'check:bundle') continue;          // fixtures are built at run time above
        const prefix = prefixOf[gate];
        assert.ok(prefix, `${gate} has no fixture prefix registered in this test`);
        assert.ok(fixtures.some(f => f.startsWith(prefix + '-') && !f.includes('safe')),
            `${gate} has no catch fixture`);
        assert.ok(fixtures.some(f => f.startsWith(prefix + '-') && (f.includes('safe') || f.includes('clean'))),
            `${gate} has no false-positive guard fixture`);
    }
});
