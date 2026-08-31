#!/usr/bin/env node
/**
 * Docs-only: record the production rep-path verification (\u00a70.50) and the
 * Mine/All browser pass (\u00a70.51), plus the header clause. Completes the runtime
 * evidence trail for both 28 Aug batches.
 *
 *   node patch-prod-verified.mjs           # dry run
 *   node patch-prod-verified.mjs --apply   # writes
 *
 * EOL detected at runtime (git autocrlf may flip the state doc); anchors are
 * stored \n-normalised and re-normalised to the file's convention. Each must
 * match exactly once; a miss writes nothing. After writing, the file is
 * re-read FROM DISK and checked, including EOL preservation.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const FILE = 'docs/ACCELEREP_CURRENT_STATE.md';

const changes = [
    {
        // Header: append the prod clause to the Verified-at line tail
        old: 'Admin unchanged at baseline (\u00a70.50)\n',
        new: 'Admin unchanged at baseline (\u00a70.50) \u00b7 **prod rep-path verified, both roles, 28 Aug** (\u00a70.50)\n',
    },
    {
        // \u00a70.50: append the production paragraph after the dev record
        old: 'evidence, recorded here.\n',
        new: [
            'evidence, recorded here.',
            '',
            '**Production verified the same way, 28 Aug, `master` at `1ceb13c`** \u2014 a',
            'different Clerk instance, org and dataset. Admin control: **663 \u00b7 1506 \u00b7',
            '48 \u00b7 30**, unchanged across runs. Rep path (`usr_449739ff-\u2026`, the',
            '`jeffrussell1@live.com` account) received **663 \u00b7 61 \u00b7 0 \u00b7 2**, and the',
            'predicate applied over the full Admin dataset yields the identical four',
            'numbers \u2014 no leaks, nothing missing. Unlike dev, prod shows the boundary',
            'doing visible work: 61 of 1,506 contacts, 0 of 48 tasks. Found in passing:',
            'five of six prod roster rows carry refused role values in the mirror',
            '(`member` \u00d74, `Sales Rep` \u00d71 \u2014 invite-era values predating the vocab',
            'batch), so those accounts likely cannot write on prod until re-set via the',
            'Users UI, and `check-clerk-roles.mjs` against the prod Clerk instance is',
            'concretely due.',
            '',
        ].join('\n'),
    },
    {
        // \u00a70.51: append the browser-pass record
        old: 'nothing she owns missing on Tasks) are the verification.\n',
        new: [
            'nothing she owns missing on Tasks) are the verification.',
            '',
            'Verified in the browser on dev, 28 Aug, deploy `521e5d7`: as Karen \u2014 the',
            'control reads Mine/All, toggles, and the choice survives a reload; nothing',
            'she owns missing under Mine. As Admin \u2014 unchanged. Karen\u2019s Mine equals her',
            'All, WHICH IS EXPECTED AND BY CONSTRUCTION: the server sends a rep only',
            'own + unassigned, Mine hides only rows owned by others, and there are none',
            'to hide \u2014 the identical property the old Mine/Team control had. The toggle',
            'is meaningful for Admins and Managers today; making Mine strictly-mine',
            '(hiding unassigned too) is a one-line product option if reps should get a',
            'real distinction.',
            '',
        ].join('\n'),
    },
];

const expectPresent = [
    'Production verified the same way, 28 Aug',
    '663 \u00b7 61 \u00b7 0 \u00b7 2',
    'prod rep-path verified, both roles, 28 Aug',
    'WHICH IS EXPECTED AND BY CONSTRUCTION',
    'check-clerk-roles.mjs',
];
const expectAbsent = [];

if (!existsSync(FILE)) {
    console.error('FAIL ' + FILE + ' \u2014 not found. Run from the repo root.');
    process.exit(1);
}

let src = readFileSync(FILE, 'utf8');
const crlfCount = (src.match(/\r\n/g) || []).length;
const lfCount = (src.match(/\n/g) || []).length;
if (crlfCount !== 0 && crlfCount !== lfCount) {
    console.error('FAIL ' + FILE + ' \u2014 MIXED line endings. Refusing.');
    process.exit(1);
}
const eol = crlfCount > 0 ? '\r\n' : '\n';
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
console.log('  ok   ' + FILE + ' \u2014 ' + changes.length + ' anchor(s) matched');

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
const eolAfter = (onDisk.match(/\r\n/g) || []).length > 0 ? '\r\n' : '\n';
if (eolAfter !== eol) { console.error('  EOL CONVENTION CHANGED by the write'); verifyFailed = true; }

if (verifyFailed) {
    console.error('\nVERIFICATION FAILED \u2014 the file on disk is not what was intended.');
    process.exit(1);
}
console.log('  verified ' + FILE + ' (' + (eol === '\r\n' ? 'CRLF' : 'LF') + ' preserved)');
console.log('\nDone. Commit as a docs-only follow-up.');
