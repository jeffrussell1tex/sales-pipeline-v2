// One-shot, ADDITIVE-ONLY, idempotent DDL for the digest's record of what it sent (state §0.310 — Jeff, 26 Nov: "A";
// OPEN_ITEMS §4.5, left by §0.309 (a)). Mirrors db/schema.ts `digestSends` exactly. Safe on the shared Neon main
// branch: CREATE TABLE IF NOT EXISTS of a table nothing else names — no DROP, no ALTER, no row of any other table
// touched, and a second run is a no-op. Code that does not know the table (prod before the ship) is unaffected.
//
// Guide §18c: DATABASE FIRST, THEN CODE. Run it against the TEST database before test:int, and against the APP
// database before any code that names the table runs anywhere (local netlify dev included — it reads the app
// database). Without --apply it only checks and says what it would do.
//
//     node --env-file=.env db/apply-digest-sends.mjs --test --apply   (TEST database)
//     node --env-file=.env db/apply-digest-sends.mjs                  (APP database: checks only)
//     node --env-file=.env db/apply-digest-sends.mjs --apply          (APP database — shared by dev and production)
//
// (Not drizzle-kit push: it diffs the WHOLE schema against a database also touched by hand — apply-coaching-notes.mjs.)
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
const columns = async () => sql`
    SELECT column_name, data_type, character_maximum_length AS len, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'digest_sends'
    ORDER BY ordinal_position`;

const before = await columns();
console.log(`digest_sends ${before.length ? `present (${before.length} columns)` : 'absent'}`);
// Read back what the database actually holds — the verification is the point. Read only; run on both paths.
const verify = async () => {
    const after = await columns();
    const want = [['org_id', 'text', null, 'NO'], ['user_id', 'text', null, 'NO'], ['kind', 'character varying', 40, 'NO'], ['day', 'character varying', 10, 'NO'], ['sent_at', 'timestamp without time zone', null, 'NO']];
    const got = after.map((c) => [c.column_name, c.data_type, c.len, c.is_nullable]);
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`digest_sends is not as designed: ${JSON.stringify(got)}`);
    if (!/now\(\)/.test(after[4].column_default || '')) throw new Error(`sent_at's default is ${after[4].column_default}, not now()`);
    const pk = await sql`
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'digest_sends'::regclass AND contype = 'p'`;
    if (pk.length !== 1 || pk[0].def !== 'PRIMARY KEY (org_id, user_id, kind)') throw new Error(`expected PRIMARY KEY (org_id, user_id, kind), found ${JSON.stringify(pk)}`);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM "digest_sends"`;
    for (const c of after) console.log(`  ${c.column_name}  ${c.data_type}${c.len ? `(${c.len})` : ''}  nullable=${c.is_nullable}  default=${c.column_default ?? ''}`);
    console.log('primary key:', pk[0].def, '· rows:', n);
    console.log('OK — table present and verified.');
};

if (!apply) {
    if (before.length) { console.log('checks only — the table is already there; its shape:'); await verify(); }
    else console.log('checks only — nothing written. --apply runs: CREATE TABLE IF NOT EXISTS "digest_sends" (org_id, user_id, kind, day, sent_at; primary key org_id, user_id, kind)');
    process.exit(0);
}

await sql`
    CREATE TABLE IF NOT EXISTS "digest_sends" (
        "org_id"  text NOT NULL,
        "user_id" text NOT NULL,
        "kind"    varchar(40) NOT NULL,
        "day"     varchar(10) NOT NULL,
        "sent_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "digest_sends_pk" PRIMARY KEY ("org_id", "user_id", "kind")
    )
`;

await verify();
