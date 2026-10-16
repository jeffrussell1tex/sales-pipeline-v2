// tests/integration/quota-plans.itest.mjs
// A Sales Rep's quota plan per fiscal year (state §0.203, guide §18b96) against the real test database, with the
// REAL verifyAuth and the real users and settings handlers. Only the Clerk SDK is a stand-in: verifyToken reads the
// claims a test token carries.
//
// Proves: PUT /users?quotas=true is refused before any write — for a rep and a Read-only member (the gate), a
// target who is not a Sales Rep, a missing or non-integer year, a year outside the company's window (computed here
// from each org's own start, so the test never depends on the date), a breakdown the company does not use (409),
// the wrong number of periods, cents, a negative or a text figure, and periods that do not add up (named; one bad
// member writes nothing for the others; each refusal says which check refused); another org's rep is a 404. Admins and Managers save; one year merges into
// the stored plans and every other year and profile key stays; a NULL profile gets the plan, a non-object profile is
// untouched (409); a repeat writes nothing and adds no audit row; each change is audited once. A months company
// stores the months and each quarter as their sum; a quarters save keeps months that still fit and drops those that
// do not. The plans survive every other save: an Admin's whole-row PUT carrying other figures, a Manager's, the
// member's own save, and a create carrying plans stores none. The settings key: quarters when absent, months round
// trips, anything else 400, an unrelated save keeps it, and one org's change leaves the other's alone. Org B's rows
// and settings are as seeded after org A's saves. A whole-profile write that read the row before a quota save keeps
// that save — an update and the create's conflict path write the plans the row holds when they land; a role change
// keeps them; a save of two members audits each by name.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.CLERK_SECRET_KEY = 'sk_test_itest_quota_stand_in';   // verifyAuth refuses to run without one; the SDK below never uses it

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// ORG NAMESPACE: this file owns 'itest_quota_*' (rows, settings, Clerk ids, emails) — and only this file writes to it.
const ORG_A = 'itest_quota_A';   // starts in October, quarters
const ORG_B = 'itest_quota_B';   // starts in January, months
const ORGS = [ORG_A, ORG_B];

