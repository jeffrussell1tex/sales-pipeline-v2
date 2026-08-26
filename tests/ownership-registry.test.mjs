// tests/ownership-registry.test.mjs
//
// The guard for the defect class in _ownership.mjs.
//
// contacts.mjs named `contacts.createdBy` for object-level authorization. That
// property is not on the contacts table and never has been. Drizzle resolves a
// missing property to `undefined` rather than throwing, and `undefined` then
// meant two different things in two different callers: a 500 from
// db.select({ owner: undefined }), and a SILENT AUTHORIZATION BYPASS in
// bulkUpsert, whose `if (ownerColumn)` guard simply dropped the owner from the
// projection so no row could ever be forbidden.
//
// Nothing caught it. Every unit test and every manual session ran as Admin,
// which skips the ownership branch entirely, and a wrong property name is
// perfectly valid JavaScript.
//
// This test reads db/schema.ts as TEXT rather than importing it. The schema is
// TypeScript and loads only under tsx, which would put this check in
// `npm run test:int` — a suite that needs a database, is not part of `npm test`,
// and had itself been broken at import for long enough that nobody noticed. The
// whole value here is running in the DEFAULT suite, on every change, with no
// database. Source-level assertion is the price of that, and there is precedent:
// stage-batch and org-scoping both assert against source for the same reason.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OWNER_COLUMNS, ENTITY_TABLES, ownerKeyFor, ownerColumnOf, mayMutate } from '../netlify/functions/_ownership.mjs';

const schemaSrc = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');

// Pull the property names out of one `export const <name> = pgTable('...', { ... })`
// block. The block ends at the closing brace of the column object, which is
// either `}, (t) => [` for a table with indexes or `});` for one without.
function propertiesOf(tableExport) {
    const start = schemaSrc.indexOf(`export const ${tableExport} = pgTable(`);
    assert.notEqual(start, -1, `db/schema.ts has no export named '${tableExport}'`);
    const rest = schemaSrc.slice(start);
    const endIdx = rest.search(/\n\}, \(t\) =>|\n\}\);/);
    assert.notEqual(endIdx, -1, `could not find the end of the '${tableExport}' table definition`);
    const block = rest.slice(0, endIdx);
    // `    assignedRep:       varchar('assigned_rep', ...` -> assignedRep
    return new Set([...block.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1]));
}

test('every entity in OWNER_COLUMNS names a table in ENTITY_TABLES', () => {
    for (const entity of Object.keys(OWNER_COLUMNS)) {
        assert.ok(ENTITY_TABLES[entity], `'${entity}' is registered as owned but has no table mapping`);
    }
    for (const entity of Object.keys(ENTITY_TABLES)) {
        assert.ok(OWNER_COLUMNS[entity], `'${entity}' has a table mapping but no owner column`);
    }
});

test('THE GUARD — every registered owner property exists on its real table', () => {
    const missing = [];
    for (const [entity, tableExport] of Object.entries(ENTITY_TABLES)) {
        const key = OWNER_COLUMNS[entity];
        if (!propertiesOf(tableExport).has(key)) missing.push(`${entity} -> ${tableExport}.${key}`);
    }
    assert.deepEqual(missing, [], `registered owner columns that do not exist:\n  ${missing.join('\n  ')}`);
});

test('REGRESSION — contacts is owned by assignedRep, and createdBy is not a contacts column', () => {
    assert.equal(OWNER_COLUMNS.contact, 'assignedRep');
    const props = propertiesOf('contacts');
    assert.ok(props.has('assignedRep'), 'contacts must have assignedRep');
    assert.ok(!props.has('createdBy'), 'contacts has no createdBy — if it gains one, revisit the ownership rule deliberately');
});

test('REGRESSION — no endpoint reaches for contacts.createdBy in code again', () => {
    const src = readFileSync(new URL('../netlify/functions/contacts.mjs', import.meta.url), 'utf8')
        .split('\n')
        .filter(l => !l.trim().startsWith('//'))       // the fix is explained in comments
        .join('\n');
    assert.ok(!src.includes('contacts.createdBy'), 'contacts.createdBy is not a column; use ownerColumnOf(contacts, \'contact\')');
});

