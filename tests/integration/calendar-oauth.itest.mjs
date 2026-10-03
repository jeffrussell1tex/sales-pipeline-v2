// tests/integration/calendar-oauth.itest.mjs
// State §0.160 — the calendar Connect bound to a signed-in start (the cross-org audit's
// first CRITICAL, 2 Oct 2026), against the real test database. Only the provider is
// faked (its token and userinfo answers); the start, the callback and the rows are
// real. Proves:
//   START     a signed-in POST: no sign-in, 401; the company calendar for a non-Admin,
//             403; the user, org and role in the state are the sign-in's — not the ones
//             a body names; the answer is the provider's page and an HttpOnly nonce
//             cookie for the callback; the old GET link goes back to the app, mints nothing
//   FORGED    the unsigned state the client used to build — naming org B — is refused and
//             writes nothing; so is a genuine state with its org swapped; the code is
//             never exchanged
//   BROWSER   a genuine state completed without its cookie, or with another one, is refused
//   EXPIRED   a state older than its ten minutes is refused
//   CONNECT   a genuine state, in the browser that asked, writes the signed-in user's
//             connection in their org, carries `from` back and spends the cookie; an
//             Admin's company calendar likewise; org B's company calendar is untouched
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
// The flow's own configuration, for this process only — fakes; nothing leaves the machine.
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'itest-calendar-oauth-signing-and-encryption-key';
process.env.GOOGLE_CLIENT_ID = 'itest-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'itest-google-client-secret';
process.env.URL = 'https://itest.accelerep.local';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

// The sign-in only is faked; the role a caller holds is the header's.
mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers?.['x-test-user'] || 'user_itest_calsec_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'User', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});

// The provider: its token and userinfo endpoints answer here; everything else (the
// database driver's own requests) goes out as before.
const realFetch = globalThis.fetch;
let tokenCalls = 0;
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://oauth2.googleapis.com/token')) { tokenCalls++; return json({ access_token: 'at_itest', refresh_token: `rt_itest_${tokenCalls}`, token_type: 'Bearer', expires_in: 3600 }); }
    if (u.startsWith('https://www.googleapis.com/oauth2/v2/userinfo')) return json({ email: 'calendar@itest.local' });
    return realFetch(url, opts);
};

const { handler: start } = await import('../../netlify/functions/calendar-oauth-start.mjs');
const { handler: callback } = await import('../../netlify/functions/calendar-oauth-callback.mjs');
const { signState, verifyState, stateSecret, NONCE_COOKIE } = await import('../../netlify/functions/_oauthState.mjs');
const { db } = await import('../../db/index.js');
const { userCalendarConnections, orgCalendarConnections } = await import('../../db/schema.js');
const { eq, inArray } = await import('drizzle-orm');

const ORG_A = 'itest_calsec_A', ORG_B = 'itest_calsec_B';
const ADMIN = 'user_itest_calsec_admin', REP = 'user_itest_calsec_rep', BOB = 'user_itest_calsec_bob';

const ev = (method, { org, user, role, body, query, cookie } = {}) => ({
    httpMethod: method,
    headers: { ...(org ? { 'x-test-org': org } : {}), ...(user ? { 'x-test-user': user } : {}), ...(role ? { 'x-test-role': role } : {}), ...(cookie ? { cookie } : {}) },
    queryStringParameters: query || {},
    body: body ? JSON.stringify(body) : undefined,
});
const begin = ({ org, user, role, provider = 'google', scope = 'user', from = 'apps', extra = {} }) =>
    start(ev('POST', { org, user, role, body: { provider, scope, from, ...extra } }));
const stateOf = (res) => new URL(JSON.parse(res.body).url).searchParams.get('state');
const nonceOf = (res) => (String(res.headers['Set-Cookie'] || '').match(new RegExp(`${NONCE_COOKIE}=([^;]+)`)) || [])[1];
const cookieOf = (res) => `${NONCE_COOKIE}=${nonceOf(res)}`;
const land = (res) => new URL(res.headers.Location);
const userRows = (org) => db.select().from(userCalendarConnections).where(eq(userCalendarConnections.orgId, org));
const orgRows  = (org) => db.select().from(orgCalendarConnections).where(eq(orgCalendarConnections.orgId, org));

async function wipe() {
    await db.delete(userCalendarConnections).where(inArray(userCalendarConnections.orgId, [ORG_A, ORG_B]));
    await db.delete(orgCalendarConnections).where(inArray(orgCalendarConnections.orgId, [ORG_A, ORG_B]));
}

before(async () => {
    await wipe();
    // Org B's company calendar — the row an attacker would overwrite.
    await db.insert(orgCalendarConnections).values({
        id: 'ocal_itest_calsec_B', orgId: ORG_B, provider: 'google', encryptedRefreshToken: 'B-ORIGINAL-TOKEN',
        calendarName: 'B company calendar', calendarEmail: 'b@itest.local', connectedBy: BOB,
    });
});

after(async () => {
    await wipe();
    globalThis.fetch = realFetch;
});

test('START: signed in, POST only; no company calendar for a non-Admin; the old GET link goes back to the app and mints nothing', async () => {
    const anon = await start(ev('POST', { body: { provider: 'google', scope: 'user', from: 'apps' } }));
    assert.equal(anon.statusCode, 401);
    const rep = await begin({ org: ORG_A, user: REP, role: 'User', scope: 'org', from: 'company' });
    assert.equal(rep.statusCode, 403);
    assert.ok(!rep.headers['Set-Cookie'], 'no cookie for a refusal');
    const old = await start(ev('GET', { query: { provider: 'google', scope: 'org', userId: 'user_attacker', orgId: ORG_B, userRole: 'Admin', from: 'company' } }));
    assert.equal(old.statusCode, 302);
    const back = land(old);
    assert.deepEqual([back.searchParams.get('calconnect'), back.searchParams.get('reason'), back.searchParams.get('from')], ['error', 'bad_state', 'company']);
    assert.ok(!old.headers['Set-Cookie'], 'the old link mints no state');
});

