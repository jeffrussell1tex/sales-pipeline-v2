// tests/integration/lead-intake.itest.mjs
// The public web-to-lead endpoint against the real database (state §0.121).
// Proves: the token finds ITS org and the lead lands there, unassigned and
// unowned, with the org's source; the other org never sees it; a turned-off
// form, an unknown token and a malformed token are all the same 404; the
// hosted form renders the org's name and may be framed; a form-encoded post
// gets a thank-you page, a JSON post gets JSON; the honeypot yields thanks and
// NO row; a submission naming an owner is stored unowned; a submission with no
// contact is refused; the Slack post fires under 'webLead'; the per-token
// rate limit answers 429.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const slackPosts = [];
mock.module(new URL('../../netlify/functions/send-slack.mjs', import.meta.url).href, {
    namedExports: {
        sendSlackToOrg: async (orgId, msg, type) => { slackPosts.push({ orgId, type, text: msg?.text }); return true; },
        slackTemplates: { webLead: (ctx) => ({ text: `web lead ${ctx.name}` }) },
    },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const { handler } = await import('../../netlify/functions/lead-intake.mjs');
const { db } = await import('../../db/index.js');
const { leads, settings: settingsTable } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_wtl_*'. It seeds settings rows only
// (no users), so it collides with no other suite.
const A = 'itest_wtl_A', B = 'itest_wtl_B';
const TA = 'itestTokenAAAAAAAAAAAAAAAAAAAA01';   // 32 base64url chars
const TB = 'itestTokenBBBBBBBBBBBBBBBBBBBB02';
const BAD = 'nope';

const post = (token, body, { json = true, headers = {} } = {}) => handler({
    httpMethod: 'POST',
    path: '/.netlify/functions/lead-intake',
    headers: { 'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded', ...headers },
    queryStringParameters: token ? { t: token } : {},
    body: json ? JSON.stringify(body) : new URLSearchParams(body).toString(),
});
const get = (token, viaPath = false) => handler({
    httpMethod: 'GET',
    path: viaPath ? `/lead-form/${token}` : '/.netlify/functions/lead-intake',
    headers: {},
    queryStringParameters: viaPath ? {} : { t: token },
});
const leadsOf = (org) => db.select().from(leads).where(eq(leads.orgId, org));
const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(leads).where(eq(leads.orgId, o));
        await db.delete(settingsTable).where(eq(settingsTable.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(settingsTable).values([
        { id: 'itest_wtl_settings_A', orgId: A, companyName: 'Alpha Co', extra: { webToLead: { enabled: true,  token: TA, source: 'Website' }, companyDisplayName: 'Alpha Company' } },
        { id: 'itest_wtl_settings_B', orgId: B, companyName: 'Beta Co',  extra: { webToLead: { enabled: false, token: TB } } },
    ]);
});
after(cleanup);

test('the hosted form: the org\'s display name, the form posts to the function with the token, framing allowed; a path token works', async () => {
    const r = await get(TA);
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['Content-Type'], /text\/html/);
    assert.ok(r.body.includes('Alpha Company'), 'the display name, not the legal one');
    assert.ok(r.body.includes(`action="/.netlify/functions/lead-intake?t=${TA}"`));
    assert.ok(r.body.includes('name="website"'), 'the honeypot is in the form');
    assert.equal(r.headers['X-Frame-Options'], undefined, 'no frame denial');
    assert.doesNotMatch(r.headers['Content-Security-Policy'], /frame-ancestors/, 'no frame-ancestors either — framable from file: and data: parents too');
    assert.equal(r.headers['Cache-Control'], 'no-store');
    assert.equal((await get(TA, true)).statusCode, 200, 'the /lead-form/<token> path');
});

test('a turned-off form, an unknown token and a malformed token are the same 404 — on GET and on POST', async () => {
    for (const t of [TB, 'unknownTokenZZZZZZZZZZZZZZZZZZZZ99', BAD, '']) {
        const g = await get(t);
        assert.equal(g.statusCode, 404, `GET ${t || '(empty)'}`);
        assert.ok(g.body.includes('This form is not available'));
        const p = await post(t, { firstName: 'X', email: 'x@y.co' });
        assert.equal(p.statusCode, 404, `POST ${t || '(empty)'}`);
        assert.deepEqual(JSON.parse(p.body), { ok: false, error: 'Form not found' });
    }
    assert.equal((await leadsOf(B)).length, 0, 'nothing reached the turned-off org');
});

test('a JSON submission becomes an UNASSIGNED lead in the token\'s org, with its source, scored, and posts to Slack under webLead', async () => {
    slackPosts.length = 0;
    const r = await post(TA, { firstName: 'Ada', lastName: 'Lovelace', company: 'Analytical', email: 'ada@example.com', phone: '555-0100', message: 'Need a quote.\nSoon.' }, { headers: { referer: 'https://alpha.example/contact' } });
    assert.equal(r.statusCode, 201, r.body);
    assert.deepEqual(JSON.parse(r.body), { ok: true });
    assert.equal(r.headers['Access-Control-Allow-Origin'], '*');
    const rows = await leadsOf(A);
    assert.equal(rows.length, 1);
    const l = rows[0];
    assert.ok(l.id.startsWith('lead_web_'));
    assert.equal(l.firstName, 'Ada'); assert.equal(l.email, 'ada@example.com'); assert.equal(l.phone, '555-0100');
    assert.equal(l.source, 'Website', 'the org\'s configured source');
    assert.equal(l.status, 'New');
    assert.equal(l.assignedTo, null); assert.equal(l.ownerId, null);
    assert.ok(l.notes.startsWith('Need a quote.\nSoon.') && l.notes.includes('Submitted via web form from https://alpha.example/contact'), l.notes);
    assert.ok(typeof l.score === 'number' && l.leadScoreBucket, 'scored on create');
    assert.equal((await leadsOf(B)).length, 0, 'the other org sees nothing');
    assert.deepEqual(slackPosts, [{ orgId: A, type: 'webLead', text: 'web lead Ada Lovelace' }]);
});

test('a form-encoded submission gets the thank-you page; the honeypot gets thanks and NO row; an owner in the payload is ignored', async () => {
    const before = (await leadsOf(A)).length;
    const r = await post(TA, { company: 'Beta Widgets', email: 'buyer@beta.example', assignedTo: 'Someone', ownerId: 'usr_evil', orgId: B }, { json: false });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers['Content-Type'], /text\/html/);
    assert.ok(r.body.includes('Thank you'));
    const rows = await leadsOf(A);
    assert.equal(rows.length, before + 1);
    const l = rows.find(x => x.company === 'Beta Widgets');
    assert.equal(l.assignedTo, null); assert.equal(l.ownerId, null); assert.equal(l.orgId, A, 'the payload\'s orgId is not read');
    assert.equal((await leadsOf(B)).length, 0);

    const spam = await post(TA, { firstName: 'Bot', email: 'b@ot.io', website: 'http://spam.example' });
    assert.equal(spam.statusCode, 201, 'the bot is told thanks');
    assert.equal((await leadsOf(A)).length, before + 1, 'and gets no row');
});

test('a submission with no way to reach the person is refused (400, JSON) and stores nothing', async () => {
    const before = (await leadsOf(A)).length;
    const r = await post(TA, { firstName: 'Nobody' });
    assert.equal(r.statusCode, 400);
    assert.equal(JSON.parse(r.body).ok, false);
    assert.equal((await leadsOf(A)).length, before);
    const bad = await post(TA, { firstName: 'Nobody', email: 'not-an-email' });
    assert.equal(bad.statusCode, 400);
});

test('the per-token rate limit answers 429 after 30 submissions in the window', async () => {
    // Four already sent on TA above (three accepted or thanked, one refused counts too — the limiter runs before validation).
    let last;
    for (let i = 0; i < 40; i++) {
        last = await post(TA, { firstName: `Burst ${i}`, email: `burst${i}@example.com` });
        if (last.statusCode === 429) break;
    }
    assert.equal(last.statusCode, 429, 'the window closes');
    assert.equal(JSON.parse(last.body).ok, false);
});
