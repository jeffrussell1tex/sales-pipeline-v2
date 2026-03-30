// netlify/functions/calendar-oauth-callback.mjs
// Handles the OAuth 2.0 callback after the user approves calendar access.
//
// GET /.netlify/functions/calendar-oauth-callback?code=<code>&state=<state>
//   → Exchanges the authorization code for tokens, encrypts the refresh token,
//     stores it in user_calendar_connections or org_calendar_connections,
//     then redirects the browser back to the app's Settings → Calendar tab.
//
// The `state` param (base64 JSON) was set by calendar-oauth-start.mjs and
// contains: { userId, orgId, provider, scope, userRole }
//
// Required env vars by provider:
//   Google:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   Outlook: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
//   Yahoo:   YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET

import { db } from '../../db/index.js';
import { userCalendarConnections, orgCalendarConnections } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { encrypt } from './crypto.mjs';

const APP_URL = process.env.URL || 'https://salespipelinetracker.com';
const CALLBACK_URL = `${APP_URL}/.netlify/functions/calendar-oauth-callback`;
// After storing the token, redirect user back to the Calendar settings tab
const SUCCESS_REDIRECT = `${APP_URL}/?tab=settings&subtab=calendar&calconnect=success`;
const ERROR_REDIRECT   = `${APP_URL}/?tab=settings&subtab=calendar&calconnect=error`;

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
    const { code, state, error } = event.queryStringParameters || {};

    // Provider denied access
    if (error) {
        console.error('OAuth provider returned error:', error);
        return { statusCode: 302, headers: { Location: ERROR_REDIRECT }, body: '' };
    }

    if (!code || !state) {
        return { statusCode: 302, headers: { Location: ERROR_REDIRECT }, body: '' };
    }

    // Restore context from state
    let stateData;
    try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    } catch {
        console.error('Failed to parse OAuth state');
        return { statusCode: 302, headers: { Location: ERROR_REDIRECT }, body: '' };
    }

    const { userId, orgId, provider, scope, userRole } = stateData;

    // Re-enforce admin check for org scope — state is user-controlled so we validate again
    if (scope === 'org' && userRole !== 'Admin') {
        console.error('Non-admin attempted org calendar connection');
        return { statusCode: 302, headers: { Location: ERROR_REDIRECT }, body: '' };
    }

    try {
        // Exchange auth code for tokens
        const tokens = await exchangeCodeForTokens(provider, code);
        const { access_token: accessToken, refresh_token: refreshToken } = tokens;

        if (!refreshToken) {
            // This can happen if the user already granted access and `prompt=consent`
            // wasn't honoured. Shouldn't happen in normal flow but guard against it.
            console.error(`No refresh token returned by ${provider}`);
            return { statusCode: 302, headers: { Location: `${ERROR_REDIRECT}&reason=no_refresh_token` }, body: '' };
        }

        // Encrypt the refresh token before storing
        const encryptedRefreshToken = encrypt(refreshToken);

        // Get the email address of the connected account (for display in UI)
        const calendarEmail = await getCalendarEmail(provider, accessToken);

        const now = new Date();

        if (scope === 'user') {
            // Upsert — if the user has already connected this provider, replace the token
            const existing = await db
                .select({ id: userCalendarConnections.id })
                .from(userCalendarConnections)
                .where(
                    and(
                        eq(userCalendarConnections.userId, userId),
                        eq(userCalendarConnections.orgId, orgId),
                        eq(userCalendarConnections.provider, provider)
                    )
                );

            if (existing.length > 0) {
                await db
                    .update(userCalendarConnections)
                    .set({ encryptedRefreshToken, calendarEmail, updatedAt: now })
                    .where(eq(userCalendarConnections.id, existing[0].id));
            } else {
                const newId = 'ucal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                await db.insert(userCalendarConnections).values({
                    id: newId,
                    userId,
                    orgId,
                    provider,
                    encryptedRefreshToken,
                    calendarEmail,
                    connectedAt: now,
                    updatedAt:   now,
                });
            }
        } else {
            // Org connection — upsert per provider per org
            const existing = await db
                .select({ id: orgCalendarConnections.id })
                .from(orgCalendarConnections)
                .where(
                    and(
                        eq(orgCalendarConnections.orgId, orgId),
                        eq(orgCalendarConnections.provider, provider)
                    )
                );

            const calendarName = provider === 'google'  ? 'Google Workspace Calendar'
                               : provider === 'outlook' ? 'Microsoft 365 Calendar'
                               : 'Company Calendar';

            if (existing.length > 0) {
                await db
                    .update(orgCalendarConnections)
                    .set({ encryptedRefreshToken, calendarEmail, calendarName, connectedBy: userId, updatedAt: now })
                    .where(eq(orgCalendarConnections.id, existing[0].id));
            } else {
                const newId = 'ocal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                await db.insert(orgCalendarConnections).values({
                    id: newId,
                    orgId,
                    provider,
                    encryptedRefreshToken,
                    calendarName,
                    calendarEmail,
                    connectedBy: userId,
                    connectedAt: now,
                    updatedAt:   now,
                });
            }
        }

        // Redirect back to the app — the Settings Calendar tab will refresh connections
        return { statusCode: 302, headers: { Location: SUCCESS_REDIRECT }, body: '' };

    } catch (err) {
        console.error('calendar-oauth-callback error:', err.message);
        return { statusCode: 302, headers: { Location: ERROR_REDIRECT }, body: '' };
    }
};
