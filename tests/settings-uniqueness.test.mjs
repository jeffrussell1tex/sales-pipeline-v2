// tests/settings-uniqueness.test.mjs
//
// State §0.161 — the cross-org audit (2 Oct 2026): another org could save a web form's
// public token, and the intake answered for whichever row came first; the settings unique
// index the docs recorded was in neither database; a backup restore could plant a settings
// row under another org's id, with that org's token and its stored key. The token rule is
// RUN in tests/lead-intake.test.mjs; this file pins, by scan, the schema's two unique
// indexes, the restore's settings rows, the inbound guard and the apply script. The whole
// against the test database: tests/integration/web-form-token.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('db/schema.ts declares one settings row per org and one org per web-form token — so a drizzle-kit push keeps them', () => {
    const s = code(read('db/schema.ts'));
    assert.ok(s.includes("import { sql } from 'drizzle-orm';"));
    assert.ok(s.includes("    uniqueIndex('settings_org_id_uniq').on(t.orgId),"));
    assert.ok(s.includes("    uniqueIndex('settings_web_to_lead_token_uq').on(sql`(${t.extra}->'webToLead'->>'token')`),"));
    assert.ok(s.includes("    index('settings_org_id_idx').on(t.orgId),"), 'the old index stays — nothing is dropped');
});

test('db/apply-settings-uniqueness.mjs: additive only, refuses to build over duplicates, checks only without --apply, reads back', () => {
    const s = code(read('db/apply-settings-uniqueness.mjs'));
    assert.ok(s.includes("'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS settings_org_id_uniq ON settings (org_id)'"));
    assert.ok(s.includes(`"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS settings_web_to_lead_token_uq ON settings ((extra->'webToLead'->>'token'))"`));
    assert.ok(s.includes("if (dupOrgs[0].n || dupTokens[0].n) throw new Error('duplicates present — refusing to build a unique index over them. Nothing written.');"));
    const refuse = s.indexOf('if (dupOrgs[0].n || dupTokens[0].n) throw');
    assert.ok(refuse > 0 && refuse < s.indexOf('for (const { ddl } of INDEXES) await sql.query(ddl);'), 'the refusal comes before any DDL');
    assert.ok(s.includes("if (!apply) { console.log('checks only — nothing written. Pass --apply to build the indexes.'); process.exit(0); }"));
    assert.ok(s.includes('if (!got.unique || !got.valid) throw'), 'an INVALID index left by a failed CONCURRENTLY build is a failure');
    assert.ok(!/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/.test(s.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '')), 'no destructive statement outside strings');
    assert.ok(!/\bDROP\b|\bDELETE\b|\bALTER\b/.test(s.split('const INDEXES = [')[1].split('];')[0]), 'and none among the DDL');
});

test("backup.mjs: a restored settings row is the restoring org's — its id, no form token, no stored key", () => {
    const s = code(read('netlify/functions/backup.mjs'));
    assert.ok(s.includes('            const ownSettings = (rows) => rows.map(r => {'));
    assert.ok(s.includes("                if (extra.webToLead && typeof extra.webToLead === 'object') extra.webToLead = { ...extra.webToLead, token: null, enabled: false };"));
    assert.ok(s.includes('                delete extra.anthropicApiKey;'));
    assert.ok(s.includes('                return { ...r, id: orgId, extra };'), 'the id is the org\'s, never the file\'s');
    assert.ok(s.includes("try { imported += await upsertChunked(table, key === 'settings' ? ownSettings(rows) : rows); }"));
});

test('email-inbound.mjs: no BCC_SECRET, no dropbox — the POST refuses before it reads a recipient', () => {
    const s = code(read('netlify/functions/email-inbound.mjs'));
    const guard = s.indexOf('        if (!process.env.BCC_SECRET) {');
    assert.ok(guard > s.indexOf('if (!sharedOk && !verifySvix(event)) {'), 'after the signature check');
    assert.ok(guard > 0 && guard < s.indexOf('const viaUser = await userFromRecipients(toList);'), 'before any recipient is read');
    assert.ok(s.includes("            return { statusCode: 503, headers, body: JSON.stringify({ error: 'Inbound email is not configured' }) };"));
});
