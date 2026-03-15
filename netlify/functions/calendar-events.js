// netlify/functions/calendar-events.js
// Fetches Google Calendar events for the current week via the Google Calendar API.
//
// Required environment variables (set in Netlify UI → Site → Environment variables):
//   GOOGLE_CLIENT_ID       — OAuth 2.0 client ID from Google Cloud Console
//   GOOGLE_CLIENT_SECRET   — OAuth 2.0 client secret
//   GOOGLE_REFRESH_TOKEN   — Long-lived refresh token (one per user; see setup notes)
//
// Setup notes:
//   1. Create a project in Google Cloud Console (console.cloud.google.com)
//   2. Enable the Google Calendar API
//   3. Create OAuth 2.0 credentials (Web application type)
//   4. Add your Netlify domain to "Authorized redirect URIs"
//   5. Use the OAuth Playground (developers.google.com/oauthplayground) to generate
//      a refresh token with scope: https://www.googleapis.com/auth/calendar.readonly
//   6. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN to Netlify env vars
//
// Query parameters accepted:
//   timeMin  — ISO 8601 start of range (defaults to start of today)
//   timeMax  — ISO 8601 end of range (defaults to 7 days from now)

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

/**
 * Exchange a refresh token for a fresh access token.
 */
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Fetch events from the primary Google Calendar.
 */
async function fetchEvents(accessToken, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API error: ${body}`);
  }

  const data = await res.json();
  return data.items || [];
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Check required env vars
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Google Calendar not configured',
        message: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Netlify environment variables.',
      }),
    };
  }

  // Parse time range from query params, defaulting to this week
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setHours(0, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultStart.getDate() + 7);

  const timeMin = event.queryStringParameters?.timeMin || defaultStart.toISOString();
  const timeMax = event.queryStringParameters?.timeMax || defaultEnd.toISOString();

  try {
    const accessToken = await getAccessToken();
    const events = await fetchEvents(accessToken, timeMin, timeMax);

    // Return a lean payload — only the fields the calendar strip needs
    const lean = events.map((ev) => ({
      id: ev.id,
      summary: ev.summary || '',
      start: ev.start,
      end: ev.end,
      location: ev.location || null,
      attendeeCount: ev.attendees ? ev.attendees.length : 0,
      htmlLink: ev.htmlLink || null,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ events: lean }),
    };
  } catch (err) {
    console.error('calendar-events error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
