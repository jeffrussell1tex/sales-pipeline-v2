// tests/itest-targets-test-db.test.mjs
//
// Every integration suite points the db client at DATABASE_URL_TEST before
// anything imports db/index.ts — and refuses to run without it (state §0.145).
//
// WHY: db/index.ts instantiates the Neon client at import from
// NETLIFY_DATABASE_URL. Eighteen suites reassigned it from DATABASE_URL_TEST as
// their first statement; tests/integration/job-heartbeat.itest.mjs did not. On
// CI (no .env) the client threw and the integration job was red on every run
// from 13 Sep; on a machine with .env — where NETLIFY_DATABASE_URL is the
// APPLICATION database, the main branch dev and prod share — that suite ran
// its deletes and writes against live data. The schema guard could not tell:
// the app database has every column it checks. Source scan (§18b23): the two
// lines, in this order, before the first import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../tests/integration/', import.meta.url);
const GUARD = "if (!process.env.DATABASE_URL_TEST) {";
const REDIRECT = 'process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;';

test('every *.itest.mjs refuses to run without DATABASE_URL_TEST and redirects NETLIFY_DATABASE_URL to it before its first import', () => {
    const suites = readdirSync(DIR).filter(f => f.endsWith('.itest.mjs')).sort();
    assert.ok(suites.length >= 19, `expected the nineteen suites, found ${suites.length}`);
    for (const f of suites) {
        const s = readFileSync(new URL(f, DIR), 'utf8');
        const guardAt = s.indexOf(GUARD), redirectAt = s.indexOf(REDIRECT);
        assert.ok(guardAt > -1, `${f}: no DATABASE_URL_TEST refusal`);
        assert.ok(redirectAt > guardAt, `${f}: NETLIFY_DATABASE_URL is not redirected after the refusal`);
        const firstImport = s.search(/^\s*import\s/m);
        assert.ok(firstImport > -1 && redirectAt < firstImport, `${f}: the redirect must come before the first import (db/index.ts reads the URL at import)`);
    }
});

test('the package script names every suite in the directory — a suite the script forgets never runs on CI', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const named = new Set((pkg.scripts['test:int'].match(/tests\/integration\/[a-z-]+\.itest\.mjs/g) || []).map(p => p.slice('tests/integration/'.length)));
    for (const f of readdirSync(DIR).filter(f => f.endsWith('.itest.mjs'))) assert.ok(named.has(f), `${f} is not in npm run test:int`);
});
