#!/usr/bin/env node
//
// check-fnscope.mjs — every identifier a Netlify function reads must be bound
// somewhere it can see (state §0.107, guide §18b33).
//
//   node scripts/check-fnscope.mjs                       # every .mjs under netlify/functions/ and db/
//   node scripts/check-fnscope.mjs netlify/functions/digest.mjs
//
// WHY THIS EXISTS
// ---------------
// bf4a3c5 renamed a helper's parameter and left its body reading the old name,
// which still existed in the file inside ANOTHER function's loop. It parsed, it
// bundled, the import graph loaded it, and it threw on the first call — a 500
// every hour for five months (§0.95), and the same in digest.mjs for a day
// longer (§0.101). check-tdz covers Capitalised components under src/ and JSX;
// a lowercase helper in a function file had no scanner. This is a proper
// lexical-scope walk (scripts/fnscope.mjs): an identifier read where no
// enclosing scope binds it, and no standard global names it, is reported.
//
// Exit code 1 when anything is found, so it gates a commit like the others.
import fs from 'fs';
import path from 'path';
import { undeclaredIn } from './fnscope.mjs';

const walk = (dir, out = []) => {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
        else if (/\.mjs$/.test(e.name)) out.push(p);
    }
    return out;
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : [...walk('netlify/functions'), ...walk('db')];
let total = 0, parseFails = 0;
for (const file of targets) {
    let findings;
    try {
        findings = undeclaredIn(fs.readFileSync(file, 'utf8'), { file });
    } catch (err) {
        parseFails++; total++;
        console.error(`PARSE FAIL  ${file}\n  ${err.message}`);
        continue;
    }
    for (const f of findings) {
        total++;
        console.log(`UNBOUND  ${file}:${f.line}:${f.column + 1}  "${f.name}" read in ${f.enclosing} — bound in no enclosing scope`);
    }
}

if (total) {
    console.log(`\n${total} issue(s). A name read where nothing binds it parses, bundles and imports — and throws ReferenceError the first time that line runs (§0.95).`);
    process.exit(1);
}
console.log(`No unbound reads in ${targets.length} function file(s).`);
