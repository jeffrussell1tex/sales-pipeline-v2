// patch-ci-seventh-gate.mjs
// Adds the check:handoff step to the `gates` job in
// .github/workflows/test.yml, between the dbFetch scan and the build step —
// same position as in guide §19's gate order.
//
// Dry-run by default; --apply to write. Asserts the anchor occurs exactly
// once, preserves the file's existing line endings, writes once, re-reads
// from disk to verify.

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = '.github/workflows/test.yml';
const APPLY = process.argv.includes('--apply');

const src = readFileSync(FILE, 'utf8');

// Preserve whatever the file already uses.
const EOL = src.includes('\r\n') ? '\r\n' : '\n';

if (src.includes('check:handoff')) {
  console.log('File already contains the check:handoff step — nothing to do.');
  process.exit(0);
}

const anchor =
  '        run: npm run check:dbfetch' + EOL +
  '      - name: Build + bundle guard';

const replacement =
  '        run: npm run check:dbfetch' + EOL +
  '      # The handoff lives at root AND docs/; the pair drifted twice on 31 Aug' + EOL +
  '      # alone — a FINAL rewrite committed to one copy only. Byte-comparing the' + EOL +
  '      # two copies makes the sync a fact instead of a memory item.' + EOL +
  '      - name: Handoff dual-copy check' + EOL +
  '        run: npm run check:handoff' + EOL +
  '      - name: Build + bundle guard';

const count = src.split(anchor).length - 1;
console.log(`anchor occurrences: ${count} (EOL: ${EOL === '\r\n' ? 'CRLF' : 'LF'})`);
if (count !== 1) {
  console.error('REFUSING: expected exactly 1.');
  process.exit(1);
}

if (!APPLY) {
  console.log('dry-run OK — rerun with --apply');
  process.exit(0);
}

writeFileSync(FILE, src.replace(anchor, replacement), 'utf8');

const verify = readFileSync(FILE, 'utf8');
const checks = [
  ['step name present', verify.includes('- name: Handoff dual-copy check')],
  ['run line present', verify.includes('run: npm run check:handoff')],
  ['build step intact', verify.includes('- name: Build + bundle guard')],
  ['single insertion', verify.split('check:handoff').length - 1 === 1],
];
let pass = true;
for (const [name, ok] of checks) {
  console.log(`re-read from disk: ${name}: ${ok}`);
  if (!ok) pass = false;
}
process.exit(pass ? 0 : 1);