const clerkClient = {
    users: { getUser: async () => { const e = new Error('Not Found'); e.status = 404; throw e; }, getOrganizationMembershipList: async () => ({ data: [] }) },
    organizations: { getOrganizationMembershipList: async () => ({ data: [] }), getOrganizationInvitationList: async () => ({ data: [] }) },
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let serial = 0;
const tokenFor = (sub, orgId, rol = 'member') =>
    `${b64({ alg: 'none' })}.${b64({ sub, o: { id: orgId, rol }, sts: 'active', exp: Math.floor(Date.now() / 1000) + 3600, n: ++serial })}.sig`;
mock.module('@clerk/backend', {
    namedExports: {
        verifyToken: async (token) => JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')),
        createClerkClient: () => clerkClient,
    },
});

const { handler: usersHandler } = await import('../../netlify/functions/users.mjs');
const { handler: settingsHandler } = await import('../../netlify/functions/settings.mjs');
const { db } = await import('../../db/index.js');
const { users, settings, auditLog } = await import('../../db/schema.js');
const { handler: roleHandler } = await import('../../netlify/functions/user-role.mjs');
const { invalidateRoster, keepQuotaPlans } = await import('../../netlify/functions/_lib.mjs');
const { currentFiscalYear } = await import('../../src/utils/reportPeriod.js');
const { eq, and, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ev = (token, method, body, query) => ({
    httpMethod: method,
    headers: { authorization: 'Bearer ' + token },
    queryStringParameters: query || {},
    body: body === undefined ? undefined : JSON.stringify(body),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const rowOf = async (id, org) => (await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, org))))[0];
const quotas = (token, body) => usersHandler(ev(token, 'PUT', body, { quotas: 'true' }));
const auditCount = async (org, entityId) => (await db.select().from(auditLog)
    .where(and(eq(auditLog.orgId, org), eq(auditLog.action, 'user.quota_set'), eq(auditLog.entityId, entityId)))).length;
const snapshot = async (org) => ({
    users: (await db.select().from(users).where(eq(users.orgId, org))).map(({ updatedAt: _u, ...r }) => r).sort((x, y) => x.id.localeCompare(y.id)),
    settings: (await db.select().from(settings).where(eq(settings.orgId, org))).map(({ updatedAt: _u, ...r }) => r),
});

// Each org's current fiscal year, as the server computes it — so the test holds on any date. A case outside the
// window sits four years out, not three: a run that crosses a fiscal year's midnight sees the server's year move on.
const CUR_A = currentFiscalYear(10);
const CUR_B = currentFiscalYear(1);
const plan = (annual, quarters, months = null) => ({ annual, quarters, months });

const ADMIN_A = 'user_itest_quota_admin_a', MANAGER_A = 'user_itest_quota_mgr_a', REP_A = 'user_itest_quota_rep_a', RO_A = 'user_itest_quota_ro_a';
const ADMIN_B = 'user_itest_quota_admin_b';
const MONTHS_LAST = [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000];
const REP_A_PLANS = {
    [String(CUR_A - 1)]: plan(120000, [30000, 30000, 30000, 30000], MONTHS_LAST),
    [String(CUR_A)]: plan(500000, [100000, 100000, 125000, 175000]),
};
const REP_A_PROFILE = { status: 'Active', userType: 'User', firstName: 'Rae', lastName: 'Rep', phone: '555-0101',
    forecastCalls: { [`${CUR_A}-Q1`]: { commit: 50000, bestCase: 80000 } }, notificationPrefs: { digest: { email: true } },
    annualQuota: 400000, quotaType: 'annual', quotaPlans: REP_A_PLANS };

const cleanup = async () => {
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(settings).where(inArray(settings.orgId, ORGS));
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
};

let bSeed;
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const now = new Date();
    await db.insert(settings).values([
        { id: ORG_A, orgId: ORG_A, fiscalYearStart: '10', extra: { quotaPeriods: 'quarters', competitors: ['A Rival'] }, updatedAt: now },
        { id: ORG_B, orgId: ORG_B, fiscalYearStart: '1', extra: { quotaPeriods: 'months', competitors: ['B Rival'] }, updatedAt: now },
    ]);
    await db.insert(users).values([
        { id: 'usr_itest_quota_admin_a', orgId: ORG_A, clerkUserId: ADMIN_A, name: 'Ada Admin', email: 'admin-a@itest-quota.local', role: 'Admin', active: true, profile: { status: 'Active', userType: 'Admin' } },
        { id: 'usr_itest_quota_mgr_a', orgId: ORG_A, clerkUserId: MANAGER_A, name: 'Max Manager', email: 'mgr-a@itest-quota.local', role: 'Manager', active: true, profile: { status: 'Active', userType: 'Manager' } },
        { id: 'usr_itest_quota_rep_a', orgId: ORG_A, clerkUserId: REP_A, name: 'Rae Rep', email: 'rep-a@itest-quota.local', role: 'User', active: true, profile: REP_A_PROFILE },
        { id: 'usr_itest_quota_rep2_a', orgId: ORG_A, clerkUserId: null, name: 'Rex Rep', email: 'rep2-a@itest-quota.local', role: 'User', active: true, profile: { status: 'Active', userType: 'User' } },
        { id: 'usr_itest_quota_null_a', orgId: ORG_A, clerkUserId: null, name: 'Nell Null', email: 'null-a@itest-quota.local', role: 'User', active: true, profile: null },
        { id: 'usr_itest_quota_odd_a', orgId: ORG_A, clerkUserId: null, name: 'Otto Odd', email: 'odd-a@itest-quota.local', role: 'User', active: true, profile: 'x' },
        { id: 'usr_itest_quota_ro_a', orgId: ORG_A, clerkUserId: RO_A, name: 'Rita Readonly', email: 'ro-a@itest-quota.local', role: 'ReadOnly', active: true, profile: { status: 'Active', userType: 'ReadOnly' } },
        { id: 'usr_itest_quota_admin_b', orgId: ORG_B, clerkUserId: ADMIN_B, name: 'Bea Admin', email: 'admin-b@itest-quota.local', role: 'Admin', active: true, profile: { status: 'Active', userType: 'Admin' } },
        { id: 'usr_itest_quota_rep_b', orgId: ORG_B, clerkUserId: null, name: 'Bo Rep', email: 'rep-b@itest-quota.local', role: 'User', active: true,
          profile: { status: 'Active', userType: 'User', quotaPlans: { [String(CUR_B)]: plan(120000, [30000, 30000, 30000, 30000], MONTHS_LAST) } } },
    ]);
    invalidateRoster();
    bSeed = await snapshot(ORG_B);
});
after(async () => { await cleanup(); });

