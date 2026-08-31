// scripts/check-mirror-roles.mjs — READ ONLY. One SELECT, zero writes.
//
// WHY THIS EXISTS
//
// check-clerk-roles.mjs answers "does CLERK hold a role no gate recognises?"
// (31 Aug 2026: one finding, fixed via the UI, re-run clean). This script asks
// the same question of the MIRROR: the users table's `role` column, and the
// frozen `profile.userType` blob copy the roster UI used to display from
// (users.mjs §flatten documents how values like 'member' froze there at row
// creation and were never updated).
//
// It prints every roster row grouped by org, flags any value outside
// APP_ROLES in EITHER location, and exits 1 if anything was flagged.
// Nothing is modified. Nothing here imports Clerk, Drizzle, or the app.
//
//   node --env-file=.env scripts/check-mirror-roles.mjs
//   node --env-file=.env scripts/check-mirror-roles.mjs --org=org_3Cwn...
//
// The client is @netlify/neon's neon() with no arguments — the exact client
// db/index.ts constructs — which reads NETLIFY_DATABASE_URL from the
// environment. Dev and prod share one Neon `main` branch, so "the prod rows"
// are distinguished by orgId, not by connection; hence the grouping and --org.
//
// Column names are read tolerantly (snake_case or camelCase) because
// db/schema.ts was not read when this was written. If the table's real
// columns differ from expectations, the script says so and prints what it
// actually found rather than guessing.
import { neon } from '@netlify/neon';

const APP_ROLES = ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'];

const argOrgs = process.argv.slice(2)
    .filter((a) => a.startsWith('--org='))
    .map((a) => a.slice('--org='.length))
    .filter(Boolean);

// Absent is fine and always has been: auth.mjs reads `meta.role || 'User'`
// on the Clerk side, and the column is notNull default 'User' on this side.
// Only a PRESENT value outside the list is drift.
const isRefused = (v) =>
    v !== undefined && v !== null && v !== '' && !APP_ROLES.includes(v);

// Tolerant field read: first present key wins. `undefined` means the row
// genuinely has neither spelling.
const pick = (row, ...keys) => {
    for (const k of keys) if (k in row) return row[k];
    return undefined;
};

if (!process.env.NETLIFY_DATABASE_URL) {
    console.error('NETLIFY_DATABASE_URL is not set. Run with: node --env-file=.env scripts/check-mirror-roles.mjs');
    process.exit(2);
}

const sql = neon();

let rows;
try {
    rows = await sql`SELECT * FROM users`;
} catch (e) {
    console.error('SELECT failed:', e.message);
    process.exit(2);
}

if (!rows.length) {
    console.log('users table returned zero rows.');
    process.exit(0);
}

// Sanity-check the shape ONCE before trusting any per-row reads.
const sample = rows[0];
const expected = [
    ['orgId',   ['org_id', 'orgId']],
    ['role',    ['role']],
    ['email',   ['email']],
    ['profile', ['profile']],
];
const missing = expected.filter(([, keys]) => keys.every((k) => !(k in sample)));
if (missing.length) {
    console.error('Table shape differs from expectations. Missing:', missing.map(([n]) => n).join(', '));
    console.error('Actual columns:', Object.keys(sample).join(', '));
    console.error('Nothing was flagged — fix the script to match the real columns first.');
    process.exit(2);
}

const byOrg = new Map();
for (const r of rows) {
    const orgId = pick(r, 'org_id', 'orgId');
    if (argOrgs.length && !argOrgs.includes(orgId)) continue;
    if (!byOrg.has(orgId)) byOrg.set(orgId, []);
    byOrg.get(orgId).push(r);
}

let findings = 0;
let scanned = 0;

for (const [orgId, orgRows] of [...byOrg.entries()].sort()) {
    console.log(`\n${orgId} — ${orgRows.length} row(s)`);
    for (const r of orgRows.sort((a, b) => (a.email || '').localeCompare(b.email || ''))) {
        scanned++;
        const role     = pick(r, 'role');
        const profile  = pick(r, 'profile') || {};
        const blobType = profile.userType;
        const clerkId  = pick(r, 'clerk_user_id', 'clerkUserId');
        const active   = pick(r, 'active');
        const badCol   = isRefused(role);
        const badBlob  = isRefused(blobType);

        const mark = (badCol || badBlob) ? '  ✗' : '   ';
        console.log(`${mark} ${r.email || '(no email)'}  [${clerkId ? 'linked' : 'UNLINKED'}${active === false ? ', inactive' : ''}]`);
        console.log(`      role column       = ${JSON.stringify(role)}${badCol ? '  ← not an Accelerep role' : ''}`);
        console.log(`      profile.userType  = ${JSON.stringify(blobType ?? null)}${badBlob ? '  ← not an Accelerep role (frozen blob — self-heals on next row write)' : ''}`);

        if (badCol)  findings++;
        if (badBlob) findings++;
    }
}

console.log(`\nScanned ${scanned} row(s) across ${byOrg.size} org(s).`);
if (findings) {
    console.log(`${findings} refused value(s) found (column and blob counted separately).`);
    console.log('Column drift is real mirror drift. Blob-only drift self-heals on the next write of that row.');
    process.exit(1);
}
console.log('Mirror is clean: every stored role and every blob userType is an Accelerep role or absent.');
