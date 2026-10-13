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
const OTHER_NAME = 'Itest Other Acc Rep';
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
    // The OTHER rep needs a roster row now. Under name-based ownership the bare
    // string 'Someone Else' owned a record without any such user existing.
    // Ownership keys on users.id, so a name resolving to nobody stamps ownerId
    // NULL -- the record is UNASSIGNED and mutable by anyone, which is why the
    // ownership-refusal test received 'insufficient role' from the gate below it
    // instead of a 403 from the ownership check.
    await db.insert(users).values({
        id: 'usr_itest_accounts_other',
        clerkUserId: 'u_other_' + A,
        name: OTHER_NAME, email: 'itest-acc-other@example.test',
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
    // OTHER_NAME, not a bare string. 'Someone Else' matched no roster row, so
    // ownerId stamped NULL, the family was UNASSIGNED, ownership ALLOWED the
    // delete and it fell through to the role gate -- this test failed asserting
    // the ownership message and receiving 'insufficient role'. A display name
    // can no longer confer ownership; only a real roster user can own anything.
    await seedFamily(A, 'acc_owner', OTHER_NAME);
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
    // Org B's row holding A's id is written straight to the table: since §0.198 the handler
    // refuses a parent another org holds (a 404 — the parent tests at the end of this file),
    // and this row models one stored before that rule. db.insert throws on a failed write,
    // so the seed is still checked.
    await db.insert(accounts).values({
        id: 'b_scope_child', name: 'B Child', accountOwner: 'B Rep', orgId: B,
        parentAccountId: 'acc_scope_parent',        // deliberately A's id
        accountTier: 'business_unit',
    });

    const res = await handler(ev(A, 'DELETE', null, { id: 'acc_scope_parent' }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(JSON.parse(res.body).promoted, 2, 'only A\'s two children may be promoted');

    assert.equal(await parentOf('b_scope_child'), 'acc_scope_parent', 'org B\'s row must be untouched');
    assert.equal((await db.select().from(accounts).where(eq(accounts.id, 'b_scope_child')))[0]?.accountTier, 'business_unit', "and its tier: A's delete re-tiers only A's rows (§0.198, D18)");
});

// ── Rep-role GET scoping — the §0.48 read-side debt, closed (2 Sep) ──────────
// The write paths have carried rep coverage since §0.44; the GET filter's only
// runtime evidence was browser checks. Permissive policy, ownerId-keyed
// (18b22): unassigned visible to everyone, owned rows only to their owner, a
// null caller fails closed to unassigned-only. Rows seeded with db.insert so
// ownership is the test's input, per the leads suite's pattern.

test('rep GET — own + unassigned arrive; another rep\'s account never does', async () => {
    await db.insert(accounts).values([
        { id: 'acc_repget_mine',  name: 'Repget Mine',  ownerId: 'usr_itest_accounts_rep',   orgId: A },
        { id: 'acc_repget_other', name: 'Repget Other', ownerId: 'usr_itest_accounts_other', orgId: A },
        { id: 'acc_repget_none',  name: 'Repget None',  ownerId: null,                       orgId: A },
    ]);
    const ids = JSON.parse((await handler(asRep(A, 'GET'))).body).accounts.map(a => a.id);
    assert.ok(ids.includes('acc_repget_mine'),   'a rep must receive their own account');
    assert.ok(ids.includes('acc_repget_none'),   'unassigned is visible to everyone');
    assert.ok(!ids.includes('acc_repget_other'), 'another rep\'s account must never be sent to a rep');
});

test('Admin GET — all three scoping rows arrive (canSeeAll bypasses the filter)', async () => {
    const ids = JSON.parse((await handler(ev(A, 'GET'))).body).accounts.map(a => a.id);
    for (const id of ['acc_repget_mine', 'acc_repget_other', 'acc_repget_none']) {
        assert.ok(ids.includes(id), `Admin must still receive ${id}`);
    }
});

test('unresolvable caller GET — only unassigned arrives (fail closed, 18b22 direction)', async () => {
    // Org B has no roster row for the stub caller, so getCallerId resolves
    // null; an owned B row must be refused while unassigned stays visible.
    await db.insert(accounts).values([
        { id: 'acc_repget_b_none',  name: 'Repget B None',  ownerId: null,                       orgId: B },
        { id: 'acc_repget_b_owned', name: 'Repget B Owned', ownerId: 'usr_itest_accounts_other', orgId: B },
    ]);
    const ids = JSON.parse((await handler(asRep(B, 'GET'))).body).accounts.map(a => a.id);
    assert.ok(ids.includes('acc_repget_b_none'),   'unassigned stays visible to a null caller under the permissive policy');
    assert.ok(!ids.includes('acc_repget_b_owned'), 'an owned row must be refused to a null caller — null === null must not match');
});

// ── §0.178 — an account with an open deal is kept (Jeff: "Block it") ──────────
// A deal is the account's by accountId, or by the account's name where the deal has
// no id (the rule the account rail and the old delete check used). Its own org
// namespace; the deals written straight to the table as stored.
const { opportunities } = await import('../../db/schema.js');
const OA = 'itest_opendeal_acc_A', OA_OTHER = 'itest_opendeal_acc_B';
const oaCleanup = async () => {
    for (const o of [OA, OA_OTHER]) {
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(accounts).where(eq(accounts.orgId, o));
    }
};
const seedAccount = async (org, id, name, parentAccountId) => {
    const r = await handler(ev(org, 'POST', { id, name, ...(parentAccountId ? { parentAccountId } : {}) }));
    assert.equal(r.statusCode, 201, `seed ${id}: ${r.statusCode} ${r.body}`);
};
const seedAccountDeal = (org, id, stage, accountId, account) => db.insert(opportunities).values({
    id, orgId: org, pipelineId: 'default', opportunityName: 'Itest ' + id, stage, accountId, account,
});
const accountExists = async (id) => !!(await db.select().from(accounts).where(eq(accounts.id, id)))[0];

test('§0.178 — an open deal on the account keeps it: 409 naming the deal, the row stays', async () => {
    await oaCleanup();
    try {
        await seedAccount(OA, 'acc_od_byid', 'Itest Open Co');
        await seedAccountDeal(OA, 'opp_oa_byid', 'Discovery', 'acc_od_byid', 'Itest Open Co');
        const res = await handler(ev(OA, 'DELETE', null, { id: 'acc_od_byid' }));
        assert.equal(res.statusCode, 409, res.body);
        assert.match(JSON.parse(res.body).error, /has an open deal \("Itest opp_oa_byid"\)/);
        assert.ok(await accountExists('acc_od_byid'));
    } finally { await oaCleanup(); }
});

test('§0.178 — a deal with no account id keeps the account its name names', async () => {
    await oaCleanup();
    try {
        await seedAccount(OA, 'acc_od_byname', 'Itest Named Co');
        await seedAccountDeal(OA, 'opp_oa_byname', 'Proposal', null, 'Itest Named Co');
        const res = await handler(ev(OA, 'DELETE', null, { id: 'acc_od_byname' }));
        assert.equal(res.statusCode, 409, res.body);
        assert.ok(await accountExists('acc_od_byname'));
    } finally { await oaCleanup(); }
});

test('§0.178 — a closed deal does not keep it; a sub-account\'s open deal does not keep the parent — the child is promoted with its deal', async () => {
    await oaCleanup();
    try {
        await seedAccount(OA, 'acc_od_parent', 'Itest Parent Co');
        await seedAccount(OA, 'acc_od_child', 'Itest Child Co', 'acc_od_parent');
        await seedAccountDeal(OA, 'opp_oa_closed', 'Closed Won', 'acc_od_parent', 'Itest Parent Co');
        await seedAccountDeal(OA, 'opp_oa_child', 'Contracts', 'acc_od_child', 'Itest Child Co');
        const res = await handler(ev(OA, 'DELETE', null, { id: 'acc_od_parent' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.ok(!(await accountExists('acc_od_parent')), 'the parent is gone');
        const [child] = await db.select().from(accounts).where(eq(accounts.id, 'acc_od_child'));
        assert.ok(child && child.parentAccountId === null, 'the child stays, promoted');
    } finally { await oaCleanup(); }
});

test('§0.178 — another org\'s open deal with the same account id does not keep it (isolation)', async () => {
    await oaCleanup();
    try {
        await seedAccount(OA, 'acc_od_iso', 'Itest Iso Co');
        await seedAccountDeal(OA_OTHER, 'opp_oa_iso', 'Discovery', 'acc_od_iso', 'Itest Iso Co');
        const res = await handler(ev(OA, 'DELETE', null, { id: 'acc_od_iso' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.ok(!(await accountExists('acc_od_iso')));
    } finally { await oaCleanup(); }
});

test('§0.178 — clear=true is refused while an open deal is an account\'s, and nothing is deleted', async () => {
    await oaCleanup();
    try {
        await seedAccount(OA, 'acc_od_clear_a', 'Itest Clear Kept');
        await seedAccount(OA, 'acc_od_clear_b', 'Itest Clear Free');
        await seedAccountDeal(OA, 'opp_oa_clear', 'Negotiation/Review', 'acc_od_clear_a', 'Itest Clear Kept');
        const res = await handler(ev(OA, 'DELETE', null, { clear: 'true' }));
        assert.equal(res.statusCode, 409, res.body);
        assert.ok(await accountExists('acc_od_clear_a') && await accountExists('acc_od_clear_b'), 'both still there');
    } finally { await oaCleanup(); }
});

// ── §0.198 — an account's parent is one of THIS org's accounts it may stand under: not
// itself, not one of its own sub-accounts or sites, not a site, not one merged away, not one
// its own branch would sit below a site under (Jeff, 11 Oct — D3: "No self, no loops, no
// sites"); an account KEEPS its tier wherever it still fits (D21: "Keep what fits") — a
// create's the tier it asks for where it fits; a move's its stored one where it fits, else the
// one it asks for, else the lowest above the parent, so a stale screen cannot re-tier it; at
// the top always an account; what stands under a moved account keeps what still fits, and a
// move that would put any of it below a site is refused; a move that makes an account holding
// deals a site moves them up to the account above it, Site Name the site (D22); a delete
// lifts its sub-accounts as accounts (D18), and its Undo, marked a restore, puts back the
// parent and tier exactly as stored, legacy shapes included, checked only for the tier, the
// org, a site and loops — an Admin's mark alone, on a top-level row the body names a parent
// for (one for a row another session moved since the delete refused, 409); never over an
// account under it that would not rank below it, and moving no deal — and the owner as stored
// (an owner id it drops takes the owner's name with it), not the created date (the Undo's); the
// delete answers the rows the Undo re-sends, as stored
// when its write ran, and every write of its batch is keyed to the rows as they stand then; a
// parent a save leaves as stored is not asked about again (D1), and the tier stays as stored
// whatever the body says; an untouched Parent field sends none. Its own org namespace; a row
// that models data from before the rule is written straight to the table.
// tests/account-parent.test.mjs runs the rule.
const PA = 'itest_parent_acc_A', PB = 'itest_parent_acc_B';
const paCleanup = async () => {
    for (const o of [PA, PB]) {
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(accounts).where(eq(accounts.orgId, o));
    }
};
const rowOf = async (id) => (await db.select().from(accounts).where(eq(accounts.id, id)))[0];
const errorOf = (res) => JSON.parse(res.body).error;
const tierOf = async (id) => (await rowOf(id))?.accountTier;
// Shell, its unit "Shell - Port Allen" and a site under the unit, through the handler.
const shellFamily = async () => {
    await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
    await seedAccount(PA, 'acc_pa_unit', 'Itest Shell - Port Allen', 'acc_pa_shell');
    await seedAccount(PA, 'acc_pa_tank', 'Itest Port Allen Tank Farm', 'acc_pa_unit');
};
// An account created through the handler asking for a tier.
const seedTier = async (org, id, name, parentAccountId, accountTier) => {
    const r = await handler(ev(org, 'POST', { id, name, parentAccountId, accountTier }));
    assert.equal(r.statusCode, 201, `seed ${id}: ${r.statusCode} ${r.body}`);
    return JSON.parse(r.body).account;
};

test('§0.198 — a create keeps the tier it asks for where it fits under the parent, else the lowest above it; at the top an account (D21)', async () => {
    await paCleanup();
    try {
        await shellFamily();
        assert.equal(await tierOf('acc_pa_shell'), 'account');
        assert.equal(await tierOf('acc_pa_unit'), 'business_unit', 'asked for nothing under an account: the lowest above it');
        assert.equal(await tierOf('acc_pa_tank'), 'site');
        assert.equal((await seedTier(PA, 'acc_pa_claims', 'Itest Claims Site', 'acc_pa_shell', 'site')).accountTier, 'site', 'a site straight under an account, as 416 of UKG\'s stand: kept');
        assert.equal((await seedTier(PA, 'acc_pa_asked_acc', 'Itest Asked Account', 'acc_pa_shell', 'account')).accountTier, 'business_unit', 'an account asked under an account: does not fit');
        assert.equal((await seedTier(PA, 'acc_pa_asked_bu', 'Itest Asked Unit', 'acc_pa_unit', 'business_unit')).accountTier, 'site', 'a unit asked under a unit: does not fit');
        assert.equal((await seedTier(PA, 'acc_pa_top', 'Itest Top', null, 'site')).accountTier, 'account', 'no parent: an account, whatever is asked');
        assert.equal(await tierOf('acc_pa_top'), 'account');
    } finally { await paCleanup(); }
});

test("§0.198 — isolation: org B cannot put an account under org A's (404 on a create and on a move, nothing written), and B's move never re-tiers A's rows", async () => {
    await paCleanup();
    try {
        await shellFamily();
        await seedAccount(PB, 'acc_pb_own', 'Itest B Own');
        await seedAccount(PB, 'acc_pb_top', 'Itest B Top');
        const post = await handler(ev(PB, 'POST', { id: 'acc_pb_child', name: 'Itest B Child', parentAccountId: 'acc_pa_shell' }));
        assert.equal(post.statusCode, 404, post.body);
        assert.equal(errorOf(post), 'Parent account not found.');
        assert.equal(await rowOf('acc_pb_child'), undefined, 'nothing written');
        const put = await handler(ev(PB, 'PUT', { id: 'acc_pb_own', parentAccountId: 'acc_pa_unit' }));
        assert.equal(put.statusCode, 404, put.body);
        assert.equal(errorOf(put), 'Parent account not found.', "the answer a missing id gets: nothing of A's leaks");
        assert.equal((await rowOf('acc_pb_own')).parentAccountId, null, "B's account is where it was");
        // a row of A's that names B's account as its parent (data from before the rule): B's move is B's alone
        await db.insert(accounts).values({ id: 'acc_pa_cross', name: 'Itest A Cross', orgId: PA, parentAccountId: 'acc_pb_own', accountTier: 'account' });
        const move = await handler(ev(PB, 'PUT', { id: 'acc_pb_own', parentAccountId: 'acc_pb_top' }));
        assert.equal(move.statusCode, 200, move.body);
        assert.equal(JSON.parse(move.body).account.accountTier, 'business_unit');
        assert.deepEqual(JSON.parse(move.body).retiered, [], "only B's rows are B's branch — A's misfit row under it is not re-fitted");
        const cross = await rowOf('acc_pa_cross');
        assert.equal(cross.accountTier, 'account', "A's row keeps its tier");
        assert.equal(cross.parentAccountId, 'acc_pb_own');
        assert.equal((await rowOf('acc_pa_unit')).parentAccountId, 'acc_pa_shell', "A's family untouched");
    } finally { await paCleanup(); }
});

test('§0.198 — itself, its own sub-account or site, a site, an account merged away, a branch that would sit below a site: 400 naming why, the stored parent kept', async () => {
    await paCleanup();
    try {
        await shellFamily();
        await seedAccount(PA, 'acc_pa_dow', 'Itest Dow');
        await seedAccount(PA, 'acc_pa_dow_unit', 'Itest Dow Olefins', 'acc_pa_dow');
        await db.insert(accounts).values({ id: 'acc_pa_merged', name: 'Itest Merged Away', orgId: PA, mergeArchived: true, mergedIntoId: 'acc_pa_shell' });
        for (const [method, body, why] of [
            ['PUT', { id: 'acc_pa_unit', parentAccountId: 'acc_pa_unit' }, /can't be its own parent/],
            ['PUT', { id: 'acc_pa_shell', parentAccountId: 'acc_pa_unit' }, /one of its own sub-accounts or sites/],
            ['PUT', { id: 'acc_pa_shell', parentAccountId: 'acc_pa_tank' }, /one of its own sub-accounts or sites/],
            ['POST', { id: 'acc_pa_under_site', name: 'Itest Under Site', parentAccountId: 'acc_pa_tank' }, /is a site/],
            ['POST', { id: 'acc_pa_under_merged', name: 'Itest Under Merged', parentAccountId: 'acc_pa_merged' }, /merged into another account/],
            ['PUT', { id: 'acc_pa_shell', parentAccountId: 'acc_pa_dow' }, /has accounts under it that would sit below a site/],
            ['PUT', { id: 'acc_pa_unit', parentAccountId: 'acc_pa_dow_unit' }, /has accounts under it that would sit below a site/],
        ]) {
            const res = await handler(ev(PA, method, body));
            assert.equal(res.statusCode, 400, `${method} ${JSON.stringify(body)}: ${res.body}`);
            assert.match(errorOf(res), why);
        }
        assert.equal((await rowOf('acc_pa_unit')).parentAccountId, 'acc_pa_shell', 'the unit stays under Shell');
        assert.equal((await rowOf('acc_pa_shell')).parentAccountId, null, 'Shell stays at the top');
        assert.equal(await tierOf('acc_pa_shell'), 'account');
        assert.equal(await tierOf('acc_pa_unit'), 'business_unit', 'a business unit with a site under it, refused under a business unit: as it was');
        assert.equal(await tierOf('acc_pa_tank'), 'site', 'nothing of the branch re-tiered by a refused move');
        assert.equal(await rowOf('acc_pa_under_site'), undefined);
        assert.equal(await rowOf('acc_pa_under_merged'), undefined);
    } finally { await paCleanup(); }
});

test('§0.198 — D21: a move keeps every tier that still fits — a site moved from one account to another stays a site; an account moved under an account becomes a business unit, its sites staying sites; a cleared parent makes an account', async () => {
    await paCleanup();
    try {
        await shellFamily();
        await seedAccount(PA, 'acc_pa_dow', 'Itest Dow');
        await seedTier(PA, 'acc_pa_site', 'Itest Shell - Port Allen', 'acc_pa_shell', 'site');
        await seedAccount(PA, 'acc_pa_evonik', 'Itest Evonik');
        await seedTier(PA, 'acc_pa_laf', 'Itest Evonik - Lafayette', 'acc_pa_evonik', 'site');
        // UKG's site moved from Shell to Dow: a site
        let res = await handler(ev(PA, 'PUT', { id: 'acc_pa_site', parentAccountId: 'acc_pa_dow', accountTier: 'site' }));
        assert.equal(res.statusCode, 200, res.body);
        let body = JSON.parse(res.body);
        assert.equal(body.account.accountTier, 'site', 'a site moved between accounts stays a site — the row the rail takes back');
        assert.deepEqual(body.retiered, []);
        assert.equal(await tierOf('acc_pa_site'), 'site');
        // an account, with a site under it, moved under an account: a business unit, its site a site
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_evonik', parentAccountId: 'acc_pa_shell', accountTier: 'account' }));
        assert.equal(res.statusCode, 200, res.body);
        body = JSON.parse(res.body);
        assert.equal(body.account.accountTier, 'business_unit', 'an account under an account: a unit');
        assert.deepEqual(body.retiered, [], 'its site still fits: nothing else written');
        assert.equal(await tierOf('acc_pa_laf'), 'site');
        // Dow, with a unit under it, under Shell: Dow a unit, and its unit, which no longer fits, a site
        await seedAccount(PA, 'acc_pa_dow_unit', 'Itest Dow Olefins', 'acc_pa_dow');
        assert.equal(await tierOf('acc_pa_dow_unit'), 'business_unit');
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow_unit', parentAccountId: 'acc_pa_shell' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(JSON.parse(res.body).account.accountTier, 'business_unit', 'a unit moved from one account to another: still a unit');
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow_unit', parentAccountId: 'acc_pa_dow' }));
        assert.equal(res.statusCode, 200, res.body);
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow', parentAccountId: 'acc_pa_shell' }));
        assert.equal(res.statusCode, 200, res.body);
        body = JSON.parse(res.body);
        assert.equal(body.account.accountTier, 'business_unit');
        assert.deepEqual(body.retiered, [{ id: 'acc_pa_dow_unit', accountTier: 'site' }], "Dow's unit a site, handed back for the screen; Dow's site, a site already, not written");
        assert.equal(await tierOf('acc_pa_dow_unit'), 'site');
        assert.equal(await tierOf('acc_pa_site'), 'site');
        // a cleared parent: an account, and what stands under it keeps its tier
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow', parentAccountId: null }));
        assert.equal(res.statusCode, 200, res.body);
        const dow = await rowOf('acc_pa_dow');
        assert.equal(dow.parentAccountId, null);
        assert.equal(dow.accountTier, 'account');
        assert.deepEqual(JSON.parse(res.body).retiered, [], 'its sites still fit');
        assert.equal(await tierOf('acc_pa_dow_unit'), 'site');
        // the unit, with its site under it, under Dow's site-tier unit: a site is no parent
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_unit', parentAccountId: 'acc_pa_dow_unit' }));
        assert.equal(res.statusCode, 400, res.body);
        assert.match(errorOf(res), /is a site/);
        // a leaf under a unit: a site
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_laf', parentAccountId: 'acc_pa_unit', accountTier: 'site' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(JSON.parse(res.body).account.accountTier, 'site');
    } finally { await paCleanup(); }
});

test('§0.198 — D21: a business unit with sites moved under a business unit is refused — its sites would sit below a site; nothing is written', async () => {
    await paCleanup();
    try {
        await shellFamily();
        await seedAccount(PA, 'acc_pa_dow', 'Itest Dow');
        await seedAccount(PA, 'acc_pa_dow_unit', 'Itest Dow Olefins', 'acc_pa_dow');
        const res = await handler(ev(PA, 'PUT', { id: 'acc_pa_unit', parentAccountId: 'acc_pa_dow_unit', accountTier: 'business_unit' }));
        assert.equal(res.statusCode, 400, res.body);
        assert.equal(errorOf(res), "“Itest Shell - Port Allen” has accounts under it that would sit below a site — it can't go there.");
        assert.equal((await rowOf('acc_pa_unit')).parentAccountId, 'acc_pa_shell');
        assert.equal(await tierOf('acc_pa_unit'), 'business_unit');
        assert.equal(await tierOf('acc_pa_tank'), 'site');
        assert.equal(await tierOf('acc_pa_dow_unit'), 'business_unit');
    } finally { await paCleanup(); }
});

test('§0.198 — a save that leaves the stored parent as it is is not asked again, and keeps the stored tier whatever the body says: a parent from before the rule stays, tier and all; a screen loaded before a move cannot write the old tier back', async () => {
    await paCleanup();
    try {
        await shellFamily();
        await db.insert(accounts).values({ id: 'acc_pa_legacy', name: 'Itest Legacy', orgId: PA, parentAccountId: 'acc_pa_tank', accountTier: 'site' });
        let res = await handler(ev(PA, 'PUT', { id: 'acc_pa_legacy', name: 'Itest Legacy Renamed', accountTier: 'account' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(JSON.parse(res.body).account.accountTier, 'site', 'no parent named: the stored tier, not the body\'s');
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_legacy', parentAccountId: 'acc_pa_tank', phone: '555-0100', accountTier: 'business_unit' }));
        assert.equal(res.statusCode, 200, `the same parent named again: ${res.body}`);
        const row = await rowOf('acc_pa_legacy');
        assert.equal(row.parentAccountId, 'acc_pa_tank');
        assert.equal(row.accountTier, 'site', 'its tier as stored');
        assert.equal(row.name, 'Itest Legacy Renamed');
        // another session moves Dow under Shell: Dow's unit becomes a site; a screen loaded before it sends the unit's old tier back
        await seedAccount(PA, 'acc_pa_dow', 'Itest Dow');
        await seedAccount(PA, 'acc_pa_dow_unit', 'Itest Dow Olefins', 'acc_pa_dow');
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow', parentAccountId: 'acc_pa_shell' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(await tierOf('acc_pa_dow_unit'), 'site');
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow_unit', name: 'Itest Dow Olefins', parentAccountId: 'acc_pa_dow', accountTier: 'business_unit', notes: 'edited on a stale screen' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(JSON.parse(res.body).account.accountTier, 'site', 'the stored tier — the stale body\'s is ignored');
        assert.equal(await tierOf('acc_pa_dow_unit'), 'site');
        assert.equal((await rowOf('acc_pa_dow_unit')).notes, 'edited on a stale screen', 'the rest of the save stands');
    } finally { await paCleanup(); }
});

test('§0.198 — a move tries the STORED tier before the one the body sends: a screen loaded when the site was a unit, moving it to another account, keeps it a site; where the stored tier no longer fits, the body\'s is taken', async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
        await seedAccount(PA, 'acc_pa_dow', 'Itest Dow');
        await seedTier(PA, 'acc_pa_site', 'Itest Shell - Port Allen', 'acc_pa_shell', 'site');
        let res = await handler(ev(PA, 'PUT', { id: 'acc_pa_site', name: 'Itest Shell - Port Allen', parentAccountId: 'acc_pa_dow', accountTier: 'business_unit' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(JSON.parse(res.body).account.accountTier, 'site', 'the stale body said a unit: the stored site fits under Dow, and stays');
        assert.equal(await tierOf('acc_pa_site'), 'site');
        await db.insert(accounts).values({ id: 'acc_pa_legacy', name: 'Itest Legacy Co', orgId: PA, parentAccountId: 'acc_pa_shell', accountTier: 'account' });
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_legacy', parentAccountId: 'acc_pa_dow', accountTier: 'site' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(JSON.parse(res.body).account.accountTier, 'site', "a tier-'account' row under an account no longer fits: the body's site is taken");
    } finally { await paCleanup(); }
});

test('§0.198 — D22: a move that makes an account holding deals a site moves them up to the account it then stands under, under its name, Site Name the site, in the same write — by id, and by name where a deal has none; a name another account shares is no one\'s by name; org B untouched; an account edit has no Undo', async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
        await seedAccount(PA, 'acc_pa_unit', 'Itest Shell - Port Allen', 'acc_pa_shell');
        await seedAccount(PA, 'acc_pa_dow', 'Itest Dow');
        await seedAccount(PA, 'acc_pa_olefins', 'Itest Dow Olefins', 'acc_pa_dow');
        // UKG's twin of the unit's name: a site under Shell
        await db.insert(accounts).values({ id: 'acc_pa_site', name: 'Itest Shell - Port Allen', orgId: PA, parentAccountId: 'acc_pa_shell', accountTier: 'site' });
        const deal = (org, id, accountId, account, site = null) => seedAccountDeal(org, id, 'Discovery', accountId, account).then(() => site && db.update(opportunities).set({ site }).where(eq(opportunities.id, id)));
        await deal(PA, 'opp_pa_by_id', 'acc_pa_olefins', 'Itest Dow Olefins', 'Old Plant');
        await deal(PA, 'opp_pa_by_name', null, 'Itest Dow Olefins');
        await deal(PA, 'opp_pa_other', 'acc_pa_dow', 'Itest Dow');
        await deal(PB, 'opp_pb_same_name', null, 'Itest Dow Olefins');
        // Dow under Shell: Dow a unit, Dow Olefins (a unit, holding deals) a site
        const res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow', parentAccountId: 'acc_pa_shell' }));
        assert.equal(res.statusCode, 200, res.body);
        const body = JSON.parse(res.body);
        assert.deepEqual(body.retiered, [{ id: 'acc_pa_olefins', accountTier: 'site' }]);
        const now = async (id) => { const r = (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0]; return [r.accountId, r.account, r.site]; };
        assert.deepEqual(await now('opp_pa_by_id'), ['acc_pa_dow', 'Itest Dow', 'Itest Dow Olefins'], "by id: up to Dow, Dow's name, Site Name the site (its old Site Name replaced)");
        assert.deepEqual(await now('opp_pa_by_name'), ['acc_pa_dow', 'Itest Dow', 'Itest Dow Olefins'], 'by name, no other account of the name: the same, now linked by id');
        assert.deepEqual(await now('opp_pa_other'), ['acc_pa_dow', 'Itest Dow', null], "Dow's own deal: untouched");
        assert.deepEqual(await now('opp_pb_same_name'), [null, 'Itest Dow Olefins', null], "org B's deal of the name: never touched");
        assert.deepEqual([...body.liftedDeals].sort((a, b) => a.id.localeCompare(b.id)).map((d) => [d.id, d.accountId, d.account, d.site]), [
            ['opp_pa_by_id', 'acc_pa_dow', 'Itest Dow', 'Itest Dow Olefins'], ['opp_pa_by_name', 'acc_pa_dow', 'Itest Dow', 'Itest Dow Olefins'],
        ], 'handed back for the screen');
        // an account edit has no Undo: moving Dow back leaves the deals on Dow, Site Name the site
        const back = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow', parentAccountId: null }));
        assert.equal(back.statusCode, 200, back.body);
        assert.deepEqual(JSON.parse(back.body).liftedDeals, [], 'nothing made a site');
        assert.deepEqual(await now('opp_pa_by_id'), ['acc_pa_dow', 'Itest Dow', 'Itest Dow Olefins'], 'moving the account back does not move its deals back');
        // the unit twin, holding a deal by id and one by the twins' shared name, moved under Dow Olefins' unit: a site
        await deal(PA, 'opp_pa_twin_id', 'acc_pa_unit', 'Itest Shell - Port Allen');
        await deal(PA, 'opp_pa_twin_name', null, 'Itest Shell - Port Allen');
        await seedAccount(PA, 'acc_pa_unit2', 'Itest Dow Plastics', 'acc_pa_dow');
        const twin = await handler(ev(PA, 'PUT', { id: 'acc_pa_unit', parentAccountId: 'acc_pa_unit2' }));
        assert.equal(twin.statusCode, 200, twin.body);
        assert.equal(JSON.parse(twin.body).account.accountTier, 'site');
        assert.deepEqual(await now('opp_pa_twin_id'), ['acc_pa_unit2', 'Itest Dow Plastics', 'Itest Shell - Port Allen'], 'by id: up to the unit it now stands under');
        assert.deepEqual(await now('opp_pa_twin_name'), [null, 'Itest Shell - Port Allen', null], "a name the site twin shares: no one's by name — untouched");
    } finally { await paCleanup(); }
});

test('§0.198 — a loop already in the data ends: a new account under a unit in one is a site, a move out of it is answered', { timeout: 20000 }, async () => {
    await paCleanup();
    try {
        await db.insert(accounts).values([
            { id: 'acc_pa_loop1', name: 'Itest Loop One', orgId: PA, parentAccountId: 'acc_pa_loop2', accountTier: 'business_unit' },
            { id: 'acc_pa_loop2', name: 'Itest Loop Two', orgId: PA, parentAccountId: 'acc_pa_loop1', accountTier: 'business_unit' },
        ]);
        const res = await handler(ev(PA, 'POST', { id: 'acc_pa_into_loop', name: 'Itest Into Loop', parentAccountId: 'acc_pa_loop1' }));
        assert.equal(res.statusCode, 201, res.body);
        assert.equal(await tierOf('acc_pa_into_loop'), 'site', 'under a unit: a site — tiers rule, not depth (D21)');
        const out = await handler(ev(PA, 'PUT', { id: 'acc_pa_loop1', parentAccountId: null }));
        assert.equal(out.statusCode, 200, out.body);
        assert.equal(JSON.parse(out.body).account.accountTier, 'account');
        assert.equal((await rowOf('acc_pa_loop1')).parentAccountId, null, 'the loop is broken where it was moved');
    } finally { await paCleanup(); }
});

test("§0.198 — D18: a delete lifts its sub-accounts as accounts and the accounts under them keep their tiers; the Undo, marked a restore, puts them back as they were — UKG's site under Shell a site again; org B's rows untouched", async () => {
    await paCleanup();
    try {
        await shellFamily();
        // UKG's site twin, straight under Shell
        await db.insert(accounts).values({ id: 'acc_pa_site', name: 'Itest Shell - Port Allen', orgId: PA, parentAccountId: 'acc_pa_shell', accountTier: 'site' });
        await db.insert(accounts).values({ id: 'acc_pb_cross', name: 'Itest B Cross', orgId: PB, parentAccountId: 'acc_pa_shell', accountTier: 'business_unit' });
        const shellRow = await rowOf('acc_pa_shell');
        const del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_shell' }));
        assert.equal(del.statusCode, 200, del.body);
        const body = JSON.parse(del.body);
        assert.equal(body.promoted, 2);
        assert.deepEqual([...body.retiered].sort((a, b) => a.id.localeCompare(b.id)), [
            { id: 'acc_pa_site', accountTier: 'account' }, { id: 'acc_pa_unit', accountTier: 'account' },
        ], 'what the delete wrote, handed back for the screen: the two it lifted, nothing under them');
        assert.equal(await tierOf('acc_pa_unit'), 'account');
        assert.equal(await tierOf('acc_pa_site'), 'account');
        assert.equal(await tierOf('acc_pa_tank'), 'site', "the unit's site still fits under it");
        const cross = await rowOf('acc_pb_cross');
        assert.equal(cross.parentAccountId, 'acc_pa_shell', "org B's row keeps its parent");
        assert.equal(cross.accountTier, 'business_unit', 'and its tier');
        assert.ok(!body.children.some((c) => c.id === 'acc_pb_cross'), "org B's row naming A's deleted account is no child in A's answer");
        assert.deepEqual(body.children.map((c) => c.id).sort(), ['acc_pa_site', 'acc_pa_unit'], "A's two alone");
        assert.equal(body.deleted.orgId, PA, "the row answered is A's");
        // the Undo, as useAccounts sends it: the account posted back, then each lifted account's parent re-saved with its tier — each marked a restore
        const back = await handler(ev(PA, 'POST', { id: shellRow.id, name: shellRow.name, accountTier: shellRow.accountTier, restore: true }));
        assert.equal(back.statusCode, 201, back.body);
        const unit = await handler(ev(PA, 'PUT', { id: 'acc_pa_unit', parentAccountId: 'acc_pa_shell', accountTier: 'business_unit', restore: true }));
        assert.equal(unit.statusCode, 200, unit.body);
        assert.equal(JSON.parse(unit.body).account.accountTier, 'business_unit');
        assert.deepEqual(JSON.parse(unit.body).retiered, [], 'its site never moved');
        assert.equal(await tierOf('acc_pa_tank'), 'site');
        const site = await handler(ev(PA, 'PUT', { id: 'acc_pa_site', parentAccountId: 'acc_pa_shell', accountTier: 'site', restore: true }));
        assert.equal(site.statusCode, 200, site.body);
        assert.equal(JSON.parse(site.body).account.accountTier, 'site', "UKG's site twin back under Shell: a site again (D21), not a unit");
        assert.equal(await tierOf('acc_pa_site'), 'site');
    } finally { await paCleanup(); }
});

test("§0.198 — D21: Undo of deleting UKG's site under Shell restores tier 'site': the stored row posted back, marked a restore, under its (org-checked) parent", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
        await db.insert(accounts).values({ id: 'acc_pa_site', name: 'Itest Shell - Port Allen', orgId: PA, parentAccountId: 'acc_pa_shell', accountTier: 'site' });
        const stored = await rowOf('acc_pa_site');
        const del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_site' }));
        assert.equal(del.statusCode, 200, del.body);
        assert.deepEqual(JSON.parse(del.body).retiered, [], 'a leaf: nothing lifted');
        assert.equal(await rowOf('acc_pa_site'), undefined);
        // the Undo re-POSTs the stored row, marked a restore
        const back = await handler(ev(PA, 'POST', { ...stored, createdAt: undefined, updatedAt: undefined, restore: true }));
        assert.equal(back.statusCode, 201, back.body);
        assert.equal(JSON.parse(back.body).account.accountTier, 'site', 'a site again — not a business unit');
        const row = await rowOf('acc_pa_site');
        assert.deepEqual([row.parentAccountId, row.accountTier, row.orgId], ['acc_pa_shell', 'site', PA]);
        // the parent is still checked: another org's posting the same row back is refused, and nothing is written
        await db.delete(accounts).where(eq(accounts.id, 'acc_pa_site'));
        const foreign = await handler(ev(PB, 'POST', { id: 'acc_pa_site', name: 'Itest Shell - Port Allen', parentAccountId: 'acc_pa_shell', accountTier: 'site' }));
        assert.equal(foreign.statusCode, 404, foreign.body);
        assert.equal(await rowOf('acc_pa_site'), undefined);
        const foreignRestore = await handler(ev(PB, 'POST', { id: 'acc_pa_site', name: 'Itest Shell - Port Allen', parentAccountId: 'acc_pa_shell', accountTier: 'site', restore: true }));
        assert.equal(foreignRestore.statusCode, 404, `a restore marker naming another org's parent: ${foreignRestore.body}`);
        assert.equal(errorOf(foreignRestore), 'Parent account not found.');
        assert.equal(await rowOf('acc_pa_site'), undefined, 'nothing written');
    } finally { await paCleanup(); }
});

test("§0.198 — D21's Undo is a restore: legacy shapes come back EXACTLY — UKG's tier-'account' row under a deleted parent an account, a deleted top-level business unit a business unit; a restore naming another org's parent is 404, one that would close a loop 400, one under an account merged away 400; nothing under it re-fitted, no deal moved", async () => {
    await paCleanup();
    try {
        // UKG: a tier-'account' row stood under Shell before the rule (13 of them); Shell deleted, then Undo
        await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
        await db.insert(accounts).values([
            { id: 'acc_pa_legacy', name: 'Itest Legacy Co', orgId: PA, parentAccountId: 'acc_pa_shell', accountTier: 'account' },
            { id: 'acc_pa_legacy_bu', name: 'Itest Legacy Unit', orgId: PA, parentAccountId: 'acc_pa_legacy', accountTier: 'business_unit' },
            { id: 'acc_pa_top_bu', name: 'Itest Top Unit', orgId: PA, parentAccountId: null, accountTier: 'business_unit' },
        ]);
        await seedAccountDeal(PA, 'opp_pa_on_legacy', 'Discovery', 'acc_pa_legacy', 'Itest Legacy Co');
        const shellRow = await rowOf('acc_pa_shell');
        let res = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_shell' }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal((await rowOf('acc_pa_legacy')).parentAccountId, null);
        res = await handler(ev(PA, 'POST', { id: shellRow.id, name: shellRow.name, accountTier: shellRow.accountTier, restore: true }));
        assert.equal(res.statusCode, 201, res.body);
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_legacy', parentAccountId: 'acc_pa_shell', accountTier: 'account', restore: true }));
        assert.equal(res.statusCode, 200, res.body);
        let row = await rowOf('acc_pa_legacy');
        assert.deepEqual([row.parentAccountId, row.accountTier], ['acc_pa_shell', 'account'], "back under Shell an ACCOUNT, as stored — the fit would have made it a unit");
        assert.deepEqual(JSON.parse(res.body).retiered, [], 'nothing under it re-fitted');
        assert.equal(await tierOf('acc_pa_legacy_bu'), 'business_unit');
        const d = (await db.select().from(opportunities).where(eq(opportunities.id, 'opp_pa_on_legacy')))[0];
        assert.deepEqual([d.accountId, d.account, d.site], ['acc_pa_legacy', 'Itest Legacy Co', null], 'no deal moved');
        // Accelerep Test: a business unit stood at the top; deleted, then Undo
        const topRow = await rowOf('acc_pa_top_bu');
        res = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_top_bu' }));
        assert.equal(res.statusCode, 200, res.body);
        res = await handler(ev(PA, 'POST', { ...topRow, createdAt: undefined, updatedAt: undefined, restore: true }));
        assert.equal(res.statusCode, 201, res.body);
        assert.equal(JSON.parse(res.body).account.accountTier, 'business_unit', 'a business unit at the top, as stored — the fit would have made it an account');
        assert.equal(await tierOf('acc_pa_top_bu'), 'business_unit');
        // another org's parent: 404 on a restore POST and a restore PUT, nothing written
        await seedAccount(PB, 'acc_pb_own', 'Itest B Own');
        res = await handler(ev(PB, 'POST', { id: 'acc_pb_child', name: 'Itest B Child', parentAccountId: 'acc_pa_shell', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 404, res.body);
        assert.equal(await rowOf('acc_pb_child'), undefined);
        res = await handler(ev(PB, 'PUT', { id: 'acc_pb_own', parentAccountId: 'acc_pa_shell', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 404, res.body);
        row = await rowOf('acc_pb_own');
        assert.deepEqual([row.parentAccountId, row.accountTier], [null, 'account'], "B's account as it was");
        // a loop: not itself, not one of its own — each sent on a top-level row, so the restore's own check answers (restorePlace)
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_top_bu', parentAccountId: 'acc_pa_top_bu', accountTier: 'business_unit', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.equal(errorOf(res), "An account can't be its own parent.");
        assert.equal((await rowOf('acc_pa_top_bu')).parentAccountId, null, 'the top-level unit stays at the top');
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_shell', parentAccountId: 'acc_pa_legacy_bu', accountTier: 'account', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.match(errorOf(res), /one of its own sub-accounts or sites/);
        assert.equal((await rowOf('acc_pa_shell')).parentAccountId, null, 'Shell stays at the top');
        // a parent merged away since: no live account
        await db.insert(accounts).values({ id: 'acc_pa_merged', name: 'Itest Merged Away', orgId: PA, mergeArchived: true, mergedIntoId: 'acc_pa_shell' });
        res = await handler(ev(PA, 'POST', { id: 'acc_pa_under_merged', name: 'Itest Under Merged', parentAccountId: 'acc_pa_merged', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.match(errorOf(res), /merged into another account/);
        assert.equal(await rowOf('acc_pa_under_merged'), undefined);
    } finally { await paCleanup(); }
});

test("§0.198 — H1: the restore mark is an Admin's alone — a rep's marked PUT under a site is an ordinary save (400, the row unchanged), a rep's marked PUT that leaves the parent keeps the stored tier, a rep's marked POST is placed as any create (its made-up tier never stored); an Admin's restore refuses a tier the rule does not know and a site as the parent, and an Admin's mark on a row that has a parent is refused (L2: 409, the row as stored)", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
        await seedTier(PA, 'acc_pa_site', 'Itest Shell - Port Allen', 'acc_pa_shell', 'site');
        await seedAccount(PA, 'acc_pa_mine', 'Itest Mine');   // unassigned: a rep may save it
        let res = await handler(asRep(PA, 'PUT', { id: 'acc_pa_mine', parentAccountId: 'acc_pa_site', accountTier: 'garbage', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.match(errorOf(res), /is a site/);
        let row = await rowOf('acc_pa_mine');
        assert.deepEqual([row.parentAccountId, row.accountTier], [null, 'account'], 'unchanged');
        res = await handler(asRep(PA, 'PUT', { id: 'acc_pa_mine', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 200, res.body);
        assert.equal((await rowOf('acc_pa_mine')).accountTier, 'account', 'the parent left as stored: the stored tier — never a site at the top');
        res = await handler(asRep(PA, 'POST', { id: 'acc_pa_rep_new', name: 'Itest Rep New', accountTier: 'garbage', restore: true }));
        assert.equal(res.statusCode, 201, res.body);
        assert.equal((await rowOf('acc_pa_rep_new')).accountTier, 'account', 'placed as any create: the made-up tier is not stored');
        res = await handler(asRep(PA, 'POST', { id: 'acc_pa_rep_under', name: 'Itest Rep Under', parentAccountId: 'acc_pa_site', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.equal(await rowOf('acc_pa_rep_under'), undefined, 'nothing under the site');
        // an Admin's restore: a tier the rule does not know, a site as the parent — refused, nothing written
        res = await handler(ev(PA, 'POST', { id: 'acc_pa_adm_bad', name: 'Itest Admin Bad', accountTier: 'garbage', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.equal(errorOf(res), 'That is not an account tier — an account, a business unit or a site.');
        assert.equal(await rowOf('acc_pa_adm_bad'), undefined);
        res = await handler(ev(PA, 'POST', { id: 'acc_pa_adm_under', name: 'Itest Admin Under', parentAccountId: 'acc_pa_site', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.match(errorOf(res), /is a site/);
        assert.equal(await rowOf('acc_pa_adm_under'), undefined);
        // an Admin's mark on a row with a parent (no delete lifted it, or another session moved it since): refused, the row as stored (L2: the Undo never runs as a move)
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_site', parentAccountId: 'acc_pa_shell', accountTier: 'business_unit', restore: true }));
        assert.equal(res.statusCode, 409, res.body);
        assert.equal(errorOf(res), '“Itest Shell - Port Allen” was moved since the delete — not put back.');
        assert.equal((await rowOf('acc_pa_site')).accountTier, 'site', 'not the tier the mark sent');
    } finally { await paCleanup(); }
});

test("§0.198 — J1 and K1: an Admin's restore mark is honoured on a PUT only when the body names a parent, and a site is put back only with no account under it; a restore moves no deal — the critics' C1 shapes: a marked PUT naming no parent keeps the stored tier, its unit and its open deal as they were; a marked move as a site over a unit is refused; a marked move of an account holding an open deal is written as sent, its deal where it was (an Admin's mark alone)", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
        await seedAccount(PA, 'acc_pa_unit', 'Itest Shell - Port Allen', 'acc_pa_shell');
        await seedAccount(PA, 'acc_pa_dow', 'Itest Dow');
        await seedAccount(PA, 'acc_pa_ineos', 'Itest Ineos');
        await seedAccountDeal(PA, 'opp_pa_shell', 'Discovery', 'acc_pa_shell', 'Itest Shell');
        await seedAccountDeal(PA, 'opp_pa_dow', 'Discovery', 'acc_pa_dow', 'Itest Dow');
        const deal = async (id) => { const d = (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0]; return [d.accountId, d.account, d.site]; };
        // C1 (a): a top-level account no delete touched, a unit under it and an open deal on it — marked, naming no parent
        let res = await handler(ev(PA, 'PUT', { id: 'acc_pa_shell', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 200, res.body);
        let row = await rowOf('acc_pa_shell');
        assert.deepEqual([row.parentAccountId, row.accountTier], [null, 'account'], 'no parent named: an ordinary save — the stored tier, never a site at the top');
        assert.deepEqual([(await rowOf('acc_pa_unit')).parentAccountId, await tierOf('acc_pa_unit')], ['acc_pa_shell', 'business_unit'], 'its unit as it was');
        assert.deepEqual(await deal('opp_pa_shell'), ['acc_pa_shell', 'Itest Shell', null], 'its open deal as it was');
        // C1 (c): the same account marked under another as a site — a unit stands under it: refused, nothing written
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_shell', parentAccountId: 'acc_pa_ineos', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.equal(errorOf(res), "“Itest Shell” has accounts under it that would sit below a site — it can't go there.");
        row = await rowOf('acc_pa_shell');
        assert.deepEqual([row.parentAccountId, row.accountTier], [null, 'account']);
        // C1 (b): top-level Dow, an open deal on it, marked under Ineos as a site: a restore, written as sent — and K1: no deal moved
        res = await handler(ev(PA, 'PUT', { id: 'acc_pa_dow', parentAccountId: 'acc_pa_ineos', accountTier: 'site', restore: true }));
        assert.equal(res.statusCode, 200, res.body);
        row = await rowOf('acc_pa_dow');
        assert.deepEqual([row.parentAccountId, row.accountTier], ['acc_pa_ineos', 'site'], 'the parent and tier as sent');
        assert.deepEqual(await deal('opp_pa_dow'), ['acc_pa_dow', 'Itest Dow', null], 'its open deal where it was — a restore moves no deal (an Admin\'s mark alone reaches this; the Undo sends it only for a row its delete lifted)');
        assert.deepEqual(JSON.parse(res.body).liftedDeals, [], 'nothing handed back as moved');
    } finally { await paCleanup(); }
});

test("§0.198 — J1 and K1: the C2 race — a lifted account that gained a sub-account, or an open deal, between the delete and its Undo: the Undo's PUT refuses a site over the sub-account (nothing written), and puts a site an open deal came onto back exactly — the deal stays on it (a D22 edge, OPEN_ITEMS §4.2)", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_x', 'Itest X');
        await seedTier(PA, 'acc_pa_k', 'Itest K Site', 'acc_pa_x', 'site');
        await seedAccount(PA, 'acc_pa_x2', 'Itest X2');
        await seedTier(PA, 'acc_pa_k2', 'Itest K2 Site', 'acc_pa_x2', 'site');
        // a sub-account: another session puts a unit under the lifted K before the Undo
        let del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_x' }));
        assert.equal(del.statusCode, 200, del.body);
        let body = JSON.parse(del.body);
        assert.equal(await tierOf('acc_pa_k'), 'account', 'lifted');
        assert.equal((await handler(ev(PA, 'POST', { id: 'acc_pa_kk', name: 'Itest KK', parentAccountId: 'acc_pa_k' }))).statusCode, 201);
        let r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        const [k1] = body.children;
        r = await handler(ev(PA, 'PUT', { id: k1.id, parentAccountId: k1.parentAccountId, accountTier: k1.accountTier, restore: true }));
        assert.equal(r.statusCode, 400, r.body);
        assert.equal(errorOf(r), "“Itest K Site” has accounts under it that would sit below a site — it can't go there.");
        let k = await rowOf('acc_pa_k');
        assert.deepEqual([k.parentAccountId, k.accountTier], [null, 'account'], 'K stays where the lift left it — never a site over its unit');
        assert.deepEqual([(await rowOf('acc_pa_kk')).parentAccountId, await tierOf('acc_pa_kk')], ['acc_pa_k', 'business_unit']);
        // an open deal: another session links one to the lifted K2 before the Undo
        del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_x2' }));
        assert.equal(del.statusCode, 200, del.body);
        body = JSON.parse(del.body);
        await seedAccountDeal(PA, 'opp_pa_k2', 'Discovery', 'acc_pa_k2', 'Itest K2 Site');
        r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        const [k2] = body.children;
        r = await handler(ev(PA, 'PUT', { id: k2.id, parentAccountId: k2.parentAccountId, accountTier: k2.accountTier, restore: true }));
        assert.equal(r.statusCode, 200, r.body);
        assert.deepEqual(JSON.parse(r.body).liftedDeals, [], 'K1: the Undo moved no deal');
        k = await rowOf('acc_pa_k2');
        assert.deepEqual([k.parentAccountId, k.accountTier], ['acc_pa_x2', 'site'], 'back under X2, a site — exactly as stored');
        const d = (await db.select().from(opportunities).where(eq(opportunities.id, 'opp_pa_k2')))[0];
        assert.deepEqual([d.accountId, d.account, d.site], ['acc_pa_k2', 'Itest K2 Site', null], 'the deal linked in the seconds between stays on the site — changed by hand (OPEN_ITEMS §4.2, D22\'s edges)');
    } finally { await paCleanup(); }
});

test("§0.198 — K1: a delete's Undo moves no deal — a site holding an open deal with its own Site Name and a Closed Won deal before its parent's delete is put back exactly, both deals as they were (the critics' B2 and PROBE5-B: UKG's deals on sites stay until changed by hand)", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_x', 'Itest X');
        await seedTier(PA, 'acc_pa_k', 'Itest K Site', 'acc_pa_x', 'site');
        await seedAccountDeal(PA, 'opp_pa_open', 'Discovery', 'acc_pa_k', 'Itest K Site');
        await db.update(opportunities).set({ site: 'Itest Gate 3' }).where(eq(opportunities.id, 'opp_pa_open'));
        await seedAccountDeal(PA, 'opp_pa_won', 'Closed Won', 'acc_pa_k', 'Itest K Site');
        const deal = async (id) => { const d = (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0]; return [d.accountId, d.account, d.site, d.stage]; };
        const open = await deal('opp_pa_open'), won = await deal('opp_pa_won');
        assert.deepEqual(open, ['acc_pa_k', 'Itest K Site', 'Itest Gate 3', 'Discovery'], 'an open deal on the site, a Site Name of its own');
        assert.deepEqual(won, ['acc_pa_k', 'Itest K Site', null, 'Closed Won']);
        const del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_x' }));
        assert.equal(del.statusCode, 200, del.body);
        const body = JSON.parse(del.body);
        assert.deepEqual(body.children, [{ id: 'acc_pa_k', parentAccountId: 'acc_pa_x', accountTier: 'site' }], 'the site as stored');
        assert.equal(await tierOf('acc_pa_k'), 'account', 'lifted');
        assert.deepEqual([await deal('opp_pa_open'), await deal('opp_pa_won')], [open, won], 'the delete moved no deal');
        let r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        const [c] = body.children;
        r = await handler(ev(PA, 'PUT', { id: c.id, parentAccountId: c.parentAccountId, accountTier: c.accountTier, restore: true }));
        assert.equal(r.statusCode, 200, r.body);
        assert.deepEqual(JSON.parse(r.body).liftedDeals, [], 'the Undo moved no deal');
        const k = await rowOf('acc_pa_k');
        assert.deepEqual([k.parentAccountId, k.accountTier], ['acc_pa_x', 'site'], 'back under X, a site, exactly as stored');
        assert.deepEqual(await deal('opp_pa_open'), open, 'the open deal on the site as it was — its own Site Name kept');
        assert.deepEqual(await deal('opp_pa_won'), won, 'the Closed Won deal on the site as it was');
    } finally { await paCleanup(); }
});

test("§0.198 — K2: the Undo is refused over an account added under the lifted one since that would not rank below the tier put back — a business unit over a business unit (the critics' PROBE5-A; nothing written) — and stands over one that ranks above it: a business unit over a site", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_x', 'Itest X');
        await seedAccount(PA, 'acc_pa_k', 'Itest K Unit', 'acc_pa_x');
        await seedAccount(PA, 'acc_pa_y', 'Itest Y');
        await seedAccount(PA, 'acc_pa_j', 'Itest J Unit', 'acc_pa_y');
        assert.deepEqual([await tierOf('acc_pa_k'), await tierOf('acc_pa_j')], ['business_unit', 'business_unit']);
        // PROBE5-A: another session posts a unit under the lifted K before the Undo
        let del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_x' }));
        assert.equal(del.statusCode, 200, del.body);
        let body = JSON.parse(del.body);
        let r = await handler(ev(PA, 'POST', { id: 'acc_pa_kk', name: 'Itest KK', parentAccountId: 'acc_pa_k' }));
        assert.equal(r.statusCode, 201, r.body);
        assert.deepEqual([(await rowOf('acc_pa_kk')).parentAccountId, await tierOf('acc_pa_kk')], ['acc_pa_k', 'business_unit'], 'a unit under the lifted K, an account now');
        r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        let [c] = body.children;
        assert.deepEqual(c, { id: 'acc_pa_k', parentAccountId: 'acc_pa_x', accountTier: 'business_unit' });
        r = await handler(ev(PA, 'PUT', { id: c.id, parentAccountId: c.parentAccountId, accountTier: c.accountTier, restore: true }));
        assert.equal(r.statusCode, 400, r.body);
        assert.equal(errorOf(r), "“Itest K Unit” has an account under it that can't stand under a business unit — it can't be put back as one.");
        const k = await rowOf('acc_pa_k');
        assert.deepEqual([k.parentAccountId, k.accountTier], [null, 'account'], 'K stays where the lift left it — never a business unit over a business unit');
        assert.deepEqual([(await rowOf('acc_pa_kk')).parentAccountId, await tierOf('acc_pa_kk')], ['acc_pa_k', 'business_unit'], 'KK untouched');
        // a site added under the lifted J instead: a business unit over a site — put back as stored
        del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_y' }));
        assert.equal(del.statusCode, 200, del.body);
        body = JSON.parse(del.body);
        await seedTier(PA, 'acc_pa_js', 'Itest J Site', 'acc_pa_j', 'site');
        r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        [c] = body.children;
        r = await handler(ev(PA, 'PUT', { id: c.id, parentAccountId: c.parentAccountId, accountTier: c.accountTier, restore: true }));
        assert.equal(r.statusCode, 200, r.body);
        const j = await rowOf('acc_pa_j');
        assert.deepEqual([j.parentAccountId, j.accountTier], ['acc_pa_y', 'business_unit'], 'back under Y, a business unit, as stored');
        assert.deepEqual([(await rowOf('acc_pa_js')).parentAccountId, await tierOf('acc_pa_js')], ['acc_pa_j', 'site'], 'its site under it, a site');
    } finally { await paCleanup(); }
});

test("§0.198 — L2: a delete's Undo never runs as a move — the critics' S11: a lifted site that another session moved since the delete is not put back (409, nothing written), that session's move stands, and no deal moves (an open deal with a Site Name of its own and a Closed Won deal, each as it was)", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_g', 'Itest G');
        await seedAccount(PA, 'acc_pa_p', 'Itest P Unit', 'acc_pa_g');
        await seedTier(PA, 'acc_pa_k', 'Itest K Site', 'acc_pa_p', 'site');
        await seedAccount(PA, 'acc_pa_q', 'Itest Q');
        await seedAccountDeal(PA, 'opp_pa_open', 'Discovery', 'acc_pa_k', 'Itest K Site');
        await db.update(opportunities).set({ site: 'Itest Gate 7' }).where(eq(opportunities.id, 'opp_pa_open'));
        await seedAccountDeal(PA, 'opp_pa_won', 'Closed Won', 'acc_pa_k', 'Itest K Site');
        const deal = async (id) => { const d = (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0]; return [d.accountId, d.account, d.site, d.stage]; };
        const at = async (id) => { const a = await rowOf(id); return a ? `${a.accountTier}@${a.parentAccountId || '-'}` : 'GONE'; };
        assert.deepEqual([await at('acc_pa_p'), await at('acc_pa_k')], ['business_unit@acc_pa_g', 'site@acc_pa_p']);
        const open = await deal('opp_pa_open'), won = await deal('opp_pa_won');
        assert.deepEqual([open, won], [['acc_pa_k', 'Itest K Site', 'Itest Gate 7', 'Discovery'], ['acc_pa_k', 'Itest K Site', null, 'Closed Won']]);
        const del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_p' }));
        assert.equal(del.statusCode, 200, del.body);
        const body = JSON.parse(del.body);
        assert.deepEqual(body.children, [{ id: 'acc_pa_k', parentAccountId: 'acc_pa_p', accountTier: 'site' }], 'the site as stored');
        // another session moves the lifted K under Q before the Undo
        let r = await handler(ev(PA, 'PUT', { id: 'acc_pa_k', parentAccountId: 'acc_pa_q' }));
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(await at('acc_pa_k'), 'business_unit@acc_pa_q', 'an account moved under an account: a business unit');
        assert.deepEqual([await deal('opp_pa_open'), await deal('opp_pa_won')], [open, won], 'that move made no site: no deal moved');
        // the Undo, as useAccounts sends it: P posted back, then K re-saved under it — refused
        r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        const [c] = body.children;
        r = await handler(ev(PA, 'PUT', { id: c.id, parentAccountId: c.parentAccountId, accountTier: c.accountTier, restore: true }));
        assert.equal(r.statusCode, 409, r.body);
        assert.equal(errorOf(r), '“Itest K Site” was moved since the delete — not put back.');
        assert.deepEqual([await at('acc_pa_p'), await at('acc_pa_k')], ['business_unit@acc_pa_g', 'business_unit@acc_pa_q'], "P back as stored; K where the other session put it — the Undo taken in part, and said so");
        assert.deepEqual([await deal('opp_pa_open'), await deal('opp_pa_won')], [open, won], 'no deal moved: the open deal keeps its own Site Name, the Closed Won deal its account (run as a move, K became a site under P and D22 moved both deals up to P)');
    } finally { await paCleanup(); }
});

test('§0.198 — H1: an Admin\'s restore that would close a loop through a chain longer than any move allows (18 accounts) is refused — the whole chain is walked; nothing written', async () => {
    await paCleanup();
    try {
        await db.insert(accounts).values(Array.from({ length: 18 }, (_, i) => ({ id: `acc_pa_c${i}`, name: `Itest Chain ${i}`, orgId: PA, parentAccountId: i ? `acc_pa_c${i - 1}` : null, accountTier: 'business_unit' })));
        const res = await handler(ev(PA, 'PUT', { id: 'acc_pa_c0', parentAccountId: 'acc_pa_c17', accountTier: 'account', restore: true }));
        assert.equal(res.statusCode, 400, res.body);
        assert.equal(errorOf(res), "“Itest Chain 17” is under “Itest Chain 0” — an account can't be moved under one of its own sub-accounts or sites.");
        assert.equal((await rowOf('acc_pa_c0')).parentAccountId, null, 'no loop written');
    } finally { await paCleanup(); }
});

test("§0.198 — H2, J6 and K3: a delete answers its row as stored and each sub-account as stored when its write ran (its parent, its tier) — the delete, the promotion and the tiers one write; the Undo re-sending exactly those puts each deleted row and each promoted sub-account back as it was — its parent, its tier and its owner: an owned row its owner, an unassigned row unassigned (never the Admin who pressed Undo), a row whose owner left the org since unassigned with no owner name, no territory rule met again; a deleted row's created date is the Undo's, not put back (OPEN_ITEMS §4.2), a promoted sub-account's its own", async () => {
    await paCleanup();
    const { settings } = await import('../../db/schema.js');
    const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
    const ownerCleanup = async () => {
        await db.delete(users).where(eq(users.orgId, PA));
        await db.delete(settings).where(eq(settings.orgId, PA));
        invalidateRoster(PA);
    };
    try {
        await ownerCleanup();
        await shellFamily();
        await seedAccount(PA, 'acc_pa_loose', 'Itest Loose Co');
        await db.insert(accounts).values({ id: 'acc_pa_site', name: 'Itest Shell - Port Allen', orgId: PA, parentAccountId: 'acc_pa_shell', accountTier: 'site' });
        // the Admin who deletes and presses Undo is a member — a create's stamp would name them — and a rep owns Shell
        await db.insert(users).values([
            { id: 'usr_itest_pa_admin', clerkUserId: 'u_' + PA, name: 'Itest PA Admin', email: 'itest-pa-admin@example.test', role: 'Admin', active: true, orgId: PA },
            { id: 'usr_itest_pa_rep', clerkUserId: 'u_rep_' + PA, name: 'Itest PA Rep', email: 'itest-pa-rep@example.test', role: 'User', active: true, orgId: PA },
            { id: 'usr_itest_pa_gone', clerkUserId: 'u_gone_' + PA, name: 'Itest PA Gone', email: 'itest-pa-gone@example.test', role: 'User', active: true, orgId: PA },
        ]);
        await db.update(accounts).set({ ownerId: 'usr_itest_pa_rep', accountOwner: 'Itest PA Rep', assignedRep: 'Itest PA Rep', assignedTerritory: 'Itest East' }).where(eq(accounts.id, 'acc_pa_shell'));
        // K3: an account whose owner leaves the org between its delete and the Undo
        await seedAccount(PA, 'acc_pa_gone', 'Itest Gone Co');
        await db.update(accounts).set({ ownerId: 'usr_itest_pa_gone', accountOwner: 'Itest PA Gone', assignedRep: 'Itest PA Gone' }).where(eq(accounts.id, 'acc_pa_gone'));
        // every row created long before the delete (a constant written — never a date read back)
        await db.update(accounts).set({ createdAt: new Date('2025-01-02T03:04:05.678Z') }).where(eq(accounts.orgId, PA));
        // a territory rule that names every "Itest" account with no territory the Gulf's, and the rep's
        await db.insert(settings).values({ id: 'itest_parent_acc_settings_A', orgId: PA, extra: { assignmentRules: [{ field: 'name', contains: 'itest', territory: 'Itest Gulf', rep: 'Itest PA Rep' }] } });
        invalidateRoster(PA);
        const ids = ['acc_pa_shell', 'acc_pa_unit', 'acc_pa_site', 'acc_pa_tank', 'acc_pa_loose'];
        const before = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await rowOf(id)])));
        assert.deepEqual([before.acc_pa_loose.ownerId, before.acc_pa_loose.accountOwner, before.acc_pa_loose.assignedTerritory], [null, null, null], 'an unassigned row among those deleted');
        const loose = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_loose' }));
        assert.equal(loose.statusCode, 200, loose.body);
        const goneCo = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_gone' }));
        assert.equal(goneCo.statusCode, 200, goneCo.body);
        await db.delete(users).where(eq(users.id, 'usr_itest_pa_gone'));
        invalidateRoster(PA);
        const del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_shell' }));
        assert.equal(del.statusCode, 200, del.body);
        const body = JSON.parse(del.body);
        assert.deepEqual([body.deleted.id, body.deleted.name, body.deleted.parentAccountId, body.deleted.accountTier, body.deleted.orgId], ['acc_pa_shell', 'Itest Shell', null, 'account', PA], 'the row as it was stored');
        assert.deepEqual([...body.children].sort((a, b) => a.id.localeCompare(b.id)), [
            { id: 'acc_pa_site', parentAccountId: 'acc_pa_shell', accountTier: 'site' },
            { id: 'acc_pa_unit', parentAccountId: 'acc_pa_shell', accountTier: 'business_unit' },
        ], 'each sub-account as stored before the write — not as the promotion left it');
        assert.equal(await tierOf('acc_pa_site'), 'account', 'the delete lifted it');
        // the Undo, as useAccounts sends it now: exactly the answers
        let r = await handler(ev(PA, 'POST', { ...JSON.parse(loose.body).deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        const looseBack = JSON.parse(r.body).account;
        r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        const shellBack = JSON.parse(r.body).account;
        for (const c of body.children) {
            r = await handler(ev(PA, 'PUT', { id: c.id, parentAccountId: c.parentAccountId, accountTier: c.accountTier, restore: true }));
            assert.equal(r.statusCode, 200, r.body);
        }
        const kept = (a) => [a.parentAccountId, a.accountTier, a.name, a.ownerId, a.accountOwner, a.assignedRep, a.assignedTerritory];
        for (const id of ids) assert.deepEqual(kept(await rowOf(id)), kept(before[id]), `${id}: back as it was — parent, tier, name, owner id and name, rep, territory`);
        // the created date, each compared with a date the same driver read or a request answered — never an absolute
        // one: it reads a `timestamp without time zone` in the process's own time zone (state §0.91). A promoted
        // sub-account was never deleted and keeps its own; a deleted row comes back dated the Undo, the column's
        // default — the date its restore answered, later than the one its delete answered (OPEN_ITEMS §4.2)
        for (const id of ['acc_pa_unit', 'acc_pa_site', 'acc_pa_tank']) assert.equal((await rowOf(id)).createdAt.getTime(), before[id].createdAt.getTime(), `${id}: its own created date`);
        for (const [id, deleted, back] of [['acc_pa_loose', JSON.parse(loose.body).deleted, looseBack], ['acc_pa_shell', body.deleted, shellBack]]) {
            assert.equal((await rowOf(id)).createdAt.getTime(), Date.parse(back.createdAt), `${id}: the date its restore answered`);
            assert.ok(Date.parse(back.createdAt) - Date.parse(deleted.createdAt) > 86400000, `${id}: dated the Undo, not the date it was created`);
        }
        // K3: its owner left the org since — unassigned, and no owner name with no owner; the rest as stored
        r = await handler(ev(PA, 'POST', { ...JSON.parse(goneCo.body).deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        const gone = await rowOf('acc_pa_gone');
        assert.deepEqual([gone.ownerId, gone.accountOwner, gone.assignedRep, gone.parentAccountId, gone.accountTier], [null, null, 'Itest PA Gone', null, 'account'], 'no owner id, no owner name; its rep and tier as stored');
        const nobody = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_nobody' }));
        assert.equal(nobody.statusCode, 404, 'an unknown id: 404, nothing written');
    } finally { await ownerCleanup(); await paCleanup(); }
});

test("§0.198 — J3: every write of a delete's batch is keyed to the rows as they stand when it runs — a delete another session's delete beat writes nothing and answers 404 (no tier its read worked out lands on a row moved since); a sub-account added between the read and the write is lifted and answered; a row stored before the rule below a lifted one is re-fitted, held to its chain — and the Undo does not put that one back (OPEN_ITEMS §4.2)", async () => {
    await paCleanup();
    const real = db.batch;
    try {
        // P; C, an account stored under it before the rule; G, an account under C (a misfit too); Q
        await db.insert(accounts).values([
            { id: 'acc_pa_p', name: 'Itest P', orgId: PA, parentAccountId: null, accountTier: 'account' },
            { id: 'acc_pa_c', name: 'Itest C', orgId: PA, parentAccountId: 'acc_pa_p', accountTier: 'account' },
            { id: 'acc_pa_g', name: 'Itest G', orgId: PA, parentAccountId: 'acc_pa_c', accountTier: 'account' },
            { id: 'acc_pa_q', name: 'Itest Q', orgId: PA, parentAccountId: null, accountTier: 'account' },
        ]);
        const at = async (id) => { const a = await rowOf(id); return a ? `${a.accountTier}@${a.parentAccountId || '-'}` : 'GONE'; };
        // another session, between this delete's read and its write: its own delete of P (C lifted, G re-fitted a
        // unit, as the rule does), then C moved under Q (a unit, G a site under it)
        db.batch = async (list) => {
            db.batch = real;
            await db.delete(accounts).where(eq(accounts.id, 'acc_pa_p'));
            await db.update(accounts).set({ parentAccountId: null, accountTier: 'account' }).where(eq(accounts.id, 'acc_pa_c'));
            await db.update(accounts).set({ accountTier: 'business_unit' }).where(eq(accounts.id, 'acc_pa_g'));
            const moved = await handler(ev(PA, 'PUT', { id: 'acc_pa_c', parentAccountId: 'acc_pa_q' }));
            assert.equal(moved.statusCode, 200, moved.body);
            return real.call(db, list);
        };
        const del = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_p' }));
        db.batch = real;
        assert.equal(del.statusCode, 404, del.body);
        assert.deepEqual([await at('acc_pa_c'), await at('acc_pa_g')], ['business_unit@acc_pa_q', 'site@acc_pa_c'], "where the other session's move put them — nothing of this delete's read written (before: G a unit under the unit C)");
        // the write itself: P2 > C2 (an account, stored before the rule) > G2 (an account); a site K2 added under P2 between the read and the write
        await db.insert(accounts).values([
            { id: 'acc_pa_p2', name: 'Itest P2', orgId: PA, parentAccountId: null, accountTier: 'account' },
            { id: 'acc_pa_c2', name: 'Itest C2', orgId: PA, parentAccountId: 'acc_pa_p2', accountTier: 'account' },
            { id: 'acc_pa_g2', name: 'Itest G2', orgId: PA, parentAccountId: 'acc_pa_c2', accountTier: 'account' },
        ]);
        db.batch = async (list) => {
            db.batch = real;
            const added = await handler(ev(PA, 'POST', { id: 'acc_pa_k2', name: 'Itest K2', parentAccountId: 'acc_pa_p2', accountTier: 'site' }));
            assert.equal(added.statusCode, 201, added.body);
            return real.call(db, list);
        };
        const del2 = await handler(ev(PA, 'DELETE', null, { id: 'acc_pa_p2' }));
        db.batch = real;
        assert.equal(del2.statusCode, 200, del2.body);
        const body = JSON.parse(del2.body);
        assert.deepEqual([...body.children].sort((a, b) => a.id.localeCompare(b.id)), [
            { id: 'acc_pa_c2', parentAccountId: 'acc_pa_p2', accountTier: 'account' },
            { id: 'acc_pa_k2', parentAccountId: 'acc_pa_p2', accountTier: 'site' },
        ], 'each sub-account as it stood when the write ran — the one added after the read included');
        assert.deepEqual([...body.retiered].sort((a, b) => a.id.localeCompare(b.id)), [
            { id: 'acc_pa_g2', accountTier: 'business_unit' }, { id: 'acc_pa_k2', accountTier: 'account' },
        ], 'what it wrote: the added site lifted an account, and the row stored before the rule below C2 re-fitted a unit');
        assert.deepEqual([await at('acc_pa_c2'), await at('acc_pa_g2'), await at('acc_pa_k2')], ['account@-', 'business_unit@acc_pa_c2', 'account@-']);
        // the Undo re-sends the answer: P2 back, C2 and K2 under it as stored; G2 keeps the tier the lift gave it
        let r = await handler(ev(PA, 'POST', { ...body.deleted, restore: true }));
        assert.equal(r.statusCode, 201, r.body);
        for (const c of body.children) {
            r = await handler(ev(PA, 'PUT', { id: c.id, parentAccountId: c.parentAccountId, accountTier: c.accountTier, restore: true }));
            assert.equal(r.statusCode, 200, r.body);
        }
        assert.deepEqual([await at('acc_pa_p2'), await at('acc_pa_c2'), await at('acc_pa_k2'), await at('acc_pa_g2')], ['account@-', 'account@acc_pa_p2', 'site@acc_pa_p2', 'business_unit@acc_pa_c2'], 'each deleted row and each promoted sub-account as stored; the deeper re-fit stays (OPEN_ITEMS §4.2)');
    } finally { db.batch = real; await paCleanup(); }
});

test("§0.198 — H7: a stale rail's save that touched only Notes sends no parent (its Parent field untouched) — the account stays where another session moved it, its old parent merged away since, and the note is saved", async () => {
    await paCleanup();
    try {
        await seedAccount(PA, 'acc_pa_shell', 'Itest Shell');
        await seedAccount(PA, 'acc_pa_old', 'Itest Old Parent');
        await seedAccount(PA, 'acc_pa_x', 'Itest X', 'acc_pa_old');
        const loaded = await rowOf('acc_pa_x');   // the rail opens on X under Old Parent
        // another session moves X under Shell, then merges Old Parent away
        let r = await handler(ev(PA, 'PUT', { id: 'acc_pa_x', parentAccountId: 'acc_pa_shell' }));
        assert.equal(r.statusCode, 200, r.body);
        await db.update(accounts).set({ mergeArchived: true, mergedIntoId: 'acc_pa_shell' }).where(eq(accounts.id, 'acc_pa_old'));
        // the stale rail's Save, Notes only: the row it opened with, less the Parent nobody touched
        const { parentAccountId: _untouched, ...sent } = loaded;
        r = await handler(ev(PA, 'PUT', { ...sent, notes: 'typed a note' }));
        assert.equal(r.statusCode, 200, r.body);
        const x = await rowOf('acc_pa_x');
        assert.deepEqual([x.parentAccountId, x.accountTier, x.notes], ['acc_pa_shell', 'business_unit', 'typed a note'], 'where the other session put it; the note saved');
        // the rail's body before H7 — the parent it opened with — read as a move, and refused
        r = await handler(ev(PA, 'PUT', { ...loaded, notes: 'again' }));
        assert.equal(r.statusCode, 400, r.body);
        assert.match(errorOf(r), /merged into another account/);
    } finally { await paCleanup(); }
});
