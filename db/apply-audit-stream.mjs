// One-shot, ADDITIVE-ONLY, idempotent DDL for audit_stream_destinations
// (state §0.87). Mirrors db/schema.ts exactly. Safe on the shared Neon main
// branch: CREATE ... IF NOT EXISTS only — no DROP, no ALTER, and a second run
// is a no-op.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that reads the table, and against the TEST database
// before test:int:
//
//     node --env-file=.env db/apply-audit-stream.mjs
//     node --env-file=.env db/apply-audit-stream.mjs --test
//
// (Not drizzle-kit push, for the reason apply-coaching-notes.mjs gives: push
// diffs the WHOLE schema against a database that has also been touched by
// hand. This script's blast radius is one CREATE TABLE and one CREATE INDEX,
// readable above their execution.)
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

await sql`
    CREATE TABLE IF NOT EXISTS "audit_stream_destinations" (
        "id"                text PRIMARY KEY,
        "org_id"            text NOT NULL,
        "name"              varchar(120) NOT NULL,
        "url"               text NOT NULL,
        "fmt"               varchar(10) NOT NULL DEFAULT 'JSON',
        "secret"            text NOT NULL,
        "secret_hint"       varchar(8),
        "paused"            boolean NOT NULL DEFAULT false,
        "failures"          integer NOT NULL DEFAULT 0,
        "last_status"       integer,
        "last_error"        text,
        "last_attempt_at"   timestamp,
        "last_delivered_at" timestamp,
        "delivered_count"   integer NOT NULL DEFAULT 0,
        "created_by"        text,
        "created_at"        timestamp NOT NULL DEFAULT now(),
        "updated_at"        timestamp NOT NULL DEFAULT now()
    )
`;
await sql`
    CREATE INDEX IF NOT EXISTS "audit_stream_destinations_org_id_idx"
        ON "audit_stream_destinations" ("org_id")
`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'audit_stream_destinations'
    ORDER BY ordinal_position
`;
const idx = await sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'audit_stream_destinations'
`;
if (cols.length !== 17) throw new Error(`expected 17 audit_stream_destinations columns, found ${cols.length}`);
if (!idx.some(i => i.indexname === 'audit_stream_destinations_org_id_idx')) throw new Error('the org_id index is missing');
console.log('audit_stream_destinations columns:');
for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
console.log('indexes:', idx.map(i => i.indexname).join(', '));
console.log('OK — table and index present and verified.');
