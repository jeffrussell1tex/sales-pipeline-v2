// tests/integration/send-slack.itest.mjs
// send-slack against the real handler and the real settings table (state
// §0.92, handoff item 25). Proves: a non-Admin is refused before anything is
// read or sent; an Admin's typed test URL is refused unless it is a Slack
// Incoming Webhook, with nothing fetched; a Slack URL is POSTed to once with a
// text body and the stored webhook is not written; the org path posts to the
// org's own stored webhook; a stored NON-Slack webhook is refused inside
// sendSlack (400, nothing fetched); an org with nothing stored gets 400.
//
// fetch is mocked on globalThis for every host but the test database's — no
// request leaves the process. Run:  npm run test:int   (needs DATABASE_URL_TEST)
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
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'clerk_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole) ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
    },
});

// The Neon HTTP driver talks to the database through fetch, so the mock passes
// the database through untouched and records everything else. The driver does
// not POST to the connection string's host: it posts to the regional API host
// (`api.<region>…neon.tech/sql`), which shares every label but the first with
// the endpoint host — so "the database" is any host under that suffix.
const realFetch = globalThis.fetch;
const CONN_HOST = new URL(process.env.DATABASE_URL_TEST).hostname;
const DB_SUFFIX = CONN_HOST.slice(CONN_HOST.indexOf('.'));   // ".c-3.us-east-2.aws.neon.tech"
const urlOf = (u) => (typeof u === 'string' ? u : (u && typeof u.url === 'string' ? u.url : String(u)));
const isDb = (u) => { try { return new URL(urlOf(u)).hostname.endsWith(DB_SUFFIX); } catch { return false; } };
const calls = [];
const fetchMock = mock.method(globalThis, 'fetch', async (url, opts) => {
    if (isDb(url)) return realFetch(url, opts);
    calls.push({ url: urlOf(url), opts });
    return { ok: true, status: 200, text: async () => 'ok' };
});

const { handler, sendSlackToOrg, postDealEvents } = await import('../../netlify/functions/send-slack.mjs');
const { db } = await import('../../db/index.js');
const { settings } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_slack_A';   // a Slack webhook stored
const ORG_B = 'itest_slack_B';   // a NON-Slack webhook stored (the pre-§0.92 shape)
const ORG_C = 'itest_slack_C';   // no settings row at all
const ORG_D = 'itest_slack_D';   // a Slack webhook with dealSilent unticked (state §0.96, item 29)
// Assembled at run time: a literal in the Slack shape trips GitHub's push
// protection (it reads as a leaked webhook, which it is not).
const slackUrl = (t, b, k) => ['https://hooks.slack.com', 'services', t, b, k].join('/');
const SLACK_A = slackUrl('T0ITESTA', 'B0ITESTA', 'a'.repeat(24));
const SLACK_B = slackUrl('T0ITESTB', 'B0ITESTB', 'b'.repeat(24));
const SLACK_D = slackUrl('T0ITESTD', 'B0ITESTD', 'd'.repeat(24));

const call = (org, body, { role } = {}) => handler({
    httpMethod: 'POST',
    headers: { 'x-test-org': org, ...(role ? { 'x-test-role': role } : {}) },
    body: JSON.stringify(body),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const storedOf = async (org) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0]?.extra?.slackConfig;

const cleanup = async () => {
    for (const o of [ORG_A, ORG_B, ORG_C, ORG_D]) await db.delete(settings).where(eq(settings.orgId, o));
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(settings).values({ id: ORG_A, orgId: ORG_A, extra: { slackConfig: { webhookUrl: SLACK_A, channel: '#a', enabled: true } }, updatedAt: new Date() });
    await db.insert(settings).values({ id: ORG_B, orgId: ORG_B, extra: { slackConfig: { webhookUrl: 'https://example.test/not-slack', enabled: true } }, updatedAt: new Date() });
    await db.insert(settings).values({ id: ORG_D, orgId: ORG_D, extra: { slackConfig: { webhookUrl: SLACK_D, channel: '#d', enabled: true, alerts: { dealSilent: false, stageChanged: false } } }, updatedAt: new Date() });
});

// ── item 33: event posts from a deal save, against the real row ─────────────

