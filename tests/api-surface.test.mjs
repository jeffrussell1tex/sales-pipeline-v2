// The §0.56 open question, closed 2 Sep and PINNED: workspace API keys cannot
// reach any mutating endpoint. Three facts make that true, each asserted here
// against source so a future change forces a deliberate decision instead of a
// quiet widening:
//
//   1. public-api.mjs — the ONLY key-authenticated surface — refuses every
//      method but GET before the key is even parsed.
//   2. auth.mjs verifyAuth accepts ONLY Clerk JWTs: no key branch, no
//      fallback, so a key presented to any Tier-1 endpoint 401s.
//   3. No other function consults the apiKeys table at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const fnDir = new URL('../netlify/functions/', import.meta.url);
const srcOf = (name) => readFileSync(new URL(name, fnDir), 'utf8');
const codeOnly = (src) =>
    src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

test('public-api refuses every method but GET, before key parsing', () => {
    const code = codeOnly(srcOf('public-api.mjs'));
    assert.ok(code.includes("if (event.httpMethod !== 'GET') {"),
        'the method gate must be a strict not-GET refusal');
    // Anchor on the extraction CODE, not the string 'spt_live_' — the file's
    // JSDoc header mentions the key format and survives the line-comment strip.
    const gateIdx = code.indexOf("if (event.httpMethod !== 'GET') {");
    const keyIdx  = code.indexOf('authHeader.match');
    assert.ok(gateIdx !== -1 && keyIdx !== -1 && gateIdx < keyIdx,
        'the method gate must sit ABOVE key extraction — a write is refused before any key is honored');
});

test('verifyAuth has no API-key branch — Clerk JWTs are the only currency', () => {
    const code = codeOnly(srcOf('auth.mjs'));
    assert.equal(/spt_live_|apiKeys|keyHash/.test(code), false,
        'an API-key path in verifyAuth would open every Tier-1 mutating endpoint to keys');
    assert.ok(code.includes('verifyToken(token'),
        'verifyAuth must still verify through Clerk');
});

test('only api-keys.mjs and public-api.mjs touch the apiKeys table', () => {
    const offenders = [];
    for (const file of readdirSync(fnDir)) {
        if (!file.endsWith('.mjs')) continue;
        if (file === 'api-keys.mjs' || file === 'public-api.mjs') continue;
        const code = codeOnly(srcOf(file));
        // The schema import is the capability; anthropicApiKey etc. are
        // unrelated vendor keys and do not match this pattern.
        if (/\bapiKeys\b/.test(code)) offenders.push(file);
    }
    assert.deepEqual(offenders, [],
        `a new consumer of the apiKeys table widens the key-authenticated surface — decide that deliberately:\n  ${offenders.join('\n  ')}`);
});