const REP = 'usr_itest_quota_rep_a';
const good = (id = REP) => ({ id, annual: 600000, periods: [120000, 150000, 150000, 180000] });

test('refused before any write: the gate, a non-rep, the year, the breakdown, the figures, the sum — and another org\'s rep is a 404', async () => {
    const before = await rowOf(REP, ORG_A);
    const base = { fiscalYear: CUR_A, breakdown: 'quarters', members: [good()] };
    const cases = [
        [tokenFor(REP_A, ORG_A), base, 403, 'a rep'],
        [tokenFor(RO_A, ORG_A), base, 403, 'a Read-only member'],
        [tokenFor(MANAGER_A, ORG_A), { ...base, members: [{ ...good('usr_itest_quota_admin_a') }] }, 400, 'a target who is not a Sales Rep', /is not a Sales Rep/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, fiscalYear: undefined }, 400, 'no year', /^Name the fiscal year/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, fiscalYear: CUR_A + 0.5 }, 400, 'a year that is not an integer', /^Name the fiscal year/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, fiscalYear: CUR_A + 4 }, 400, 'beyond the window', /is outside the years quotas can be set for/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, fiscalYear: CUR_A - 3 }, 400, 'before the window', /is outside the years quotas can be set for/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, breakdown: 'months', members: [{ id: REP, annual: 120, periods: Array(12).fill(10) }] }, 409, 'months to a quarters company', /now sets quotas by quarter/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, breakdown: 'weekly' }, 400, 'no such breakdown', /^Quota periods are quarters or months\.$/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, members: [{ id: REP, annual: 600000, periods: [600000, 0, 0] }] }, 400, 'three quarters', /needs 4 quarters/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, members: [{ id: REP, annual: 600000.5, periods: [600000.5, 0, 0, 0] }] }, 400, 'cents', /whole dollars/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, members: [{ id: REP, annual: 600000, periods: [700000, -100000, 0, 0] }] }, 400, 'a negative figure', /whole dollars/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, members: [{ id: REP, annual: '600000', periods: ['600000', '0', '0', '0'] }] }, 400, 'text figures', /whole dollars/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, members: [] }, 400, 'no members', /^Send each member/],
        [tokenFor(ADMIN_A, ORG_A), { ...base, members: [good(), good()] }, 400, 'one member twice', /^Send each member/],
    ];
    for (const [token, body, status, what, said] of cases) {
        const r = parse(await quotas(token, body));
        assert.equal(r.status, status, `${what}: ${JSON.stringify(r.body)}`);
        if (said) assert.match(r.body.error || '', said, `${what}: which check refused`);
    }
    const sum = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { ...base, members: [good('usr_itest_quota_rep2_a'), { id: REP, annual: 500000, periods: [100000, 100000, 125000, 155000] }] }));
    assert.equal(sum.status, 400);
    assert.equal(sum.body.error, `Rae Rep's FY${CUR_A} quarters add up to $480,000 — $20,000 short of the $500,000 yearly quota.`);
    assert.equal((await rowOf('usr_itest_quota_rep2_a', ORG_A)).profile.quotaPlans, undefined, 'REGRESSION: one bad member and the others were written');
    const other = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { ...base, members: [good('usr_itest_quota_rep_b')] }));
    assert.equal(other.status, 404, 'another org\'s rep is no member of this org');
    const after = await rowOf(REP, ORG_A);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), 'nothing was written');
    assert.deepEqual(after.profile, before.profile);
    assert.equal(await auditCount(ORG_A, REP), 0);
});

