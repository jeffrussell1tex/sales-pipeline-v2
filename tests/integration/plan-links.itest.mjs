// tests/integration/plan-links.itest.mjs
//
// A service plan's links name this org's entries (state §0.223 — batch 4b-3 of OPEN_ITEMS §1 item 1, step D; Jeff,
// 2 Nov: "Start step D", every answer the Recommended — docs/design/links-batch-4b3/STEP-D.md). Against the test
// database, with the real plans handler and gate (the auth mock fakes the SIGN-IN only — dispatch-links.itest.mjs's
// pattern):
//   REFUSED  a plan's visit template naming org B's template, or none, and its covered job types naming B's types, a
//            seed id only B saved, or none, are 404 in the kind's words naming the field — on a create and on an
//            update — and nothing is written; a value that names no record by its id is 400 NOT_AN_ID
//   ANY      any entry of THIS org's lists counts, a seed id the org saved too
//   HELD     a plan stored before §0.223 — another org's template and job types, its covered types as JSON text —
//            re-saved as it holds is taken, on an update and on a re-POST; a type named anew is asked
//   STORED   the covered types are stored as a list (JD2), the GET answers a list — a plan stored as text, or as text
//            that is no JSON, too
//   READ     an update reads the plan first: one naming no plan of this org is 404 before anything is asked; a body
//            leaving the links out keeps them; null clears
//   ORG B    another org's plan is never reached: its id is 404 to an update and 409 to a create
// Org B's rows are compared byte for byte at the end.
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
            return { userId: `clerk_itest_plans_${userRole}_${orgId}`, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});

const plansHandler = (await import('../../netlify/functions/dispatch-service-plans.mjs')).handler;
const { db } = await import('../../db/index.js');
const { settings, dispatchServicePlans, auditLog } = await import('../../db/schema.js');
const { eq, inArray, sql } = await import('drizzle-orm');
const { notInOrg, NOT_AN_ID } = await import('../../src/utils/linkIds.js');

// ORG NAMESPACE: this file owns 'itest_plans_*' — its two orgs, every row id it writes ('plan_itest_plans_…': plan ids
// are global keys) and its list entries' ids ('itest_plans_…', and the seed ids `jt_filter` and `jt_compressor` inside
// its own settings rows) — and ONLY this file writes to it (guide §18b25).
const A = 'itest_plans_A', B = 'itest_plans_B';
const ORGS = [A, B];
const P = (s) => 'plan_itest_plans_' + s;
const ID = (s) => 'itest_plans_' + s;

const TM1 = ID('tm1'), TM2 = ID('tm2'), TM_B = ID('tm_b');
const JT1 = ID('jt1'), JT2 = ID('jt2'), JT_B = ID('jt_b');
const SEED = 'jt_filter', B_ONLY_SEED = 'jt_compressor';   // the job types screen's seed ids — every org's screen offers them
const GONE = ID('gone');

// Each list holds OBJECT entries (an entry counts by its own text id); A's holds a plain-text entry and one with no id,
// which name nothing.
const A_EXTRA = {
    dispatchEnabled: true,
    dispatchJobTemplates: [{ id: TM1, name: 'Annual service' }, { id: TM2, name: 'Quarterly check' }, 'tm_text', { name: 'no id' }],
    dispatchJobTypes: [{ id: JT1, name: 'Inspection' }, { id: JT2, name: 'Repair' }, { id: SEED, name: 'Filter replacement' }, 'jt_text', { name: 'no id' }],
};
const B_EXTRA = {
    dispatchEnabled: true,
    dispatchJobTemplates: [{ id: TM_B, name: 'B service' }],
    dispatchJobTypes: [{ id: JT_B, name: 'B type' }, { id: SEED, name: 'Filter replacement' }, { id: B_ONLY_SEED, name: 'Compressor' }],
};
// A plan stored before §0.223: another org's template and job type, its covered types as JSON text (the census's shape).
const P_HELD = P('held'), P_B = P('b'), P_TEXT = P('bad_text');

