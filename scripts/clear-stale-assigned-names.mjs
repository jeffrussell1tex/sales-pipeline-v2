// scripts/clear-stale-assigned-names.mjs — clears stale assignedTo display
// names on leads whose ownerId is NULL. DRY-RUN BY DEFAULT; writes only with
// --apply, and --apply refuses to run without an explicit --org and --expect.
//
// WHY: ownership policy keys on ownerId (§18b22); assignedTo is display only.
// Rows created before owner stamping carry a name but no owner — the ZZFX
// pattern — so the UI shows them "assigned" while every policy correctly
// treats them as unassigned. Clearing the name makes display agree with
// policy. (Backfilling ownerId FROM the name was rejected: resolving
// ownership by display-name string equality is the exact hazard the ownerId
// migration removed. Rows that should be owned get re-assigned through the
// app, which writes both fields.)
//
//   node --env-file=.env scripts/clear-stale-assigned-names.mjs
//       → dry run: lists every candidate row, grouped by org. Writes nothing.
//   node --env-file=.env scripts/clear-stale-assigned-names.mjs --apply --org=org_… --expect=N
//       → clears exactly the candidate rows in THAT org, refusing unless the
//         live count still equals N (the number the dry run showed you).
//
// Dev and prod share one Neon `main` branch: --org is mandatory on apply so a
// fix aimed at a dev org can never touch a prod org's rows by accident, and
// --expect pins the blast radius to what was reviewed.
import { neon } from '@netlify/neon';

if (!process.env.NETLIFY_DATABASE_URL) {
    console.error('NETLIFY_DATABASE_URL is not set. Run with: node --env-file=.env scripts/clear-stale-assigned-names.mjs');
    process.exit(2);
}

const APPLY  = process.argv.includes('--apply');
const orgArg = process.argv.filter(a => a.startsWith('--org=')).map(a => a.slice(6))[0] || null;
const expArg = process.argv.filter(a => a.startsWith('--expect=')).map(a => Number(a.slice(9)))[0];

const sql = neon();

// The physical column spelling (snake_case vs camelCase) is detected from a
// sample row rather than assumed — db/schema.ts was not read when this was
// written, and an UPDATE against guessed identifiers must not be possible.
// Only the two known spellings are ever used; nothing user-supplied reaches
// an identifier position.
let sample;
try {
    [sample] = await sql`SELECT * FROM leads LIMIT 1`;
} catch (e) {
    console.error('Cannot read the leads table:', e.message);
    process.exit(2);
}
if (!sample) { console.log('leads table is empty — nothing to do.'); process.exit(0); }

let spelling = null;
if ('owner_id' in sample && 'assigned_to' in sample && 'org_id' in sample) spelling = 'snake';
else if ('ownerId' in sample && 'assignedTo' in sample && 'orgId' in sample) spelling = 'camel';
if (!spelling) {
    console.error('Column spelling not recognised. Actual columns:', Object.keys(sample).join(', '));
    console.error('Refusing to guess an UPDATE target.');
    process.exit(2);
}

const selectCandidates = () => spelling === 'snake'
    ? sql`SELECT id, org_id AS org, first_name AS fn, last_name AS ln, company, assigned_to AS name
          FROM leads WHERE owner_id IS NULL AND assigned_to IS NOT NULL ORDER BY org_id, id`
    : sql`SELECT id, "orgId" AS org, "firstName" AS fn, "lastName" AS ln, company, "assignedTo" AS name
          FROM leads WHERE "ownerId" IS NULL AND "assignedTo" IS NOT NULL ORDER BY "orgId", id`;

const rows = await selectCandidates();

const byOrg = new Map();
for (const r of rows) {
    if (!byOrg.has(r.org)) byOrg.set(r.org, []);
    byOrg.get(r.org).push(r);
}

console.log(`${rows.length} candidate row(s) — ownerId NULL with a non-null assignedTo:\n`);
for (const [org, orgRows] of [...byOrg.entries()].sort()) {
    console.log(`${org} — ${orgRows.length} row(s)`);
    for (const r of orgRows) {
        console.log(`    ${r.id}  ${[r.fn, r.ln].filter(Boolean).join(' ') || '(no name)'} @ ${r.company || '—'}  assignedTo=${JSON.stringify(r.name)}`);
    }
}

if (!APPLY) {
    console.log('\nDry run — nothing written. To clear ONE org\'s rows:');
    console.log('  node --env-file=.env scripts/clear-stale-assigned-names.mjs --apply --org=<orgId> --expect=<count shown above for that org>');
    process.exit(0);
}

// ── apply path: every guard explicit ──
if (!orgArg) { console.error('--apply requires --org=<orgId>. Refusing an unscoped write.'); process.exit(2); }
if (!Number.isInteger(expArg) || expArg < 1) { console.error('--apply requires --expect=<N> matching the dry run. Refusing.'); process.exit(2); }
const target = byOrg.get(orgArg) || [];
if (target.length !== expArg) {
    console.error(`Live count for ${orgArg} is ${target.length}, not the expected ${expArg}. The data moved since the dry run — re-review. Refusing.`);
    process.exit(1);
}

const updated = spelling === 'snake'
    ? await sql`UPDATE leads SET assigned_to = NULL, updated_at = NOW()
                WHERE org_id = ${orgArg} AND owner_id IS NULL AND assigned_to IS NOT NULL RETURNING id`
    : await sql`UPDATE leads SET "assignedTo" = NULL, "updatedAt" = NOW()
                WHERE "orgId" = ${orgArg} AND "ownerId" IS NULL AND "assignedTo" IS NOT NULL RETURNING id`;

console.log(`\nCleared ${updated.length} row(s) in ${orgArg}.`);

// Post-verify FROM THE DATABASE, not from the update's return value.
const remaining = (await selectCandidates()).filter(r => r.org === orgArg);
if (remaining.length !== 0) {
    console.error(`POST-CHECK FAILED: ${remaining.length} candidate row(s) still present in ${orgArg}.`);
    process.exit(1);
}
console.log(`Post-check: zero candidate rows remain in ${orgArg}.`);
if (updated.length !== expArg) {
    console.error(`NOTE: updated ${updated.length} but expected ${expArg} — investigate before trusting this run.`);
    process.exit(1);
}
