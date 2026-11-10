/**
 * quote-pdf.mjs
 * Netlify serverless function — generates a polished quote PDF via pdfkit. The layout (the pages, the header,
 * the table, the totals, the notes, the footer) is _quotePdf.mjs's buildPDF (state §0.235); this file is the handler.
 *
 * POST body: { quoteId }
 *   The STORED quote, read by its id in the caller's org (state §0.241; docs/design/sales-tax §6) — its deal decides
 *   who may have it, as it decides who may see the quote (_dealAccess.mjs: a rep her own deals', a Technician none;
 *   404 otherwise, never a probe) — and its deal read in the same org. Nothing else of the body is read. Until §0.241
 *   this printed the quote, the deal and the lines the request carried, past a sign-in check alone: the client's
 *   numbers on a customer's document. Now every line, the tax and the totals are the server's.
 *
 * Returns: application/pdf binary response
 *
 * Install dependency: npm install pdfkit
 */

import { db } from '../../db/index.js';
import { quotes, opportunities } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';
// Who may have a quote's PDF: whoever may see its deal (state §0.241) — the quote's email and the quotes GET's rule.
import { dealAccess } from './_dealAccess.mjs';
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

    const json = (statusCode, payload) => ({ statusCode, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    try {
        let body;
        try { body = JSON.parse(event.body || '{}') ?? {}; } catch { return json(400, { error: 'Invalid JSON' }); }
        // The quote's id, and nothing else the body says.
        const { quoteId } = body;
        if (!quoteId) return json(400, { error: 'quoteId is required' });

        const { orgId } = auth;
        const [quote] = await db.select().from(quotes)
            .where(and(eq(quotes.id, String(quoteId)), eq(quotes.orgId, orgId))).limit(1);
        if (!quote) return json(404, { error: 'Quote not found' });
        // Its deal decides — another rep's deal, or a Technician, is a 404 as another org's quote is.
        if (!(await dealAccess(auth, quote.opportunityId)).canRead) return json(404, { error: 'Quote not found' });
        const [opportunity] = await db.select().from(opportunities)
            .where(and(eq(opportunities.id, quote.opportunityId), eq(opportunities.orgId, orgId))).limit(1);

        const pdfBuffer = await buildPDF(quote, opportunity || null, null, await orgIdentityFor(auth.orgId));

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
