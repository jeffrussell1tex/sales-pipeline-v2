// _callerRole.mjs — the caller's role IN ONE ORG (state §0.163, guide §18b56).
//
// The role this application enforces is the role on the caller's row in the
// active org's roster: users.role, one row per (org_id, clerk_user_id) — the
// users_org_clerk_uq unique index makes it at most one. It used to be Clerk's
// USER-level publicMetadata.role, a single value for every org a person belongs
// to, so an Admin anywhere was an Admin everywhere they were a member, and one
// org could change another org's only Admin into a read-only user.
//
// Loaded by verifyAuth with a dynamic import, so the unit suites that import
// auth.mjs for its vocabulary never load the database.
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';

// { role, managedReps, active } from the caller's row in this org, or null when the
// caller has no row there yet (a first sign-in before users?me=true links an
// invited row or provisions one). managedReps is the row's profile.managedReps —
// the same per-org source the scheduled jobs read (_jobRoster.mjs). active is
// false for a member an Admin deactivated: no access in this org (§0.164).
export async function rosterRoleOf(clerkUserId, orgId) {
    if (!clerkUserId || !orgId) return null;
    const [row] = await db.select({ role: users.role, profile: users.profile, active: users.active })
        .from(users)
        .where(and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, orgId)))
        .limit(1);
    if (!row) return null;
    const reps = row.profile?.managedReps;
    return { role: row.role, managedReps: Array.isArray(reps) ? reps : [], active: row.active !== false };
}
