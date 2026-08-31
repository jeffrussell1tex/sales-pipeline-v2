// patch-scanners-handoff.mjs
// Registers check:handoff in tests/scanners.test.mjs:
//   1) adds 'check:handoff': 'handoff' to the meta-test's prefixOf map
//   2) inserts a check-handoff behavioral test section (catch / safe / missing)
//      immediately before the Coverage section, in the suite's house pattern
//
// Requires the four handoff-* fixtures in tests/fixtures/scanners/ and the
// updated scripts/check-handoff.mjs that accepts two positional paths.
//
// Dry-run by default; --apply to write. Asserts anchors, preserves the file's
// line endings, writes once, re-reads from disk to verify.

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'tests/scanners.test.mjs';
const APPLY = process.argv.includes('--apply');

const src = readFileSync(FILE, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';

if (src.includes('check:handoff')) {
  console.log('File already registers check:handoff — nothing to do.');
  process.exit(0);
}

// ── Edit 1: prefixOf gains the handoff entry ────────────────────────────────
const prefixAnchor =
  "const prefixOf = { 'check:tdz': 'tdz', 'check:inline': 'inline', 'check:dupes': 'dupes', 'check:dbfetch': 'dbfetch' };";
const prefixReplacement =
  "const prefixOf = { 'check:tdz': 'tdz', 'check:inline': 'inline', 'check:dupes': 'dupes', 'check:dbfetch': 'dbfetch', 'check:handoff': 'handoff' };";

const prefixCount = src.split(prefixAnchor).length - 1;
console.log(`prefixOf anchor occurrences: ${prefixCount}`);
if (prefixCount !== 1) {
  console.error('REFUSING: expected exactly 1.');
  process.exit(1);
}

// ── Edit 2: insert the test section before the Coverage block ───────────────
// The section separators are identical lines, so anchor on the unique
// '// Coverage' line and insert above the separator that precedes it.
const lines = src.split(EOL);
const covIdx = lines.findIndex(l => l.trim() === '// Coverage');
console.log(`'// Coverage' line found at index: ${covIdx}`);
if (covIdx === -1 || lines.filter(l => l.trim() === '// Coverage').length !== 1) {
  console.error('REFUSING: expected exactly one // Coverage line.');
  process.exit(1);
}
if (!lines[covIdx - 1].startsWith('// ─')) {
  console.error('REFUSING: the line above // Coverage is not a section separator.');
  process.exit(1);
}
const sep = lines[covIdx - 1]; // reuse the file's own separator, exact width

const block = [
  sep,
  '// check-handoff — not a code scanner but a repo-state gate: the root and docs/',
  '// copies of SESSION_HANDOFF.md must be byte-identical (the pair drifted twice',
  '// on 31 Aug alone). Fixture mode passes the two paths explicitly so committed',
  '// fixtures stand in for the real pair.',
  sep,
  '',
  "test('check-handoff catches diverging copies and names the first differing line', () => {",
  "    const r = run('scripts/check-handoff.mjs', [`${FIX}/handoff-differs-root.md`, `${FIX}/handoff-differs-docs.md`]);",
  "    assert.notEqual(r.code, 0, 'diverging handoff copies passed the gate');",
  '    assert.match(r.stdout, /DIFFER/);',
  '    assert.match(r.stdout, /First difference at line/);',
  '});',
  '',
  "test('check-handoff stays quiet on identical copies', () => {",
  "    const r = run('scripts/check-handoff.mjs', [`${FIX}/handoff-safe-a.md`, `${FIX}/handoff-safe-b.md`]);",
  '    assert.equal(r.code, 0, `false positive:\\n${r.stdout}`);',
  '    assert.match(r.stdout, /identical/);',
  '});',
  '',
  "test('check-handoff fails when a copy is missing', () => {",
  "    const r = run('scripts/check-handoff.mjs', [`${FIX}/handoff-safe-a.md`, `${FIX}/handoff-missing-copy.md`]);",
  "    assert.notEqual(r.code, 0, 'a missing copy passed the gate');",
  '    assert.match(r.stdout, /MISSING/);',
  '});',
  '',
];

const outLines = [
  ...lines.slice(0, covIdx - 1),
  ...block,
  ...lines.slice(covIdx - 1),
];
let out = outLines.join(EOL).replace(prefixAnchor, prefixReplacement);

if (!APPLY) {
  console.log('dry-run OK — 2 edits would apply; rerun with --apply');
  process.exit(0);
}

writeFileSync(FILE, out, 'utf8');

const verify = readFileSync(FILE, 'utf8');
const checks = [
  ['prefixOf has handoff', verify.includes("'check:handoff': 'handoff'")],
  ['catch test present', verify.includes('check-handoff catches diverging copies')],
  ['safe test present', verify.includes('check-handoff stays quiet on identical copies')],
  ['missing test present', verify.includes('check-handoff fails when a copy is missing')],
  ['coverage section intact', verify.includes('every gate script has at least one catch fixture')],
  ['handoff tests precede coverage', verify.indexOf('check-handoff catches') < verify.indexOf('// Coverage')],
];
let pass = true;
for (const [name, ok] of checks) {
  console.log(`re-read from disk: ${name}: ${ok}`);
  if (!ok) pass = false;
}
process.exit(pass ? 0 : 1);
