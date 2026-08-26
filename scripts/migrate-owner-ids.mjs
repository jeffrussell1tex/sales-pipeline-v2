// scripts/migrate-owner-ids.mjs
//
// Phase 2: ownership keys on IDS, not display names.
//
// BEFORE  Ownership compared `<table>.<displayName>` against the caller's
//         `users.name`. Renaming a user DETACHED every record they owned, and
//         two users sharing a name in one org OWNED EACH OTHER'S RECORDS.
// AFTER   Ownership compares `<table>.owner_id` against `users.id`
//         (`usr_<uuid>`), which is app-owned, permanent and never reassigned.
//
// This script does two separable things:
//
//   1. ADDS the six owner_id columns and their indexes. Additive and nullable,
//      so it is safe on the Neon `main` branch that dev and production share.
//   2. RESOLVES the existing display names into ids, best-effort.
//
// Step 2 is NOT data preservation -- there are no live customers and Jeff has
// said the existing rows do not matter. It exists so the dev roster keeps
// working: without it EVERY row reads as unassigned, and an unassigned record is
// mutable by anyone, so a rep would see and edit the entire org. That looks
// identical to the visibility filter being broken, which is a state worth not
// being in while testing the very filter that was just fixed.
//
// AMBIGUITY IS REFUSED, NEVER GUESSED. If two roster rows in one org share a
// display name, every record naming them is REPORTED AND LEFT NULL. Picking one
// would write the Phase 2 defect permanently into the id column, where -- unlike
// a name -- nobody will ever re-examine it.
//
// WHY THIS TALKS TO NEON DIRECTLY
// An earlier migration imported `db/index.js` the way the Netlify functions do.
// That path only resolves because Netlify's bundler maps .js -> .ts; plain node
// cannot load it, and pulling in tsx would drag the whole TypeScript schema in to
// run a handful of ALTERs and an UPDATE loop.
//
// Run order (guide 18c — the database moves first, the schema file follows):
//
//   1. node --env-file=.env scripts/migrate-owner-ids.mjs            (plan)
//   2. node --env-file=.env scripts/migrate-owner-ids.mjs --apply    (writes)
//   3. npx drizzle-kit push                       — no destructive diff expected
//   4. npx drizzle-kit push --config=drizzle.test.config.ts   — THE TEST DB TOO
//
// Step 4 is not optional. test:int targets a DIFFERENT Neon endpoint and has
// drifted twice in two sessions; _schema-guard.mjs now names the missing column
// instead of failing eighteen times with a raw 42703.
//
// RE-RUNNABLE. Every DDL statement is IF EXISTS / IF NOT EXISTS, and the backfill
// only writes rows whose owner_id is still NULL.

// DRIVER NOTE — sql`...` vs sql.query(...)
//
// @neondatabase/serverless exposes ONE callable that behaves two ways. As a
// TAGGED TEMPLATE (sql`SELECT ...`) it parameterises safely. Called as a plain
// FUNCTION it now throws:
//
//     This function can now be called only as a tagged-template function
//
// Every statement below interpolates a TABLE OR COLUMN IDENTIFIER, which a
// tagged template cannot carry: identifiers are not parameterisable in Postgres,
// so sql`SELECT ${col} FROM ...` would send the column NAME as a string VALUE.
// These therefore use sql.query(text, params) -- identifiers built into the
// text, values still passed as $1/$2 and never concatenated.
//
// The identifiers come from the TABLES constant below and are never user input.
//
// This bit once already: the first run died at the backfill with the message
// above, AFTER the ambiguity report had printed. Nothing was written.
import { neon } from '@neondatabase/serverless';

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(...a);

const URL_VARS = ['NETLIFY_DATABASE_URL', 'DATABASE_URL', 'NEON_DATABASE_URL'];
const urlVar = URL_VARS.find((v) => process.env[v]);
if (!urlVar) {
    console.error(`\nNo database URL found. Set one of: ${URL_VARS.join(', ')}`);
    console.error('Run with:  node --env-file=.env scripts/migrate-owner-ids.mjs');
    console.error('(Never `set -a; source .env` — a space after an "=" makes bash execute the value.)');
    process.exit(1);
}
const DB_URL = process.env[urlVar];
const hostOf = (u) => { try { return new URL(u).host; } catch { return '(unparseable url)'; } };
const sql = neon(DB_URL);

// The driver has returned a bare array in some versions and { rows } in others.
// Normalising once means a driver bump cannot become a silent zero-row read that
// reports "nothing to migrate" and exits successfully.
const rowsOf = (r) => (Array.isArray(r) ? r : (r?.rows ?? []));

// table -> the display-name column ownership used to compare.
// Mirrors OWNER_NAME_COLUMNS in netlify/functions/_ownership.mjs. Kept as literal
// SQL identifiers rather than imported, for the reason in the header.
const TABLES = [
    ['accounts',      'account_owner'],
    ['contacts',      'assigned_rep'],
    ['opportunities', 'sales_rep'],
    ['tasks',         'assigned_to'],
    ['leads',         'assigned_to'],
    ['activities',    'author'],
];

const norm = (s) => String(s ?? '').trim().toLowerCase();

async function ddl(statement, label) {
    if (!APPLY) { log(`   would run: ${label}`); return; }
    await statement();
    log(`   ran: ${label}`);
}

