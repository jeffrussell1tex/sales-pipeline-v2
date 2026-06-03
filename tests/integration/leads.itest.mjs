// tests/integration/leads.itest.mjs
// Org-isolation for leads — including the regression guard for the clear-delete
// bug we fixed: org A clearing its leads must NOT wipe org B's leads.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: 'u_' + orgId, orgId, userRole: 'Admin', managedReps: [], error: null };
        },
        canSeeAll: () => true,
    },
});
// Webhooks / automations fire on lead create; stub them so the test makes no
// outbound calls and stays focused on org isolation.
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const { handler } = await import('../../netlify/functions/leads.mjs');
const { db } = await import('../../db/index.js');
const { leads } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

const A = 'itest_org_A', B = 'itest_org_B';
const ev = (org, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const get = async (org) => JSON.parse((await handler(ev(org, 'GET'))).body).leads || [];
const cleanup = async () => { for (const o of [A, B]) await db.delete(leads).where(eq(leads.orgId, o)); };

before(cleanup);
after(cleanup);

test('read isolation — A cannot see B leads', async () => {
    await handler(ev(A, 'POST', { id: 'lead_A1', firstName: 'A', source: 'Referral', status: 'New' }));
    await handler(ev(B, 'POST', { id: 'lead_B1', firstName: 'B', source: 'Referral', status: 'New' }));
    const ids = (await get(A)).map(l => l.id);
    assert.ok(ids.includes('lead_A1') && !ids.includes('lead_B1'), 'A sees only its own leads');
});

test('REGRESSION — A clearing its leads must NOT delete B\'s leads', async () => {
    await handler(ev(A, 'POST', { id: 'lead_A2', firstName: 'A2', status: 'New' }));
    await handler(ev(B, 'POST', { id: 'lead_B2', firstName: 'B2', status: 'New' }));
    await handler(ev(A, 'DELETE', null, { clear: 'true' }));   // the previously-unscoped path
    const bLeads = await get(B);
    assert.ok(bLeads.some(l => l.id === 'lead_B2'), 'org B\'s leads MUST survive org A\'s clear');
});

test('cross-tenant write — A cannot overwrite B\'s lead via upsert with B\'s id', async () => {
    await handler(ev(B, 'POST', { id: 'lead_B3', firstName: 'B Original', status: 'New' }));
    await handler(ev(A, 'PUT', { id: 'lead_B3', firstName: 'HACKED', status: 'Working' }));
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_B3'));
    assert.equal(row.firstName, 'B Original', 'B\'s lead must be unchanged by A');
    assert.equal(row.orgId, B);
});
