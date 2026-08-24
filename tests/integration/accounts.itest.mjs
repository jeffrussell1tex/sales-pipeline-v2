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
const { accounts } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

const A = 'itest_org_A', B = 'itest_org_B';
const ev = (org, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const cleanup = async () => { for (const o of [A, B]) await db.delete(accounts).where(eq(accounts.orgId, o)); };

before(cleanup);
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
