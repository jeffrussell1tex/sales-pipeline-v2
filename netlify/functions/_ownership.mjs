// _ownership.mjs — object-level authorization, in ONE place.
//
// WHY THIS EXISTS
// ---------------
// Every mutating endpoint hand-rolled the same six lines:
//
//     if (!canSeeAll(userRole)) {
//         const [target] = await db.select({ owner: <table>.<someColumn> })...
//         const callerName = await getCallerName(userId);
//         if (target?.owner && target.owner !== callerName) return 403;
//     }
//
// Eleven copies across six endpoints. Copy-paste authorization: eleven chances
// to name the wrong column, and no single place to read to find out what the
// policy actually is.
//
// contacts.mjs named `contacts.createdBy`. That column HAS NEVER EXISTED — the
// contacts table has `assignedRep`. Drizzle resolves a missing column to
// `undefined` rather than throwing, and `undefined` then means two different
// things depending on where it lands:
//
//   - db.select({ owner: undefined })  -> throws  -> 500. Reps could not edit or
//     delete a contact at all; both paths errored rather than refusing.
//   - bulkUpsert({ ownerColumn: undefined }) -> `if (ownerColumn)` is false, the
//     owner is never projected, `prior.owner` is undefined, and the forbidden
//     branch cannot fire -> a rep could overwrite EVERY contact in the org.
//
// Two hard errors and one silent authorization bypass, from one typo, invisible
// for as long as it existed because every test and every manual session ran as
// Admin and skipped the `!canSeeAll` branch entirely.
//
// The registry below is the fix for the class, not the instance. A column named
// here is checked against the real table by tests/ownership-registry.test.mjs,
// so the next wrong name fails in `npm test` instead of at a customer.
//
// Pure and dependency-free — no db, no schema, no drizzle. The endpoints all
// import db/index.js (TypeScript) and load only under `tsx`, outside the gates.
// Same reasoning as _audit.mjs and _bulk.mjs.

// ── The registry ─────────────────────────────────────────────────────────────
//
// entity -> the DRIZZLE PROPERTY NAME on that entity's table that holds the
// owner's display name. Property names, not column names: `assignedRep` is the
// property, `assigned_rep` is the column.
//
// These are display-name columns, which is a known architectural weakness — a
// user renamed in Clerk silently orphans every record they own, and two users
// sharing a display name are indistinguishable here. Migrating to a userId
// foreign key is planned alongside the Clerk production cutover. Centralising
// the policy first is what makes that migration a change to ONE file.
export const OWNER_COLUMNS = Object.freeze({
    opportunity: 'salesRep',
    account:     'accountOwner',
    lead:        'assignedTo',
    contact:     'assignedRep',   // NOT createdBy — that column does not exist
    task:        'assignedTo',
    activity:    'author',        // NOT repName — that column does not exist either
});

// The Drizzle table export each entity lives on, in db/schema.ts. Kept beside
// the registry so the pairing is data, not folklore: tests/ownership-registry
// walks these two objects together and checks every registered property against
// the real table definition.
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
 * The owner property name for an entity.
 *
 * Throws on an unregistered entity rather than returning undefined. Fail closed:
 * a new entity that nobody remembered to register must break loudly at the first
 * request, not quietly authorize everyone.
 */
export function ownerKeyFor(entity) {
    const key = OWNER_COLUMNS[entity];
    if (!key) {
        throw new Error(
            `_ownership: no ownership rule registered for '${entity}'. ` +
            `Add it to OWNER_COLUMNS in netlify/functions/_ownership.mjs — refusing to guess.`
        );
    }
    return key;
}

/**
 * The Drizzle column object for an entity's owner, resolved against its table.
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
            `does not exist on its table. Fix OWNER_COLUMNS or the schema — do not leave it undefined.`
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
 *   canSeeAll        Admin/Manager — ownership does not apply.
 *   owner null/empty Unassigned records are mutable by any writer. This is
 *                    deliberate: it is how a rep picks up unowned work, and the
 *                    delete-gate fixture depends on it.
 *   callerName null  getCallerName() failed or found no roster row. Fail CLOSED:
 *                    a caller with no resolvable name owns nothing, so any owned
 *                    record is refused.
 */
export function mayMutate({ owner, callerName, canSeeAll = false }) {
    if (canSeeAll) return true;
    if (owner === null || owner === undefined || String(owner).trim() === '') return true;
    if (!callerName) return false;
    return owner === callerName;
}
