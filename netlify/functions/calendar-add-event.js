// netlify/functions/calendar-add-event.js
// Creates a Google Calendar event from a SPT task.
//
// Uses the same 3 environment variables as calendar-events.js:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//
// POST body (JSON):
//   title        — event title (required)
//   date         — ISO date string e.g. "2026-03-20" (required)
//   description  — optional description / notes

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

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
  if (!res.ok) throw new Error('Token refresh failed');
  const data = await res.json();
  return data.access_token;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Google Calendar not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { title, date, description } = body;
  if (!title || !date) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'title and date are required' }) };
  }

  // Build an all-day event on the task due date
  const calEvent = {
    summary: title,
    description: description || '',
    start: { date }, // all-day
    end: { date },   // same day (Google requires end >= start for all-day)
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
  };

  try {
    const accessToken = await getAccessToken();
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calEvent),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Calendar API error: ${err}`);
    }

    const created = await res.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, eventId: created.id, htmlLink: created.htmlLink }),
    };
  } catch (err) {
    console.error('calendar-add-event error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
