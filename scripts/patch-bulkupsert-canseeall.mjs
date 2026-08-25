// scripts/patch-bulkupsert-canseeall.mjs
//
// One-time sweep: add `canSeeAll: canSeeAll(userRole),` to every bulkUpsert()
// call, alongside the change in _bulk.mjs that stops treating a null callerName
// as "may edit everything".
//
// WHY THE CALLERS MUST CHANGE IN THE SAME COMMIT
// They currently ENCODE Admin as `callerName: null`. _bulk.mjs no longer reads
// null that way, so a caller left alone would refuse Admins on the bulk path.
// That is the safe direction to fail, but it is still wrong, and it is exactly
// the kind of half-applied change that reads as a mystery two sessions later.
//
// SAFETY
//  • Refuses any file that does not import canSeeAll from auth.mjs.
//  • Brace-matches from `bulkUpsert({` to its own closing `})`, so the insert
//    lands inside the right call rather than at a guessed line.
//  • Idempotent: a call already carrying canSeeAll is skipped.
//  • Preserves line endings. Dry-run by default; --apply to write.
//
//   node scripts/patch-bulkupsert-canseeall.mjs
//   node scripts/patch-bulkupsert-canseeall.mjs --apply

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const APPLY = process.argv.includes('--apply');
const FN_DIR = join(process.cwd(), 'netlify', 'functions');
const FILES = ['accounts.mjs', 'contacts.mjs', 'opportunities.mjs'];

// Evidence canSeeAll is available as a function in this module.
const IMPORTS_CANSEEALL = /import\s*\{[^}]*\bcanSeeAll\b[^}]*\}\s*from\s*['"]\.\/auth\.mjs['"]/;

let failed = false, total = 0;
const plan = [];

for (const name of FILES) {
    const path = join(FN_DIR, name);
    let src;
    try { src = readFileSync(path, 'utf8'); }
    catch { console.error(`MISSING  ${name}`); failed = true; continue; }

    if (!IMPORTS_CANSEEALL.test(src)) {
        console.error(
            `BLOCKED  ${name} — bulkUpsert is called here but canSeeAll is not imported ` +
            `from ./auth.mjs. Inserting canSeeAll(userRole) would reference an undefined ` +
            `function. Check how this file names the role helper.`
        );
        failed = true; continue;
    }

    let out = src, cursor = 0, hits = 0;
    for (;;) {
        const start = out.indexOf('bulkUpsert({', cursor);
        if (start === -1) break;

        // Brace-match from the opening { of the argument object to its partner,
        // so the closing position is derived rather than pattern-guessed.
        const objOpen = out.indexOf('{', start);
        let depth = 0, i = objOpen, objClose = -1;
        for (; i < out.length; i++) {
            if (out[i] === '{') depth++;
            else if (out[i] === '}') { depth--; if (depth === 0) { objClose = i; break; } }
        }
        if (objClose === -1) {
            console.error(`BLOCKED  ${name} — unbalanced braces after bulkUpsert({ at index ${start}`);
            failed = true; break;
        }

        const body = out.slice(objOpen, objClose);
        if (/\bcanSeeAll\s*:/.test(body)) {
            console.log(`skip     ${name} — a bulkUpsert call already passes canSeeAll`);
            cursor = objClose; continue;
        }

        // Match the indentation of the last property line inside the object.
        const lastLine = body.slice(body.lastIndexOf('\n') + 1);
        const indent = (out.slice(0, objClose).match(/\n([ \t]*)[^\n]*$/) || [, '    '])[1] + '    ';
        const eol = out.includes('\r\n') ? '\r\n' : '\n';
        const insert = `${indent}canSeeAll: canSeeAll(userRole),${eol}`;

        // Insert on its own line immediately before the closing brace's line.
        const lineStart = out.lastIndexOf('\n', objClose) + 1;
        out = out.slice(0, lineStart) + insert + out.slice(lineStart);

        const lineNo = out.slice(0, lineStart).split(/\r?\n/).length;
        console.log(`PATCH    ${name} — inserting at line ~${lineNo}`);
        hits++; total++;
        cursor = objClose + insert.length;
    }

    if (hits > 0) plan.push({ path, name, out, hits });
    else if (!failed) console.log(`skip     ${name} — nothing to change`);
}

if (failed) { console.error('\nNothing was written. Resolve the above and re-run.'); process.exit(1); }
if (!APPLY) { console.log(`\nPlan only — ${total} call(s) across ${plan.length} file(s). Re-run with --apply.`); process.exit(0); }
for (const p of plan) { writeFileSync(p.path, p.out, 'utf8'); console.log(`written  ${p.name} (${p.hits})`); }
console.log(`\nDone — ${total} call(s). Next: npm run build && npm test, then npm run test:int.`);
