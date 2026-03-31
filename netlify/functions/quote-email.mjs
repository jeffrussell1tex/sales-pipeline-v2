/**
 * quote-email.mjs
 *
 * Sends an approved quote to the customer via Resend.
 * Looks up the quote + linked opportunity + billing contact,
 * sends a branded email, updates quote status to "Sent to Customer",
 * and returns customer name/email to the frontend for the success modal.
 *
 * POST /.netlify/functions/quote-email
 * Body: { quoteId }
 */

import { db } from '../../db/index.js';
import { quotes, opportunities, contacts, accounts } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { sendEmail } from './send-email.mjs';

const APP_URL = process.env.APP_URL || 'https://accelerep.netlify.app';

const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: responseHeaders, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: responseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers: responseHeaders, body: JSON.stringify({ error: auth.error }) };
    }

    const { orgId } = auth;

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { quoteId } = body;
    if (!quoteId) {
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'quoteId is required' }) };
    }

    try {
        // ── 1. Load quote ─────────────────────────────────────────────────────
        const [quote] = await db.select().from(quotes)
            .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)));

        if (!quote) {
            return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ error: 'Quote not found' }) };
        }
        if (quote.status !== 'Approved') {
            return { statusCode: 422, headers: responseHeaders, body: JSON.stringify({ error: 'Only approved quotes can be sent to customers.' }) };
        }

        // ── 2. Load linked opportunity ────────────────────────────────────────
        const [opp] = quote.opportunityId
            ? await db.select().from(opportunities)
                .where(and(eq(opportunities.id, quote.opportunityId), eq(opportunities.orgId, orgId)))
            : [null];

        // ── 3. Resolve customer email & name ──────────────────────────────────
        // Priority: billingContact field → primary contact on opp → account name fallback
        let customerEmail = null;
        let customerName = null;

        if (quote.billingContact) {
            // billingContact may be stored as "Name <email>" or just an email
            const match = quote.billingContact.match(/^(.+?)\s*<(.+?)>$/);
            if (match) {
                customerName = match[1].trim();
                customerEmail = match[2].trim();
            } else if (quote.billingContact.includes('@')) {
                customerEmail = quote.billingContact.trim();
            }
        }

        // Fall back to primary contact on the opportunity
        if (!customerEmail && opp) {
            const contactNames = (opp.contacts || '').split(', ').filter(Boolean);
            if (contactNames.length > 0) {
                const primaryName = contactNames[0].split(' (')[0].trim();
                const [contact] = await db.select().from(contacts)
                    .where(and(eq(contacts.orgId, orgId)))
                    .limit(50); // fetch a batch to match by name
                // Find by matching full name
                const allContacts = await db.select().from(contacts).where(eq(contacts.orgId, orgId));
                const match = allContacts.find(c =>
                    `${c.firstName || ''} ${c.lastName || ''}`.trim() === primaryName
                );
                if (match) {
                    customerEmail = match.email || null;
                    customerName = `${match.firstName || ''} ${match.lastName || ''}`.trim();
                }
            }
        }

        // Final fallback: use account name, no email
        const accountName = opp?.account || opp?.opportunityName || quote.name || 'Customer';
        if (!customerName) customerName = accountName;

        if (!customerEmail) {
            return {
                statusCode: 422,
                headers: responseHeaders,
                body: JSON.stringify({
                    error: 'No customer email found. Please add a billing contact email to the quote or ensure the primary contact has an email address.',
                }),
            };
        }

        // ── 4. Format quote summary for email ─────────────────────────────────
        const fmt = (v) => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

        const lineItems = Array.isArray(quote.lineItems) ? quote.lineItems : [];
        const lineRows = lineItems.map(li => `
            <tr>
                <td style="padding: 8px 12px; font-size: 13px; color: #44403c; border-bottom: 1px solid #f0ece4;">${li.name || li.productName || '—'}</td>
                <td style="padding: 8px 12px; font-size: 13px; color: #44403c; text-align: center; border-bottom: 1px solid #f0ece4;">${li.qty || 1}</td>
                <td style="padding: 8px 12px; font-size: 13px; color: #44403c; text-align: right; border-bottom: 1px solid #f0ece4;">${fmt(li.unitPrice ?? li.listPrice)}</td>
                <td style="padding: 8px 12px; font-size: 13px; font-weight: 600; color: #1c1917; text-align: right; border-bottom: 1px solid #f0ece4;">${fmt((li.qty || 1) * (li.unitPrice ?? li.listPrice ?? 0))}</td>
            </tr>
        `).join('');

        const total = fmt(quote.totalValue ?? quote.subtotal);
        const quoteNum = quote.quoteNumber || quote.id;
        const validUntil = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

        const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quote ${quoteNum}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#1c1917;padding:28px 36px;">
      <p style="color:#f5f1eb;font-size:18px;font-weight:700;margin:0;">Accelerep</p>
      <p style="color:#a8a29e;font-size:12px;margin:4px 0 0;">Quote for your review</p>
    </div>
    <div style="padding:36px;">
      <h2 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1c1917;">Hi ${customerName},</h2>
      <p style="font-size:14px;line-height:1.7;color:#57534e;margin:0 0 24px;">
        Please find your quote below. If you have any questions, don't hesitate to reach out.
      </p>

      <div style="background:#f8f6f3;border:1px solid #e8e3da;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;">
          <span style="font-weight:600;color:#1c1917;">Quote Number</span><span>${quoteNum}</span>
        </div>
        ${opp ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;"><span style="font-weight:600;color:#1c1917;">Company</span><span>${accountName}</span></div>` : ''}
        ${validUntil ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;"><span style="font-weight:600;color:#1c1917;">Valid Until</span><span>${validUntil}</span></div>` : ''}
        ${quote.paymentTerms ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;"><span style="font-weight:600;color:#1c1917;">Payment Terms</span><span>${quote.paymentTerms}</span></div>` : ''}
      </div>

      ${lineRows ? `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="background:#1c1917;">
            <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#f5f1eb;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Product / Service</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#f5f1eb;text-align:center;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#f5f1eb;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Unit Price</th>
            <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#f5f1eb;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">Total</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>
      <div style="text-align:right;font-size:16px;font-weight:700;color:#1c1917;padding:8px 12px;border-top:2px solid #1c1917;">
        Total: ${total}
      </div>` : ''}

      ${quote.notes ? `<div style="margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;font-size:13px;color:#92400e;line-height:1.6;"><strong>Notes:</strong> ${quote.notes}</div>` : ''}

      <p style="margin-top:28px;font-size:13px;color:#a8a29e;">
        This quote was prepared for you by your account representative. Please reply to this email with any questions.
      </p>
    </div>
    <div style="background:#f8f6f3;padding:18px 36px;border-top:1px solid #e8e3da;font-size:11px;color:#a8a29e;text-align:center;">
      <p style="margin:0;">Accelerep · <a href="${APP_URL}" style="color:#78716c;text-decoration:none;">${APP_URL}</a></p>
    </div>
  </div>
</body>
</html>`;

        // ── 5. Send email ─────────────────────────────────────────────────────
        await sendEmail({
            to: customerEmail,
            subject: `Your Quote ${quoteNum}${accountName ? ` — ${accountName}` : ''}`,
            html: emailHtml,
        });

        // ── 6. Update quote status to "Sent to Customer" ──────────────────────
        await db.update(quotes)
            .set({ status: 'Sent to Customer', updatedAt: new Date() })
            .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)));

        return {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({
                success: true,
                customerName,
                customerEmail,
                quoteNumber: quoteNum,
            }),
        };

    } catch (err) {
        console.error('quote-email error:', err.message);
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: err.message }) };
    }
};
