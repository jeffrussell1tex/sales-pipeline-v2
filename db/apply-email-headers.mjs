// One-shot, ADDITIVE-ONLY, idempotent DDL for the four email-envelope columns
// on activities (state §0.105, handoff item 27: From, To, Cc and Message-ID on
// a logged email's row). Mirrors db/schema.ts exactly. Safe on the shared Neon
// main branch: ALTER TABLE ... ADD COLUMN IF NOT EXISTS, nullable, no default
// rewrite — no DROP, no type change, and a second run is a no-op. Code that
// does not know the columns (prod before the ship) is unaffected: it never
// names them.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that writes the columns, and against the TEST database
// before test:int:
//
//     node --env-file=.env db/apply-email-headers.mjs
//     node --env-file=.env db/apply-email-headers.mjs --test
//
// (Not drizzle-kit push, for the reason apply-coaching-notes.mjs gives: push
// diffs the WHOLE schema against a database that has also been touched by
// hand. This script's blast radius is four nullable ADD COLUMNs, readable below.)
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

await sql`ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "email_from"       text`;
await sql`ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "email_to"         jsonb`;
await sql`ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "email_cc"         jsonb`;
await sql`ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "email_message_id" text`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'activities' AND column_name IN ('email_from', 'email_to', 'email_cc', 'email_message_id')
    ORDER BY column_name
`;
if (cols.length !== 4) throw new Error(`expected the 4 email columns on activities, found ${cols.length}`);
for (const c of cols) {
    if (c.is_nullable !== 'YES') throw new Error(`${c.column_name} is not nullable — the change must be additive and nullable`);
    console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
}
const n = await sql`SELECT count(*)::int AS n FROM "activities" WHERE "email_message_id" IS NOT NULL`;
console.log('rows with an email_message_id so far:', n[0].n);
console.log('OK — columns present and verified.');
