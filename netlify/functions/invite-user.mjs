/**
 * invite-user.mjs
 *
 * Admin-only endpoint that:
 *   1. Creates a Clerk invitation for the given email with role + name
 *      pre-set in publicMetadata so the user lands with the right role.
 *   2. Inserts a pending DB user row scoped to this org so the user
 *      appears in the team list immediately (status: pending).
 *   3. Sends a branded invite email via Resend.
 *
 * POST /.netlify/functions/invite-user
 * Body: { name, email, role, team?, territory? }
 *
 * On first login the user's ?me=true PUT/GET in users.mjs will find the
 * row by email and update the id to the real Clerk user ID.
 */

import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { sendEmail } from './send-email.mjs';

const APP_URL = process.env.APP_URL || 'https://accelerep.netlify.app';

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }

    const { userId, orgId, userRole } = auth;

    if (userRole !== 'Admin') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only Admins can invite users.' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
    }

    const { name, email, role, team, territory } = body;

    if (!name || !email || !role) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'name, email, and role are required.' }) };
    }

    const emailLower = email.trim().toLowerCase();
    const nameTrimmed = name.trim();
    const [firstName, ...rest] = nameTrimmed.split(' ');
    const lastName = rest.join(' ') || '';

    try {
        // ── 1. Check for existing DB user with this email ─────────────────────
        const [existing] = await db
            .select()
            .from(users)
            .where(and(eq(users.email, emailLower), eq(users.orgId, orgId)));

        if (existing) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({ error: 'A user with that email already exists in this organization.' }),
            };
        }

        // ── 2. Create Clerk invitation with metadata pre-attached ─────────────
        const { createClerkClient } = await import('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

        let invitation;
        try {
            invitation = await clerk.invitations.createInvitation({
                emailAddress: emailLower,
                redirectUrl: APP_URL,
                publicMetadata: {
                    role,
                    name: nameTrimmed,
                },
            });
        } catch (clerkErr) {
            // Clerk returns 422 if the user already exists in this Clerk instance
            const msg = clerkErr?.errors?.[0]?.message || clerkErr.message || 'Clerk invitation failed.';
            return { statusCode: 422, headers, body: JSON.stringify({ error: msg }) };
        }

        // ── 3. Insert pending DB user row ─────────────────────────────────────
        // Use a deterministic pending- prefix ID so it's easy to identify
        // unreconciled rows. users.mjs ?me=true will update this to the real
        // Clerk user ID on first login via email-based reconciliation.
        const pendingId = `pending_${invitation.id}`;

        await db.insert(users).values({
            id:        pendingId,
            name:      nameTrimmed,
            email:     emailLower,
            role,
            team:      team || null,
            territory: territory || null,
            active:    true,
            orgId,
            profile: {
                firstName,
                lastName,
                userType: role,
                invitedBy: userId,
                invitedAt: new Date().toISOString(),
                pendingClerkInvitationId: invitation.id,
            },
        });

        // ── 4. Send branded invite email via Resend ───────────────────────────
        const roleLabel = role === 'User' ? 'Sales Rep' : role;
        await sendEmail({
            to: emailLower,
            subject: `You've been invited to Accelerep`,
            html: inviteEmailHtml({ name: nameTrimmed, role: roleLabel, appUrl: APP_URL }),
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `Invitation sent to ${emailLower}. They will appear as pending until they accept.`,
                pendingId,
            }),
        };

    } catch (err) {
        console.error('invite-user error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};

// ── Email template ─────────────────────────────────────────────────────────────

function inviteEmailHtml({ name, role, appUrl }) {
    const firstName = name.split(' ')[0];
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to Accelerep</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: #1c1917; padding: 28px 36px; }
    .header-title { color: #f5f1eb; font-size: 18px; font-weight: 700; margin: 0; letter-spacing: 0.3px; }
    .header-sub { color: #a8a29e; font-size: 12px; margin: 4px 0 0; }
    .body { padding: 36px; }
    .body h2 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #1c1917; }
    .body p { font-size: 14px; line-height: 1.7; color: #57534e; margin: 0 0 18px; }
    .detail-box { background: #f8f6f3; border: 1px solid #e8e3da; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; color: #57534e; }
    .detail-label { font-weight: 600; color: #1c1917; }
    .btn { display: inline-block; background: #1c1917; color: #f5f1eb !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 700; margin-top: 8px; letter-spacing: 0.2px; }
    .footer { background: #f8f6f3; padding: 18px 36px; border-top: 1px solid #e8e3da; font-size: 11px; color: #a8a29e; text-align: center; }
    .footer a { color: #78716c; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <p class="header-title">Accelerep</p>
      <p class="header-sub">Sales Pipeline Tracker</p>
    </div>
    <div class="body">
      <h2>You're invited, ${firstName}! 👋</h2>
      <p>Your administrator has set up an Accelerep account for you. Click the button below to accept your invitation and create your password.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Name</span><span>${name}</span></div>
        <div class="detail-row"><span class="detail-label">Role</span><span>${role}</span></div>
        <div class="detail-row"><span class="detail-label">App</span><span>${appUrl}</span></div>
      </div>
      <a class="btn" href="${appUrl}">Accept Invitation →</a>
      <p style="margin-top: 24px; font-size: 13px; color: #a8a29e;">
        This invitation was sent to you by your organization's administrator. If you weren't expecting this, you can safely ignore it.
      </p>
    </div>
    <div class="footer">
      <p>Accelerep · <a href="${appUrl}">${appUrl}</a></p>
    </div>
  </div>
</body>
</html>`;
}
