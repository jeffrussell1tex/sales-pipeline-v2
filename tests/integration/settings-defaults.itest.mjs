// tests/integration/settings-defaults.itest.mjs
// The server keeps the defaults (state §0.170), against the real test database.
// Until §0.170 the defaults reached a workspace's row only through the app's
// autosave; with it gone, settings.mjs fills them in itself.
//
// Proves: a workspace with no row reads null (the app paints the same shared
// defaults); a key a workspace has never saved reads as the shared default —
// including on a row another endpoint created (integration requests); a key it
// saved, even as null or empty, is its own; an older row's own stages and pain
// point columns come first; a new workspace's first save writes the defaults
// beside the key it saves; a save over stored keys never puts the defaults
// back; and org B's row and reads are untouched by all of A's.
//
// The auth mock fakes the SIGN-IN only (in-org.itest.mjs's pattern); the
// handler, its role gate and its queries are the real ones.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: `clerk_itest_sdef_${userRole}_${orgId}`, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});

const { handler } = await import('../../netlify/functions/settings.mjs');
const { DEFAULT_SETTINGS, SEEDED_KEYS } = await import('../../src/utils/settingsDefaults.js');
const { db } = await import('../../db/index.js');
const { settings, auditLog } = await import('../../db/schema.js');
const { eq, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_sdef_*'.
const A    = 'itest_sdef_A';      // saved its own values, some as null or empty
const B    = 'itest_sdef_B';      // the other org: must see none of A, and stay as it was
const NEW  = 'itest_sdef_new';    // no row at all
const REQ  = 'itest_sdef_req';    // a row integration-requests.mjs created: nothing but its key
const OLD  = 'itest_sdef_old';    // an older row: stages and pain points in their own columns
const ORGS = [A, B, NEW, REQ, OLD];

const call = async (org, method, body, role = 'Admin') => {
    const res = await handler({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': role, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: {},
    });
    return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
};
const rowOf = async (org) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0];

const A_PIPELINES = [{ id: 'pl_itest_sdef_a', name: 'A Renewals', stages: ['Open', 'Won'] }];
const A_KPI = { winRate: { good: 40, warn: 20 } };
const B_PIPELINES = [{ id: 'pl_itest_sdef_b', name: 'B Only Pipeline', stages: ['Lead', 'Closed'] }];
const OLD_STAGES = [{ name: 'Old Qualify', weight: 20 }, { name: 'Old Close', weight: 90 }];

const cleanup = async () => {
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
    await db.delete(settings).where(inArray(settings.orgId, ORGS));
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const now = new Date();
    await db.insert(settings).values([
        // A saved pipelines and KPIs, and saved the quota plan as null and pain points empty.
        { id: A, orgId: A, extra: { pipelines: A_PIPELINES, kpiConfig: A_KPI, quotaData: null, painPoints: [], funnelStages: [] }, updatedAt: now },
        { id: B, orgId: B, companyName: 'B Corp', extra: { pipelines: B_PIPELINES, competitors: ['B Rival'] }, updatedAt: now },
        // What integration-requests.mjs writes for a workspace with no row: its key, the columns at their defaults.
        { id: REQ, orgId: REQ, extra: { integrationRequests: { hubspot: { appId: 'hubspot', requestedAt: now.toISOString() } } }, updatedAt: now },
        { id: OLD, orgId: OLD, stages: OLD_STAGES, painPoints: ['Old pain'], extra: {}, updatedAt: now },
    ]);
});
after(cleanup);

test('a workspace with no settings row reads null — the app paints the same shared defaults', async () => {
    const { status, body } = await call(NEW, 'GET');
    assert.equal(status, 200);
    assert.equal(body.settings, null);
});

test('a key a workspace has never saved reads as the shared default — on a row another endpoint created too', async () => {
    const { status, body } = await call(REQ, 'GET');
    assert.equal(status, 200, JSON.stringify(body));
    const s = body.settings;
    for (const k of SEEDED_KEYS) assert.deepEqual(s[k], DEFAULT_SETTINGS[k], `${k}: the default, not null`);
    assert.equal(s.integrationRequests.hubspot.appId, 'hubspot', 'the row\'s own key is still there');
});

