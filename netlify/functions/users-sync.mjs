// users-sync.mjs — Admin tool: reconcile the local users roster against Clerk.
//
// Clerk is the source of truth for who is in the org. This endpoint pulls the
// full org membership list and:
//   • CREATES a users row for any Clerk member missing from the DB
//   • UPDATES existing rows conservatively (safe defaults):
//       - role: Clerk wins (it drives permissions)
//       - name: refreshed from Clerk when Clerk has one
//       - team / territory: fill blanks only — never overwrite an in-app edit
//       - quota, profile prefs, and all other DB-only fields: left untouched
//   • REPORTS db rows whose email is not in Clerk (departed/stale) — never
//     deletes or deactivates them (manual action only).
//
// Matching is by email (case-insensitive), consistent with the rest of
// users.mjs. Admin-gated. Returns a summary; writes one audit row.

import { db } from '../../db/index.js';
import { users, auditLog } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireRole } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';

const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: CORS, body: JSON.stringify({ error: auth.error }) };

    const { userId, orgId, userRole } = auth;

    // Admin only — this reconciles the whole roster.
    const forbidden = requireRole(auth, ['Admin'], CORS);
    if (forbidden) return forbidden;

    try {
        const { createClerkClient } = await import('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

        // 1. Fetch all Clerk org members (paginated at 100).
        let allMembers = [];
        let offset = 0;
        const limit = 100;
        while (true) {
            const page = await clerk.organizations.getOrganizationMembershipList({ organizationId: orgId, limit, offset });
            const members = page.data || page;
            if (!members.length) break;
            allMembers = allMembers.concat(members);
            if (members.length < limit) break;
            offset += limit;
        }

        // 2. Resolve full user detail for each member (email/name/role live on the user).
        const detail = await Promise.allSettled(
            allMembers.map((m) => clerk.users.getUser(m.publicUserData?.userId || m.userId))
        );

        // 3. Load current DB roster once, index by lowercased email.
        const dbRows = await db.select().from(users).where(eq(users.orgId, orgId));
        const dbByEmail = new Map();
        for (const r of dbRows) {
            if (r.email) dbByEmail.set(r.email.toLowerCase(), r);
        }

        const summary = { created: [], updated: [], unchanged: [], skipped: [] };
        const clerkEmails = new Set();

        for (let i = 0; i < detail.length; i++) {
            const result = detail[i];
            const member = allMembers[i];
            if (result.status !== 'fulfilled') {
                summary.skipped.push({ reason: 'clerk fetch failed', memberId: member?.id || null });
                continue;
            }
            const cu = result.value;
            const clerkUserId = cu.id;
            const email = (cu.emailAddresses?.[0]?.emailAddress || '').toLowerCase();
            if (!email) { summary.skipped.push({ reason: 'no email', clerkUserId }); continue; }
            clerkEmails.add(email);

            const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || email.split('@')[0];
            const role = cu.publicMetadata?.role || member.role?.replace('org:', '') || 'User';
            const team = cu.publicMetadata?.team ?? null;
            const territory = cu.publicMetadata?.territory ?? null;

            const existing = dbByEmail.get(email);

            if (!existing) {
                // CREATE — new roster row from Clerk.
                const [row] = await db.insert(users).values({
                    id:        clerkUserId,
                    orgId,
                    name,
                    email,
                    role,
                    team,
                    territory,
                    active:    true,
                    profile:   { status: 'Active', userType: role },
                    updatedAt: new Date(),
                }).onConflictDoNothing().returning();
                summary.created.push({ email, name, role });
                continue;
            }

            // UPDATE — safe-default reconciliation on an existing row.
            const patch = {};
            // role: Clerk is authoritative (permissions).
            if (existing.role !== role) patch.role = role;
            // name: refresh if Clerk has a real one and it differs.
            if (name && existing.name !== name) patch.name = name;
            // team / territory: fill blanks only — never clobber an in-app assignment.
            if ((existing.team == null || existing.team === '') && team) patch.team = team;
            if ((existing.territory == null || existing.territory === '') && territory) patch.territory = territory;
            // If the row still carries a placeholder/pending id, promote it to the real Clerk id.
            if (existing.id !== clerkUserId && (existing.id?.startsWith('pending_') || existing.id?.endsWith('@placeholder.local'))) {
                patch.id = clerkUserId;
            }

            if (Object.keys(patch).length === 0) {
                summary.unchanged.push({ email });
                continue;
            }
            patch.updatedAt = new Date();
            await db.update(users).set(patch).where(and(eq(users.id, existing.id), eq(users.orgId, orgId)));
            summary.updated.push({ email, changed: Object.keys(patch).filter((k) => k !== 'updatedAt') });
        }

        // 4. Report DB rows whose email is not in Clerk — never auto-remove.
        const dbOnly = dbRows
            .filter((r) => r.email && !clerkEmails.has(r.email.toLowerCase()))
            .map((r) => ({ id: r.id, name: r.name, email: r.email }));

        // 5. Audit (best-effort).
        try {
            await db.insert(auditLog).values({
                id:         'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                orgId,
                action:     'users.synced',
                entityType: 'user',
                entityId:   'ALL',
                entityName: `Clerk sync: +${summary.created.length} / ~${summary.updated.length}`,
                userId,
                userName:   null,
                timestamp:  new Date(),
            });
        } catch (e) { console.warn('users-sync audit failed:', e.message); }

        return {
            statusCode: 200,
            headers: CORS,
            body: JSON.stringify({
                success: true,
                counts: {
                    clerkMembers: clerkEmails.size,
                    created:      summary.created.length,
                    updated:      summary.updated.length,
                    unchanged:    summary.unchanged.length,
                    skipped:      summary.skipped.length,
                    dbOnly:       dbOnly.length,
                },
                created:   summary.created,
                updated:   summary.updated,
                skipped:   summary.skipped,
                dbOnly,    // rows in Accelerep not found in Clerk — review manually
            }),
        };
    } catch (err) {
        console.error('users-sync error:', err.message);
        return { statusCode: 500, headers: CORS, body: serverErrorBody(err, 'users-sync') };
    }
};
