// tests/integration/users-self.itest.mjs
// The self-profile save against the real test database (state §0.109). Proves:
// a body that carries role, userType, quota, team, territory, active, the
// quarterly quotas, forecast calls and a foreign Clerk id changes NONE of them
// — only the personal fields it also carries; preferences round-trip; a body
// naming another member's id is refused; a Manager saving themselves stays a
// Manager even when the body says otherwise; and the same Clerk identity's row
// in org B is untouched.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const ROLES = ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'];
mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'User';
            const userId = event.headers?.['x-test-user'] || 'clerk_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES:    Object.freeze(ROLES),
        isAppRole:    (r) => ROLES.includes(r),
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

const { handler } = await import('../../netlify/functions/users.mjs');
const { db } = await import('../../db/index.js');
const { users } = await import('../../db/schema.js');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { eq, and } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_self_A';
const ORG_B = 'itest_self_B';
const SELF  = 'usr_itest_self';
const OTHER = 'usr_itest_other';
const B_ROW = 'usr_itest_self_b';
const CLERK_SELF  = 'clerk_itest_self';
const CLERK_OTHER = 'clerk_itest_other';

const putMe = (org, clerk, role, body) => handler({
    httpMethod: 'PUT',
    queryStringParameters: { me: 'true' },
    headers: { 'x-test-org': org, 'x-test-user': clerk, 'x-test-role': role },
    body: JSON.stringify(body),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const rowOf = async (id, org) => (await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, org))))[0];

const cleanup = async () => {
    for (const o of [ORG_A, ORG_B]) await db.delete(users).where(eq(users.orgId, o));
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([
        { id: SELF, orgId: ORG_A, clerkUserId: CLERK_SELF, name: 'Self Person', email: 'self@itest.local', role: 'User',
          team: 'East', territory: 'North', quota: '50000', active: true,
          profile: { firstName: 'Self', lastName: 'Person', teamId: 'team_east', userType: 'User', annualQuota: 50000, quotaType: 'annual', timezone: 'America/Chicago' } },
        { id: OTHER, orgId: ORG_A, clerkUserId: CLERK_OTHER, name: 'Other Manager', email: 'other@itest.local', role: 'Manager',
          quota: '90000', active: true, profile: { firstName: 'Other', lastName: 'Manager', userType: 'Manager' } },
        // The same Clerk identity is a member of a second workspace — legitimate
        // multi-org membership, and the isolation case.
        { id: B_ROW, orgId: ORG_B, clerkUserId: CLERK_SELF, name: 'Self In B', email: 'self@itest.local', role: 'Admin',
          quota: '1', active: true, profile: { firstName: 'Self', lastName: 'In B', userType: 'Admin' } },
    ]);
    invalidateRoster();
});

after(async () => { await cleanup(); });

test('a self-save carrying every administrative field changes only the personal ones', async () => {
    const r = parse(await putMe(ORG_A, CLERK_SELF, 'User', {
        id: SELF,
        firstName: 'Renamed', title: 'Account Executive',
        // Everything below must be ignored:
        role: 'Admin', userType: 'Admin',
        quota: 1, annualQuota: 1, q1Quota: 1, quotaType: 'quarterly',
        team: 'West', teamId: 'team_west', territory: 'South', vertical: 'Energy', manager: OTHER,
        active: false, status: 'Inactive',
        clerkUserId: 'clerk_someone_else',
        forecastCalls: { '2026-Q4': { commit: 999999, bestCase: 999999 } },
    }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    // The response reads the column for both role fields.
    assert.equal(r.body.user.role, 'User');
    assert.equal(r.body.user.userType, 'User');
    assert.equal(r.body.user.firstName, 'Renamed');
    assert.equal(r.body.user.name, 'Renamed Person');

    const row = await rowOf(SELF, ORG_A);
    assert.equal(row.role, 'User', 'the role column is the stored one');
    assert.equal(row.profile.userType, 'User', 'the blob copy is pinned to the stored role');
    assert.equal(Number(row.quota), 50000, 'quota is not self-editable');
    assert.equal(row.profile.annualQuota, 50000);
    assert.equal(row.profile.q1Quota ?? null, null);
    assert.equal(row.profile.quotaType, 'annual');
    assert.equal(row.team, 'East');
    assert.equal(row.territory, 'North');
    assert.equal(row.profile.teamId, 'team_east');
    assert.equal(row.profile.vertical ?? null, null);
    assert.equal(row.profile.manager ?? null, null);
    assert.equal(row.active, true, 'a member cannot deactivate their own row here');
    assert.equal(row.profile.status ?? null, null);
    assert.equal(row.clerkUserId, CLERK_SELF, 'the Clerk link is pinned to the caller');
    assert.deepEqual(row.profile.forecastCalls ?? {}, {}, 'forecast calls are the Sales Manager tab\'s write, not the member\'s');
    // And the personal fields it also carried did land.
    assert.equal(row.profile.firstName, 'Renamed');
    assert.equal(row.profile.title, 'Account Executive');
    assert.equal(row.name, 'Renamed Person');
});

test('preferences round-trip, and a save that omits the personal fields keeps them', async () => {
    const prefs = { taskDigest: { enabled: false, mode: 'digest' }, dealClosed: { enabled: true, mode: 'instant' } };
    const r = parse(await putMe(ORG_A, CLERK_SELF, 'User', {
        id: SELF, notificationPrefs: prefs, digestTime: '07:30', timezone: 'America/New_York', smsNotifications: { stageChanged: true },
    }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await rowOf(SELF, ORG_A);
    assert.deepEqual(row.profile.notificationPrefs, prefs);
    assert.equal(row.profile.digestTime, '07:30');
    assert.equal(row.profile.timezone, 'America/New_York');
    assert.deepEqual(row.profile.smsNotifications, { stageChanged: true });
    assert.equal(row.profile.firstName, 'Renamed', 'a key omitted keeps its stored value');
    assert.equal(row.profile.title, 'Account Executive');
    assert.equal(Number(row.quota), 50000);
});

test('a body naming another member\'s id is refused and that row is unchanged', async () => {
    const r = parse(await putMe(ORG_A, CLERK_SELF, 'User', { id: OTHER, firstName: 'Hijacked', quota: 1 }));
    assert.equal(r.status, 403);
    const row = await rowOf(OTHER, ORG_A);
    assert.equal(row.profile.firstName, 'Other');
    assert.equal(Number(row.quota), 90000);
});

test('a Manager saving themselves stays a Manager when the body says User', async () => {
    const r = parse(await putMe(ORG_A, CLERK_OTHER, 'Manager', { id: OTHER, role: 'User', userType: 'User', phone: '555-0100' }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await rowOf(OTHER, ORG_A);
    assert.equal(row.role, 'Manager');
    assert.equal(row.profile.userType, 'Manager');
    assert.equal(row.profile.phone, '555-0100');
});

test('org B: the same Clerk identity\'s row there is untouched by every save above', async () => {
    const row = await rowOf(B_ROW, ORG_B);
    assert.equal(row.role, 'Admin');
    assert.equal(Number(row.quota), 1);
    assert.equal(row.profile.firstName, 'Self');
    assert.equal(row.name, 'Self In B');
    assert.equal(row.profile.notificationPrefs ?? null, null);
});
