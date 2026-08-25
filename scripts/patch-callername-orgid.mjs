// scripts/patch-callername-orgid.mjs
//
// One-time sweep for Phase 1: getCallerName(userId) -> getCallerName(userId, orgId)
//
// WHY THIS IS A SCRIPT AND NOT FIFTEEN HAND EDITS
// The change is mechanically identical at every site, and the risk is not in the
// edit — it is in whether `orgId` is actually in scope where the call happens.
// A script can check that on every file and refuse; fifteen hand edits cannot.
//
// SAFETY
//  • Refuses to patch a file that has a call site but no `orgId` destructured
//    from verifyAuth. Reports and exits non-zero rather than patching some files
//    and leaving others — a half-applied sweep is worse than none.
//  • Preserves each file's existing line endings (this repo mixes LF and CRLF).
//  • Dry-run by default. --apply to write.
//  • Idempotent: a site already carrying orgId is left alone.
//
// Run from the repo root:
//   node scripts/patch-callername-orgid.mjs            # plan
//   node scripts/patch-callername-orgid.mjs --apply    # write

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const APPLY = process.argv.includes('--apply');
const FN_DIR = join(process.cwd(), 'netlify', 'functions');

const FILES = [
    'accounts.mjs',
    'audit-log.mjs',
    'contacts.mjs',
    'dispatch-schedule-blocks.mjs',
    'leads.mjs',
    'opportunities.mjs',
    'settings.mjs',
    'tasks.mjs',
    'user-role.mjs',
];

// The exact call shape to replace. Deliberately narrow: only a bare
// getCallerName(userId). A site that already passes a second argument does not
// match, so re-running changes nothing.
const CALL = /getCallerName\(\s*userId\s*\)/g;

// Evidence that orgId is available. Every handler in this repo destructures the
// verifyAuth result; if that destructure does not name orgId, the reference we
// are about to insert would be undefined and this script must not guess.
const HAS_ORGID = /const\s*\{[^}]*\borgId\b[^}]*\}\s*=\s*auth\b/;

let failed = false;
let totalSites = 0;
const plan = [];

for (const name of FILES) {
    const path = join(FN_DIR, name);
    let src;
    try {
        src = readFileSync(path, 'utf8');
    } catch {
        console.error(`MISSING  ${name} — not found at ${path}`);
        failed = true;
        continue;
    }

    const sites = [...src.matchAll(CALL)];
    if (sites.length === 0) {
        console.log(`skip     ${name} — no bare getCallerName(userId) call`);
        continue;
    }

    if (!HAS_ORGID.test(src)) {
        console.error(
            `BLOCKED  ${name} — ${sites.length} call site(s) but no \`orgId\` destructured ` +
            `from auth. Inserting orgId here would reference an undeclared variable. ` +
            `Open this file and check how the handler names the org.`
        );
        failed = true;
        continue;
    }

    // Report each site with its line number and surrounding line, so the diff is
    // reviewable before it is written rather than after.
    const lines = src.split(/\r?\n/);
    const hits = [];
    lines.forEach((line, i) => {
        if (/getCallerName\(\s*userId\s*\)/.test(line)) hits.push({ n: i + 1, text: line.trim() });
    });

    console.log(`\nPATCH    ${name} — ${sites.length} site(s)`);
    for (const h of hits) console.log(`   :${h.n}  ${h.text}`);

    totalSites += sites.length;
    plan.push({ path, name, src, out: src.replace(CALL, 'getCallerName(userId, orgId)') });
}

if (failed) {
    console.error('\nNothing was written. Resolve the blocked file(s) above and re-run.');
    process.exit(1);
}

if (!APPLY) {
    console.log(`\nPlan only — ${totalSites} site(s) across ${plan.length} file(s). Re-run with --apply.`);
    process.exit(0);
}

for (const p of plan) {
    writeFileSync(p.path, p.out, 'utf8');   // readFileSync/writeFileSync as utf8 leaves \r\n intact
    console.log(`written  ${p.name}`);
}
console.log(`\nDone — ${totalSites} site(s) across ${plan.length} file(s).`);
console.log('Next: npm run build && npm test, then npm run test:int.');
