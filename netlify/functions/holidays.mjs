import { verifyAuth } from './auth.mjs';

// Short month names for formatting dates to match our "Mon D" convention
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default async function handler(event) {
    // Auth check — all functions require a valid Clerk JWT
    try {
        await verifyAuth(event);
    } catch (err) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // Year param — default to current year, clamp to reasonable range
    const year = parseInt(event.queryStringParameters?.year) || new Date().getFullYear();
    if (year < 2000 || year > 2100) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid year' }) };
    }

    try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);

        if (!res.ok) {
            return {
                statusCode: 502,
                body: JSON.stringify({ error: `Holiday API returned ${res.status}` }),
            };
        }

        const raw = await res.json();

        // Filter to national/public holidays only and shape to our format:
        // { date: "Jan 1", name: "New Year's Day", source: "US · Federal", type: "observed" }
        const holidays = raw
            .filter(h => h.types && h.types.includes('Public'))
            .map(h => {
                // h.date is "YYYY-MM-DD"
                const d   = new Date(h.date + 'T12:00:00');
                const mon = MONTHS_SHORT[d.getMonth()];
                const day = d.getDate();
                return {
                    date:   `${mon} ${day}`,
                    name:   h.name,
                    source: 'US · Federal',
                    type:   'observed',
                };
            })
            // Sort chronologically
            .sort((a, b) => {
                const toMs = s => new Date(`${s} ${year}`).getTime();
                return toMs(a.date) - toMs(b.date);
            });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holidays, year }),
        };

    } catch (err) {
        console.error('holidays.mjs error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch holidays' }),
        };
    }
}
