// scripts/patch-guide-leads-merge.mjs — guide: one addendum paragraph where the
// mergeForUpdate section says "check any endpoint that sanitizes-then-upserts".
// Dry-run by default; --apply writes once and re-reads from disk.
import { readFileSync, writeFileSync } from 'fs';
const APPLY = process.argv.includes('--apply');
const path = 'docs/ACCELEREP_CODING_GUIDE.md';
let src = readFileSync(path, 'utf8');
const NL = '\r\n';
const anchor = "Check any endpoint that sanitizes-then-upserts for this shape before sending it a" + NL + "partial payload." + NL;
const addendum = [
"",
"**That check found its second instance (31 Aug): `leads.mjs` PUT.** `saveLead`",
"sends `{ id, ...patch }` and the endpoint fed it to a full-row `sanitize()` —",
"a two-key status change replaced the row. The fix is the same pattern minus",
"the blob flatten (lead rows are flat): `sanitize({ ...existing, ...data })`,",
"with `ownerIdForUpdate` still fed the RAW body so 18b13's mentioned-assignedTo",
"detection survives the merge. Pinned by a source-assertion guard in",
"`tests/partial-sanitize.test.mjs` because the mutation harness runs unit",
"suites only — if a refactor moves the merge, move the guard with it.",
""].join(NL);
const n = src.split(anchor).length - 1;
console.log('anchor occurrences:', n);
if (n !== 1) { console.error('REFUSING: expected exactly 1'); process.exit(1); }
if (!APPLY) { console.log('dry-run OK — rerun with --apply'); process.exit(0); }
src = src.replace(anchor, anchor + addendum);
writeFileSync(path, src);
const re = readFileSync(path, 'utf8');
console.log('re-read from disk: addendum present:', re.includes('found its second instance (31 Aug)'));