test('an Admin saves next year\'s plan: one year merged — every other year and every other profile key exactly as stored; audited once', async () => {
    const r = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { fiscalYear: CUR_A + 1, breakdown: 'quarters', members: [good()] }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await rowOf(REP, ORG_A);
    assert.deepEqual(row.profile.quotaPlans[String(CUR_A + 1)], plan(600000, [120000, 150000, 150000, 180000]));
    assert.deepEqual(row.profile.quotaPlans[String(CUR_A)], REP_A_PLANS[String(CUR_A)], 'REGRESSION: a save of one year replaced the others');
    assert.deepEqual(row.profile.quotaPlans[String(CUR_A - 1)], REP_A_PLANS[String(CUR_A - 1)]);
    const { quotaPlans: _p, ...rest } = row.profile;
    const { quotaPlans: _s, ...seeded } = REP_A_PROFILE;
    assert.deepEqual(rest, seeded, 'phone, forecast calls, notifications and the old keys untouched');
    assert.equal(await auditCount(ORG_A, REP), 1);
    assert.equal(r.body.users.length, 1);
    assert.deepEqual(r.body.users[0].quotaPlans[String(CUR_A + 1)], plan(600000, [120000, 150000, 150000, 180000]), 'the answer is the row as written');
    assert.deepEqual(r.body.removed, []);
});

test('a Manager saves too ("Admins and Managers"); a repeat writes nothing and adds no audit row, and still answers the row', async () => {
    const body = { fiscalYear: CUR_A, breakdown: 'quarters', members: [{ id: REP, annual: 520000, periods: [100000, 120000, 125000, 175000] }] };
    const r = parse(await quotas(tokenFor(MANAGER_A, ORG_A), body));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await auditCount(ORG_A, REP), 2);
    const written = await rowOf(REP, ORG_A);
    const again = parse(await quotas(tokenFor(MANAGER_A, ORG_A), body));
    assert.equal(again.status, 200);
    assert.equal(again.body.users.length, 1, 'every row named is answered');
    assert.equal(await auditCount(ORG_A, REP), 2, 'REGRESSION: an unchanged plan was written and audited');
    assert.equal((await rowOf(REP, ORG_A)).updatedAt.getTime(), written.updatedAt.getTime());
});

test('a quarters save keeps last year\'s months while they still fit and drops them when they no longer do', async () => {
    const last = String(CUR_A - 1);
    const same = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { fiscalYear: CUR_A - 1, breakdown: 'quarters', members: [{ id: REP, annual: 120000, periods: [30000, 30000, 30000, 30000] }] }));
    assert.equal(same.status, 200);
    assert.deepEqual((await rowOf(REP, ORG_A)).profile.quotaPlans[last].months, MONTHS_LAST, 'the same quarters: the months stay');
    const moved = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { fiscalYear: CUR_A - 1, breakdown: 'quarters', members: [{ id: REP, annual: 120000, periods: [40000, 20000, 30000, 30000] }] }));
    assert.equal(moved.status, 200);
    const p = (await rowOf(REP, ORG_A)).profile.quotaPlans[last];
    assert.deepEqual(p.quarters, [40000, 20000, 30000, 30000]);
    assert.equal(p.months, null, 'months that no longer add up to their quarter are dropped');
});

test('a NULL profile gets the plan; a profile that is not an object is refused (409) and untouched', async () => {
    const r = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { fiscalYear: CUR_A, breakdown: 'quarters', members: [{ id: 'usr_itest_quota_null_a', annual: 400, periods: [100, 100, 100, 100] }] }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await rowOf('usr_itest_quota_null_a', ORG_A)).profile.quotaPlans[String(CUR_A)], plan(400, [100, 100, 100, 100]));
    const odd = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { fiscalYear: CUR_A, breakdown: 'quarters', members: [{ id: 'usr_itest_quota_odd_a', annual: 400, periods: [100, 100, 100, 100] }] }));
    assert.equal(odd.status, 409);
    assert.equal((await rowOf('usr_itest_quota_odd_a', ORG_A)).profile, 'x');
});

