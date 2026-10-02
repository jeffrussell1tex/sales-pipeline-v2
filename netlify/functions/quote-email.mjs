/**
 * quote-email.mjs
 *
 * Sends a quote to the customer via Resend.
 * Looks up the quote + linked opportunity + billing contact,
 * sends a branded email, updates quote status to "Sent to Customer",
 * and returns customer name/email to the frontend for the success modal.
 *
 * POST /.netlify/functions/quote-email
 * Body: { quoteId }
 *
 * Who and when (state §0.155): the CRM's writers only (requireWrite — ReadOnly, a
 * Technician and a Dispatcher are refused), and only on a deal the caller may
 * change (_dealAccess.mjs — a rep her own); the quote must be one the rules let be
 * sent (src/utils/quoteRules.js — approved, or a draft whose discount needs no
 * approval; never an accepted or a closed one). Before this, any signed-in member
 * could email any approved quote to its customer and flip it to Sent.
 */

import { db } from '../../db/index.js';
import { quotes, opportunities, contacts, accounts, users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { sendEmail } from './send-email.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';
import { dealAccess } from './_dealAccess.mjs';
import { getApprovalTiers } from './quotes.mjs';
import { quoteTransitionRefusal, quoteNeedsApproval } from '../../src/utils/quoteRules.js';
// Every value placed in the customer's email is escaped: notes, product names,
// terms and names are typed by people, and markup in them would reach the inbox.
import { esc } from '../../src/utils/customerNotifications.js';

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
    // Sending a quote changes it (status, sentAt) and writes to a customer: the
    // CRM's writers only.
    const forbidden = requireWrite(auth, event, responseHeaders);
    if (forbidden) return forbidden;

    const { orgId, userId } = auth;

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
        // Its deal decides who may send it — as it decides who may change it.
        const access = await dealAccess(auth, quote.opportunityId);
        if (!access.canRead) {
            return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ error: 'Quote not found' }) };
        }
        if (!access.canWrite) {
            return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Forbidden: you can only send quotes on your own or unassigned deals' }) };
        }
        const refusal = quoteTransitionRefusal({
            from: quote.status, to: 'Sent to Customer', role: auth.userRole,
            needsApproval: quoteNeedsApproval(quote, await getApprovalTiers(orgId)),
        });
        if (refusal) {
            return { statusCode: 422, headers: responseHeaders, body: JSON.stringify({ error: refusal }) };
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
                <td style="padding: 8px 12px; font-size: 13px; color: #44403c; border-bottom: 1px solid #f0ece4;">${esc(li.name || li.productName || '—')}</td>
                <td style="padding: 8px 12px; font-size: 13px; color: #44403c; text-align: center; border-bottom: 1px solid #f0ece4;">${esc(li.qty || 1)}</td>
                <td style="padding: 8px 12px; font-size: 13px; color: #44403c; text-align: right; border-bottom: 1px solid #f0ece4;">${esc(fmt(li.unitPrice ?? li.listPrice))}</td>
                <td style="padding: 8px 12px; font-size: 13px; font-weight: 600; color: #1c1917; text-align: right; border-bottom: 1px solid #f0ece4;">${esc(fmt((li.qty || 1) * (li.unitPrice ?? li.listPrice ?? 0)))}</td>
            </tr>
        `).join('');

        const total = fmt(quote.totalValue ?? quote.subtotal);
        const quoteNum = quote.quoteNumber || quote.id;
        const validUntil = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

        // ── 4b. Sender signature ──────────────────────────────────────────────
        // Read server-side from the sender's own profile rather than accepted from
        // the client: a signature is attacker-controlled text going into a
        // customer's inbox, so the client must not be able to choose it for
        // somebody else, or inject markup. Looked up by the CLERK id — `userId` is
        // the Clerk id, and comparing it to users.id (usr_…) never matched, so no
        // signature ever went out (§0.155).
        let signatureHtml = '';
        try {
            const [senderRow] = await db.select({ profile: users.profile })
                .from(users).where(and(eq(users.clerkUserId, userId), eq(users.orgId, orgId))).limit(1);
            const raw = (senderRow?.profile || {}).emailSignature;
            if (raw && String(raw).trim()) {
                signatureHtml = `
      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e8e3da;font-size:13px;color:#57534e;line-height:1.6;white-space:pre-line;">${esc(raw)}</div>`;
            }
        } catch (e) {
            // A missing signature must never block the quote going out.
            console.error('quote-email: signature lookup failed', e.message);
        }

        const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quote ${esc(quoteNum)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#1c1917;padding:28px 36px;">
      <p style="color:#f5f1eb;font-size:18px;font-weight:700;margin:0;">Accelerep</p>
      <p style="color:#a8a29e;font-size:12px;margin:4px 0 0;">Quote for your review</p>
    </div>
    <div style="padding:36px;">
      <h2 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1c1917;">Hi ${esc(customerName)},</h2>
      <p style="font-size:14px;line-height:1.7;color:#57534e;margin:0 0 24px;">
        Please find your quote below. If you have any questions, don't hesitate to reach out.
      </p>

      <div style="background:#f8f6f3;border:1px solid #e8e3da;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;">
          <span style="font-weight:600;color:#1c1917;">Quote Number</span><span>${esc(quoteNum)}</span>
        </div>
        ${opp ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;"><span style="font-weight:600;color:#1c1917;">Company</span><span>${esc(accountName)}</span></div>` : ''}
        ${validUntil ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;"><span style="font-weight:600;color:#1c1917;">Valid Until</span><span>${esc(validUntil)}</span></div>` : ''}
        ${quote.paymentTerms ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#57534e;"><span style="font-weight:600;color:#1c1917;">Payment Terms</span><span>${esc(quote.paymentTerms)}</span></div>` : ''}
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
        Total: ${esc(total)}
      </div>` : ''}

      ${quote.notes ? `<div style="margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;font-size:13px;color:#92400e;line-height:1.6;"><strong>Notes:</strong> ${esc(quote.notes)}</div>` : ''}

      ${signatureHtml || `
      <p style="margin-top:28px;font-size:13px;color:#a8a29e;">
        This quote was prepared for you by your account representative. Please reply to this email with any questions.
      </p>`}
    </div>
    <div style="background:#f8f6f3;padding:18px 36px;border-top:1px solid #e8e3da;font-size:11px;color:#a8a29e;text-align:center;">
      <p style="margin:0;">Accelerep · <a href="${esc(APP_URL)}" style="color:#78716c;text-decoration:none;">${esc(APP_URL)}</a></p>
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
            .set({ status: 'Sent to Customer', sentAt: new Date(), updatedAt: new Date() })
            .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)));
        // A quote left the app for a customer's inbox (§0.143).
        await auditAs(orgId, userId, { action: 'quote.emailed', entityType: 'quote', entityId: quoteId, entityName: quoteNum, detail: `To ${customerEmail} · ${accountName}` });

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
        return { statusCode: 500, headers: responseHeaders, body: serverErrorBody(err, 'quote-email') };
    }
};
