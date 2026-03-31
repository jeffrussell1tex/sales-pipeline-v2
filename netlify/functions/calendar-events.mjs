// netlify/functions/calendar-events.mjs
// Fetches Google Calendar (and eventually Outlook/Yahoo) events for the requesting user.
//
// Token resolution order:
//   1. User's personal connection in user_calendar_connections (scoped to userId + orgId)
//   2. Org-wide connection in org_calendar_connections (scoped to orgId)
//   3. Neither → returns { connected: false } so the UI can prompt the user to connect
//
// Query parameters:
//   timeMin    — ISO 8601 start of range (defaults to start of today)
//   timeMax    — ISO 8601 end of range (defaults to 7 days from now)
//   calScope   — 'user' | 'org' | 'all' (default: 'all' — merges both sources)

import { db } from '../../db/index.js';
import { userCalendarConnections, orgCalendarConnections } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { decrypt } from './crypto.mjs';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
};

// ── Token exchange helpers ────────────────────────────────────────────────────

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
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Google token refresh failed: ${body}`);
    }
    const data = await res.json();
    return data.access_token;
}

async function getOutlookAccessToken(refreshToken) {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id:     process.env.MICROSOFT_CLIENT_ID,
            client_secret: process.env.MICROSOFT_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type:    'refresh_token',
            scope:         'https://graph.microsoft.com/Calendars.Read',
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Outlook token refresh failed: ${body}`);
    }
    const data = await res.json();
    return data.access_token;
}

// ── Event fetch helpers ───────────────────────────────────────────────────────

async function fetchGoogleEvents(accessToken, timeMin, timeMax, source) {
    const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy:      'startTime',
        maxResults:   '100',
    });
    const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Google Calendar API error: ${body}`);
    }
    const data = await res.json();
    return (data.items || []).map((ev) => ({
        id:           ev.id,
        summary:      ev.summary || '',
        start:        ev.start,
        end:          ev.end,
        location:     ev.location || null,
        attendeeCount: ev.attendees ? ev.attendees.length : 0,
        htmlLink:     ev.htmlLink || null,
        provider:     'google',
        source,       // 'user' | 'org' — for color-coding in the UI
    }));
}

async function fetchOutlookEvents(accessToken, timeMin, timeMax, source) {
    const params = new URLSearchParams({
        startDateTime: timeMin,
        endDateTime:   timeMax,
        $orderby:      'start/dateTime',
        $top:          '100',
        $select:       'id,subject,start,end,location,attendees,webLink',
    });
    const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Outlook Calendar API error: ${body}`);
    }
    const data = await res.json();
    return (data.value || []).map((ev) => ({
        id:            ev.id,
        summary:       ev.subject || '',
        start:         { dateTime: ev.start?.dateTime, timeZone: ev.start?.timeZone },
        end:           { dateTime: ev.end?.dateTime,   timeZone: ev.end?.timeZone },
        location:      ev.location?.displayName || null,
        attendeeCount: ev.attendees ? ev.attendees.length : 0,
        htmlLink:      ev.webLink || null,
        provider:      'outlook',
        source,
    }));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId } = auth;

    // Parse time range
    const now = new Date();
    const defaultStart = new Date(now); defaultStart.setHours(0, 0, 0, 0);
    const defaultEnd   = new Date(defaultStart); defaultEnd.setDate(defaultStart.getDate() + 7);

    const timeMin  = event.queryStringParameters?.timeMin  || defaultStart.toISOString();
    const timeMax  = event.queryStringParameters?.timeMax  || defaultEnd.toISOString();
    const calScope = event.queryStringParameters?.calScope || 'all';

    try {
        const allEvents = [];

        // ── 1. Personal connections ───────────────────────────────────────────
        if (calScope === 'user' || calScope === 'all') {
            const userRows = await db
                .select()
                .from(userCalendarConnections)
                .where(
                    and(
                        eq(userCalendarConnections.userId, userId),
                        eq(userCalendarConnections.orgId, orgId)
                    )
                );

            for (const row of userRows) {
                const refreshToken = decrypt(row.encryptedRefreshToken);
                if (!refreshToken) continue;

                try {
                    if (row.provider === 'google') {
                        const accessToken = await getGoogleAccessToken(refreshToken);
                        const events = await fetchGoogleEvents(accessToken, timeMin, timeMax, 'user');
                        allEvents.push(...events);
                    } else if (row.provider === 'outlook') {
                        const accessToken = await getOutlookAccessToken(refreshToken);
                        const events = await fetchOutlookEvents(accessToken, timeMin, timeMax, 'user');
                        allEvents.push(...events);
                    }
                    // Yahoo uses CalDAV — to be implemented in a future iteration
                } catch (providerErr) {
                    // Don't fail the whole request if one provider errors — log and continue
                    console.error(`Failed to fetch ${row.provider} events for user ${userId}:`, providerErr.message);
                }
            }
        }

        // ── 2. Org connections ────────────────────────────────────────────────
        if (calScope === 'org' || calScope === 'all') {
            const orgRows = await db
                .select()
                .from(orgCalendarConnections)
                .where(eq(orgCalendarConnections.orgId, orgId));

            for (const row of orgRows) {
                const refreshToken = decrypt(row.encryptedRefreshToken);
                if (!refreshToken) continue;

                try {
                    if (row.provider === 'google') {
                        const accessToken = await getGoogleAccessToken(refreshToken);
                        const events = await fetchGoogleEvents(accessToken, timeMin, timeMax, 'org');
                        allEvents.push(...events);
                    } else if (row.provider === 'outlook') {
                        const accessToken = await getOutlookAccessToken(refreshToken);
                        const events = await fetchOutlookEvents(accessToken, timeMin, timeMax, 'org');
                        allEvents.push(...events);
                    }
                } catch (providerErr) {
                    console.error(`Failed to fetch ${row.provider} org events for org ${orgId}:`, providerErr.message);
                }
            }
        }

        // ── 3. No connections at all ──────────────────────────────────────────
        if (allEvents.length === 0) {
            const userRows = await db
                .select({ id: userCalendarConnections.id })
                .from(userCalendarConnections)
                .where(
                    and(
                        eq(userCalendarConnections.userId, userId),
                        eq(userCalendarConnections.orgId, orgId)
                    )
                );
            const orgRows = await db
                .select({ id: orgCalendarConnections.id })
                .from(orgCalendarConnections)
                .where(eq(orgCalendarConnections.orgId, orgId));

            if (userRows.length === 0 && orgRows.length === 0) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ events: [], connected: false }),
                };
            }
        }

        // De-duplicate by event id (same event may appear from both user + org calendar)
        const seen = new Set();
        const dedupedEvents = allEvents.filter((ev) => {
            if (seen.has(ev.id)) return false;
            seen.add(ev.id);
            return true;
        });

        // Sort chronologically
        dedupedEvents.sort((a, b) => {
            const aTime = a.start?.dateTime || a.start?.date || '';
            const bTime = b.start?.dateTime || b.start?.date || '';
            return aTime.localeCompare(bTime);
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ events: dedupedEvents, connected: true }),
        };

    } catch (err) {
        console.error('calendar-events error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