test("a win posts to the org's webhook the moment it happens; a plain stage change is unticked for D and posts nothing; the org's own settings row decides", async () => {
    calls.length = 0;
    const after = { opportunityName: 'Acme renewal', account: 'Acme', arr: 120000, salesRep: 'Karen Russell', stage: 'Closed Won' };
    assert.deepEqual(await postDealEvents(ORG_D, { before: { stage: 'Negotiation/Review' }, after, mover: 'Jeff Russell' }), ['dealClosedWon']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SLACK_D);
    const sent = JSON.parse(calls[0].opts.body);
    assert.match(sent.text, /Acme renewal/);
    assert.match(sent.text, /closed won/i);
    assert.match(JSON.stringify(sent.blocks), /Jeff Russell/, 'names who closed it');
    assert.match(JSON.stringify(sent.blocks), /Karen Russell/, 'and whose deal it is');
    assert.deepEqual(await postDealEvents(ORG_D, { before: { stage: 'Proposal' }, after: { ...after, stage: 'Negotiation/Review' }, mover: 'Jeff Russell' }), [], 'stageChanged is unticked for D');
    assert.equal(calls.length, 1, 'nothing more fetched');
    assert.deepEqual(await postDealEvents(ORG_A, { before: { stage: 'Proposal' }, after: { ...after, stage: 'Negotiation/Review' }, mover: 'Jeff Russell' }), ['stageChanged'], "A saved before the key existed — it posts");
    assert.equal(calls[1].url, SLACK_A);
    assert.match(JSON.parse(calls[1].opts.body).text, /moved to Negotiation\/Review/);
    assert.deepEqual(await postDealEvents(ORG_A, { before: { stage: 'Proposal' }, after: { ...after, stage: 'Proposal' } }), [], 'no change, no post');
    assert.deepEqual(await postDealEvents(ORG_C, { before: { stage: 'Proposal' }, after }), [], 'no settings row: nothing, no throw');
    assert.equal(calls.length, 2);
});

// ── item 29: the org's own selection, against the real row ──────────────────

test("an unticked alert type posts nowhere for that org; a ticked one still posts; the digest (no type) is not gated", async () => {
    calls.length = 0;
    assert.equal(await sendSlackToOrg(ORG_D, { text: 'silent' }, 'dealSilent'), false, 'dealSilent is off for D');
    assert.equal(calls.length, 0, 'nothing fetched');
    assert.equal(await sendSlackToOrg(ORG_D, { text: 'stuck' }, 'dealStuck'), true, 'dealStuck is absent = on');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SLACK_D);
    assert.equal(await sendSlackToOrg(ORG_D, { text: 'digest' }), true, 'no type: not gated');
    assert.equal(calls.length, 2);
    assert.equal(await sendSlackToOrg(ORG_D, { text: 'typo' }, 'notAType'), false, 'an unknown type fails closed');
    assert.equal(calls.length, 2);
});

test("an org that saved before item 29 has no `alerts` and posts every type", async () => {
    calls.length = 0;
    assert.equal(await sendSlackToOrg(ORG_A, { text: 'silent' }, 'dealSilent'), true);
    assert.equal(await sendSlackToOrg(ORG_A, { text: 'drop' }, 'scoreDropAlert'), true);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => c.url === SLACK_A), "A's webhook, never D's");
});
after(async () => { await cleanup(); fetchMock.mock.restore(); });

test('every role but Admin is refused, and nothing is fetched', async () => {
    for (const role of ['User', 'Manager', 'ReadOnly', 'Technician']) {
        calls.length = 0;
        const { status, body } = parse(await call(ORG_A, { webhookUrl: SLACK_A }, { role }));
        assert.equal(status, 403, role);
        assert.equal(body.error, 'Forbidden: insufficient role', role);
        assert.equal(calls.length, 0, role + ': no request left the server');
    }
});

test("an Admin's typed test URL must be a Slack Incoming Webhook — anything else is 400 with nothing fetched", async () => {
    for (const url of ['https://example.test/hook', 'http://hooks.slack.com/services/T/B/x', 'https://10.0.0.5/services/T/B/x', 'https://hooks.slack.com/', 'not a url']) {
        calls.length = 0;
        const { status, body } = parse(await call(ORG_A, { webhookUrl: url }));
        assert.equal(status, 400, url);
        assert.match(body.error, /Webhook URL/, url);
        assert.equal(calls.length, 0, url + ': nothing fetched');
    }
});

test("an Admin's Slack URL is POSTed to once with the test text, and the stored webhook is not written", async () => {
    calls.length = 0;
    const { status, body } = parse(await call(ORG_A, { webhookUrl: SLACK_B }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SLACK_B, 'the typed URL, not the stored one');
    assert.equal(calls[0].opts.method, 'POST');
    const sent = JSON.parse(calls[0].opts.body);
    assert.ok(typeof sent.text === 'string' && sent.text.length > 0, 'a text body');
    assert.equal((await storedOf(ORG_A)).webhookUrl, SLACK_A, 'the test never writes settings');
});

test("the org path posts to the org's own stored webhook", async () => {
    calls.length = 0;
    const { status } = parse(await call(ORG_A, { text: 'hello from A' }));
    assert.equal(status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SLACK_A, "org A's webhook, not B's");
    assert.equal(JSON.parse(calls[0].opts.body).text, 'hello from A');
});

test('a stored NON-Slack webhook is refused inside sendSlack — 400, nothing fetched', async () => {
    calls.length = 0;
    const { status, body } = parse(await call(ORG_B, { text: 'hello from B' }));
    assert.equal(status, 400);
    assert.equal(body.error, 'Slack is not configured for this workspace');
    assert.equal(calls.length, 0, 'the alert path posts nowhere');
    assert.equal((await storedOf(ORG_B)).webhookUrl, 'https://example.test/not-slack', 'the row is not rewritten');
});

test('an org with no settings row gets 400 and no fetch', async () => {
    calls.length = 0;
    assert.equal(parse(await call(ORG_C, { text: 'x' })).status, 400);
    assert.equal(calls.length, 0);
});
