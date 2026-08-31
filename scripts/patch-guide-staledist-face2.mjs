// scripts/patch-guide-staledist-face2.mjs — guide §19: the stale-dist failure's
// SECOND observed face (wrong Clerk instance + prod redirect), appended to the
// existing recognition bullet. Dry-run by default; --apply writes once and
// re-reads from disk.
import { readFileSync, writeFileSync } from 'fs';
const APPLY = process.argv.includes('--apply');
const path = 'docs/ACCELEREP_CODING_GUIDE.md';
let src = readFileSync(path, 'utf8');
const NL = '\r\n';
const anchor = "  it before a redirect-move experiment ran); if the symptom returns on a" + NL + "  clean tree, that is the next variable to test." + NL;
const addendum = [
"  SECOND FACE of the same failure (31 Aug, later the same day): a stale",
"  `dist/` built with the WRONG Clerk key serves a bundle that signs into",
"  the other Clerk instance — the symptom is the login screen at",
"  `localhost:8888` REDIRECTING TO `salespipelinetracker.com` after sign-in,",
"  and an org switcher showing the wrong instance's orgs. Same cleanup",
"  fixes it. Recognition rule: before ANY browser verification, read the",
"  URL bar and count the orgs in the switcher — a wrong-surface or",
"  wrong-instance session produces observations that are internally",
"  consistent and entirely meaningless.",
""].join(NL);
const n = src.split(anchor).length - 1;
console.log('anchor occurrences:', n);
if (n !== 1) { console.error('REFUSING: expected exactly 1'); process.exit(1); }
if (!APPLY) { console.log('dry-run OK — rerun with --apply'); process.exit(0); }
src = src.replace(anchor, anchor + addendum);
writeFileSync(path, src);
const re = readFileSync(path, 'utf8');
console.log('re-read from disk: second-face note present:', re.includes('SECOND FACE of the same failure'));