test("START: the state names the signed-in user and org — never a body's — and the answer carries an HttpOnly nonce cookie", async () => {
    const res = await begin({ org: ORG_A, user: REP, role: 'User', extra: { orgId: ORG_B, userId: 'user_attacker', userRole: 'Admin' } });
    assert.equal(res.statusCode, 200);
    const url = new URL(JSON.parse(res.body).url);
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://itest.accelerep.local/.netlify/functions/calendar-oauth-callback');
    const cookie = String(res.headers['Set-Cookie']);
    for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/.netlify/functions/calendar-oauth-callback']) assert.ok(cookie.includes(part), part);
    const v = verifyState(url.searchParams.get('state'), { secret: stateSecret(process.env), cookieNonce: nonceOf(res) });
    assert.equal(v.ok, true);
    assert.deepEqual([v.data.userId, v.data.orgId, v.data.userRole], [REP, ORG_A, 'User'], 'the sign-in, never the body');
});

test("FORGED: the unsigned state naming org B, and a genuine state with its org swapped, are refused; org B's calendar untouched; no code exchanged", async () => {
    const beforeB = await orgRows(ORG_B);
    const legacy = Buffer.from(JSON.stringify({ userId: 'user_attacker', orgId: ORG_B, provider: 'google', scope: 'org', userRole: 'Admin', from: 'company' })).toString('base64');
    const r1 = await callback(ev('GET', { query: { code: 'c1', state: legacy } }));
    assert.equal(land(r1).searchParams.get('reason'), 'bad_state', 'REGRESSION: the unsigned state the client used to build');
    const real = await begin({ org: ORG_A, user: ADMIN, role: 'Admin', scope: 'org', from: 'company' });
    const [body, mac] = stateOf(real).split('.');
    const swapped = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString('utf8')), o: ORG_B })).toString('base64url') + '.' + mac;
    const r2 = await callback(ev('GET', { query: { code: 'c2', state: swapped }, cookie: cookieOf(real) }));
    assert.equal(land(r2).searchParams.get('reason'), 'bad_state', 'the org swapped, the signature kept');
    assert.deepEqual(await orgRows(ORG_B), beforeB, "org B's company calendar untouched");
    assert.equal((await orgRows(ORG_A)).length, 0);
    assert.equal(tokenCalls, 0, 'refused before the code was ever exchanged');
});

test('BROWSER and EXPIRED: a genuine state completed without its cookie, with another, or after ten minutes, is refused', async () => {
    const real = await begin({ org: ORG_A, user: REP, role: 'User', from: 'home' });
    const noCookie = await callback(ev('GET', { query: { code: 'c3', state: stateOf(real) } }));
    assert.equal(land(noCookie).searchParams.get('reason'), 'bad_state', 'another browser');
    const other = await callback(ev('GET', { query: { code: 'c4', state: stateOf(real) }, cookie: `${NONCE_COOKIE}=not-this-browsers-nonce` }));
    assert.equal(land(other).searchParams.get('reason'), 'bad_state');
    const { state, nonce } = signState({ userId: REP, orgId: ORG_A, userRole: 'User', provider: 'google', scope: 'user', from: 'home' }, { secret: stateSecret(process.env), now: Date.now() - 11 * 60 * 1000 });
    const late = await callback(ev('GET', { query: { code: 'c5', state }, cookie: `${NONCE_COOKIE}=${nonce}` }));
    assert.equal(land(late).searchParams.get('reason'), 'bad_state', 'expired');
    assert.equal((await userRows(ORG_A)).length, 0, 'nothing written');
    assert.equal(tokenCalls, 0);
});

test("CONNECT: in the browser that asked, the signed-in user's connection is written in their org, `from` comes back, the cookie is spent", async () => {
    const real = await begin({ org: ORG_A, user: REP, role: 'User', from: 'profile' });
    const res = await callback(ev('GET', { query: { code: 'good-1', state: stateOf(real) }, cookie: cookieOf(real) }));
    assert.equal(res.statusCode, 302);
    assert.deepEqual(Object.fromEntries(land(res).searchParams), { calconnect: 'success', provider: 'google', scope: 'user', from: 'profile' });
    assert.ok(String(res.headers['Set-Cookie']).includes('Max-Age=0'), 'the nonce is spent');
    const rows = await userRows(ORG_A);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].userId, rows[0].provider, rows[0].calendarEmail], [REP, 'google', 'calendar@itest.local']);
    assert.ok(rows[0].encryptedRefreshToken && !rows[0].encryptedRefreshToken.includes('rt_itest'), 'stored encrypted');
});

test("CONNECT: an Admin's company calendar lands in their org; org B's stays B's", async () => {
    const beforeB = await orgRows(ORG_B);
    const real = await begin({ org: ORG_A, user: ADMIN, role: 'Admin', scope: 'org', from: 'company' });
    const res = await callback(ev('GET', { query: { code: 'good-2', state: stateOf(real) }, cookie: cookieOf(real) }));
    assert.deepEqual([land(res).searchParams.get('calconnect'), land(res).searchParams.get('from')], ['success', 'company']);
    const a = await orgRows(ORG_A);
    assert.equal(a.length, 1);
    assert.deepEqual([a[0].connectedBy, a[0].calendarEmail], [ADMIN, 'calendar@itest.local']);
    assert.deepEqual(await orgRows(ORG_B), beforeB, "org B's company calendar untouched");
});