test('the plans survive every other save: an Admin\'s whole row, a Manager\'s, the member\'s own; a create stores none', async () => {
    const before = (await rowOf(REP, ORG_A)).profile.quotaPlans;
    const forged = { [String(CUR_A)]: plan(1, [1, 0, 0, 0]) };
    for (const [token, what] of [[tokenFor(ADMIN_A, ORG_A), 'an Admin'], [tokenFor(MANAGER_A, ORG_A), 'a Manager']]) {
        const r = parse(await usersHandler(ev(token, 'PUT', { id: REP, phone: '555-0199', quotaPlans: forged, annualQuota: 1, quotaType: 'quarterly' })));
        assert.equal(r.status, 200, `${what}: ${JSON.stringify(r.body)}`);
        const p = (await rowOf(REP, ORG_A)).profile;
        assert.deepEqual(p.quotaPlans, before, `REGRESSION: ${what}'s whole-row save put other figures over the plans`);
        assert.equal(p.annualQuota, 400000, 'the old keys too');
        assert.equal(p.phone, '555-0199', 'the save itself landed');
    }
    const own = parse(await usersHandler(ev(tokenFor(REP_A, ORG_A), 'PUT', { id: REP, digestTime: '07:00', quotaPlans: forged }, { me: 'true' })));
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.deepEqual((await rowOf(REP, ORG_A)).profile.quotaPlans, before, 'the member\'s own save keeps them, and cannot set them');
    const made = parse(await usersHandler(ev(tokenFor(ADMIN_A, ORG_A), 'POST', { name: 'New Hire', email: 'new@itest-quota.local', quotaPlans: forged, annualQuota: 9 })));
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const p = (await rowOf(made.body.user.id, ORG_A)).profile;
    assert.equal(p.quotaPlans, null, 'REGRESSION: a create stored the plans it was sent');
    assert.equal(p.annualQuota, null);
});

test('org B is untouched by org A\'s saves', async () => {
    assert.deepEqual(await snapshot(ORG_B), bSeed);
});

test('a months company stores the months and each quarter as their sum; its own setting decides, not the other org\'s', async () => {
    const months = [30, 30, 40, 40, 40, 45, 45, 45, 50, 50, 50, 55].map((k) => k * 1000);
    const r = parse(await quotas(tokenFor(ADMIN_B, ORG_B), { fiscalYear: CUR_B, breakdown: 'months', members: [{ id: 'usr_itest_quota_rep_b', annual: 520000, periods: months }] }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await rowOf('usr_itest_quota_rep_b', ORG_B)).profile.quotaPlans[String(CUR_B)], plan(520000, [100000, 125000, 140000, 155000], months));
    const quarters = parse(await quotas(tokenFor(ADMIN_B, ORG_B), { fiscalYear: CUR_B, breakdown: 'quarters', members: [{ id: 'usr_itest_quota_rep_b', annual: 520000, periods: [100000, 125000, 140000, 155000] }] }));
    assert.equal(quarters.status, 409, 'quarters to a months company');
});

test('the company\'s quota periods: quarters when absent, months round trip, anything else 400, an unrelated save keeps it, and one org\'s change leaves the other\'s alone', async () => {
    const get = async (token) => parse(await settingsHandler(ev(token, 'GET')));
    const put = async (token, body) => parse(await settingsHandler(ev(token, 'PUT', body)));
    assert.equal((await get(tokenFor(ADMIN_A, ORG_A))).body.settings.quotaPeriods, 'quarters');
    assert.equal((await put(tokenFor(ADMIN_A, ORG_A), { quotaPeriods: 'weekly' })).status, 400);
    assert.equal((await put(tokenFor(ADMIN_A, ORG_A), { quotaPeriods: 'months' })).status, 200);
    assert.equal((await get(tokenFor(ADMIN_A, ORG_A))).body.settings.quotaPeriods, 'months');
    assert.equal((await put(tokenFor(ADMIN_A, ORG_A), { competitors: ['A Rival', 'A Other'] })).status, 200);
    assert.equal((await get(tokenFor(ADMIN_A, ORG_A))).body.settings.quotaPeriods, 'months', 'REGRESSION: an unrelated settings save reset the quota periods');
    assert.equal((await get(tokenFor(ADMIN_B, ORG_B))).body.settings.quotaPeriods, 'months', 'B keeps its own');
    assert.equal((await put(tokenFor(MANAGER_A, ORG_A), { quotaPeriods: 'quarters' })).status, 403, 'an Admin\'s');
    assert.equal((await put(tokenFor(ADMIN_A, ORG_A), { quotaPeriods: 'quarters' })).status, 200);
    assert.equal((await get(tokenFor(ADMIN_B, ORG_B))).body.settings.quotaPeriods, 'months', 'A\'s change left B\'s alone');
    await db.update(settings).set({ extra: { competitors: ['A Rival'] } }).where(eq(settings.orgId, ORG_A));
    assert.equal((await get(tokenFor(ADMIN_A, ORG_A))).body.settings.quotaPeriods, 'quarters', 'absent: quarters');
});

