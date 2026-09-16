// One-shot, ADDITIVE-ONLY, idempotent DDL for quote → job → invoice (state
// §0.149): one nullable column on dispatch_jobs and the new invoices table.
// Mirrors db/schema.ts exactly. Safe on the shared Neon main branch: ADD COLUMN
// IF NOT EXISTS and CREATE ... IF NOT EXISTS only — no DROP, no type change,
// and a second run is a no-op.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run this against the APP database
// before deploying code that reads the column or the table, and against the
// TEST database before test:int:
//
//     node --env-file=.env db/apply-invoices.mjs
//     node --env-file=.env db/apply-invoices.mjs --test
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

// The quote a job was made from. Written only by quote-to-job.mjs.
await sql`ALTER TABLE "dispatch_jobs" ADD COLUMN IF NOT EXISTS "quote_id" text`;
await sql`CREATE INDEX IF NOT EXISTS "dispatch_jobs_org_quote_idx" ON "dispatch_jobs" ("org_id", "quote_id")`;

// The invoice a job produces. Lines are a jsonb snapshot; the quickbooks_*
// columns wait for the export.
await sql`
    CREATE TABLE IF NOT EXISTS "invoices" (
        "id"                     text PRIMARY KEY,
        "org_id"                 text NOT NULL,
        "invoice_number"         varchar(50) NOT NULL,
        "job_id"                 text,
        "quote_id"               text,
        "customer_id"            text,
        "account_id"             text,
        "opportunity_id"         text,
        "status"                 varchar(20) NOT NULL DEFAULT 'draft',
        "issue_date"             varchar(20),
        "due_date"               varchar(20),
        "payment_terms"          varchar(100),
        "customer_po_number"     varchar(100),
        "line_items"             jsonb NOT NULL DEFAULT '[]',
        "subtotal"               numeric(12, 2),
        "tax_rate"               numeric(5, 2),
        "tax_amount"             numeric(12, 2),
        "total"                  numeric(12, 2),
        "amount_paid"            numeric(12, 2),
        "paid_at"                varchar(20),
        "issued_at"              timestamp,
        "voided_at"              timestamp,
        "notes"                  text,
        "quickbooks_id"          text,
        "quickbooks_realm_id"    text,
        "quickbooks_synced_at"   timestamp,
        "quickbooks_sync_error"  text,
        "created_by"             varchar(255),
        "created_at"             timestamp NOT NULL DEFAULT now(),
        "updated_at"             timestamp NOT NULL DEFAULT now()
    )
`;
await sql`CREATE INDEX IF NOT EXISTS "invoices_org_id_idx" ON "invoices" ("org_id")`;
await sql`CREATE INDEX IF NOT EXISTS "invoices_org_job_idx" ON "invoices" ("org_id", "job_id")`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_number_uq" ON "invoices" ("org_id", "invoice_number")`;

// Read back what the database actually holds — the verification is the point.
const col = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'dispatch_jobs' AND column_name = 'quote_id'
`;
if (col.length !== 1 || col[0].data_type !== 'text' || col[0].is_nullable !== 'YES') {
    throw new Error(`expected dispatch_jobs.quote_id text NULL, found ${JSON.stringify(col)}`);
}
const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'invoices'
    ORDER BY ordinal_position
`;
if (cols.length !== 30) throw new Error(`expected 30 invoices columns, found ${cols.length}`);
const idx = await sql`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'invoices' ORDER BY indexname
`;
const uq = idx.find(i => i.indexname === 'invoices_org_number_uq');
if (!uq || !/UNIQUE INDEX/.test(uq.indexdef) || !/\(org_id, invoice_number\)/.test(uq.indexdef)) {
    throw new Error(`expected the unique (org_id, invoice_number) index, found ${JSON.stringify(idx)}`);
}
const jidx = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'dispatch_jobs' AND indexname = 'dispatch_jobs_org_quote_idx'`;
if (jidx.length !== 1) throw new Error('expected dispatch_jobs_org_quote_idx');
const rows = await sql`SELECT count(*)::int AS n FROM "invoices"`;
console.log('dispatch_jobs.quote_id:', col[0].data_type, 'nullable=' + col[0].is_nullable);
console.log('index:', jidx[0].indexdef);
console.log('invoices columns:');
for (const c of cols) console.log(`  ${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
for (const i of idx) console.log('index:', i.indexdef);
console.log('rows:', rows[0].n);
console.log('OK — column and table present and verified.');
