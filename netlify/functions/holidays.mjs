import { verifyAuth } from './auth.mjs';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const year = parseInt(event.queryStringParameters?.year) || new Date().getFullYear();
    if (year < 2000 || year > 2100) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid year' }) };
    }

    try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);

        if (!res.ok) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ error: `Holiday API returned ${res.status}` }),
            };
        }

        const raw = await res.json();

        const holidays = raw
            .filter(h => h.types && h.types.includes('Public'))
            .map(h => {
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
            .sort((a, b) => {
                const toMs = s => new Date(`${s} ${year}`).getTime();
                return toMs(a.date) - toMs(b.date);
            });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ holidays, year }),
        };

    } catch (err) {
        console.error('holidays.mjs error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch holidays' }),
        };
    }
};
