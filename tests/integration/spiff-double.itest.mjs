// tests/integration/spiff-double.itest.mjs
// §0.295 against the real test database (OPEN_ITEMS §4.2, "Left by §0.294" (b)): whether a deal's SPIFF was claimed already
// was decided by the screen's copy of the claims alone — one that did not load, or another member's press a moment before,
// filed a second claim, to be approved and paid twice. One claim for a deal and a SPIFF, now the server's: the write holds
// the deal's row while it looks, so two at once cannot both land.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers['x-test-user'], orgId, userRole: event.headers['x-test-role'] || 'User', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});

const { handler } = await import('../../netlify/functions/spiff-claims.mjs');
const { db } = await import('../../db/index.js');
const { users, spiffClaims, opportunities, settings, auditLog } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_spiff_double_*', and only this file writes to it.
const A = 'itest_spiff_double_A', B = 'itest_spiff_double_B';
const REP = 'Itest Double Rep', REP2 = 'Itest Second Rep';
const CLERK = { rep: 'clerk_itest_spiff_double_rep', rep2: 'clerk_itest_spiff_double_rep2', mgr: 'clerk_itest_spiff_double_mgr' };
const DEAL = 'itest_spiff_double_deal', DEAL2 = 'itest_spiff_double_deal2', DEAL_B = 'itest_spiff_double_dealB';

const call = async (method, body, { role = 'User', user = CLERK.rep, org = A, id = null } = {}) => {
    const r = await handler({ httpMethod: method, headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : null, queryStringParameters: id ? { id } : {} });
    return { status: r.statusCode, body: JSON.parse(r.body) };
};
const mgr = { role: 'Manager', user: CLERK.mgr };
const claim = (id, more = {}) => ({ id: `itest_spiff_double_${id}`, spiffId: 'spf_1', spiffName: 'Itest SPIFF', opportunityId: DEAL, repName: REP, amount: 100, ...more });
const stored = async (org = A) => (await db.select().from(spiffClaims).where(eq(spiffClaims.orgId, org))).map((c) => c.id.replace('itest_spiff_double_', '')).sort();
const clear = async () => { await db.delete(spiffClaims).where(inArray(spiffClaims.orgId, [A, B])); await db.delete(auditLog).where(inArray(auditLog.orgId, [A, B])); };
const CLAIMED = 'This SPIFF is already claimed for this deal.';

const clean = async () => {
    await clear();
    await db.delete(opportunities).where(inArray(opportunities.orgId, [A, B]));
    await db.delete(settings).where(inArray(settings.orgId, [A, B]));
    await db.delete(users).where(inArray(users.orgId, [A, B]));
};
before(async () => {
    await clean();
    const spiffs = [{ id: 'spf_1', name: 'Itest SPIFF', type: 'flat', amount: 100, active: true }, { id: 'spf_2', name: 'Other', type: 'flat', amount: 50, active: true }];
    for (const org of [A, B]) await db.insert(settings).values({ id: `itest_spiff_double_set_${org}`, orgId: org, extra: { spiffs } });
    await db.insert(users).values([
        { id: 'usr_itest_spiff_double_rep', orgId: A, clerkUserId: CLERK.rep, name: REP, email: 'double-rep@itest.invalid', role: 'User', active: true },
        { id: 'usr_itest_spiff_double_rep2', orgId: A, clerkUserId: CLERK.rep2, name: REP2, email: 'double-rep2@itest.invalid', role: 'User', active: true },
        { id: 'usr_itest_spiff_double_mgr', orgId: A, clerkUserId: CLERK.mgr, name: 'Itest Double Mgr', email: 'double-mgr@itest.invalid', role: 'Manager', active: true },
    ]);
    await db.insert(opportunities).values([{ id: DEAL, orgId: A, opportunityName: 'Deal', stage: 'Closed Won', pipelineId: 'default' }, { id: DEAL2, orgId: A, opportunityName: 'Deal 2', stage: 'Closed Won', pipelineId: 'default' }, { id: DEAL_B, orgId: B, opportunityName: 'Deal B', stage: 'Closed Won', pipelineId: 'default' }]);
});
after(clean);

test('a second claim of a deal\'s SPIFF is refused, writing nothing — another member\'s, a Manager\'s, or the rep\'s own; the claim that stands is handed back', async () => {
    await clear();
    assert.equal((await call('POST', claim('one'))).status, 201);
    for (const who of [{}, { user: CLERK.rep2 }, mgr]) {
        const r = await call('POST', claim('two'), who);
        assert.deepEqual([r.status, r.body.error, r.body.code, r.body.spiffClaim?.id], [409, CLAIMED, 'claimed', 'itest_spiff_double_one']);
    }
    assert.deepEqual(await stored(), ['one'], 'REGRESSION: one deal\'s SPIFF claimed twice — and paid twice');
    const audits = await db.select().from(auditLog).where(eq(auditLog.orgId, A));
    assert.equal(audits.filter((x) => x.action === 'spiff_claim.submitted').length, 1, 'no audit row for a claim not filed');
});

