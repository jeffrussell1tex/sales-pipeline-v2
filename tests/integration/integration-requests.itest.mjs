// tests/integration/integration-requests.itest.mjs
// Integration requests against the real database (state §0.90, handoff item
// 24 — Jeff: "option a"). Proves: a request is recorded on the org's settings
// row under integrationRequests and audited; a second request for the same app
// is idempotent (first timestamp kept, no second audit row); an id outside the
// catalogue is refused; a ReadOnly caller is refused; a workspace with no
// settings row gets one; the mail is skipped (notified:false) when
// INTEGRATION_REQUESTS_TO is unset and attempted through the mailer when it is
// set; and org B sees nothing of org A.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
delete process.env.INTEGRATION_REQUESTS_TO;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || 'clerk_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole) ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (['ReadOnly', 'Technician'].includes(auth?.userRole)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            return null;
        },
    },
});

// The mailer is mocked so no request leaves the process: it records the calls.
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (opts) => { mails.push(opts); return { success: true, id: 'test' }; },
        emailTemplates: {},
    },
});

const { handler } = await import('../../netlify/functions/integration-requests.mjs');
const { db } = await import('../../db/index.js');
const { settings, auditLog, users } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_intreq_A';
const ORG_B = 'itest_intreq_B';

const call = (org, body, { role, user } = {}) => handler({
    httpMethod: 'POST',
    headers: { 'x-test-org': org, ...(role ? { 'x-test-role': role } : {}), ...(user ? { 'x-test-user': user } : {}) },
    body: JSON.stringify(body),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });

const cleanup = async () => {
    for (const o of [ORG_A, ORG_B]) {
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    // Org A has a settings row with a company name and an unrelated extra key;
    // org B has none — the endpoint must create one without touching A.
    await db.insert(settings).values({ id: ORG_A, orgId: ORG_A, companyName: 'Alpha Co', extra: { slackConfig: { webhookUrl: 'https://hooks.slack.com/x' } }, updatedAt: new Date() });
    await db.insert(users).values({ id: 'usr_intreq_a1', orgId: ORG_A, clerkUserId: 'clerk_' + ORG_A, name: 'Ada Admin', email: 'ada@alpha.test', role: 'Admin' });
});
after(cleanup);

const extraOf = async (org) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0]?.extra || {};
const auditsOf = async (org) => db.select().from(auditLog).where(and(eq(auditLog.orgId, org), eq(auditLog.action, 'integration.requested')));

test('a request is recorded on the org, audited with the caller, and not mailed when no owner address is set', async () => {
    const { status, body } = parse(await call(ORG_A, { appId: 'hubspot', note: 'We run marketing in HubSpot.' }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.already, false);
    assert.equal(body.notified, false, 'INTEGRATION_REQUESTS_TO is unset in this run');
    assert.equal(body.request.appId, 'hubspot');
    assert.equal(body.request.byName, 'Ada Admin', 'the requester is resolved through users.clerk_user_id');
    assert.equal(body.request.note, 'We run marketing in HubSpot.');

    const extra = await extraOf(ORG_A);
    assert.equal(extra.integrationRequests.hubspot.requestedAt, body.request.requestedAt);
    assert.deepEqual(extra.slackConfig, { webhookUrl: 'https://hooks.slack.com/x' }, 'the other extra keys survive the write');

    const audits = await auditsOf(ORG_A);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].entityId, 'hubspot');
    assert.equal(audits[0].userName, 'Ada Admin');
    assert.equal(audits[0].detail, 'We run marketing in HubSpot.');
    assert.equal(mails.length, 0);
});

test('a second request for the same app is idempotent — first timestamp kept, no second audit row', async () => {
    const first = (await extraOf(ORG_A)).integrationRequests.hubspot.requestedAt;
    const { status, body } = parse(await call(ORG_A, { appId: 'hubspot' }));
    assert.equal(status, 200);
    assert.equal(body.already, true);
    assert.equal(body.request.requestedAt, first);
    assert.equal((await auditsOf(ORG_A)).length, 1);
});

test('an app outside the catalogue is refused, and so is a read-only caller', async () => {
    assert.equal(parse(await call(ORG_A, { appId: 'morgan-reyes' })).status, 400);
    assert.equal(parse(await call(ORG_A, { appId: '' })).status, 400);
    assert.equal(parse(await call(ORG_A, { appId: 'zoom' }, { role: 'ReadOnly' })).status, 403);
    assert.equal(parse(await call(ORG_A, { appId: 'zoom' }, { role: 'Technician' })).status, 403);
    assert.equal((await extraOf(ORG_A)).integrationRequests.zoom, undefined);
});

test('the mail is attempted through the shared mailer when an owner address is set, and its failure does not lose the request', async () => {
    process.env.INTEGRATION_REQUESTS_TO = 'owner@example.test';
    try {
        const { status, body } = parse(await call(ORG_A, { appId: 'zapier' }));
        assert.equal(status, 200);
        assert.equal(body.notified, true);
        assert.equal(mails.length, 1);
        assert.equal(mails[0].to, 'owner@example.test');
        assert.match(mails[0].subject, /Zapier/);
        assert.match(mails[0].subject, /Alpha Co/);
        assert.match(mails[0].text, /Ada Admin <ada@alpha.test>/);
        assert.match(mails[0].text, /requested 2 integrations/);
    } finally {
        delete process.env.INTEGRATION_REQUESTS_TO;
    }
});

test('a workspace with no settings row gets one holding only the request; org A is untouched', async () => {
    const before = await extraOf(ORG_A);
    const { status, body } = parse(await call(ORG_B, { appId: 'stripe' }, { user: 'clerk_nobody' }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.request.byName, null, 'an unknown Clerk id resolves to no name, not an error');
    const rowB = (await db.select().from(settings).where(eq(settings.orgId, ORG_B)))[0];
    assert.ok(rowB, 'a settings row was created for org B');
    assert.equal(rowB.id, ORG_B, 'the same id/orgId shape settings.mjs uses');
    assert.deepEqual(Object.keys(rowB.extra), ['integrationRequests']);
    assert.deepEqual(await extraOf(ORG_A), before, 'org A did not change');
    assert.equal((await extraOf(ORG_A)).integrationRequests.stripe, undefined, 'org A does not see org B\'s request');
    assert.equal((await auditsOf(ORG_B)).length, 1);
});

test('a note is plain, short text', async () => {
    const long = 'x'.repeat(700) + '\u0007\n';   // a BEL and a newline: both must be flattened
    const { body } = parse(await call(ORG_B, { appId: 'gmail', note: long }));
    assert.equal(body.request.note.length, 500);
    assert.doesNotMatch(body.request.note, /[\u0000-\u001f\u007f]/);
});
