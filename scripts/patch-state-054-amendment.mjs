// scripts/patch-state-054-amendment.mjs — state doc: post-commit amendment to
// §0.54 (browser pass OBSERVED, dev smoke passed, five new findings) plus a
// Verified-at tail extension. Dry-run by default; --apply writes once and
// re-reads from disk.
import { readFileSync, writeFileSync } from 'fs';
const APPLY = process.argv.includes('--apply');
const path = 'docs/ACCELEREP_CURRENT_STATE.md';
let src = readFileSync(path, 'utf8');
const NL = '\r\n';
let fail = false;
const check = (name, s, expect) => {
    const n = src.split(s).length - 1;
    const ok = n === expect;
    if (!ok) fail = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${n}/${expect}] ${name}`);
};

// 1. Verified-at tail — append the dev smoke.
const vTail = "(§0.54). §0.53's Karen row-level reconciliation stands for the read policy.";
const vNew  = "(§0.54) · **dev-deploy smoke on accelerep.netlify.app passed** — 23 total / 18 unassigned (shared DB, post-assignment state), James Whitmore's assignment, CTO title and $310K intact through the DEPLOYED bundle. §0.53's Karen row-level reconciliation stands for the read policy.";
check('Verified-at tail', vTail, 1);

// 2. Amendment appended to the end of §0.54.
const endAnchor = "(`smiller`, self-heals on next write) plus an Admin/Technician blob split on" + NL + "a valid row.";
check('0.54 closing paragraph', endAnchor, 1);

const amendment = [
"",
"",
"**Post-commit amendment (same day).** The browser pass and dev smoke ran",
"AFTER commit `1ec5640` — the docs briefly claimed them unobserved (the prior",
"session's docs-outran-the-disk error class, repeated; recorded in the",
"handoff's errors). Both then matched to the digit: local 23/19/19, Karen's",
"bar 4, James Whitmore assigned → F5 → assignment, CTO title, notes and $310K",
"all intact, chip 19→18, bar 4→5; deployed smoke 23/18 with the same lead",
"whole through the production bundle. Five findings from the pass, queued:",
"",
"- **The assign control is a raw `window.prompt`** — free text, no rep list,",
"  no typeahead, off-style, at FIVE call sites. Free text into name",
"  resolution is a ghost factory; replace with a picker fed from the `reps`",
"  roster. Until then: type names EXACTLY as the Distribute panel renders",
"  them.",
"- **`resolveOwnerId` case-sensitivity is UNVERIFIED** — a lowercase name was",
"  typed into the prompt during the pass and cancelled before OK on exactly",
"  this doubt. Read the resolver before trusting mixed-case input.",
"- **\"NaNyr ago\" in the lead detail Activity timeline** — date formatting",
"  bug on lead-created/source events.",
"- **The Distribute panel follows the Mine/All scope** — an Admin in Mine",
"  sees all-zero load bars (their own leads only). Consistent with §0.53's",
"  everything-follows-the-scope choice; questionable for a distribution",
"  tool. UX decision queued, not a defect.",
"- **The stale-`dist/` failure has a SECOND FACE** — wrong Clerk key in the",
"  stale bundle → sign-in lands on the WRONG INSTANCE and redirects to",
"  `salespipelinetracker.com`; the org switcher shows the wrong instance's",
"  orgs. Same cleanup fixes it; guide §19 now carries the recognition note",
"  and the read-the-URL-bar-first rule (a prod tab nearly hosted this",
"  session's browser pass).",
].join(NL);

if (fail) { console.error('REFUSING: anchor counts wrong'); process.exit(1); }
if (!APPLY) { console.log('dry-run OK — rerun with --apply'); process.exit(0); }
src = src.replace(vTail, vNew);
src = src.replace(endAnchor, endAnchor + amendment);
writeFileSync(path, src);
const re = readFileSync(path, 'utf8');
console.log('re-read from disk: amendment present:', re.includes('Post-commit amendment (same day)'));
console.log('re-read from disk: smoke in Verified-at:', re.includes('dev-deploy smoke on accelerep.netlify.app passed'));
