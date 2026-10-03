// netlify/functions/calendar-oauth-start.mjs
// Begins the OAuth 2.0 authorization flow for a calendar provider.
//
// POST /.netlify/functions/calendar-oauth-start   { provider, scope: 'user' | 'org', from }
//   → 200 { url } — the provider's consent page, for the browser to go to — and a
//     cookie on this browser holding the state's nonce.
//
// Signed in (state §0.160 — the cross-org audit, 2 Oct 2026): who connects, to which
// org and with which role come from verifyAuth. Until §0.160 they came from the query
// string and rode to the callback as unsigned base64, and the callback wrote the
// connection for whatever org they named. The state is now signed and bound to the
// browser that asked (_oauthState.mjs; guide §18b53). `scope=org` needs an Admin.
// `from` (state §0.97) is the surface the user clicked Connect on, allowlisted.
//
// A GET is the link from before §0.160 (a tab left open on an old build): it goes
// back to the app with "start the connection again" — nothing it carries is read.
//
// Required env vars: the provider's client id (GOOGLE_CLIENT_ID, MICROSOFT_CLIENT_ID,
// YAHOO_CLIENT_ID) and SETTINGS_ENCRYPTION_KEY (the state's signing key derives from it).

import { verifyAuth } from './auth.mjs';
import { cleanCalendarReturnFrom, calendarReturnUrl } from '../../src/utils/calendarReturn.js';
import { signState, stateSecret, nonceCookie } from './_oauthState.mjs';

const APP_URL = process.env.URL || 'https://salespipelinetracker.com';
const CALLBACK_URL = `${APP_URL}/.netlify/functions/calendar-oauth-callback`;

// OAuth scopes requested per provider
const SCOPES = {
    google:  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email',
    outlook: 'offline_access https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read',
    yahoo:   'openid email https://www.yahooapis.com/auth/calendar',
};

// Authorization endpoint URLs
const AUTH_URLS = {
    google:  'https://accounts.google.com/o/oauth2/v2/auth',
    outlook: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    yahoo:   'https://api.login.yahoo.com/oauth2/request_auth',
};

// Client IDs per provider
function getClientId(provider) {
    const map = {
        google:  process.env.GOOGLE_CLIENT_ID,
        outlook: process.env.MICROSOFT_CLIENT_ID,
        yahoo:   process.env.YAHOO_CLIENT_ID,
    };
    return map[provider] || null;
}

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    const fail = (statusCode, error) => ({ statusCode, headers, body: JSON.stringify({ error }) });

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod === 'GET') {
        const from = cleanCalendarReturnFrom(event.queryStringParameters?.from);
        return { statusCode: 302, headers: { Location: calendarReturnUrl(APP_URL, { status: 'error', from, reason: 'bad_state' }) }, body: '' };
    }
    if (event.httpMethod !== 'POST') return fail(405, 'Method not allowed');

    const auth = await verifyAuth(event);
    if (auth.error) return fail(auth.status || 401, auth.error);

    let data = {};
    try { data = JSON.parse(event.body || '{}') || {}; } catch { return fail(400, 'Invalid JSON'); }
    const { provider, scope } = data;
    // Where the user clicked Connect (state §0.97): signed into the state so the
    // callback can send them back to that surface. Anything else is 'home'.
    const from = cleanCalendarReturnFrom(data.from);

    if (!provider || !AUTH_URLS[provider]) return fail(400, 'provider must be google, outlook, or yahoo');
    if (!scope || !['user', 'org'].includes(scope)) return fail(400, 'scope must be "user" or "org"');
    // Only an Admin connects the company calendar — the signed-in caller's role.
    if (scope === 'org' && auth.userRole !== 'Admin') return fail(403, 'Only Admins can connect a company calendar');
    if (scope === 'org' && provider === 'yahoo') return fail(400, 'Yahoo Calendar does not support org-level connections');

    const clientId = getClientId(provider);
    if (!clientId) return fail(503, `${provider} OAuth is not configured. Set the required env vars in Netlify.`);
    const secret = stateSecret(process.env);
    if (!secret) return fail(503, 'Calendar connections are not configured on this site (no signing key).');

    // Who, which org and which role are the verified token's — never the request's.
    const { state, nonce } = signState({ userId: auth.userId, orgId: auth.orgId, userRole: auth.userRole, provider, scope, from }, { secret });

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  CALLBACK_URL,
        response_type: 'code',
        scope:         SCOPES[provider],
        state,
        access_type:   'offline',   // Google: request refresh token
        prompt:        'consent',   // Google/Microsoft: force refresh token even if previously granted
    });
    // Microsoft uses a slightly different param name for offline access
    if (provider === 'outlook') params.delete('access_type');

    return {
        statusCode: 200,
        headers: { ...headers, 'Set-Cookie': nonceCookie(nonce) },
        body: JSON.stringify({ url: `${AUTH_URLS[provider]}?${params.toString()}` }),
    };
};
