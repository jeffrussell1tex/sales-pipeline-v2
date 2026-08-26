// _ownership.mjs — object-level authorization, in ONE place.
//
// WHY THIS EXISTS
// ---------------
// Every mutating endpoint hand-rolled the same six lines:
//
//     if (!canSeeAll(userRole)) {
//         const [target] = await db.select({ owner: <table>.<someColumn> })...
//         const callerName = await getCallerName(userId, orgId);
//         if (target?.owner && target.owner !== callerName) return 403;
//     }
//
// Eleven copies across six endpoints. Two of them named a column that does not
// exist -- `contacts.createdBy` and `activities.repName` -- and Drizzle resolves
// a missing property to `undefined` rather than throwing, so one typo produced a
// 500 on two paths and a SILENT ORG-WIDE WRITE BYPASS on a third. All eleven are
// now gone; guide 18b21 is the guard that keeps them gone.
//
// OWNERSHIP KEYS ON IDS, NOT NAMES (Phase 2)
// ------------------------------------------
// The comparison above was `owner === callerName` on DISPLAY NAMES. That is not
// an identifier: a user can change it, and two users can share it.
//
//   - Renaming a user DETACHED every record they owned. No warning, no audit
//     entry. Their deals vanished from their own pipeline and the server refused
//     their deletes with a 403 that reads exactly like the gate working.
//   - Two people named "John Smith" in one org OWNED EACH OTHER'S RECORDS, and
//     every gate agreed it was fine. `users.name` has no unique constraint.
//
// Ownership now compares `<table>.ownerId` against the caller's `users.id` --
// app-owned, permanent, never reassigned (18b20). The display-name columns are
// retained for rendering and export and NOTHING AUTHORIZES ON THEM.
//
// Pure and dependency-free — no db, no schema, no drizzle. The endpoints all
// import db/index.js (TypeScript) and load only under `tsx`, outside the gates.
// Same reasoning as _audit.mjs and _bulk.mjs.

// ── Identity space ───────────────────────────────────────────────────────────
//
// THREE DIFFERENT `ownerId` COLUMNS ALREADY EXIST IN THIS SCHEMA AND THEY DO NOT
// ALL MEAN THE SAME THING:
//
//   documents.ownerId      a CLERK userId  (`user_...`) -- the schema says so
//   savedReports.ownerId   notNull, undocumented, not audited
//   the six below          our `usr_<uuid>`
//
// All three are `text`. Comparing a Clerk id to an app id is a valid expression
// between two non-null strings that can NEVER be equal, so it does not throw --
// it silently refuses everything, or silently matches nothing, depending which
// side it lands on. That is the same shape as `users.id` meaning both "our row"
// and "Clerk's user", which is what Phase 1 existed to fix.
//
// So the space is asserted rather than assumed. A value reaching the policy that
// is not one of ours is a PROGRAMMING error, and it fails closed AND loudly
// rather than quietly comparing unequal.
export const APP_USER_ID_PREFIX = 'usr_';

export const isAppUserId = (v) =>
    typeof v === 'string' && v.startsWith(APP_USER_ID_PREFIX) && v.length > APP_USER_ID_PREFIX.length;

// ── The registry ─────────────────────────────────────────────────────────────
//
// entity -> the DRIZZLE PROPERTY NAME holding the owner's `users.id`.
// Property names, not column names: `ownerId` is the property, `owner_id` is the
// column. Checked against the real table by tests/ownership-registry.test.mjs.
export const OWNER_ID_COLUMNS = Object.freeze({
    opportunity: 'ownerId',
    account:     'ownerId',
    lead:        'ownerId',
    contact:     'ownerId',
    task:        'ownerId',
    activity:    'ownerId',
});

// The display-name column per entity. RETAINED FOR RENDERING AND EXPORT ONLY.
//
// Exported so the importer and the create paths can resolve a name from a CSV or
// a picker into an id, and so the registry test can assert these still exist.
// There is deliberately NO name-based policy function: if one existed, something
// would eventually call it, and the two policies would drift the way bulkUpsert
// and _ownership drifted (18b20).
export const OWNER_NAME_COLUMNS = Object.freeze({
    opportunity: 'salesRep',
    account:     'accountOwner',
    lead:        'assignedTo',
    contact:     'assignedRep',   // NOT createdBy — that column does not exist
    task:        'assignedTo',
    activity:    'author',        // NOT repName — that column does not exist either
});

