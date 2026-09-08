// One-shot, ADDITIVE-ONLY, idempotent DDL for site_job_heartbeats (state
// §0.100, handoff item 34). Mirrors db/schema.ts exactly. Safe on the shared
// Neon main branch: CREATE TABLE IF NOT EXISTS only — no DROP, no ALTER, and a
// second run is a no-op.
//
// WHY A NEW TABLE and not a column on job_heartbeats: that table is keyed by
// `job` alone, and dev and prod share the database, so one row served both
// sites and said the job ran SOMEWHERE. The fix is `site` in the key — and
// swapping a live table's primary key is neither additive nor nullable. The
// moment a composite key replaced `(job)`, the OLD code still running on the
// other site would have no `(job)` unique constraint left for its
// `ON CONFLICT (job)` and its `UPDATE … WHERE job = x` would write every
// site's row. A new table overlaps nothing: the old code keeps stamping
// job_heartbeats until the ship, the new code stamps this one, and
// job_heartbeats is dropped later by hand (guide §18c).
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that writes the table, and against the TEST database
// before test:int:
//
//     node --env-file=.env db/apply-site-job-heartbeats.mjs
//     node --env-file=.env db/apply-site-job-heartbeats.mjs --test
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

await sql`
    CREATE TABLE IF NOT EXISTS "site_job_heartbeats" (
        "site"             text NOT NULL,
        "job"              text NOT NULL,
        "schedule"         text,
        "last_started_at"  timestamp,
        "last_finished_at" timestamp,
        "last_status"      varchar(10),
        "last_error"       text,
        "last_summary"     jsonb,
        "ok_count"         integer NOT NULL DEFAULT 0,
        "error_count"      integer NOT NULL DEFAULT 0,
        "updated_at"       timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "site_job_heartbeats_pk" PRIMARY KEY ("site", "job")
    )
`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'site_job_heartbeats'
    ORDER BY ordinal_position
`;
if (cols.length !== 11) throw new Error(`expected 11 site_job_heartbeats columns, found ${cols.length}`);
const pk = await sql`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'site_job_heartbeats'::regclass AND contype = 'p'
`;
if (pk.length !== 1 || pk[0].def !== 'PRIMARY KEY (site, job)') throw new Error(`expected PRIMARY KEY (site, job), found ${JSON.stringify(pk)}`);
const rows = await sql`SELECT count(*)::int AS n FROM "site_job_heartbeats"`;
console.log('site_job_heartbeats columns:');
for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
console.log('primary key:', pk[0].def);
console.log('rows:', rows[0].n);
console.log('OK — table present and verified.');
