// users-sync.mjs — Admin tool: reconcile the local users roster against Clerk.
//
// Clerk is the source of truth for who is in the org. This endpoint pulls the
// full org membership list and:
//   • CREATES a users row for any Clerk member missing from the DB
//   • UPDATES existing rows conservatively (safe defaults):
//       - role: Clerk publicMetadata wins (it drives permissions). Clerk's
//         ORGANIZATION MEMBERSHIP role (org:admin / org:member) is NOT a
//         fallback for it — see the note at the role resolution below.
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
import { verifyAuth, requireRole, isAppRole } from './auth.mjs';
import { serverErrorBody, invalidateRoster } from './_lib.mjs';
import { randomUUID } from 'crypto';

const newUserId = () => 'usr_' + randomUUID();

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

        // 3. Load current DB roster once. Index by Clerk id AND by email --
        //    the Clerk link is the reliable key once it exists, and email is
        //    only the fallback for a row that has not been linked yet. Matching
        //    on email alone meant a user who changed their email address in
        //    Clerk looked like a departure plus a new hire.
        const dbRows = await db.select().from(users).where(eq(users.orgId, orgId));
        const dbByEmail = new Map();
        const dbByClerkId = new Map();
        for (const r of dbRows) {
            if (r.email) dbByEmail.set(r.email.toLowerCase(), r);
            if (r.clerkUserId) dbByClerkId.set(r.clerkUserId, r);
        }

        // Dry run (?check=true): compute exactly the same reconciliation but write
        // nothing. Lets the Users screen show "N users out of sync" on load, so
        // drift is visible rather than discovered by chance.
        const dryRun = (event.queryStringParameters || {}).check === 'true';

        const summary = { created: [], updated: [], unchanged: [], skipped: [], nameDrift: [], roleDrift: [], dryRun };
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
            // ROLE. Clerk carries TWO different things called a role and this line
            // used to fall through from one to the other:
            //
            //   publicMetadata.role   Accelerep's role   Admin | Manager | User | ReadOnly | Technician
            //   member.role           Clerk ORG role     org:admin | org:member
            //
            // The second governs who may administer the Clerk organization. It says
            // nothing about what anyone may do in this application, and stripping
            // `org:` off it produced `admin` and `member` — which is where the
            // lowercase badges in the Users list came from, and why the seat counter
            // read Admins 0 with an admin on screen (the comparison is, correctly,
            // case-sensitive; the VALUE was wrong).
            //
            // A member with no Accelerep role in Clerk is a REP, because that is what
            // auth.mjs decides on every request (`meta.role || 'User'`). The mirror
            // now says the same thing instead of inventing a third answer. The
            // divergence is REPORTED — same treatment as nameDrift below — so an
            // Admin can see who needs a role set rather than discovering it from a
            // badge that was never true.
            const rawRole = cu.publicMetadata?.role;
            const role = isAppRole(rawRole) ? rawRole : 'User';
            if (!isAppRole(rawRole)) {
                summary.roleDrift.push({
                    email,
                    clerkRole:   rawRole ?? null,
                    clerkOrgRole: member?.role ?? null,
                    appliedRole: role,
                    reason: rawRole ? 'not an Accelerep role' : 'no Accelerep role set in Clerk',
                });
            }
            const team = cu.publicMetadata?.team ?? null;
            const territory = cu.publicMetadata?.territory ?? null;

            const existing = dbByClerkId.get(clerkUserId) || dbByEmail.get(email);

            if (!existing) {
                // CREATE — new roster row from Clerk. The id is ours; the Clerk
                // identity goes in its own column.
                if (!dryRun) {
                    await db.insert(users).values({
                        id:          newUserId(),
                        clerkUserId,
                        orgId,
                        name,
                        email,
                        role,
                        team,
                        territory,
                        active:      true,
                        profile:     { status: 'Active', userType: role },
                        updatedAt:   new Date(),
                    }).onConflictDoNothing();
                }
                summary.created.push({ email, name, role });
                continue;
            }

            // UPDATE — safe-default reconciliation on an existing row.
            const patch = {};
            // role: Clerk is authoritative (permissions).
            if (existing.role !== role) patch.role = role;
            // email: follow Clerk once the row is linked by identity rather than
            // by address, so an address change is an update and not a departure.
            if (email && existing.email !== email) patch.email = email;
            // team / territory: fill blanks only — never clobber an in-app assignment.
            if ((existing.team == null || existing.team === '') && team) patch.team = team;
            if ((existing.territory == null || existing.territory === '') && territory) patch.territory = territory;
            // Link an unlinked row. The id is NOT touched -- that rewrite is the
            // defect this batch removes.
            if (!existing.clerkUserId) patch.clerkUserId = clerkUserId;

            // NAME IS DELIBERATELY NOT SYNCED, and this is a behaviour change.
            //
            // It used to read:  if (name && existing.name !== name) patch.name = name;
            //
            // Ownership columns across the CRM store the display NAME, so
            // rewriting users.name detaches every record that user owns -- their
            // deals vanish from their own pipeline and the server refuses their
            // deletes with a 403 that reads exactly like the gate working. An
            // Admin pressing "Sync from Clerk" fired that for every member whose
            // Clerk name differed by so much as a middle initial.
            //
            // Name sync returns in the phase that moves ownership onto ids, where
            // renaming a user is a display change and nothing more. Until then a
            // Clerk name change is REPORTED, not applied.
            const nameDrift = (name && existing.name !== name)
                ? { email, dbName: existing.name, clerkName: name }
                : null;
            if (nameDrift) summary.nameDrift.push(nameDrift);

            if (Object.keys(patch).length === 0) {
                summary.unchanged.push({ email, nameDrift: !!nameDrift });
                continue;
            }
            patch.updatedAt = new Date();
            if (!dryRun) {
                await db.update(users).set(patch).where(and(eq(users.id, existing.id), eq(users.orgId, orgId)));
            }
            summary.updated.push({ email, changed: Object.keys(patch).filter((k) => k !== 'updatedAt') });
        }

        // 3b. The roster cache in _lib.mjs is 30s and keyed by org. This endpoint
        //     creates rows and renames nothing else does, so a sync followed
        //     immediately by an assignment could resolve against the pre-sync
        //     roster and stamp NULL — an unassigned record, editable org-wide.
        if (!dryRun && (summary.created.length || summary.updated.length)) invalidateRoster(orgId);

        // 4. Report DB rows not present in Clerk — never auto-remove. A row that
        //    is linked by clerkUserId counts as present even if its stored email
        //    is stale, which is the case email-only matching got wrong.
        const clerkIds = new Set(allMembers.map((m) => m.publicUserData?.userId || m.userId).filter(Boolean));
        const dbOnly = dbRows
            .filter((r) => !(r.clerkUserId && clerkIds.has(r.clerkUserId)))
            .filter((r) => r.email && !clerkEmails.has(r.email.toLowerCase()))
            .map((r) => ({ id: r.id, name: r.name, email: r.email }));

        // 5. Audit (best-effort). A dry run changes nothing, so it must not
        // write an audit row claiming a sync happened.
        if (!dryRun) try {
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
                    nameDrift:    summary.nameDrift.length,
                    roleDrift:    summary.roleDrift.length,
                    dbOnly:       dbOnly.length,
                },
                created:   summary.created,
                updated:   summary.updated,
                skipped:   summary.skipped,
                nameDrift: summary.nameDrift,  // reported, never applied — see the note above
                roleDrift: summary.roleDrift,  // members with no (or an unknown) Accelerep role — treated as Sales Rep
                dbOnly,    // rows in Accelerep not found in Clerk — review manually
            }),
        };
    } catch (err) {
        console.error('users-sync error:', err.message);
        return { statusCode: 500, headers: CORS, body: serverErrorBody(err, 'users-sync') };
    }
};