// The Drizzle table export each entity lives on, in db/schema.ts.
export const ENTITY_TABLES = Object.freeze({
    opportunity: 'opportunities',
    account:     'accounts',
    lead:        'leads',
    contact:     'contacts',
    task:        'tasks',
    activity:    'activities',
});

// The one refusal message. Distinct from the Admin role gate's
// 'Forbidden: insufficient role' — the two are both 403 and the BODY is the only
// way to tell which check refused. Keep them different.
export const OWNERSHIP_FORBIDDEN = 'Forbidden: you can only modify your own or unassigned records';

/**
 * The owner-id property name for an entity.
 *
 * Throws on an unregistered entity rather than returning undefined. Fail closed:
 * a new entity that nobody remembered to register must break loudly at the first
 * request, not quietly authorize everyone.
 */
export function ownerKeyFor(entity) {
    const key = OWNER_ID_COLUMNS[entity];
    if (!key) {
        throw new Error(
            `_ownership: no ownership rule registered for '${entity}'. ` +
            `Add it to OWNER_ID_COLUMNS in netlify/functions/_ownership.mjs — refusing to guess.`
        );
    }
    return key;
}

/** The display-name property for an entity. Never feeds an authorization decision. */
export function ownerNameKeyFor(entity) {
    const key = OWNER_NAME_COLUMNS[entity];
    if (!key) {
        throw new Error(
            `_ownership: no display-name column registered for '${entity}'. ` +
            `Add it to OWNER_NAME_COLUMNS in netlify/functions/_ownership.mjs.`
        );
    }
    return key;
}

/**
 * The Drizzle column object for an entity's owner id, resolved against its table.
 *
 * This is the guard that `contacts.createdBy` needed. A property missing from
 * the table throws by name here, instead of becoming an `undefined` that means
 * "500" in one caller and "allow everyone" in another.
 */
export function ownerColumnOf(table, entity) {
    const key = ownerKeyFor(entity);
    const column = table?.[key];
    if (!column) {
        throw new Error(
            `_ownership: '${entity}' is registered as owned by '${key}', but that property ` +
            `does not exist on its table. Fix OWNER_ID_COLUMNS or the schema — do not leave it undefined.`
        );
    }
    return column;
}

/** The display-name column object. For projection and rendering, never for policy. */
export function ownerNameColumnOf(table, entity) {
    const key = ownerNameKeyFor(entity);
    const column = table?.[key];
    if (!column) {
        throw new Error(
            `_ownership: '${entity}' names '${key}' as its display column, but that property ` +
            `does not exist on its table.`
        );
    }
    return column;
}

/**
 * The policy itself, as a predicate over values already read.
 *
 * Pure so it can be tested without a database, and so the rule reads in one
 * place rather than being inferred from eleven copies of an `if`.
 *
 *   canSeeAll      Admin/Manager — ownership does not apply.
 *   ownerId empty  UNASSIGNED. Mutable by any writer. This is deliberate: it is
 *                  how a rep picks up unowned work, and the delete-gate fixture
 *                  depends on it.
 *   callerId empty The CALLER could not be identified. Fail CLOSED: a caller with
 *                  no roster row owns nothing, so any owned record is refused.
 *
 * THE TWO EMPTY CASES ARE NOT THE SAME CASE. "The owner is unknown" and "the
 * caller is unknown" resolve in OPPOSITE directions, and conflating them is
 * exactly how bulkUpsert shipped a fail-open path that let an unidentifiable
 * caller overwrite every owned row in the org (18b20).
 *
 * A value in the WRONG IDENTITY SPACE -- a Clerk `user_...` where an app
 * `usr_...` belongs -- is neither. It is a bug, and two unequal strings would
 * otherwise refuse or allow silently. It refuses AND warns.
 */
export function mayMutate({ ownerId, callerId, canSeeAll = false }) {
    if (canSeeAll) return true;

    const owner = typeof ownerId === 'string' ? ownerId.trim() : ownerId;
    if (owner === null || owner === undefined || owner === '') return true;   // unassigned

    if (!isAppUserId(owner)) {
        console.warn(
            `_ownership: refusing — record owner '${owner}' is not an app user id ` +
            `(expected ${APP_USER_ID_PREFIX}<uuid>). A Clerk id here compares unequal to everything.`
        );
        return false;
    }
    if (!callerId) return false;                                              // caller unknown
    if (!isAppUserId(callerId)) {
        console.warn(
            `_ownership: refusing — caller id '${callerId}' is not an app user id ` +
            `(expected ${APP_USER_ID_PREFIX}<uuid>). Pass users.id, not the Clerk userId.`
        );
        return false;
    }
    return owner === callerId;
}
