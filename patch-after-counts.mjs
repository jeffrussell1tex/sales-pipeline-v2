#!/usr/bin/env node
/**
 * Docs-only follow-up to e10e1a1: record the verified after-counts in
 * docs/ACCELEREP_CURRENT_STATE.md — the header's "pending" clause and
 * §0.50's "NOT yet verified" paragraph both flip to the observed result.
 *
 *   node patch-after-counts.mjs           # dry run
 *   node patch-after-counts.mjs --apply   # writes
 *
 * Unlike the earlier patches, this one does not assume the file's EOL:
 * git's autocrlf warned it may rewrite the state doc to CRLF on a future
 * checkout, so anchors below are written with \n and normalised to whatever
 * convention the file actually has on disk (the §18b18 harness lesson).
 * The detected convention is asserted unchanged after the write.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const FILE = 'docs/ACCELEREP_CURRENT_STATE.md';

const changes = [
    {
        old: '\u00b7 before-counts captured on dev for BOTH roles \u00b7 **after-counts pending deploy** \u2014 the browser check in \u00a70.50 is the only runtime evidence for this batch',
        new: '\u00b7 **after-counts verified on dev, both roles, 28 Aug** \u2014 Karen 144/1533/25/22, exactly matching the predicate applied over the Admin dataset; Admin unchanged at baseline (\u00a70.50)',
    },
    {
        old: [
            "**NOT yet verified: the after-counts.** Post-deploy, Karen's four counts must",
            "fall to her own rows plus unassigned ones, and Admin's must stay EXACTLY at the",
            'numbers above \u2014 the control proving `canSeeAll` still bypasses. The GET scoping',
            'lands with no automated rep-role coverage for these four endpoints (the \u00a70.33',
            'test debt stands), so the browser check is the only runtime evidence there is.',
            '',
        ].join('\n'),
        new: [
            '**After-counts verified on dev, 28 Aug, deploy `e10e1a1`.** Karen:',
            '**144 \u00b7 1533 \u00b7 25 \u00b7 22**. Admin: **144 \u00b7 1534 \u00b7 28 \u00b7 23** \u2014 the baseline',
            'exactly, digit for digit, so `canSeeAll` still bypasses. The drops are proven',
            'to be the RIGHT rows, not merely fewer: applying the predicate client-side over',
            "the full Admin dataset with Karen's id",
            '(`!r.ownerId || r.ownerId === \u2019usr_e7e09733-\u2026\u2019`) yields',
            '**144 \u00b7 1533 \u00b7 25 \u00b7 22** \u2014 identical to her scoped GETs on all four entities.',
            "Incidentally derivable: every account in the org is unassigned or Karen's",
            '(144 = 144), and exactly 1 contact, 3 tasks and 1 activity are owned by someone',
            'else \u2014 which is why the drops are small, per the unassigned-majority in \u00a70.38.',
            'The GET scoping still lands with no automated rep-role coverage for these four',
            'endpoints (the \u00a70.33 test debt stands); this browser check is the runtime',
            'evidence, recorded here.',
            '',
        ].join('\n'),
    },
];

const expectPresent = [
    'after-counts verified on dev, both roles, 28 Aug',
    'deploy `e10e1a1`',
    '144 \u00b7 1533 \u00b7 25 \u00b7 22',
    '144 \u00b7 1534 \u00b7 28 \u00b7 23',
];
const expectAbsent = [
    'after-counts pending deploy',
    'NOT yet verified: the after-counts',
];

if (!existsSync(FILE)) {
    console.error('FAIL ' + FILE + ' \u2014 not found. Run from the repo root.');
    process.exit(1);
}

let src = readFileSync(FILE, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
console.log('  detected EOL: ' + (eol === '\r\n' ? 'CRLF' : 'LF'));
const norm = (s) => s.split('\n').join(eol);

let failed = false;
for (const [i, ch] of changes.entries()) {
    const oldN = norm(ch.old);
    const n = src.split(oldN).length - 1;
    if (n !== 1) {
        console.error('FAIL anchor ' + (i + 1) + ' matched ' + n + ' times, expected 1.');
        failed = true;
        continue;
    }
    src = src.replace(oldN, norm(ch.new));
}

if (failed) {
    console.error('\nNothing written. Fix the anchors and re-run.');
    process.exit(1);
}
console.log('  ok   ' + FILE + ' \u2014 2 anchor(s) matched');

if (!APPLY) {
    console.log('\nDry run. All anchors matched. Re-run with --apply to write.');
    process.exit(0);
}

writeFileSync(FILE, src, 'utf8');

console.log('\nVerifying on disk:');
const onDisk = readFileSync(FILE, 'utf8');
let verifyFailed = false;
for (const s of expectPresent) {
    if (!onDisk.includes(norm(s))) { console.error('  MISSING: ' + s); verifyFailed = true; }
}
for (const s of expectAbsent) {
    if (onDisk.includes(norm(s))) { console.error('  STILL PRESENT: ' + s); verifyFailed = true; }
}
const eolAfter = onDisk.includes('\r\n') ? '\r\n' : '\n';
if (eolAfter !== eol) { console.error('  EOL CONVENTION CHANGED by the write'); verifyFailed = true; }

if (verifyFailed) {
    console.error('\nVERIFICATION FAILED \u2014 the file on disk is not what was intended.');
    process.exit(1);
}
console.log('  verified ' + FILE + ' (' + (eol === '\r\n' ? 'CRLF' : 'LF') + ' preserved)');
console.log('\nDone. Commit as a docs-only follow-up to e10e1a1.');
