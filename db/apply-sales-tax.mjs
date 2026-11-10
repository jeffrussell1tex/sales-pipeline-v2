// One-shot, ADDITIVE-ONLY, idempotent DDL for sales tax on quotes (state §0.241; docs/design/sales-tax, Jeff's answers
// 10 Nov — batch A). Mirrors db/schema.ts exactly. Safe on the shared Neon main branch: ALTER TABLE ... ADD COLUMN IF NOT
// EXISTS, each nullable, no default rewrite — no DROP, no type change, no row touched, and a second run is a no-op. Code
// that does not know the columns (prod before the ship) is unaffected: it never names them.
//
//   quotes.tax_rate    numeric(5,2)   the quote's rate, stored on it (a default change never reprices a sent quote)
//   quotes.tax_amount  numeric(12,2)  the tax the server works out on every save — never inside total_value
//   quotes.tax_exempt  boolean        the quote's "Tax exempt" switch
//   products.taxable   boolean        a product's Taxable switch (none = taxable)
//
// Guide §18c: DATABASE FIRST, THEN CODE. The TEST database before test:int; the APP database before any code that
// names a column runs anywhere (local netlify dev included). Without --apply it only checks.
//
//     node --env-file=.env db/apply-sales-tax.mjs --test --apply   (TEST database)
//     node --env-file=.env db/apply-sales-tax.mjs                  (APP database: checks only)
//     node --env-file=.env db/apply-sales-tax.mjs --apply          (APP database — shared by dev and production)
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
const WANT = [
    ['quotes', 'tax_rate', 'numeric', 5, 2],
    ['quotes', 'tax_amount', 'numeric', 12, 2],
    ['quotes', 'tax_exempt', 'boolean'],
    ['products', 'taxable', 'boolean'],
];
const columns = async () => sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND ((table_name = 'quotes' AND column_name IN ('tax_rate', 'tax_amount', 'tax_exempt'))
                                    OR (table_name = 'products' AND column_name = 'taxable'))`;

const before = await columns();
const [{ n: quotes }] = await sql`SELECT count(*)::int AS n FROM "quotes"`;
const [{ n: products }] = await sql`SELECT count(*)::int AS n FROM "products"`;
console.log(`quotes rows: ${quotes} · products rows: ${products} · present: ${before.map((c) => c.table_name + '.' + c.column_name).join(', ') || 'none'}`);
if (!apply) {
    console.log(before.length === WANT.length ? 'checks only — every column is already there; nothing to do.'
        : 'checks only — nothing written. --apply runs four ALTER TABLE ... ADD COLUMN IF NOT EXISTS (quotes.tax_rate numeric(5,2), quotes.tax_amount numeric(12,2), quotes.tax_exempt boolean, products.taxable boolean).');
} else {

await applyAll();
}

async function applyAll() {
await sql`ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 2)`;
await sql`ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "tax_amount" numeric(12, 2)`;
await sql`ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "tax_exempt" boolean`;
await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "taxable" boolean`;

// Read back what the database actually holds — the verification is the point.
const after = await columns();
for (const [t, c, type, p, s] of WANT) {
    const got = after.find((x) => x.table_name === t && x.column_name === c);
    if (!got) throw new Error(`${t}.${c} is missing after the ALTER`);
    if (got.data_type !== type) throw new Error(`${t}.${c} is ${got.data_type}, not ${type}`);
    if (got.is_nullable !== 'YES') throw new Error(`${t}.${c} is not nullable — the change must be additive and nullable`);
    if (got.column_default != null) throw new Error(`${t}.${c} has a default (${got.column_default}) — the design names none`);
    if (p != null && (got.numeric_precision !== p || got.numeric_scale !== s)) throw new Error(`${t}.${c} is numeric(${got.numeric_precision},${got.numeric_scale}), not (${p},${s})`);
    console.log(`  ${t}.${c}  ${got.data_type}${p != null ? `(${got.numeric_precision},${got.numeric_scale})` : ''}  nullable=${got.is_nullable}`);
}
const [{ n: held }] = await sql`SELECT count(*)::int AS n FROM "quotes" WHERE "tax_rate" IS NOT NULL OR "tax_amount" IS NOT NULL OR "tax_exempt" IS NOT NULL`;
console.log(`quotes holding any tax value: ${held}`);
console.log('OK — columns present and verified.');
}
