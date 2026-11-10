// tests/integration/ai-score.itest.mjs
// A deal's AI score, end to end against the real test database (state §0.188).
//
// Proves: a rep scoring their own deal by its id is answered the score as the deal
// keeps it, and the deal keeps it; within a day, without a refresh, the kept score
// answers and Claude is not asked again; a refresh keeps the score it replaces at the
// head of the deal's history, four kept, newest first; a deal save never writes the
// score — the deal window saved the deal it opened, its old score too, over the new
// one — and a create carries none; with the org's switch off the answer is
// { disabled: true }; org B's rep reaches nothing of org A's; and the model is told who
// on the deal was engaged — by the contact ids the deal's activities carry, a merged
// duplicate as the contact it was merged into, each with their last touch and count, the
// names looked up in this org only (state §0.192).
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

// The model, answered here: each call recorded, its reply the one this file sets. Since §0.238 a reply opens with
// a thinking block, as the 5.5 models' can (the scorer read content[0].text); `plan` answers the next calls in
// turn — a status and body, a refusal, or a thrown network error — before the default reply.
const MODEL = { calls: [], reply: null, plan: [], listed: [], listCalls: [] };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;
mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://api.anthropic.com/v1/models')) {
        MODEL.listCalls.push({ headers: init?.headers || {} });
        return json(200, { data: MODEL.listed.map((id) => ({ id, type: 'model' })), has_more: false });
    }
    if (String(url).startsWith('https://api.anthropic.com/')) {
        MODEL.calls.push({ headers: init?.headers || {}, body: JSON.parse(init?.body || '{}'), signal: init?.signal });
        const next = MODEL.plan.shift();
        if (next === 'throw') throw new TypeError('fetch failed');
        if (next) return json(next.status, next.body);
        return json(200, { content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify(MODEL.reply) }], stop_reason: 'end_turn' });
    }
    return realFetch(url, init);
});

const FN = {
    score: (await import('../../netlify/functions/ai-score.mjs')).handler,
    opps:  (await import('../../netlify/functions/opportunities.mjs')).handler,
    // State §0.238: the settings PUT's rule for the AI blob, Ask AI's "Available to", and the key check.
    settings: (await import('../../netlify/functions/settings.mjs')).handler,
    prompt:   (await import('../../netlify/functions/report-prompt.mjs')).handler,
    models:   (await import('../../netlify/functions/ai-models.mjs')).handler,
};
const { dealBody } = await import('../../src/utils/dealNotes.js');   // what a deal window sends since §0.236
const { db } = await import('../../db/index.js');
const { settings, users, opportunities, auditLog, activities, contacts } = await import('../../db/schema.js');
const { eq, and, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_aiscore_*' (rows, ids, Clerk ids, emails).
const A = 'itest_aiscore_A';
const B = 'itest_aiscore_B';
const ORGS = [A, B];
const WHO = {
    rep:  { user: 'clerk_itest_aiscore_rep',  role: 'User' },
    repB: { user: 'clerk_itest_aiscore_repb', role: 'User' },
    mgr:  { user: 'clerk_itest_aiscore_mgr',  role: 'Manager' },
    admin: { user: 'clerk_itest_aiscore_admin', role: 'Admin' },
};
const DEAL = 'opp_itest_aiscore_a';
const DEAL_B = 'opp_itest_aiscore_b';
// §0.192: a deal with people, its activities naming them by id.
const DEAL_PEOPLE = 'opp_itest_aiscore_people';
const CON = {
    priya: 'con_itest_aiscore_priya', tom: 'con_itest_aiscore_tom', dup: 'con_itest_aiscore_dup',
    ollie: 'con_itest_aiscore_ollie', bea: 'con_itest_aiscore_bea', una: 'con_itest_aiscore_una',
    chainA: 'con_itest_aiscore_chain_a', chainB: 'con_itest_aiscore_chain_b',
};

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
    for (const t of [activities, contacts, opportunities, users, auditLog, settings]) await db.delete(t).where(inArray(t.orgId, ORGS));
};

