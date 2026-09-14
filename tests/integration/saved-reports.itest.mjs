// tests/integration/saved-reports.itest.mjs
// Saved reports: sharing, scheduled delivery, "Send now" (state §0.135)
// against the real test database. Proves: a rep reads their own reports and
// the shared ones and nothing else; an Admin reads the org; org B reads nothing
// of org A; a share toggle is a PARTIAL PUT that keeps the definition; an
// Admin's PUT keeps the OWNER; a stranger's PUT is 403; a schedule is stored
// in its allowlisted shape with recipients limited to THIS org's roster; a
// builder-style save (config: null) keeps the schedule; Send now runs the
// report over the OWNER's read of the org and mails the chosen member — with
// org B's deals nowhere in it — and stamps the schedule; a schedule with no
// recipients is refused, not sent.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'User';
            const userId = event.headers?.['x-test-user'] || 'clerk_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        isAppRole:    (r) => ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'].includes(r),
        isAdmin:      (role) => role === 'Admin',
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

// The mailer is recorded, never called; Slack reads the org's settings (none
// seeded) and answers false on its own.
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (opts) => { mails.push(opts); return { success: true, id: 'test' }; },
        emailTemplates: {
            reportDelivery: (d) => ({ subject: `REPORT ${d.name} ${d.period} ${d.count}`, html: `<div>${d.tableHtml}</div>` }),
        },
    },
});

const { handler } = await import('../../netlify/functions/saved-reports.mjs');
const { db } = await import('../../db/index.js');
const { savedReports, users, opportunities } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_sr_A', ORG_B = 'itest_sr_B';
const OWNER = 'clerk_itest_sr_owner', REP = 'clerk_itest_sr_rep', ADMIN = 'clerk_itest_sr_admin';
const OWNER_ROW = 'usr_itest_sr_owner', REP_ROW = 'usr_itest_sr_rep', ADMIN_ROW = 'usr_itest_sr_admin', B_ROW = 'usr_itest_sr_b';
const R_MINE = 'rpt_itest_sr_mine', R_SHARED = 'rpt_itest_sr_shared', R_REP = 'rpt_itest_sr_rep', R_B = 'rpt_itest_sr_b';

const call = (method, org, { body, params, role, user } = {}) => handler({
    httpMethod: method,
    queryStringParameters: params || {},
    headers: { 'x-test-org': org, 'x-test-user': user || OWNER, ...(role ? { 'x-test-role': role } : {}) },
    body: body ? JSON.stringify(body) : undefined,
});
const json = (r) => JSON.parse(r.body || '{}');

