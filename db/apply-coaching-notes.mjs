// One-shot, ADDITIVE-ONLY, idempotent DDL for coaching_notes and
// users.team_joined_at (state §0.82, handoff item 17). Mirrors db/schema.ts
// exactly. Safe on the shared Neon main branch: CREATE ... IF NOT EXISTS and
// ALTER TABLE ... ADD COLUMN IF NOT EXISTS (nullable, no default rewrite) —
// no DROP, no type change, and a second run is a no-op.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that reads either object, and against the TEST
// database before test:int:
//
//     node --env-file=.env db/apply-coaching-notes.mjs
//     node --env-file=.env db/apply-coaching-notes.mjs --test
//
// (drizzle-kit push was deliberately not used, for the reason
// apply-lead-claim-requests.mjs gives: push diffs the WHOLE schema against a
// database that has also been touched by hand, and that diff surface is where
// destructive surprises live. This script's blast radius is one CREATE TABLE,
// one CREATE INDEX and one nullable ADD COLUMN, readable above their execution.)
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

await sql`
    CREATE TABLE IF NOT EXISTS "coaching_notes" (
        "id"            text PRIMARY KEY,
        "org_id"        text NOT NULL,
        "author_id"     text NOT NULL,
        "author_name"   varchar(255),
        "text"          text NOT NULL,
        "date"          varchar(20) NOT NULL,
        "recipient_ids" jsonb DEFAULT '[]',
        "team_id"       text,
        "read_by"       jsonb DEFAULT '{}',
        "legacy"        boolean NOT NULL DEFAULT false,
        "created_at"    timestamp NOT NULL DEFAULT now(),
        "updated_at"    timestamp NOT NULL DEFAULT now()
    )
`;
await sql`
    CREATE INDEX IF NOT EXISTS "coaching_notes_org_id_idx"
        ON "coaching_notes" ("org_id")
`;
await sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_joined_at" timestamp
`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'coaching_notes'
    ORDER BY ordinal_position
`;
const idx = await sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'coaching_notes'
`;
const userCol = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'team_joined_at'
`;
if (cols.length !== 12) throw new Error(`expected 12 coaching_notes columns, found ${cols.length}`);
if (userCol.length !== 1) throw new Error('users.team_joined_at is missing after the ALTER');
if (userCol[0].is_nullable !== 'YES') throw new Error('users.team_joined_at must be nullable');
console.log('coaching_notes columns:');
for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
console.log('indexes:', idx.map(i => i.indexname).join(', '));
console.log(`users.team_joined_at: ${userCol[0].data_type} nullable=${userCol[0].is_nullable}`);
console.log('OK — table, index and column present and verified.');
