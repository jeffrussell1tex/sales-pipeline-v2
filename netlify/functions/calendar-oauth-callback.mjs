// netlify/functions/calendar-oauth-callback.mjs
// Handles the OAuth 2.0 callback after the user approves calendar access.
//
// GET /.netlify/functions/calendar-oauth-callback?code=<code>&state=<state>
//   → Exchanges the authorization code for tokens, encrypts the refresh token,
//     stores it in user_calendar_connections or org_calendar_connections,
//     then redirects the browser back to the app's Settings → Calendar tab.
//
// The `state` was minted by calendar-oauth-start.mjs for a signed-in caller: signed,
// short-lived, and bound to the browser that asked by a nonce cookie (state §0.160;
// _oauthState.mjs; guide §18b53). Only a state that verifies — signature, expiry,
// this browser's nonce — writes anything, and only for the org and user it names.
// Until §0.160 the state was unsigned base64 that the client built, and this
// function trusted it: anyone could write a calendar connection into any org.
//
// Required env vars by provider:
//   Google:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   Outlook: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
//   Yahoo:   YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET

import { neon } from '@netlify/neon';
import { encrypt } from './crypto.mjs';
import { calendarReturnUrl } from '../../src/utils/calendarReturn.js';
import { verifyState, peekState, stateSecret, cookieFrom, clearNonceCookie } from './_oauthState.mjs';

// Use raw SQL to avoid Drizzle ORM cold-start issues in redirect callbacks
function getDb() {
    return neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);
}

const APP_URL = process.env.URL || 'https://salespipelinetracker.com';
const CALLBACK_URL = `${APP_URL}/.netlify/functions/calendar-oauth-callback`;
// After the exchange the browser goes back to the surface the user clicked
// Connect on, with the outcome in the query (state §0.97, item 30 —
// calendarReturnUrl builds it from allowlists; App.jsx reads it). Until §0.97
// this was `/?tab=settings&subtab=calendar&calconnect=…`, which nothing read.

// Token exchange endpoints
const TOKEN_URLS = {
    google:  'https://oauth2.googleapis.com/token',
    outlook: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    yahoo:   'https://api.login.yahoo.com/oauth2/get_token',
};

// Userinfo endpoints (to get the connected email address)
const USERINFO_URLS = {
    google:  'https://www.googleapis.com/oauth2/v2/userinfo',
    outlook: 'https://graph.microsoft.com/v1.0/me',
    yahoo:   'https://api.login.yahoo.com/openid/v1/userinfo',
};

function getCredentials(provider) {
    const map = {
        google:  { clientId: process.env.GOOGLE_CLIENT_ID,      clientSecret: process.env.GOOGLE_CLIENT_SECRET },
        outlook: { clientId: process.env.MICROSOFT_CLIENT_ID,   clientSecret: process.env.MICROSOFT_CLIENT_SECRET },
        yahoo:   { clientId: process.env.YAHOO_CLIENT_ID,        clientSecret: process.env.YAHOO_CLIENT_SECRET },
    };
    return map[provider] || null;
}

