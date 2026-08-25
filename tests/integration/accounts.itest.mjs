// tests/integration/accounts.itest.mjs
// Behavioral org-isolation + persistence test, run against a REAL throwaway Neon
// test branch. Two orgs (A, B); A must never read, overwrite, or delete B's data.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST set — see TESTING.md)
//
// SAFETY: refuses to run unless DATABASE_URL_TEST is set, so it can never touch
// your dev/prod database.

// 1) Point the db client at the test branch BEFORE anything imports db/index.ts.
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestSchema } from './_schema-guard.mjs';

// 2) Mock Clerk auth: the org comes from an 'x-test-org' header (no real JWT needed).
mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        // mock.module REPLACES the module wholesale, so this stub must export
        // every name the endpoint imports. It exported only verifyAuth and
        // canSeeAll, while the endpoints had since grown imports of isReadOnly,
        // requireRole and requireWrite -- so both integration files died at
        // import with "does not provide an export named 'isReadOnly'" and no
        // test in either had run since. A partial stub fails loudly, but only
        // when someone runs the suite; it is not part of `npm test`.
        //
        // The gates are reimplemented here rather than stubbed open. A stub that
        // always allows would make every authorization test in this file a
        // tautology -- and the delete gate is precisely what needs covering.
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            // x-test-role lets a test act as a rep. Defaults to Admin so every
            // pre-existing test in this file behaves exactly as before.
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'u_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole)
                ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers, opts = {}) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (auth?.userRole === 'ReadOnly') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            }
            if (auth?.userRole === 'Technician' && !opts.allowTechnician) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: technicians may only update their own assigned jobs' }) };
            }
            return null;
        },
    },
});

// 3) Import the REAL handler + real db/schema (tsx resolves the .ts files).
const { handler } = await import('../../netlify/functions/accounts.mjs');
const { db } = await import('../../db/index.js');
const { accounts, users } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

