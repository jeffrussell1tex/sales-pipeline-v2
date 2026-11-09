/**
 * quote-pdf.mjs
 * Netlify serverless function — generates a polished quote PDF via pdfkit. The layout (the pages, the header,
 * the table, the totals, the notes, the footer) is _quotePdf.mjs's buildPDF (state §0.235); this file is the handler.
 *
 * POST body: { quote, opportunity, lines }
 *   quote       — the quote record from the DB
 *   opportunity — the linked opportunity record
 *   lines       — calculated line items array (from calcLineTotals in QuotesTab)
 *
 * Returns: application/pdf binary response
 *
 * Install dependency: npm install pdfkit
 */

import { verifyAuth } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';
// Who sends the quote (state §0.234): read from the CALLER'S org — never from the body, which until §0.234 could
// carry a `companyProfile` (its one caller never sent one, so no org's address ever printed).
import { orgIdentityFor } from './_orgIdentity.mjs';
// The layout, paginated (state §0.235) — pdfkit is imported there; netlify.toml keeps it outside this bundle.
import { buildPDF } from './_quotePdf.mjs';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // Auth check
    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: auth.error }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { quote, opportunity, lines } = body;

        if (!quote) {
            return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'quote is required' }) };
        }

        const pdfBuffer = await buildPDF(quote, opportunity, lines, await orgIdentityFor(auth.orgId));

        const filename = (quote.quoteNumber || 'quote') + '-v' + (quote.version || 1) + '.pdf';

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="' + filename + '"',
                'Content-Length': String(pdfBuffer.length),
            },
            body: pdfBuffer.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (err) {
        console.error('quote-pdf error:', err.message);
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: serverErrorBody(err, 'quote-pdf'),
        };
    }
};
