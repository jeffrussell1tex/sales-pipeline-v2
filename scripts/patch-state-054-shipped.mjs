// scripts/patch-state-054-shipped.mjs — state doc: close §0.54's amendment with
// the shipping status (master carried the code batch via an earlier ff; prod
// serving it; docs-only ff pending). Dry-run default; --apply writes once and
// re-reads from disk.
import { readFileSync, writeFileSync } from 'fs';
const APPLY = process.argv.includes('--apply');
const path = 'docs/ACCELEREP_CURRENT_STATE.md';
let src = readFileSync(path, 'utf8');
const NL = '\r\n';
const anchor = "  and the read-the-URL-bar-first rule (a prod tab nearly hosted this" + NL + "  session's browser pass).";
const addendum = [
"",
"",
"**Shipping status at close:** `master` was fast-forwarded to `4df71b6`",
"earlier in the day (Jeff's move, between messages), so PROD has been",
"building and serving the `1ec5640` code batch since — the overwrite fix and",
"ownerId counting are LIVE. A final docs-only fast-forward (`4f32284` +",
"`9c03db7`, no code delta) and the two-minute UKG Leads-tab eyeball on prod",
"(no visible change is the pass; UKG's data was always ghost-free) remained",
"open at session close.",
].join(NL);
const n = src.split(anchor).length - 1;
console.log('anchor occurrences:', n);
if (n !== 1) { console.error('REFUSING: expected exactly 1'); process.exit(1); }
if (!APPLY) { console.log('dry-run OK — rerun with --apply'); process.exit(0); }
src = src.replace(anchor, anchor + addendum);
writeFileSync(path, src);
const re = readFileSync(path, 'utf8');
console.log('re-read from disk: shipping status present:', re.includes('Shipping status at close'));