const cleanup = async () => {
    for (const o of [ORG_A, ORG_B]) {
        await db.delete(savedReports).where(eq(savedReports.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([
        { id: OWNER_ROW, orgId: ORG_A, clerkUserId: OWNER, name: 'Owner Person', email: 'owner@itest.local', role: 'User', active: true, profile: { userType: 'User' } },
        { id: REP_ROW,   orgId: ORG_A, clerkUserId: REP,   name: 'Rep Person',   email: 'rep@itest.local',   role: 'User', active: true, profile: { userType: 'User' } },
        { id: ADMIN_ROW, orgId: ORG_A, clerkUserId: ADMIN, name: 'Admin Person', email: 'admin@itest.local', role: 'Admin', active: true, profile: { userType: 'Admin' } },
        { id: B_ROW,     orgId: ORG_B, clerkUserId: 'clerk_itest_sr_b', name: 'B Person', email: 'b@itest.local', role: 'Admin', active: true, profile: { userType: 'Admin' } },
    ]);
    await db.insert(opportunities).values([
        { id: 'opp_itest_sr_1', opportunityName: 'Owner deal 1', pipelineId: 'default', stage: 'Proposal',  salesRep: 'Owner Person', arr: '40000', ownerId: OWNER_ROW, orgId: ORG_A },
        { id: 'opp_itest_sr_2', opportunityName: 'Owner deal 2', pipelineId: 'default', stage: 'Discovery', salesRep: 'Owner Person', arr: '10000', ownerId: OWNER_ROW, orgId: ORG_A },
        { id: 'opp_itest_sr_3', opportunityName: 'Rep deal',     pipelineId: 'default', stage: 'Proposal',  salesRep: 'Rep Person',   arr: '99000', ownerId: REP_ROW,   orgId: ORG_A },
        { id: 'opp_itest_sr_b', opportunityName: 'B deal',       pipelineId: 'default', stage: 'Proposal',  salesRep: 'Org B Rep',    arr: '77000', ownerId: B_ROW,     orgId: ORG_B },
    ]);
    await db.insert(savedReports).values([
        { id: R_MINE,   orgId: ORG_A, ownerId: OWNER, ownerName: 'Owner Person', name: 'Mine',      source: 'Opportunities', dims: [{ id: 'owner' }], metrics: [{ id: 'revenue' }, { id: 'deals' }], chartType: 'bar', filters: { period: 'all' }, config: null, isShared: false },
        { id: R_SHARED, orgId: ORG_A, ownerId: OWNER, ownerName: 'Owner Person', name: 'Shared',    source: 'Opportunities', dims: [{ id: 'stage' }], metrics: [{ id: 'deals' }], chartType: 'table', filters: { period: 'all' }, config: { note: 'kept' }, isShared: true },
        { id: R_REP,    orgId: ORG_A, ownerId: REP,   ownerName: 'Rep Person',   name: 'Rep only',  source: 'Opportunities', dims: [{ id: 'owner' }], metrics: [{ id: 'revenue' }], chartType: 'bar', filters: { period: 'all' }, config: null, isShared: false },
        { id: R_B,      orgId: ORG_B, ownerId: 'clerk_itest_sr_b', ownerName: 'B Person', name: 'B report', source: 'Opportunities', dims: [], metrics: [], chartType: 'bar', filters: null, config: null, isShared: true },
    ]);
    invalidateRoster();
});
after(async () => { await cleanup(); });

test('GET: a rep reads their own and the shared; an Admin reads the org; org B reads nothing of A', async () => {
    const rep = json(await call('GET', ORG_A, { user: REP })).reports.map(r => r.id).sort();
    assert.deepEqual(rep, [R_REP, R_SHARED].sort(), 'own + shared — never another member’s unshared report');
    const owner = json(await call('GET', ORG_A, { user: OWNER })).reports.map(r => r.id).sort();
    assert.deepEqual(owner, [R_MINE, R_SHARED].sort());
    const admin = json(await call('GET', ORG_A, { user: ADMIN, role: 'Admin' })).reports.map(r => r.id).sort();
    assert.deepEqual(admin, [R_MINE, R_REP, R_SHARED].sort(), 'an Admin reads the whole org');
    const b = json(await call('GET', ORG_B, { user: 'clerk_itest_sr_b', role: 'Admin' })).reports.map(r => r.id);
    assert.deepEqual(b, [R_B], 'org B: its own row only');
});

test('PUT is a partial merge: a share toggle keeps the definition; an Admin’s PUT keeps the owner; a stranger is 403; an unknown id is 404', async () => {
    const shared = await call('PUT', ORG_A, { user: OWNER, body: { id: R_MINE, isShared: true } });
    assert.equal(shared.statusCode, 200);
    const row = json(shared).report;
    assert.equal(row.isShared, true);
    assert.deepEqual(row.dims, [{ id: 'owner' }], 'the definition survived a two-key body');
    assert.deepEqual(row.metrics, [{ id: 'revenue' }, { id: 'deals' }]);
    assert.equal(row.ownerId, OWNER);
    // the rep can now read it
    const rep = json(await call('GET', ORG_A, { user: REP })).reports.map(r => r.id);
    assert.ok(rep.includes(R_MINE), 'shared: visible to the rep now');
    // an Admin renames it — the owner stays
    const renamed = json(await call('PUT', ORG_A, { user: ADMIN, role: 'Admin', body: { id: R_MINE, name: 'Mine, renamed' } })).report;
    assert.equal(renamed.name, 'Mine, renamed');
    assert.equal(renamed.ownerId, OWNER, 'REGRESSION: the old PUT re-stamped ownerId with the caller');
    assert.equal(renamed.isShared, true, 'the share survived the rename');
    // a stranger may not
    assert.equal((await call('PUT', ORG_A, { user: REP, body: { id: R_MINE, name: 'stolen' } })).statusCode, 403);
    assert.equal((await call('PUT', ORG_A, { user: OWNER, body: { id: 'rpt_itest_sr_nope', name: 'x' } })).statusCode, 404);
    // unshare again for the tests below
    assert.equal(json(await call('PUT', ORG_A, { user: OWNER, body: { id: R_MINE, isShared: false } })).report.isShared, false);
    // org B cannot touch A's row by id
    assert.equal((await call('PUT', ORG_B, { user: 'clerk_itest_sr_b', role: 'Admin', body: { id: R_MINE, name: 'from B' } })).statusCode, 404);
});

test('a schedule is stored in its allowlisted shape; recipients outside this org’s roster are dropped; a builder-style save keeps it', async () => {
    const r = await call('PUT', ORG_A, { user: OWNER, body: { id: R_MINE, delivery: { enabled: true, cadence: 'weekly', hour: 8, weekday: 1, timezone: 'America/Chicago', emailTo: [REP_ROW, B_ROW, 'usr_nobody'], slack: false, orgId: ORG_B, lastDeliveredAt: '2020-01-01T00:00:00.000Z' } } });
    assert.equal(r.statusCode, 200);
    const d = json(r).report.config.delivery;
    assert.deepEqual(d, { enabled: true, cadence: 'weekly', hour: 8, weekday: 1, dayOfMonth: 1, timezone: 'America/Chicago', emailTo: [REP_ROW], slack: false, lastDeliveredAt: null, lastError: null },
        'the allowlisted shape; org B’s member and a stranger dropped; a client cannot write the job’s stamp');
    // the builder saves the report in place with config: null — the schedule stays
    const saved = json(await call('PUT', ORG_A, { user: OWNER, body: { id: R_MINE, name: 'Mine', source: 'Opportunities', dims: [{ id: 'owner' }], metrics: [{ id: 'revenue' }, { id: 'deals' }], chartType: 'bar', description: null, config: null, filters: { period: 'all' } } })).report;
    assert.equal(saved.config?.delivery?.enabled, true, 'REGRESSION: a builder save must not wipe the schedule');
    assert.deepEqual(saved.config.delivery.emailTo, [REP_ROW]);
    // and a config with its own keys merges beside it
    const merged = json(await call('PUT', ORG_A, { user: OWNER, body: { id: R_SHARED, config: { extra: 1 } } })).report;
    assert.deepEqual(merged.config, { note: 'kept', extra: 1 });
});

test('Send now runs the report over the OWNER’s read and mails the chosen member — org B’s deal nowhere — and stamps the schedule', async () => {
    mails.length = 0;
    const r = await call('POST', ORG_A, { user: OWNER, params: { action: 'deliver', id: R_MINE }, body: {} });
    assert.equal(r.statusCode, 200, r.body);
    const out = json(r);
    assert.deepEqual(out.sent, { email: ['rep@itest.local'], slack: false });
    assert.deepEqual(out.errors, []);
    assert.equal(out.rows, 2, 'the owner is a User: their own two deals, not the rep’s and not org B’s');
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, 'rep@itest.local');
    assert.match(mails[0].subject, /^REPORT Mine All time 2$/);
    assert.ok(mails[0].html.includes('Owner Person') && mails[0].html.includes('$50K'), 'the owner’s deals, summed');
    assert.ok(!mails[0].html.includes('Org B Rep') && !mails[0].html.includes('Rep Person'), 'nothing of org B, nothing of another rep');
    assert.ok(out.delivery.lastDeliveredAt, 'stamped');
    assert.equal(out.delivery.lastError, null);
    const [row] = await db.select().from(savedReports).where(eq(savedReports.id, R_MINE));
    assert.equal(row.config.delivery.lastDeliveredAt, out.delivery.lastDeliveredAt, 'the stamp is on the row');
    // an Admin owner would see the whole org: the Admin's own report, sent now
    await db.insert(savedReports).values([{ id: 'rpt_itest_sr_admin', orgId: ORG_A, ownerId: ADMIN, ownerName: 'Admin Person', name: 'Org view', source: 'Opportunities', dims: [{ id: 'owner' }], metrics: [{ id: 'deals' }], chartType: 'table', filters: { period: 'all' }, config: { delivery: { enabled: true, cadence: 'daily', hour: 8, timezone: 'UTC', emailTo: [ADMIN_ROW], slack: false } }, isShared: false }]);
    mails.length = 0;
    const a = json(await call('POST', ORG_A, { user: ADMIN, role: 'Admin', params: { action: 'deliver', id: 'rpt_itest_sr_admin' }, body: {} }));
    assert.equal(a.rows, 3, 'an Admin’s report runs over the org’s three deals');
    assert.ok(mails[0].html.includes('Rep Person') && !mails[0].html.includes('Org B Rep'), 'the org, and only the org');
});

test('Send now is refused with no recipients, for a stranger, and for org B', async () => {
    await call('PUT', ORG_A, { user: REP, body: { id: R_REP, delivery: { enabled: true, cadence: 'daily', hour: 8, timezone: 'UTC', emailTo: [], slack: false } } });
    mails.length = 0;
    const none = await call('POST', ORG_A, { user: REP, params: { action: 'deliver', id: R_REP }, body: {} });
    assert.equal(none.statusCode, 400);
    assert.match(json(none).errors[0], /no recipients/);
    assert.equal(mails.length, 0, 'nothing sent');
    assert.equal((await call('POST', ORG_A, { user: OWNER, params: { action: 'deliver', id: R_REP }, body: {} })).statusCode, 403, 'not the owner, not an Admin');
    assert.equal((await call('POST', ORG_B, { user: 'clerk_itest_sr_b', role: 'Admin', params: { action: 'deliver', id: R_MINE }, body: {} })).statusCode, 404, 'org B cannot deliver A’s report');
    assert.equal((await call('POST', ORG_A, { user: OWNER, params: { action: 'deliver' }, body: {} })).statusCode, 400, 'id required');
});

test('DELETE: a stranger is 403, org B is a no-op, the owner deletes', async () => {
    assert.equal((await call('DELETE', ORG_A, { user: REP, body: { id: R_MINE } })).statusCode, 403);
    assert.equal((await call('DELETE', ORG_B, { user: 'clerk_itest_sr_b', role: 'Admin', body: { id: R_MINE } })).statusCode, 200);
    assert.equal((await db.select().from(savedReports).where(eq(savedReports.id, R_MINE))).length, 1, 'org B’s delete touched nothing');
    assert.equal((await call('DELETE', ORG_A, { user: OWNER, body: { id: R_MINE } })).statusCode, 200);
    assert.equal((await db.select().from(savedReports).where(eq(savedReports.id, R_MINE))).length, 0);
});