before(async () => {
    await cleanup();
    await db.insert(settings).values([
        // A settings row's id is its org's, as the settings PUT writes it (state §0.238's PUT test saves through it).
        { id: A, orgId: A, extra: { aiScoringEnabled: true } },
        { id: B, orgId: B, extra: { aiScoringEnabled: false } },
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
        // Bea is org B's contact; her id on A's deal names nobody here.
        { id: DEAL_PEOPLE, orgId: A, pipelineId: 'default', stage: 'Negotiation/Review', opportunityName: 'Aiscore people deal',
          account: 'Aiscore Co', salesRep: 'Rhea Aiscore', arr: '30000', ownerId: 'usr_itest_aiscore_rep',
          contactIds: [CON.priya, CON.tom, CON.bea, CON.una], contacts: 'Priya Itest (Procurement Lead), Tom Itest (Plant Manager)' },
    ]);
    await db.insert(contacts).values([
        { id: CON.priya, orgId: A, firstName: 'Priya', lastName: 'Itest', title: 'Procurement Lead', ownerId: 'usr_itest_aiscore_rep' },
        { id: CON.tom,   orgId: A, firstName: 'Tom',   lastName: 'Itest', title: 'Plant Manager' },
        { id: CON.dup,   orgId: A, firstName: 'Priya', lastName: 'Itest', mergeArchived: true, mergedIntoId: CON.priya },
        { id: CON.ollie, orgId: A, firstName: 'Ollie', lastName: 'Itest' },
        { id: CON.bea,   orgId: B, firstName: 'Bea',   lastName: 'Outsider', title: 'CFO' },
        // On the deal by id alone — the text never named her; no activity.
        { id: CON.una,   orgId: A, firstName: 'Una',   lastName: 'Itest', title: 'CFO' },
        // Two steps: A was merged into B, and B into Priya. Only A is named by an activity.
        { id: CON.chainA, orgId: A, firstName: 'Priya', lastName: 'Itest', mergeArchived: true, mergedIntoId: CON.chainB },
        { id: CON.chainB, orgId: A, firstName: 'Priya', lastName: 'Itest', mergeArchived: true, mergedIntoId: CON.priya },
    ]);
    // As stored: the seeded and merged shapes the endpoint must read (contactIds alone;
    // a merge's leftover duplicate; a legacy single contactId), and two that must name nobody.
    await db.insert(activities).values([
        { id: 'act_itest_aiscore_1', orgId: A, opportunityId: DEAL_PEOPLE, type: 'Email',   date: '2026-09-30', contactIds: [CON.priya] },
        { id: 'act_itest_aiscore_2', orgId: A, opportunityId: DEAL_PEOPLE, type: 'Meeting', date: '2026-09-15', contactIds: [CON.dup] },
        { id: 'act_itest_aiscore_3', orgId: A, opportunityId: DEAL_PEOPLE, type: 'Call',    date: '2026-08-01', contactId: CON.tom, contactIds: [] },
        { id: 'act_itest_aiscore_4', orgId: A, opportunityId: DEAL_PEOPLE, type: 'Call',    date: '2026-10-01', contactIds: [CON.bea] },
        { id: 'act_itest_aiscore_5', orgId: B, opportunityId: DEAL_PEOPLE, type: 'Meeting', date: '2026-10-05', contactIds: [CON.ollie] },
        { id: 'act_itest_aiscore_6', orgId: A, opportunityId: DEAL_PEOPLE, type: 'Call',    date: '2026-09-10', contactIds: [CON.chainA] },
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
    assert.deepEqual(r.body.history, [{ score: first.score, verdict: first.verdict, scoredAt: first.scoredAt, model: 'claude-haiku-5-5' }], 'its model too (state §0.238)');
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
        const r = await call(FN.opps, WHO.rep, 'PUT', dealBody({ ...opened, nextSteps: 'Send the proposal', aiScore: old }));   // its notes and history never sent (§0.236)
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

test('the model is told who was engaged — by id, a merged duplicate as its survivor, with last touch and count; nothing from org B (§0.192)', async () => {
    MODEL.calls.length = 0;
    MODEL.reply = reply(61, 'At Risk');
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL_PEOPLE });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(MODEL.calls.length, 1);
    const prompt = MODEL.calls[0].body.messages[0].content;
    assert.equal(prompt.match(/^- Contacts engaged: (.*)$/m)?.[1],
        'Priya Itest (last touch 2026-09-30, 3 activities), Tom Itest (last touch 2026-08-01, 1 activity)',
        'Priya by her id, her merged duplicate\'s and a two-step chain\'s — one person; Tom by his legacy single id; latest touch first');
    assert.equal(prompt.match(/^- Contacts listed: (.*)$/m)?.[1], 'Priya Itest (Procurement Lead), Tom Itest (Plant Manager), Una Itest (CFO)',
        'the deal\'s ids — Una by id alone — named in this org');
    assert.ok(!prompt.includes('Outsider'), 'an org-B contact\'s id on this deal names nobody');
    assert.ok(!prompt.includes('Ollie'), 'org B\'s activity on this deal\'s id is not read');
    assert.ok(!/Contacts engaged: none/.test(prompt));
});

// ── State §0.238: the Admin's model, the fallback, "Available to", the PUT's rule, the key check ───────────────

const setAi = async (aiSettings, more = {}) => {
    await db.update(settings).set({ extra: { aiScoringEnabled: true, ...more, ...(aiSettings === undefined ? {} : { aiSettings }) } }).where(eq(settings.orgId, A));
};
const auditsOf = async (action) => db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, action), eq(auditLog.entityId, DEAL)));
// A row by its exact detail — rows written within a second cannot be ordered by their timestamps.
const hasRow = (rows, detail) => assert.ok(rows.some((x) => x.detail === detail), `no row: ${detail} — ${JSON.stringify(rows.map((x) => x.detail))}`);
const err = (status, type, message) => ({ status, body: { type: 'error', error: { type, message } } });

