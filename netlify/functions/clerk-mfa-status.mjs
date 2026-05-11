/**
 * clerk-mfa-status.mjs
 * Returns real MFA enrollment data for the org by querying Clerk's Backend API.
 *
 * GET /.netlify/functions/clerk-mfa-status
 *   → { enrolled, total, notEnrolled: [{ email, role, userId }], byRole: [...] }
 *
 * Admin-only. Uses CLERK_SECRET_KEY (already set in Netlify env).
 * Uses createClerkClient — same pattern as auth.mjs.
 */

import { createClerkClient } from '@clerk/backend';
import { verifyAuth }        from './auth.mjs';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
    if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    // Auth — Admin only
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    if (auth.userRole !== 'Admin') return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Admin role required' }) };

    const { orgId } = auth;

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'CLERK_SECRET_KEY not configured' }) };
    }

    try {
        const clerk = createClerkClient({ secretKey: clerkSecretKey });

        // ── Fetch all org memberships ─────────────────────────────────────────
        // Clerk paginates at 100 per page — loop until we have all members.
        let allMembers = [];
        let offset = 0;
        const limit = 100;

        while (true) {
            const page = await clerk.organizations.getOrganizationMembershipList({
                organizationId: orgId,
                limit,
                offset,
            });

            const members = page.data || page;
            if (!members.length) break;
            allMembers = allMembers.concat(members);
            if (members.length < limit) break;
            offset += limit;
        }

        // ── Fetch full user records for each member ───────────────────────────
        // We need user.totpEnabled, user.twoFactorEnabled, user.publicMetadata.role
        const userDetails = await Promise.allSettled(
            allMembers.map(m => {
                const userId = m.publicUserData?.userId || m.userId;
                return clerk.users.getUser(userId);
            })
        );

        // ── Build enrollment data ─────────────────────────────────────────────
        const enrolled    = [];
        const notEnrolled = [];

        userDetails.forEach((result, idx) => {
            if (result.status !== 'fulfilled') return;
            const user   = result.value;
            const member = allMembers[idx];

            // Clerk exposes MFA state via user.twoFactorEnabled (boolean)
            // and user.totpEnabled for TOTP specifically.
            const hasMfa  = user.twoFactorEnabled === true || user.totpEnabled === true;
            const email   = user.emailAddresses?.[0]?.emailAddress || '';
            const role    = user.publicMetadata?.role || member.role || 'User';
            const userId  = user.id;
            const name    = [user.firstName, user.lastName].filter(Boolean).join(' ') || email;

            const record = { userId, email, name, role, hasMfa };
            if (hasMfa) enrolled.push(record);
            else        notEnrolled.push(record);
        });

        const total        = enrolled.length + notEnrolled.length;
        const enrolledCount = enrolled.length;

        // ── Enrollment by role ────────────────────────────────────────────────
        const roleMap = {};
        [...enrolled, ...notEnrolled].forEach(u => {
            if (!roleMap[u.role]) roleMap[u.role] = { role: u.role, enrolled: 0, total: 0 };
            roleMap[u.role].total++;
            if (u.hasMfa) roleMap[u.role].enrolled++;
        });

        // Role display order
        const ROLE_ORDER = ['Admin', 'Manager', 'Sales Rep', 'ReadOnly', 'User'];
        const byRole = Object.values(roleMap).sort((a, b) => {
            const ai = ROLE_ORDER.indexOf(a.role);
            const bi = ROLE_ORDER.indexOf(b.role);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({
                enrolled:     enrolledCount,
                total,
                notEnrolled:  notEnrolled.map(u => ({ userId: u.userId, email: u.email, name: u.name, role: u.role })),
                byRole,
            }),
        };

    } catch (err) {
        console.error('clerk-mfa-status error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
};
