// One-shot, ADDITIVE-ONLY, idempotent DDL for the Price Book's "Custom / Variable Price" (state §0.242; the save
// cleanup batch, docs/design/save-cleanup — Jeff, 10 Nov: "Add the column (Recommended)"). Mirrors db/schema.ts
// exactly. Safe on the shared Neon main branch: ALTER TABLE ... ADD COLUMN IF NOT EXISTS, nullable, no default
// rewrite — no DROP, no type change, no row touched, and a second run is a no-op. Code that does not know the column
// (prod before the ship) is unaffected: it never names it.
//
//   products.custom_price  boolean  the product's price is entered on each quote (none = a list price)
//
// Guide §18c: DATABASE FIRST, THEN CODE. The TEST database before test:int; the APP database before any code that
// names the column runs anywhere (local netlify dev included). Without --apply it only checks.
//
//     node --env-file=.env db/apply-product-custom-price.mjs --test --apply   (TEST database)
//     node --env-file=.env db/apply-product-custom-price.mjs                  (APP database: checks only)
//     node --env-file=.env db/apply-product-custom-price.mjs --apply          (APP database — shared by dev and production)
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
const column = async () => sql`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'custom_price'`;

const before = await column();
const [{ n: products }] = await sql`SELECT count(*)::int AS n FROM "products"`;
console.log(`products rows: ${products} · custom_price present: ${before.length ? 'yes' : 'no'}`);
if (!apply) {
    console.log(before.length ? 'checks only — the column is already there; nothing to do.'
        : 'checks only — nothing written. --apply runs one ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "custom_price" boolean.');
} else {
    await applyIt();
}

// No process.exit with the driver's handles open (a Windows libuv assertion on exit) — the script ends by itself.
async function applyIt() {
    await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "custom_price" boolean`;
    // Read back what the database actually holds — the verification is the point.
    const [got] = await column();
    if (!got) throw new Error('products.custom_price is missing after the ALTER');
    if (got.data_type !== 'boolean') throw new Error(`products.custom_price is ${got.data_type}, not boolean`);
    if (got.is_nullable !== 'YES') throw new Error('products.custom_price is not nullable — the change must be additive and nullable');
    if (got.column_default != null) throw new Error(`products.custom_price has a default (${got.column_default}) — the design names none`);
    const [{ n: held }] = await sql`SELECT count(*)::int AS n FROM "products" WHERE "custom_price" IS NOT NULL`;
    console.log(`  products.custom_price  ${got.data_type}  nullable=${got.is_nullable}  · rows holding a value: ${held}`);
    console.log('OK — column present and verified.');
}
