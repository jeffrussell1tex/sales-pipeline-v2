// One-shot, ADDITIVE-ONLY, idempotent DDL: one settings row per org, and one org per
// web-form token (state §0.161 — the cross-org audit). Mirrors db/schema.ts. Safe on the
// shared Neon main branch: CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS only — no DROP,
// no ALTER, no row touched; a second run is a no-op.
//
// WHY. §6.0a7 recorded `settings_org_id_uniq`, applied in the Neon SQL editor; on 2 Oct
// neither database had it, and db/schema.ts had never declared it. Without it a second
// settings row per org can be inserted (the backup restore did), and two orgs can carry
// one web-form token, which the public intake then resolved to whichever row came first.
//
// It REFUSES to build an index the data would break: it counts duplicate org ids and
// duplicate tokens first (read-only) and stops on any. It prints counts, never a token.
// Without --apply it only checks.
//
// Guide §18c: DATABASE FIRST, THEN CODE.
//
//     node --env-file=.env db/apply-settings-uniqueness.mjs                 (APP database: checks only)
//     node --env-file=.env db/apply-settings-uniqueness.mjs --apply         (APP database — shared by dev and production)
//     node --env-file=.env db/apply-settings-uniqueness.mjs --test --apply  (TEST database)
import { neon } from '@neondatabase/serverless';

const useTest = process.argv.includes('--test');
const apply = process.argv.includes('--apply');
const url = (useTest ? process.env.DATABASE_URL_TEST : process.env.NETLIFY_DATABASE_URL || '').trim();
if (!url) throw new Error(`${useTest ? 'DATABASE_URL_TEST' : 'NETLIFY_DATABASE_URL'} is not set — run with node --env-file=.env`);
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('the database URL does not look like a postgres URL');
console.log('target:', new URL(url).host, useTest ? '(TEST database)' : '(APP database — shared by dev and production)', apply ? '— APPLY' : '— checks only (no --apply)');

const sql = neon(url);
const INDEXES = [
    { name: 'settings_org_id_uniq',          ddl: 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS settings_org_id_uniq ON settings (org_id)' },
    { name: 'settings_web_to_lead_token_uq', ddl: "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS settings_web_to_lead_token_uq ON settings ((extra->'webToLead'->>'token'))" },
];

const indexesNow = async () => sql.query(`
    SELECT c.relname AS name, i.indisunique AS unique, i.indisvalid AS valid, pg_get_indexdef(i.indexrelid) AS def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'settings'::regclass ORDER BY c.relname`);

// ── checks (read-only) ──
const [{ n: rows }] = await sql.query('SELECT count(*)::int AS n FROM settings');
const dupOrgs = await sql.query('SELECT count(*)::int AS n FROM (SELECT org_id FROM settings GROUP BY org_id HAVING count(*) > 1) d');
const dupTokens = await sql.query("SELECT count(*)::int AS n FROM (SELECT extra->'webToLead'->>'token' FROM settings WHERE extra->'webToLead'->>'token' IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d");
const [{ n: withToken }] = await sql.query("SELECT count(*)::int AS n FROM settings WHERE extra->'webToLead'->>'token' IS NOT NULL");
console.log(`settings rows: ${rows} · org ids held by more than one row: ${dupOrgs[0].n} · rows holding a form token: ${withToken} · tokens held by more than one row: ${dupTokens[0].n}`);
console.log('indexes before:');
for (const i of await indexesNow()) console.log(`  ${i.name}  unique=${i.unique} valid=${i.valid}`);
if (dupOrgs[0].n || dupTokens[0].n) throw new Error('duplicates present — refusing to build a unique index over them. Nothing written.');
if (!apply) { console.log('checks only — nothing written. Pass --apply to build the indexes.'); process.exit(0); }

// ── apply ──
for (const { ddl } of INDEXES) await sql.query(ddl);

// Read back what the database actually holds — the verification is the point. A
// CONCURRENTLY build that failed leaves an INVALID index behind; that is a failure here.
const after = await indexesNow();
console.log('indexes after:');
for (const i of after) console.log(`  ${i.name}  unique=${i.unique} valid=${i.valid}  ${i.def}`);
for (const { name } of INDEXES) {
    const got = after.find(i => i.name === name);
    if (!got) throw new Error(`${name} is missing after the apply`);
    if (!got.unique || !got.valid) throw new Error(`${name} is present but unique=${got.unique} valid=${got.valid} — drop it by hand and run again`);
}
console.log('OK — both unique indexes present, valid and verified.');
