// tests/org-scoping.test.mjs
// Static guard: scans every netlify/functions/*.mjs and fails if a tenant-scoped
// mutation isn't org-scoped. Catches the cross-tenant class (the exact bug class
// behind the cross-tenant write fix and the unscoped `clear` delete) — with zero
// infra, on plain `node --test`. It is a source check, not a behavioral test, so
// it catches "forgot to scope by org", not every semantic mistake; pair it with
// the DB integration suite for behavioral proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'functions');

// Files that legitimately don't touch tenant tables (pure helpers, scoring engine, mailers…)
const SKIP = new Set(['auth.mjs', '_lib.mjs', 'score-lead.mjs', 'send-email.mjs', 'send-sms.mjs', 'crypto.mjs', 'webhooks.mjs', 'dispatch-automations.mjs', 'quote-pdf.mjs']);

// Extract the full JS statement starting at `start` (balances () [] {} and skips
// '…' "…" `…` strings), stopping at the first top-level ';'.
function statementAt(src, start) {
    let depth = 0, i = start, q = null;
    for (; i < src.length; i++) {
        const c = src[i];
        if (q) { if (c === q && src[i - 1] !== '\\') q = null; continue; }
        if (c === "'" || c === '"' || c === '`') { q = c; continue; }
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (c === ';' && depth <= 0) break;
    }
    return src.slice(start, i + 1);
}

function findViolations(file, src) {
    const v = [];
    const lineOf = (idx) => src.slice(0, idx).split('\n').length;
    // db.delete( and db.update( must carry an org scope in the same statement.
    const re = /db\.(delete|update)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
        const stmt = statementAt(src, m.index);
        if (!/orgId/.test(stmt)) {
            v.push(`${file}:${lineOf(m.index)} — db.${m[1]}() is NOT org-scoped (no orgId in the statement)`);
        }
    }
    // onConflictDoUpdate must gate the update with setWhere on orgId (the cross-tenant write bug).
    const re2 = /onConflictDoUpdate\s*\(/g;
    while ((m = re2.exec(src))) {
        const stmt = statementAt(src, m.index);
        if (!/setWhere[\s\S]*orgId/.test(stmt)) {
            v.push(`${file}:${lineOf(m.index)} — onConflictDoUpdate without setWhere on orgId (cross-tenant overwrite risk)`);
        }
    }
    return v;
}

test('every tenant mutation in netlify/functions is org-scoped', () => {
    const files = readdirSync(FN_DIR).filter(f => f.endsWith('.mjs') && !SKIP.has(f));
    assert.ok(files.length > 0, 'expected to find function files to scan');

    const violations = [];
    for (const f of files) {
        violations.push(...findViolations(f, readFileSync(join(FN_DIR, f), 'utf8')));
    }

    assert.deepEqual(
        violations, [],
        `\nUnscoped tenant mutations found (each can read/write/delete across orgs):\n  ${violations.join('\n  ')}\n`,
    );
});