test('whatever state the claim is in — approved, paid, rejected — as the screen offers none over it; a deleted one frees it', async () => {
    for (const status of ['approved', 'paid', 'rejected']) {
        await clear();
        await call('POST', claim('one'));
        await db.update(spiffClaims).set({ status }).where(and(eq(spiffClaims.id, 'itest_spiff_double_one'), eq(spiffClaims.orgId, A)));
        assert.equal((await call('POST', claim('two'))).status, 409, status);
    }
    assert.equal((await call('DELETE', null, { ...mgr, id: 'itest_spiff_double_one' })).status, 200);
    assert.equal((await call('POST', claim('two'))).status, 201);
});

test('two at once: one lands, the other is refused', async () => {
    for (let i = 0; i < 4; i++) {
        await clear();
        const both = await Promise.all([call('POST', claim('one')), call('POST', claim('two'), { user: CLERK.rep2 }), call('POST', claim('three'), mgr)]);
        assert.deepEqual(both.map((r) => r.status).sort(), [201, 409, 409], `round ${i}: REGRESSION: two presses at once both landed`);
        assert.equal((await stored()).length, 1);
    }
});

test('the same press sent again is the earlier one (idInUse), not a refusal; another SPIFF, another deal, and a claim with no deal are their own', async () => {
    await clear();
    await call('POST', claim('one'));
    const again = await call('POST', claim('one'));
    assert.deepEqual([again.status, again.body.code], [409, 'idInUse'], 'the screen reads it as landed');
    assert.equal((await call('POST', claim('two', { spiffId: 'spf_2' }))).status, 201);
    assert.equal((await call('POST', claim('three', { opportunityId: DEAL2 }))).status, 201);
    assert.equal((await call('POST', claim('four', { opportunityId: null }))).status, 201);
    assert.equal((await call('POST', claim('five', { opportunityId: null }))).status, 201, 'no deal: nothing to claim twice');
    assert.deepEqual(await stored(), ['five', 'four', 'one', 'three', 'two']);
});

test('a save that moves a claim onto a deal and SPIFF another claim holds is refused, nothing written; its own pair, and any other save, are not asked', async () => {
    await clear();
    await call('POST', claim('one'));
    await call('POST', claim('two', { opportunityId: DEAL2 }));
    const moved = await call('PUT', { id: 'itest_spiff_double_two', opportunityId: DEAL, note: 'moved' }, mgr);
    assert.deepEqual([moved.status, moved.body.error, moved.body.code], [409, CLAIMED, 'claimed']);
    const [two] = await db.select().from(spiffClaims).where(and(eq(spiffClaims.id, 'itest_spiff_double_two'), eq(spiffClaims.orgId, A)));
    assert.deepEqual([two.opportunityId, two.note], [DEAL2, null]);
    assert.equal((await call('PUT', { id: 'itest_spiff_double_two', spiffId: 'spf_2', opportunityId: DEAL }, mgr)).status, 200, 'the deal\'s other SPIFF');
    assert.equal((await call('PUT', { id: 'itest_spiff_double_two', spiffId: 'spf_1' }, mgr)).status, 409, 'the SPIFF named alone, the deal as stored');
    assert.equal((await call('PUT', { id: 'itest_spiff_double_one', opportunityId: DEAL, spiffId: 'spf_1', status: 'approved', fromStatus: 'pending' }, mgr)).status, 200, 'its own pair');
    // A pair stored twice before this rule: an approval or a note still lands on either.
    await db.insert(spiffClaims).values({ id: 'itest_spiff_double_old', orgId: A, spiffId: 'spf_1', opportunityId: DEAL, repName: REP2, status: 'pending' });
    assert.equal((await call('PUT', { id: 'itest_spiff_double_old', status: 'rejected', fromStatus: 'pending' }, mgr)).status, 200);
});

test('two saves of one claim, each naming a half of the pair, at once: neither lands on what the other left; a save naming the half it read is refused once it moved', async () => {
    for (let i = 0; i < 4; i++) {
        await clear();
        await call('POST', claim('one', { spiffId: 'spf_2', opportunityId: DEAL2 }));   // holds (deal 2, SPIFF 2)
        await call('POST', claim('two'));                                              // (deal, SPIFF 1)
        const both = await Promise.all([call('PUT', { id: 'itest_spiff_double_two', opportunityId: DEAL2 }, mgr), call('PUT', { id: 'itest_spiff_double_two', spiffId: 'spf_2' }, mgr)]);
        assert.deepEqual(both.map((r) => r.status).sort(), [200, 409], `round ${i}: REGRESSION: the claim landed on a pair another holds`);
        const pairs = (await db.select().from(spiffClaims).where(eq(spiffClaims.orgId, A))).map((c) => c.opportunityId + '|' + c.spiffId);
        assert.equal(new Set(pairs).size, 2);
    }
});

test('another org: its claims are neither seen nor held against this one — the same id and SPIFF there, and its deal refused here', async () => {
    await clear();
    await db.insert(spiffClaims).values({ id: 'itest_spiff_double_b', orgId: B, spiffId: 'spf_1', opportunityId: DEAL, repName: 'B Rep', status: 'pending' });   // a made-up row naming A's deal
    const r = await call('POST', claim('one'));
    assert.deepEqual([r.status, r.body.spiffClaim?.orgId], [201, A], 'REGRESSION: another org\'s claim held against this org\'s');
    assert.equal((await call('POST', claim('two', { opportunityId: DEAL_B }))).status, 404, 'another org\'s deal');
    assert.deepEqual([await stored(), await stored(B)], [['one'], ['b']]);
});
