// SUPERSEDED (state §0.100, handoff item 34): job_heartbeats was keyed by job
// alone and dev and prod share the database, so one row served both sites. The
// live table is site_job_heartbeats (db/apply-site-job-heartbeats.mjs). This
// script is kept as the record of the legacy table until Jeff drops it by hand
// after the eleventh ship; do not run it.
//
// One-shot, ADDITIVE-ONLY, idempotent DDL for job_heartbeats (state §0.98,
// handoff item 32). Mirrors db/schema.ts exactly. Safe on the shared Neon main
// branch: CREATE TABLE IF NOT EXISTS only — no DROP, no ALTER, and a second run
// is a no-op.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that writes the table, and against the TEST database
// before test:int:
//
//     node --env-file=.env db/apply-job-heartbeats.mjs
//     node --env-file=.env db/apply-job-heartbeats.mjs --test
//
// (Not drizzle-kit push, for the reason apply-coaching-notes.mjs gives: push
// diffs the WHOLE schema against a database that has also been touched by
// hand. This script's blast radius is one CREATE TABLE, readable below.)
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

await sql`
    CREATE TABLE IF NOT EXISTS "job_heartbeats" (
        "job"              text PRIMARY KEY,
        "schedule"         text,
        "last_started_at"  timestamp,
        "last_finished_at" timestamp,
        "last_status"      varchar(10),
        "last_error"       text,
        "last_summary"     jsonb,
        "ok_count"         integer NOT NULL DEFAULT 0,
        "error_count"      integer NOT NULL DEFAULT 0,
        "updated_at"       timestamp NOT NULL DEFAULT now()
    )
`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'job_heartbeats'
    ORDER BY ordinal_position
`;
if (cols.length !== 10) throw new Error(`expected 10 job_heartbeats columns, found ${cols.length}`);
const rows = await sql`SELECT count(*)::int AS n FROM "job_heartbeats"`;
console.log('job_heartbeats columns:');
for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
console.log('rows:', rows[0].n);
console.log('OK — table present and verified.');
