// One-shot, ADDITIVE-ONLY, idempotent DDL for customer-facing notifications
// (state §0.111): two nullable columns on dispatch_jobs. Mirrors db/schema.ts
// exactly. Safe on the shared Neon main branch: ADD COLUMN IF NOT EXISTS only —
// no DROP, no type change, and a second run is a no-op.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that reads the columns, and against the TEST database
// before test:int:
//
//     node --env-file=.env db/apply-customer-notifications.mjs
//     node --env-file=.env db/apply-customer-notifications.mjs --test
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

// public_token: the unguessable handle in the customer's status link (24 random
// bytes, base64url). Null until the first notification that carries a link.
// customer_notifications: the trail of what was sent — [{ type, channel, to,
// at, ok, error?, by? }] — appended by _customerNotify.mjs, shown on the job.
await sql`ALTER TABLE "dispatch_jobs" ADD COLUMN IF NOT EXISTS "public_token" text`;
await sql`ALTER TABLE "dispatch_jobs" ADD COLUMN IF NOT EXISTS "customer_notifications" jsonb`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_jobs_public_token_uq" ON "dispatch_jobs" ("public_token")`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'dispatch_jobs' AND column_name IN ('public_token', 'customer_notifications')
    ORDER BY column_name
`;
if (cols.length !== 2) throw new Error(`expected 2 new dispatch_jobs columns, found ${JSON.stringify(cols)}`);
for (const c of cols) if (c.is_nullable !== 'YES') throw new Error(`${c.column_name} must be nullable`);
const idx = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'dispatch_jobs' AND indexname = 'dispatch_jobs_public_token_uq'`;
if (idx.length !== 1 || !/UNIQUE INDEX/.test(idx[0].indexdef)) throw new Error(`expected the unique public_token index, found ${JSON.stringify(idx)}`);
for (const c of cols) console.log(`  dispatch_jobs.${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}`);
console.log('index:', idx[0].indexdef);
console.log('OK — columns and index present and verified.');
