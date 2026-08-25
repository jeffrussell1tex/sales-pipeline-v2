// tests/integration/contacts.itest.mjs
//
// Object-level authorization on contacts, exercised AS A REP.
//
// This file exists because that path had never run. Every unit test, every
// integration stub and every manual session authenticated as Admin, which
// returns early from `canSeeAll(userRole)` and skips the ownership branch
// entirely. Underneath it, contacts.mjs had been asking for
// `contacts.createdBy` — a property that is not on the contacts table:
//
//   - single PUT and single DELETE  -> db.select({ owner: undefined }) threw
//                                      -> 500. Reps could not edit or delete a
//                                      contact at all.
//   - bulk PUT (ownerColumn)        -> bulkUpsert's `if (ownerColumn)` was
//                                      false, the owner was never projected, and
//                                      no row could be forbidden -> a rep could
//                                      overwrite EVERY contact in the org.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestSchema } from './_schema-guard.mjs';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        // Must export every name the endpoint imports — mock.module replaces the
        // module wholesale. A partial stub kills the file at import.
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            // The rep's display name is what ownership compares against, and it
            // is read from users.name by getCallerName — which this stub cannot
            // reach. The users row is seeded in before() instead, so the real
            // getCallerName resolves it exactly as it does in production.
            return { userId: event.headers?.['x-test-user'] || ('u_' + orgId), orgId, userRole, managedReps: [], error: null };
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

const { handler } = await import('../../netlify/functions/contacts.mjs');
const { db } = await import('../../db/index.js');
const { contacts, users } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

const ORG = 'itest_org_contacts';
const REP_ID = 'u_itest_rep', REP_NAME = 'Itest Rep';
const OTHER_NAME = 'Itest Other Rep';

