// One-shot, ADDITIVE-ONLY, idempotent DDL for maintenance agreements (state
// §0.110): one nullable column on dispatch_service_plans and the new
// dispatch_plan_visits table. Mirrors db/schema.ts exactly. Safe on the shared
// Neon main branch: ADD COLUMN IF NOT EXISTS and CREATE ... IF NOT EXISTS only —
// no DROP, no type change, and a second run is a no-op.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that reads the column or the table, and against the
// TEST database before test:int:
//
//     node --env-file=.env db/apply-plan-visits.mjs
//     node --env-file=.env db/apply-plan-visits.mjs --test
//
// (Not drizzle-kit push, for the reason apply-coaching-notes.mjs gives: push
// diffs the WHOLE schema against a database that has also been touched by
// hand. This script's blast radius is one ALTER and one CREATE, readable below.)
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

// How early a plan's renewal surfaces (days before agreement_expiry). Nullable;
// code reads null as 60 (planVisits.js DEFAULT_RENEWAL_LEAD_DAYS).
await sql`ALTER TABLE "dispatch_service_plans" ADD COLUMN IF NOT EXISTS "renewal_lead_days" integer`;

// What a dispatcher recorded about ONE plan occurrence: skipped (retired without
// a job) or deferred (falls due on deferred_to; keeps its grid date). One row per
// occurrence per customer per plan per org.
await sql`
    CREATE TABLE IF NOT EXISTS "dispatch_plan_visits" (
        "id"           text PRIMARY KEY,
        "org_id"       text NOT NULL,
        "customer_id"  text NOT NULL,
        "plan_id"      text NOT NULL,
        "due_date"     varchar(20) NOT NULL,
        "action"       varchar(10) NOT NULL,
        "deferred_to"  varchar(20),
        "reason"       text,
        "by_user_id"   text,
        "by_name"      varchar(255),
        "created_at"   timestamp NOT NULL DEFAULT now()
    )
`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_plan_visits_occurrence_uq" ON "dispatch_plan_visits" ("org_id", "customer_id", "plan_id", "due_date")`;
await sql`CREATE INDEX IF NOT EXISTS "dispatch_plan_visits_org_id_idx" ON "dispatch_plan_visits" ("org_id")`;

// Read back what the database actually holds — the verification is the point.
const col = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'dispatch_service_plans' AND column_name = 'renewal_lead_days'
`;
if (col.length !== 1 || col[0].data_type !== 'integer' || col[0].is_nullable !== 'YES') {
    throw new Error(`expected dispatch_service_plans.renewal_lead_days integer NULL, found ${JSON.stringify(col)}`);
}
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'dispatch_plan_visits'
    ORDER BY ordinal_position
`;
if (cols.length !== 11) throw new Error(`expected 11 dispatch_plan_visits columns, found ${cols.length}`);
const idx = await sql`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'dispatch_plan_visits' ORDER BY indexname
`;
const uq = idx.find(i => i.indexname === 'dispatch_plan_visits_occurrence_uq');
if (!uq || !/UNIQUE INDEX/.test(uq.indexdef) || !/\(org_id, customer_id, plan_id, due_date\)/.test(uq.indexdef)) {
    throw new Error(`expected the unique occurrence index, found ${JSON.stringify(idx)}`);
}
const rows = await sql`SELECT count(*)::int AS n FROM "dispatch_plan_visits"`;
console.log('dispatch_service_plans.renewal_lead_days:', col[0].data_type, 'nullable=' + col[0].is_nullable);
console.log('dispatch_plan_visits columns:');
for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
for (const i of idx) console.log('index:', i.indexdef);
console.log('rows:', rows[0].n);
console.log('OK — column and table present and verified.');
