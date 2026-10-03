// _oauthState.mjs — the calendar Connect's `state`, signed by the server and bound to
// the browser that asked for it (state §0.160 — the cross-org audit, 2 Oct 2026).
//
// Until §0.160 calendar-oauth-start took userId, orgId and userRole from the query
// string and sent them through the provider as unsigned base64, and the callback —
// which imports no auth — wrote the connection for whatever org the state named.
// Anyone could put their calendar into any org's company calendar, and a victim who
// consented to someone else's link connected their calendar into that person's org.
// Now (guide §18b53):
//   - the START is a signed-in POST; who connects, to which org, with which role,
//     comes from verifyAuth and nowhere else;
//   - the state is HMAC-signed (a key derived from SETTINGS_ENCRYPTION_KEY, in its own
//     namespace) and expires STATE_TTL_MS after it is minted;
//   - its nonce is set as an HttpOnly cookie on the browser that asked, and the
//     callback refuses a state whose nonce that browser does not hold — so a link
//     someone else started cannot be completed in your browser.
// Pure, but for the clock and the random nonce, which a caller (a test) may pass in.
import crypto from 'node:crypto';
import { CALENDAR_RETURN_PROVIDERS, CALENDAR_RETURN_SCOPES } from '../../src/utils/calendarReturn.js';

export const STATE_TTL_MS = 10 * 60 * 1000;
export const NONCE_COOKIE = 'cal_oauth_nonce';
const CALLBACK_PATH = '/.netlify/functions/calendar-oauth-callback';

// The signing key: never the encryption key itself — a derivation in its own namespace.
export const stateSecret = (env) => String(env?.SETTINGS_ENCRYPTION_KEY || '');
const keyOf = (secret) => crypto.createHmac('sha256', secret).update('accelerep/calendar-oauth-state/v1').digest();
const macOf = (body, secret) => crypto.createHmac('sha256', keyOf(secret)).update(body).digest('base64url');
const same = (a, b) => {
    const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
    return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

// { state, nonce }. Throws without a secret: the start answers "not configured" first.
export function signState({ userId, orgId, userRole, provider, scope, from }, { secret, now = Date.now(), nonce = crypto.randomBytes(18).toString('base64url') } = {}) {
    if (!secret) throw new Error('calendar state: no signing secret');
    const body = Buffer.from(JSON.stringify({ u: userId, o: orgId, r: userRole, p: provider, s: scope, f: from, n: nonce, e: now + STATE_TTL_MS })).toString('base64url');
    return { state: `${body}.${macOf(body, secret)}`, nonce };
}

// { ok: true, data: { userId, orgId, userRole, provider, scope, from } }, or
// { ok: false, why } — why is for the log only; the browser is told 'bad_state'.
export function verifyState(state, { secret, cookieNonce, now = Date.now() } = {}) {
    const bad = (why) => ({ ok: false, why });
    if (!secret) return bad('no signing secret');
    if (typeof state !== 'string' || state.length > 4096) return bad('shape');
    const dot = state.indexOf('.');
    if (dot < 1 || dot !== state.lastIndexOf('.')) return bad('shape');
    const body = state.slice(0, dot);
    if (!same(state.slice(dot + 1), macOf(body, secret))) return bad('signature');
    let d = null;
    try { d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return bad('json'); }
    if (!d || typeof d !== 'object') return bad('json');
    if (!(Number(d.e) > now)) return bad('expired');
    if (!same(d.n, cookieNonce)) return bad('another browser');
    if (!CALENDAR_RETURN_SCOPES.includes(d.s) || !CALENDAR_RETURN_PROVIDERS.includes(d.p)) return bad('values');
    if (typeof d.u !== 'string' || !d.u || typeof d.o !== 'string' || !d.o) return bad('values');
    return { ok: true, data: { userId: d.u, orgId: d.o, userRole: d.r || null, provider: d.p, scope: d.s, from: d.f } };
}

// The provider, scope and from of a state WITHOUT trusting it — for the return page's
// one line only (calendarReturnUrl allowlists each again); never who, never which org.
export function peekState(state) {
    try {
        const d = JSON.parse(Buffer.from(String(state).split('.')[0], 'base64url').toString('utf8'));
        return { provider: d?.p, scope: d?.s, from: d?.f };
    } catch { return {}; }
}

// The nonce cookie: HttpOnly, sent only to the callback, gone in STATE_TTL_MS — and
// cleared by the callback at every exit, so a state is used once.
export const nonceCookie = (nonce) =>
    `${NONCE_COOKIE}=${nonce}; Path=${CALLBACK_PATH}; Max-Age=${STATE_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const clearNonceCookie = () =>
    `${NONCE_COOKIE}=; Path=${CALLBACK_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function cookieFrom(headers, name = NONCE_COOKIE) {
    const raw = String(headers?.cookie ?? headers?.Cookie ?? '');
    for (const part of raw.split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
    }
    return null;
}
