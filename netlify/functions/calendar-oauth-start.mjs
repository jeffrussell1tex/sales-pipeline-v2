// netlify/functions/calendar-oauth-start.mjs
// Initiates the OAuth 2.0 authorization flow for calendar providers.
//
// GET /.netlify/functions/calendar-oauth-start?provider=google&scope=user|org
//   → Redirects the browser to the provider's authorization page.
//
// Required env vars by provider:
//   Google:  GOOGLE_CLIENT_ID
//   Outlook: MICROSOFT_CLIENT_ID
//   Yahoo:   YAHOO_CLIENT_ID
//
// The `scope` param controls whether we're connecting a personal (user) or
// org-wide calendar. `scope=org` requires Admin role — enforced here and again
// in the callback.
//
// State parameter encodes: { userId, orgId, provider, scope, userRole }
// encoded as base64 JSON so the callback can restore context after the redirect.


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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // userId, orgId, userRole are passed as query params from the frontend.
    // The OAuth start endpoint is a browser redirect — no Authorization header is possible.
    // Security note: scope=org is re-validated in the callback using verifyAuth, so
    // a spoofed userRole here cannot actually grant org-level access.
    const {
        provider,
        scope,
        userId,
        orgId,
        userRole = 'User',
    } = event.queryStringParameters || {};

    if (!userId || !orgId) {
        return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'userId and orgId are required' }) };
    }

    // Validate provider
    if (!provider || !AUTH_URLS[provider]) {
        return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'provider must be google, outlook, or yahoo' }) };
    }

    // Validate scope
    if (!scope || !['user', 'org'].includes(scope)) {
        return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'scope must be "user" or "org"' }) };
    }

    // Only admins can connect org calendars
    if (scope === 'org' && userRole !== 'Admin') {
        return { statusCode: 403, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Only Admins can connect a company calendar' }) };
    }

    // Yahoo does not support org-level connections
    if (scope === 'org' && provider === 'yahoo') {
        return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Yahoo Calendar does not support org-level connections' }) };
    }

    const clientId = getClientId(provider);
    if (!clientId) {
        return {
            statusCode: 503,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `${provider} OAuth is not configured. Set the required env vars in Netlify.` }),
        };
    }

    // Encode state — restored by the callback to know who/what to store
    const state = Buffer.from(JSON.stringify({ userId, orgId, provider, scope, userRole })).toString('base64');

    // Build the authorization URL
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
    if (provider === 'outlook') {
        params.delete('access_type');
    }

    const authUrl = `${AUTH_URLS[provider]}?${params.toString()}`;

    // Redirect the browser to the provider's login/consent screen
    return {
        statusCode: 302,
        headers: {
            ...headers,
            Location: authUrl,
        },
        body: '',
    };
};