const ADMIN = 'Admin';
const call = async (method, body, qs, org = A, role = ADMIN) => {
    const res = await plansHandler({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': role, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: qs || {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const refused = (r, kind, field) => {
    assert.equal(r.status, 404, `${field}: ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body, { error: notInOrg(kind), field }, field);
};
// A plan as Postgres prints it: "nothing written" is the stored text, byte for byte.
const rowText = async (id) => (await db.select({ t: sql`row_to_json(${dispatchServicePlans})::text` }).from(dispatchServicePlans).where(eq(dispatchServicePlans.id, id)))[0]?.t ?? null;
const coveredShape = async (id) => (await db.select({ t: sql`jsonb_typeof(${dispatchServicePlans.coveredJobTypes})` }).from(dispatchServicePlans).where(eq(dispatchServicePlans.id, id)))[0]?.t ?? null;
const one = async (id) => (await db.select().from(dispatchServicePlans).where(eq(dispatchServicePlans.id, id)))[0];
const bText = async () => ({
    plans: (await db.select({ id: dispatchServicePlans.id, t: sql`row_to_json(${dispatchServicePlans})::text` }).from(dispatchServicePlans).where(eq(dispatchServicePlans.orgId, B))).sort((x, y) => x.id.localeCompare(y.id)),
    extra: (await db.select({ t: sql`${settings.extra}::text` }).from(settings).where(eq(settings.orgId, B)))[0]?.t ?? null,
});
let bSeeded;

const cleanup = async () => {
    for (const t of [dispatchServicePlans, auditLog, settings]) await db.delete(t).where(inArray(t.orgId, ORGS));
};

before(async () => {
    await cleanup();
    await db.insert(settings).values([{ id: A, orgId: A, extra: A_EXTRA }, { id: B, orgId: B, extra: B_EXTRA }]);
    await db.insert(dispatchServicePlans).values([
        { id: P_HELD, orgId: A, name: 'Held plan', visitTemplateId: TM_B, coveredJobTypes: JSON.stringify([JT_B, JT1]) },
        { id: P_B, orgId: B, name: 'B plan', visitTemplateId: TM_B, coveredJobTypes: [JT_B] },
    ]);
    await db.insert(dispatchServicePlans).values({ id: P_TEXT, orgId: A, name: 'Bad text plan' });
    await db.execute(sql`update ${dispatchServicePlans} set covered_job_types = '"not json"'::jsonb where id = ${P_TEXT}`);
    bSeeded = await bText();
});
after(cleanup);

test('REFUSED (a create): org B\'s template, a template naming nothing, B\'s job type, a seed id only B saved, a type naming nothing — 404 in the words naming the field; a value naming no record 400; no plan made', async () => {
    const cases = [
        [{ visitTemplateId: TM_B }, 'jobTemplate', 'visitTemplateId'],
        [{ visitTemplateId: GONE }, 'jobTemplate', 'visitTemplateId'],
        [{ visitTemplateId: 'tm_text' }, 'jobTemplate', 'visitTemplateId'],
        [{ coveredJobTypes: [JT1, JT_B] }, 'jobType', 'coveredJobTypes'],
        [{ coveredJobTypes: [B_ONLY_SEED] }, 'jobType', 'coveredJobTypes'],
        [{ coveredJobTypes: [GONE] }, 'jobType', 'coveredJobTypes'],
        [{ coveredJobTypes: ['jt_text'] }, 'jobType', 'coveredJobTypes'],
    ];
    let n = 0;
    for (const [links, kind, field] of cases) {
        const id = P('refused_' + n++);
        refused(await call('POST', { id, name: 'Refused', ...links }), kind, field);
        assert.equal(await one(id), undefined, `nothing written — ${JSON.stringify(links)}`);
    }
    for (const [links, field] of [[{ coveredJobTypes: JSON.stringify([JT1]) }, 'coveredJobTypes'], [{ visitTemplateId: 7 }, 'visitTemplateId'], [{ coveredJobTypes: [JT1, 7] }, 'coveredJobTypes']]) {
        const id = P('bad_' + n++);
        const r = await call('POST', { id, name: 'Bad', ...links });
        assert.equal(r.status, 400, JSON.stringify(r.body));
        assert.deepEqual(r.body, { error: NOT_AN_ID, field });
        assert.equal(await one(id), undefined);
    }
});

test("ANY + STORED (a create): this org's template and job types — a seed id it saved too — taken; the covered types stored as a list; the answer a list", async () => {
    const r = await call('POST', { id: P('mine'), name: 'Mine', visitTemplateId: TM1, coveredJobTypes: [JT1, SEED, JT1] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.plan.coveredJobTypes, [JT1, SEED]);
    assert.equal(await coveredShape(P('mine')), 'array', 'REGRESSION: stored as JSON text inside the jsonb column');
    const row = await one(P('mine'));
    assert.equal(row.visitTemplateId, TM1);
    assert.deepEqual(row.coveredJobTypes, [JT1, SEED]);
});

test('HELD + READ (an update): the plan stored as text re-saved as it holds is taken and stored as a list; a type named anew is asked; a body leaving the links out keeps them; null clears', async () => {
    assert.equal(await coveredShape(P_HELD), 'string', "the seed is the census's shape");
    let r = await call('GET');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.plans.find((p) => p.id === P_HELD).coveredJobTypes, [JT_B, JT1], 'the GET answers a list');
    assert.deepEqual(r.body.plans.find((p) => p.id === P_TEXT).coveredJobTypes, [], 'text that is no JSON reads as none — never a string');

    const before = await rowText(P_HELD);
    refused(await call('PUT', { coveredJobTypes: [JT_B, JT1, GONE] }, { id: P_HELD }), 'jobType', 'coveredJobTypes');
    refused(await call('PUT', { visitTemplateId: GONE }, { id: P_HELD }), 'jobTemplate', 'visitTemplateId');
    refused(await call('PUT', { visitTemplateId: TM_B, coveredJobTypes: [JT_B, JT1, JT_B + '_x'] }, { id: P_HELD }), 'jobType', 'coveredJobTypes');
    assert.equal(await rowText(P_HELD), before, 'nothing written, byte for byte');

    r = await call('PUT', { visitTemplateId: TM_B, coveredJobTypes: [JT_B, JT1] }, { id: P_HELD });
    assert.equal(r.status, 200, 'REGRESSION: a plan re-saved as it holds is refused — ' + JSON.stringify(r.body));
    assert.equal(await coveredShape(P_HELD), 'array', 'and stored as a list');
    r = await call('PUT', { coveredJobTypes: [JT_B, JT1, JT2] }, { id: P_HELD });
    assert.equal(r.status, 200, 'a type of this org added beside the held stray');
    r = await call('PUT', { name: 'Held plan, renamed' }, { id: P_HELD });
    assert.equal(r.status, 200);
    let row = await one(P_HELD);
    assert.equal(row.visitTemplateId, TM_B, 'a body leaving the links out keeps them');
    assert.deepEqual(row.coveredJobTypes, [JT_B, JT1, JT2]);
    r = await call('PUT', { cadence: 'monthly', visitTemplateId: TM1 }, { id: P_HELD });
    assert.equal(r.status, 200, 'a cadence change and a link in one save');
    row = await one(P_HELD);
    assert.equal(row.intervalDays, 30);
    assert.equal(row.visitTemplateId, TM1);
    r = await call('PUT', { visitTemplateId: null, coveredJobTypes: null }, { id: P_HELD });
    assert.equal(r.status, 200);
    row = await one(P_HELD);
    assert.equal(row.visitTemplateId, null);
    assert.deepEqual(row.coveredJobTypes, []);
});

test("HELD (a re-POST): a plan's create over itself holding another org's template is taken — the plan it overwrites is read first", async () => {
    await db.insert(dispatchServicePlans).values({ id: P('repost'), orgId: A, name: 'Re-posted', visitTemplateId: TM_B, coveredJobTypes: JSON.stringify([JT_B]) });
    const r = await call('POST', { id: P('repost'), name: 'Re-posted', visitTemplateId: TM_B, coveredJobTypes: [JT_B] });
    assert.equal(r.status, 201, 'REGRESSION: the re-POST is refused for what the plan holds — ' + JSON.stringify(r.body));
    refused(await call('POST', { id: P('repost'), name: 'Re-posted', visitTemplateId: TM_B, coveredJobTypes: [JT_B, GONE] }), 'jobType', 'coveredJobTypes');
});

test("READ + ORG B: an update naming no plan of this org is 404 before anything is asked; org B's plan — 404 to an update, 409 to a create (with no link of B's named: 404 naming the link)", async () => {
    // A link that would be refused if it were asked: read first, the answer is the plan's 404, not the link's.
    let r = await call('PUT', { visitTemplateId: GONE }, { id: P_B });
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: 'Not found' }, "REGRESSION: an update of B's plan has its links asked before the plan is read");
    r = await call('PUT', { name: 'x' }, { id: P('nowhere') });
    assert.equal(r.status, 404);
    r = await call('POST', { id: P_B, name: 'Taken' });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    refused(await call('POST', { id: P_B, name: 'Taken', visitTemplateId: TM_B }), 'jobTemplate', 'visitTemplateId');
});

test('ORG B: its plans and settings byte for byte', async () => {
    assert.deepEqual(await bText(), bSeeded);
});