// ── The centralisation guard ─────────────────────────────────────────────────
//
// The registry above proves a REGISTERED column exists. It says nothing about an
// endpoint that ignores the registry and hand-rolls the check anyway -- which is
// what all six of them used to do, in eleven copies, two of which named a column
// that was not there.
//
// These read the endpoint sources. Source-level for the same reason as the rest
// of this file: the endpoints import db/index.js (TypeScript), so importing them
// would strand these checks in test:int, a suite that needs a database and had
// itself been broken at import for a fortnight without anyone noticing.

const ENDPOINTS = ['accounts', 'opportunities', 'leads', 'tasks', 'contacts', 'activities'];

const endpointSrc = (name) =>
    readFileSync(new URL(`../netlify/functions/${name}.mjs`, import.meta.url), 'utf8');

// Comments explain these defects at length and would otherwise trip every scan.
const codeOnly = (src) =>
    src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

test('THE GUARD — no endpoint hand-rolls an ownership comparison', () => {
    const offenders = [];
    for (const name of ENDPOINTS) {
        const code = codeOnly(endpointSrc(name));
        // The exact shape of the eleven copies: compare a projected owner against
        // a resolved caller name, inline, with the refusal written out longhand.
        if (/!==\s*callerName/.test(code)) offenders.push(`${name}: compares !== callerName inline`);
        if (/db\.select\(\{\s*owner:/.test(code)) offenders.push(`${name}: projects an owner itself`);
    }
    assert.deepEqual(offenders, [], `use assertOwnership():\n  ${offenders.join('\n  ')}`);
});

test('THE GUARD — no endpoint names an owner column at the call site', () => {
    // `ownerColumn: accounts.accountOwner` is a column name nothing checks
    // against the schema, and bulkUpsert's `if (ownerColumn)` turns a wrong one
    // into a silent org-wide write bypass rather than an error.
    const offenders = [];
    for (const name of ENDPOINTS) {
        for (const m of codeOnly(endpointSrc(name)).matchAll(/ownerColumn:\s*([^,\n]+)/g)) {
            if (!m[1].trim().startsWith('ownerColumnOf(')) offenders.push(`${name}: ownerColumn: ${m[1].trim()}`);
        }
    }
    assert.deepEqual(offenders, [], `resolve through the registry:\n  ${offenders.join('\n  ')}`);
});

test('THE GUARD — every assertOwnership result is actually returned', () => {
    // A gate whose answer is computed and discarded is worse than no gate: it
    // reads as protection in review and enforces nothing at runtime.
    const offenders = [];
    for (const name of ENDPOINTS) {
        const code = codeOnly(endpointSrc(name));
        for (const m of code.matchAll(/const\s+(\w+)\s*=\s*await\s+assertOwnership\(\{/g)) {
            const v = m[1];
            const after = code.slice(m.index, m.index + 600);
            if (!new RegExp(`if\\s*\\(\\s*${v}\\s*\\)\\s*return\\s+${v}\\s*;`).test(after)) {
                offenders.push(`${name}: ${v} is computed but never returned`);
            }
        }
    }
    assert.deepEqual(offenders, [], `${offenders.join('\n  ')}`);
});

test('REGRESSION — no endpoint matches users.id against a Clerk user id', () => {
    // users.id became app-owned (usr_<uuid>) in the identity split; `userId` from
    // verifyAuth is Clerk's. `eq(users.id, userId)` therefore matches NOTHING.
    //
    // It survived in two GET filters, where the failure is silent: the query runs,
    // returns no row, the rep's display name falls to null, and the visibility
    // predicate collapses to "only unassigned records". Every rep lost sight of
    // their own pipeline and their own leads, with no error anywhere. The sweep
    // that org-scoped getCallerName could not match these because they are inline
    // queries rather than calls to the helper.
    //
    // The caller is resolved in exactly one place. This asserts nobody re-rolls it.
    const offenders = [];
    for (const name of ENDPOINTS) {
        const code = codeOnly(endpointSrc(name));
        if (/eq\(\s*users\.id\s*,\s*userId\s*\)/.test(code)) {
            offenders.push(`${name}: matches users.id against the Clerk id — use getCallerName(userId, orgId)`);
        }
    }
    assert.deepEqual(offenders, [], `${offenders.join('\n  ')}`);
});

test('REGRESSION — every users lookup in an endpoint is org-scoped', () => {
    // Removing the global unique on users.email made an unscoped users query able
    // to resolve a row from another tenant. getCallerName now throws without an
    // orgId; getRepUser in opportunities.mjs did not, and its result is an EMAIL
    // ADDRESS that deal names and ARR get sent to.
    const offenders = [];
    for (const name of ENDPOINTS) {
        const code = codeOnly(endpointSrc(name));
        for (const m of code.matchAll(/\.from\(users\)\s*\r?\n?\s*\.where\(([^;]*?)\);/g)) {
            if (!/users\.orgId/.test(m[1])) offenders.push(`${name}: unscoped users lookup`);
        }
    }
    assert.deepEqual(offenders, [], `${offenders.join('\n  ')}`);
});

test('an unregistered entity throws rather than authorizing everyone', () => {
    assert.throws(() => ownerKeyFor('invoice'), /no ownership rule registered/);
});

test('a registered property missing from the table throws BY NAME, not as undefined', () => {
    // The exact shape of the contacts bug: the table object has no such key.
    assert.throws(() => ownerColumnOf({ id: {}, name: {} }, 'contact'), /does not exist on its table/);
});

test('ownerColumnOf returns the column when it is there', () => {
    const column = { name: 'assigned_rep' };
    assert.equal(ownerColumnOf({ assignedRep: column }, 'contact'), column);
});

test('policy — an owned record is refused to anyone else and allowed to its owner', () => {
    assert.equal(mayMutate({ owner: 'Karen Russell', callerName: 'Karen Russell' }), true);
    assert.equal(mayMutate({ owner: 'Other Rep',     callerName: 'Karen Russell' }), false);
});

test('policy — unassigned records are mutable, including blank and whitespace owners', () => {
    for (const owner of [null, undefined, '', '   ']) {
        assert.equal(mayMutate({ owner, callerName: 'Karen Russell' }), true, `owner ${JSON.stringify(owner)} should be unassigned`);
    }
});

test('policy — FAIL CLOSED when the caller has no resolvable name', () => {
    // getCallerName returns null on a missing roster row or a database error. A
    // caller with no name owns nothing, so an owned record must be refused —
    // never treated as "no owner, allow".
    assert.equal(mayMutate({ owner: 'Karen Russell', callerName: null }), false);
    assert.equal(mayMutate({ owner: 'Karen Russell', callerName: '' }), false);
    // ...but an unowned record is still fair game.
    assert.equal(mayMutate({ owner: null, callerName: null }), true);
});

test('policy — Admin and Manager bypass ownership entirely', () => {
    assert.equal(mayMutate({ owner: 'Other Rep', callerName: 'Karen Russell', canSeeAll: true }), true);
    assert.equal(mayMutate({ owner: 'Other Rep', callerName: null, canSeeAll: true }), true);
});

test('the two 403s stay distinguishable — ownership and role must not share a message', async () => {
    // Both refusals are 403 and the BODY is the only way to tell which check
    // fired. The delete gate depends on that difference.
    const { OWNERSHIP_FORBIDDEN } = await import('../netlify/functions/_ownership.mjs');
    const authSrc = readFileSync(new URL('../netlify/functions/auth.mjs', import.meta.url), 'utf8');
    assert.ok(authSrc.includes('Forbidden: insufficient role'), 'the role gate message moved — update this test and the delete-gate manifest');
    assert.notEqual(OWNERSHIP_FORBIDDEN, 'Forbidden: insufficient role');
});