const ev = (method, body, qs, { role = 'Admin', userId } = {}) => ({
    httpMethod: method,
    headers: {
        'x-test-org': ORG,
        'x-test-role': role,
        ...(userId ? { 'x-test-user': userId } : {}),
        'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const asRep = (method, body, qs) => ev(method, body, qs, { role: 'User', userId: REP_ID });

const seed = async (id, assignedRep) => {
    await handler(ev('POST', { id, firstName: 'C', lastName: id, assignedRep }));
};
const rowOf = async (id) => (await db.select().from(contacts).where(eq(contacts.id, id)))[0];

const cleanup = async () => {
    await db.delete(contacts).where(eq(contacts.orgId, ORG));
    await db.delete(users).where(eq(users.orgId, ORG));
};

before(async () => {
    // Fails one readable line if the TEST database is behind db/schema.ts.
    // Must come first: everything below seeds rows and would otherwise die
    // once per test with a raw Postgres 42703 and no instruction.
    await assertTestSchema(db);

    await cleanup();
    // resolveCaller() looks the caller up by CLERK_USER_ID, not by users.id.
    // Without this row the rep resolves to null and every ownership check fails
    // closed, which would make the 403 assertions below pass for entirely the
    // wrong reason.
    //
    // The two ids are DELIBERATELY DIFFERENT. users.id is app-owned since the
    // identity split; the Clerk id is an attribute. Seeding them equal would let
    // a code path that still looks up by users.id pass this suite unnoticed --
    // the fixture would agree with the bug. Different values make the lookup key
    // itself an assertion.
    await db.insert(users).values({
        id: 'usr_itest_contacts_rep',
        clerkUserId: REP_ID,
        name: REP_NAME, email: 'itest-rep@example.test',
        role: 'User', active: true, orgId: ORG,
    });
});
after(cleanup);

test('REGRESSION — a rep DELETING their own contact gets 200, not a 500', async () => {
    // The 500 was db.select({ owner: contacts.createdBy }) with createdBy
    // undefined. Any status other than 200 here means the ownership branch is
    // throwing again.
    await seed('ct_own_del', REP_NAME);
    const res = await handler(asRep('DELETE', null, { id: 'ct_own_del' }));
    assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.ok(!(await rowOf('ct_own_del')), 'the contact should be gone');
});

test('a rep DELETING an unassigned contact gets 200', async () => {
    await seed('ct_unowned_del', null);
    const res = await handler(asRep('DELETE', null, { id: 'ct_unowned_del' }));
    assert.equal(res.statusCode, 200, res.body);
});

test('a rep DELETING someone else\'s contact is refused, with the OWNERSHIP message', async () => {
    await seed('ct_other_del', OTHER_NAME);
    const res = await handler(asRep('DELETE', null, { id: 'ct_other_del' }));
    assert.equal(res.statusCode, 403);
    assert.match(JSON.parse(res.body).error, /your own or unassigned records/);
    // Distinct from the Admin role gate's message — the delete gate tells the
    // two apart by body, since both are 403.
    assert.doesNotMatch(JSON.parse(res.body).error, /insufficient role/);
    assert.ok(await rowOf('ct_other_del'), 'the contact must survive a refused delete');
});

test('REGRESSION — a rep EDITING their own contact gets through, not a 500', async () => {
    await seed('ct_own_put', REP_NAME);
    const res = await handler(asRep('PUT', { id: 'ct_own_put', title: 'Edited By Owner', assignedRep: REP_NAME }));
    assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${res.body}`);
    assert.equal((await rowOf('ct_own_put')).title, 'Edited By Owner');
});

test('a rep EDITING someone else\'s contact is refused and the row is unchanged', async () => {
    await seed('ct_other_put', OTHER_NAME);
    const res = await handler(asRep('PUT', { id: 'ct_other_put', title: 'HACKED', assignedRep: OTHER_NAME }));
    assert.equal(res.statusCode, 403);
    assert.notEqual((await rowOf('ct_other_put')).title, 'HACKED');
});

test('SECURITY REGRESSION — a rep cannot bulk-overwrite contacts owned by others', async () => {
    // This is the one that failed OPEN. ownerColumn was undefined, so bulkUpsert
    // never projected an owner, `prior.owner` was undefined, and the forbidden
    // branch could not fire: the whole org was writable by any rep.
    await seed('ct_bulk_mine',  REP_NAME);
    await seed('ct_bulk_other', OTHER_NAME);
    await seed('ct_bulk_free',  null);

    const res = await handler(asRep('PUT', [
        { id: 'ct_bulk_mine',  title: 'Mine Updated' },
        { id: 'ct_bulk_other', title: 'HACKED' },
        { id: 'ct_bulk_free',  title: 'Free Updated' },
    ]));
    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body);

    assert.deepEqual(body.forbidden, ['ct_bulk_other'], 'the other rep\'s row must be reported as forbidden');
    assert.equal((await rowOf('ct_bulk_other')).title, null, 'the other rep\'s row must be untouched');
    assert.equal((await rowOf('ct_bulk_mine')).title,  'Mine Updated');
    assert.equal((await rowOf('ct_bulk_free')).title,  'Free Updated');
});

test('an Admin is unaffected by ownership and may edit anyone\'s contact', async () => {
    await seed('ct_admin_put', OTHER_NAME);
    const res = await handler(ev('PUT', { id: 'ct_admin_put', title: 'Admin Edit', assignedRep: OTHER_NAME }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await rowOf('ct_admin_put')).title, 'Admin Edit');
});

test('a rep deleting an id that does not exist gets 404, not 403 — ids are not disclosed', async () => {
    const res = await handler(asRep('DELETE', null, { id: 'ct_does_not_exist' }));
    assert.equal(res.statusCode, 404, res.body);
});

test('clear=true stays Admin-only for a rep', async () => {
    await seed('ct_clear_guard', REP_NAME);
    const res = await handler(asRep('DELETE', null, { clear: 'true' }));
    assert.equal(res.statusCode, 403);
    assert.match(JSON.parse(res.body).error, /insufficient role/);
    assert.ok(await rowOf('ct_clear_guard'), 'nothing may be cleared by a rep');
});
