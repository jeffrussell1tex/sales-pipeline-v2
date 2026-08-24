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
