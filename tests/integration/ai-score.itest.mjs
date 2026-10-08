// tests/integration/ai-score.itest.mjs
// A deal's AI score, end to end against the real test database (state §0.188).
//
// Proves: a rep scoring their own deal by its id is answered the score as the deal
// keeps it, and the deal keeps it; within a day, without a refresh, the kept score
// answers and Claude is not asked again; a refresh keeps the score it replaces at the
// head of the deal's history, four kept, newest first; a deal save never writes the
// score — the deal window saved the deal it opened, its old score too, over the new
// one — and a create carries none; with the org's switch off the answer is
// { disabled: true }; org B's rep reaches nothing of org A's.
//
// Claude is never called: a fetch to api.anthropic.com is answered here, as the
// endpoint reads the model's reply; every other fetch — the database's own HTTP
// driver — goes through. The auth mock fakes the sign-in only (in-org.itest.mjs's
// pattern, an x-test-user header per person); every handler, gate and query is real.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
// A made-up site key: the endpoint resolves it and sends it to the stub below, never out.
process.env.ANTHROPIC_API_KEY = 'itest-aiscore-site-key';

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
            const userId = event.headers?.['x-test-user'] || `clerk_itest_aiscore_${userRole}_${orgId}`;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// A deal save fires email, webhook and automation side effects; nothing here sends.
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async () => {},
        emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }),
    },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

// The model, answered here: each call recorded, its reply the one this file sets.
const MODEL = { calls: [], reply: null };
const realFetch = globalThis.fetch;
mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://api.anthropic.com/')) {
        MODEL.calls.push({ headers: init?.headers || {}, body: JSON.parse(init?.body || '{}') });
        return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(MODEL.reply) }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, init);
});

const FN = {
    score: (await import('../../netlify/functions/ai-score.mjs')).handler,
    opps:  (await import('../../netlify/functions/opportunities.mjs')).handler,
};
const { db } = await import('../../db/index.js');
const { settings, users, opportunities, auditLog } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_aiscore_*' (rows, ids, Clerk ids, emails).
const A = 'itest_aiscore_A';
const B = 'itest_aiscore_B';
const ORGS = [A, B];
const WHO = {
    rep:  { user: 'clerk_itest_aiscore_rep',  role: 'User' },
    repB: { user: 'clerk_itest_aiscore_repb', role: 'User' },
};
const DEAL = 'opp_itest_aiscore_a';
const DEAL_B = 'opp_itest_aiscore_b';

const call = async (fn, who, method, body, org = A) => {
    const res = await fn({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': who.role, 'x-test-user': who.user, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const kept = async (id) => (await db.select().from(opportunities).where(eq(opportunities.id, id)))[0]?.aiScore ?? null;
const reply = (score, verdict) => ({
    score, verdict, headline: `Scored ${score}`,
    signals: [{ text: 'The champion replied last week', sentiment: 'positive' }, { text: 'No next meeting is booked', sentiment: 'warning' }],
    recommendation: 'Book the walkthrough',
});
const withoutFlags = ({ fromCache: _c, usingOrgKey: _k, ...score }) => score;

const cleanup = async () => {
    for (const t of [opportunities, users, auditLog, settings]) await db.delete(t).where(inArray(t.orgId, ORGS));
};

before(async () => {
    await cleanup();
    await db.insert(settings).values([
        { id: 'settings_' + A, orgId: A, extra: { aiScoringEnabled: true } },
        { id: 'settings_' + B, orgId: B, extra: { aiScoringEnabled: false } },
    ]);
    await db.insert(users).values([
        { id: 'usr_itest_aiscore_rep',  orgId: A, clerkUserId: WHO.rep.user,  name: 'Rhea Aiscore', email: 'rhea@itest-aiscore.local', role: 'User' },
        { id: 'usr_itest_aiscore_repb', orgId: B, clerkUserId: WHO.repB.user, name: 'Bo Aiscore',   email: 'bo@itest-aiscore.local',   role: 'User' },
    ]);
    await db.insert(opportunities).values([
        { id: DEAL, orgId: A, pipelineId: 'default', stage: 'Proposal', opportunityName: 'Aiscore deal', account: 'Aiscore Co',
          salesRep: 'Rhea Aiscore', arr: '48000', forecastedCloseDate: '2026-12-01', ownerId: 'usr_itest_aiscore_rep' },
        { id: DEAL_B, orgId: B, pipelineId: 'default', stage: 'Proposal', opportunityName: 'B deal', salesRep: 'Bo Aiscore',
          ownerId: 'usr_itest_aiscore_repb' },
    ]);
});
after(cleanup);

test('a rep scores their own deal by its id — Claude asked once, with the deal; the answer is the score as kept, no history yet; the deal keeps it', async () => {
    MODEL.calls.length = 0;
    MODEL.reply = reply(72, 'On Track');
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(MODEL.calls.length, 1, 'one call to the model');
    assert.equal(MODEL.calls[0].headers['x-api-key'], 'itest-aiscore-site-key', 'the site key — no org key is installed');
    assert.match(MODEL.calls[0].body.messages[0].content, /Name: Aiscore deal/, 'the deal went in the prompt');
    assert.equal(r.body.score, 72);
    assert.equal(r.body.verdict, 'On Track');
    assert.deepEqual(r.body.signals, reply(72).signals, 'each signal with its sentiment');
    assert.deepEqual(r.body.history, []);
    assert.equal(r.body.usingOrgKey, false);
    assert.deepEqual(await kept(DEAL), withoutFlags(r.body), 'the deal keeps exactly the score answered');
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'ai.deal_scored')));
    assert.equal(audit.length, 1, 'the scoring is in the audit log');
});