test("the Admin's model is asked — at effort low, for JSON, room for thinking; the score and the audit row name it", async () => {
    await setAi({ model: 'claude-opus-5-5', fallback: 'claude-haiku-5-5' });
    MODEL.calls.length = 0; MODEL.plan = [];
    MODEL.reply = reply(66, 'On Track');
    const audits = (await auditsOf('ai.deal_scored')).length;
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(MODEL.calls.map((c) => c.body.model), ['claude-opus-5-5']);
    const body = MODEL.calls[0].body;
    assert.equal(body.max_tokens, 4000);
    assert.equal(body.output_config.effort, 'low');
    assert.equal(body.output_config.format.type, 'json_schema');
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(k in body), `no ${k}`);
    assert.ok(MODEL.calls[0].signal, 'the attempt has its own time limit');
    assert.equal(r.body.model, 'claude-opus-5-5');
    assert.equal((await kept(DEAL)).model, 'claude-opus-5-5', 'the deal keeps the model that answered');
    const rows = await auditsOf('ai.deal_scored');
    assert.equal(rows.length, audits + 1);
    hasRow(rows, 'claude-opus-5-5 · the site key · score 66 (On Track)');
});

test('a stored model off the list runs as Haiku 5.5 (Q2) — what a panel nobody chose in stored', async () => {
    await setAi({ model: 'claude-sonnet-4-6', fallback: 'claude-haiku-4-5-20251001' });
    MODEL.calls.length = 0; MODEL.plan = [];
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(MODEL.calls.map((c) => c.body.model), ['claude-haiku-5-5']);
});

test('busy, missing, refused or a dropped connection: the fallback answers, once, with the same key — the row names both', async () => {
    await setAi({ model: 'claude-opus-5-5', fallback: 'claude-haiku-5-5' });
    for (const [first, words] of [
        [err(529, 'overloaded_error', 'Overloaded'), '529 overloaded_error: Overloaded'],
        [err(404, 'not_found_error', 'model: claude-opus-5-5'), '404 not_found_error: model: claude-opus-5-5'],
        [{ status: 200, body: { content: [], stop_reason: 'refusal', stop_details: { category: 'general_harms' } } }, 'declined (general_harms)'],
        ['throw', 'network: TypeError'],
    ]) {
        MODEL.calls.length = 0; MODEL.plan = [first];
        MODEL.reply = reply(44, 'At Risk');
        const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
        assert.equal(r.status, 200, `${words}: ${JSON.stringify(r.body)}`);
        assert.deepEqual(MODEL.calls.map((c) => c.body.model), ['claude-opus-5-5', 'claude-haiku-5-5'], words);
        assert.deepEqual(MODEL.calls.map((c) => c.headers['x-api-key']), ['itest-aiscore-site-key', 'itest-aiscore-site-key']);
        assert.equal(MODEL.calls[0].body.messages[0].content, MODEL.calls[1].body.messages[0].content, 'the same prompt');
        assert.equal((await kept(DEAL)).model, 'claude-haiku-5-5', 'the model that answered');
        hasRow(await auditsOf('ai.deal_scored'), `claude-haiku-5-5 · the site key · score 44 (At Risk) · after claude-opus-5-5: ${words}`);
    }
});

