// patch-guide-19-seventh-gate.mjs
// Applies the four §19 edits for the check:handoff gate to
// docs/ACCELEREP_CODING_GUIDE.md:
//   1) heading:  "Gates -- run all six"  ->  "run all seven"
//   2) gate block: insert `npm run check:handoff` after the check:dbfetch line
//   3) history note: record the seventh gate's addition, per §22 style
//   4) CI line:  "All six run in CI"  ->  "All seven run in CI"
//      (only true once .github/workflows/test.yml carries the gate — commit
//      this doc change and the workflow change TOGETHER)
//
// Dry-run by default; --apply to write. Asserts each anchor occurs exactly
// once, writes once, re-reads from disk to verify. CRLF preserved.

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'docs/ACCELEREP_CODING_GUIDE.md';
const APPLY = process.argv.includes('--apply');

const src = readFileSync(FILE, 'utf8');
let out = src;

const edits = [
  {
    name: '1: heading six -> seven',
    find: '### Gates -- run all six',
    replace: '### Gates -- run all seven',
  },
  {
    name: '2: insert check:handoff line into gate block',
    find: 'npm run check:dbfetch  # discarded Response / Response read as JSON (18b1, 18b3)\r\n',
    replace:
      'npm run check:dbfetch  # discarded Response / Response read as JSON (18b1, 18b3)\r\n' +
      'npm run check:handoff  # root and docs SESSION_HANDOFF.md byte-identical\r\n',
  },
  {
    name: '3: append seventh-gate history note',
    find: 'corrected, per §22.)*\r\n',
    replace:
      'corrected, per §22.)*\r\n' +
      '\r\n' +
      '*(Seventh gate added 31 Aug: `check:handoff` asserts the root and `docs/`\r\n' +
      'copies of `SESSION_HANDOFF.md` are byte-identical. The pair drifted twice\r\n' +
      'on 31 Aug alone — a FINAL rewrite committed to one copy only, then the\r\n' +
      'same drift falsely re-diagnosed during cleanup.)*\r\n',
  },
  {
    name: '4: CI line six -> seven',
    find: 'All six run in CI',
    replace: 'All seven run in CI',
  },
];

// Guard against a re-run on an already-patched file.
if (out.includes('run all seven') || out.includes('npm run check:handoff')) {
  console.log('File already contains seventh-gate content — nothing to do.');
  process.exit(0);
}

let ok = true;
for (const e of edits) {
  const count = out.split(e.find).length - 1;
  console.log(`${e.name}: anchor occurrences: ${count}`);
  if (count !== 1) {
    console.error(`REFUSING: expected exactly 1.`);
    ok = false;
  }
}
if (!ok) process.exit(1);

for (const e of edits) out = out.replace(e.find, e.replace);

if (!APPLY) {
  console.log('dry-run OK — 4 edits would apply; rerun with --apply');
  process.exit(0);
}

writeFileSync(FILE, out, 'utf8');

// Re-read from disk; in-memory post-check is not evidence.
const verify = readFileSync(FILE, 'utf8');
const checks = [
  ['heading seven', verify.includes('### Gates -- run all seven')],
  ['handoff gate line', verify.includes('npm run check:handoff  # root and docs SESSION_HANDOFF.md byte-identical')],
  ['history note', verify.includes('Seventh gate added 31 Aug')],
  ['CI seven', verify.includes('All seven run in CI')],
  ['old heading gone', !verify.includes('run all six')],
  ['old CI line gone', !verify.includes('All six run in CI')],
];
let pass = true;
for (const [name, okc] of checks) {
  console.log(`re-read from disk: ${name}: ${okc}`);
  if (!okc) pass = false;
}
process.exit(pass ? 0 : 1);