async function exchangeCodeForTokens(provider, code) {
    const creds = getCredentials(provider);
    if (!creds) throw new Error(`No credentials configured for ${provider}`);

    const res = await fetch(TOKEN_URLS[provider], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id:     creds.clientId,
            client_secret: creds.clientSecret,
            code,
            grant_type:    'authorization_code',
            redirect_uri:  CALLBACK_URL,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Token exchange failed for ${provider}: ${body}`);
    }

    return res.json(); // { access_token, refresh_token, token_type, expires_in, ... }
}

async function getCalendarEmail(provider, accessToken) {
    try {
        const res = await fetch(USERINFO_URLS[provider], {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        // Each provider uses a slightly different field name
        return data.email || data.mail || data.userPrincipalName || null;
    } catch {
        return null;
    }
}

export const handler = async (event) => {
    // (The query is not logged: it carries the provider's one-time code.)
    const { code, state, error } = event.queryStringParameters || {};

    // The return page names the provider and the surface even on a refusal
    // (providers echo `state` on their own errors too) — read from the state
    // WITHOUT trusting it: calendarReturnUrl allowlists each value again, and who
    // and which org come only from the VERIFIED state below.
    const shown = state ? peekState(state) : {};
    const back = (status, reason) => ({
        statusCode: 302,
        // Every exit clears the nonce cookie: a state is used once.
        headers: { Location: calendarReturnUrl(APP_URL, { status, provider: shown.provider, scope: shown.scope, from: shown.from, reason }), 'Set-Cookie': clearNonceCookie() },
        body: '',
    });

    // Provider denied access
    if (error) {
        console.error('OAuth provider returned error:', error);
        return back('error', 'provider_denied');
    }

    if (!code || !state) {
        console.error('Missing code or state. code present:', !!code, 'state present:', !!state);
        return back('error', 'missing_code');
    }

    // Signed by the start for a signed-in caller, unexpired, and begun in THIS
    // browser (its nonce cookie) — or nothing is written (state §0.160).
    const verified = verifyState(state, { secret: stateSecret(process.env), cookieNonce: cookieFrom(event.headers) });
    if (!verified.ok) {
        console.error('calendar-oauth-callback: state refused —', verified.why);
        return back('error', 'bad_state');
    }
    const { userId, orgId, userRole, provider, scope } = verified.data;

    // The start refused a non-Admin; the role rode here signed, and is checked again.
    if (scope === 'org' && userRole !== 'Admin') {
        console.error('Non-admin attempted org calendar connection');
        return back('error', 'not_admin');
    }

    try {
        // Exchange auth code for tokens
        const tokens = await exchangeCodeForTokens(provider, code);
        const { access_token: accessToken, refresh_token: refreshToken } = tokens;

        if (!refreshToken) {
            // This can happen if the user already granted access and `prompt=consent`
            // wasn't honoured. Shouldn't happen in normal flow but guard against it.
            console.error(`No refresh token returned by ${provider}`);
            return back('error', 'no_refresh_token');
        }

        // Encrypt the refresh token before storing
        const encryptedRefreshToken = encrypt(refreshToken);

        // Get the email address of the connected account (for display in UI)
        const calendarEmail = await getCalendarEmail(provider, accessToken);

        const now = new Date();

        const sql = getDb();

        if (scope === 'user') {
            // Upsert using raw SQL — check if connection already exists then insert or update
            const existing = await sql`
                SELECT id FROM user_calendar_connections
                WHERE user_id = ${userId} AND org_id = ${orgId} AND provider = ${provider}
                LIMIT 1
            `;

            if (existing.length > 0) {
                await sql`
                    UPDATE user_calendar_connections
                    SET encrypted_refresh_token = ${encryptedRefreshToken},
                        calendar_email = ${calendarEmail},
                        updated_at = ${now}
                    WHERE id = ${existing[0].id} AND org_id = ${orgId}
                `;
            } else {
                const newId = 'ucal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                await sql`
                    INSERT INTO user_calendar_connections
                        (id, user_id, org_id, provider, encrypted_refresh_token, calendar_email, connected_at, updated_at)
                    VALUES
                        (${newId}, ${userId}, ${orgId}, ${provider}, ${encryptedRefreshToken}, ${calendarEmail}, ${now}, ${now})
                `;
            }
        } else {
            // Org connection ('org' — verifyState admits only the two scopes) — upsert per provider per org
            const existing = await sql`
                SELECT id FROM org_calendar_connections
                WHERE org_id = ${orgId} AND provider = ${provider}
                LIMIT 1
            `;

            const calendarName = provider === 'google'  ? 'Google Workspace Calendar'
                               : provider === 'outlook' ? 'Microsoft 365 Calendar'
                               : 'Company Calendar';

            if (existing.length > 0) {
                await sql`
                    UPDATE org_calendar_connections
                    SET encrypted_refresh_token = ${encryptedRefreshToken},
                        calendar_email = ${calendarEmail},
                        calendar_name = ${calendarName},
                        connected_by = ${userId},
                        updated_at = ${now}
                    WHERE id = ${existing[0].id} AND org_id = ${orgId}
                `;
            } else {
                const newId = 'ocal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                await sql`
                    INSERT INTO org_calendar_connections
                        (id, org_id, provider, encrypted_refresh_token, calendar_name, calendar_email, connected_by, connected_at, updated_at)
                    VALUES
                        (${newId}, ${orgId}, ${provider}, ${encryptedRefreshToken}, ${calendarName}, ${calendarEmail}, ${userId}, ${now}, ${now})
                `;
            }
        }

        // Back to the surface the user came from; it refreshes its own connections
        return back('success');

    } catch (err) {
        console.error('calendar-oauth-callback error:', err.message);
        return back('error', 'server_error');
    }
};
