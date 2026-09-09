// One-shot, ADDITIVE data repair for item 28 (state §0.104): rows that carry an
// owner_id but a BLANK display-name column get the owner's roster name.
//
// Before §0.104, a record created in the UI without naming a rep was owned by
// its creator underneath (stampOwnerId) and displayed as nobody's — the
// display-name column stayed null. New rows are stamped with both from one
// roster row; this fills the rows created before that. It only ever writes a
// name INTO A BLANK, joined to users by (id, org_id) — never overwrites a
// name, never touches owner_id, never crosses an org.
//
// DRY RUN BY DEFAULT: prints every row it would change. --apply writes, then
// re-reads and prints what changed. Run by Jeff's hand (the shared Neon main
// branch serves dev AND prod):
//
//     node --env-file=.env db/backfill-owner-names.mjs
//     node --env-file=.env db/backfill-owner-names.mjs --apply
//     node --env-file=.env db/backfill-owner-names.mjs --test          (the test database)
import { neon } from '@neondatabase/serverless';

const apply = process.argv.includes('--apply');
const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)', apply ? '— APPLY' : '— dry run');
const sql = neon(url);

// The six Tier 1 tables and their display-name columns (OWNER_NAME_COLUMNS in
// netlify/functions/_ownership.mjs, in snake_case). Identifiers are constants
// from this list only — never from input.
const TABLES = [
    ['contacts',      'assigned_rep'],
    ['accounts',      'account_owner'],
    ['opportunities', 'sales_rep'],
    ['leads',         'assigned_to'],
    ['tasks',         'assigned_to'],
    ['activities',    'author'],
];

let total = 0;
for (const [table, col] of TABLES) {
    const rows = await sql.query(
        `SELECT x.id, x.org_id, x.owner_id, u.name AS owner_name
           FROM ${table} x
           JOIN users u ON u.id = x.owner_id AND u.org_id = x.org_id
          WHERE x.owner_id IS NOT NULL
            AND (x.${col} IS NULL OR btrim(x.${col}) = '')
            AND u.name IS NOT NULL AND btrim(u.name) <> ''
          ORDER BY x.org_id, x.id`);
    console.log(`${table}.${col}: ${rows.length} row(s) owned but unnamed`);
    for (const r of rows) console.log(`  ${r.org_id}  ${r.id}  owner ${r.owner_id} → "${r.owner_name}"`);
    total += rows.length;
    if (apply && rows.length) {
        const res = await sql.query(
            `UPDATE ${table} x
                SET ${col} = u.name, updated_at = now()
               FROM users u
              WHERE u.id = x.owner_id AND u.org_id = x.org_id
                AND x.owner_id IS NOT NULL
                AND (x.${col} IS NULL OR btrim(x.${col}) = '')
                AND u.name IS NOT NULL AND btrim(u.name) <> ''
              RETURNING x.id, x.${col} AS name`);
        console.log(`  applied: ${res.length} row(s) updated`);
        for (const r of res) console.log(`    ${r.id} → "${r.name}"`);
    }
}
console.log(apply ? `Done — ${total} row(s) filled.` : `Dry run — ${total} row(s) would be filled. Re-run with --apply to write.`);
