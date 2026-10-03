// tests/calendar-oauth-state.test.mjs
//
// State §0.160 — the cross-org audit's first CRITICAL (2 Oct 2026): the calendar
// Connect's state was built by the client — userId, orgId, userRole in the link —
// and the callback, which imports no auth, trusted it, so anyone could write a
// calendar connection into any org. The signed state (netlify/functions/_oauthState.mjs)
// is RUN here: a round trip; refused when forged, tampered, expired, completed in a
// browser that did not start it, or in the old unsigned shape; the cookie it rides on.
// The start, the callback and the four Connect buttons are pinned by scan. The whole
// flow against the test database: tests/integration/calendar-oauth.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    signState, verifyState, peekState, stateSecret, nonceCookie, clearNonceCookie, cookieFrom, STATE_TTL_MS, NONCE_COOKIE,
} from '../netlify/functions/_oauthState.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

const SECRET = 'test-secret-for-the-calendar-state';
const NOW = Date.parse('2026-10-03T12:00:00Z');
const who = { userId: 'user_clerk_A', orgId: 'org_A', userRole: 'Admin', provider: 'google', scope: 'org', from: 'company' };

test('a state the start signed comes back whole — in the browser that asked, before it expires', () => {
    const { state, nonce } = signState(who, { secret: SECRET, now: NOW });
    const v = verifyState(state, { secret: SECRET, cookieNonce: nonce, now: NOW + 60_000 });
    assert.equal(v.ok, true);
    assert.deepEqual(v.data, who);
    assert.match(nonce, /^[A-Za-z0-9_-]{20,}$/);
    assert.notEqual(signState(who, { secret: SECRET, now: NOW }).nonce, nonce, 'a fresh nonce each time');
});

test('refused: another secret, a tampered body, a tampered signature, the old unsigned shape, junk', () => {
    const { state, nonce } = signState(who, { secret: SECRET, now: NOW });
    const ok = (s, o = {}) => verifyState(s, { secret: SECRET, cookieNonce: nonce, now: NOW, ...o }).ok;
    assert.equal(ok(state), true);
    assert.equal(ok(state, { secret: 'another-secret' }), false, 'signed by someone else');
    const [body, mac] = state.split('.');
    const swapped = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString('utf8')), o: 'org_VICTIM' })).toString('base64url');
    assert.equal(ok(`${swapped}.${mac}`), false, 'the org swapped, the signature kept');
    assert.equal(ok(`${body}.${mac.slice(0, -2)}${mac.endsWith('AA') ? 'BB' : 'AA'}`), false, 'the signature altered');
    const legacy = Buffer.from(JSON.stringify({ userId: 'x', orgId: 'org_VICTIM', provider: 'google', scope: 'org', userRole: 'Admin', from: 'company' })).toString('base64');
    assert.equal(ok(legacy), false, 'REGRESSION: the unsigned base64 the client used to build');
    for (const junk of ['', '.', 'a.b.c', null, undefined, 42, 'x'.repeat(5000)]) assert.equal(ok(junk), false, String(junk).slice(0, 12));
    assert.equal(verifyState(state, { secret: '', cookieNonce: nonce, now: NOW }).ok, false, 'no secret, no state');
});

test('refused: expired, or completed in a browser that did not start it', () => {
    const { state, nonce } = signState(who, { secret: SECRET, now: NOW });
    assert.equal(verifyState(state, { secret: SECRET, cookieNonce: nonce, now: NOW + STATE_TTL_MS + 1 }).ok, false, 'expired');
    assert.equal(verifyState(state, { secret: SECRET, cookieNonce: nonce, now: NOW + STATE_TTL_MS - 1 }).ok, true, 'just in time');
    assert.equal(verifyState(state, { secret: SECRET, cookieNonce: null, now: NOW }).ok, false, 'no cookie: another browser');
    assert.equal(verifyState(state, { secret: SECRET, cookieNonce: 'someone-elses-nonce-xyz', now: NOW }).ok, false);
    assert.equal(verifyState(state, { secret: SECRET, cookieNonce: '', now: NOW }).ok, false);
});

test('refused even when signed: a scope or provider the flow does not have, no user, no org; no secret, no signing', () => {
    const signedOk = (o) => { const { state, nonce } = signState({ ...who, ...o }, { secret: SECRET, now: NOW }); return verifyState(state, { secret: SECRET, cookieNonce: nonce, now: NOW }).ok; };
    assert.equal(signedOk({}), true);
    assert.equal(signedOk({ scope: 'all' }), false);
    assert.equal(signedOk({ provider: 'evil' }), false);
    assert.equal(signedOk({ orgId: '' }), false);
    assert.equal(signedOk({ userId: null }), false);
    assert.throws(() => signState(who, { secret: '' }), /no signing secret/);
    assert.equal(stateSecret({}), '');
    assert.equal(stateSecret({ SETTINGS_ENCRYPTION_KEY: 'k' }), 'k');
});

