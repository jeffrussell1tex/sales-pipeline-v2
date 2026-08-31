// patch-ci-unit-install.mjs
// Fixes the `unit` job in .github/workflows/test.yml:
//   1) adds `- run: npm install` before the test step — the job runs
//      `node --test` with no install, and tests/scanners.test.mjs spawns the
//      gate scripts, several of which import @babel/parser (a devDependency),
//      so the job fails with ERR_MODULE_NOT_FOUND on a clean runner
//   2) replaces the stale "no deps" comment, which described the suite before
//      the scanner tests existed
//
// Dry-run by default; --apply to write. Asserts the anchor occurs exactly
// once, preserves the file's line endings, writes once, re-reads from disk.

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = '.github/workflows/test.yml';
const APPLY = process.argv.includes('--apply');

const src = readFileSync(FILE, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';

const staleComment = '      # Unit + static guard import only pure modules (no DB, no deps).';

if (!src.includes(staleComment)) {
  if (src.includes('no longer dep-free')) {
    console.log('File already patched — nothing to do.');
    process.exit(0);
  }
  console.error('REFUSING: the stale comment anchor was not found.');
  process.exit(1);
}

const count = src.split(staleComment).length - 1;
console.log(`anchor occurrences: ${count} (EOL: ${EOL === '\r\n' ? 'CRLF' : 'LF'})`);
if (count !== 1) {
  console.error('REFUSING: expected exactly 1.');
  process.exit(1);
}

const replacement =
  '      - run: npm install' + EOL +
  '      # The unit suite is no longer dep-free: tests/scanners.test.mjs spawns' + EOL +
  '      # the gate scripts, and several of them import @babel/parser. Without' + EOL +
  '      # the install this job fails with ERR_MODULE_NOT_FOUND on every run.';

if (!APPLY) {
  console.log('dry-run OK — rerun with --apply');
  process.exit(0);
}

writeFileSync(FILE, src.replace(staleComment, replacement), 'utf8');

const verify = readFileSync(FILE, 'utf8');
const unitBlock = verify.slice(verify.indexOf('unit:'), verify.indexOf('gates:'));
const checks = [
  ['install line in unit job', unitBlock.includes('- run: npm install')],
  ['new comment present', unitBlock.includes('no longer dep-free')],
  ['stale comment gone', !verify.includes('(no DB, no deps)')],
  ['test step intact', unitBlock.includes('run: node --test')],
];
let pass = true;
for (const [name, ok] of checks) {
  console.log(`re-read from disk: ${name}: ${ok}`);
  if (!ok) pass = false;
}
process.exit(pass ? 0 : 1);
