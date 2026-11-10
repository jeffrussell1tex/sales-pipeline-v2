// One-shot, ADDITIVE-ONLY, idempotent DDL for a deal's close-date history (state §0.239; docs/design/close-date-history,
// Jeff's Q1-Q4, 10 Nov; OPEN_ITEMS §3.1 decision 3 — "a new deal column, additive and nullable, both databases, with
// Jeff's go"). Mirrors db/schema.ts exactly. Safe on the shared Neon main branch: ALTER TABLE ... ADD COLUMN IF NOT
// EXISTS, jsonb, nullable, no default rewrite — no DROP, no type change, no row touched, and a second run is a no-op.
// Code that does not know the column (prod before the ship) is unaffected: it never names it.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run it against the TEST database before test:int, and against the APP
// database before any code that names the column runs anywhere (local netlify dev included — it reads the app
// database). Without --apply it only checks and says what it would do.
//
//     node --env-file=.env db/apply-close-date-history.mjs --test --apply   (TEST database)
//     node --env-file=.env db/apply-close-date-history.mjs                  (APP database: checks only)
//     node --env-file=.env db/apply-close-date-history.mjs --apply          (APP database — shared by dev and production)
//
// (Not drizzle-kit push: it diffs the WHOLE schema against a database also touched by hand — apply-coaching-notes.mjs.)
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const apply = process.argv.includes('--apply');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
const host = new URL(url).host;
// The test path never reaches the shared app database (drizzle.test.config.ts's guard, by host).
if (useTest && host.includes('ep-soft-morning')) throw new Error(`Refusing: ${host} is the SHARED APP database, not the test branch. Check DATABASE_URL_TEST.`);
console.log('target:', host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)', apply ? '— APPLY' : '— checks only (no --apply)');

const sql = neon(url);
const column = async () => sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'opportunities' AND column_name = 'close_date_history'`;

const before = await column();
const [{ n: deals }] = await sql`SELECT count(*)::int AS n FROM "opportunities"`;
console.log(`opportunities rows: ${deals} · close_date_history ${before.length ? `present (${before[0].data_type})` : 'absent'}`);
if (!apply) {
    console.log(before.length ? 'checks only — the column is already there; nothing to do.' : 'checks only — nothing written. --apply runs: ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "close_date_history" jsonb');
    process.exit(0);
}

await sql`ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "close_date_history" jsonb`;

// Read back what the database actually holds — the verification is the point.
const after = await column();
if (after.length !== 1) throw new Error('close_date_history is not on opportunities after the ALTER');
const c = after[0];
if (c.data_type !== 'jsonb') throw new Error(`close_date_history is ${c.data_type}, not jsonb`);
if (c.is_nullable !== 'YES') throw new Error('close_date_history is not nullable — the change must be additive and nullable');
if (c.column_default != null) throw new Error(`close_date_history has a default (${c.column_default}) — the design names none`);
const [{ n: held }] = await sql`SELECT count(*)::int AS n FROM "opportunities" WHERE "close_date_history" IS NOT NULL`;
console.log(`  close_date_history  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''} · rows holding one: ${held}`);
console.log('OK — column present and verified.');
