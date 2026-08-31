#!/usr/bin/env node
/**
 * Commit 3 — rep-path scoping on the four GETs that never had one.
 *
 *   node patch-get-scoping.mjs           # dry run, reports what it would do
 *   node patch-get-scoping.mjs --apply   # writes
 *
 * accounts, contacts, tasks and activities each returned EVERY row in the org to
 * every caller. opportunities.mjs:188 and leads.mjs already filter; these four
 * were the remainder, so the browser was the only thing narrowing them and a rep
 * calling the endpoint directly got the whole company.
 *
 * The filter is the same predicate opportunities uses, unchanged:
 *     !r.ownerId || r.ownerId === callerId
 * Unassigned stays visible to everyone. A caller who cannot be resolved gets
 * callerId null and sees only unassigned rows — the same fail-closed direction
 * mayMutate() takes on writes.
 *
 * Admin and Manager are untouched: canSeeAll() returns before the filter. No
 * manager/managedReps branch here, deliberately — see the commit notes.
 *
 * Files are CRLF. Anchors carry \r\n and every replacement is asserted to match
 * exactly once; a miss writes nothing (18b2). After writing, each file is
 * re-read FROM DISK and checked for the expected strings.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

const REP_FILTER = (varName) => (
    `            if (!canSeeAll(userRole)) {\r\n` +
    `                // Rep scoping. This endpoint returned every row in the org to\r\n` +
    `                // every caller until now — the client filter in App.jsx was the\r\n` +
    `                // only thing narrowing it, and a client filter is not a boundary.\r\n` +
    `                //\r\n` +
    `                // Same predicate as opportunities.mjs: unassigned is visible to\r\n` +
    `                // everyone, owned rows only to their owner. Keys on the OWNER ID,\r\n` +
    `                // never the display name — two users sharing a name saw each\r\n` +
    `                // other's records, and renaming one detached theirs (18b22).\r\n` +
    `                //\r\n` +
    `                // A caller that cannot be resolved stays null and sees only\r\n` +
    `                // unassigned rows, matching mayMutate()'s direction on writes.\r\n` +
    `                const callerId = await getCallerId(userId, orgId);\r\n` +
    `                ${varName} = ${varName}.filter(r => !r.ownerId || r.ownerId === callerId);\r\n` +
    `            }\r\n`
);

const edits = [
    {
        file: 'netlify/functions/accounts.mjs',
        changes: [{
            old:
                `        if (event.httpMethod === 'GET') {\r\n` +
                `            const results = await db.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.name));\r\n` +
                `            return { statusCode: 200, headers, body: JSON.stringify({ accounts: results }) };\r\n`,
            new:
                `        if (event.httpMethod === 'GET') {\r\n` +
                `            let results = await db.select().from(accounts).where(eq(accounts.orgId, orgId)).orderBy(asc(accounts.name));\r\n` +
                REP_FILTER('results') +
                `            return { statusCode: 200, headers, body: JSON.stringify({ accounts: results }) };\r\n`,
        }],
        expectPresent: ['let results = await db.select().from(accounts)', 'r.ownerId === callerId'],
        expectAbsent: ['const results = await db.select().from(accounts)'],
    },
    {
        file: 'netlify/functions/contacts.mjs',
        changes: [{
            old:
                `        if (event.httpMethod === 'GET') {\r\n` +
                `            const results = await db.select().from(contacts).where(eq(contacts.orgId, orgId)).orderBy(asc(contacts.lastName));\r\n` +
                `            return { statusCode: 200, headers, body: JSON.stringify({ contacts: results }) };\r\n`,
            new:
                `        if (event.httpMethod === 'GET') {\r\n` +
                `            let results = await db.select().from(contacts).where(eq(contacts.orgId, orgId)).orderBy(asc(contacts.lastName));\r\n` +
                REP_FILTER('results') +
                `            return { statusCode: 200, headers, body: JSON.stringify({ contacts: results }) };\r\n`,
        }],
        expectPresent: ['let results = await db.select().from(contacts)', 'r.ownerId === callerId'],
        expectAbsent: ['const results = await db.select().from(contacts)'],
    },
    {
        file: 'netlify/functions/activities.mjs',
        changes: [
            {
                // activities does not import getCallerId yet.
                old:
                    `    serverErrorBody, writeAudit, assertOwnership,\r\n` +
                    `    stampOwnerId, ownerIdForUpdate, ambiguousOwnerResponse,\r\n`,
                new:
                    `    serverErrorBody, writeAudit, getCallerId, assertOwnership,\r\n` +
                    `    stampOwnerId, ownerIdForUpdate, ambiguousOwnerResponse,\r\n`,
            },
            {
                old:
                    `        if (event.httpMethod === 'GET') {\r\n` +
                    `            const results = await db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(asc(activities.date));\r\n` +
                    `            return { statusCode: 200, headers, body: JSON.stringify({ activities: results }) };\r\n`,
                new:
                    `        if (event.httpMethod === 'GET') {\r\n` +
                    `            let results = await db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(asc(activities.date));\r\n` +
                    REP_FILTER('results') +
                    `            return { statusCode: 200, headers, body: JSON.stringify({ activities: results }) };\r\n`,
            },
        ],
        expectPresent: ['getCallerId, assertOwnership', 'let results = await db.select().from(activities)', 'r.ownerId === callerId'],
        expectAbsent: ['const results = await db.select().from(activities)'],
    },
    {
        file: 'netlify/functions/tasks.mjs',
        changes: [
            {
                // tasks imports neither canSeeAll nor getCallerId.
                old: `import { verifyAuth, requireRole, isReadOnly, requireWrite } from './auth.mjs';\r\n`,
                new: `import { verifyAuth, requireRole, canSeeAll, isReadOnly, requireWrite } from './auth.mjs';\r\n`,
            },
            {
                old:
                    `    serverErrorBody, writeAudit, assertOwnership,\r\n` +
                    `    stampOwnerId, ownerIdForUpdate, ambiguousOwnerResponse,\r\n`,
                new:
                    `    serverErrorBody, writeAudit, getCallerId, assertOwnership,\r\n` +
                    `    stampOwnerId, ownerIdForUpdate, ambiguousOwnerResponse,\r\n`,
            },
            {
                old:
                    `        if (event.httpMethod === 'GET') {\r\n` +
                    `            const results = await db.select().from(tasks).where(eq(tasks.orgId, orgId)).orderBy(asc(tasks.dueDate));\r\n` +
                    `            return { statusCode: 200, headers, body: JSON.stringify({ tasks: results }) };\r\n`,
                new:
                    `        if (event.httpMethod === 'GET') {\r\n` +
                    `            let results = await db.select().from(tasks).where(eq(tasks.orgId, orgId)).orderBy(asc(tasks.dueDate));\r\n` +
                    REP_FILTER('results') +
                    `            return { statusCode: 200, headers, body: JSON.stringify({ tasks: results }) };\r\n`,
            },
        ],
        expectPresent: ['canSeeAll, isReadOnly', 'getCallerId, assertOwnership', 'let results = await db.select().from(tasks)', 'r.ownerId === callerId'],
        expectAbsent: ['const results = await db.select().from(tasks)'],
    },
];

let failed = false;
const staged = [];

for (const edit of edits) {
    if (!existsSync(edit.file)) {
        console.error(`FAIL ${edit.file} — not found. Run from the repo root.`);
        failed = true;
        continue;
    }
    let src = readFileSync(edit.file, 'utf8');
    let ok = true;

    for (const [i, ch] of edit.changes.entries()) {
        const n = src.split(ch.old).length - 1;
        if (n !== 1) {
            console.error(`FAIL ${edit.file} — anchor ${i + 1} matched ${n} times, expected 1.`);
            ok = false;
            failed = true;
            break;
        }
        src = src.replace(ch.old, ch.new);
    }

    if (!ok) continue;
    staged.push({ file: edit.file, src, edit });
    console.log(`  ok   ${edit.file} — ${edit.changes.length} anchor(s) matched`);
}

if (failed) {
    console.error('\nNothing written. Fix the anchors and re-run.');
    process.exit(1);
}

if (!APPLY) {
    console.log('\nDry run. All anchors matched. Re-run with --apply to write.');
    process.exit(0);
}

// Write once, at the end.
for (const { file, src } of staged) writeFileSync(file, src, 'utf8');

// Then re-read FROM DISK and prove it (18b2).
console.log('\nVerifying on disk:');
let verifyFailed = false;
for (const { file, edit } of staged) {
    const onDisk = readFileSync(file, 'utf8');
    for (const s of edit.expectPresent) {
        if (!onDisk.includes(s)) { console.error(`  MISSING in ${file}: ${s}`); verifyFailed = true; }
    }
    for (const s of edit.expectAbsent) {
        if (onDisk.includes(s)) { console.error(`  STILL PRESENT in ${file}: ${s}`); verifyFailed = true; }
    }
    if (!onDisk.includes('\r\n')) { console.error(`  CRLF LOST in ${file}`); verifyFailed = true; }
    console.log(`  verified ${file}`);
}

if (verifyFailed) {
    console.error('\nVERIFICATION FAILED — the files on disk are not what was intended.');
    process.exit(1);
}

console.log('\nDone. Now run: npm test  (the function-import graph check is in there — 0.11)');