test('a blank recommendation goes once to the fallback; kept with no next action when none brings one; a signal with no words dropped (§0.240)', async () => {
    await setAi({ model: 'claude-opus-5-5', fallback: 'claude-haiku-5-5' });
    const answer = (body) => ({ status: 200, body: { content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason: 'end_turn' } });
    const blank = { ...reply(31, 'Critical'), recommendation: '  ', signals: [{ text: 'No reply in a month', sentiment: 'negative' }, { text: '', sentiment: 'warning' }] };
    // blank first, the fallback brings one: the fallback's kept
    MODEL.calls.length = 0; MODEL.plan = [answer(blank)];
    MODEL.reply = reply(52, 'At Risk');
    let r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(MODEL.calls.map((c) => c.body.model), ['claude-opus-5-5', 'claude-haiku-5-5'], 'REGRESSION: a blank next action kept without asking again');
    assert.equal((await kept(DEAL)).recommendation, 'Book the walkthrough');
    hasRow(await auditsOf('ai.deal_scored'), 'claude-haiku-5-5 · the site key · score 52 (At Risk) · after claude-opus-5-5: a blank recommendation');
    // both blank: the score kept, with no next action, and said so (Jeff: "Keep score, no action")
    MODEL.calls.length = 0; MODEL.plan = [answer(blank), answer({ ...blank, score: 29 })];
    r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 200, 'never a 502 for a score with no next action');
    const k = await kept(DEAL);
    assert.deepEqual([k.score, k.model, k.recommendation], [29, 'claude-haiku-5-5', ''], 'the last answer that read');
    assert.deepEqual(k.signals.map((s) => s.text), ['No reply in a month'], 'a signal with no words dropped');
    hasRow(await auditsOf('ai.deal_scored'), 'claude-haiku-5-5 · the site key · score 29 (Critical) · after claude-opus-5-5: a blank recommendation · kept with no next action');
    // blank first, the fallback busy: the first answer kept, the fallback named after it
    MODEL.calls.length = 0; MODEL.plan = [answer({ ...blank, score: 33 }), err(529, 'overloaded_error', 'Overloaded')];
    r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 200);
    assert.deepEqual([(await kept(DEAL)).score, (await kept(DEAL)).model], [33, 'claude-opus-5-5']);
    hasRow(await auditsOf('ai.deal_scored'), 'claude-opus-5-5 · the site key · score 33 (Critical) · then claude-haiku-5-5: 529 overloaded_error: Overloaded · kept with no next action');
});

test('a refused key or request: no fallback, 502 with the cause in words, the deal unchanged, the failure in the log; both failing names both', async () => {
    await setAi({ model: 'claude-sonnet-5-5', fallback: 'claude-haiku-5-5' });
    for (const [first, cause, said] of [
        [err(401, 'authentication_error', 'invalid x-api-key sk-ant-api03-secret'), 'key', /key was refused/],
        [err(400, 'invalid_request_error', 'bad'), 'request', /tell your administrator/],
    ]) {
        const score = await kept(DEAL);
        const fails = (await auditsOf('ai.deal_score_failed')).length;
        MODEL.calls.length = 0; MODEL.plan = [first];
        const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
        assert.equal(r.status, 502);
        assert.equal(r.body.cause, cause);
        assert.match(r.body.error, said);
        assert.equal(MODEL.calls.length, 1, `${cause}: the fallback would fail alike`);
        assert.deepEqual(await kept(DEAL), score, 'nothing kept');
        const rows = await auditsOf('ai.deal_score_failed');
        assert.equal(rows.length, fails + 1, 'the deal left the app — the log says so');
        assert.ok(!rows.some((x) => x.detail.includes('sk-ant')), 'never the key');
    }
    MODEL.calls.length = 0; MODEL.plan = [err(529, 'overloaded_error', 'Overloaded'), err(500, 'api_error', 'Internal')];
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 502);
    assert.deepEqual([r.body.cause, r.body.error], ['busy', 'Claude is busy — try again in a minute.']);
    hasRow(await auditsOf('ai.deal_score_failed'), 'the site key · claude-sonnet-5-5: 529 overloaded_error: Overloaded · claude-haiku-5-5: 500 api_error: Internal');
});

test("the score's text ends at a whole word (OPEN_ITEMS §4.2)", async () => {
    await setAi({});
    MODEL.calls.length = 0; MODEL.plan = [];
    MODEL.reply = { ...reply(50, 'At Risk'), headline: 'Proposal stalled twenty one days with the CFO unengaged and a three year price lock request still unanswered by anyone on the buying side', recommendation: 'r' };
    const r = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL, forceRefresh: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.headline.length <= 120 && r.body.headline.endsWith('…'), r.body.headline);
    assert.ok(/[a-z]…$/.test(r.body.headline) && MODEL.reply.headline.startsWith(r.body.headline.slice(0, -1) + ' '), 'cut at a word');
});