test('within a day, without a refresh, the kept score answers — Claude is not asked again', async () => {
    const calls = MODEL.calls.length;
    const before = await kept(DEAL);
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(MODEL.calls.length, calls, 'no call');
    assert.equal(r.body.fromCache, true);
    assert.deepEqual(withoutFlags(r.body), before);
});

test('a refresh keeps the score it replaces at the head of the history — four kept, newest first', async () => {
    const first = await kept(DEAL);
    MODEL.reply = reply(55, 'At Risk');
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.score, 55);
    assert.deepEqual(r.body.history, [{ score: first.score, verdict: first.verdict, scoredAt: first.scoredAt }]);
    for (const n of [40, 35, 30, 25]) {
        MODEL.reply = reply(n, 'Critical');
        assert.equal((await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true })).status, 200);
    }
    const now = await kept(DEAL);
    assert.equal(now.score, 25);
    assert.deepEqual(now.history.map((h) => h.score), [30, 35, 40, 55], 'four, newest first — the first score, 72, dropped');
});

test('a deal save never writes the score — the window sends the deal it opened, its old score too; a create carries none', async () => {
    const score = await kept(DEAL);
    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, DEAL));
    const opened = { ...row, createdAt: undefined, updatedAt: undefined, orgId: undefined };
    for (const old of [null, { score: 99, verdict: 'Strong', signals: [], recommendation: '', scoredAt: '2026-01-01T00:00:00.000Z', history: [] }]) {
        const r = await call(FN.opps, WHO.rep, 'PUT', { ...opened, nextSteps: 'Send the proposal', aiScore: old });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.opportunity.nextSteps, 'Send the proposal', 'the edit is saved');
        assert.deepEqual(await kept(DEAL), score, `the score stays ai-score's (sent: ${JSON.stringify(old)?.slice(0, 30)})`);
    }
    const c = await call(FN.opps, WHO.rep, 'POST', { id: 'opp_itest_aiscore_new', pipelineId: 'default', stage: 'Proposal',
        opportunityName: 'Aiscore new deal', salesRep: 'Rhea Aiscore', aiScore: { score: 90, verdict: 'Strong' } });
    assert.ok(c.status === 200 || c.status === 201, JSON.stringify(c.body));
    assert.equal(await kept('opp_itest_aiscore_new'), null, 'a create keeps no score it was sent');
});

test("the org's switch off — { disabled: true }; Claude is not asked and the deal keeps nothing", async () => {
    const calls = MODEL.calls.length;
    const r = await call(FN.score, WHO.repB, 'POST', { opportunityId: DEAL_B }, B);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { disabled: true });
    assert.equal(MODEL.calls.length, calls);
    assert.equal(await kept(DEAL_B), null);
});

test("org B reaches nothing of org A's — its rep scoring A's deal is refused, and A's score is unchanged", async () => {
    const calls = MODEL.calls.length;
    const score = await kept(DEAL);
    const r = await call(FN.score, WHO.repB, 'POST', { opportunityId: DEAL, forceRefresh: true }, B);
    assert.equal(r.status, 404);
    assert.equal(MODEL.calls.length, calls);
    assert.deepEqual(await kept(DEAL), score);
});
