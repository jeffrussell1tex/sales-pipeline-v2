// tests/user-identity-schema.test.mjs
//
// Source-level guards on the users table's identity contract.
//
// Reads db/schema.ts AS TEXT, deliberately — the schema is TypeScript and loads
// only under `tsx`, which would strand these in test:int: a suite that needs a
// database, is not part of `npm test`, and has been broken at import before
// without anyone noticing (0.25). Same reasoning as ownership-registry.test.mjs.
//
// These pin decisions that are invisible at runtime until they are already
// wrong. A global unique on email does not fail on the org that owns the
// address — it fails on the SECOND org, in production, at invite time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '..', 'db', 'schema.ts'), 'utf8');

// The users table block, from its opening to its closing paren.
const usersBlock = (() => {
    const start = schema.indexOf("export const users = pgTable('users'");
    assert.notEqual(start, -1, "could not find the users pgTable block in db/schema.ts");
    const end = schema.indexOf(']);', start);
    assert.notEqual(end, -1, "could not find the end of the users pgTable block");
    return schema.slice(start, end);
})();

test('users.email is NOT globally unique', () => {
    const emailLine = usersBlock.split('\n').find((l) => l.trim().startsWith('email:'));
    assert.ok(emailLine, 'no email column found on users');
    assert.ok(
        !emailLine.includes('.unique()'),
        'users.email carries a global .unique(). That limits an email address to ONE ' +
        'organization across every customer: the second org to invite that person is ' +
        'refused, and the error message confirms to them that the address exists ' +
        'elsewhere. Use uniqueIndex(orgId, email) instead.'
    );
});

test('users has a clerkUserId column, separate from the primary key', () => {
    assert.ok(
        /clerkUserId:\s*text\('clerk_user_id'\)/.test(usersBlock),
        'users.clerkUserId is missing. Clerk identity must live in its own column ' +
        'so that users.id can stay permanent — the id used to be overwritten with ' +
        'the Clerk id when an invited user accepted.'
    );
    assert.ok(
        !/clerkUserId:[^\n]*primaryKey/.test(usersBlock),
        'clerkUserId must not be the primary key. Clerk ids change (production ' +
        'migration, provider change); a primary key must not.'
    );
});

test('users has per-org UNIQUE indexes on email and clerkUserId', () => {
    // Asserts the CONSTRUCTOR, not the name.
    //
    // The first version of this checked only that the string 'users_org_email_uq'
    // appeared in the block. Changing uniqueIndex(...) to index(...) leaves the
    // name untouched, so the index would enforce NOTHING while keeping a name
    // that says it does -- and this test would still pass. The mutation harness
    // reported it SURVIVED, which is the only reason it was caught.
    //
    // Same trap as the migration itself: a plain index with a unique-sounding
    // name looks identical in pg_indexes until you read indisunique. A test that
    // cannot distinguish enforcement from naming is not coverage.
    for (const idx of ['users_org_email_uq', 'users_org_clerk_uq']) {
        assert.ok(
            usersBlock.includes(`uniqueIndex('${idx}')`),
            `users is missing uniqueIndex('${idx}'). Note the check is for ` +
            `uniqueIndex specifically -- a plain index('${idx}') has the right ` +
            `name and enforces nothing, which is the failure mode this guards.`
        );
    }
});

test('no Netlify function assigns users.id from a Clerk identity', () => {
    // The specific defect: `.set({ id: userId, ... })` in users.mjs, which
    // rewrote the primary key at invite acceptance. Cheap to state, and it is
    // the one line that would silently undo this whole batch if it came back.
    const files = ['users.mjs', 'users-sync.mjs'];
    for (const f of files) {
        const src = readFileSync(join(here, '..', 'netlify', 'functions', f), 'utf8');
        assert.ok(
            !/\bid:\s*clerkUserId\b/.test(src) && !/\bset\(\{\s*\n?\s*id:\s*userId\b/.test(src),
            `${f} assigns users.id from a Clerk id. The roster id is app-owned and ` +
            `permanent; link via clerkUserId instead.`
        );
    }
});