test('"Available to": a role it leaves out asks nothing and gets no cached score (Q3); the roles it names score; a value off the list is Admin only', async () => {
    await setAi({ availableTo: 'Admin + Manager only' });
    MODEL.calls.length = 0; MODEL.plan = [];
    const refused = await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, 'ai_role');
    assert.equal(refused.body.error, 'AI in this workspace is open to Admins and Managers.');
    assert.ok(!('score' in refused.body), 'not the cached score either');
    assert.equal(MODEL.calls.length, 0);
    assert.equal((await call(FN.score, WHO.mgr, 'POST', { opportunityId: DEAL })).status, 200, 'a Manager');
    await setAi({ availableTo: 'Admin only' });
    assert.equal((await call(FN.score, WHO.mgr, 'POST', { opportunityId: DEAL })).status, 403);
    assert.equal((await call(FN.score, WHO.admin, 'POST', { opportunityId: DEAL })).status, 200, 'an Admin');
    await setAi({ availableTo: 'Everyone' });
    assert.equal((await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL })).status, 403, 'off the list: closed');
    assert.equal((await call(FN.score, WHO.admin, 'POST', { opportunityId: DEAL })).status, 200);
    await setAi({ availableTo: 'All roles' });
    assert.equal((await call(FN.score, WHO.rep, 'POST', { opportunityId: DEAL })).status, 200, 'All roles: a rep');
    const [b] = await db.select().from(settings).where(eq(settings.orgId, B));
    assert.deepEqual(b.extra, { aiScoringEnabled: false }, "org B's settings untouched by A's");
});

test('Ask AI follows "Available to" (Q1): a role it leaves out gets the built-in reader — nothing sent to Claude', async () => {
    await setAi({ availableTo: 'Admin only' }, { aiReportPromptsEnabled: true });
    MODEL.calls.length = 0; MODEL.plan = [];
    const r = await call(FN.prompt, WHO.rep, 'POST', { prompt: 'deals by stage' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { unavailable: true, reason: 'role' });
    assert.equal(MODEL.calls.length, 0);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'ai.report_prompt')));
    assert.equal(audits.length, 0, 'nothing left the app, nothing to log');
});

test('the settings PUT: a model, fallback or "Available to" named anew off the list is refused, nothing written; one the row holds still saves', async () => {
    await setAi({ model: 'claude-sonnet-4-6', availableTo: 'All roles' });
    const put = (aiSettings) => call(FN.settings, WHO.admin, 'PUT', { aiSettings });
    for (const [blob, field] of [
        [{ model: 'claude-opus-4-6', availableTo: 'All roles' }, 'aiSettings.model'],
        [{ model: 'claude-sonnet-4-6', fallback: 'gpt-6', availableTo: 'All roles' }, 'aiSettings.fallback'],
        [{ model: 'claude-sonnet-4-6', availableTo: 'Everyone' }, 'aiSettings.availableTo'],
    ]) {
        const r = await put(blob);
        assert.equal(r.status, 400, JSON.stringify(r.body));
        assert.equal(r.body.field, field);
        const [row] = await db.select().from(settings).where(eq(settings.orgId, A));
        assert.equal(row.extra.aiSettings.model, 'claude-sonnet-4-6', 'nothing written');
    }
    const held = await put({ model: 'claude-sonnet-4-6', availableTo: 'All roles', byok: false });
    assert.equal(held.status, 200, JSON.stringify(held.body));
    const chosen = await put({ model: 'claude-opus-5-5', fallback: 'claude-haiku-5-5', availableTo: 'Admin + Manager only' });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
    const [row] = await db.select().from(settings).where(eq(settings.orgId, A));
    assert.deepEqual(row.extra.aiSettings, { model: 'claude-opus-5-5', fallback: 'claude-haiku-5-5', availableTo: 'Admin + Manager only' });
});

test("the key check: an Admin's; the models of the list this org's key lists — ids only, the site key's here", async () => {
    await setAi({});
    MODEL.listCalls.length = 0;
    MODEL.listed = ['claude-fable-5-2', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001'];
    const r = await call(FN.models, WHO.admin, 'GET');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { checked: true, usingOrgKey: false, callable: ['claude-haiku-5-5', 'claude-opus-5-5'] });
    assert.equal(MODEL.listCalls[0].headers['x-api-key'], 'itest-aiscore-site-key');
    assert.ok(!JSON.stringify(r.body).includes('itest-aiscore-site-key'), 'never the key');
    assert.equal((await call(FN.models, WHO.rep, 'GET')).status, 403, "a rep's is not to ask");
    assert.equal(MODEL.listCalls.length, 1);
});
