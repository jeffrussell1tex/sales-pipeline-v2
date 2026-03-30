// netlify/functions/calendar-add-event.js
// Creates a calendar event from an Accelerep task.
//
// Token resolution: uses the requesting user's personal Google connection from
// user_calendar_connections. Falls back to org Google connection if no personal
// one exists. If neither exists, returns { connected: false }.
//
// Outlook support for event creation can be added here in a future iteration.
//
// POST body (JSON):
//   title        — event title (required)
//   date         — ISO date string e.g. "2026-03-20" (required)
//   description  — optional description / notes

import { db } from '../../db/index.js';
import { userCalendarConnections, orgCalendarConnections } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { decrypt } from './crypto.mjs';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
};

async function getGoogleAccessToken(refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id:     process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type:    'refresh_token',
        }),
    });
    if (!res.ok) throw new Error('Google token refresh failed');
    const data = await res.json();
    return data.access_token;
}

async function resolveGoogleRefreshToken(userId, orgId) {
    // 1. User's personal Google connection
    const userRows = await db
        .select({ encryptedRefreshToken: userCalendarConnections.encryptedRefreshToken })
        .from(userCalendarConnections)
        .where(
            and(
                eq(userCalendarConnections.userId, userId),
                eq(userCalendarConnections.orgId, orgId),
                eq(userCalendarConnections.provider, 'google')
            )
        );

    if (userRows.length > 0) {
        const token = decrypt(userRows[0].encryptedRefreshToken);
        if (token) return token;
    }

    // 2. Org-level Google connection
    const orgRows = await db
        .select({ encryptedRefreshToken: orgCalendarConnections.encryptedRefreshToken })
        .from(orgCalendarConnections)
        .where(
            and(
                eq(orgCalendarConnections.orgId, orgId),
                eq(orgCalendarConnections.provider, 'google')
            )
        );

    if (orgRows.length > 0) {
        const token = decrypt(orgRows[0].encryptedRefreshToken);
        if (token) return token;
    }

    return null;
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId } = auth;

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

    try {
        const refreshToken = await resolveGoogleRefreshToken(userId, orgId);

        if (!refreshToken) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ connected: false, message: 'No Google Calendar connected. Visit Settings → Calendar to connect.' }),
            };
        }

        const accessToken = await getGoogleAccessToken(refreshToken);

        const calEvent = {
            summary:     title,
            description: description || '',
            start:       { date },
            end:         { date },
            reminders: {
                useDefault: false,
                overrides:  [{ method: 'popup', minutes: 30 }],
            },
        };

        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method:  'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify(calEvent),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Google Calendar API error: ${err}`);
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