test('a whole-profile write that read the row before a quota save keeps that save — an update, the create\'s conflict path; a role change keeps the plans; a row holding no plans stores none; two members audited each by name', async () => {
    const ID = 'usr_itest_quota_rep2_a';
    const stale = (await rowOf(ID, ORG_A)).profile;   // read before the quota save lands
    const saved = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { fiscalYear: CUR_A, breakdown: 'quarters', members: [{ id: ID, annual: 800, periods: [200, 200, 200, 200] }] }));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const fresh = (await rowOf(ID, ORG_A)).profile.quotaPlans;
    assert.deepEqual(fresh[String(CUR_A)], plan(800, [200, 200, 200, 200]));
    // the stale read's write, as the PUT and the member's own save make it
    await db.update(users).set({ profile: keepQuotaPlans({ ...stale, phone: '555-0199' }), updatedAt: new Date() }).where(and(eq(users.id, ID), eq(users.orgId, ORG_A)));
    let row = await rowOf(ID, ORG_A);
    assert.equal(row.profile.phone, '555-0199', 'the write landed');
    assert.deepEqual(row.profile.quotaPlans, fresh, 'REGRESSION: a save that read the row before the quota save put the old plans back');
    // the create's conflict path, carrying other plans
    await db.insert(users).values({ id: ID, orgId: ORG_A, name: 'Rex Rep', email: 'rep2-a@itest-quota.local', role: 'User', active: true, profile: stale })
        .onConflictDoUpdate({ target: users.id, setWhere: eq(users.orgId, ORG_A), set: { profile: keepQuotaPlans({ ...stale, phone: '555-0198', quotaPlans: { [String(CUR_A)]: plan(1, [1, 0, 0, 0]) } }), updatedAt: new Date() } });
    row = await rowOf(ID, ORG_A);
    assert.equal(row.profile.phone, '555-0198');
    assert.deepEqual(row.profile.quotaPlans, fresh, 'the conflict path too, whatever plans the write carries');
    // a role change, through its endpoint, and back — it reads the row after the save, so this proves its write keeps
    // the plans; that it keeps a save landing after its read is the SQL above (and the unit pin on its call)
    for (const role of ['Manager', 'User']) {
        const r = parse(await roleHandler(ev(tokenFor(ADMIN_A, ORG_A), 'PUT', { targetUserId: ID, role })));
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual((await rowOf(ID, ORG_A)).profile.quotaPlans, fresh, `a role change to ${role} keeps the plans`);
    }
    // a row that holds none stores none
    const RO = 'usr_itest_quota_ro_a';
    await db.update(users).set({ profile: keepQuotaPlans({ status: 'Active', userType: 'ReadOnly', quotaPlans: { [String(CUR_A)]: plan(1, [1, 0, 0, 0]) } }) }).where(and(eq(users.id, RO), eq(users.orgId, ORG_A)));
    assert.equal('quotaPlans' in (await rowOf(RO, ORG_A)).profile, false, 'no plans where the row held none');
    // a save of two members audits each of them once, by name
    const NELL = 'usr_itest_quota_null_a';
    const counts = async () => [await auditCount(ORG_A, ID), await auditCount(ORG_A, NELL)];
    const was = await counts();
    const two = parse(await quotas(tokenFor(ADMIN_A, ORG_A), { fiscalYear: CUR_A + 1, breakdown: 'quarters',
        members: [{ id: ID, annual: 40, periods: [10, 10, 10, 10] }, { id: NELL, annual: 80, periods: [20, 20, 20, 20] }] }));
    assert.equal(two.status, 200, JSON.stringify(two.body));
    assert.deepEqual(await counts(), [was[0] + 1, was[1] + 1], 'REGRESSION: one member credited with another\'s change');
    const names = (await db.select().from(auditLog).where(and(eq(auditLog.orgId, ORG_A), eq(auditLog.action, 'user.quota_set')))).map((a) => `${a.entityId} ${a.entityName}`);
    assert.ok(names.includes(`${ID} Rex Rep — FY${CUR_A + 1} $40`) && names.includes(`${NELL} Nell Null — FY${CUR_A + 1} $80`), names.join(' | '));
    invalidateRoster();
});
