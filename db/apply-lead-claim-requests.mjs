// One-shot, ADDITIVE-ONLY, idempotent DDL for lead_claim_requests (§0.58).
// Mirrors db/schema.ts exactly. Safe on the shared Neon main branch: only
// CREATE ... IF NOT EXISTS — no ALTER, no DROP, touches no existing table,
// and a second run is a no-op (already verified against DATABASE_URL_TEST,
// 2 Sep 2026).
//
// Run from the repo root, against the APP database:
//
//     node --env-file=.env db/apply-lead-claim-requests.mjs
//
// (drizzle-kit push was deliberately not used: push diffs the WHOLE schema
// against the live DB, and on a database that has also been touched via the
// Neon SQL editor that diff surface is where destructive surprises live.
// This script's blast radius is exactly one CREATE TABLE and one CREATE
// INDEX, readable above their execution.)
import { neon } from '@neondatabase/serverless';

const url = (process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error('NETLIFY_DATABASE_URL is not set — run with node --env-file=.env');
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('NETLIFY_DATABASE_URL does not look like a postgres URL');

const sql = neon(url);

await sql`
    CREATE TABLE IF NOT EXISTS "lead_claim_requests" (
        "id"           text PRIMARY KEY,
        "org_id"       text NOT NULL,
        "lead_id"      text NOT NULL,
        "requester_id" text NOT NULL,
        "status"       varchar(20) NOT NULL DEFAULT 'pending',
        "note"         text,
        "resolved_by"  text,
        "resolved_at"  timestamp,
        "created_at"   timestamp NOT NULL DEFAULT now(),
        "updated_at"   timestamp NOT NULL DEFAULT now()
    )
`;
await sql`
    CREATE INDEX IF NOT EXISTS "lead_claim_requests_org_id_idx"
        ON "lead_claim_requests" ("org_id")
`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'lead_claim_requests'
    ORDER BY ordinal_position
`;
const idx = await sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'lead_claim_requests'
`;
if (cols.length !== 10) throw new Error(`expected 10 columns, found ${cols.length}`);
console.log('lead_claim_requests columns:');
for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
console.log('indexes:', idx.map(i => i.indexname).join(', '));
console.log('OK — table present and verified.');