test("peekState reads the shown fields without trusting them; the cookie is HttpOnly, the callback's alone, cleared once used", () => {
    const { state, nonce } = signState(who, { secret: SECRET, now: NOW });
    assert.deepEqual(peekState(state), { provider: 'google', scope: 'org', from: 'company' });
    assert.deepEqual(peekState('garbage'), {});
    const c = nonceCookie(nonce);
    for (const part of [`${NONCE_COOKIE}=${nonce}`, 'Path=/.netlify/functions/calendar-oauth-callback', `Max-Age=${STATE_TTL_MS / 1000}`, 'HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(c.includes(part), part);
    assert.ok(clearNonceCookie().startsWith(`${NONCE_COOKIE}=;`) && clearNonceCookie().includes('Max-Age=0'));
    assert.equal(cookieFrom({ cookie: `a=1; ${NONCE_COOKIE}=${nonce}; b=2` }), nonce);
    assert.equal(cookieFrom({ Cookie: `${NONCE_COOKIE}=${nonce}` }), nonce);
    assert.equal(cookieFrom({ cookie: 'a=1' }), null);
    assert.equal(cookieFrom({}), null);
    assert.equal(cookieFrom({ cookie: `${NONCE_COOKIE}=` }), null);
});

// ── the wiring, by scan ──────────────────────────────────────────────────────

test('the start: a signed-in POST; who, which org and which role from verifyAuth, never the request', () => {
    const s = code(read('netlify/functions/calendar-oauth-start.mjs'));
    assert.ok(s.includes("import { verifyAuth } from './auth.mjs';"));
    assert.ok(s.includes('const auth = await verifyAuth(event);') && s.includes('if (auth.error) return fail(auth.status || 401, auth.error);'));
    assert.ok(s.includes("if (scope === 'org' && auth.userRole !== 'Admin') return fail(403, 'Only Admins can connect a company calendar');"));
    assert.ok(s.includes('const { state, nonce } = signState({ userId: auth.userId, orgId: auth.orgId, userRole: auth.userRole, provider, scope, from }, { secret });'));
    assert.ok(s.includes("headers: { ...headers, 'Set-Cookie': nonceCookie(nonce) },"));
    assert.ok(!/queryStringParameters[^;]*(userId|orgId|userRole)/.test(s), 'REGRESSION: who or which org from the query string');
    assert.ok(!s.includes('data.orgId') && !s.includes('data.userId') && !s.includes('data.userRole'), 'nor from the body');
    assert.ok(s.includes("reason: 'bad_state'"), 'the old GET link goes back to the app');
});

test('the callback writes only for a verified state, clears the cookie at every exit, and logs no code', () => {
    const s = code(read('netlify/functions/calendar-oauth-callback.mjs'));
    assert.ok(s.includes('const verified = verifyState(state, { secret: stateSecret(process.env), cookieNonce: cookieFrom(event.headers) });'));
    assert.ok(s.includes('const { userId, orgId, userRole, provider, scope } = verified.data;'));
    const refuse = s.indexOf('if (!verified.ok) {');
    assert.ok(refuse > 0 && refuse < s.indexOf('await exchangeCodeForTokens(provider, code)'), 'verified before the code is exchanged');
    assert.ok(!s.includes("Buffer.from(state, 'base64')") && !s.includes('stateData'), 'REGRESSION: the unsigned state is never read');
    assert.ok(s.includes("'Set-Cookie': clearNonceCookie()"));
    assert.ok(!s.includes("console.log('callback params:'"), 'the one-time code is not logged');
    assert.equal((s.match(/WHERE id = \$\{existing\[0\]\.id\} AND org_id = \$\{orgId\}/g) || []).length, 2, 'both updates carry the org');
});

test('every Connect button goes through the one helper — none names a user, an org or a role', () => {
    const helper = code(read('src/utils/calendarConnect.js'));
    assert.ok(helper.includes("res = await dbFetch('/.netlify/functions/calendar-oauth-start', {") && helper.includes("method: 'POST',"));
    assert.ok(helper.includes('body: JSON.stringify({ provider, scope, from }),'));
    assert.ok(helper.includes("if (res?.ok && typeof data?.url === 'string' && data.url.startsWith('https://')) {"), 'only an https page');
    for (const [file, call] of [
        ['src/components/layout/AppHeader.jsx', "startCalendarConnect({ provider: 'google', scope: 'user', from: 'profile' })"],
        ['src/Tabs/HomeTab.jsx', "startCalendarConnect({ provider: 'google', scope: 'user', from: 'home' })"],
        ['src/Tabs/settings/company/CompanyCalendarDetail.jsx', "startCalendarConnect({ provider: 'google', scope: 'org', from: 'company' })"],
        ['src/Tabs/settings/integrations/ConnectedAppsDetail.jsx', "startCalendarConnect({ provider, scope, from: 'apps' })"],
    ]) {
        const s = code(read(file));
        assert.ok(s.includes(call), file);
        assert.ok(!s.includes('calendar-oauth-start?'), file + ': no hand-built start link');
    }
});