test('a key the workspace saved is its own — even as null or empty', async () => {
    const s = (await call(A, 'GET')).body.settings;
    assert.deepEqual(s.pipelines, A_PIPELINES);
    assert.deepEqual(s.kpiConfig, A_KPI);
    assert.equal(s.quotaData, null, 'saved as null: no default in its place');
    assert.deepEqual(s.painPoints, [], 'saved empty: what the workspace cleared stays cleared');
    assert.deepEqual(s.funnelStages, []);
    assert.deepEqual(s.companyProfile, DEFAULT_SETTINGS.companyProfile, 'never saved: the default');
    assert.ok(!JSON.stringify(s).includes('B Only Pipeline') && !JSON.stringify(s).includes('B Rival'), 'nothing of org B');
});

test("an older row's own stages and pain point columns come before the defaults", async () => {
    const s = (await call(OLD, 'GET')).body.settings;
    assert.deepEqual(s.funnelStages, OLD_STAGES);
    assert.deepEqual(s.painPoints, ['Old pain']);
    assert.deepEqual(s.pipelines, DEFAULT_SETTINGS.pipelines);
});

test("a new workspace's first save writes the defaults beside the key it saves", async () => {
    const { status, body } = await call(NEW, 'PUT', { competitors: ['Acme Rival'] });
    assert.equal(status, 200, JSON.stringify(body));
    const row = await rowOf(NEW);
    assert.ok(row, 'the save created the row');
    assert.deepEqual(row.extra.competitors, ['Acme Rival']);
    for (const k of SEEDED_KEYS) assert.deepEqual(row.extra[k], DEFAULT_SETTINGS[k], `${k}: written as the default, not null`);
    assert.deepEqual(row.verticalMarkets, DEFAULT_SETTINGS.verticalMarkets, 'a new row takes the default markets');
    const s = (await call(NEW, 'GET')).body.settings;
    assert.deepEqual(s.pipelines, DEFAULT_SETTINGS.pipelines, 'and reads them back');
});

test('a save over a row another endpoint created writes the defaults and keeps that endpoint\'s key', async () => {
    const { status } = await call(REQ, 'PUT', { reasonsWon: ['Price'] });
    assert.equal(status, 200);
    const row = await rowOf(REQ);
    assert.equal(row.extra.integrationRequests.hubspot.appId, 'hubspot');
    assert.deepEqual(row.extra.reasonsWon, ['Price']);
    for (const k of SEEDED_KEYS) assert.deepEqual(row.extra[k], DEFAULT_SETTINGS[k], k);
});

test('a save keeps what the workspace stored — the defaults never go back over it', async () => {
    const bBefore = await rowOf(B);
    const { status } = await call(A, 'PUT', { competitors: ['A Rival'] });
    assert.equal(status, 200);
    const row = await rowOf(A);
    assert.deepEqual(row.extra.pipelines, A_PIPELINES);
    assert.deepEqual(row.extra.kpiConfig, A_KPI);
    assert.equal(row.extra.quotaData, null, 'saved as null, kept as null');
    assert.deepEqual(row.extra.painPoints, []);
    assert.deepEqual(row.extra.funnelStages, []);
    assert.deepEqual(row.extra.companyProfile, DEFAULT_SETTINGS.companyProfile, 'never saved: written as the default now');

    const bAfter = await rowOf(B);
    assert.deepEqual(bAfter.extra, bBefore.extra, "org B's row is untouched by A's save");
    const sB = (await call(B, 'GET')).body.settings;
    assert.deepEqual(sB.pipelines, B_PIPELINES);
    assert.deepEqual(sB.competitors, ['B Rival']);
    assert.ok(!JSON.stringify(sB).includes('A Renewals') && !JSON.stringify(sB).includes('A Rival'), 'nothing of org A');
});

test('only an Admin saves settings — a Manager\'s save writes nothing, defaults included', async () => {
    const before = await rowOf(OLD);
    const { status } = await call(OLD, 'PUT', { competitors: ['Mgr'] }, 'Manager');
    assert.equal(status, 403);
    const after = await rowOf(OLD);
    assert.deepEqual(after.extra, before.extra, 'no defaults written by a refused save');
});
