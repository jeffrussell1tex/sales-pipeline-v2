// One-shot, ADDITIVE-ONLY, idempotent DDL for equipment reservations (state
// §0.116): one nullable jsonb column on dispatch_jobs. Mirrors db/schema.ts
// exactly. Safe on the shared Neon main branch: ADD COLUMN IF NOT EXISTS only —
// no DROP, no type change, and a second run is a no-op.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that reads the column, and against the TEST database
// before test:int:
//
//     node --env-file=.env db/apply-assigned-equipment.mjs
//     node --env-file=.env db/apply-assigned-equipment.mjs --test
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)');

const sql = neon(url);

// assigned_equipment_ids: the specific dispatch_equipment units reserved for
// this job when it was scheduled — one per required KIND in equipment_ids,
// picked from the units of that category that are in service and not reserved
// by an overlapping job the same day. Null/[] on an unscheduled job; the jobs
// function clears it whenever a job's status goes back to 'unscheduled'.
await sql`ALTER TABLE "dispatch_jobs" ADD COLUMN IF NOT EXISTS "assigned_equipment_ids" jsonb`;

// Read back what the database actually holds — the verification is the point.
const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'dispatch_jobs' AND column_name = 'assigned_equipment_ids'
`;
if (cols.length !== 1) throw new Error(`expected the new dispatch_jobs column, found ${JSON.stringify(cols)}`);
if (cols[0].is_nullable !== 'YES') throw new Error('assigned_equipment_ids must be nullable');
if (cols[0].data_type !== 'jsonb') throw new Error(`assigned_equipment_ids must be jsonb, found ${cols[0].data_type}`);
console.log(`  dispatch_jobs.${cols[0].column_name}  ${cols[0].data_type}  nullable=${cols[0].is_nullable}`);
console.log('OK — column present and verified.');
