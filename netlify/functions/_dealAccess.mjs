// _dealAccess.mjs — may this caller READ a deal, and may they CHANGE it? And so
// everything that belongs to one: its quotes, a quote's email, the job a quote
// became (state §0.155, guide §18b48). The deals list and the quote endpoints ask
// here, so a quote is never visible, or writable, where its deal is not.
//
//   read   dealVisibleTo (src/utils/roles.js) — the deals list's rule, imported
//          directly so a suite that mocks auth.mjs still runs the real one
//   write  read AND _ownership.mjs's mayMutate — the owner, an unassigned deal, or
//          the write authority (canSeeAll: Admin, Manager). The role gate
//          (requireWrite) still runs first in every endpoint; this is the object half.
import { db } from '../../db/index.js';
import { opportunities, settings as settingsTable } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { crmReadScope, canSeeAll, dealVisibleTo } from '../../src/utils/roles.js';
import { mayMutate } from './_ownership.mjs';
import { getCallerId } from './_lib.mjs';

// Whether unassigned deals reach a rep — an Admin's switch (Settings → Lead & deal
// visibility), OFF when the key is absent (Jeff: "Reps should only see their own
// deals", §0.151). Like the leads read, a failed read throws to the caller's 500
// rather than picking a direction — this decides what a rep is SHOWN.
export async function getUnassignedDealsVisible(orgId) {
    const [row] = await db.select({ extra: settingsTable.extra }).from(settingsTable).where(eq(settingsTable.orgId, orgId)).limit(1);
    return row?.extra?.unassignedDealsVisibleToReps ?? false;
}

// What dealVisibleTo needs to know about the caller. The two reads happen only for
// a caller whose scope is their own rows; a whole-org reader needs neither. A
// caller with no roster row resolves to null and owns nothing — the fail-closed
// direction mayMutate() takes for writes.
export async function dealReadContext(auth) {
    const own = crmReadScope(auth.userRole) === 'own';
    return {
        role: auth.userRole,
        managedReps: Array.isArray(auth.managedReps) ? auth.managedReps : [],
        callerId: own ? await getCallerId(auth.userId, auth.orgId) : null,
        unassignedVisible: own ? await getUnassignedDealsVisible(auth.orgId) : false,
    };
}

// One deal, in this org: { deal, canRead, canWrite }. A deal that is not this
// org's — or does not exist — is neither, and the caller answers 404 rather than
// telling a probe it exists.
export async function dealAccess(auth, opportunityId) {
    const none = { deal: null, canRead: false, canWrite: false };
    if (!opportunityId) return none;
    const [deal] = await db.select({ id: opportunities.id, ownerId: opportunities.ownerId, salesRep: opportunities.salesRep })
        .from(opportunities)
        .where(and(eq(opportunities.id, String(opportunityId)), eq(opportunities.orgId, auth.orgId)))
        .limit(1);
    if (!deal) return none;
    const ctx = await dealReadContext(auth);
    const canRead = dealVisibleTo(deal, ctx);
    if (!canRead) return { deal, canRead, canWrite: false };
    if (canSeeAll(auth.userRole)) return { deal, canRead, canWrite: true };
    const callerId = ctx.callerId ?? await getCallerId(auth.userId, auth.orgId);
    return { deal, canRead, canWrite: mayMutate({ ownerId: deal.ownerId, callerId }) };
}
