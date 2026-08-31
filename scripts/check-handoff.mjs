#!/usr/bin/env node
//
// check-handoff.mjs — assert the two copies of SESSION_HANDOFF.md are
// byte-identical:
//
//   SESSION_HANDOFF.md            (repo root)
//   docs/SESSION_HANDOFF.md
//
//   npm run check:handoff
//
// WHY THIS EXISTS
// ---------------
// The handoff lives in two places and every session ends with an edit to it.
// Twice now the final rewrite landed in exactly one of the two copies and the
// other shipped stale:
//
//   31 Aug (am)  docs copy committed and fast-forwarded to master carrying the
//                pre-FINAL draft; the FINAL rewrite sat uncommitted at root,
//                found only by a stray `M` line in unrelated git output
//   31 Aug (pm)  the same drift falsely re-diagnosed a second time during the
//                cleanup — an hour spent on fingerprint greps that this gate
//                answers in one exit code
//
// The next session's FIRST mandated act is reading this file. A stale copy is
// not a cosmetic problem: it hands the next session wrong claims about what
// shipped and what is open. Making the comparison a gate is the difference
// between "remember to sync both copies" and a fact.
//
// WHY IT IS SAFE TO GATE ON
// -------------------------
// No judgement call in it. The two copies are DEFINED as duplicates — there is
// no legitimate state in which they differ. Any divergence is either a
// half-finished edit (finish it) or a forgotten sync (`cp` one over the other).
// The gate cannot tell you which copy is right — that is the session's job —
// so it names the first differing line and stops.
//
// Exit code 1 when the copies differ or either is missing.
import fs from 'fs';

const ROOT = 'SESSION_HANDOFF.md';
const DOCS = 'docs/SESSION_HANDOFF.md';

if (process.argv.includes('--help')) {
    console.log(`
check-handoff — assert SESSION_HANDOFF.md and docs/SESSION_HANDOFF.md are
byte-identical. The pair is a dual-write hazard; this gate makes drift a fact
instead of a memory item.

  npm run check:handoff

On divergence it classifies the difference (line endings only / trailing
whitespace only / content) and prints the first differing line, but ALL
divergence fails — the classification is diagnosis, not forgiveness.

Exit 1 on any difference or a missing copy.
`.trim());
    process.exit(0);
}

const read = (p) => {
    try { return fs.readFileSync(p); }
    catch { return null; }
};

const rootBuf = read(ROOT);
const docsBuf = read(DOCS);

if (!rootBuf || !docsBuf) {
    if (!rootBuf) console.log(`MISSING  ${ROOT}`);
    if (!docsBuf) console.log(`MISSING  ${DOCS}`);
    console.log('\nBoth copies must exist. A deleted copy is drift with extra steps.');
    process.exit(1);
}

if (rootBuf.equals(docsBuf)) {
    console.log(`Handoff copies identical (${rootBuf.length} bytes).`);
    process.exit(0);
}

// The copies differ. Classify how, then point at the first divergent line.
const rootTxt = rootBuf.toString('utf8');
const docsTxt = docsBuf.toString('utf8');

const eol = (s) => s.replace(/\r\n/g, '\n');
const ws  = (s) => eol(s).split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');

let kind = 'CONTENT';
if (eol(rootTxt) === eol(docsTxt)) kind = 'LINE-ENDINGS ONLY';
else if (ws(rootTxt) === ws(docsTxt)) kind = 'TRAILING WHITESPACE ONLY';

const rootLines = eol(rootTxt).split('\n');
const docsLines = eol(docsTxt).split('\n');
const max = Math.max(rootLines.length, docsLines.length);

let firstDiff = -1;
for (let i = 0; i < max; i++) {
    if (rootLines[i] !== docsLines[i]) { firstDiff = i; break; }
}

const brief = (l) => l === undefined
    ? '<no line — file ends here>'
    : (l.length > 72 ? l.slice(0, 69) + '…' : l);

console.log(`Handoff copies DIFFER — ${kind}`);
console.log(`  ${ROOT}: ${rootBuf.length} bytes, ${rootLines.length} lines`);
console.log(`  ${DOCS}: ${docsBuf.length} bytes, ${docsLines.length} lines`);
if (firstDiff >= 0) {
    console.log(`\nFirst difference at line ${firstDiff + 1}:`);
    console.log(`  root: ${brief(rootLines[firstDiff])}`);
    console.log(`  docs: ${brief(docsLines[firstDiff])}`);
}
console.log('\nDecide which copy is current, `cp` it over the other, and re-run.');
process.exit(1);