const A = 'itest_org_A', B = 'itest_org_B';
const ev = (org, method, body, qs, role) => ({
    httpMethod: method,
    // Omitting x-test-role leaves the stub on its Admin default, so every
    // pre-existing call site below behaves exactly as it did.
    headers: { 'x-test-org': org, 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const asRep = (org, method, body, qs) => ev(org, method, body, qs, 'User');
const REP_NAME = 'Itest Rep';
const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(accounts).where(eq(accounts.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    // Fails one readable line if the TEST database is behind db/schema.ts.
    // Must come first: everything below seeds rows and would otherwise die
    // once per test with a raw Postgres 42703 and no instruction.
    await assertTestSchema(db);

    await cleanup();
    // resolveCaller() looks the caller up by CLERK_USER_ID, and the auth stub
    // uses 'u_' + orgId as the Clerk id. WITHOUT this row it returns null, every
    // owned account fails the ownership check, and the role-gate test below is
    // refused by OWNERSHIP while asserting on the ROLE message -- testing the
    // wrong gate entirely. That is exactly what happened when the lookup moved
    // from users.id to users.clerk_user_id and this seed did not follow.
    //
    // The two ids are DELIBERATELY DIFFERENT. users.id is app-owned since the
    // identity split; the Clerk id is an attribute. Seeding them equal would let
    // a code path that still looks up by users.id pass this suite unnoticed.
    await db.insert(users).values({
        id: 'usr_itest_accounts_rep',
        clerkUserId: 'u_' + A,
        name: REP_NAME, email: 'itest-acc-rep@example.test',
        role: 'User', active: true, orgId: A,
    });
});
after(cleanup);

test('read isolation — org A cannot see org B accounts', async () => {
    await handler(ev(A, 'POST', { id: 'acc_A1', name: 'A Co' }));
    await handler(ev(B, 'POST', { id: 'acc_B1', name: 'B Co' }));
    const res = JSON.parse((await handler(ev(A, 'GET'))).body);
    const ids = (res.accounts || []).map(a => a.id);
    assert.ok(ids.includes('acc_A1'), 'A should see its own account');
    assert.ok(!ids.includes('acc_B1'), 'A must NOT see B\'s account');
});

test('cross-tenant write — A cannot overwrite B\'s row via upsert with B\'s id', async () => {
    await handler(ev(B, 'POST', { id: 'acc_B2', name: 'B Original' }));
    await handler(ev(A, 'PUT', { id: 'acc_B2', name: 'HACKED BY A' }));
    const [row] = await db.select().from(accounts).where(eq(accounts.id, 'acc_B2'));
    assert.equal(row.name, 'B Original', 'B\'s row must be unchanged by A\'s upsert');
    assert.equal(row.orgId, B, 'B\'s row must still belong to B');
});

test('delete isolation — A cannot delete B\'s row by id', async () => {
    await handler(ev(B, 'POST', { id: 'acc_B3', name: 'B Keep' }));
    await handler(ev(A, 'DELETE', null, { id: 'acc_B3' }));
    const [row] = await db.select().from(accounts).where(eq(accounts.id, 'acc_B3'));
    assert.ok(row, 'B\'s row must survive A\'s delete attempt');
});

test('persistence round-trip — POST then GET returns the row', async () => {
    await handler(ev(A, 'POST', { id: 'acc_A2', name: 'Persisted' }));
    const res = JSON.parse((await handler(ev(A, 'GET'))).body);
    assert.ok((res.accounts || []).some(a => a.id === 'acc_A2' && a.name === 'Persisted'), 'created account should be readable');
});

// ── Child promotion must not outlive a refused delete ───────────────────────
//
// accounts.mjs ran the child-promotion UPDATE ABOVE the Admin role gate, so an
// ATTEMPT was destructive on its own: a rep who could not delete an account
// still detached every sub-account under it, permanently, and left no trace --
// the audit write sits below the gate the request never reached, and
// parentAccountId is not recoverable from the surviving row.
//
// Confirmed on dev 24 Aug 2026 with before/after evidence (FIXTURE_MANIFEST
// step 15). The whole point of these three tests is the SECOND assertion in
// each: the 403 and the 404 were already correct, and asserting only those
// would pass just as happily against the broken ordering.

const seedFamily = async (org, prefix, owner) => {
    // Every insert is checked. An unchecked seed that fails leaves the test
    // asserting against rows that were never written -- see the org-scope test
    // below for the version of this that actually happened.
    const post = async (row) => {
        const r = await handler(ev(org, 'POST', row));
        assert.equal(r.statusCode, 201, `seed ${row.id} failed: ${r.statusCode} ${r.body}`);
    };
    await post({ id: prefix + '_parent', name: prefix + ' Parent', accountOwner: owner });
    for (const child of ['a', 'b']) {
        await post({
            id: prefix + '_child_' + child,
            name: prefix + ' Child ' + child.toUpperCase(),
            accountOwner: owner,
            parentAccountId: prefix + '_parent',
        });
    }
};
const parentOf = async (id) => (await db.select().from(accounts).where(eq(accounts.id, id)))[0]?.parentAccountId;

test('REGRESSION — a delete refused by the ROLE gate leaves the hierarchy intact', async () => {
    // Owned by the rep, so the ownership check PASSES and requireRole is what
    // refuses. That ordering is the bug's habitat: a refusal that arrives after
    // the promotion has already run.
    await seedFamily(A, 'acc_rolegate', REP_NAME);   // owner === users.name, so ownership PASSES
    assert.equal(await parentOf('acc_rolegate_child_a'), 'acc_rolegate_parent', 'precondition: child A starts attached');

    const res = await handler(asRep(A, 'DELETE', null, { id: 'acc_rolegate_parent' }));
    assert.equal(res.statusCode, 403);
    assert.match(JSON.parse(res.body).error, /insufficient role/);

    assert.equal(await parentOf('acc_rolegate_child_a'), 'acc_rolegate_parent', 'a refused delete must NOT detach child A');
    assert.equal(await parentOf('acc_rolegate_child_b'), 'acc_rolegate_parent', 'a refused delete must NOT detach child B');
    assert.ok((await db.select().from(accounts).where(eq(accounts.id, 'acc_rolegate_parent')))[0], 'the parent must survive');
});

test('REGRESSION — a delete refused by the OWNERSHIP check leaves the hierarchy intact', async () => {
    // The other refusal path. Both return 403 and only the message differs, so
    // both need covering -- fixing one ordering would not fix the other.
    await seedFamily(A, 'acc_owner', 'Someone Else');
    const res = await handler(asRep(A, 'DELETE', null, { id: 'acc_owner_parent' }));
    assert.equal(res.statusCode, 403);
    assert.match(JSON.parse(res.body).error, /your own or unassigned records/);

    assert.equal(await parentOf('acc_owner_child_a'), 'acc_owner_parent', 'an ownership refusal must not detach children');
    assert.equal(await parentOf('acc_owner_child_b'), 'acc_owner_parent');
});

test('an Admin delete DOES promote the children, and says so in the response', async () => {
    // The behaviour being protected. Promotion is correct -- it just has to be a
    // consequence of a deletion rather than of an attempt.
    await seedFamily(A, 'acc_admin', REP_NAME);
    const res = await handler(ev(A, 'DELETE', null, { id: 'acc_admin_parent' }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(JSON.parse(res.body).promoted, 2);

    assert.equal(await parentOf('acc_admin_child_a'), null, 'children are promoted to top level');
    assert.equal(await parentOf('acc_admin_child_b'), null);
    assert.ok(!(await db.select().from(accounts).where(eq(accounts.id, 'acc_admin_parent')))[0], 'the parent is gone');
});

test('an unknown id is a 404 and touches nothing', async () => {
    // Promotion is now conditional on a row actually being removed, so a 404
    // must not restructure anything either. Under the old ordering this UPDATE
    // ran before the delete discovered there was nothing to delete.
    await seedFamily(A, 'acc_404', REP_NAME);
    const res = await handler(ev(A, 'DELETE', null, { id: 'acc_404_does_not_exist' }));
    assert.equal(res.statusCode, 404);
    assert.equal(await parentOf('acc_404_child_a'), 'acc_404_parent', 'a 404 must not detach anything');
});

test('promotion is org-scoped — deleting A\'s parent cannot touch B\'s children', async () => {
    // The UPDATE matches on parentAccountId, which is a plain text column with
    // NO foreign key -- so a row in org B can perfectly well hold org A's parent
    // id. Nothing but the orgId term in the WHERE clause stops the promotion
    // reaching across the tenant boundary, which is exactly what this asserts.
    //
    // An earlier version of this test also created a parent row in B carrying
    // A's id, to model "two orgs using the same id". That is impossible:
    // accounts.id is a GLOBAL primary key, not unique-per-org, so the insert
    // failed with a duplicate key, logged a 500, and the test passed anyway
    // because the assertion did not depend on it. A test that passes while
    // swallowing an error is the thing this suite exists to catch, so the
    // scaffolding is gone and every seed is now checked.
    await seedFamily(A, 'acc_scope', REP_NAME);
    const seeded = await handler(ev(B, 'POST', {
        id: 'b_scope_child', name: 'B Child', accountOwner: 'B Rep',
        parentAccountId: 'acc_scope_parent',        // deliberately A's id
    }));
    assert.equal(seeded.statusCode, 201, `seed must succeed, got ${seeded.statusCode}: ${seeded.body}`);

    const res = await handler(ev(A, 'DELETE', null, { id: 'acc_scope_parent' }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(JSON.parse(res.body).promoted, 2, 'only A\'s two children may be promoted');

    assert.equal(await parentOf('b_scope_child'), 'acc_scope_parent', 'org B\'s row must be untouched');
});
