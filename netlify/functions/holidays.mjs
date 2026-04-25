import { verifyAuth } from './auth.mjs';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // verifyAuth returns { error, status } on failure or { orgId, userId } on success
    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }

    const year = parseInt(event.queryStringParameters?.year) || new Date().getFullYear();
    if (year < 2000 || year > 2100) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid year' }) };
    }

    let apiRes;
    try {
        apiRes = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
    } catch (fetchErr) {
        console.error('holidays.mjs fetch error:', fetchErr.message);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to reach holiday API' }) };
    }

    if (!apiRes.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: `Holiday API returned ${apiRes.status}` }) };
    }

    let raw;
    try {
        raw = await apiRes.json();
    } catch (parseErr) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Invalid response from holiday API' }) };
    }

    const holidays = raw
        .filter(h => Array.isArray(h.types) && h.types.includes('Public'))
        .map(h => {
            const d   = new Date(h.date + 'T12:00:00');
            const mon = MONTHS_SHORT[d.getMonth()];
            const day = d.getDate();
            return { date: `${mon} ${day}`, name: h.name, source: 'US · Federal', type: 'observed' };
        })
        .sort((a, b) => new Date(`${a.date} ${year}`) - new Date(`${b.date} ${year}`));

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ holidays, year }),
    };
};