async function main() {
    log(`\nDatabase: ${hostOf(DB_URL)}   (from ${urlVar})`);
    log(APPLY ? '\n=== APPLYING ===\n' : '\n=== PLAN ONLY — nothing is written. Add --apply to execute. ===\n');

    // ── 0. Columns and indexes ───────────────────────────────────────────────
    log('── Schema ──');
    for (const [t] of TABLES) {
        await ddl(() => sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS owner_id text`),
            `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS owner_id text`);
        await ddl(() => sql.query(`CREATE INDEX IF NOT EXISTS ${t}_org_owner_idx ON ${t} (org_id, owner_id)`),
            `CREATE INDEX ${t}_org_owner_idx (org_id, owner_id)`);
    }

    // In plan mode the columns do not exist yet, so the backfill below cannot be
    // simulated against them. Say so plainly rather than reporting zeroes that
    // read like "there is nothing to do".
    const haveColumns = rowsOf(await sql`
        SELECT table_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'owner_id'
           AND table_name IN ('accounts','contacts','opportunities','tasks','leads','activities')
    `).map((r) => r.table_name);

    if (haveColumns.length < TABLES.length) {
        log(`\n${TABLES.length - haveColumns.length} of ${TABLES.length} owner_id column(s) do not exist yet.`);
        log('The backfill cannot be planned until they do. Re-run with --apply to create');
        log('them and backfill in one pass — the DDL is additive and nullable.\n');
        if (!APPLY) return;
    }

    // ── 1. Roster, and the ambiguity check ───────────────────────────────────
    const roster = rowsOf(await sql`SELECT id, org_id, name, email FROM users`);
    log(`\n── Roster: ${roster.length} row(s) across ${new Set(roster.map((r) => r.org_id)).size} org(s) ──`);

    // (org, normalised name) -> [users.id]. More than one id is the collision
    // this whole migration exists to make impossible.
    const byName = new Map();
    for (const u of roster) {
        if (!norm(u.name)) continue;
        const key = `${u.org_id}::${norm(u.name)}`;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(u);
    }

    const ambiguous = [...byName.entries()].filter(([, v]) => v.length > 1);
    if (ambiguous.length) {
        log('\nDUPLICATE DISPLAY NAMES — every record owned by one of these stays NULL:\n');
        for (const [key, us] of ambiguous) {
            log(`   "${key.split('::')[1]}"  [org ${key.split('::')[0].slice(0, 12)}…]`);
            for (const u of us) log(`      ${u.id}   ${u.email || '(no email)'}`);
        }
        log('\nThis is the exact defect Phase 2 removes: these users currently own each');
        log("other's records and every gate agrees it is fine. Rename one of each pair,");
        log('then re-run — this script is re-runnable and only writes NULL owner_ids.\n');
    } else {
        log('Ambiguity check: clean — no two users in one org share a display name.\n');
    }

    // ── 2. Backfill ──────────────────────────────────────────────────────────
    log('── Backfill ──');
    let totalSet = 0, totalUnmatched = 0, totalAmbiguous = 0, totalAlready = 0, totalUnowned = 0;

    for (const [table, nameCol] of TABLES) {
        const rows = rowsOf(await sql.query(
            `SELECT id, org_id, ${nameCol} AS owner_name, owner_id FROM ${table}`
        ));

        let set = 0, already = 0, unowned = 0;
        const unmatched = new Map();
        const ambig = new Map();

        for (const r of rows) {
            if (r.owner_id) { already++; continue; }
            const n = norm(r.owner_name);
            if (!n) { unowned++; continue; }

            const candidates = byName.get(`${r.org_id}::${n}`) || [];
            if (candidates.length === 0) {
                unmatched.set(r.owner_name, (unmatched.get(r.owner_name) || 0) + 1);
                continue;
            }
            if (candidates.length > 1) {
                ambig.set(r.owner_name, (ambig.get(r.owner_name) || 0) + 1);
                continue;
            }
            if (APPLY) {
                await sql.query(`UPDATE ${table} SET owner_id = $1 WHERE id = $2`, [candidates[0].id, r.id]);
            }
            set++;
        }

        totalSet += set; totalAlready += already; totalUnowned += unowned;
        totalUnmatched += [...unmatched.values()].reduce((a, b) => a + b, 0);
        totalAmbiguous += [...ambig.values()].reduce((a, b) => a + b, 0);

        log(`   ${table.padEnd(14)} ${String(rows.length).padStart(5)} rows   ` +
            `${APPLY ? 'set' : 'would set'} ${set}   unowned ${unowned}   already ${already}`);
        for (const [n, c] of unmatched) log(`      ! no roster match: "${n}" (${c} row(s)) — left unassigned`);
        for (const [n, c] of ambig)     log(`      ! AMBIGUOUS: "${n}" (${c} row(s)) — left unassigned, refusing to guess`);
    }

    log(`\n${APPLY ? 'Set' : 'Would set'} ${totalSet} owner_id(s).`);
    log(`Already had one: ${totalAlready}   genuinely unowned: ${totalUnowned}`);
    if (totalUnmatched) log(`Names matching nobody on the roster: ${totalUnmatched} row(s) — left unassigned.`);
    if (totalAmbiguous) log(`AMBIGUOUS names: ${totalAmbiguous} row(s) — left unassigned, deliberately.`);

    log('\nUnassigned records are mutable by ANY writer — that is the policy, not a');
    log('gap (it is how a rep picks up unowned work). But it does mean any row left');
    log('NULL above is editable org-wide until someone takes it.');

    log(APPLY
        ? '\nDone. Next:\n   npx drizzle-kit push\n   npx drizzle-kit push --config=drizzle.test.config.ts'
        : '\nPlan only — nothing was written. Re-run with --apply.');
}

main().then(() => process.exit(0)).catch((e) => {
    console.error('\nMigration failed:', e.message);
    console.error('Anything printed after a "ran:" line above WAS applied; the rest was not.');
    console.error('This script is re-runnable — fix the cause and run it again.');
    process.exit(1);
});
